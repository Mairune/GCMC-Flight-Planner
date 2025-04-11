
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

    // Snap to closest route
    flightRouteData?.features.forEach(route => {
        if (route.geometry.type === "LineString") {
            const line = turf.lineString(route.geometry.coordinates);
            const snapped = turf.nearestPointOnLine(line, point);
            const dist = snapped.properties.dist;
            if (dist < 1 && dist < shortestDist) {
                closestPoint = snapped;
                snappedFeature = route;
                shortestDist = dist;
            }
        }
    });

    if (!closestPoint) {
        console.warn("❌ Snapping failed — no route found nearby.");
        return;
    }

    const snappedLatLng = [closestPoint.geometry.coordinates[1], closestPoint.geometry.coordinates[0]];
    const snappedNode = findNearestGraphNode(closestPoint.geometry.coordinates, graphNodes);

    if (!snappedNode) {
        console.warn("❌ Could not find nearest graph node.");
        return;
    }

    snappedPoints.push({
        latlng: snappedLatLng,
        feature: snappedFeature,
        graphNode: snappedNode
    });

    // Show the snap circle
    L.circleMarker(snappedLatLng, {
        radius: 5,
        color: 'blue',
        fillColor: 'blue',
        fillOpacity: 0.9
    }).addTo(map);

    // If we have 2 or more snapped points, calculate route from previous to current
    if (snappedPoints.length >= 2) {
        const prev = snappedPoints[snappedPoints.length - 2];
        const curr = snappedPoints[snappedPoints.length - 1];

        const startKey = prev.graphNode.join(',');
        const endKey = curr.graphNode.join(',');
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
                routeSegment.push([path[i][1], path[i][0]]);
                routeSegment.push([path[i + 1][1], path[i + 1][0]]);
                console.warn("Fallback segment used:", key);
            }
        }

        // DRAWING

        // 1. From user click to snapped route
        L.polyline([prev.latlng, prev.latlng !== prev.graphNode ? prev.latlng : snappedLatLng], {
            color: 'blue', weight: 3, opacity: 0.8
        }).addTo(map);

        // 2. Along the network route
        L.polyline(routeSegment, {
            color: 'blue', weight: 4, opacity: 1.0
        }).addTo(map);

        // 3. From snapped route to final click
        L.polyline([snappedLatLng, latlng], {
            color: 'blue', weight: 3, opacity: 0.8
        }).addTo(map);
    }

} else {
        console.warn("❌ Snapping failed — no route found nearby.");
}
}
document.addEventListener('DOMContentLoaded', initializeMap);
