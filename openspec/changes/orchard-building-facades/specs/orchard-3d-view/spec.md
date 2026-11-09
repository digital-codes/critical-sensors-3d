# Spec Delta — orchard-3d-view

## ADDED Requirements

### Requirement: Realistic building facades

The LoD2 building walls SHALL carry a procedural facade kit derived from the
St.-Florian-Straße photo (`newimages/20261028_164047.jpg`): vertical
white-framed windows (~1 : 1.5, double-casement), ~4–5 window axes per
floor, storey height ~3 m with the storey count derived from the CityJSON
`measuredHeight`, and a dark plinth band. Walls SHALL be laid out by wall
class (front / side / back). Buildings below a configurable height
(garages, sheds) SHALL keep their plain colour. Facade colours and the
DOP-textured roofs SHALL stay unchanged. Roof-attic detail remains the real
DOP roof pixels.

#### Scenario: Photo-typical front facade

- **WHEN** the south building row is viewed from the orchard-side camera
  preset matching the photo vantage
- **THEN** the visible walls show multi-storey white-framed window grids
  over a dark plinth band, reading like the photo's row rather than flat
  slabs

#### Scenario: Small buildings stay plain

- **WHEN** a building's measuredHeight is below the configured minimum
  (garages, sheds)
- **THEN** its walls keep the flat facade colour without windows or plinth

#### Scenario: Facades differ but stay in typology

- **WHEN** two neighbouring houses of similar height are compared
- **THEN** their window axis counts, shutter states and pane brightness
  differ (seeded noise) while both follow the same storey/window typology

#### Scenario: Deterministic rendering

- **WHEN** the scene is rendered twice with the same `?seed=<n>`
- **THEN** the facade layouts are identical (noise is seeded per building,
  not randomised per load)

### Requirement: Facade configuration

The facade kit's tunables (storey height, plinth height, window width/height
ratios, frame and plinth colours, shutter probability and colours, minimum
facade height for the kit, noise seed) SHALL live in the central config
(`CONFIG.BUILDINGS.FACADE`), not in module code.

#### Scenario: Tuning without code changes

- **WHEN** a facade parameter in `CONFIG.BUILDINGS.FACADE` is edited
- **THEN** the rendered facades change accordingly without touching
  `buildings.ts` logic
