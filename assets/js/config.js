/* FundMe — site configuration.
   Every value in {{DOUBLE_BRACES}} is an unfilled placeholder. The pages
   render placeholders visibly rather than guessing, so nothing here is a
   "plausible default". Fill these from the client brief only.

   TERRITORY_STATES is the legal/underwriting list of states FundMe serves.
   Leave it empty until it is confirmed: with it empty, the state dropdown
   shows the {{TERRITORY}} placeholder as its only selectable state. */
window.FUNDME_CONFIG = {
  /* Cal.com booking link for the qualified outcome, e.g.
     "https://cal.com/fundme/intro-call". Embedded inline; never redirected to. */
  BOOKING_URL: 'https://cal.com/omar-hatem-cmhcjw',

  /* States served, as [code, name] pairs, e.g. [['TX', 'Texas'], ['FL', 'Florida']].
     Only these appear in the Q1 dropdown, plus "My state isn't listed". */
  TERRITORY_STATES: [],

  /* Meta Pixel ID (digits). Loads only after cookie consent is given. */
  META_PIXEL_ID: '2127714827841834',

  /* Where submissions are POSTed as JSON (qualified and unqualified alike).
     Served by server.js, which re-scores and logs to Google Sheets. Records
     are also kept in localStorage under "fundme_submissions". On a static
     host with no server.js (GitHub Pages) the POST 404s harmlessly. */
  SUBMIT_ENDPOINT: '/api/submit'
};
