# Design — orchard-cat

## Context

`terrain.ts` already exports `getHeight(x, z)` (absolute DHHN metres) —
the same sampler the grass and thicket placement use. Tree positions come
from `site.json` (orchard trees individually rendered). The handedness is
+x = east, +y = up, **+z = south** — path waypoints are computed in this
local-metre frame; no new coordinate math is introduced.

## Model asset

**Decision (task 1.2, apply phase):** the planned Quaternius CC0 pack has no
cat — its 12 animated animals are Alpaca, Bull, Cow, Deer, Donkey, Fox,
Horse, Horse_White, Husky, ShibaInu, Stag, Wolf (verified against the
official Drive pack). Quaternius distributes only via Google Drive/itch, and
no cats pack exists on quaternius.com. Instead: **`character-pet-cat.glb`
from the Agentshire repo** (github.com/Agentshire/Agentshire, MIT licence,
© 2025–2026 Agentshire Contributors) — 134 KB GLB, rigid-limb rig (body,
tail, 4 legs as named animated nodes, no skinned mesh) with named clips
`idle`, `walk`, … placed at `orchard/public/models/cat.glb`. plays via a
plain `AnimationMixer`; the model is normalized to real size
(BODY_LENGTH 0.5 m) on load, so export units don't matter. Credited in
orchard/README.md (Licences).

## Module: `src/cat.ts`

- `createCat(scene, cfg)` — loads the GLB, builds the patrol path, returns
  `{ group, update(dt), setVisible(b), followPose(t) }`; registers into
  `__scene3` by SPREADING the existing hook object (`__scene3 = { ...__scene3,
  cat }`) at the point where other modules merge, never a wholesale
  re-assignment (TDZ + duplicate-hook pitfalls).
- Patrol path: closed Catmull-Rom loop seeded with mulberry32 (`?seed=`
  reproducible), waypoints sampled in the lawn area with a clearance radius
  around every orchard tree position (same rejection-sampling idea as the
  thicket placement) and kept inside the win bounds.
- Each frame: advance arc-length parameter by `speed × dt`, orient the cat
  along the path tangent (+y up, heading from tangent in the XZ plane —
  hand-checked against the +z-south frame with the projection-pixel probe),
  `group.position.y = getHeight(x, z)`.
- `AnimationMixer` crossfades Walk (moving) / Idle (paused toggle-off);
  clips discovered by name from the loaded gltf, speed-normalised to look
  natural at real size.
- Shadows: traverse the loaded scene, `castShadow = true` on meshes.

## CONFIG.CAT (config.ts)

```ts
CAT: {
  ENABLED: false,      // hidden by default (spec)
  SPEED: 0.8,          // m/s, calm walk
  SCALE: 1,            // real size
  SEED: "katzenwedel", // path seed
  CLEARANCE: 3,        // m, min distance to orchard trees
}
```

## UI + camera

- Toggle checkbox "Katze" in the existing panel group (same pattern as the
  sky/season controls; German label, fixed-width row so layout never
  shifts).
- "Katze folgen": implemented as a per-frame chase target in the Kamera
  panel's preset mechanism — camera position = cat position + offset
  rotated with the cat heading, `controls.target = cat position`; leaving
  the preset restores free orbit. Exposed via `__rig`-compatible call so
  tooling can drive it.

## Season/winter coupling

None — the cat is present in all seasons (spec decision). No hook into the
day-slider handler is needed; snow under the cat's feet is fine (a cat
walking on snow is correct).

## Verification

- Seeded load `?seed=1`, day 15 (winter, static ground): enable toggle,
  sample 20 path poses via `__scene3.cat.followPose(t)`, assert
  `getHeight` matches the cat's y within 1 cm, assert clearance to nearest
  tree ≥ CONFIG value.
- Projection-pixel probe at a known waypoint to confirm heading direction
  (east-facing at t=x) — catches handedness flips.
- Close-up rig screenshot (10–20 m) → vision check: cat visible, feet on
  ground, walk pose plausible; winter + summer shots.
- Follow-cam: activate preset, verify camera readback tracks `followPose`.
- npm run build clean; no FPS claims (SwiftShader).
