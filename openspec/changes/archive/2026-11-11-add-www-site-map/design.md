# Design

## Context

- `www` is a Vue 3 + Vite + TypeScript SPA (`vue-tsc` in the build). The
  data pane (`www/src/components/DataPane.vue`) is a multi-root component:
  an `<aside class="data-pane">` (2×4 card grid) plus a mobile-only
  `.data-descs` sibling div. Tab wrappers (`.tpane`) are
  `display: contents` on desktop, so DataPane's root nodes become direct
  grid items of `.main` (`grid-template-rows: minmax(0,1fr) auto`,
  `grid-template-columns: 60fr 40fr`); on phones `.tpane` is a scrolling
  block that stacks the children in DOM order.
- Card styling lives in `.card` / `.card-hd` (`www/src/styles.css`); all
  cards are also plain `.card` sections.
- klimaDashboard's `SimpleMap.vue` provides the reusable Leaflet recipe:
  Leaflet map + tile layer from a `tileSource` array (the BaseMapDE entry,
  index 3), the default-marker-icon path fix, and a map container
  `.map` with 100% height. Its GeoJSON/proj4/data-fetch parts are not
  needed here — we have two fixed PoIs with plain WGS84 coordinates.
- Reference coordinates (verified via OSM API):
  - Katzenwedelwiesen: node 11804686686 → 48.9899695, 8.3876071
  - ZKM: way 224089410 (building polygon); user-specified map focus
    49.001303, 8.383590 is inside the polygon and used as the marker
    position.
- ZKM image (Wikimedia Commons "File:ZKM Kubus .jpg"): author JOEXX,
  licence CC BY-SA 3.0, attribution required. Hotlinking Commons is
  acceptable; a thumbnail URL keeps the popup light.

## Goals / Non-Goals

Goals:

- One map card, styled like the other data cards, correctly placed on
  desktop (below the data charts in the data column) and mobile (below the
  source-description paragraphs).
- Both PoIs with popups, BaseMapDE tiles, initial extent covering both
  PoIs with a small margin.
- Attribution correctness (BKG tiles + ZKM photo) in the map, the sources
  footer and the info overlay.

Non-Goals:

- No GeoJSON overlay, no CRS transformation, no configurable tile source
  switcher (single BaseMapDE raster).
- No changes to the orchard standalone app, the sensor API, or the 3D
  scene.
- No routing/directions features in the popups.

## Decisions

- **Library: `leaflet` (+ `@types/leaflet` dev dep), no wrapper.**
  Alternatives: MapLibre GL (heavier, vector style pipeline not needed for
  a raster WMTS), a Vue wrapper lib (vue-leaflet is unmaintained). Plain
  Leaflet mirrors the proven klimaDashboard recipe and is ~40 KB gz.
- **Reuse from `SimpleMap.vue`**: the BaseMapDE tile entry
  (`https://sgx.geodatenzentrum.de/wmts_basemapde/tile/1.0.0/de_basemapde_web_raster_farbe/default/GLOBAL_WEBMERCATOR/{z}/{y}/{x}.png`
  with the "© GeoBasis-DE/BKG (year) CC BY 4.0" attribution incl. links),
  the `L.Icon.Default.mergeOptions` marker-image fix (needed under Vite),
  and the container/markup pattern. Not reused: data URL fetching, proj4
  CRS handling, GeoJSON layer, overlay adjust.
- **Placement via multi-root + CSS grid, single MapCard instance.**
  `DataPane` renders `<MapCard class="map-card" />` as its third root
  (after `.data-descs`).
  - Mobile (≤560px): `.tpane` is a block; DOM order gives exactly
    data pane → descriptions → map card. No new CSS needed beyond sizing.
  - Desktop/landscape (`.tpane` is `display: contents`, so the card lands
    in the `.main` grid): the LOWER PANEL ROW is rearranged — the streak
    panel moves from `grid-column: 1 / -1` to column 1 and the map card
    takes column 2 of the same row (`grid-row: 2`). The photo streak sits
    left, the map card right; the row height is driven by the streak
    (stage `clamp(150px, 24dvh, 260px)` + markers), the map stretches to
    match. The 1fr row above (3D + data charts) is untouched — charts
    keep their sizes.
  - Tablet portrait / single-column grid (≤1023px, >560px, no tabs):
    implemented as a flex column (like the ≤560px tab layout): data cards
    at natural height (rows `minmax(140px, auto)`), 3D pane `30dvh`,
    streak, then a full-width 200px map row; `.main` scrolls
    (`overflow-y: auto`) because the four sections no longer fit a short
    window uncompressed. (Grid placement was tried first, but with the
    base `min-height: 0` on the items the `auto` grid tracks distribute
    the container height instead of sizing to content, crushing the
    cards.)
  - Alternative considered: putting the map below the data-pane grid as a
    9th spanning card — rejected: it would shrink the charts inside the
    fixed-height window, and on mobile it must move below the
    `.data-descs` paragraphs anyway.
- **Map component**: `www/src/components/MapCard.vue`. `<section
  class="card">` with `.card-hd` (title "Karte", subtitle "BasemapDE") and
  a flex-1 map container (min-height ~200 px). Map + tiles + markers
  created in `onMounted`, destroyed in `onUnmounted` (the component is
  always mounted per the tab design, so this runs once). On desktop the
  card fills the streak row height instead of a fixed height.
- **Markers/popups**: default Leaflet markers. Popup content as HTML
  strings: Katzenwedelwiesen → `<b>Katzenwedelwiesen</b><br><img
  src="/site/logo.png" …>`; ZKM → `<b>ZKM</b><br><img (Commons 320px
  thumb)…><br><em>© JOEXX, CC BY-SA 3.0, via Wikimedia Commons</em>`
  (title and attribution as links to the Commons file page). Initial view
  via `map.fitBounds([[48.9899695, 8.3876071], [49.001303, 8.383590]],
  { padding: [24, 24] })`.
- **Gestures**: `scrollWheelZoom` stays on desktop; on touch the map pans
  with one finger (page scroll continues at map edges via Leaflet's
  default). The App.vue swipe handler must ignore touches on the map:
  add `.leaflet-container` to its `closest()` ignore selector.

## Risks / Trade-offs

- [Photo strip gets narrower on desktop] → The streak photo is centred
  with `object-fit: contain`; a ~40%-width stage still shows the full
  4:3 photos; the smear canvas fills via `object-fit: cover` and simply
  crops a little more.
- [Tablet single-column layout grows by a map row] → Map row capped at
  200px; the single-column `.main` scrolls (`overflow-y: auto`) instead of
  compressing the data cards — card rows keep an explicit 140px minimum.
- [Leaflet default marker icons break under Vite asset paths] → apply the
  known `Icon.Default.mergeOptions` fix with explicit imports (same as
  klimaDashboard).
- [BasemapDE WMTS availability/rate limits] → public BKG service, same
  one klimaDashboard already uses in production; map degrades to an empty
  styled card with attribution if tiles fail, data cards unaffected.
- [Hotlinked Commons thumbnail] → Commons permits hotlinking; add
  `loading="lazy"` inside popup HTML; attribution kept with the image as
  required by CC BY-SA 3.0.
- [Touch: map panning vs tab swiping] → swipe handler ignores
  `.leaflet-container` touches; the tab bar remains the fallback.

## Migration Plan

Pure frontend addition: `npm install leaflet` / `@types/leaflet`, new
component, DataPane + App.vue + InfoPopup.vue edits, CSS rules. Rollback
= revert the component import in DataPane. No data or API changes.

## Open Questions

None.
