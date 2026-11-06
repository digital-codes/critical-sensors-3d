# orchard — Katzenwedelwiesen 3D prototype

Realtime Three.js view of the Katzenwedelwiesen orchard (Streuobstwiese) for
critical-sensors.de. The terrain, trees, and structures are placed from real
geodata; the scene is rendered in the browser with WebGL.

Uses a **vendored copy of ez-tree v1.1.0** (source in `src/eztree/`) instead of
the npm package (`@dgreenheck/ez-tree`): the shipped TypeScript typings lag
behind the library API — `bark.maps`, `leaves.map`, and `generateLODs` are
missing from its `.d.ts` — so the vendored copy keeps `npm run build`
(`tsc && vite build`) working.

## Run

```sh
cd orchard
npm install
npm run dev      # Vite dev server
npm run build    # tsc + vite build
```

## Data pipeline

`python3 orchard/tools/prepare_site.py` regenerates all site assets from LGL-BW
open geodata and OSM snapshots. It is deterministic: re-running it produces
byte-identical outputs (except the `generatedAt` date in `site.json`).
App-local axes: +x = east, +y = up, **+z = south** — (east, up, south) is the
right-handed triple three.js requires; (east, up, north) is left-handed and
renders the whole scene mirrored.

Outputs:

- `public/site/heightmap.png` — 16-bit PNG, heights in millimetres above
  `hmin`, from a 280x220 m window (orchard + surroundings, 10-m snapped)
  of the DGM 0.25 m raster
  (EPSG:25832 / UTM32N)
- `public/site/aerial.jpg` — RGB crop of the DOP20 RGBI (2024) orthophoto
  window, 0.2 m grid, draped over the terrain
- `src/site.json` — geometry metadata: 18 OSM tree positions (with size
  class, species preset, and per-tree seed), 3 Hocksitzcafe structures (ids
  reference OSM ways 124028003/004/005, but positions are measured from the
  Aug-2024 DOP — the OSM ways map to garden sheds inside the private garden
  east of the orchard), camera
  presets, and licence/source list

Inputs: `geoimages/` (LGL-BW DGM and DOP GeoTIFFs + world files) and
`.cache/opencode/` (OSM snapshots of tree nodes and structure ways, fetched
via Overpass/API).

## Features

- Terrain mesh built from the real DGM heights, textured with the aerial
  orthophoto.
- 18 procedural trees (ez-tree Oak/Aspen/Bush presets), rescaled at runtime
  to the real 4.5–7.5 m height range (bbox-based, since ez-tree presets
  generate ~10–15 m trees).
- 4 season variants per tree, selected via a day-of-year slider (0–364);
  winter renders bare — verified against the reference photos.
- Seasonal grass height (growth from late Feb, peak early summer, mowed
  late Aug, low winter) and a seasonal midday sun (solar declination), so
  the generated trees cast the only, season-correct shadows.
- Winter snow as irregular Perlin patches (tileable noise tile from
  `ideas/perlin/repeat.py`, `public/site/snow_noise.png`), confined to the
  orchard polygon (soft-edged meadow bbox); calibrated on the 2021-01-17
  reference photo. Grass blades follow the same polygon gate per instance.
- 3 stylized wooden Hocksitzcafe structures at their true meadow-centre
  positions (measured from the Aug-2024 DOP spots; the OSM ways with the
  same ids are garden sheds east of the orchard and are NOT used for
  positioning). Small 2.4 m footprints, ~3 m tall, with tarp accents.
- ~90k instanced grass blades with wind sway.
- Overcast sky dome with procedural clouds.
- Camera presets matching the real photo vantages: **Südende** (south-west,
  ground level, looking north-east — the classic weekly-photo spot),
  **Erhöht** (same axis, ~5.5 m up — the slightly elevated 2026 shots) and
  **Nordwest** (meadow NW corner, ~5 m up, looking south-east at the
  Hocksitzcafe — photo 20261022_125920); heights are sampled from the
  heightmap. Note: hedges/rows are painted on the terrain texture, so very
  low oblique views from outside the meadow read them edge-on — stay inside
  the meadow boundary for ground-level shots.
- Compare mode (**Vergleich**): 9 reference photos (weekly photos from the
  old site + 2026 photos, indexed in `src/photos.json` with day-of-year and
  camera preset) side by side with the live render, including a canvas
  screenshot download.

## Licences / attribution

- Terrain heights and aerial imagery: LGL-BW, Datenlizenz Deutschland —
  Namensnennung 2.0 (dl-de/by-2-0). Attribution is shown in the in-app footer.
- Tree and structure positions: © OpenStreetMap contributors (ODbL).
- ez-tree: MIT.

## Known notes

- ez-tree presets generate ~10–15 m trees; they are rescaled at runtime to
  the measured 4.5–7.5 m range.
- Measured FPS is meaningless under SwiftShader software rendering (~2 fps in
  headless CI) — expect ~60 fps on a real GPU.
- Summer foliage density and the ground texture are first-pass tuning;
  both are open for the review session.
