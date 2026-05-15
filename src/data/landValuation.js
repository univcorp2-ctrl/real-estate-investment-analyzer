'use strict';

const { median, round } = require('./normalize');

function calculateLandValue(input = {}) {
  const purchasePriceYen = Number(input.purchasePriceYen || 0);
  const landAreaSqm = Number(input.landAreaSqm || 0);
  const correctionRate = Number(input.landCorrectionRate ?? 1.0);

  let landValueYen = null;
  let method = null;
  let confidence = 'low';
  const notes = [];

  if (Number.isFinite(input.routeValueYenPerSqm) && input.routeValueYenPerSqm > 0 && landAreaSqm > 0) {
    landValueYen = input.routeValueYenPerSqm * landAreaSqm * correctionRate;
    method = 'route_value';
    confidence = input.landCorrectionRate ? 'medium' : 'medium-low';
    notes.push('国税庁路線価または路線価CSV/商用APIから取得した1㎡単価を使用。補正率が未指定なら1.0。');
  } else if (Number.isFinite(input.fixedAssetTaxValueYen) && input.fixedAssetTaxValueYen > 0 && Number.isFinite(input.valuationMultiplier) && input.valuationMultiplier > 0) {
    landValueYen = input.fixedAssetTaxValueYen * input.valuationMultiplier;
    method = 'fixed_asset_tax_multiplier';
    confidence = 'medium';
    notes.push('倍率地域用。固定資産税評価額に評価倍率を乗じた。');
  } else if (Number.isFinite(input.officialLandPriceYenPerSqm) && input.officialLandPriceYenPerSqm > 0 && landAreaSqm > 0) {
    const officialToInheritanceFactor = Number(input.officialToInheritanceFactor ?? 0.8);
    landValueYen = input.officialLandPriceYenPerSqm * landAreaSqm * officialToInheritanceFactor * correctionRate;
    method = 'official_land_price_proxy';
    confidence = 'low';
    notes.push('地価公示・地価調査からの代替推定。路線価そのものではないため、土地値カバー率は参考値。');
  } else {
    notes.push('土地値算出に必要な routeValueYenPerSqm、または fixedAssetTaxValueYen + valuationMultiplier、または officialLandPriceYenPerSqm + landAreaSqm が不足。');
  }

  const landCoverRate = landValueYen && purchasePriceYen > 0 ? landValueYen / purchasePriceYen * 100 : null;

  return {
    method,
    confidence,
    landValueYen: landValueYen ? Math.round(landValueYen) : null,
    landCoverRatePct: landCoverRate === null ? null : round(landCoverRate, 1),
    notes
  };
}

function estimateBuildingResidualValue(input = {}) {
  const structure = String(input.structure || input.str || '木造').toUpperCase();
  const buildingAreaSqm = Number(input.buildingAreaSqm || 0);
  const age = Number(input.age || 0);
  const minimumResidualRate = Number(input.minimumResidualRate ?? 0.05);
  const unitCost = Number(input.replacementCostYenPerSqm || defaultReplacementCost(structure));
  const legalLife = Number(input.legalLifeYears || defaultLegalLife(structure));

  if (!buildingAreaSqm || !unitCost || !legalLife) {
    return {
      buildingResidualValueYen: null,
      residualRate: null,
      method: 'missing_building_inputs'
    };
  }

  const residualRate = Math.max((legalLife - age) / legalLife, minimumResidualRate);
  return {
    buildingResidualValueYen: Math.round(buildingAreaSqm * unitCost * residualRate),
    residualRate: round(residualRate * 100, 1),
    method: 'replacement_cost_depreciated',
    unitCostYenPerSqm: unitCost,
    legalLifeYears: legalLife
  };
}

function defaultLegalLife(structure) {
  if (structure.includes('SRC') || structure.includes('RC') || structure.includes('鉄筋')) return 47;
  if (structure.includes('S') || structure.includes('鉄骨')) return 34;
  return 22;
}

function defaultReplacementCost(structure) {
  if (structure.includes('SRC') || structure.includes('RC') || structure.includes('鉄筋')) return 230000;
  if (structure.includes('S') || structure.includes('鉄骨')) return 190000;
  return 160000;
}

function estimateFairValue(input = {}) {
  const purchasePriceYen = Number(input.purchasePriceYen || 0);
  const noiYen = Number(input.noiYen || 0);
  const capRate = Number(input.capRatePct || 0) / 100;
  const comparableUnitPrices = Array.isArray(input.comparableUnitPricesYenPerSqm) ? input.comparableUnitPricesYenPerSqm : [];
  const targetAreaSqm = Number(input.targetAreaSqm || input.buildingAreaSqm || input.landAreaSqm || 0);

  const comparableMedianUnit = median(comparableUnitPrices);
  const comparableValueYen = comparableMedianUnit && targetAreaSqm ? comparableMedianUnit * targetAreaSqm : null;
  const incomeValueYen = noiYen > 0 && capRate > 0 ? noiYen / capRate : null;

  const land = calculateLandValue(input);
  const building = estimateBuildingResidualValue(input);
  const costValueYen = land.landValueYen && building.buildingResidualValueYen
    ? land.landValueYen + building.buildingResidualValueYen
    : null;

  const values = {
    comparable: comparableValueYen,
    income: incomeValueYen,
    cost: costValueYen
  };
  const weights = normalizeWeights(input.weights || defaultWeights(input.propertyType), values);
  const weightedFairValueYen = Object.entries(values).reduce((sum, [key, value]) => {
    if (!Number.isFinite(value)) return sum;
    return sum + value * weights[key];
  }, 0);
  const hasAnyValue = Object.values(values).some(Number.isFinite);
  const priceGapRatio = hasAnyValue && weightedFairValueYen > 0 && purchasePriceYen > 0 ? purchasePriceYen / weightedFairValueYen : null;

  return {
    fairValueYen: hasAnyValue ? Math.round(weightedFairValueYen) : null,
    priceGapRatio: priceGapRatio === null ? null : round(priceGapRatio, 3),
    priceGapPct: priceGapRatio === null ? null : round((priceGapRatio - 1) * 100, 1),
    values: {
      comparableValueYen: comparableValueYen ? Math.round(comparableValueYen) : null,
      incomeValueYen: incomeValueYen ? Math.round(incomeValueYen) : null,
      costValueYen: costValueYen ? Math.round(costValueYen) : null
    },
    weights,
    land,
    building
  };
}

function defaultWeights(propertyType = '') {
  const type = String(propertyType);
  if (type.includes('区分')) return { comparable: 0.5, income: 0.4, cost: 0.1 };
  if (type.includes('戸建')) return { comparable: 0.35, income: 0.35, cost: 0.3 };
  if (type.includes('一棟') || type.includes('アパート') || type.includes('マンション')) return { comparable: 0.3, income: 0.5, cost: 0.2 };
  if (type.includes('古家') || type.includes('土地値')) return { comparable: 0.2, income: 0.2, cost: 0.6 };
  return { comparable: 0.34, income: 0.33, cost: 0.33 };
}

function normalizeWeights(weights, values) {
  const enabled = Object.fromEntries(Object.entries(weights).map(([key, weight]) => [key, Number.isFinite(values[key]) ? Number(weight) || 0 : 0]));
  const sum = Object.values(enabled).reduce((acc, value) => acc + value, 0);
  if (sum <= 0) return { comparable: 0, income: 0, cost: 0 };
  return Object.fromEntries(Object.entries(enabled).map(([key, weight]) => [key, round(weight / sum, 3)]));
}

module.exports = {
  calculateLandValue,
  estimateBuildingResidualValue,
  estimateFairValue,
  defaultLegalLife,
  defaultReplacementCost,
  defaultWeights
};
