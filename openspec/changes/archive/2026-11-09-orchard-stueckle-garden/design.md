# Design — orchard-stueckle-garden

## Context

The Stückle is a ~28 × 9 m fenced allotment east of the orchard meadow
(DOP: x ≈ 100–143, z ≈ −32…+20 local metres; the paved trail curves along
its northwest side). The DOP terrain texture already shows its soil beds
and hut roofs from above; there are no LoD structures, so nothing stands
up. The aerial analysis: perimeter fence (thin dark line, wire-mesh type),
main hut ~4.5 × 3 m with dark grey gable roof at the north end, second hut
~3.5 × 3 m with light grey (corrugated) roof at the south corner, a low
greenhouse/cold-frame row mid-plot west, staggered dark soil beds, compost
heaps along the east fence, one ~5 m conifer.

## Goals / Non-Goals

- Goals: credible low-detail structures that stand up in the 3D view and
  match the aerial's layout; deterministic; config-editable placement.
- Non-Goals: individual beds' crops, garden tools, people, exact hut
  architecture; interactive anything.

## Placement (mesh-derived, applied)

The Karlsruhe 3D twin (ags05 `3D_Mesh_aus_Luftbildern_Fruehjahr_2024`,
I3S meshpyramids, WGS84 vertex CRS) settles the position exactly: leaf
nodes over the east strip were decoded (offsets from the node OBB centre,
lon/lat degrees + height metres) and validated against the simulated tree
positions (canopy clusters align). The real structures sit at
**x 96–138, z −14…+15** — the fenced yard the mesh shows at
x 110–128 / z +15…+35 is a neighbouring enclosure; the two hut-scale
clusters (1.7–3 m above ground) are at (96–101, +6…+12) and
(117–123, −8…−2). POLYGON/huts/greenhouse/compost/conifer follow these.
Recipe: BFS from node 0 through `nodepages/{n}` (page = nodeIndex // 64),
prune by OBB sphere against the target box, fetch
`nodes/{id}/geometries/0` (8-byte header: vertexCount+featureCount
UInt32, then Float32 position triples = lon/lat degree offsets + height
metres). Note: `stueckle.png` is a viewer screenshot — orientation/scale
dubious, used only as a layout reference, not for placement.

## Decisions

### One module, one config group

`src/stueckle.ts` builds the whole plot as a group (`__scene3.stueckle`);
`CONFIG.STUECKLE` holds `POLYGON` (local-metre vertices, traced from the
DOP during apply — same editability contract as `CONFIG.THICKET.POLYGON`),
hut definitions (position, size, roof colour, wall colour), fence
height/colour/post spacing, bed rectangles (positions/sizes in plot-local
metres from the DOP), greenhouse size, conifer position, and a SEED.

### Structures from primitives + canvas textures

Huts: box body + gable prism roof (small `ExtrudeGeometry` or two rotated
planes + gable triangles), canvas textures for walls (plaster/wood tone
with slight streaks) and roofs (dark grey / light grey with corrugation
lines). 2–2.5 m wall height per the user. Fence: thin posts every ~2.5 m
along the polygon edges + a semi-transparent mesh strip (alpha-mapped
plane, grey) — reads as wire mesh at scene distances without per-wire
geometry. Greenhouse: low box with a translucent white material
(`transparent`, opacity ~0.45) over a light frame. Beds: dark soil
rectangles as thin planes slightly above the terrain with a subtle canvas
noise texture. Compost: 2–3 small dark mounds (flattened spheres).
Conifer: two-three stacked cones + trunk, static, keeps its colour in
winter (evergreen).

### Snow exclusion reuses the thicket mechanism

The garden's green DOP pixels sit in the lawn mask like the thicket strip
did. `main.ts` extends the existing polygon-exclusion to also zero the
lawn-mask cells inside `CONFIG.STUECKLE.POLYGON` when building the terrain
snow mask (the plot is a separate polygon — a list of exclusion polygons
replaces the single thicket check).

### Determinism

All placement comes from config constants + a seeded mulberry32 stream
(`CONFIG.STUECKLE.SEED`) — no per-load randomness needed for static
structures; the seed covers micro-jitter (post alignment, heap shapes).

## Risks / Trade-offs

- The DOP-traced polygon is an estimate; placement is config-editable so
  the user can nudge huts/fence without code changes (established pattern).
- The fence mesh strip is see-through at grazing angles — acceptable at
  scene distances; posts carry the structure visually.
- Hut textures are generic (no match to the real sheds' cladding) — the
  user asked for "something sensible", not photorealism.

## Migration Plan

None — additive visual module.

## Open Questions

None; exact hut positions verified against the DOP crop during apply.
