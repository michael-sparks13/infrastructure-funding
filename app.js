// get page elements
const modal = document.querySelector("#modal");
const button = document.querySelector("#button");
const h1 = document.querySelector("h1");

// display modal when button is clicked
button.addEventListener("click", function () {
  modal.style.display = "block";
});

// close modal when user clicks anywhere on the page
modal.addEventListener("click", function () {
  modal.style.display = "none";
});

// Set button UI
buttonUI();

//set date in footer
setDate();

// Add event listener for window resize
// When page rotates or is resized, reset page UI
window.addEventListener("resize", buttonUI());

// map options
const options = {
  scrollWheelZoom: true,
  zoomSnap: 0.1,
  dragging: true,
  zoomControl: false,
  // center: [36.5787865668484, -98.2713790576422],
  // zoom: 4,
};


// create the Leaflet map
const map = L.map("map", options);

L.control
  .zoom({
    position: "bottomright",
  })
  .addTo(map);

map.createPane("labels");
map.getPane("labels").style.zIndex = 404;

// request tiles and add to map
const tiles = L.tileLayer(
  "https://stamen-tiles-{s}.a.ssl.fastly.net/toner-background/{z}/{x}/{y}{r}.{ext}",
  {
    attribution:
      'Map tiles by <a href="https://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    subdomains: "abcd",
    ext: "png",
    opacity: 0.5,
  }
).addTo(map);

// Stamen toner labels
const labels = L.tileLayer(
  "https://stamen-tiles-{s}.a.ssl.fastly.net/toner-labels/{z}/{x}/{y}{r}.{ext}",
  {
    attribution:
      'Map tiles by <a href="https://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    subdomains: "abcd",
    ext: "png",
    pane: "labels",
    opacity: 1,
  }
).addTo(map);

map.on("zoomend", function () {
  if (map.getZoom() > 7) {
    labels.setOpacity(0);
  } else {
    labels.setOpacity(1);
  }
});

// AJAX request for GeoJSON data
fetch("data/us-states.json")
  .then(function (response) {
    return response.json();
  })
  .then(function (counties) {
    Papa.parse("data/2020_election.csv", {
      download: true,
      header: true,
      complete: function (data) {
        processData(counties, data);
      },
    });
    return fetch(
      "https://newmapsplus.github.io/assets/data/us_states_20m.geojson"
    );
  })
  .then(function (response) {
    return response.json();
  })
  .then(function (data) {
    drawAnotherLayer(data);
  })
  .catch(function (error) {
    console.log(`Oops, we ran into the following error:`, error);
  }); // end fetch and promise chain

function processData(counties, data) {
  //create geoid field on data object
  for (let j of data.data) {
    j.GEOID = j.STATE_FIP + j.COUNTY_FIP;
  }

  //then combine datasets in browser
  for (let i of counties.features) {
    for (let j of data.data) {
      if (i.properties.GEOID === j.GEOID) {
        i.properties.unemploymentData = j;
        break;
      }
    }
  }
  //create breaks once, across entire range of data
  const rates = []; //start here, remove NaN from rates

  counties.features.forEach(function (county) {
    //console.log(county.properties.unemploymentData)
    for (const prop in county.properties.unemploymentData) {
      const exclude = ["COUNTY_FIP", "STATE_FIP", "NAME", "GEOID"];
      if (!exclude.includes(prop)) {
        console.log(prop);
      }
      if (
        prop != "GEOID" && // 15005 is Kalawao County, HI. Fascinating story.
        prop != "NAME" &&
        prop != "STATE_FIP" &&
        prop != "COUNTY_FIP"
      ) {
        if (!county.properties.unemploymentData[prop] == false) {
          rates.push(Number(county.properties.unemploymentData[prop]));
        }
      }
    }
  });
  //use logarithmic breaks
  let breaks = chroma.limits(rates, "l", 5);
  let colorize = chroma.scale(chroma.brewer.YlOrRd).classes(breaks).mode("lab");

  drawMap(counties, colorize);
  drawLegend(breaks, colorize);
} // end processData()

function drawMap(counties, colorize) {
  // create Leaflet object with geometry data and add to map
  const dataLayer = L.geoJson(counties, {
    style: function (feature) {
      return {
        color: "black",
        weight: 1,
        fillOpacity: 1,
        fillColor: "#D3D3D3",
      };
    },

    onEachFeature: function (feature, layer) {
      layer.on("mouseover", function () {
        layer
          .setStyle({
            color: "#fff",
            weight: 2,
          })
          .bringToFront();
      });

      layer.on("mouseout", function () {
        layer.setStyle({
          color: "#000",
          weight: 1,
        });
      });
    },
  }).addTo(map);

  updateMap(dataLayer, colorize, currentYear);
  createSliderUI(dataLayer, colorize);
} // end drawMap()

function updateMap(dataLayer, colorize, currentYear) {
  dataLayer.eachLayer(function (layer) {
    let props = layer.feature.properties.unemploymentData;
    //only color/add tooltip if county has data
    // Note: that chroma.js will return a color even if the value is NaN, null, etc.
    // which is #ccc.
    let tooltipInfo = `<b>No data available</b></br>`;
    layer.setStyle({
      fillColor: "#ccc", // Addendum: need to set a color for counties with no data
      // for a given year, otherwise it take the previous iteration's color.
    });

    if (props && props[currentYear]) {
      layer.setStyle({
        fillColor: colorize(Number(props[currentYear])),
      });
      tooltipInfo = `<b>${props.NAME}</b><br>
        ${props[
          currentYear
        ].toLocaleString()}% unemployment rate in <b>${currentYear}</b>`;
    }
    layer.bindTooltip(tooltipInfo, {
      sticky: false,
    });
  });
} // end updateMap()

function drawLegend(breaks, colorize) {
  // create a Leaflet control for the legend
  const legendControl = L.control({
    position: "topright",
  });

  // when the control is added to the map
  legendControl.onAdd = function (map) {
    // create a new division element with class of 'legend' and return
    const legend = L.DomUtil.create("div", "legend");
    return legend;
  };

  // add the legend control to the map
  legendControl.addTo(map);

  // select div and create legend title
  const legend = document.querySelector(".legend");
  legend.innerHTML = "<h3><span>2001</span> Unemployment Rates</h3><ul>";

  // loop through the break values
  for (let i = 0; i < breaks.length - 1; i++) {
    // determine color value
    const color = colorize(breaks[i], breaks);

    // create legend item
    const classRange = `<li><span style="background:${color}"></span>
      ${parseFloat(breaks[i].toLocaleString()).toFixed(2)} &mdash;
      ${parseFloat(breaks[i + 1].toLocaleString()).toFixed(2)}% </li>`;

    // append to legend unordered list item
    legend.innerHTML += classRange;
  }

  legend.innerHTML += `<li><span style="background:#D3D3D3"></span>
      No data
      </li>`;
  // close legend unordered list
  legend.innerHTML += "</ul>";
} // end drawLegend()

function createSliderUI(dataLayer, colorize) {
  // create Leaflet control for the slider
  const sliderControl = L.control({ position: "bottomleft" });

  // when added to the map
  sliderControl.onAdd = function (map) {
    // select an existing DOM element with an id of "ui-controls"
    const slider = L.DomUtil.get("ui-controls");

    // disable scrolling of map while using controls
    L.DomEvent.disableScrollPropagation(slider);

    // disable click events while using controls
    L.DomEvent.disableClickPropagation(slider);

    // return the slider from the onAdd method
    return slider;
  };

  // add the control to the map
  sliderControl.addTo(map);

  const slider = document.querySelector(".year-slider");

  // listen for changes on input element
  slider.addEventListener("input", function (e) {
    // get the value of the selected option
    const currentYear = e.target.value;
    // update the map with current timestamp
    updateMap(dataLayer, colorize, currentYear);
    // update timestamp in legend heading
    document.querySelector(".legend h3 span").innerHTML = currentYear;
  });
} // end createSliderUI()

//replace with resize fxn
function buttonUI() {
  button.style.top = h1.offsetHeight + 20 + "px";
}

//keep page fresh
function setDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.toLocaleString("default", { month: "long" });
  const footerText = document.querySelector("footer p");
  footerText.innerHTML = `${month} ${year} | New Maps Plus`;
}

function drawAnotherLayer(data) {
  const bounds = L.latLngBounds();
  L.geoJson(data, {
    style: function (feature) {
      return {
        color: "#222",
        weight: 2,
        fillOpacity: 0,
        interactive: false,
      };
    },
    onEachFeature: function (feature, layer) {
      const name = feature.properties.NAME;
      if (name == "Florida" || name == "Washington" || name == "Maine") {
        bounds.extend(layer.getBounds());
      }
    },
  }).addTo(map);
  map.fitBounds(bounds, {
    padding: [50, 50],
    animate: false,
  });
}
