# Proposal

## Why

Two SensorCity neighbour stations north of the orchard are already registered
in `stations` and pinned in `datatools/sensorcity_stations.json`, but their
readings are not fetched and no rows exist in the `sensors` table:

- **SC-N-002** — SensorCity 002 Hohenzollernstraße (soil profile:
  `soil_moisture_at_depth_XX` / `soil_temperature_at_depth_XX`, layer 4,
  device `6a2cd0fd-e3a6-49d8-bb7f-b94d70951d6f`, 457 m N)
- **SC-N-116** — SensorCity 116 Breite Straße (air: temp/RH/pressure/solar,
  layer 2, device `cb5264f2-fd06-472c-b1de-3aacd878f4b3`, 212 m N)
- **SC-SW-006** — SensorCity 006 Lützenhardtstraße (air: temp/RH/pressure/
  solar, layer 2, device `5709d661-984b-4d68-bea3-ffd0e8e114c7`, 332 m SW)

They are among the nearest SensorCity stations to the meadow and cover two
quantities the reference set lacks entirely: soil moisture/temperature and
independent in-city air readings. The database has sensor ids 0–7; the three
stations need new sensor ids, three new `sensors` columns, registry rows and
an idempotent migration for the live server database.

## What Changes

- `refSensors.py` fetches the three stations hourly (same SensorCity recipe
  as the existing mast wind/rain blocks) and appends rows under new sensor
  ids: **id 8 = SC-N-002** (soil moisture + soil temperature at the deepest
  installed probe depth, sentinels filtered), **id 9 = SC-N-116** and
  **id 10 = SC-SW-006** (air: temp/hum/pres mapped to the existing columns,
  solar radiation to a new `solar` column — NOT the DWD `light` column,
  whose unit is percent sunshine, not W/m²).
- `sensors` schema gains three NULLable FLOAT columns: `solar`, `soilMoist`,
  `soilTemp` — added idempotently at write time (existing ALTER tuple) and
  by the migration script for the live DB.
- Registry updates in `create_tables.py` seeds: `sensor_locations` ids 8/9/10
  (kind `sensorcity`), `sensor_sources` rows mapping id 8 → station
  SC-N-002, ids 9/10 → stations SC-N-116/SC-SW-006; fresh `create_tables.py`
  runs produce the same state.
- New `datatools/migrate_add_sensorcity_neighbours.py`: idempotent migration
  (ALTER + `INSERT IGNORE` for sensor_locations/sensor_sources) runnable
  against the live MariaDB; follows the create_tables execution model
  (each statement its own transaction, seeded row counts printed).
- Documentation: datatools README sensor/channel tables gain the two
  stations, the three columns and the migration usage.

## Capabilities

### New Capabilities

(none — deltas extend the existing `reference-sensor-pipeline` capability)

### Modified Capabilities

- `reference-sensor-pipeline`: new requirements for SensorCity neighbour
  ingestion (per-station rows under their own sensor ids), the three new
  columns, and the live-DB migration.

## Impact

- `datatools/refSensors.py` — two fetch blocks, merge into per-sensor
  frames, NULL-fallback section, ALTER tuple, `to_sql` dtype dict
- `datatools/create_tables.py` — DDL_SENSORS column list, SEED_LOCATIONS,
  SEED_SOURCES
- `datatools/migrate_add_sensorcity_neighbours.py` (new)
- `datatools/README.md` — sensor/channel tables, migration section
- No change to the virtual composites: Referenz (id 0) and Wiese-Verbund
  (id 7) composition stays exactly as configured; folding the new stations
  into Referenz is a later, separate decision.
- Data starts at the first post-deploy run (no backfill from the archive
  layers); the archives keep months of history, so a backfill can be added
  later without schema changes.

## Verification plan

Offline first (`.venv/bin/python datatools/refSensors.py --csv` with the
single-instance lock respected — check `pgrep -af refSensors.py` first),
SQLite stand-in for the migration SQL logic per
`references/sensordb-pipeline.md`, py_compile + clean venv 3.12 run. The
live DB path is run by the user; console output gets pasted back.
