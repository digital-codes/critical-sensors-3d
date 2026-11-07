#!/usr/bin/env python3
"""Pick the SensorCity stations around the orchard (Katzenwedelwiesen).

Orchard centre: (48.98990, 8.38730). Selections are written to
`sensorcity_stations.json` next to this script:

1. The 3 nearest *station neighbours* in each of the three directions
   north / east / south-west. Sectors are an angular Voronoi partition around
   the target bearings 0/90/225 deg, boundaries at the midpoints
   45 / 157.5 / 292.5:
       N  = [292.5, 45)   E  = [45, 157.5)   SW = [157.5, 292.5)
2. The closest station with valid *wind* data (FeatureServer layer 5 archive)
   and the closest station with valid *rain* data (layer 3 archive). "Valid"
   = has records in the last 7 days; falls back to any records ever if no
   station reported recently.

Wind/rain positions, in order of preference:
  a) the device's own live-layer registration (most wind masts have their own
     layer-1 station row with geometry),
  b) the archive feature's geometry,
  c) text-match of the archive row's `standort` against live stations.
Known data quirk: the wind parser of station '008 - Weiherfeldstraße' (E) is
registered at the station's live position but its archive rows carry
`stadtteil: Beiertheim-Bulach` (where the *soil* station 007 sits) - a stale
text label; all six sibling wind masts agree with their live registration, so
the registration wins. Rain gauges (Barani MeteoRain) exist only east of the
city (nearest ~4.5 km NE); wind masts are street masts at intersections.

Data source (no auth, f=json):
https://geoportal.karlsruhe.de/ags04/rest/services/Hosted/Sensordaten_NodeRED/FeatureServer
  layer 1  Sensordaten_Update            - live values per device row
  layer 2  NodeRED_Temperatur_Archiv     - temp/rh/pressure/solar
  layer 3  NodeRED_Regenschreiber_Archiv - rain (niederschlag_stdl, clicks)
  layer 4  NodeRED_Bodensensoren_Archiv  - soil moisture/temperature profiles
  layer 5  NodeRED_Windsensor_Archiv     - wind avg/gust/direction

Note: several stations have multiple device rows at identical coordinates
(e.g. '008 - Weiherfeldstraße' twice: one temp parser with values, one wind
parser without). Station selection dedupes rows per physical station
(name + rounded position), keeping the row that carries measurement values;
device positions for the wind/rain picks use the raw device rows.

Run:  python3 sensorcity_pick.py
"""
import json
import math
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = ("https://geoportal.karlsruhe.de/ags04/rest/services/"
        "Hosted/Sensordaten_NodeRED/FeatureServer")
ORCHARD = (48.98990, 8.38730)  # lat, lon - meadow centre
N_PER_SECTOR = 3
RECENT_DAYS = 7
OUT_FILE = Path(__file__).parent / "sensorcity_stations.json"
UA = {"User-Agent": "wiese-sensorcity/0.1"}

# sector -> (bearing_from, bearing_to), interval notation [lo, hi)
SECTORS = {
    "N":  (292.5, 45.0),
    "E":  (45.0, 157.5),
    "SW": (157.5, 292.5),
}


def arcgis_query(layer, where="1=1", out_fields="*", extra=None, raw=False):
    params = {
        "where": where,
        "outFields": out_fields,
        "returnGeometry": "true",
        "outSR": "4326",
        "f": "json",
    }
    if extra:
        params.update(extra)
    url = f"{BASE}/{layer}/query?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=30) as r:
        d = json.load(r)
    if "features" not in d:
        raise RuntimeError(f"layer {layer} query failed: {json.dumps(d)[:300]}")
    if raw:
        return d
    return [f["attributes"] for f in d["features"]]


def bearing_deg(dn, de):
    """Compass bearing from north, clockwise, given metres north/east."""
    return (math.degrees(math.atan2(de, dn))) % 360.0


def in_sector(b, sector):
    lo, hi = SECTORS[sector]
    if lo < hi:
        return lo <= b < hi
    return b >= lo or b < hi  # wraps at north


def enu_metres(rows):
    """Attach dist_m/bearing to rows (lat/lon), metres from the orchard centre."""
    lat0, lon0 = ORCHARD
    m_lat = (111132.954 - 559.822 * math.cos(math.radians(2 * lat0))
             + 1.175 * math.cos(math.radians(4 * lat0)))
    m_lon = 111412.84 * math.cos(math.radians(lat0)) - 93.5 * math.cos(math.radians(3 * lat0))
    for r in rows:
        dn = (r["lat"] - lat0) * m_lat
        de = (r["lon"] - lon0) * m_lon
        r["dist_m"] = math.hypot(dn, de)
        r["bearing"] = bearing_deg(dn, de)
    return rows


def norm(s):
    """Normalise a location string: lowercase, ß -> ss (wind rows use 'Strasse')."""
    return (s or "").strip().lower().replace("\u00df", "ss")


def load_raw_rows():
    """All live device rows (layer 1) with positions.

    Most stations carry their coordinates only as feature geometry, a few
    additionally as lat/lon attributes - try the attribute first, then the
    geometry.
    """
    data = arcgis_query(1, extra={"resultRecordCount": 2000}, raw=True)
    feats = data["features"]
    rows = []
    for f in feats:
        a = f["attributes"]
        g = f.get("geometry") or {}
        lat = a.get("lat") or g.get("y")
        lon = a.get("lon") or g.get("x")
        if lat is None or lon is None:
            continue
        rows.append({"attrs": a, "lat": float(lat), "lon": float(lon)})
    print(f"# live device rows: {len(feats)}, positioned: {len(rows)}")
    return rows


def dedupe_stations(rows):
    """Collapse device rows per physical station (name + rounded position)."""
    by_key = {}
    for r in rows:
        key = (r["attrs"].get("name"), round(r["lat"], 5), round(r["lon"], 5))
        cur = by_key.get(key)
        if cur is None:
            by_key[key] = r
            continue
        has_data = r["attrs"].get("temp") is not None
        cur_has = cur["attrs"].get("temp") is not None
        if (has_data and not cur_has) or (
                has_data == cur_has
                and (r["attrs"].get("measured_at") or 0) > (cur["attrs"].get("measured_at") or 0)):
            by_key[key] = r
    merged = len(rows) - len(by_key)
    print(f"# distinct stations: {len(by_key)} ({merged} duplicate device rows merged)")
    return list(by_key.values())


def summarise_station(r, attrs_extra=()):
    a = r["attrs"]
    out = {
        "device_id": a.get("device_id"), "name": a.get("name"),
        "lat": r["lat"], "lon": r["lon"],
        "dist_m": round(r["dist_m"], 1), "bearing": round(r["bearing"], 1),
        "typ": a.get("typ"), "art": a.get("art"),
        "standort": a.get("standort"), "stadtteil": a.get("stadtteil"),
    }
    for k in attrs_extra:
        out[k] = a.get(k)
    return out


def sector_selection(station_rows):
    sel = []
    for sector in ("N", "E", "SW"):
        cand = sorted((r for r in station_rows if in_sector(r["bearing"], sector)),
                      key=lambda r: r["dist_m"])[:N_PER_SECTOR]
        print(f"\n== Sector {sector} (bearing {SECTORS[sector][0]}..{SECTORS[sector][1]} deg) - {len(cand)} nearest ==")
        for r in cand:
            s = summarise_station(r)
            s["sector"] = sector
            sel.append(s)
            print(f"  {r['dist_m']:7.0f} m  brg {r['bearing']:5.1f}  {s['name']!r}  dev={s['device_id']!r}")
    return sel


def _archive_devices(layer):
    """device_id -> {n_total, n_recent} for one archive layer.

    NOTE: with statistics queries, outFields must name only the group-by
    field - outFields='*' corrupts the response on this FeatureServer.
    """
    since = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(time.time() - RECENT_DAYS * 86400))
    stats = json.dumps([{"statisticType": "count", "onStatisticField": "objectid",
                         "outStatisticFieldName": "n"}])
    by_dev = {}
    queries = (("total", arcgis_query(layer, out_fields="device_id", extra={
                    "groupByFieldsForStatistics": "device_id", "outStatistics": stats})),
               ("recent", arcgis_query(layer, where=f"measured_at > timestamp '{since}'",
                                       out_fields="device_id", extra={
                    "groupByFieldsForStatistics": "device_id", "outStatistics": stats})))
    for label, result in queries:
        for a in result:
            e = by_dev.setdefault(a["device_id"], {"n_total": 0, "n_recent": 0})
            e["n_" + label] = a["n"]
    return by_dev


def _latest_recent_ms(layer, devs):
    """Latest measured_at within the recent window per device."""
    since = time.strftime("%Y-%m-%d %H:%M:%S", time.gmtime(time.time() - RECENT_DAYS * 86400))
    stats = json.dumps([{"statisticType": "max", "onStatisticField": "measured_at",
                         "outStatisticFieldName": "latest"}])
    extra = {"groupByFieldsForStatistics": "device_id", "outStatistics": stats,
             "where": f"measured_at > timestamp '{since}'"}
    return {a["device_id"]: a["latest"] for a in
            arcgis_query(layer, out_fields="device_id", extra=extra)}


def _position_archive_devices(layer, pool_ids, device_rows, station_rows):
    """Map archive device_id -> (source, positioned row). See module docstring."""
    pos = {}
    # a) the device's own live-layer registration
    for r in device_rows:
        d = r["attrs"].get("device_id")
        if d in pool_ids and d not in pos:
            pos[d] = ("live-registration", r)
    # b) archive feature geometry
    miss = [d for d in pool_ids if d not in pos]
    if miss:
        extra = {"returnGeometry": "true", "resultRecordCount": str(len(miss)),
                 "where": "device_id IN (%s)" % ",".join(f"'{d}'" for d in miss)}
        for f in arcgis_query(layer, out_fields="device_id,name", extra=extra, raw=True)["features"]:
            g = f.get("geometry") or {}
            if g.get("x") and g.get("y"):
                r = {"attrs": dict(f["attributes"], lat=g["y"], lon=g["x"]),
                     "lat": float(g["y"]), "lon": float(g["x"])}
                pos[f["device_id"]] = ("archive-geometry", enu_metres([r])[0])
    # c) text-match of the archive row's standort (unique match only)
    by_so = {}
    for r in station_rows:
        by_so.setdefault(norm(r["attrs"].get("standort")), []).append(r)
    for d in [d for d in pool_ids if d not in pos]:
        recs = arcgis_query(layer, where=f"device_id='{d}'",
                            out_fields="standort,stadtteil,stationsnummer,mast",
                            extra={"resultRecordCount": "1", "orderByFields": "measured_at DESC"})
        if not recs:
            continue
        cands = by_so.get(norm(recs[0].get("standort")), [])
        if len(cands) == 1:
            pos[d] = ("standort-text-match", cands[0])
        else:
            print(f"  ? unlocatable wind/rain device {d}: standort={recs[0].get('standort')!r} "
                  f"stadtteil={recs[0].get('stadtteil')!r} -> {len(cands)} station matches")
    return pos


def closest_special_station(layer, device_rows, station_rows, label):
    """Closest station with valid data in an archive layer (rain=3, wind=5)."""
    devs = _archive_devices(layer)
    recent = {d for d, e in devs.items() if e["n_recent"] > 0}
    ever = {d for d, e in devs.items() if e["n_total"] > 0}
    pool_ids, pool_kind = (recent, "last 7 days") if recent else (ever, "any time (fallback)")
    print(f"\n== {label}: {len(ever)} devices with data ever, {len(recent)} in the last "
          f"{RECENT_DAYS} days (pool: {pool_kind}) ==")

    pos = _position_archive_devices(layer, pool_ids, device_rows, station_rows)
    latest = _latest_recent_ms(layer, pool_ids)

    cand = sorted(pos.items(), key=lambda t: t[1][1]["dist_m"])
    for d, (src, r) in cand[:3]:
        ms = latest.get(d)
        print(f"  {r['dist_m']:7.0f} m  brg {r['bearing']:5.1f}  {r['attrs'].get('name')!r}  "
              f"dev={d!r}  pos={src}  latest {time.strftime('%Y-%m-%d %H:%M', time.gmtime(ms / 1000)) if ms else '?'}")
    if not cand:
        return None
    d, (src, r) = cand[0]
    s = summarise_station(r)
    s["sector"] = label.upper()  # WIND / RAIN
    s["position_source"] = src
    s["n_records_recent"] = devs[d]["n_recent"]
    s["n_records_total"] = devs[d]["n_total"]
    s["latest_measured_at"] = latest.get(d)
    if src == "standort-text-match":
        s["note"] = "position from standort text-match (archive row has no coordinates)"
    print(f"  -> selected: {s['name']!r} ({s['dist_m']:.0f} m, {src})")
    return s


def main():
    device_rows = enu_metres(load_raw_rows())
    station_rows = dedupe_stations(device_rows)
    sel = sector_selection(station_rows)

    for layer, label in ((5, "wind"), (3, "rain")):
        s = closest_special_station(layer, device_rows, station_rows, label)
        if s:
            sel.append(s)

    OUT_FILE.write_text(json.dumps(sel, ensure_ascii=False, indent=1, default=str))
    print(f"\n# selection written: {OUT_FILE} ({len(sel)} stations)")


if __name__ == "__main__":
    main()
