const test = require('node:test');
const assert = require('node:assert/strict');
const analyzer = require('../src/analysisLogic');

test('br=58 is interpreted as 5.8万円 monthly rent when rent is zero', () => {
  const input = analyzer.deriveInput({ price: 880, rent: 0, br: 58 });
  assert.equal(input.rentMan, 5.8);
  assert.equal(input.monthlyRentYen, 58000);
});

test('monthly payment handles zero interest', () => {
  const payment = analyzer.monthlyPayment(12_000_000, 0, 10);
  assert.equal(Math.round(payment), 100000);
});

test('sample URL parameters produce core investment metrics', () => {
  const result = analyzer.analyze({
    price: 880,
    str: 'RC',
    age: 0,
    loanAmt: 880,
    rent: 0,
    ir: 2,
    ly: 30,
    br: 58
  });

  assert.equal(result.input.rentMan, 5.8);
  assert.ok(result.metrics.grossYield > 7.8 && result.metrics.grossYield < 8.0);
  assert.ok(result.metrics.dscr > 1.0);
  assert.ok(['S', 'A', 'B', 'C', 'D', 'E'].includes(result.rank));
  assert.equal(result.axis.length, 6);
});

test('negative cash flow caps rank at D or lower', () => {
  const result = analyzer.analyze({
    price: 5000,
    str: '木造',
    age: 30,
    loanAmt: 5000,
    rent: 10,
    ir: 4,
    ly: 20
  });
  const order = ['E', 'D', 'C', 'B', 'A', 'S'];
  assert.ok(order.indexOf(result.rank) <= order.indexOf('D'));
  assert.ok(result.flags.some(flag => flag.message.includes('月間キャッシュフロー')));
});

test('base rank thresholds match requirements', () => {
  assert.equal(analyzer.baseRank(22), 'S');
  assert.equal(analyzer.baseRank(20), 'A');
  assert.equal(analyzer.baseRank(15), 'B');
  assert.equal(analyzer.baseRank(12), 'C');
  assert.equal(analyzer.baseRank(8), 'D');
  assert.equal(analyzer.baseRank(7), 'E');
});
