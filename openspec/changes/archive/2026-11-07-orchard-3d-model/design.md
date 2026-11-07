# Design

## Context

Site data verified during exploration (2026-11-06):

- Meadow "Katzenwedelwiesen" centre ≈ 48.9899 N, 8.3873 E (UTM32 ≈ E 455,2xx / N 5,426,8xx). Orchard meadow ~90 × 70 m (DOP crop px x1020–1480, y555–900 at 0.2 m/px), bounded by woodland/scrub (N), hedge (S), railway belt (beyond S), residential lots (W), park with loop path (E).
- ~8–10 fruit-tree crowns identified in the DOP20 crop; 2 already mapped in OSM (nodes 11843200388, 11843200387). Crown centres ≈ crop px: (1230,640) (1210,668) (1215,700) (1180,730) (1255,760) (1300,745) (1290,865) (1120,640) plus 2 uncertain east-edge candidates.
- Three wooden structures = OSM ways 124028003 (shed, ~48.98964/8.38780), 124028004 (building, ~48.98986/8.38787), 124028005 (shed, ~48.98989/8.38683) — the "Hocksitzcafe" per the user; visible in `newimages/20261022_*.jpg` (elevated view from the east: dark wooden frames, one with purple fabric, one with blue tarp).
- Geodata: `dop20rgbi_32_455_5426_1_bw_2024.tif` (5000×5000, 0.2 m/px, RGBI, EPSG:25832, tfw origin 455000.1/5426999.9), `dgm025_*_2022.tif` (2 tiles, 0.25 m/px, same grid family), `ndom1_*` (1 m normalized surface = vegetation height — optional refinement for crown footprints). LGL-BW licence: Datenlizenz Deutschland – Namensnennung 2.0 (PDFs in the folders).
- Reference photos: 75 weekly images `oldwww/img/2020…2022*.jpg` (1000×750, from the south end, eye height); `newimages/20261022_*.jpg` (4000×3000, elevated, with Hocksitzcafe).
- ez-tree (local `ideas/ez-tree`, v1.1.0, MIT): `Tree` class with seeded `TreeOptions` (bark/branch/leaf params, presets Oak/Aspen/Bush/Pine S/M/L), `generate()`, `generateLODs()`, `update(time)` wind animation, GLB export; the standalone app (`src/app/`) ships reusable modules: `grass.js`, `ground.js`, `clouds.js`, `skybox.js`, `environment.js`, `noise.js` — reference implementations to adapt.

## Goals / Non-Goals

**Goals:**
- One standalone Vite+TS app (`orchard/`) that runs in the browser at 60 fps on a normal laptop.
- Visual similarity to the real photos from the two camera presets; deterministic, reproducible site assets from the geodata.
- Season parameter that reuses ez-tree regeneration; simple, honest stylization of the Hocksitzcafe.

**Non-Goals:**
- Photogrammetry-grade accuracy; individual tree species identification; real building models.
- Dashboard integration, live sensor coupling (wind speed from IoT), imgsmear transitions — follow-up changes.
- Mobile/performance tuning beyond sane LOD use; no shadow-casting sun cycle (overcast look first).

## Decisions

- **npm `@dgreenheck/ez-tree`** as dependency (matches local v1.1.0); textures for bark/leaves copied from the local app's `public/textures` (they ship in the repo) into `orchard/public/textures/`. **Implementation deviation (2026-11-06):** the npm package's shipped TypeScript typings lag behind the library API (missing `bark.maps`, `leaves.map`, `generateLODs` in its `.d.ts`), so the current library source is vendored at `orchard/src/eztree/` instead; documented in `orchard/README.md`. Alternative (vite alias to `ideas/ez-tree/src/lib`) rejected: the vendored copy is pinned and self-contained.
- **Preprocessing in Python (system python3, pillow+pyproj+numpy, no rasterio needed):** crop DGM (merge both tiles → float32 → 16-bit PNG heightmap + scale in site.json), crop DOP to a ~460×300 m window around the meadow (JPEG q85, ~2300×1500 px), and emit `site.json`: origin (lat/lon/UTM), pixel↔metre mapping, tree list (x,y,sizeClass,seed,speciesBase,tune), structures (from OSM ways, footprint polygons + height), photo poses (camera presets computed from the tfw-anchored positions). Deterministic: fixed crop boxes/rounding; re-run → identical files.
- **Local coordinate system:** origin at meadow centre (48.98990, 8.38730), +X = UTM east, +Z = UTM north (Three.js right-handed: -Z forward north for the south camera looking north), Y = DGM height. All positions baked into site.json in metres relative to origin.
- **Trees:** one ez-tree `Tree` per position, presets `Oak Medium/Small` + occasional `Aspen`/`Bush` for variety, per-tree overrides (seed, trunk length/radius, branch levels 2–3, leaf size/count/tint). Seasons: 4 cached variants per tree (winter/spring/summer/autumn) generated at startup in a web worker-free staggered loop; `season` parameter crossfades/toggles the nearest cached variant (regenerate-on-change as fallback for arbitrary day values). Grass: adapted `grass.js` instanced blades with season-driven color tint; terrain height sampled from heightmap for placement.
- **Structures:** simple Group geometry (dark-stained box frames, posts, railing, tarp planes with the purple/blue accents from the photos), footprints from OSM way polygons, heights ~3–4 m from photo proportions.
- **Compare mode:** two-pane layout (canvas | `<img>` of chosen reference photo), shared season/pose hints per photo (JSON sidecar mapping photo → suggested season + camera preset), screenshot button.
- **Attribution:** fixed footer line in the app + `orchard/README.md` section (LGL-BW Datenlizenz Deutschland 2.0; © OpenStreetMap contributors).

## Risks / Trade-offs

- [ez-tree regeneration cost per season change] → 4 cached variants per tree, generated staggered; only arbitrary in-between days regenerate on demand (debounced).
- [Tree silhouettes won't match photos exactly] → accepted ("similar, not identical"); per-tree tune pass against the summer photo; crown positions are the anchor.
- [DGM tiles merge edge artifacts] → both tiles share the LGL grid family; verify overlap continuity in preprocessing; feather 1 px if needed.
- [DOP texture licence] → Datenlizenz Deutschland 2.0 requires attribution, which the app displays; source file names recorded in site.json.
- [Winter trees look sparse vs photos' gnarled structure] → tune branch levels/gnarliness on a dedicated winter variant if needed.
- [pandas-free tools] → tools only need pillow/pyproj/numpy (system python3 has them); no new env required.

## Migration Plan

1. `orchard/tools/prepare_site.py` → assets in `orchard/public/site/` + `orchard/src/site.json` (committed).
2. Scaffold app, terrain + aerial, camera presets; screenshot compare (winter + summer).
3. Trees with per-tree tuning pass; then structures, grass, clouds, wind.
4. Season parameter + compare mode; final screenshot-vs-photo check for both presets.
5. README with attribution + run instructions (`npm i && npm run dev`).

## Open Questions

- Should the autumn tint vary per tree (species-ish variety) or uniform? → start uniform, tune if it looks artificial.
- Does the south-end photo spot have a fixed orientation (which way was the camera facing)? → derive from the old photos' skyline (woodland left, tower right in winter shots) during the tuning pass; bake as preset.
