# Spec Delta — orchard-3d-view

## MODIFIED Requirements

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

## ADDED Requirements

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
