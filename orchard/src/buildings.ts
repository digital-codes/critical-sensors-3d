import * as THREE from 'three';
import { CONFIG } from './config';
import { mulberry32 } from './rng';
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

/** per-wall metadata for the facade texture: the wall's width/height (m)
 *  along its own plane and its outward horizontal direction (unit, x=east,
 *  z=south) used to classify front/side/back */
interface WallMeta {
  width: number;
  height: number;
  outward: [number, number];
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

// roofs take the DOP pixels as-is (tint lives in CONFIG.BUILDINGS)
const ROOF_TINT = CONFIG.BUILDINGS.ROOF_TINT;

// triangulate one LoD2 surface polygon in 3D. Strategy: find the face
// normal, project the ring onto the two axes least aligned with it (walls
// -> xy/yz, roofs -> xz), run ShapeUtils there, and map back through a
// PARALLEL 3D point array (same reversal as the 2D points). Handles holes;
// keeps the real per-vertex heights; dy settles the building onto the DGM.
// Also emits aerial-image UVs from world x/z (u west->east, v: image row 0
// is the north edge = v 1).
function surfaceGeometry(
  surf: Surface,
  dy: number,
  centre: [number, number],
): { geo: THREE.BufferGeometry; wall: WallMeta | null } | null {
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
  const isWall = surf.type === 'WallSurface';
  // walls: a nadir DOP has no facade pixels - instead the wall is mapped
  // in ITS OWN plane (u along the horizontal wall direction, v up), so a
  // procedural facade texture (windows per storey) can be drawn 1:1 in
  // metres. Roofs keep world-x/z UVs (exact DOP roof pixels).
  let wall: WallMeta | null = null;
  let uMin = 0, uMax = 0, vMin = 0, vMax = 0;
  if (isWall) {
    // outward horizontal direction: wall centroid away from the building
    // centre - independent of the polygon's winding
    const cx = rings[0].reduce((s, p) => s + p[0], 0) / rings[0].length;
    const cz = rings[0].reduce((s, p) => s + p[2], 0) / rings[0].length;
    const ox = cx - centre[0];
    const oz = cz - centre[1];
    const olen = Math.hypot(ox, oz) || 1;
    const o: [number, number] = [ox / olen, oz / olen];
    // horizontal tangent perpendicular to the outward direction - the SAME
    // direction the per-vertex u below uses, so extents and UVs agree
    const t = new THREE.Vector3(-o[1], 0, o[0]);
    const us = rings[0].map((p) => p[0] * t.x + p[2] * t.z);
    const vs = rings[0].map((p) => p[1]);
    uMin = Math.min(...us); uMax = Math.max(...us);
    vMin = Math.min(...vs); vMax = Math.max(...vs);
    wall = {
      width: Math.max(uMax - uMin, 0.5),
      height: Math.max(vMax - vMin, 0.5),
      outward: o,
    };
  }
  for (const f of faces) {
    for (const idx of f) {
      const p = all[idx];
      positions.push(p.x, p.y + dy, p.z);
      if (isWall && wall) {
        const u = p.x * -wall.outward[1] + p.z * wall.outward[0];
        uvs.push((u - uMin) / (uMax - uMin), (p.y - vMin) / (vMax - vMin));
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
  return { geo, wall };
}

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

// ------------------------------------------------------------------
// procedural facades (CONFIG.BUILDINGS.FACADE): photo typology from
// newimages/20261028_164047.jpg — white-framed windows in ~3 m storeys
// over a dark plinth band; front/side/back layouts; noise seeded per
// building id so facades are stable across loads (site-data semantics,
// independent of the scene's ?seed)

const F = CONFIG.BUILDINGS.FACADE;

type WallClass = 'front' | 'back' | 'side';

const hashStr = (str: string): number => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/** scale a colour's lightness by f (1 = unchanged) */
const shade = (c: number, f: number): number => {
  const r = Math.min(255, Math.round(((c >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((c >> 8) & 255) * f));
  const b = Math.min(255, Math.round((c & 255) * f));
  return (r << 16) | (g << 8) | b;
};

/** photo-pinned colour for a building centre (nearest override within
 *  8 m), or null when the palette pick stands */
const pinnedOverride = (
  cx: number,
  cz: number,
): { colour: number; base?: number } | null => {
  for (const o of F.COLOUR_OVERRIDES) {
    if (Math.hypot(cx - o.at[0], cz - o.at[1]) < 8) return o;
  }
  return null;
};

/** the weighted facade palette pick facadeMat uses, as a plain colour */
const facadeColour = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  let pick = h % facadeTotal;
  for (const [c, w] of FACADES) {
    if (pick < w) return c;
    pick -= w;
  }
  return FACADES[0][0];
};

/** wall class from the outward direction vs the building's away-from-meadow
 *  vector: the wall most facing away from the meadow is the street-side
 *  front, its opposite the garden-side back, the rest are sides */
const wallClass = (meta: WallMeta, away: [number, number]): WallClass => {
  const d = meta.outward[0] * away[0] + meta.outward[1] * away[1];
  if (d >= 0.5) return 'front';
  if (d <= -0.5) return 'back';
  return 'side';
};

const facadeCache = new Map<string, THREE.MeshLambertMaterial>();

function facadeTextureMat(
  id: string,
  colour: number,
  meta: WallMeta,
  cls: WallClass,
  storeys: number,
  baseBand?: number,
): THREE.MeshLambertMaterial {
  const key = `${id}|${cls}|${meta.width.toFixed(1)}|${meta.height.toFixed(1)}|${storeys}`;
  const hit = facadeCache.get(key);
  if (hit) return hit;
  const rng = mulberry32(hashStr(id + ':' + cls) ^ F.SEED);
  const px = F.PX_PER_M;
  const W = Math.min(384, Math.max(24, Math.round(meta.width * px)));
  const H = Math.min(384, Math.max(24, Math.round(meta.height * px)));
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d')!;
  // base render + plinth band (canvas y=0 is TOP; wall bottom = canvas H)
  ctx.fillStyle = hex(colour);
  ctx.fillRect(0, 0, W, H);
  const plinthPx = Math.round((F.PLINTH_H / meta.height) * H);
  // light base band (photo overrides, e.g. Nr. 12) replaces the dark plinth
  ctx.fillStyle = hex(baseBand ?? shade(colour, F.PLINTH_SHADE));
  ctx.fillRect(0, H - plinthPx, W, plinthPx);

  const scaleH = H / meta.height; // canvas px per metre (vertical)
  const scaleW = W / meta.width; // canvas px per metre (horizontal)
  const [aMin, aMax] = F.AXES[cls];
  // a 1 m window needs ~2.2 m of axis pitch - narrow segments (bay splits,
  // revel walls) carry fewer axes or none at all
  const maxAxes = Math.floor(meta.width / 2.2);
  const axes = maxAxes < 1 ? 0
    : Math.min(aMin + Math.floor(rng() * (aMax - aMin + 1)), maxAxes);
  const rows = Math.max(1, Math.min(storeys, Math.floor(meta.height / F.FLOOR_H)));
  const shutter = hex(F.SHUTTER_COLOURS[Math.floor(rng() * F.SHUTTER_COLOURS.length)]);
  const doorAxis = cls === 'front' && F.FRONT_DOOR ? Math.floor(rng() * axes) : -1;
  const frameC = hex(F.FRAME);
  const pitch = W / axes;
  for (let row = 0; axes > 0 && row < rows; row++) {
    // storey band: v in [row, row+1] * FLOOR_H from the wall bottom
    // (canvas y grows down, so the band's top edge is H - (row+1)*bandH)
    const bandH = F.FLOOR_H * scaleH;
    const bandTopY = H - (row + 1) * bandH;
    for (let ax = 0; ax < axes; ax++) {
      const xC = (ax + 0.5) * pitch;
      if (row === 0 && ax === doorAxis) {
        // entrance door: ~1.1 x 2.1 m from the ground up
        const dw = Math.max(6, Math.round(1.1 * scaleW));
        const dh = Math.max(10, Math.round(2.1 * scaleH));
        ctx.fillStyle = frameC;
        ctx.fillRect(xC - dw / 2 - 2, H - dh - 2, dw + 4, dh + 2);
        ctx.fillStyle = hex(shade(colour, 0.35));
        ctx.fillRect(xC - dw / 2, H - dh, dw, dh);
        continue;
      }
      const winW = Math.max(4, Math.round(pitch * F.WIN_W));
      let winH = Math.max(6, Math.round(bandH * F.WIN_H));
      const x0 = Math.round(xC - winW / 2);
      let y0 = Math.round(bandTopY + bandH * 0.26);
      // never sink into the plinth band
      const yLimit = H - plinthPx - 2;
      if (y0 + winH > yLimit) y0 = Math.max(2, yLimit - winH);
      // shutters flank the window
      const shuttered = rng() < F.SHUTTER_CHANCE;
      if (shuttered) {
        ctx.fillStyle = shutter;
        ctx.fillRect(x0 - Math.round(winW * 0.22), y0 - 1,
          Math.round(winW * 0.2), winH + 2);
        ctx.fillRect(x0 + winW + Math.round(winW * 0.02), y0 - 1,
          Math.round(winW * 0.2), winH + 2);
      }
      // white frame, then glass with per-pane brightness
      ctx.fillStyle = frameC;
      ctx.fillRect(x0 - 2, y0 - 2, winW + 4, winH + 4);
      const bright = 0.75 + rng() * 0.5;
      const dark = rng() < F.DARK_PANE_CHANCE;
      ctx.fillStyle = hex(shade(F.GLASS, dark ? bright * 0.45 : bright));
      ctx.fillRect(x0, y0, winW, winH);
      // centre mullion + sill
      ctx.fillStyle = frameC;
      ctx.fillRect(x0 + winW / 2 - 1, y0, 2, winH);
      ctx.fillRect(x0 - 3, y0 + winH + 2, winW + 6, 2);
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide });
  facadeCache.set(key, m);
  return m;
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
    // per-building facade inputs: palette colour with a small tint jitter
    // (one draw per building - all its walls share the tint), storey count
    // from the CityJSON height (~3 m storeys, roof excluded), and the
    // away-from-meadow direction that classifies front/side/back
    const tintRng = mulberry32(hashStr(b.id) ^ F.SEED);
    const jit = 1 + (tintRng() * 2 - 1) * F.TINT_JITTER;
    const pin = pinnedOverride(b.centre[0], b.centre[1]);
    const baseColour = shade(pin?.colour ?? facadeColour(b.id), jit);
    const storeys = Math.max(
      1, Math.min(4, Math.floor(((b.measuredHeight ?? 0) - 2.5) / F.FLOOR_H)));
    const facaded = (b.measuredHeight ?? 0) >= F.MIN_HEIGHT;
    const clen = Math.hypot(b.centre[0], b.centre[1]) || 1;
    const away: [number, number] = [b.centre[0] / clen, b.centre[1] / clen];
    for (const surf of b.surfaces) {
      if (surf.type === 'GroundSurface') continue; // terrain covers it
      const built = surfaceGeometry(surf, dy, b.centre);
      const geo = built?.geo;
      if (!geo) continue;
      let mat: THREE.MeshLambertMaterial;
      if (surf.type === 'RoofSurface') {
        mat = roofMat;
        hasRoof = true;
      } else {
        hasWall = true;
        mat =
          facaded && built.wall
            ? facadeTextureMat(
                b.id, baseColour, built.wall,
                wallClass(built.wall, away), storeys,
                // light base band only on the north-facing walls
                pin?.base !== undefined && built.wall.outward[1] < -0.5
                  ? pin.base
                  : undefined,
              )
            : facadeMat(b.id);
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
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
