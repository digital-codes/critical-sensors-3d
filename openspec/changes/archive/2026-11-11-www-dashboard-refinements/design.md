# Design

## Context

- The embedded 3D pane (`orchard/src/main.ts`, `embed: true`) builds an in-scene panel with three rows: presets, season (day slider + value), and a `.w3d-controls` row that receives the sky-condition select (`#skycondition`, labels "Klar/Heiter/…" from `CONFIG.SKY.CONDITIONS`) and the cat checkbox (`#showcat`). The www dashboard already drives weather from the global date (`skyForDay`) via `setDay`, and the "Katze" preset button already shows + follows the cat — so the controls row duplicates both.
- Startup date: `www/src/store.ts` `todayIndex()` computes `doy = floor((Date.UTC(y, m, d) - Date.UTC(y, 0, 1)) / 86400000)` — that is **days elapsed since Jan 1**, i.e. the 0-based doy. It then returns `doy - 1`, while all consumers map `doy = day + 1` (`SeriesCard`, `LightCard`, `TimeSlider`, `api.doyToIso`). Net effect: the dashboard starts on yesterday's date. This explains the constant 1-day lag; the occasional 2-day lag comes from `api.valueAtDoy()`'s ±2-day tolerance showing an older day's value when today's aggregate is not yet in the DB (the refSensors pipeline's DWD/ICOS sources can publish with delay).
- Charts: `SeriesCard.vue` and `LightCard.vue` render a fixed 320×92 viewBox with month ticks positioned by percentage in a `.ticks` row; labels overlap each other/the chart at narrower desktop widths because the absolute-positioned spans never reflow.
- The mobile 3-tab layout (`App.vue`) keeps all panes mounted; `styles.css` carries the responsive rules.

## Goals / Non-Goals

**Goals:**

- Remove the embed-only controls row without touching the standalone orchard chrome.
- Dashboard starts on today's local date; readouts show the freshest available data.
- A header toggle switches all data cards between the year axis and a 7-day window (today−6…today).
- Tick labels never overlap at large desktop, small desktop, and mobile tab widths.

**Non-Goals:**

- No changes to the sensor pipeline (`datatools/refSensors.py`) or `api.php` — source data lag is reported transparently, not fixed in the DB layer.
- No changes to the standalone orchard app's UI or its capture/verification keys.
- No new charting library; the hand-rolled SVG cards stay.

## Decisions

1. **Embed chrome removal — skip creating the row, don't hide it with CSS.**
   In the `embed` branch of `mountOrchard`, drop the `.w3d-controls` row entirely and leave `seasonPanel = null` so the sky-select and cat-checkbox blocks (which are already gated on `seasonPanel`) are skipped. `presetsEl`, `seasonRow` (day slider), `progressEl` stay. Also remove the now-dead `.w3d-controls` / `#skycondition` / `#showcat` rules from the injected embed stylesheet (incl. the `@media (max-width:1023px)` list, keeping the `.w3d-season`/`.w3d-progress` hides for tablet widths). The standalone branch (`#season`, `#presets`) is untouched, as is the `__scene3.sky` programmatic hook.
   *Alternative:* hide via CSS — rejected, dead DOM and misleading capture keys.
2. **Startup date fix — correct `todayIndex()` to return the elapsed-day count** (drop the `- 1`), keeping the `0…364` clamp. This aligns it with the universal `doy = day + 1` mapping. Jan 1 → 0 → doy 1 still holds.
3. **Readout freshness — clamp the fallback to the newest data.** Keep `valueAtDoy` for the "value at the global day" semantics, but when the nearest day is older than today and no exact match exists, the card readout shows the newest available row for the channel (with the cursor remaining at today's position). This turns the silent 1–2-day-old value into the explicitly newest measurement, matching the spec.
4. **Zoom state lives in the store.** Add a reactive `zoomed: boolean` (e.g. `useZoom()` in `store.ts`) next to the day state, so `TimeSlider` (toggle button) and both chart components share one source of truth without prop drilling. The button label "7 Tage" sits next to the ‹ › step buttons in the header time control; active state styled like the scene preset `.active` look.
5. **7-day axis as a second mapping, not a second chart.** In `SeriesCard`/`LightCard`, when zoomed: filter rows to ISO dates in `[today−6, today]`, map x by day offset (0…6)/6 of the width, render day tick labels ("5.11." style; a subset of every other day if the card is narrow), and clamp the cursor x to the window (left edge when the global day predates the window). The dummy `LightCard` derives its 7 bars from the same day window. The window is computed from the real current date, not from `time.day`, so it always ends at today incl. today.
6. **Tick overlap — responsive label subsetting, not scaling alone.** For the year axis, CSS media/container rules drop alternate month labels (keep e.g. Feb/Apr/Jun/Aug/Okt/Dez → then Jan/Mai/Sep) and shrink font-size as the card narrows; the 7-day axis renders at most 4 day labels at narrow widths. Rationale: percentage-positioned absolute labels cannot reflow, so subsetting is the only way to guarantee no overlap without changing the axis geometry.
7. **Hourly zoom values — extend the API, don't fake it client-side.** `api.php` gains a `res=hourly` mode (default `daily`): rows become `["YYYY-MM-DD HH:00:00", avg, min, max]` grouped by hour, served only for date spans ≤ 14 days (168×14 hourly rows is a bounded response) and rejected with 4xx otherwise — same security posture (GET only, whitelisted columns, prepared statements, capped span). The sensors table already stores hourly rows, so this is a GROUP BY change only. The frontend fetches the hourly series for `[today−6, today]` when zoom is switched on (single request, `fetchSeries({res:'hourly',from,to})`) and falls back to the daily rows if that request fails. The dummy Licht card has no real hourly data: it interpolates its synthetic daily curve to hourly values (smoothed linear ramp between daily points) so all cards share the hourly axis.
8. **Zoom x-axis in hours.** The 7-day axis spans 7×24 = 168 hour slots; x = hourOffset/167·W. The cursor sits at the global day's midday slot (dayOffset·24+12), clamped to the window edges. Day-boundary tick labels ("5.11.") at hour offsets 0/24/48/… replace the day ticks.
9. **Mobile source shortcuts.** On mobile widths the long source names ("DWD Klimastation Rheinstetten (FF_10)") don't fit the card headers. Each card's subtitle is replaced by a short code (DWD/Temp, DWD/Feuchte, DWD/Wind, ICOS/CO₂, City/Solar, City/Boden, Wiese/Licht) below mobile breakpoints, and a compact legend after the last chart maps every code to the full description (CSS-shown only at mobile widths, so desktop keeps the full names inline). The codes live in `DataPane.vue` next to the card definitions — the legend is generated from the same pairs.

## Risks / Trade-offs

- [Sensor data genuinely lags 1–2 days (pipeline sources)] → The readout now shows the newest available value by design; cursor stays at today. If the user wants "no data yet today" to read "—" instead, that's a one-line change later.
- [`todayIndex()` off-by-one fix shifts every freshly opened session by one day] → Intended; but streak/photo selection and any saved expectations from earlier sessions shift too. Verify the streak still picks the nearest photo after load.
- [Removing the embed controls row removes the only in-scene sky override on desktop www] → `__scene3.sky.setCondition` stays available programmatically; the weather now follows the date exclusively, which is the requested behaviour.
- [7-day view with sparse data (gaps in the window) can look empty] → Gaps are simply absent points, same as the year view; the readout fallback keeps the value informative.
- [Media-query-based label subsetting depends on card width, which differs between desktop pane and mobile tab] → Verify at the exact target sizes (1920×1080, 1280×720, phone) and tune breakpoints; container queries are the fallback if viewport queries prove insufficient.

## Migration Plan

Pure frontend change; deploy with the next www build. Rollback = revert the change. No DB, API, or standalone-orchard migration.

## Open Questions

(none)
