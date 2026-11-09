# Proposal

## Why

East of the main orchard, towards the small trail, lies the "Stückle" — a
small private garden plot (`newimages/stueckle.png`): fenced allotment with
two or three small tool huts. There are no LoD structures for it in the city
data, so today the area is bare terrain (the DOP shows the real beds and
huts, but nothing stands up). The scene should show simple, sensible
procedural structures there.

## What Changes

- A garden plot group (`src/stueckle.ts`) placed from an editable
  `CONFIG.STUECKLE.POLYGON` (local-metre vertices traced from the DOP, same
  pattern as `CONFIG.THICKET.POLYGON`), seeded and deterministic.
- Perimeter fence (~1.2–1.5 m wire-mesh look: thin posts + translucent mesh
  strip along the polygon edges).
- Two gable-roofed tool huts (2–2.5 m tall, ~4.5 × 3 m dark grey roofed and
  ~3.5 × 3 m light grey roofed) placed per the image (north end and south
  corner), with simple canvas wall/roof textures.
- A low greenhouse/cold-frame row (~3–4 m, translucent panels), dark soil
  bed rectangles on the plot ground, compost heaps along the east fence,
  one ~5 m conifer.
- Season wiring: the plot's ground patch is excluded from the terrain snow
  gate like the thicket strip (the lawn mask wrongly claims the garden's
  green DOP pixels), so winter snow stays off the beds.
- All tunables in `CONFIG.STUECKLE` (polygon, hut sizes/colours/positions,
  fence height/colour, bed layout seed).

## Capabilities

### New Capabilities

(none — delta extends `orchard-3d-view`)

### Modified Capabilities

- `orchard-3d-view`: new "Stückle garden plot" requirement (fence, huts,
  beds, greenhouse, compost, conifer) and "Garden plot snow exclusion".

## Impact

- `orchard/src/stueckle.ts` (new), `orchard/src/config.ts` (`CONFIG.STUECKLE`),
  `orchard/src/main.ts` (wiring + snow-mask exclusion),
  `orchard/README.md`

## Verification plan

Seeded renders (summer/winter, top-down + oblique) checked against
`newimages/stueckle.png`; snow exclusion verified top-down in winter.
