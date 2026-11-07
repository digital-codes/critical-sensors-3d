# Proposal

## Why

The orchard 3D app (`orchard/`) keeps tunable configuration verbatim in
module code: the bird-flight waypoints and motion tuning in `flight.ts`,
solar geometry and shadow frustum in `main.ts`, the cloud field and a
guessed ground level in `sky.ts`, grass density and tints in `grass.ts`,
the season table in `seasons.ts`, structure materials/dimensions in
`structures.ts`, camera control limits in `camera.ts`, and a build-id
string in `main.ts`. Changing any of these means hunting through five
modules, and two modules independently hard-code "site ground level"
(115 vs 117 m) without admitting it. Some values ARE already data-driven —
`site.json` carries `cameraPresets`, structure footprints and the window
bounds (`terrain.ts` derives `WIN_*` from it) — so the codebase already has
the right pattern; the remaining values just never followed it.

## What Changes

- Introduce `orchard/src/config.ts` as the single, typed home for all
  app-level configuration constants, organised in named sections (sun,
  camera, bird flight, sky, grass, seasons, structures, debug).
- Move every verbatim configuration value from the modules into
  `config.ts` and replace the in-code literals with imports from it.
  `flight.ts` waypoints/tuning, solar/shadow parameters, sky/grass/seasons
  tables, structure materials and construction dimensions, camera control
  limits and the debug build-id all move; nothing is duplicated.
- Keep `site.json` as the home of site-anchored, generated data (window
  bounds, origin, camera presets, structure footprints, tree register) —
  no values move INTO code that belong to the generated-geodata file, and
  the existing `cameraPresets`/footprint consumers stay JSON-referenced.
- Pure refactor: pixel-identical rendering and identical runtime behaviour
  (verified by build + browser probe), no public API changes to the
  `window.__rig` / `window.__scene3` hooks.

## Capabilities

### New Capabilities

(none — this is a pure refactor with no externally observable behaviour
change; `skip_specs: true` is set in `.openspec.yaml`)

### Modified Capabilities

(none)
