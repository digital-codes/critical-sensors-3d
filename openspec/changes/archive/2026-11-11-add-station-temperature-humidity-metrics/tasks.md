# Tasks

## 1. Schema-alteration ordering fix (bug first — later groups depend on the columns existing)

- [x] 1.1 In `datatools/refSensors.py`, move the idempotent `ALTER TABLE sensors ADD COLUMN …` block from its current position (after `engine.connect()` and the `max(date)` read) to immediately after the single-instance kill/lock takeover, before `scEngine`/any read or write on `sensors`; include the four new column names in the guarded list. Verify: in a dry run against the live DB, the "ALTER TABLE sensors ADD COLUMN" log lines appear before the first "Checking latest value" read, and no lock-wait error occurs.
- [x] 1.2 Make the relocated step tolerate `--csv` mode (no DB access in offline mode) and DB-unreachable mode (exit non-zero with the existing message, before fetching). Verify: `python3 datatools/refSensors.py --csv` completes without touching MySQL.

## 2. Station-qualified columns in the pipeline

- [x] 2.1 In `datatools/refSensors.py`, build hourly `temp_006`/`hum_006` (from the station-006 air frame) and `temp_116`/`hum_116` (from the station-116 air frame) series and left-join them onto the reference frame on `date` (mastWind pattern), with NaN defaults when a station fetch failed or returned nothing. Verify: a `--csv` run writes `ref_*.csv` containing the four columns, populated where the station has hourly data and NULL elsewhere.
- [x] 2.2 Add the four columns to the `to_sql` dtype map (FLOAT) so appends type them correctly. Verify: an append run inserts rows whose `temp_006`/`hum_006`/`temp_116`/`hum_116` values match the `--csv` output for the same hours.
- [x] 2.3 Confirm the per-id neighbour rows are unchanged: ids 9/10 still write `temp`/`hum`/`pres`/`solar`, and reference-row `temp`/`hum` still hold only DWD/ICOS values. Verify: after a live run, `select id, count(*) from sensors group by id` and spot-check one recent hour per id.

## 3. Migration script and fresh-database DDL

- [x] 3.1 Create `datatools/migrate_add_station_air_columns.py` mirroring `migrate_add_sensorcity_neighbours.py`: add the four FLOAT NULL columns (one transaction per DDL statement) and INSERT-IGNORE the `sensor_sources` rows for id 0 (`temp_006`/`hum_006` ← SC-SW-006 °C/%, `temp_116`/`hum_116` ← SC-N-116 °C/%), with the same idempotency summary and exit codes. Verify: `python3 datatools/migrate_add_station_air_columns.py` runs clean twice on the live DB (second run reports "already present" / 0 rows inserted, exit 0).
- [x] 3.2 In `datatools/create_tables.py`, add the four columns to `DDL_SENSORS`, the four id-0 `sensor_sources` seeds, and extend the id-0 `sensor_locations` `variables` string. Verify: `python3 datatools/create_tables.py --sql` prints the new DDL columns and seeds.
- [x] 3.3 Verify fresh-database parity: run `create_tables.py --sql` output against a scratch database (or compare with the migration result) so a bootstrapped DB and a migrated live DB end up with the same columns and registry rows for this change. Verify: column list of `sensors` and id-0 `sensor_sources` rows match in both paths.

## 4. Integration verification

- [x] 4.1 End-to-end live run: kill any running instance, start `datatools/refSensors.py`, and confirm the ordering log (kill → ALTER → fetch → read → append) and that new reference rows carry station-qualified values. Verify: recent id-0 rows show non-NULL `temp_116`/`hum_006` for hours the SensorCity stations reported; dashboard still lists sensors 8/9/10 unchanged.
