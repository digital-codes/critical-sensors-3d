import * as THREE from 'three';
import site from './site';
import { getHeightSampler } from './terrain';
import { nearestSeason, type SeasonKey } from './seasons';
import { getFootprintRects } from './structures';

interface SiteTree {
  x: number;
  z: number;
}

const COUNT = 90000;
const BLADE_W = 0.085;

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

  // 2-triangle tapered blade: plane with base at y=0, top pinched
  const blade = new THREE.PlaneGeometry(BLADE_W, 1, 1, 1);
  blade.translate(0, 0.5, 0);
  const pos = blade.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0.9) pos.setX(i, pos.getX(i) * 0.18);
  }

  // placement bounds: tree extent padded by 25 m on every side
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
  xMin -= 25;
  xMax += 25;
  zMin -= 25;
  zMax += 25;

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
  while (placed < COUNT) {
    const x = xMin + Math.random() * (xMax - xMin);
    const z = zMin + Math.random() * (zMax - zMin);
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
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return {
    mesh,
    update(elapsedTime: number): void {
      uTime.value = elapsedTime;
    },
    setSeason(day: number): SeasonKey {
      const key = nearestSeason(day).key;
      material.color.setHex(SEASON_TINT[key]);
      return key;
    },
  };
}
