'use strict';

function toNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  const cleaned = String(value)
    .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/,/g, '')
    .replace(/\s/g, '')
    .replace(/[()（）]/g, '');
  const match = cleaned.match(/-?\d+(\.\d+)?/);
  if (!match) return fallback;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJapaneseAmountToYen(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = String(value).replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  const n = toNumber(raw);
  if (n === null) return null;
  if (raw.includes('億')) return n * 100000000;
  if (raw.includes('万円')) return n * 10000;
  if (raw.includes('千円')) return n * 1000;
  return n;
}

function parseAreaSqm(value) {
  return toNumber(value);
}

function safeDivide(numerator, denominator, fallback = null) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) return fallback;
  return numerator / denominator;
}

function median(values) {
  const nums = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
}

function pickFirstProp(properties, names) {
  if (!properties) return undefined;
  for (const name of names) {
    if (properties[name] !== undefined && properties[name] !== null && properties[name] !== '') return properties[name];
  }
  return undefined;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const m = 10 ** digits;
  return Math.round((value + Number.EPSILON) * m) / m;
}

module.exports = {
  toNumber,
  parseJapaneseAmountToYen,
  parseAreaSqm,
  safeDivide,
  median,
  pickFirstProp,
  round
};
