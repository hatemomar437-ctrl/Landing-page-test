/* FundMe — cookie consent + Meta Pixel gate.
   The operator is NL-based, so nothing non-essential loads before the
   visitor chooses. The pixel script is not even fetched until "Accept".
   Events fired before a choice are held in memory and flushed on accept,
   dropped on "Essential only". Everything is also appended to
   window.FUNDME_EVENTS so QA can see what would have fired.

   Exposes window.FundMeTrack = { track(name, params), custom(name, params) } */
(function () {
  'use strict';

  var KEY  = 'fundme_consent';
  var cfg  = window.FUNDME_CONFIG || {};
  var held = [];
  var pixel = 'idle';                 /* idle | loading | ready | placeholder */
  var log  = window.FUNDME_EVENTS = window.FUNDME_EVENTS || [];

  function isPlaceholder(v) { return !v || /^\{\{[^}]*\}\}$/.test(String(v)); }
  function read() { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } }
  function write(choice) {
    try { localStorage.setItem(KEY, JSON.stringify({ choice: choice, at: new Date().toISOString() })); } catch (e) {}
  }
  function choice() { var c = read(); return c && c.choice; }

  function send(ev) {
    log.push({ name: ev.name, params: ev.params, custom: ev.custom, sent: pixel === 'ready', at: new Date().toISOString() });
    if (pixel === 'ready' && window.fbq) window.fbq(ev.custom ? 'trackCustom' : 'track', ev.name, ev.params);
  }
  function flush() { while (held.length) send(held.shift()); }

  function loadPixel() {
    if (pixel !== 'idle') return;
    if (isPlaceholder(cfg.META_PIXEL_ID)) { pixel = 'placeholder'; flush(); return; }
    pixel = 'loading';
    /* Meta's standard loader, unmodified except for formatting. */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', String(cfg.META_PIXEL_ID));
    pixel = 'ready';
    window.fbq('track', 'PageView');
    flush();
  }

  function emit(name, params, custom) {
    var ev = { name: name, params: params || {}, custom: !!custom };
    var c = choice();
    if (c === 'all') send(ev);
    else if (!c) held.push(ev);            /* undecided: keep until they choose */
    else log.push({ name: name, params: ev.params, custom: ev.custom, sent: false, dropped: 'essential-only', at: new Date().toISOString() });
  }

  window.FundMeTrack = {
    track:  function (name, params) { emit(name, params, false); },
    custom: function (name, params) { emit(name, params, true);  },
    consent: choice
  };

  /* Banner */
  var banner = document.querySelector('[data-consent]');
  function decide(c) {
    write(c);
    if (banner) banner.hidden = true;
    if (c === 'all') loadPixel(); else held.length = 0;
  }
  if (choice() === 'all') loadPixel();
  else if (!choice() && banner) {
    banner.hidden = false;
    var accept = banner.querySelector('[data-consent-accept]');
    var essential = banner.querySelector('[data-consent-essential]');
    if (accept) accept.addEventListener('click', function () { decide('all'); });
    if (essential) essential.addEventListener('click', function () { decide('essential'); });
  }
})();
