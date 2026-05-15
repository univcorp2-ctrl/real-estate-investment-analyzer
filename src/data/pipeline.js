'use strict';

const analyzer = require('../analysisLogic');
const { ReinfoClient } = require('./reinfoClient');
const { PUBLIC_SOURCES } = require('./sources');
const { extractOfficialLandPricePoints, extractTransactionComparables, extractPointRisks, extractNearestStationRidership } = require('./extractors');
const { estimateFairValue, calculateLandValue } = require('./landValuation');

async function buildInvestmentDataSet(property, options = {}) {
  const target = normalizeTarget(property);
  const analysis = analyzer.analyze(property);
  const purchasePriceYen = analysis.input.priceYen;
  const data = {
    fetchedAt: new Date().toISOString(),
    input: property,
    normalizedTarget: target,
    cashFlowAnalysis: analysis,
    external: {},
    derived: {},
    dataQuality: {
      score: 0,
      missing: [],
      warnings: [],
      sourceErrors: []
    }
  };

  validateMinimumInputs(property, data.dataQuality);

  const client = options.client || new ReinfoClient(options.reinfo || {});
  const shouldFetchExternal = options.useExternalApis !== false && client.apiKey && target.lat !== null && target.lon !== null;

  if (!shouldFetchExternal) {
    data.dataQuality.warnings.push('外部API取得をスキップしました。MLIT_REINFO_API_KEY と lat/lon がある場合のみ自動取得します。');
  } else {
    await fetchExternalData(data, client, target, options);
  }

  const officialLandPrices = extractOfficialLandPricePoints(data.external.landPricePoints || [], target);
  const nearestOfficialLandPrice = officialLandPrices[0] || null;
  const transactions = extractTransactionComparables(data.external.transactions || [], target, {
    maxDistanceMeters: options.maxComparableDistanceMeters ?? 3000
  });
  const nearestStation = extractNearestStationRidership(data.external.stationRidership || [], target);
  const risks = extractPointRisks({
    flood: data.external.flood || [],
    landslide: data.external.landslide || [],
    tsunami: data.external.tsunami || [],
    dangerousArea: data.external.dangerousArea || [],
    largeEmbankment: data.external.largeEmbankment || []
  }, target);

  const officialLandPriceYenPerSqm = nearestOfficialLandPrice?.priceYenPerSqm || property.officialLandPriceYenPerSqm;
  const landValue = calculateLandValue({
    purchasePriceYen,
    landAreaSqm: Number(property.landAreaSqm || 0),
    routeValueYenPerSqm: optionalNumber(property.routeValueYenPerSqm),
    fixedAssetTaxValueYen: optionalNumber(property.fixedAssetTaxValueYen),
    valuationMultiplier: optionalNumber(property.valuationMultiplier),
    officialLandPriceYenPerSqm,
    officialToInheritanceFactor: property.officialToInheritanceFactor,
    landCorrectionRate: property.landCorrectionRate
  });

  const capRatePct = optionalNumber(property.capRatePct) || inferCapRatePct(property, transactions.summary.medianUnitPriceYenPerSqm);
  const fairValue = estimateFairValue({
    purchasePriceYen,
    noiYen: analysis.metrics.noi,
    capRatePct,
    comparableUnitPricesYenPerSqm: transactions.rows.map(row => row.unitPriceYenPerSqm),
    targetAreaSqm: optionalNumber(property.buildingAreaSqm) || optionalNumber(property.landAreaSqm),
    buildingAreaSqm: optionalNumber(property.buildingAreaSqm),
    landAreaSqm: optionalNumber(property.landAreaSqm),
    routeValueYenPerSqm: optionalNumber(property.routeValueYenPerSqm),
    fixedAssetTaxValueYen: optionalNumber(property.fixedAssetTaxValueYen),
    valuationMultiplier: optionalNumber(property.valuationMultiplier),
    officialLandPriceYenPerSqm,
    officialToInheritanceFactor: property.officialToInheritanceFactor,
    landCorrectionRate: property.landCorrectionRate,
    structure: property.str || property.structure,
    age: property.age,
    propertyType: property.propertyType
  });

  data.derived = {
    nearestOfficialLandPrice,
    transactionComparables: transactions,
    nearestStation,
    risks,
    landValue,
    fairValue,
    capRatePct
  };

  scoreDataQuality(data);
  return data;
}

async function fetchExternalData(data, client, target, options) {
  const year = options.year || new Date().getFullYear();
  const from = options.fromQuarter || `${Math.max(2021, year - 2)}1`;
  const to = options.toQuarter || `${year}4`;
  const z = options.z || 14;
  const tileRadius = options.tileRadius ?? 0;

  const calls = [
    ['transactions', 'transactions', { from, to, priceClassification: options.priceClassification, landTypeCode: options.landTypeCode }],
    ['landPricePoints', 'landPricePoints', { year, priceClassification: options.landPriceClassification, useCategoryCode: options.useCategoryCode }],
    ['zoning', 'zoning', {}],
    ['futurePopulation250m', 'futurePopulation250m', {}],
    ['stationRidership', 'stationRidership', {}],
    ['flood', 'flood', {}],
    ['landslide', 'landslide', {}],
    ['tsunami', 'tsunami', {}],
    ['dangerousArea', 'dangerousArea', {}],
    ['largeEmbankment', 'largeEmbankment', {}],
    ['did', 'did', {}]
  ];

  for (const [outputKey, sourceKey, params] of calls) {
    const source = PUBLIC_SOURCES.reinfo.endpoints[sourceKey];
    try {
      data.external[outputKey] = await client.fetchTileSet(source.id, {
        lon: target.lon,
        lat: target.lat,
        z,
        tileRadius,
        params
      });
      const errors = data.external[outputKey].meta?.errors || [];
      data.dataQuality.sourceErrors.push(...errors);
    } catch (error) {
      data.external[outputKey] = { type: 'FeatureCollection', features: [] };
      data.dataQuality.sourceErrors.push({ source: source.id, message: error.message });
    }
  }
}

function normalizeTarget(property) {
  return {
    lat: optionalNumber(property.lat),
    lon: optionalNumber(property.lon),
    address: property.address || ''
  };
}

function validateMinimumInputs(property, quality) {
  for (const key of ['price', 'str', 'age', 'loanAmt', 'ir', 'ly']) {
    if (property[key] === undefined || property[key] === null || property[key] === '') quality.missing.push(key);
  }
  if (!property.rent && !property.br) quality.missing.push('rent or br');
  if (!property.lat || !property.lon) quality.missing.push('lat/lon');
  if (!property.landAreaSqm) quality.missing.push('landAreaSqm');
  if (!property.address) quality.warnings.push('住所が未入力です。路線価・登記・ハザードとの突合精度が落ちます。');
}

function scoreDataQuality(data) {
  let score = 100;
  score -= data.dataQuality.missing.length * 8;
  score -= data.dataQuality.warnings.length * 5;
  score -= Math.min(30, data.dataQuality.sourceErrors.length * 3);
  if (data.derived.nearestOfficialLandPrice) score += 5;
  if (data.derived.transactionComparables?.summary?.count > 0) score += 5;
  if (data.derived.landValue?.landValueYen) score += 5;
  data.dataQuality.score = Math.max(0, Math.min(100, Math.round(score)));
}

function inferCapRatePct(property, comparableMedianUnitPrice) {
  if (property.capRatePct) return Number(property.capRatePct);
  const structure = String(property.str || property.structure || '');
  const age = Number(property.age || 0);
  let base = 8.5;
  if (structure.includes('RC') || structure.includes('SRC')) base = age <= 20 ? 6.5 : 7.5;
  else if (structure.includes('木')) base = age <= 20 ? 8.0 : 9.5;
  if (comparableMedianUnitPrice && comparableMedianUnitPrice > 1000000) base -= 0.5;
  return base;
}

function optionalNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

module.exports = {
  buildInvestmentDataSet,
  normalizeTarget,
  inferCapRatePct
};
