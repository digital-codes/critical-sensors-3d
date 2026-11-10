# Tasks

## 1. Config and toggles plumbing

- [x] 1.1 Add `CONFIG.PERFORMANCE` group (`GRASS: true`, `TREE_WIND: true`) to `orchard/src/config.ts`; verify `npm run build` (tsc) passes and the group is the only new constant home
- [x] 1.2 Thread the flags through `mountOrchard()` so `createGrass`/`createOrchard` receive them; verify with defaults ON the startup console log shows the same counts as before (90k-placed grass line, 39 trees)

## 2. Grass toggle

- [x] 2.1 In `orchard/src/grass.ts`: when the flag is off, load the lawn mask, skip blade geometry/InstancedMesh/placement entirely, and return a `Grass` object with `mesh` absent (or a dummy never added), no-op `update`/`setSeason`, working `getLawnMask`; verify `main.ts` season calls and snow mask handoff run without errors
- [x] 2.2 Guard `main.ts` scene add / animation-loop calls for the grass-off shape; verify winter day (e.g. day 340): snow renders on the meadow exactly as with grass on, and no blades exist (scene graph check)

## 3. Tree wind toggle

- [x] 3.1 In `orchard/src/eztree/tree.js`: add a wind flag (options) so `#createLeafMaterial` skips the sway/simplex injection when off; verify a generated wind-off tree has a plain leaf material (no `userData.shader`) and `update()` stays null-safe
- [x] 3.2 In `orchard/src/trees.ts`: accept the flag per generation and expose a rebuild path that re-generates season groups with cached bark/leaf textures; verify rebuild keeps tree count, positions and season visibility identical (seeded `?seed=`)

## 4. Runtime switch surface

- [x] 4.1 Add controller functions in `orchard/src/main.ts` (grass off→on recreates blades; on→off removes them; wind switch triggers tree rebuild) and mirror them on `window.__scene3` following the sky hook pattern; verify switching each toggle at runtime with no page reload and correct end state both ways
- [x] 4.2 Add the two German-labelled checkboxes to the dashboard (www) wired to the controller, reading initial state from it; verify toggles in the embedded dashboard view switch the scene and reflect the config defaults on load

## 5. Integration verification

- [x] 5.1 Run the seeded pixel-comparison (`?seed=`) with both toggles ON against a pre-change build; verify pixel-identical default rendering
- [x] 5.2 Exercise all four toggle combinations in a dev server session at the Südende preset and a winter day; verify per spec scenarios (blades/snow/wind independence) and note the grass-off eye-level look in the change for review
