/* Vercel serverless function for POST /api/submit.
   Same handler as server.js uses locally — api/_lib/submission.js — so the
   re-scoring and Sheets logging are identical on both. Secrets come from
   the Vercel project's environment variables (SHEETS_WEBHOOK_URL,
   SHEETS_SECRET), never from a file in the deployment. */
'use strict';
const { handleSubmission } = require('./_lib/submission');

const MAX_BODY = 64 * 1024;

function readBody(req) {
  /* Vercel pre-parses JSON bodies into req.body; sendBeacon blobs arrive
     the same way. Fall back to reading the stream for other runtimes. */
  if (req.body !== undefined) {
    if (typeof req.body === 'string') { try { return Promise.resolve(JSON.parse(req.body || 'null')); } catch (e) { return Promise.reject(new Error('invalid JSON')); } }
    return Promise.resolve(req.body);
  }
  if (req.readableEnded) return Promise.resolve(null);   /* stream already drained by the host: nothing to read */
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) reject(Object.assign(new Error('body too large'), { status: 413 })); else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null')); } catch (e) { reject(new Error('invalid JSON')); } });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function (req, res) {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'POST only' });
  let body;
  try { body = await readBody(req); } catch (e) { return send(res, e.status || 400, { ok: false, error: e.message }); }
  try {
    const out = await handleSubmission(body, process.env);
    return send(res, out.status, out.body);
  } catch (e) {
    console.error('[api/submit] unexpected', e);
    /* Never let a logging failure surface to the visitor. */
    return send(res, 200, { ok: true, logged: false });
  }
};
