/* POST /api/submit — receives what apply.js sends, re-runs the scoring on
   the server, and logs { email, status } to the Google Sheets Apps Script
   webhook. The client never waits on this and never sees a failure: the
   response is 200 whether or not Sheets accepted the row. Failures are
   logged here, with the record id, so they can be replayed. */
'use strict';
const scoring = require('../assets/js/scoring.js');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SHEETS_TIMEOUT_MS = 10000;

function log(level, msg, extra) {
  const line = `[${new Date().toISOString()}] submit ${level}: ${msg}`;
  (level === 'error' ? console.error : console.log)(extra === undefined ? line : line + ' ' + JSON.stringify(extra));
}

/* Only full records are logged to Sheets. apply.js also posts 'abandon',
   'booking' and 'checkin' events to the same endpoint — those are accepted
   and logged locally but carry no status, so they are not forwarded. */
function classify(body) {
  if (!body || typeof body !== 'object') return 'invalid';
  if (body.type === 'abandon' || body.type === 'booking' || body.type === 'checkin') return body.type;
  if (body.contact && body.business) return 'record';
  return 'invalid';
}

/* Re-score from the raw answers. The client's `score` field is compared
   for monitoring but is never what gets logged. */
function rescore(record) {
  const c = record.contact || {};
  const b = record.business || {};
  const answers = {
    state: typeof c.state === 'string' ? c.state : null,
    timeInBusiness: b.timeInBusiness, monthlyRevenue: b.monthlyRevenue,
    fundingAmount: b.fundingAmount, authority: b.authority
  };
  return scoring.score(answers);
}

/* Turns Google's response into something a human can act on. Google
   answers with its own HTML (sign-in / not-found pages) before the script
   ever runs; only a JSON body means doPost actually executed. */
function interpret(status, finalUrl, text) {
  const html = /^\s*<!doctype html|^\s*<html/i.test(text);
  const signin = /accounts\.google\.com/.test(finalUrl || '') || /ServiceLogin|signin/i.test(text.slice(0, 2000));
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}

  if (status === 401 || signin) return {
    ok: false, error: `HTTP ${status} — the Apps Script deployment requires a Google sign-in, so doPost never ran. ` +
      'In Apps Script: Deploy → Manage deployments → ✎ → "Who has access" = Anyone → Deploy.'
  };
  if (status === 404) return { ok: false, error: 'HTTP 404 — no deployment at SHEETS_WEBHOOK_URL. Copy the /exec URL from Deploy → Manage deployments.' };
  if (status >= 400) return { ok: false, error: `HTTP ${status}`, body: text.slice(0, 300) };
  if (json && (json.result === 'error' || json.error || json.ok === false || /unauthori[sz]ed|invalid secret|forbidden/i.test(text))) {
    return { ok: false, error: 'script ran but rejected the request (secret mismatch?)', body: text.slice(0, 300) };
  }
  if (html) {
    const m = text.match(/Script function not found: (\w+)|The script completed but did not return anything/);
    return { ok: false, error: m ? m[0] + ' — the deployed version has no doPost, or an older version is deployed' : 'HTTP ' + status + ' but Google returned an HTML page, not the script output', body: text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200) };
  }
  return { ok: true, body: text.slice(0, 300) };
}

async function postToSheets(env, data) {
  const url = env.SHEETS_WEBHOOK_URL;
  const secret = env.SHEETS_SECRET;
  if (!url || !secret) return { ok: false, error: 'SHEETS_WEBHOOK_URL / SHEETS_SECRET not configured' };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SHEETS_TIMEOUT_MS);
  try {
    /* Apps Script answers a POST with a 302 to a googleusercontent URL;
       fetch follows it and the final body is the script's output. */
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: secret, data: data }),
      redirect: 'follow',
      signal: ctrl.signal
    });
    const text = await res.text();
    return interpret(res.status, res.url, text);
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? `timeout after ${SHEETS_TIMEOUT_MS}ms` : e.message };
  } finally {
    clearTimeout(timer);
  }
}

/* Returns { status: <http>, body: <object> }. Never throws. */
async function handleSubmission(body, env) {
  env = env || process.env;
  const kind = classify(body);

  if (kind === 'invalid') return { status: 400, body: { ok: false, error: 'Expected a submission record' } };

  if (kind !== 'record') {
    log('info', `${kind} event`, { id: body.id, question: body.question });
    return { status: 200, body: { ok: true, logged: false } };
  }

  const email = body.contact && typeof body.contact.email === 'string' ? body.contact.email.trim() : '';
  if (!EMAIL_RE.test(email)) return { status: 400, body: { ok: false, error: 'A valid contact.email is required' } };

  const result = rescore(body);
  if (result.status === 'INCOMPLETE') {
    log('error', 'incomplete answers — not logged', { id: body.id, missing: result.missing });
    return { status: 400, body: { ok: false, error: 'Incomplete answers: ' + result.missing.join(', ') } };
  }

  const clientStatus = body.score && body.score.status;
  if (clientStatus && clientStatus !== result.status) {
    log('error', 'client/server status mismatch — server verdict used', { id: body.id, client: clientStatus, server: result.status });
  }

  /* Phone is stored by apply.js as E.164 (+1XXXXXXXXXX). Empty string, never null, if absent. */
  const phone = body.contact && typeof body.contact.phone === 'string' ? body.contact.phone.trim() : '';
  /* Personal name = Q1 first + middle; business name = Q5. Empty strings when absent. */
  const str = v => (typeof v === 'string' ? v.trim() : '');
  const name = [str(body.contact.firstName), str(body.contact.middleName)].filter(Boolean).join(' ');
  const businessName = str(body.business.name);
  const data = { email: email, status: result.status, phone: phone, name: name, businessName: businessName };
  const sheets = await postToSheets(env, data);
  if (sheets.ok) log('info', 'logged to Sheets', { id: body.id, status: result.status, tier: result.tier });
  else log('error', 'Sheets logging failed (user flow unaffected)', { id: body.id, status: result.status, error: sheets.error, body: sheets.body });

  /* 200 either way — logging must never break the visitor's flow. */
  return { status: 200, body: { ok: true, status: result.status, logged: sheets.ok } };
}

module.exports = { handleSubmission, rescore, classify, postToSheets, interpret };
