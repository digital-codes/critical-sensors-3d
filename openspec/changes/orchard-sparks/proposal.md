# Proposal

## Why

The gewitter sky condition currently only darkens the dome, dims the lights
and thickens the clouds — the storm has no event. The user's
`ideas/perlin/sparks.py` proves a 2D-Perlin displacement (position × time,
sine envelope pinning both endpoints, Gaussian cross-profile) produces a
believable lightning channel. Runtime experiments injected into the live
scene (evidence now in `ideas/sparks/`) validated a simplified, cheaper
recipe than the earlier tube/branch draft: a FIXED channel per strike (one
noise sample) whose ~200 ms life is a multi-pulse brightness envelope
(leader growth + 2–3 return strokes) — all frames stay in the ±amp corridor
(measured: centroid drift ~5 px, consecutive-frame correlation 0.79–0.83)
— plus a point light + hemisphere flash with exact restore. The user
reviewed the 7-frame `live_step_*` sequence on 2026-11-10 and approved it
as the reference look ("sequence live_step_ looks good").

## What Changes

- New `orchard/src/sparks.ts`: a strike scheduler gated by the DAY SLIDER —
  strikes only on `CONFIG.SPARKS.STRIKE_DAYS` (user decision 2026-11-10:
  ~2 days per gewitter month; April/August per `MONTH_CONDITIONS`), first
  strike ~1.2 s after day activation so slider cycling surfaces it.
- Each strike: fixed Perlin-displaced channel (JS port of sparks.py, seeded
  per strike) cloud → terrain-height ground point in the validated strike
  box behind the west tree line, drawn as three additive line layers
  (core/mid/wide, the approved `live_step_*` recipe — no tubes, no
  branches, no corona sprites), glow sprite at the base, ~200 ms multi-pulse
  envelope (leader draw-range growth 0–40 ms, pulses at 40/95/148 ms).
- Flash during the envelope: point light at the strike (35·I, decay 1) +
  hemisphere boost ×(1+0.4·I) — the tuned values that did not white-out;
  exact restore to pre-strike values at strike end.
- `CONFIG.SPARKS` (config.ts, admission rule): strike days, box, envelope,
  layers, flash, intervals — all tunables with derivation comments.
- `__scene3.sparks` hook (spread merge) with `setDay/setCondition/trigger/
  dispose`; `trigger(seed?, pos?)` fires a deterministic strike for tests.
- Works in both consumers automatically (standalone orchard + www dashboard
  share `mountOrchard`).
- Out of scope: thunder audio, rain, scorch decals, branches, cat changes.

## Capabilities

### New Capabilities

### Modified Capabilities

- `orchard-3d-view`: replaces the earlier spark-event draft with the
  day-gated single-channel strike (scheduling gate, bolt, flash restore,
  deterministic hook, disposal).

## Impact

- `orchard/src/sparks.ts` (new), `orchard/src/config.ts` (CONFIG.SPARKS),
  `orchard/src/main.ts` (create + render-loop update + slider/condition
  wiring + __scene3 merge), `orchard/README.md` (Features).
- No new dependencies — the Perlin noise is a ~40-line inline port (same
  improved-Perlin as the python `noise` package); bolt/flash use existing
  three primitives.
- Evidence + validated values: `ideas/sparks/` (README, `strike_test.py` =
  the `window.__sparkUpdate` reference, `frame_check.py` = corridor
  measurement) — committed with this change.
