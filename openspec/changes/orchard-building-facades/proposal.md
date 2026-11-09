# Proposal

## Why

The LoD2 city buildings render as flat-coloured wall slabs: correct
volumes, correct (DOP-textured) roofs, but no windows, floor structure or
plinth — from the orchard-side camera presets the south row along
St.-Florian-Straße reads as cardboard. The photo
`newimages/20261028_164047.jpg` shows exactly that row and provides the
typology to model.

## What Changes

- Procedural facades for the wall surfaces of sufficiently tall LoD2
  buildings, derived from the photo: vertical white-framed windows
  (~1 : 1.5, double-casement with centre mullion), ~4–5 window axes per
  floor, storey height ~3 m (storey count derived from the CityJSON
  `measuredHeight`), dark plinth band (~0.5–0.8 m), no balconies.
- Per-wall layouts by wall class (front / side / back — front = the
  St.-Florian-Straße side), so fronts, gable ends and garden sides differ
  the way real perimeter-block housing does.
- Noise so no two buildings look the same: window axis count, window
  proportions, shutter presence/colour (rare, restrained), a few dark
  (unlit vs. lit) panes, slight tint jitter — all seeded per building id so
  facades are stable across loads.
- Very small buildings (garages/sheds, `measuredHeight` below ~7 m of the
  26 buildings) keep their plain colour.
- Base colours stay as they are: the existing photo-derived facade palette
  (white/cream, yellow-ochre, light grey, sage green) and the DOP-textured
  roofs are unchanged.
- All facade tunables land in `CONFIG.BUILDINGS.FACADE` (floor height,
  plinth height, window ratios, frame/plinth colours, shutter chance,
  minimum facade height, noise seed) per the config admission rule.

## Capabilities

### New Capabilities

(none — delta extends `orchard-3d-view`)

### Modified Capabilities

- `orchard-3d-view`: new "Realistic building facades" requirement covering
  the window/plinth kit, wall classes, noise, small-building exemption and
  determinism.

## Impact

- `orchard/src/buildings.ts` — procedural facade textures per wall surface,
  wall-plane UV mapping (replacing the single-tone wall UV), wall-class
  classification from surface normals
- `orchard/src/config.ts` — new `CONFIG.BUILDINGS.FACADE` group
- `orchard/README.md` — facade section
- Roof rendering, terrain, trees and everything else untouched

## Verification plan

The photo's vantage is reproduced with the compare/camera presets and a
seeded render; the facade kit is compared against the photo (window grid,
plinth, colour) via vision + pixel checks; determinism via seeded A/B.
