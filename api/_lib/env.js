/* Loads KEY=VALUE pairs from .env.local into process.env (no dependency).
   Real environment variables win over the file, so hosts that inject
   secrets keep working and tests can override without touching the file. */
'use strict';
const fs = require('fs');
const path = require('path');

function load(file) {
  const p = file || path.join(__dirname, '..', '..', '.env.local');
  if (!fs.existsSync(p)) return {};
  const loaded = {};
  for (const raw of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!(key in process.env)) process.env[key] = val;
    loaded[key] = true;
  }
  return loaded;
}

module.exports = { load };
