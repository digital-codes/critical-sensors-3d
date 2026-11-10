# Design — orchard-sparks

## Validated by runtime experiments (ideas/sparks/)

1. `spark_test.py` — static bolt injections (bolt_test*.png): additive line
   layers read correctly at scene distance; the second bolt of bolt_test3
   ended in a floating orb → strike endpoints must be pinned to terrain.
   Flash A/B (flash_off/on): hemisphere boost 0.9·I white-outs the scene.
2. `frame_check.py` — 6 frames @ 30 fps from sparks.py over 200 ms: all
   frames inside x ∈ [135, 252] (the ±amp band the sine envelope allows),
   centroid drift ~5 px, consecutive correlation 0.79–0.83 → the channel
   shape is FROZEN at macro scale; a per-strike noise sample suffices and
   frames never jump corridors.
3. `strike_live2.py` — the approved 7-frame sequence (`live_step_*`):
   fixed channel, envelope leader 0–40 ms (brightness ramp 0.6 — 0.25 was
   invisible) + return-stroke pulses [40 ms·1.0/τ28, 95 ms·0.75/τ26,
   148 ms·0.45/τ24], flash = PointLight 35·I (decay 1) + hemisphere
   ×(1+0.4·I). User verdict 2026-11-10: "sequence live_step_ looks good".

## Module: `src/sparks.ts`

```ts
export type Sparks = {
  update(dt: number): void;      // scheduler + 200 ms envelope animation
  setDay(day: number): void;     // day-gate from the slider handler
  setCondition(key: string): void;  // kill-switch on manual sky override
  trigger(seed?: number, pos?: [number, number]): void;  // test hook
  get active(): boolean;
  dispose(): void;
};
export function createSparks(scene: THREE.Scene, getHeight: (x: number, z: number) => number): Sparks
```

- **Scheduler**: `update(dt)` counts down ONLY while the day gate is open
  (day ∈ `CONFIG.SPARKS.STRIKE_DAYS` AND `MONTH_CONDITIONS[monthIndex(day)]
  === 'gewitter'`; main.ts calls `setDay` from the slider handler and once
  at init). First strike `FIRST_DELAY_S` after gate opens, then uniform
  `INTERVAL_MIN_S..MAX_S`. Gate closing or a `setCondition` away from
  `gewitter` cancels the countdown and immediately ends any live strike
  (restore runs; a ≤200 ms strike needs no fade).
- **Bolt build (per strike)**: seeded rng (mulberry32; seed = day*1000 +
  strike index for scheduled strikes, explicit for `trigger()`). Position:
  uniform in `CONFIG.SPARKS.BOX` (behind the west tree line — outside the
  orchard polygon by construction); ground y = getHeight(x, z); top y =
  `TOP_Y`. Channel: N=90 samples, `disp = AMP · pnoise2(FREQ·s, TIME_SPEED·t)
  · sin(π·s)` with t = per-strike t0 + TIME_SPEED·(elapsed s) +
  `RESTROKE_SNAP`·(pulses fired) — recomputed into the position attribute
  each frame while live (91×3 floats ×3 layers, trivial). The noise port is
  the seeded improved-Perlin from `ideas/sparks/strike_test.py`.
- **Envelope** `I(ms)`: leader ramp `LEADER_BRIGHTNESS·ms/40` below
  `LEADER_MS`, then Σ pulse·exp(−(ms−start)/tau), clamp 1; draw-range grows
  with the leader. Applied as: layer opacities `OPACITY·I`, glow sprite
  opacity min(1, 1.2·I) and scale `GLOW_SCALE·(0.6+0.8·I)`, point light
  `FLASH.INTENSITY·I`, hemisphere `base·(1+`FLASH.HEMI_BOOST`·I)`.
  `DURATION_MS` ends the strike: lights restored exactly, group hidden.
- **Restore discipline**: hemisphere base snapshotted at strike START (the
  condition factors already applied); restored on strike end, gate close,
  condition kill and dispose — never left boosted. Slider drags mid-flash
  (updateSun) are overridden by the restore ≤200 ms later; accepted.
- **main.ts wiring**: create after terrain; `sparks.update(dt)` next to
  `sky.update(dt)` — clamp INTERNALLY (`const d = Math.min(dt, 0.1)`),
  because the caller passes raw `clock.getDelta()` (skill rule: every
  animation update clamps its own dt);
  `sparks.setDay(day)` in the slider input handler + once after creation;
  `sparks.setCondition(key)` inside `applySkyCondition`; `__scene3.sparks`
  via the spread-merge pattern. `dispose()` exists for API completeness —
  mountOrchard has no teardown today (embed panes never unmount).
- **Disposal**: geometries/materials of the 3 layers + glow texture/material
  disposed; point light removed; no per-frame allocation outside a strike.

## CONFIG.SPARKS (config.ts)

```ts
SPARKS: {
  ENABLED: true,
  // user 2026-11-10: ~2 storm days per gewitter month (Apr = 91-120, Aug = 213-243)
  STRIKE_DAYS: [100, 112, 220, 232],
  // validated strike area behind the west tree line (ideas/sparks, strike at -60,-95)
  BOX: { X_MIN: -85, X_MAX: -35, Z_MIN: -125, Z_MAX: -65 },
  TOP_Y: 300,            // above the cloud deck (CLOUD_ALT_BASE 80 + jitter 40)
  SEGMENTS: 90,
  AMP: 55, FREQ: 2.2, OCTAVES: 4, TIME_SPEED: 0.7, RESTROKE_SNAP: 0.05,
  NOISE_SEED: 1337,
  LEADER_MS: 40, LEADER_BRIGHTNESS: 0.6,
  PULSES: [[40, 1.0, 28], [95, 0.75, 26], [148, 0.45, 24]], // [startMs, amp, tauMs]
  DURATION_MS: 200,
  LAYERS: [
    { COLOR: 0xffffff, OPACITY: 1.0 },
    { COLOR: 0xbfd8ff, OPACITY: 0.45 },
    { COLOR: 0x88aaff, OPACITY: 0.18 },
  ],
  GLOW_SCALE: 18,
  FLASH: { COLOR: 0xcfe0ff, INTENSITY: 35, DECAY: 1, Y_ABOVE_GROUND: 20, HEMI_BOOST: 0.4 },
  FIRST_DELAY_S: 1.2, INTERVAL_MIN_S: 5, INTERVAL_MAX_S: 9,
}
```

## Verification

- Day gating (browser): slider to a STRIKE_DAY (April/August) → strike
  within ~3 s (scene probe + screenshot); slider to a neighbouring April
  day and a June day → no strike; manual `klar` on a strike day → none.
- Envelope/restore: synchronous loop of `update(1/60)` over >200 ms —
  opacities follow the envelope, hemisphere/point restore exactly
  (readback equals pre-strike).
- Seeded reproducibility: `trigger(7, [-60, -95])` twice → identical
  position-attribute readback.
- Screenshots: strike peak vs pre-strike (south vantage, the proven
  framing) + one www embed shot; vision verdict vs `live_step_040.png`.
- `npm run build` (orchard + www) clean.
