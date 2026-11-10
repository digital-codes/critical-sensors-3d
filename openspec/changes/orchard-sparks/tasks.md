# Tasks — orchard-sparks

## 1. Module

- [x] 1.1 `src/sparks.ts`: seeded improved-Perlin port + channel builder +
      3 additive line layers + glow sprite + point light, exactly the
      approved `ideas/sparks/strike_test.py` recipe (`window.__sparkUpdate`)
- [x] 1.2 Day-gated scheduler (STRIKE_DAYS ∩ gewitter month, first delay +
      intervals), 200 ms envelope update (leader draw-range, pulses,
      restroke snap), flash snapshot/restore, setDay/setCondition/trigger/
      dispose
- [x] 1.3 `CONFIG.SPARKS` in config.ts (admission rule + derivation
      comments); main.ts wiring: create, render-loop `update(dt)`, slider
      handler + init `setDay(day)`, `setCondition` in applySkyCondition,
      `__scene3.sparks` spread merge

## 2. Verification

- [x] 2.1 `npm run build` clean (orchard + www)
- [x] 2.2 Day gating in the live scene: strike day → bolt within ~3 s
      (probe + screenshot); neighbouring April day and June day → none;
      manual klar on a strike day → none
- [x] 2.3 Envelope + restore: synchronous update loop follows the
      envelope; hemisphere/point restore exactly; `trigger(7, [-60,-95])`
      twice → identical vertex readback
- [x] 2.4 Screenshots: strike peak vs pre-strike (south vantage) + one
      www embed shot; vision verdict vs `live_step_040.png`
- [x] 2.5 Perf sanity: no per-frame allocation while idle (readback of
      scheduler state, no geometry churn between strikes)

## 3. Docs + trace

- [x] 3.1 orchard/README.md Features: day-gated lightning on
      `CONFIG.SPARKS.STRIKE_DAYS` (+ tunables, ideas/sparks origin)
- [x] 3.2 Commit (feature + artifacts + ideas/sparks evidence); archive
      the change after final verification (`openspec archive
      orchard-sparks -y`) and commit the archive
