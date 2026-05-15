const test = require('node:test');
const assert = require('node:assert/strict');
const { lonLatToTile, haversineMeters, featuresContainingPoint } = require('../src/data/geo');
const { parseJapaneseAmountToYen, parseAreaSqm } = require('../src/data/normalize');
const { calculateLandValue, estimateFairValue } = require('../src/data/landValuation');
const { ReinfoClient } = require('../src/data/reinfoClient');

test('lonLatToTile returns valid XYZ tile', () => {
  const tile = lonLatToTile(139.6917, 35.6895, 14);
  assert.equal(tile.z, 14);
  assert.ok(tile.x > 0);
  assert.ok(tile.y > 0);
});

test('haversineMeters calculates rough distance', () => {
  const meters = haversineMeters({ lat: 35.6895, lon: 139.6917 }, { lat: 35.6905, lon: 139.6917 });
  assert.ok(meters > 100 && meters < 120);
});

test('parseJapaneseAmountToYen handles Japanese property price labels', () => {
  assert.equal(parseJapaneseAmountToYen('4,000万円'), 40000000);
  assert.equal(parseJapaneseAmountToYen('3,100,000(円/㎡)'), 3100000);
  assert.equal(parseAreaSqm('90㎡'), 90);
});

test('calculateLandValue supports route value and cover rate', () => {
  const result = calculateLandValue({
    purchasePriceYen: 8800000,
    routeValueYenPerSqm: 120000,
    landAreaSqm: 90,
    landCorrectionRate: 1
  });
  assert.equal(result.method, 'route_value');
  assert.equal(result.landValueYen, 10800000);
  assert.equal(result.landCoverRatePct, 122.7);
});

test('estimateFairValue combines comparable, income and cost values', () => {
  const result = estimateFairValue({
    purchasePriceYen: 10000000,
    noiYen: 800000,
    capRatePct: 8,
    comparableUnitPricesYenPerSqm: [100000, 120000, 140000],
    targetAreaSqm: 90,
    landAreaSqm: 100,
    buildingAreaSqm: 70,
    routeValueYenPerSqm: 80000,
    structure: '木造',
    age: 10,
    propertyType: '戸建て賃貸'
  });
  assert.ok(result.fairValueYen > 0);
  assert.ok(result.priceGapRatio > 0);
  assert.ok(result.values.comparableValueYen > 0);
});

test('ReinfoClient attaches API key header and parses GeoJSON', async () => {
  const client = new ReinfoClient({
    apiKey: 'dummy',
    defaultDelayMs: 0,
    fetchImpl: async (url, options) => {
      assert.ok(String(url).includes('/XPT002?'));
      assert.equal(options.headers['Ocp-Apim-Subscription-Key'], 'dummy');
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        text: async () => JSON.stringify({ type: 'FeatureCollection', features: [] })
      };
    }
  });
  const data = await client.fetchGeoJson('XPT002', { z: 14, x: 1, y: 1, year: 2025 });
  assert.equal(data.type, 'FeatureCollection');
});

test('featuresContainingPoint detects point in polygon', () => {
  const features = [{
    type: 'Feature',
    properties: { name: 'test' },
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [139.0, 35.0], [140.0, 35.0], [140.0, 36.0], [139.0, 36.0], [139.0, 35.0]
      ]]
    }
  }];
  const hits = featuresContainingPoint(features, { lat: 35.5, lon: 139.5 });
  assert.equal(hits.length, 1);
});
