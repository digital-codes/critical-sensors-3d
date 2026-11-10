import * as THREE from 'three';
import { Tree, TreePreset, type TreeOptions } from './eztree/index.js';
import site from './site';
import { getHeightSampler } from './terrain';
import { SEASONS, nearestSeason, type SeasonKey } from './seasons';

interface SiteTree {
  id: string;
  x: number;
  z: number;
  sizeClass: string;
  /** calibrated real height (m) from tools/filter_baumkataster.py */
  heightM?: number;
  speciesBase: string;
  seed: number;
  /** set in site.json: do not render (e.g. kataster trees crowded at the
   *  thicket wood edge that would visually merge with the blob) */
  skipRender?: boolean;
}

import { CONFIG } from './config';

type BarkMaps = TreeOptions['bark']['maps'];

// fallback for OSM trees without a calibrated height (m) — CONFIG.TREES
const SIZE_SCALE: Record<string, number> = CONFIG.TREES.SIZE_SCALE;

export interface Orchard {
  group: THREE.Group;
  /** trees actually rendered (site.json list minus thicket-wood skips) */
  readonly treeCount: number;
  activeSeason: SeasonKey;
  setSeason(day: number): SeasonKey;
  update(elapsedTime: number): void;
  /** runtime wind toggle: rebuilds all season groups with/without the leaf
   *  sway shader (staggered like the initial build); resolves when done */
  setWind(enabled: boolean): Promise<void>;
  get windEnabled(): boolean;
}

/** point-in-polygon against CONFIG.THICKET.POLYGON (same test thicket.ts
 *  uses for the blob scatter) */
function inThicketWood(x: number, z: number): boolean {
  const poly = CONFIG.THICKET.POLYGON;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export async function createOrchard(
  onProgress: (done: number, total: number) => void,
  opts: { wind?: boolean } = {},
): Promise<Orchard> {
  const getHeight = await getHeightSampler();
  const loader = new THREE.TextureLoader();

  // Wind sway flag (CONFIG.PERFORMANCE.TREE_WIND): read per build so the
  // runtime rebuild path can flip it between generations.
  let windEnabled = opts.wind !== false;

  // Bark and leaf textures are shared between all trees and season variants.
  const barkCache = new Map<string, BarkMaps>();
  function getBarkMaps(type: string): BarkMaps {
    let maps = barkCache.get(type);
    if (!maps) {
      const dir = `/textures/bark/${type}_1K-JPG`;
      const color = loader.load(`${dir}/${type}_1K-JPG_Color.jpg`);
      color.colorSpace = THREE.SRGBColorSpace;
      const normal = loader.load(`${dir}/${type}_1K-JPG_NormalGL.jpg`);
      const roughness = loader.load(`${dir}/${type}_1K-JPG_Roughness.jpg`);
      maps = { color, ao: null, normal, roughness };
      barkCache.set(type, maps);
    }
    return maps;
  }

  const leafCache = new Map<string, THREE.Texture>();
  function getLeafTexture(type: string): THREE.Texture {
    let tex = leafCache.get(type);
    if (!tex) {
      tex = loader.load(`/textures/leaves/${type}.png`);
      tex.colorSpace = THREE.SRGBColorSpace;
      leafCache.set(type, tex);
    }
    return tex;
  }

  const group = new THREE.Group();
  group.name = 'orchard';

  // One group of all trees per season keyframe; visibility toggles between them.
  const seasonGroups = new Map<SeasonKey, THREE.Group>();
  const seasonTrees = new Map<SeasonKey, Tree[]>();
  for (const s of SEASONS) {
    const g = new THREE.Group();
    g.name = `season-${s.key}`;
    g.visible = s.key === 'summer';
    group.add(g);
    seasonGroups.set(s.key, g);
    seasonTrees.set(s.key, []);
  }

  const entries = (site.trees as SiteTree[]).filter((e) => {
    // trees inside the thicket wood (OSM way 1022385974 boundary) would be
    // buried in the blob mass, and site.json can flag extra skips (edge
    // trees that would visually merge with the blob) — both save geometry
    if (inThicketWood(e.x, e.z)) return false;
    return !e.skipRender;
  });
  const skippedThicket = (site.trees as SiteTree[]).filter((e) => inThicketWood(e.x, e.z)).length;
  const skippedFlagged = (site.trees as SiteTree[]).length - skippedThicket - entries.length;
  console.info(
    `orchard: ${entries.length} trees rendered ` +
      `(${skippedThicket} inside thicket wood, ${skippedFlagged} flagged skipRender)`,
  );

    const buildTree = (entry: SiteTree): void => {
    const presetJson = structuredClone(TreePreset[entry.speciesBase]) as TreeOptions;
    const presetLeafCount = presetJson.leaves.count;
    const y = getHeight(entry.x, entry.z);
    // calibrated height (photo-based, see filter_baumkataster.height_for)
    // with the old size-class scale as OSM fallback
    const targetHeight = entry.heightM ?? SIZE_SCALE[entry.sizeClass] ?? CONFIG.TREES.DEFAULT_HEIGHT;

    for (const season of SEASONS) {
      const t = new Tree();
      t.options.copy(presetJson);
      t.options.seed = entry.seed;
      // wind sway flag (not part of the presets; copy() leaves it as set)
      t.options.wind = windEnabled;
      t.options.bark.maps = getBarkMaps(t.options.bark.type);
      t.options.leaves.map = getLeafTexture(t.options.leaves.type);
      t.options.leaves.count = Math.round(presetLeafCount * season.leafFactor);
      t.options.leaves.tint = season.tint;

      // LODs only for the summer full variant; plain generate() keeps the
      // other three variants lean.
      if (season.key === 'summer') t.generateLODs();
      else t.generate();

      // Rescale to real orchard tree height (ez-tree presets are ~10-15 m;
      // Streuobstwiese fruit trees are 4-7 m).
      const box = new THREE.Box3().setFromObject(t);
      const h = box.max.y - box.min.y;
      if (h > 0) t.scale.setScalar(targetHeight / h);

      t.position.set(entry.x, y, entry.z);

      seasonGroups.get(season.key)!.add(t);
      seasonTrees.get(season.key)!.push(t);
    }
  };

  // Staggered generation: a few trees per animation frame so the page
  // stays responsive while the orchard builds up. Reused by the runtime
  // wind rebuild (setWind below).
  const buildAll = (): Promise<void> =>
    new Promise<void>((resolve) => {
      let i = 0;
      function step(): void {
        const start = performance.now();
        while (i < entries.length && performance.now() - start < 12) {
          buildTree(entries[i]);
          i++;
          onProgress(i, entries.length);
        }
        if (i < entries.length) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      }
      requestAnimationFrame(step);
    });

  await buildAll();

  // rebuild teardown: dispose every generated tree (geometry + material;
  // bark/leaf TEXTURES are shared via the caches and stay)
  function disposeTrees(): void {
    for (const [, list] of seasonTrees) {
      for (const t of list) {
        t.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry.dispose();
            const mat = mesh.material as THREE.Material | THREE.Material[];
            if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
            else mat.dispose();
          }
        });
      }
      list.length = 0;
    }
    for (const [, g] of seasonGroups) g.clear();
  }

  let activeSeason: SeasonKey = 'summer';

  return {
    group,
    treeCount: entries.length,
    get activeSeason(): SeasonKey {
      return activeSeason;
    },
    setSeason(day: number): SeasonKey {
      const s = nearestSeason(day);
      if (s.key === activeSeason) return activeSeason;
      activeSeason = s.key;
      for (const [key, g] of seasonGroups) g.visible = key === s.key;
      return activeSeason;
    },
    update(elapsedTime: number): void {
      for (const t of seasonTrees.get(activeSeason)!) t.update(elapsedTime);
    },
    get windEnabled(): boolean {
      return windEnabled;
    },
    async setWind(enabled: boolean): Promise<void> {
      if (enabled === windEnabled) return;
      windEnabled = enabled;
      disposeTrees();
      await buildAll();
      // restore the visibility pattern of the active season
      for (const [key, g] of seasonGroups) g.visible = key === activeSeason;
    },
  };
}
