# Tasks

## 1. Baseline capture (before any edit)

- [x] 1.1 Start the dev server (`npm run dev -- --port 5199 --host 127.0.0.1`, background) and verify port ownership (`ss -tlnp | grep :5199` lists this session's npm child)
- [x] 1.2 Capture reference screenshots at two deterministic poses — preset `erhoeht` (or `vergleich`) with day-of-year 190 (summer) and day-of-year 15 (winter) — via `window.__rig` + the day slider, store under `orchard/screenshots/config-ref-*.png`
- [x] 1.3 Record a numeric probe bundle for both days (flight `seek(0.5)` camera pose + `__buildId` + scene keys) and save the JSON next to the screenshots (`config-ref-probe.json`)

## 2. Create the config module

- [x] 2.1 Write `orchard/src/config.ts`: header comment with the admission rule (generated site data → site.json; app tunable → here; algorithm-internal → local constant with comment), `export const CONFIG = { ... } as const` with sections `SUN`, `SCENE`, `CAMERA`, `FLIGHT`, `SKY`, `GRASS`, `SEASONS`, `STRUCTURES`, `TREES`, `BUILDINGS`, `UI`, `DEBUG` — values transcribed verbatim from the design.md inventory
- [x] 2.2 `npm run build` passes with the new module unused (type-check only)

## 3. Rewire modules (logic stays, data moves)

- [x] 3.1 `flight.ts` — WAYPOINTS + DURATION_S/BOB/SWAY/LOOK/YAW tuning import from `CONFIG.FLIGHT`; delete the local declarations
- [x] 3.2 `main.ts` — solar params, shadow frustum, ambient/hemisphere lights, sky colour + fog, month names/lengths, `__buildId` string import from `CONFIG` (SUN/SCENE/UI/DEBUG sections); delete locals
- [x] 3.3 `sky.ts` — CLOUD_COUNT/CLOUD_SPAN/GROUND_Y + dome colours/radius/cloud band from `CONFIG.SKY`; delete locals
- [x] 3.4 `grass.ts` — COUNT/BLADE_W/height range/SNOW_TINT/SEASON_TINT from `CONFIG.GRASS`; delete locals
- [x] 3.5 `seasons.ts` — SEASONS table from `CONFIG.SEASONS`; keep `SeasonDef` type + interpolation logic in the module
- [x] 3.6 `structures.ts` — material colours + shared post/rail/slat dims from `CONFIG.STRUCTURES`; per-builder deck ratios and loop-step micro-numbers stay local WITH a comment (geometry detail, not settings)
- [x] 3.7 `camera.ts` — fov/near/far, damping, polar margin, preset labels from `CONFIG.CAMERA`; presets still read only site.json `cameraPresets`
- [x] 3.8 Grep sweep + stragglers: `trees.ts` (SIZE_SCALE + 6.0 default → `CONFIG.TREES`), `buildings.ts` (ROOF_TINT), `compare.ts` (season labels → `CONFIG.UI`); `git diff` shows only deletions of literals + additions of imports

## 4. Verification

- [x] 4.1 `npm run build` passes (tsc + vite, no type errors)
- [x] 4.2 Dev-server probe: same two poses (preset + day 190 / day 15) render; `window.__rig`/`__scene3`/`__buildId` hooks unchanged (`__buildId` string identical, scene keys identical)
- [x] 4.3 Bird flight deterministic check: `__scene3.flight.seek(0.5)` + fixed camera readout equals the pre-change pose at the same seek value (bit-identical both days)
- [x] 4.4 Grep acceptance: config literals (`DURATION_S`, `WAYPOINTS`, `CLOUD_*`, `BLADE_*`, `23.44`, `48.9899`, material hexes, build id) appear only in config.ts + comments in the consuming modules
- [x] 4.5 (added during apply, user-directed) Fixed-seed option for exact verification: `?seed=<n>` URL param → mulberry32 (`src/rng.ts`) wired through grass + sky (the only random consumers; trees are site-seeded). Seeded A/B against the pre-refactor tree (git worktree at faca603 with identical wiring, port 5198): summer mean|diff| 0.012/255 (0.085 % pixels >8 = AA jitter), winter 5 pixels — pixel-identical

## 5. Ship

- [x] 5.1 Update `orchard/README.md` (Run section: config.ts as the constants home with the admission rule; `?seed=` determinism option)
- [x] 5.2 Commit; per skill convention the trace is this OpenSpec change (no backfill of past direct commits); nothing synced to Nextcloud (orchard is not mirrored)
- [x] 5.3 Archive the change (`openspec archive orchard-config-extraction -y`) after the final verification commit
