/**
 * Dense thicket west of the orchard (between the residential row and the
 * meadow): too tight for individual ez-tree elements, so it is rendered as
 * a field of instanced low-poly canopy blobs. Placement is rejection-
 * sampled inside CONFIG.THICKET.POLYGON (local metres, traced from the red
 * "Bushes" outline in newimages/wiese-gebuesch.png — edit the polygon to
 * reshape the strip). Static geometry; the season only changes the tint.
 */
import * as THREE from 'three';
import { CONFIG } from './config';
import { mulberry32 } from './rng';
import { snowAmount, type SeasonKey } from './seasons';
import site from './site';

/** ray-casting point-in-polygon on the config polygon (local metres) */
function inPolygon(px: number, pz: number, poly: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export interface Thicket {
  group: THREE.Group;
  setSeason(day: number): SeasonKey;
}

const SNOW_TINT = new THREE.Color(0xb8c0c4);

export async function createThicket(
  getHeight: (x: number, z: number) => number,
): Promise<Thicket> {
  const group = new THREE.Group();
  group.name = 'thicket';
  const cfg = CONFIG.THICKET;
  const poly = cfg.POLYGON;

  // keep clear of the individually rendered orchard trees
  const clearOfTrees = (x: number, z: number): boolean => {
    const r2 = cfg.TREE_CLEARANCE * cfg.TREE_CLEARANCE;
    for (const t of site.trees) {
      const dx = t.x - x, dz = t.z - z;
      if (dx * dx + dz * dz < r2) return false;
    }
    return true;
  };

  const rng = mulberry32(cfg.SEED);
  const geo = new THREE.IcosahedronGeometry(1, 1); // 80 tris — cheap at scale
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, roughness: 1 });
  const mesh = new THREE.InstancedMesh(geo, mat, cfg.COUNT);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'thicket-blobs';

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  let placed = 0;
  let guard = 0;
  while (placed < cfg.COUNT && guard < cfg.COUNT * 80) {
    guard++;
    const xs = poly.map((p) => p[0]);
    const zs = poly.map((p) => p[1]);
    const bx0 = Math.min(...xs) - 4, bx1 = Math.max(...xs) + 4;
    const bz0 = Math.min(...zs) - 4, bz1 = Math.max(...zs) + 4;
    const x = bx0 + rng() * (bx1 - bx0);
    const z = bz0 + rng() * (bz1 - bz0);
    if (!inPolygon(x, z, poly)) continue; // only inside the traced outline
    if (!clearOfTrees(x, z)) continue;
    const r = cfg.RADIUS_MIN + rng() * (cfg.RADIUS_MAX - cfg.RADIUS_MIN);
    pos.set(x, getHeight(x, z) + r * 0.25, z);
    scl.set(r, r * cfg.SQUASH, r * (0.75 + rng() * 0.5));
    e.set(0, rng() * Math.PI * 2, 0);
    q.setFromEuler(e);
    m4.compose(pos, q, scl);
    mesh.setMatrixAt(placed, m4);
    const v = 0.75 + rng() * 0.5; // per-blob brightness variation
    col.setRGB(v, v * (0.9 + rng() * 0.2), v * (0.85 + rng() * 0.2));
    mesh.setColorAt(placed, col);
    placed++;
  }
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);

  return {
    group,
    setSeason(day: number): SeasonKey {
      let best = (Object.keys(cfg.SEASON_TINT) as SeasonKey[])[0];
      let bestDist = Infinity;
      for (const s of CONFIG.SEASONS) {
        const d = Math.abs(day - s.day);
        const wrapped = Math.min(d, 365 - d);
        if (wrapped < bestDist) {
          bestDist = wrapped;
          best = s.key;
        }
      }
      const tint = new THREE.Color(cfg.SEASON_TINT[best]);
      tint.lerp(SNOW_TINT, snowAmount(day) * 0.15); // stay dark — no snow-heap look
      mat.color.copy(tint);
      return best;
    },
  };
}
