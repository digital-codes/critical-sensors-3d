# Spec Delta — orchard-3d-view

## ADDED Requirements

### Requirement: Lochstein artwork placement

The scene SHALL render the Lochstein sculpture at `CONFIG.LOCHSTEIN`
lat/lon, ground-set on the terrain: a slab of 3.0 × 1.5 × 0.4 m
(length × height × max thickness) with a 0.3 m circular through-hole in
the polished face, balanced on a rough support boulder via a small pivot
stone (total height ≈ 2.3 m). The slab's polished hole-face SHALL point
toward compass azimuth 45° (NE), length axis NW–SE.

#### Scenario: North-east view matches the reference photo

- **WHEN** the camera looks at the sculpture from the north-east at
  ground level
- **THEN** the polished veined face with the through-hole faces the
  viewer at the measured position near the plaza north-east of the
  meadow, with the slab's proportions matching the on-site measurements

### Requirement: Lochstein shows the ungraffitied stone

The sculpture's textures SHALL show the clean "when new" look (dark
polished stone with light veining) without graffiti.

#### Scenario: Close-up shows clean veined stone

- **WHEN** the sculpture is viewed from a few metres
- **THEN** the surface shows the veined polished stone and no spray
  tags
