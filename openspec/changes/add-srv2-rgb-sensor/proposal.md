# Proposal

## Why

The meadow has its first real on-site IoT node: it reports on
critical-sensors.de `srv2.php` as sensor id 2 (CO2, temp, hum, light, RSSI,
battery and — new for the pipeline — a packed 24-bit RGB light-colour value in
`rfu`). refSensors.py does not ingest this feed yet, so the dashboard has no
wiese node data and the virtual composite id 7 (Wiese-Verbund, co2 sourced
from sensor id 2) stays empty. The node's colour sensor has two integrated
white LEDs that cannot be switched off, so rgb readings without ambient light
are self-illumination, not sky colour — the ingestion must gate them.

## What Changes

- refSensors.py fetches `srv2.php?days=N` each run, filters sensor id 2,
  decodes `rfu` (float → 24-bit int → r/g/b bytes, 0xRRGGBB) and appends
  hourly rows to the `sensors` table under wiese sensor id 2 (the reserved
  "Wiese2" slot) with the same gap-tolerant per-id dedup as the SensorCity
  neighbour rows.
- r/g/b values are gated: hours (and source rows) with `light == 0` store
  NULL rgb — the white-LED self-illumination and the node's status-LED
  blinks both carry light == 0, so one gate removes both.
- New NULLable FLOAT columns `r`, `g`, `b` on the `sensors` table
  (create_tables.py + auto-ALTER + one-off migration script for the live DB).
- Sensor id 7 (Wiese-Verbund) gains `r`/`g`/`b` sourced from sensor id 2, so
  the composite carries the light colour as soon as the node delivers;
  the existing co2 source (id 2) starts flowing automatically.
- Registry (sensor_locations) row for id 2 updated: variables list extended,
  `since` = 2026-09-19 (first feed data).
- srv2.php timestamps are already in the stored CET convention — no timezone
  shift is applied (unlike the SensorCity UTC epoch-ms sources).
- Dashboard wiring: `api.php` exposes the four wiese channels (light from
  sensor 2, r/g/b from the composite id 7) and the www Licht & Lichtfarbe
  card renders the measured intensity (light 0–255 → 0–100 % linear) and
  colour instead of its synthetic demo data.
- Demo fallback: when the newest real value is older than 31 days (or
  absent — feed outage), the card renders the previous synthetic demo data
  instead, still labeled as dummy.

Out of scope: ingestion of the other srv2 ids (3, 11).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `reference-sensor-pipeline`: new requirement for wiese node (srv2.php)
  ingestion — fetch, rfu→rgb decode, light gate, hourly rows under id 2 —
  plus the r/g/b columns requirement (fresh database + live migration).
- `dashboard-web`: the Licht & Lichtfarbe card renders real measurements
  (api channel whitelist gains the four wiese channels; card converts light
  to 0–100 % and convolutes rgb) with a demo fallback when the feed is
  stale for more than a month.

## Impact

- `datatools/refSensors.py` — new fetch/decode/aggregate block, auto-ALTER
  list, to_sql dtypes, offline CSV output, new write block before the
  virtual composition.
- `datatools/create_tables.py` — `sensors` DDL gains r/g/b; id-2 and id-7
  registry seeds updated; id-7 r/g/b source seeds added.
- `datatools/migrate_add_rgb_sensor.py` (new) — idempotent live-DB migration
  (columns + id-7 sources + id-2 registry update).
- Pipeline database `wiese`: id-2 rows appear; virtual id-7 composition
  picks up co2/r/g/b from id 2. The old live site (`cz` DB, srv.php) is
  untouched; srv2.php itself is read-only for us.
- Dashboard: `orchard/public/php/api.php` (channel whitelist + columns) and
  `www/` (`api.ts` channel list, `DataPane.vue`, `LightCard.vue`).
- Python >= 3.12 constraint unchanged; no new dependencies (requests is
  already required).
