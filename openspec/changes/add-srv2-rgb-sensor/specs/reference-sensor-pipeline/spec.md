# reference-sensor-pipeline Delta

## ADDED Requirements

### Requirement: Wiese node srv2.php ingestion

The pipeline SHALL fetch `https://critical-sensors.de/srv2.php?days=<N>` on
each run (N bounded, default 35, overridable via `REFSENSORS_SRV2_DAYS`),
filter the JSON rows to sensor id 2, aggregate the ~20-minute samples to
hourly means of `temp`, `hum`, `co2`, `light`, `bat` and `rssi`, and append
them to the `sensors` table under sensor id 2 with the same gap-tolerant
per-id date-set dedup used for the SensorCity neighbour rows. A failed fetch
SHALL log and continue without writing rows for id 2.

#### Scenario: Successful run

- **WHEN** the pipeline runs and srv2.php returns id-2 rows newer than the
  stored hours
- **THEN** hourly rows (id 2) are appended date-ascending with no duplicate
  hours

#### Scenario: Fetch window is bounded

- **WHEN** the pipeline runs
- **THEN** only the last N days are requested, so the request size stays
  bounded; older rows are never re-fetched

#### Scenario: Fetch failure

- **WHEN** srv2.php is unreachable or returns unparsable data
- **THEN** the run logs the failure, writes nothing for id 2, and the rest
  of the pipeline (reference rows, SensorCity neighbours, virtual
  composition) continues normally

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
