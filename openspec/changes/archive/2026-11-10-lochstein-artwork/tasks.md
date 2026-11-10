# Tasks — lochstein-artwork

## 1. Module

- [x] 1.1 `src/lochstein.ts`: utm32 lat/lon → local (panel.ts path),
      face-outline Shape + hole ExtrudeGeometry slab, veined canvas
      texture (clean, no graffiti), support boulder + pivot stone,
      ground-set + rotation.y from FACE_AZIMUTH_DEG
- [x] 1.2 `CONFIG.LOCHSTEIN` (admission rule + derivation comments);
      main.ts create-after-terrain + `__scene3.lochstein` spread merge
- [x] 1.3 User corrections 2026-11-10 (visual in-browser review): hole
      Ø +20 % (0.3 → 0.36), bore tilted 40° toward east — NOT ⊥ to the
      face (CSG subtraction via three-bvh-csg replaces the extrude
      hole), texture lighter + more reflective (roughness 0.15)

## 2. Verification

- [x] 2.1 `tsc --noEmit` + `npm run build` clean
- [x] 2.2 Numeric in-page: world position vs pyproj target <0.1 m; face
      normal bearing 45° ± 1°; slab bbox ≈ 3.0 × 1.5 × 0.4; through-hole
      present
- [x] 2.3 Screenshots: NE ground-level vantage vs the OSM reference
      (vision verdict on silhouette/hole/proportions); side view from
      ~144° showing the 0.4 m profile
- [x] 2.4 README Features bullet

## 3. Trace

- [x] 3.1 Commit; archive the change after final verification
      (`openspec archive lochstein-artwork -y`) and commit the archive
