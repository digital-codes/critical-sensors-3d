# Proposal

## Why

Around October/November the scene's trees but the ground stays clean: canopies thin from `midAutumn` through `lateAutumn` (seasons.ts calendar) yet nothing falls to earth. Scattered fallen leaves give the orchard the seasonal grounding the canopy thinning implies.

## What Changes

- Add a static "ground leaf litter" layer: a few dozen flat leaf sprites scattered in a small patch around each rendered orchard tree (not across the whole meadow).
- Leaf sprites reuse the same leaf texture per species (`getLeafTexture(t.options.leaves.type)`, already cached in trees.ts) so shape matches the canopy foliage.
- Leaf color follows the season tint of the period in which they fell:
  - `midAutumn` (day 290): tint 0xb08a3e
  - `autumn` (day 305): tint 0xc77f3a
  - `lateAutumn` (day 320): tint 0xc77f3a
  - `dormant`/`winter` (day 335+, day 15): keep the lateAutumn litter, slightly reduced count assumed (snow/grass handling already independent), bare trees keep last litter
  - before `midAutumn` (spring/summer/earlyAutumn): no litter
- Ground leaves are completely static meshes: no sway shader, no per-frame movement, no interaction with wind or grass physics.
- Litter follows terrain height via the existing height sampler; litter patch is placed on the lawn area but does not need to respect the grass lawn mask (leaves may lie on grass blades; blades are already seasonal and static).
- Density/extent controlled by new `CONFIG.TREES.GROUND_LEAVES` entries (count, radius, seasonal thresholds) with modest defaults.

## Capabilities

### New Capabilities

- `orchard-ground-leaves`: static fallen-leaf litter patches at the base of each orchard tree, keyed to leaf species texture and the seasonal fall calendar.

### Modified Capabilities

## Impact

- `orchard/src/trees.ts`: new litter builder reused across season groups (supports the existing per-season group pattern and wind/season rebuild teardown).
- `orchard/src/config.ts`: new `TREES.GROUND_LEAVES` config section and possibly season-table annotation.
- `orchard/src/seasons.ts`: minor — export per-season litter parameters (or embed thresholds in config) if the litter builder needs them.
- No changes to grass.ts, thicket.ts, or physics; no data or texture additions (existing `/textures/leaves/*.png` reused).
