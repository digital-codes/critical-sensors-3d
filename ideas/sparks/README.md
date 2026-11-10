# ideas/sparks — Perlin lightning-bolt tests (2026-11-09/10)

Source material: `../perlin/sparks.py` — beam displaced by `pnoise2(freq·s, time_speed·t)`
under a sine envelope, Gaussian cross-profile. Goal: a gewitter lightning event for the
orchard scene (`mountOrchard`, wired to `MONTH_CONDITIONS` gewitter days).

## Test scripts

| script | what it does | output |
|---|---|---|
| `spark_test.py` | runtime injection of a static bolt into the live scene (dev server :5199, Playwright + swiftshader, zero repo writes) | `bolt_test*.png`, `flash_off/on.png` |
| `frame_check.py` | 6 frames @ 30 fps from `sparks.py` over 200 ms; measures corridor + consecutive correlation | `spark_strip_200ms.png` |
| `strike_test.py` | full animation: fixed channel + 200 ms multi-pulse envelope (leader 0–40 ms, pulses at 40/95/148 ms), frozen-phase screenshots | `phase_*.png` |
| `strike_live.py` | CDP screencast attempt — stream stalled after 2 frames (unacked-frame stall). Kept as the pitfall record | `live_*.png` (empty sky) |
| `strike_live2.py` | working live test: steps t=10…190 ms, raw CDP `Page.captureScreenshot` per phase (~5 s each, exact request→response pairing) | `live_step_*.png` |
| `montage.py` | builds the contact sheets | `grid_*.png` |

## Measured results

- **Corridor holds** (frame_check): all 6 frames of a 200 ms strike stay within
  x ∈ [135, 252] around center 200 (the ±amp band the sine envelope allows); centroid
  drift ~5 px over 200 ms; consecutive-frame correlation 0.79–0.83.
- **Envelope test** (phase_*, live_step_*): same channel shape + same impact point in
  every frame; only brightness and scene illumination pulse. Corridor confirmed in-scene.
- **Flash** (flash_off vs flash_on): scene-wide hemisphere boost works but 0.9×I
  white-outs; tuned to 0.4×I + point light 35·I (strike_live2).

## Shipped module + repository verification (2026-11-10)

The module lives at `orchard/src/sparks.ts` (OpenSpec change
`2026-11-10-orchard-sparks`); all tunables in `CONFIG.SPARKS`. The
verification scripts below run against the dev servers (5199 orchard,
5212 www) and write their PNGs to the gitignored `wiese/tmp/sparks/`:

| script | what it asserts | output |
|---|---|---|
| `verify_daygate.py` | strike fires on a STRIKE_DAY (first ~1.2 s), silence on neighbouring April day / June day / manual klar; envelope pulses; hemisphere restores exactly (0.7 → 0.906 → 0.7); `trigger(7, [-60,-95])` twice → identical 91-vertex arrays | `verify_peak.png`, `verify_results.json` |
| `verify_shots.py` | frozen-peak screenshots on 5199 + 5212 | `verify_peak.png`, `www_embed_strike.png` |
| `verify_embed.py` | www day-store path (`#zeit` → store → scene gate) + embed strike shot | `www_embed_strike.png` |

Capture gotcha (cost us one round): the LIVE render loop races the ~5 s
CDP capture and finishes the 200 ms strike before the frame lands — the
screenshot then shows plain storm sky. Fix: step the real `update(dt)` to
the wanted phase, then stub it (`sp.update = () => {}`; main.ts re-reads
the property every frame) so the loop keeps drawing a frozen strike.

### Design decisions implemented in `orchard/src/sparks.ts`

- One channel per strike: sample noise at a per-strike `t0`, geometry built once;
  animation = multi-pulse brightness envelope (2–3 return strokes over ~200 ms).
- Optional shape variation: small `t` creep (time_speed 0.7) + t-snap at each
  re-stroke — stays inside the corridor by construction.
- Leader phase 0–40 ms: `setDrawRange` growth + brightness ramp ≥ 0.6 (0.25 was invisible).
- Flash: point light at strike (decay 1) + hemisphere boost ~0.4·I.
- Strike endpoint must be pinned to terrain height (bolt_test3's floating glow orb).
- Gotcha: on swiftshader, `pg.screenshot()` takes ~30 s; raw CDP
  `Page.captureScreenshot` ~5 s and pairs exactly with the state you just set.
