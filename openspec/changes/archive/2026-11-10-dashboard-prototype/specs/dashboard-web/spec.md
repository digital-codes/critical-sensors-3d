# Spec Delta — dashboard-web

## ADDED Requirements

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
(compare panel, Kamera panel, footer). In the embedded pane the standalone
chrome is hidden but camera presets, cat toggle, sky condition and the
in-scene day slider remain available.

#### Scenario: Standalone regression

- **WHEN** the orchard app is opened standalone after the refactor
- **THEN** it renders exactly as before: season panel, presets, Kamera
  panel, compare panel, compass, footer, and `__scene3` keys unchanged

### Requirement: Data pane cards

The data pane SHALL show seven cards, in this order: CO₂, Lufttemperatur,
Luftfeuchte, Solar, Wind, Boden, Licht & Lichtfarbe. The first six SHALL
render real measurements fetched from the PHP sensor endpoint; each shows a
curve over the data range, a red cursor at the global day and the value at
that day (or "—" where no data exists). The Licht & Lichtfarbe card is the
only dummy: one single chart of light intensity (0–100 %) whose plotted
colour is the RGB colour convoluted with that intensity, plus ONE combined
colour bar below (never the three channels as separate bars); it SHALL be
labeled as dummy data. Card subtitles name the measuring source delivered
by the endpoint.

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
Karlsruhe CC BY 4.0; © OpenStreetMap contributors ODbL; ICOS CC BY 4.0 with
station AS_KIT; © Deutscher Wetterdienst; ez-tree MIT; cat model MIT by
Agentshire contributors; imgsmear; Mohave font from the old site), and the
Capacitor Device API readout (platform, model, OS, screen size).

#### Scenario: Info page content

- **WHEN** the menu button is tapped
- **THEN** the info overlay opens with the predecessor link and the
  complete credits list, and the streak animation pauses until it is
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
