
let map, selectedPoints = [], permanentMarkers = [], snappedPoints = [], routeLines = [];
let flightRouteData = null;

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
    map.on('click', addPoint);
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
    let latlng = e.latlng;
    let marker = L.marker(latlng).addTo(map)
        .bindTooltip(`${selectedPoints.length + 1}`, { permanent: true, direction: "top" });
    selectedPoints.push({ latlng, marker });

    let snappedLatLng = null, snappedFeature = null;
    const point = turf.point([latlng.lng, latlng.lat]);
    let closestPoint = null, shortestDist = Infinity;

    flightRouteData?.features.forEach(route => {
        const line = turf.lineString(route.geometry.coordinates);
        const snapped = turf.nearestPointOnLine(line, point);
        if (snapped.properties.dist < shortestDist) {
            closestPoint = snapped;
            snappedFeature = route;
            shortestDist = snapped.properties.dist;
        }
    });

    if (closestPoint) {
        snappedLatLng = [closestPoint.geometry.coordinates[1], closestPoint.geometry.coordinates[0]];
        L.circleMarker(snappedLatLng, {
            radius: 6, color: 'blue', fillColor: 'blue', fillOpacity: 0.8
        }).addTo(map);
        snappedPoints.push({ latlng: snappedLatLng, feature: snappedFeature });
    }

    if (selectedPoints.length >= 2 && snappedPoints.length >= 2) {
        const start = selectedPoints[selectedPoints.length - 2].latlng;
        const end = selectedPoints[selectedPoints.length - 1].latlng;
        const snappedStart = snappedPoints[snappedPoints.length - 2];
        const snappedEnd = snappedPoints[snappedPoints.length - 1];
        const routeSegments = [];

        routeSegments.push([start.lat, start.lng]);
        routeSegments.push([snappedStart.latlng[0], snappedStart.latlng[1]]);

        const fullLine = sliceRouteSegment(snappedStart, snappedEnd);
        if (fullLine) {
            const pt1 = turf.point([snappedStart.latlng[1], snappedStart.latlng[0]]);
            const pt2 = turf.point([snappedEnd.latlng[1], snappedEnd.latlng[0]]);
            const sliced = turf.lineSlice(pt1, pt2, fullLine);
            sliced.geometry.coordinates.forEach(coord => {
                routeSegments.push([coord[1], coord[0]]);
            });
        }

        routeSegments.push([snappedEnd.latlng[0], snappedEnd.latlng[1]]);
        routeSegments.push([end.lat, end.lng]);

        const polyline = L.polyline(routeSegments, { color: 'blue', weight: 4, opacity: 0.8 }).addTo(map);
        routeLines.push(polyline);
    }
}

document.addEventListener('DOMContentLoaded', initializeMap);
