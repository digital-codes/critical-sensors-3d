# Design

## Context

refSensors.py already ingests three kinds of external feeds (DWD/ICOS hourly
files, SensorCity FeatureServer JSON for the mast + neighbours). The wiese
node feed (`srv2.php`) is a fourth: a plain JSON list of string-valued rows,
all sensors in one response, ~20 min cadence, timestamps already in the
stored CET convention. Analysis of the id-2 feed (datatools/analyze_srv2.py,
936 rows Sep 19 – Nov 12 2026) established the decode and the gate:

- `rfu` arrives as a plain integer string, always < 2^24 → the float→int
  conversion is lossless.
- Byte order 0xRRGGBB (r = high byte): night rows read r > 0 with b == 0
  (red light-pollution signature) and the b channel rises only in the
  dusk "blue hour" rows — switchable via one constant if the physical LED
  colour ever disagrees.
- `light` is 8-bit (0–255; no value above 255 in 936 id-2 or 3507 id-11
  rows) and is NOT contaminated by the node's two always-on white LEDs —
  all LED-reflection and status-blink rows read light == 0 — so
  `light > 0` is a clean gate signal.
- Known junk the gate removes: night rgb ≈ (11, 7, 0) LED reflection,
  124 r == 45 status blinks, two single-row channel spikes.

## Goals / Non-Goals

- Goals: id-2 rows in `wiese.sensors` on the same hourly/CET convention as
  every other sensor; decoded r/g/b under the light gate; id-7 composite
  carries co2/r/g/b from the node; live-DB migration path.
- Non-Goals: dashboard/api.php wiring of the Licht & Lichtfarbe card;
  ingesting srv2 ids 3/11; changing the `light` unit semantics (the node's
  8-bit raw stays as delivered, per-id row model — no mixing into reference
  rows); baseline subtraction of the LED contribution.

## Decisions

- **Wiese DB sensor id 2** (the reserved "Wiese2" iot slot; srv2.php's own
  id happens to match). The registry reserved ids 1/2 for the orchard's own
  nodes and sensor_sources already maps id 7's co2 to source id 2 — the
  composition starts flowing without further wiring. Alternative rejected:
  a new id (12+) — it would leave the reserved slot empty and need a new
  sensor_sources entry for the same purpose.
- **Hourly means, same shape as the SensorCity neighbours**: temp/hum/co2/
  light/bat/rssi averaged per hour; r/g/b averaged per hour over lit
  samples only (gated samples are set to NaN before the resample, so an
  all-dark hour yields NaN → NULL). Node protocol counters (count/rep/pkt/
  req/raw/rfu) are not written — the oldwww-style counters carry no meaning
  after aggregation, and the packed rfu mean would be a lie (alternatives:
  last/max — both arbitrary; the feed stays re-fetchable as provenance).
- **No timezone shift**: srv2.php timestamps are already CET-stored.
  Evidence: the 06:56 (Sep 26) sample has light 7 — under a CEST reading
  that is ~20 min before sunrise, impossible for ambient light; the hourly
  light peak (hour 13) lands on solar noon (~14:06 CEST) only when read as
  CET+1. This differs from the SensorCity sources (+1 h shift at merge
  end). Residual risk noted below.
- **Gate is `light > 0`, not a time window**: all blink/LED-reflection rows
  have light == 0, so one data-driven gate removes them all; every kept row
  also has the sun above the horizon (0 violations in the analysed data),
  so no solar-elevation math is needed in the pipeline.
- **Fetch window 35 days** (SC_WINDOW_DAYS + margin), one-off backfill via
  `REFSENSORS_SRV2_DAYS=400` (the feed serves the full history; 936 rows,
  ~1.2 MB). Repeat runs only re-fetch the bounded window; the per-id
  date-set dedup (copied from the scNeighbours write block) makes reruns
  idempotent.
- **Columns `r`/`g`/`b` FLOAT NULL** (hourly means are fractional; every
  other measurement channel is FLOAT too) added to: create_tables DDL, the
  refSensors auto-ALTER list (runs after the old instance is killed, before
  any table access — existing "Schema alteration before table access"
  requirement covers the ordering), and a one-off migration script.
- **id-7 sources: r/g/b from sensor 2 only, NOT light**: adding the node's
  raw 8-bit light as an id-7 `light` source would mix units with the
  Wiesenstation's planned klx source (id 6); the registry's aspirational
  `(7, rgb, …)` row has no matching column and stays untouched (composition
  already tolerates unknown variables with a logged skip). The dashboard
  can read id 2's light directly when the Licht card gets wired.

## Dashboard wiring (amendment 2026-11-12)

- **Channel mapping**: `api.php` gains `wieseLight` (sensor **2**, column
  `light`) and `wieseR/G/B` (sensor **7**, columns `r/g/b`). The split is
  deliberate: id 7's `light` stays NULL by design (sourced only from the
  unbuilt klx Wiesenstation), so the card takes intensity from the node
  itself while the colour flows through the composite (future nodes are
  averaged into it automatically). `$CHANNELS` remains the single switch
  point.
- **Intensity conversion (amended: log characteristic)**: the shaded
  sensor's real daytime values (≤ 10–30 of 255) mapped linearly to ≤ 12 %
  and rendered near-invisible bars, so the card uses a monotonic
  non-linear characteristic: `pct = 100 × ln(1 + light) / ln(256)` —
  0 → 0 %, 255 → 100 %, 30 → ≈ 62 %, today's 2.14 → ≈ 21 %. Readout and
  bar colour both use the mapped value (visual consistency); the raw
  0–255 values stay untouched in DB and api (unit label `0–255`).
  Alternatives: sqrt/gamma 0.5 (30 → 34 %, weaker spread) or a fixed
  winter/summer gain (invented normalisation) — log chosen per user
  decision. One helper (`lightToPct`) is the single conversion point.
- **Freshness / demo fallback**: the card derives freshness from the
  UNPINNED daily response (`range.to` = absolute newest value date — the
  hourly call pins its window, so only the daily one is authoritative). No
  api schema change needed. `range.to >= today − 31 days` → real rendering;
  otherwise the previous synthetic curves (current behaviour, dummy label
  kept). 31 days ≈ "more than a month"; constant in LightCard.
- **Year view positioning**: bars sit at their day-of-year on the unchanged
  365-day axis (cursor/season context preserved); days without measurements
  simply have no bar. Colour per day = `convoluted([r,g,b], intensity)`.
  (Amended: bars span their FULL day slot — x = day start, w = W/365, no
  shrink factor and no centre offset — so contiguous measured days tile
  into a continuous band; real data gaps, e.g. the Oct 5–Nov 11 outage,
  stay as gaps.)
- **Zoom view**: the existing hourly fetch (channel list extended) serves
  light per hour; dark hours have light rows but no rgb rows (NOT NULL
  filter), so their bars render black — the physically correct colour.
- **Bars carry the colour (amended: single indicator)**: the user removed
  the second indicator — no separate colour-bar strip. The chart bars
  themselves are the colour indicator: fill = the day's/hour's rgb triplet
  scaled to full saturation (`f = 255 / max(r,g,b,1)`, hue-preserving —
  the raw measured values are too dark to read as colour), height = the
  log-mapped intensity. `convoluted()` stays ONLY in the synthetic
  fallback bars (bright by design); `barGradient` and the `.colorbar` div
  are removed. Missing triplets stay black.
- **Fresh-data labelling**: the header tag `Wiese (fake/geplant)` shows only
  in fallback mode; with fresh data the card is labelled `Wiese` like the
  real cards. Mobile description updated accordingly.

## Risks / Trade-offs

- [srv2.php timestamps might not be CET-fixed] → the evidence above is
  strong but indirect; verify on the first live run by comparing a midday
  light ramp against solar noon (~13:06 stored-convention time) before
  trusting the co2/rgb diurnal placement; a wrong assumption shifts the
  whole id-2 timeline by 1 h and is fixable only by re-ingesting.
- [The node reboots reset count/pkt and can emit boot garbage (the
  08:49 (45, 8, 12) row today)] → rows still carry plausible temp/hum and
  the gate keeps light == 0 boot rows out of rgb; no special handling.
- [srv2.php shape change (new keys, float-formatted rfu)] → the decoder
  accepts any numeric string via `float()`; unknown extra keys are ignored;
  a missing `rfu`/`light` key is treated as 0/absent → gated.
- [Feed outage > 35 days] → older rows are never re-fetched, same accepted
  trade-off as the SensorCity neighbours; a manual
  `REFSENSORS_SRV2_DAYS=...` run backfills.

## Migration Plan

1. Deploy the changed datatools (refSensors.py, create_tables.py,
   migrate_add_rgb_sensor.py).
2. Run `migrate_add_rgb_sensor.py` once against the live DB (idempotent:
   inspect-checked ALTERs, INSERT IGNORE sources, UPDATE registry rows).
   (refSensors' own pre-connect auto-ALTER would add the columns anyway;
   the script additionally seeds id-7 sources and updates the id-2/id-7
   registry rows.)
3. First ingestion run — optionally `REFSENSORS_SRV2_DAYS=400` once to
   backfill the September/October history, then let the cron use the
   default window. Verify from a DB readback (row counts per day, gated
   hours NULL, id-7 composition).
Rollback: the columns and rows are additive; `DELETE FROM sensors WHERE
id = 2` (and the id-7 rows composed from it) plus dropping the three
columns restores the previous state.

## Open Questions

(none — the id-2 mapping, byte order and gate were settled in the analysis
session; byte order stays switchable in one constant if the user's physical
LED check ever disagrees)
