# Design — lochstein-artwork

## Sources of truth (measured 2026-11-10)

- **Position**: DOP 2024 shows the boulder as an elongated dark blob,
  centre local (59.7, −56.7) → **48.990414 N, 8.388110 E** (CONFIG value).
  OSM node 7697255398 = (56.9, −55.3), 2.3 m SW — records the artwork POI,
  not the stone. Circular paved plaza Ø ~7–8 m around it.
- **Dimensions (user, on-site)**: slab length 3.0 m, height 1.5 m
  (without foot), max thickness 0.4 m; hole Ø **0.36 m** (user +20 %
  correction 2026-11-10 over the estimated 0.3), horizontal axis, in the
  upper-right quadrant of the face (as seen from NE).
  DOP blob length 3.3–3.5 m incl. shadow — consistent.
- **Orientation**: slab face normal = compass azimuth **45° (NE)**;
  length axis NW–SE (DOP footprint 135° ⊥ face normal; OSM reference
  photo face-on from NE; user photo 20261109_122817 from bearing 48°
  shows the face 3° off-normal; photo 122751 from 144° is the near-edge
  side view). `rotation.y = π − azimuthDeg` per the panel pattern.
- **Hole axis is NOT perpendicular to the face** (user correction
  2026-11-10): the bore is swung **40° about the vertical, toward east**
  (HOLE_TILT_DEG 40; axis at compass ≈ 85° while the face normal stays
  45°). Modelled as a CSG SUBTRACTION of a tilted cylinder — an extrude
  hole cannot be oblique.

## Module: `src/lochstein.ts`

```ts
export type Lochstein = { group: THREE.Group; dispose(): void };
export function createLochstein(getHeight: (x: number, z: number) => number): Lochstein
```

- Convert CONFIG lat/lon → local metres with the same in-app utm32 path
  as panel.ts (validate <1 cm against pyproj: expected local
  (59.7, −56.7)). Group y = getHeight(x, z) (plaza pavement ≈ DGM).
- **Slab**: THREE.Shape outline of the face — irregular rounded slab
  ~12 control vertices over a 3.0 × 1.5 m box, wavy top edge, flatter
  base (closed Catmull-Rom, lens/tortoise silhouette). ExtrudeGeometry,
  depth 0.4, bevel ~3 cm, centred on the extrusion axis. **NO extrude
  hole** — instead a CSG subtraction (`three-bvh-csg`, Evaluator/Brush
  SUBTRACTION) of a cylinder: radius `HOLE_DIAMETER / 2`, length
  ~3.5 m, bore centre at ((HOLE_U − 0.5)·LENGTH, HOLE_V·HEIGHT, 0) in
  slab-local coords, axis rotated about local Y by `HOLE_TILT_DEG`
  (slab-local (sin T, 0, cos T)) so it pierces both faces obliquely
  (Ø 0.36 circular openings on both faces, slanted tunnel between).
  cast/receive shadow. Dispose the intermediate geometries.
- **Texture (clean, no graffiti; user 2026-11-10: lighter + more
  reflective than the first dark pass)**: 512² canvas — base
  `CONFIG.LOCHSTEIN.COLOR_BASE` (#465049, light greenish-grey), subtle
  mineral noise, ~9 tapered diagonal veins (white / light green,
  slightly blurred, opacity 0.3–0.65); material roughness
  `CONFIG.LOCHSTEIN.ROUGHNESS` (0.15 — polished stone, catches
  sun/sky highlights). ExtrudeGeometry UVs are shape metres — repeat
  ≈ 0.3. Support stone: plain rough grey flat-shaded.
- **Support boulder**: icosahedron detail 1, radius ~0.55 m, vertices
  jittered ±15 %, squashed to ~0.8 m tall; **pivot stone**: small
  (~0.22 m) icosahedron wedged on the contact plane at u ≈ 0.45 (the
  "balanced" look). Slab base horizontal unless TILT_DEG ≠ 0.
- **Static**: no season hooks, no update function; dispose() for the
  CSG result + source geometries, materials and texture.
- **main.ts**: create after terrain; `__scene3` spread merge with
  `lochstein`; no slider/condition wiring. (Built once; the CSG subtract
  runs at mount, not per frame.)

## CONFIG.LOCHSTEIN (config.ts)

```ts
LOCHSTEIN: {
  // DOP-measured stone centre (2024 aerial, blob at local (59.7,-56.7));
  // OSM node 7697255398 = 48.9904012, 8.3880713 (2.3 m SW, artwork POI)
  LAT: 48.990414, LON: 8.388110,
  // face normal azimuth: OSM reference photo face-on from NE; DOP
  // footprint long axis 135° perpendicular; user photo 122817 at 48°
  FACE_AZIMUTH_DEG: 45,
  LENGTH: 3.0, HEIGHT: 1.5, THICKNESS: 0.4,   // user-measured on site
  HOLE_DIAMETER: 0.36,   // user +20 % over the photo estimate (2026-11-10)
  HOLE_U: 0.62, HOLE_V: 0.62,
  HOLE_TILT_DEG: 40,     // bore NOT ⊥ face: swung 40° toward east
  COLOR_BASE: '#465049', ROUGHNESS: 0.15,  // lighter + reflective (user)
  SUPPORT_WIDTH: 1.1, SUPPORT_HEIGHT: 0.8, PIVOT: 0.22,
  TILT_DEG: 0,
}
```

## Verification

- Numeric in-page: group world position vs pyproj-computed local
  (59.7, −56.7) within 0.1 m; apply group Euler to (0,0,1) → compass
  bearing 45° ± 1°; slab bbox ≈ 3.0 × 1.5 × 0.4 (+bevel); through-hole
  present (raycast along +normal and −normal at the hole centre both
  pass through).
- Screenshots: NE vantage pose (camera at bearing 45° from the stone,
  ~12 m, eye height) vs the OSM reference photo — vision verdict on
  silhouette, hole placement, proportions, reflection; side view from
  ~144° to check the thin 0.4 m profile and the oblique bore.
- `tsc --noEmit` + `npm run build` clean.
