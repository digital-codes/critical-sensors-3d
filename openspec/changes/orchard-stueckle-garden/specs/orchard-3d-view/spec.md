# Spec Delta — orchard-3d-view

## ADDED Requirements

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
