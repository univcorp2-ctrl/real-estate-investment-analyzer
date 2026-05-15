/*
 * Real estate investment scoring logic.
 * This is an independently recreated model based on public behavior inference.
 */
(function attach(global) {
  const RANK_ORDER = ['E', 'D', 'C', 'B', 'A', 'S'];

  const STRUCTURE_LIFE = {
    'SRC': 47,
    '鉄骨鉄筋コンクリート': 47,
    'RC': 47,
    '鉄筋コンクリート': 47,
    'S': 34,
    '鉄骨': 34,
    '重量鉄骨': 34,
    '軽量鉄骨': 27,
    '木造': 22,
    'W': 22,
    'wood': 22,
    'Wood': 22
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function num(value, fallback = 0) {
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function round(value, digits = 2) {
    const m = 10 ** digits;
    return Math.round((value + Number.EPSILON) * m) / m;
  }

  function yenFromMan(value) {
    return num(value) * 10000;
  }

  function getLegalLife(structure) {
    if (!structure) return 30;
    const normalized = String(structure).trim();
    return STRUCTURE_LIFE[normalized] || STRUCTURE_LIFE[normalized.toUpperCase()] || 30;
  }

  function monthlyPayment(principalYen, annualRatePct, years) {
    if (principalYen <= 0 || years <= 0) return 0;
    const months = years * 12;
    const monthlyRate = annualRatePct / 100 / 12;
    if (monthlyRate === 0) return principalYen / months;
    const factor = (1 + monthlyRate) ** months;
    return principalYen * monthlyRate * factor / (factor - 1);
  }

  function deriveInput(raw = {}) {
    const priceMan = num(raw.price);
    const loanAmtMan = num(raw.loanAmt, priceMan);
    const rentManRaw = num(raw.rent);
    const brSenYen = num(raw.br);
    // In the observed URL, rent=0 and br=58. 58 is most naturally read as 58,000 yen/month = 5.8万円/month.
    const rentMan = rentManRaw > 0 ? rentManRaw : (brSenYen > 0 ? brSenYen / 10 : 0);

    return {
      name: raw.name || '無題の物件',
      priceMan,
      priceYen: yenFromMan(priceMan),
      rentMan,
      monthlyRentYen: yenFromMan(rentMan),
      structure: raw.str || raw.structure || 'RC',
      age: num(raw.age),
      loanAmtMan,
      loanYen: yenFromMan(loanAmtMan),
      interestRatePct: num(raw.ir, 2),
      loanYears: num(raw.ly, 30),
      opexRatio: num(raw.opexRatio, 25) / 100,
      vacancyRatio: num(raw.vacancyRatio, 5) / 100,
      purchaseCostRatio: num(raw.purchaseCostRatio, 7) / 100,
      landCoverRate: raw.landCoverRate === '' || raw.landCoverRate === undefined ? null : num(raw.landCoverRate),
      stationWalk: raw.stationWalk === '' || raw.stationWalk === undefined ? null : num(raw.stationWalk),
      populationTrend: raw.populationTrend || '',
      liquidity: raw.liquidity || '',
      brSenYen
    };
  }

  function calculateMetrics(input) {
    const legalLife = getLegalLife(input.structure);
    const remainingLegalLife = legalLife - input.age;
    const annualGrossRent = input.monthlyRentYen * 12;
    const effectiveRent = annualGrossRent * (1 - input.vacancyRatio);
    const annualOperatingExpense = annualGrossRent * input.opexRatio;
    const repairReserve = input.priceYen * 0.005;
    const noi = effectiveRent - annualOperatingExpense - repairReserve;
    const monthlyDebtService = monthlyPayment(input.loanYen, input.interestRatePct, input.loanYears);
    const annualDebtService = monthlyDebtService * 12;
    const annualCashFlow = noi - annualDebtService;
    const monthlyCashFlow = annualCashFlow / 12;
    const grossYield = input.priceYen > 0 ? annualGrossRent / input.priceYen * 100 : 0;
    const netYield = input.priceYen > 0 ? noi / input.priceYen * 100 : 0;
    const dscr = annualDebtService > 0 ? noi / annualDebtService : Infinity;
    const ltv = input.priceYen > 0 ? input.loanYen / input.priceYen * 100 : 0;
    const cashInvested = Math.max(input.priceYen - input.loanYen, 0) + input.priceYen * input.purchaseCostRatio;
    const ccr = cashInvested > 0 ? annualCashFlow / cashInvested * 100 : 0;
    const breakEvenOccupancy = annualGrossRent > 0
      ? (annualDebtService + annualOperatingExpense + repairReserve) / annualGrossRent * 100
      : Infinity;
    const rentDropTolerance = Number.isFinite(breakEvenOccupancy) ? 100 - breakEvenOccupancy : -Infinity;

    return {
      legalLife,
      remainingLegalLife,
      annualGrossRent,
      effectiveRent,
      annualOperatingExpense,
      repairReserve,
      noi,
      monthlyDebtService,
      annualDebtService,
      annualCashFlow,
      monthlyCashFlow,
      grossYield,
      netYield,
      dscr,
      ltv,
      cashInvested,
      ccr,
      breakEvenOccupancy,
      rentDropTolerance
    };
  }

  function profitabilityScore(input, metrics) {
    let score = 0;
    if (metrics.grossYield >= 12) score = 5;
    else if (metrics.grossYield >= 10) score = 4;
    else if (metrics.grossYield >= 8) score = 3;
    else if (metrics.grossYield >= 6) score = 2;
    else if (metrics.grossYield >= 4) score = 1;

    if (metrics.monthlyCashFlow < 0) score -= 1;
    if (metrics.dscr < 1) score -= 1;
    return clamp(score, 0, 5);
  }

  function locationScore(input) {
    if (input.stationWalk === null && !input.populationTrend && !input.liquidity) return 3;
    let score = 0;
    if (input.stationWalk !== null) {
      if (input.stationWalk <= 5) score += 2;
      else if (input.stationWalk <= 10) score += 1.5;
      else if (input.stationWalk <= 15) score += 1;
      else if (input.stationWalk <= 20) score += 0.5;
    } else {
      score += 1;
    }

    if (input.populationTrend === 'growing') score += 2;
    else if (input.populationTrend === 'flat') score += 1;

    if (input.liquidity === 'high') score += 1;
    else if (!input.liquidity) score += 1;

    return clamp(score, 0, 5);
  }

  function financeScore(input, metrics) {
    let score = 0;
    if (metrics.dscr >= 1.5) score = 5;
    else if (metrics.dscr >= 1.3) score = 4;
    else if (metrics.dscr >= 1.15) score = 3;
    else if (metrics.dscr >= 1.0) score = 2;
    else if (metrics.dscr >= 0.9) score = 1;

    if (metrics.ltv > 100) score -= 1;
    if (input.interestRatePct >= 4) score -= 1;
    else if (input.interestRatePct >= 3) score -= 0.5;
    if (input.loanYears > metrics.remainingLegalLife + 15) score -= 0.5;
    return clamp(score, 0, 5);
  }

  function riskScore(metrics) {
    const be = metrics.breakEvenOccupancy;
    if (!Number.isFinite(be)) return 0;
    if (be <= 70) return 5;
    if (be <= 80) return 4;
    if (be <= 90) return 3;
    if (be <= 100) return 2;
    if (be <= 110) return 1;
    return 0;
  }

  function targetGrossYield(input) {
    const s = String(input.structure || '').toUpperCase();
    const isRc = s.includes('RC') || String(input.structure).includes('鉄筋');
    const isWood = String(input.structure).includes('木') || s === 'W' || s.includes('WOOD');
    if (isRc) return input.age <= 20 ? 7.0 : 8.5;
    if (isWood) return input.age <= 20 ? 9.5 : 11.0;
    return 8.5;
  }

  function valueScore(input, metrics) {
    const target = targetGrossYield(input);
    const ratio = target > 0 ? metrics.grossYield / target : 0;
    if (ratio >= 1.3) return 5;
    if (ratio >= 1.15) return 4;
    if (ratio >= 1.0) return 3;
    if (ratio >= 0.85) return 2;
    if (ratio >= 0.7) return 1;
    return 0;
  }

  function exitScore(input, metrics) {
    if (input.landCoverRate !== null) {
      if (input.landCoverRate >= 100) return 5;
      if (input.landCoverRate >= 80) return 4;
      if (input.landCoverRate >= 60) return 3;
      if (input.landCoverRate >= 40) return 2;
      if (input.landCoverRate >= 20) return 1;
      return 0;
    }

    const s = String(input.structure || '').toUpperCase();
    const isRc = s.includes('RC') || String(input.structure).includes('鉄筋');
    const isWood = String(input.structure).includes('木') || s === 'W' || s.includes('WOOD');
    if (isRc && metrics.remainingLegalLife >= 20) return 4;
    if (isRc && metrics.remainingLegalLife >= 10) return 3;
    if (isWood && input.age <= 10) return 3;
    if (metrics.remainingLegalLife >= 0) return 2;
    if (isWood && metrics.monthlyCashFlow < 0) return 0;
    return 1;
  }

  function baseRank(totalScore) {
    if (totalScore >= 22) return 'S';
    if (totalScore >= 20) return 'A';
    if (totalScore >= 15) return 'B';
    if (totalScore >= 12) return 'C';
    if (totalScore >= 8) return 'D';
    return 'E';
  }

  function maxRank(rank, maxAllowed) {
    return RANK_ORDER.indexOf(rank) > RANK_ORDER.indexOf(maxAllowed) ? maxAllowed : rank;
  }

  function detectFlags(input, metrics) {
    const flags = [];
    if (input.monthlyRentYen <= 0) flags.push({ level: 'fatal', message: '賃料が未入力または推定不能です。収益判定の信頼度が低いです。', rankCap: 'C' });
    if (metrics.dscr < 1.0) flags.push({ level: 'fatal', message: 'DSCRが1.0未満です。物件収入だけでは返済を賄えません。', rankCap: 'D' });
    if (metrics.monthlyCashFlow < 0) flags.push({ level: 'fatal', message: '月間キャッシュフローがマイナスです。', rankCap: 'D' });
    if (metrics.grossYield < 5) flags.push({ level: 'warning', message: '表面利回りが5%未満です。価格妥当性の追加検証が必要です。', rankCap: 'C' });
    if (metrics.breakEvenOccupancy > 100) flags.push({ level: 'warning', message: '損益分岐稼働率が100%を超えています。空室・家賃下落に弱いです。', rankCap: 'D' });
    if (input.landCoverRate !== null && input.landCoverRate < 40 && metrics.remainingLegalLife < 0) {
      flags.push({ level: 'warning', message: '土地値カバー率が低く、建物も法定耐用年数を超過しています。出口リスクが高いです。', rankCap: 'D' });
    }
    if (metrics.ltv > 100) flags.push({ level: 'warning', message: 'LTVが100%を超えています。過剰融資前提の可能性があります。', rankCap: 'A' });
    if (input.loanYears > metrics.remainingLegalLife + 15) flags.push({ level: 'warning', message: '返済期間が残存法定耐用年数を大きく超えています。融資・出口の整合性確認が必要です。', rankCap: 'A' });
    return flags;
  }

  function applyRankGates(rank, flags) {
    let gated = rank;
    for (const flag of flags) {
      gated = maxRank(gated, flag.rankCap);
    }
    if (rank === 'S' && flags.length > 0) gated = maxRank(gated, 'A');
    return gated;
  }

  function analyze(raw = {}) {
    const input = deriveInput(raw);
    const metrics = calculateMetrics(input);
    const axis = [
      { key: 'profitability', label: '収益性', score: profitabilityScore(input, metrics) },
      { key: 'location', label: '立地', score: locationScore(input, metrics) },
      { key: 'finance', label: '融資条件', score: financeScore(input, metrics) },
      { key: 'risk', label: 'リスク耐性', score: riskScore(metrics) },
      { key: 'value', label: '価格妥当性', score: valueScore(input, metrics) },
      { key: 'exit', label: '出口戦略', score: exitScore(input, metrics) }
    ].map(item => ({ ...item, score: round(item.score, 1) }));

    const totalScore = Math.round(axis.reduce((sum, item) => sum + item.score, 0));
    const preliminaryRank = baseRank(totalScore);
    const flags = detectFlags(input, metrics);
    const rank = applyRankGates(preliminaryRank, flags);

    return {
      input,
      metrics,
      axis,
      totalScore,
      preliminaryRank,
      rank,
      flags,
      targetGrossYield: targetGrossYield(input)
    };
  }

  const api = {
    analyze,
    deriveInput,
    calculateMetrics,
    monthlyPayment,
    getLegalLife,
    targetGrossYield,
    baseRank
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.RealEstateAnalyzer = api;
})(typeof window !== 'undefined' ? window : globalThis);
