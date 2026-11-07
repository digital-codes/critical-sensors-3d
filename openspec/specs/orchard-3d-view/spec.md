# orchard-3d-view Specification

## Purpose
A realtime 3D view of the Katzenwedelwiesen orchard that looks like the real place across the seasons, so the website can convey the meadow itself — not only its sensor numbers.

## Requirements

### Requirement: Terrain from real geodata

The view SHALL render the orchard terrain from the LGL-BW DGM 0.25 m height data, oriented so local X/Y correspond to UTM32 east/north, with the DOP20 RGBI 2024 aerial crop as ground texture covering at least the meadow plus its visual surroundings (woodland edge, hedge line, path, railway embankment edge).

#### Scenario: Terrain matches reality
- **WHEN** the scene is loaded and the camera placed at the classic photo spot (south end, eye height ~1.5 m)
- **THEN** the ground profile (slope, ridge) matches the old weekly photos and the aerial texture aligns with OSM building/structure positions

### Requirement: Orch trees at real positions

The view SHALL render approximately 10 procedurally generated broadleaf fruit trees (ez-tree, seeded, per-tree tuned trunk height/crown form) at positions digitized from the DOP20 aerial; tree size class and crown shape SHALL be consistent with the reference photos (short clear trunks ~1–1.5 m, broad rounded crowns 4–7 m).

#### Scenario: Crown layout comparable
- **WHEN** the rendered view from the photo spot is compared side-by-side with a summer photo from `oldwww/img/`
- **THEN** the number, relative positions and general silhouettes of trees are recognizably the same scene

### Requirement: Hocksitzcafe structures

The view SHALL include the three wooden structures at their OSM way positions (ways 124028003, 124028004, 124028005), stylized from the `newimages/` photos (dark-stained wooden frames, railings/roofs), approximately true to footprint and height.

#### Scenario: Structures visible in aerial alignment
- **WHEN** the camera looks down from the elevated 2026 photo position
- **THEN** the three structures appear inside the meadow at positions consistent with both the OSM footprints and the 2026 photos

### Requirement: Season parameter

The view SHALL expose a season/day-of-year parameter that changes tree foliage and grass: full green in summer, yellowing/reddish tint in autumn, bare branch architecture in winter, fresh green in spring. Season changes SHALL be applied interactively (regeneration or cached variants) without reloading the page.

#### Scenario: Season sweep resembles the photo series
- **WHEN** the season parameter is swept through a full year
- **THEN** the trees transition leaf-out → full → autumn color → bare, matching the seasonal appearance documented in the 2020–2022 photo series

### Requirement: Ambient scene dressing

The view SHALL include meadow grass (tall, wind-animated), an overcast-style sky with procedural clouds (Perlin-noise based), and gentle tree wind sway; light and sky MAY be adjustable via simple controls.

#### Scenario: Living meadow
- **WHEN** the scene is idle
- **THEN** grass and foliage move subtly in the wind and clouds drift, without user input

### Requirement: Camera presets and compare mode

The view SHALL provide the classic photo-spot camera preset, the elevated 2026-photo preset, and free orbit controls, plus a compare mode that displays a rendered frame beside a chosen reference photo (`oldwww/img/` or `newimages/`).

#### Scenario: Photo comparison
- **WHEN** compare mode is opened with a selected reference photo
- **THEN** the rendered view and the photo are shown side-by-side for visual comparison

### Requirement: Data attribution

The view SHALL display attribution for LGL-BW geodata ("Datenlizenz Deutschland – Namensnennung – 2.0", lgl-bw.de) and OpenStreetMap ("© OpenStreetMap contributors", ODbL) whenever the 3D view is shown.

#### Scenario: Attribution visible
- **WHEN** the app is opened
- **THEN** a visible attribution line names LGL-BW and OSM licences

### Requirement: Preprocessing pipeline

A Python toolchain in `orchard/tools/` SHALL deterministically convert the source GeoTIFFs into app assets (merged/cropped heightmap, aerial texture crop, `site.json` with meadow bounds, tree list, structure list in local metres, origin at meadow centre) and SHALL record source file names, licences and the coordinate transform in the output metadata.

#### Scenario: Reproducible assets
- **WHEN** the preprocessing is re-run on unchanged source data
- **THEN** the generated assets are byte-identical (deterministic crop sizes, rounding, and ordering)
