# Proposal

## Why

The reference sensor row (id 0) already carries neighbour-derived reference channels next to the DWD values (`icosTemp`, `icosHum`, `mastWind`, `mastRain`), but the air temperature and relative humidity of the two nearest SensorCity air stations — 006 Lützenhardtstraße (SW, 332 m) and 116 Breite Straße (N, 212 m) — are only available as separate per-id rows with shared, ambiguous column names. Charting and comparing them against the reference baseline requires joins across sensor ids; station-qualified columns (`temp_006`, `hum_006`, `temp_116`, `hum_116`) make them first-class channels of the reference row. Additionally, the pipeline's dynamic schema-upgrade step currently runs after the pipeline has opened its own read/transaction on `sensors`; while that connection holds metadata locks on the table, `ALTER TABLE` fails — so any schema alteration must happen before the pipeline locks/reads the table, and after old instances have been killed.

## What Changes

- Add four NULLable FLOAT columns to the `sensors` table: `temp_006`, `hum_006` (SensorCity 006 Lützenhardtstraße, station key SC-SW-006) and `temp_116`, `hum_116` (SensorCity 116 Breite Straße, station key SC-N-116). Units match the existing reference channels: °C and %RH.
- Populate the new columns on the reference rows (id 0) by merging the already-fetched SensorCity air data of stations 006 and 116 onto the reference frame (same left-join-on-date pattern as `mastWind`/`mastRain`), following the reference row's CET time-base shift.
- Fix the schema-alteration ordering bug in `refSensors.py`: the idempotent `ALTER TABLE sensors ADD COLUMN …` block moves from its current position (after the write connection is open and a read on `sensors` has started a transaction) to immediately after the single-instance kill/lock takeover and before any database connection, read, or write on `sensors`.
- Add a one-off, idempotent migration script for the live database (following `migrate_add_sensorcity_neighbours.py`) that adds the four columns and registers the new channels in `sensor_sources` (sensor id 0 → station keys SC-SW-006 / SC-N-116); update `create_tables.py` DDL and seeds so fresh databases match.
- Update the `to_sql` dtype map in `refSensors.py` with the new columns.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `reference-sensor-pipeline`: the reference row gains station-qualified SensorCity air channels (temp/hum of stations 006 and 116); the "never merged into the reference sensor rows" rule is relaxed to cover only the unqualified shared channels, while the per-id neighbour rows continue unchanged; and a new requirement pins the schema-migration ordering (alter before locking/reading `sensors`, after killing old instances).

## Impact

- `datatools/refSensors.py` — new merge + columns, relocated ALTER block, dtype map.
- `datatools/create_tables.py` — `sensors` DDL and seed data (sensor_sources for id 0).
- New `datatools/migrate_add_station_air_columns.py` — live-database migration.
- `sensors` table schema on the live MySQL database (four added columns; additive, no breaking change).
- Dashboard consumers are unaffected: existing columns and sensor ids 8/9/10 are unchanged.
