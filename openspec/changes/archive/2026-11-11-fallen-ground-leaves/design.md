# Design

## Context

Trees are built per season into `seasonGroups` (trees.ts); leaf texture per species comes from `getLeafTexture(type)` (`/textures/leaves/<type>.png`, cached); per-season look comes from `seasons.ts` tables (`leafFactor`, `tint`) keyed by day range. Grass masks thicket, wind toggles rebuild groups. Litter plugs into this season-group pattern.

## Goals / Non-Goals

- Goals: static per-tree leaf patch, correct species texture, seasonal tint + visibility, deterministic rebuild.
- Non-Goals: physics or animation, accumulating litter over years, litter inside the thicket wood, snow interaction.

## Decisions

- **Where**: new `buildGroundLeaves(tree entry, season)` helper in `trees.ts`, litter added to each per-season tree group right beside each generated tree. Alternative (separate `leaves.ts` module like grass.ts) rejected: litter shares the leaf texture cache and season rebuild lifecycle with trees, so keeping it in the same rebuild teardown avoids duplicate cache wiring.
- **Geometry**: one `InstancedMesh` of flat quads (or small `PlaneGeometry` sprites) per species per season group, positioned via seeded `rng()` scatter in a ring around the trunk. Cheap: a few dozen quads × ~40 trees. Alternative (individual mesh per leaf) rejected — too many draw objects.
- **Alignment**: quads laid flat on the terrain, sampled at 3 points so they slope with the ground; lift 0.02–0.05 m above terrain to avoid z-fighting.
- **Materials**: per-species leaf texture tinted with litter season color; MeshBasicMaterial-like unlit double-sided blend under test, fall back to lit with alphaTest matching eztree leaf sprites. Dumped into per-season group so `disposeTrees()` teardown covers geometry/material (textures stay cached).
- **Params**: `CONFIG.TREES.GROUND_LEAVES = { COUNT_MIN, COUNT_MAX, RADIUS_MIN, RADIUS_MAX, START_DAY, TINTS }`, sized so litter "not very many, just in some area around each tree".
- **Season mapping**: litter appears at day ≥ 290 (`midAutumn` anchor) with tint 0xb08a3e; 0xc77f3a from day 305; keeps lateAutumn tint through dormant/winter; removed for spring–earlyAutumn builds. Simple per-season table in config.

## Risks / Trade-offs

- [Quads z-fight with grass blades] → offset above terrain and grass blades push through naturally; acceptable visually.
- [Per-species instanced meshes × seasons add build time] → counts tiny; reuse leaf texture cache; only autumn/dormant seasons actually contain litter, spring builds skip it.
- [Rebuild determinism] → scatter seeded per tree (existing `entry.seed` or site `sceneRng` clone) so rebuild reproduces placement.

## Migration Plan

Single-commit visual feature; rollback by setting `CONFIG.TREES.GROUND_LEAVES.COUNT_MAX` to 0 (builder early-outs) or reverting trees.ts/config.ts.

## Open Questions

Preferred finish (unlit vs alphaTest-lit sprites) resolved during implementation against screenshots.
