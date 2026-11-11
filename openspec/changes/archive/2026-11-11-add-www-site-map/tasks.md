# Tasks

## 1. Dependency and component scaffold

- [x] 1.1 Install `leaflet` and `@types/leaflet` (`npm install leaflet && npm install -D @types/leaflet` in `www/`) and verify `npm run build` still passes typecheck with the new deps
- [x] 1.2 Create `www/src/components/MapCard.vue`: `.card` section with `.card-hd` (title "Karte", subtitle "BasemapDE") and a flex-1 map container; mount/unmount the Leaflet map with the default-marker icon fix (`L.Icon.Default.mergeOptions` + explicit marker image imports, as in klimaDashboard's SimpleMap.vue); verify the component renders an empty Leaflet map inside the card (`npm run dev`)

## 2. Map content

- [x] 2.1 Add the BaseMapDE raster tile layer with the year-aware attribution "© GeoBasis-DE/BKG (year) CC BY 4.0" linking to bkg.bund.de and creativecommons.org/licenses/by/4.0/ (entry reused from SimpleMap.vue's `tileSource`); verify tiles render at zoom ~14 around Karlsruhe
- [x] 2.2 Add the two PoI markers with popups: "Katzenwedelwiesen" (48.9899695, 8.3876071) with the site logo `/site/logo.png`, and "ZKM" (49.001303, 8.383590) with the Commons 320px thumb of `ZKM_Kubus_.jpg`, the attribution "© JOEXX, CC BY-SA 3.0, via Wikimedia Commons" linking to the Commons file page; verify both popups open by click/tap
- [x] 2.3 Set the initial extent with `map.fitBounds([[48.9899695, 8.3876071], [49.001303, 8.383590]], { padding: [24, 24] })` and verify both markers are visible with a small margin at first render (desktop and mobile widths)

## 3. Layout integration

- [x] 3.1 Render `<MapCard class="map-card" />` as the third root of `DataPane.vue` (after the `.data-descs` div) and verify the mobile Daten tab shows data pane → description paragraphs → map card at ≤560px width
- [x] 3.2 Add the desktop streak-row split CSS in `styles.css`: `.map-card { grid-column: 2; grid-row: 2 }`, change `.main .streak-panel` to `grid-column: 1; grid-row: 2`, map card stretches to the row height; verify at 1920×1024 and 1024×768 landscape that the photo is left, the map is right, and the data charts keep their previous sizes
- [x] 3.3 Add the single-column rule for the no-tab narrow/tablet layout: `.map-card { order: 4; height: ~200px }` below the streak; verify at 768×1024 portrait that the map is a full-width row below the photo streak and the card grid sizes are unchanged
- [x] 3.4 Add `.leaflet-container` to the swipe-ignore selector in `App.vue`'s `onTouchEnd` and verify that panning the map on a phone (≤560px) does not switch tabs while swiping elsewhere still does

## 4. Attribution and credits

- [x] 4.1 Extend the sources footer in `App.vue` with the BaseMapDE licence ("© GeoBasis-DE/BKG (year) CC BY 4.0") and the ZKM photo credit ("ZKM-Kubus-Foto © JOEXX, CC BY-SA 3.0, via Wikimedia Commons"); verify the footer text renders without line-break clipping at desktop and mobile widths
- [x] 4.2 Add the same two entries to the credits list in `InfoPopup.vue` and verify the info overlay lists them

## 5. Integration verification

- [x] 5.1 Run `npm run build` in `www/` and confirm typecheck + production build succeed
- [x] 5.2 Walk the spec scenarios from the delta spec at 1920×1024, 768×1024 and a ≤560px phone width (placement, initial bounds, both popups, tile attribution) and confirm each observable outcome matches
