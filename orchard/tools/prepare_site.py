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
metres: origin (ORIGIN_LAT/LON), +X = easting, +Z = northing, Y = height.
"""
import json
import os
import sys
from datetime import date

import numpy as np
from PIL import Image
from pyproj import Transformer

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
WIN_E_MIN, WIN_E_MAX = 455000.0, 455500.0
WIN_N_MIN, WIN_N_MAX = 5426300.0, 5426750.0

LICENCE_LGL = "Datenlizenz Deutschland - Namensnennung - 2.0 (https://www.govdata.de/dl-de/by-2-0)"
LICENCE_OSM = "(c) OpenStreetMap contributors (ODbL), osm.org/copyright"

# Hocksitzcafe structures: OSM way id -> (height estimate m, note)
STRUCTURES = {
    124028003: {"heightEst": 3.5, "note": "wooden frame tower with ladder element, purple fabric (photo 20261022_125920)"},
    124028004: {"heightEst": 3.0, "note": "boxier frame with top railing and blue tarp awning (photo 20261022_125920)"},
    124028005: {"heightEst": 2.5, "note": "smaller frame at south meadow edge (photos 20261022_*)"},
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
    ae_path = os.path.join(OUT_PUBLIC, "aerial.jpg")
    crop.save(ae_path, quality=85)

    def dop_px_to_local(px, py):
        e = dop_tfw["E"] + px * dop_tfw["A"]
        n = dop_tfw["N"] - py * dop_tfw["A"]
        return to_local(e, n)

    # ---- trees from OSM ----
    osm = json.load(open(OSM_TREES))
    trees = []
    for i, el in enumerate(sorted(osm["elements"], key=lambda e: e["id"])):
        e, n = utm(el["lat"], el["lon"])
        x, z = to_local(e, n)
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
            {"file": ".cache/opencode/osm_orchard_nodes.json",
             "role": "orchard tree positions", "licence": LICENCE_OSM},
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
