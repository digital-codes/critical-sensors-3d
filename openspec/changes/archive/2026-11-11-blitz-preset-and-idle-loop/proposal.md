# Proposal: Blitz preset and idle demo loop

## Why

The orchard 3D view's preset row has quick views (Süd, Nord, Tafel) plus Katze and Flug, but showing the lightning feature currently requires finding a storm day on the slider manually. Kiosk visitors also walk away without touching anything, leaving the scene stuck on one static view.

## What Changes

- New preset button **"Blitz"** in the presets row that jumps the season day to the nearest day with lightning bolts and switches the sky to the storm condition. Currently that is day 232 (labelled Aug 21, a configured strike day in the gewitter month August).
- New **idle demo loop**: when no user input happens for more than 1 minute, the view automatically cycles through all presets (including Katze and Flug), stepping to the next preset after roughly 20 s per preset, waiting for running animations (e.g. the 42 s bird flight) to finish before counting dwell time.
- Any user input (pointer, touch, key, preset click, slider, dropdown) stops the loop immediately and resets the idle timer; the scene returns to the start view at preset **Tafel**.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `orchard-3d-view`: The camera-preset requirement gains the "Blitz" preset; a new demo/idle-loop requirement (auto-cycling presets after idle, stop-on-input, reset to Tafel) is added.

## Impact

- `orchard/src/main.ts` (preset buttons, input listeners, idle scheduling)
- `orchard/src/config.ts` (labels, idle timings, blitz target day)
- Interacts with `sparks.ts` day gating (Blitz relies on existing strike scheduling) and `flight.ts`/cat follow for the loop; no new dependencies.
- Affects both standalone and www-embed builds (both share main.ts chrome).
