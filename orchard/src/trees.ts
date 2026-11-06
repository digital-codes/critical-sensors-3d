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
}

type BarkMaps = TreeOptions['bark']['maps'];

// fallback for OSM trees without a calibrated height (m)
const SIZE_SCALE: Record<string, number> = {
  small: 4.5,
  medium: 6.0,
  large: 7.5,
};

export interface Orchard {
  group: THREE.Group;
  activeSeason: SeasonKey;
  setSeason(day: number): SeasonKey;
  update(elapsedTime: number): void;
}

export async function createOrchard(
  onProgress: (done: number, total: number) => void,
): Promise<Orchard> {
  const getHeight = await getHeightSampler();
  const loader = new THREE.TextureLoader();

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

  const entries = site.trees as SiteTree[];

    const buildTree = (entry: SiteTree): void => {
    const presetJson = structuredClone(TreePreset[entry.speciesBase]) as TreeOptions;
    const presetLeafCount = presetJson.leaves.count;
    const y = getHeight(entry.x, entry.z);
    // calibrated height (photo-based, see filter_baumkataster.height_for)
    // with the old size-class scale as OSM fallback
    const targetHeight = entry.heightM ?? SIZE_SCALE[entry.sizeClass] ?? 6.0;

    for (const season of SEASONS) {
      const t = new Tree();
      t.options.copy(presetJson);
      t.options.seed = entry.seed;
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
  // stays responsive while the orchard builds up.
  await new Promise<void>((resolve) => {
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

  let activeSeason: SeasonKey = 'summer';

  return {
    group,
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
  };
}
