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
  .then(function (states) {
    Papa.parse("data/funding.csv", {
      download: true,
      header: true,
      complete: function (data) {
        processData(states, data);
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

function processData(states, data) {
  //then combine datasets in browser
  for (let i of states.features) {
    i.properties.annc_funding = [];
    i.properties.awrd_funding = [];
    for (let j of data.data) {
      if (i.properties.name == j.state) {
        i.properties.population = Number(j.population_2020);
        if (j.status == "Announced") {
          i.properties.annc_funding.push(j);
        } else if (j.status == "Awarded") {
          i.properties.awrd_funding.push(j);
        }
      }
    }
  }

  //create breaks once, across entire range of data
  //may end up not using awarded funding...
  const announced = [];
  const awarded = [];

  for (let state of states.features) {
    let total = 0;
    for (let i of state.properties.annc_funding) {
      total += Number(i.total_funding);
    }
    state.properties.tot_annc_funding = total;
    state.properties.per_cap_annc_funding =
      state.properties.tot_annc_funding / state.properties.population;
    announced.push(total);
  }

  //use logarithmic breaks
  let breaks = chroma.limits(announced, "l", 5);
  let colorize = chroma.scale(chroma.brewer.Greens).classes(breaks).mode("lab");

  drawMap(states, colorize);
  drawLegend(breaks, colorize);
} // end processData()

function drawMap(states, colorize) {
  // create Leaflet object with geometry data and add to map
  const dataLayer = L.geoJson(states, {
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
  updateMap(dataLayer, colorize);
  addUi();
} // end drawMap()

function updateMap(dataLayer, colorize) {
  dataLayer.eachLayer(function (layer) {
    let props = layer.feature.properties;
    //only color/add tooltip if county has data
    // Note: that chroma.js will return a color even if the value is NaN, null, etc.
    // which is #ccc.
    let tooltipInfo = `<b>No data available</b></br>`;
    layer.setStyle({
      fillColor: "#ccc",
    });

    if (props) {
      layer.setStyle({
        fillColor: colorize(Number(props.tot_annc_funding)),
      });
      tooltipInfo = `<b>$${props.tot_annc_funding.toLocaleString()}</b> of funding has been announced for <b>${
        props.name
      }</b><br>`;
    }
    layer.bindTooltip(tooltipInfo, {
      sticky: false,
    });
  });
} // end updateMap()

function drawLegend(breaks, colorize) {
  // create a Leaflet control for the legend
  const legendControl = L.control({
    position: "bottomright",
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
  legend.innerHTML = "<h3>Announced Funding In Millions</h3><ul>";

  // loop through the break values
  for (let i = 0; i < breaks.length - 1; i++) {
    // determine color value
    const color = colorize(breaks[i], breaks);

    // create legend item
    const classRange = `<li><span style="background:${color}"></span>
      
    $${Number(
      (breaks[i] / 1000000).toFixed(1)
    ).toLocaleString()}&ndash;${Number(
      (breaks[i + 1] / 1000000).toFixed(1)
    ).toLocaleString()}</li>`;

    // append to legend unordered list item
    legend.innerHTML += classRange;
  }

  legend.innerHTML += `<li><span style="background:#D3D3D3"></span>
      No data
      </li>`;
  // close legend unordered list
  legend.innerHTML += "</ul>";
} // end drawLegend()


function addUi() {
  let selectControl = L.control({ position: "topright" });

  // when control is added
  selectControl.onAdd = function () {
    // get the element with id attribute of ui-controls
    return L.DomUtil.get("dropdown-ui");
  };
  // add the control to the map
  selectControl.addTo(map);

  const dropdown = document.querySelector("#dropdown-ui select");
  dropdown.addEventListener("change", function (e) {
    //attributeValue = e.target.value;
    //updateMap(counties);
    console.log(e.target.value)
  });
}

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
