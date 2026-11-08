# Design — sensorcity-neighbour-readouts

## Context

`refSensors.py` appends hourly rows to the MariaDB `sensors` table: id 0 is
the virtual Referenz (DWD weather + ICOS CO2 + SensorCity mast wind/rain
mapped into reference channels), ids 1–5 are the orchard's own IoT sensors
(co2/rssi/bat via the co2 path), id 7 a virtual composite. SensorCity
stations are already integrated twice, both times as *channels of id 0*
(`mastWind` from the 008 wind parser, `mastRain` from the Grünwettersbach
gauge). The two requested stations differ in kind: they are
**standalone environmental stations** whose readings should be charted as
their own sensors, not folded into the reference composition.

Existing registry state (no changes needed): `stations` rows `SC-N-002` /
`SC-N-116` / `SC-SW-006` with coordinates,
`datatools/sensorcity_stations.json` with all device rows;
`sensor_locations` ends at id 7, so the new ids are 8 (SC-N-002), 9
(SC-N-116) and 10 (SC-SW-006).

## Goals / Non-Goals

- Goals: hourly readout of both stations into `sensors` under ids 8/9;
  three new columns; registry rows; idempotent live-DB migration; docs.
- Non-Goals: folding the stations into Referenz (id 0) or Wiese-Verbund
  (id 7); backfill from archive layers; dashboard chart changes; wind/rain
  from these stations (neither has a rain gauge or wind mast).

## Decisions

### Own sensor ids, not reference channels

SensorCity street readings are their own measurement points. Rows go in
under ids 8/9 with the same NULL placeholders for non-physical channels the
real IoT rows use (`rfu/rssi/bat/...` NULL — id 8/9 are not battery-powered
orchard nodes, so no synthetic bat=100). The composer discovers its sources
from `sensor_locations`, which id 8/9 do not join unless later added —
composition stays untouched by construction.

### Three new columns, `light` stays DWD-only

- SC-N-116 air and SC-SW-006 air: temp/RH/pressure map 1:1 onto
  `temp`/`hum`/`pres` (°C/%RH/hPa, same semantics as DWD).
  `sonnenstrahlung` is global radiation in W/m² — a DIFFERENT quantity from
  DWD `light` (percent of possible sunshine, SD_SO/60·100). Mixing units in
  one column would corrupt the chart, so solar gets its own `solar` FLOAT
  column, populated for ids 9 and 10; the two stations stay separate sensor
  rows, so no cross-station mixing arises.
- SC-N-002 soil: the archive layer offers 8 depth levels with sentinels
  (-5 / -327.68) at uninstalled depths. Rather than 16 depth columns, two
  representative channels `soilMoist` (%vol) and `soilTemp` (°C) at the
  **deepest installed probe depth** (root-zone signal, least surface
  noise); the depth used is recorded in `sensor_sources.note` at apply time
  after checking which depths the station actually reports. Adding more
  depths later = more columns + sensor_sources rows, no migration rethink.

### Column wiring follows the measured-source rule

The skill's five-places rule (fetch block, `ref` merge with `how="left"`,
NULL fallback, idempotent ALTER tuple, `to_sql` dtype dict) is applied to
`solar`, `soilMoist`, `soilTemp`. The two new fetch blocks follow the
mastWind/mastRain pattern: layer query with `where=device_id='…' AND
measured_at > <latest>` (SQL `timestamp` literals, UTC), `pd.to_datetime`
before the +1 h CET shift, hourly mean (`soil` probes report ~1 h cadence,
air ~10 min), date-ascending dedupe on `measured_at`.

### Migration script mirrors create_tables' execution model

`datatools/migrate_add_sensorcity_neighbours.py`:
`ALTER TABLE sensors ADD COLUMN <col> FLOAT` (checked against
`information_schema`/inspect first), then `INSERT IGNORE` rows into
`sensor_locations` (ids 8/9/10) and `sensor_sources` (ten rows: id 8 →
soilMoist/soilTemp → SC-N-002; ids 9/10 → temp/hum/pres/solar → SC-N-116 /
SC-SW-006, with units in the `unit` column and the chosen soil depth in
`note`). Each statement runs in its own transaction (MySQL auto-commits
DDL — the one-big-transaction pitfall from create_tables), and it prints
per-table row counts before/after so the user can paste the output back as
verification. Same `REFSENSORS_DB_URL`/`dburl.txt` resolution as
create_tables.

### Seeds keep fresh databases identical

SEED_LOCATIONS gains ids 8/9 (kind `sensorcity`, coordinates from the
stations rows), SEED_SOURCES gains the six mapping rows, DDL_SENSORS gains
the three columns — a fresh `create_tables.py` run then equals
old-db + migration. Units: `solar` W/m², `soilMoist` %vol, `soilTemp` °C,
`temp` °C, `hum` %RH, `pres` hPa.

## Risks / Trade-offs

- Two more external HTTP dependencies in the hourly run; failures are
  logged and isolated (existing pattern), never blocking the DWD/ICOS path.
- Deepest-installed-depth choice may be revised once live data shows which
  depths the 002 probe really reports; changing it later touches only the
  fetch filter + sensor_sources note.
- `solar` stays NULL for all other sensors (column sparsity is consistent
  with icosTemp/mastWind precedent).
- No explicit backfill: the first run wrote the archives' rolling windows
  (~2 weeks air, ~80 days soil) as a natural side effect; older history
  stays fetchable later without schema changes.

## Migration Plan

Live DB: run `migrate_add_sensorcity_neighbours.py` once (idempotent;
safe to re-run), then deploy the refSensors update. Order matters only in
that the first post-deploy run needs the columns — the in-run ALTER would
cover it anyway.

## Open Questions

None blocking; the soil depth is confirmed against live data during apply.
