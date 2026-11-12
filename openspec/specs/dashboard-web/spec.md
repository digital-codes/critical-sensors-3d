# dashboard-web Specification

## Purpose
All-in-one website, fully responsive, to show 3D simulation, data charts and impressions from real photo series. Info overlay with refs, credits and imprint.

## Requirements

### Requirement: Dashboard shell layout

The www/ page SHALL render, in German, a header with the title
"Katzenwedelwiesen — Umweltbeobachtung", a global day-of-year slider
("Zeit") and a date readout; below it a main area with the 3D simulation
pane and the data pane; below that the photo streak section; and a sources
footer. On landscape viewports the 3D pane SHALL sit left of the data pane
(3D ≈ 60%, data ≈ 40% width). On portrait/narrow viewports the layout SHALL
collapse to a single column ordered: header, data pane, 3D pane, streak.

#### Scenario: Desktop two-pane

- **WHEN** the page is opened at 1920×1024 (and at iPad landscape 1024×768)
- **THEN** the 3D pane and the data pane are side by side, 3D left, with
  the 3D pane wider than the data pane

#### Scenario: Portrait single column

- **WHEN** the page is opened at iPad portrait 768×1024 (or phone width)
- **THEN** the data pane appears ABOVE the 3D pane in one column, with the
  streak section last

### Requirement: Global time control

The header "Zeit" slider SHALL set the global day-of-year (0–364) that
drives the 3D simulation's season state, the data cards' red cursor and the
displayed date readout. The in-scene day slider and the header slider SHALL
stay synchronised in both directions. The photo streak SHALL show the photo
whose date is nearest to the global day.

#### Scenario: Slider drives everything

- **WHEN** the global day is set to 17
- **THEN** the 3D scene shows the winter state of January 17, every data
  card's cursor sits at January 17, the date readout shows 17. Jan, and the
  streak shows the January photo (20210117)

### Requirement: Embedded 3D simulation

The 3D pane SHALL run the existing orchard scene (terrain, trees, seasons,
structures, sky, grass, cat, camera presets) mounted into the pane. The
standalone orchard app SHALL keep working unchanged with its own chrome
(compare panel, Kamera panel, season panel with day slider, sky-condition
select and cat checkbox, footer). In the embedded pane the standalone chrome
is hidden and the in-scene controls row (sky-condition select, cat checkbox)
is NOT rendered: the season/weather follows the global date slider and the
cat is triggered by the "Katze" preset button. Camera presets, the in-scene
day slider and the tree-progress readout remain available in the embedded
pane, as do the Gras/Wind performance toggles.

#### Scenario: Standalone regression

- **WHEN** the orchard app is opened standalone after the refactor
- **THEN** it renders exactly as before: season panel (day slider,
  sky-condition select, cat checkbox), presets, Kamera panel, compare panel,
  compass, footer, and `__scene3` keys unchanged

#### Scenario: Embedded pane has no duplicated controls

- **WHEN** the www dashboard's 3D pane is shown on any viewport width
- **THEN** no sky-condition select and no "Katze" checkbox appear in the
  scene; the scene's weather follows the global date and the "Katze" preset
  button still shows and follows the cat

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

### Requirement: Sensor data API endpoint

`orchard/public/php/api.php` SHALL serve daily aggregates (min/mean/max per
day) of the sensor database as JSON over GET only. The channel→sensor
mapping SHALL live server-side as a whitelist so the displayed sensors can
be switched later without touching the frontend. Credentials SHALL be read
from a `config.ini` next to the script (flat keys DBUSER, DBPASS, DBSCHEMA,
DBHOST, DBPORT), which must never be web-readable. The endpoint SHALL be
injection-safe (prepared statements only, identifiers from the whitelist),
validate all inputs server-side, cap the requested date span, answer errors
as generic JSON (no server detail leaks), and ship an `.htaccess` denying
direct access to `*.ini` files. In development Vite SHALL proxy `/php` to a
PHP built-in server on port 9000 whose router refuses `*.ini` and dotfiles.

#### Scenario: Valid request returns series

- **WHEN** the endpoint is called with `channels=co2&from=2026-04-01&to=2026-04-30`
- **THEN** it answers 200 with JSON containing per-day mean/min/max values
  for sensor 0's co2 column and the channel's source/unit metadata

#### Scenario: Hostile input is rejected safely

- **WHEN** the endpoint receives an unknown channel, a malformed date, a
  range beyond the cap, or a non-GET method
- **THEN** it answers with a 4xx status and a generic JSON error, issues no
  unsafe query, and `config.ini` is not retrievable over HTTP

### Requirement: Photo streak with month sync

Below the panes, six archived weekly photos (20200928, 20201114, 20210117,
20210328, 20210522, 20210607) SHALL play as an automatic imgsmear A→B
sequence; the sweeping front separates consecutive photos; six date
markers label the photos and allow direct jumps. When a transition onto a
photo completes, the 3D simulation SHALL move to that photo's day-of-year;
when the global day changes, the streak SHALL switch to the nearest photo.
The sequence SHALL pause when the info overlay is open and resume after.

#### Scenario: Streak advances the 3D month

- **WHEN** the streak completes its transition onto the 20210522 photo
- **THEN** the 3D simulation shows late May and the date readout updates
  accordingly

#### Scenario: Slider picks the nearest photo

- **WHEN** the global day is set to 320 (mid November)
- **THEN** the streak shows the 20201114 photo

### Requirement: Menu and info page

A menu button SHALL open an info page (overlay) containing: a short German
description, a link to the predecessor project https://critical-sensors.de/,
the full credits/licence list (LGL-BW dl-de/by-2-0; Baumkataster Stadt
Karlsruhe CC BY 4.0 via Code for Karlsruhe; 3D-Gebäudemodell Stadt
Karlsruhe CC BY 4.0; © OpenStreetMap contributors ODbL; © GeoBasis-DE/BKG
(CC BY 4.0) for the BaseMapDE map tiles; ICOS CC BY 4.0 with
station AS_KIT; © Deutscher Wetterdienst; ZKM-Kubus-Foto © JOEXX,
CC BY-SA 3.0, via Wikimedia Commons; ez-tree MIT; cat model MIT by
Agentshire contributors; imgsmear; Mohave font from the old site), and the
Capacitor Device API readout (platform, model, OS, screen size).

#### Scenario: Info page content

- **WHEN** the menu button is tapped
- **THEN** the info overlay opens with the predecessor link and the
  complete credits list — including the BaseMapDE tile licence and the
  ZKM photo attribution — and the streak animation pauses until it is
  closed

### Requirement: Device information

The page SHALL use the Capacitor Device API (`@capacitor/device`) to read
device information (platform, model, operating system, screen dimensions)
and display it on the info page; the layout itself is driven by CSS media
queries so the design works on desktop 1920×1024, iPad landscape and
portrait, and phones.

#### Scenario: Device readout on the info page

- **WHEN** the info page is opened on a desktop browser
- **THEN** it shows platform "web" plus the browser's screen dimensions

### Requirement: Startup at the current date

The dashboard SHALL initialise its global day to the current local date on
startup, so the date readout shows today and every data card's cursor sits at
today's date. Where today has no measured value yet, the card readout SHALL
show the newest available measurement (the latest day with data) rather than a
placeholder, while the cursor itself stays at today's position on the axis.

#### Scenario: Fresh page load

- **GIVEN** the sensor database contains measurements up to at most a few
  days before today
- **WHEN** the page is loaded
- **THEN** the header readout shows today's date, every card's red cursor
  sits at today's position, and each card's value readout shows the newest
  available measurement for its channel (not one or two days earlier)

### Requirement: Seven-day data zoom

The header SHALL provide a toggle button next to the time slider that
switches the data cards between the full-year axis (Jan–Dec, daily means)
and a seven-day window covering the last 7 days including today. In the
seven-day view each card's chart SHALL plot HOURLY values (one point per
hour of the window, from the sensor API's hourly aggregates) with
day-boundary tick labels, and the toggle SHALL apply to all data cards
including the dummy Licht card.

#### Scenario: Zoom on

- **WHEN** the zoom toggle is activated while today is 11 November
- **THEN** every data card shows 5.–11. November on its x-axis with
  day-boundary labels and one plotted value per hour (168 slots), and the
  cursor sits at today's position

#### Scenario: Zoom off restores the year

- **WHEN** the zoom toggle is deactivated
- **THEN** every data card returns to the full-year Jan–Dec axis of daily
  means with the month tick labels and the cursor at the global day

### Requirement: Zoom cursor and API hourly mode

In the seven-day view the red cursor SHALL follow the global day inside
that window, clamped to the window edges when the global day predates it.
The sensor API SHALL serve hourly aggregates for small date windows
(≤ 14 days) with the same security posture as the daily endpoint.

#### Scenario: Cursor outside the window

- **WHEN** the global day is set (via the slider or a streak photo) to a
  date older than the seven-day window while zoom is active
- **THEN** the cursor is clamped to the window's left edge and no card
  renders outside the window

#### Scenario: Hourly request

- **WHEN** the frontend requests `res=hourly` for a 7-day window
- **THEN** the API answers with one row per hour (timestamp, avg, min, max)
  per channel, and a span beyond 14 days is rejected with a 4xx status

### Requirement: Non-overlapping chart axis labels

The chart tick labels (month labels on the full-year axis, day labels on the
seven-day axis) SHALL remain readable and SHALL NOT overlap each other or
the chart graphic at any supported viewport: large desktop (1920×1080 and
above), smaller desktop widths, and mobile portrait with the 3-tab layout.

#### Scenario: Small desktop width

- **WHEN** the page is viewed at a narrow desktop width (e.g. 1280×720 or
  a half-screen window)
- **THEN** the tick labels under every card are fully visible, spaced apart,
  and do not cover the curve area

#### Scenario: Mobile tabs

- **WHEN** the page is viewed on a phone in the 3-tab layout with the
  Daten tab active
- **THEN** the tick labels under every card fit the card width without
  overlapping the chart or each other

### Requirement: Mobile source shortcuts

On mobile viewports each data card header SHALL show only its short
source code (e.g. DWD/Wind, Wiese/Licht) and the value readout — the card
title and full source name SHALL be omitted there (the code identifies the
card and the value must stay visible). On desktop the card SHALL keep its
title and full source name as before.

#### Scenario: Mobile cards use codes

- **WHEN** the Daten tab is opened on a phone
- **THEN** every card header shows only its short code and the value
  readout (no card title), and no full source name is clipped or wrapped

#### Scenario: Desktop unchanged

- **WHEN** the dashboard is viewed at desktop width
- **THEN** the card headers show the title and the full source name

### Requirement: Mobile source descriptions

On mobile viewports one description paragraph per card SHALL appear below
the data pane, pairing every shortcut with its full source description;
each paragraph SHALL be capped at three lines high with overflow scroll
and the data pane's card sizes SHALL NOT shrink to make room for them. On
desktop no description paragraphs SHALL appear.

#### Scenario: Mobile descriptions below the pane

- **WHEN** the Daten tab is scrolled past the cards on a phone
- **THEN** one paragraph per card lists the shortcut with the full source
  description, each paragraph at most three lines high with overflow
  scroll, and the card grid keeps its sizes

#### Scenario: Desktop unchanged

- **WHEN** the dashboard is viewed at desktop width
- **THEN** no description paragraphs are rendered

### Requirement: Location map card

The site SHALL show a map card using the same card styling as the data
cards. It SHALL render an interactive map with the BaseMapDE raster tiles
(attribution "© GeoBasis-DE/BKG (year) CC BY 4.0" with links to
bkg.bund.de and the CC BY 4.0 licence). The initial map extent SHALL
include both points of interest with a small margin. The map SHALL show
two points of interest with click/tap popups:

1. "Katzenwedelwiesen" at OSM node 11804686686
   (48.9899695, 8.3876071) — the popup SHALL show the title
   "Katzenwedelwiesen" and the site logo (`/site/logo.png`).
2. "ZKM" at OSM way 224089410 (centre 49.001303, 8.383590) — the popup
   SHALL show the title "ZKM", the photo
   https://commons.wikimedia.org/wiki/File:ZKM_Kubus_.jpg and the
   attribution "© JOEXX, CC BY-SA 3.0, via Wikimedia Commons".

On landscape/desktop viewports the map SHALL sit in the lower panel row
NEXT TO the photo streak — the photo streak on the left, the map card on
the right — so the data charts above keep their sizes. On the mobile
3-tab layout the map card SHALL appear inside the Daten tab AFTER the
per-card source description paragraphs. On narrow desktop/tablet widths
(single-column layout, no tabs) the map SHALL appear as its own row below
the photo streak.

#### Scenario: Desktop map beside the streak

- **WHEN** the page is viewed at desktop width (e.g. 1920×1024)
- **THEN** the lower panel row shows the photo streak on the left and the
  map card on the right, and the data charts in the data pane keep their
  previous sizes

#### Scenario: Mobile map after the descriptions

- **WHEN** the Daten tab is opened on a phone and scrolled past the cards
- **THEN** the source description paragraphs appear first and the map card
  appears after them

#### Scenario: Tablet single-column row

- **WHEN** the page is viewed at a single-column width without tabs
  (e.g. iPad portrait 768×1024)
- **THEN** the map card appears as its own full-width row below the photo
  streak

#### Scenario: Initial extent covers both PoIs

- **WHEN** the map card is shown for the first time
- **THEN** both the Katzenwedelwiesen marker and the ZKM marker are
  visible inside the map viewport, each with a small margin to the map
  edge

#### Scenario: Orchard popup

- **WHEN** the Katzenwedelwiesen marker is clicked or tapped
- **THEN** a popup opens showing the title "Katzenwedelwiesen" and the
  site logo image

#### Scenario: ZKM popup

- **WHEN** the ZKM marker is clicked or tapped
- **THEN** a popup opens showing the title "ZKM", the ZKM Kubus photo and
  the attribution line "© JOEXX, CC BY-SA 3.0, via Wikimedia Commons"

#### Scenario: Tile attribution

- **WHEN** the map is rendered
- **THEN** the map carries the BaseMapDE attribution
  "© GeoBasis-DE/BKG (current year) CC BY 4.0" with working links to the
  BKG website and the CC BY 4.0 licence text

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
