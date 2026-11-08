# Design — orchard-sky-conditions

Feasibility was proven live (2026-11-07 probe): dome gradient, cloud sprites
and scene lights are all mutable at runtime; this change only productizes
what that probe demonstrated.

## Preset table (single home: config.ts)

`CONFIG.SKY.CONDITIONS[key]` — one flat object per condition:

| field | meaning |
|---|---|
| `LABEL` | German UI label (dropdown text) |
| `DOME_TOP`, `DOME_HORIZON` | dome gradient shader uniforms |
| `CLOUD_COUNT` | number of sprite billboards |
| `CLOUD_TINT` | SpriteMaterial colour (white = light, grey = dark) |
| `CLOUD_OPACITY_MIN`, `CLOUD_OPACITY_JITTER` | per-sprite opacity = MIN + rand·JITTER |
| `FOG` | fog + scene.background colour |
| `SUN_FACTOR`, `HEMI_FACTOR`, `AMBIENT_FACTOR` | multipliers on the seasonal light bases |

Preset values (chosen from the probe's visually verified results):

| key | top / horizon | clouds | tint / opacity | sun / hemi / ambient |
|---|---|---|---|---|
| `klar` | 0x3d7fd6 / 0xcfe8ff | 2 | white / 0.25+0.2 | 1.20 / 0.90 / 1.00 |
| `heiter` | 0x6f9fd8 / 0xdce9f5 | 6 | white / 0.45+0.25 | 1.10 / 0.95 / 1.00 |
| `leichtBedeckt` (default) | 0xbfcdd8 / 0xe8ecef | 12 | white / 0.55+0.30 | 1.00 / 1.00 / 1.00 |
| `gewitter` | 0x414b55 / 0x828c96 | 18 | 0x5f6873 / 0.75+0.20 | 0.35 / 0.55 / 0.90 |

`leichtBedeckt`'s values are exactly the pre-change literals → default load is
pixel-identical (verified by seeded A/B against `?seed=42`).

## Mechanics

- **sky.ts**: `createSky` builds the initial clouds from the DEFAULT
  condition's parameters (instead of literals; same rng sequence order →
  identical placement). New `setCondition(key)`: sets the two dome uniforms,
  removes + disposes old sprite **materials** (textures are shared, kept),
  respawns `CLOUD_COUNT` sprites using a condition-specific rng
  `mulberry32(0xc10d + index)` — stable per condition regardless of page
  seed or previous switches (spec: condition-stable placement).
- **main.ts**: keeps `skyFactor` state = current condition; hemisphere and
  ambient intensities are set at creation → `setCondition` multiplies their
  captured bases; the sun is re-scaled by `updateSun()` every day change, so
  the condition's `SUN_FACTOR` multiplies inside `updateSun` and
  `setCondition` re-calls `updateSun` with the current day-of-year.
  Fog + background colours updated on switch. Dropdown `<select>` appended
  to the same UI panel as the day slider (built in main.ts, labels from
  `CONDITIONS[k].LABEL`). Debug hook: `sceneKeys.sky = { setCondition,
  condition getter }` merged into `window.__scene3`.
- **config.ts**: `CONFIG.SKY.CLOUD_COUNT` is superseded by the per-condition
  counts (leichtBedeckt keeps 12) and removed — one source of truth; the
  opacity literals move into the default condition the same way.

## Non-goals

- No real-weather linkage (DWD cloud cover / SensorCity solar → condition)
  — future dashboard work.
- No smooth transitions/tweening between conditions (instant switch; the
  probe showed instant looks fine).
- No new cloud types (sprites only; a volumetric or billboard-atlas upgrade
  is a separate change).
