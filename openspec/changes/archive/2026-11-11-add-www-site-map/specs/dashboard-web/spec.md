# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
