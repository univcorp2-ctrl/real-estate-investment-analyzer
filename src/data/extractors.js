'use strict';

const { flattenGeoJson, withDistance, featuresContainingPoint } = require('./geo');
const { parseJapaneseAmountToYen, parseAreaSqm, pickFirstProp, safeDivide, median, toNumber } = require('./normalize');

function extractOfficialLandPricePoints(features, target) {
  return withDistance(features, target)
    .map(({ feature, coordinate, distanceMeters }) => {
      const p = feature.properties || {};
      const price = parseJapaneseAmountToYen(pickFirstProp(p, [
        'u_current_years_price_ja',
        'current_years_price',
        'current_year_price',
        'price_per_square_meter',
        'land_price'
      ]));
      if (!price) return null;
      return {
        source: 'XPT002',
        priceYenPerSqm: price,
        distanceMeters,
        coordinate,
        useCategory: pickFirstProp(p, ['use_category_name_ja', 'use_category_name', 'useCategory']),
        location: pickFirstProp(p, ['location', 'location_number_ja', 'place_name_ja', 'residence_display_name_ja']),
        nearestStation: pickFirstProp(p, ['nearest_station_name_ja']),
        roadDistanceToStation: pickFirstProp(p, ['u_road_distance_to_nearest_station_name_ja']),
        raw: p
      };
    })
    .filter(Boolean);
}

function extractTransactionComparables(features, target, options = {}) {
  const maxDistanceMeters = options.maxDistanceMeters ?? 3000;
  const rows = withDistance(features, target)
    .filter(row => row.distanceMeters <= maxDistanceMeters)
    .map(({ feature, coordinate, distanceMeters }) => {
      const p = feature.properties || {};
      const totalPrice = parseJapaneseAmountToYen(pickFirstProp(p, [
        'u_transaction_price_total_ja',
        'transaction_price_total',
        'transaction_price',
        'price'
      ]));
      const areaSqm = parseAreaSqm(pickFirstProp(p, ['u_area_ja', 'area', 'area_ja']));
      const explicitUnit = parseJapaneseAmountToYen(pickFirstProp(p, [
        'u_transaction_price_unit_price_square_meter_ja',
        'transaction_price_unit_price_square_meter',
        'unit_price_per_square_meter'
      ]));
      const unitPrice = explicitUnit || safeDivide(totalPrice, areaSqm);
      if (!totalPrice && !unitPrice) return null;
      return {
        source: 'XPT001',
        totalPriceYen: totalPrice,
        areaSqm,
        unitPriceYenPerSqm: unitPrice,
        distanceMeters,
        coordinate,
        type: pickFirstProp(p, ['land_type_name_ja', 'land_type_name']),
        structure: pickFirstProp(p, ['building_structure_name_ja']),
        constructionYear: toNumber(pickFirstProp(p, ['u_construction_year_ja', 'construction_year'])),
        district: pickFirstProp(p, ['district_name_ja', 'city_name_ja']),
        transactionTime: pickFirstProp(p, ['point_in_time_name_ja']),
        raw: p
      };
    })
    .filter(Boolean);

  const medianUnitPrice = median(rows.map(row => row.unitPriceYenPerSqm));
  return {
    rows,
    summary: {
      count: rows.length,
      medianUnitPriceYenPerSqm: medianUnitPrice
    }
  };
}

function extractPointRisks(featureCollections, target) {
  const risks = [];
  for (const [key, collection] of Object.entries(featureCollections)) {
    const hits = featuresContainingPoint(flattenGeoJson(collection), target);
    if (hits.length > 0) {
      risks.push({
        key,
        hitCount: hits.length,
        samples: hits.slice(0, 3).map(feature => feature.properties || {})
      });
    }
  }
  return risks;
}

function extractNearestStationRidership(features, target) {
  const rows = withDistance(features, target).map(({ feature, coordinate, distanceMeters }) => {
    const p = feature.properties || {};
    const ridership = toNumber(pickFirstProp(p, [
      'passengers_ja',
      'passenger_count',
      'u_passengers_ja',
      'S12_053',
      'station_ridership'
    ]));
    return {
      source: 'XKT015',
      distanceMeters,
      coordinate,
      stationName: pickFirstProp(p, ['station_name_ja', 'station_name', 'S12_001']),
      ridership,
      raw: p
    };
  });
  return rows[0] || null;
}

module.exports = {
  extractOfficialLandPricePoints,
  extractTransactionComparables,
  extractPointRisks,
  extractNearestStationRidership
};
