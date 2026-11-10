import * as THREE from 'three';
import site from './site';
import { getHeightSampler, X_MIN, Z_MIN, WIN_W, WIN_D } from './terrain';
import { nearestSeason, snowAmount, grassHeight, type SeasonKey } from './seasons';
import { getFootprintRects } from './structures';
import { CONFIG } from './config';
import type { Rng } from './rng';

interface SiteTree {
  x: number;
  z: number;
}

// density/width/tints live in CONFIG.GRASS (single constants home)
const COUNT = CONFIG.GRASS.COUNT;
const BLADE_W = CONFIG.GRASS.BLADE_W;
const SNOW_TINT = new THREE.Color(CONFIG.GRASS.SNOW_TINT);

const SEASON_TINT: Record<SeasonKey, number> = CONFIG.GRASS.SEASON_TINT;

export interface Grass {
  /** the instanced blades, or null while blades are disabled (created with
   *  PERFORMANCE.GRASS off, or removed via setBladesEnabled) */
  mesh: THREE.InstancedMesh | null;
  update(elapsedTime: number): void;
  setSeason(day: number): SeasonKey;
  /** The mown-lawn mask (row 0 = north, i = west->east) so other components
   *  (terrain snow) can gate to exactly the grass region. Independent of the
   *  blade toggle — the snow gate needs it even with blades off. */
  getLawnMask(): { data: Uint8Array; w: number; h: number };
  /** runtime performance toggle: creates (on the first on after an off
   *  creation) or shows/hides the blades; the lawn mask stays loaded */
  setBladesEnabled(enabled: boolean): void;
  get bladesEnabled(): boolean;
}

export async function createGrass(
  rng: Rng = Math.random,
  opts: { enabled?: boolean } = {},
): Promise<Grass> {
  const getHeight = await getHeightSampler();
  let bladesEnabled = opts.enabled !== false;

  // Mown-lawn mask, precomputed by prepare_site.py from the ORIGINAL DOP
  // colours (public/site/lawn_mask.png, site.lawnMask). It must NOT be
  // derived from the flattened aerial: the shadow-flatten tints path and
  // trail pixels near crowns toward the lawn median, which let grass and
  // winter snow creep onto paths. Raw-DOP gravel/dirt paths stay grey and
  // are excluded, so streets and trails stay bare in winter.
  const maskTex = await new THREE.TextureLoader().loadAsync('/' + site.lawnMask.file);
  const mimg = maskTex.image as HTMLImageElement;
  const mw = site.lawnMask.w;
  const mh = site.lawnMask.h;
  const mc = document.createElement('canvas');
  mc.width = mw;
  mc.height = mh;
  const mctx = mc.getContext('2d', { willReadFrequently: true })!;
  mctx.drawImage(mimg, 0, 0);
  const md = mctx.getImageData(0, 0, mw, mh).data;
  // cell (i, j): i = west->east, j = north->south (image row 0 = north)
  const lawn = new Uint8Array(mw * mh);
  let lawnCells = 0;
  for (let k = 0; k < mw * mh; k++) {
    if (md[k * 4] > 127) {
      lawn[k] = 1;
      lawnCells++;
    }
  }
  const isLawnAt = (x: number, z: number): boolean => {
    const i = Math.floor(((x - X_MIN) / WIN_W) * mw);
    const j = Math.floor(((z - Z_MIN) / WIN_D) * mh);
    if (i < 0 || j < 0 || i >= mw || j >= mh) return false;
    return lawn[j * mw + i] === 1;
  };

  // 2-triangle tapered blade: plane with base at y=0, top pinched
  function buildBladeGeometry(): THREE.PlaneGeometry {
    const blade = new THREE.PlaneGeometry(BLADE_W, 1, 1, 1);
    blade.translate(0, 0.5, 0);
    const pos = blade.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0.9) pos.setX(i, pos.getX(i) * 0.18);
    }
    return blade;
  }

  // placement bounds: tree extent padded by 15 m on every side, then masked
  let xMin = Infinity;
  let xMax = -Infinity;
  let zMin = Infinity;
  let zMax = -Infinity;
  const trees = site.trees as SiteTree[];
  for (const t of trees) {
    xMin = Math.min(xMin, t.x);
    xMax = Math.max(xMax, t.x);
    zMin = Math.min(zMin, t.z);
    zMax = Math.max(zMax, t.z);
  }
  xMin -= 15;
  xMax += 15;
  zMin -= 15;
  zMax += 15;

  // exclusion zones: structure footprints expanded by 0.5 m
  const rects = getFootprintRects();

  function inStructure(x: number, z: number): boolean {
    for (const r of rects) {
      const rx = x - r.cx;
      const rz = z - r.cz;
      const px = Math.cos(r.ang);
      const pz = Math.sin(r.ang);
      const lx = rx * px + rz * pz;
      const lz = -rx * pz + rz * px;
      if (Math.abs(lx) < r.halfLen + 0.5 && Math.abs(lz) < r.halfWid + 0.5) return true;
    }
    return false;
  }

  function nearTree(x: number, z: number): boolean {
    for (const t of trees) {
      const dx = x - t.x;
      const dz = z - t.z;
      if (dx * dx + dz * dz < 0.36) return true;
    }
    return false;
  }

  // blade mesh state: created lazily (PERFORMANCE.GRASS off skips it
  // entirely) and shown/hidden by the runtime toggle. A hidden mesh costs
  // nothing per frame; a never-created one also saves the GPU upload.
  let mesh: THREE.InstancedMesh | null = null;
  let placed = 0;
  // per-instance random colour variation applied at placement
  // (instanceColor holds variation x seasonal/snow tint)
  let bladeVar = new Float32Array(COUNT * 3);
  const uTime = { value: 0 };
  const uHeight = { value: 1 };
  const cA = new THREE.Color(0x5f7f36);
  const cB = new THREE.Color(0x86984a);
  const c = new THREE.Color();

  function buildBlades(): THREE.InstancedMesh {
    // Transparency: blades fade out toward their base (terrain shows
    // through) and stay nearly opaque at the tip - softens the mass so the
    // trees read against it instead of drowning in the grass.
    const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, transparent: true });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uHeight = uHeight;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uHeight;\nvarying vec2 vBladeUv;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vBladeUv = uv;
          #ifdef USE_INSTANCING
            vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            float sway = sin(uTime * 1.5 + iPos.x * 0.5 + iPos.z * 0.3) * 0.06 * uv.y * uHeight;
            transformed.x += sway;
            transformed.y *= uHeight;
          #endif`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vBladeUv;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
          diffuseColor.a *= mix(0.45, 0.95, vBladeUv.y);`,
        );
    };

    const m = new THREE.InstancedMesh(buildBladeGeometry(), material, COUNT);
    m.name = 'meadow-grass';
    m.frustumCulled = false;
    m.visible = bladesEnabled;

    const mat4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    bladeVar = new Float32Array(COUNT * 3);
    placed = 0;
    let attempts = 0;
    const maxAttempts = COUNT * 40;
    while (placed < COUNT && attempts < maxAttempts) {
      attempts++;
      const x = xMin + rng() * (xMax - xMin);
      const z = zMin + rng() * (zMax - zMin);
      if (!isLawnAt(x, z)) continue;
      if (nearTree(x, z) || inStructure(x, z)) continue;
      const h = CONFIG.GRASS.BLADE_H_MIN + rng() * CONFIG.GRASS.BLADE_H_RANGE;
      p.set(x, getHeight(x, z), z);
      q.setFromAxisAngle(up, rng() * Math.PI * 2);
      s.set(0.8 + rng() * 0.5, h, 1);
      mat4.compose(p, q, s);
      m.setMatrixAt(placed, mat4);
      c.copy(cA).lerp(cB, rng());
      m.setColorAt(placed, c);
      bladeVar[placed * 3] = c.r;
      bladeVar[placed * 3 + 1] = c.g;
      bladeVar[placed * 3 + 2] = c.b;
      placed++;
    }
    // shrink the instance buffer to what actually got placed
    m.count = placed;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    console.info(`grass: ${placed} blades on ${lawnCells} lawn cells (${Math.round((100 * lawnCells) / (mw * mh))}% of window)`);
    return m;
  }

  if (bladesEnabled) mesh = buildBlades();

  // Snow extent: the terrain gates snow to this lawn mask (via
  // getLawnMask) intersected with the same padded tree bounds as the
  // placement below - so snow covers exactly the region where blades grow.

  return {
    mesh,
    update(elapsedTime: number): void {
      uTime.value = elapsedTime;
    },
    setSeason(day: number): SeasonKey {
      const key = nearestSeason(day).key;
      const snow = snowAmount(day);
      // seasonal height: growth/mow curve (vertex-shader uniform)
      uHeight.value = grassHeight(day);
      if (!mesh) return key;
      // material stays white - all tinting is per-instance. Every blade sits
      // on a lawn cell by construction, so the snow tint (the terrain gates
      // to the same lawn mask) applies to all of them.
      const tint = new THREE.Color(SEASON_TINT[key]).lerp(SNOW_TINT, snow * 0.85);
      for (let i = 0; i < placed; i++) {
        c.set(bladeVar[i * 3], bladeVar[i * 3 + 1], bladeVar[i * 3 + 2]).multiply(tint);
        mesh.setColorAt(i, c);
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      return key;
    },
    getLawnMask(): { data: Uint8Array; w: number; h: number } {
      return { data: lawn, w: mw, h: mh };
    },
    setBladesEnabled(enabled: boolean): void {
      if (enabled === bladesEnabled) return;
      bladesEnabled = enabled;
      if (enabled && !mesh) {
        // first creation (load-time off): place the blades now
        mesh = buildBlades();
      } else if (mesh) {
        // hide/show: an invisible mesh skips the draw entirely, so the
        // vertex/fill cost is gone either way
        mesh.visible = enabled;
      }
    },
    get bladesEnabled(): boolean {
      return bladesEnabled;
    },
  };
}
