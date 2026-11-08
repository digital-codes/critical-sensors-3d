# Proposal

## Why

Three rounds of orchard visual work landed after `orchard-sky-conditions`
without spec coverage: the leaf-fall calendar (canopies must hold full
leaves until October 1 and be bare from December 1 — the previous 4-keyframe
season table went bare far too early), a day-slider layout bug (the growing
date label reflowed the panel under the cursor while dragging), and the
dense bush strip west of the orchard (visible in
`newimages/wiese-gebuesch.png`, annotated with a red outline) that rendered
as flat, snow-covered ground because it is too tight for individual
ez-tree elements.

## What Changes

- Season calendar retuned to 8 keyframes: full canopies until Oct 1, five
  autumn steps (0.7 / 0.45 / 0.2 …), bare from Dec 1; tree variants are
  baked per keyframe, so 8 season variants are generated (was 4).
- Season slider/label layout made reflow-free: fixed-width date label with
  tabular digits and zero-padded 3-digit day numbers.
- New thicket rendering for the annotated bush strip: ~700 instanced
  low-poly canopy blobs scattered inside an editable
  `CONFIG.THICKET.POLYGON` (local-metre vertices traced from the red
  outline), each carrying a random canopy patch of the aerial orthophoto,
  tinted per season (dark grey in winter).
- Terrain winter snow suppressed on the strip: the lawn-mask cells inside
  the polygon are zeroed before the snow mask reaches the terrain, so snow
  stays on the orchard meadow.

## Capabilities

### New Capabilities

(none — all deltas extend the existing `orchard-3d-view` capability)

### Modified Capabilities

- `orchard-3d-view`: modified "Season parameter" requirement (leaf-fall
  calendar + stable slider layout) and a new "Dense thicket west of the
  orchard" requirement (blob field, editable polygon, aerial canopy
  texture, snow suppression).

## Impact

- `orchard/src/config.ts` — `SEASONS` 8 keyframes, `THICKET` section
  (polygon, counts, tints), grass season tints, season labels
- `orchard/src/seasons.ts` — `SeasonKey` union extended
- `orchard/src/thicket.ts` (new) — blob field, polygon sampling, canopy
  texture shader patch
- `orchard/src/main.ts` — season label formatter, fixed-width panel wiring,
  snow-mask cell suppression, thicket creation + season chain
- `orchard/index.html` — fixed-width season panel styles
- `orchard/README.md` — config groups, leaf calendar, thicket docs

Implemented and verified (seeded renders across seasons) through tag
`v0.8.4-orchard`.
