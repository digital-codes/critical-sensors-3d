# datatools — Reference Sensor Pipeline

`refSensors.py` feeds the **virtual reference sensor** (sensor id `0`) of
[critical-sensors.de](https://critical-sensors.de). It merges data from
three source groups into the `sensors` table of the `cz` MySQL database,
using the **exact same row format as the real IoT sensors** (`id = 0`, plus
placeholder columns `rssi`, `bat`, `raw`, ...), so the dashboard treats it
like any device.

- **DWD open data** — station 04177 (Karlsruhe): hourly products
  `recent/*_04177_akt.zip` for temperature/humidity (`TU`), sunshine duration
  (`SD` → converted to a light percentage) and station pressure (`P0`),
  inner-joined on timestamps (from 2020-10-01). A **3-day staleness guard**
  applies per source: products that stop updating are excluded with a warning
  instead of capping the whole merge (e.g. `SD_SO` ended 2026-07-26, so `light`
  is `NULL` now). Wind (10-min `FF_10`) and rain (hourly `R1`) come from the
  same station — see the wind/rain sections below.
- **ICOS Carbon Portal** — KIT station `AS_KIT`: the CO2 NRT "growing" object
  @ 30 m is fetched on **every** run (latest version via SPARQL on
  `meta.icos-cp.eu`, binary data via `icoscp_core`). The ICOS meteo growing
  object @ 2.5 m (temp, humidity, pressure) is a **fallback** replacing the DWD
  channels entirely (with `light = 0`) when DWD has no data within 2 days.
  NRT objects publish roughly daily — the newest ICOS row is the last
  midnight, so `co2` always trails realtime by ~12–30 h.
- **SensorCity (Stadt Karlsruhe)** — the wind mast at 008 Weiherfeldstraße
  (`mastWind`, ~10-min cadence, ~52-day rolling archive), the rain gauge
  at Grünwettersbach (`mastRain`, cumulative tip counter), and three
  neighbour stations stored as their own sensor ids 8–10 (soil profile +
  two air stations; section below). Details in the wind/rain/neighbour
  sections.

## Setup

```sh
python3 -m venv .venv                      # at the PROJECT ROOT; Python >= 3.12
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
# offline mode: no database, writes ref_<ts>.csv + co2_<ts>.csv +
# sc_<ts>.csv (SensorCity neighbours) next to the script
.venv/bin/python datatools/refSensors.py --csv
```

Database config: the env var `REFSENSORS_DB_URL` wins; otherwise the **first
non-empty line** of `datatools/dburl.txt` is used. The file is a SQLAlchemy
database URL — one line, no comments. Example (placeholder credentials —
replace user, password, host and database with your own):

```
mysql+pymysql://wiese:S3cret%21Passw0rd@db-host.example.lan:3306/wiese?charset=utf8mb4
```

- driver prefix `mysql+pymysql://` (PyMySQL is the only installed driver);
  plain `mysql://` also works and resolves to PyMySQL
- port optional (3306 default); `?charset=utf8mb4` recommended — the scripts
  force `charset=utf8mb4` on the connection anyway, so umlauts in seeds and
  data survive any server default
- **special characters in the password must be percent-encoded** in the URL:
  `@` → `%40`, `!` → `%21`, `#` → `%23`, `:` → `%3A`, `/` → `%2F` (so the
  example password `S3cret!Passw0rd` is written `S3cret%21Passw0rd`)
- keep the file out of version control (gitignored); same for the env var

Only rows newer than the latest stored row for sensor 0 are inserted —
re-runs are no-ops, partial runs self-heal on the next run.

After the write, refSensors composes every active *virtual* sensor
(currently id 7 „Wiese-Verbund") from the new data its sources wrote since
the last run — `sensor_sources` drives it (`source_kind='sensor'`), values
combine per `agg` (mean of what is present; missing sources don't block an
hour). Same latest-date dedup: re-runs are no-ops.

## Database schema (create_tables.py)

Four tables, built by `datatools/create_tables.py`:

```sh
.venv/bin/python datatools/create_tables.py             # create + seed (idempotent)
.venv/bin/python datatools/create_tables.py --migrate   # also convert existing
                                                        # tables to utf8mb4, drop
                                                        # superseded ones
.venv/bin/python datatools/create_tables.py --sql       # offline: print all
                                                        # statements, no database
```

- `sensors` — measurement rows, one row per hour per sensor id. `index` is a
  plain AUTO_INCREMENT primary key; refSensors never writes it (older pandas
  versions materialised it and crashed with duplicate-PK errors). Readings
  columns: `temp/hum/pres/light/rain/wind/mastWind/mastRain/solar/soilMoist/
  soilTemp/co2/icosTemp/icosHum/icosWind` + the IoT housekeeping columns.
- `sensor_locations` — the sensor/device registry, ids 0–10. `kind` says what
  a row is: `reference` (id 0), `virtual` (id 7 „Wiese-Verbund"), `iot`
  (real devices), `station` (the planned meadow station), `sensorcity`
  (city-sensor neighbour stations, ids 8–10). Id 0 carries no
  position — its channels come from several physical stations (below).
- `stations` — physical measurement stations with real coordinates: DWD 04177
  Rheinstetten (48.9726, 8.3301, 116.06 m), ICOS AS_KIT KIT campus
  (49.0915, 8.4249, 110 m), SensorCity wind mast 008 + both rain gauges
  (coordinates from the FeatureServer/`sensorcity_stations.json`), and the
  orchard site itself (48.98990, 8.38730, 113.4 m from the LGL DGM).
- `sensor_sources` — channel → source mapping. `source_kind` picks the kind:
  `station` (source_key = `stations.station_key`) or `sensor` (source_key =
  another device's numeric id, combined per `agg`). This is what lets the
  dashboard label the composite reference „Referenz" while still knowing
  where every channel physically comes from — and it drives the composer.

The virtual sensors themselves: id 0 (Referenz) is composed by refSensors'
fetches, id 7 (Wiese-Verbund) after each run from the real sensors' new rows
(see Usage). The chart can keep the combined label — the database stores
every source individually.

## Single-instance lock & graceful termination

refSensors may overlap itself only by accident (cron jitter, manual start
during a run). On start it:

1. reads `datatools/refsensors.lock` — if that PID is alive **and** is
   actually a refSensors process (checked via `/proc/<pid>/cmdline`, so a
   recycled PID or a stale lock is taken over, not trusted),
2. sends it **SIGTERM** (SIGKILL after 60 s if it ignores that),
3. writes its own PID to the lock and installs SIGTERM/SIGINT handlers.

The old process exits **gracefully** (code 2) at the next checkpoint — after
each fetch phase and at a final gate directly before the database write; a
running write is never interrupted. Even a hard kill mid-write self-heals:
rows are inserted date-ascending and the latest-date dedup continues exactly
where the interrupted run stopped.

## Cron example (wiese server)

```
0 */6 * * * cd /srv/wiese && ./venv/bin/python datatools/refSensors.py >> datatools/refsensors.log 2>&1
```

Adjust paths to the server layout. Exit codes: `0` ok, `1` failure
(SQL/config), `2` graceful termination (a newer instance took over). The DB
URL comes from `dburl.txt` or the env var — **never hard-code credentials in
the cron line**. The lock file lives next to the script
(`datatools/refsensors.lock`).

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

## Wind in refSensors — two measured sources (implemented 2026-11-07)

Closest DWD station to the orchard: **04177 Rheinstetten, 4.6 km NE** — the
same station `refSensors.py` already uses for temp/hum/light/pressure, and it
is in the wind networks too. The reference sensor carries **both** as its own
columns (units m/s everywhere, like `icosWind`):

- `wind` ← DWD 04177 **10-minute** wind (`FF_10` m/s, `DD_10` deg), hourly
  mean; left-joined so hours without a wind sample keep their other values.
  The 10-minute product is preferred over the hourly F product for the finer
  source resolution; direction has no sensors-table column yet. Zip:
  `climate/10_minutes/wind/recent/10minutenwerte_wind_04177_akt.zip`
  (~550-day rolling retention, ~1-day publication lag, `-999` sentinels
  filtered, same 3-day staleness guard as the other DWD sources).
- `mastWind` ← **SensorCity wind mast at 008 Weiherfeldstraße** (621 m E of
  the orchard; FeatureServer layer 5, device `9899e75f-…`): hourly mean of
  `wind_average_kmh` converted km/h → m/s. ~10-min cadence, real-time
  (~minutes lag), but only ~52-day rolling archive (verified 2026-11-07:
  8 562 recs, no empty days, median interval 599 s). 1-s/3-s gusts and
  direction exist in the feed but have no sensors-table columns yet.
  The mast reports wind only — temp/hum/pressure at that station come from a
  separate parser (`da9b5ec5-…`).
- Cross-check 2026-11-07: corr(wind, mastWind) = 0.88 over 265 shared hours;
  the mast reads slightly lower (5 m mast in built area vs open 10 m station).
  `icosWind` (ICOS KIT WS) is currently ~0% populated in the NRT object —
  these two sources close that gap.

10-minute gusts (optional, not wired):
`climate/10_minutes/extreme_wind/recent/10minutenwerte_extrema_wind_04177_akt.zip`
— `FX_10` (max 2-s gust), `FNX_10`/`FMX_10` (min/max 10-min mean), `DX_10`.

Forecasts (dashboard wind overlay): prefer **ECMWF** over the American GFS —
the radiationMap repo (`digital-codes/radiationMap`, `getWind100.py`) fetches
ECMWF AIFS-single 0.25° 100 m wind GRIB2 from
`https://data.ecmwf.int/forecasts/` (4 runs/day, ~57 MB/slot, steps 0–12 h @3 h,
CC BY 4.0 + attribution wording; nearest grid cell (49.0, 8.5) ≈ 8.3 km;
~6 h publication lag, 12 h fallback needed). sensor.community's `wind.json`
map layer is the same 8.3 km cell but NCEP GFS 0.5°/10 m — forecast only, no
measured history anywhere in that repo. Measured series, complementary:

- **SensorCity wind mast at 621 m** (device `9899e75f`, layer 5) — real-time
  (~minutes lag), median cadence **599 s ≈ 10 min**, fields
  `wind_average_kmh`, `windgust_1s_kmh`, `windgust_3s_kmh`,
  `wind_direction_degree` (km/h, 5.0 m mast, LS 33991). Archive depth only
  **~52 days rolling** (verified 2026-11-07: 8 562 recs, no empty days,
  56–194 recs/day) — good for "now" and recent context, not for history.
- **DWD 04177** (4.6 km, 10-min, ~550-day retention, ~1-day lag, m/s) — the
  historical series.
- ICOS KIT `WS` (already ingested as `icosWind`).

## Rain in refSensors (implemented 2026-11-07)

Two rain columns, mirroring the wind pattern (units mm — `rain` is the DWD
hourly sum, `mastRain` the gauge's hourly sum):

- `rain` ← DWD 04177 hourly **precipitation** product `R1` (station 04177,
  same source as temp/hum/light/pressure; zip
  `climate/hourly/precipitation/recent/stundenwerte_RR_04177_akt.zip`).
  Missing values are the `-999` sentinel and are filtered to `NaN` (genuine
  dry hours are `0.0`). Hourly sum in mm. ~550-day rolling retention,
  ~1-day publication lag, same 3-day staleness guard as the other DWD
  sources.
- `mastRain` ← **SensorCity Barani MeteoRain** rain gauge at Grünwettersbach
  (7.5 km SE of the orchard; FeatureServer layer 3
  `NodeRED_Regenschreiber_Archiv`, device `4ac74c30-4378-4182-86cb-f1e552d8f8fb`).
  ~10-min cadence, near-real-time. `clicks` is a **cumulative tip counter**
  (tipping bucket, 0.2 mm per tip) with rare device resets, handled by
  `diff()` — a negative diff (reset) is replaced with the new counter value,
  then clipped at 0 and scaled to mm before the hourly sum.
- Calibration 2026-11-07 (90 days): 528 tips = 105.6 mm vs DWD 04177
  102.2 mm; hourly correlation 0.52 (0.59 when SensorCity is shifted +1 h —
  its timestamps appear to lag DWD by ~1 h; no shift applied, for consistency
  with `mastWind`).
- The other gauge in the feed, **'Barani (MeteoRain IoT Pro)
  [AC1F09FFFE0E25FC]'** at Rintheim (4.5 km NE), is **UNUSABLE**: `clicks` is
  implausible (12 980 tips/90 d vs DWD 102 mm), correlation 0.25, 28 counter
  anomalies, and `niederschlag_stdl` was never populated in 40 209 rows.

## SensorCity neighbour stations (implemented 2026-11-08)

Three neighbour stations north/southwest of the orchard are stored as their
OWN sensor rows (ids 8–10, kind `sensorcity`) — not merged into the
reference composition. Registered in `sensor_locations`/`sensor_sources`,
sourced from the `stations` rows `SC-N-002` / `SC-N-116` / `SC-SW-006`:

| id | station | layer | channels |
|---|---|---|---|
| 8 | SC-N-002 — 002 Hohenzollernstraße (457 m N) | 4 soil | `soilMoist` (%), `soilTemp` (°C) at the deepest installed probe `depth_51` (61/71 unbestückt — sentinels −5/−327.68 filtered) |
| 9 | SC-N-116 — 116 Breite Straße (212 m N) | 2 air | `temp` (°C), `hum` (%), `pres` (hPa), `solar` (W/m²) |
| 10 | SC-SW-006 — 006 Lützenhardtstraße (332 m SW) | 2 air | as id 9 |

- `pres` arrives in **Pa** and is divided by 100 to match the DWD `pres`
  unit (hPa). `sonnenstrahlung` goes into the new `solar` column (W/m²) —
  NOT into DWD `light`, which is percent sunshine, a different quantity.
- Air stations report ~10-min cadence (hourly mean), the soil profile ~1 h;
  ~2-week (air) / ~80-day (soil) rolling archive — the first run after the
  change wrote that whole window, later runs append only new hours
  (latest-date dedup per sensor id, same discipline as the reference).
- A failed fetch logs and leaves that sensor id untouched; the rest of the
  pipeline continues. The virtual composites (ids 0/7) are unaffected —
  folding these stations into „Referenz" would be a separate decision.
- Migration for the live database (pre-change schema):
  `.venv/bin/python datatools/migrate_add_sensorcity_neighbours.py` —
  idempotent (columns via inspect, rows via `INSERT IGNORE`), per-statement
  transactions, prints before/after row counts; safe to re-run. Fresh
  databases already get everything from `create_tables.py`.

## Timezone convention

Stored dates are **UTC+1 (CET)**; rows before 2020-10-25 02:00 (UTC+2) get an
extra +1 h shift. **Do not change this** — it keeps the historical series
continuous.

## Troubleshooting

- `Sql failed` (exit 1) — engine/`inspect` failure; check driver/DB URL.
- `No database configured` (exit 1) — set `REFSENSORS_DB_URL` or `dburl.txt`.
- HTTP 403 from ICOS — data licence not accepted for this account.
- Expired auth token — refreshes automatically from stored credentials.
- `stale lock ... taking over` — a previous run died hard; safe to continue.
- `virtual N composed: 0 rows` — no new source data since the last run, **or**
  `sensor_locations` is empty (the composer discovers virtual sensors there —
  re-run `create_tables.py --migrate`).
- `create_tables.py` printing `FAILED on statement: ...` — names the exact
  statement; seeds run per-statement, so earlier successes stay committed.
