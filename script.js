// Global Variables
let map, selectedPoints = [], roadLayer, permanentMarkers = [], flightRoutes = [], snappedPoints = [], routeLines = [];
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
        .catch(err => console.error("Failed to load flight routes:", err);
}

function loadPermanentMarkers() {
    const permanentLocations = [
        { lat: 57.1261, lng: -131.4539, name: "Uhtlan" },
        { lat: 57.0595, lng: -130.6293, name: "Ch'iyone" }
    ];

    permanentLocations.forEach(location => {
        let marker = L.marker([location.lat, location.lng]).addTo(map)
            .bindTooltip(location.name, { permanent: true, direction: "top" });
        permanentMarkers.push(marker);
    });
}

function addPoint(e) {
    let latlng = e.latlng;
    let marker = L.marker(latlng).addTo(map)
        .bindTooltip(`${selectedPoints.length + 1}`, { permanent: true, direction: "top" })
        .openTooltip();

    selectedPoints.push({ latlng, marker });
    console.log("Points selected:", selectedPoints);

    // Snap to nearest route
    let snappedLatLng = null;
    let snappedFeature = null;
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
                snappedFeature = route;
            }
        });

        if (closestPoint) {
            snappedLatLng = [closestPoint.geometry.coordinates[1], closestPoint.geometry.coordinates[0]];
            const snapMarker = L.circleMarker(snappedLatLng, {
                radius: 6,
                color: 'blue',
                fillColor: 'blue',
                fillOpacity: 0.8
            }).addTo(map);
            snappedPoints.push({ latlng: snappedLatLng, feature: snappedFeature });
            console.log("Snapped to:", closestPoint);
        }
    }

    // Draw route line if we have two points
    if (selectedPoints.length >= 2 && snappedPoints.length >= 2) {
        const start = selectedPoints[selectedPoints.length - 2].latlng;
        const snappedStart = snappedPoints[snappedPoints.length - 2];
        const snappedEnd = snappedPoints[snappedPoints.length - 1];
        const end = selectedPoints[selectedPoints.length - 1].latlng;

        let routeSegments = [];

        // Line from start to snappedStart
        routeSegments.push([start.lat, start.lng]);
        routeSegments.push([snappedStart.latlng[0], snappedStart.latlng[1]]);

        // Add flight route segment only if same route
        if (snappedStart.feature === snappedEnd.feature) {
            const fullLine = turf.lineString(snappedStart.feature.geometry.coordinates.map(coord => [parseFloat(coord[0]), parseFloat(coord[1])]));
            const pt1 = turf.point([parseFloat(snappedStart.latlng[1]), parseFloat(snappedStart.latlng[0])]);
            const pt2 = turf.point([parseFloat(snappedEnd.latlng[1]), parseFloat(snappedEnd.latlng[0])]);
            const sliced = turf.lineSlice(pt1, pt2, fullLine);

            
console.log("SnappedStart:", snappedStart);
console.log("SnappedEnd:", snappedEnd);

try {
    const fullLine = turf.lineString(snappedStart.feature.geometry.coordinates.map(coord => [parseFloat(coord[0]), parseFloat(coord[1])]));
    const pt1 = turf.point([parseFloat(snappedStart.latlng[1]), parseFloat(snappedStart.latlng[0])]);
    const pt2 = turf.point([parseFloat(snappedEnd.latlng[1]), parseFloat(snappedEnd.latlng[0])]);

    const sliced = turf.lineSlice(pt1, pt2, fullLine);
    sliced.geometry.coordinates.forEach(coord => {
        routeSegments.push([coord[1], coord[0]]);
    });
} catch (err) {
    console.warn("Failed to slice flight segment:", err);
}

                routeSegments.push([coord[1], coord[0]]);
            });
        }

        // Line from snappedEnd to end
        routeSegments.push([snappedEnd.latlng[0], snappedEnd.latlng[1]]);
        routeSegments.push([end.lat, end.lng]);

        let polyline = L.polyline(routeSegments, {
            color: 'blue',
            weight: 4,
            opacity: 0.8
        }).addTo(map);
        routeLines.push(polyline);
    }

    if (selectedPoints.length > 1) {
        calculateDistance();
    }
}

function removeLastWaypoint() {
    if (selectedPoints.length > 0) {
        let lastPoint = selectedPoints.pop();
        map.removeLayer(lastPoint.marker);
        if (snappedPoints.length > 0) {
            map.removeLayer(snappedPoints.pop());
        }
        if (routeLines.length > 0) {
            map.removeLayer(routeLines.pop());
        }
        calculateDistance();
    }
}

function resetWaypoints() {
    selectedPoints.forEach(point => map.removeLayer(point.marker));
    snappedPoints.forEach(snap => map.removeLayer(snap.marker));
    routeLines.forEach(line => map.removeLayer(line));
    selectedPoints = [];
    snappedPoints = [];
    routeLines = [];
    document.getElementById("legDetails").innerHTML = "";
    document.getElementById("output").innerText = "Total Distance: 0 km, Total Time: 0 min";
    console.log("Waypoints reset.");
}

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


// New Variables for Graph
let routeGraph = { nodes: [], edges: [] };
let graphLoaded = false;

// Load Graph JSON (precomputed from MultiLineString GeoJSON)
fetch('https://mairune.github.io/GCMC-Flight-Planner/flight_route_graph.json')
    .then(res => res.json())
    .then(data => {
        routeGraph = data;
        graphLoaded = true;
        console.log("Graph loaded:", routeGraph);
    });

// Helper to find nearest graph node
function findNearestNode(latlng) {
    let minDist = Infinity;
    let nearest = null;
    routeGraph.nodes.forEach(coord => {
        const numericCoord = [parseFloat(coord[0]), parseFloat(coord[1])];
        const dist = turf.distance([latlng.lng, latlng.lat], numericCoord);
        if (dist < minDist) {
            minDist = dist;
            nearest = coord;
        }
    });
    return nearest;
}

// Dijkstra pathfinder
function findShortestPath(startCoord, endCoord) {
    const graph = {};
    routeGraph.nodes.forEach(coord => {
        graph[coord] = {};
    });
    routeGraph.edges.forEach(edge => {
        const keyFrom = edge.from.toString();
        const keyTo = edge.to.toString();
        if (!graph[keyFrom]) graph[keyFrom] = {};
        if (!graph[keyTo]) graph[keyTo] = {};
        graph[keyFrom][keyTo] = edge.weight;
        graph[keyTo][keyFrom] = edge.weight;
    });

    // Dijkstra algorithm
    const Q = new Set(Object.keys(graph));
    const dist = {};
    const prev = {};
    for (let node of Q) {
        dist[node] = Infinity;
        prev[node] = null;
    }
    dist[startCoord.toString()] = 0;

    while (Q.size > 0) {
        let u = Array.from(Q).reduce((minNode, node) => dist[node] < dist[minNode] ? node : minNode);
        Q.delete(u);
        if (u === endCoord.toString()) break;
        for (let neighbor in graph[u]) {
            let alt = dist[u] + graph[u][neighbor];
            if (alt < dist[neighbor]) {
                dist[neighbor] = alt;
                prev[neighbor] = u;
            }
        }
    }

    // Reconstruct path
    let path = [];
    let u = endCoord.toString();
    while (u) {
        path.unshift(u.split(',').map(v => parseFloat(v)));
        u = prev[u];
    }
    return path;
}


initializeMap();
 
