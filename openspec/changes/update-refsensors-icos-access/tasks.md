# Tasks

## 1. Environment

- [x] 1.1 Create `datatools/requirements.txt` (icoscp-core, pandas, numpy, requests, sqlalchemy, pymysql) and confirm `.venv/bin/pip install -r` succeeds into a fresh venv
- [x] 1.2 Add `datatools/README.md` section documenting: venv setup, ICOS auth config (`~/.icoscp/cpauthToken_auth_conf.json`), one-time data-licence acceptance, ICOS data licence & citation obligations (CC BY 4.0, exact citation from `ICOS-CITATION.txt`, redistribution attribution wording, recommended cron cadence ≤ every 6 h for fair use), cron usage — verify steps match a run from a clean shell

## 2. ICOS access layer rewrite (in `refSensors.py`)

- [x] 2.1 Replace `RunSparql` with `icoscp_core.icos.meta.sparql_select`, adapting result handling to `SparqlResults.bindings` (BoundUri/BoundLiteral); verify both queries (CO2 @30 m, meteo @2.5 m, station AS_KIT) return a dobj URI via a live run
- [x] 2.2 Replace `Dobj(pid).get()` with `meta.get_dobj_meta()` + `data.get_columns_as_arrays()` and build the DataFrame; verify printed columns/row counts against the live CO2 object and that citation is logged
- [x] 2.3 Add explicit column-presence check with descriptive error before proceeding (fail loudly if ICOS renames columns); verify by simulating a missing column
- [x] 2.4 Add citation capture: fetch object metadata JSON, extract `references.citationString` + `pid`, write `datatools/ICOS-CITATION.txt` and log the citation; verify the file content matches the landing-page citation (same authors/year/title/PID URL)

## 3. Merge, format and DB path fixes

- [x] 3.1 Keep DWD fetch + merge logic byte-compatible except the staleness guard; keep timezone conversion (+1 h, pre-2020-10-25 +2 h) unchanged; verify offline output dates match the old convention on a known span
- [x] 3.4 Add per-source staleness guard: exclude DWD sources with no rows newer than 3 days from the merge (logged warning), fill missing light with NaN (→ NULL); verify live that temp/hum/pres continue from DWD despite the dead SD_SO product and that no ICOS meteo fallback triggers
- [x] 3.2 Replace `engine.table_names()` with SQLAlchemy 2.0-compatible inspection; verify import and call path against a local SQLite stand-in for the inspect code path
- [x] 3.3 Read DB URL from env `REFSENSORS_DB_URL` with fallback file `datatools/dburl.txt`; remove hard-coded credential string; verify missing-config exits non-zero with clear message and no partial writes

## 4. Offline CSV mode

- [x] 4.1 Add `--csv` flag: full fetch/merge, write `ref_<ts>.csv` + `co2_<ts>.csv`, no MySQL; verify on this machine end-to-end with live DWD+ICOS data

## 5. Integration verification

- [x] 5.1 Run `--csv` mode and validate output: row count > 0, columns exactly match `sensors` dtype map, id=0 placeholders set, dates in local-time convention, `ICOS-CITATION.txt` present with exact citation string and PID URL
- [x] 5.2 Database-mode dry check on this machine: confirm the script reaches the DB connection step and fails cleanly (expected, no `cz` DB here); document the expected server-side run command in README
- [x] 5.3 `openspec validate --change update-refsensors-icos-access` passes; `openspec status` shows all artifacts done

## Workflow follow-up

- Server-side deployment (wiese server): venv + `dburl.txt`, one DB-mode run, compare appended rows, re-enable cron — done on the server, outside this machine
- Archive the change after first successful server run (`openspec archive`)
