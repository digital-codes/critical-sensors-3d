# wiese — Katzenwedelwiesen Streuobstwiese

Components for the critical-sensors.de orchard (Streuobstwiese Katzenwedelwiesen,
Karlsruhe): IoT sensor dashboard rebuild, reference-sensor data pipeline, and a
realtime 3D view of the orchard grounded in real geodata.

All implementation work is tracked as OpenSpec changes (`openspec/changes/`) and
driven through `opencode` for a complete change trace.

## Layout

| Path | What |
|---|---|
| `datatools/` | `refSensors.py` — assembles a virtual reference sensor from DWD (Kollsberg 04177) + ICOS (KIT tower @30 m CO₂, @2.5 m meteo) and writes it into the sensor DB. See `datatools/README.md`. |
| `orchard/` | Three.js + ez-tree realtime 3D model of the orchard (terrain from LGL-BW DGM 0.25 m, aerial from DOP20 2024, 18 trees at OSM positions, seasons, compare mode). See `orchard/README.md`. |
| `oldwww/` | Current live PHP site (https://critical-sensors.de/) + weekly orchard photos 2020–2022. Reference for the new dashboard. |
| `newimages/` | New 2026 reference photos (Hocksitzcafe, other directions). Too large for git; 9 downscaled copies live in `orchard/public/photos/`. |
| `geoimages/` | LGL-BW open geodata (DGM, DOP, nDOM). Too large for git — re-download from https://opengeodata.lgl-bw.de/; see `geoimages/info.txt`. |
| `ideas/` | Experiments: `ez-tree` (upstream tree lib, vendored into `orchard/src/eztree/`), `imgsmear`, `perlin`. |
| `openspec/` | OpenSpec workspace: proposals, specs, designs, task lists, archive. The change trace. |
| `.cache/opencode/` | OSM API/Overpass snapshots (tree positions, Hocksitzcafe footprints) used by `orchard/tools/prepare_site.py`. |

## Quick start

```bash
# 3D orchard
cd orchard && npm install && npm run dev

# reference sensor pipeline (needs .venv)
python3 -m venv .venv && .venv/bin/pip install -r datatools/requirements.txt
.venv/bin/python datatools/refSensors.py --csv   # offline test
.venv/bin/python datatools/refSensors.py         # DB write, needs REFSENSORS_DB_URL or datatools/dburl.txt
```

Site data pipeline (regenerates `orchard/public/site/` + `orchard/src/site.json`
deterministically; needs the geoimages tifs locally):

```bash
python3 orchard/tools/prepare_site.py
```

## Data sources & licences

- **LGL-BW** DGM 0.25 m / DOP20 RGBI (2024): Datenlizenz Deutschland — Namensnennung 2.0
  (attribution shown in the orchard app footer).
- **OpenStreetMap** tree/structure positions: © OpenStreetMap contributors (ODbL).
- **ICOS** (KIT tower): CC BY 4.0 — exact citation written per run to
  `datatools/ICOS-CITATION.txt`; fair-use rules honoured in `datatools/README.md`.

## Not in git (on purpose)

- `datatools/icosAuth.txt`, `oldwww/icosAuth.txt`, `oldwww/config.ini` — **credentials** (ICOS account cheatsheet / site DB config).
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

- `update-refsensors-icos-access` — complete, live-verified (ICOS via `icoscp-core`,
  DWD per-source staleness guard, SQLAlchemy 2.x, `--csv` mode).
- `orchard-3d-model` — complete, browser-verified (terrain, trees, seasons,
  structures, grass/sky, compare mode); visual tuning session open.
