#!/usr/bin/env python3
"""One-off migration: station-qualified SensorCity air columns (id 0).

Adds the four readings columns (temp_006, hum_006, temp_116, hum_116) to
the `sensors` table and registers them in `sensor_sources` as channels of
the reference sensor (id 0), sourced from the already-registered
SensorCity stations:

  temp_006 / hum_006  <- station SC-SW-006  006 - Lützenhardtstraße
  temp_116 / hum_116  <- station SC-N-116   116 - Breite Straße

No new `sensor_locations` or `stations` rows - both stations are already
registered (ids 10 and 9). The per-id neighbour rows keep writing the
unqualified shared channels; these columns add station-qualified copies on
the reference rows (same pattern as mastWind/mastRain).

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

COLUMNS = ["temp_006", "hum_006", "temp_116", "hum_116"]

SOURCES = [
    (0, "temp_006", "station", "SC-SW-006", "°C", None, "Stundenmittel"),
    (0, "hum_006", "station", "SC-SW-006", "%", None,
     "luftfeuchte, Stundenmittel"),
    (0, "temp_116", "station", "SC-N-116", "°C", None, "Stundenmittel"),
    (0, "hum_116", "station", "SC-N-116", "%", None,
     "luftfeuchte, Stundenmittel"),
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
        srcs = scalar(conn,
                      "select count(*) from sensor_sources where sensor_id = 0 "
                      "and variable in ('temp_006', 'hum_006', "
                      "'temp_116', 'hum_116')")
        cols = {c["name"] for c in inspect(engine).get_columns("sensors")}
        missing = [c for c in COLUMNS if c not in cols]
    print("summary: %d/4 sensor_sources, columns %s"
          % (srcs, "complete" if not missing else "MISSING %s" % missing))
    if srcs == 4 and not missing:
        print("migration complete (idempotent - safe to re-run)")
    else:
        print("migration INCOMPLETE - see summary above")
        sys.exit(1)


if __name__ == "__main__":
    main()
