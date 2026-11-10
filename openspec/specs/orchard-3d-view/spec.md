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
factors; no other module SHALL carry sky look values. The conditions SHALL
have distinct light characters: Klar is the brightest variant and uses
mostly direct sunlight (crisp shadows); Heiter is nearly as bright with a
larger ambient share (soft shadows); Bedeckt has only little direct sun
(flat diffuse light); Gewitter has no direct light at all and stays visible
through hemisphere + ambient light.

#### Scenario: Dropdown switches the whole sky coherently

- **WHEN** the user selects a condition in the sky dropdown
- **THEN** the dome gradient, the number and tint of cloud sprites, the fog
  and background colour, and the sun/hemisphere/ambient light levels all
  change together to the configured preset

#### Scenario: Default preserves the current look

- **WHEN** the page is loaded with the default condition (`leichtBedeckt`)
- **THEN** the rendered sky uses this change's retuned light levels (little
  direct sun, flat diffuse lighting) with the unchanged dome colours and
  12 clouds

#### Scenario: Klar reads as direct-dominant

- **WHEN** the Klar preset is active
- **THEN** sunlit and shadowed surfaces differ strongly and Klar is the
  brightest variant

#### Scenario: Gewitter keeps the scene visible without direct sun

- **WHEN** the Gewitter preset is active
- **THEN** the directional (sun) light intensity is 0 and the scene stays
  legible via hemisphere + ambient light

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

### Requirement: Stückle garden plot

The garden plot east of the orchard (towards the small trail; extent from
the editable `CONFIG.STUECKLE.POLYGON`, traced from the DOP) SHALL carry
simple procedural structures, all seeded and deterministic: a perimeter
wire-mesh fence (~1.2–1.5 m), two gable-roofed tool huts (2–2.5 m tall,
dark-grey and light-grey roofs per the aerial), a low translucent
greenhouse/cold-frame row, dark soil bed rectangles on the plot ground,
compost heaps along the east fence and one ~5 m conifer. The rest of the
scene stays untouched.

#### Scenario: Plot reads as an allotment from the meadow

- **WHEN** the area east of the orchard is viewed from the meadow or the
  bird flight
- **THEN** a fenced plot with two small huts, beds and a conifer stands
  where the aerial shows it, instead of bare terrain

#### Scenario: Deterministic placement

- **WHEN** the scene is rendered twice with the same `?seed=<n>`
- **THEN** hut and bed placement are identical

### Requirement: Garden plot snow exclusion

The Stückle plot's ground SHALL be excluded from the terrain winter snow
gate (the lawn mask claims the garden's green DOP pixels), so winter snow
renders on the meadow, not on the fenced beds.

#### Scenario: Snow stays off the beds

- **WHEN** the day-of-year is set to a winter date
- **THEN** the plot ground inside the fence stays snow-free while the
  meadow keeps its snow cover

### Requirement: Day-gated lightning scheduling

While the active season day is one of `CONFIG.SPARKS.STRIKE_DAYS` and that
day's month condition is `gewitter`, the view SHALL schedule repeated
lightning strikes: the first within ~2 s of the day becoming active, then
at configured intervals (default 5–9 s). On any other day — including the
other April and August days — and whenever the effective sky condition is
not `gewitter`, no strike SHALL be scheduled or rendered, and the scene
SHALL be identical to its behaviour before this feature.

#### Scenario: Strike day shows bolts while cycling the slider

- **WHEN** the day slider moves to a day in `STRIKE_DAYS` whose month maps
  to `gewitter`
- **THEN** a lightning strike occurs within ~2 s and repeats at intervals

#### Scenario: No strikes outside the configured storm days

- **WHEN** the day slider sits on a non-strike day (any month) or the sky
  condition is `klar`, `heiter` or `leichtBedeckt`
- **THEN** no strike is scheduled or rendered

### Requirement: Single-channel strike with multi-pulse envelope

Each strike SHALL render one fixed, unbranched channel from 2D Perlin
displacement (sine envelope, both endpoints pinned), spanning cloud deck
to a terrain-height ground point in the configured strike box, drawn as
three additive line layers plus a base glow sprite. Over its ~200 ms life
the channel SHALL play a dim leader phase with growing draw-range, then
2–3 brightening return-stroke pulses, keeping its macro shape throughout.

#### Scenario: Strike plays and vanishes

- **WHEN** a strike fires
- **THEN** a jagged bolt with bright core, glow layers and a base glow
  appears between the clouds and the ground, flickers through its pulses
  and is gone after ~200 ms

### Requirement: Strike flash with exact restore

During a strike the scene SHALL respond: a point light at the strike
illuminates the surroundings and the hemisphere light is boosted
proportional to the envelope brightness. When the strike ends — or the
day gate closes, the condition changes away from `gewitter`, or the module
is disposed — all affected lights SHALL be restored exactly to their
pre-strike values.

#### Scenario: Flash reads as a strike moment and restores

- **WHEN** the envelope plays a bright pulse
- **THEN** the terrain and structures near the strike visibly brighten,
  and after the strike every affected light intensity equals its
  pre-strike value

### Requirement: Deterministic spark verification

The spark system SHALL expose `__scene3.sparks` with a `trigger(seed?,
pos?)` function so tooling can fire a strike at a known position and
seed; strike geometry for a given seed SHALL be reproducible.

#### Scenario: Seeded strike is reproducible

- **WHEN** `trigger()` fires twice with the same seed and strike position
- **THEN** the bolt vertex positions are identical between the two runs

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
