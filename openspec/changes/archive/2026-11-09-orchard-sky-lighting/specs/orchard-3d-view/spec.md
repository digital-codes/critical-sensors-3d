# Spec Delta — orchard-3d-view

## MODIFIED Requirements

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
