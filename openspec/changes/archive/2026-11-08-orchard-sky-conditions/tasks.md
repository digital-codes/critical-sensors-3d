# Tasks

## 1. Config

- [x] 1.1 `config.ts`: add `CONFIG.SKY.CONDITIONS` with the four presets (klar, heiter, leichtBedeckt, gewitter) incl. `LABEL`; add `CONFIG.SKY.DEFAULT_CONDITION: 'leichtBedeckt'`; remove the superseded `CLOUD_COUNT` (moved into the default condition's values)
- [x] 1.2 Import `mulberry32` availability for sky.ts (rng.ts already exports it)

## 2. sky.ts

- [x] 2.1 Initial cloud build reads count/opacity/tint from the default condition (same rng call order → default load unchanged)
- [x] 2.2 `setCondition(key)`: dome uniforms, dispose old sprite materials (keep shared textures), respawn clouds with `mulberry32(0xc10d + index)` condition-stable rng; ignore unknown keys
- [x] 2.3 Extend the `Sky` interface with `setCondition(key: string): void`

## 3. main.ts

- [x] 3.1 Capture hemisphere/ambient base intensities; condition factors applied on switch; `SUN_FACTOR` multiplies inside `updateSun` (re-call on switch)
- [x] 3.2 Fog + background colour follow the condition's `FOG` (fog + background share the THREE.Color; `SCENE.SKY_COLOR` superseded by the default condition's `FOG`)
- [x] 3.3 Dropdown `<select>` next to the day slider (labels from conditions, default selected), change event → apply
- [x] 3.4 Debug hook `window.__scene3.sky = { setCondition, condition }` (also fixed the snow-parts hook to spread-merge instead of wholesale assignment, which had been wiping earlier keys)

## 4. Verification

- [x] 4.1 `npm run build` (tsc + vite) clean
- [x] 4.2 Default-identity: winter full-generation capture of the new build vs the v0.8.1-orchard worktree (seed 42, 1600×1000): mean|diff| 0.0011/255, 0.0006 % pixels >8 (max 29) — pixel-identical; summer sky band exactly 0 (ground shows tree wind-sway only). Earlier "flight-ready" waits capture BEFORE tree generation finishes — the season-panel-visible wait is the correct full-generation signal
- [x] 4.3 All four presets render coherently (day 190, seed 42): sky-band means klar RGB(87,126,202) / heiter (112,144,194) / gewitter (44,50,58); storm visibly dark, klar visibly blue
- [x] 4.4 Dropdown works in-page (change event → condition switch, hook readback `__scene3.sky.condition === 'gewitter'`); hook switches to the same look
- [x] 4.5 Switch-back determinism: spawn-layout positions equal for klar→heiter→klar and gewitter→gewitter within one synchronous evaluation (klar 2 sprites, gewitter 18)

## 5. Ship

- [x] 5.1 README: "Sky conditions" section (presets, dropdown, hook) + "Bird-flight video export" section (tools/render_flight_video.py, imageio-ffmpeg x264 recipe, why openh264 output fails in VLC)
- [x] 5.2 Checked-in render script `orchard/tools/render_flight_video.py` (frames via Playwright, mux via imageio-ffmpeg libx264 High@4.0 CFR)
- [x] 5.3 Commit + tag; archive the openspec change
