#!/usr/bin/env python3
"""Create the tables for the sensor database (MySQL 'cz').

Matches what datatools/refSensors.py writes (to_sql append on 'sensors')
and what oldwww/srv.php reads.

Model (the reference sensor is a COMPOSITE of stations at different sites):

  sensors          one row per measurement hour, per sensor id
  sensor_locations the sensor/device registry (id, names, activeness);
                   virtual/composite devices carry no position
  stations         physical measurement sites with real coordinates
  sensor_variables which channel of which sensor comes from which station

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

DDL_STATIONS = """CREATE TABLE IF NOT EXISTS stations (
  station_key VARCHAR(24) NOT NULL PRIMARY KEY,
  name VARCHAR(60) NOT NULL,
  operator VARCHAR(20) NOT NULL,
  lat DOUBLE NULL,
  lon DOUBLE NULL,
  elev_m FLOAT NULL,
  notes VARCHAR(200) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"""

DDL_SENSOR_VARIABLES = """CREATE TABLE IF NOT EXISTS sensor_variables (
  sensor_id SMALLINT NOT NULL,
  variable VARCHAR(16) NOT NULL,
  station_key VARCHAR(24) NULL,
  unit VARCHAR(12) NULL,
  note VARCHAR(160) NULL,
  PRIMARY KEY (sensor_id, variable)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"""

# labels from the old site's custom.js sensorLabels; id 0 is a VIRTUAL
# composite - its channels are mapped to physical stations in
# sensor_variables, so it carries no position of its own
SEED_LOCATIONS = [
    (0, "Referenz", "Reference", "reference", None, None, None,
     "temp,hum,pres,light,rain,wind,mastWind,mastRain,co2",
     "virtueller Verbundsensor - Kanäle von mehreren Stationen, siehe sensor_variables",
     1, "2020-10-01"),
    (1, "Wiese1", "Orchard1", "iot", 48.98990, 8.38730, 113.4,
     "co2,rssi,bat",
     "Position auf der Wiese unbestimmt — Platzhalter Wiesenmitte",
     1, None),
    (2, "Wiese2", "Orchard2", "iot", 48.98990, 8.38730, 113.4,
     "co2,rssi,bat",
     "Position auf der Wiese unbestimmt — Platzhalter Wiesenmitte",
     1, None),
    (3, "Büro", "Office", "iot", None, None, None,
     "co2,rssi,bat",
     "Position unbestimmt",
     1, None),
    (4, "ZKM1", "ZKM1", "iot", None, None, None,
     "co2,rssi,bat",
     "ZKM Karlsruhe — Position unbestimmt",
     1, None),
    (5, "ZKM2", "ZKM2", "iot", None, None, None,
     "co2,rssi,bat",
     "ZKM Karlsruhe — Position unbestimmt",
     1, None),
    (6, "Wiesenstation", "Meadow station", "station", 48.98990, 8.38730, 113.4,
     "temp,hum,pres,light,rgb",
     "geplant (Station direkt an der Wiese); läuft mit Dummy-Daten bis Inbetriebnahme",
     0, None),
]

# physical measurement sites. Coordinates: DWD/ICOS from the operators'
# station metadata (user-provided 2026-11-07); SensorCity from the live
# layer registrations captured in sensorcity_stations.json + the live
# FeatureServer; orchard site position georeferenced, elevation from the
# LGL-BW DGM 0.25 m (meadow centre 113.4 m DHHN).
SEED_STATIONS = [
    ("DWD-04177", "DWD Klimastation Rheinstetten", "DWD",
     48.9726, 8.3301, 116.06,
     "Quelle von temp/hum/pres/light/rain/wind des Referenzsensors"),
    ("ICOS-AS-KIT", "ICOS Atmosphärenstation KIT Campus", "ICOS",
     49.0915, 8.4249, 110.0,
     "CO2 @30 m + Meteo @2.5 m; CC BY 4.0, PID-Zitierpflicht"),
    ("SC-WIND-008", "SensorCity Windmast 008 Weiherfeldstraße", "Stadt KA",
     48.989078, 8.395698, None,
     "621 m östlich der Wiese; ~52 Tage rollendes Archiv"),
    ("SC-RAIN-GWB", "SensorCity Regenmesser Grünwettersbach", "Stadt KA",
     48.951301, 8.471813, None,
     "Barani MeteoRain; kumulativer Tipcounter 0.2 mm/Tip"),
    ("SC-RAIN-RTM", "SensorCity Regenmesser Rintheim", "Stadt KA",
     49.013174, 8.437976, None,
     "UNBRAUCHBAR (Zähler implausibel) — nur zur Dokumentation"),
    ("ORCHARD", "Streuobstwiese Katzenwedelwiesen", "Projekt",
     48.98990, 8.38730, 113.4,
     "Wiesenmitte; Höhe aus LGL-BW DGM 0.25 m"),
    ("SC-N-116", "SensorCity 116 Breite Straße", "Stadt KA",
     48.991566, 8.388714, None, "N 212 m; Luft (T/RH/p/solar)"),
    ("SC-N-002", "SensorCity 002 Hohenzollernstraße", "Stadt KA",
     48.994009, 8.387011, None, "N 457 m; Bodenprofil"),
    ("SC-N-003", "SensorCity 003 Neue-Anlage-Straße", "Stadt KA",
     48.992122, 8.379726, None, "N 607 m; Bodenprofil"),
    ("SC-E-008", "SensorCity 008 Weiherfeldstraße", "Stadt KA",
     48.989078, 8.395698, None, "E 621 m; Luft (T/RH/p/solar)"),
    ("SC-E-011", "SensorCity 011 Schauinslandstraße", "Stadt KA",
     48.983561, 8.393836, None, "E 852 m; Luft (T/RH/p/solar)"),
    ("SC-E-093", "SensorCity 093 Kehler Straße", "Stadt KA",
     48.988212, 8.399485, None, "E 911 m; Bodenprofil"),
    ("SC-SW-006", "SensorCity 006 Lützenhardtstraße", "Stadt KA",
     48.988934, 8.383011, None, "SW 332 m; Luft (T/RH/p/solar)"),
    ("SC-SW-007", "SensorCity 007 Weiherfeldstraße", "Stadt KA",
     48.988948, 8.382984, None, "SW 333 m; Luft (T/RH/p/solar)"),
    ("SC-SW-001", "SensorCity 001 Grünwinkler Straße", "Stadt KA",
     48.988695, 8.380039, None, "SW 548 m; Bodenprofil"),
]

# channel -> source station mapping (the composite reference sensor)
SEED_VARIABLES = [
    (0, "temp", "DWD-04177", "\°C", "TT_TU, stündlich"),
    (0, "hum", "DWD-04177", "%", "RF_TU, stündlich"),
    (0, "pres", "DWD-04177", "hPa", "P0, stündlich"),
    (0, "light", "DWD-04177", "%", "SD_SO Sonnenscheindauer in %; Produkt eingestellt seit 2026-07"),
    (0, "rain", "DWD-04177", "mm/h", "R1, stündliche Summe"),
    (0, "wind", "DWD-04177", "m/s", "FF_10 10-min, Stundenmittel"),
    (0, "co2", "ICOS-AS-KIT", "ppm", "NRT growing object @30 m; CC BY 4.0"),
    (0, "icosTemp", "ICOS-AS-KIT", "\°C", "AT @2.5 m"),
    (0, "icosHum", "ICOS-AS-KIT", "%", "RH @2.5 m"),
    (0, "icosWind", "ICOS-AS-KIT", "m/s", "WS @2.5 m (derzeit kaum belegt)"),
    (0, "mastWind", "SC-WIND-008", "m/s", "wind_average_kmh -> m/s, Stundenmittel"),
    (0, "mastRain", "SC-RAIN-GWB", "mm/h", "Tipcounter 0.2 mm/Tip, Stundensumme"),
    (1, "co2", "ORCHARD", "ppm", "IoT-Knoten auf der Wiese"),
    (2, "co2", "ORCHARD", "ppm", "IoT-Knoten auf der Wiese"),
    (6, "temp", "ORCHARD", "\°C", "geplant"),
    (6, "hum", "ORCHARD", "%", "geplant"),
    (6, "pres", "ORCHARD", "hPa", "geplant"),
    (6, "light", "ORCHARD", "klx", "geplant"),
    (6, "rgb", "ORCHARD", "rgb", "geplant; tönt das Licht der 3D-Szene"),
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
    for (key, name, operator, lat, lon, elev, notes) in SEED_STATIONS:
        vals = ", ".join(sqlValue(v) for v in (key, name, operator, lat, lon, elev, notes))
        stmts.append(
            "INSERT IGNORE INTO stations "
            "(station_key, name, operator, lat, lon, elev_m, notes) "
            "VALUES (%s);" % vals)
    for (sid, var, key, unit, note) in SEED_VARIABLES:
        vals = ", ".join(sqlValue(v) for v in (sid, var, key, unit, note))
        stmts.append(
            "INSERT IGNORE INTO sensor_variables "
            "(sensor_id, variable, station_key, unit, note) "
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
        "ALTER TABLE stations CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
        "ALTER TABLE sensor_variables CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
    ]


def allStatements(migrate=False):
    stmts = [DDL_SENSORS + ";", DDL_SENSOR_LOCATIONS + ";",
             DDL_STATIONS + ";", DDL_SENSOR_VARIABLES + ";"]
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

    print()
    print("stations:")
    stQry = "select station_key, operator, lat, lon, elev_m from stations order by station_key;"
    print(stQry)
    for row in conn.execute(text(stQry)):
        print(" ", tuple(row))

    print()
    print("sensor_variables (sensor 0 = composite reference):")
    varQry = ("select sensor_id, variable, station_key, unit from sensor_variables "
              "order by sensor_id, variable;")
    print(varQry)
    for row in conn.execute(text(varQry)):
        print(" ", tuple(row))
