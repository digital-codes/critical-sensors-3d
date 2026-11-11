# Tasks

## 1. Startup date fix

- [x] 1.1 Fix `todayIndex()` in `www/src/store.ts` to return the elapsed-day count (drop the `- 1`), keeping the `0…364` clamp; verify on load the header readout and every card cursor show today's local date (`doy = day + 1` mapping)
- [x] 1.2 Make `SeriesCard` readouts show the newest available measurement when the global day has no data yet (per design decision 3); verify a card whose channel ends before today displays the latest day's value, not "—" or an older fallback

## 2. Embedded 3D chrome removal

- [x] 2.1 In `orchard/src/main.ts` embed branch, skip building the `.w3d-controls` row and leave `seasonPanel = null` so the sky select (`#skycondition`) and cat checkbox (`#showcat`) blocks are never created; verify the www 3D pane shows only presets, day slider row, tree progress, and Gras/Wind toggles
- [x] 2.2 Remove the dead `.w3d-controls` / `#skycondition` / `#showcat` rules from the injected embed stylesheet (keep the `.w3d-season`/`.w3d-progress` tablet hides); verify no leftover references remain (`grep skycondition showcat orchard/src/main.ts` shows standalone-only hits)
- [x] 2.3 Regression-check the standalone orchard app (`cd orchard && npm run dev`): season panel with day slider, sky select, cat checkbox, presets, Kamera panel, compare panel, compass, footer all render as before, and the "Katze" preset still shows + follows the cat in the www embed

## 3. Seven-day data zoom

- [x] 3.1 Add shared zoom state (`useZoom()` in `www/src/store.ts`, reactive boolean) and a "7 Tage" toggle button next to the ‹ › step buttons in `TimeSlider.vue` with an active style matching the scene presets; verify the button toggles state and persists across day changes
- [x] 3.2 Implement the 7-day axis in `SeriesCard.vue`: filter rows to today−6…today (ISO dates from the real current date), x mapped by day offset, cursor clamped to the window when the global day predates it; verify with the slider at an old date the cursor sits at the left edge and no point renders outside the window
- [x] 3.3 Implement the same window in `LightCard.vue` (7 bars from the synthetic curve) and verify both views switch back to the full Jan–Dec axis when the toggle is off

## 4. Hourly zoom values (amendment)

- [x] 4.1 Extend `orchard/public/php/api.php` with an hourly mode (`res=hourly`, allowed only for date spans ≤ 14 days): rows `["YYYY-MM-DD HH:00:00", avg, min, max]` per whitelisted channel, same security posture (GET only, prepared statements, whitelist, capped span, generic errors); verify via `php -S` dev server that `?res=hourly&from=…&to=…` answers hourly rows and that a >14-day span is rejected with 4xx
- [x] 4.2 Wire hourly fetching into the frontend (`www/src/api.ts` `fetchSeries({res,from,to})`, `DataPane.vue` fetch on zoom-on with from=today−6/to=today, fallback to daily rows when the hourly fetch fails); verify the toggle triggers one hourly request and a failed request still renders the daily 7-day view
- [x] 4.3 Plot hourly values in the zoom view: `SeriesCard.vue` uses the hourly series (one point per hour, day-boundary ticks, y-scale over the hourly window values, cursor at the global day's midday position clamped to the window) and `LightCard.vue` interpolates its synthetic daily curve to hourly bars; verify hourly points render and zoom-off restores the daily year axis

## 5. Chart label overlap

- [x] 5.1 Add responsive tick-label subsetting/scaling to the year-axis `.ticks` rows (`SeriesCard.vue`, `LightCard.vue`, `styles.css`) per design decision 6; verify labels do not overlap the chart or each other at 1280×720 and a half-screen window
- [x] 5.2 Render at most 4 day labels in the 7-day view at narrow card widths; verify the day labels stay legible and non-overlapping in both card states

## 6. Mobile source shortcuts (amendment)

- [x] 6.1 Show only a short source code in each card subtitle on mobile (DWD/Temp, DWD/Feuchte, DWD/Wind, ICOS/CO₂, City/Solar, City/Boden, Wiese/Licht) and omit the card title on mobile (title + code are redundant; the value readout must stay visible); verify at 390×844 each card shows only code + value and no clipped long names
- [x] 6.2 Show the source descriptions as one paragraph per card BELOW the data pane (not inside the pane's card grid; the pane's card sizes must not shrink), each paragraph capped at 3 lines high with overflow scroll; verify at 390×844 the paragraphs follow the cards with the tab scrolling, none overflows 3 lines unscrollably, and that neither shortcuts nor paragraphs appear on desktop

## 7. Layout verification

- [x] 7.1 Verify the full layout at 1920×1080 and a larger desktop (e.g. 2560×1440): two-pane layout, header with slider + zoom button, no chart/label overlap
- [x] 7.2 Verify smaller desktop widths (1366×768, 1280×720): header wraps cleanly, data pane charts and tick labels correct
- [x] 7.3 Verify mobile 3-tab layout (e.g. 390×844): Daten/3D/Fotos tabs, swipe navigation still works, zoom button reachable in the header, 3D pane shows no sky select/cat checkbox, streak and cursor behave after tab switches

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result.
