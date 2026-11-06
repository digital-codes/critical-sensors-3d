import * as THREE from 'three';
import site from './site';
import { getHeightSampler, X_MIN, Z_MIN, WIN_W, WIN_D } from './terrain';
import { nearestSeason, snowAmount, type SeasonKey } from './seasons';
import { getFootprintRects } from './structures';

interface SiteTree {
  x: number;
  z: number;
}

const COUNT = 90000;
const BLADE_W = 0.085;
// off-white the grass blades fade toward under patchy snow
const SNOW_TINT = new THREE.Color(0xdfe4e8);
// mown-lawn mask resolution (cells across the 500x450 m window, ~2 m/cell)
const MASK_W = 250;
const MASK_H = 225;

const SEASON_TINT: Record<SeasonKey, number> = {
  winter: 0x8a8a72,
  spring: 0x86a84a,
  summer: 0x6f9440,
  autumn: 0xa89a4a,
};

export interface Grass {
  mesh: THREE.InstancedMesh;
  update(elapsedTime: number): void;
  setSeason(day: number): SeasonKey;
}

export async function createGrass(): Promise<Grass> {
  const getHeight = await getHeightSampler();

  // Mown-lawn mask from the aerial image: only place grass where the DOP
  // actually shows open lawn (keeps blades off paths, courts, buildings and
  // the photographic tree rows). Sampled at ~2 m/cell via canvas 2D.
  const tex = await new THREE.TextureLoader().loadAsync('/' + site.aerial.file);
  const img = tex.image as HTMLImageElement;
  const mc = document.createElement('canvas');
  mc.width = MASK_W;
  mc.height = MASK_H;
  const mctx = mc.getContext('2d', { willReadFrequently: true })!;
  mctx.drawImage(img, 0, 0, MASK_W, MASK_H);
  const md = mctx.getImageData(0, 0, MASK_W, MASK_H).data;
  // cell (i, j): i = west->east, j = north->south (image row 0 = north)
  const lawn = new Uint8Array(MASK_W * MASK_H);
  let lawnCells = 0;
  for (let j = 0; j < MASK_H; j++) {
    for (let i = 0; i < MASK_W; i++) {
      const o = (j * MASK_W + i) * 4;
      const r = md[o];
      const g = md[o + 1];
      const b = md[o + 2];
      const isLawn = g > r + 8 && g > b + 8 && g > 60 && g < 200;
      if (isLawn) {
        lawn[j * MASK_W + i] = 1;
        lawnCells++;
      }
    }
  }
  const isLawnAt = (x: number, z: number): boolean => {
    const i = Math.floor(((x - X_MIN) / WIN_W) * MASK_W);
    const j = Math.floor(((z - Z_MIN) / WIN_D) * MASK_H);
    if (i < 0 || j < 0 || i >= MASK_W || j >= MASK_H) return false;
    return lawn[j * MASK_W + i] === 1;
  };

  // 2-triangle tapered blade: plane with base at y=0, top pinched
  const blade = new THREE.PlaneGeometry(BLADE_W, 1, 1, 1);
  blade.translate(0, 0.5, 0);
  const pos = blade.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0.9) pos.setX(i, pos.getX(i) * 0.18);
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

  const uTime = { value: 0 };
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 iPos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float sway = sin(uTime * 1.5 + iPos.x * 0.5 + iPos.z * 0.3) * 0.06 * uv.y;
          transformed.x += sway;
        #endif`,
      );
  };

  const mesh = new THREE.InstancedMesh(blade, material, COUNT);
  mesh.name = 'meadow-grass';
  mesh.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const cA = new THREE.Color(0x6a8f3c);
  const cB = new THREE.Color(0x9ab04a);
  const c = new THREE.Color();

  let placed = 0;
  let attempts = 0;
  const maxAttempts = COUNT * 40;
  while (placed < COUNT && attempts < maxAttempts) {
    attempts++;
    const x = xMin + Math.random() * (xMax - xMin);
    const z = zMin + Math.random() * (zMax - zMin);
    if (!isLawnAt(x, z)) continue;
    if (nearTree(x, z) || inStructure(x, z)) continue;
    const h = 0.25 + Math.random() * 0.65;
    p.set(x, getHeight(x, z), z);
    q.setFromAxisAngle(up, Math.random() * Math.PI * 2);
    s.set(0.8 + Math.random() * 0.5, h, 1);
    m.compose(p, q, s);
    mesh.setMatrixAt(placed, m);
    c.copy(cA).lerp(cB, Math.random());
    mesh.setColorAt(placed, c);
    placed++;
  }
  // shrink the instance buffer to what actually got placed
  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  console.info(`grass: ${placed} blades on ${lawnCells} lawn cells (${Math.round((100 * lawnCells) / (MASK_W * MASK_H))}% of window)`);

  return {
    mesh,
    update(elapsedTime: number): void {
      uTime.value = elapsedTime;
    },
    setSeason(day: number): SeasonKey {
      const key = nearestSeason(day).key;
      material.color.setHex(SEASON_TINT[key]);
      // snowy lawn: blades fade toward off-white with the snow amount
      const snow = snowAmount(day);
      if (snow > 0) material.color.lerp(SNOW_TINT, snow * 0.85);
      return key;
    },
  };
}
