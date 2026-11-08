# Tasks

## 1. Schema + registry

- [x] 1.1 `create_tables.py`: add `solar`, `soilMoist`, `soilTemp` to
      DDL_SENSORS; SEED_LOCATIONS ids 8 (SensorCity 002 Hohenzollernstraße),
      9 (SensorCity 116 Breite Straße) and 10 (SensorCity 006
      Lützenhardtstraße), kind `sensorcity`, coordinates from the stations
      rows; SEED_SOURCES rows id 8 → SC-N-002 (soilMoist/soilTemp), ids 9/10
      → SC-N-116/SC-SW-006 (temp/hum/pres/solar) with units
- [x] 1.2 `datatools/migrate_add_sensorcity_neighbours.py`: idempotent
      ALTER + INSERT IGNORE (sensor_locations, sensor_sources), per-statement
      transactions, row counts before/after, dburl resolution like
      create_tables; verify SQL logic against the SQLite stand-in and
      py_compile in a clean python3.12 venv

## 2. refSensors ingestion

- [x] 2.1 Fetch block SC-N-116 (layer 2, device `cb5264f2-…`): hourly mean
      of temp/luftfeuchte/press/sonnenstrahlung → temp/hum/pres/solar,
      SensorCity timestamp recipe (SQL timestamp literal, UTC, pd.to_datetime
      before the CET shift)
- [x] 2.2 Fetch block SC-N-002 (layer 4, device `6a2cd0fd-…`): pick the
      deepest installed depth from live data (sentinels -5/-327.68 filtered),
      hourly mean → soilMoist/soilTemp; record the chosen depth for the
      sensor_sources note
- [x] 2.3 Fetch block SC-SW-006 (layer 2, device `5709d661-…`): same air
      mapping as SC-N-116 → temp/hum/pres/solar, id 10
- [x] 2.4 Append per-sensor frames (ids 8/9/10) with the same NULL
      placeholder convention; wire the three columns through the five places
      (fetch, merge, NULL fallback, ALTER tuple, dtype dict)
- [x] 2.5 README: sensor/channel tables (ids 8/9/10, three new columns),
      migration usage, SensorCity neighbour section

## 3. Verification

- [x] 3.1 Offline `--csv` run (single-instance check first:
      `pgrep -af refSensors.py`): all three stations fetch, hourly rows in
      ref_<ts>.csv, sentinels absent, no DB writes
- [x] 3.2 Cross-check against the live layer (layer 1 latest values) for
      plausible magnitudes on shared hours
- [x] 3.3 `create_tables.py --sql` offline run shows the new columns and
      seeds; migration re-run on SQLite is a no-op
- [x] 3.4 Hand the live-DB migration to the user, verify from their pasted
      row counts, then commit + tag
