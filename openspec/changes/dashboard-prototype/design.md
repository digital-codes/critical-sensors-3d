# Design — dashboard-prototype

## Architecture

```
wiese/
├── orchard/            # 3D app (standalone, unchanged behaviour)
│   └── src/main.ts     # refactor: export mountOrchard(host, opts)
├── ideas/imgsmear/     # submodule: + optional 'wrapped' emit
└── www/                # NEW Vue 3 + Vite + TS dashboard (dev port 5212)
    ├── vite.config.ts  # publicDir '../orchard/public'; alias @imgsmear
    ├── index.html      # de, Mohave font, #app
    └── src/
        ├── main.ts         # createApp, global reactive time store
        ├── styles.css      # design tokens (dashboard-plan §2b) + layout grid
        ├── App.vue         # header / panes / streak / footer / overlay
        ├── components/
        │   ├── TimeSlider.vue    # global day slider (header) + readout
        │   ├── OrchardPane.vue   # div host → mountOrchard(controller)
        │   ├── DataPane.vue      # 6 real SeriesCards + LightCard
        │   ├── SeriesCard.vue    # SVG curve + red cursor + value + source
        │   ├── LightCard.vue     # dummy Licht & Lichtfarbe (single chart
        │   │                     #  + one convoluted RGB colour bar)
        │   ├── StreakPanel.vue   # ImgSmear 6-photo sequencer + markers
        │   ├── MenuButton.vue    # hamburger
        │   └── InfoPage.vue      # overlay: about, credits, device info
        ├── api.ts         # fetch /php/api.php → typed series
        └── data/curves.ts # deterministic Licht dummy series only
```

## Global time store (plain reactive, no Pinia)

```ts
// www/src/store.ts
import { reactive } from 'vue';
export const time = reactive({ day: 190 });
const listeners = new Set<(d: number, src: string) => void>();
export function setDay(d: number, src: 'slider' | 'streak' | 'scene') { ... }
export function onDay(fn) { ... } // subscribers: orchard controller, cards, streak
```
Streak↔slider loop breaker: `setDay(d, src)` listeners ignore events whose
src equals their own origin (streak completion → setDay(..., 'streak') →
streak's own onDay handler is a no-op).

## mountOrchard refactor (the risky part)

`orchard/src/main.ts` becomes:

```ts
export type OrchardController = {
  setDay(day: number): void;
  onDay(fn: (day: number) => void): void;
  rig: CameraRig;
  scene3: Record<string, unknown>;
};
export async function mountOrchard(
  host: HTMLElement | null,
  opts: { embed?: boolean } = {},
): Promise<OrchardController> { /* former main() body */ }
if (!import.meta.env.VITE_WIESE_EMBED) main();
```

- `host`: the pane element — renderer canvas appended there; standalone
  keeps `document.body`.
- `embed: true` skips creating: compare panel, camera UI, footer, season
  panel display toggle stays (it holds the sky dropdown + cat toggle —
  mockup shows the in-scene controls); the cat toggle + sky dropdown stay
  in the scene panel; presets stay in-scene.
- Known pitfalls to respect (wiese skill): TDZ declaration order, `__scene3`
  merges MUST spread, no duplicate `window.__scene3` wholesale assignment.
  In embed mode `window.__rig`/`__scene3` still get set (harmless, useful
  for verification).
- Controller wires `setDay` → the existing `seasonInput.value = day` +
  dispatch the same input handler chain; the scene's own slider dispatches
  `onDay` so both sliders stay in sync.

## Streak sequencer

`StreakPanel.vue` keeps `idx` (0..5), renders `<ImgSmear :img="photos[idx]"
:img-b="photos[(idx+1)%6]" :delay-ms="40" :band="0.12" @wrapped="onWrapped">`
and a marker row of the six date labels („28. Sep 20" …). `onWrapped` →
`idx = (idx+1)%6; setDay(doy(photo[idx].date), 'streak')`. Because ImgSmear
watches `img`/`imgB` and rebuilds live, advancing the pair restarts the
sweep onto the next image (with tgl=false, always forward). Day→streak:
watch global day, if `doy(dist(current photo day, d))` exceeds half the
year gap… simple rule: switch to `argmin |doy(photo) - day|` (circular),
update pair to (photo, next photo). Guard flag `syncing` prevents the
emitted setDay from re-triggering the watcher.

ImgSmear.vue change (submodule): after wrap detection in both renderers,
`emit('wrapped', direction.value)`; keep default-off behaviour identical.
Commit inside the submodule first, then bump the gitlink in wiese.

## Sensor data API (PHP)

`orchard/public/php/api.php` (PHP ≥ 7.4, `declare(strict_types=1)`):

- `parse_ini_file(__DIR__.'/config.ini')` — flat keys DBUSER, DBPASS,
  DBSCHEMA, DBHOST, DBPORT (matches the file the user placed in
  `/var/www/files/wiese3d/`; prod = copy api.php next to it).
- Channel map as the ONLY switch point (`$CHANNELS`): channel key →
  `['id', 'col', 'unit', 'source', 'licence']`, e.g. temperature →
  id 0/`temp` (DWD Rheinstetten), co2 → id 0/`co2` (ICOS AS_KIT), solar →
  id 9/`solar` (SensorCity 116), wind → id 0/`wind` (DWD FF_10), soilMoist/
  soilTemp → id 8 (SensorCity 002). When the orchard sensors are installed,
  point the keys at sensor id 7 (Wiese-Verbund) — frontend unchanged; card
  subtitles update from the returned `source` strings.
- Params: `channels` (comma list, default all; unknown → 400), `from`/`to`
  (`YYYY-MM-DD`, regex + `strtotime` validated, span capped at 800 days;
  default: per-channel data range). Query per channel, prepared:
  `SELECT DATE(date) d, AVG(col), MIN(col), MAX(col) FROM sensors
  WHERE id=? AND col IS NOT NULL AND date BETWEEN ? AND ? GROUP BY d` —
  `col`/`id` come from the whitelist only, never from the request.
- Response: `{ok, generated, channels:{key:{sensor,column,unit,source,
  licence,range,days:[[date,avg,min,max],…]}}}`.
- Hardening: GET only (405 otherwise); PDO with
  `ATTR_EMULATE_PREPARES=false`, utf8mb4 DSN; `display_errors` off, all
  failures → generic `{"ok":false,"error":…}` JSON with 4xx/5xx (details
  only to `error_log`); `Content-Type: application/json; charset=utf-8` on
  every response incl. errors; `X-Content-Type-Options: nosniff`; no CORS
  header (same-origin; dev goes through the Vite proxy); no sessions/cookies;
  read-only usage (recommend a read-only DB user in config.ini).
- `router.php` for the dev built-in server (`php -S 127.0.0.1:9000 -t
  orchard/public/php router.php`): executes only PHP files, 403 for
  `*.ini`/dotfiles, 404 otherwise. `.htaccess` (prod Apache):
  `Require all denied` for `*.ini` + `Options -Indexes`.
- Vite dev proxy (orchard + www configs): `'/php' → 'http://127.0.0.1:9000'`.

## Data pane (real data + one dummy card)

`www/src/api.ts` fetches `/php/api.php?channels=temperature,humidity,co2,
solar,wind,soilMoist,soilTemp` once; DataPane distributes series to cards.
`SeriesCard.vue` (real): SVG polyline of daily means (x = doy/365, y =
value scale), red cursor line at the global day, month ticks Jan Mär Mai
Jul Sep Nov, readout = value at the cursor day (nearest day ±2, else "—").
Boden card renders BOTH series (soilMoist % solid, soilTemp °C secondary
scale) with a combined readout. Curves only span the data that exists —
before the first / after the last day the curve is absent but the axis
stays the fixed Jan–Dec year.

`LightCard.vue` (dummy, `curves.ts`): deterministic mulberry32 series —
intensity (0–100 %, seasonal solar curve + seeded noise) and a slowly
varying RGB triplet; plotted colour = rgb × intensity/100 (100 % = max).
One chart (365 bars), ONE colour bar beneath built from the same per-day
convoluted colours; label "Dummy-Daten — Wiesenstation (geplant)".

## Capacitor Device

`@capacitor/device` (web implementation, no native build needed):
`Device.getInfo()` + `screen.width/height` on the info page
("Gerät: Web-Browser · macOS · 1920×1024"). No Capacitor runtime shell —
the API is used for its device readout as specified.

## Layout / breakpoints

- `--pane-3d: 60fr / --pane-data: 40fr` grid columns ≥1024px landscape.
- `@media (max-width: 1023px), (orientation: portrait) and (max-width: 1366px)`:
  single column `grid-template-areas: header, data, scene3d, streak`.
- Header: 3-part flex (title / slider / readout); slider min touch target
  44 px; fixed-width readout (tabular-nums — the fixed-width UI rule).
- Tokens from dashboard-plan §2b: body gradient #d8d1a5→#9a8700, red
  #f93822 accents, near-black text on translucent white cards, Mohave
  (copy woff2/ttf from `oldwww/fonts/Mohave/` into `www/public/fonts/`).

## Verification

- Playwright viewports: 1920×1024, 1024×768 landscape, 768×1024 portrait,
  390×844 phone — assert pane geometry (3D right of data on landscape;
  data above 3D on portrait) via bounding boxes.
- Slider→scene: set day 15 → season label "Winter", cards' cursor at Jan,
  streak shows 20210117; streak completes onto 20210522 → scene day 142.
- Streak wrap: force `idx` advance, assert next pair loaded (canvas
  redrawn, marker active class moves).
- Info page: menu click → overlay with critical-sensors.de link + credits
  + device readout; streak paused while open.
- Standalone orchard regression: 5199 loads, season label suffix '·',
  `__scene3` keys include terrain/grass/structures/buildings/thicket/
  flight/orchard/cat, cat toggle works, compare panel + Kamera panel
  present (unchanged chrome).
- `npm run build` (www) and `tsc && vite build` (orchard) clean.
- Screenshots to the user for the visual verdict (mockup comparison).
