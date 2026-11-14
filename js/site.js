/* ==========================================================================
   FOURWARD — site script
   1. nav state   2. lane tabs   3. reveal-on-scroll
   4. hanging team cards (wire layout, swing, pointer shimmer, flip)
   5. booking calendar (no backend: the visitor requests a slot by email,
      or adds a Google Calendar invite with the team as guests)
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- 0. canonical host: the mirrors (pages.dev, github.io, bare domain) send people to www ---------- */
  if (/\.(pages\.dev|github\.io)$/.test(location.hostname) || location.hostname === 'fourwardhq.com') {
    location.replace('https://www.fourwardhq.com' + location.pathname + location.search + location.hash);
  }

  /* ---------- config ---------- */
  var FOURWARD = {
    emails: ['growth@fourwardhq.com'],
    // Paste a Cal.com / Calendly / Google appointment link here and the
    // "Book in Google Calendar" button will send visitors there instead of a Google Calendar invite.
    bookingUrl: '',
    // Optional: a small server that returns the real ChatGPT / Perplexity / Google answers for a
    // domain (see server/ai-check-worker.js). Leave empty and the hero check runs browser-only.
    aiCheckUrl: '',
    // Optional: a free key from jina.ai lifts the per-domain limit on the anonymous page fetcher.
    jinaKey: '',
    // Lead capture. leadUrl: the Google Apps Script web app (server/leads.gs) that logs checks, report
    // requests and bookings to a Google Sheet and emails each report from the Fourward Gmail.
    // Until it is set, everything goes through FormSubmit to formTo (needs a one-time activation click).
    // The AI visibility check runs on our own server (functions/api/ai-check.js).
    checkUrl: '/api/ai-check',
    leadUrl: 'https://script.google.com/macros/s/AKfycbyt5YKfhDZ2GhCCBkq8foHfgOr3VVgMCKlh5nlGZB7yP1J4uqV7rF3G6FAw7dKKt7O2JQ/exec',
    formTo: 'growth@fourwardhq.com',
    // The dedicated tool page; the hero card links its detailed results there.
    toolUrl: location.pathname.indexOf('/tools/ai-visibility-check/') >= 0 ? location.pathname.replace(/[^/]*$/, '') : location.pathname.replace(/[^/]*$/, '') + 'tools/ai-visibility-check/',
    hostTz: 'Asia/Kolkata',       // working hours are defined in this zone
    hostOffsetMin: 330,           // IST = UTC+5:30, no daylight saving
    workStart: 10 * 60,           // 10:00
    workEnd: 18 * 60 + 30,        // 18:30 (last slot starts 18:00)
    slotMin: 30,
    daysAhead: 60,
    leadHours: 3                  // nothing sooner than this from now
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 0. lead capture ----------
     fwSend(payload) posts a check, a report request or a booking to FOURWARD.leadUrl (server/leads.gs).
     Without it, FormSubmit forwards the payload to FOURWARD.formTo and, for report requests, emails the
     visitor a plain-text copy of the report. ?dryrun=1 logs payloads instead of sending (for QA). */
  function fwTrack(name, params) { try { if (typeof window.gtag === 'function') window.gtag('event', name, params || {}); } catch (e) {} }
  window.fwTrack = fwTrack;
  function fwSend(payload, keepalive) {
    if (payload && payload.type && payload.type !== 'check') fwTrack('generate_lead', { lead_type: payload.type });
    var p = Object.assign({}, payload, { page: location.href.split('#')[0], referrer: document.referrer || '', tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''), lang: navigator.language || '', ua: navigator.userAgent, ts: new Date().toISOString() });
    if (/[?&]dryrun=1/.test(location.search)) { window.__fwSent = (window.__fwSent || []).concat([p]); return Promise.resolve({ ok: true, dry: true }); }
    var timeout = function (pr, ms) { return Promise.race([pr, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); };
    var body = JSON.stringify(p);
    if (FOURWARD.leadUrl) {
      return timeout(fetch(FOURWARD.leadUrl, { method: 'POST', body: body, keepalive: !!keepalive && body.length < 60000 }).then(function (r) { return r.json(); }).then(function (j) { if (!j || !j.ok) throw new Error((j && j.error) || 'not sent'); return j; }), 25000);
    }
    if (!FOURWARD.formTo) return Promise.reject(new Error('no endpoint'));
    var f = { _captcha: 'false', _template: 'table' };
    if (p.type === 'report') { f._subject = 'Report requested · ' + p.name + ' · ' + p.domain + (p.score != null ? ' · ' + p.score + '/100' : ''); f.name = p.name; f.email = p.email; f.company = p.company; f._replyto = p.email; f._autoresponse = p.textReport; }
    else if (p.type === 'check') { f._subject = 'AI check · ' + p.domain + (p.score != null ? ' · ' + p.score + '/100' : ' · partial'); }
    else if (p.type === 'booking') { f._subject = 'Booking opened · ' + p.slotLabel; f.slot = p.slotLabel; f.slot_utc = p.slot; f.visitor_timezone = p.visitorTz; }
    if (p.domain) { f.domain = p.domain; f.score = p.score == null ? 'not available' : p.score + '/100 (' + p.grade + ')'; f.top_issues = (p.topIssues || []).join('; '); }
    f.page = p.page; f.referrer = p.referrer; f.timezone = p.tz; f.time = p.ts;
    return timeout(fetch('https://formsubmit.co/ajax/' + FOURWARD.formTo, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(f), keepalive: !!keepalive }).then(function (r) { return r.json(); }).then(function (j) { if (String(j.success) !== 'true') throw new Error(j.message || 'not sent'); return j; }), 25000);
  }

  /* ---------- 1. nav ---------- */
  var nav = $('#nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    var burger = $('.nav-burger', nav);
    if (burger) {
      burger.addEventListener('click', function () {
        var open = nav.classList.toggle('is-open');
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      $$('.nav-links a', nav).forEach(function (a) {
        a.addEventListener('click', function () { nav.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); });
      });
    }
    /* resources menu */
    $$('.nav-drop', nav).forEach(function (d) {
      var btn = $('.nav-drop-btn', d);
      var set = function (on) { d.classList.toggle('is-open', on); btn.setAttribute('aria-expanded', on ? 'true' : 'false'); };
      btn.addEventListener('click', function (e) { e.stopPropagation(); set(!d.classList.contains('is-open')); });
      document.addEventListener('click', function (e) { if (!d.contains(e.target)) set(false); });
      d.addEventListener('keydown', function (e) { if (e.key === 'Escape') { set(false); btn.focus(); } });
      d.addEventListener('focusout', function (e) { if (!d.contains(e.relatedTarget)) set(false); });
      if (/[?&]menu=1/.test(location.search)) set(true);   // ?menu=1 opens it (screenshots)
    });
    // highlight the section in view
    var links = $$('.nav-links a', nav);
    var targets = links.map(function (a) { var h = a.getAttribute('href') || ''; return h.charAt(0) === '#' && h.length > 1 ? $(h) : null; }).filter(Boolean);
    if ('IntersectionObserver' in window && targets.length) {
      var current = null;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) current = e.target.id; });
        links.forEach(function (a) { a.classList.toggle('is-active', a.getAttribute('href') === '#' + current); });
      }, { rootMargin: '-40% 0px -55% 0px', threshold: 0 });
      targets.forEach(function (t) { io.observe(t); });
    }
  }

  /* ---------- 2. what-we-do tabs ---------- */
  var tablist = $('.tabs[role="tablist"]');
  if (tablist) {
    var tabs = $$('[role="tab"]', tablist);
    var panels = tabs.map(function (t) { return $('#' + t.getAttribute('aria-controls')); });
    var select = function (i, focus) {
      tabs.forEach(function (t, j) {
        var on = i === j;
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        if (panels[j]) { panels[j].classList.toggle('is-active', on); panels[j].hidden = !on; }
      });
      if (focus) tabs[i].focus();
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i); });
      t.addEventListener('keydown', function (e) {
        var n = i;
        if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') n = 0;
        else if (e.key === 'End') n = tabs.length - 1;
        else return;
        e.preventDefault(); select(n, true);
      });
    });
  }

  /* ---------- 3. reveal ---------- */
  var revealEls = $$('.reveal');
  var staticMode = /[?&]static=1/.test(location.search);   // ?static=1 shows everything at once (screenshots, print)
  if (staticMode) document.documentElement.classList.add('static');
  if (prefersReduced || staticMode || !('IntersectionObserver' in window)) {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  } else {
    var ro = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-in'); ro.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    revealEls.forEach(function (el) { ro.observe(el); });
  }

  /* ---------- 4. team: hanging profile cards ----------
     Behaviour measured from the reference: cards hang from a sagging cord on fine wires;
     the pointer "pushes" a card (damped pendulum, ~2.7 Hz, settles in ~1 s); hovering tilts
     the card up to ±9°, lights a holographic sheen that follows the pointer, and flips it to
     the back (760 ms); leaving flips it back. On touch, a tap toggles the flip. */
  var tmSection = $('#team');
  if (tmSection) {
    var track = $('#tm-track'), cord = $('.tm-cord', track), cordPath = $('path', cord);
    var enters = $$('.tm-enter', track);
    var finePointer = window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    tmSection.classList.add('tm-ready');

    // the cord is a quadratic curve through every anchor, overshooting 32px past the outer ones;
    // each card hangs from the point where the curve passes its anchor
    var layoutCord = function () {
      if (!enters.length) return;
      var xs = enters.map(function (e) { return e.offsetLeft + e.offsetWidth / 2; });
      var left = xs[0] - 32, width = xs[xs.length - 1] - xs[0] + 64;
      cord.style.left = left + 'px'; cord.style.width = width + 'px';
      cord.setAttribute('viewBox', '0 0 ' + width + ' 50');
      cordPath.setAttribute('d', 'M 0 13 Q ' + (width / 2) + ' 57 ' + width + ' 13');
      enters.forEach(function (e, i) {
        var t = (xs[i] - left) / width;
        var y = 13 + 2 * (1 - t) * t * 44;          // y on the curve (control point at 57)
        e.style.marginTop = (y - 13).toFixed(2) + 'px';
      });
    };
    layoutCord();
    // on screens narrower than the rig (1276px) but wider than a phone, scale the whole
    // rig down so all four cards stay in view together; phones keep the swipe row
    var scrollEl = track.parentElement;
    var fitTrack = function () {
      var natural = track.scrollWidth, avail = scrollEl.clientWidth, s = avail / natural;
      if (s >= 1 || avail < 760) { track.style.transform = ''; track.style.transformOrigin = ''; scrollEl.style.height = ''; scrollEl.style.overflowX = ''; return; }
      track.style.transformOrigin = 'top left';
      track.style.transform = 'scale(' + s.toFixed(4) + ')';
      scrollEl.style.overflowX = 'hidden';
      scrollEl.style.height = Math.round(track.offsetHeight * s) + 'px';
      scrollEl.scrollLeft = 0;
    };
    fitTrack();
    window.addEventListener('resize', function () { layoutCord(); fitTrack(); });

    // entrance: drop in with a little swing, staggered 85 ms per card
    var played = false;
    var play = function () { if (played) return; played = true; enters.forEach(function (e) { e.classList.add('tm-enter-play'); }); };
    if (prefersReduced || staticMode || !('IntersectionObserver' in window)) play();
    else { var tio = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { play(); tio.disconnect(); } }); }, { threshold: 0.12 }); tio.observe(track); }

    // springs (mass 1): sway is soft and swings; tilt, highlight and glow are quicker
    var K_SWAY = 290, C_SWAY = 10.5, K_TILT = 510, C_TILT = 16, MAX_GLOW = 0.78;
    var cards = $$('.tm-item', track).map(function (item) {
      return { item: item, pend: $('.tm-pendulum', item), hit: $('.tm-hit', item), flipper: $('.tm-flipper', item), front: $('.tm-front', item), back: $('.tm-back', item),
        sway: 0, swayV: 0, rx: 0, rxV: 0, ry: 0, ryV: 0, px: 50, pxV: 0, py: 50, pyV: 0, il: 0, ilV: 0,
        tRx: 0, tRy: 0, tPx: 50, tPy: 50, tIl: 0, flipped: false, lastX: null };
    });
    var running = false, last = 0;
    var spring = function (c, x, v, target, k, damp, dt) { var a = -k * (c[x] - target) - damp * c[v]; c[v] += a * dt; c[x] += c[v] * dt; };
    var settled = function (c, x, v, target, eps) { return Math.abs(c[x] - target) < eps && Math.abs(c[v]) < eps * 10; };
    var step = function (now) {
      var dt = Math.min(0.032, Math.max(0.001, (now - last) / 1000)); last = now;
      var active = false;
      cards.forEach(function (c) {
        spring(c, 'sway', 'swayV', 0, K_SWAY, C_SWAY, dt);
        spring(c, 'rx', 'rxV', c.tRx, K_TILT, C_TILT, dt);
        spring(c, 'ry', 'ryV', c.tRy, K_TILT, C_TILT, dt);
        spring(c, 'px', 'pxV', c.tPx, K_TILT, C_TILT, dt);
        spring(c, 'py', 'pyV', c.tPy, K_TILT, C_TILT, dt);
        spring(c, 'il', 'ilV', c.tIl, K_TILT, C_TILT, dt);
        c.pend.style.setProperty('--sway', c.sway.toFixed(3) + 'deg');
        c.hit.style.setProperty('--rx', c.rx.toFixed(3) + 'deg');
        c.hit.style.setProperty('--ry', c.ry.toFixed(3) + 'deg');
        c.hit.style.setProperty('--px', c.px.toFixed(2) + '%');
        c.hit.style.setProperty('--py', c.py.toFixed(2) + '%');
        c.hit.style.setProperty('--il', Math.max(0, c.il).toFixed(3));
        if (!(settled(c, 'sway', 'swayV', 0, 0.003) && settled(c, 'rx', 'rxV', c.tRx, 0.003) && settled(c, 'ry', 'ryV', c.tRy, 0.003) &&
              settled(c, 'px', 'pxV', c.tPx, 0.02) && settled(c, 'py', 'pyV', c.tPy, 0.02) && settled(c, 'il', 'ilV', c.tIl, 0.001))) active = true;
      });
      if (active) requestAnimationFrame(step); else running = false;
    };
    var wake = function () { if (!running) { running = true; last = performance.now(); requestAnimationFrame(step); } };

    var setFlipped = function (c, on) {
      if (c.flipped === on) return;
      c.flipped = on;
      c.flipper.classList.toggle('is-flipped', on);
      c.front.setAttribute('aria-expanded', on ? 'true' : 'false');
      c.back.setAttribute('aria-hidden', on ? 'false' : 'true');
      c.swayV += on ? -60 : 40;                    // the turn gives the card a small kick
      wake();
    };

    cards.forEach(function (c) {
      var hit = c.hit;
      if (finePointer) {
        hit.addEventListener('pointerenter', function (e) { c.tIl = MAX_GLOW; c.lastX = e.clientX; setFlipped(c, true); wake(); });
        hit.addEventListener('pointermove', function (e) {
          var r = hit.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
          c.tPx = px * 100; c.tPy = py * 100;
          c.tRx = (0.5 - py) * 18; c.tRy = (px - 0.5) * 18;
          var dx = c.lastX == null ? 0 : e.clientX - c.lastX; c.lastX = e.clientX;
          c.swayV += Math.max(-60, Math.min(60, dx)) * 2.8;   // the pointer pushes the card along
          wake();
        });
        hit.addEventListener('pointerleave', function () { c.tIl = 0; c.tRx = 0; c.tRy = 0; c.lastX = null; setFlipped(c, false); wake(); });
      }
      hit.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        if (e.target.closest('.tm-close')) { setFlipped(c, false); return; }
        setFlipped(c, !c.flipped);
      });
      c.front.addEventListener('keydown', function (e) { if (e.key === 'Escape') setFlipped(c, false); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cards.forEach(function (c) { setFlipped(c, false); }); });

    // ?flip=2,3 pre-flips cards (static previews and screenshots)
    var fm = /[?&]flip=([\d,]+)/.exec(location.search);
    if (fm) fm[1].split(',').forEach(function (n) { var c = cards[+n - 1]; if (c) { c.flipped = true; c.flipper.classList.add('is-flipped'); c.front.setAttribute('aria-expanded', 'true'); c.back.setAttribute('aria-hidden', 'false'); } });
  }

  /* ---------- 5. booking calendar ---------- */
  var booker = $('#booker');
  if (booker) {
    var titleEl = $('[data-cal-title]', booker), daysEl = $('[data-cal-days]', booker);
    var prevBtn = $('[data-cal-prev]', booker), nextBtn = $('[data-cal-next]', booker);
    var tzSel = $('[data-tz]', booker);
    var slotTitle = $('[data-slot-title]', booker), slotSub = $('[data-slot-sub]', booker);
    var slotList = $('[data-slot-list]', booker), slotEmpty = $('[data-slot-empty]', booker);
    var sumEl = $('[data-sum]', booker), reqBtn = $('[data-request]', booker);
    var gcal = $('[data-gcal]', booker), gcalSep = $('[data-gcal-sep]', booker);

    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };

    // "now" expressed as a calendar date in the host zone
    var hostToday = (function () {
      var ms = Date.now() + FOURWARD.hostOffsetMin * 60000;
      var d = new Date(ms);
      return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
    })();
    var hostKey = function (y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); };
    var todayKey = hostKey(hostToday.y, hostToday.m, hostToday.d);
    var maxDate = new Date(Date.UTC(hostToday.y, hostToday.m, hostToday.d + FOURWARD.daysAhead));
    var maxKey = hostKey(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), maxDate.getUTCDate());

    // timezone list
    var browserTz = (Intl.DateTimeFormat().resolvedOptions().timeZone) || FOURWARD.hostTz;
    if (browserTz === 'Asia/Calcutta') browserTz = 'Asia/Kolkata';   // legacy alias some browsers still report
    var zones;
    try { zones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : null; } catch (e) { zones = null; }
    if (!zones || !zones.length) zones = ['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo'];
    if (zones.indexOf(browserTz) < 0) zones.unshift(browserTz);
    if (zones.indexOf(FOURWARD.hostTz) < 0) zones.unshift(FOURWARD.hostTz);
    zones.forEach(function (z) {
      var o = document.createElement('option'); o.value = z; o.textContent = z.replace(/_/g, ' '); tzSel.appendChild(o);
    });
    tzSel.value = browserTz;

    var view = { y: hostToday.y, m: hostToday.m };
    var selectedDay = null;   // {y,m,d}
    var selectedSlot = null;  // utc ms

    var fmt = function (ms, opts) {
      opts.timeZone = tzSel.value;
      return new Intl.DateTimeFormat('en-GB', opts).format(new Date(ms));
    };
    var tzShort = function (ms) {
      if (tzSel.value === 'Asia/Kolkata' || tzSel.value === 'Asia/Calcutta') return 'IST';
      try {
        var parts = new Intl.DateTimeFormat('en-GB', { timeZone: tzSel.value, timeZoneName: 'short' }).formatToParts(new Date(ms));
        var p = parts.filter(function (x) { return x.type === 'timeZoneName'; })[0];
        return p ? p.value : tzSel.value;
      } catch (e) { return tzSel.value; }
    };
    // true when the visitor's zone shows the same wall-clock time as the host zone
    var sameAsHost = function (ms) {
      var o = { hour: '2-digit', minute: '2-digit', day: 'numeric', hour12: false, timeZone: tzSel.value };
      var a = new Intl.DateTimeFormat('en-GB', o).format(new Date(ms));
      o.timeZone = FOURWARD.hostTz;
      return a === new Intl.DateTimeFormat('en-GB', o).format(new Date(ms));
    };

    var slotsFor = function (day) {
      var out = [];
      var earliest = Date.now() + FOURWARD.leadHours * 3600000;
      for (var t = FOURWARD.workStart; t + FOURWARD.slotMin <= FOURWARD.workEnd; t += FOURWARD.slotMin) {
        var ms = Date.UTC(day.y, day.m, day.d, 0, t) - FOURWARD.hostOffsetMin * 60000;
        if (ms >= earliest) out.push(ms);
      }
      return out;
    };

    var renderMonth = function () {
      titleEl.textContent = MONTHS[view.m] + ' ' + view.y;
      daysEl.innerHTML = '';
      var first = new Date(Date.UTC(view.y, view.m, 1));
      var lead = (first.getUTCDay() + 6) % 7;             // Monday first
      var count = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
      for (var i = 0; i < lead; i++) { var e = document.createElement('span'); e.className = 'day is-empty'; daysEl.appendChild(e); }
      for (var d = 1; d <= count; d++) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'day'; b.textContent = d;
        var key = hostKey(view.y, view.m, d);
        var dow = new Date(Date.UTC(view.y, view.m, d)).getUTCDay();
        var past = key < todayKey, far = key > maxKey, weekend = dow === 0 || dow === 6;
        var noSlots = key === todayKey && slotsFor({ y: view.y, m: view.m, d: d }).length === 0;
        if (past || far || weekend || noSlots) b.disabled = true;
        if (key === todayKey) b.classList.add('is-today');
        if (selectedDay && key === hostKey(selectedDay.y, selectedDay.m, selectedDay.d)) b.classList.add('is-selected');
        b.setAttribute('aria-label', DOW[dow] + ' ' + d + ' ' + MONTHS[view.m] + ' ' + view.y);
        (function (dd) { b.addEventListener('click', function () { pickDay({ y: view.y, m: view.m, d: dd }); }); })(d);
        daysEl.appendChild(b);
      }
      prevBtn.disabled = view.y === hostToday.y && view.m === hostToday.m;
      nextBtn.disabled = view.y === maxDate.getUTCFullYear() && view.m === maxDate.getUTCMonth();
    };

    var renderSlots = function () {
      slotList.innerHTML = '';
      if (!selectedDay) {
        slotTitle.textContent = 'Pick a day';
        slotSub.textContent = 'Monday to Friday, 10:00 to 18:30 India time';
        slotList.hidden = true; slotEmpty.hidden = false;
        slotEmpty.textContent = 'Choose a weekday on the calendar to see available times.';
        return;
      }
      var dayMs = Date.UTC(selectedDay.y, selectedDay.m, selectedDay.d, 6, 0);
      slotTitle.textContent = fmt(dayMs, { weekday: 'long', day: 'numeric', month: 'long' });
      slotSub.textContent = '30-minute slots · ' + tzShort(dayMs);
      var list = slotsFor(selectedDay);
      if (!list.length) { slotList.hidden = true; slotEmpty.hidden = false; slotEmpty.textContent = 'No times left on this day. Try the next one.'; return; }
      slotList.hidden = false; slotEmpty.hidden = true;
      var dayLabel = fmt(dayMs, { day: 'numeric', month: 'short' });
      list.forEach(function (ms) {
        var b = document.createElement('button');
        b.type = 'button'; b.className = 'slot';
        var local = fmt(ms, { hour: '2-digit', minute: '2-digit', hour12: false });
        var localDay = fmt(ms, { day: 'numeric', month: 'short' });
        b.textContent = localDay === dayLabel ? local : local + ' · ' + localDay;
        if (selectedSlot === ms) b.classList.add('is-selected');
        b.addEventListener('click', function () { selectedSlot = ms; renderSlots(); renderConfirm(); });
        slotList.appendChild(b);
      });
    };

    var renderConfirm = function () {
      if (!selectedSlot) {
        sumEl.textContent = 'No time selected yet';
        reqBtn.setAttribute('aria-disabled', 'true'); reqBtn.href = '#';
        gcal.hidden = true; gcalSep.hidden = true;
        return;
      }
      var start = selectedSlot, end = start + FOURWARD.slotMin * 60000;
      var local = fmt(start, { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' +
        fmt(start, { hour: '2-digit', minute: '2-digit', hour12: false }) + ' to ' + fmt(end, { hour: '2-digit', minute: '2-digit', hour12: false }) + ' ' + tzShort(start);
      var saved = tzSel.value, same = sameAsHost(start); tzSel.value = FOURWARD.hostTz;
      var host = fmt(start, { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + fmt(start, { hour: '2-digit', minute: '2-digit', hour12: false }) + ' IST';
      tzSel.value = saved;
      sumEl.textContent = local + (same ? '' : ' (' + host + ')');

      reqBtn.setAttribute('aria-disabled', 'false');
      var iso = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
      var gcalHref = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
        '&text=' + encodeURIComponent('Growth Strategy Session with Fourward') +
        '&dates=' + iso(start) + '/' + iso(end) +
        '&details=' + encodeURIComponent('30 minutes with the Fourward team: your free SEO, AEO and GEO audit walk-through.\n\nWe will cover where search, AI answers and pipeline stand today, and what a 30-day plan would move.\n\nYour website:\nThe number you need to move:\n\nBooked from ' + location.origin + location.pathname) +
        '&add=' + encodeURIComponent(FOURWARD.emails.join(','));
      reqBtn.href = FOURWARD.bookingUrl || gcalHref;
      reqBtn.target = '_blank'; reqBtn.rel = 'noopener';
      reqBtn.setAttribute('data-slot', new Date(start).toISOString());
      reqBtn.setAttribute('data-slot-label', host + (same ? '' : ' (' + local + ')'));
      gcal.hidden = true; gcalSep.hidden = true;
    };

    var pickDay = function (day) { selectedDay = day; selectedSlot = null; renderMonth(); renderSlots(); renderConfirm(); };

    prevBtn.addEventListener('click', function () { view.m--; if (view.m < 0) { view.m = 11; view.y--; } renderMonth(); });
    nextBtn.addEventListener('click', function () { view.m++; if (view.m > 11) { view.m = 0; view.y++; } renderMonth(); });
    tzSel.addEventListener('change', function () { renderSlots(); renderConfirm(); });
    reqBtn.addEventListener('click', function (e) {
      if (reqBtn.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
      fwSend({ type: 'booking', slot: reqBtn.getAttribute('data-slot'), slotLabel: reqBtn.getAttribute('data-slot-label'), visitorTz: tzSel.value }, true).catch(function () {});
    });

    renderMonth(); renderSlots(); renderConfirm();
  }

  /* ---------- 6. floating composer ("Talk" bar) ----------
     No backend: short answers for the usual questions, each pointing at the section that
     proves it; anything else is handed to the team by email. The mic uses the browser's
     own speech recognition where it exists (Chrome, Edge, Safari). */
  var talk = $('#talk');
  if (talk) {
    var tForm = $('#talk-form'), tInput = $('#talk-input'), tSend = $('#talk-send'), tMic = $('#talk-mic');
    var tSheet = $('#talk-sheet'), tLog = $('#talk-log'), tSuggest = $('#talk-suggest');
    var mailAll = 'mailto:' + FOURWARD.emails.join(',');

    // placeholder types itself, like a prompt waiting to be answered
    var prompts = ['Talk', 'Ask what we would do first', 'Ask how we report', 'Ask about the team', 'Talk'];
    var pIdx = 0, pTimer = null;
    var typePlaceholder = function () {
      if (prefersReduced || staticMode) { tInput.placeholder = 'Talk'; return; }
      var text = prompts[pIdx % prompts.length], i = 0;
      var tick = function () {
        if (document.activeElement === tInput && tInput.value) return;
        i++; tInput.placeholder = text.slice(0, i);
        if (i < text.length) pTimer = setTimeout(tick, 42);
        else pTimer = setTimeout(function () { pIdx++; typePlaceholder(); }, text === 'Talk' ? 5200 : 2600);
      };
      tick();
    };
    typePlaceholder();

    var autosize = function () { tInput.style.height = '20px'; tInput.style.height = Math.max(20, Math.min(120, tInput.scrollHeight - 16)) + 'px'; };
    tInput.addEventListener('input', function () { autosize(); tSend.disabled = !tInput.value.trim(); });
    tInput.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); tForm.requestSubmit(); } if (e.key === 'Escape') closeSheet(); });

    var openSheet = function () { if (tSheet.hidden) { tSheet.hidden = false; } };
    var closeSheet = function () { tSheet.hidden = true; };
    $('[data-talk-close]', talk).addEventListener('click', closeSheet);
    tInput.addEventListener('focus', openSheet);
    tForm.addEventListener('pointerdown', openSheet);
    tInput.addEventListener('input', function () { if (tInput.value) openSheet(); });
    document.addEventListener('pointerdown', function (e) { if (!talk.contains(e.target)) closeSheet(); });   // tap anywhere else to put it away; the conversation is kept
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

    var esc = function (s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); };
    var tChip = function (label, href, dark, external) {
      return '<a class="talk-chip' + (dark ? ' dark' : '') + '" href="' + href + '"' + (external ? ' target="_blank" rel="noopener"' : '') + '>' + esc(label) + ' <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>';
    };
    var answers = [
      { id: 'thanks', re: /\b(thanks|thank you|bye|goodbye|cheers)\b/i, text: 'Thanks for stopping by. If you would like to talk it through, pick a time below.', actions: [['Book a call', '#book', true]] },
      { id: 'hi', re: /\b(hi|hello|hey|yo|namaste)\b/i, text: 'Hi. Ask about the services, the proof, how we report, or pick a time below.', actions: [['See services', '#services'], ['Book a call', '#book', true]] },
      { id: 'check', re: /\b(visibility check|ai check|the check|the tool|your tool|visibility score|my score|scan my|check my)\b/i, text: 'The AI visibility check at the top runs 30 live tests on what Google, ChatGPT and Perplexity can read about your site, then gives one strict score out of 100 and your biggest gaps. You can have the full report emailed to you.', actions: [['Run the check', '#vis', true]] },
      { id: 'why', re: /\b(why (you|fourward|should|choose|hire|pick)|different|difference|unique|stand out|better than|agency|agencies|freelancer\w*|in-house)\b/i, text: 'One senior team that has run all of this together inside a B2B SaaS growth team. One plan and one weekly cadence, measured on pipeline.', actions: [['Meet the team', '#team'], ['Book a call', '#book', true]] },
      { id: 'timeline', re: /\b(how long|how soon|how quickly|how fast|timeline|time ?frame|turnaround|when (will|can|do) (i|we)|see results)\b/i, text: 'Within 24 hours of a call you get a written 30-day plan and the price. After that: a written update every week, a review call every two weeks and a full report every month.', actions: [['How we work', '#process'], ['Book a call', '#book', true]] },
      { id: 'services', re: /\b(what do you do|services?|offer|offerings|capabilit\w*|do you do|help (me|us) with|everything you do|what can you)\b/i, text: 'Everything a B2B SaaS marketing department does: search, content and AI visibility; brand, PR and partnerships; lifecycle and demand generation; field marketing and events. One senior team, one plan, measured on pipeline.', actions: [['See services', '#services'], ['Book a call', '#book', true]] },
      { id: 'free', re: /\b(free|audit|trial|special offer|discount|deal)\b/i, text: 'For a limited time we run a free SEO, AEO and GEO audit and a free 30-minute session to walk you through it. Run the AI visibility check at the top for a first look.', actions: [['Book your free session', '#book', true], ['Run the check', '#vis']] },
      { id: 'pricing', re: /\b(price|pricing|cost|budget|fee|retainer|sprint|how much|rates?)\b/i, text: 'Two ways in after the free audit: a monthly marketing partnership, or a fixed-scope project. The price comes with the written 30-day plan, within 24 hours of a call.', actions: [['Ways to work with us', '#process'], ['Book a call', '#book', true]] },
      { id: 'report', re: /\b(report|reporting|process|cadence|how do you work|dashboard|weekly|monthly|update)\b/i, text: 'A baseline report first, then a written progress update every week, a review call every two weeks and a full report every month, covering traffic, rankings, AI citations, coverage and pipeline.', actions: [['How we work', '#process']] },
      { id: 'team', re: /\b(team|who|people|founders?|sharang|deepak|geetanjali|rishabh)\b/i, text: 'One team of four senior marketers who worked side by side in a B2B SaaS growth team: Sharang Misri, Deepak Sharma, Geetanjali Sharma and Rishabh Gautam. The people on your first call lead the work.', actions: [['Meet the team', '#team']] },
      { id: 'proof', re: /\b(proof|results?|your work|past work|delivered|achieved|case|cases|numbers?|evidence|portfolio|clients?)\b/i, text: 'The work is in the What we do section: comparison pages built for AI answers, press and review programmes, nurture workflows and owned event nights. Pick a tab to see each one, or book the free audit to see it applied to your site.', actions: [['See the proof', '#what'], ['Book a call', '#book', true]] },
      { id: 'ai', re: /\b(ai|geo|aeo|chatgpt|perplexity|gemini|overview|overviews|llm|cited|citation)\b/i, text: 'Yes. We build comparison pages for the questions buyers now ask AI first, check which engines cite you for which questions, and fix what they cannot read.', actions: [['See the proof', '#what'], ['Run the AI check', '#vis']] },
      { id: 'seo', re: /\b(seo|search|content|blog|ranking|rank|traffic|website|cro|landing)\b/i, text: 'Search, content and AI visibility: SEO and technical SEO, GEO and AEO, content strategy, comparison pages and hubs, website and CRO, migrations and attribution.', actions: [['See services', '#services'], ['See the proof', '#what']] },
      { id: 'pr', re: /\b(pr|press|brand|media|review|reviews|g2|trustpilot|partnership|linkedin|positioning)\b/i, text: 'Brand, PR and partnerships: positioning, PR and media, thought leadership, online reputation management, LinkedIn organic marketing, social media marketing, partnerships and awards.', actions: [['See services', '#services'], ['See the proof', '#what']] },
      { id: 'lifecycle', re: /\b(email|hubspot|automation|lifecycle|nurture|webinar|webinars|newsletter|demand|abm|pipeline|sql|mql)\b/i, text: 'Lifecycle and demand generation: HubSpot and CRM, email workflows, newsletters, webinars and podcasts, ABM, sales enablement and funnel reporting from first touch to closed-won.', actions: [['See services', '#services']] },
      { id: 'events', re: /\b(event|events|dinner|summit|conference|roundtable|field|booth)\b/i, text: 'Field marketing and events: owned event series, executive dinners, partner events, paid media to fill the room and follow-up within the week, measured to SQL.', actions: [['See services', '#services'], ['See the proof', '#what']] },
      { id: 'start', re: /\b(start|begin|first|onboard|kick ?off|engage|hire|work with|how do we)\b/i, text: 'Book a 30-minute call with the Fourward team and tell us the number you need to move. We run a free audit, and within 24 hours you get a written 30-day plan and what it would cost.', actions: [['Book a call', '#book', true], ['How we start', '#process']] },
      { id: 'book', re: /\b(book|call|meeting|demo|calendar|schedule|talk to|speak|contact|reach)\b/i, text: 'Pick a time below; it opens Google Calendar with the Fourward team invited. The audit and the session are free for a limited time.', actions: [['Book a call', '#book', true], ['Contact us', 'contact/']] },
      { id: 'where', re: /\b(where|location|based|india|remote|time ?zones?|the us|usa|the uk|europe|canada|australia|countr\w*|international\w*|globally|overseas|abroad)\b/i, text: 'We are based in India and work with teams anywhere; call times are shown in your timezone in the booking calendar.', actions: [['Book a call', '#book', true]] }
    ];
    var reply = function (q) {
      var soft = { hi: 1, thanks: 1, services: 1, start: 1 }, hit = null;
      for (var i = 0; i < answers.length; i++) if (answers[i].re.test(q)) { if (!soft[answers[i].id]) return answers[i]; hit = hit || answers[i]; }
      if (hit) return hit;
      return { id: 'unknown', text: 'Noted. The quickest way to get a real answer is to send this to the team, or pick a time below and we will come prepared.', actions: [['Email this to the team', mailAll + '?subject=' + encodeURIComponent('From the Fourward website') + '&body=' + encodeURIComponent(q + '\n\n'), true, true], ['Book a call', '#book']] };
    };
    var tAdd = function (cls, html) { var d = document.createElement('div'); d.className = 'talk-msg ' + cls; d.innerHTML = html; tLog.appendChild(d); tSheet.scrollTop = tSheet.scrollHeight; return d; };
    var ask = function (q) {
      q = q.trim(); if (!q) return;
      openSheet(); tSuggest.hidden = true;
      tAdd('user', esc(q));
      var typing = tAdd('bot', '<span class="talk-typing"><i></i><i></i><i></i></span>');
      var a = reply(q);
      setTimeout(function () {
        typing.innerHTML = esc(a.text) + '<div class="talk-actions">' + a.actions.map(function (x) { return tChip(x[0], x[1], x[2], x[3]); }).join('') + '</div>';
        tSheet.scrollTop = tSheet.scrollHeight;
      }, prefersReduced ? 0 : 650);
      tInput.value = ''; autosize(); tSend.disabled = true; tInput.focus();
    };
    tForm.addEventListener('submit', function (e) { e.preventDefault(); ask(tInput.value); });
    $$('[data-talk-ask]', talk).forEach(function (b) { b.addEventListener('click', function () { ask(b.getAttribute('data-talk-ask')); }); });
    tLog.addEventListener('click', function (e) { var a = e.target.closest('a'); if (a && a.getAttribute('href').charAt(0) === '#') closeSheet(); });

    // speech to text where the browser offers it
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      tMic.hidden = false;
      var rec = null, listening = false;
      tMic.addEventListener('click', function () {
        if (listening) { rec.stop(); return; }
        rec = new SR(); rec.lang = (navigator.language || 'en-IN'); rec.interimResults = true; rec.maxAlternatives = 1;
        var base = tInput.value ? tInput.value.replace(/\s+$/, '') + ' ' : '';
        rec.onstart = function () { listening = true; tMic.classList.add('is-listening'); tInput.placeholder = 'Listening…'; };
        rec.onresult = function (ev) { var s = ''; for (var i = 0; i < ev.results.length; i++) s += ev.results[i][0].transcript; tInput.value = base + s; autosize(); tSend.disabled = !tInput.value.trim(); };
        rec.onerror = function () { listening = false; tMic.classList.remove('is-listening'); tInput.placeholder = 'Talk'; };
        rec.onend = function () { listening = false; tMic.classList.remove('is-listening'); tInput.placeholder = 'Talk'; if (tInput.value.trim()) tInput.focus(); };
        try { rec.start(); } catch (err) { listening = false; }
      });
    }

    /* ---- voice mode: a hands-free conversation ----
       Listens with the browser's speech recognition, answers from the same replies as the text chat,
       and speaks them with pre-rendered neural voice clips (assets/voice/<id>.mp3, Kokoro, Apache-2.0).
       The orb follows the microphone while you talk and the voice while it answers. */
    (function () {
    var VOICE = {"greet":["Hi, I'm Fourward's voice assistant. Ask me what we do, what we've delivered, how we report, or how to get started.","Hey there, welcome to Fourward. I can tell you about our services, our results, how we report, or how to book a call. What would you like to know?","Hello! I'm here to answer questions about Fourward. Try asking what we do, or what we've delivered for other teams."],"hi":["Hi there. You can ask about our services, the proof behind them, how we report, or book a time with the team.","Hello again. Ask me anything about how we work, what we've shipped, or how to get started.","Hey. Happy to help. Our services, our results, pricing, or booking a call. Where should we start?"],"services":["We work as your whole marketing department. Search, content and AI visibility. Brand, PR and partnerships. Lifecycle and demand generation. And field marketing and events. One senior team, one plan, measured on pipeline.","Think of us as a full marketing team you can plug in. We cover search and AI visibility, brand and PR, lifecycle and demand, and events, all run together by one senior team, on a single plan.","In short, everything a B2B SaaS marketing department does, from SEO and PR to email, webinars and events. One senior team leads it all, on one plan, with pipeline as the scoreboard."],"free":["Right now, for a limited time, we're running a free SEO, AEO and GEO audit, plus a free thirty-minute session to walk you through it. For a quick first look, try the AI visibility check at the top of the page.","Yes, there's a free offer on at the moment. You get a full SEO, AEO and GEO audit, and a thirty-minute session where we walk you through it. It's for a limited time, so it's worth booking soon.","For a limited time, the audit is free, and so is the thirty-minute session to go through it together. If you want a taste first, run the AI visibility check at the top of this page."],"pricing":["After the free audit, there are two ways to work with us. A monthly marketing partnership, or a fixed-scope project. You get the price along with a written thirty-day plan, within 24 hours of a call.","It depends on what you need. Most teams choose a monthly partnership, where we run marketing with you month after month. Others start with a fixed project. Either way, the price comes with a written plan, within 24 hours.","We keep pricing simple: a monthly partnership, or a defined project. The exact number comes with your written thirty-day plan, within 24 hours of our first call."],"report":["You get a baseline report first. Then a written update every week, a review call every two weeks, and a full report every month, covering traffic, rankings, AI citations, coverage and pipeline.","Reporting starts with a baseline, so you can see where you stand. From there it's a written update every week, a review call every fortnight, and a full report every month.","You'll never have to chase us for numbers. Weekly written updates, a call every two weeks, and a full report each month. It covers traffic, rankings, AI citations, press coverage and pipeline."],"team":["We're one team of four senior marketers, who worked side by side in a B2B SaaS growth team: Sharang Misri, Deepak Sharma, Geetanjali Sharma, and Rishabh Gautam. The people on your first call lead the work.","There are four of us, and we worked side by side in the same SaaS growth team. The senior people you meet are the ones who lead your marketing, together.","It's one senior team: Sharang, Deepak, Geetanjali and Rishabh. Between us, we cover search, brand, lifecycle and events, and we plan and report as one team."],"proof":["The best proof is the work itself. Pick a tab in the What we do section to see it: comparison pages built for AI answers, press and review programmes, nurture workflows, and owned event nights.","We'd rather show than claim. The What we do section walks through the work, from comparison pages and archive consolidation, to CRM clean-ups, webinars and partner dinners. And the free audit shows what we'd do for you.","Start with the What we do section. Each tab shows a piece of the work, like AI citation checks, LinkedIn programmes, or event follow-up that reaches sales within the week. Then book the free audit to see it applied to your site."],"ai":["Yes, AI visibility is a big part of what we do. We build comparison pages for the questions buyers now ask AI first, check which engines cite you and for which questions, and fix what they can't read.","Absolutely. We look at what ChatGPT, Perplexity and Google's AI answers say about you, find the pages and facts they're missing, and build the content they quote.","That's right in our wheelhouse. We help ChatGPT, Perplexity and Google's AI Overviews find you and quote you. And for a quick read on where you stand, the visibility check at the top of the page does that in under a minute."],"seo":["Yes, we do SEO end to end. Technical SEO, GEO and AEO, content strategy, comparison pages, conversion work, migrations and attribution.","Search is a core part of what we do. Technical fixes, content programmes, comparison pages and learning hubs, website and conversion work, plus migrations and analytics. All of it tied back to pipeline.","We cover search from every angle. From technical fixes and site migrations, to content and comparison pages, to conversion and attribution. And AI search too, not just Google's blue links."],"pr":["On brand and PR, we handle positioning, media relations, thought leadership, online reputation management, LinkedIn organic marketing, social media, and partnerships.","We make sure people other than you describe you the way you want. That means press, founder bylines, review sites like G2 and Trustpilot, LinkedIn, social media, and partnerships.","Brand work covers positioning, PR, thought leadership and online reputation. We pitch the trade press your buyers read, run LinkedIn for the company and its founders, and manage review platforms like G2 and Trustpilot."],"lifecycle":["For lifecycle and demand generation, we run HubSpot automation, email workflows, newsletters and gated content, webinars and podcasts, account-based marketing, and funnel reporting from first touch to closed-won.","That's about turning readers into demos, and demos into pipeline. We run HubSpot, email journeys, newsletters, webinars and account-based plays, with funnel reporting you can actually trace.","We set up the automation, the email journeys, the webinars and the ABM plays. Then we report the whole funnel, from first touch all the way to closed-won."],"events":["For field marketing and events, we plan owned event series, executive dinners and summits, partner events, paid media to fill the room, and follow-up within the week. All of it measured to SQL.","We plan owned series, executive dinners and co-hosted partner events. We fill the room with paid media, and follow up within a week, so every attendee reaches sales with context.","We get the right buyers in a room, then follow up within the week. That covers dinners, summits, co-hosted partner events, and the content that comes out of them."],"start":["It starts with a thirty-minute call with the Fourward team. Tell us the number you need to move. We run a free audit, and within 24 hours, you'll get a written thirty-day plan, and what it would cost.","Getting started is easy. Book a call, tell us the one number you most need to move, and we'll come back with a free audit and a written plan within 24 hours.","The first step is a short call. Then a free audit, a written plan, and a kickoff once you say yes. You decide at every step."],"book":["Just pick a time in the calendar on this page. It opens Google Calendar with the Fourward team invited. The audit and the session are free, for a limited time.","Sure. Scroll to the booking calendar and choose a slot that suits you. It drops straight into Google Calendar, with the Fourward team invited.","The calendar on this page shows times in your own timezone. Pick one, and the invite goes to the Fourward team. And for now, the session is free."],"where":["We're based in India, and we work with teams anywhere. The booking calendar shows call times in your own timezone.","Our team is in India, but we work with companies all over the world. When you book, the times are shown in your local timezone.","We're India-based and fully remote friendly. Wherever you are, the calendar adjusts the call times to your timezone."],"why":["Because you get one senior team that's already done this together, inside a SaaS growth team. One plan and one weekly cadence, measured on pipeline.","The big difference is that we're one team, not a set of freelancers stitched together. Everything runs on one plan, and we're measured on pipeline, not vanity metrics.","You get a whole marketing team, already assembled. Senior people who have worked side by side before, a single plan, and reporting that ties back to revenue."],"timeline":["Things move quickly. Within 24 hours of a call, you get a written thirty-day plan and a price. After that, there's a written update every week, so you'll see progress from the first week.","You won't wait long. The plan arrives within 24 hours of our first call, and it maps out your first thirty days. Weekly updates mean you always know what's moved.","The first milestone is your written thirty-day plan, within 24 hours of our call. From there, expect a weekly update, a review call every two weeks, and a full monthly report."],"check":["The AI visibility check at the top of the page runs thirty live tests on what Google, ChatGPT and Perplexity can read about your site. It gives you one strict score out of a hundred, plus your biggest gaps.","It's a free tool at the top of the page. Type in your domain, and in under a minute it checks your crawler access, structured data, entity signals and content, then scores you out of a hundred.","Try the visibility check at the top of the page. It reads your site live, runs thirty tests, and shows exactly where AI engines lose track of you. You can also have the full report emailed to you."],"thanks":["Thanks for stopping by. If you'd like to talk it through, pick a time on this page. Bye for now.","You're welcome. Whenever you're ready, the booking calendar is right on this page. Have a great day.","My pleasure. If anything else comes up, just ask, or book a call with the team. Take care."],"unknown":["Good question. That one's best answered by the team directly. I've put an email button on screen, or you can pick a time to talk.","Hmm, I don't have a good answer for that one. The team will, though. You can email them with the button on screen, or book a quick call.","That's a little outside what I can answer here. Send it to the team with the email button, and they'll come back to you, or grab a slot in the calendar."],"noheard":["Sorry, I didn't catch that. Try asking what we do, or tap one of the questions below.","I didn't quite hear you. Could you say that again, or tap a question below?","Sorry, it went quiet on my side. Try once more, or pick one of the questions on screen."]};
    var vc = $('#talk-vc'), vBtn = $('#talk-voice');
    if (vc && vBtn) {
      var vBase = (function () { var s = $('script[src*="js/site.js"]'); return s ? s.src.replace(/js\/site\.js.*$/, 'assets/voice/') : 'assets/voice/'; })();
      var vStatus = $('[data-tv-status]', vc), vYou = $('[data-tv-you]', vc), vSay = $('[data-tv-say]', vc), vActs = $('[data-tv-actions]', vc), vSug = $('[data-tv-suggest]', vc);
      var vMute = $('[data-tv-mute]', vc), canvas = $('.tv-orb', vc), ctx = canvas.getContext('2d');
      var STATUS = { connecting: 'Connecting…', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking. Tap the orb to interrupt', paused: 'Tap the orb to talk', muted: 'Mic off. Tap a question', blocked: 'Microphone blocked. Tap a question', unsupported: 'Tap a question to hear the answer' };
      var vOpen = false, actx = null, micAn = null, outAn = null, micStream = null, audioEl = null, rec = null, muted = false, misses = 0, words = [], wordEnds = [], level = 0, frame = 0, demo = false, synthTimer = null;
      var setState = function (s) { vc.setAttribute('data-state', s); vStatus.textContent = STATUS[s] || ''; };

      // ---- orb ----
      var S = 220, dpr = Math.min(2, window.devicePixelRatio || 1);
      var sizeOrb = function () { S = canvas.clientWidth || 220; canvas.width = S * dpr; canvas.height = S * dpr; };
      var buf = null;
      var rms = function (an) { if (!an) return 0; if (!buf || buf.length !== an.fftSize) buf = new Uint8Array(an.fftSize); an.getByteTimeDomainData(buf); var s = 0; for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; s += v * v; } return Math.min(1, Math.sqrt(s / buf.length) * 4.2); };
      var BLOBS = [['140,123,255', 0, .55], ['255,90,43', 2.1, .5], ['232,23,124', 4.2, .46], ['0,179,154', 1.1, .42]];
      var path = function (c, R, t, amp) { ctx.beginPath(); for (var k = 0; k <= 96; k++) { var a = k / 96 * Math.PI * 2; var r = R * (1 + 0.035 * Math.sin(a * 3 + t * 1.1) + amp * 0.09 * Math.sin(a * 5 - t * 2.6) + amp * 0.05 * Math.sin(a * 8 + t * 3.4)); var x = c + Math.cos(a) * r, y = c + Math.sin(a) * r; if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); } ctx.closePath(); };
      var draw = function (ms) {
        if (!vOpen) return;
        var t = ms / 1000, st = vc.getAttribute('data-state');
        var target = st === 'listening' ? rms(micAn) : st === 'speaking' ? (outAn ? rms(outAn) : 0.35 + 0.25 * Math.sin(t * 9) * Math.sin(t * 3.3)) : st === 'thinking' ? 0.22 + 0.08 * Math.sin(t * 6) : 0.04;
        if (demo) target = 0.3 + 0.25 * Math.abs(Math.sin(t * 4.1) * Math.sin(t * 1.7));
        level += (target - level) * (target > level ? 0.35 : 0.12);
        var spin = st === 'thinking' ? 2.4 : st === 'speaking' ? 1.4 : 0.6;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, S, S);
        var c = S / 2, R = S * 0.3 * (1 + level * 0.16);
        var halo = ctx.createRadialGradient(c, c, R * 0.7, c, c, R * 1.65);
        halo.addColorStop(0, 'rgba(140,123,255,' + (0.16 + level * 0.3).toFixed(3) + ')'); halo.addColorStop(0.55, 'rgba(232,23,124,' + (0.05 + level * 0.1).toFixed(3) + ')'); halo.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = halo; ctx.fillRect(0, 0, S, S);
        if (st === 'listening') { for (var q = 0; q < 2; q++) { var p = ((t * 0.7 + q * 0.5) % 1); ctx.beginPath(); ctx.arc(c, c, R * (1.05 + p * 0.55), 0, Math.PI * 2); ctx.strokeStyle = 'rgba(140,123,255,' + ((1 - p) * 0.35).toFixed(3) + ')'; ctx.lineWidth = 1.5; ctx.stroke(); } }
        ctx.save(); path(c, R, t, level); ctx.clip();
        var base = ctx.createLinearGradient(0, c - R, 0, c + R); base.addColorStop(0, '#FFFFFF'); base.addColorStop(1, '#F1ECFF'); ctx.fillStyle = base; ctx.fillRect(0, 0, S, S);
        ctx.filter = 'blur(' + Math.round(S * 0.07) + 'px)';
        BLOBS.forEach(function (b, i) {
          var a = t * spin * (0.5 + i * 0.13) + b[1];
          var x = c + Math.cos(a) * R * 0.48, y = c + Math.sin(a * 1.3) * R * 0.44, r = R * (b[2] + 0.1 * Math.sin(t * 1.3 + i) + level * 0.28);
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = 'rgba(' + b[0] + ',.82)'; ctx.fill();
        });
        ctx.filter = 'none';
        var gl = ctx.createRadialGradient(c - R * 0.35, c - R * 0.42, 0, c - R * 0.35, c - R * 0.42, R * 0.9); gl.addColorStop(0, 'rgba(255,255,255,.85)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gl; ctx.fillRect(0, 0, S, S);
        ctx.restore();
        path(c, R, t, level); ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.stroke();
        // captions follow the voice
        if (st === 'speaking' && audioEl && !audioEl.paused && audioEl.duration) markWords(audioEl.currentTime / audioEl.duration);
        frame = requestAnimationFrame(draw);
      };

      // ---- captions ----
      var setCaption = function (text) {
        var parts = text.split(/\s+/), total = 0;
        wordEnds = parts.map(function (w) { total += w.length + 2 + (/[.,;:?!]$/.test(w) ? 5 : 0); return total; }).map(function (x) { return x / total; });
        vSay.innerHTML = parts.map(function (w) { return '<span class="w">' + esc(w) + '</span>'; }).join(' ');
        words = $$('.w', vSay);
      };
      var markWords = function (p) { for (var i = 0; i < words.length; i++) words[i].classList.toggle('on', (i ? wordEnds[i - 1] : 0) <= p + 0.015); };

      // ---- voice out ----
      var bestVoice = function () {
        var vs = (window.speechSynthesis ? speechSynthesis.getVoices() : []).filter(function (v) { return /^en/i.test(v.lang); });
        var sc = function (v) { return (/natural|neural|online/i.test(v.name) ? 20 : 0) + (/premium|enhanced/i.test(v.name) ? 14 : 0) + (/google/i.test(v.name) ? 8 : 0) + (/ava|aria|jenny|emma|libby|sonia|samantha/i.test(v.name) ? 4 : 0) + (/en-(us|gb)/i.test(v.lang) ? 1 : 0); };
        return vs.sort(function (a, b) { return sc(b) - sc(a); })[0] || null;
      };
      var stopVoice = function () { if (audioEl) { audioEl.onended = audioEl.onerror = null; audioEl.pause(); } if (window.speechSynthesis) speechSynthesis.cancel(); clearInterval(synthTimer); };
      var speak = function (id, text, done) {
        stopVoice(); setCaption(text); setState('speaking');
        var finished = false, end = function () { if (finished) return; finished = true; markWords(1); if (done) done(); };
        var fallback = function () {
          if (!window.speechSynthesis) { setTimeout(end, 400 + text.length * 55); return; }
          var u = new SpeechSynthesisUtterance(text), v = bestVoice(); if (v) u.voice = v; u.rate = 1.02; u.pitch = 1;
          var t0 = Date.now(), est = text.length * 62; clearInterval(synthTimer);
          synthTimer = setInterval(function () { markWords(Math.min(1, (Date.now() - t0) / est)); }, 80);
          u.onend = function () { clearInterval(synthTimer); end(); }; u.onerror = function () { clearInterval(synthTimer); end(); };
          speechSynthesis.speak(u);
        };
        audioEl.onended = end; audioEl.onerror = function () { audioEl.onerror = null; fallback(); };
        audioEl.src = vBase + id + '.mp3?v=1';
        var pr = audioEl.play(); if (pr && pr.catch) pr.catch(function () { audioEl.onerror = null; fallback(); });
      };

      // ---- voice in ----
      var listen = function () {
        if (!vOpen || demo) return;
        if (!SR) { setState('unsupported'); return; }
        if (muted) { setState('muted'); return; }
        try { if (rec) rec.abort(); } catch (e) {}
        rec = new SR(); rec.lang = /^en/i.test(navigator.language || '') ? navigator.language : 'en-US'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
        var got = false;
        rec.onstart = function () { setState('listening'); };
        rec.onresult = function (ev) {
          var s = '', fin = false; for (var i = 0; i < ev.results.length; i++) { s += ev.results[i][0].transcript; if (ev.results[i].isFinal) fin = true; }
          vYou.textContent = '“' + s.trim() + '”';
          if (fin && !got) { got = true; try { rec.stop(); } catch (e) {} handle(s); }
        };
        rec.onerror = function (ev) { if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { got = true; setState('blocked'); } };
        rec.onend = function () {
          if (got || !vOpen) return;
          misses++;
          if (misses < 3) setTimeout(listen, 150);
          else { misses = 0; speakLine('noheard', function () { setState('paused'); }); }
        };
        try { rec.start(); } catch (e) { setState('paused'); }
      };
      // every answer has a few phrasings; asking again moves to the next one, so it never repeats word for word
      var turns = {};
      try { turns = JSON.parse(localStorage.getItem('fw-voice-turns') || '{}') || {}; } catch (e) {}
      var pickLine = function (id, fallback) {
        var list = VOICE[id]; if (!list) return { file: null, text: fallback };
        list = [].concat(list);
        var n = turns[id] || 0, i = n % list.length;
        turns[id] = n + 1; try { localStorage.setItem('fw-voice-turns', JSON.stringify(turns)); } catch (e) {}
        return { file: id + (i ? '-' + (i + 1) : ''), text: list[i] };
      };
      var speakLine = function (id, done) { var l = pickLine(id); speak(l.file, l.text, done); };
      var handle = function (q) {
        q = String(q || '').trim(); if (!q) return;
        misses = 0; vYou.textContent = '“' + q + '”'; vActs.innerHTML = ''; vSug.hidden = true; setState('thinking');
        var a = reply(q), id = a.id || 'unknown', line = pickLine(id, a.text);
        // the text chat keeps the same transcript, in the words that were spoken
        tSuggest.hidden = true; tAdd('user', esc(q));
        tAdd('bot', esc(line.text) + '<div class="talk-actions">' + a.actions.map(function (x) { return tChip(x[0], x[1], x[2], x[3]); }).join('') + '</div>');
        setTimeout(function () {
          if (!vOpen) return;
          vActs.innerHTML = a.actions.map(function (x) { return tChip(x[0], x[1], x[2], x[3]); }).join('');
          speak(line.file || 'none', line.text, function () { if (vOpen) setTimeout(listen, 250); });
        }, prefersReduced ? 0 : 420);
      };

      // ---- open / close ----
      var openVoice = function () {
        if (vOpen) return;
        vOpen = true; demo = /[?&]voice=demo/.test(location.search); closeSheet();
        talk.classList.add('is-voice'); vc.hidden = false; sizeOrb();
        vYou.textContent = ''; vActs.innerHTML = ''; vSug.hidden = false; setState('connecting');
        if (!audioEl) { audioEl = new Audio(); audioEl.preload = 'auto'; audioEl.crossOrigin = 'anonymous'; }
        try {
          var AC = window.AudioContext || window.webkitAudioContext;
          if (AC && !actx) { actx = new AC(); outAn = actx.createAnalyser(); outAn.fftSize = 1024; actx.createMediaElementSource(audioEl).connect(outAn); outAn.connect(actx.destination); }
          if (actx && actx.state === 'suspended') actx.resume();
        } catch (e) { outAn = null; }
        cancelAnimationFrame(frame); frame = requestAnimationFrame(draw);
        if (demo) { setCaption(VOICE.services[0]); markWords(0.55); vYou.textContent = '“What do you do?”'; vSug.hidden = true; vActs.innerHTML = tChip('See services', '#services') + tChip('Book a call', '#book', true); setState('speaking'); return; }
        speakLine('greet', function () { if (vOpen) listen(); });   // starts inside the click, so mobile browsers allow the audio
        if (SR && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && actx) {
          navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then(function (s) {
            if (!vOpen) { s.getTracks().forEach(function (k) { k.stop(); }); return; }
            micStream = s; micAn = actx.createAnalyser(); micAn.fftSize = 1024; actx.createMediaStreamSource(s).connect(micAn);
          }).catch(function () { micAn = null; });
        }
      };
      var closeVoice = function () {
        if (!vOpen) return;
        vOpen = false; stopVoice();
        try { if (rec) { rec.onend = null; rec.abort(); } } catch (e) {}
        if (micStream) { micStream.getTracks().forEach(function (k) { k.stop(); }); micStream = null; micAn = null; }
        cancelAnimationFrame(frame); vc.hidden = true; talk.classList.remove('is-voice');
      };
      vBtn.addEventListener('click', openVoice);
      $$('[data-tv-end]', vc).forEach(function (b) { b.addEventListener('click', closeVoice); });
      $('[data-tv-text]', vc).addEventListener('click', function () { closeVoice(); openSheet(); tInput.focus(); });
      $('[data-tv-orb]', vc).addEventListener('click', function () {
        var st = vc.getAttribute('data-state');
        if (st === 'speaking' || st === 'connecting') { stopVoice(); listen(); }
        else if (st === 'listening') { try { rec.stop(); } catch (e) {} }
        else listen();
      });
      vMute.addEventListener('click', function () {
        muted = !muted; vMute.setAttribute('aria-pressed', String(muted)); vMute.classList.toggle('is-on', muted);
        if (muted) { try { if (rec) { rec.onend = null; rec.abort(); } } catch (e) {} if (vc.getAttribute('data-state') === 'listening') setState('muted'); }
        else if (vc.getAttribute('data-state') !== 'speaking') listen();
      });
      $$('[data-tv-ask]', vc).forEach(function (b) { b.addEventListener('click', function () { try { if (rec) { rec.onend = null; rec.abort(); } } catch (e) {} stopVoice(); handle(b.getAttribute('data-tv-ask')); }); });
      vActs.addEventListener('click', function (e) { var a = e.target.closest('a'); if (a && a.getAttribute('href').charAt(0) === '#') closeVoice(); });
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && vOpen) closeVoice(); });
      window.addEventListener('resize', function () { if (vOpen) sizeOrb(); });
      if (/[?&]voice=(1|demo)/.test(location.search)) setTimeout(openVoice, 300);
    }
    })();

    // ?talk=<question> opens the sheet with that question (screenshots, QA)
    var tq = /[?&]talk=([^&]+)/.exec(location.search);
    if (tq) ask(decodeURIComponent(tq[1].replace(/\+/g, ' ')));
  }



  /* ---------- 7. AI visibility check ----------
     75 checks in five groups, run on our server (functions/api/ai-check.js) in four parts, so the scan shows
     real progress. The findings never reach the browser until an email unlocks them:
       GET  /api/ai-check?part=...      scan-step lines, points per group and a sealed copy of the results
       POST {action:'summary'}          score, grade, group scores and counts (no findings)
       POST {action:'unlock', email}    every result; the server emails the report and logs the lead
     The homepage card and the tool page share this code. The tool page also has #results, the detailed
     section: locked rows until the report is unlocked. State is kept in the browser for 24 hours per site,
     so ?check=domain links open at once. ?dryrun=1 runs everything without logging or emailing (for QA). */
  (function () {
  var vis = $('#vis');
  if (!vis) return;
  var API = FOURWARD.checkUrl || '/api/ai-check';
  var DRY = /[?&]dryrun=1/.test(location.search);
  var res = $('#results');
  var V = {
    form: $('#vis-form'), input: $('#vis-domain'), intro: $('[data-vis-intro]', vis), result: $('[data-vis-result]', vis), error: $('[data-vis-error]', vis),
    scan: $('[data-vis-scan]', vis), bar: $('[data-vis-bar]', vis), pct: $('[data-vis-pct]', vis), steps: $('[data-vis-steps]', vis), log: $('[data-vis-log]', vis), scanDomain: $('[data-vis-scan-domain]', vis),
    gate: $('[data-vis-gate]', vis), open: $('[data-vis-open]', vis), openMsg: $('[data-vis-open-msg]', vis), detail: $('[data-vis-detail]', vis), mail: $('[data-vis-mail]', vis)
  };
  var ICON = { crawl: 'i-search', page: 'i-grid', schema: 'i-flag', entity: 'i-users', content: 'i-chat' };
  var GLY = { fail: '✕', warn: '!', pass: '✓', skip: '–' };
  var LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  var escH = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var withTimeout = function (p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); };
  var cleanDomain = function (s) { s = String(s || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#\s]/)[0]; return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : ''; };
  var privacyHref = (function () { var a = document.querySelector('footer a[href$="privacy/"]'); return a ? a.getAttribute('href') : '/privacy/'; })();
  var meta = function () { return { page: location.href.split('#')[0], referrer: document.referrer || '', tz: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''), lang: navigator.language || '' }; };
  var store = { get: function (k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
  var lead = function () { var l = store.get('fw-lead'); return l && l.email ? l : null; };

  /* ---- server calls ---- */
  var api = function (params) {
    var q = Object.keys(params).filter(function (k) { return params[k] !== '' && params[k] != null; }).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    return withTimeout(fetch(API + '?' + q, { headers: { 'Accept': 'application/json' } }).then(function (r) { return r.json(); }), 50000).then(function (j) { if (!j || !j.ok) throw new Error((j && j.error) || 'failed'); return j; });
  };
  var post = function (body) {
    return withTimeout(fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }), 30000);
  };

  /* ---- state, kept for a day ---- */
  var S = null, CACHE = 'fw-vis5:';
  var readCache = function (d) { var j = store.get(CACHE + d); return j && j.teaser && j.sealed && Date.now() - j.ts < 864e5 ? j : null; };
  var writeCache = function () {
    if (!S || !S.teaser) return;
    try { for (var i = localStorage.length - 1; i >= 0; i--) { var k = localStorage.key(i); if (k && k.indexOf(CACHE) === 0) { var o = store.get(k); if (!o || Date.now() - o.ts > 864e5) localStorage.removeItem(k); } } } catch (e) {}
    store.set(CACHE + S.domain, { domain: S.domain, ts: S.ts, secs: S.secs, sealed: S.sealed, teaser: S.teaser, full: S.full || null, email: S.email || '', mailed: S.mail === 'sending' || S.mail === 'dry' || S.mail === 'sent' });
  };

  /* ---- the live scan: every line is a real request finishing ---- */
  var STEPS = [
    ['home', 'Fetching your homepage'],
    ['nojs', 'Reading it without JavaScript, as AI crawlers do'],
    ['schema', 'Parsing structured data'],
    ['robots', 'Reading robots.txt for 10 AI crawlers'],
    ['firewall', 'Knocking as ChatGPT, Claude and Perplexity'],
    ['sitemap', 'Reading and sampling your sitemap'],
    ['pages', 'Opening your pricing and comparison pages'],
    ['wiki', 'Checking Wikidata and Wikipedia'],
    ['community', 'Counting Reddit and Hacker News threads'],
    ['demand', 'Checking whether buyers search for you'],
    ['score', 'Scoring 75 checks']
  ];
  var ALIAS = { content: 'pages', wikidata: 'wiki' };          // server lines that warm up a row before its own line lands
  var ST = {}, shown = 0, creep = null;
  var renderSteps = function () { V.steps.innerHTML = STEPS.map(function (x) { return '<li class="vis-step" data-step="' + x[0] + '"><span class="vis-step-i" aria-hidden="true"></span><span class="vis-step-l">' + x[1] + '</span><span class="vis-step-d"></span></li>'; }).join(''); };
  var target = function () { var d = 0, r = 0; STEPS.forEach(function (x) { var st = ST[x[0]]; if (st === 'done') d++; else if (st === 'run') r++; }); return Math.min(99, ((d + r * 0.35) / STEPS.length) * 100); };
  var paint = function (p) { shown = p; V.bar.style.width = p.toFixed(1) + '%'; V.pct.textContent = Math.floor(p) + '%'; };
  var step = function (id, state, detail, tone) {
    if (ST[id] === 'done' && state === 'run') return;
    ST[id] = state; var li = $('[data-step="' + id + '"]', V.steps); if (!li) return;
    li.className = 'vis-step is-' + state + (tone ? ' is-' + tone : '');
    if (detail != null) $('.vis-step-d', li).textContent = detail;
  };
  var say = function (t) { if (V.log) V.log.innerHTML = '<span>&rsaquo;</span>' + escH(t); };
  var stopCreep = function () { clearInterval(creep); creep = null; };
  var startCreep = function () { stopCreep(); creep = setInterval(function () { var t = target(); if (shown < t) paint(Math.min(t, shown + Math.max(0.6, (t - shown) * 0.18))); else if (shown < 98) paint(shown + 0.04); }, 90); };
  // a part came back: land its lines one after another
  var playSteps = function (steps) {
    (steps || []).forEach(function (s, i) {
      setTimeout(function () {
        if (!S || vis.getAttribute('data-state') !== 'scanning') return;
        if (ALIAS[s.id]) step(ALIAS[s.id], 'run', s.detail);
        else step(s.id, 'done', s.detail, s.tone === 'good' ? 'good' : 'bad');
        say(s.detail);
      }, prefersReduced ? 0 : i * 160);
    });
  };

  /* ---- the card: one number, one sentence, one bar ---- */
  var ago = function (ts) { var m = Math.round((Date.now() - ts) / 6e4); if (m < 1) return 'Checked just now'; if (m < 60) return 'Checked ' + m + ' min ago'; var hr = Math.round(m / 60); return hr < 24 ? 'Checked ' + hr + (hr === 1 ? ' hour ago' : ' hours ago') : 'Checked yesterday'; };
  var countUp = function (el, to, ms) { if (prefersReduced) { el.textContent = to; return; } var t0 = performance.now(); var tick = function (t) { var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); setTimeout(function () { el.textContent = to; }, ms + 400); };
  var gradeOf = function (sc) { return sc == null ? '' : sc >= 80 ? 'good' : sc >= 55 ? 'mid' : 'low'; };
  var joinWords = function (list, last) { return list.length > 1 ? list.slice(0, -1).join(', ') + ' ' + last + ' ' + list[list.length - 1] : list[0] || ''; };
  var renderStatement = function (fromCache) {
    var t = S.teaser, q = function (k) { return $('[data-vis-st-' + k + ']', vis); };
    var lg = q('logo'); lg.hidden = false; lg.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(S.domain) + '&sz=64'; lg.onerror = function () { lg.hidden = true; };
    q('dom').textContent = S.domain; q('when').textContent = fromCache ? ago(S.ts) : 'Checked just now';
    var g = gradeOf(t.score); if (g) vis.setAttribute('data-grade', g); else vis.removeAttribute('data-grade');
    var n = q('n'), gaps = (t.gaps || []).map(function (p) { return '<b>' + escH(p) + '</b>'; });
    if (t.score == null) { n.textContent = '–'; q('grade').textContent = 'Partial result'; q('say').textContent = t.verdict; }
    else {
      n.textContent = '0'; countUp(n, t.score, 1300); q('grade').textContent = t.grade;
      q('say').innerHTML = escH(t.lead) + ' ' + (!gaps.length ? 'It can tell <b>who you are</b> and <b>what you sell</b>.' : t.score >= 80 ? 'Still missing: ' + joinWords(gaps, 'and') + '.' : 'It can’t tell ' + joinWords(gaps, 'or') + '.');
    }
    var spec = q('spec');
    spec.innerHTML = '<div class="vis-st-segs">' + t.categories.map(function (c) { var w = c.score == null || !c.max ? 0 : Math.max(0, Math.min(100, Math.round(c.score / c.max * 100))); return '<div style="flex:' + Math.max(15, c.max) + '"><i data-w="' + w + '"></i></div>'; }).join('') +
      '</div><div class="vis-st-labs">' + t.categories.map(function (c) { return '<div style="flex:' + Math.max(15, c.max) + '"><b>' + (c.score == null ? 'n/a' : c.score + '<em>/' + c.max + '</em>') + '</b><span>' + escH(c.short) + '</span></div>'; }).join('') + '</div>';
    var grow = function () { $$('.vis-st-segs i', spec).forEach(function (el) { el.style.width = el.getAttribute('data-w') + '%'; }); };
    requestAnimationFrame(function () { requestAnimationFrame(grow); }); setTimeout(grow, 400);
  };

  /* ---- the gate: locked until an email arrives ---- */
  var gateCopy = function () {
    var t = S.teaser, bad = t.counts.fail + t.counts.warn;
    return {
      title: bad ? bad + ' of ' + t.total + ' checks need work. See which ones.' : 'All ' + t.total + ' results, one by one.',
      sub: 'Unlock every result and the points each one costs you. We email you the full report too.'
    };
  };
  var gateForm = function (id) {
    return '<div class="vis-gate-head"><span class="vis-gate-lock">' + LOCK + '</span><div><b data-gate-title></b><span data-gate-sub></span></div></div>' +
      '<div class="vis-gate-row"><label class="sr-only" for="' + id + '">Work email</label><input id="' + id + '" name="email" type="email" inputmode="email" placeholder="you@company.com" autocomplete="email" required>' +
      '<button type="submit" class="vis-go">Unlock full report <svg><use href="#i-arrow"/></svg></button></div>' +
      '<input class="vis-hp" name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<p class="vis-legal">Free. We email you this report and may follow up about your free audit. <a href="' + privacyHref + '">Privacy</a></p>' +
      '<p class="vis-status" data-gate-status aria-live="polite"></p>';
  };
  if (V.gate) V.gate.innerHTML = gateForm('vis-email');
  var forms = function () { return $$('form[data-gate-form]'); };
  var fillGates = function () {
    var c = gateCopy(), l = lead();
    forms().forEach(function (f) {
      $('[data-gate-title]', f).textContent = c.title; $('[data-gate-sub]', f).textContent = c.sub;
      var em = $('input[name="email"]', f); if (l && !em.value) em.value = l.email;
      var st = $('[data-gate-status]', f); st.textContent = ''; st.className = 'vis-status'; $('button[type="submit"]', f).disabled = false;
    });
  };
  var renderGate = function () {
    var open = !!S.full;
    V.gate.hidden = open; V.open.hidden = !open;
    if (!open) { fillGates(); return; }
    var who = S.email ? ' <b>' + escH(S.email) + '</b>' : '';
    V.openMsg.innerHTML = '<i>' + GLY.pass + '</i><span>' + (S.mail === 'sending' || S.mail === 'dry' ? 'Unlocked. Your report is on its way to' + who + '.' : S.mail === 'sent' ? 'Unlocked. We emailed this report to' + who + '.' : 'Unlocked' + (who ? ' for' + who : '') + '.') + '</span>';
    if (V.detail) V.detail.href = res ? '#results' : FOURWARD.toolUrl + '?check=' + encodeURIComponent(S.domain) + '#results';
    if (V.mail) V.mail.hidden = S.mail === 'sending' || S.mail === 'dry' || S.mail === 'sent';
  };

  /* ---- the tool page's detailed section ---- */
  var renderResults = function (reveal) {
    if (!res) return;
    var t = S.teaser, f = S.full, q = function (s) { return $(s, res); };
    res.hidden = false; res.setAttribute('data-locked', f ? 'false' : 'true');
    q('[data-tr-title]').textContent = S.domain;
    q('[data-tr-verdict]').textContent = t.verdict || '';
    q('[data-tr-score]').textContent = t.score == null ? '–' : t.score; q('[data-tr-grade]').textContent = t.grade || 'Partial';
    q('.tr-score .ring').style.strokeDashoffset = String(100 - (t.score || 0));
    q('[data-tr-score-wrap]').setAttribute('data-grade', gradeOf(t.score));
    q('[data-tr-pass]').textContent = t.counts.pass; q('[data-tr-warn]').textContent = t.counts.warn; q('[data-tr-fail]').textContent = t.counts.fail;
    var catLabel = function (id) { var c = t.categories.filter(function (x) { return x.id === id; })[0]; return c ? c.label : ''; };
    q('[data-tr-gaps]').innerHTML = f
      ? ((f.topIssues || []).slice(0, 3).map(function (x) { return '<li>' + escH(x) + '</li>'; }).join('') || '<li>None. Every check passed.</li>')
      : ((t.topGaps || []).map(function (g, i) { return '<li class="is-locked"><span class="tr-lockline"><span class="tr-blur" style="width:' + [46, 34, 40][i % 3] + '%"></span><em>' + escH(catLabel(g.cat)) + ' · −' + g.lost + ' pts</em></span></li>'; }).join('') || '<li>None. Every check passed.</li>');
    var order = { fail: 0, warn: 1, skip: 2, pass: 3 };
    q('[data-tr-cats]').innerHTML = t.categories.map(function (c, ci) {
      var ratio = c.score == null || !c.max ? 0 : c.score / c.max, cls = c.score == null ? '' : ratio >= .8 ? 'good' : ratio >= .5 ? 'mid' : 'low', rows;
      if (f) rows = f.checks.filter(function (x) { return x.cat === c.id; }).sort(function (a, b) { return order[a.status] - order[b.status] || (b.max - b.pts) - (a.max - a.pts); })
        .map(function (x, i) { return '<li class="tr-row ' + x.status + '" style="--i:' + (ci * 3 + i) + '"><span class="tr-g">' + GLY[x.status] + '</span><span class="tr-l">' + escH(x.label) + '</span><span class="tr-p">' + (x.status === 'skip' ? '' : x.pts + '/' + x.max) + '</span></li>'; }).join('');
      else rows = (c.rows || []).map(function (r) { return '<li class="tr-row ' + r.s + ' is-locked"><span class="tr-g">' + GLY[r.s] + '</span><span class="tr-l"><span class="tr-blur" style="width:' + r.w + '%"></span></span><span class="tr-p">' + (r.s === 'fail' || r.s === 'warn' ? '−' + r.lost : '') + '</span></li>'; }).join('');
      return '<article class="tr-cat"><header><span class="tool-cat-ico"><svg><use href="#' + (ICON[c.id] || 'i-grid') + '"/></svg></span><b>' + escH(c.label) + '</b><span class="tr-cat-score">' + (c.score == null ? 'not checked' : c.score + '<small>/' + c.max + '</small>') + '</span></header>' +
        '<div class="vis-meter ' + cls + '"><i style="width:' + Math.round(ratio * 100) + '%"></i></div><ul>' + rows + '</ul></article>';
    }).join('');
    var gate = q('[data-tr-gate]');
    if (gate) {
      gate.hidden = !!f;
      if (!f && !gate.firstChild) gate.innerHTML = '<form class="vis-gate tr-gate-form" data-gate-form novalidate>' + gateForm('tr-email') + '</form>' +
        '<ul class="tr-gate-list"><li>What failed, and what is only weak</li><li>The points each problem costs you</li><li>A copy in your inbox to share with your team</li></ul>';
      if (!f) fillGates();
    }
    var note = q('[data-tr-open]'); if (note) { note.hidden = !f; if (f) note.innerHTML = '<i>' + GLY.pass + '</i><span>' + (S.email ? 'Unlocked for <b>' + escH(S.email) + '</b>. ' : 'Unlocked. ') + (S.mail === 'sending' || S.mail === 'dry' ? 'A copy is on its way to your inbox.' : S.mail === 'sent' ? 'A copy is in your inbox.' : '') + '</span>'; }
    var acts = q('[data-tr-actions]'); if (acts) acts.hidden = !f;
    if (reveal) { res.classList.remove('is-revealing'); void res.offsetWidth; res.classList.add('is-revealing'); }
    try { history.replaceState(null, '', location.pathname + '?check=' + encodeURIComponent(S.domain) + (DRY ? '&dryrun=1' : '') + (f ? '#results' : '')); } catch (err) {}
  };

  /* ---- unlock ---- */
  var unlock = function (email, send, hp) {
    return post({ action: 'unlock', domain: S.domain, sealed: S.sealed, email: email, send: !!send, dry: DRY, website: hp || '', meta: meta() }).then(function (j) {
      if (!j || !j.ok) throw j || { error: '' };
      S.full = j.result; S.email = j.email; S.mail = j.mail;
      var l = lead() || {}; store.set('fw-lead', { name: l.name || '', email: j.email });
      writeCache(); renderGate(); renderResults(true);
      if (send) fwTrack('generate_lead', { lead_type: 'report' });
      fwTrack('ai_check_unlock', { returning: !send });
      return j;
    });
  };
  document.addEventListener('submit', function (e) {
    var f = e.target; if (!f || !f.matches || !f.matches('form[data-gate-form]')) return;
    e.preventDefault(); if (!S || !S.teaser) return;
    var em = $('input[name="email"]', f), hp = $('input[name="website"]', f), st = $('[data-gate-status]', f), btn = $('button[type="submit"]', f);
    var email = em.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { em.focus(); st.className = 'vis-status err'; st.textContent = 'Enter a valid email address.'; return; }
    btn.disabled = true; st.className = 'vis-status'; st.textContent = 'Unlocking your report…';
    unlock(email, true, hp.value).then(function () {
      if (res) setTimeout(function () { res.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'start' }); }, 250);
      else setTimeout(function () { location.href = FOURWARD.toolUrl + '?check=' + encodeURIComponent(S.domain) + (DRY ? '&dryrun=1' : '') + '#results'; }, 1100);
    }).catch(function (j) {
      btn.disabled = false; st.className = 'vis-status err';
      if (j && j.expired) { st.textContent = 'This check has expired. Running it again…'; store.set(CACHE + S.domain, null); setTimeout(function () { run(S.domain); }, 900); return; }
      if (j && j.suggest) em.value = j.suggest;
      st.textContent = (j && j.error) || 'We could not unlock it just now. Try again in a moment.';
    });
  });
  if (V.mail) V.mail.addEventListener('click', function () {
    if (!S || !S.email) return; V.mail.disabled = true; V.mail.textContent = 'Sending…';
    unlock(S.email, true, '').then(function () { V.mail.hidden = true; V.mail.disabled = false; V.mail.textContent = 'Email me this report'; }).catch(function () { V.mail.disabled = false; V.mail.textContent = 'Email me this report'; });
  });

  /* ---- flow ---- */
  var begin = function (domain) {
    S = { domain: domain, ts: Date.now(), sealed: [], teaser: null, full: null, email: '', mail: '' };
    vis.setAttribute('data-state', 'scanning'); vis.removeAttribute('data-grade');
    V.intro.hidden = true; V.result.hidden = true; V.scan.hidden = false; if (V.error) V.error.textContent = '';
    if (res) res.hidden = true;
    ST = {}; renderSteps(); paint(0); V.scanDomain.textContent = domain;
    startCreep();
  };
  var fail = function (msg) {
    stopCreep(); vis.setAttribute('data-state', 'idle'); V.scan.hidden = true; V.result.hidden = true; V.intro.hidden = false;
    if (V.error) V.error.textContent = msg || 'The check could not run just now. Try again in a minute.';
  };
  var finish = function (fromCache) {
    stopCreep(); vis.setAttribute('data-state', 'done');
    V.scan.hidden = true; V.result.hidden = false;
    renderStatement(fromCache); renderGate(); renderResults(false); writeCache();
    setTimeout(function () { try { vis.dispatchEvent(new CustomEvent('vis:done', { detail: { domain: S.domain, score: S.teaser.score, grade: S.teaser.grade } })); } catch (e) {} }, 0);
    if (!S.full) {
      var l = lead();
      if (l) unlock(l.email, false, '').catch(function () {});       // a returning reader: open quietly, nothing is emailed
      else if (!fromCache && window.matchMedia && window.matchMedia('(hover:hover) and (pointer:fine)').matches) { var em = $('input[name="email"]', V.gate); if (em) setTimeout(function () { try { em.focus({ preventScroll: true }); } catch (e) {} }, 1500); }
    }
  };
  var run = function (domain) {
    var c = readCache(domain);
    if (c) {
      begin(domain);
      STEPS.forEach(function (x, i) { setTimeout(function () { step(x[0], 'done', 'From your earlier scan', 'good'); }, prefersReduced ? 0 : i * 60); });
      setTimeout(function () { S = { domain: domain, ts: c.ts, secs: c.secs, sealed: c.sealed, teaser: c.teaser, full: c.full || null, email: c.email || '', mail: c.mailed ? 'sent' : '' }; finish(true); }, prefersReduced ? 0 : 900);
      return;
    }
    begin(domain);
    var t0 = Date.now(), sealed = [];
    ['home', 'nojs', 'schema', 'robots', 'sitemap', 'firewall'].forEach(function (id) { step(id, 'run'); });
    say('GET https://' + domain + '/');
    var part = function (name, params, rows) {
      var go = function () { return api(Object.assign({ domain: domain, part: name }, params || {})); };
      return go().catch(function () { return go(); }).then(function (j) { sealed.push(j.sealed); playSteps(j.steps); return j; })
        .catch(function () { (rows || []).forEach(function (id) { step(id, 'done', 'Could not run', 'bad'); }); return null; });
    };
    var pSite = part('site', null, ['home', 'nojs', 'schema', 'robots', 'sitemap']);
    var pAccess = part('access', null, ['firewall']);
    var pRest = pSite.then(function (site) {
      var h = (site && site.hints) || {}, pg = h.pages;
      ['pages', 'wiki', 'community', 'demand'].forEach(function (id) { step(id, 'run'); });
      return Promise.all([
        part('entity', { brand: h.brand || '' }, ['wiki', 'community', 'demand']),
        part('pages', pg ? { pricing: pg.pricing, blog: pg.blog, about: pg.about, compare: pg.compare } : { blind: 1 }, ['pages'])
      ]);
    });
    Promise.all([pAccess, pRest]).then(function () {
      if (!sealed.length) throw new Error('no parts');
      var k = 'fw-cap:' + domain, last = 0, log = false;
      try { last = +localStorage.getItem(k) || 0; if (Date.now() - last > 432e5) { log = true; localStorage.setItem(k, String(Date.now())); } } catch (e) {}
      return new Promise(function (ok) { setTimeout(ok, prefersReduced ? 0 : 700); }).then(function () {      // let the last lines land
        step('score', 'run'); say('Weighing every result into one score…');
        return post({ action: 'summary', domain: domain, sealed: sealed, log: log, dry: DRY, meta: meta() });
      });
    }).then(function (j) {
      if (!j || !j.ok || !j.result) throw new Error('summary');
      S.sealed = sealed; S.teaser = j.result; S.secs = (Date.now() - t0) / 1000;
      step('score', 'done', j.result.score == null ? 'Partial result' : 'Scored out of 100', 'good'); paint(100);
      setTimeout(function () { finish(false); }, prefersReduced ? 0 : 500);
    }).catch(function () { fail(); });
  };

  var reset = function () {
    vis.setAttribute('data-state', 'idle'); vis.removeAttribute('data-grade'); stopCreep();
    V.scan.hidden = true; V.result.hidden = true; V.intro.hidden = false; if (res) res.hidden = true;
    V.input.value = ''; V.input.focus();
    try { history.replaceState(null, '', location.pathname); } catch (e) {}
  };
  $$('[data-vis-reset],[data-vis-again]').forEach(function (b) { b.addEventListener('click', function () { reset(); if (res) vis.scrollIntoView({ behavior: prefersReduced ? 'auto' : 'smooth', block: 'center' }); }); });
  $$('[data-vis-try]', vis).forEach(function (b) { b.addEventListener('click', function () { V.input.value = b.getAttribute('data-vis-try'); V.form.requestSubmit(); }); });
  V.form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (vis.getAttribute('data-state') === 'scanning') return;
    var d = cleanDomain(V.input.value);
    if (!d) { V.input.setCustomValidity('Enter a domain like yourcompany.com'); V.input.reportValidity(); setTimeout(function () { V.input.setCustomValidity(''); }, 1500); return; }
    V.input.value = d; run(d);
  });
  var share = $('[data-tr-share]'); if (share) share.addEventListener('click', function () { var url = location.href.split('#')[0]; (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { share.textContent = 'Link copied'; }).catch(function () { window.prompt('Copy this link', url); }); setTimeout(function () { share.textContent = 'Copy link to these results'; }, 2200); });
  var vq = /[?&]check=([^&#]+)/.exec(location.search);
  if (vq) { var vd = cleanDomain(decodeURIComponent(vq[1])); if (vd) { V.input.value = vd; run(vd); } }
  })();

  /* ---------- 8. process: the monthly rhythm ----------
     When the section scrolls into view a cursor sweeps across thirty days; each dot lights as it
     passes and wakes the card it belongs to. Hovering a card highlights its lane, and back. */
  var rh = $('#rhythm');
  if (rh) {
    var rhDots = $$('.rh-lane i', rh).map(function (el) { return { el: el, d: parseFloat(el.style.getPropertyValue('--d')) || 1, kind: el.closest('.rh-row').getAttribute('data-kind') }; });
    var rhCards = {}, rhRows = {};
    $$('.rh-card', rh).forEach(function (c) { rhCards[c.getAttribute('data-kind')] = c; });
    $$('.rh-row', rh).forEach(function (r) { rhRows[r.getAttribute('data-kind')] = r; });
    var rhSet = function (p, quiet) {
      rh.style.setProperty('--p', p.toFixed(4));
      rhDots.forEach(function (o) {
        if (o.el.classList.contains('is-lit') || p < (o.d - 0.5) / 30) return;
        o.el.classList.add('is-lit');
        var c = rhCards[o.kind]; if (!c) return;
        c.classList.add('is-lit');
        if (!quiet) { c.classList.remove('is-pulse'); void c.offsetWidth; c.classList.add('is-pulse'); }
      });
    };
    var rhPlay = function () {
      if (prefersReduced || staticMode) { rhSet(1, true); rh.classList.add('is-done'); return; }
      var t0 = null, dur = 5600;
      var tick = function (now) { if (t0 === null) t0 = now; var p = Math.min(1, (now - t0) / dur); rhSet(p); if (p < 1) requestAnimationFrame(tick); else setTimeout(function () { rh.classList.add('is-done'); }, 600); };
      requestAnimationFrame(tick);
    };
    if (prefersReduced || staticMode || !('IntersectionObserver' in window)) rhPlay();
    else { var rio = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) { rhPlay(); rio.disconnect(); } }); }, { threshold: 0.3 }); rio.observe(rh); }
    Object.keys(rhCards).forEach(function (k) {
      var on = function () { rh.setAttribute('data-focus', k); }, off = function () { rh.removeAttribute('data-focus'); };
      [rhCards[k], rhRows[k]].forEach(function (el) { if (el) { el.addEventListener('pointerenter', on); el.addEventListener('pointerleave', off); } });
    });
  }

  /* ---------- 9. live work mocks ----------
     Each work card plays a short loop of what we shipped, only while it is on screen.
     Reduced motion and ?static=1 show the finished frame. */
  (function () {
    var mocks = $$('[data-live]');
    if (!mocks.length) return;
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var count = function (el, ms) {
      var to = parseFloat(el.getAttribute('data-count')), dec = +(el.getAttribute('data-dec') || 0), t0 = performance.now();
      return new Promise(function (done) {
        var tick = function (t) { var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = (to * e).toFixed(dec); if (k < 1) requestAnimationFrame(tick); else done(); };
        requestAnimationFrame(tick);
      });
    };
    var finalFrame = function (m) {
      $$('.lm-w-flow li, .lm-e-seats i', m).forEach(function (el) { el.classList.add('on'); }); m.style.setProperty('--wp', '100%');
      for (var i = 1; i <= 7; i++) m.classList.add('s' + i);
      $$('[data-count]', m).forEach(function (el) { el.textContent = (+el.getAttribute('data-count')).toFixed(+(el.getAttribute('data-dec') || 0)); });
      $$('[data-type]', m).forEach(function (el) { el.textContent = el.getAttribute('data-type'); });
      var c = $('.lm-caret', m); if (c) c.style.display = 'none';
    };
    var reset = function (m) {
      $$('.lm-w-flow li, .lm-e-seats i', m).forEach(function (el) { el.classList.remove('on'); }); m.style.removeProperty('--wp');
      for (var i = 1; i <= 7; i++) m.classList.remove('s' + i);
      $$('[data-count]', m).forEach(function (el) { el.textContent = (0).toFixed(+(el.getAttribute('data-dec') || 0)); });
      $$('[data-type]', m).forEach(function (el) { el.textContent = ''; });
    };
    var PLAY = {
      w: function (m) {
        var steps = $$('.lm-w-flow li', m), i = 0;
        return wait(400).then(function next() {
          if (i >= steps.length) return null;
          steps[i].classList.add('on'); m.style.setProperty('--wp', ((i + 1) / steps.length * 100) + '%'); i++;
          return wait(850).then(next);
        }).then(function () { m.classList.add('s1'); return wait(3800); });
      },
      e: function (m) {
        var dots = $$('.lm-e-seats i', m), i = 0;
        return wait(400)
          .then(function () { m.classList.add('s1'); var c = $('[data-count]', m); if (c) count(c, 2200); return new Promise(function (done) {
            var t = setInterval(function () { if (i < dots.length) { dots[i].classList.add('on'); i++; } else { clearInterval(t); done(); } }, 2200 / dots.length);
          }); })
          .then(function () { return wait(500); })
          .then(function () { m.classList.add('s2'); return wait(3800); });
      },
      g: function (m, on) {
        var q = $('[data-type]', m), text = q.getAttribute('data-type'), i = 0;
        return wait(500).then(function type() {
          if (!on()) return;
          q.textContent = text.slice(0, ++i);
          return i < text.length ? wait(45 + Math.random() * 45).then(type) : null;
        }).then(function () { return wait(350); })
          .then(function () { m.classList.add('s1', 's2'); return wait(1100); })
          .then(function () { m.classList.add('s3'); return wait(1500); })
          .then(function () { m.classList.add('s4'); return wait(1100); })
          .then(function () { m.classList.add('s5'); return wait(3800); });
      },
      r: function (m) {
        return wait(400)
          .then(function () { m.classList.add('s1'); return Promise.all($$('[data-count]', m).map(function (el) { return count(el, 1400); })); })
          .then(function () { return wait(600); })
          .then(function () { m.classList.add('s2'); return wait(4200); });
      },
      v: function (m) {
        var cta = $('.lm-v-cta', m);
        return wait(300)
          .then(function () { m.classList.add('s1'); return wait(1100); })
          .then(function () { m.classList.add('s2'); return wait(600); })
          .then(function () { m.classList.add('s3'); return wait(900); })
          .then(function () {
            var a = m.getBoundingClientRect(), b = cta.getBoundingClientRect();
            m.style.setProperty('--cx', (b.left - a.left + b.width * 0.62) + 'px'); m.style.setProperty('--cy', (b.top - a.top + b.height * 0.45) + 'px');
            m.classList.add('s4'); return wait(150);
          })
          .then(function () { m.classList.add('s5'); return wait(1150); })
          .then(function () { m.classList.add('s6'); return wait(900); })
          .then(function () { m.classList.add('s7'); return Promise.all($$('[data-count]', m).map(function (el) { return count(el, 1300); })); })
          .then(function () { return wait(3600); });
      }
    };
    if (prefersReduced || staticMode || !('IntersectionObserver' in window)) { mocks.forEach(finalFrame); return; }
    mocks.forEach(function (m) {
      var visible = false, running = false;
      var loop = function () {
        if (running || !visible) return;
        running = true; reset(m);
        PLAY[m.getAttribute('data-live')](m, function () { return visible; }).then(function () {
          running = false;
          if (visible) { m.classList.add('is-out'); setTimeout(function () { m.classList.remove('is-out'); loop(); }, 450); }
        });
      };
      new IntersectionObserver(function (es) { es.forEach(function (e) { visible = e.isIntersecting; if (visible) loop(); }); }, { threshold: 0.35 }).observe(m);
    });
  })();

  /* ---------- 9b. search window: real Google screen recordings, one per tab ----------
     Each tab holds a real recording (scaler vs masai first). When one ends, the pill moves to the next
     tab and its recording plays. Wide files for wide windows, square ones for phones. Videos load only
     when the window scrolls into view; ?static=1 and reduced motion show the first poster. */
  (function () {
    var mock = $('[data-g2]');
    if (!mock) return;
    var vids = $$('.g2-vid', mock), tabs = $$('.g2-tab', mock), pill = $('.g2-pill', mock), box = $('.g2-rec', mock);
    if (!vids.length || !box) return;
    var active = 0, visible = false, kind = '';
    var place = function (i) {
      var t = tabs[i]; active = i;
      if (t && pill) { pill.style.setProperty('--x', t.offsetLeft + 'px'); pill.style.setProperty('--w', t.offsetWidth + 'px'); }
      tabs.forEach(function (x, k) { x.classList.toggle('is-on', k === i); });
      vids.forEach(function (v, k) { v.classList.toggle('is-on', k === i); });
    };
    var pick = function () {
      var r = box.getBoundingClientRect(), k = r.width / Math.max(1, r.height) >= 1.4 ? 'wide' : 'sq';
      if (k === kind) return; kind = k;
      vids.forEach(function (v) { v.poster = v.getAttribute(k === 'wide' ? 'data-pw' : 'data-ps'); if (v.getAttribute('src')) v.src = v.getAttribute('data-' + k); });
    };
    var load = function (v) { if (!v.getAttribute('src')) { v.src = v.getAttribute('data-' + kind); v.preload = 'auto'; } };
    var go = function (v) { var p = v.play(); if (p && p.catch) p.catch(function () {}); };
    var playAt = function (i) {
      place(i); var v = vids[i]; load(v);
      try { v.currentTime = 0; } catch (e) {}
      go(v); load(vids[(i + 1) % vids.length]);
    };
    vids.forEach(function (v, i) { v.addEventListener('ended', function () { if (visible) playAt((i + 1) % vids.length); }); });
    pick(); place(0);
    window.addEventListener('resize', function () { pick(); place(active); });
    if (prefersReduced || staticMode || !('IntersectionObserver' in window)) return;
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        var was = visible; visible = e.isIntersecting;
        if (visible && !was) { var v = vids[active]; if (!v.getAttribute('src')) playAt(active); else go(v); }
        else if (!visible && was) vids[active].pause();
      });
    }, { threshold: 0.35 }).observe(mock);
  })();

  /* ---------- 11b. analytics: key clicks and the AI check (GA4 via fwTrack) ---------- */
  (function () {
    var where = function (el) { var s = el.closest('section[id],header,footer,aside,.strip,.talk'); return s ? (s.id || s.className.split(' ')[0] || s.tagName.toLowerCase()) : 'page'; };
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a,button');
      if (!a) return;
      var href = a.getAttribute('href') || '';
      if (/#book$/.test(href)) fwTrack('book_call_click', { cta_location: where(a), cta_text: (a.textContent || '').trim().slice(0, 40) });
      else if (/^mailto:/.test(href)) fwTrack('email_click', { cta_location: where(a) });
      else if (a.hasAttribute('data-ai')) fwTrack('ai_summary_click', { assistant: a.getAttribute('data-label') || '' });
      else if (/google\.com\/preferences\/source/.test(href)) fwTrack('preferred_source_click', {});
    }, true);
    var vis = document.getElementById('vis');
    if (vis) vis.addEventListener('vis:done', function (e) { var d = e.detail || {}; fwTrack('ai_check_complete', { score: d.score == null ? -1 : d.score, grade: d.grade || '' }); });
  })();

  /* ---------- 10. services: tap to open on touch screens ----------
     Hover (or keyboard focus) makes a card bigger and shows the detail; touch toggles it. */
  (function () {
    var cards = $$('.svc');
    // pin each slot to its resting height, so a hovered card can grow over the content below without moving it
    var size = function () {
      cards.forEach(function (c) { c.classList.remove('js-sized'); c.style.height = ''; });
      if (window.matchMedia('(hover: none)').matches) return;
      var hs = cards.map(function (c) { return c.offsetHeight; });
      cards.forEach(function (c, i) { c.style.height = hs[i] + 'px'; c.classList.add('js-sized'); });
    };
    if (cards.length) { size(); window.addEventListener('resize', function () { clearTimeout(size.t); size.t = setTimeout(size, 150); }); if (document.fonts && document.fonts.ready) document.fonts.ready.then(size); }
    cards.forEach(function (c) {
      c.addEventListener('click', function (e) {
        if (e.target.closest('a') || window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        var on = !c.classList.contains('is-open');
        cards.forEach(function (o) { o.classList.remove('is-open'); });
        c.classList.toggle('is-open', on);
      });
    });
    document.addEventListener('click', function (e) { if (!e.target.closest('.svc')) cards.forEach(function (o) { o.classList.remove('is-open'); }); });
  })();

  /* ---------- 11. email capture and contact form ----------
     Both post through fwSend. Until the backend knows the "subscribe" and "contact" types, the same
     details are logged through the existing booking type so nothing is lost; the contact form
     falls back to the visitor's own email app as a last resort. */
  (function () {
    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    var send = function (payload, bridgeLabel) {
      return fwSend(payload).catch(function (err) {
        if (!/unknown type/i.test(String(err && err.message))) throw err;
        return fwSend({ type: 'booking', slotLabel: bridgeLabel.slice(0, 480), slot: payload.type, visitorTz: (Intl.DateTimeFormat().resolvedOptions().timeZone || ''), website: payload.website });
      });
    };
    var subscribed = function () { try { return !!localStorage.getItem('fw-sub'); } catch (e) { return false; } };

    // subscribe forms (section and pop-up)
    $$('[data-sub]').forEach(function (f) {
      var st = $('.sub-status', f), em = $('input[name="email"]', f), hp = $('input[name="website"]', f), btn = $('button[type="submit"]', f);
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var email = em.value.trim();
        if (hp.value) { st.textContent = 'Thanks.'; return; }
        if (!EMAIL_RE.test(email)) { st.className = 'sub-status err'; st.textContent = 'Please add a valid email.'; em.focus(); return; }
        btn.disabled = true; st.className = 'sub-status'; st.textContent = 'Subscribing…';
        send({ type: 'subscribe', email: email, source: f.getAttribute('data-sub'), website: hp.value }, 'Email sign-up · ' + email + ' · ' + f.getAttribute('data-sub'))
          .then(function () {
            try { localStorage.setItem('fw-sub', String(Date.now())); } catch (err) {}
            f.classList.add('is-done'); st.className = 'sub-status ok'; st.textContent = 'You are in. Thanks for subscribing.';
            if (f.getAttribute('data-sub') === 'popup') setTimeout(hidePop, 1800);
          })
          .catch(function () { btn.disabled = false; st.className = 'sub-status err'; st.textContent = 'That did not go through. Please try again in a moment.'; });
      });
    });

    // pop-up: once, after the visitor has read half the page; never if subscribed or dismissed in the last 21 days
    var pop = $('#sub-pop');
    var hidePop = function () { if (pop) pop.hidden = true; };
    if (pop) {
      var KEY = 'fw-sub-pop', recent = false;
      try { recent = Date.now() - (+localStorage.getItem(KEY) || 0) < 21 * 864e5; } catch (e) {}
      var shown = false;
      var maybe = function () {
        if (shown || recent || subscribed() || staticMode) return;
        var talk = $('#talk'); if (talk && talk.classList.contains('is-voice')) return;
        var p = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
        if (p > 0.55) { shown = true; pop.hidden = false; try { localStorage.setItem(KEY, String(Date.now())); } catch (e) {} window.removeEventListener('scroll', maybe); }
      };
      window.addEventListener('scroll', maybe, { passive: true });
      $('[data-sub-close]', pop).addEventListener('click', hidePop);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hidePop(); });
      if (/[?&]subpop=1/.test(location.search)) { pop.hidden = false; }
    }

    // contact page form
    var cf = $('[data-contact]');
    if (cf) {
      var cst = $('.form-status', cf), cbtn = $('button[type="submit"]', cf);
      cf.addEventListener('submit', function (e) {
        e.preventDefault();
        var v = function (n) { var el = $('[name="' + n + '"]', cf); return el ? el.value.trim() : ''; };
        var d = { type: 'contact', name: v('name'), email: v('email'), company: v('company'), message: v('message'), website: v('website') };
        if (d.website) { cst.textContent = 'Sent.'; return; }
        if (d.name.length < 2) { cst.className = 'form-status err'; cst.textContent = 'Please add your name.'; $('[name="name"]', cf).focus(); return; }
        if (!EMAIL_RE.test(d.email)) { cst.className = 'form-status err'; cst.textContent = 'Please add a valid email.'; $('[name="email"]', cf).focus(); return; }
        if (d.message.length < 5) { cst.className = 'form-status err'; cst.textContent = 'Please add a short message.'; $('[name="message"]', cf).focus(); return; }
        cbtn.disabled = true; cst.className = 'form-status'; cst.textContent = 'Sending…';
        send(d, 'Contact · ' + d.name + ' · ' + d.email + (d.company ? ' · ' + d.company : '') + ' · ' + d.message)
          .then(function () { cf.reset(); cbtn.disabled = false; cst.className = 'form-status ok'; cst.textContent = 'Thanks, ' + d.name.split(' ')[0] + '. Your message is with the Fourward team, and we will reply by email.'; })
          .catch(function () {
            cbtn.disabled = false;
            var mail = 'mailto:' + FOURWARD.emails[0] + '?subject=' + encodeURIComponent('Hello from ' + d.name + (d.company ? ' · ' + d.company : '')) + '&body=' + encodeURIComponent(d.message + '\n\n' + d.name + '\n' + d.email);
            cst.className = 'form-status err'; cst.innerHTML = 'We could not send it from here just now. <a href="' + mail + '">Send it from your email app</a> instead.';
          });
      });
    }
  })();

})();

/* ---------- 9c. search window: rank table (replaces the screen recordings) ----------
   Rows enter one by one; each position chip rolls like a counter and lands on the real
   result from the BootcampGuide case study. Two sets alternate. ?static=1 and reduced
   motion show the first set finished. */
(function () {
  var mock = document.querySelector('[data-rank-motion]');
  if (!mock) return;
  var $ = function (s, r) { return (r || mock).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || mock).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]static=1/.test(location.search) || document.documentElement.classList.contains('static');
  var box = $('.lm-rank'), rows = $('.rk-rows'), foot = $('.rk-foot');
  var SETS = JSON.parse(mock.getAttribute('data-sets') || '[]');
  if (!box || !rows || !SETS.length) return;
  var AI = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.2 6.3L21 10.5l-6.8 2.2L12 19l-2.2-6.3L3 10.5l6.8-2.2z"/></svg>';
  var render = function (set) {
    rows.innerHTML = set.rows.map(function (r) {
      // the chip rolls down a short ladder of numbers and stops on the real position
      var start = Math.max(r.pos + 4, 7), ladder = [];
      for (var n = start; n >= r.pos; n--) ladder.push(n);
      return '<div class="rk-row"><span>' + r.q + '</span>' +
        (r.src ? '<span class="rk-tag">' + AI + 'Top source · AI Overview</span>' : r.ai ? '<span class="rk-tag">' + AI + 'AI Overview</span>' : '<span></span>') +
        '<span class="rk-pos' + (r.pos > 1 ? ' two' : '') + '" style="--n:' + (ladder.length - 1) + '"><i>' + ladder.map(function (n) { return '<b>#' + n + '</b>'; }).join('') + '</i></span></div>';
    }).join('');
    foot.innerHTML = '<b>' + set.foot + '</b><em>' + (set.note || '') + '</em>';
  };
  if (reduce || !('IntersectionObserver' in window)) { render(SETS[0]); box.classList.add('is-static'); return; }
  var k = 0, visible = false, timers = [], running = false;
  var later = function (fn, ms) { timers.push(setTimeout(fn, ms)); };
  var clear = function () { timers.forEach(clearTimeout); timers = []; };
  var play = function () {
    if (!visible) { running = false; return; }
    running = true; clear();
    box.classList.remove('is-leaving'); foot.classList.remove('in');
    render(SETS[k]);
    var list = $$('.rk-row');
    list.forEach(function (row, i) {
      later(function () { row.classList.add('in'); }, 120 + i * 230);
      later(function () { row.classList.add('hit'); }, 520 + i * 230);
    });
    var done = 520 + list.length * 230 + 1500;
    later(function () { foot.classList.add('in'); }, done);
    later(function () { box.classList.add('is-leaving'); }, done + 3600);
    later(function () { k = (k + 1) % SETS.length; play(); }, done + 4000);
  };
  new IntersectionObserver(function (es) {
    es.forEach(function (e) { visible = e.isIntersecting; if (visible && !running) play(); if (!visible) { clear(); running = false; } });
  }, { threshold: 0.35 }).observe(mock);
})();

/* ---------- 9d. search window: live motion over real Google screenshots (v1.36) ----------
   Two real searches on Google India. The query is typed into the real search box, the real results page fades in,
   the camera glides to the AI Overview sources and a ring draws around bootcampguide.com, our own site. For the
   fees search it then scrolls on to the #1 result. Everything moves in CSS; the pictures are untouched screenshots
   (account avatar masked). ?static=1 and reduced motion show the first search finished. */
(function () {
  var mock = document.querySelector('[data-g3]');
  if (!mock) return;
  var $ = function (s, r) { return (r || mock).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || mock).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]static=1/.test(location.search) || document.documentElement.classList.contains('static');
  var stage = $('.g3-stage'), cam = $('.g3-cam'), shots = $$('.g3-shot'), typeEl = $('.g3-type'), txt = $('.g3-txt'), ring = $('.g3-ring'), rect = ring && ring.querySelector('rect'), tag = $('.g3-tag'), tabs = $$('.g2-tab'), pill = $('.g2-pill');
  var Q = JSON.parse(mock.getAttribute('data-scenes') || '[]');
  if (!stage || !cam || !Q.length) return;
  var HOME = { wide: { x: 440, y: 180, w: 760 }, sq: { x: 450, y: 110, w: 680 } };
  var STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.2 6.3L21 10.5l-6.8 2.2L12 19l-2.2-6.3L3 10.5l6.8-2.2z"/></svg>';
  var kind = 'wide', SW = 0, SH = 0, cur = HOME, tall = false, timers = [], visible = false, running = false, k = 0, loaded = false;
  var measure = function () { var r = stage.getBoundingClientRect(); SW = r.width || 1; SH = r.height || 1; kind = SW / SH >= 1.4 ? 'wide' : 'sq'; };
  var look = function (c, instant) {
    measure(); cur = c; var g = c[kind] || c.wide, s = SW / g.w, maxY = (tall ? 1494 : 747) - SH / s, y = Math.max(0, Math.min(maxY, g.y)), x = Math.max(0, Math.min(1568 - SW / s, g.x));
    if (instant) cam.classList.add('no-t');
    cam.style.transform = 'translate(' + (-x * s).toFixed(2) + 'px,' + (-y * s).toFixed(2) + 'px) scale(' + s.toFixed(4) + ')';
    if (instant) { void cam.offsetWidth; cam.classList.remove('no-t'); }
  };
  var show = function (names) { shots.forEach(function (s) { s.classList.toggle('is-on', names.indexOf(s.getAttribute('data-shot')) >= 0); }); tall = names.some(function (n) { return /-org$/.test(n); }); };
  var load = function () { if (loaded) return; loaded = true; shots.forEach(function (s) { s.src = s.getAttribute('data-src'); }); };
  var setTab = function (i) { var t = tabs[i]; if (t && pill) { pill.style.setProperty('--x', t.offsetLeft + 'px'); pill.style.setProperty('--w', t.offsetWidth + 'px'); } tabs.forEach(function (x, j) { x.classList.toggle('is-on', j === i); }); };
  var mark = function (r, label) {
    if (!r) { ring.classList.remove('is-on'); tag.classList.remove('is-on'); return; }
    ring.style.left = r[0] + 'px'; ring.style.top = r[1] + 'px'; ring.style.width = r[2] + 'px'; ring.style.height = r[3] + 'px';
    ring.setAttribute('viewBox', '0 0 ' + r[2] + ' ' + r[3]); rect.setAttribute('x', 1.75); rect.setAttribute('y', 1.75); rect.setAttribute('width', r[2] - 3.5); rect.setAttribute('height', r[3] - 3.5);
    rect.style.setProperty('--len', 2 * (r[2] + r[3]) + 'px');
    ring.classList.remove('is-on'); void ring.offsetWidth; ring.classList.add('is-on');
    tag.innerHTML = STAR + label; tag.style.left = r[0] + 'px'; tag.style.top = (r[1] - 46) + 'px';
    tag.classList.remove('is-on'); timers.push(setTimeout(function () { tag.classList.add('is-on'); }, 550));
  };
  var later = function (fn, ms) { timers.push(setTimeout(fn, ms)); };
  var clear = function () { timers.forEach(clearTimeout); timers = []; };
  measure(); if (shots[0]) shots[0].src = shots[0].getAttribute('data-src'); // the homepage is the base layer, so it loads at once; the results load when the window scrolls into view
  if (reduce || !('IntersectionObserver' in window)) {
    load(); mock.classList.add('is-static'); var q0 = Q[0]; setTab(0); show([q0.shot]); look(q0.focus, true); mark(q0.ring, q0.tag); tag.classList.add('is-on'); return;
  }
  var play = function (i) {
    if (!visible) { running = false; return; }
    running = true; clear(); k = i; var q = Q[i], first = !cam.style.transform;
    setTab(i); mark(null); show(['home']); look(HOME, first);
    txt.textContent = ''; typeEl.classList.add('is-on');
    var t = 700, chars = q.q.split('');
    chars.forEach(function (ch) { t += 48 + Math.random() * 70 + (ch === ' ' ? 90 : 0); later(function () { txt.textContent += ch; }, t); });
    t += 420;
    later(function () { typeEl.classList.remove('is-on'); show([q.shot]); look(q.results); }, t);
    t += 1700; later(function () { look(q.focus); }, t);
    t += 750; later(function () { mark(q.ring, q.tag); }, t);
    t += 3000;
    if (q.more) {
      later(function () { mark(null); show([q.shot, q.more.shot]); look(q.more.cam); }, t);
      t += 1150; later(function () { mark(q.more.ring, q.more.tag); }, t);
      t += 3000;
    }
    later(function () { mark(null); play((i + 1) % Q.length); }, t);
  };
  window.addEventListener('resize', function () { measure(); look(cur, true); });
  new IntersectionObserver(function (es) {
    es.forEach(function (e) {
      visible = e.isIntersecting;
      if (visible && !running) { load(); var home = shots[0]; if (home.complete && home.naturalWidth) play(k); else { home.addEventListener('load', function () { if (visible && !running) play(k); }, { once: true }); later(function () { if (visible && !running) play(k); }, 2500); } }
      if (!visible) { clear(); running = false; }
    });
  }, { threshold: 0.35 }).observe(mock);
})();

/* ---------- 99. cookie consent: Google Analytics loads only after "Accept" (choice kept in localStorage) ---------- */
(function () {
  var KEY = 'fw-consent';
  var get = function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  var set = function (v) { try { localStorage.setItem(KEY, v); } catch (e) {} };
  var dropGaCookies = function () {
    document.cookie.split(';').forEach(function (c) {
      var n = c.split('=')[0].trim();
      if (/^_ga/.test(n)) ['', '; domain=.' + location.hostname.replace(/^www\./, ''), '; domain=' + location.hostname].forEach(function (d) {
        document.cookie = n + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + d;
      });
    });
  };
  var privacy = (function () { var a = document.querySelector('a[href$="privacy/"]'); return a ? a.getAttribute('href') : '/privacy/'; })();
  var box = null;
  var close = function () { if (box) { box.classList.remove('is-open'); var b = box; setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 250); box = null; } };
  var choose = function (v) {
    set(v);
    if (v === 'granted') { if (window.fwLoadGA) window.fwLoadGA(); if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'granted' }); }
    else { if (window.gtag) window.gtag('consent', 'update', { analytics_storage: 'denied' }); dropGaCookies(); }
    close();
  };
  var open = function () {
    if (box) return;
    box = document.createElement('div');
    box.className = 'fw-consent';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-live', 'polite');
    box.setAttribute('aria-label', 'Cookie choice');
    box.innerHTML = '<p><b>Cookies</b> We use Google Analytics cookies to see which pages help visitors. No ads, and nothing is shared for advertising. <a href="' + privacy + '">Privacy policy</a></p>' +
      '<div class="fw-consent-btns"><button type="button" class="btn btn-ghost btn-sm" data-c="denied">Reject</button><button type="button" class="btn btn-dark btn-sm" data-c="granted">Accept</button></div>';
    box.addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (b) choose(b.getAttribute('data-c')); });
    document.body.appendChild(box);
    setTimeout(function () { if (box) box.classList.add('is-open'); }, 30);
  };
  window.fwCookieSettings = open;
  // a "Cookie settings" link in the footer, so the choice can be changed later
  var foot = document.querySelector('.foot-bottom') || document.querySelector('footer');
  if (foot && !foot.querySelector('.fw-cookie-link')) {
    var l = document.createElement('button');
    l.type = 'button'; l.className = 'fw-cookie-link'; l.textContent = 'Cookie settings';
    l.addEventListener('click', open);
    foot.appendChild(l);
  }
  var v = get();
  if (v !== 'granted' && v !== 'denied') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open); else open();
  }
})();
