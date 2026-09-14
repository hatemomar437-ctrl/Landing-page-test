/* FundMe — progressive enhancement only.
   Every behavior here degrades to working static HTML if JS never runs.
   Motion is ported from the Pool reference; see /docs/design-tokens.md §Motion. */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ── 1. Auto-advancing tab tour ───────────────────────
     Ported behavior: 5s auto-advance, pause on pointer/focus enter,
     resume on leave, arrow-key navigation, selected tab scrolled to centre. */
  document.querySelectorAll('[data-tour]').forEach(function (root) {
    var tabs    = Array.prototype.slice.call(root.querySelectorAll('[data-tour-tab]'));
    var visuals = Array.prototype.slice.call(root.querySelectorAll('[data-tour-visual]'));
    var panels  = Array.prototype.slice.call(root.querySelectorAll('[data-tour-panel]'));
    var tablist = root.querySelector('[data-tour-tablist]');
    if (tabs.length <= 1) return;

    var current  = 0;
    var timer;
    var interval = Number(root.dataset.autoAdvanceIntervalMs) || 5000;
    var autoOK   = root.dataset.autoAdvance === 'true' && !reduceMotion.matches;

    function centre(tab) {
      if (!tablist || tablist.scrollWidth <= tablist.clientWidth) return;
      tablist.scrollTo({
        left: tab.offsetLeft - (tablist.clientWidth - tab.offsetWidth) / 2,
        behavior: reduceMotion.matches ? 'auto' : 'smooth'
      });
    }

    function select(next) {
      current = (next + tabs.length) % tabs.length;

      tabs.forEach(function (tab) {
        var on = Number(tab.dataset.tourIndex) === current;
        tab.setAttribute('aria-selected', String(on));
        tab.tabIndex = on ? 0 : -1;
        if (on) centre(tab);
      });

      visuals.forEach(function (vis) {
        var on = Number(vis.dataset.tourIndex) === current;
        vis.classList.toggle('is-hidden', !on);
        vis.setAttribute('aria-hidden', String(!on));
      });

      panels.forEach(function (panel) {
        panel.hidden = Number(panel.dataset.tourIndex) !== current;
      });
    }

    function pause() {
      if (timer !== undefined) { window.clearInterval(timer); timer = undefined; }
    }
    function play() {
      if (autoOK && timer === undefined) {
        timer = window.setInterval(function () { select(current + 1); }, interval);
      }
    }

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        pause();
        select(Number(tab.dataset.tourIndex));
        if (!root.contains(document.activeElement)) play();
      });
      tab.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        select(current + (e.key === 'ArrowRight' ? 1 : -1));
        if (tabs[current]) tabs[current].focus({ preventScroll: true });
      });
    });

    root.addEventListener('pointerenter', pause);
    root.addEventListener('pointerleave', play);
    root.addEventListener('focusin', pause);
    root.addEventListener('focusout', function (e) {
      if (!(e.relatedTarget instanceof Node) || !root.contains(e.relatedTarget)) play();
    });

    play();
  });

  /* ── 2. FAQ: animate <details> open/close ─────────────
     Wraps the answer so grid-template-rows can transition 0fr → 1fr.
     Without JS the <details> still opens, just instantly. */
  document.querySelectorAll('.qa').forEach(function (qa) {
    var inner = qa.querySelector('.qa__inner');
    if (!inner) return;
    var wrap = document.createElement('div');
    wrap.className = 'qa__inner-wrap';
    inner.parentNode.insertBefore(wrap, inner);
    wrap.appendChild(inner);
    qa.dataset.anim = '';
  });

  /* ── 3. Scroll reveal ─────────────────────────────────
     Fires once per element, then stops observing. */
  var revealables = document.querySelectorAll('.reveal');
  if (reduceMotion.matches || !('IntersectionObserver' in window)) {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
    revealables.forEach(function (el) { io.observe(el); });
  }

  /* ── 4. Mobile menu ───────────────────────────────────
     Links inside the panel close it. Links inside the <summary> bar
     (the logo, "Contact") would otherwise also toggle the menu open,
     so stop the click before it reaches the summary. */
  var menu = document.querySelector('.mobile-menu');
  if (menu) {
    var bar = menu.querySelector('summary');

    menu.querySelectorAll('.mobile-menu__panel a').forEach(function (link) {
      link.addEventListener('click', function () { menu.open = false; });
    });

    if (bar) {
      bar.querySelectorAll('a').forEach(function (link) {
        link.addEventListener('click', function (e) { e.stopPropagation(); });
      });
    }
  }
})();
