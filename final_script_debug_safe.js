
let map, selectedPoints = [], permanentMarkers = [], snappedPoints = [], routeLines = [];
let flightRouteData = null;
let edgeGeometry = {};

function initializeMap() {
    map = L.map('map').setView([57.0858, -131.0810], 11);

    L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=pk.eyJ1Ijoiam9yZHl0b2RkIiwiYSI6ImNtOHY3NndxaTBtc2MyaW9rYmlzcWR4OHAifQ.ucU1OL7L7My1V6NoFVI-uw', {
        attribution: '&copy; Mapbox',
        id: 'mapbox/outdoors-v11',
        tileSize: 512,
        zoomOffset: -1
    }).addTo(map);

    loadPermanentMarkers();
    loadFlightRoutes();
    loadRouteGraph();
    // Load edge-to-geometry lookup
    fetch('edge_geometry_lookup.json')
      .then(res => res.json())
      .then(data => {
        edgeGeometry = data;
        console.log("✅ Edge geometry loaded");
      })
      .catch(err => console.error("❌ Failed to load edge geometry", err));
        map.on('click', addPoint);
}

// Utility to calculate haversine distance (used in node search)
function haversineDistance(coord1, coord2) {
    const from = turf.point(coord1);
    const to = turf.point(coord2);
    return turf.distance(from, to, { units: "kilometers" });
}

// Find nearest graph node to a given [lng, lat]
function findNearestGraphNode(lngLat, graphNodes) {
    let closest = null;
    let minDist = Infinity;

    for (const node of graphNodes) {
        const dist = haversineDistance(lngLat, node);
        if (dist < minDist) {
            minDist = dist;
            closest = node;
        }
    }
    return closest;
}

// Build adjacency list from graph data
function buildGraph(graphData) {
    const graph = new Map();
    graphData.edges.forEach(edge => {
        const fromKey = edge.from.join(',');
        const toKey = edge.to.join(',');
        const weight = edge.weight;

        if (!graph.has(fromKey)) graph.set(fromKey, []);
        if (!graph.has(toKey)) graph.set(toKey, []);

        graph.get(fromKey).push({ node: toKey, weight });
        graph.get(toKey).push({ node: fromKey, weight }); // assuming bidirectional
    });
    return graph;
}

// Dijkstra's algorithm
function dijkstra(graph, start, end) {
    const distances = {};
    const prev = {};
    const queue = new Set();

    for (let key of graph.keys()) {
        distances[key] = Infinity;
        queue.add(key);
    }
    distances[start] = 0;

    while (queue.size > 0) {
        let current = [...queue].reduce((a, b) => (distances[a] < distances[b] ? a : b));
        queue.delete(current);

        if (current === end) break;

        for (const neighbor of graph.get(current)) {
            const alt = distances[current] + neighbor.weight;
            if (alt < distances[neighbor.node]) {
                distances[neighbor.node] = alt;
                prev[neighbor.node] = current;
            }
        }
    }

    // Reconstruct path
    const path = [];
    let current = end;
    while (current) {
        path.unshift(current);
        current = prev[current];
    }
    return path.map(k => k.split(',').map(Number));
}

function loadFlightRoutes() {
    fetch('flight_routes.geojson')
        .then(res => res.json())
        .then(data => {
            flightRouteData = data;
            L.geoJSON(data, {
                style: { color: '#999', weight: 2 }
            }).addTo(map);
        })
        .catch(err => console.error("Failed to load flight routes:", err));
}

// load graph
function loadRouteGraph() {
    fetch('flight_route_graph.json')
        .then(res => res.json())
        .then(data => {
            routeGraphData = data;
            graphNodes = data.nodes;
            routeGraph = buildGraph(data);
            console.log("✅ Route graph loaded.");
        })
        .catch(err => console.error("Failed to load graph data:", err));
}


function loadPermanentMarkers() {
    const locations = [
        { lat: 57.1261, lng: -131.4539, name: "Uhtlan" },
        { lat: 57.0595, lng: -130.6293, name: "Ch'iyone" }
    ];
    locations.forEach(loc => {
        L.marker([loc.lat, loc.lng]).addTo(map)
         .bindTooltip(loc.name, { permanent: true, direction: 'top' });
    });
}

function sliceRouteSegment(snappedStart, snappedEnd) {
    console.log("💡 ENTERED slicing section");
    const rawCoords = snappedStart.feature.geometry.coordinates;
    console.log("Raw snappedStart.feature.geometry.coordinates:", rawCoords);

    const fullLineCoords = rawCoords.map(coord => {
        if (!Array.isArray(coord) || coord.length !== 2) {
            console.warn("Invalid coord (not lat/lng array):", coord);
            return null;
        }
        const lng = parseFloat(coord[0]);
        const lat = parseFloat(coord[1]);
        if (isNaN(lng) || isNaN(lat)) {
            console.warn("Invalid coord (not numeric):", coord);
            return null;
        }
        return [lng, lat];
    }).filter(c => c !== null);

    if (fullLineCoords.length < 2) {
        console.warn("Not enough valid coords to draw line:", fullLineCoords);
        return null;
    }

    console.log("Final valid fullLineCoords:", fullLineCoords);
    return turf.lineString(fullLineCoords);
}

function addPoint(e) {
    const latlng = e.latlng;
    const marker = L.marker(latlng).addTo(map)
        .bindTooltip(`${selectedPoints.length + 1}`, { permanent: true, direction: "top" });

    selectedPoints.push({ latlng, marker });

    const point = turf.point([latlng.lng, latlng.lat]);
    let closestPoint = null;
    let shortestDist = Infinity;
    let snappedFeature = null;

    flightRouteData?.features.forEach(route => {
    if (route.geometry.type === "LineString") {
        const line = turf.lineString(route.geometry.coordinates);
        const snapped = turf.nearestPointOnLine(line, point);
        const dist = snapped.properties.dist; // in kilometers
        console.log("Snapped distance:", dist.toFixed(4), "km");
        if (dist < 0.5 && dist < shortestDist) {  // 0.1 km = 100 meters
            closestPoint = snapped;
            snappedFeature = route;
            shortestDist = dist;
        }

    }
});

    if (closestPoint) {
        const snappedCoords = closestPoint.geometry.coordinates;
        const nearestNode = findNearestGraphNode(snappedCoords, graphNodes);

        if (!nearestNode) {
            console.warn("❌ No nearby graph node found for snapped point");
            return;
        }

        const snappedLatLng = [snappedCoords[1], snappedCoords[0]];
        snappedPoints.push({
            latlng: snappedLatLng,
            feature: snappedFeature,
            graphNode: nearestNode
        });

        L.circleMarker(snappedLatLng, {
            radius: 6, color: 'blue', fillColor: 'blue', fillOpacity: 0.8
        }).addTo(map);

        if (snappedPoints.length >= 2) {
            const start = snappedPoints[snappedPoints.length - 2];
            const end = snappedPoints[snappedPoints.length - 1];

            const startKey = start.graphNode.join(',');
            const endKey = end.graphNode.join(',');

            const path = dijkstra(routeGraph, startKey, endKey);
            if (!path || path.length === 0) {
                console.warn("⚠️ No path found between nodes");
                return;
            }

            let routeSegment = [];

for (let i = 0; i < path.length - 1; i++) {
    const from = JSON.stringify(path[i]);
    const to = JSON.stringify(path[i + 1]);
    const key = `${from}|${to}`;

    const reverseKey = `${to}|${from}`;
let segment = edgeGeometry[key] || edgeGeometry[reverseKey];

if (segment) {
    routeSegment.push(...segment.map(([lng, lat]) => [lat, lng]));
} else {
    // fallback: draw direct line
    routeSegment.push([path[i][1], path[i][0]]);
    routeSegment.push([path[i + 1][1], path[i + 1][0]]);
    console.warn("No route geometry found — using direct segment:", key);
}



            const polyline = L.polyline([
                start.latlng,
                ...routeSegment,
                end.latlng
            ], { color: 'blue', weight: 4, opacity: 0.8 }).addTo(map);

            routeLines.push(polyline);
        }
    } else {
        console.warn("❌ Snapping failed — no route found nearby.");
    }
}

document.addEventListener('DOMContentLoaded', initializeMap);
