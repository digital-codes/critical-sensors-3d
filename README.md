# wiese — Katzenwedelwiesen Streuobstwiese

Components for the critical-sensors.de orchard (Streuobstwiese Katzenwedelwiesen,
Karlsruhe): IoT sensor dashboard rebuild, reference-sensor data pipeline, and a
realtime 3D view of the orchard grounded in real geodata.

All implementation work is tracked as OpenSpec changes (`openspec/changes/`) and
driven through `opencode` for a complete change trace.

## Layout

| Path | What |
|---|---|
| `datatools/` | `refSensors.py` — assembles a virtual reference sensor from DWD (Kollsberg 04177) + ICOS (KIT tower @30 m CO₂, @2.5 m meteo) + two wind sources (DWD 10-min wind, SensorCity mast) and writes it into the sensor DB. `sensorcity_pick.py`/`sensorcity_read.py` — SensorCity neighbour-station probe (exploratory). See `datatools/README.md`. |
| `orchard/` | Three.js + ez-tree realtime 3D model of the orchard (terrain from LGL-BW DGM 0.25 m, aerial from DOP20 2024, 39 curated Baumkataster trees with photo-calibrated heights, LoD2 buildings, seasons, compare mode). See `orchard/README.md`. |
| `orchard/public/php/` | `api.php` — sensor API for the dashboard: daily min/mean/max per channel from the `wiese.sensors` DB as JSON; channel→sensor map inside as the single switch point; credentials via `config.ini` (gitignored; template committed). Deployment + security notes: `orchard/public/php/README.md`. |
| `www/` | **The user-facing dashboard** (German; Vue 3 + Vite + TS, dev port 5212): header with the global day-of-year slider, data pane fed live by the PHP sensor API (six sensor channels + the wiese Licht card + the site map card), the embedded 3D orchard scene (`mountOrchard` embed mode), the photo streak and a mobile tab layout. See `www/README.md`. |
| `oldwww/` | Current live PHP site (https://critical-sensors.de/) + weekly orchard photos 2020–2022. Reference for the new dashboard. |
| `newimages/` | New 2026 reference photos (Hocksitzcafe, other directions). Too large for git; 9 downscaled copies live in `orchard/public/photos/`. |
| `geoimages/` | LGL-BW open geodata (DGM, DOP, nDOM). Too large for git — re-download from https://opengeodata.lgl-bw.de/; see `geoimages/info.txt`. |
| `ideas/` | Experiments: `ez-tree` (upstream tree lib, vendored into `orchard/src/eztree/`), `imgsmear` (submodule — the photo-streak effect), `perlin` (noise; source of the snow tile), `sparks` (lightning-bolt tests, graduated into `orchard/src/sparks.ts`). See `ideas/README.md` and `ideas/sparks/README.md`. |
| `tools/` | `cat_model/` — the procedural trimesh generator for the walking-cat GLB (`orchard/public/models/cat.glb`). See `tools/cat_model/README.md`. |
| `docs/` | Design documents — `dashboard-plan.md` (dashboard concept, data inventory, design tokens; status note at the top). |
| `openspec/` | OpenSpec workspace: proposals, specs, designs, task lists, archive. The change trace. |
| `.cache/opencode/` | OSM API/Overpass snapshots (tree positions, Hocksitzcafe footprints) used by `orchard/tools/prepare_site.py`. |

## Documentation

Every subfolder with its own README, in one map:

| Doc | Covers |
|---|---|
| [`www/README.md`](www/README.md) | the dashboard app: run, components, global state, streak modes, Vite wiring |
| [`orchard/README.md`](orchard/README.md) | the 3D scene: geodata pipeline, features, config, embed mode, licences |
| [`orchard/public/php/README.md`](orchard/public/php/README.md) | the sensor API: channels, endpoints, deployment, security |
| [`datatools/README.md`](datatools/README.md) | the reference-sensor pipeline: sources, DB schema, lock, cron, troubleshooting |
| [`tools/cat_model/README.md`](tools/cat_model/README.md) | the procedural cat-model generator |
| [`ideas/README.md`](ideas/README.md) · [`ideas/sparks/README.md`](ideas/sparks/README.md) | experiments and their status (imgsmear, perlin, sparks) |
| [`ideas/imgsmear/README.md`](ideas/imgsmear/README.md) | the ImgSmear component (streak effect; git submodule) |
| [`docs/dashboard-plan.md`](docs/dashboard-plan.md) | the original dashboard design plan + design tokens |
| `openspec/` | the change trace: `changes/archive/` (completed work), `specs/` (merged capability specs) |

## Quick start

```bash
npm install                     # once per app: run inside www/ and orchard/

# the dashboard — what visitors see (http://localhost:5212)
npm run dev                     # = npm run dev:www

# the standalone 3D scene only (http://localhost:5199)
npm run dev:scene

# production build of both apps (www/dist/ is the deployable)
npm run build
```

Live data in dev additionally needs the PHP sensor API
(`php -S 127.0.0.1:9000 -t orchard/public/php orchard/public/php/router.php`;
see `orchard/public/php/README.md`).

Site data pipeline (regenerates `orchard/public/site/` + `orchard/src/site.json`
deterministically; needs the geoimages tifs locally):

```bash
python3 orchard/tools/prepare_site.py
```

Reference sensor pipeline (needs .venv):

```bash
python3 -m venv .venv && .venv/bin/pip install -r datatools/requirements.txt
.venv/bin/python datatools/refSensors.py --csv   # offline test
.venv/bin/python datatools/refSensors.py         # DB write, needs REFSENSORS_DB_URL or datatools/dburl.txt
```

## Data sources & licences

- **LGL-BW** DGM 0.25 m / DOP20 RGBI (2024): Datenlizenz Deutschland — Namensnennung 2.0
  (attribution shown in the orchard app footer).
- **OpenStreetMap** tree/structure positions: © OpenStreetMap contributors (ODbL).
- **ICOS** (KIT tower): CC BY 4.0 — exact citation written per run to
  `datatools/ICOS-CITATION.txt`; fair-use rules honoured in `datatools/README.md`.

## Not in git (on purpose)

- `datatools/icosAuth.txt`, `oldwww/icosAuth.txt`, `oldwww/config.ini` — **credentials** (ICOS account cheatsheet / site DB config).
  Committed **templates** with the required structure (placeholders only, no real values):
  `datatools/icosAuth.template.txt`, `oldwww/config.ini.template` — copy to the real filename and fill in.
- `datatools/dburl.txt`, `datatools/ref_*.csv` — DB password / generated output.
- `geoimages/**.tif`, `**.tfw` — 227 MB of open geodata, re-downloadable.
- `newimages/` — 135 MB of original 2026 photos.
- `oldwww/img/` — the 16 MB weekly photo archive (2020–2022). Needed only by the
  old site and the compare mode; run `python3 orchard/tools/fetch_photos.py` to
  populate `orchard/public/photos/` for the compare panel.
- `orchard/screenshots/` — review screenshots, regenerable.
- `orchard/public/textures/bark/` (except the two used sets Bark001/Bark002)
  — unused ez-tree texture packs; restore from `ideas/ez-tree` if needed.
- `node_modules/`, `dist/`, `.venv/` — regenerable.
- `ideas/ez-tree/`, `ideas/imgsmear/` — registered as git submodules (upstream clones; the ez-tree source we use is additionally vendored at `orchard/src/eztree/`). After cloning: `git submodule update --init`.

## Status

The dashboard is implemented and iterated. **20 OpenSpec changes are archived**
under `openspec/changes/archive/` — from the sensor-pipeline and 3D-model
foundations (2026-11-07/08) through sky conditions, thicket, cat, sparks,
Lochstein, the `dashboard-prototype` itself (2026-11-10) to the recent
refinements (2026-11-11: `www-dashboard-refinements`, `add-www-site-map`,
`blitz-preset-and-idle-loop`, `fallen-ground-leaves`, `orchard-tree-apples`,
`add-station-temperature-humidity-metrics`). The merged capability specs live
in `openspec/specs/` (`dashboard-web`, `orchard-3d-view`,
`orchard-ground-leaves`, `orchard-tree-apples`,
`reference-sensor-pipeline`); `openspec list --changes` shows the current
state.

Current dashboard state: live data via the PHP sensor API (six measured
sensor cards + the wiese Licht card — real measurements with a 31-day demo
fallback — + site map), photo streak in `cycle` mode by
default, mobile tab layout, embedded 3D scene with seasons, sky presets,
day-gated lightning, leaf-fall calendar and apples.

Open for later phases: the orchard's own IoT sensors (the `api.php`
`$CHANNELS` map is the switch point when they arrive), a JSON cache
replacing the old site's `srv.php`, and deriving the 3D sky condition from
real weather data.

## Agent skills created or updated in the 2026-11-06/07 session

Reusable Hermes-agent skills written while building this repo (they live in
the agent's skill store, not in git — listed here for the change trace):

- **wiese-critical-sensors** *(created)* — project conventions for this repo:
  repo layout, ICOS/DWD rules, the +z-south handedness and absolute-DHHN
  height conventions, git/credential hygiene, and the browser verification
  loop for the orchard app. With references for ICOS Carbon Portal,
  site geodata/ez-tree, and the Baumkataster pipeline.
- **aerial-shadow-removal** *(created)* — recipe for flattening baked-in
  shadows and tree crowns out of the DOP20 orthophoto so the terrain texture
  doesn't double-shadow; used by `orchard/tools/prepare_site.py`.
- **development-workflow-rules** *(updated)* — general dev-workflow guardrails
  (openspec + opencode delegation among them) extended with this project's
  conventions.
- **openspec-apply-change** *(updated)* — implementation-loop skill for
  working through OpenSpec change task lists, tuned during the
  `update-refsensors-icos-access` / `orchard-3d-model` runs.
- **github-repo-management** *(updated)* — repo/remote/release handling used
  for the wiese + imgsmear repositories.
