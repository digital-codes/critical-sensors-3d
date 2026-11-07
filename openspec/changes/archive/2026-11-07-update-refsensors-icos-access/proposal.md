# Proposal

## Why

`datatools/refSensors.py` — the cron job that feeds the virtual "Referenz" sensor (id 0) into the `sensors` database behind critical-sensors.de — is broken: ICOS Carbon Portal discontinued the legacy binary access endpoint used by the old `icoscp` library's `Dobj` class, and the old SPARQL client URL (`/sparqlclient/?type=JSON`) now returns an HTML page instead of JSON. As a result no reference data (CO2 from ICOS/KIT, DWD weather) is being written anymore.

## What Changes

- Replace the deprecated `icoscp` library (`RunSparql`, `Dobj`) with its official successor `icoscp-core` (`meta.sparql_select`, `data.get_columns_as_arrays`), which is the only supported access path after the legacy-binary shutdown.
- Adapt the two ICOS queries (CO2 NRT `atcCo2NrtGrowingDataObject` @ 30 m, fallback meteo `atcMeteoGrowingNrtDataObject` @ 2.5 m, station AS_KIT) to the new result format (`SparqlResults.bindings`).
- Fix SQLAlchemy 2.0 incompatibilities (`engine.table_names()` was removed) so the MySQL write path works with the installed SQLAlchemy 2.x.
- Extract the database URL from a configuration file/env instead of the hard-coded string (the copy in this repo contains a redacted placeholder; the live server has real credentials).
- Add a `--csv` offline mode that fetches and merges the data and writes timestamped CSVs instead of touching MySQL, so the pipeline is testable on machines without the `cz` database.
- Documented setup: Python venv at project root (`.venv`) with `icoscp-core`, `pandas`, `numpy`, `requests`, `sqlalchemy`; ICOS authentication via `~/.icoscp/cpauthToken_auth_conf.json` (one-time `auth.init_config_file()` or migrated credentials; the account must have accepted the ICOS data licence once).
- DWD ingestion is unchanged (verified still working, station 04177).

## Capabilities

### New Capabilities

- `reference-sensor-pipeline`: The virtual reference sensor pipeline — fetching DWD open data and ICOS/KIT atmospheric data, merging them into the sensor-row format, and appending new rows to the `sensors` table (or CSV output in offline mode). Owns freshness, dedup, and data-source-fallback behavior for sensor id 0.

### Modified Capabilities

<!-- none - no specs exist yet; this is the first spec for the pipeline -->

## Impact

- Code: `datatools/refSensors.py` (rewritten data-access layer; merge/format and dedup logic preserved).
- Dependencies: `icoscp` → `icoscp-core` (>= 0.3), SQLAlchemy 1.x-compatible calls → 2.x.
- Systems: ICOS Carbon Portal (metadata SPARQL + authenticated binary/tabular access), DWD CDC open data, MySQL `cz` database on the wiese server (unchanged schema, sensor id 0).
- Operations: first run requires the ICOS data licence to be accepted for the account (one-time, user profile); token auto-refresh uses stored credentials.
