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

## SensorCity neighbour probe (exploratory)

`sensorcity_pick.py` + `sensorcity_read.py` query the city's **SensorCity**
environmental-sensor feed (dashboard:
https://geoportal.karlsruhe.de/sensorcity/Dashboard/, ArcGIS FeatureServer
`https://geoportal.karlsruhe.de/ags04/rest/services/Hosted/Sensordaten_NodeRED/FeatureServer`,
no auth) to find the sensor neighbourhood of the orchard
(centre 48.98990, 8.38730).

- `sensorcity_pick.py` — per direction, the **3 nearest stations** north /
  east / south-west (angular Voronoi sectors around bearings 0/90/225 deg,
  boundaries 45/157.5/292.5), plus the **closest station with valid wind**
  (layer 5) and **rain** (layer 3) data. Writes `sensorcity_stations.json`.
- `sensorcity_read.py` — live values (layer 1) per selected station and
  7-day archive availability + latest sample from layers 2 Temperatur,
  3 Regenschreiber, 4 Boden, 5 Wind. Run after the picker.

Snapshot (2026-11-07, 11 stations): N = 116 Breite Straße, 002
Hohenzollernstraße*, 003 Neue-Anlage-Straße*; E = 008 Weiherfeldstraße, 011
Schauinslandstraße, 093 Kehler Straße*; SW = 006 Lützenhardtstraße, 007
Weiherfeldstraße, 001 Grünwinkler Straße*; WIND = wind mast at 008
Weiherfeldstraße (621 m E); RAIN = Barani MeteoRain (~4.5 km NE, only two
gauges in the whole feed). `*` = soil profile station (moisture/temperature
at 0/30/70 cm; the 70 cm values are sentinels — probe not installed).

API quirks this probe works around (relevant for the dashboard cache later):

- Date filters need SQL `timestamp 'YYYY-MM-DD HH:MM:SS'` — epoch-ms
  literals are rejected ("Ungültiger Datentyp").
- Group-by statistics (`groupByFieldsForStatistics`) require
  `outFields` = the group-by field only; `outFields=*` corrupts the response.
- Most stations carry coordinates only as feature **geometry** (a few also as
  `lat`/`lon` attributes). Wind archive rows (layer 5) have **no geometry at
  all** — wind devices are located via their own live-layer registrations.
- Several stations have duplicate device rows (test registrations, multi-
  parser stations); station selection dedupes by name + rounded position and
  keeps the row carrying values.
- Known label conflict: the wind parser of 008 Weiherfeldstraße is registered
  at the station's live position (E, 621 m) but its archive rows say
  `stadtteil: Beiertheim-Bulach` (the soil station 007 site, SW). All six
  sibling wind masts agree with their registrations, so the registration wins.

## DWD wind — the measured source for refSensors' `wind` column

Closest DWD station to the orchard: **04177 Rheinstetten, 4.6 km NE** — the
same station `refSensors.py` already uses for temp/hum/light/pressure, and it
is in the wind networks too. `refSensors.py` carries a reserved NULL `wind`
column ("real source pending"); this is the source to slot in, without any
schema change. Verified live 2026-11-07:

- Hourly: `climate/hourly/wind/recent/stundenwerte_FF_04177_akt.zip` —
  columns `F` (speed m/s), `D` (direction deg), `QN_3`; latest ~1–2 days lag.
- **10-minute (preferred)**:
  `climate/10_minutes/wind/recent/10minutenwerte_wind_04177_akt.zip` —
  columns `FF_10` (10-min mean speed m/s), `DD_10` (direction deg), `QN`;
  ~550-day rolling retention, ~1-day publication lag.
- 10-minute gusts:
  `climate/10_minutes/extreme_wind/recent/10minutenwerte_extrema_wind_04177_akt.zip` —
  columns `FX_10` (max 2-s gust), `FNX_10`/`FMX_10` (min/max 10-min mean),
  `DX_10` (direction).

Forecasts (dashboard wind overlay): prefer **ECMWF** over the American GFS —
the radiationMap repo (`digital-codes/radiationMap`, `getWind100.py`) fetches
ECMWF AIFS-single 0.25° 100 m wind GRIB2 from
`https://data.ecmwf.int/forecasts/` (4 runs/day, ~57 MB/slot, steps 0–12 h @3 h,
CC BY 4.0 + attribution wording; nearest grid cell (49.0, 8.5) ≈ 8.3 km;
~6 h publication lag, 12 h fallback needed). sensor.community's `wind.json`
map layer is the same 8.3 km cell but NCEP GFS 0.5°/10 m — forecast only, no
measured history anywhere in that repo; measured series are DWD 04177 above,
the SensorCity mast at 621 m, and ICOS KIT `WS` (already ingested as
`icosWind`).

## Timezone convention

Stored dates are **UTC+1 (CET)**; rows before 2020-10-25 02:00 (UTC+2) get an
extra +1 h shift. **Do not change this** — it keeps the historical series
continuous.

## Troubleshooting

- `Sql failed` (exit 1) — engine/`inspect` failure; check driver/DB URL.
- `No database configured` (exit 1) — set `REFSENSORS_DB_URL` or `dburl.txt`.
- HTTP 403 from ICOS — data licence not accepted for this account.
- Expired auth token — refreshes automatically from stored credentials.
