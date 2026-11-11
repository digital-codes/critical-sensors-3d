# orchard-ground-leaves Specification

## Purpose

Static fallen-leaf litter on the ground around each orchard tree, matching the species' leaf texture and the tint of the season that sheds it, so canopy thinning from mid-autumn onward is mirrored at ground level.

## Requirements

### Requirement: Seasonal ground litter around each tree

The orchard scene SHALL render a small scattered patch of flat leaf sprites on the terrain around each rendered orchard tree whenever the active season day is at or after the mid-autumn leaf-fall anchor (CONFIG season calendar), and SHALL show no litter before that anchor.

#### Scenario: No litter in leaf-bearing seasons

- **WHEN** the season day is before the leaf-fall anchor (spring through early autumn)
- **THEN** no fallen-leaf sprites appear anywhere on the ground around trees

#### Scenario: Litter appears in mid autumn

- **WHEN** the active season day reaches or passes the mid-autumn anchor
- **THEN** each rendered tree has a static leaf patch of modest, bounded density in a small radius around its trunk

### Requirement: Litter matches species leaf texture

Each fallen-leaf sprite SHALL use the same leaf texture as the littering tree's canopy foliage for the tree's species, so ground leaves are recognizable as that tree's leaves.

#### Scenario: Species-consistent leaves

- **WHEN** a litter patch is generated for a tree
- **THEN** all its leaf sprites use that tree species' leaf texture, not a generic or random one

### Requirement: Litter tint follows the shedding season

Fallen-leaf sprites SHALL be tinted with the season tint of the period in which they fell (early/mid autumn shed gets autumn-appropriate tints); tints SHALL NOT follow the live canopy tint of later seasons once litter has appeared, and bare winter/dormant trees keep their existing litter.

#### Scenario: Mature autumn litter

- **WHEN** the season changes from mid/late autumn into dormant or winter
- **THEN** the litter patches remain visible with their autumn tint, unchanged in color

#### Scenario: Spring growth clears litter

- **WHEN** the season calendar cycles around to spring
- **THEN** litter patches are removed (the canopy thins and regrows, litter does not accumulate across years)

### Requirement: Static litter

Fallen-leaf litter SHALL be completely static: no wind sway shader, no per-frame motion, no positional updates across frames; the litter layer completes its placement during scene build per season group and participates in the existing season-group visibility switching and wind/season rebuild teardown like other tree-season content.

#### Scenario: No animation on ground leaves

- **WHEN** the scene animates frames with wind enabled and season groups toggled
- **THEN** fallen leaves keep their position, rotation, and orientation on the terrain

#### Scenario: Rebuild consistency

- **WHEN** a wind or season rebuild tears down season groups and regenerates trees
- **THEN** litter is torn down and regenerated identically, placed with deterministic scatter (seeded RNG)
