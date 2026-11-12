#!/usr/bin/env python3
"""DWD and ICOS data """
import sys
import os
import csv
import time
import argparse

from datetime import datetime, timedelta, timezone
import pandas as pd
import numpy as np

# for dwd
import requests
import zipfile
import io

# for icos
from icoscp_core.icos import meta, data

# for sql connection
# see https://www.tutorialspoint.com/sqlalchemy/sqlalchemy_core_sql_expressions.htm
from sqlalchemy import create_engine, inspect, text
from sqlalchemy import Table, Column, Integer, SmallInteger, Float, String, DateTime, MetaData

# offline mode: fetch/merge only, write CSVs instead of touching the database
parser = argparse.ArgumentParser(description="DWD and ICOS reference sensor update")
parser.add_argument("--csv",action="store_true",help="write ref_<ts>.csv and co2_<ts>.csv instead of updating the database")
args = parser.parse_args()

# ######################################################
# get dwd data
def d(x):
    return datetime.strptime(str(x),"%Y%m%d%H")

# dwd: Alle Zeitangaben in diesem Verzeichnis sind in UTC.
sources = [
{"data":"temp","name":"TT_TU","url":"https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/air_temperature/recent/stundenwerte_TU_04177_akt.zip"},
{"data":"hum","name":"RF_TU","url":"https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/air_temperature/recent/stundenwerte_TU_04177_akt.zip"},
{"data":"light","name":"SD_SO","url":"https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/sun/recent/stundenwerte_SD_04177_akt.zip"},
{"data":"pres","name":"  P0","url":"https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/pressure/recent/stundenwerte_P0_04177_akt.zip"},
{"data":"rain","name":"  R1","url":"https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/precipitation/recent/stundenwerte_RR_04177_akt.zip"}
]

dwd = pd.DataFrame()

def extract(s,data):
    df = pd.read_csv(io.StringIO(data),sep=";")
    df["date"] = df.MESS_DATUM.apply(d)
    #df.drop(columns=["MESS_DATUM","STATIONS_ID","QN_9","eor"],inplace=True)
    df = df.drop(df.loc[df.date < "2020-10-01 00:00:00"].index)
    # DWD pads some column names with spaces ("   F") - tolerate both
    col = s["name"] if s["name"] in df.columns else s["name"].strip()
    df = df.rename(columns={col:s["data"]})
    df = df.reset_index()
    if s["data"] == "light":
        df.light = df.light / 60 * 100
    if s["data"] == "rain":
        df.loc[df.rain < -100,"rain"] = float("nan")  # DWD -999 sentinel; dry hours are 0.0
    #print(s["data"],df)
    return df[["date",s["data"]]]

# icos: fetch object metadata (citation) and write ICOS-CITATION.txt
scriptDir = os.path.dirname(os.path.abspath(__file__))
icosCitationFile = os.path.join(scriptDir, "ICOS-CITATION.txt")

# ######################################
# single-instance lock + graceful termination
#
# On start, an older still-running refSensors.py is SIGTERMed; the old
# process aborts at the next checkpoint (never mid database write). A hard
# kill mid-write would still self-heal: rows are inserted date-ascending
# and the latest-date dedup makes the next run continue exactly there.
import signal, atexit, errno

lockFile = os.path.join(scriptDir,"refsensors.lock")
_shutdown = {"flag": False}

def _pidAlive(pid):
    if pid <= 0: return False
    try:
        os.kill(pid, 0)
        return True
    except OSError as e:
        return e.errno == errno.EPERM  # alive, owned by another user

def _isRefsensors(pid):
    # guard against PID reuse: only trust the lock if the process is ours
    try:
        with open("/proc/%d/cmdline" % pid,"rb") as f:
            return b"refSensors" in f.read()
    except OSError:
        return False

def _onTerm(signum, frame):
    if not _shutdown["flag"]:
        print("termination requested (signal %d) - aborting at next checkpoint..." % signum)
    _shutdown["flag"] = True

def checkShutdown(step):
    if _shutdown["flag"]:
        print("aborted before %s (graceful termination)" % step)
        sys.exit(2)

def _releaseLock():
    try:
        if os.path.exists(lockFile):
            with open(lockFile) as f:
                if f.read().strip() == str(os.getpid()):
                    os.remove(lockFile)
    except OSError:
        pass

if os.path.exists(lockFile):
    try:
        oldpid = int(open(lockFile).read().strip())
    except (OSError, ValueError):
        oldpid = 0
    if oldpid != os.getpid() and _pidAlive(oldpid) and _isRefsensors(oldpid):
        print("another refSensors.py is running (pid %d) - sending SIGTERM..." % oldpid)
        try:
            os.kill(oldpid, signal.SIGTERM)
        except OSError:
            pass
        for _ in range(24):                      # up to 60 s for a graceful exit
            if not _pidAlive(oldpid): break
            time.sleep(2.5)
        else:
            print("old process still alive - sending SIGKILL")
            try: os.kill(oldpid, signal.SIGKILL)
            except OSError: pass
            time.sleep(1)
    else:
        print("stale lock (pid %d not a live refSensors.py) - taking over" % oldpid)

with open(lockFile,"w") as f:
    f.write(str(os.getpid()))
atexit.register(_releaseLock)
signal.signal(signal.SIGTERM,_onTerm)
signal.signal(signal.SIGINT,_onTerm)   # Ctrl-C exits gracefully too

# ######################################
# database connection + schema upgrade
#
# Every ALTER TABLE on 'sensors' runs HERE: after an older instance has
# been killed (its table locks are gone) and before this process opens any
# read or write on 'sensors'. An open transaction over the table holds
# MySQL metadata locks, so an alteration after the first access blocks
# until the lock wait timeout - the failure the previous late-upgrade
# position (just before the append) ran into.
def resolve_db_url():
    """$REFSENSORS_DB_URL or the first line of datatools/dburl.txt."""
    url = os.environ.get("REFSENSORS_DB_URL")
    if not url:
        dburlFile = os.path.join(scriptDir, "dburl.txt")
        if os.path.exists(dburlFile):
            with open(dburlFile) as f:
                for line in f:
                    line = line.strip()
                    if line:
                        url = line
                        break
    return url


dbUrl = resolve_db_url()
scEngine = None
if not args.csv:
    if not dbUrl:
        print("No database configured: set REFSENSORS_DB_URL or create datatools/dburl.txt")
        sys.exit(1)
    try:
        upgradeEngine = create_engine(dbUrl)
        existingCols = {c["name"] for c in inspect(upgradeEngine).get_columns("sensors")}
    except Exception as exc:
        print("Sql failed:", exc)
        sys.exit(1)
    with upgradeEngine.begin() as conn:
        for col in ("icosTemp","icosHum","icosWind","wind","mastWind","rain","mastRain",
                    "solar","soilMoist","soilTemp",
                    "temp_006","hum_006","temp_116","hum_116",
                    "r","g","b"):
            if col not in existingCols:
                print("ALTER TABLE sensors ADD COLUMN",col)
                conn.exec_driver_sql("ALTER TABLE sensors ADD COLUMN %s FLOAT" % col)
    upgradeEngine.dispose()
    # a read-only lookup connection for the fetch windows; the real write
    # engine is created in the database section below (same URL)
    try:
        scEngine = create_engine(dbUrl)
        inspect(scEngine).get_table_names()  # force a connection now
    except Exception as exc:
        print("SensorCity: database lookup unavailable (%s)" % exc)
        scEngine = None

def updateIcosCitation(dobjUri,fileName,outFile=None):
    objHash = dobjUri.rstrip("/").split("/")[-1]
    url = "https://meta.icos-cp.eu/objects/%s/%s.json" % (objHash,fileName)
    objJson = None
    for attempt in range(2):
        try:
            r = requests.get(url,timeout=10)
            r.raise_for_status()
            objJson = r.json()
            break
        except requests.RequestException:
            if attempt == 0:
                time.sleep(10)
    if objJson is None:
        print("Warning: could not fetch object metadata for citation:",fileName)
        return

    refs = objJson.get("references") or {}
    citation = refs.get("citationString")
    pid = objJson.get("pid") or ("11676/" + objHash)
    if not citation:
        # construct citation per the ICOS referencing style
        refsAuthors = (objJson.get("references") or {}).get("authors") or []
        authors = ", ".join(
            ("%s %s" % (a.get("firstName",""),a.get("lastName",""))).strip()
            for a in refsAuthors
        )
        title = objJson.get("title") or fileName
        submission = objJson.get("submission") or {}
        year = str(submission.get("stop") or submission.get("start") or "")[:4]
        citation = "%s (%s). %s, ICOS RI" % (authors,year,title)

    print("citation: ",citation)
    if outFile is None:
        outFile = icosCitationFile
    with open(outFile,"w") as f:
        f.write(citation + "\n")
        f.write("PID: " + pid + "\n")
        f.write("Landing page: https://meta.icos-cp.eu/objects/" + objHash + "\n")
        f.write("Licence: ICOS RI, licensed under CC BY 4.0 (https://www.icos-cp.eu/data-services/about-data-portal/data-license)\n")

def getIcos(spec,height,expectedColumns,citFile=None):
    """height: exact sampling height as string (e.g. "30"), or None to
    auto-pick the LOWEST available sampling height at the station (the
    latest object per height, then the smallest height)."""
    query1 = """
    prefix cpmeta: <http://meta.icos-cp.eu/ontologies/cpmeta/>
    prefix prov: <http://www.w3.org/ns/prov#>
    prefix xsd: <http://www.w3.org/2001/XMLSchema#>
    select ?dobj ?spec ?station ?fileName ?submTime ?timeStart ?timeEnd ?samplingHeight
    where {
    VALUES ?spec {<"""

    query2 = """>}
            ?dobj cpmeta:hasObjectSpec ?spec .
            ?dobj cpmeta:hasName ?fileName .
            ?dobj cpmeta:wasSubmittedBy/prov:endedAtTime ?submTime .
            ?dobj cpmeta:wasAcquiredBy [
                    prov:startedAtTime ?timeStart ;
                    prov:endedAtTime ?timeEnd ;
                    prov:wasAssociatedWith ?station ;
                    cpmeta:hasSamplingHeight ?samplingHeight
            ]
            FILTER NOT EXISTS {[] cpmeta:isNextVersionOf ?dobj}
    """
    queryHeight = """    FILTER( ?samplingHeight = " """

    query3 = """ "^^xsd:float)
    """
    queryTail = """    FILTER(?station = <http://meta.icos-cp.eu/resources/stations/AS_KIT>)
    }
    order by desc(?timeEnd)
    """
    if height is not None:
        # exact level: keep limit 1 (newest object at that height);
        # LIMIT is a solution modifier and must follow all filters
        queryTail += """    limit 1
    """
    # height == None -> no height FILTER at all; queryHeight/query3 carry the
    # two halves of the height literal and must be skipped in that case
    query = "".join([
        query1, spec, query2,
        queryHeight if height is not None else "",
        height if height is not None else "",
        query3 if height is not None else "",
        queryTail,
    ])
    print("query:",query)
    result = meta.sparql_select(query)
    bindings = result.bindings
    print("result: ",bindings)

    if not bindings:
        raise SystemExit("no data object found for",spec)

    if height is None:
        # lowest available level: newest object per sampling height,
        # then the smallest height (binding order is desc(timeEnd))
        latest = {}
        for b in bindings:
            h = float(b["samplingHeight"].value)
            if h not in latest:
                latest[h] = b["dobj"].uri
        height = min(latest)
        print("available sampling heights:",sorted(latest))
        print("lowest level:",height,"m")
        dobjUri = latest[height]
    else:
        dobjUri = bindings[0]["dobj"].uri
    print("dobj: ",dobjUri)

    dobjMeta = meta.get_dobj_meta(dobjUri)
    fileName = dobjMeta.fileName
    print("fileName: ",fileName)

    # citation (writes the ICOS-CITATION file for this object)
    updateIcosCitation(dobjUri,fileName,citFile)

    # get the data
    columns = data.get_columns_as_arrays(dobjMeta)
    print("columns: ",list(columns))

    missing = [c for c in expectedColumns if c not in columns]
    if missing:
        raise SystemExit("object %s is missing expected columns: %s" % (fileName,", ".join(missing)))

    # convert to dataframe
    return pd.DataFrame({c: columns[c] for c in expectedColumns})

    

for s in sources:
    checkShutdown("DWD fetch %s" % s["data"])
    r = requests.get(s["url"])
    z = zipfile.ZipFile(io.BytesIO(r.content))
    #z.extractall("/path/to/destination_directory")
    #files = z.filelist
    target = z.filelist[-1].filename
    #print("Target:",target)
    csvdata = z.read(target).decode("utf-8")
    df = extract(s,csvdata)
    # staleness guard: skip sources with no rows newer than 3 days
    # (a discontinued product would otherwise cap the whole merge)
    if df.date.max() < datetime.now() - timedelta(days = 3):
        print("DWD source",s["data"],"stale (last:",df.date.max(),"), excluded")
        continue
    #print(df)
    if dwd.empty:
        dwd = df
    else:
        dwd = dwd.merge(df,on="date")

# excluded/missing light channel becomes NULL in the database
if "light" not in dwd.columns:
    dwd["light"] = float("nan")

# same for rain (mm per hour, hourly sum)
if "rain" not in dwd.columns:
    dwd["rain"] = float("nan")

# wind: DWD 04177 Rheinstetten 10-minute wind, aggregated to hourly means to
# fit the reference sensor's hourly rows. The 10-minute product (FF_10 m/s,
# DD_10 deg) is preferred over the hourly F product for the finer source
# resolution; direction has no column in the sensors table yet, so only the
# speed is stored (m/s, same unit as icosWind).
def dwdWind10():
    url = ("https://opendata.dwd.de/climate_environment/CDC/observations_germany/"
           "climate/10_minutes/wind/recent/10minutenwerte_wind_04177_akt.zip")
    r = requests.get(url, timeout=60)
    r.raise_for_status()
    z = zipfile.ZipFile(io.BytesIO(r.content))
    target = [n for n in z.namelist() if n.startswith("produkt_")][0]
    df = pd.read_csv(io.StringIO(z.read(target).decode("utf-8")), sep=";")
    df.columns = [c.strip() for c in df.columns]  # DWD pads column names
    df["date"] = pd.to_datetime(df.MESS_DATUM.astype(str), format="%Y%m%d%H%M")
    df["wind"] = pd.to_numeric(df.FF_10, errors="coerce")
    df.loc[df.wind < -100, "wind"] = float("nan")  # DWD -999 sentinel
    df = df.loc[df.date >= "2020-10-01 00:00:00"]
    return df.set_index("date")["wind"].resample("h").mean().dropna()

wind10 = None
try:
    wind10 = dwdWind10()
    # same staleness guard as the hourly sources: a discontinued product must
    # not cap the whole merge
    if wind10.index.max() < pd.Timestamp.now() - timedelta(days=3):
        print("DWD 10-min wind stale (last:", wind10.index.max(), "), excluded")
        wind10 = None
except Exception as exc:
    print("DWD 10-min wind fetch failed:", exc, "- wind stays NULL")
    wind10 = None

if wind10 is not None and not dwd.empty:
    # left join: hours without a wind sample keep their other values
    dwd = dwd.merge(wind10.rename("wind").reset_index(), on="date", how="left")
if "wind" not in dwd.columns:
    dwd["wind"] = float("nan")




# check if we have data for the last 2 days
limit =  datetime.strftime(datetime.now() - timedelta(days = 2),"%Y-%m-%d %H:%M:%S")
print("Limit:",limit)
print("dwd:",dwd)
if len(dwd[dwd.date >= limit]) < 1:
    print("No dwd data")
    # try to get icos meteo data
    # note pid based has defined end data. not good
    # use resource search,
    # NB: we can get resource from meta xml
    # <hasObjectSpec xmlns="http://meta.icos-cp.eu/ontologies/cpmeta/"
    #   rdf:resource="http://meta.icos-cp.eu/resources/cpmeta/atcMeteoGrowingNrtDataObject"/>
    # on any landing page, like
    # https://data.icos-cp.eu/portal/#{%22route%22:%22metadata%22,%22id%22:%22CjCp8HYe_3x1tNuh_WOhUoqt%22}
    #
    meteoFull = getIcos("http://meta.icos-cp.eu/resources/cpmeta/atcMeteoGrowingNrtDataObject","2.5",["TIMESTAMP","AT","RH","AP"])

    
    ## ############# work on meteo data instead #####
    #meteoPid = "11676/Iixdez6SqcmALLNBFyrNa1aA"
    #meteoObj = Dobj(meteoPid.split("/")[1])

    # relevant data: AT (air temp), RH (rel humidity), AP (air press),
    meteo = meteoFull[["TIMESTAMP","AT","RH","AP"]].copy()
    meteo = meteo.rename(columns={"TIMESTAMP":"date","AT":"temp","RH":"hum","AP":"pres"})
    meteo = meteo.drop(index=meteo[meteo.date < "2020-10-01 00:00:00"].index)

    dwd = meteo.copy()
    dwd["light"] = 0  # no light from kit
    dwd["wind"] = float("nan")  # wind placeholder (real source pending)
    dwd["rain"] = float("nan")  # rain placeholder (no ICOS rain channel)

#print(dwd)

# ######################################################
# get icos data from sparql service:
# https://meta.icos-cp.eu/sparqlclient/?type=JSON

##kit meteo data is here:
##    relevant:
##https://data.icos-cp.eu/portal/#%7B%22filterCategories%22%3A%7B%22project%22%3A%5B%22icos%22%5D%2C%22level%22%3A%5B1%2C2%5D%2C%22stationclass%22%3A%5B%22ICOS%22%5D%2C%22type%22%3A%5B%22atcMeteoGrowingNrtDataObject%22%5D%2C%22station%22%3A%5B%22iAS_KIT%22%5D%7D%2C%22filterTemporal%22%3A%7B%22dt%22%3A%222021-11-08%22%7D%7D
##
##Atmospheric data [File name] ICOS_ATC_NRT_KIT_2021-02-01_2021-11-08_2.5_931_MTO.zip [Sampling height] 2.5 meters [Temporal coverage] 2021-02-01–2021-11-08
## pid: 11676/Iixdez6SqcmALLNBFyrNa1aA

##
##
##
##query = """prefix cpmeta: <http://meta.icos-cp.eu/ontologies/cpmeta/>
##prefix prov: <http://www.w3.org/ns/prov#>
##prefix xsd: <http://www.w3.org/2001/XMLSchema#>
##select ?dobj ?spec ?station ?fileName ?submTime ?timeStart ?timeEnd ?samplingHeight
##where {
##	VALUES ?spec {<http://meta.icos-cp.eu/resources/cpmeta/atcCo2NrtGrowingDataObject>}
##	?dobj cpmeta:hasObjectSpec ?spec .
##	?dobj cpmeta:hasName ?fileName .
##	?dobj cpmeta:wasSubmittedBy/prov:endedAtTime ?submTime .
##	?dobj cpmeta:wasAcquiredBy [
##		prov:startedAtTime ?timeStart ;
##		prov:endedAtTime ?timeEnd ;
##		prov:wasAssociatedWith ?station ;
##		cpmeta:hasSamplingHeight ?samplingHeight
##	]
##	FILTER NOT EXISTS {[] cpmeta:isNextVersionOf ?dobj}
##	FILTER( ?samplingHeight = "30"^^xsd:float)
##        FILTER(?station = <http://meta.icos-cp.eu/resources/stations/AS_KIT>)
##}
##order by desc(?timeEnd)
##limit 1
##"""
##
##s = RunSparql(sparql_query=query, output_format='json')
###The ouput format is by default (txt/json) but you can adjust
### with the following formats ['json', 'csv', 'dict', 'pandas', 'array', 'html'].
##
##r = json.loads(s.run())
##print("result: ",r)
##
##pid = r["results"]["bindings"][0]["dobj"]["value"].split("/")[-1]
##print("PID: ",pid)
##
### get the data 
##f = Dobj(pid)
##
##if f.valid:
##    data = f.get()
##else:        
##    raise SystemExit('no binary data available', 0)
##
### print citation
##print('citation: ', f.citation)

checkShutdown("ICOS CO2 fetch")
icos = getIcos("http://meta.icos-cp.eu/resources/cpmeta/atcCo2NrtGrowingDataObject","30",["TIMESTAMP","co2","Flag","NbPoints","Stdev"])
# convert to dataframe
icos = icos.drop(index=icos[icos.co2.isnull()].index)
icos = icos.rename(columns={"TIMESTAMP":"date"})
icos = icos.drop(index=icos.loc[icos.date < "2020-10-01 00:00:00"].index)
icos = icos.drop(["Flag","NbPoints","Stdev"],axis=1)
#icos.reset_index(inplace=True)
#icos.drop(["index"],axis=1,inplace=True)
ts = datetime.now().strftime("%Y%m%d-%H%M%S")
fn = os.path.join(scriptDir,"co2_" + ts + ".csv") if args.csv else "co2_" + ts + ".csv"
icos.to_csv(fn)
if args.csv:
    print("wrote",fn)

# ICOS ERIC meteo at the LOWEST available sampling height at AS_KIT:
# air temperature (AT), relative humidity (RH), wind speed (WS) as extra
# reference columns next to the DWD temp/hum (distinct column names)
icosMeteoCitationFile = os.path.join(scriptDir,"ICOS-CITATION-METEO.txt")
checkShutdown("ICOS meteo fetch")
meteoLow = getIcos("http://meta.icos-cp.eu/resources/cpmeta/atcMeteoGrowingNrtDataObject",None,
                   ["TIMESTAMP","AT","RH","WS"],citFile=icosMeteoCitationFile)
meteoLow = meteoLow.rename(columns={"TIMESTAMP":"date","AT":"icosTemp","RH":"icosHum","WS":"icosWind"})
meteoLow = meteoLow.drop(index=meteoLow.loc[meteoLow.date < "2020-10-01 00:00:00"].index)
meteoLow = meteoLow.reset_index(drop=True)

# fetch window for the SensorCity queries: latest-value-first - every fetch
# is bounded by what the database already holds (plus a 2 h overlap), with
# SC_WINDOW_DAYS as the fallback floor when the database is unreachable or
# has no rows yet. The FeatureServer caps every query at 2000 records
# (ArcGIS maxRecordCount), so long windows are paged with resultOffset.
SC_WINDOW_DAYS = 30
SC_OVERLAP_H = 2


def storedLatestUtc(sid):
    """Latest stored date for a sensor id (stored in CET), converted back
    to naive UTC - the timeline the SensorCity queries use."""
    if scEngine is None:
        return None
    try:
        with scEngine.connect() as conn:
            latest = conn.execute(
                text("select max(date) from sensors where id = %d" % sid)
            ).scalar()
    except Exception:
        return None
    if latest is None:
        return None
    return pd.Timestamp(latest) - pd.Timedelta(hours=1)  # stored CET -> UTC


def scWindowStart(sid):
    """Fetch-start timestamp for a sensor id: the later of (latest stored
    hour - overlap) and the 30-day floor; the floor wins when nothing (or
    nothing recent) is stored."""
    nowUtc = pd.Timestamp(datetime.now(timezone.utc).replace(tzinfo=None))
    floor = nowUtc - pd.Timedelta(days=SC_WINDOW_DAYS)
    latest = storedLatestUtc(sid)
    if latest is None:
        return floor, "no stored rows - full %d-day window" % SC_WINDOW_DAYS
    start = max(latest - pd.Timedelta(hours=SC_OVERLAP_H), floor)
    return start, "latest stored %s, %d h overlap" % (latest, SC_OVERLAP_H)


def scQueryPaged(layer, where, outFields, label):
    """All records matching `where`, paged through the 2000-record cap."""
    rows = []
    offset = 0
    for _page in range(10):  # safety cap: 10 pages = ~80 days of 10-min data
        r = requests.get(
            SC_BASE + "/%d/query" % layer,
            params={
                "where": where,
                "outFields": outFields,
                "returnGeometry": "false",
                "f": "json",
                "resultRecordCount": "2000",
                "resultOffset": str(offset),
                "orderByFields": "measured_at DESC",
            },
            timeout=30,
        )
        r.raise_for_status()
        feats = r.json().get("features", [])
        rows.extend(f["attributes"] for f in feats)
        if len(feats) < 2000:
            break
        offset += 2000
    print("SensorCity %s: %d records fetched" % (label, len(rows)))
    return rows


# the mast channels land in id-0 rows, so their fetch is bounded the same
# way: from id 0's latest stored hour (2 h overlap), 30-day floor
mastStart, mastWhy = scWindowStart(0)
mastSince = mastStart.strftime("%Y-%m-%d %H:%M:%S")
print("SensorCity mast window:", mastWhy)

checkShutdown("SensorCity wind fetch")
# SensorCity wind mast at station '008 - Weiherfeldstraße' (621 m E of the
# orchard): Karlsruhe SensorCity FeatureServer, layer 5
# NodeRED_Windsensor_Archiv, device 9899e75f-2353-4dda-a1cc-4d4ffde4f003.
# wind_average_kmh + 1s/3s gusts + direction every ~10 min, rolling ~52-day
# archive. Hourly mean converted km/h -> m/s goes into the 'mastWind' column
# (same unit as 'wind'/'icosWind'); gusts/direction have no columns yet.
sensorCityWind = None
try:
    r = requests.get(
        "https://geoportal.karlsruhe.de/ags04/rest/services/Hosted/"
        "Sensordaten_NodeRED/FeatureServer/5/query",
        params={
            "where": "device_id='9899e75f-2353-4dda-a1cc-4d4ffde4f003' "
                     "AND measured_at > timestamp '%s'" % mastSince,
            "outFields": "measured_at,wind_average_kmh",
            "returnGeometry": "false",
            "f": "json",
            "resultRecordCount": "2000",  # ~14 days at the 10-min cadence
            "orderByFields": "measured_at DESC",
        },
        timeout=30,
    )
    r.raise_for_status()
    feats = r.json().get("features", [])
    if feats:
        m = pd.DataFrame([f["attributes"] for f in feats])
        m = m.dropna(subset=["wind_average_kmh"])
        m["date"] = pd.to_datetime(m.pop("measured_at"), unit="ms")  # naive UTC
        mastHourly = (m.set_index("date")["wind_average_kmh"] / 3.6)
        mastHourly = mastHourly.resample("h").mean().dropna()
        sensorCityWind = mastHourly.rename("mastWind").reset_index()
        print("SensorCity mast wind:", len(m), "records ->", len(sensorCityWind), "hourly rows")
    else:
        print("SensorCity mast wind: no records returned")
except Exception as exc:
    print("SensorCity mast wind fetch failed:", exc, "- mastWind stays NULL")
    sensorCityWind = None

checkShutdown("SensorCity rain fetch")
# SensorCity rain gauge 'Barani MeteoRain' at Grünwettersbach (7.5 km SE of
# the orchard): Karlsruhe SensorCity FeatureServer, layer 3
# NodeRED_Regenschreiber_Archiv, device 4ac74c30-4378-4182-86cb-f1e552d8f8fb.
# clicks is a cumulative tipping-bucket counter (0.2 mm per tip) with
# occasional device resets; hourly sum goes into the 'mastRain' column (mm,
# same unit as DWD 'rain').
sensorCityRain = None
try:
    r = requests.get(
        "https://geoportal.karlsruhe.de/ags04/rest/services/Hosted/"
        "Sensordaten_NodeRED/FeatureServer/3/query",
        params={
            "where": "device_id='4ac74c30-4378-4182-86cb-f1e552d8f8fb' "
                     "AND measured_at > timestamp '%s'" % mastSince,
            "outFields": "measured_at,clicks",
            "returnGeometry": "false",
            "f": "json",
            "resultRecordCount": "2000",  # ~14 days at the 10-min cadence
            "orderByFields": "measured_at DESC",
        },
        timeout=30,
    )
    r.raise_for_status()
    feats = r.json().get("features", [])
    if feats:
        m = pd.DataFrame([f["attributes"] for f in feats])
        m = m.dropna(subset=["clicks"])
        m = m.drop_duplicates(subset=["measured_at"])
        m = m.sort_values("measured_at")  # query returns DESC, flip to ascending
        m["date"] = pd.to_datetime(m.pop("measured_at"), unit="ms")  # naive UTC
        tips = m.clicks.diff()
        # device reset: the counter jumps down - treat the new count as the
        # tips accumulated since the last sample
        tips.loc[tips < 0] = m.loc[tips < 0, "clicks"]
        tips = tips.clip(lower=0)
        m["mm"] = tips * 0.2  # 0.2 mm per bucket tip
        # min_count: hours with no samples stay NaN (gauge outage != dry hour)
        rainHourly = m.set_index("date")["mm"].resample("h").sum(min_count=1).dropna()
        sensorCityRain = rainHourly.rename("mastRain").reset_index()
        print("SensorCity mast rain:", len(m), "records ->", len(sensorCityRain), "hourly rows")
    else:
        print("SensorCity mast rain: no records returned")
except Exception as exc:
    print("SensorCity mast rain fetch failed:", exc, "- mastRain stays NULL")
    sensorCityRain = None

checkShutdown("SensorCity neighbour stations fetch")
# SensorCity neighbour stations around the orchard, stored as their OWN
# sensor rows - NOT merged into the reference composition:
#   id 8  SC-N-002  002 - Hohenzollernstraße  soil profile (layer 4, device
#         6a2cd0fd-e3a6-49d8-bb7f-b94d70951d6f); deepest installed probe is
#         depth_51 - depths 61/71 only report the -5 / -327.68 sentinels
#   id 9  SC-N-116  116 - Breite Straße      air (layer 2, cb5264f2-...)
#   id 10 SC-SW-006 006 - Lützenhardtstraße  air (layer 2, 5709d661-...)
# Air units: temp °C, luftfeuchte %RH, press PA (-> /100 = hPa to match the
# DWD 'pres' unit), sonnenstrahlung W/m² -> new 'solar' column (the DWD
# 'light' column is percent sunshine, a different quantity).
SC_BASE = ("https://geoportal.karlsruhe.de/ags04/rest/services/Hosted/"
           "Sensordaten_NodeRED/FeatureServer")

def scAirFrame(sid, dev, label):
    """Hourly air means (temp/hum/pres/solar) for one SensorCity station."""
    try:
        start, why = scWindowStart(sid)
        # these frames also feed the station-qualified reference columns
        # (temp_006/hum_006/temp_116/hum_116 on the id-0 rows), so the
        # window must reach back over the REFERENCE append range too:
        # widen it to the earlier of the station's own window and id 0's
        # (the anchor the mast fetches use). Anchored to the station alone,
        # the ~day that DWD lags real time would leave every newly
        # appended reference hour outside the frame - the qualified
        # columns would stay NULL forever.
        refStart, _ = scWindowStart(0)
        if refStart < start:
            start = refStart
            why += " + reference window"
        feats = scQueryPaged(
            2,
            "device_id='%s' AND measured_at > timestamp '%s'"
            % (dev, start.strftime("%Y-%m-%d %H:%M:%S")),
            "measured_at,temp,luftfeuchte,press,sonnenstrahlung",
            "air %s (%s)" % (label, why),
        )
        if not feats:
            print("SensorCity air %s: no records returned" % label)
            return None
        a = pd.DataFrame(feats)  # scQueryPaged already unwrapped .attributes
        a = a.dropna(subset=["temp"])  # rows without the core reading are parser noise
        a = a.drop_duplicates(subset=["measured_at"]).sort_values("measured_at")
        a["date"] = pd.to_datetime(a.pop("measured_at"), unit="ms")  # naive UTC
        h = a.set_index("date")[["temp", "luftfeuchte", "press", "sonnenstrahlung"]]
        h = h.resample("h").mean().dropna(how="all")
        h = h.rename(columns={"luftfeuchte": "hum", "sonnenstrahlung": "solar",
                              "press": "pres"})
        h["pres"] = h["pres"] / 100.0  # Pa -> hPa (DWD 'pres' unit)
        h["id"] = sid
        print("SensorCity air %s: %d records -> %d hourly rows (id %d)"
              % (label, len(a), len(h), sid))
        return h.reset_index()
    except Exception as exc:
        print("SensorCity air %s fetch failed:" % label, exc,
              "- id %d stays empty" % sid)
        return None


def scSoilFrame(sid, dev, label, depth="51"):
    """Hourly soil means (soilMoist/soilTemp) at the deepest installed depth."""
    try:
        start, why = scWindowStart(sid)
        feats = scQueryPaged(
            4,
            "device_id='%s' AND measured_at > timestamp '%s'"
            % (dev, start.strftime("%Y-%m-%d %H:%M:%S")),
            "measured_at,soil_moisture_at_depth_%s,"
            "soil_temperature_at_depth_%s" % (depth, depth),
            "soil %s (%s)" % (label, why),
        )
        if not feats:
            print("SensorCity soil %s: no records returned" % label)
            return None
        s = pd.DataFrame(feats)  # scQueryPaged already unwrapped .attributes
        s["date"] = pd.to_datetime(s.pop("measured_at"), unit="ms")  # naive UTC
        s = s.drop_duplicates(subset=["date"]).sort_values("date")
        moist = s.pop("soil_moisture_at_depth_%s" % depth)
        temp = s.pop("soil_temperature_at_depth_%s" % depth)
        # uninstalled-depth sentinels -> no-data
        moist[(moist == -5) | (moist == -327.68)] = float("nan")
        temp[(temp == -5) | (temp == -327.68)] = float("nan")
        s["soilMoist"] = moist.values
        s["soilTemp"] = temp.values
        h = s.set_index("date")[["soilMoist", "soilTemp"]] \
             .resample("h").mean().dropna(how="all")
        h["id"] = sid
        print("SensorCity soil %s: %d records -> %d hourly rows (id %d, depth_%s)"
              % (label, len(s), len(h), sid, depth))
        return h.reset_index()
    except Exception as exc:
        print("SensorCity soil %s fetch failed:" % label, exc,
              "- id %d stays empty" % sid)
        return None


scFrames = [
    scSoilFrame(8, "6a2cd0fd-e3a6-49d8-bb7f-b94d70951d6f",
                "002 Hohenzollernstraße"),
    scAirFrame(9, "cb5264f2-fd06-472c-b1de-3aacd878f4b3", "116 Breite Straße"),
    scAirFrame(10, "5709d661-984b-4d68-bea3-ffd0e8e114c7",
               "006 Lützenhardtstraße"),
]
scFrames = [f for f in scFrames if f is not None and len(f)]
scNeighbours = None
if scFrames:
    scNeighbours = pd.concat(scFrames, ignore_index=True)
    # same time convention as the reference rows: the +1 h CET shift happens
    # once here at merge end (epoch-ms were converted to naive UTC above;
    # current-era rows only - the pre-2020-10-25 CEST rule never applies)
    scNeighbours["date"] += pd.Timedelta(hours=1)

# ######################################
# wiese node feed (srv2.php): the orchard's own RGB node, stored under its
# own sensor row (id 2) - NOT merged into the reference composition. The
# endpoint answers a JSON LIST of dicts with STRING values; 'date' is
# already in the stored CET convention, so NO timezone shift is applied
# here. 'rfu' packs the three 8-bit RGB channels into one integer - packed
# values must never be averaged, so rfu is unpacked per row and only r/g/b
# are resampled.
SRV2_URL = "https://critical-sensors.de/srv2.php"
SRV2_DAYS = int(os.environ.get("REFSENSORS_SRV2_DAYS", "35"))
RFU_BYTE_ORDER = "RRGGBB"

checkShutdown("srv2 fetch")

def srv2NodeFrame():
    """Hourly means for the srv2 node (id 2): temp/hum/co2/light/bat/rssi
    plus r/g/b unpacked from the packed 'rfu' integer."""
    try:
        r = requests.get(SRV2_URL, params={"days": SRV2_DAYS}, timeout=120)
        r.raise_for_status()
        rows = [row for row in r.json() if str(row.get("id")) == "2"]
        if not rows:
            print("srv2 node: no records returned for id 2")
            return None
        recs = []
        for row in rows:
            v = int(round(float(row.get("rfu") or 0))) & 0xFFFFFF
            hi, mid, lo = v >> 16, (v >> 8) & 0xFF, v & 0xFF
            r8, g8, b8 = (hi, mid, lo) if RFU_BYTE_ORDER == "RRGGBB" \
                else (lo, mid, hi)
            recs.append({
                "date": datetime.strptime(row["date"], "%Y-%m-%d %H:%M:%S"),
                "light": float(row.get("light") or 0),
                "r": float(r8),
                "g": float(g8),
                "b": float(b8),
                "temp": float(row["temp"]) if "temp" in row else float("nan"),
                "hum": float(row["hum"]) if "hum" in row else float("nan"),
                "co2": float(row["co2"]) if "co2" in row else float("nan"),
                "bat": float(row["bat"]) if "bat" in row else float("nan"),
                "rssi": float(row["rssi"]) if "rssi" in row else float("nan"),
            })
        n = pd.DataFrame(recs).sort_values("date")
        # the node's white LEDs cannot be switched off: light == 0 rows are
        # self-illumination, their RGB readings are meaningless -> no-data
        n.loc[n.light <= 0, ["r", "g", "b"]] = float("nan")
        h = n.set_index("date")[["temp", "hum", "co2", "light", "bat", "rssi",
                                 "r", "g", "b"]] \
             .resample("h").mean().dropna(how="all")
        # r/g/b average lit samples only; an all-dark hour stays NaN
        h["rssi"] = h["rssi"].round().astype("Int64")
        h["id"] = 2
        print("srv2 node: %d records -> %d hourly rows (id 2)"
              % (len(n), len(h)))
        return h.reset_index()[["date", "id", "temp", "hum", "co2", "light",
                                "bat", "rssi", "r", "g", "b"]]
    except Exception as exc:
        print("srv2 node fetch failed:", exc, "- id 2 stays empty")
        return None


srv2Node = srv2NodeFrame()

#print(icos)


# ######################################


# merge dwd and icos
# inner join => only rows with entries in both
ref = dwd.merge(icos,on="date")
# or out join => max number of rows with NaNs
# ref = dwd.merge(icos,on="date",how="outer").fillna(0)

# left join for the meteo columns: keep all CO2 rows even where the meteo
# NRT product lags behind
ref = ref.merge(meteoLow,on="date",how="left")

# mast wind joins the same way; a fetch failure leaves it as NULL column
if sensorCityWind is not None:
    ref = ref.merge(sensorCityWind,on="date",how="left")
if "mastWind" not in ref.columns:
    ref["mastWind"] = float("nan")

# mast rain joins the same way; a fetch failure leaves it as NULL column
if sensorCityRain is not None:
    ref = ref.merge(sensorCityRain,on="date",how="left")
if "mastRain" not in ref.columns:
    ref["mastRain"] = float("nan")

# the air stations' temp/hum also join the reference rows (id 0) as
# station-qualified columns - id 9 = 116 Breite Straße, id 10 = 006
# Lützenhardtstraße, same units as the reference channels (°C / %RH).
# Merged here BEFORE the CET shift below, while both sides are still
# naive UTC (the neighbour rows shift their dates at fetch-merge end).
# The unqualified temp/hum of the reference rows keep their DWD/ICOS
# sources; a failed station fetch leaves its columns NULL.
for scSid, scNum in ((9,"116"),(10,"006")):
    scF = next((f for f in scFrames if len(f) and int(f.id.iloc[0]) == scSid), None)
    if scF is not None:
        ref = ref.merge(scF[["date","temp","hum"]].rename(
            columns={"temp":"temp_" + scNum, "hum":"hum_" + scNum}),
            on="date", how="left")
    for qcol in ("temp_" + scNum, "hum_" + scNum):
        if qcol not in ref.columns:
            ref[qcol] = float("nan")

# adjust timezone and DST
ref["date"] += pd.Timedelta(hours=1)
ref.loc[ref.date < "2020-10-25 02:00:00","date"] += pd.Timedelta(hours=1)

# add missing columns
ref["rssi"] = -256
ref["count"] = 0
ref["raw"] = ""
ref["rep"] = 0
ref["pkt"] = 0
ref["id"] = 0 # reference is sensor 0
ref["bat"] = 100
ref["req"] = 1

# offline mode: write CSVs and skip all database steps
if args.csv:
    refFile = os.path.join(scriptDir,"ref_" + ts + ".csv")
    ref.to_csv(refFile)
    print("wrote",refFile)
    if scNeighbours is not None and len(scNeighbours):
        scFile = os.path.join(scriptDir,"sc_" + ts + ".csv")
        scNeighbours.to_csv(scFile, index=False)
        print("wrote",scFile)
    if srv2Node is not None and len(srv2Node):
        srv2File = os.path.join(scriptDir,"srv2_" + ts + ".csv")
        srv2Node.to_csv(srv2File, index=False)
        print("wrote",srv2File)
    sys.exit(0)


# ######################################
# update sql
"""Store data object into sql """
# dbUrl was resolved (and the schema upgraded) before the fetches above
if not dbUrl:
    print("No database configured: set REFSENSORS_DB_URL or create datatools/dburl.txt")
    sys.exit(1)

try:
    engine = create_engine(dbUrl)
    tables = inspect(engine).get_table_names()
except:
    print("Sql failed")
    sys.exit(1)

# connect and write
db = engine.connect()

print("Checking latest value for sensor 0")
srcQry = "select date from sensors where id = 0" \
    +  " order by date desc limit 1;"
#print("Q: ",srcQry)
df = pd.read_sql(srcQry,db)
print("Check result:", df)
# just update repetition counter
if len(df) > 0:
    limit = str(df.date.values[0])
    print("removing old entries before: ",limit)
    ref = ref.drop(index=ref[ref.date <= limit].index)
    print("Remaining: ",ref)
    if ref.empty:
        # no new reference hours - still continue: the SensorCity neighbour
        # sensors (ids 8/9/10) fetch and write independently of DWD/ICOS
        print("No new reference data")

   

# rebuild a clean 0..n-1 index WITHOUT materializing it as a column — a bare
# reset_index() would write a literal 'index' column that collides with the
# AUTO_INCREMENT primary key on every re-run (values shift as the dedup
# filter moves the frame window)
ref = ref.reset_index(drop=True)
print("Adding data: ",len(ref))

# ######################################
# virtual sensors: after each run, compose rows for every active 'virtual'
# sensor from its sensor_sources entries (e.g. id 7 Wiese-Verbund = mean
# of Wiese1 + Wiese2). Only hours newer than the composite's latest stored
# hour are inserted - the same latest-date discipline as the reference.
# AVG() ignores NULL, so an hour where one source is missing still gets
# the remaining source's value (min_count=1 semantics); a channel whose
# sources have no data yet (e.g. the planned Wiesenstation) stays NULL.
def composeVirtualSensors(engine):
    with engine.begin() as conn:
        virtuals = [r[0] for r in conn.execute(text(
            "select sensor_id from sensor_locations where kind = 'virtual' and active = 1"))]
        if not virtuals:
            return
        cols = {c["name"] for c in inspect(engine).get_columns("sensors")}
        for vid in virtuals:
            src = pd.read_sql(text(
                "select variable, source_key, agg from sensor_sources "
                "where sensor_id = :v and source_kind = 'sensor'"),
                conn, params={"v": vid})
            if src.empty:
                continue
            missing = sorted(set(src["variable"]) - cols)
            if missing:
                print("virtual %d: no sensors column for %s - skipped"
                      % (vid, ", ".join(missing)))
            varSrc = src[src["variable"].isin(cols)]
            if varSrc.empty:
                continue
            # NB: varSrc["agg"], not .agg - that is DataFrame's method
            aggs = {a if a else "mean" for a in varSrc["agg"]}
            if aggs - {"mean"}:
                print("virtual %d: unsupported agg %s - skipped"
                      % (vid, ", ".join(sorted(aggs - {"mean"}))))
                continue
            ids = sorted({int(k) for k in varSrc.source_key})
            selCols = sorted(set(varSrc.variable))
            limit = conn.execute(
                text("select max(date) from sensors where id = :v"), {"v": vid}).scalar()
            guard = " OR ".join("s.%s IS NOT NULL" % c for c in selCols)
            sql = ("insert into sensors (id, date, %s, rssi, bat, count, rep, pkt, req, raw) "
                   "select :v, s.date, %s, -256, 100, 0, 0, 0, 1, '' "
                   "from sensors s where s.id in (%s) and s.date > :lim and (%s) "
                   "group by s.date"
                   % (",".join(selCols),
                      ",".join("avg(s.%s)" % c for c in selCols),
                      ",".join(str(i) for i in ids), guard))
            res = conn.execute(text(sql), {"v": vid, "lim": limit or "1970-01-01"})
            print("virtual %d composed: %d rows (sources %s)"
                  % (vid, res.rowcount, ",".join(str(i) for i in ids)))

# the database write is the one step we never want interrupted halfway:
# if termination was requested while fetching/merging, bail out here
# (schema upgrades already ran before the fetches - see the lock section)
checkShutdown("database write")

# create new table from the dataframe (empty when the reference dedup
# filtered everything - skip instead of appending an empty frame)
if len(ref):
    ref.to_sql(
        "sensors",
        engine,
        if_exists='append',
        index=False, #True,
        chunksize=500,
        dtype={
            "id":SmallInteger,
            "req":SmallInteger,
            "count":Integer,
            "light":Float,
            "temp":Float,
            "co2":Float,
            "rfu":Float,
            "bat":Float,
            "date":String(50),
            "rssi":SmallInteger,
            "pkt":Integer,
            "raw":String(50),
            "pres":Float,
            "rep":SmallInteger,
            "icosTemp":Float,
            "icosHum":Float,
            "icosWind":Float,
            "wind":Float,
            "mastWind":Float,
            "rain":Float,
            "mastRain":Float,
            "solar":Float,
            "soilMoist":Float,
            "soilTemp":Float,
            "temp_006":Float,
            "hum_006":Float,
            "temp_116":Float,
            "hum_116":Float,
            "r":Float,
            "g":Float,
            "b":Float
        }
    )
# the SensorCity neighbour rows land under their own ids (8/9/10) - same
# latest-date dedup per sensor id as the reference rows above; each station
# failed-fetch leaves its id empty (logged at fetch time)
if scNeighbours is not None and len(scNeighbours):
    checkShutdown("SensorCity neighbour write")
    scCols = [c for c in ("date", "id", "temp", "hum", "pres", "solar",
                          "soilMoist", "soilTemp") if c in scNeighbours.columns]
    scNeighbours = scNeighbours[scCols]
    scDtype = {"id": SmallInteger, "temp": Float, "hum": Float, "pres": Float,
               "solar": Float, "soilMoist": Float, "soilTemp": Float}
    for sid in sorted(scNeighbours.id.unique()):
        rows = scNeighbours[scNeighbours.id == sid].copy()
        # gap-tolerant dedup: drop every hour ALREADY STORED for this id
        # within the fetch window - not just the newest boundary. A pure
        # "> latest" guard never backfills outage gaps in the middle of the
        # window; the date-set comparison is cheap (the window is bounded).
        # Rows older than the window are never fetched, so the query stays
        # bounded; "removing old entries" filters the FETCHED FRAME only -
        # nothing is ever deleted from the database.
        winStart = (rows.date.min() - pd.Timedelta(hours=1)) \
            .strftime("%Y-%m-%d %H:%M:%S")
        stored = pd.read_sql(
            "select date from sensors where id = %d and date >= '%s'"
            % (sid, winStart), db)
        before = len(rows)
        if len(stored):
            have = set(pd.to_datetime(stored.date))
            rows = rows[~rows.date.isin(have)]
        print("SensorCity neighbour id %d: %d fetched, %d already stored, "
              "%d to add" % (sid, before, before - len(rows), len(rows)))
        if rows.empty:
            print("SensorCity neighbour id %d: no new data" % sid)
            continue
        rows = rows.reset_index(drop=True)
        print("SensorCity neighbour id %d: adding %d rows" % (sid, len(rows)))
        rows.to_sql(
            "sensors",
            engine,
            if_exists="append",
            index=False,
            chunksize=500,
            dtype=scDtype,
        )

# the srv2 node rows land under their own id (2) - same gap-tolerant dedup
# as the SensorCity neighbours above: drop every hour ALREADY STORED for
# id 2 within the fetch window (not just the newest boundary) so outage
# gaps mid-window still backfill; nothing is ever deleted from the database
if srv2Node is not None and len(srv2Node):
    checkShutdown("srv2 node write")
    srv2Cols = ["date", "id", "temp", "hum", "co2", "light", "bat",
                "rssi", "r", "g", "b"]
    srv2Node = srv2Node[srv2Cols]
    rows = srv2Node[srv2Node.id == 2].copy()
    winStart = (rows.date.min() - pd.Timedelta(hours=1)) \
        .strftime("%Y-%m-%d %H:%M:%S")
    stored = pd.read_sql(
        "select date from sensors where id = 2 and date >= '%s'"
        % winStart, db)
    before = len(rows)
    if len(stored):
        have = set(pd.to_datetime(stored.date))
        rows = rows[~rows.date.isin(have)]
    print("srv2 node id 2: %d fetched, %d already stored, %d to add"
          % (before, before - len(rows), len(rows)))
    if rows.empty:
        print("srv2 node id 2: no new data")
    else:
        rows = rows.reset_index(drop=True)
        print("srv2 node id 2: adding %d rows" % len(rows))
        rows.to_sql(
            "sensors",
            engine,
            if_exists="append",
            index=False,
            chunksize=500,
            dtype={
                "id": SmallInteger,
                "temp": Float,
                "hum": Float,
                "co2": Float,
                "light": Float,
                "bat": Float,
                "rssi": SmallInteger,
                "r": Float,
                "g": Float,
                "b": Float,
            },
        )

# compose the virtual sensors (id 7 Wiese-Verbund) from the new data the
# real sensors wrote since the last run - independent of whether the
# external reference fetch above found anything new
checkShutdown("virtual composition")
composeVirtualSensors(engine)

# close
db.close()


