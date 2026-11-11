# Proposal

## Why

The trees beside the three Hocksitz towers are fruit trees — from late September their crowns carry the crop, which the 3D view currently lacks entirely.

## What Changes

- Add in-crown apples: a modest scatter of small apple props hanging at branches and twigs in the crown of the three orchard trees next to the three Hocksitz structures (`bk02600` ~19.9/8.6, `bk02602` ~26.0/-1.1, `bk02801` ~16.2/0.1 — IDs fixed in config so the selection stays editable).
- Seasonal gate: apples visible from late September (~day 268) through mid October (~day 285); none otherwise.
- Apples are anchored to each tree's own skeleton: anchor points are sampled from the generated tree's outer branch/leaf geometry (eztree exposes `tree.branches` / `tree.leaves` buffers), so each apple visibly sits at a branch/twig rather than floating or on the ground; small hanging offset below the anchor.
- Static, seeded per tree (deterministic across rebuilds), no physics/animation; apples ride the existing per-season group teardown in `trees.ts`.
- Density via new `CONFIG.TREES.CROWN_APPLES` entries (tree ID list, count, day window) with modest defaults.

## Capabilities

### New Capabilities

- `orchard-tree-apples`: seasonal apples hanging in the crowns of selected orchard trees, anchored to the tree's own branch/twig skeleton, static and deterministic.

### Modified Capabilities

## Impact

- `orchard/src/config.ts`: `TREES.CROWN_APPLES` section.
- `orchard/src/trees.ts`: crown-apple builder called from the per-season tree loop after each tree generates; shared instanced-geometry/teardown pattern reused.
- No eztree changes (only reads its exposed geometry), no site.json change, no new dependencies.
