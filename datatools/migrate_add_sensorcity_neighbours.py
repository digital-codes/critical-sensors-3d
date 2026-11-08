#!/usr/bin/env python3
"""One-off migration: SensorCity neighbour sensors (ids 8/9/10).

Adds the three readings columns (solar, soilMoist, soilTemp) to the
`sensors` table and registers the three SensorCity neighbour stations in
`sensor_locations` / `sensor_sources`:

  id 8  SC-N-002  002 - Hohenzollernstraße  soil profile (soilMoist/soilTemp)
  id 9  SC-N-116  116 - Breite Straße       air (temp/hum/pres/solar)
  id 10 SC-SW-006 006 - Lützenhardtstraße   air (temp/hum/pres/solar)

Idempotent: every statement checks before it acts (columns via inspect,
rows via INSERT IGNORE), so re-running the script changes nothing. Fresh
databases bootstrapped by create_tables.py already contain all of this -
this script exists for the live database that predates the change.

Execution model follows create_tables.py: MySQL auto-commits DDL, so every
statement runs in its OWN transaction and per-table row counts are printed
(one big engine.begin() would leave freshly created schema objects in place
while a later failure silently rolls the seeds back).

Database connection: $REFSENSORS_DB_URL or the first line of
datatools/dburl.txt (same resolution as refSensors.py).
"""
import os
import sys

from sqlalchemy import create_engine, inspect, text

COLUMNS = ["solar", "soilMoist", "soilTemp"]

LOCATIONS = [
    (8, "SensorCity 002 Hohenzollernstraße", "SensorCity 002", "sensorcity",
     48.994009, 8.387011, None, "soilMoist,soilTemp",
     "SensorCity Bodenprofil, 457 m N; tiefster verlegter Sensor = depth_51 "
     "(61/71 unbestückt)", 1, None),
    (9, "SensorCity 116 Breite Straße", "SensorCity 116", "sensorcity",
     48.991566, 8.388714, None, "temp,hum,pres,solar",
     "SensorCity Luft (T/RH/p/solar), 212 m N", 1, None),
    (10, "SensorCity 006 Lützenhardtstraße", "SensorCity 006", "sensorcity",
     48.988934, 8.383011, None, "temp,hum,pres,solar",
     "SensorCity Luft (T/RH/p/solar), 332 m SW", 1, None),
]

SOURCES = [
    (8, "soilMoist", "station", "SC-N-002", "%", None,
     "Bodenfeuchte, tiefster Sensor (field soil_moisture_at_depth_51), "
     "Stundenmittel"),
    (8, "soilTemp", "station", "SC-N-002", "°C", None,
     "Bodentemperatur, tiefster Sensor (field soil_temperature_at_depth_51), "
     "Stundenmittel"),
    (9, "temp", "station", "SC-N-116", "°C", None, "Stundenmittel"),
    (9, "hum", "station", "SC-N-116", "%", None,
     "luftfeuchte, Stundenmittel"),
    (9, "pres", "station", "SC-N-116", "hPa", None,
     "press in Pa -> /100, Stundenmittel"),
    (9, "solar", "station", "SC-N-116", "W/m²", None,
     "sonnenstrahlung, Stundenmittel"),
    (10, "temp", "station", "SC-SW-006", "°C", None, "Stundenmittel"),
    (10, "hum", "station", "SC-SW-006", "%", None,
     "luftfeuchte, Stundenmittel"),
    (10, "pres", "station", "SC-SW-006", "hPa", None,
     "press in Pa -> /100, Stundenmittel"),
    (10, "solar", "station", "SC-SW-006", "W/m²", None,
     "sonnenstrahlung, Stundenmittel"),
]


def resolve_db_url():
    url = os.environ.get("REFSENSORS_DB_URL")
    if not url:
        dburlFile = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                 "dburl.txt")
        if os.path.exists(dburlFile):
            with open(dburlFile) as f:
                for line in f:
                    line = line.strip()
                    if line:
                        url = line
                        break
    if not url:
        print("No database configured: set REFSENSORS_DB_URL or create "
              "datatools/dburl.txt")
        sys.exit(1)
    return url


def scalar(conn, sql):
    return conn.execute(text(sql)).scalar()


def main():
    engine = create_engine(resolve_db_url())
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    for t in ("sensors", "sensor_locations", "sensor_sources", "stations"):
        if t not in tables:
            print("table %s missing - run create_tables.py first" % t)
            sys.exit(1)

    # 1. readings columns (DDL auto-commits in MySQL - one per transaction)
    cols = {c["name"] for c in insp.get_columns("sensors")}
    for name in COLUMNS:
        if name in cols:
            print("column sensors.%s: already present" % name)
        else:
            print("column sensors.%s: ADD COLUMN ... FLOAT" % name)
            with engine.begin() as conn:
                conn.exec_driver_sql(
                    "ALTER TABLE sensors ADD COLUMN %s FLOAT NULL" % name)

    # 2. registry rows - INSERT IGNORE keeps re-runs harmless
    with engine.begin() as conn:
        before = scalar(conn, "select count(*) from sensor_locations")
    for (sid, name, nameEn, kind, lat, lon, elev, variables, note, active,
         since) in LOCATIONS:
        with engine.begin() as conn:
            res = conn.execute(text(
                "INSERT IGNORE INTO sensor_locations (sensor_id, name, "
                "name_en, kind, lat, lon, elev_m, variables, position_note, "
                "active, since) VALUES (:sid, :name, :nameEn, :kind, :lat, "
                ":lon, :elev, :variables, :note, :active, :since)"),
                {"sid": sid, "name": name, "nameEn": nameEn, "kind": kind,
                 "lat": lat, "lon": lon, "elev": elev, "variables": variables,
                 "note": note, "active": active, "since": since})
            print("sensor_locations %d (%s): %d row inserted"
                  % (sid, name, res.rowcount))
    with engine.begin() as conn:
        print("sensor_locations: %d -> %d rows" % (
            before, scalar(conn, "select count(*) from sensor_locations")))

    with engine.begin() as conn:
        before = scalar(conn, "select count(*) from sensor_sources")
    for (sid, variable, kind, key, unit, agg, note) in SOURCES:
        with engine.begin() as conn:
            res = conn.execute(text(
                "INSERT IGNORE INTO sensor_sources (sensor_id, variable, "
                "source_kind, source_key, unit, agg, note) VALUES (:sid, "
                ":variable, :kind, :key, :unit, :agg, :note)"),
                {"sid": sid, "variable": variable, "kind": kind, "key": key,
                 "unit": unit, "agg": agg, "note": note})
            print("sensor_sources %d.%s <- %s: %d row inserted"
                  % (sid, variable, key, res.rowcount))
    with engine.begin() as conn:
        print("sensor_sources: %d -> %d rows" % (
            before, scalar(conn, "select count(*) from sensor_sources")))

    # 3. summary of what the pipeline now expects to find
    with engine.begin() as conn:
        ids = scalar(conn, "select count(*) from sensor_locations "
                           "where sensor_id in (8, 9, 10)")
        srcs = scalar(conn, "select count(*) from sensor_sources "
                            "where sensor_id in (8, 9, 10)")
        cols = {c["name"] for c in inspect(engine).get_columns("sensors")}
        missing = [c for c in COLUMNS if c not in cols]
    print("summary: %d/3 sensor_locations, %d/10 sensor_sources, columns %s"
          % (ids, srcs, "complete" if not missing else "MISSING %s" % missing))
    if ids == 3 and srcs == 10 and not missing:
        print("migration complete (idempotent - safe to re-run)")
    else:
        print("migration INCOMPLETE - see summary above")
        sys.exit(1)


if __name__ == "__main__":
    main()
