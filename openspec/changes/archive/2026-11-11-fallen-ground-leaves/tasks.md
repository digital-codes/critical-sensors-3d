# Tasks

## 1. Config

- [x] 1.1 Add `CONFIG.TREES.GROUND_LEAVES` to `orchard/src/config.ts` (MIN/MAX count, min/max radius, start day 290, tint-per-season map; follow existing comment style). Verify: `npm run dev` in `orchard/` starts without schema errors and config reads console-checked.

## 2. Litter builder in trees.ts

- [x] 2.1 Add `buildGroundLeaves(entry, season)` helper in `orchard/src/trees.ts` that creates a seeded static scatter of flat leaf quads around the trunk on terrain height, using the species leaf texture from the existing cache and the season tint map. Verify: logged instance counts per tree match config bounds for autumn builds.
- [x] 2.2 Wire the helper into the per-season tree loop so litter meshes join each `seasonGroup.get(season.key)` beside the tree; skip for spring–earlyAutumn; teardown must dispose litter geometry/materials with trees (texture stays cached). Verify: runtime wind rebuild path tears down and regenerates without leaked meshes/logs.
- [x] 2.3 Verify litter is inert: `grep` confirms no sway shader hookup, no per-frame update calls in the render loop; wind toggle rebuilds reproduce identical scatter (seeded).

## 3. Visual verification

- [x] 3.1 Screenshot the scene with season day 190 (summer), 290, 305, 335, 15: no litter in spring/summer/early autumn; autumn patches present with autumn tints; winter keeps litter. Compare against existing screenshots in `orchard/screenshots/`. Verify: `npm run dev` + `__scene3` season slider and screenshot tool.
- [x] 3.2 Confirm leaves lie flat, keep the canopy's species texture/type, low density in a small ring around each trunk, and no z-fighting with terrain/grass at close zoom.

## 4. Checks

- [x] 4.1 `npm run build` (or vite build) in `orchard/` passes; no TypeScript errors in touched files.
- [x] 4.2 `openspec validate --change "fallen-ground-leaves" --strict` passes.
