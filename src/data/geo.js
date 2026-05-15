'use strict';

const EARTH_RADIUS_M = 6371008.8;

function assertLatLon(lat, lon) {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error(`Invalid latitude: ${lat}`);
  }
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new Error(`Invalid longitude: ${lon}`);
  }
}

function lonLatToTile(lon, lat, z) {
  assertLatLon(lat, lon);
  if (!Number.isInteger(z) || z < 0 || z > 22) {
    throw new Error(`Invalid zoom level: ${z}`);
  }
  const latRad = lat * Math.PI / 180;
  const n = 2 ** z;
  const x = Math.floor((lon + 180) / 360 * n);
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return {
    z,
    x: Math.min(Math.max(x, 0), n - 1),
    y: Math.min(Math.max(y, 0), n - 1)
  };
}

function tileRangeAround(lon, lat, z, radius = 0) {
  const center = lonLatToTile(lon, lat, z);
  const n = 2 ** z;
  const tiles = [];
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      const x = center.x + dx;
      const y = center.y + dy;
      if (x >= 0 && x < n && y >= 0 && y < n) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

function haversineMeters(a, b) {
  assertLatLon(a.lat, a.lon);
  assertLatLon(b.lat, b.lon);
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat ** 2 + Math.cos(lat1) * Math.cos(lat2) * sinDLon ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function flattenGeoJson(data) {
  if (!data || data === '') return [];
  if (Array.isArray(data)) return data.flatMap(flattenGeoJson);
  if (data.type === 'FeatureCollection') return Array.isArray(data.features) ? data.features : [];
  if (data.type === 'Feature') return [data];
  if (data.type && data.coordinates) return [{ type: 'Feature', geometry: data, properties: {} }];
  return [];
}

function getFeatureCoordinate(feature) {
  if (!feature || !feature.geometry) return null;
  const { type, coordinates } = feature.geometry;
  if (type === 'Point' && Array.isArray(coordinates)) {
    return { lon: Number(coordinates[0]), lat: Number(coordinates[1]) };
  }
  const points = [];
  collectCoordinates(coordinates, points);
  if (!points.length) return null;
  const sum = points.reduce((acc, point) => ({ lon: acc.lon + point.lon, lat: acc.lat + point.lat }), { lon: 0, lat: 0 });
  return { lon: sum.lon / points.length, lat: sum.lat / points.length };
}

function collectCoordinates(value, out) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    out.push({ lon: value[0], lat: value[1] });
    return;
  }
  for (const child of value) collectCoordinates(child, out);
}

function withDistance(features, target) {
  return flattenGeoJson(features)
    .map(feature => {
      const coordinate = getFeatureCoordinate(feature);
      if (!coordinate) return null;
      return {
        feature,
        coordinate,
        distanceMeters: haversineMeters(target, coordinate)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

function nearestFeature(features, target) {
  return withDistance(features, target)[0] || null;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersects = ((yi > point.lat) !== (yj > point.lat)) &&
      (point.lon < (xj - xi) * (point.lat - yi) / ((yj - yi) || Number.EPSILON) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInPolygon(point, polygonCoordinates) {
  if (!Array.isArray(polygonCoordinates) || !polygonCoordinates.length) return false;
  if (!pointInRing(point, polygonCoordinates[0])) return false;
  for (let i = 1; i < polygonCoordinates.length; i += 1) {
    if (pointInRing(point, polygonCoordinates[i])) return false;
  }
  return true;
}

function pointIntersectsFeature(point, feature) {
  if (!feature || !feature.geometry) return false;
  const { type, coordinates } = feature.geometry;
  if (type === 'Point') {
    const coord = getFeatureCoordinate(feature);
    return coord ? haversineMeters(point, coord) < 1 : false;
  }
  if (type === 'Polygon') return pointInPolygon(point, coordinates);
  if (type === 'MultiPolygon') return coordinates.some(polygon => pointInPolygon(point, polygon));
  return false;
}

function featuresContainingPoint(features, point) {
  return flattenGeoJson(features).filter(feature => pointIntersectsFeature(point, feature));
}

module.exports = {
  EARTH_RADIUS_M,
  lonLatToTile,
  tileRangeAround,
  haversineMeters,
  flattenGeoJson,
  getFeatureCoordinate,
  withDistance,
  nearestFeature,
  pointIntersectsFeature,
  featuresContainingPoint
};
