#!/usr/bin/env python3
"""Create the tables for the sensor database (MySQL 'cz').

Matches what datatools/refSensors.py writes (to_sql append on 'sensors')
and what oldwww/srv.php reads.

Model — sensors can be real devices or VIRTUAL composites:

  sensors          one row per measurement hour, per sensor id
  sensor_locations the sensor/device registry (id, names, activeness);
                   virtual/composite devices may carry the site position
  stations         physical measurement sites with real coordinates
  sensor_sources   channel -> source mapping; source_kind is 'station'
                   (external reference sites) or 'sensor' (another sensor
                   of this database, combined with `agg`, e.g. mean)

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
  solar FLOAT NULL,
  soilMoist FLOAT NULL,
  soilTemp FLOAT NULL,
  temp_006 FLOAT NULL,
  hum_006 FLOAT NULL,
  temp_116 FLOAT NULL,
  hum_116 FLOAT NULL,
  r FLOAT NULL,
  g FLOAT NULL,
  b FLOAT NULL,
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

# channel -> source mapping. source_kind 'station': source_key is a
# stations.station_key. source_kind 'sensor': source_key is the numeric
# sensor id of another device in this database; `agg` says how multiple
# sources of one channel combine ('mean').
DDL_SENSOR_SOURCES = """CREATE TABLE IF NOT EXISTS sensor_sources (
  sensor_id SMALLINT NOT NULL,
  variable VARCHAR(16) NOT NULL,
  source_kind VARCHAR(10) NOT NULL,
  source_key VARCHAR(24) NOT NULL,
  unit VARCHAR(12) NULL,
  agg VARCHAR(12) NULL,
  note VARCHAR(160) NULL,
  PRIMARY KEY (sensor_id, variable, source_kind, source_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"""

# labels from the old site's custom.js sensorLabels; id 0 is a VIRTUAL
# composite of external reference stations (mapped in sensor_sources),
# id 7 a VIRTUAL composite of the orchard's own sensors
SEED_LOCATIONS = [
    (0, "Referenz", "Reference", "reference", None, None, None,
     "temp,hum,pres,light,rain,wind,mastWind,mastRain,co2,temp_006,hum_006,temp_116,hum_116",
     "virtueller Verbundsensor - Kanäle von mehreren Stationen, siehe sensor_sources",
     1, "2020-10-01"),
    (1, "Wiese1", "Orchard1", "iot", 48.98990, 8.38730, 113.4,
     "co2,rssi,bat",
     "Position auf der Wiese unbestimmt — Platzhalter Wiesenmitte",
     1, None),
    (2, "Wiese2", "Orchard2", "iot", 48.98990, 8.38730, 113.4,
     "co2,temp,hum,light,r,g,b,rssi,bat",
     "Position auf der Wiese unbestimmt — Platzhalter Wiesenmitte",
     1, "2026-09-19"),
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
    (7, "Wiese-Verbund", "Orchard composite", "virtual", 48.98990, 8.38730, 113.4,
     "co2,temp,hum,pres,light,r,g,b",
     "virtueller Verbund der echten Wiesensensoren (Wiese1 + Wiese2 + Wiesenstation); "
     "Kanäle sobald die Quellen liefern",
     1, None),
    (8, "SensorCity 002 Hohenzollernstraße", "SensorCity 002", "sensorcity",
     48.994009, 8.387011, None,
     "soilMoist,soilTemp",
     "SensorCity Bodenprofil, 457 m N; tiefster verlegter Sensor = depth_51 (61/71 unbestückt)",
     1, None),
    (9, "SensorCity 116 Breite Straße", "SensorCity 116", "sensorcity",
     48.991566, 8.388714, None,
     "temp,hum,pres,solar",
     "SensorCity Luft (T/RH/p/solar), 212 m N",
     1, None),
    (10, "SensorCity 006 Lützenhardtstraße", "SensorCity 006", "sensorcity",
     48.988934, 8.383011, None,
     "temp,hum,pres,solar",
     "SensorCity Luft (T/RH/p/solar), 332 m SW",
     1, None),
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

# channel -> source mapping.
# id 0 (Referenz): each channel from an external station.
# id 7 (Wiese-Verbund): composed FROM the real sensors — co2 = mean of
# Wiese1+Wiese2, the Wiesenstation channels follow once that station is
# live (sources already registered so the composer can pick them up).
SEED_SOURCES = [
    (0, "temp", "station", "DWD-04177", "°C", None, "TT_TU, stündlich"),
    (0, "hum", "station", "DWD-04177", "%", None, "RF_TU, stündlich"),
    (0, "pres", "station", "DWD-04177", "hPa", None, "P0, stündlich"),
    (0, "light", "station", "DWD-04177", "%", None,
     "SD_SO Sonnenscheindauer in %; Produkt eingestellt seit 2026-07"),
    (0, "rain", "station", "DWD-04177", "mm/h", None, "R1, stündliche Summe"),
    (0, "wind", "station", "DWD-04177", "m/s", None, "FF_10 10-min, Stundenmittel"),
    (0, "co2", "station", "ICOS-AS-KIT", "ppm", None, "NRT growing object @30 m; CC BY 4.0"),
    (0, "icosTemp", "station", "ICOS-AS-KIT", "°C", None, "AT @2.5 m"),
    (0, "icosHum", "station", "ICOS-AS-KIT", "%", None, "RH @2.5 m"),
    (0, "icosWind", "station", "ICOS-AS-KIT", "m/s", None, "WS @2.5 m (derzeit kaum belegt)"),
    (0, "mastWind", "station", "SC-WIND-008", "m/s", None, "wind_average_kmh -> m/s, Stundenmittel"),
    (0, "mastRain", "station", "SC-RAIN-GWB", "mm/h", None, "Tipcounter 0.2 mm/Tip, Stundensumme"),
    (0, "temp_006", "station", "SC-SW-006", "°C", None, "Stundenmittel"),
    (0, "hum_006", "station", "SC-SW-006", "%", None, "luftfeuchte, Stundenmittel"),
    (0, "temp_116", "station", "SC-N-116", "°C", None, "Stundenmittel"),
    (0, "hum_116", "station", "SC-N-116", "%", None, "luftfeuchte, Stundenmittel"),
    (1, "co2", "station", "ORCHARD", "ppm", None, "IoT-Knoten auf der Wiese"),
    (2, "co2", "station", "ORCHARD", "ppm", None, "IoT-Knoten auf der Wiese"),
    (6, "temp", "station", "ORCHARD", "°C", None, "geplant"),
    (6, "hum", "station", "ORCHARD", "%", None, "geplant"),
    (6, "pres", "station", "ORCHARD", "hPa", None, "geplant"),
    (6, "light", "station", "ORCHARD", "klx", None, "geplant"),
    (6, "rgb", "station", "ORCHARD", "rgb", None, "geplant; tönt das Licht der 3D-Szene"),
    (7, "co2", "sensor", "1", "ppm", "mean", "aus Wiese1"),
    (7, "co2", "sensor", "2", "ppm", "mean", "aus Wiese2"),
    (7, "temp", "sensor", "6", "°C", "mean", "aus Wiesenstation (geplant)"),
    (7, "hum", "sensor", "6", "%", "mean", "aus Wiesenstation (geplant)"),
    (7, "pres", "sensor", "6", "hPa", "mean", "aus Wiesenstation (geplant)"),
    (7, "light", "sensor", "6", "klx", "mean", "aus Wiesenstation (geplant)"),
    (7, "rgb", "sensor", "6", "rgb", "mean", "aus Wiesenstation (geplant)"),
    (7, "r", "sensor", "2", "0-255", "mean", "aus Wiese2 (Lichtfarbe, nur light>0-Stunden)"),
    (7, "g", "sensor", "2", "0-255", "mean", "aus Wiese2 (Lichtfarbe, nur light>0-Stunden)"),
    (7, "b", "sensor", "2", "0-255", "mean", "aus Wiese2 (Lichtfarbe, nur light>0-Stunden)"),
    (8, "soilMoist", "station", "SC-N-002", "%", None,
     "Bodenfeuchte, tiefster Sensor (field soil_moisture_at_depth_51), Stundenmittel"),
    (8, "soilTemp", "station", "SC-N-002", "°C", None,
     "Bodentemperatur, tiefster Sensor (field soil_temperature_at_depth_51), Stundenmittel"),
    (9, "temp", "station", "SC-N-116", "°C", None, "Stundenmittel"),
    (9, "hum", "station", "SC-N-116", "%", None, "luftfeuchte, Stundenmittel"),
    (9, "pres", "station", "SC-N-116", "hPa", None, "press in Pa -> /100, Stundenmittel"),
    (9, "solar", "station", "SC-N-116", "W/m²", None, "sonnenstrahlung, Stundenmittel"),
    (10, "temp", "station", "SC-SW-006", "°C", None, "Stundenmittel"),
    (10, "hum", "station", "SC-SW-006", "%", None, "luftfeuchte, Stundenmittel"),
    (10, "pres", "station", "SC-SW-006", "hPa", None, "press in Pa -> /100, Stundenmittel"),
    (10, "solar", "station", "SC-SW-006", "W/m²", None, "sonnenstrahlung, Stundenmittel"),
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
    for (sid, var, kind, key, unit, agg, note) in SEED_SOURCES:
        vals = ", ".join(sqlValue(v) for v in (sid, var, kind, key, unit, agg, note))
        stmts.append(
            "INSERT IGNORE INTO sensor_sources "
            "(sensor_id, variable, source_kind, source_key, unit, agg, note) "
            "VALUES (%s);" % vals)
    return stmts


def migrationStatements():
    """utf8mb4 conversion + shape fixups for tables created earlier today.

    CONVERT TO re-encodes all character columns; it is a no-op on tables
    already created with the new DDL. sensor_variables was superseded by
    sensor_sources (source_kind/source_key/agg model) — it only ever held
    seed rows, so --migrate drops it and the seeds re-land in the new
    table.
    """
    return [
        "ALTER TABLE sensors CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
        "ALTER TABLE sensor_locations CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
        "ALTER TABLE stations CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
        "DROP TABLE IF EXISTS sensor_variables;",  # superseded by sensor_sources
        "ALTER TABLE sensor_sources CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
    ]


def allStatements(migrate=False):
    stmts = [DDL_SENSORS + ";", DDL_SENSOR_LOCATIONS + ";",
             DDL_STATIONS + ";", DDL_SENSOR_SOURCES + ";"]
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
                    help="also convert existing tables to utf8mb4/utf8mb4_unicode_ci and drop "
                         "the superseded sensor_variables table (runs after the DDL, before the seeds)")
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

# run each statement in its own transaction: MySQL auto-commits DDL, so a
# later failure inside one big transaction would leave freshly created
# EMPTY tables while the seeds roll back silently. Per-statement scope
# makes any failure name the exact statement instead.
done = 0
for stmt in statements:
    try:
        with engine.begin() as conn:
            conn.execute(text(stmt))
        done += 1
    except Exception as exc:
        print("FAILED on statement:\n  %s\n  error: %s" % (stmt.split("\n")[0][:120], exc))
        sys.exit(1)

print("%d statements executed (DDL + seeds%s)." %
      (done, ", incl. utf8mb4 migration + sensor_variables drop" if args.migrate else ""))

# seed sanity: the three seed tables must not stay empty
with engine.connect() as conn:
    for tbl in ("sensor_locations", "stations", "sensor_sources"):
        n = conn.execute(text("select count(*) from %s" % tbl)).scalar()
        print("  %-17s %d rows %s" % (tbl, n, "" if n else "<< EMPTY - seeds did not land"))

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
    print("sensor_sources:")
    srcQry = ("select sensor_id, variable, source_kind, source_key, agg from sensor_sources "
              "order by sensor_id, variable, source_kind, source_key;")
    print(srcQry)
    for row in conn.execute(text(srcQry)):
        print(" ", tuple(row))
