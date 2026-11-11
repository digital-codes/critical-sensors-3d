# Tasks

## 1. Blitz preset

- [x] 1.1 Add a helper in `orchard/src/main.ts` (or config) deriving the nearest strike day from `CONFIG.SPARKS.STRIKE_DAYS` + `CONFIG.SKY.MONTH_CONDITIONS` (verify it yields day 232, labelled Aug 21, with the current config) — verify by a quick console/debug run or node script importing the helper logic
- [x] 1.2 Add the "Blitz" button next to the other preset buttons in the presets row (standalone + embed chrome), activating the blitz path: set the season day, sync all day subscribers, set sky condition to `gewitter` so it survives the day-change sync, arm existing spark scheduling — verify in the browser: press Blitz from an arbitrary day/sky, bolt appears within ~2 s, date label shows Tag 233 (21.08.), sky switches to Gewitter
- [x] 1.3 Add blitz config tuneables (label, day-derivation prefs if any) to `orchard/src/config.ts` following existing config conventions — verify no other module hardcodes the day

## 2. Idle demo loop

- [x] 2.1 Add `CONFIG.IDLE { TIMEOUT_S: 60, DWELL_S: 20 }` to `orchard/src/config.ts` — verify values load with existing config types
- [x] 2.2 Add input activity tracking: window-level capture listeners (pointerdown, pointermove throttled, wheel, keydown) updating `lastInput`; reset on preset/control clicks — verify with a debug hook that timestamps update on touch/click/key
- [x] 2.3 Implement the loop scheduler in `orchard/src/main.ts`: after 60 s idle, cycle preset handlers in order (Tafel → Süd → Nord → Blitz → Katze → Flug), dwell ~20 s each, wait for running animations (`flight.active`) to finish before dwell; start only after chrome is ready — verify manually: leave scene idle, observe the sequence and ~20 s dwell, including a full Flug pass (~62 s for that step)
- [x] 2.4 Stop-on-input behavior: any user input while cycling stops the loop, resets the idle timer, cancels Katze follow if active, and flies to the Tafel preset — verify: click/tap/key during each loop stage returns to Tafel; timer restarts (loop re-arms after another 60 s)

## 3. Integration verification

- [x] 3.1 Run lint/typecheck (`npm run build` or project equivalent in `orchard/`) and fix any new errors
- [x] 3.2 End-to-end check in both standalone and www-embed builds: presets row includes Blitz, idle loop works with embed panel controls, site console logs stay clean — verify with screenshots or `window.__scene3` inspection
