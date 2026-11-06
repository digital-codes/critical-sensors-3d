import * as THREE from 'three';
import site from './site';
import { getHeightSampler } from './terrain';

/**
 * LoD2 city buildings (Stadt Karlsruhe CityJSON, converted to local metres
 * by tools/convert_cityjson.py -> public/site/buildings_lod2.json).
 * Buildings sit around the orchard (west residential row, south-east
 * street); they replace the roofs painted into the aerial with real 3D
 * volumes: semantic WallSurface / RoofSurface polygons, triangulated with
 * holes, flat-shaded, casting shadows.
 */

interface Surface {
  type: string;
  rings: number[][][];
}

interface Building {
  id: string;
  address: string;
  name: string;
  measuredHeight?: number;
  groundY: number;
  centre: [number, number];
  surfaces: Surface[];
}

interface BuildingsAsset {
  hmin: number;
  count: number;
  buildings: Building[];
}

export interface CityBuildings {
  group: THREE.Group;
}

const WALL_COLOUR = 0xd9d2c4;
const ROOF_COLOUR = 0x9b5f4f;

// triangulate one LoD2 surface polygon in 3D. Strategy: find the face
// normal, project the ring onto the two axes least aligned with it (walls
// -> xy/yz, roofs -> xz), run ShapeUtils there, and map back through a
// PARALLEL 3D point array (same reversal as the 2D points). Handles holes;
// keeps the real per-vertex heights; dy settles the building onto the DGM.
function surfaceGeometry(surf: Surface, dy: number): THREE.BufferGeometry | null {
  const rings = surf.rings;
  if (!rings.length || rings[0].length < 3) return null;
  const pts3 = rings[0];
  // face normal from the first three non-collinear points
  let n: THREE.Vector3 | null = null;
  for (let i = 2; i < pts3.length && !n; i++) {
    const a = new THREE.Vector3(...pts3[0]);
    const b = new THREE.Vector3(...pts3[1]);
    const c = new THREE.Vector3(...pts3[i]);
    const cr = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (cr.lengthSq() > 1e-8) n = cr.normalize();
  }
  if (!n) return null;
  const ax = Math.abs(n.x);
  const ay = Math.abs(n.y);
  const az = Math.abs(n.z);
  const drop = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const keep = [0, 1, 2].filter((k) => k !== drop);

  const area = (pts: THREE.Vector2[]): number => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  };
  // 2D projection + parallel 3D points, reversed together for orientation
  const prep = (ring: number[][]): { v2: THREE.Vector2[]; p3: THREE.Vector3[] } => {
    const p3 = ring.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    const v2 = p3.map((p) => new THREE.Vector2(p.getComponent(keep[0]), p.getComponent(keep[1])));
    if (area(v2) < 0) {
      v2.reverse();
      p3.reverse();
    }
    return { v2, p3 };
  };
  const contour = prep(rings[0]);
  const holes = rings.slice(1).map(prep);

  const faces = THREE.ShapeUtils.triangulateShape(
    contour.v2, holes.map((h) => h.v2),
  );
  if (!faces.length) return null;
  const all = [contour.p3, ...holes.map((h) => h.p3)].flat();

  const positions: number[] = [];
  for (const f of faces) {
    for (const idx of f) {
      const p = all[idx];
      positions.push(p.x, p.y + dy, p.z);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals(); // non-indexed -> flat per-face normals
  return geo;
}

export async function createBuildings(): Promise<CityBuildings> {
  const getHeight = await getHeightSampler();
  const asset: BuildingsAsset = await new THREE.FileLoader().loadAsync(
    '/' + site.buildingsLod2.file,
  ).then((t) => JSON.parse(t as string));

  const group = new THREE.Group();
  group.name = 'city-buildings';
  const wallMat = new THREE.MeshLambertMaterial({ color: WALL_COLOUR, side: THREE.DoubleSide });
  const roofMat = new THREE.MeshLambertMaterial({ color: ROOF_COLOUR, side: THREE.DoubleSide });

  let placed = 0;
  for (const b of asset.buildings) {
    // settle each building onto the DGM terrain (CityJSON ground heights
    // come from a different source and can sit decimetres off)
    const dy = getHeight(b.centre[0], b.centre[1]) - b.groundY;
    const bGroup = new THREE.Group();
    bGroup.name = b.address || b.id;
    let hasWall = false;
    let hasRoof = false;
    for (const surf of b.surfaces) {
      if (surf.type === 'GroundSurface') continue; // terrain covers it
      const geo = surfaceGeometry(surf, dy);
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, surf.type === 'RoofSurface' ? roofMat : wallMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (surf.type === 'RoofSurface') hasRoof = true;
      else hasWall = true;
      bGroup.add(mesh);
    }
    if (hasWall || hasRoof) {
      group.add(bGroup);
      placed++;
    }
  }
  console.info(`buildings: ${placed} LoD2 buildings rendered`);
  return { group };
}
