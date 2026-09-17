/* FundMe — /apply qualification form.
   One question per screen. Contact details come first so every visitor,
   qualified or not, is stored. Hard disqualifiers route out the instant
   they are chosen. Scoring runs client-side on completion and travels
   with the record and into the Cal.com booking metadata.

   Depends on config.js (FUNDME_CONFIG) and consent.js (FundMeTrack). */
(function () {
  'use strict';

  var cfg   = window.FUNDME_CONFIG || {};
  var track = window.FundMeTrack || { track: function () {}, custom: function () {} };
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var STORE = 'fundme_apply_v1';
  var OUTCOME = 'fundme_outcome';

  var root = document.querySelector('[data-form]');
  if (!root) return;

  /* ── Question model ─────────────────────────────────── */
  var STEPS = ['contact', 'timeInBusiness', 'monthlyRevenue', 'fundingAmount', 'authority'];
  var TOTAL = STEPS.length;

  var ORDER = {
    timeInBusiness: ['lt6m', '6-12m', '1-3y', '3y+'],
    monthlyRevenue: ['lt20k', '20-50k', '50-150k', '150-500k', '500k+'],
    fundingAmount:  ['lt10k', '10-50k', '50-150k', '150-500k', '500k+']
  };
  var REV_MID = { '20-50k': 35000, '50-150k': 100000, '150-500k': 325000, '500k+': 500000 };
  var AMT_MID = { 'lt10k': 10000, '10-50k': 30000, '50-150k': 100000, '150-500k': 325000, '500k+': 500000 };

  function isDisqualifier(field, value) {
    return (field === 'state'          && value === 'not-listed') ||
           (field === 'timeInBusiness' && value === 'lt6m') ||
           (field === 'monthlyRevenue' && value === 'lt20k') ||
           (field === 'authority'      && value === 'no');
  }

  function score(a) {
    var fails = ['state', 'timeInBusiness', 'monthlyRevenue', 'authority'].filter(function (f) {
      return isDisqualifier(f, a[f]);
    });
    if (fails.length) return { status: 'UNQUALIFIED', disqualifiedBy: fails, tier: null, ratio: null, ratioFlag: null };

    var tib = ORDER.timeInBusiness.indexOf(a.timeInBusiness);
    var rev = ORDER.monthlyRevenue.indexOf(a.monthlyRevenue);
    var tier = (tib >= 3 && rev >= 3) ? 'TIER_A'
             : (tib >= 2 && rev >= 2) ? 'TIER_B'
             : 'TIER_C';

    var ratio = AMT_MID[a.fundingAmount] / REV_MID[a.monthlyRevenue];
    var flag  = ratio <= 1.5 ? 'REALISTIC' : ratio <= 3 ? 'NEEDS_RESET' : 'EXPECTATION_GAP';

    return { status: 'QUALIFIED', disqualifiedBy: [], tier: tier, ratio: Math.round(ratio * 100) / 100, ratioFlag: flag };
  }

  /* ── State ──────────────────────────────────────────── */
  function isPlaceholder(v) { return !v || /^\{\{[^}]*\}\}$/.test(String(v)); }

  function captureTracking(prev) {
    var p = new URLSearchParams(location.search);
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ad_id', 'fbclid', 'gclid'];
    var t = prev || {};
    var any = false;
    keys.forEach(function (k) { if (p.has(k)) { t[k] = p.get(k); any = true; } });
    if (any || !t.landingUrl) {
      t.landingUrl = location.href;
      t.referrer   = document.referrer || t.referrer || '';
      t.timestamp  = new Date().toISOString();
    }
    return t;
  }

  function load() {
    try { return JSON.parse(sessionStorage.getItem(STORE)); } catch (e) { return null; }
  }
  function save() {
    try { sessionStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
  }

  var state = load() || {};
  state.step      = typeof state.step === 'number' ? state.step : 0;
  state.answers   = state.answers || {};
  state.tracking  = captureTracking(state.tracking);
  state.startedAt = state.startedAt || new Date().toISOString();
  state.viewed    = state.viewed || [];
  state.completed = !!state.completed;
  state.id        = state.id || uid();
  save();

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  /* ── Record + storage ──────────────────────────────── */
  function buildRecord(result) {
    var a = state.answers;
    return {
      id: state.id,
      version: 1,
      submittedAt: new Date().toISOString(),
      startedAt: state.startedAt,
      contact: { firstName: a.firstName || null, middleName: a.middleName || null, email: a.email || null, phone: a.phone || null, state: a.state || null },
      consent: a.consentAt ? {
        given: true,
        timestamp: a.consentAt,
        text: 'I agree to be contacted by FundMe by phone, SMS and email about my funding enquiry. Message and data rates may apply.'
      } : { given: false, timestamp: null },
      business: {
        name: a.businessName || null,
        timeInBusiness: a.timeInBusiness || null,
        monthlyRevenue: a.monthlyRevenue || null,
        fundingAmount:  a.fundingAmount  || null,
        authority:      a.authority      || null
      },
      score: result,
      tracking: state.tracking,
      page: 'apply',
      userAgent: navigator.userAgent
    };
  }

  function storeRecord(record) {
    try {
      var all = JSON.parse(localStorage.getItem('fundme_submissions') || '[]');
      all.push(record);
      localStorage.setItem('fundme_submissions', JSON.stringify(all));
    } catch (e) {}
    post(record);
  }

  function post(payload) {
    if (isPlaceholder(cfg.SUBMIT_ENDPOINT)) return;
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(cfg.SUBMIT_ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
    } catch (e) {}
    try {
      fetch(cfg.SUBMIT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }

  /* ── DOM ────────────────────────────────────────────── */
  var screens = {};
  root.querySelectorAll('[data-q]').forEach(function (s) { screens[s.dataset.q] = s; });
  var progressBar  = document.querySelector('[data-progress]');
  var progressWrap = document.querySelector('[role="progressbar"]');
  var stepLabel    = document.querySelector('[data-step-label]');
  var current      = null;

  function stepIndex(name) { return STEPS.indexOf(name); }

  function setProgress(n) {
    var pct = Math.round((n / TOTAL) * 100);
    if (progressBar)  progressBar.style.width = pct + '%';
    if (progressWrap) progressWrap.setAttribute('aria-valuenow', String(n));
    if (stepLabel)    stepLabel.textContent = n >= TOTAL ? 'Done' : (n + 1) + ' / ' + TOTAL;
  }

  function show(name, back) {
    var next = screens[name];
    if (!next || next === current) return;
    Object.keys(screens).forEach(function (k) {
      var s = screens[k];
      s.hidden = s !== next;
      s.classList.remove('is-entering', 'is-back');
    });
    if (!reduceMotion.matches) {
      next.classList.add('is-entering');
      if (back) next.classList.add('is-back');
    }
    current = next;

    var idx = stepIndex(name);
    setProgress(idx >= 0 ? idx : TOTAL);
    if (idx >= 0) {
      state.step = idx;
      save();
      if (state.viewed.indexOf(name) < 0) {
        state.viewed.push(name);
        save();
        track.custom('QuestionViewed', { question: idx + 1, name: name });
      }
    }

    var title = next.querySelector('.q__title');
    if (title) title.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* History: every advance pushes an entry, so the browser's back button
     moves one question back rather than out of the form. */
  function go(name, opts) {
    opts = opts || {};
    if (!opts.fromHistory) history.pushState({ step: name }, '', location.href);
    show(name, opts.back);
  }
  window.addEventListener('popstate', function (e) {
    var target = e.state && e.state.step;
    if (!target || !screens[target]) return;
    if (target === 'booking' && !state.completed) target = STEPS[TOTAL - 1];
    var back = stepIndex(target) < stepIndex(current && current.dataset.q);
    show(target, back);
  });

  root.querySelectorAll('[data-back]').forEach(function (btn) {
    btn.addEventListener('click', function () { history.back(); });
  });

  /* ── Q1: contact ────────────────────────────────────── */
  var contactForm = root.querySelector('[data-contact-form]');
  var first   = contactForm.querySelector('#firstName');
  var middle  = contactForm.querySelector('#middleName');
  var email   = contactForm.querySelector('#email');
  var phone   = contactForm.querySelector('#phone');
  var stateEl = contactForm.querySelector('#state');
  var consent = contactForm.querySelector('#consent');

  /* States come from config. With TERRITORY_STATES empty the static
     {{TERRITORY}} placeholder option in the markup stays visible. */
  var group = stateEl.querySelector('[data-states]');
  if (group && Array.isArray(cfg.TERRITORY_STATES) && cfg.TERRITORY_STATES.length) {
    group.innerHTML = '';
    cfg.TERRITORY_STATES.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s[0]; o.textContent = s[1];
      group.appendChild(o);
    });
  }

  function setError(el, msg) {
    var err = document.getElementById(el.id + '-err');
    if (msg) { el.setAttribute('aria-invalid', 'true'); if (err) { err.textContent = msg; err.dataset.show = ''; } }
    else     { el.removeAttribute('aria-invalid');      if (err) delete err.dataset.show; }
    return !msg;
  }

  function validFirst() {
    return setError(first, first.value.trim() ? '' : 'Enter your first name.');
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function validEmail() {
    var v = email.value.trim();
    return setError(email, EMAIL_RE.test(v) ? '' : 'Enter a valid email address.');
  }

  function phoneDigits(v) {
    var d = String(v).replace(/\D/g, '');
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    return d;
  }
  function validPhoneDigits(d) {
    return d.length === 10 && /^[2-9]/.test(d) && /^[2-9]/.test(d.slice(3, 4));
  }
  function formatPhone(d) {
    return '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }
  function validPhone() {
    var d = phoneDigits(phone.value);
    var ok = validPhoneDigits(d);
    if (ok) phone.value = formatPhone(d);
    return setError(phone, ok ? '' : 'Enter a 10-digit US mobile number.');
  }
  function validState() {
    return setError(stateEl, stateEl.value ? '' : 'Select your state.');
  }
  function validConsent() {
    var wrap = consent.closest('.check');
    var err  = document.getElementById('consent-err');
    if (consent.checked) { if (wrap) delete wrap.dataset.invalid; if (err) delete err.dataset.show; consent.removeAttribute('aria-invalid'); return true; }
    if (wrap) wrap.dataset.invalid = '';
    if (err) err.dataset.show = '';
    consent.setAttribute('aria-invalid', 'true');
    return false;
  }

  /* Validate on blur, not on keystroke; clear an error as soon as it is fixed.
     Skip the blur check when the blur is the Continue tap itself: an error
     inserted at that instant shifts the button under the thumb and the tap
     misses. Submit validates every field anyway. */
  var submitBtn = contactForm.querySelector('[type="submit"]');
  var tappingSubmit = false;
  submitBtn.addEventListener('pointerdown', function () { tappingSubmit = true; });
  submitBtn.addEventListener('pointerup', function () { window.setTimeout(function () { tappingSubmit = false; }, 300); });
  submitBtn.addEventListener('pointercancel', function () { tappingSubmit = false; });
  function blurToSubmit(e) { return tappingSubmit || e.relatedTarget === submitBtn; }

  email.addEventListener('blur', function (e) { if (email.value && !blurToSubmit(e)) validEmail(); });
  phone.addEventListener('blur', function (e) { if (phone.value && !blurToSubmit(e)) validPhone(); });
  first.addEventListener('input', function () { if (first.getAttribute('aria-invalid')) validFirst(); });
  email.addEventListener('input', function () { if (email.getAttribute('aria-invalid')) validEmail(); });
  phone.addEventListener('input', function () { if (phone.getAttribute('aria-invalid')) validPhone(); });
  stateEl.addEventListener('change', function () {
    if (stateEl.value) delete stateEl.dataset.empty; else stateEl.dataset.empty = '';
    validState();
    /* A hard disqualifier chosen with the rest of Q1 already valid routes out now. */
    if (stateEl.value === 'not-listed' && first.value.trim() && EMAIL_RE.test(email.value.trim()) &&
        validPhoneDigits(phoneDigits(phone.value)) && consent.checked) {
      commitContact();
      disqualify('state');
    }
  });
  consent.addEventListener('change', function () {
    state.answers.consentAt = consent.checked ? new Date().toISOString() : null;
    save();
    if (consent.checked) validConsent();
  });

  function commitContact() {
    state.answers.firstName = first.value.trim();
    state.answers.middleName = middle.value.trim();
    state.answers.email = email.value.trim();
    state.answers.phone = '+1' + phoneDigits(phone.value);
    state.answers.phoneDisplay = phone.value;
    state.answers.state = stateEl.value;
    if (consent.checked && !state.answers.consentAt) state.answers.consentAt = new Date().toISOString();
    save();
  }

  contactForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var ok = [validFirst(), validEmail(), validPhone(), validState(), validConsent()];
    var firstBad = [first, email, phone, stateEl, consent][ok.indexOf(false)];
    if (firstBad) { firstBad.focus(); return; }
    commitContact();
    if (isDisqualifier('state', state.answers.state)) { disqualify('state'); return; }
    go(STEPS[1]);
  });

  /* Restore Q1 values after a refresh */
  if (state.answers.firstName)    first.value = state.answers.firstName;
  if (state.answers.middleName)   middle.value = state.answers.middleName;
  if (state.answers.email)        email.value = state.answers.email;
  if (state.answers.phoneDisplay) phone.value = state.answers.phoneDisplay;
  if (state.answers.state)        { stateEl.value = state.answers.state; if (stateEl.value) delete stateEl.dataset.empty; }
  if (state.answers.consentAt)    consent.checked = true;

  /* ── Q2–Q5: option screens ──────────────────────────── */
  function markPressed(screen, value) {
    screen.querySelectorAll('.opt').forEach(function (o) {
      o.setAttribute('aria-pressed', String(o.dataset.value === value));
    });
  }

  Object.keys(screens).forEach(function (name) {
    var screen = screens[name];
    var field  = screen.dataset.field;
    if (!field) return;
    if (state.answers[field]) markPressed(screen, state.answers[field]);

    screen.querySelectorAll('.opt').forEach(function (opt) {
      opt.addEventListener('click', function () {
        var value = opt.dataset.value;
        state.answers[field] = value;
        save();
        markPressed(screen, value);
        if (isDisqualifier(field, value)) { disqualify(field); return; }
        advanceFrom(name);
      });
    });
  });

  var advanceTimer;
  function advanceFrom(name) {
    var idx = stepIndex(name);
    window.clearTimeout(advanceTimer);
    var run = function () {
      if (name === 'authority') { finish(); return; }
      go(STEPS[idx + 1]);
    };
    /* A beat so the selected state is seen before the screen moves. */
    advanceTimer = window.setTimeout(run, reduceMotion.matches ? 0 : 260);
  }

  /* Q5 also carries the business name. */
  var bizName = root.querySelector('#businessName');
  if (state.answers.businessName) bizName.value = state.answers.businessName;
  bizName.addEventListener('input', function () {
    state.answers.businessName = bizName.value.trim();
    save();
    if (bizName.value.trim()) setError(bizName, '');
  });
  bizName.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (state.answers.authority && !isDisqualifier('authority', state.answers.authority)) finish();
    else { var first = screens.authority.querySelector('.opt'); if (first) first.focus(); }
  });

  function finish() {
    if (!bizName.value.trim()) {
      setError(bizName, 'Add your business name to finish.');
      bizName.focus();
      return;
    }
    state.answers.businessName = bizName.value.trim();
    var result = score(state.answers);
    if (result.status !== 'QUALIFIED') { disqualify(result.disqualifiedBy[0]); return; }

    state.completed = true;
    state.result = result;
    save();
    var record = buildRecord(result);
    storeRecord(record);
    track.track('Lead', { tier: result.tier, ratio_flag: result.ratioFlag, state: state.answers.state });
    go('booking');
    initBooking(record);
  }

  /* ── Disqualified → /thank-you ─────────────────────── */
  var leaving = false;
  function disqualify(field) {
    if (leaving) return;
    leaving = true;
    var result = score(state.answers);
    if (result.status !== 'UNQUALIFIED') result = { status: 'UNQUALIFIED', disqualifiedBy: [field], tier: null, ratio: null, ratioFlag: null };
    state.completed = true;
    state.result = result;
    save();
    storeRecord(buildRecord(result));
    track.custom('Disqualified', { reason: field, question: stepIndex(field === 'state' ? 'contact' : field) + 1 });
    try {
      sessionStorage.setItem(OUTCOME, JSON.stringify({ status: 'UNQUALIFIED', reason: field, email: state.answers.email || '', id: state.id }));
    } catch (e) {}
    /* Let the pixel beacon leave before navigation, and fade if the
       browser has no cross-document view transitions. */
    var url = '../thank-you/' + location.search;
    var delay = 160;
    if (!('PageRevealEvent' in window) && !reduceMotion.matches) document.documentElement.classList.add('is-leaving');
    window.setTimeout(function () { location.assign(url); }, delay);
  }

  /* ── Qualified → Cal.com inline ────────────────────── */
  var bookingInit = false;
  function initBooking(record) {
    if (bookingInit) return;
    bookingInit = true;
    var slot = document.getElementById('cal-inline');
    if (!slot) return;
    var url = cfg.BOOKING_URL;

    if (isPlaceholder(url)) {
      slot.classList.add('booking--placeholder');
      slot.innerHTML = '<p>The booking calendar embeds here once the Cal.com link is set.<code>{{BOOKING_URL}}</code></p>';
      return;
    }

    var u; try { u = new URL(url); } catch (e) { slot.textContent = 'Booking link is not a valid URL: ' + url; return; }
    var origin  = u.origin;
    var calLink = u.pathname.replace(/^\/+|\/+$/g, '');
    var embedSrc = (origin === 'https://cal.com' ? 'https://app.cal.com' : origin) + '/embed/embed.js';

    /* Cal.com's official embed loader. */
    (function (C, A, L) {
      var p = function (a, ar) { a.q.push(ar); };
      var d = C.document;
      C.Cal = C.Cal || function () {
        var cal = C.Cal, ar = arguments;
        if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; d.head.appendChild(d.createElement('script')).src = A; cal.loaded = true; }
        if (ar[0] === L) {
          var api = function () { p(api, arguments); }, namespace = ar[1];
          api.q = api.q || [];
          if (typeof namespace === 'string') { cal.ns[namespace] = cal.ns[namespace] || api; p(cal.ns[namespace], ar); p(cal, ['initNamespace', namespace]); }
          else p(cal, ar);
          return;
        }
        p(cal, ar);
      };
    })(window, embedSrc, 'init');

    var a = state.answers, s = record.score, t = state.tracking || {};
    var config = {
      email: a.email,
      attendeePhoneNumber: a.phone,
      /* Cal.com sets any metadata[...] key on the booking, invisible to the
         attendee; the person taking the call sees it before they dial. */
      'metadata[tier]': s.tier,
      'metadata[ratioFlag]': s.ratioFlag,
      'metadata[ratio]': String(s.ratio),
      'metadata[state]': a.state,
      'metadata[businessName]': a.businessName,
      'metadata[timeInBusiness]': a.timeInBusiness,
      'metadata[monthlyRevenue]': a.monthlyRevenue,
      'metadata[fundingAmount]': a.fundingAmount,
      'metadata[leadId]': state.id
    };
    /* The booking is in the person's name; the business rides in metadata. */
    var fullName = [a.firstName, a.middleName].filter(Boolean).join(' ');
    if (fullName) config.name = fullName;
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'ad_id', 'fbclid'].forEach(function (k) {
      if (t[k]) config['metadata[' + k + ']'] = t[k];
    });

    window.Cal('init', { origin: origin });
    window.Cal('inline', { elementOrSelector: '#cal-inline', calLink: calLink, layout: 'month_view', config: config });
    window.Cal('ui', { theme: 'light', hideEventTypeDetails: false, styles: { branding: { brandColor: '#003439' } } });

    /* Booking confirmed — the only place BookingCompleted fires. */
    var booked = false;
    window.Cal('on', {
      action: 'bookingSuccessful',
      callback: function (e) {
        if (booked) return;
        booked = true;
        var detail = (e && e.detail && e.detail.data) || {};
        track.custom('BookingCompleted', { tier: s.tier, ratio_flag: s.ratioFlag, state: a.state });
        post({ id: state.id, type: 'booking', bookedAt: new Date().toISOString(), booking: { uid: detail.booking && detail.booking.uid, startTime: detail.date, eventType: detail.eventType && detail.eventType.slug } });
        state.booked = true; save();
        var eyebrow = screens.booking.querySelector('[data-booking-eyebrow]');
        if (eyebrow) eyebrow.textContent = 'Booked';
      }
    });
  }

  /* ── Keyboard ───────────────────────────────────────── */
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey || !current) return;
    var t = e.target;
    var inField = t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
    var name = current.dataset.q;

    if (/^[1-9]$/.test(e.key) && !inField) {
      var opts = current.querySelectorAll('.opt');
      var o = opts[Number(e.key) - 1];
      if (o) { e.preventDefault(); o.click(); }
      return;
    }
    if (e.key === 'Backspace' && !inField) {
      if (stepIndex(name) > 0) { e.preventDefault(); history.back(); }
      return;
    }
    if (e.key === 'Enter' && !inField && !(t && t.classList && t.classList.contains('opt')) && !(t && t.tagName === 'BUTTON')) {
      var field = current.dataset.field;
      if (field && state.answers[field] && !isDisqualifier(field, state.answers[field])) {
        e.preventDefault();
        window.clearTimeout(advanceTimer);
        if (name === 'authority') finish(); else go(STEPS[stepIndex(name) + 1]);
      }
    }
  });

  /* ── Drop-off ───────────────────────────────────────────
     Sent the first time the tab is hidden or unloaded, once per session.
     visibilitychange is the reliable signal on phones (app switch, tab
     close); pagehide covers desktop navigation. A visitor who comes back
     and finishes still produces a Lead, so the two can be reconciled by id. */
  function abandon() {
    if (state.abandonSent || state.completed || leaving || !current) return;
    state.abandonSent = true; save();
    var name = current.dataset.q;
    var payload = { id: state.id, type: 'abandon', question: stepIndex(name) + 1, name: name, at: new Date().toISOString(), tracking: state.tracking };
    track.custom('FormAbandoned', { question: payload.question, name: name });
    post(payload);
  }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') abandon(); });
  window.addEventListener('pagehide', abandon);

  /* Back from /thank-you via bfcache: undo the fade and let them retry. */
  window.addEventListener('pageshow', function (e) {
    document.documentElement.classList.remove('is-leaving');
    if (e.persisted) leaving = false;
  });

  /* Logo → landing page, carrying the attribution params back with it. */
  var home = document.querySelector('[data-home]');
  if (home && location.search) home.setAttribute('href', home.getAttribute('href').split('?')[0] + location.search);

  /* ── Boot ───────────────────────────────────────────── */
  var start = state.completed && state.result && state.result.status === 'QUALIFIED' ? 'booking' : STEPS[Math.min(state.step, TOTAL - 1)];
  if (start !== 'booking' && state.completed) { state.completed = false; state.result = null; save(); }

  /* Rebuild history so back still moves one question at a time after a refresh. */
  history.replaceState({ step: STEPS[0] }, '', location.href);
  for (var i = 1; i <= stepIndex(start); i++) history.pushState({ step: STEPS[i] }, '', location.href);
  if (start === 'booking') history.pushState({ step: 'booking' }, '', location.href);

  show(start);
  if (start === 'booking') initBooking(buildRecord(state.result));
})();
