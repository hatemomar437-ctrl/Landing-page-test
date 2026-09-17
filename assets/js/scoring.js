/* FundMe — qualification scoring. ONE copy of the rules, run in two places:
   in the browser by apply.js (to route and to show the booking screen) and
   again on the server by server/submission.js (the version that is logged).
   The server never trusts the client's verdict.

   Loads as window.FundMeScoring in a browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FundMeScoring = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ORDER = {
    timeInBusiness: ['lt6m', '6-12m', '1-3y', '3y+'],
    monthlyRevenue: ['lt20k', '20-50k', '50-150k', '150-500k', '500k+'],
    fundingAmount:  ['lt10k', '10-50k', '50-150k', '150-500k', '500k+'],
    authority:      ['owner', 'authorised', 'no']
  };
  var REV_MID = { '20-50k': 35000, '50-150k': 100000, '150-500k': 325000, '500k+': 500000 };
  var AMT_MID = { 'lt10k': 10000, '10-50k': 30000, '50-150k': 100000, '150-500k': 325000, '500k+': 500000 };

  function isDisqualifier(field, value) {
    return (field === 'state'          && value === 'not-listed') ||
           (field === 'timeInBusiness' && value === 'lt6m') ||
           (field === 'monthlyRevenue' && value === 'lt20k') ||
           (field === 'authority'      && value === 'no');
  }

  /* a = { state, timeInBusiness, monthlyRevenue, fundingAmount, authority }.
     A hard fail wins even if later answers are missing (the form exits early).
     Returns { status, disqualifiedBy, tier, ratio, ratioFlag }, or
     { status: 'INCOMPLETE', missing: [...] } when no hard fail and an answer
     is absent or not a known band — the server uses that to reject tampering. */
  function score(a) {
    a = a || {};
    var fails = ['state', 'timeInBusiness', 'monthlyRevenue', 'authority'].filter(function (f) {
      return isDisqualifier(f, a[f]);
    });
    if (fails.length) return { status: 'UNQUALIFIED', disqualifiedBy: fails, tier: null, ratio: null, ratioFlag: null };

    var missing = ['timeInBusiness', 'monthlyRevenue', 'fundingAmount', 'authority'].filter(function (f) {
      return ORDER[f].indexOf(a[f]) < 0;
    });
    if (!a.state) missing.unshift('state');
    if (missing.length) return { status: 'INCOMPLETE', missing: missing, disqualifiedBy: [], tier: null, ratio: null, ratioFlag: null };

    var tib = ORDER.timeInBusiness.indexOf(a.timeInBusiness);
    var rev = ORDER.monthlyRevenue.indexOf(a.monthlyRevenue);
    var tier = (tib >= 3 && rev >= 3) ? 'TIER_A'
             : (tib >= 2 && rev >= 2) ? 'TIER_B'
             : 'TIER_C';

    var ratio = AMT_MID[a.fundingAmount] / REV_MID[a.monthlyRevenue];
    var flag  = ratio <= 1.5 ? 'REALISTIC' : ratio <= 3 ? 'NEEDS_RESET' : 'EXPECTATION_GAP';

    return { status: 'QUALIFIED', disqualifiedBy: [], tier: tier, ratio: Math.round(ratio * 100) / 100, ratioFlag: flag };
  }

  return { ORDER: ORDER, REV_MID: REV_MID, AMT_MID: AMT_MID, isDisqualifier: isDisqualifier, score: score };
});
