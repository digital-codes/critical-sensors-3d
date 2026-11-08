# Proposal: orchard-sky-conditions

## Why

The orchard view has exactly one hardcoded sky look — a soft overcast gradient
(`config.ts` SKY section) with 12 white cloud sprites. Weather is a natural
part of presenting the meadow (and later: showing the real historical weather
of a selected day), but currently the sky cannot be changed at runtime. A
feasibility probe proved the dome gradient, cloud sprites and scene lights are
all live-mutable — only a preset table, a switch function and a UI control are
missing.

## What Changes

- Add **four named sky conditions** to `CONFIG.SKY.CONDITIONS` (single
  constants home, same pattern as `SEASONS`):
  - `klar` — blue sky, at most wispy clouds, bright sun
  - `heiter` — blue sky with a few light clouds
  - `leichtBedeckt` — cloudy but light (the current look; the default)
  - `gewitter` — heavy dark clouds, thunderstorm mood, heavily dimmed sun
- Each condition defines: dome top/horizon colours, cloud count, cloud tint
  and opacity, fog/background colour, and sun/hemisphere/ambient light
  factors. No other module carries sky look values.
- `sky.ts` gains `setCondition(key)`: updates the dome shader uniforms,
  rebuilds the cloud sprites (dispose old materials — textures are shared)
  with a condition-specific deterministic rng.
- `main.ts` applies the light factors (sun factor multiplies the seasonal
  base inside `updateSun`) and updates fog + background colour; a **select
  dropdown** in the existing UI panel switches conditions; the hook
  `window.__scene3.sky = { setCondition, get condition }` enables tooling and
  the dashboard.
- Default condition `leichtBedeckt` renders **pixel-identically** to the
  current build (verified with `?seed=42`) — no visual regression.

## Capabilities

### Modified
- `orchard-3d-view` — adds a "Sky conditions" requirement: four presets,
  dropdown selection, lighting/fog coherence, default preserving the current
  look.

## Impact

- `orchard/src/config.ts` (+~40 lines), `orchard/src/sky.ts` (+~45),
  `orchard/src/main.ts` (+~40: dropdown + light/fog wiring), README section.
- No changes to terrain/trees/structures/grass/flight; no site.json changes.
- Dashboard integration (real weather → condition) explicitly out of scope.
