# Design

## Context

`datatools/refSensors.py` is a single-script cron job (see proposal.md — Why). Verified current state (2026-11-06):

- DWD: all three `stundenwerte_*_04177_akt.zip` URLs still return 200; parsing logic works with pandas 2.x/3.x.
- ICOS: legacy binary access is discontinued server-side ("Legacy binary access has been discontinued. Please upgrade to the latest version of the Python library."); `/sparqlclient/?type=JSON` now serves an HTML page (404 as API). The standard SPARQL endpoint `https://meta.icos-cp.eu/sparql` still answers the original queries verbatim.
- `icoscp-core` 0.3.13 (project venv `.venv/`) verified end-to-end against the live service: `meta.sparql_select()` returns the CO2 NRT object (`ICOS_ATC_NRT_KIT_2026-04-01_2026-11-04_30.0_489-1918_CO2.zip`), `meta.get_dobj_meta()` + `data.get_columns_as_arrays()` reach the data service; the only remaining blocker was the one-time data-licence acceptance on the `info@digital-codes.de` account (user performed it).
- Authentication: `~/.icoscp/cpauthToken_auth_conf.json` was created from the credentials documented in `datatools/icosAuth.txt` (login verified; token auto-refreshes via stored password). The module-level `meta`/`data` clients of `icoscp_core.icos` use this file automatically.
- SQLAlchemy installed is 2.1.8; `engine.table_names()` (removed in 2.0) is used by the current script and must be replaced (`inspect(engine).get_table_names()` or dropped — the table is known to exist).
- The MySQL part cannot be tested from this machine (no `cz` database locally); it is exercised on the wiese server. This drives the offline-mode requirement.

## Goals / Non-Goals

**Goals:**
- Restore the exact data output of the pipeline (same columns, same time base, same dedup semantics) using supported ICOS APIs.
- Make the script runnable/testable without the production database.
- Keep the script a single self-contained cron job; no framework.

**Non-Goals:**
- No schema changes to the `sensors` table; no changes to `srv.php` or the website.
- No backfill of historical data (the 2020–2022 gap remains as-is).
- No restructure of `datatools/` into a package (stays a script + venv).
- No switch to a different CO2 data product (e.g. level-2 daily files) — keep the NRT growing object.

## Decisions

- **Library: `icoscp-core` instead of raw HTTP.** It is the officially supported path (the server error message names it), handles content negotiation, authentication and licence gating for us, and is stable against future portal changes. Alternative considered (hand-rolled `requests` against `/sparql` + the tabular JSON API) was rejected: it re-implements auth/token-refresh and format negotiation that the library owns.
- **Data access via `get_columns_as_arrays` + pandas DataFrame.** Returns the same logical columns (`TIMESTAMP`, `co2`, `AT`, `RH`, `AP`, ...) the old `Dobj.get()` produced, so downstream merge/rename logic stays nearly unchanged. Column names are verified at runtime and mapped defensively (fail with a clear error if ICOS renames columns, instead of writing `NaN` columns).
- **Queries unchanged in content.** The two SPARQL queries (CO2 @30 m, meteo @2.5 m, station AS_KIT, latest by `timeEnd`) are carried over verbatim — they still validate against the live endpoint.
- **DB URL from environment with file fallback.** `REFSENSORS_DB_URL` env var; if unset, read `datatools/dburl.txt` (single line, git-ignorable) if present. The hard-coded `mysql://cz:***@localhost/cz` string is removed. Rationale: the script is copied between machines (this repo copy is already redacted); a file next to the script matches the existing `config.ini` pattern of the old site.
- **Offline mode via `--csv` flag.** Writes `ref_<timestamp>.csv` (merged reference rows) and keeps the existing `co2_<timestamp>.csv` dump. Default (no flag) remains: connect to MySQL and append — identical cron behavior as before.
- **SQLAlchemy 2.0 compatibility.** Replace `engine.table_names()` with `sqlalchemy.inspect(engine).get_table_names()`; keep `to_sql(..., if_exists="append")` and the existing dtype map.
- **Python environment: project-root venv `.venv`.** Per project convention; `datatools/requirements.txt` lists `icoscp-core`, `pandas`, `numpy`, `requests`, `sqlalchemy`, `mysqlclient` (or `pymysql` — see Open Questions).
- **Citation capture from the object metadata JSON.** For every fetched ICOS object, GET the metadata JSON (`https://meta.icos-cp.eu/objects/<pid>/<fileName>.json`) and extract `references.citationString` and `pid` (fallback: construct citation from `title`, authors, year, PID per the ICOS referencing style). Write `datatools/ICOS-CITATION.txt` (latest, overwritten each run) and log the citation. One lightweight GET per run — within fair use.
- **Fair use of ICOS services.** A run issues exactly one SPARQL query, one metadata GET and one data request per object; recommended cron cadence documented as at most every 6 hours (NRT object updates ~daily). No bulk downloads, no retries in tight loops (single retry with backoff on transient HTTP failures). The redistribution attribution wording for the website ("ICOS RI, licensed under CC BY 4.0" + landing-page + licence links) is consumed from `ICOS-CITATION.txt` by the later dashboard change.
- **Per-source staleness guard for DWD.** The inner-join merge chain lets a single discontinued product kill all DWD channels (observed: SD_SO sunshine duration for station 04177 ended 2026-07-26 while temp/hum/pres remain current — the merged frame capped at 2026-07-26 and the run wrongly fell back to ICOS meteo). Fix: after extracting each source, drop sources whose newest row is older than 3 days (logged warning), merge only the current ones, and add a light column of NaN (→ NULL in MySQL) when light was excluded. The whole-table ICOS meteo fallback then only triggers when the core channels (temp/hum/pres) have no recent DWD data.

## Risks / Trade-offs

- [ICOS column renames in NRT growing objects] → Explicit column check with descriptive error; merge step fails loudly before DB write.
- [Token expiry during long outage] → `icoscp-core` re-fetches tokens from stored password automatically; if the password is changed server-side the script exits with the library's auth error (documented in README).
- [Timezone/DST quirks preserved verbatim] → The +1h/+2h conversion logic is kept byte-for-byte; risk of "wrong" DST handling is accepted for series continuity (same behavior as the old site charts).
- [`mysqlclient` build needs system libs on some hosts] → Fall back to `pymysql` (pure Python) if `mysqlclient` is unavailable; DB URL scheme decides the driver.
- [DWD CDC URL changes] → Unchanged from old script; out of scope here but the failure path (no recent DWD data) now exercises the ICOS meteo fallback, which is tested in offline mode.

## Migration Plan

1. Implement in `datatools/` on a branch; test offline mode against live services (no DB).
2. On the wiese server: create/refresh venv from `requirements.txt`, place `dburl.txt` (or export `REFSENSORS_DB_URL`), run once in DB mode, compare appended rows against expectations (sensor 0, latest dates, CO2 values plausible ~420–430 ppm).
3. Re-enable the cron entry. Rollback: keep the old script as `refSensors_legacy.py` until the first successful DB run.

## Open Questions

- MySQL driver availability on the wiese server (`mysqlclient` vs `pymysql`) — resolves during server deployment; the DB URL scheme makes this a non-issue for the code.
