#!/usr/bin/env node
/* FundMe — static site + submission API. No dependencies.

     node server.js              → http://localhost:3000
     PORT=8080 node server.js

   Serves this folder as the site and handles POST /api/submit
   (see server/submission.js). Secrets come from .env.local, which is
   gitignored and never sent to the browser. */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { load } = require('./api/_lib/env');
const { handleSubmission } = require('./api/_lib/submission');

load();
const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const MAX_BODY = 64 * 1024;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8'
};

/* Never serve secrets, server code, or git internals. */
function isPrivate(rel) {
  return rel.split(/[\\/]/).some(seg => seg.startsWith('.')) || rel === 'server.js' || rel.startsWith('server' + path.sep) || rel.startsWith('server/');
}

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'application/json', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0, done = false; const chunks = [];
    const fail = (msg, status) => { if (done) return; done = true; const e = new Error(msg); e.status = status; reject(e); req.resume(); };
    req.on('data', c => { if (done) return; size += c.length; if (size > MAX_BODY) fail('body too large', 413); else chunks.push(c); });
    req.on('end', () => { if (done) return; done = true; try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); } catch (e) { reject(Object.assign(new Error('invalid JSON'), { status: 400 })); } });
    req.on('error', e => fail(e.message, 400));
  });
}

async function api(req, res, pathname) {
  if (pathname === '/api/submit') {
    if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only' });
    let body;
    try { body = await readJson(req); } catch (e) { return send(res, e.status || 400, { ok: false, error: e.message }); }
    const out = await handleSubmission(body, process.env);
    return send(res, out.status, out.body);
  }
  if (pathname === '/api/health') return send(res, 200, { ok: true, sheets: !!(process.env.SHEETS_WEBHOOK_URL && process.env.SHEETS_SECRET) });
  return send(res, 404, { ok: false, error: 'not found' });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  rel = path.normalize(rel).replace(/^([\\/])+/, '');
  const file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT) || isPrivate(rel)) return send(res, 404, 'Not found', 'text/plain');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      /* /apply → /apply/ so relative asset paths resolve */
      if (!err && st.isDirectory()) { res.writeHead(301, { Location: pathname + '/' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '') }); return res.end(); }
      return send(res, 404, 'Not found', 'text/plain');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const pathname = req.url.split('?')[0];
  if (pathname.startsWith('/api/')) {
    api(req, res, pathname).catch(e => { console.error('[api] unexpected', e); if (!res.headersSent) send(res, 500, { ok: false }); });
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
  serveStatic(req, res, pathname);
});

if (require.main === module) {
  server.listen(PORT, () => {
    const sheets = process.env.SHEETS_WEBHOOK_URL && process.env.SHEETS_SECRET;
    console.log(`FundMe site on http://localhost:${PORT}/  — Sheets logging ${sheets ? 'configured' : 'NOT configured (add .env.local)'}`);
  });
}

module.exports = server;
