# Spec Delta

## ADDED Requirements

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

## MODIFIED Requirements

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
