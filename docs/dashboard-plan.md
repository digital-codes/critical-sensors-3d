# Katzenwedelwiesen Dashboard — Design Plan (v0.1, for review)

Status: **proposal** — written while away; nothing implemented yet.
Target: the new German-only dashboard for critical-sensors.de, integrating the
Three.js orchard model, the imgsmear comparison bar ("Streak-Balken"), and
ICOS ERIC time-series data.

---

## 1. Core idea: one global time control drives everything

A single **Zeitregler** (day-of-year + hour slider, default: now) is the
dashboard's spine. It simultaneously drives:

1. **3D model** — season (leaves, grass height), snow (lawn-masked Perlin
   patches), sun position (declination model), so the meadow looks like it
   looked on that date.
2. **Time-series charts** — a vertical cursor at that timestamp; hovering or
   dragging a chart moves the global time (bidirectional coupling).
3. **Streak bar (imgsmear)** — image A = weekly reference photo closest to
   that date (from `photos.json`), image B = live 3D render from the same
   camera preset at the same date; the draggable streak compares real vs
   model. Alternate mode: photo vs photo (same vantage, two dates) for
   seasonal change.

This is the dashboard's differentiator: scrub a winter day and the scene
shows bare trees, snow on the lawn only, low sun — while the CO₂ chart shows
that day's curve.

## 2. Data inventory (what refSensors already provides)

`datatools/refSensors.py` (cron ≤ 6 h) merges three sources into
`ref_<ts>.csv` / `co2_<ts>.csv` or the DB:

| Source | Variables | Notes |
|---|---|---|
| **DWD** hourly, station 04177 (Karlsruhe) | `temp`, `hum`, `light` (Sonnenscheindauer), `pres` | UTC timestamps; stale-source guard already in place |
| **ICOS ERIC** atmosphere station **AS_KIT** | `co2` at several sampling heights | Carbon Portal: 1 SPARQL + 1 metadata GET + 1 data fetch per object per run; CC BY 4.0, PID citation required (`ICOS-CITATION.txt`, `updateIcosCitation`) |
| **Local nodes** (wiese sensors) | `co2`, `rssi`, `bat`, per-node `id`/counts | battery + radio quality → also useful as a "sensor health" panel |

Plus `soil.php` (soil moisture path) — to be folded in.

Dashboard never talks to DWD/ICOS directly: the cron writes a JSON cache
(`www/data/sensors.json`, one file per variable + meta) that the site fetches.
Rationale: rate-limit rules, PID citation control, and the site stays static.

## 3. Layout (German, single page, mobile-first)

```
┌────────────────────────────────────────────────────────────┐
│ KATZENWEDELWIESEN — Umweltbeobachtung        [Zeit: ─●─  ] │  ← global time
├───────────────────────────────────┬────────────────────────┤
│                                   │  CO₂ (ICOS AS_KIT)     │
│   3D-Modell (Three.js orchard)    │  ~~~╱~~~╲___ cursor    │
│   [Südende|Erhöht|Nordwest|Frei]  │  Lufttemperatur (DWD)  │
│   Sensor-Marker ● ● ●             │  ~~~~╱╲~~~~            │
│                                   │  Bodenfeuchte          │
│                                   │  ~╲__╱~~               │
├───────────────────────────────────┴────────────────────────┤
│  Vergleich: [Foto 2026-06-14 | Streak ▮ | 3D-Render]       │  ← imgsmear
├────────────────────────────────────────────────────────────┤
│  Quellen & Lizenzen (ICOS PID-Links, LGL, Stadt KA, OSM)   │
└────────────────────────────────────────────────────────────┘
```

- **Sensor-Marker** in the 3D scene at measured node positions; click →
  scroll to + highlight that node's chart; click a chart title → pulse the
  marker.
- **Sensor health strip** (optional phase 2): battery/RSSI per node as small
  bars — cheap, real, useful.
- Charts: **uPlot** (≈50 kB, handles 10k+ hourly points effortlessly);
  German axis labels, UTC→CET conversion on display.

## 4. Components / tech

- **Vue 3 + Vite + TypeScript** — imgsmear is already Vue; the orchard scene
  becomes an embedded component (`<OrchardScene :day :hour>` wraps
  `createOrchard`/`setSeason`/`updateSun`/`snowAmount`), no rewrite needed.
- `src/components/TimeSlider.vue` — global store (Pinia or plain reactive)
  `time = {day, hour}`; every widget subscribes.
- `src/components/SeriesCard.vue` — uPlot wrapper: fetch `/data/<var>.json`,
  cursor sync, PID + licence line under each chart (ICOS rule).
- `src/components/CompareBar.vue` — imgsmear component, photo selection by
  day-of-year from `photos.json` (already indexed with day + camera preset).
- Deployment target: same host as the old site (`oldwww/` layout), static
  build + JSON cache written by cron.

## 5. Licensing / attribution (per widget, not just footer)

- ICOS charts: **CC BY 4.0 + PID** — citation string under each chart from
  the cached `ICOS-CITATION.txt` content (already fetched per data object),
  station AS_KIT named.
- DWD: © Deutscher Wetterdienst,quelle mit URL.
- 3D/imagery: LGL-BW dl-de/by-2-0; Baumkataster + 3D-Gebäudemodell Stadt
  Karlsruhe CC BY 4.0; OSM ODbL.
- Footer sums up; charts carry the specific ICOS PIDs.

## 6. Phases

1. **Shell** — Vue app, global time slider, orchard scene embedded and
   driven by it (reuses the whole existing pipeline).
2. **Charts** — refSensors → JSON cache export (`--json` flag), SeriesCards
   for temp/hum/pres/light/co2/soil with cursor sync.
3. **Streak** — imgsmear integration, photo index reuse, render-screenshot
   mode (canvas → image) for real-vs-model comparison.
4. **Coupling + markers** — sensor positions in the 3D scene, click-through,
   health strip.
5. **Polish** — German copy review, mobile layout, Lighthouse pass.

## 7. Open questions (answer when back — nothing blocking the plan)

- **"erc"** — I read it as **ICOS ERIC** (the consortium; AS_KIT is the
  Karlsruhe atmosphere station already in refSensors). Correct? Or is a
  second source meant (e.g. an ERC/Eddy station)?
- CO₂: plot one sampling height or all? (Data has multiple heights.)
- Bodenfeuchte: is `soil.php` the live source for the wiese nodes, and are
  those nodes' positions surveyable for the 3D markers (from photos like the
  towers)?
- Hosting: same host/path as the old critical-sensors.de site? Any CMS to
  avoid?
- Update cadence: 6 h cron acceptable for the "current" readout, or add a
  lighter 30-min DWD-only refresh?
