// Global Variables
let map, selectedPoints = [], roadLayer, permanentMarkers = [], flightRoutes = [];

// Initialize the Map
function initializeMap() {
    map = L.map('map').setView([57.0858, -131.0810], 11);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

    // Load permanent markers
    loadPermanentMarkers();

    // Load permanent flight routes
    loadFlightRoutes();

    map.on('click', addPoint);

    document.getElementById("resetButton").addEventListener("click", resetWaypoints);
    document.getElementById("removeLastButton").addEventListener("click", removeLastWaypoint);
}

// Load permanent flight routes from GeoJSON
function loadFlightRoutes() {
    fetch('https://mairune.github.io/GCMC-Flight-Planner/flight_routes.geojson')
        .then(response => response.json())
        .then(data => {
            L.geoJSON(data, {
                style: {
                    color: 'yellow',
                    weight: 3
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

// Function to load permanent markers
function loadPermanentMarkers() {
    const permanentLocations = [
        { lat: 57.0594, lng: -130.6289, name: "Ch'iyone" },
        { lat: 57.1261, lng: -131.4542, name: "Uhtlan" }
    ];

    permanentLocations.forEach(location => {
        let marker = L.marker([location.lat, location.lng]).addTo(map)
            .bindTooltip(location.name, { permanent: true, direction: "top" });
        permanentMarkers.push(marker);
    });
}

// Add Points to the Map
function addPoint(e) {
    let latlng = e.latlng;
    let marker = L.marker(latlng).addTo(map)
        .bindTooltip(`${selectedPoints.length + 1}`, { permanent: true, direction: "top" })
        .openTooltip();

    selectedPoints.push({ latlng, marker });

    console.log("Points selected:", selectedPoints);

    if (selectedPoints.length > 1) {
        calculateDistance();
    }
}

// Remove Last Waypoint
function removeLastWaypoint() {
    if (selectedPoints.length > 0) {
        let lastPoint = selectedPoints.pop();
        map.removeLayer(lastPoint.marker);
        calculateDistance(); // Recalculate distances after removal
    }
}

// Reset all waypoints except permanent markers
function resetWaypoints() {
    selectedPoints.forEach(point => map.removeLayer(point.marker));
    selectedPoints = [];
    document.getElementById("legDetails").innerHTML = "";
    document.getElementById("output").innerText = "Total Distance: 0 km, Total Time: 0 min";
    console.log("Waypoints reset.");
}

// Calculate Distance and Time
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
