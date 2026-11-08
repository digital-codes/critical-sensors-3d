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

The view SHALL expose a season/day-of-year parameter that changes tree
foliage and grass: full green in summer, yellowing/reddish tint in autumn,
bare branch architecture in winter, fresh green in spring. Season changes
SHALL be applied interactively (regeneration or cached variants) without
reloading the page. The calendar SHALL follow the real leaf-fall phenology
of the site: canopies hold full leaves through September, start thinning at
October 1, thin continuously through October and November, and are bare
from December 1 through winter. The season control SHALL keep a stable
on-screen layout while the date value changes, so dragging the slider with
the pointer held down must not shift the control under the cursor.

#### Scenario: Season sweep resembles the photo series

- **WHEN** the season parameter is swept through a full year
- **THEN** the trees transition leaf-out → full → autumn color → bare,
  matching the seasonal appearance documented in the 2020–2022 photo series

#### Scenario: Leaf-fall calendar anchors

- **WHEN** the day-of-year is set to September 30 (day 273)
- **THEN** the canopies are still fully leafed
- **WHEN** the day-of-year is set to October 1 (day 274), October 18 (290),
  November 2 (305), and November 17 (320)
- **THEN** the canopy leaf density steps down monotonically (full, ~0.7,
  ~0.45, ~0.2) and the canopy tint shifts green → yellow → orange
- **WHEN** the day-of-year is set to December 1 (day 335) or any later
  winter day
- **THEN** all trees render bare

#### Scenario: Stable slider layout while dragging

- **WHEN** the day-of-year value changes between any two dates (e.g. day 7
  vs day 340 with the long season label)
- **THEN** the season panel keeps a fixed width: the slider input and the
  date label keep identical screen positions and sizes, and the date label
  uses a fixed format (zero-padded 3-digit day) so no reflow occurs while
  dragging

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

### Requirement: Sky conditions selectable via UI and config

The view SHALL support four named sky conditions defined in `config.ts`
(`CONFIG.SKY.CONDITIONS`): `klar` (blue sky, at most wispy clouds),
`heiter` (blue sky, a few light clouds), `leichtBedeckt` (cloudy but light —
the default), and `gewitter` (heavy dark clouds, thunderstorm mood). Each
condition SHALL define dome top/horizon colours, cloud count, cloud tint and
opacity range, fog/background colour, and sun/hemisphere/ambient light
factors; no other module SHALL carry sky look values.

#### Scenario: Dropdown switches the whole sky coherently

- **WHEN** the user selects a condition in the sky dropdown
- **THEN** the dome gradient, the number and tint of cloud sprites, the fog
  and background colour, and the sun/hemisphere/ambient light levels all
  change together to the configured preset (dark clouds come with dimmed
  lights, blue sky with bright sun)

#### Scenario: Default preserves the current look

- **WHEN** the page is loaded with the default condition (`leichtBedeckt`)
- **THEN** the rendered sky is pixel-identical to the build before this
  change (same dome colours, 12 clouds, same light levels)

### Requirement: Programmatic sky control hook

The view SHALL expose the active sky condition and a switch function on the
existing scene debug handle (`window.__scene3.sky.setCondition(key)` /
`window.__scene3.sky.condition`) so tooling and the dashboard can drive the
sky without the UI.

#### Scenario: Programmatic switch matches the UI

- **WHEN** `window.__scene3.sky.setCondition('gewitter')` is called
- **THEN** the scene renders the same look as selecting "Gewitter" in the
  dropdown

### Requirement: Condition-stable cloud placement

Cloud placement for a condition SHALL be deterministic per condition
(condition-specific rng seed), so switching back and forth reproduces the
same cloud layout, while the initial default load keeps the page-seeded
placement.

#### Scenario: Switching back reproduces the layout

- **WHEN** the condition is switched from `gewitter` to `klar`, away, and
  back to `klar` within one page load
- **THEN** the cloud positions for `klar` are identical in both visits

### Requirement: Dense thicket west of the orchard

The view SHALL render the dense bush strip west of the orchard (between the
residential row and the meadow, as annotated in
`newimages/wiese-gebuesch.png`) as a field of instanced low-poly canopy
blobs rather than individual trees. The strip's extent SHALL come from an
editable surrounding polygon in local metres held in the central config
(`CONFIG.THICKET.POLYGON`), traced from the annotated aerial screenshot;
the blob count SHALL be configurable (`CONFIG.THICKET.COUNT`). Blob
placement SHALL be deterministic for a given config (seeded RNG) and SHALL
keep clearance from the individually rendered orchard trees. Each blob
SHALL carry a texture patch taken from the aerial orthophoto's vegetation
imagery so the strip reads as real canopy, and SHALL be tinted per season
(dark grey in winter).

#### Scenario: Blobs fill the annotated strip

- **WHEN** the scene is generated
- **THEN** canopy blobs are scattered inside the configured polygon,
  following its traced shape (an S-curved north–south band between the
  residential row and the orchard meadow), with no blobs on buildings or
  on the open meadow

#### Scenario: Blobs carry aerial canopy imagery

- **WHEN** the strip is viewed from the elevated camera presets or the bird
  flight
- **THEN** the blobs show a mottled photographic canopy texture (random
  vegetation patches of the orthophoto), not a flat solid colour

#### Scenario: Season tint on the strip

- **WHEN** the season parameter moves from summer to autumn to winter
- **THEN** the strip's tint shifts (bright green bias → warm autumn cast →
  dark grey), matching the scrub's seasonal appearance

### Requirement: Winter snow confined to the orchard meadow

Terrain winter snow SHALL render only where the mown meadow grows, as
gated by the lawn mask intersected with the padded orchard-tree bounds.
The thicket strip (whose bushes are green in the source orthophoto and
therefore part of the lawn mask) SHALL be excluded from the snow gate so
the ground in and around the strip stays snow-free while the orchard
meadow keeps its patchy snow cover.

#### Scenario: Snow stays off the strip

- **WHEN** the day-of-year is set to a winter date
- **THEN** snow patches render on the orchard meadow but the ground in and
  around the thicket strip stays snow-free
