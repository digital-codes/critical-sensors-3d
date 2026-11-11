# Design

## Context

`datatools/refSensors.py` builds the reference sensor frame (id 0) from DWD + ICOS and already merges optional neighbour channels onto it (`mastWind`, `mastRain`, `icosTemp`/`icosHum`/`icosWind`) with a left join on `date`, guaranteeing the columns exist (NaN default) even on fetch failure. The SensorCity air stations 006 and 116 are already fetched hourly per station (`scAirFrame`, ids 10 and 9) and written as their own rows; the frame retains `temp`/`hum` per station before the write. Schema upgrades happen via an idempotent `ALTER TABLE` block near the end of the script (lines ~903–909), after `engine.connect()` and the `select max(date) from sensors where id = 0` read have already run on an open SQLAlchemy connection — an open transaction over `sensors` holds MySQL metadata locks, so the `ALTER TABLE` blocks and fails (lock wait timeout) exactly as reported. `create_tables.py` owns the DDL + seeds; `migrate_add_sensorcity_neighbours.py` is the pattern for live-database migrations. See proposal.md for motivation.

## Goals / Non-Goals

**Goals:**
- Four new columns (`temp_006`, `hum_006`, `temp_116`, `hum_116`) on `sensors`, populated on reference rows from the already-fetched SensorCity air data.
- Schema alteration of `sensors` moved to a safe point: after killing old instances, before any pipeline read/write/lock on the table.
- Live-database migration script and matching `create_tables.py` DDL/seeds, both idempotent, consistent with the existing patterns.

**Non-Goals:**
- No change to the per-id neighbour rows (ids 8/9/10) or their channels.
- No qualified columns for `pres`/`solar` of stations 006/116 (only temp/hum were requested; more can be added later following the same pattern).
- No change to the time-base, dedup, or virtual-sensor logic.

## Decisions

**1. Populate via merge onto the reference frame (mastWind pattern).**
After `scFrames` are built (before the neighbour `scNeighbours` concat or in parallel with it), build one hourly frame per air station from the same fetched data and left-join it onto `ref` on `date`, then rename to the qualified names. The +1 h CET shift applied to `ref` after the merge matches the neighbour rows' convention (`scNeighbours["date"] += 1h` is applied at merge end there too). Columns are defaulted to NaN when a station fetch failed, so `ref.to_sql` always has a complete column set. The air frames' fetch window is widened to the earlier of the station's own window and id 0's window (the mast fetches' anchor): the reference rows advance only as fast as DWD publishes (~a day behind real time), while the stations deliver near real-time — a station-anchored window would never cover the hours the reference frame appends, leaving the qualified columns NULL in steady state. (Found while verifying; id 0's latest 2026-11-11 00:00 CET vs station window 2026-11-11 19:00 CET.)
*Alternative:* read the values back from the neighbour rows after writing them. Rejected: couples the reference write to the neighbour write, breaks the offline `--csv` mode, and adds queries.

**2. Move the ALTER block to immediately after the single-instance kill/lock takeover.**
Relocate `resolve_db_url`/engine creation for the migration step above the fetch section (or at least to right after the lock file section, before `scEngine`/any `sensors` access), and run the idempotent `ALTER TABLE` there. Rationale: MySQL metadata locks are held by the pipeline's own open transaction (SQLAlchemy 2.x leaves `engine.connect()` transactions open), so no alteration after the first `sensors` access can be reliable. Killing old instances first ensures no other pipeline process holds locks either. The late `existingCols` block is removed.
*Alternative:* commit/close the read connection before altering. Rejected as the sole fix: leaves the ordering fragile (any future read re-introduces the bug), and the user explicitly requires alter-before-lock.

**3. Migration script `datatools/migrate_add_station_air_columns.py`, mirroring `migrate_add_sensorcity_neighbours.py`.**
Adds the four columns (one transaction per DDL statement, MySQL auto-commits DDL) and INSERT-IGNOREs the `sensor_sources` rows for id 0: `temp_006`/`hum_006` ← SC-SW-006 (°C / %), `temp_116`/`hum_116` ← SC-N-116 (°C / %). No new `sensor_locations` or `stations` rows — both stations are already registered. Idempotency and the summary/exit-code pattern copied from the existing script.
*Alternative:* extend `migrate_add_sensorcity_neighbours.py`. Rejected: that migration is already applied on the live database; a separate script keeps applied migrations intact and matches the one-script-per-change pattern.

**4. `create_tables.py` stays the source of truth for fresh databases.**
Add the four columns to `DDL_SENSORS` and the four `sensor_sources` seeds for id 0. The `sensor_locations` id-0 `variables` seed string gains the new channel names so chart queries see them.

## Risks / Trade-offs

- [Four more columns on a wide table; reference rows grow] → Additive FLOAT NULL columns are cheap; no index changes needed.
- [Engine creation moved earlier: a DB outage now aborts the run before fetching] → Keep the existing behaviour for the migration step: if the DB is unreachable, exit non-zero before fetching (fetches are useless without a DB in non-CSV mode); `--csv` mode still skips all DB steps.
- [SensorCity renames/re-registers a station device] → Same failure mode as the existing neighbour fetch: fetch failure logs and leaves the columns NULL.
- [Old instances killed before ALTER, but a non-pipeline long transaction could still block the ALTER] → Out of scope; the pipeline can only control its own locks. The ALTER retries are unnecessary — run fails visibly, next run re-attempts (idempotent).

## Migration Plan

1. Deploy the updated code (`refSensors.py`, `create_tables.py`, new migration script).
2. Run `python3 datatools/migrate_add_station_air_columns.py` against the live database (idempotent; safe to re-run).
3. The next `refSensors.py` run populates the new columns from its 30-day fetch window forward. Backfill beyond 30 days is not possible — SensorCity archives roll (~52 days); accepted.
4. Rollback: the added columns and registry rows are inert if the old code runs again; no destructive step exists.

## Open Questions

(none)
