/* GET /api/health — is the Sheets webhook configured on this deployment? */
'use strict';
module.exports = function (req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ ok: true, sheets: !!(process.env.SHEETS_WEBHOOK_URL && process.env.SHEETS_SECRET) }));
};
