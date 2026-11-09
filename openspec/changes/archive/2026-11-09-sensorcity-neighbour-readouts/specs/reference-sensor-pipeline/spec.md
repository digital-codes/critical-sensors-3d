# Spec Delta — reference-sensor-pipeline

## ADDED Requirements

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
