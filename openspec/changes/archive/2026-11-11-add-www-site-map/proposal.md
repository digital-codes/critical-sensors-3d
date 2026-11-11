# Proposal

## Why

The site shows environmental data for the Katzenwedelwiesen orchard, but a
visitor never sees *where* the orchard is or how it relates to the city —
the measuring stations it pairs with (e.g. the ZKM area) remain abstract.
A small embedded map inside the data pane anchors the project geographically
and highlights the two places the site is about: the orchard itself and the
ZKM.

## What Changes

- Add a map card to the www site, styled like the other data cards
  (`.card` header + body):
  - **Mobile (3-tab layout, ≤560 px)**: placed inside the Daten tab after
    the data charts and the per-card source-description paragraphs.
  - **Desktop/landscape**: the lower photo panel row is rearranged into
    photo streak on the left and the map card on the right — the charts
    keep their sizes.
- The map uses Leaflet with the BaseMapDE raster tile variant (BKG,
  CC BY 4.0) as taken from the klimaDashboard's
  `SimpleMap.vue` (tile layer + Leaflet default-icon fix + container
  pattern are the reused portions; the GeoJSON/CRS/data-URL parts are not
  needed).
- Two points of interest with popups:
  - **Katzenwedelwiesen** — the orchard (OSM node 11804686686,
    48.9899695, 8.3876071). Popup shows the title "Katzenwedelwiesen" and
    the site logo (`/site/logo.png`).
  - **ZKM** — the ZKM building (OSM way 224089410, centre
    ≈ 49.001303, 8.383590). Popup shows the title "ZKM" and the photo
    https://commons.wikimedia.org/wiki/File:ZKM_Kubus_.jpg with its
    attribution (© JOEXX, CC BY-SA 3.0, via Wikimedia Commons).
- Initial map extent fits both PoIs with a small margin.
- The sources footer / info credits list the new map sources
  (BaseMapDE/BKG and the ZKM photo licence).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `dashboard-web`: New requirement "Location map card" — the site gains a
  map card with two PoI popups, BaseMapDE tiles and an initial extent
  covering both PoIs; on landscape/desktop the lower photo row splits into
  photo left + map right, on mobile the map follows the source-description
  paragraphs. Plus updated credits requirement to cover the new map
  attributions.

## Impact

- `www/src/components/DataPane.vue` (map card instance for the mobile
  tab layout), new `www/src/components/MapCard.vue`.
- `www/src/App.vue` / `www/src/styles.css`: the desktop streak row becomes
  a photo-left / map-right split (grid columns of `.main` row 2); the map
  card is lifted into that grid row on landscape widths.
- `www/package.json`: new runtime dependency `leaflet` (plus its CSS
  import); no `proj4` needed (all coordinates are plain WGS84).
- `www/src/styles.css`: streak-row split (photo left / map right) and map
  card body sizing.
- Sources footer (`App.vue`) and info overlay credits (`InfoPopup.vue`)
  gain the BaseMapDE and ZKM-photo attributions.
- No backend/API changes; no changes to the orchard standalone app.
