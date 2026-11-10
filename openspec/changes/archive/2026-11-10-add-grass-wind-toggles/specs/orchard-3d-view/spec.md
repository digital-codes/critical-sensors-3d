# Spec Delta

## MODIFIED Requirements

### Requirement: Ambient scene dressing

The view SHALL by default include meadow grass (tall, wind-animated), an
overcast-style sky with procedural clouds (Perlin-noise based), and gentle
tree wind sway; light and sky MAY be adjustable via simple controls. Grass
blades and tree wind sway SHALL each be independently disable-able via
performance toggles (see "Grass and wind performance toggles"); the sky and
clouds are not affected by these toggles.

#### Scenario: Living meadow

- **WHEN** the scene is idle with both toggles at their ON defaults
- **THEN** grass and foliage move subtly in the wind and clouds drift, without user input

## ADDED Requirements

### Requirement: Grass and wind performance toggles

The view SHALL support two independent performance toggles — grass
blades and tree wind sway. Their defaults live in the central config
(`orchard/src/config.ts`), both ON so the scene looks unchanged unless
configured otherwise. With grass off, the instanced blades SHALL NOT be
created and the terrain's aerial texture is the ground; the lawn-mask
snow gate SHALL be unaffected. With tree wind off, leaf materials SHALL
be built without the wind sway shader; trees stay fully visible but
static.

#### Scenario: Grass off removes blades, keeps snow

- **WHEN** grass is disabled (config default or runtime toggle) and the
  day-of-year is set to a winter date
- **THEN** no grass blades render, the meadow ground is the aerial
  terrain texture, and winter snow still covers exactly the lawn-mask
  meadow area as before

#### Scenario: Wind off freezes trees but keeps them

- **WHEN** tree wind is disabled and the scene is idle
- **THEN** all trees render unchanged in shape, position and season
  foliage, but foliage does not sway; grass (if on) keeps swaying

#### Scenario: Toggles are independent

- **WHEN** any combination of the two toggles is set (on/on, on/off,
  off/on, off/off)
- **THEN** only the corresponding effect is disabled in each case; the
  rest of the scene, including season behaviour and compare mode, is
  unchanged

#### Scenario: Defaults preserve the current look

- **WHEN** the page is loaded with the config defaults (both ON)
- **THEN** the scene renders exactly as before this change (seeded
  pixel-comparison with a pre-change build)

### Requirement: Toggle switching surfaces

Both performance toggles SHALL be switchable at runtime from the dashboard
UI without a page reload, and SHALL be readable and switchable
programmatically via the scene debug handle, following the sky-condition
hook pattern. The UI SHALL reflect the config-provided initial state so
the central config remains the single home for defaults.

#### Scenario: Runtime switch without reload

- **WHEN** a toggle is switched in the dashboard UI
- **THEN** grass blades appear/disappear or foliage sway starts/stops
  immediately, without a page reload

#### Scenario: Programmatic control matches the UI

- **WHEN** the toggles are switched via the scene debug handle (e.g.
  `window.__scene3`) instead of the UI
- **THEN** the rendered result is identical to using the dashboard UI

#### Scenario: UI shows config defaults

- **WHEN** the dashboard loads with a non-default toggle value in the
  central config
- **THEN** the toggle control displays that value as its initial state
