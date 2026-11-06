# Tasks

## 1. Site data preprocessing

- [x] 1.1 Create `orchard/tools/prepare_site.py`: crop/merge DGM tiles → 16-bit heightmap PNG + scale metadata; crop DOP20 (~460×300 m window, JPEG q85); emit `src/site.json` (origin, transforms, tree list from digitized DOP positions incl. the 2 OSM tree nodes, Hocksitzcafe structures from OSM ways 124028003/004/005, licence/source metadata) — verify: re-run produces byte-identical assets, tree/structure coordinates match the tfw-anchored pixel positions
- [x] 1.2 Copy required textures (bark, leaves) from `ideas/ez-tree/src/app/public/textures/` into `orchard/public/textures/` — verify: all files referenced by presets exist

## 2. App scaffold + terrain

- [x] 2.1 Scaffold `orchard/` (Vite + TypeScript + three + @dgreenheck/ez-tree), `npm install` succeeds, dev server serves an empty scene — verify: `npm run build` passes
- [x] 2.2 Implement terrain mesh from heightmap + DOP texture with local-metre mapping from site.json; add classic south-end camera preset + orbit controls — verify: screenshot shows the meadow with correct slope/orientation vs DOP

## 3. Trees

- [x] 3.1 Place ~10 ez-tree trees from site.json (Oak/Aspen/Bush presets, per-tree seed/tune, terrain-conformant placement), staggered async generation, wind `update()` — verify: crown positions overlay-match the DOP digitized blobs
- [x] 3.2 Season variants: generate winter/spring/summer/autumn cached variants per tree with season parameter UI (day-of-year slider) — verify: winter shows bare gnarled architecture like `oldwww/img/20210206.jpg`, summer full crowns like `20210607.jpg`

## 4. Structures + dressing

- [x] 4.1 Build the three Hocksitzcafe structures (wood frames, railings, tarp accents) at OSM footprints with terrain-conformant heights — verify: aligned with shed markers in DOP crop and recognizable vs `newimages/` photos
- [x] 4.2 Meadow grass (instanced blades, wind, season tint) + overcast sky + Perlin clouds — verify: idle scene animates; look comparable to summer photo foreground

## 5. Compare + polish

- [x] 5.1 Compare mode: side-by-side rendered view vs selected reference photo (photo→season/camera hints from site.json sidecar), screenshot button — verify: side-by-side of `20210607.jpg` and `20210206.jpg` visually convincing
- [x] 5.2 Attribution line (LGL-BW Datenlizenz Deutschland 2.0, © OpenStreetMap contributors) + `orchard/README.md` (run instructions, data sources, licences) — verify: attribution visible on first load
- [x] 5.3 Performance sanity: steady 60 fps on default camera with all seasons cached; `npm run build` clean — verify: dev-tools fps meter

## Workflow follow-up

- Review session with user: walk through camera presets + season sweep, collect look adjustments (per-tree tuning, grass density)
- Later changes: dashboard embedding, live wind from IoT sensors, imgsmear transitions between seasons
