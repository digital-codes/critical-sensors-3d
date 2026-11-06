#!/usr/bin/env python3
"""DWD and ICOS data """
import sys
import os
import csv
import time
import argparse

from datetime import datetime, timedelta
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
from sqlalchemy import create_engine, inspect
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
{"data":"wind","name":"   F","url":"https://opendata.dwd.de/climate_environment/CDC/observations_germany/climate/hourly/wind/recent/stundenwerte_FF_04177_akt.zip"}
]

dwd = pd.DataFrame()

def extract(s,data):
    df = pd.read_csv(io.StringIO(data),sep=";")
    df["date"] = df.MESS_DATUM.apply(d)
    #df.drop(columns=["MESS_DATUM","STATIONS_ID","QN_9","eor"],inplace=True)
    df.drop(df.loc[df.date < "2020-10-01 00:00:00"].index,inplace=True)
    # DWD pads some column names with spaces ("   F") - tolerate both
    col = s["name"] if s["name"] in df.columns else s["name"].strip()
    df.rename(columns={col:s["data"]},inplace=True)
    df.reset_index(inplace=True)
    if s["data"] == "light":
        df.light = df.light / 60 * 100
    #print(s["data"],df)
    return df[["date",s["data"]]]

# icos: fetch object metadata (citation) and write ICOS-CITATION.txt
scriptDir = os.path.dirname(os.path.abspath(__file__))
icosCitationFile = os.path.join(scriptDir, "ICOS-CITATION.txt")

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
# excluded/missing wind channel (DWD FF) becomes NULL as well;
# icosWind stays the ICOS ERIC reference (AS_KIT lowest level, currently
# empty at the source - KIT does not populate WS in the NRT meteo product)
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
    meteo.rename(columns={"TIMESTAMP":"date","AT":"temp","RH":"hum","AP":"pres"},inplace=True)
    meteo.drop(index=meteo[meteo.date < "2020-10-01 00:00:00"].index,inplace=True)

    dwd = meteo.copy()
    dwd["light"] = 0  # no light from kit
    dwd["wind"] = float("nan")  # no wind from kit (NRT meteo WS empty)

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

icos = getIcos("http://meta.icos-cp.eu/resources/cpmeta/atcCo2NrtGrowingDataObject","30",["TIMESTAMP","co2","Flag","NbPoints","Stdev"])
# convert to dataframe
icos.drop(index=icos[icos.co2.isnull()].index,inplace=True)
icos.rename(columns={"TIMESTAMP":"date"},inplace=True)
icos.drop(index=icos.loc[icos.date < "2020-10-01 00:00:00"].index,inplace=True)
icos.drop(["Flag","NbPoints","Stdev"],axis=1,inplace=True)
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
meteoLow = getIcos("http://meta.icos-cp.eu/resources/cpmeta/atcMeteoGrowingNrtDataObject",None,
                   ["TIMESTAMP","AT","RH","WS"],citFile=icosMeteoCitationFile)
meteoLow.rename(columns={"TIMESTAMP":"date","AT":"icosTemp","RH":"icosHum","WS":"icosWind"},inplace=True)
meteoLow.drop(index=meteoLow.loc[meteoLow.date < "2020-10-01 00:00:00"].index,inplace=True)
meteoLow.reset_index(drop=True,inplace=True)

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
    sys.exit(0)


# ######################################
# update sql
"""Store data object into sql """
dbUrl = os.environ.get("REFSENSORS_DB_URL")
if not dbUrl:
    dburlFile = os.path.join(scriptDir,"dburl.txt")
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
    ref.drop(index=ref[ref.date <= limit].index,inplace=True)
    print("Remaining: ",ref)
    if ref.empty:
        print("No new data")
        sys.exit()

   

ref.reset_index(inplace=True)
print("Adding data: ",len(ref))

# the new ICOS meteo columns may not exist in an older table - add them
# idempotently before appending
existingCols = {c["name"] for c in inspect(engine).get_columns("sensors")}
with engine.begin() as conn:
    for col in ("icosTemp","icosHum","icosWind","wind"):
        if col not in existingCols:
            print("ALTER TABLE sensors ADD COLUMN",col)
            conn.exec_driver_sql("ALTER TABLE sensors ADD COLUMN %s FLOAT" % col)

# create new table from the dataframe
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
        "wind":Float
        }
)
# close
db.close()


