# dashboard-web Delta

## MODIFIED Requirements

### Requirement: Data pane cards

The data pane SHALL show seven cards, in this order: CO₂, Lufttemperatur,
Luftfeuchte, Solar, Wind, Boden, Licht & Lichtfarbe. The first six SHALL
render real measurements fetched from the PHP sensor endpoint; each shows a
curve over the data range, a red cursor at the global day and the value at
that day (or "—" where no data exists). The Licht & Lichtfarbe card's
rendering is specified in the Licht card requirements. Card subtitles name
the measuring source delivered by the endpoint.

#### Scenario: Cursor follows the day

- **WHEN** the global day changes to 105
- **THEN** every card's cursor moves to mid-April and the value readouts
  show that day's measured values (the dummy card: its synthetic values)

#### Scenario: Real data with sources

- **WHEN** the page loads with the pipeline database populated
- **THEN** the six real cards render curves from the endpoint (CO₂/temp/hum/
  wind from the Referenz sensor, solar from SensorCity 116, soil from
  SensorCity 002) and each card names its source station

## ADDED Requirements

### Requirement: Licht card single colour indicator

The Licht & Lichtfarbe card SHALL render ONE chart only: bars above the
x-axis whose height is the light intensity and whose colour is the light
colour at full saturation — each day's/hour's rgb triplet scaled to its
brightest channel (hue-preserving; a missing triplet stays black). There
SHALL be no separate colour bar below the chart and never the three
channels as separate strips; the demo fallback follows the same
single-chart layout.

#### Scenario: No second indicator

- **WHEN** the card renders in measured or demo mode
- **THEN** the chart bars carry the colour themselves and no colour-bar
  strip exists below the ticks

### Requirement: Wiese channels on the sensor API endpoint

The sensor data endpoint's channel whitelist SHALL expose four wiese
channels: `wieseLight` (sensor 2, column `light`, unit label `0–255`) and
`wieseR`, `wieseG`, `wieseB` (sensor 7 = Wiese-Verbund composite, columns
`r`/`g`/`b`, unit label `0–255`). They SHALL behave exactly like the
existing channels (same validation, aggregation, daily/hourly resolution
and error handling).

#### Scenario: Wiese channels return series

- **WHEN** the endpoint is called with `channels=wieseLight,wieseR` for a
  range with measured data
- **THEN** it answers 200 with per-day aggregates from sensor 2's light
  column and the composite's r column, with source/unit metadata

### Requirement: Licht card renders real measurements

When the wiese feed has fresh data, the Licht & Lichtfarbe card SHALL render
measured values instead of the synthetic demo curves: intensity via a
monotonic non-linear characteristic of the measured light — logarithmic,
`100 × ln(1 + light) / ln(256)` (0 → 0 %, 255 → 100 %). The day-cursor
readout SHALL show the mapped intensity and follow the existing value-at-day
semantics ("—" where no measurement exists).

#### Scenario: Measured days on the year axis

- **WHEN** the card renders with fresh feed data in the year view
- **THEN** bars appear only for measured days, positioned at their
  day-of-year on the unchanged 365-day axis, with height = mapped
  intensity and colour = the day's light colour at full saturation;
  contiguous measured days SHALL tile edge-to-edge without gaps (each bar
  spans its full day slot) — gaps appear only where data is missing

#### Scenario: Log characteristic spreads the operating range

- **WHEN** a day's mean light is 30 (raw 0–255; a bright measured day at
  the shaded sensor)
- **THEN** the plotted intensity is ≈ 62 %, not the linear 12 %, while 0
  still maps to 0 % and 255 to 100 %

#### Scenario: Seven-day zoom uses hourly data

- **WHEN** the axis zoom is active
- **THEN** the card plots hourly light values, coloured with the matching
  hourly rgb; hours with light but no rgb (all-dark hours) render black

### Requirement: Licht card demo fallback on stale feed

When the newest real value of the wiese light channel is older than 31 days
(or absent entirely), the Licht & Lichtfarbe card SHALL render the previous
synthetic demo data instead of real values and SHALL keep its dummy
labelling. With fresh data the dummy labelling SHALL be dropped.

#### Scenario: Feed stale for more than a month

- **WHEN** the API reports no wiese light value within the last 31 days
- **THEN** the card shows the synthetic demo curves as before and stays
  labeled as dummy data

#### Scenario: Feed returns after the outage

- **WHEN** a value newer than 31 days arrives again
- **THEN** the card switches back to the measured rendering without the
  dummy label
