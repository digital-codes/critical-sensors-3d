# orchard-tree-apples Specification

## Purpose

Seasonal apples hanging in the crowns of the orchard trees beside the Hocksitz structures, anchored at branches and twigs, from late September to mid October, static and deterministic.

## Requirements

### Requirement: Crown apples for selected trees in season

The orchard scene SHALL render a modest scatter of apple props hanging in the crown of each tree listed in `CONFIG.TREES.CROWN_APPLES.TREES` (the three trees next to the three Hocksitz structures) whenever the active season day is in the configured window (late September to mid October, approx. day 268–285), and SHALL show no crown apples outside that window; other trees carry none.

#### Scenario: Apples during the window

- **WHEN** the day-of-year is set inside the window
- **THEN** each listed tree shows a scattering of apples among its branches and twigs, and no other tree does

#### Scenario: No apples outside the window

- **WHEN** the day-of-year is set before or after the window (e.g. mid summer or November)
- **THEN** no apple props render in any crown

### Requirement: Apples anchored to the branch skeleton

Each apple SHALL hang at an anchor point on the tree's own generated branch/twig structure (sampled from the tree's exposed branch or leaf-clump geometry) with a small hanging offset, so apples sit visibly in the crown at twigs and branch tips — none floating disconnected, none on the ground below the tree.

#### Scenario: Apples sit at twigs

- **WHEN** a crown with apples is viewed up close from the meadow
- **THEN** apples appear attached near branch/twig positions inside the canopy silhouette, with clear space between apple and ground

### Requirement: Static and deterministic apples

Crown apples SHALL be completely static (no sway, no per-frame movement) and placed with a seeded deterministic scatter per tree, so wind/season rebuilds reproduce identical placement; apples participate in season-group switching and teardown like the tree content.

#### Scenario: No movement

- **WHEN** the scene animates frames with wind enabled and season groups toggled
- **THEN** apples keep their position; they appear/disappear only via the season day window

#### Scenario: Rebuild consistency

- **WHEN** a wind or season rebuild tears down and regenerates the trees
- **THEN** apple placement is identical between rebuilds (seeded per tree, not per load)
