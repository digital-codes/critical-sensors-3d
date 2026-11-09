# Tasks

## 1. Plot structure

- [x] 1.1 `CONFIG.STUECKLE`: polygon (DOP-traced), hut specs, fence,
      beds, greenhouse, compost, conifer, seed
- [x] 1.2 `src/stueckle.ts`: fence (posts + mesh strip along the polygon),
      two gable-roofed huts with canvas textures, greenhouse, soil beds,
      compost heaps, conifer; group `__scene3.stueckle`
- [x] 1.3 `main.ts` wiring + snow-mask exclusion for the plot polygon
      (list of exclusion polygons alongside the thicket)

## 2. Verification

- [x] 2.1 Seeded summer render: plot placement/extent vs the DOP crop and
      `newimages/stueckle.png` (huts at the right corners, fence closed)
- [x] 2.2 Winter top-down render: beds/plot snow-free, meadow snowy
- [x] 2.3 Re-render identical with the same seed

## 3. Docs

- [x] 3.1 README section (Stückle plot, config knobs)
