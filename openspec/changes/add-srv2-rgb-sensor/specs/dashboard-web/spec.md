# dashboard-web Delta

## ADDED Requirements

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
measured values instead of the synthetic demo curves: intensity as the
linear conversion of the measured light (0–255 → 0–100 %) and plotted
colour as the RGB value convoluted with that intensity (ONE combined colour
bar — never three separate strips). The day-cursor readout SHALL follow the
existing value-at-day semantics ("—" where no measurement exists).

#### Scenario: Measured days on the year axis

- **WHEN** the card renders with fresh feed data in the year view
- **THEN** bars appear only for measured days, positioned at their
  day-of-year on the unchanged 365-day axis, with height = converted
  intensity and colour = the day's rgb × intensity

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
