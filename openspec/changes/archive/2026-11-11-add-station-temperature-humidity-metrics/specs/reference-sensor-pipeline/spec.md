# Spec Delta — reference-sensor-pipeline

## ADDED Requirements

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

## MODIFIED Requirements

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
