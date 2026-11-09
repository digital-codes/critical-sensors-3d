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

### Requirement: SensorCity neighbour ingestion

The pipeline SHALL fetch the SensorCity neighbour stations SC-N-002 (soil
profile, layer 4), SC-N-116 (air, layer 2) and SC-SW-006 (air, layer 2) on
each run and append their hourly values to the `sensors` table under their
own sensor ids (8 = SC-N-002, 9 = SC-N-116, 10 = SC-SW-006), never merged
into the reference sensor rows. Soil sentinel values at uninstalled depths
SHALL be treated as no-data, and the soil channels SHALL use the deepest
installed probe depth. A failed fetch SHALL log and continue without
writing rows for that station.

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

### Requirement: Soil and solar columns

The `sensors` table SHALL carry three additional NULLable FLOAT columns:
`solar` (SensorCity global radiation, W/m²), `soilMoist` (volumetric soil
moisture, %) and `soilTemp` (soil temperature, °C). The DWD-derived `light`
column SHALL NOT receive SensorCity solar values — percent sunshine and
W/m² are different quantities. New columns SHALL be added idempotently at
write time and by the migration script.

#### Scenario: Fresh database

- **WHEN** `create_tables.py` bootstraps a new database
- **THEN** the `sensors` table includes `solar`, `soilMoist`, `soilTemp`

#### Scenario: Existing database

- **WHEN** the pipeline appends to a `sensors` table created before this
  change
- **THEN** missing columns are added with `ALTER TABLE … ADD COLUMN … FLOAT`
  before the append, without disturbing existing rows

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
