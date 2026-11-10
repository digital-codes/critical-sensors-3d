#!/usr/bin/env python3
"""Prepare site assets for the orchard 3D model from LGL-BW open geodata.

Reads:
  geoimages/dgm025_32_455_5426_2_bw/dgm025_32_455_5426_1_bw_2022.tif  (DGM 0.25 m heights)
  geoimages/dop20rgbi_32_455_5426_2_bw/dop20rgbi_32_455_5426_1_bw_2024.tif (aerial RGBI 0.2 m)
  OSM data snapshots (trees, structure footprints) under .cache dir of this repo

Writes (deterministic except generatedAt):
  orchard/public/site/heightmap.png   16-bit PNG, mm precision relative to hmin
  orchard/public/site/aerial.jpg      RGB crop of the DOP window
  orchard/src/site.json               geometry/positions/licences for the app

Coordinate systems: source data EPSG:25832 (ETRS89 / UTM32N); app-local
metres: origin (ORIGIN_LAT/LON), +X = easting, +Z = southing (south —
right-handed with +Y up, see to_local), Y = height (absolute DHHN metres).
"""
import json
import os
import sys
from datetime import date

import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy import ndimage as ndi

Image.MAX_IMAGE_PIXELS = None

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
GEO = os.path.join(REPO, "geoimages")
DGM_DIR = os.path.join(GEO, "dgm025_32_455_5426_2_bw")
DOP_DIR = os.path.join(GEO, "dop20rgbi_32_455_5426_2_bw")
DGM_TIF = os.path.join(DGM_DIR, "dgm025_32_455_5426_1_bw_2022.tif")
DGM_TFW = os.path.join(DGM_DIR, "dgm025_32_455_5426_1_bw_2022.tfw")
DGM_UNUSED = os.path.join(DGM_DIR, "dgm025_32_456_5427_1_bw_2022.tif")
DOP_TIF = os.path.join(DOP_DIR, "dop20rgbi_32_455_5426_1_bw_2024.tif")
DOP_TFW = os.path.join(DOP_DIR, "dop20rgbi_32_455_5426_1_bw_2024.tfw")
OSM_TREES = os.path.join(REPO, ".cache", "opencode", "osm_orchard_nodes.json")
OSM_WAYS = os.path.join(REPO, ".cache", "opencode", "osm_ways.json")

OUT_PUBLIC = os.path.join(REPO, "orchard", "public", "site")
OUT_SRC = os.path.join(REPO, "orchard", "src")

ORIGIN_LAT, ORIGIN_LON = 48.98990, 8.38730
# Simulation area: the orchard plus its surroundings (parking/railway/paths),
# ~like the user's reference framing; bounds snapped to full 10 m.
WIN_E_MIN, WIN_E_MAX = 455040.0, 455320.0   # 280 m east-west
WIN_N_MIN, WIN_N_MAX = 5426410.0, 5426630.0  # 220 m south-north

LICENCE_LGL = "Datenlizenz Deutschland - Namensnennung - 2.0 (https://www.govdata.de/dl-de/by-2-0)"
LICENCE_OSM = "(c) OpenStreetMap contributors (ODbL), osm.org/copyright"

# Hocksitzcafe structures: OSM way id -> (height estimate m, note)
# Vantage notes: photo 20261022_125920 is taken from the NORTH-EAST (east
# tower 124028005 = LEFT tower there); photo 20261028_163922 from the SOUTH
# (left=west 124028004, middle 124028003, right=east 124028005, heights).
STRUCTURES = {
    124028003: {"heightEst": 4.0, "note": "roofed platform tower: deck ~2.5 m, slat railing, dark shed roof, blue tarp awning (visible from S and NE), table beneath (NE photo right tower / south photo middle)"},
    124028004: {"heightEst": 3.4, "note": "deck ~2.0 m, cream vertical fabric strips on the SOUTH face, lighter timber (south photo left tower)"},
    124028005: {"heightEst": 4.6, "note": "tallest: two-level platform, slat railing, purple fabric valance over the top crossbeam (south side), ladder on WEST side, diagonal bracing, bench beneath (south photo right tower / NE photo left tower)"},
}
# Species mix per tree, deterministic from OSM node id
SPECIES_CYCLE = ["Oak Medium", "Oak Small", "Aspen Medium", "Oak Medium", "Bush 2"]


def read_tfw(path):
    vals = [float(l.strip()) for l in open(path) if l.strip()]
    a, _, _, e, f = vals[0], vals[1], vals[2], vals[3], vals[4]
    d = -vals[3]  # negative y step
    return {"A": vals[0], "E": vals[4], "N": vals[5], "D": d}


def utm(lat, lon):
    tr = Transformer.from_crs("EPSG:4326", "EPSG:25832", always_xy=True)
    return tr.transform(lon, lat)


def to_local(e, n):
    e0, n0 = utm(ORIGIN_LAT, ORIGIN_LON)
    # +z points SOUTH (z = -(N - n0)): (east, up, south) is right-handed,
    # which three.js requires; (east, up, north) is left-handed and renders
    # the whole scene mirrored.
    return round(e - e0, 3), round(n0 - n, 3)


def main():
    for p in (DGM_TIF, DGM_TFW, DOP_TIF, DOP_TFW, OSM_TREES, OSM_WAYS):
        if not os.path.exists(p):
            sys.exit("missing input: %s" % p)
    os.makedirs(OUT_PUBLIC, exist_ok=True)
    os.makedirs(OUT_SRC, exist_ok=True)

    dgm_tfw = read_tfw(DGM_TFW)
    dop_tfw = read_tfw(DOP_TFW)
    e0_local, n0_local = utm(ORIGIN_LAT, ORIGIN_LON)

    # ---- heightmap ----
    dgm = np.array(Image.open(DGM_TIF), dtype=np.float32)
    # window px in dgm grid
    x0 = int(round((WIN_E_MIN - dgm_tfw["E"]) / dgm_tfw["A"]))
    x1 = int(round((WIN_E_MAX - dgm_tfw["E"]) / dgm_tfw["A"]))
    y0 = int(round((dgm_tfw["N"] - WIN_N_MAX) / dgm_tfw["A"]))
    y1 = int(round((dgm_tfw["N"] - WIN_N_MIN) / dgm_tfw["A"]))
    if x0 < 0 or y0 < 0 or x1 > dgm.shape[1] or y1 > dgm.shape[0]:
        sys.exit("dgm window out of tile: %s" % ((x0, x1, y0, y1),))
    win = dgm[y0:y1, x0:x1]
    hmin = float(round(float(win.min()), 3))
    hmax = float(round(float(win.max()), 3))
    mm = np.round((win - hmin) * 1000.0).astype(np.uint16)
    hm_path = os.path.join(OUT_PUBLIC, "heightmap.png")
    Image.fromarray(mm).save(hm_path)

    # ---- aerial ----
    dop = Image.open(DOP_TIF)
    dx0 = int(round((WIN_E_MIN - dop_tfw["E"]) / dop_tfw["A"]))
    dx1 = int(round((WIN_E_MAX - dop_tfw["E"]) / dop_tfw["A"]))
    dy0 = int(round((dop_tfw["N"] - WIN_N_MAX) / dop_tfw["A"]))
    dy1 = int(round((dop_tfw["N"] - WIN_N_MIN) / dop_tfw["A"]))
    if dx0 < 0 or dy0 < 0 or dx1 > dop.size[0] or dy1 > dop.size[1]:
        # clamp to tile edge (window may start marginally west of the tile origin)
        if dx0 < 0 or dy0 < 0:
            print("note: clamping crop origin to tile edge (dx0=%d dy0=%d)" % (dx0, dy0))
        dx0 = max(0, dx0)
        dy0 = max(0, dy0)
    if dx1 > dop.size[0] or dy1 > dop.size[1]:
        sys.exit("dop window exceeds tile: %s" % ((dx0, dx1, dy0, dy1),))
    crop = dop.crop((dx0, dy0, dx1, dy1)).convert("RGB")

    # ---- remove baked-in shadows + ground-painted crowns inside the orchard ----
    # The Aug-2024 DOP carries the real trees' shadows (and their crowns)
    # painted onto the meadow. Inside the orchard polygon the generated 3D
    # trees replace them, so flatten all large dark features there to the
    # surrounding grass tone (illumination-division shadow removal), keeping
    # fine texture. Outside the polygon the DOP stays untouched.
    ae = np.asarray(crop, dtype=np.float32)
    r_, g_, b_ = ae[..., 0], ae[..., 1], ae[..., 2]
    grey = 0.299 * r_ + 0.587 * g_ + 0.114 * b_
    # lawn mask: green-dominant pixels in the orchard's local bounding box
    e0_local_, n0_local_ = e0_local, n0_local
    E = dop_tfw["E"] + np.arange(dx0, dx1) * dop_tfw["A"]
    N = dop_tfw["N"] - np.arange(dy0, dy1) * dop_tfw["A"]
    lx = np.round(E - e0_local_, 3)
    lz = np.round(n0_local_ - N, 3)  # +z = south
    MX, MZ = np.meshgrid(lx, lz)
    in_orchard = (MX > -45) & (MX < 85) & (MZ > -70) & (MZ < 50)
    lawn = (g_ > r_ + 8) & (g_ > b_ + 8) & (g_ > 60) & (g_ < 210) & in_orchard
    # target tone = median lawn colour; everything darker than ~80 % of it
    # (baked shadows, painted crowns) that sits on/near the lawn is flattened
    # too — the generated 3D trees replace all of that vegetation
    C = np.array(
        [np.median(ae[..., c][lawn]) for c in range(3)], dtype=np.float32
    )
    c_grey = float(0.299 * C[0] + 0.587 * C[1] + 0.114 * C[2])
    dark = grey < c_grey * 0.82
    near_lawn = ndi.binary_dilation(lawn, iterations=30)
    mask = (lawn | (dark & near_lawn)) & in_orchard
    mask = ndi.binary_dilation(mask, iterations=4)
    # normalize each masked pixel toward the lawn tone, keeping a quarter of
    # the local detail so the lawn does not look flat-painted
    low = np.maximum(ndi.gaussian_filter(ae, 3.0), 12.0)
    norm = np.clip(ae / low, 0.6, 1.5)
    flat = C[None, None, :] * (0.75 + 0.25 * norm)
    alpha = ndi.gaussian_filter(mask.astype(np.float32), 4.0)[..., None]
    ae = ae * (1.0 - alpha) + flat * alpha
    crop = Image.fromarray(ae.astype(np.uint8))

    ae_path = os.path.join(OUT_PUBLIC, "aerial.jpg")
    crop.save(ae_path, quality=85)

    # ---- lawn mask from the ORIGINAL (unflattened) DOP ----
    # Exported for grass.ts (blade placement) and the terrain snow gate.
    # The FLATTENED aerial cannot be used for this: its shadow-flatten tints
    # path/trail pixels near crowns toward the lawn median, so they pass the
    # green test and grass/snow would creep onto paths. The raw DOP colours
    # keep gravel/dirt paths grey (g - r <= 8) -> excluded.
    # Enclosed holes are FILLED: the baked tree crowns/shadows mid-meadow are
    # non-green blobs fully surrounded by lawn (the flatten removes them and
    # the 3D trees replace them, so they must count as grass). The flatten's
    # dark|near-lawn union must NOT be used here - it also sweeps in barn
    # roofs, yards and trail edges near the meadow, which put snow back onto
    # everything. Paths/trails/streets connect to the outside non-lawn region
    # and therefore stay open. Grid 250x225, cell (i, j): i = west->east,
    # row 0 = north - same mapping grass.ts and the terrain shader use.
    lawn_filled = ndi.binary_fill_holes(lawn)
    lawn_img = Image.fromarray((lawn_filled * 255).astype(np.uint8), mode="L")
    MASK_W, MASK_H = 250, 225
    lawn_small = lawn_img.resize((MASK_W, MASK_H), Image.BOX)
    lawn_small = lawn_small.point(lambda v: 255 if v > 127 else 0)
    lawn_path = os.path.join(OUT_PUBLIC, "lawn_mask.png")
    lawn_small.save(lawn_path)
    print("  lawn mask: %d/%d cells on (%s)" % (
        sum(1 for v in lawn_small.getdata() if v), MASK_W * MASK_H, lawn_path))

    # ---- tileable Perlin snow-patch texture (ideas/perlin/repeat.py) ----
    # Seamless multi-octave noise tile sampled by the terrain shader for the
    # winter snow patches - replaces the old sin-grid mask that read as a
    # checkerboard. Period 8 over 256 px + 4 octaves gives blobs from ~3 m
    # to ~30 m without an obvious repeat.
    sys.path.insert(0, os.path.join(REPO, "ideas", "perlin"))
    from repeat import tileable_perlin_2d

    sn_arr = tileable_perlin_2d(width=256, height=256, period=8, octaves=4)
    sn_norm = (sn_arr - sn_arr.min()) / (float(np.ptp(sn_arr)) + 1e-9)
    snow_noise_path = os.path.join(OUT_PUBLIC, "snow_noise.png")
    Image.fromarray((sn_norm * 255).astype(np.uint8), mode="L").save(snow_noise_path)
    sn_mean = float(sn_norm.mean())
    sn_std = float(sn_norm.std())

    def dop_px_to_local(px, py):
        e = dop_tfw["E"] + px * dop_tfw["A"]
        n = dop_tfw["N"] - py * dop_tfw["A"]
        return to_local(e, n)

    # ---- trees: Baumkataster Karlsruhe (preferred) or OSM fallback ----
    # The Baumkataster selection (tools/filter_baumkataster.py) carries the
    # real municipal tree register positions in the Katzenwedelwiese (stadtteil
    # 13) with species + trunk circumference; the renderer only uses
    # position/size/preset, so species fidelity is informational.
    trees = []
    bk_path = os.path.join(REPO, ".cache", "opencode", "baumkataster_selected.json")
    if os.path.exists(bk_path):
        bk = json.load(open(bk_path))
        for t in bk:
            if t["zone"] not in ("core", "south"):
                continue  # model the meadow + the south boundary only
            trees.append({
                "id": t["id"],
                "source": t["source"],
                "nameDe": t["nameDe"],
                "nameSci": t["nameSci"],
                "lat": round(t["lat"], 7),
                "lon": round(t["lon"], 7),
                "x": t["x"], "z": t["z"],
                "trunkCircumference": t["trunkCircumference"],
                "sizeClass": t["sizeClass"],
                "heightM": t.get("heightM"),
                "speciesBase": t["speciesBase"],
                "seed": t["seed"],
            })
        print("trees: %d from Baumkataster (core + south)" % len(trees))
    else:
        osm = json.load(open(OSM_TREES))
        for i, el in enumerate(sorted(osm["elements"], key=lambda e: e["id"])):
            e, n = utm(el["lat"], el["lon"])
            x, z = to_local(e, n)
            # keep only trees inside the simulation window (5 m margin)
            if not (WIN_E_MIN - 5 <= e <= WIN_E_MAX + 5):
                continue
            if not (WIN_N_MIN - 5 <= n <= WIN_N_MAX + 5):
                continue
            trees.append({
                "id": "osm%d" % el["id"],
                "source": "OSM node %d" % el["id"],
                "lat": round(el["lat"], 7),
                "lon": round(el["lon"], 7),
                "x": x, "z": z,
                "sizeClass": ["small", "medium", "large"][i % 3],
                "speciesBase": SPECIES_CYCLE[i % len(SPECIES_CYCLE)],
                "seed": el["id"] % 100000,
            })

    # ---- structures ----
    # The OSM ways 124028003/4/5 are mapped inside the PRIVATE GARDEN area at
    # the east end of the orchard - they are garden sheds, NOT the three
    # Hocksitzcafe towers. The towers actually stand in the meadow centre,
    # next to the central tree cluster; their positions were measured from
    # the Aug-2024 DOP (three compact white/brown spots, verified visually).
    # Ground area ~2.4 x 2.4 m each (the OSM footprints are far too large).
    MEASURED_STRUCTURES = {
        124028003: (19.8, -1.6),
        124028004: (15.6, 1.9),
        124028005: (24.7, 5.4),
    }
    HALF = 1.2  # 2.4 m square footprint
    structures = []
    for wid in sorted(STRUCTURES.keys()):
        mx, mz = MEASURED_STRUCTURES[wid]
        structures.append({
            "id": "osmway%d" % wid,
            "osmWay": wid,
            "footprint": [
                [round(mx - HALF, 3), round(mz - HALF, 3)],
                [round(mx + HALF, 3), round(mz - HALF, 3)],
                [round(mx + HALF, 3), round(mz + HALF, 3)],
                [round(mx - HALF, 3), round(mz + HALF, 3)],
            ],
            "x": mx,
            "z": mz,
            "heightEst": STRUCTURES[wid]["heightEst"],
            "note": STRUCTURES[wid]["note"],
            "positionSource": "DOP 2024-08-22 spot measurement (OSM way is a garden shed east of the orchard)",
        })

    # ---- camera presets (y from heightmap sample) ----
    def height_at_local(x, z):
        e = e0_local + x
        n = n0_local - z  # +z = south
        px = int(round((e - dgm_tfw["E"]) / dgm_tfw["A"])) - x0
        py = int(round((dgm_tfw["N"] - n) / dgm_tfw["A"])) - y0
        py = max(0, min(win.shape[0] - 1, py))
        px = max(0, min(win.shape[1] - 1, px))
        return round(float(win[py, px]), 3)

    # Photo vantage presets (match the real photos). NOTE: +z = SOUTH now.
    # - old weekly photos (2020-2022): from the SOUTH-WEST, ground level,
    #   looking NORTH-EAST across the orchard
    # - 2026 photos: slightly elevated (~5 m, above the south hedge) looking
    #   north-east ('erhoeht'), and from the NORTH-WEST hedge looking
    #   south-east at the Hocksitzcafe ('nordwest', photo 20261022_125920)
    tree_xs = [t["x"] for t in trees]
    tree_zs = [t["z"] for t in trees]  # south-positive: min = northernmost
    sx = round(min(tree_xs) - 22.0, 3)
    sz = round(max(tree_zs) + 18.0, 3)
    sy = height_at_local(sx, sz) + 1.5
    sx_look, sz_look = round(min(tree_xs) + 25.0, 3), round(min(tree_zs) - 5.0, 3)
    # erhoeht: ~5.5 m above ground, a bit further south, same NE view axis
    ex, ez = round(min(tree_xs) - 30.0, 3), round(max(tree_zs) + 30.0, 3)
    ey = height_at_local(ex, ez) + 5.5
    # nordwest: inside the meadow's NW corner, ~5 m up, looking SE at the
    # towers (photo 20261022_125920: hedge in the foreground, towers mid-frame)
    nw_x, nw_z = round(min(tree_xs) - 25.0, 3), round(min(tree_zs) - 5.0, 3)
    nw_y = height_at_local(nw_x, nw_z) + 5.0
    tw_x = round(sum(tree_xs) / len(tree_xs), 3)
    tw_z = round(sum(tree_zs) / len(tree_zs), 3)

    site = {
        "generatedAt": date.today().isoformat(),
        "crs": "EPSG:25832",
        "origin": {"lat": ORIGIN_LAT, "lon": ORIGIN_LON,
                   "utmE": round(e0_local, 3), "utmN": round(n0_local, 3)},
        "window": {"eMin": WIN_E_MIN, "eMax": WIN_E_MAX,
                   "nMin": WIN_N_MIN, "nMax": WIN_N_MAX},
        "localAxes": {"x": "easting (m)", "z": "southing (m, +z = south - right-handed for three.js)", "y": "height (m)"},
        "heightmap": {"file": "site/heightmap.png", "encoding": "uint16 millimetres above hmin",
                      "hmin": hmin, "hmax": hmax,
                      "originPx": [x0, y0], "gridM": dgm_tfw["A"]},
        "aerial": {"file": "site/aerial.jpg", "gridM": dop_tfw["A"],
                   "originPx": [dx0, dy0]},
        "lawnMask": {"file": "site/lawn_mask.png", "w": MASK_W, "h": MASK_H,
                     "note": "green-dominant cells of the ORIGINAL DOP (not the "
                             "shadow-flattened aerial - that tints paths green); "
                             "drives grass placement and the terrain snow gate, "
                             "so paths/trails stay bare in winter"},
        "buildingsLod2": {"file": "site/buildings_lod2.json",
                          "note": "LoD2 city buildings around the window "
                                  "(tools/convert_cityjson.py), see sources"},
        "snowNoise": {"file": "site/snow_noise.png", "sizePx": 256,
                      "period": 8, "octaves": 4,
                      "note": "tileable Perlin (ideas/perlin/repeat.py); mean %.3f std %.3f" % (sn_mean, sn_std)},
        "trees": trees,
        "structures": structures,
        "cameraPresets": {
            "southEnd": {"position": [sx, sy, sz], "lookAt": [sx_look, height_at_local(sx_look, sz_look) + 2.0, sz_look]},
            "erhoeht": {"position": [ex, ey, ez], "lookAt": [sx_look, height_at_local(sx_look, sz_look) + 2.0, sz_look]},
            "nordwest": {"position": [nw_x, nw_y, nw_z], "lookAt": [tw_x, height_at_local(tw_x, tw_z) + 2.0, tw_z]},
        },
        "sources": [
            {"file": "geoimages/dgm025_32_455_5426_2_bw/dgm025_32_455_5426_1_bw_2022.tif",
             "role": "terrain heights 0.25 m", "licence": LICENCE_LGL},
            {"file": "geoimages/dgm025_32_455_5426_2_bw/dgm025_32_456_5427_1_bw_2022.tif",
             "role": "adjacent DGM tile (unused, window inside tile 455_5426)", "licence": LICENCE_LGL},
            {"file": "geoimages/dop20rgbi_32_455_5426_2_bw/dop20rgbi_32_455_5426_1_bw_2024.tif",
             "role": "aerial texture 0.2 m RGBI (2024-08-22)", "licence": LICENCE_LGL},
            {"file": ".cache/opencode/baumkataster_selected.json",
             "role": "orchard tree positions + species (Baumkataster Karlsruhe, "
                     "https://codeforkarlsruhe.github.io/baumkataster/, "
                     "Stadt Karlsruhe tree register)",
             "licence": "CC BY 4.0 (Stadt Karlsruhe / Code for Karlsruhe)"},
            {"file": "/mnt_ai/data/odd26/ka3d/hauenstein-20260127/CityJSON/"
                    "gebaeude_lod2_455000_5426000.json",
            "role": "3D building models LoD2 (CityJSON 1.0.1, EPSG:25832), "
                    "official dataset https://transparenz.karlsruhe.de/"
                    "dataset/3d-gebaudemodell-der-stadt-karlsruhe, converted "
                    "via tools/convert_cityjson.py -> site/buildings_lod2.json",
            "licence": "CC BY 4.0 (Stadt Karlsruhe 3D-Gebäudemodell)"},
            {"file": ".cache/opencode/osm_orchard_nodes.json",
             "role": "orchard tree positions (fallback)", "licence": LICENCE_OSM},
            {"file": ".cache/opencode/osm_ways.json",
             "role": "Hocksitzcafe structure footprints", "licence": LICENCE_OSM},
        ],
    }
    site_path = os.path.join(OUT_SRC, "site.json")
    with open(site_path, "w") as f:
        json.dump(site, f, indent=1, sort_keys=True, ensure_ascii=False)
        f.write("\n")

    print("heightmap:", hm_path, Image.open(hm_path).size,
          "h %.2f..%.2f m" % (hmin, hmax))
    print("aerial:   ", ae_path, crop.size)
    print("site.json:", site_path)
    print("trees: %d | structures: %d" % (len(trees), len(structures)))
    print("presets: southEnd y=%.2f elevated y=%.2f" % (sy, ey))
    for t in trees[:3]:
        print("  tree", t["id"], "x=%.1f z=%.1f %s %s" % (t["x"], t["z"], t["sizeClass"], t["speciesBase"]))


if __name__ == "__main__":
    main()
