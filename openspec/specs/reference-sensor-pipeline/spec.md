# reference-sensor-pipeline Specification

## Purpose
The virtual reference sensor (sensor id 0) provides a gap-free environmental baseline for the Streuobstwiese dashboard: DWD weather data and ICOS/KIT atmospheric CO2, merged into the same row format the real IoT sensors write, so all sensors can be charted together.

## Requirements

### Requirement: Reference sensor rows in the sensors table

The pipeline SHALL append reference-sensor rows (id 0) to the `sensors` table containing DWD weather values and ICOS CO2 values, with reference placeholders for non-physical channels (`rssi=-256`, `bat=100`, `count=0`, `pkt=0`, `rep=0`, `raw=""`, `req=1`), such that dashboard queries (`srv.php`) treat them identically to real sensor rows.

#### Scenario: Successful update run
- **WHEN** the pipeline runs with database access and both DWD and ICOS deliver data
- **THEN** only rows newer than the latest stored row for sensor id 0 are appended, and a run with no new data exits cleanly without writing

#### Scenario: Time base continuity
- **WHEN** timestamps are converted from the UTC sources to the stored local-time convention
- **THEN** the existing convention is preserved exactly (CET/UTC+1, with rows before 2020-10-25 02:00 in CEST/UTC+2) so the historical time series stays continuous

### Requirement: DWD weather ingestion

The pipeline SHALL fetch current hourly DWD CDC station data (station 04177: air temperature, relative humidity, sunshine duration converted to percent, pressure) and use it as the temp/hum/light/pres source.

#### Scenario: DWD provides recent data
- **WHEN** DWD zip files download and parse and contain rows within the last 2 days
- **THEN** those rows form the weather basis and no ICOS meteo fallback is fetched

#### Scenario: A DWD product goes stale
- **WHEN** one DWD product no longer receives updates (e.g. sunshine duration for station 04177 ended 2026-07-26)
- **THEN** only that channel is excluded from the merge with a logged warning, the remaining channels continue from DWD, and the excluded light channel is written as NULL rather than 0

### Requirement: ICOS CO2 ingestion

The pipeline SHALL fetch the latest non-superseded ICOS NRT CO2 growing data object for station AS_KIT at sampling height 30 m via the supported ICOS Carbon Portal API, drop flagged/null CO2 values, and provide timestamped co2 values.

#### Scenario: New ICOS version available
- **WHEN** ICOS has published a newer growing data object for the same spec/station/height
- **THEN** the newest object (by acquisition end time) is used and older versions are ignored

#### Scenario: ICOS access unavailable
- **WHEN** ICOS metadata or data access fails (authentication missing/expired, data licence not accepted, service unreachable)
- **THEN** the pipeline exits non-zero with a clear, human-readable error before writing any database rows

### Requirement: ICOS attribution and citation

The pipeline SHALL record the exact ICOS citation (the `citationString` including the PID URL from the data object's metadata) for every ICOS data object it fetches, write it to a citation file next to the outputs on each run, and log it. Redistribution-ready attribution ("ICOS RI, licensed under CC BY 4.0", landing-page link, licence link) SHALL be derivable from the recorded citation.

#### Scenario: Citation captured per fetch
- **WHEN** the pipeline fetches an ICOS data object
- **THEN** the citation file contains that object's exact citation string and PID URL, and the run log shows the citation

### Requirement: ICOS meteo fallback

The pipeline SHALL, only when DWD provides no rows within the last 2 days, fetch the ICOS NRT meteo growing object for station AS_KIT at sampling height 2.5 m and map AT/RH/AP to temp/hum/pres with `light=0`.

#### Scenario: DWD outage
- **WHEN** the DWD download yields no rows newer than 2 days
- **THEN** the ICOS meteo object supplies temp/hum/pres and light is recorded as 0

### Requirement: Offline CSV mode

The pipeline SHALL support an offline mode that performs all fetching, merging and format conversion but writes timestamped CSV files instead of connecting to MySQL, for testing without the `cz` database.

#### Scenario: CSV run without database
- **WHEN** the pipeline runs in offline mode on a machine without access to the `cz` database
- **THEN** it writes the merged reference dataset (and the CO2 extract) as CSV files and exits 0 without attempting any database connection

### Requirement: Database connection configuration

The pipeline SHALL obtain the MySQL connection string from the environment or a local configuration file rather than a hard-coded credential string in the script.

#### Scenario: Missing configuration
- **WHEN** the pipeline runs in database mode without a configured connection string
- **THEN** it exits non-zero with a message naming the missing configuration, without partial writes

### Requirement: Station-qualified SensorCity air channels

The `sensors` table SHALL carry four additional NULLable FLOAT columns:
`temp_006` and `hum_006` (SensorCity station 006 Lützenhardtstraße,
station key SC-SW-006) and `temp_116` and `hum_116` (SensorCity station
116 Breite Straße, station key SC-N-116), in the same units as the
existing reference channels (°C and %RH). On every run the pipeline SHALL
populate these columns on the reference rows (id 0) with the hourly means
of the stations' air temperature and relative humidity, merged onto the
reference frame by hour with missing hours left NULL — without changing
the per-id neighbour rows (ids 9 and 10), which continue to be written as
before.

#### Scenario: Successful merge onto reference rows

- **WHEN** the pipeline runs and the SensorCity air fetch for stations 006
  and 116 returns records
- **THEN** the appended reference rows (id 0) carry `temp_006`/`hum_006`
  and `temp_116`/`hum_116` for the hours covered by each station, and
  hours without a station sample store NULL in that station's columns

#### Scenario: Station fetch failure

- **WHEN** the SensorCity air fetch for one of the two stations fails or
  returns no records
- **THEN** that station's columns are NULL on the affected reference rows,
  a warning is logged, and the rest of the pipeline (including the other
  station and the neighbour rows) continues normally

#### Scenario: Fresh database

- **WHEN** `create_tables.py` bootstraps a new database
- **THEN** the `sensors` table includes `temp_006`, `hum_006`, `temp_116`
  and `hum_116`

#### Scenario: Existing database migration

- **WHEN** the one-off migration script runs on a database created before
  this change
- **THEN** the four columns exist as NULLable FLOAT columns, `sensor_sources`
  maps reference sensor id 0's `temp_006`/`hum_006` to station key
  SC-SW-006 and `temp_116`/`hum_116` to station key SC-N-116 with units,
  and re-running the script changes nothing

### Requirement: Schema alteration before table access

The pipeline SHALL perform all schema alterations on the `sensors` table
(idempotent `ALTER TABLE … ADD COLUMN` for any missing column) only after
any still-running older pipeline instance has been terminated and before
the pipeline opens any connection, read, or write that locks the `sensors`
table, so the alteration can never fail on a table lock held by the
pipeline itself.

#### Scenario: Alteration ordering on a normal run

- **WHEN** the pipeline starts after killing an older instance and the
  `sensors` table lacks one of the pipeline's columns
- **THEN** the column is added before the pipeline issues its first read
  or write against `sensors`, and the append succeeds without a lock
  timeout on the alteration

#### Scenario: Concurrent instance

- **WHEN** an older pipeline instance is still running when a new one starts
- **THEN** the old instance is terminated first and no schema alteration is
  attempted while the old instance may still hold locks on `sensors`

### Requirement: SensorCity neighbour ingestion

The pipeline SHALL fetch the SensorCity neighbour stations SC-N-002 (soil
profile, layer 4), SC-N-116 (air, layer 2) and SC-SW-006 (air, layer 2) on
each run and append their hourly values to the `sensors` table under their
own sensor ids (8 = SC-N-002, 9 = SC-N-116, 10 = SC-SW-006). The
unqualified shared channels (`temp`, `hum`, `pres`, `solar`, `soilMoist`,
`soilTemp`) SHALL NOT be merged into the reference sensor rows — only the
station-qualified channels defined in the "Station-qualified SensorCity
air channels" requirement are merged onto the reference rows. Soil
sentinel values at uninstalled depths SHALL be treated as no-data, and the
soil channels SHALL use the deepest installed probe depth. A failed fetch
SHALL log and continue without writing rows for that station.

#### Scenario: Successful fetch

- **WHEN** the pipeline runs and the devices deliver archive rows newer
  than their latest stored rows
- **THEN** hourly rows (id 8 with `soilMoist`/`soilTemp`, ids 9/10 with
  `temp`/`hum`/`pres`/`solar`) are appended date-ascending with no
  duplicates

#### Scenario: Fetch failure

- **WHEN** one station's query fails or returns no new data
- **THEN** the run logs the failure, writes nothing for that sensor id, and
  the other station (and the rest of the pipeline) continues normally

#### Scenario: Shared channels stay unqualified

- **WHEN** the pipeline merges SensorCity air data onto the reference rows
- **THEN** the unqualified `temp`/`hum` columns of reference rows keep
  their DWD (or ICOS fallback) sources and are never overwritten with
  SensorCity values

### Requirement: Soil and solar columns

The `sensors` table SHALL carry three additional NULLable FLOAT columns:
`solar` (SensorCity global radiation, W/m²), `soilMoist` (volumetric soil
moisture, %) and `soilTemp` (soil temperature, °C). The DWD-derived `light`
column SHALL NOT receive SensorCity solar values — percent sunshine and
W/m² are different quantities. New columns SHALL be added idempotently by
the pipeline before it opens or locks the `sensors` table (see the "Schema
alteration before table access" requirement) and by the migration script.

#### Scenario: Fresh database

- **WHEN** `create_tables.py` bootstraps a new database
- **THEN** the `sensors` table includes `solar`, `soilMoist`, `soilTemp`

#### Scenario: Existing database

- **WHEN** the pipeline appends to a `sensors` table created before this
  change
- **THEN** missing columns are added with `ALTER TABLE … ADD COLUMN … FLOAT`
  before any pipeline read or write against the table, without disturbing
  existing rows

### Requirement: Registry for the neighbour sensors

The sensor registry SHALL include the three stations: `sensor_locations`
rows (sensor_id 8, name `SensorCity 002 Hohenzollernstraße`; sensor_id 9,
name `SensorCity 116 Breite Straße`; sensor_id 10, name
`SensorCity 006 Lützenhardtstraße`; all kind `sensorcity`) and
`sensor_sources` rows mapping each channel to its `stations.station_key`
(SC-N-002, SC-N-116, SC-SW-006) with units. `create_tables.py` seeds and
the live-database migration SHALL produce the same registry state, and both
SHALL be idempotent.

#### Scenario: Migration on the live database

- **WHEN** `migrate_add_sensorcity_neighbours.py` runs on a database that
  already has the sensors table and the stations rows
- **THEN** the three columns exist, sensor_locations contains ids 8, 9 and
  10, sensor_sources maps their channels to the station keys, and re-running
  the script changes nothing (row counts identical)

#### Scenario: Chart compatibility

- **WHEN** the dashboard lists active sensors
- **THEN** ids 8 and 9 appear with their names and channel lists, and
  existing sensors are unchanged

### Requirement: Wiese node srv2.php ingestion

The pipeline SHALL fetch `https://critical-sensors.de/srv2.php?days=<N>` on
each run (N bounded, default 35, overridable via `REFSENSORS_SRV2_DAYS`),
filter the JSON rows to sensor id 2, aggregate the ~20-minute samples to
hourly means of `temp`, `hum`, `co2`, `light`, `bat` and `rssi`, and append
them to the `sensors` table under sensor id 2 with the same gap-tolerant
per-id date-set dedup used for the SensorCity neighbour rows.

#### Scenario: Successful run

- **WHEN** the pipeline runs and srv2.php returns id-2 rows newer than the
  stored hours
- **THEN** hourly rows (id 2) are appended date-ascending with no duplicate
  hours

#### Scenario: Fetch window is bounded

- **WHEN** the pipeline runs
- **THEN** only the last N days are requested, so the request size stays
  bounded; older rows are never re-fetched

### Requirement: Wiese node fetch failure isolation

A failed srv2.php fetch (unreachable, HTTP error, unparsable JSON) SHALL log
the failure and write nothing for id 2, while the rest of the pipeline
(reference rows, SensorCity neighbours, virtual composition) continues
normally.

#### Scenario: Fetch failure

- **WHEN** srv2.php is unreachable or returns unparsable data
- **THEN** the run logs the failure, writes nothing for id 2, and the rest
  of the pipeline continues normally

### Requirement: Wiese node time base

The pipeline SHALL use the srv2.php timestamps unchanged — they are already
in the stored CET convention — and SHALL NOT apply the +1 h shift used for
the UTC-sourced SensorCity feeds.

#### Scenario: No timezone shift

- **WHEN** id-2 rows are appended
- **THEN** each stored date equals the feed's timestamp for that sample
  hour

### Requirement: RGB decode and light gate

The pipeline SHALL decode the node's `rfu` field as a 24-bit packed RGB
integer — `int(round(float(rfu))) & 0xFFFFFF`, byte order 0xRRGGBB (r = high
byte) — and SHALL store the decoded channels only for samples with
`light > 0`: dark samples contribute no r/g/b to the hour's aggregate (their
`temp`/`hum`/`co2`/`light` still do), an hour whose samples are all dark
stores NULL in `r`, `g` and `b`, and the packed value itself SHALL NOT be
written to the `rfu` column.

#### Scenario: Dark rows are gated

- **WHEN** a node sample has `light == 0` (night, white-LED self-illumination
  or a status-LED blink)
- **THEN** its r/g/b values are excluded from the hour's aggregate

#### Scenario: Fully dark hour

- **WHEN** every sample of an hour has `light == 0`
- **THEN** the stored hour has NULL in `r`, `g` and `b`

#### Scenario: Packed value not stored

- **WHEN** id-2 rows are written
- **THEN** the `rfu` column stays NULL for those rows (the decode is
  lossless and a mean over packed values would be meaningless)

### Requirement: RGB columns on the sensors table

The `sensors` table SHALL carry three additional NULLable FLOAT columns `r`,
`g` and `b` (0-255 per channel, NULL = gated or no data), included in
`create_tables.py`, added to the pipeline's idempotent pre-connect schema
upgrade list, and created on existing databases by a one-off idempotent
migration script.

#### Scenario: Fresh database

- **WHEN** `create_tables.py` bootstraps a new database
- **THEN** the `sensors` table includes `r`, `g` and `b`

#### Scenario: Existing database migration

- **WHEN** the migration script runs on a database created before this
  change
- **THEN** the three columns exist as NULLable FLOAT columns and a second
  run changes nothing

### Requirement: Wiese-Verbund RGB sources

`sensor_sources` SHALL map the virtual composite id 7 (Wiese-Verbund)
channels `r`, `g` and `b` to sensor id 2 with `mean` aggregation so the
composite carries the light colour once the node delivers; both the
`create_tables.py` seeds and the migration script register them, and the
id-2 registry row is updated there (extended variables list,
`since` = 2026-09-19).

#### Scenario: Composite picks up the node

- **WHEN** the virtual composition runs after id-2 rows were written
- **THEN** id 7 carries `co2`, `r`, `g` and `b` averaged from its sensor
  sources (NULL sources ignored), and dark hours stay NULL on id 7
