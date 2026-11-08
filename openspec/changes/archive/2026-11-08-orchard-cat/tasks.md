# Tasks — orchard-cat

## 1. Asset

- [x] 1.1 Download the Quaternius CC0 cat (Animated Animals pack), export/obtain
      GLB with Walk + Idle clips, place at `orchard/public/models/cat.glb`,
      record source URL + licence line
- [x] 1.2 Fallback decision point: if no GLB obtainable, switch design.md to the
      procedural variant before any code is written

## 2. Config + module

- [x] 2.1 Add `CONFIG.CAT` to `src/config.ts` (typed, header admission rule)
- [x] 2.2 Implement `src/cat.ts`: GLB load, castShadow traverse, seeded
      closed patrol path with tree clearance, arc-length movement,
      `getHeight` clamping, heading from tangent, Walk/Idle mixer
- [x] 2.3 Wire into `main.ts` (toggle UI "Katze", hidden by default) and merge
      `__scene3.cat` by SPREADING the existing hook object

## 3. Camera

- [x] 3.1 Add "Katze folgen" preset to the camera UI that tracks the cat and
      restores free orbit on exit

## 4. Verification

- [x] 4.1 `npm run build` clean
- [x] 4.2 Seeded browser run: path/terrain/cl assertions (20 poses, ≤1 cm,
      clearance ok), projection-pixel heading probe, no page reload on toggle
- [x] 4.3 Close-up rig screenshots (winter day 15 + summer) → vision check:
      feet on ground, walk pose, shadows into tree shade
- [x] 4.4 Follow-cam readback tracks `followPose`; leaving the preset restores
      free orbit
- [x] 4.5 Task checkboxes ticked only after own verification of each

## 5. Docs + trace

- [x] 5.1 orchard/README.md: Features entry + Licences line (Quaternius CC0)
- [x] 5.2 Commit; archive the change after final verification
      (`openspec archive orchard-cat -y`) with the archive in the same commit
