# datatools — Reference Sensor Pipeline

`refSensors.py` feeds the **virtual reference sensor** (sensor id `0`) of
[critical-sensors.de](https://critical-sensors.de). It merges public data from
two sources into the `sensors` table of the `cz` MySQL database, using the
**exact same row format as the real IoT sensors** (`id = 0`, plus placeholder
columns `rssi`, `bat`, `raw`, ...), so the dashboard treats it like any device.

- **DWD open data** — station 04177 (Karlsruhe): hourly products
  `recent/*_04177_akt.zip` for temperature/humidity (`TU`), sunshine duration
  (`SD` → converted to a light percentage) and station pressure (`P0`),
  inner-joined on timestamps (from 2020-10-01). A **3-day staleness guard**
  applies per source: products that stop updating are excluded with a warning
  instead of capping the whole merge (e.g. `SD_SO` ended 2026-07-26, so `light`
  is `NULL` now).
- **ICOS Carbon Portal** — KIT station `AS_KIT`: the CO2 NRT "growing" object
  @ 30 m is fetched on **every** run (latest version via SPARQL on
  `meta.icos-cp.eu`, binary data via `icoscp_core`). The ICOS meteo growing
  object @ 2.5 m (temp, humidity, pressure) is a **fallback** replacing the DWD
  channels entirely (with `light = 0`) when DWD has no data within 2 days.

## Setup

```sh
python3 -m venv .venv                      # at the PROJECT ROOT
.venv/bin/pip install -r datatools/requirements.txt
```
Installs `icoscp-core`, `pandas`, `numpy`, `requests`, `sqlalchemy`, `pymysql`.

## ICOS authentication

`icoscp-core` reads credentials from `~/.icoscp/cpauthToken_auth_conf.json`.
Create this file **once** in a Python REPL:

```python
from icoscp_core.icos import auth
auth.init_config_file()   # enter ICOS username/password interactively
```

The token refreshes automatically from stored credentials. **Important:** the
account must also have **accepted the ICOS data licence** once via its profile
at data.icos-cp.eu — otherwise binary downloads fail with **HTTP 403**.

## ICOS data licence & citation (CC BY 4.0)

Every run writes `datatools/ICOS-CITATION.txt` with the exact citation of the
fetched object (authors, year, title, temporal coverage, `hdl.handle.net` PID
URL) plus licence and landing-page links.

- Derived products must keep informing users of the original source: display
  **"ICOS RI, licensed under CC BY 4.0"** plus the landing-page link whenever
  this data is shown (the dashboard does this).
- Fair use: run **at most every 6 hours** (the NRT object updates ~daily); a
  run issues one SPARQL query, one metadata and one data request per object.
- Object **metadata** itself is licensed CC0.

## Usage

```sh
# database mode (default): append new rows to the 'sensors' MySQL table
.venv/bin/python datatools/refSensors.py
# offline mode: no database, writes ref_<ts>.csv + co2_<ts>.csv next to the script
.venv/bin/python datatools/refSensors.py --csv
```

Database config: env var `REFSENSORS_DB_URL`, or the first line of
`datatools/dburl.txt` (keep it out of version control), e.g.
`mysql://user:pass@host/cz`. Only rows newer than the latest stored row for
sensor 0 are inserted.

## Cron example (wiese server)

```
0 */6 * * * cd /srv/wiese && ./venv/bin/python datatools/refSensors.py >> datatools/refsensors.log 2>&1
```

Adjust paths to the server layout. Exit code 1 signals failure. The DB URL
comes from `dburl.txt` or the env var — **never hard-code credentials in the
cron line**.

## Timezone convention

Stored dates are **UTC+1 (CET)**; rows before 2020-10-25 02:00 (UTC+2) get an
extra +1 h shift. **Do not change this** — it keeps the historical series
continuous.

## Troubleshooting

- `Sql failed` (exit 1) — engine/`inspect` failure; check driver/DB URL.
- `No database configured` (exit 1) — set `REFSENSORS_DB_URL` or `dburl.txt`.
- HTTP 403 from ICOS — data licence not accepted for this account.
- Expired auth token — refreshes automatically from stored credentials.
