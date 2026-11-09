# Design — orchard-building-facades

## Context

`buildings.ts` renders 26 LoD2 buildings from
`public/site/buildings_lod2.json` (Stadt Karlsruhe CityJSON →
`tools/convert_cityjson.py`): semantic `WallSurface` / `RoofSurface` /
`GroundSurface` polygons triangulated in 3D, settled onto the DGM. Roofs are
already realistic — they texture with the exact DOP pixels (real tile
colour, real dormers/attic windows). Walls are flat
`MeshLambertMaterial`s: per-building colour picked from a photo-derived
palette (white/cream ×4, yellow-ochre ×2, light grey ×2, sage green ×1) by
id hash; wall UVs currently sample one uniform DOP tone and are unused.

The dataset: 26 buildings, `measuredHeight` 2.3–14.6 m. Eleven real houses
(10.2–14.6 m, mostly St.-Florian-Straße addresses), 15 small structures
(2.3–6.2 m: garages, sheds — the photo analysis likewise says to ignore the
very small ones). Each building carries `roofType`/`function` codes and
`groundY`/`centre`.

Photo analysis (`newimages/20261028_164047.jpg`, the row at
St.-Florian-Straße, golden hour): 3 full storeys + attic in the roof;
4–5 window axes per floor; vertical double-casement windows ~1 : 1.5 with
white frames and centre mullion; dark plinth band 0.5–0.8 m; red-tiled
gabled roofs with dormers (already in the DOP); no balconies; the two main
houses differ only in render colour (yellow vs. blue-grey) and roof
dormers — a uniform typology, varied by colour and small details.

## Goals / Non-Goals

- Goals: photo-typical window/storey/plinth structure on the real house
  walls, per-wall-class layouts, seeded noise for variety, small buildings
  exempt, colours and roofs unchanged.
- Non-Goals: true 3D window recesses, balconies, dormers, gutters, new
  geometry, interior lighting; facade photography per building.

## Decisions

### Canvas-textured walls, not window geometry

Each wall surface gets a small procedural canvas texture (base colour,
plinth band, per-floor window grid with frames/mullions/sill shadow,
shutters, pane brightness) and wall-plane UVs. One 2D draw per wall beats
hundreds of window meshes: no extra draw calls, no z-fighting, works on the
arbitrary LoD2 wall polygons. UV mapping: project the wall ring onto its
plane (the surface normal is already computed in `surfaceGeometry`),
normalise u along the horizontal extent and v along the height, and draw
the kit into that rectangle. Narrow segments (bay widths below one window
axis) render plain colour — real facades have blind stretches too.

Roofs keep the DOP texture; attic/dormer detail comes free from the real
roof pixels, so no roof work is needed.

### Wall classes from outward normals

Each wall's outward normal azimuth classifies it per building: the class
facing the street (St.-Florian-Straße side) is "front", the opposite is
"back", the two perpendicular are "sides". Fronts get the full 4–5-axis
grid, backs slightly sparser (3–4 axes, more shutters), sides fewer axes
(2–3) with the grid centred — the perimeter-block rhythm visible in the
photo. The street-side azimuth is derived from the building addresses
(St.-Florian-Straße runs along the south edge of the row) and validated
against the photo during apply; the mapping lives in one constant so a
wrong guess is a one-line fix.

### Storeys from measuredHeight, ~3 m each

Storeys = round of the wall height (measuredHeight minus roof) over
`FLOOR_H` (3.0 m default), clamped 1–4; the attic floor lives in the roof
(DOP pixels). The 10.2–14.6 m houses land at 3 storeys — matching the
photo. Ground floor gets a slightly taller window row (entrance/storey
typology) with the plinth below.

### Noise: seeded per building id, structured

Noise is drawn from a mulberry32 stream seeded by the building-id hash —
stable across page loads (site-data semantics, unlike the scene's `?seed`
grass/cloud noise). Varied per wall: axis count ±1, window width/height
±10 %, shutter presence (~20 % of windows) with restrained colours (white,
grey, brown), pane brightness (a few darker panes per building), facade
tint jitter ±4 % lightness around the kept palette colour. All knobs live
in `CONFIG.BUILDINGS.FACADE` (floor height, plinth height + colour, window
ratio, frame colour, shutter chance + colours, tint jitter, min facade
height, noise seed) — `buildings.ts` reads, config owns.

### Small buildings exempt

`measuredHeight` below `MIN_FACADE_HEIGHT` (7 m) keeps today's plain
colour — garages/sheds have no storey rhythm in reality either.

## Risks / Trade-offs

- Canvas textures per wall (~196 walls; cached by colour+layout signature)
  cost a one-time generation of a few hundred small canvases — acceptable;
  textures are 128–256 px wide, mipmapped, anisotropy off for speed.
- Wall-plane UV mapping on non-rectangular LoD2 segments can shear the grid
  slightly on trapezoid walls — acceptable at the app's viewing distances;
  narrow segments degrade to plain colour gracefully.
- The front/back azimuth assumption is validated against the photo in the
  first verification render; a wrong guess is a one-constant fix.

## Migration Plan

None — visual-only, no data model change.

## Open Questions

None blocking; street-side azimuth confirmed during apply against the
photo.
