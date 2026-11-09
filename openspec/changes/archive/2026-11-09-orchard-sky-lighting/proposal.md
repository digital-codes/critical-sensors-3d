# Proposal

## Why

The four sky presets share nearly identical light factors, so Klar does
not read brighter than Heiter and Gewitter still carries direct sun. The
variants should have distinct light characters.

## What Changes

- Retuned `CONFIG.SKY.CONDITIONS` light factors: Klar = brightest with
  mostly direct sunlight (crisp shadows); Heiter = nearly as bright but
  ambient-soft; Bedeckt = little direct sun, flat diffuse; Gewitter = no
  direct light at all, kept visible via hemisphere + ambient.
- Dome/cloud/fog colours unchanged.

## Capabilities

### Modified Capabilities

- `orchard-3d-view`: the sky-conditions requirement gains the per-variant
  direct/ambient light semantics.

## Impact

- `orchard/src/config.ts` only.
