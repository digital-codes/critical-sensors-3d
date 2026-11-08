# orchard-3d-view Delta — Sky conditions

## ADDED Requirements

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
