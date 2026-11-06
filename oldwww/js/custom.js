
"use strict";

// slide shows
var wiesenIndex = 0;
var sensorIndex = 0;

const reloadIntervall = 30 * 60 * 1000
//const reloadIntervall = 10*1000
var latestDate = ""

var english = false

// chart array for langiage switch
var chartList = Array()

var displayIdx = 0
var sensData = null

const sensorLabels = {
  "de": ["Referenz", "Wiese1", "Wiese2", "Büro", "ZKM1", "ZKM2"],
  "en": ["Reference", "Orchard1", "Orchard2", "Office", "ZKM1", "ZKM2"]
}

// ---------------

/* ------- repeat ------ 
    load object e.g. via json like so
{
"wiesen":[
    {"image":"20200818"},
    {"image":"20200919"}
]
}

    object name (wiesen) corresponds to repeat name
    and object array item (image) corresponds to template name
    display is inserted into parent select


*/

function wiesenBilder(img) {
  console.log(img)
  w3.displayObject("wcaption", img);
  w3.displayObject("wfigure", img);
  wiesenShow(8000)
}

// -------------------

// cookie handling
// a couple of global variables
const langCookie = "EN" // EN for english

function getLang() {
  if (typeof (Storage) !== "undefined") {
    var ck = localStorage.getItem(langCookie);
    console.log("Cookie:", ck)
    if (!ck || (ck == "")) {
      english = false;
    } else {
      english = true;
    }
  }
  console.log("EN:", english)
}

function setLang() {
  if (typeof (Storage) !== "undefined") {
    if (english) {
      console.log("English cookie")
      localStorage.setItem(langCookie, "EN");
    }
    else {
      console.log("Remove cookie")
      localStorage.removeItem(langCookie);
    }
  }
}



// --------------------
// init function
function init() {
  console.log("Init")
  //testScript("#chart")

  getLang()
  if (english)
    toEnglish()
  else
    toGerman()

  //carousel("wiese",wiesenIndex);
  carousel("sensor", sensorIndex);

  /* doesn't CALL the php in basic mode.... */
  /* seems to be a problem only when not using webserver: php and http-server
  ** don't execute the php as a script 
  else use xmlhttp ...
  */
  w3.getHttpObject("data/wiesen.json", wiesenBilder);

  setTimeout(loadData,100)

  setTimeout(reloadPage, reloadIntervall);

}

function loadData() {
  console.log("load data")
  //testScript("#chart")

  w3.getHttpObject("srv.php?days=" + days, processData);

}


function reloadPage() {
  location.reload()
  setTimeout(reloadPage, reloadIntervall);
}


function processData(rawData) {
  //console.log("Start processing:",rawData)
  console.log("Start processing")
  latestDate = rawData[rawData.length - 1].date
  console.log("Latest: ", latestDate)
  w3.displayObject("latest", { "date": "Update: " + latestDate });
  w3.addClass("#updating", "w3-hide")
  w3.removeClass("#latest", "w3-hide")
  //var charts = ["c1","c2","c3","c4","c5","c6","c7","c8","c9"]
  var charts = ["c1", "c2", "c3", "c4", "c5", "c7", "c8"]
  var lbls = ["CO2 [ppm]", "Temp [°C]", "Hum [%]", "Pres [mb]", "Light [%]", "RSSI [dB]", "Bat [%]"] // key must be lower case
  charts.forEach((function (k, i) { // not working with . atrribute
    console.log("Chart for ", k)
    chartList[i] = { "lbl": lbls[i], "id": charts[i] }
    //displayData(rawData,"#"+k,lbls[i],i)
  }))
  // start display
  sensData = rawData
  displayIdx = 0
  displayData()
  //displayData(rawData,0)

  //setTimeout(resizeCharts,300) //1000);

}

// map axis labels
function mapLabels(l) {
  console.log("Map label: ", l)
  var lblIn = l.split(" ")[0]
  var lblRem = l.split(" ")[1]
  var lblOut = lblIn
  if (english) {
    switch (lblIn) {
      case "Hum":
        lblOut = "Humidity"
        break;
      case "Temp":
        lblOut = "Temperature"
        break;
      case "Pres":
        lblOut = "Pressure"
        break;
      case "Bat":
        lblOut = "Battery"
        break;

    }
  } else {
    switch (lblIn) {
      case "Hum":
        lblOut = "Luftfeuchtigkeit"
        break;
      case "Temp":
        lblOut = "Temperatur"
        break;
      case "Pres":
        lblOut = "Luftdruck"
        break;
      case "Bat":
        lblOut = "Batterie"
        break;
      case "Light":
        lblOut = "Helligkeit"
        break;
      case "RSSI":
        lblOut = "Funksignal"
        break;

    }
  }

  return lblOut + " " + lblRem;
}

// update chart labels to new language
function updateLabels(id) {
  console.log("Update labels for", id)
  console.log("Charts:", chartList.length)
  for (var c in chartList) {
    console.log("C:", c, "-", chartList[c].id)
    if (id.replace("#", "") == chartList[c].id) {
      var lbl = chartList[c].lbl
      chartList[c].chart.axis.labels({ y: mapLabels(lbl) })
      // test:
      // works: chartList[c].chart.data.names({Sensor0: 'XYZ'})
      // works too:
      /*
      if (english)
        chartList[c].chart.data.names({Sensor0: 'XYZ'})
      else
        chartList[c].chart.data.names({Sensor0: 'ABC'})
      */
      if (english) {
        chartList[c].chart.data.names({ Sensor0: sensorLabels.en[0] })
        chartList[c].chart.data.names({ Sensor1: sensorLabels.en[1] })
        chartList[c].chart.data.names({ Sensor2: sensorLabels.en[2] })
        chartList[c].chart.data.names({ Sensor3: sensorLabels.en[3] })
        chartList[c].chart.data.names({ Sensor4: sensorLabels.en[4] })
        chartList[c].chart.data.names({ Sensor5: sensorLabels.en[5] })

      } else {
        chartList[c].chart.data.names({ Sensor0: sensorLabels.de[0] })
        chartList[c].chart.data.names({ Sensor1: sensorLabels.de[1] })
        chartList[c].chart.data.names({ Sensor2: sensorLabels.de[2] })
        chartList[c].chart.data.names({ Sensor3: sensorLabels.de[3] })
        chartList[c].chart.data.names({ Sensor4: sensorLabels.de[4] })
        chartList[c].chart.data.names({ Sensor5: sensorLabels.de[5] })
      }
      chartList[c].chart.resize()
      //setTimeout(chartList[c].chart.resize,200)
      break;
    }
  }
}

// update all chart labels to new language
function updateAllLabels() {
  for (var c in chartList) {
    updateLabels(chartList[c].id)
  }
}


// test script, bind to selector sel
//function displayData(rawData,sel,lbl,idx) {
function displayData() {
  console.log("Display: ", displayIdx)
  if (displayIdx >= chartList.length) {
    //updateAllLabels()
    return
  }

  var lbl = chartList[displayIdx].lbl
  var sel = "#" + chartList[displayIdx].id

  var dataKey = lbl.split(" ")[0].toLowerCase() // split when using units

  console.log("Testing on ", sel, " for ", dataKey)

  // multiple X values work wit h column data only
  // convert :::

  // sort by id
  var data = d3.nest()
    .key(function (d) { return d["id"]; })
    .object(sensData)
  // get keys
  var devKeys = Object.keys(data)
  console.log("Devices: ", devKeys)

  // create columns !
  var colData = Array()
  var colXs = {}
  var colTypes = {}
  devKeys.forEach(function (item) {
    var xLbl = "x" + item
    var dLbl = "Sensor" + item
    var x = data[item].map(x => x.date)
    x.unshift(xLbl)
    colData.push(x) // push x columns
    var d = data[item].map(x => x[dataKey])
    d.unshift(dLbl)
    colData.push(d) // push d columns
    colXs[dLbl] = xLbl  // set descriptor
    colTypes[dLbl] = "step"  // set type
    //console.log(item," -> ",x)
    //console.log(d)
  })
  console.log("Desc: ", colXs)
  console.log("Types: ", colTypes)
  //console.log("Cols: ",colData)

  // maybe check https://stackoverflow.com/questions/55023252/c3js-multiple-xy-line-chart-with-json-data

  var colorList = ['#636363','#a1d99b', '#31a354','#de2d26','#9ecae1','#3182bd','#fc9272','#9ecae1'];

  var chart = c3.generate({
    bindto: sel,
    data: {
      xFormat: '%Y-%m-%d %H:%M:%S',
      xs: colXs,
      columns: colData,
      types: colTypes,
      colors: {
        Sensor0: colorList[0],
        Sensor1: colorList[1],
        Sensor2: colorList[2],
        Sensor3: colorList[3],
        Sensor4: colorList[4],
        Sensor5: colorList[5],
      }
    },
    axis: {
      x: {
        type: 'timeseries',
        tick: {
          count: 4,
          format: "%Y-%m-%d %H:%M"
        },
        label: {
          text: "Date",
          position: 'outer-center'
        }
      },

      y: {
        label: {
          text: mapLabels(lbl),
          position: 'middle'
        }
      }
    },
    legend: {
      position: "inset"
    },
    line: {
      step: {
        type: 'step'
      }
    },
    // zoom works, but seems to use a lot of processing power
    zoom: {
      enabled: true
    }

  });
  // add chart and label to list
  //chartList.push({"chart":chart,"lbl":lbl,"id":sel.replace("#","")})
  chartList[displayIdx].chart = chart

  setTimeout(setSize(sel), 100)

  //setTimeout(chart.resize);
  //displayData(rawData,i+1)

  setTimeout(chart.resize, 100);
  setTimeout(displayData, 100);
  displayIdx += 1


  //setTimeout(chart.resize,1000);

}

// set chart size
function setSize(id) {
  id = id.replace("#", "")
  console.log("Set size for ", id)
  // get size of splom element and set all other heights the same
  //var splomHeight = document.getElementById('splom').clientHeight;
  var splomId = english ? "splom-en" : "splom-de"
  console.log("Splom id: ",splomId)
  var splomHeight = document.getElementById(splomId).clientHeight + 15;
  console.log("Set ", id, " to ", splomHeight)
  document.getElementById(id).setAttribute("style", "height:" + splomHeight + "px; position: relative;");
  //setTimeout(updateLabels(id),100);
  updateLabels(id) // also does resize

}
/*
// update chart divs to image size
function resizeCharts() {
  console.log("Resize")
  // get size of splom element and set all other heights the same
  //var splomHeight = document.getElementById('splom').clientHeight;
  var splomHeight = document.getElementById('splom').clientHeight + 15;
  for (var c in chartList) {
    var ch = chartList[c]
    //console.log("Set ",ch.id," to ",splomHeight)
    document.getElementById(ch.id).setAttribute("style","height:"+splomHeight+"px; position: relative;");
    setTimeout(ch.chart.resize,200)
  }
  setTimeout(updateLabels,100);

}
*/

function carousel(base, slideIndex) {
  var i;
  var x = document.getElementsByClassName(base);
  //console.log(base," items: ",x.length)
  for (i = 0; i < x.length; i++) {
    x[i].style.display = "none";
  }
  slideIndex++;
  if (slideIndex > x.length) { slideIndex = 1 }
  x[slideIndex - 1].style.display = "block";
  //setTimeout(carousel, 2000); // Change image every 2 seconds
  setTimeout(carousel.bind(null, base, slideIndex), 8000); // Change image every 2 seconds
}


// copy slideshow fpr wiese
var wiesenShow = function (ms) {
  var i, ss
  var x = w3.getElements(".wcaption"), l = x.length;
  var y = w3.getElements(".wimage"), k = y.length;
  if (l != k) {
    console.log("Wiesenshow: length mismatch")
    return;
  }
  console.log("Wiesensshow on ", x, y)
  ss = {};
  ss.current = 1;
  ss.x = x;
  ss.y = y;
  ss.ondisplaychange = null;
  if (!isNaN(ms) || ms == 0) {
    ss.milliseconds = ms;
  } else {
    ss.milliseconds = 1000;
  }
  ss.start = function () {
    ss.display(ss.current)
    if (ss.ondisplaychange) { ss.ondisplaychange(); }
    if (ss.milliseconds > 0) {
      window.clearTimeout(ss.timeout);
      ss.timeout = window.setTimeout(ss.next, ss.milliseconds);
    }
  };
  ss.next = function () {
    ss.current += 1;
    if (ss.current > ss.x.length) { ss.current = 1; }
    ss.start();
  };
  ss.previous = function () {
    ss.current -= 1;
    if (ss.current < 1) { ss.current = ss.x.length; }
    ss.start();
  };
  ss.display = function (n) {
    w3.styleElements(ss.x, "display", "none");
    w3.removeClass(ss.x[n - 1], 'w3-hide')
    w3.styleElement(ss.x[n - 1], "display", "block");
    w3.styleElements(ss.y, "display", "none");
    w3.removeClass(ss.y[n - 1], 'w3-hide')
    w3.styleElement(ss.y[n - 1], "display", "block");
  }
  ss.start();
  return ss;
};


function w3_open() {
  document.getElementById("menu").style.width = "100%";
  document.getElementById("menu").style.display = "block";
}

function w3_close() {
  document.getElementById("menu").style.display = "none";
}

function toGerman() {
  w3.addClass('.lang-en', 'w3-hide')
  w3.removeClass('.lang-de', 'w3-hide')
  english = false
  setLang()
  setTimeout(updateAllLabels, 50)
  //updateAllLabels()
  /*
   <button onclick="w3.addClass('.lang-en','w3-hide')">Add Class</button> 
  */
}

function toEnglish() {
  w3.addClass('.lang-de', 'w3-hide')
  w3.removeClass('.lang-en', 'w3-hide')
  english = true
  setLang()
  setTimeout(updateAllLabels, 50)
  //updateAllLabels()
}


