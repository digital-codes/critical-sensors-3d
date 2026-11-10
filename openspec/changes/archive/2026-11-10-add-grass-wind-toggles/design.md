# Design

## Context

The orchard scene (`orchard/src`) renders ~90k instanced grass blades
(`grass.ts`, `CONFIG.GRASS.COUNT`) and 39 ez-tree trees whose leaves carry a
simplex-noise wind sway compiled into the leaf material's vertex shader
(`eztree/tree.js` `#createLeafMaterial`). Both are always-on today.

Key constraints found in the code:

- The lawn mask is loaded and owned by `grass.ts` and passed to the terrain
  snow gate via `grass.getLawnMask()` (`main.ts` passes it into
  `terrain.ts`). Grass-off must not break snow.
- `main.ts` calls `grass.setSeason(day)` unconditionally on load and on
  season changes (`main.ts:462`, `main.ts:570`); the animation loop calls
  `orchard.update(t)` and `grass.update(t)` every frame (`main.ts:673-674`).
- `www` mounts the orchard scene via `mountOrchard()` from
  `orchard/src/main.ts` (`www/src/components/OrchardPane.vue`) and drives it
  through the returned controller / `window.__scene3`.
- Project conventions: all app tunables live in `orchard/src/config.ts`
  (single constants home); runtime hooks follow the sky-condition precedent
  (`window.__scene3.sky.setCondition` / `.condition`); seeded
  pixel-comparison (`?seed=`) is the standard regression method.

See proposal.md for motivation, spec.md for the behavior contract.

## Goals / Non-Goals

**Goals:**

- Two independent toggles (grass, tree wind), runtime-switchable, config
  defaults, real GPU savings when off.
- Snow gate and season system unaffected by either toggle.

**Non-Goals:**

- No intermediate quality tiers (e.g. reduced blade counts) — on/off only.
- No automatic FPS-watchdog / device detection.
- No new ground asset: the existing aerial-drapped terrain is the grass-off
  ground.
- No shadow/pixel-ratio or other renderer-level quality settings.

## Decisions

### D1: Grass off = skip blade creation; grass module still owns the lawn mask

`createGrass()` reads the toggle (via an options/flag argument from
`main.ts`). When off it skips mask-independent work: no blade geometry, no
InstancedMesh, no placement loop — but still loads `lawn_mask.png` and
returns a `Grass` object whose `getLawnMask()` works and whose `update()` /
`setSeason()` are no-ops. Alternative considered: extracting the mask into
its own module — rejected as a bigger refactor touching terrain.ts for no
behavioral gain; revisit if grass.ts grows more mask consumers.

### D2: Wind off = compile leaf materials without the sway injection

A flag threaded from `main.ts` → `trees.ts` → `Tree` (eztree
`#createLeafMaterial`): when off, `onBeforeCompile` does not inject the
simplex code or replace `#include <project_vertex>` — the leaf material is
a plain `MeshStandardMaterial`. This is a generation-time decision because
materials are built during `createOrchard`; runtime toggling wind is
implemented by rebuilding the season groups (39 trees × 4 variants
regenerate in the same staggered way as startup, reusing cached
bark/leaf textures). Alternative: a uniform branch (`#ifdef` or `if
(uWindEnabled)`) keeping one material — rejected: the GPU still executes
the noise, so the savings would be cosmetic.

### D3: Toggle state and switch surface

State lives in a small `CONFIG.PERFORMANCE` group: `GRASS: boolean`,
`TREE_WIND: boolean` (both default `true`). Runtime switching goes through
`mountOrchard`'s returned controller (and mirrors onto `window.__scene3`,
e.g. `window.__scene3.performance.setGrass(bool)` /
`setTreeWind(bool)` plus boolean getters), following the sky-condition
hook pattern. Grass re-creation is cheap (one InstancedMesh build); wind
re-creation uses the existing staggered tree build.

### D4: Dashboard UI in www

Two German-labelled checkboxes in the existing dashboard panel area (same
pattern as the Katze toggle in the orchard panel) wired to the controller
functions. The dashboard does not duplicate defaults; it reads the initial
state from the controller so config remains the single home.

### D5: Season/loop guards

`main.ts` guards `grass.setSeason()` and the per-frame `grass.update()`
calls through the existing `Grass` interface (no-ops when off) rather than
adding conditionals at every call site. `trees.update(t)` remains called
every frame; with wind off the per-tree `update()` finds no leaf shader
uniforms and returns (already null-safe, `tree.js:41-46`).

## Risks / Trade-offs

- [Ground-level views (Südende preset) may look flat without blades — the
  aerial at 5 px/m is soft at eye height] → accepted per user decision
  (grass off is a conscious battery/FPS trade); if review disagrees, a
  lawn-cell tint on the terrain texture is a cheap follow-up, out of scope
  here.
- [Wind toggle at runtime rebuilds 156 tree variants] → staggered build
  keeps the page responsive; bark/leaf textures are cached, so rebuild is
  meshing only. If rebuild latency proves annoying, restrict wind switching
  to before-generation and say so in the UI (decide during apply; spec only
  requires "without a page reload").
- [Determinism] → toggle state must be part of the seeded pixel-comparison
  setup; toggles change the scene deliberately, so comparisons are run
  per-toggle-state, not against off-state builds.

## Migration Plan

Pure additive feature; both defaults ON mean existing deployments and the
seeded verification pipeline render identically. Rollback = revert; no
data, asset, or API changes.

## Open Questions

None deferred — the grass-off visual (aerial ground, no replacement asset)
and the manual-toggle-only trigger were decided with the user during
exploration.
