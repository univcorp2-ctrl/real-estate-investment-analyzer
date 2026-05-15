'use strict';

const { REINFO_BASE_URL } = require('./sources');
const { tileRangeAround, flattenGeoJson } = require('./geo');

class ReinfoClient {
  constructor(options = {}) {
    this.apiKey = options.apiKey || process.env.MLIT_REINFO_API_KEY || '';
    this.baseUrl = options.baseUrl || REINFO_BASE_URL;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
    this.defaultDelayMs = options.defaultDelayMs ?? 250;
  }

  urlFor(apiId, params = {}) {
    const url = new URL(`${this.baseUrl}/${apiId}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async fetchGeoJson(apiId, params = {}) {
    if (!this.apiKey) {
      throw new Error('MLIT_REINFO_API_KEY is required to call 不動産情報ライブラリAPI.');
    }
    if (!this.fetchImpl) {
      throw new Error('fetch is not available. Use Node.js 20+ or pass fetchImpl.');
    }

    const url = this.urlFor(apiId, { response_format: 'geojson', ...params });
    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': this.apiKey,
        'Accept': 'application/json, application/geo+json;q=0.9, */*;q=0.8'
      }
    });

    if (!response.ok) {
      const body = await safeText(response);
      throw new Error(`Reinfo API ${apiId} failed: HTTP ${response.status} ${response.statusText} ${body.slice(0, 200)}`);
    }

    const text = await safeText(response);
    if (!text || text.trim() === '' || text.trim() === '""') {
      return { type: 'FeatureCollection', features: [] };
    }

    const data = JSON.parse(text);
    if (data === '') return { type: 'FeatureCollection', features: [] };
    if (data.type === 'FeatureCollection') return data;
    if (Array.isArray(data)) return { type: 'FeatureCollection', features: flattenGeoJson(data) };
    return data;
  }

  async fetchTileSet(apiId, options = {}) {
    const {
      lon,
      lat,
      z = 14,
      tileRadius = 0,
      params = {},
      delayMs = this.defaultDelayMs
    } = options;
    const tiles = tileRangeAround(lon, lat, z, tileRadius);
    const features = [];
    const errors = [];

    for (const tile of tiles) {
      try {
        const data = await this.fetchGeoJson(apiId, { ...params, z: tile.z, x: tile.x, y: tile.y });
        features.push(...flattenGeoJson(data));
      } catch (error) {
        errors.push({ apiId, tile, message: error.message });
      }
      if (delayMs > 0) await sleep(delayMs);
    }

    return {
      type: 'FeatureCollection',
      features,
      meta: { apiId, tiles, errors }
    };
  }
}

async function safeText(response) {
  try {
    return await response.text();
  } catch (_) {
    return '';
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  ReinfoClient
};
