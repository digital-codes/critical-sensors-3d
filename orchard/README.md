# orchard — Katzenwedelwiesen 3D prototype

Realtime Three.js view of the Katzenwedelwiesen orchard (Streuobstwiese) for
critical-sensors.de. Terrain, trees, structures, and the surrounding LoD2
buildings are placed from real geodata; the scene is rendered in the browser
with WebGL.

Uses a **vendored copy of ez-tree v1.1.0** (source in `src/eztree/`) instead of
the npm package (`@dgreenheck/ez-tree`): the shipped TypeScript typings lag
behind the library API — `bark.maps`, `leaves.map`, and `generateLODs` are
missing from its `.d.ts` — so the vendored copy keeps `npm run build`
(`tsc && vite build`) working. One local patch on top: terminal twig tips
only grow their tip leaf when `leaves.count > 0` (`src/eztree/tree.js`) —
upstream recorded one leaf per tip unconditionally, so the bare winter
variant (count 0) still carried ~280 green tufts. Re-apply that gate when
updating the vendored copy.

## Run

```sh
cd orchard
npm install
npm run dev      # Vite dev server
npm run build    # tsc + vite build
```

### Configuration & determinism

- `src/config.ts` is the single home for all app-level tunables (sun/shadow,
  camera, bird flight, sky, grass, seasons, structure materials/dimensions,
  label tables) — modules import, never re-declare. Admission rule (header
  of the file): generated site data → `site.json` (via `tools/prepare_site.py`,
  never hand-edited); app tunable → `config.ts`; algorithm-internal numbers →
  local constant with a comment.
- `?seed=<n>` on the URL makes every random scene decision (grass blade
  placement, cloud placement/textures) reproducible via a mulberry32 PRNG
  (`src/rng.ts`) — the same seed renders a pixel-identical scene, which is
  how refactors get verified by pixel comparison. Without the parameter the
  scene is randomised per load, as before.

### Sky conditions

Four weather presets live in `src/config.ts` (`CONFIG.SKY.CONDITIONS`) —
dome gradient, cloud count/tint/opacity, fog/background colour and
sun/hemisphere/ambient light factors switch together:

| key | look |
|---|---|
| `klar` | blue sky, at most wispy clouds, bright sun |
| `heiter` | blue sky with a few light clouds |
| `leichtBedeckt` | cloudy but light — the **default** (pre-preset look) |
| `gewitter` | heavy dark clouds, thunderstorm mood, heavily dimmed sun |

The dropdown next to the day slider (visible once the trees are generated)
switches the condition; tooling and the dashboard can do the same via
`window.__scene3.sky.setCondition('gewitter')` and read the active key from
`window.__scene3.sky.condition`. Cloud placement is deterministic per
condition (same key → same layout). New presets are added in `config.ts`
only — `sky.ts`/`main.ts` read, never re-declare.

### Bird-flight video export

`tools/render_flight_video.py` renders a deterministic clip of the flight
sequence from a running dev server: frames are pinned via
`window.__scene3.flight.seek(t)` (absolute flight time → reproducible) with
a fixed `?seed=`, then muxed to **H.264 High@4.0, CFR, yuv420p, faststart**
using the `imageio-ffmpeg` static build:

```sh
/home/agent/bin/python tools/render_flight_video.py \
    --url http://127.0.0.1:5199 --seconds 2 --fps 30 \
    --out birdflight-720p.mp4
```

Do NOT use the distro `ffmpeg` for the final encode on this machine: it is
ffmpeg-free (no libx264) and its openh264 fallback produces Baseline@3.1
MP4s that VLC refuses to play.

## Geodata, findings, and methods

App-local axes: +x = east, +y = up, **+z = south** — (east, up, south) is the
right-handed triple three.js requires; (east, up, north) is left-handed and
renders the whole scene mirrored. Origin 48.98990 N / 8.38730 E
(EPSG:25832 / UTM32N), simulation window 280 x 220 m (E 455040–455320,
N 5426410–5426630). All heights are **absolute DHHN metres** end to end: the
terrain mesh and `getHeightSampler` return `hmin + mm/1000`, the LoD2 building
vertices keep their raw z, so buildings and terrain share one reference (an
earlier hmin-relative building export + the getHeight offset double-counted
hmin and floated the buildings ~113 m).

- **Terrain** — DGM 0.25 m raster (`geoimages/dgm025_…`, LGL-BW) → 16-bit PNG
  heightmap, millimetres above `hmin`, 280x220 m window.
- **Aerial** — DOP20 RGBI (2024-08, LGL-BW, 0.2 m/px) cropped to the window
  (5 px/m) and draped on the terrain. The same image textures the building
  roofs: every roof vertex gets UVs from its world x/z, so each 3D roof shows
  the exact orthophoto pixels of the real roof and blends seamlessly with the
  painted roofs beneath (no double-roof ghosting).
- **Trees** — Baumkataster Stadt Karlsruhe via Code for Karlsruhe
  (`https://codeforkarlsruhe.github.io/baumkataster/assets/trees.json`,
  ~127k trees): filtered to Stadtteil 13 (Beiertheim-Bulach, 2,888), window +
  adjacency → 69, hand-curated to **39** (all inside the meadow polygon, the
  4 east street-row trees kept, building-plot/garden trees dropped, the
  4-tree trail group north of the plot kept; see `tools/filter_baumkataster.py`
  `DROP_IDS`). Genus → ez-tree preset only (Oak/Ash/Aspen/Pine/Bush); species
  stay metadata. **Heights are calibrated** against the ground photos
  `20261022_125925.jpg` / `20261022_125923.jpg`: meadow fruit trees ~4–6 m
  (about half the house height), street/edge trees 12–18 m reaching above the
  eaves, conifers taller. Formula (`height_for`): fruit/unknown genera
  `4.2 + 1.1·circ` (4.4–7.0 m), other broadleaves `5.5 + 4.6·circ`
  (~6–17.5 m, trunk circumference as size proxy), conifers `12 + 3·circ`;
  range in scene 5.4–15.6 m.
- **Structures** — 3 Hocksitzcafe towers at meadow centre, positions and
  heights **measured from the Aug-2024 DOP spots** (003: 4.0 m, 004: 3.4 m,
  005: 4.6 m). The OSM ways carrying the same ids are garden sheds east of
  the orchard and are NOT used for positioning.
- **Lawn mask / snow** — `prepare_site.py` exports `public/site/lawn_mask.png`
  (250x225 cells) from the **raw DOP colours** (green test + 
  `ndi.binary_fill_holes`); paths/streets connect to the outside and stay
  open, so winter snow and grass blades cover exactly the meadow. Deriving
  the mask from the shadow-flattened aerial failed twice (flattening tints
  path pixels green; the dark-union variant swept in barn roofs → snow
  covered the whole tile). Mask upload must be an **RGBA DataTexture** —
  RedFormat with 250-px rows silently samples black (rows are not
  4-byte-aligned; zero console errors).
- **LoD2 buildings** — Stadt Karlsruhe 3D-Gebäudemodelle, CityJSON 1.0.1 tile
  `gebaeude_lod2_455000_5426000.json` (official viewer:
  `https://geoportal.karlsruhe.de/3d/karlsruhe_3d/`; the tile's own metadata
  carries no licence). `tools/convert_cityjson.py` → `public/site/
  buildings_lod2.json`: semantic Wall/Roof/Ground surfaces, addresses +
  measuredHeight kept, y kept absolute, **strict tile containment** (any
  vertex outside the window drops the building; 26 kept of 39 in window+10 m
  — nothing overhangs the terrain edge). `src/buildings.ts` triangulates each
  surface by projecting onto its dominant plane (walls stay vertical, roof
  slopes preserved) with parallel 3D point arrays and settles each building
  via `getHeight(centre) − groundY`. **Walls** use a facade palette from the
  ground photos (white/cream, yellow-ochre "Sonnengelb", light grey, one
  sage green; deterministic per building id) — a nadir DOP has no facade
  pixels, so sampling it just smears streaks.
- **Seasonal sun** — midday altitude from solar declination
  `23.44°·sin(2π(day+284)/365)` at lat 48.99, due south; trees cast the only
  shadows (shadow-flattened aerial texture).

## Data pipeline

`python3 orchard/tools/prepare_site.py` regenerates all site assets. It is
deterministic: re-running it produces byte-identical outputs (except the
`generatedAt` date in `site.json`).

Outputs:

- `public/site/heightmap.png` — 16-bit PNG, mm above `hmin`, from the DGM
  0.25 m window
- `public/site/aerial.jpg` — DOP20 RGBI (2024) crop, 5 px/m
- `public/site/lawn_mask.png` — meadow mask from raw DOP colours (snow +
  grass gate)
- `public/site/snow_noise.png` — tileable Perlin tile (`ideas/perlin/repeat.py`)
- `public/site/buildings_lod2.json` — converted CityJSON LoD2 buildings
- `src/site.json` — geometry metadata: 39 Baumkataster trees (position,
  genus preset, trunk circumference, calibrated `heightM`, per-tree seed),
  3 structures, LoD2 building entry, camera presets, sources/licences

Inputs: `geoimages/` (LGL-BW DGM/DOP GeoTIFFs + world files),
`.cache/opencode/` (OSM snapshots, `baumkataster_selected.json`,
`baumkataster_trees.json` 14.9 MB dump), and the CityJSON tile under
`/mnt_ai/data/odd26/ka3d/`.

## Features

- Terrain mesh from real DGM heights, textured with the aerial orthophoto.
- 39 procedural trees (ez-tree presets), rescaled at runtime to the
  calibrated per-tree heights (photo-based, 5.4–15.6 m).
- 8 season variants per tree (season keyframes in `src/config.ts`
  `CONFIG.SEASONS`), selected via a fixed-width day-of-year slider (0–364).
  Leaf-fall calendar: canopies hold full leaves until Oct 1, thin through
  October (0.7 by Oct 18) and November (0.45 / 0.2), and are bare from
  Dec 1 through winter — winter renders bare (vendored-ez-tree tip-leaf
  gate, see above) and winter grass sits at 2 cm so blades do not speckle
  the snow surface.
- Seasonal grass height (growth from late Feb, peak early summer, mowed
  late Aug, low winter) and a seasonal midday sun, so the generated trees
  cast the only, season-correct shadows.
- Winter snow as irregular Perlin patches, confined to the lawn mask
  (meadow only — paths, trails, street, and yards stay bare).
- 26 LoD2 buildings around the orchard (west residential row incl.
  St.-Florian-Str. 2/4/6/12): real wall/roof volumes casting shadows, DOP-
  textured roofs, photo-calibrated facade colours.
- ~90k instanced grass blades with wind sway, clipped to the lawn mask.
- Overcast sky dome with procedural clouds.
- Camera presets matching the real photo vantages: **Südende** (south-west,
  ground level, looking north-east — the classic weekly-photo spot),
  **Erhöht** (same axis, ~5.5 m up — the slightly elevated 2026 shots),
  **Nordwest** (meadow NW corner, ~5 m up, looking south-east at the
  Hocksitzcafe — photo 20261022_125920) and **Fotostandpunkt** (south of
  St.-Florian-Str. 1, eye height, looking at the north slope — the
  Vergleich reference-photo vantage); heights are sampled from the
  heightmap. Note: hedges/rows are painted on the terrain texture, so very
  low oblique views from outside the meadow read them edge-on — stay inside
  the meadow boundary for ground-level shots.
- Compare mode (**Vergleich**): 9 reference photos (weekly photos from the
  old site + 2026 photos, indexed in `src/photos.json` with day-of-year and
  camera preset) side by side with the live render, including a canvas
  screenshot download. Selecting a photo moves the camera to its preset and
  sets its day-of-year in one step.
- **Vogelflug** (`src/flight.ts`): a ~36 s bird's-eye glide that takes off
  ~1.5 m above the crown of the elevated NE tree (Baumkataster bk01345 on
  the ~121 m ridge), sweeps south-west over the Hocksitzcafe and the meadow
  and pulls up over the south grass. The gaze anchors 12 m ahead along the
  path tangent and is low-passed (2 s) like a banking bird, so the heading
  stays smooth through the path's corners; wing-beat bob and lateral sway
  translate the view without rotating it. Any pointer interaction cancels
  the flight and hands the camera back to OrbitControls; `seek(t)` /
  `pause()` / `stop()` on `window.__scene3.flight` give deterministic poses.
- **Kamera panel** (`src/cameraui.ts`, bottom-left): numeric Position
  X/Y/Z and Blickpunkt X/Y/Z with *Übernehmen*, plus Azimut (0° = north),
  Elevation and Abstand with *Nach Winkel*. Non-focused fields live-update
  while orbiting, so a hand-flown pose can be read out and re-applied with
  nudges — the same values as `camera.position` / `controls.target`.

## Licences / attribution

- Terrain heights and aerial imagery: LGL-BW, Datenlizenz Deutschland —
  Namensnennung 2.0 (dl-de/by-2-0).
- Tree register: Baumkataster Stadt Karlsruhe, CC BY 4.0, via Code for
  Karlsruhe.
- LoD2 buildings: 3D-Gebäudemodell der Stadt Karlsruhe, CC BY 4.0
  (https://transparenz.karlsruhe.de/dataset/3d-gebaudemodell-der-stadt-karlsruhe).
- Tree/structure fallback positions: © OpenStreetMap contributors (ODbL).
- ez-tree: MIT.

Attribution is shown in the in-app footer (dynamic tree count).

## Known notes

- DOP roof textures are soft by nature (0.2 m/px → a house roof is
  ~50x40 px); crisper roofs need a higher-resolution DOP or flat colours.
- ez-tree presets generate ~10–15 m trees; they are rescaled at runtime to
  the calibrated per-tree heights.
- Measured FPS is meaningless under SwiftShader software rendering (~2 fps in
  headless CI) — expect ~60 fps on a real GPU.
- Summer foliage density and the ground texture are first-pass tuning;
  both are open for the review session.
