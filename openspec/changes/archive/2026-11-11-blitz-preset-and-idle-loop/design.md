# Design

## Context

All presets are wired in `orchard/src/main.ts`: fixed presets (Süd/Nord/Tafel) come from `CONFIG.CAMERA.PRESET_LABELS` via the rig (`registerPreset` in `camera.ts`), Katze (follow) and Flug are added as ad-hoc buttons. Sky conditions are applied centrally via `applySkyCondition`; the season day flows through `seasonInput` (in-scene slider in embed mode) with `skyForDay`, and lightning scheduling is day-gated in `sparks.ts` (`CONFIG.SPARKS.STRIKE_DAYS`, month must be `gewitter`). Strike days are currently 2 days per gewitter month (Apr, Aug), e.g. day 233 = Aug 21.

## Goals / Non-Goals

**Goals:**
- Blitz preset jumps to the nearest strike day and shows the storm sky with live bolts.
- Getdata-driven idle loop reusing the existing preset activation paths (buttons' click handlers).

**Non-Goals:**
- Changing strike scheduling, sky condition definitions, or the flight/cat implementations.
- A separate kiosk mode flag — the loop is always active (per user request).

## Decisions

- **Loop drives the existing preset handlers**, not internal camera calls: the loop invokes the same path as clicking each button (Tafel → Süd → Nord → Blitz → Katze → Flug), so follow-cam start/stop, flight start/stop and their cancellation semantics stay in one place. Alternative (driving `rig.applyPreset` directly) would miss katze/flight side effects.
- **Scheduler in main.ts**: a small module-local state machine with `lastInput` timestamp updated by listeners on `pointerdown/pointermove/wheel/keydown` (capture on `window`) plus the existing preset/control handlers; `requestAnimationFrame`-time check, next preset when `now - lastInput > IDLE_TIMEOUT` and (current dwell + animation) finished. Animation-done detection: flight exposes `flight.active`; katze follow has no "finish" (continuous) — plain dwell applies; preset fly-animations finish via rig's tween (dwell counts after it).
- **Config values in CONFIG**: `CONFIG.IDLE = { TIMEOUT_S: 60, DWELL_S: 20 }` and Blitz label in `PRESET_LABELS`-adjacent button block; blitz target day derived from `CONFIG.SPARKS.STRIKE_DAYS` + month condition mapping (currently yields day 233), not hardcoded, so retuning strike days updates Blitz automatically.
- **Blitz activation**: set `seasonInput.value` (or programmatic day path when no input) to the strike day, emit the same day-update path the slider input uses (so grass/terrain/sun/sparks all sync), then `applySkyCondition('gewitter')` before/at the day update so it survives the day-change sync, and trigger `sparks` normally via the new day.
- **Stop-on-input → Tafel**: on first input during the loop, stop the loop, reset lastInput, and invoke the Tafel preset handler. Note: this bullet sits in a previous line grouping; see also the exclusivity decision below.
- **Katze follow and Vogelflug are mutually exclusive** (user 2026-11-11): both drive the camera, so enabling one fully stops the other — Flug start (button + idle stage) hides the cat and drops follow; Katze (button, checkbox, idle stage) stops a running flight; `stopFollow()` helper in main.ts.
- Loop suppressed until the scene chrome is ready (presetsEl built, flight created).

## Risks / Trade-offs

- [Flight (42 s) exceeds the 20 s dwell] → loop waits for `flight.active` to clear before starting the dwell countdown; total cycle time varies.
- [Input listeners may fire from ambient pointer noise (touchscreens)] → use interaction events that reflect real intent (pointerdown/click/keydown/wheel), throttle nothing initially.
- [Loop clicking Katze leaves cat visible when interrupted] → on loop stop, route through the same toggle handler once more only if follow is still active, then go to Tafel; cat visibility returns to the pre-loop default (hidden).
- [Slider day jump resets manual sky overrides] → acceptable and desirable for Blitz (storm look is the point).

## Open Questions

None.
