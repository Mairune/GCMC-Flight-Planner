
const rawCoords = snappedStart.feature.geometry.coordinates;
console.log("💡 ENTERED slicing section");
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
    return;
}

console.log("Final valid fullLineCoords:", fullLineCoords);
const fullLine = turf.lineString(fullLineCoords);
