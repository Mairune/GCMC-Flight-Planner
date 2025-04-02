// Global Variables
let map, selectedPoints = [], roadLayer, permanentMarkers = [], flightRoutes = [], snappedPoints = [];
let flightRouteData = null; // to store loaded GeoJSON data

// Initialize the Map
function initializeMap() {
    map = L.map('map').setView([57.0858, -131.0810], 11);

    L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=pk.eyJ1Ijoiam9yZHl0b2RkIiwiYSI6ImNtOHY3NndxaTBtc2MyaW9rYmlzcWR4OHAifQ.ucU1OL7L7My1V6NoFVI-uw', {
        attribution: '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a>',
        id: 'mapbox/satellite-v9',
        tileSize: 512,
        zoomOffset: -1
    }).addTo(map);

    loadPermanentMarkers();
    loadFlightRoutes();

    map.on('click', addPoint);

    document.getElementById("resetButton").addEventListener("click", resetWaypoints);
    document.getElementById("removeLastButton").addEventListener("click", removeLastWaypoint);
}

// Load permanent flight routes
function loadFlightRoutes() {
    fetch('https://mairune.github.io/GCMC-Flight-Planner/flight_routes.geojson')
        .then(response => response.json())
        .then(data => {
            flightRouteData = data;

            L.geoJSON(data, {
                style: {
                    color: '#cccccc',
                    weight: 3,
                    opacity: 0.7
                },
                onEachFeature: function (feature, layer) {
                    if (feature.properties && feature.properties.name) {
                        layer.bindTooltip(feature.properties.name, {
                            permanent: false,
                            direction: "center"
                        });
                    }
                }
            }).addTo(map);
        })
        .catch(err => console.error("Failed to load flight routes:", err));
}

// Load fixed permanent markers
function loadPermanentMarkers() {
    const permanentLocations = [
        { lat: 57.0900, lng: -131.0800, name: "Base Camp" },
        { lat: 57.1000, lng: -131.0700, name: "Landing Zone" }
    ];

    permanentLocations.forEach(location => {
        let marker = L.marker([location.lat, location.lng]).addTo(map)
            .bindTooltip(location.name, { permanent: true, direction: "top" });
        permanentMarkers.push(marker);
    });
}

// Add a waypoint and snap it to the closest route
function addPoint(e) {
    let latlng = e.latlng;
    let marker = L.marker(latlng).addTo(map)
        .bindTooltip(`${selectedPoints.length + 1}`, { permanent: true, direction: "top" })
        .openTooltip();

    selectedPoints.push({ latlng, marker });
    console.log("Points selected:", selectedPoints);

    // Snap to nearest route
    if (flightRouteData) {
        const point = turf.point([latlng.lng, latlng.lat]);
        let closestPoint = null;
        let shortestDist = Infinity;

        flightRouteData.features.forEach(route => {
            const line = turf.lineString(route.geometry.coordinates);
            const snapped = turf.nearestPointOnLine(line, point);
            const dist = snapped.properties.dist;

            if (dist < shortestDist) {
                shortestDist = dist;
                closestPoint = snapped;
            }
        });

        if (closestPoint) {
            const snappedLatLng = [closestPoint.geometry.coordinates[1], closestPoint.geometry.coordinates[0]];
            const snapMarker = L.circleMarker(snappedLatLng, {
                radius: 6,
                color: 'blue',
                fillColor: 'blue',
                fillOpacity: 0.8
            }).addTo(map);
            snappedPoints.push(snapMarker);
            console.log("Snapped to:", closestPoint);
        }
    }

    if (selectedPoints.length > 1) {
        calculateDistance();
    }
}

// Remove the most recent waypoint
function removeLastWaypoint() {
    if (selectedPoints.length > 0) {
        let lastPoint = selectedPoints.pop();
        map.removeLayer(lastPoint.marker);
        if (snappedPoints.length > 0) {
            map.removeLayer(snappedPoints.pop());
        }
        calculateDistance();
    }
}

// Clear all user-added waypoints and markers
function resetWaypoints() {
    selectedPoints.forEach(point => map.removeLayer(point.marker));
    snappedPoints.forEach(snap => map.removeLayer(snap));
    selectedPoints = [];
    snappedPoints = [];
    document.getElementById("legDetails").innerHTML = "";
    document.getElementById("output").innerText = "Total Distance: 0 km, Total Time: 0 min";
    console.log("Waypoints reset.");
}

// Calculate straight-line distance between selected points
function calculateDistance() {
    if (selectedPoints.length < 2) return;

    let totalDistance = 0;
    let speed = parseFloat(document.getElementById("speed").value);
    let departureTime = document.getElementById("departureTime").value.split(":");
    let currentHour = parseInt(departureTime[0]);
    let currentMinute = parseInt(departureTime[1]);

    let legDetailsHTML = "";
    for (let i = 1; i < selectedPoints.length; i++) {
        let from = selectedPoints[i - 1].latlng;
        let to = selectedPoints[i].latlng;
        let distance = turf.distance([from.lng, from.lat], [to.lng, to.lat]);
        totalDistance += distance;

        let timeMinutes = (distance / speed) * 60;
        currentMinute += timeMinutes;
        while (currentMinute >= 60) {
            currentMinute -= 60;
            currentHour += 1;
        }

        legDetailsHTML += `<li>Leg ${i}: ${distance.toFixed(2)} km, Arrival: ${currentHour}:${currentMinute.toFixed(0).padStart(2, '0')}</li>`;
    }

    document.getElementById("legDetails").innerHTML = legDetailsHTML;
    document.getElementById("output").innerText = `Total Distance: ${totalDistance.toFixed(2)} km, Total Time: ${((totalDistance / speed) * 60).toFixed(0)} min`;
}

initializeMap();
