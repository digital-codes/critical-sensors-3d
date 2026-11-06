import * as THREE from 'three';
import site from './site';
import { getHeightSampler, X_MIN, X_MAX, Z_MIN, Z_MAX } from './terrain';

/**
 * LoD2 city buildings (Stadt Karlsruhe CityJSON, converted to local metres
 * by tools/convert_cityjson.py -> public/site/buildings_lod2.json).
 * Buildings sit around the orchard (west residential row, south-east
 * street); they replace the roofs painted into the aerial with real 3D
 * volumes: semantic WallSurface / RoofSurface polygons, triangulated with
 * holes, flat-shaded, casting shadows. All surfaces carry UVs derived from
 * world x/z, so the AERIAL IMAGE textures them: roofs show the exact DOP
 * pixels of the real roofs (seamless with the terrain beneath), walls get
 * the smearing strip from the nadir view, tinted darker.
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

const ROOF_TINT = 0xffffff; // roofs take the DOP pixels as-is

// triangulate one LoD2 surface polygon in 3D. Strategy: find the face
// normal, project the ring onto the two axes least aligned with it (walls
// -> xy/yz, roofs -> xz), run ShapeUtils there, and map back through a
// PARALLEL 3D point array (same reversal as the 2D points). Handles holes;
// keeps the real per-vertex heights; dy settles the building onto the DGM.
// Also emits aerial-image UVs from world x/z (u west->east, v: image row 0
// is the north edge = v 1).
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
  const uvs: number[] = [];
  // walls: a nadir DOP has no facade pixels - world UVs would smear a thin
  // ground strip down the wall (vertical streaks). Sample ONE uniform tone
  // instead: the DOP colour at the wall footprint's centroid.
  const cx = rings[0].reduce((s, p) => s + p[0], 0) / rings[0].length;
  const cz = rings[0].reduce((s, p) => s + p[2], 0) / rings[0].length;
  const wallU = (cx - X_MIN) / (X_MAX - X_MIN);
  const wallV = 1 - (cz - Z_MIN) / (Z_MAX - Z_MIN);
  const isWall = surf.type === 'WallSurface';
  for (const f of faces) {
    for (const idx of f) {
      const p = all[idx];
      positions.push(p.x, p.y + dy, p.z);
      if (isWall) {
        uvs.push(wallU, wallV);
      } else {
        uvs.push(
          (p.x - X_MIN) / (X_MAX - X_MIN),
          1 - (p.z - Z_MIN) / (Z_MAX - Z_MIN),
        );
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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
  // aerial image as shared texture for ROOFS: they show the exact DOP
  // pixels of the real roofs (seamless with the terrain beneath)
  const aerialTex = new THREE.TextureLoader().load('/' + site.aerial.file);
  aerialTex.colorSpace = THREE.SRGBColorSpace;
  const roofMat = new THREE.MeshLambertMaterial({
    map: aerialTex, color: ROOF_TINT, side: THREE.DoubleSide,
  });
  // WALLS: a nadir DOP carries no facade pixels, so sample colours would be
  // arbitrary. Facade palette from the ground photos 20261022_125925/23
  // (St.-Florian-Straße row): yellow-ochre, white/cream, light grey, one
  // green house; weighted by how often each appears there.
  const FACADES: Array<[number, number]> = [
    [0xeae5d9, 4], // white / cream plaster - most common
    [0xd9b35c, 2], // yellow-ochre ("Sonnengelb")
    [0xd8d5ce, 2], // light grey
    [0x9aa88a, 1], // sage green
  ];
  const facadeTotal = FACADES.reduce((s, f) => s + f[1], 0);
  const facadeMatCache = new Map<string, THREE.MeshLambertMaterial>();
  const facadeMat = (id: string): THREE.MeshLambertMaterial => {
    let m = facadeMatCache.get(id);
    if (m) return m;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    let pick = h % facadeTotal;
    let col = FACADES[0][0];
    for (const [c, w] of FACADES) {
      if (pick < w) {
        col = c;
        break;
      }
      pick -= w;
    }
    m = new THREE.MeshLambertMaterial({ color: col, side: THREE.DoubleSide });
    facadeMatCache.set(id, m);
    return m;
  };

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
      const mesh = new THREE.Mesh(
        geo, surf.type === 'RoofSurface' ? roofMat : facadeMat(b.id),
      );
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
