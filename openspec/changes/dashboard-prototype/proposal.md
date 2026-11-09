# Proposal

## Why

The repo has the ingredients of the new site (orchard 3D, imgsmear streak,
dashboard-plan.md with design tokens) but no prototype of the actual page.
The user picked a layout (`ideas/shot-001.png`) and defined the prototype
scope: heading, two-pane main area (3D left, data right), the 2020/21 weekly
photo series as an imgsmear animation below, month-synced with the 3D
simulation, responsive for desktop 1920×1024 and iPad landscape/portrait
(mobile must work), plus a menu button and an info page crediting
critical-sensors.de and all data/licence sources. This realizes phases 1+3
of docs/dashboard-plan.md as a reviewable prototype.

## What Changes

- `orchard/src/main.ts` refactor: exported `mountOrchard(host, opts)`
  building the identical scene into a given container; standalone mode
  unchanged (existing orchard app keeps working). Embed mode returns a
  controller (`setDay`/`onDay`/`rig`/`scene3`) and hides the standalone
  chrome (compare panel, Kamera panel, footer) while keeping presets, cat,
  sky, compass and the in-scene day slider.
- Data pane: six real-data cards (CO₂, Lufttemperatur, Luftfeuchte, Solar,
  Wind, Boden) fed live from the sensor DB through a PHP endpoint, each with
  a red cursor synced to the global day, plus the Licht & Lichtfarbe card as
  the only dummy (deterministic synthetic curve, labeled "Dummy"): one
  single chart whose intensity (0–100 %) convolutes the RGB colour, and ONE
  combined colour bar (not the three channels separately). Source selection:
  until the orchard's own sensors (Wiese-Verbund id 7) are installed, each
  channel displays the closest available reference sensor — temp/hum/wind
  from the virtual Referenz (id 0; DWD Rheinstetten), CO₂ from id 0 (ICOS
  AS_KIT), solar from SensorCity 116 (id 9), soil from SensorCity 002
  (id 8). Switching later happens in ONE place (the endpoint's channel map).
- New PHP endpoint `orchard/public/php/api.php`: reads the `sensors` table
  (daily min/mean/max per channel) and returns JSON. DB credentials come
  from a `config.ini` next to the script (flat DBUSER/DBPASS/DBSCHEMA/
  DBHOST/DBPORT — the user provides it; a committed template documents the
  format). In development Vite proxies `/php` to a PHP built-in server on
  port 9000; in production the user copies the PHP into
  `/var/www/files/wiese3d/` themselves. Hardened: GET-only, prepared
  statements, server-side channel whitelist, date-range caps, generic JSON
  errors, `.htaccess` denying direct access to `*.ini`.
- New `www/` app (Vue 3 + Vite + TypeScript, dev port 5212): the dashboard
  shell with German-only UI — header (KATZENWEDDELWIESEN — Umweltbeobachtung,
  global "Zeit" day-of-year slider, date readout), 3D pane left, data pane
  right, photo-streak section below, sources footer.
- Photo streak below: the six archived weekly photos
  (20200928, 20201114, 20210117, 20210328, 20210522, 20210607 — all
  1000×750) cycle automatically via imgsmear A→B transitions; the sweeping
  front is the image separator; six date markers allow direct jumps.
- Month synchronisation both ways: a streak transition onto a photo moves
  the 3D simulation to that photo's day-of-year; moving the global slider
  switches the streak to the nearest photo.
- Responsive layout: desktop ≥1024px landscape = two columns (3D ~60% /
  data ~40%); portrait/narrow = single column with data FIRST and 3D
  BELOW, streak last. Touch-friendly targets. Device information via the
  Capacitor Device API (`@capacitor/device`, web implementation) shown on
  the info page.
- Menu button (top-left) opening an info page: link to the predecessor
  project https://critical-sensors.de/ and the full credits/licence list
  (LGL-BW dl-de/by-2-0, Baumkataster + 3D-Gebäudemodell Stadt Karlsruhe
  CC BY 4.0, OSM ODbL, ICOS CC BY 4.0, DWD, ez-tree MIT, Agentshire cat
  MIT, Mohave font, imgsmear), plus device info from the Device API.
- Design tokens from docs/dashboard-plan.md §2b (cz-logo palette gradient,
  red accent, Mohave font self-hosted from `oldwww/fonts/Mohave/`).

## Capabilities

### New Capabilities

- `dashboard-web`: the www/ dashboard shell — layout, global time control,
  embedded 3D pane, data cards, photo streak with month sync, responsive
  behaviour, menu/info page with credits.

### Modified Capabilities

## Impact

- New: `www/` (Vue 3 app; vite `publicDir` → `orchard/public` so photos,
  site.json assets and textures resolve without copying).
- New: `orchard/public/php/` (api.php, dev router.php, .htaccess,
  config.ini.template; the real config.ini is gitignored).
- Modified: `orchard/src/main.ts` (mountOrchard export + embed mode; risky —
  TDZ/`__scene3` pitfalls; standalone must be regression-verified), 
  `orchard/README.md`, root `README.md` layout table.
- Modified (submodule): `ideas/imgsmear/src/components/ImgSmear.vue` gains
  an optional `wrapped` emit (backward-compatible) so the host can chain
  the 6-photo sequence — commit inside the submodule first, then bump the
  gitlink in wiese. www imports the component from the submodule path.
- New dependency (www): `vue`, `@capacitor/device`, `vite`, `typescript`,
  `@vitejs/plugin-vue`; `three` pinned to the orchard version 0.170.
- Real sensor data IS in scope for the data pane (via the PHP endpoint;
  the JSON-cache alternative `refSensors --json` from dashboard-plan.md is
  dropped). Sensor markers, the embedded 3D mount, the photo streak and the
  render-vs-photo comparison stay later-phase work within this change.
