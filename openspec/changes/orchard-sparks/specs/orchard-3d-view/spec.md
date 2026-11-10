# Spec Delta — orchard-3d-view

## ADDED Requirements

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
