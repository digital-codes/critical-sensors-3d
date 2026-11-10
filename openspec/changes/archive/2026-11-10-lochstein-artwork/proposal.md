# Proposal

## Why

The Lochstein artwork (OSM node 7697255398, `tourism=artwork`,
`artwork_type=sculpture`, material stone) stands ~55 m NE of the meadow
centre inside the simulation window — but not in the scene. It is a
landmark at the north-east path junction (paved plaza, Ø ~7–8 m) that the
user passes on every visit; the NE meadow reads empty without it.

## What Changes

- New `orchard/src/lochstein.ts`: procedural three-piece sculpture —
  upper slab (3.0 m long × 1.5 m tall × 0.4 m max thick, user-measured)
  with a 0.3 m circular through-hole in the polished face, balanced on a
  rough grey support boulder via a small pivot stone (total ≈ 2.3 m).
  Slab face = ExtrudeGeometry from an irregular outline + hole path;
  texture = clean dark greenish-black stone with white/light-green
  diagonal veining, polished (the "when new" look — NO graffiti, user
  decision 2026-11-10).
- `CONFIG.LOCHSTEIN` (config.ts, admission rule): WGS84 lat/lon
  (48.990414, 8.388110 = DOP-measured stone centre; the OSM node sits
  2.3 m SW of it), face azimuth 45° NE, dimensions, hole placement — all
  user-tunable.
- Orientation from three independent sources: OSM reference photo
  (face-on from NE), user photo 20261109_122817 (camera bearing 48°,
  face near head-on), DOP 2024 footprint long axis 135° (⊥ to the face
  normal). Face normal = compass 45° NE, slab length axis NW–SE.
- `main.ts` wiring (panel.ts pattern): create after terrain, lat/lon →
  local metres via the in-app utm32 path, ground-set via
  getHeightSampler, `__scene3.lochstein` spread merge.
- Out of scope: graffiti decals, snow coupling, a new camera preset
  button, the neighbouring tagged boulders.

## Capabilities

### New Capabilities

### Modified Capabilities

- `orchard-3d-view`: adds the Lochstein artwork placement requirement.

## Impact

- `orchard/src/lochstein.ts` (new), `orchard/src/config.ts`
  (CONFIG.LOCHSTEIN), `orchard/src/main.ts` (create + hook),
  `orchard/README.md` (Features).
- No new dependencies, no external asset (procedural) — no licence
  impact; OSM node data already covered by the ODbL attribution.
- Evidence: `tmp/sparks/lochstein_osm_ref.jpg` (OSM image, NE, when new),
  user photos `newimages/20261109_1227{51,817}.resized.jpg` (EXIF
  vantages 144°/48° at 31/13 m), DOP crop
  `tmp/sparks/lochstein_dop_crop.jpg`.
