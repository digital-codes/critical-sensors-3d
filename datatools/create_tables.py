#!/usr/bin/env python3
"""Create the tables for the sensor database (MySQL 'cz').

Matches what datatools/refSensors.py writes (to_sql append on 'sensors')
and what oldwww/srv.php reads.

Offline mode: --sql prints the DDL + seed statements to stdout and exits
without connecting to any database.
"""
import sys
import os
import argparse

from sqlalchemy import create_engine, text

# ######################################################
# DDL + seed statements

DDL_SENSORS = """CREATE TABLE IF NOT EXISTS sensors (
  `index` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id SMALLINT NOT NULL,
  date DATETIME NOT NULL,
  temp FLOAT NULL,
  hum FLOAT NULL,
  pres FLOAT NULL,
  light FLOAT NULL,
  rain FLOAT NULL,
  wind FLOAT NULL,
  mastWind FLOAT NULL,
  mastRain FLOAT NULL,
  co2 FLOAT NULL,
  icosTemp FLOAT NULL,
  icosHum FLOAT NULL,
  icosWind FLOAT NULL,
  rfu FLOAT NULL,
  rssi SMALLINT NULL,
  bat FLOAT NULL,
  count INT NULL,
  rep INT NULL,
  pkt INT NULL,
  req SMALLINT NULL,
  raw VARCHAR(50) NULL,
  KEY ix_sensors_id_date (id, date),
  KEY ix_sensors_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"""

DDL_SENSOR_LOCATIONS = """CREATE TABLE IF NOT EXISTS sensor_locations (
  sensor_id SMALLINT NOT NULL PRIMARY KEY,
  name VARCHAR(40) NOT NULL,
  name_en VARCHAR(40) NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'iot',
  lat DOUBLE NULL,
  lon DOUBLE NULL,
  elev_m FLOAT NULL,
  variables VARCHAR(200) NULL,
  position_note VARCHAR(160) NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  since DATE NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"""

# labels from the old site's custom.js sensorLabels
SEED_LOCATIONS = [
    (0, "Referenz", "Reference", "reference", 48.98990, 8.38730, None,
     "temp,hum,pres,light,rain,wind,mastWind,mastRain,co2",
     "virtueller Referenzsensor (DWD 04177 + ICOS AS_KIT + SensorCity); Position = Wiesenmitte Katzenwedelwiesen",
     1, "2020-10-01"),
    (1, "Wiese1", "Orchard1", "iot", 48.98990, 8.38730, None,
     "co2,rssi,bat",
     "Position auf der Wiese unbestimmt \u2014 Platzhalter Wiesenmitte",
     1, None),
    (2, "Wiese2", "Orchard2", "iot", 48.98990, 8.38730, None,
     "co2,rssi,bat",
     "Position auf der Wiese unbestimmt \u2014 Platzhalter Wiesenmitte",
     1, None),
    (3, "B\u00fcro", "Office", "iot", None, None, None,
     "co2,rssi,bat",
     "Position unbestimmt",
     1, None),
    (4, "ZKM1", "ZKM1", "iot", None, None, None,
     "co2,rssi,bat",
     "ZKM Karlsruhe \u2014 Position unbestimmt",
     1, None),
    (5, "ZKM2", "ZKM2", "iot", None, None, None,
     "co2,rssi,bat",
     "ZKM Karlsruhe \u2014 Position unbestimmt",
     1, None),
    (6, "Wiesenstation", "Meadow station", "station", 48.98990, 8.38730, None,
     "temp,hum,pres,light,rgb",
     "geplant (Station direkt an der Wiese); l\u00e4uft mit Dummy-Daten bis Inbetriebnahme",
     0, None),
]


def sqlValue(v):
    if v is None:
        return "NULL"
    if isinstance(v, str):
        return "'" + v.replace("\\", "\\\\").replace("'", "\\'") + "'"
    return str(v)


def seedStatements():
    stmts = []
    for row in SEED_LOCATIONS:
        (sid, name, nameEn, kind, lat, lon, elev, variables, note, active, since) = row
        vals = ", ".join(sqlValue(v) for v in
                         (sid, name, nameEn, kind, lat, lon, elev, variables, note, active, since))
        stmts.append(
            "INSERT IGNORE INTO sensor_locations "
            "(sensor_id, name, name_en, kind, lat, lon, elev_m, variables, position_note, active, since) "
            "VALUES (%s);" % vals)
    return stmts


def migrationStatements():
    """Convert existing tables to utf8mb4 + explicit collation.

    CONVERT TO re-encodes all character columns (e.g. a legacy latin1
    'raw' column or pre-existing name strings); it is a no-op on tables
    already created with the new DDL. Non-character columns are untouched.
    """
    return [
        "ALTER TABLE sensors CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
        "ALTER TABLE sensor_locations CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
    ]


def allStatements(migrate=False):
    stmts = [DDL_SENSORS + ";", DDL_SENSOR_LOCATIONS + ";"]
    if migrate:
        stmts += migrationStatements()   # before the seeds: INSERTs land on utf8mb4
    stmts += seedStatements()
    return stmts


# ######################################################
# main

parser = argparse.ArgumentParser(description="Create tables for the sensor database (MySQL 'cz')")
parser.add_argument("--sql", action="store_true",
                    help="print the DDL + seed statements to stdout and exit (offline mode)")
parser.add_argument("--migrate", action="store_true",
                    help="also convert existing tables to utf8mb4/utf8mb4_unicode_ci "
                         "(ALTER ... CONVERT TO; runs after the DDL, before the seeds)")
args = parser.parse_args()

statements = allStatements(migrate=args.migrate)

if args.sql:
    for stmt in statements:
        print(stmt)
    sys.exit(0)

# db url resolution, mirroring refSensors.py
scriptDir = os.path.dirname(os.path.abspath(__file__))
dbUrl = os.environ.get("REFSENSORS_DB_URL")
if not dbUrl:
    dburlFile = os.path.join(scriptDir, "dburl.txt")
    if os.path.exists(dburlFile):
        with open(dburlFile) as f:
            for line in f:
                line = line.strip()
                if line:
                    dbUrl = line
                    break
if not dbUrl:
    print("No database configured: set REFSENSORS_DB_URL or create datatools/dburl.txt")
    sys.exit(1)

try:
    # force utf8mb4 on the connection regardless of what the URL carries,
    # so DDL + seed rows (e.g. "Büro") survive any server default
    engine = create_engine(dbUrl, connect_args={"charset": "utf8mb4"})
except Exception as exc:
    print("Sql failed:", exc)
    sys.exit(1)

with engine.begin() as conn:
    for stmt in statements:
        conn.execute(text(stmt))

print("Tables created (if they did not exist)." +
      (" Migration to utf8mb4 applied." if args.migrate else ""))

# verification block
with engine.connect() as conn:
    print()
    print("SHOW TABLES:")
    for row in conn.execute(text("SHOW TABLES")):
        print(" ", row[0])

    print()
    print("sensor_locations:")
    locQry = "select sensor_id, name, kind, lat, lon, active from sensor_locations order by sensor_id;"
    print(locQry)
    for row in conn.execute(text(locQry)):
        print(" ", tuple(row))
