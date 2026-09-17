#!/usr/bin/env node
/* Diagnose the Google Sheets webhook without touching the form.

     node server/check-sheets.js          probe with a WRONG secret: proves the
                                          deployment is reachable and doPost runs,
                                          without writing a row
     node server/check-sheets.js --real   send the real secret + one test row
                                          (email: probe@example.com) */
'use strict';
const path = require('path');
require('../api/_lib/env').load(path.join(__dirname, '..', '.env.local'));
const { interpret } = require('../api/_lib/submission');

const url = process.env.SHEETS_WEBHOOK_URL;
const secret = process.env.SHEETS_SECRET;
const real = process.argv.includes('--real');

if (!url || !secret) {
  console.log('✗ SHEETS_WEBHOOK_URL / SHEETS_SECRET not set — copy .env.example to .env.local and fill them in.');
  process.exit(1);
}
if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) {
  console.log('✗ SHEETS_WEBHOOK_URL does not look like an Apps Script web app URL (…/macros/s/<id>/exec):', url);
  process.exit(1);
}

(async () => {
  console.log((real ? 'Sending a real test row' : 'Probing with a wrong secret (no row will be written)') + ' → ' + url.replace(/\/s\/[\w-]{12}[\w-]+\//, '/s/…/'));
  const body = { secret: real ? secret : '__probe__', data: { email: 'probe@example.com', status: 'UNQUALIFIED' } };
  let res, text;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'follow' });
    text = await res.text();
  } catch (e) {
    console.log('✗ network error:', e.message); process.exit(1);
  }
  console.log(`HTTP ${res.status}  final URL: ${res.url.replace(/\?.*/, '')}`);
  const r = interpret(res.status, res.url, text);

  if (r.ok) {
    console.log('✓ doPost ran. Script returned:', r.body || '(empty)');
    if (!real) console.log('  That was the wrong-secret probe. If your script accepts anything, it may have written a row — check it validates `secret`.');
    else console.log('  Check the sheet for probe@example.com.');
    return;
  }
  console.log('✗', r.error);
  if (r.body) console.log('  response:', r.body);
  if (!real && /secret mismatch/.test(r.error)) {
    console.log('✓ …which is the expected answer for a wrong-secret probe: the deployment is reachable and doPost runs. Run with --real to write one row.');
  }
})();
