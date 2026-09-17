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
  META_PIXEL_ID: '{{META_PIXEL_ID}}',

  /* Where submissions are POSTed as JSON (qualified and unqualified alike).
     Until set, records are kept in localStorage under "fundme_submissions"
     so nothing is lost during review. */
  SUBMIT_ENDPOINT: '{{SUBMIT_ENDPOINT}}'
};
