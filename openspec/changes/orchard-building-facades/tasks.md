# Tasks

## 1. Facade kit

- [ ] 1.1 `CONFIG.BUILDINGS.FACADE`: storey height, plinth height/colour,
      window width/height ratios, frame colour, shutter chance + colours,
      pane-brightness variance, tint jitter, `MIN_FACADE_HEIGHT`, noise seed
- [ ] 1.2 `buildings.ts`: wall-plane UV mapping (project wall ring onto its
      plane, normalise u along the wall, v along the height) replacing the
      single-tone wall UV
- [ ] 1.3 Procedural wall texture: base colour + tint jitter, plinth band,
      per-storey window rows (double-casement, white frame, centre mullion,
      sill shadow), shutters, pane brightness — cached per
      colour+layout signature; wall class (front/side/back) from the
      outward normal varies axis count and noise
- [ ] 1.4 Small buildings below `MIN_FACADE_HEIGHT` keep the plain colour;
      narrow wall segments degrade to plain colour

## 2. Verification

- [ ] 2.1 Reproduce the photo vantage (compare preset for
      `newimages/20261028_164047.jpg` or matching camera pose), seeded
      render; compare window grid / plinth / colours against the photo
- [ ] 2.2 Confirm the street-side (front) azimuth against the photo; fix
      the constant if the classes come out mirrored
- [ ] 2.3 Noise check: two neighbouring houses show different axis counts /
      shutter states; same `?seed` renders identically twice
- [ ] 2.4 Small buildings (garages/sheds ≤ 7 m) still plain; roofs
      pixel-identical to before (DOP untouched)

## 3. Docs

- [ ] 3.1 README facade section (kit, wall classes, noise, config knobs)
