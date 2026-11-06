#!/usr/bin/env python3
"""Convert the Karlsruhe CityJSON LoD2 building tile to the orchard's local
frame for rendering (public/site/buildings_lod2.json).

Input : /mnt_ai/data/odd26/ka3d/hauenstein-20260127/CityJSON/
        gebaeude_lod2_455000_5426000.json (CityJSON 1.0.1, EPSG:25832)
Output: orchard/public/site/buildings_lod2.json
        buildings intersecting the simulation window (+10 m margin), one
        entry per building with its LoD2 surfaces split by semantic type
        (Ground/Wall/Roof), vertices in local metres (x east, y up-above-
        hmin, z south) ready for THREE.ShapeUtils triangulation.

Run with system python3 (pyproj).
"""

import json
import os
import sys

from pyproj import Transformer

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = ("/mnt_ai/data/odd26/ka3d/hauenstein-20260127/CityJSON/"
       "gebaeude_lod2_455000_5426000.json")
OUT = os.path.join(REPO, "orchard", "public", "site", "buildings_lod2.json")

ORIGIN_LAT, ORIGIN_LON = 48.98990, 8.38730
MARGIN = 10.0


def main():
    site = json.load(open(os.path.join(REPO, "orchard", "src", "site.json")))
    win = site["window"]
    hmin = site["heightmap"]["hmin"]
    E0, E1 = win["eMin"], win["eMax"]
    N0, N1 = win["nMin"], win["nMax"]

    tr = Transformer.from_crs("EPSG:4326", "EPSG:25832", always_xy=True)
    e0, n0 = tr.transform(ORIGIN_LON, ORIGIN_LAT)

    cj = json.load(open(SRC))
    verts = cj["vertices"]
    cos = cj["CityObjects"]
    print("cityjson: %d buildings, hmin=%.2f" % (len(cos), hmin))

    def local(x, y, z):
        # x east, y up (ABSOLUTE DHHN metres - same reference as the terrain
        # mesh / getHeightSampler), z south
        return [round(x - e0, 2), round(z, 2), round(n0 - y, 2)]

    buildings = []
    for cid, obj in cos.items():
        geoms = [g for g in obj.get("geometry", []) if str(g.get("lod")) in ("2", "2.0")]
        if not geoms:
            continue
        a = obj.get("attributes", {}) or {}
        # bbox over all lod2 vertices for window test
        xs, ys = [], []
        for g in geoms:
            for surf in g["boundaries"]:
                for ring in surf:
                    for ii in ring:
                        x, y, _z = verts[ii]
                        xs.append(x)
                        ys.append(y)
        if not xs:
            continue
        if max(xs) < E0 - MARGIN or min(xs) > E1 + MARGIN:
            continue
        if max(ys) < N0 - MARGIN or min(ys) > N1 + MARGIN:
            continue

        # collect surfaces with semantic type; dedupe identical rings
        surfaces = []
        seen = set()
        for g in geoms:
            sem = g.get("semantics") or {}
            sem_surfs = sem.get("surfaces") or []
            values = sem.get("values")
            for si, surf in enumerate(g["boundaries"]):
                if values is not None:
                    # MultiSurface -> flat list; nested lists (composites) -> flatten
                    v = values[si]
                    while isinstance(v, list):
                        v = v[0] if v else None
                    stype = sem_surfs[v]["type"] if v is not None and v < len(sem_surfs) else "Unknown"
                else:
                    stype = "Unknown"
                rings = [[local(*verts[ii]) for ii in ring] for ring in surf]
                key = tuple(sorted(map(tuple, rings[0])))
                if key in seen:
                    continue
                seen.add(key)
                surfaces.append({"type": stype, "rings": rings})

        # ground elevation from GroundSurface if present, else min vertex z
        gz = [s["rings"][0][0][1] for s in surfaces if s["type"] == "GroundSurface" and s["rings"]]
        base_y = min(gz) if gz else min(r[0][1] for s in surfaces for r in s["rings"])
        cx = sum(xs) / len(xs) - e0
        cy = sum(ys) / len(ys)
        buildings.append({
            "id": cid,
            "address": "%s %s" % (a.get("address.ThoroughfareName", "?"),
                                  a.get("address.ThoroughfareNumber", "?")),
            "name": a.get("objektname", ""),
            "function": a.get("function", ""),
            "roofType": a.get("hauptdachtyp_bezeichnung", a.get("hauptdachtyp_code", "")),
            "measuredHeight": a.get("measuredHeight"),
            "groundY": round(base_y, 2),
            "centre": [round(cx, 1), round(n0 - cy, 1)],
            "surfaces": surfaces,
        })

    out = {
        "source": "Stadt Karlsruhe 3D-Gebäudemodelle LoD2 (CityJSON, tile 455000_5426000, "
                  "hauenstein-20260127), via geoportal.karlsruhe.de codespace; "
                  "created 2024-05-24 by Firma VCS",
        "crs": "EPSG:25832 -> local: x = E - e0, y = Z - hmin, z = n0 - N (+z south)",
        "hmin": hmin,
        "window": win,
        "count": len(buildings),
        "buildings": buildings,
    }
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
    print("wrote %s: %d buildings" % (OUT, len(buildings)))
    for b in buildings:
        ntypes = {}
        for s in b["surfaces"]:
            ntypes[s["type"]] = ntypes.get(s["type"], 0) + 1
        if any(t in b["address"] for t in ("Florian-Straße 2", "Florian-Straße 4",
                                           "Florian-Straße 6", "Florian-Straße 12")):
            print("  TEST %-28s h=%s surfaces=%s" % (b["address"], b["measuredHeight"], ntypes))


if __name__ == "__main__":
    sys.exit(main())
