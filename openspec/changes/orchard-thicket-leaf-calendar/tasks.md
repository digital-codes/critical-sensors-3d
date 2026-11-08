# Tasks

## 1. Leaf-fall calendar

- [x] 1.1 Retune `CONFIG.SEASONS` to 8 keyframes (274/290/305/320/335 autumn
      anchors; full until Oct 1, bare from Dec 1) and extend grass tints,
      season labels and `SeasonKey` to the new keys
- [x] 1.2 Move the season label formatting in `main.ts` to a shared
      `seasonLabel()` reading `CONFIG.UI.SEASON_LABELS` (drop hardcoded
      labels)
- [x] 1.3 Verify the calendar in-browser at the anchor dates (seeded
      renders: full Oct 1, thinning Oct/Nov, bare Dec)

## 2. Stable season slider

- [x] 2.1 Fixed-width date label (232 px, nowrap, tabular digits) and
      zero-padded 3-digit day numbers
- [x] 2.2 Verify identical slider/label screen geometry across day values
      (7 → 364)

## 3. Thicket strip

- [x] 3.1 Georeference the red "Bushes" outline from
      `newimages/wiese-gebuesch.png` (DOP feature match, outline interior
      trace) into local metres
- [x] 3.2 Add `CONFIG.THICKET` (polygon, count, radius, squash, clearance,
      seed, season tints) and `src/thicket.ts` (instanced blob field,
      polygon rejection sampling, tree clearance)
- [x] 3.3 Aerial canopy texture per blob (instanced UV offsets on dark
      vegetation pixels, material shader patch)
- [x] 3.4 Wire the thicket into the season chain and `__scene3.thicket`
      hook
- [x] 3.5 Suppress terrain snow on the strip (zero lawn-mask cells inside
      the polygon with a soft margin in `main.ts`)
- [x] 3.6 Verify: blob scatter inside the polygon (plotted over the DOP),
      top-down winter render (strip snow-free, meadow snowy), seasonal
      tints

## 4. Docs

- [x] 4.1 README: config groups (incl. `THICKET`), leaf-fall calendar,
      thicket feature description
- [x] 4.2 Tag `v0.8.4-orchard`
