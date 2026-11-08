# Proposal

## Why

The orchard view is the landing surface of the new dashboard and already
models trees, buildings, sky, seasons and a bird's-eye flight — but it has
no living element on the ground. A cat wandering the Streuobstwiese adds a
small, charming focal point that also gives the viewer a natural reason to
dive from the overview down to eye level (the Kamera panel exists but has no
draw). It matches the site's name cat — "Katzenwedelwiesen".

## What Changes

- A real-size (~0.5 m) animated cat walks a seeded closed patrol path
  between the orchard tree rows, clamped to the terrain height each frame
  (absolute DHHN via the existing `getHeight()` sampler), casting real
  shadows into the tree shade.
- The cat model is a rigged GLTF with walk + idle clips (from the MIT-licensed
  Agentshire repo — see design.md for the source decision), stored in
  `orchard/public/models/` as a runtime-critical small asset.
- A new "Katze" toggle in the UI (German label) shows/hides the cat; when
  enabled, a "Katze folgen" camera preset tracks it.
- `CONFIG.CAT` (path seed, speed, scale, toggle default) is the single
  tunable home per the config.ts admission rule.
- The cat is season-independent (present year-round, including winter).

## Capabilities

### New Capabilities

- `orchard-cat`: the walking cat — model loading, terrain-clamped patrol
  path, walk/idle animation, toggle and follow camera preset.

### Modified Capabilities

## Impact

- `orchard/src/cat.ts` (new), `orchard/src/config.ts` (`CONFIG.CAT`),
  `orchard/src/main.ts` (init, UI toggle, `__scene3.cat` hook — must SPREAD
  the existing hook object, never re-assign), `orchard/src/camera.ts` or
  cameraui.ts (follow preset), `orchard/README.md` (Features + Licences).
- New dependency: none — `GLTFLoader` ships with the existing `three`
  package (three/addons).
- New asset: `orchard/public/models/cat.glb` (~1–2 MB, CC0) — kept in git
  per the small-runtime-assets rule; licence noted in orchard/README.md.
- Verification: seeded browser run (day 15 winter for static ground),
  cat-follow rig poses, vision check of close-up screenshots; FPS claims
  excluded (SwiftShader).
