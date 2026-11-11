# Tasks

## 1. Config

- [x] 1.1 Add `CONFIG.TREES.CROWN_APPLES` to `orchard/src/config.ts` (tree ID list `bk02600`, `bk02602`, `bk02801`; DAY_START 268, DAY_END 285; COUNT_MIN 10, COUNT_MAX 25; comment style matched). Verify: `npx tsc --noEmit` passes.

## 2. Builder and wiring in trees.ts

- [x] 2.1 Add `buildCrownApples(tree, entry, season)` in `orchard/src/trees.ts`: day-window gate, anchor selection from the tree's local `leaves`/`branches` geometry with hanging offset, seeded scatter, shared squashed-sphere instanced geometry, per-instance red/green colour jitter. Verify: logged instance count within config bounds for in-window builds, zero out-of-window.
- [x] 2.2 Wire into the per-season tree loop (gated on `CROWN_APPLES.TREES.includes(entry.id)`, called after the tree for that season is generated); litter-style teardown reuse (shared geometry recreated on dispose, material disposed, no rebuild leaks). Verify: wind rebuild path runs clean, no console errors, placement identical.

## 3. Verification

- [x] 3.1 Screenshot day 275: apples hang visibly in the crowns of the three configured trees only, anchored at twigs, none floating free, none on the ground. Days 190 / 320: no apples. Verify via dev server + season slider.
- [x] 3.2 Confirm apples are static, deterministic, and attached (no per-frame hooks — `grep` trees.ts shows no apple update calls; `?seed` rebuild reproducibility).

## 4. Checks

- [x] 4.1 `npm run build` in `orchard/` passes clean.
- [x] 4.2 `openspec validate "orchard-tree-apples" --strict` passes.
