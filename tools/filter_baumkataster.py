#!/usr/bin/env python3
"""Filter the Karlsruhe Baumkataster (codeforkarlsruhe) for the Katzenwedelwiese.

Input : .cache/opencode/baumkataster_trees.json  (~15 MB, >100k trees)
        items: [lat, lon, nameDe, nameSci, stadtteilNum, stadtteilName,
                wikidataUrl, trunkCircumference]
Output: .cache/opencode/baumkataster_selected.json
        trees in stadtteil 13 (Beiertheim-Bulach) within the Katzenwedelwiese
        (core meadow bbox), immediately adjacent to it, or along the south
        boundary at the street, with local coords + ez-tree preset mapping.

Run with the system python3 (needs pyproj, same as prepare_site.py).
"""

import json
import os
import sys

from pyproj import Transformer

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, ".cache", "opencode", "baumkataster_trees.json")
DST = os.path.join(REPO, ".cache", "opencode", "baumkataster_selected.json")

ORIGIN_LAT, ORIGIN_LON = 48.98990, 8.38730  # same origin as prepare_site.py

# spatial zones in local metres (+z = south), same bbox family as the
# shadow-removal / snow masking in prepare_site.py
CORE = (-45.0, 85.0, -70.0, 50.0)      # the Katzenwedelwiese meadow itself
PAD = 15.0                              # "immediately adjacent" ring
SOUTH_STREET = (-45.0, 85.0, 50.0, 72.0)  # south boundary down to the street

# scientific-name genus -> ez-tree preset family (preset keys look like
# "Oak Medium", "Ash Small", "Bush 2" — size capitalized)
def preset_for(sci, size):
    g = (sci or "").split()[0].lower() if sci else ""
    if g in ("quercus", "prunus", "malus", "pyrus", "juglans", "tilia",
             "aesculus", "acer", "platanus", "robinia", "castanea"):
        fam = "Oak"
    elif g in ("fraxinus",):
        fam = "Ash"
    elif g in ("betula", "populus", "alnus", "salix", "carpinus", "fagus"):
        fam = "Aspen"
    elif g in ("picea", "pinus", "abies", "larix", "pseudotsuga", "taxus"):
        fam = "Pine"
    elif g in ("corylus", "cornus", "sambucus", "crataegus", "ilex",
               "ligustrum", "buxus", "euonymus", "mahonia", "ribes"):
        return "Bush %d" % (1 + (abs(hash(sci)) % 3))
    else:
        fam = "Oak"  # unknown broadleaf (incl. "unbekannt", "Obstbaum") -> oak crown
    return "%s %s" % (fam, size.capitalize())


def size_class(circ):
    try:
        c = float(circ)
    except (TypeError, ValueError):
        return "medium"
    if c < 1.0:
        return "small"
    if c <= 1.8:
        return "medium"
    return "large"


# Realistic target heights (m), calibrated against ground photos
# 20261022_125925/125923: meadow fruit trees ~4-6 m (about half the house
# height), street/edge trees 12-18 m reaching above the eaves, conifers
# 15-20 m. Height scales with trunk circumference within each group.
FRUIT_GENERA = ("malus", "pyrus", "prunus", "juglans", "nuyes", "corylus",
                "cornus", "sambucus", "crataegus")
CONIFER_GENERA = ("picea", "pinus", "abies", "larix", "pseudotsuga", "taxus")


def height_for(sci, circ):
    g = (sci or "").split()[0].lower() if sci else ""
    try:
        c = float(circ)
    except (TypeError, ValueError):
        c = 1.2
    c = max(0.15, min(c, 2.6))
    if g in CONIFER_GENERA:
        return round(12.0 + 3.0 * c, 1)          # 12-20 m
    if g in FRUIT_GENERA or g in ("", "unbekannt"):
        # orchard fruit trees stay low regardless of a thick old trunk
        return round(4.2 + 1.1 * c, 1)           # 4.4-7.0 m
    # open-grown broadleaf (oak, linden, ash, birch, hornbeam, maple...):
    # circumference is the best size proxy
    return round(5.5 + 4.6 * c, 1)               # ~6-17.5 m


def main():
    tr = Transformer.from_crs("EPSG:4326", "EPSG:25832", always_xy=True)
    e0, n0 = tr.transform(ORIGIN_LON, ORIGIN_LAT)

    data = json.load(open(SRC))
    print("baumkataster: %d trees total" % len(data))

    st13 = [it for it in data if len(it) >= 8 and it[4] == 13]
    names = sorted({it[5] for it in st13})
    print("stadtteil 13: %d trees (%s)" % (len(st13), names[:3]))

    selected = []
    counts = {"core": 0, "south": 0, "adjacent": 0}
    # user-curated exclusions (visual check of the DOP, 2026-11): trees ON
    # the western building plot - the residence at x -50..-28 / z -22..-5,
    # its fenced garden (x -36..-26 / z -6..+4) and the strip up to the long
    # barn (x -70..-20 / z +5..+35) - including the single tree right in
    # front of the residence. Explicitly KEPT per user: the 4-tree group
    # north of the plot near the trail (bk02647, bk02690, bk02859, bk02864)
    # and the 4 street trees at Sankt-Florians-Strasse SE (bk00868, bk01202,
    # bk01203, bk01671).
    DROP_IDS = {
        "bk02587",  # in front of the residence, west meadow edge
        "bk02733",  # residence plot west
        "bk02660",  # residence plot south edge
        "bk02591", "bk02682", "bk02593",  # fenced garden
        "bk01271", "bk01272",  # between garden and long barn
        "bk02634", "bk02636",  # plot NE corner, below the trail
    }
    for idx, it in enumerate(st13):
        lat, lon, name_de, name_sci, _num, _name, wiki, circ = it[:8]
        e, n = tr.transform(lon, lat)
        x = round(e - e0, 3)
        z = round(n0 - n, 3)  # +z = south
        cx0, cx1, cz0, cz1 = CORE
        if cx0 <= x <= cx1 and cz0 <= z <= cz1:
            zone = "core"
        elif SOUTH_STREET[0] <= x <= SOUTH_STREET[1] and SOUTH_STREET[2] <= z <= SOUTH_STREET[3]:
            zone = "south"
        elif (cx0 - PAD) <= x <= (cx1 + PAD) and (cz0 - PAD) <= z <= (cz1 + PAD):
            zone = "adjacent"
        else:
            continue
        tree_id = "bk%05d" % idx
        if tree_id in DROP_IDS:
            continue
        counts[{"core": "core", "south": "south", "adjacent": "adjacent"}[zone]] += 1
        sc = size_class(circ)
        selected.append({
            "id": "bk%05d" % idx,
            "source": "Baumkataster Karlsruhe (codeforkarlsruhe)",
            "nameDe": name_de,
            "nameSci": name_sci,
            "lat": lat, "lon": lon,
            "x": x, "z": z,
            "trunkCircumference": circ,
            "sizeClass": sc,
            "heightM": height_for(name_sci, circ),
            "speciesBase": preset_for(name_sci, sc),
            "zone": zone,
            "seed": (int(lat * 1e6) ^ int(lon * 1e6)) % 100000,
        })

    print("selected: %d  (core=%d south-street=%d adjacent=%d)" % (
        len(selected), counts["core"], counts["south"], counts["adjacent"]))
    from collections import Counter
    fams = Counter(t["speciesBase"] for t in selected)
    print("presets:", dict(fams.most_common()))
    species = Counter(t["nameSci"] for t in selected if t["zone"] != "adjacent")
    print("species (modelled):", dict(species.most_common(12)))

    json.dump(selected, open(DST, "w"), ensure_ascii=False, indent=1)
    print("wrote", DST)


if __name__ == "__main__":
    sys.exit(main())
