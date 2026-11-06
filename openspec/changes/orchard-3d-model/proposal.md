# Proposal

## Why

The planned new dashboard for critical-sensors.de should show the Streuobstwiese ("Katzenwedelwiesen") not only as charts but as a place: a realtime 3D model of the orchard that renders through the seasons like the weekly photo series on the old website (75 photos, 2020–2022, same spot at the south end). This change builds that model as a standalone prototype using the ez-tree procedural tree library, grounded in the real site geometry (LGL-BW open geodata + OSM) and validated against the real photos — "doesn't need to look identical but must look similar".

## What Changes

- New standalone Three.js web app in `orchard/` (Vite + TypeScript), using `@dgreenheck/ez-tree` for procedural trees (npm dependency; local copy in `ideas/ez-tree` as reference).
- Real-terrain ground: heightmap built from the LGL-BW DGM 0.25 m tiles (`geoimages/dgm025_*`), draped with the DOP20 RGBI 2024 aerial crop (`geoimages/dop20rgbi_*`) as texture.
- ~10 orchard trees at positions digitized from the DOP20 aerial (crown blobs cross-checked against the old weekly photos), generated with ez-tree Oak/Aspen/Bush presets, individually tuned (seed, trunk height, crown shape) to match the photos.
- The three wooden Hocksitzcafe structures at their OSM way positions (simple stylized wood-frame models derived from the 2026-10-22 photos in `newimages/`).
- Season parameter (day-of-year 0–365) driving foliage: full green summer, autumn tint, bare winter branches; regenerating ez-tree geometry per season change; grass color/density follows.
- Wind animation via ez-tree `tree.update(time)`; Perlin-noise clouds (based on `ideas/perlin`/`ideas/ez-tree` cloud modules).
- Camera presets: the classic photo spot at the south end (matching the old website images) and free orbit; a compare mode showing rendered view next to real photos.
- Data-prep scripts (Python, `orchard/tools/`) that pre-process the GeoTIFFs once into app-ready assets (heightmap + texture + `site.json` with tree/structure positions in local meters); heavy geodata stays out of the app bundle.
- Attribution: LGL-BW data ("Datenlizenz Deutschland – Namensnennung – 2.0"), © OpenStreetMap contributors (ODbL) displayed in the app.

## Capabilities

### New Capabilities

- `orchard-3d-view`: The realtime 3D orchard view — terrain, trees, structures, grass, seasons, wind, camera presets and photo-compare, as a reusable component/standalone page that the future dashboard can embed.

### Modified Capabilities

<!-- none - no existing capabilities are changed by this prototype -->

## Impact

- New code: `orchard/` (app + tools); no changes to existing `datatools/`, `oldwww/`, or site code.
- Dependencies: three, @dgreenheck/ez-tree, vite, typescript (orchard-local package.json); Python: pillow, pyproj, numpy (system python has all three) for tools.
- Data: reads `geoimages/*.tif` (LGL-BW open data), `oldwww/img/*.jpg` + `newimages/*.jpg` (reference photos), OSM API data; writes derived assets under `orchard/public/site/` and `orchard/src/site.json`.
- Later integration: the dashboard change will embed this view and connect live sensor values (e.g. wind speed from sensors → wind strength) — out of scope here.
