#!/usr/bin/env python3
"""Analysis for the real wiese node (sensor id 2) served by critical-sensors.de/srv2.php.

The feed returns a JSON list of string-valued rows. The keys analysed here:

  rfu    - RGB packed into 24 bits, transported as a float
           (int(round(float(v))) & 0xFFFFFF -> 0xRRGGBB, r = high byte)
  light  - brightness; observed range so far 0..255 (8 bit, not 16)

`days` in the URL controls how far back the feed goes (id 2 starts 2026-09-19).

Standalone analysis tool - the fetch/decode functions are kept small so they
can be folded into refSensors.py later. Writes a decoded CSV under tmp/
(gitignored) when --csv is given.
"""
import argparse
import csv
import json
import math
import sys
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

import requests

SRV2_URL = "https://critical-sensors.de/srv2.php"

# Which byte of the 24-bit rfu value carries which channel.
# "RRGGBB" = r is the high byte (natural reading). Flip to "BBGGRR" here if the
# physical LED colour ever disagrees.
RFU_BYTE_ORDER = "RRGGBB"

DEFAULT_CSV = Path(__file__).resolve().parent.parent / "tmp" / "srv2_analysis" / "srv2_decoded.csv"


def daylight(rows, mode):
    """Gate rows to sensible rgb readings. The node's two white LEDs cannot be
    switched off, so rgb with no ambient light is self-illumination, not sky
    colour. 'light' = require the onboard lux channel > 0 (all blink/LED rows
    have light == 0); 'sun' = solar elevation > 0 at the site (keeps dim
    light==0 rows); 'none' = everything."""
    if mode == "none":
        return rows
    if mode == "light":
        return [r for r in rows if r["light"] > 0]
    if mode == "sun":
        from datetime import timezone
        from zoneinfo import ZoneInfo
        LAT, LON = 48.98990, 8.38730  # orchard site (create_tables.py station seed)
        TZ = ZoneInfo("Europe/Berlin")

        def solar_elev(dt):
            utc = dt.replace(tzinfo=TZ).astimezone(timezone.utc)
            doy = utc.timetuple().tm_yday
            hour = utc.hour + utc.minute / 60 + utc.second / 3600
            B = math.radians(360 * (doy - 81) / 365)
            eot = 9.87 * math.sin(2 * B) - 7.53 * math.cos(B) - 1.5 * math.sin(B)
            decl = 23.44 * math.sin(math.radians(360 * (284 + doy) / 365))
            ha = math.radians((hour * 60 + eot + 4 * LON) / 4 - 180)
            lat, d = math.radians(LAT), math.radians(decl)
            cosz = math.sin(lat) * math.sin(d) + math.cos(lat) * math.cos(d) * math.cos(ha)
            return math.degrees(math.asin(max(-1, min(1, cosz))))

        return [r for r in rows if solar_elev(r["date"]) > 0]
    raise ValueError(f"unknown gate {mode!r}")


def fetch_srv2(days, timeout=120):
    """Fetch up to `days` days of rows from srv2.php (raw dicts, all strings)."""
    r = requests.get(SRV2_URL, params={"days": int(days)}, timeout=timeout)
    r.raise_for_status()
    return r.json()


def decode_rfu(value):
    """float (or numeric string) -> 24-bit int -> (r, g, b) bytes."""
    v = int(round(float(value))) & 0xFFFFFF
    hi, mid, lo = v >> 16, (v >> 8) & 0xFF, v & 0xFF
    if RFU_BYTE_ORDER == "RRGGBB":
        return hi, mid, lo
    return lo, mid, hi


def to_rows(raw, sensor_id):
    """Filter one sensor id and parse the fields the analysis needs."""
    rows = []
    for r in raw:
        if str(r.get("id")) != str(sensor_id):
            continue
        rfus = r.get("rfu", "")
        # float-transport evidence: is the string a plain integer?
        plain_int = bool(rfus) and rfus.lstrip("-").isdigit()
        v = int(float(rfus)) if rfus else 0
        rgb = decode_rfu(v)
        rows.append({
            "date": datetime.strptime(r["date"], "%Y-%m-%d %H:%M:%S"),
            "rfu": v,
            "r": rgb[0], "g": rgb[1], "b": rgb[2],
            "light": float(r.get("light") or 0),
            "temp": float(r["temp"]) if r.get("temp") else None,
            "hum": float(r["hum"]) if r.get("hum") else None,
            "co2": float(r["co2"]) if r.get("co2") else None,
            "bat": float(r["bat"]) if r.get("bat") else None,
            "plain_int_rfu": plain_int,
        })
    rows.sort(key=lambda x: x["date"])
    return rows


def pearson(a, b):
    n = len(a)
    if n < 2:
        return float("nan")
    ma, mb = sum(a) / n, sum(b) / n
    cov = sum((x - ma) * (y - mb) for x, y in zip(a, b))
    va = sum((x - ma) ** 2 for x in a)
    vb = sum((y - mb) ** 2 for y in b)
    if va == 0 or vb == 0:
        return float("nan")
    return cov / math.sqrt(va * vb)


def analyze(rows):
    if not rows:
        print("no rows")
        return
    n = len(rows)
    print(f"rows: {n}   {rows[0]['date']}  ->  {rows[-1]['date']}")
    print(f"rfu strings that are plain integers: {sum(r['plain_int_rfu'] for r in rows)}/{n}"
          "  (non-integer => float transport confirmed)")
    over24 = sum(1 for r in rows if r["rfu"] >= 2 ** 24)
    print(f"rfu >= 2**24: {over24}  (float32 is exact below 2**24, so conversion is lossless)")

    # per-day coverage + gaps
    byday = Counter(r["date"].strftime("%Y-%m-%d") for r in rows)
    days = sorted(byday)
    print(f"days with data: {len(days)}   rows/day: min {min(byday.values())} max {max(byday.values())}")
    gaps = [(days[i], days[i + 1]) for i in range(len(days) - 1)
            if (datetime.strptime(days[i + 1], "%Y-%m-%d") - datetime.strptime(days[i], "%Y-%m-%d")).days > 1]
    if gaps:
        print(f"gaps > 1 day: {gaps}")

    # channel stats
    for name in ("r", "g", "b"):
        ch = [r[name] for r in rows]
        print(f"{name}: min {min(ch)}  max {max(ch)}  mean {sum(ch)/n:.1f}")
    print("light: min 0 max", max(r["light"] for r in rows),
          " rows >255:", sum(1 for r in rows if r["light"] > 255),
          " rows ==255:", sum(1 for r in rows if r["light"] == 255),
          " (16-bit range would show values between 256 and 65535)")

    # consistency classes
    lit = [r for r in rows if r["light"] > 0]
    dark = [r for r in rows if r["light"] == 0]
    print(f"lit rows (light>0): {len(lit)}   dark rows: {len(dark)}"
          f"   dark rows with rfu>0: {sum(1 for r in dark if r['rfu'] > 0)}  <- suspect")
    print(f"lit rows with rfu==0: {sum(1 for r in lit if r['rfu'] == 0)}  <- suspect")
    cc = Counter(r["rfu"] for r in rows)
    print("most common rfu:", [(hex(v), c) for v, c in cc.most_common(5)])

    # correlations among lit rows
    if len(lit) >= 2:
        L = [r["light"] for r in lit]
        lum = [0.2126 * r["r"] + 0.7152 * r["g"] + 0.0722 * r["b"] for r in lit]
        print("lit-row pearson(light, luminance):", round(pearson(L, lum), 3),
              " (r)", round(pearson(L, [r["r"] for r in lit]), 3),
              " (g)", round(pearson(L, [r["g"] for r in lit]), 3),
              " (b)", round(pearson(L, [r["b"] for r in lit]), 3))

    # diurnal profile: per-channel means (never average packed ints)
    byhour = defaultdict(list)
    for r in rows:
        byhour[r["date"].hour].append(r)
    print("hour  n    light  r     g     b")
    for h in sorted(byhour):
        hs = byhour[h]
        print(f"{h:4d} {len(hs):4d} {sum(x['light'] for x in hs)/len(hs):6.1f}"
              f" {sum(x['r'] for x in hs)/len(hs):5.1f}"
              f" {sum(x['g'] for x in hs)/len(hs):5.1f}"
              f" {sum(x['b'] for x in hs)/len(hs):5.1f}")

    sus = [r for r in dark if r["rfu"] > 0]
    if sus:
        print("suspect examples (light==0, rfu>0):")
        for r in sus[:5]:
            print("  ", r["date"], hex(r["rfu"]), (r["r"], r["g"], r["b"]))


def write_csv(rows, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["date", "rfu", "r", "g", "b", "light", "temp", "hum", "co2", "bat"])
        for r in rows:
            w.writerow([r["date"], r["rfu"], r["r"], r["g"], r["b"],
                        r["light"], r["temp"], r["hum"], r["co2"], r["bat"]])
    print(f"decoded CSV: {path}  ({len(rows)} rows)")


def main():
    ap = argparse.ArgumentParser(description="srv2.php sensor analysis (rfu -> RGB, light)")
    ap.add_argument("--days", type=int, default=400, help="days of history to request (default 400)")
    ap.add_argument("--id", default="2", help="sensor id to analyse (default 2)")
    ap.add_argument("--gate", choices=("light", "sun", "none"), default="none",
                    help="restrict to sensible rgb rows (default: no gate)")
    ap.add_argument("--csv", action="store_true", help=f"write decoded CSV to {DEFAULT_CSV}")
    args = ap.parse_args()

    raw = fetch_srv2(args.days)
    ids = Counter(str(r.get("id")) for r in raw)
    print(f"srv2.php days={args.days}: {len(raw)} rows, ids: {dict(sorted(ids.items()))}")
    rows = to_rows(raw, args.id)
    if not rows:
        sys.exit(f"no rows for id {args.id} in the last {args.days} days")
    ungated = rows
    rows = daylight(rows, args.gate)
    print(f"gate={args.gate}: {len(rows)}/{len(ungated)} rows kept")
    analyze(rows)
    if args.csv:
        write_csv(rows, DEFAULT_CSV)


if __name__ == "__main__":
    main()
