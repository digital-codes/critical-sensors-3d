# Proposal: Independent grass and wind toggles for weaker devices

## Why

The ~90k instanced grass blades (transparent, DoubleSide, never frustum-culled) and the per-leaf-vertex simplex wind shader are the scene's two biggest GPU consumers. On small devices they cost frame rate without being essential to the scene's purpose. Grass and wind should be switchable independently so weaker devices can trade them away, with the meadow's aerial orthophoto (already draped on the terrain) serving as the ground when blades are off.

## What Changes

- Add two independent performance toggles to the orchard scene:
  - **Grass on/off** — off means the instanced blades are not created at all; the terrain's aerial texture (already covering the whole window) is the ground. The lawn mask stays available for the winter snow gate regardless of the toggle, so snow rendering is unaffected.
  - **Tree wind on/off** — off means leaf materials are compiled without the sway/wind shader injection (trees stay fully visible, just static). Setting wind strength to zero is explicitly NOT the mechanism: the noise would still execute.
- Defaults for both toggles live in the central config (`orchard/src/config.ts`), per the project's config admission rule; both default to ON (current look unchanged).
- Dashboard (www) gets UI toggles that switch grass and wind at runtime without a page reload.
- Programmatic control hook on the existing scene handle (`window.__scene3`), following the sky-condition precedent, so tooling can drive/read both toggles.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `orchard-3d-view`: The "Ambient scene dressing" requirement (meadow grass, wind-animated; tree wind sway) gains independent on/off toggles with config defaults, dashboard UI, and a programmatic hook. Snow gating and the season system must keep working when grass is disabled.

## Impact

- `orchard/src/grass.ts` — toggle-aware creation (skip blades, still own/expose the lawn mask), no-op-safe `setSeason`/`update`.
- `orchard/src/trees.ts` + `orchard/src/eztree/tree.js` — wind-off leaf material variant (no sway shader compiled); trees.ts threading the flag.
- `orchard/src/config.ts` — new config group for the two defaults.
- `orchard/src/main.ts` — wiring: read config defaults, apply before scene build, expose runtime switch + `window.__scene3` hook, guard season/grass calls.
- `orchard/src/terrain.ts` — snow mask path decoupled from grass blade existence (lawn mask source).
- `www/src` — dashboard toggle UI (component driving `mountOrchard`'s controller / `window.__scene3`).
- Season panel and compare mode: unchanged behavior regardless of toggles.
