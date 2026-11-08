/**
 * Dense thicket west of the orchard (between the residential row and the
 * meadow): too tight for individual ez-tree elements, so it is rendered as
 * a field of instanced low-poly canopy blobs. Placement is rejection-
 * sampled from the aerial orthophoto itself (dark-vegetation pixels inside
 * a config band), so the shape — including gaps and paths — follows the
 * real strip. Static geometry; the season only changes the tint.
 */
import * as THREE from 'three';
import { CONFIG } from './config';
import { mulberry32 } from './rng';
import { snowAmount, type SeasonKey } from './seasons';
import { X_MIN, Z_MIN } from './terrain';

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

  // rasterize the aerial once and rejection-sample dark vegetation pixels
  // inside the configured band — same image the terrain uses (cache hit)
  const img = new Image();
  img.src = '/' + 'site/aerial.jpg';
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
  const pxOf = (x: number, z: number): [number, number] => [
    Math.round((x - X_MIN) / 0.2),
    Math.round((z - Z_MIN) / 0.2),
  ];
  const isThicketPx = (px: number, py: number): boolean => {
    if (px < 0 || py < 0 || px >= cv.width || py >= cv.height) return false;
    const i = (py * cv.width + px) * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const lum = (r + g + b) / 3;
    return g > r && g > b && lum < cfg.LUM_MAX;
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
  while (placed < cfg.COUNT && guard < cfg.COUNT * 60) {
    guard++;
    const x = cfg.BAND.X_MIN + rng() * (cfg.BAND.X_MAX - cfg.BAND.X_MIN);
    const z = cfg.BAND.Z_MIN + rng() * (cfg.BAND.Z_MAX - cfg.BAND.Z_MIN);
    const [px, py] = pxOf(x, z);
    if (!isThicketPx(px, py)) continue; // only on real (dark) vegetation
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
      tint.lerp(SNOW_TINT, snowAmount(day) * 0.7);
      mat.color.copy(tint);
      return best;
    },
  };
}
