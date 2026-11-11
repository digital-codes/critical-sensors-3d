# Proposal

## Why

The www dashboard has accumulated small usability defects since the prototype landed: the embedded 3D pane duplicates controls that the dashboard already provides elsewhere, the data cards start one to two days in the past, the month tick labels collide with the charts on smaller desktop widths, and there is no quick way to inspect the most recent measurements on the full-year axis. Fixing these now rounds off the dashboard before it replaces the live site.

## What Changes

- **Remove the embedded scene's controls row** (sky-condition select "Klar/Heiter/…" and the "Katze" checkbox) from the www 3D pane: the season/weather is already driven by the global date slider, and the cat is already triggered by the "Katze" preset button. The standalone orchard app keeps its `#season` panel unchanged.
- **Fix the startup date**: the data cards must pick up the current date on load (currently one to two days late). The frontend's `todayIndex()` has an off-by-one (returns "days elapsed since Jan 1 minus 1" where the day index maps `doy = day + 1`); additionally the readout must reflect the newest available data instead of silently falling back to an older day.
- **Fix chart label overlap**: on smaller desktop widths the month tick labels under the charts overlap the chart/each other; the ticks row needs responsive behaviour (fewer or smaller labels as width shrinks).
- **Add a 7-day data zoom**: a toggle button next to the header time slider switches the data cards between the full-year (Jan–Dec) axis and a "last 7 days incl. today" window.
- **Verify layout** at 1920×1080 and above, smaller desktop widths, and mobile with the 3 tabs (Daten / 3D / Fotos).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `dashboard-web`: embedded 3D pane chrome is reduced to presets + season slider + tree progress (no sky select, no cat checkbox); dashboard startup date is the current date; data cards gain a full-year/last-7-days view toggle; chart tick labels must not overlap the charts at desktop and mobile widths.

## Impact

- `orchard/src/main.ts` — embed branch only: do not build the `.w3d-controls` row (sky select + cat toggle); standalone branch untouched.
- `www/src/store.ts` — `todayIndex()` off-by-one.
- `www/src/api.ts` — `valueAtDoy()` fallback tolerance (readout freshness).
- `www/src/components/SeriesCard.vue`, `LightCard.vue` — zoom-aware x-axis, ticks, cursor; responsive tick labels.
- `www/src/components/TimeSlider.vue` — new zoom toggle button.
- `www/src/App.vue` / `styles.css` — zoom state wiring and responsive fixes.
- No API/backend changes; no dependency changes.
