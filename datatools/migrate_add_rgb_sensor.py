#!/usr/bin/env python3
"""One-off migration: RGB light colour channels of Wiese2 (sensor id 2).

One-off migration for the wiese node srv2.php sensor id 2 (rfu decoded
to RGB 0xRRGGBB, gated light>0). Adds the three readings columns (r, g,
b) to the `sensors` table, registers them in `sensor_sources` as channels
of the Wiese-Verbund composite (id 7, sourced from Wiese2 = sensor 2,
unit 0-255, agg mean) and updates the `sensor_locations` variable
registries:

  sensors.r / g / b        <- Wiese2 rfu decoded to 0xRRGGBB, only for
                              hours with light > 0
  sensor_sources (7,r/g/b) <- sensor 2, agg mean, unit 0-255
  sensor_locations id 2    <- variables co2,temp,hum,light,r,g,b,rssi,bat,
                              since 2026-09-19
  sensor_locations id 7    <- variables co2,temp,hum,pres,light,r,g,b
                              (the planned Wiesenstation rgb channel is
                              replaced by the real r/g/b from Wiese2)

No new `sensor_locations` rows - both ids already exist.

Idempotent: every statement checks before it acts (columns via inspect,
rows via INSERT IGNORE, locations via fixed-value UPDATE), so re-running
the script changes nothing. Fresh databases bootstrapped by
create_tables.py already contain all of this - this script exists for
the live database that predates the change.

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

COLUMNS = ["r", "g", "b"]

SOURCES = [
    (7, "r", "sensor", "2", "0-255", "mean",
     "aus Wiese2 (Lichtfarbe, nur light>0-Stunden)"),
    (7, "g", "sensor", "2", "0-255", "mean",
     "aus Wiese2 (Lichtfarbe, nur light>0-Stunden)"),
    (7, "b", "sensor", "2", "0-255", "mean",
     "aus Wiese2 (Lichtfarbe, nur light>0-Stunden)"),
]

# (sensor_id, variables, since); since None leaves the column untouched
LOCATION_UPDATES = [
    (2, "co2,temp,hum,light,r,g,b,rssi,bat", "2026-09-19"),
    (7, "co2,temp,hum,pres,light,r,g,b", None),
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
    for t in ("sensors", "sensor_locations", "sensor_sources"):
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

    # 3. sensor_locations variable registries - fixed-value UPDATE,
    #    idempotent by construction
    for (sid, variables, since) in LOCATION_UPDATES:
        if since is None:
            sql = ("UPDATE sensor_locations SET variables = :variables "
                   "WHERE sensor_id = :sid")
            params = {"variables": variables, "sid": sid}
            sinceNote = ""
        else:
            sql = ("UPDATE sensor_locations SET variables = :variables, "
                   "since = :since WHERE sensor_id = :sid")
            params = {"variables": variables, "since": since, "sid": sid}
            sinceNote = ", since -> %s" % since
        with engine.begin() as conn:
            res = conn.execute(text(sql), params)
            print("sensor_locations id %d: variables -> %s%s "
                  "(%d row updated)" % (sid, variables, sinceNote,
                                        res.rowcount))

    # 4. summary of what the pipeline now expects to find
    with engine.begin() as conn:
        srcs = scalar(conn,
                      "select count(*) from sensor_sources where "
                      "sensor_id = 7 and variable in ('r', 'g', 'b')")
        cols = {c["name"] for c in inspect(engine).get_columns("sensors")}
        missing = [c for c in COLUMNS if c not in cols]
        locs = dict(conn.execute(text(
            "select sensor_id, variables from sensor_locations "
            "where sensor_id in (2, 7)")).all())
    print("summary: %d/3 sensor_sources, columns %s, "
          "id 2 variables %s, id 7 variables %s"
          % (srcs, "complete" if not missing else "MISSING %s" % missing,
             locs.get(2), locs.get(7)))
    if (srcs == 3 and not missing
            and locs.get(2) == "co2,temp,hum,light,r,g,b,rssi,bat"
            and locs.get(7) == "co2,temp,hum,pres,light,r,g,b"):
        print("migration complete (idempotent - safe to re-run)")
    else:
        print("migration INCOMPLETE - see summary above")
        sys.exit(1)


if __name__ == "__main__":
    main()
