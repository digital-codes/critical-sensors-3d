# Spec Delta — orchard-3d-view

## ADDED Requirements

### Requirement: Walking cat

The view SHALL render an animated cat that walks a closed, seeded patrol
path between the orchard tree rows. The cat SHALL stay on the terrain
surface (height sampled from the heightmap, absolute DHHN), cast shadows,
and repeat its patrol continuously. The cat SHALL be hidden by default and
SHALL be shown/hidden via a German-labelled UI toggle without page reload.
The cat SHALL be a real-size model (~0.5 m body length).

#### Scenario: Cat patrols between tree rows

- **WHEN** the cat is enabled and time passes
- **THEN** it moves along a closed path that keeps clearance from the
  individually rendered orchard trees, follows the terrain surface up and
  down the meadow, and its walk animation plays while it moves

#### Scenario: Terrain clamping

- **WHEN** the patrol path crosses the sloped meadow
- **THEN** the cat's feet stay on the ground surface (no floating, no
  sinking) at every sample of the path

#### Scenario: Toggle without reload

- **WHEN** the "Katze" toggle is switched
- **THEN** the cat appears or disappears immediately; no page reload occurs
  and the rest of the scene is unchanged

### Requirement: Follow camera preset

The view SHALL provide a "Katze folgen" camera preset that tracks the
walking cat so it stays visible from up close.

#### Scenario: Follow preset keeps the cat in frame

- **WHEN** "Katze folgen" is activated while the cat walks
- **THEN** the camera keeps the cat in frame as it patrols, and the user
  can leave the preset (orbiting stays functional)
