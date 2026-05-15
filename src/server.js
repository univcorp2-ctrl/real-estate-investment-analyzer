'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { URL } = require('node:url');
const { buildInvestmentDataSet } = require('./data/pipeline');

const PORT = Number(process.env.PORT || 8080);
const ROOT = path.resolve(__dirname, '..');
const MAX_BODY_BYTES = 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/healthz') {
      return json(res, 200, { ok: true, service: 'real-estate-investment-analyzer' });
    }

    if (req.method === 'POST' && url.pathname === '/api/analyze') {
      const body = await readJsonBody(req);
      const result = await buildInvestmentDataSet(body, {
        useExternalApis: body.useExternalApis !== false,
        year: body.year,
        fromQuarter: body.fromQuarter,
        toQuarter: body.toQuarter,
        tileRadius: body.tileRadius ?? 0,
        z: body.z ?? 14,
        landTypeCode: body.landTypeCode,
        maxComparableDistanceMeters: body.maxComparableDistanceMeters
      });
      return json(res, 200, result);
    }

    if (req.method === 'GET') {
      return serveStatic(url.pathname, res);
    }

    return json(res, 405, { error: 'method_not_allowed' });
  } catch (error) {
    console.error(error.stack || error.message);
    return json(res, error.statusCode || 500, {
      error: error.code || 'internal_server_error',
      message: error.message
    });
  }
});

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error('Request body is too large.');
      error.statusCode = 413;
      error.code = 'payload_too_large';
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (_) {
    const error = new Error('Request body must be valid JSON.');
    error.statusCode = 400;
    error.code = 'invalid_json';
    throw error;
  }
}

async function serveStatic(pathname, res) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(ROOT, safePath));
  if (!filePath.startsWith(ROOT)) return json(res, 403, { error: 'forbidden' });

  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile()) return json(res, 404, { error: 'not_found' });
    const ext = path.extname(filePath);
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=300'
    });
    return res.end(content);
  } catch (_) {
    return json(res, 404, { error: 'not_found' });
  }
}

function json(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  return res.end(JSON.stringify(payload));
}

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server listening on :${PORT}`);
  });
}

module.exports = { server };
