#!/usr/bin/env python3
"""Read SensorCity data for the orchard-neighbour stations selected by
sensorcity_pick.py (selection file: sensorcity_stations.json next to this
script). See that script for the API layout.

- layer 1 (Sensordaten_Update): current values per station
- archive layers 2-5: time-series availability over the last DAYS_BACK days
  plus the latest sample record per station and layer
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = ("https://geoportal.karlsruhe.de/ags04/rest/services/"
        "Hosted/Sensordaten_NodeRED/FeatureServer")
SELECTION = Path(__file__).parent / "sensorcity_stations.json"
DAYS_BACK = 7
UA = {"User-Agent": "wiese-sensorcity/0.1"}

# NOTE: epoch-ms date literals are rejected by this FeatureServer
# ("Ungueltiger Datentyp") - always filter dates with SQL `timestamp '...'`.
ARCHIVE_LAYERS = {
    2: ("Temperatur", ["temp", "luftfeuchte", "press", "bodentemperatur",
                       "bodenfeuchte", "sonnenstrahlung"]),
    3: ("Regenschreiber", ["niederschlag_stdl", "clicks"]),
    4: ("Boden", ["soil_moisture_at_depth_01", "soil_moisture_at_depth_31",
                  "soil_moisture_at_depth_71", "soil_temperature_at_depth_01",
                  "soil_temperature_at_depth_31", "soil_temperature_at_depth_71"]),
    5: ("Wind", ["wind_average_kmh", "windgust_3s_kmh", "wind_direction_degree"]),
}

CURRENT_FIELDS = ("temp", "luftfeuchte", "press", "bodenfeuchte", "bodentemperatur",
                  "wind_average_kmh", "wind_direction_degree", "windgust_3s_kmh",
                  "niederschlag", "niederschlag_stdl", "clicks",
                  "fillinglvl_percent", "pegel")


def query(layer, where, out_fields="*", n=2000, order=None):
    params = {"where": where, "outFields": out_fields, "returnGeometry": "false",
              "f": "json", "resultRecordCount": str(n)}
    if order:
        params["orderByFields"] = order
    url = f"{BASE}/{layer}/query?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    if "features" not in d:
        raise RuntimeError(f"layer {layer}: {json.dumps(d)[:300]}")
    return [f["attributes"] for f in d["features"]]


def iso(ms):
    return time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(ms / 1000)) if ms else "-"


def age_str(ms):
    if not ms:
        return "never"
    s = time.time() * 1000 - ms
    return f"{s / 3600000:.1f} h ago" if s >= 3600000 else f"{s / 60000:.0f} min ago"


def main():
    sel = json.loads(SELECTION.read_text())
    print(f"# {len(sel)} selected stations, archive window = last {DAYS_BACK} days\n")

    print("=" * 100)
    print("CURRENT VALUES (layer 1 Sensordaten_Update)")
    print("=" * 100)
    for s in sel:
        dev = s["device_id"]
        rows = query(1, f"device_id='{dev}'")
        a = rows[0] if rows else {}
        vals = {k: a.get(k) for k in CURRENT_FIELDS if a.get(k) is not None}
        print(f"[{s.get('sector') or '?':>4}] {s['name']:<28} {s['dist_m']:>5.0f} m  "
              f"measured {iso(a.get('measured_at'))} ({age_str(a.get('measured_at'))})")
        print(f"       {vals if vals else '(no numeric values in live row)'}")

    since = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(time.time() - DAYS_BACK * 86400))
    print()
    print("=" * 100)
    print(f"ARCHIVE TIME SERIES (records in last {DAYS_BACK} days + latest sample)")
    print("=" * 100)
    for layer, (label, fields) in ARCHIVE_LAYERS.items():
        print(f"\n--- layer {layer}: {label} ---")
        for s in sel:
            dev = s["device_id"]
            where = f"device_id='{dev}' AND measured_at > timestamp '{since}'"
            n = len(query(layer, where, out_fields="objectid"))
            if n == 0:
                print(f"[{s.get('sector') or '?':>4}] {s['name']:<28} 0 records")
                continue
            latest = query(layer, where,
                           out_fields=",".join(["measured_at"] + fields), n=1,
                           order="measured_at DESC")[0]
            sample = {k: latest.get(k) for k in fields if latest.get(k) is not None}
            print(f"[{s.get('sector') or '?':>4}] {s['name']:<28} {n:>5} recs  "
                  f"latest {iso(latest.get('measured_at'))}  {sample}")


if __name__ == "__main__":
    main()
