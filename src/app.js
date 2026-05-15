const form = document.getElementById('analyzer-form');
const rankEl = document.getElementById('rank');
const scoreEl = document.getElementById('score');
const metricsEl = document.getElementById('metrics');
const axisListEl = document.getElementById('axis-list');
const flagsEl = document.getElementById('flags');
const titleEl = document.getElementById('property-title');
const shareUrlEl = document.getElementById('share-url');

function formatManYen(yen) {
  return `${Math.round(yen / 10000).toLocaleString('ja-JP')}万円`;
}

function formatYen(yen) {
  return `${Math.round(yen).toLocaleString('ja-JP')}円`;
}

function pct(value, digits = 1) {
  if (!Number.isFinite(value)) return '-';
  return `${value.toFixed(digits)}%`;
}

function ratio(value, digits = 2) {
  if (!Number.isFinite(value)) return '-';
  return value.toFixed(digits);
}

function getFormData() {
  return Object.fromEntries(new FormData(form).entries());
}

function populateFromUrl() {
  const params = new URLSearchParams(location.search);
  for (const [key, value] of params.entries()) {
    const field = form.elements[key];
    if (field) field.value = value;
  }
}

function setRankClass(rank) {
  rankEl.className = `rank rank-${rank.toLowerCase()}`;
}

function render(result) {
  const { input, metrics } = result;
  titleEl.textContent = `${input.name} の判定結果`;
  rankEl.textContent = result.rank;
  scoreEl.textContent = `${result.totalScore} / 30`;
  setRankClass(result.rank);

  const metricRows = [
    ['物件価格', formatManYen(input.priceYen)],
    ['月額賃料', `${input.rentMan.toFixed(1)}万円`],
    ['表面利回り', pct(metrics.grossYield)],
    ['推定NOI', formatManYen(metrics.noi)],
    ['年間返済額', formatManYen(metrics.annualDebtService)],
    ['DSCR', ratio(metrics.dscr)],
    ['月間CF', formatYen(metrics.monthlyCashFlow)],
    ['CCR', pct(metrics.ccr)],
    ['LTV', pct(metrics.ltv)],
    ['損益分岐稼働率', pct(metrics.breakEvenOccupancy)],
    ['家賃下落耐性', pct(metrics.rentDropTolerance)],
    ['残存法定耐用年数', `${metrics.remainingLegalLife}年`],
    ['期待利回り', pct(result.targetGrossYield)]
  ];

  metricsEl.innerHTML = metricRows.map(([label, value]) => `
    <div class="metric">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `).join('');

  axisListEl.innerHTML = result.axis.map(axis => `
    <div class="axis">
      <div class="axis-head">
        <span>${axis.label}</span>
        <strong>${axis.score} / 5</strong>
      </div>
      <div class="bar"><span style="width:${axis.score / 5 * 100}%"></span></div>
    </div>
  `).join('');

  flagsEl.innerHTML = result.flags.length
    ? result.flags.map(flag => `<li class="${flag.level}">${flag.message}</li>`).join('')
    : '<li class="ok">重大な警告はありません。修繕履歴、賃貸需要、土地値、法的制限を次に確認してください。</li>';

  const params = new URLSearchParams(getFormData());
  shareUrlEl.textContent = `${location.origin}${location.pathname}?${params.toString()}`;
}

function analyzeAndRender(event) {
  if (event) event.preventDefault();
  const result = window.RealEstateAnalyzer.analyze(getFormData());
  render(result);
}

populateFromUrl();
form.addEventListener('submit', analyzeAndRender);
form.addEventListener('input', analyzeAndRender);
analyzeAndRender();
