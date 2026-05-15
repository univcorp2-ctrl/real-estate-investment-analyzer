const test = require('node:test');
const assert = require('node:assert/strict');
const { buildInvestmentDataSet } = require('../src/data/pipeline');

const sampleProperty = {
  name: '東村山市 戸建て サンプル',
  propertyType: '戸建て賃貸',
  address: '東京都東村山市',
  lat: 35.7546,
  lon: 139.4685,
  price: 880,
  str: 'RC',
  age: 0,
  loanAmt: 880,
  rent: 0,
  br: 58,
  ir: 2,
  ly: 30,
  landAreaSqm: 90,
  buildingAreaSqm: 70,
  routeValueYenPerSqm: 120000,
  landCorrectionRate: 1,
  capRatePct: 8
};

test('offline pipeline calculates cash flow, land cover rate, and fair value from manual inputs', async () => {
  const result = await buildInvestmentDataSet(sampleProperty, { useExternalApis: false });

  assert.equal(result.cashFlowAnalysis.input.rentMan, 5.8);
  assert.ok(result.cashFlowAnalysis.metrics.grossYield > 7.8);
  assert.equal(result.derived.landValue.method, 'route_value');
  assert.equal(result.derived.landValue.landValueYen, 10800000);
  assert.equal(result.derived.landValue.landCoverRatePct, 122.7);
  assert.ok(result.derived.fairValue.fairValueYen > 0);
  assert.ok(result.dataQuality.warnings.some(message => message.includes('外部API取得をスキップ')));
});

test('pipeline integrates mocked public data for land price, comparables, station, and hazard risk', async () => {
  const mockClient = {
    apiKey: 'dummy-key',
    async fetchTileSet(apiId) {
      if (apiId === 'XPT002') {
        return featureCollection([
          pointFeature(139.4685, 35.7546, {
            u_current_years_price_ja: '120,000(円/㎡)',
            use_category_name_ja: '住宅地',
            location: '東京都東村山市サンプル'
          })
        ]);
      }
      if (apiId === 'XPT001') {
        return featureCollection([
          pointFeature(139.4684, 35.7545, {
            u_transaction_price_total_ja: '900万円',
            u_area_ja: '90㎡',
            land_type_name_ja: '宅地',
            building_structure_name_ja: 'RC'
          }),
          pointFeature(139.4686, 35.7547, {
            u_transaction_price_total_ja: '1,000万円',
            u_area_ja: '100㎡',
            land_type_name_ja: '宅地',
            building_structure_name_ja: 'RC'
          })
        ]);
      }
      if (apiId === 'XKT015') {
        return featureCollection([
          pointFeature(139.4690, 35.7550, {
            station_name_ja: 'サンプル駅',
            passenger_count: '25000'
          })
        ]);
      }
      if (apiId === 'XKT026') {
        return featureCollection([
          polygonFeature([
            [139.467, 35.753],
            [139.470, 35.753],
            [139.470, 35.756],
            [139.467, 35.756],
            [139.467, 35.753]
          ], { risk: 'flood-sample' })
        ]);
      }
      return featureCollection([]);
    }
  };

  const result = await buildInvestmentDataSet(sampleProperty, {
    client: mockClient,
    year: 2025,
    fromQuarter: '20241',
    toQuarter: '20254',
    tileRadius: 0
  });

  assert.equal(result.derived.nearestOfficialLandPrice.priceYenPerSqm, 120000);
  assert.equal(result.derived.transactionComparables.summary.count, 2);
  assert.equal(result.derived.transactionComparables.summary.medianUnitPriceYenPerSqm, 100000);
  assert.equal(result.derived.nearestStation.stationName, 'サンプル駅');
  assert.ok(result.derived.risks.some(risk => risk.key === 'flood'));
  assert.ok(result.derived.fairValue.fairValueYen > 0);
  assert.ok(result.dataQuality.score > 70);
});

function featureCollection(features) {
  return { type: 'FeatureCollection', features, meta: { errors: [] } };
}

function pointFeature(lon, lat, properties) {
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'Point', coordinates: [lon, lat] }
  };
}

function polygonFeature(ring, properties) {
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'Polygon', coordinates: [ring] }
  };
}
