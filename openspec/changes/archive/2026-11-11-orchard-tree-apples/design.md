# Design

## Context

Follow-up correction to the `orchard-ground-apples` draft: apples belong IN the crowns, not on the ground. The pattern to reuse is the archived `fallen-ground-leaves` work (instanced scatter, per-season groups, seeded teardown) — but anchored to the trees themselves. Generated `Tree` objects expose `tree.branches` / `tree.leaves` `THREE.BufferGeometry` (eztree `tree.js`, used for LOD builds), giving branch ring centres and leaf-clump vertex positions in tree-local space.

## Goals / Non-Goals

- Goals: apples visibly hanging at branches/twigs in the crowns of exactly the three configured trees during the day window, static, deterministic, rebuild-safe.
- Non-Goals: apples on the ground, physics/ripening, eztree modifications, cat interaction.

## Decisions

- **Where**: a `buildCrownApples(tree, entry, season)` helper inside `trees.ts`, called from the per-season tree loop right after the tree generates (it needs that tree's geometry). Alternative (separate module) rejected: same season-group lifecycle/teardown as trees, tiny scope.
- **Anchors**: sample anchor points from the tree's local-space `tree.leaves` vertex positions (leaf clumps cluster at outer twigs, so leaf vertices are good twig proxies); fall back to outer branch geometry rings if leaves are too clustered. Pick `count` random distinct vertices via seeded `mulberry32(entry.seed ^ appleSalt)`. Offset each apple slightly below/toward the anchor and along trunk-outward direction so it hangs plausibly.
- **Geometry**: one shared squashed-sphere apple (~7 cm) with two instanced meshes per listed tree/season group; red material with per-instance colour jitter via `setColorAt` (red/green mix). No textures.
- **Config**: `TREES.CROWN_APPLES = { TREES: ['bk02600','bk02602','bk02801'], DAY_START: 268, DAY_END: 285, COUNT_MIN: 10, COUNT_MAX: 25 }`. Gate by season.day range (independent of the SEASONS tint table).
- **Attachment**: apples added as children of the same season group group beside the tree (not children of the Tree object) so `disposeTrees()` teardown handles them exactly like the litter meshes; shared geometry recreated on dispose (existing pattern).

## Risks / Trade-offs

- [Leaf vertices may cluster mid-air (billboard clump centres)] → hang apples 0.1–0.25 m below the vertex and jitter radially; close-up screenshot pass decides acceptable.
- [Child-of-group shortcuts sorting] → apples in the same season group render with the group; fine at this size.
- [Summer-build trees carry no apples] → intentional: gate is by day; appled variants regenerated per rebuild only for window season groups (static content, no runtime cost).

## Migration Plan

Single-commit visual feature; rollback by emptying `CROWN_APPLES.TREES` or reverting config/trees.ts.

## Open Questions

None.
