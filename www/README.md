# www — Katzenwedelwiesen dashboard

The user-facing page of this repo (German only): a 100 dvh app shell with a
header (title, global day-of-year slider, "i" info button), the data pane,
the embedded 3D orchard scene, the photo streak, and a sources footer. Vue 3
+ Vite + TypeScript. **Dev port is pinned to 5212** (`vite.config.ts`) — a
second instance silently shifts to the next free port while the browser
keeps hitting 5212.

## Run

From the repo root (`package.json` scripts):

```sh
npm install            # once, in www/ and orchard/ each
npm run dev            # the dashboard (= dev:www) → http://localhost:5212
npm run dev:scene      # the standalone 3D scene only (orchard) → :5199
npm run build          # both apps; www/dist/ is the deployable static build
```

Live data needs the PHP sensor API in dev:

```sh
php -S 127.0.0.1:9000 -t orchard/public/php orchard/public/php/router.php
```

Vite proxies `/php` → 127.0.0.1:9000 (see `orchard/public/php/README.md` for
channels, config.ini and deployment). Without it the data pane shows its
error state; the scene and streak still work.

## Structure

| Component | Role |
|---|---|
| `App.vue` | header + footer shell, mobile tab bar + swipe; panes are never unmounted (`display:none` via `.active`) so the simulation stays alive in background tabs |
| `TimeSlider.vue` | the global "Zeit" slider; readout updates instantly from a local value, the store commit is debounced (~250 ms trailing, flush on touch-up); ±1 day buttons flank the slider |
| `DataPane.vue` | six `SeriesCard`s fed by the PHP API (CO₂, Lufttemperatur, Luftfeuchte, Solar, Wind, Boden = Bodenfeuchte + Bodentemperatur), the `LightCard`, and the `MapCard` |
| `SeriesCard.vue` | SVG curve over the full year **or** the shared 7-day zoom (last 7 days incl. today, hourly), red cursor at the global day, value readout, source subtitle + PID licence line |
| `LightCard.vue` | the ONLY dummy card ("Wiese/Licht", planned station): mulberry32 intensity + RGB triplet, ONE combined colour bar |
| `MapCard.vue` | leaflet site map (BKG tiles) with the orchard and the sensor stations |
| `OrchardPane.vue` | mounts the 3D scene via `mountOrchard(host, { embed: true })` and wires store ↔ scene both ways (day events tagged by source) — see the embed section in `../orchard/README.md` |
| `StreakPanel.vue` | the photo strip: six archived 2020/21 weekly photos, date markers with click-to-jump; image animation only — it does NOT move the simulation day |
| `InfoPopup.vue` | header "i" button → overlay modal (sources, credits, impressum). Overlay, never a separate page: navigating away would tear down the running simulation. The scene intentionally keeps rendering behind the modal |

## State (`store.ts`)

- `day` — global day-of-year, 0–364, 0-based (day 0 = Jan 1; consumers map
  `doy = day + 1`), **initialised to the current date**. Drives the scene's
  season state (month + day) and the cards' exact-date readouts with the
  measured history up to today.
- Day events are tagged by source (`'slider' | 'scene'`) so the header slider
  and the in-scene day slider sync without loops; the streak is not part of
  the loop (it never moves the day).
- `zoomed` — the full-year vs 7-day axis toggle, shared by the header and
  both chart types.

## Streak modes (`src/config.ts` → `CONFIG.STREAK.MODE`)

- `'cycle'` — **default**: lightweight `<img>` crossfade cycler, 6 s per
  photo, full photo shown (`object-fit: contain`, never cropped). Chosen
  because the ImgSmear canvas sweep is too much processing load for small
  devices.
- `'smear'` — the full ImgSmear sweep animation (lazy-loaded via
  `defineAsyncComponent` from the `@imgsmear` submodule alias), opt-in.
- `'off'` — hide the strip entirely.

## Vite wiring (`vite.config.ts`) — the non-obvious parts

- `publicDir` → `../orchard/public`: photos, `site.json` assets, textures,
  fonts and the php dir resolve from the orchard tree without copying.
- `define: VITE_WIESE_EMBED = '1'` — without it the orchard module would
  auto-mount a SECOND standalone scene on `document.body` (the standalone
  auto-run is guarded on this flag).
- `watchExternalSources()` plugin adds `../orchard/src` and
  `../ideas/imgsmear/src` to the watcher — Vite only watches its own root,
  so edits to those out-of-root sources would otherwise be served stale from
  the transform cache. A `vite.config.ts` change needs a dev-server
  **restart**, not a page reload.
- Cross-root RUNTIME asset fetches (`new URL(..., import.meta.url)` pointing
  outside the www root) 403 on `server.fs.allow` — import such assets as
  modules instead (e.g. the typeface JSON → static import).
