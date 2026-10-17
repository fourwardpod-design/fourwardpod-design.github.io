/* ==========================================================================
   FOURWARD — site script
   1. nav state   2. lane tabs   3. reveal-on-scroll
   4. hanging team cards (wire layout, swing, pointer shimmer, flip)
   5. booking calendar (no backend: the visitor requests a slot by email,
      or adds a Google Calendar invite with the team as guests)
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- config ---------- */
  var FOURWARD = {
    emails: ['misrisharang7@gmail.com', 'Deepakce9911@gmail.com', 'geetanjalis823@gmail.com', 'rishisbzy.rg@gmail.com'],
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
    leadUrl: 'https://script.google.com/macros/s/AKfycbyt5YKfhDZ2GhCCBkq8foHfgOr3VVgMCKlh5nlGZB7yP1J4uqV7rF3G6FAw7dKKt7O2JQ/exec',
    formTo: 'fourwardpod@gmail.com',
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
  function fwSend(payload, keepalive) {
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

  /* ---------- 2. lane tabs ---------- */
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
        '&text=' + encodeURIComponent('Free session with Fourward') +
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
      { id: 'services', re: /\b(what do you do|services?|offer|offerings|capabilit\w*|do you do|help (me|us) with|lanes?|everything you do|what can you)\b/i, text: 'Everything a B2B SaaS marketing department does, in four lanes: search, content & AI visibility; brand, PR & partnerships; lifecycle & demand generation; field marketing & events. Twenty-eight disciplines, each with a senior owner, one plan, measured on pipeline.', actions: [['See services', '#services'], ['Book a call', '#book', true]] },
      { id: 'free', re: /\b(free|audit|offer|trial)\b/i, text: 'For a limited time we run a free SEO, AEO and GEO audit and a free 30-minute session to walk you through it. Run the AI visibility check at the top for a first look.', actions: [['Book your free session', '#book', true], ['Run the check', '#vis']] },
      { id: 'pricing', re: /\b(price|pricing|cost|budget|fee|retainer|sprint|how much|rates?)\b/i, text: 'Three ways in: a 30-day sprint on one lane, a monthly pod retainer for all four, or a fixed-scope project. The price comes with the written 30-day plan, within three working days of a call.', actions: [['Ways to work with us', '#process'], ['Book a call', '#book', true]] },
      { id: 'report', re: /\b(report|reporting|process|cadence|how do you work|dashboard|weekly|monthly|update)\b/i, text: 'A baseline report first, then a written progress update every week, a review call every two weeks and a full report every month. Traffic, rankings, AI citations, coverage and pipeline on one dashboard.', actions: [['How we work', '#process']] },
      { id: 'team', re: /\b(team|who|people|founders?|sharang|deepak|geetanjali|rishabh)\b/i, text: 'Four senior marketers from one B2B SaaS growth team, one per lane: Sharang Misri (lifecycle & demand), Deepak Sharma (search, content & AI visibility), Geetanjali Sharma (brand, PR & partnerships) and Rishabh Gautam (field marketing & events).', actions: [['Meet the team', '#team']] },
      { id: 'proof', re: /\b(proof|results?|work|case|cases|numbers?|evidence|portfolio|clients?)\b/i, text: '3× organic traffic per page after consolidating an archive, $12.3M of ARR SQL pipeline influenced, 30+ events measured to SQL, 11 press pieces, and 20 leads in week one for a new school. Every number names its source.', actions: [['See the work', '#work'], ['By the numbers', '#numbers']] },
      { id: 'ai', re: /\b(ai|geo|aeo|chatgpt|perplexity|gemini|overview|overviews|llm|cited|citation)\b/i, text: 'Yes, this is lane one. Google\'s AI Overview cites our comparison page first for "Masai School vs AccioJob" and for "scaler vs masai". We build the pages and films AI engines quote, then consolidate what you already have.', actions: [['See the receipt', '#work'], ['Search & AI visibility', '#services']] },
      { id: 'seo', re: /\b(seo|search|content|blog|ranking|rank|traffic|website|cro|landing)\b/i, text: 'Search, content and AI visibility is lane one: SEO and technical SEO, GEO and AEO, editorial programmes, learning hubs and comparison pages, CRO, migrations and attribution.', actions: [['See services', '#services'], ['See the work', '#work']] },
      { id: 'pr', re: /\b(pr|press|brand|media|review|reviews|g2|trustpilot|partnership|linkedin|positioning)\b/i, text: 'Brand, PR and partnerships is lane two: positioning, media relations, executive thought leadership, review-site reputation, partnerships and LinkedIn programmes. Eleven press pieces and a review score rebuilt from 2.9 to 3.9 so far.', actions: [['See services', '#services'], ['See the work', '#work']] },
      { id: 'lifecycle', re: /\b(email|hubspot|automation|lifecycle|nurture|webinar|webinars|newsletter|demand|abm|pipeline|sql|mql)\b/i, text: 'Lifecycle and demand generation is lane three: HubSpot automation, email workflows, newsletters and gated content, webinars and podcasts, ABM, and funnel reporting from first touch to closed-won.', actions: [['See services', '#services']] },
      { id: 'events', re: /\b(event|events|dinner|summit|conference|roundtable|field|booth)\b/i, text: 'Field marketing and events is lane four: owned event series, executive dinners and summits, partner events (for example with Microsoft), paid media to fill the room, and follow-up within seven days, measured to SQL.', actions: [['See services', '#services'], ['NEXERA with Microsoft', '#work']] },
      { id: 'start', re: /\b(start|begin|first|onboard|kick ?off|engage|hire|work with|how do we)\b/i, text: 'Start with one lane or all four. Pick a 30-minute slot below, tell us the number you need to move, and within three working days you get a written 30-day plan and what it would cost.', actions: [['Book a call', '#book', true], ['Ways to work with us', '#process']] },
      { id: 'book', re: /\b(book|call|meeting|demo|calendar|schedule|talk to|speak|contact|reach)\b/i, text: 'Pick a time below; it opens Google Calendar with the four of us invited. The audit and the session are free for a limited time.', actions: [['Book a call', '#book', true]] },
      { id: 'where', re: /\b(where|location|based|india|remote|timezone)\b/i, text: 'We are based in India and work with teams anywhere; call times are shown in your timezone in the booking calendar.', actions: [['Book a call', '#book', true]] }
    ];
    var reply = function (q) {
      for (var i = 0; i < answers.length; i++) if (answers[i].re.test(q)) return answers[i];
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
    var VOICE = {"greet":"Hi, I'm Fourward's voice assistant. Ask me what we do, what we've delivered, how we report, or how to get started.","hi":"Hi there. You can ask about our services, the proof behind them, how we report, or book a time with the team.","services":"We work as your whole marketing department, in four lanes. Search, content and AI visibility. Brand, PR and partnerships. Lifecycle and demand generation. And field marketing and events. Each lane has a senior owner, all on one plan, measured on pipeline.","free":"Right now, for a limited time, we're running a free SEO, AEO and GEO audit, plus a free thirty-minute session to walk you through it. For a quick first look, try the AI visibility check at the top of the page.","pricing":"There are three ways in. A thirty-day sprint on one lane, a monthly retainer for all four, or a fixed-scope project. You get the price along with a written thirty-day plan, within three working days of a call.","report":"You get a baseline report first. Then a written update every week, a review call every two weeks, and a full report every month. Traffic, rankings, AI citations, coverage and pipeline, all on one dashboard.","team":"We're four senior marketers from one B2B SaaS growth team, one per lane. Sharang Misri runs lifecycle and demand. Deepak Sharma runs search, content and AI visibility. Geetanjali Sharma leads brand, PR and partnerships. And Rishabh Gautam runs field marketing and events.","proof":"A few highlights. Three times the organic traffic per page after consolidating an archive. Twelve point three million dollars of ARR in SQL pipeline influenced. Over thirty events measured to SQL. Eleven press pieces. And twenty leads in the first week for a new school. Every number on the site names its source.","ai":"Yes, that's our first lane. Ask Google, Masai School versus AccioJob, and its AI Overview cites our comparison page first. We build the pages AI engines quote, and make what you already have easier for them to use.","seo":"Search, content and AI visibility is our first lane. That covers SEO and technical SEO, GEO and AEO, editorial programmes, comparison pages, conversion work, migrations and attribution.","pr":"Brand, PR and partnerships is our second lane. Positioning, media relations, executive thought leadership, review-site reputation, partnerships and LinkedIn. So far, that's eleven press pieces, and a review score rebuilt from two point nine to three point nine.","lifecycle":"Lifecycle and demand generation is lane three. HubSpot automation, email workflows, newsletters and gated content, webinars and podcasts, account-based marketing, and funnel reporting from first touch to closed-won.","events":"Field marketing and events is lane four. Owned event series, executive dinners and summits, partner events, for example with Microsoft, paid media to fill the room, and follow-up within seven days. All of it measured to SQL.","start":"You can start with one lane, or all four. Pick a thirty-minute slot on this page, and tell us the number you need to move. Within three working days, you'll get a written thirty-day plan, and what it would cost.","book":"Just pick a time in the calendar on this page. It opens Google Calendar with all four of us invited. The audit and the session are free, for a limited time.","where":"We're based in India, and we work with teams anywhere. The booking calendar shows call times in your own timezone.","thanks":"Thanks for stopping by. If you'd like to talk it through, pick a time on this page. Bye for now.","unknown":"Good question. That one's best answered by the team directly. I've put an email button on screen, or you can pick a time to talk.","noheard":"Sorry, I didn't catch that. Try asking what we do, or tap one of the questions below."};
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
      var speakLine = function (id, done) { speak(id, VOICE[id], done); };
      var handle = function (q) {
        q = String(q || '').trim(); if (!q) return;
        misses = 0; vYou.textContent = '“' + q + '”'; vActs.innerHTML = ''; vSug.hidden = true; setState('thinking');
        var a = reply(q), id = a.id || 'unknown';
        // the text chat keeps the same transcript
        tSuggest.hidden = true; tAdd('user', esc(q));
        tAdd('bot', esc(a.text) + '<div class="talk-actions">' + a.actions.map(function (x) { return tChip(x[0], x[1], x[2], x[3]); }).join('') + '</div>');
        setTimeout(function () {
          if (!vOpen) return;
          vActs.innerHTML = a.actions.map(function (x) { return tChip(x[0], x[1], x[2], x[3]); }).join('');
          speak(id, VOICE[id] || a.text, function () { if (vOpen) setTimeout(listen, 250); });
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
        if (demo) { setCaption(VOICE.services); markWords(0.55); vYou.textContent = '“What do you do?”'; vSug.hidden = true; vActs.innerHTML = tChip('See services', '#services') + tChip('Book a call', '#book', true); setState('speaking'); return; }
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
     ~30 checks in five categories, run in the visitor's browser against the public web:
       crawl   (15)  robots.txt rules for OAI-SearchBot, GPTBot, PerplexityBot, Google-Extended,
                     Googlebot, Bingbot, ClaudeBot, plus a declared sitemap
       page    (25)  title, description, H1 (single and descriptive), canonical, lang, Open Graph, Twitter card,
                     H2 structure, depth of copy, image alt coverage, noindex; plus a reachable sitemap under crawl
       schema  (20)  valid JSON-LD, Organization (logo, sameAs), WebSite, product/offer, FAQPage
       entity  (25)  Wikidata item whose official website is this domain, Wikipedia article,
                     knowledge summary, linked social and review profiles
       content (15)  llms.txt, question-style headings, pricing, customer proof, docs, blog, comparison pages
     Pages are read through r.jina.ai (adds CORS); Microlink covers title and description when it is busy.
     Every finished check is logged through fwSend(); "Email me the full report" sends the whole result
     to the visitor. Results are cached in the browser for 24 hours per domain. */
  (function () {
  var vis = $('#vis');
  if (vis) {
    var V = {
      form: $('#vis-form'), input: $('#vis-domain'), intro: $('[data-vis-intro]', vis), result: $('[data-vis-result]', vis),
      score: $('[data-vis-score]', vis), ring: $('.ring', vis), logo: $('[data-vis-logo]', vis), name: $('[data-vis-name]', vis),
      domain: $('[data-vis-domain-label]', vis), say: $('[data-vis-say]', vis), cats: $('[data-vis-cats]', vis),
      fixes: $('[data-vis-fixes]', vis), verdict: $('[data-vis-verdict]', vis), progress: $('[data-vis-progress]', vis),
      engines: $('[data-vis-engines]', vis), lead: $('[data-vis-lead]', vis), leadBtn: $('[data-vis-report]', vis),
      status: $('[data-vis-status]', vis), actions: $('[data-vis-actions]', vis),
      scan: $('[data-vis-scan]', vis), bar: $('[data-vis-bar]', vis), pct: $('[data-vis-pct]', vis), steps: $('[data-vis-steps]', vis),
      log: $('[data-vis-log]', vis), scanDomain: $('[data-vis-scan-domain]', vis), grade: $('[data-vis-grade]', vis), counts: $('[data-vis-counts]', vis)
    };
    var CATS = [
      { id: 'crawl', label: 'AI crawler access', icon: 'i-search', max: 15 },
      { id: 'page', label: 'What your homepage tells machines', icon: 'i-grid', max: 25 },
      { id: 'schema', label: 'Structured data', icon: 'i-flag', max: 20 },
      { id: 'entity', label: 'Entity & authority', icon: 'i-users', max: 25 },
      { id: 'content', label: 'AI-ready content', icon: 'i-chat', max: 15 }
    ];
    var escH = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var chip = function (label, cls) { return '<span class="vis-chip ' + (cls || '') + '">' + escH(label) + '</span>'; };
    var withTimeout = function (p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); };
    var getText = function (url, headers, ms) { return withTimeout(fetch(url, { headers: headers || {} }).then(function (r) { return r.text().then(function (t) { return { ok: r.ok, status: r.status, text: t }; }); }), ms || 22000); };
    var busy = function (r) { return r.status === 403 || r.status === 429 || /AbuseAlleviation|rate limit/i.test((r.text || '').slice(0, 300)); };
    var jina = function (domain, path, html) {
      var h = html ? { 'X-Return-Format': 'html' } : { 'X-No-Cache': 'true' };
      if (FOURWARD.jinaKey) h['Authorization'] = 'Bearer ' + FOURWARD.jinaKey;
      return getText('https://r.jina.ai/https://' + domain + (path || ''), h).then(function (r) { if (busy(r)) throw Object.assign(new Error('busy'), { busy: true }); return r; });
    };
    var notFound = function (r) { return !r.ok || /^Warning: Target URL returned error 40\d/m.test(r.text) || /^Title:\s*(page not found|404|not found)/im.test(r.text); };
    var cleanDomain = function (s) { s = String(s || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#\s]/)[0]; return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : ''; };
    var labelOf = function (domain) { var l = domain.split('.')[0]; return l.charAt(0).toUpperCase() + l.slice(1); };
    var alnum = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); };
    var hostOf = function (u) { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; } };
    var sameSite = function (h, d) { return h && (h === d || h.slice(-(d.length + 1)) === '.' + d || d.slice(-(h.length + 1)) === '.' + h); };
    var firstSentences = function (t, n) { var s = String(t || '').split(/(?<=[.!?])\s+/); var out = s.slice(0, n || 2).join(' '); return out.length > 220 ? s[0] : out; };

    var S = null;
    var newState = function (domain) { return { domain: domain, brand: labelOf(domain), checks: [], partial: {}, started: {}, quote: '', noindex: false, score: null, grade: '', verdict: '', ts: Date.now() }; };
    // add(cat, key, passLabel, failLabel, points, max, fix[, statusOverride])
    var add = function (cat, key, ok, bad, pts, max, fix, st) {
      pts = Math.max(0, Math.min(max, Math.round(pts * 10) / 10));
      S.checks.push({ cat: cat, key: key, label: ok, problem: bad, pts: pts, max: max, status: st || (pts >= max ? 'pass' : pts > 0 ? 'warn' : 'fail'), fix: fix || '' });
    };
    var catTotals = function (id) { var g = 0; S.checks.forEach(function (c) { if (c.cat === id) g += c.pts; }); return Math.round(g * 10) / 10; };
    var anyPartial = function () { return Object.keys(S.partial).some(function (k) { return S.partial[k]; }); };

    /* ---- rendering ---- */
    var GLY = { fail: '\u2715', warn: '!', pass: '\u2713' };
    var renderCats = function () {
      V.cats.innerHTML = CATS.map(function (c, i) {
        var head = '<div class="vis-cat-head"><span class="vis-cat-ico"><svg><use href="#' + c.icon + '"/></svg></span><span class="vis-cat-l">' + escH(c.label) + '</span>';
        if (S.partial[c.id] || !S.started[c.id]) return '<li class="vis-cat is-na">' + head + '<span class="vis-cat-score">n/a</span></div><p class="vis-cat-more">Not checked this time: the public reader was busy.</p></li>';
        var mine = S.checks.filter(function (x) { return x.cat === c.id; });
        var got = catTotals(c.id), ratio = got / c.max, cls = ratio >= .8 ? 'good' : ratio >= .5 ? 'mid' : 'low';
        var probs = mine.filter(function (x) { return x.status !== 'pass'; }).sort(function (p, q) { return (q.max - q.pts) - (p.max - p.pts); });
        var passed = mine.length - probs.length;
        var lines = probs.slice(0, 3).map(function (x) { return '<li class="' + x.status + '"><i>' + GLY[x.status] + '</i>' + escH(x.problem) + '</li>'; });
        var more = (probs.length > 3 ? '+' + (probs.length - 3) + ' more issues · ' : '') + passed + ' of ' + mine.length + ' passed';
        return '<li class="vis-cat ' + cls + '" style="--d:' + (i * 90) + 'ms">' + head + '<span class="vis-cat-score">' + Math.round(got) + '<small>/' + c.max + '</small></span></div>' +
          '<div class="vis-meter ' + cls + '"><i data-w="' + Math.round(ratio * 100) + '"></i></div>' +
          (lines.length ? '<ul class="vis-probs">' + lines.join('') + '</ul>' : '<p class="vis-cat-ok"><i>' + GLY.pass + '</i>Every check passed</p>') +
          '<p class="vis-cat-more">' + more + '</p></li>';
      }).join('');
      requestAnimationFrame(function () { requestAnimationFrame(function () { $$('.vis-meter i[data-w]', V.cats).forEach(function (el) { el.style.width = el.getAttribute('data-w') + '%'; }); }); });
      setTimeout(function () { $$('.vis-meter i[data-w]', V.cats).forEach(function (el) { el.style.width = el.getAttribute('data-w') + '%'; }); }, 400);
    };
    var countUp = function (el, to, ms) {
      if (prefersReduced) { el.textContent = to; return; }
      var t0 = performance.now();
      var tick = function (t) { var k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    };
    var setRing = function () {
      if (S.score == null) { V.score.textContent = '–'; V.ring.style.strokeDashoffset = '100'; vis.removeAttribute('data-grade'); V.grade.textContent = 'Partial result'; return; }
      var g = S.score >= 80 ? 'good' : S.score >= 55 ? 'mid' : 'low';
      vis.setAttribute('data-grade', g);
      V.grade.textContent = { good: 'Strong · AI engines can name you', mid: 'Fair · AI sees part of the picture', low: 'Weak · mostly invisible to AI' }[g];
      V.score.textContent = '0'; V.ring.style.strokeDashoffset = '100';
      requestAnimationFrame(function () { requestAnimationFrame(function () { V.ring.style.strokeDashoffset = String(100 - S.score); countUp(V.score, S.score, 1300); }); });
      var fin = S.score; setTimeout(function () { if (S && S.score === fin) { V.score.textContent = fin; V.ring.style.strokeDashoffset = String(100 - fin); } }, 1700);
    };
    var renderCounts = function (fromCache) {
      var n = { pass: 0, warn: 0, fail: 0 }; S.checks.forEach(function (c) { n[c.status]++; });
      var proof = fromCache ? 'Scanned ' + Math.max(1, Math.round((Date.now() - S.ts) / 6e4)) + ' min ago · 9 live sources' : '9 live sources read' + (S.secs ? ' in ' + S.secs.toFixed(1) + 's' : '');
      V.counts.innerHTML = '<span class="pass"><b>' + n.pass + '</b>passed</span><span class="warn"><b>' + n.warn + '</b>weak</span><span class="fail"><b>' + n.fail + '</b>failed</span><em><svg><use href="#i-scan"/></svg>' + escH(proof) + '</em>';
    };
    var renderFixes = function () {
      var probs = S.checks.filter(function (x) { return x.status !== 'pass'; }).sort(function (a, b) { return (b.max - b.pts) - (a.max - a.pts); }).slice(0, 3);
      if (!probs.length) { V.fixes.hidden = true; return; }
      V.fixes.hidden = false;
      $('ol', V.fixes).innerHTML = probs.map(function (x, i) { return '<li><span class="vis-gap-n">0' + (i + 1) + '</span><span class="vis-gap-t">' + escH(x.problem) + '<small>' + escH(CATS.filter(function (c) { return c.id === x.cat; })[0].label) + '</small></span><span class="vis-gap-p">−' + (Math.round((x.max - x.pts) * 10) / 10) + ' pts</span></li>'; }).join('');
    };

    /* ---- live scan panel: each step is a real request ---- */
    var STEPS = [
      ['home', 'Fetching your homepage'],
      ['schema', 'Parsing structured data'],
      ['robots', 'Reading robots.txt for 7 AI crawlers'],
      ['sitemap', 'Reading your XML sitemap'],
      ['llms', 'Looking for llms.txt'],
      ['wikidata', 'Matching your entity on Wikidata'],
      ['wiki', 'Checking Wikipedia and knowledge summaries'],
      ['content', 'Finding pricing, proof, docs and comparisons'],
      ['score', 'Scoring your site']
    ];
    var ST = {}, shown = 0, creep = null;
    var renderSteps = function () {
      V.steps.innerHTML = STEPS.map(function (x) { return '<li class="vis-step" data-step="' + x[0] + '"><span class="vis-step-i" aria-hidden="true"></span><span class="vis-step-l">' + x[1] + '</span><span class="vis-step-d"></span></li>'; }).join('');
    };
    var target = function () { var d = 0, r = 0; STEPS.forEach(function (x) { var st = ST[x[0]]; if (st === 'done') d++; else if (st === 'run') r++; }); return Math.min(99, ((d + r * 0.35) / STEPS.length) * 100); };
    var paint = function (p) { shown = p; V.bar.style.width = p.toFixed(1) + '%'; V.pct.textContent = Math.floor(p) + '%'; };
    var step = function (id, state, detail, tone, url) {
      if (!S || !V.steps) return;
      if (ST[id] === 'done' && state === 'run') return;
      ST[id] = state; var li = $('[data-step="' + id + '"]', V.steps); if (!li) return;
      li.className = 'vis-step is-' + state + (tone ? ' is-' + tone : '');
      if (detail != null) $('.vis-step-d', li).textContent = detail;
      if (url) V.log.innerHTML = '<span>GET</span>' + escH(url);
    };
    var progress = function (t) { if (t && V.log) V.log.innerHTML = '<span>&rsaquo;</span>' + escH(t); };
    var stopCreep = function () { clearInterval(creep); creep = null; };
    var startCreep = function () {
      stopCreep();
      creep = setInterval(function () { var t = target(); if (shown < t) paint(Math.min(t, shown + Math.max(0.6, (t - shown) * 0.18))); else if (shown < 98) paint(shown + 0.04); }, 90);
    };

    /* ---- the checks ---- */
    var robotsChecks = function (body) {
      S.started.crawl = true;
      var groups = [], cur = null;
      String(body || '').split(/\r?\n/).forEach(function (line) {
        line = line.replace(/#.*$/, '').trim(); if (!line) return;
        var m = /^user-agent\s*:\s*(.+)$/i.exec(line);
        if (m) { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(m[1].trim().toLowerCase()); return; }
        var d = /^(allow|disallow)\s*:\s*(.*)$/i.exec(line); if (d && cur) cur.rules.push({ allow: d[1].toLowerCase() === 'allow', path: d[2].trim() });
      });
      var blocked = function (agent) {
        var g = groups.filter(function (x) { return x.agents.indexOf(agent.toLowerCase()) >= 0; })[0] || groups.filter(function (x) { return x.agents.indexOf('*') >= 0; })[0];
        if (!g) return false;
        var rootBlocked = g.rules.some(function (r) { return !r.allow && (r.path === '/' || r.path === '/*'); });
        var rootAllowed = g.rules.some(function (r) { return r.allow && (r.path === '/' || r.path === '/*' || r.path === '/$'); });
        return rootBlocked && !rootAllowed;
      };
      var bots = [
        ['oai', 'OAI-SearchBot', 3, 'ChatGPT search can read you', 'ChatGPT search blocked', 'Allow OAI-SearchBot in robots.txt. It is the crawler ChatGPT search uses to read and cite pages.'],
        ['gpt', 'GPTBot', 1, 'GPTBot allowed', 'GPTBot blocked', 'Allow GPTBot unless you have a reason to opt out; blocking it keeps you out of ChatGPT browsing and future models.'],
        ['pplx', 'PerplexityBot', 2, 'Perplexity can read you', 'Perplexity blocked', 'Allow PerplexityBot. Perplexity only cites pages it can fetch.'],
        ['gext', 'Google-Extended', 1, 'Gemini can use you', 'Google-Extended blocked', 'Allow Google-Extended so Gemini and Google\'s AI features can use your pages.'],
        ['gbot', 'Googlebot', 2, 'Googlebot allowed', 'Googlebot blocked', 'Googlebot is blocked from your homepage. Nothing else matters until that is fixed.'],
        ['bing', 'Bingbot', 2, 'Bing / Copilot allowed', 'Bingbot blocked', 'Allow Bingbot. Copilot and ChatGPT search both lean on Bing\'s index.'],
        ['claude', 'ClaudeBot', 1, 'Claude can read you', 'ClaudeBot blocked', 'Allow ClaudeBot so Claude can read and cite you.']
      ];
      bots.forEach(function (b) { var no = body ? blocked(b[1]) : false; add('crawl', b[0], b[3], b[4], no ? 0 : b[2], b[2], b[5]); });
      var sitemap = body && /^\s*sitemap\s*:\s*\S+/im.test(body);
      S.sitemapUrl = sitemap ? (/^\s*sitemap\s*:\s*(\S+)/im.exec(body) || [])[1] : '';
      var okBots = bots.filter(function (b) { return !(body && blocked(b[1])); }).length;
      step('robots', 'done', body ? okBots + ' of 7 AI crawlers allowed' : 'No robots.txt found', body && okBots === 7 ? 'good' : 'bad');
      add('crawl', 'sitemap', 'Sitemap declared', body ? 'No sitemap in robots.txt' : 'No robots.txt', sitemap ? 1 : 0, 1, body ? 'Add a "Sitemap:" line to robots.txt pointing at your XML sitemap.' : 'Publish a robots.txt with a "Sitemap:" line so every crawler finds your pages.');
    };

    var pageChecks = function (doc) {
      S.started.page = true; S.started.schema = true;
      var q = function (sel) { return doc.querySelector(sel); };
      var metaC = function (sel) { var m = q(sel); return m ? String(m.getAttribute('content') || '').trim() : ''; };
      var title = (doc.title || '').trim();
      var desc = metaC('meta[name="description" i]') || '';
      var ogT = metaC('meta[property="og:title" i]'), ogD = metaC('meta[property="og:description" i]'), ogI = metaC('meta[property="og:image" i]');
      var tw = metaC('meta[name="twitter:card" i]');
      var robotsMeta = metaC('meta[name="robots" i]') + ' ' + metaC('meta[name="googlebot" i]');
      var h1s = [].slice.call(doc.querySelectorAll('h1')).filter(function (h) { return h.textContent.trim(); });
      var h2s = [].slice.call(doc.querySelectorAll('h2')).filter(function (h) { return h.textContent.trim(); });
      var canonical = q('link[rel~="canonical" i]');
      var lang = (doc.documentElement.getAttribute('lang') || '').trim();
      var site = metaC('meta[property="og:site_name" i]');
      if (site) S.brand = site;
      else if (title) { var parts = title.split(/\s[|\-–—:·]\s/).map(function (p) { return p.trim(); }).filter(Boolean).sort(function (a, b) { return a.length - b.length; }); if (parts[0] && parts[0].length <= 30 && parts.length > 1) S.brand = parts[0]; }
      S.noindex = /noindex/i.test(robotsMeta);
      S.description = desc || ogD;
      var tl = title.length, dl = desc.length;
      add('page', 'title', 'Title ' + tl + ' chars', !title ? 'No title' : 'Title ' + tl + ' chars', !title ? 0 : (tl >= 30 && tl <= 60 ? 3 : 1), 3, 'Write a 30–60 character title that says what you do and for whom.');
      add('page', 'brand', 'Brand in title', 'Brand missing from title', alnum(title).indexOf(alnum(S.brand.split(/\s+/)[0])) >= 0 ? 1 : 0, 1, 'Put your brand name in the homepage title.');
      add('page', 'desc', 'Description ' + dl + ' chars', !desc ? 'No meta description' : 'Description ' + dl + ' chars', !desc ? 0 : (dl >= 120 && dl <= 160 ? 3 : dl >= 70 && dl <= 200 ? 1.5 : 0.5), 3, 'Write a 120–160 character meta description in plain words: what it is, who it is for, the outcome.');
      var h1t = h1s.length ? h1s[0].textContent.replace(/\s+/g, ' ').trim() : '', h1w = h1t ? h1t.split(' ').length : 0, h1desc = h1w >= 4 && alnum(h1t) !== alnum(S.brand);
      add('page', 'h1', 'One H1', h1s.length ? h1s.length + ' H1s' : 'No H1', h1s.length === 1 ? 1.5 : h1s.length > 1 ? 0.5 : 0, 1.5, 'Use exactly one H1 on the homepage.');
      add('page', 'h1text', 'H1 says what you do', h1s.length ? 'H1 too vague (' + h1w + ' words)' : 'No H1 to describe you', h1desc ? 1.5 : 0, 1.5, 'Make the H1 a plain sentence that says what the product does and for whom, not a slogan.');
      add('page', 'canonical', 'Canonical set', 'No canonical tag', canonical ? 1 : 0, 1, 'Add a canonical link so engines know which URL is the original.');
      add('page', 'lang', 'Language set', 'No lang attribute', lang ? 1 : 0, 1, 'Set the lang attribute on the html tag.');
      var og = (ogT ? 1 : 0) + (ogD ? 1 : 0) + (ogI ? 1 : 0);
      add('page', 'og', 'Open Graph complete', og ? 'Open Graph incomplete' : 'No Open Graph', og === 3 ? 2 : og ? 1 : 0, 2, 'Add og:title, og:description and og:image; AI answers and link previews use them.');
      add('page', 'twitter', 'Twitter card', 'No Twitter card', tw ? 1 : 0, 1, 'Add a twitter:card tag.');
      add('page', 'h2', h2s.length + ' H2 sections', h2s.length ? 'Only ' + h2s.length + ' H2 section' + (h2s.length > 1 ? 's' : '') : 'No H2 sections', h2s.length >= 4 ? 2 : h2s.length >= 2 ? 1 : 0, 2, 'Break the homepage into clear H2 sections: product, who it is for, proof, pricing.');
      var copy = doc.body ? doc.body.cloneNode(true) : null;
      if (copy) [].slice.call(copy.querySelectorAll('script,style,noscript,template,svg')).forEach(function (n) { n.remove(); });
      var text = copy ? copy.textContent.replace(/\s+/g, ' ').trim() : '', words = text ? text.split(' ').length : 0;
      add('page', 'depth', words + ' words of copy', 'Thin copy (' + words + ' words)', words >= 1000 ? 5 : words >= 600 ? 3 : words >= 300 ? 1.5 : 0, 5, 'Give engines more to quote: explain the product, who it is for, use cases, proof and pricing on the homepage, in text rather than images.');
      var imgs = [].slice.call(doc.querySelectorAll('img')).filter(function (i) { var w = +i.getAttribute('width') || 0, hh = +i.getAttribute('height') || 0; return !(w && w <= 2) && !(hh && hh <= 2); });
      var alts = imgs.filter(function (i) { return i.hasAttribute('alt') || i.getAttribute('role') === 'presentation' || i.getAttribute('aria-hidden') === 'true'; }).length, cov = imgs.length ? alts / imgs.length : 1;
      add('page', 'alt', imgs.length ? Math.round(cov * 100) + '% of images have alt text' : 'No images to describe', Math.round(cov * 100) + '% of images have alt text', cov >= 0.9 ? 3 : cov >= 0.6 ? 1.5 : 0, 3, 'Add alt text to images; engines cannot read logos, screenshots or diagrams without it.');
      if (S.noindex) add('page', 'noindex', 'Indexable', 'Homepage set to noindex', 0, 0, 'Remove noindex from the homepage robots meta tag; engines are told to ignore it.', 'fail');

      // structured data
      var blocks = [].slice.call(doc.querySelectorAll('script[type="application/ld+json" i]')), parsed = 0, nodes = [];
      var walk = function (o) { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { o.forEach(walk); return; } if (o['@type']) nodes.push(o); Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') walk(o[k]); }); };
      blocks.forEach(function (b) { try { walk(JSON.parse(b.textContent)); parsed++; } catch (e) {} });
      var types = function (n) { return [].concat(n['@type']).map(String); };
      var has = function (re) { return nodes.filter(function (n) { return types(n).some(function (t) { return re.test(t); }); }); };
      var orgs = has(/^(Organization|Corporation|OnlineBusiness|OnlineStore|LocalBusiness|ProfessionalService|NGO)$/i);
      var org = orgs[0] || null;
      var sameAs = org ? [].concat(org.sameAs || []).filter(function (x) { return typeof x === 'string'; }) : [];
      S.sameAs = sameAs;
      add('schema', 'jsonld', blocks.length + ' JSON-LD block' + (blocks.length > 1 ? 's' : ''), blocks.length ? 'JSON-LD has errors' : 'No JSON-LD', parsed ? 3 : 0, 3, blocks.length ? 'Fix the JSON-LD on the homepage; it does not parse.' : 'Add JSON-LD structured data to the homepage.');
      add('schema', 'org', 'Organization schema', 'No Organization schema', org ? 6 : 0, 6, 'Add Organization schema with your name, URL, logo and social profiles. It is the strongest entity signal you control.');
      add('schema', 'logo', 'Logo in schema', 'No logo in schema', org && org.logo ? 2 : 0, 2, 'Add a logo URL to your Organization schema.');
      add('schema', 'sameas', sameAs.length + ' profiles in sameAs', sameAs.length ? 'Only ' + sameAs.length + ' profile' + (sameAs.length > 1 ? 's' : '') + ' in sameAs' : 'No sameAs profiles', sameAs.length >= 3 ? 4 : sameAs.length ? 2 : 0, 4, 'List LinkedIn, X, Crunchbase, G2 and other profiles in Organization sameAs so engines connect them to you.');
      add('schema', 'website', 'WebSite schema', 'No WebSite schema', has(/^WebSite$/i).length ? 1 : 0, 1, 'Add WebSite schema.');
      add('schema', 'product', 'Product / offer schema', 'No product or offer schema', has(/^(SoftwareApplication|WebApplication|MobileApplication|Product|Offer|AggregateOffer|Service)$/i).length ? 2 : 0, 2, 'Describe the product with SoftwareApplication (or Product/Service) schema, including pricing offers.');
      var faq = has(/^FAQPage$/i).length > 0;
      add('schema', 'faq', 'FAQ schema', 'No FAQ schema', faq ? 2 : 0, 2, 'Add an FAQ section with FAQPage schema; answer engines lift these answers verbatim.');

      // what content needs later
      var hrefs = [].slice.call(doc.querySelectorAll('a[href]')).map(function (a) { try { return new URL(a.getAttribute('href'), 'https://' + S.domain + '/'); } catch (e) { return null; } }).filter(Boolean);
      S.links = { internal: hrefs.filter(function (u) { return sameSite(u.hostname.replace(/^www\./, ''), S.domain); }).map(function (u) { return u.pathname.toLowerCase() + ' ' + u.hostname.toLowerCase(); }), external: hrefs.map(function (u) { return u.href.toLowerCase(); }) };
      step('home', 'done', words.toLocaleString() + ' words · ' + h2s.length + ' sections', words >= 600 ? 'good' : 'bad');
      step('schema', 'done', blocks.length ? blocks.length + ' JSON-LD block' + (blocks.length > 1 ? 's' : '') + (org ? ' · Organization' : ' · no Organization') : 'No JSON-LD found', org ? 'good' : 'bad');
      S.questions = [].slice.call(doc.querySelectorAll('h2,h3,summary,dt')).filter(function (h) { return /\?\s*$/.test(h.textContent.trim()); }).length;
      S.faq = faq;
    };

    var liteChecks = function (m) {
      S.partial.page = true; S.partial.schema = true; S.partial.content = true;
      step('home', 'done', 'Reader busy · partial read', 'bad'); step('schema', 'done', 'Skipped: page not readable', 'bad'); step('content', 'done', 'Skipped: page not readable', 'bad');
      if (m.brand) S.brand = m.brand;
      S.description = m.description || '';
      S.links = { internal: [], external: [] }; S.sameAs = [];
      if (m.logo) { V.logo.src = m.logo; V.logo.hidden = false; }
    };

    var entityChecks = function () {
      S.started.entity = true;
      var brand = S.brand, label = labelOf(S.domain), first = brand.split(/\s+/)[0];
      var wd = function (params) { return withTimeout(fetch('https://www.wikidata.org/w/api.php?' + params + '&format=json&origin=*').then(function (r) { return r.ok ? r.json() : null; }), 9000).catch(function () { return null; }); };
      var matchWikidata = function (term) {
        return wd('action=wbsearchentities&language=en&type=item&limit=8&search=' + encodeURIComponent(term)).then(function (j) {
          var ids = ((j && j.search) || []).map(function (s) { return s.id; });
          if (!ids.length) return null;
          return wd('action=wbgetentities&props=claims|sitelinks|descriptions&languages=en&sitefilter=enwiki&ids=' + ids.join('|')).then(function (j2) {
            var ents = (j2 && j2.entities) || {}, hit = null;
            ids.some(function (id) { var e = ents[id]; if (!e || !e.claims || !e.claims.P856) return false; var ok = e.claims.P856.some(function (c) { var v = c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value; return sameSite(hostOf(v), S.domain); }); if (ok) hit = e; return ok; });
            return hit;
          });
        });
      };
      var summary = function (title) { return withTimeout(fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/\s+/g, '_'))).then(function (r) { return r.ok ? r.json() : null; }), 8000).catch(function () { return null; }); };
      var looksRight = function (w) { return w && w.type === 'standard' && w.extract && new RegExp(alnum(first), 'i').test(alnum((w.title || '') + ' ' + w.extract.slice(0, 160))) && /company|software|platform|service|startup|corporation|application|app\b|product|brand|firm|agency|school/i.test(w.extract.slice(0, 260)); };
      var ddg = function (term) { return withTimeout(fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(term) + '&format=json&no_html=1&skip_disambig=1').then(function (r) { return r.ok ? r.json() : null; }), 8000).catch(function () { return null; }).then(function (d) { return d && d.Abstract && d.Abstract.length > 40 && new RegExp(alnum(first), 'i').test(alnum(d.Abstract.slice(0, 120))) ? d : null; }); };

      step('wikidata', 'run', 'Searching "' + brand + '"', null, 'https://www.wikidata.org/w/api.php?search=' + encodeURIComponent(brand));
      var pWd = matchWikidata(brand).then(function (e) { return e || (alnum(label) !== alnum(brand) ? matchWikidata(label) : null); });
      pWd.then(function (e) { step('wikidata', 'done', e ? e.id + ' matches ' + S.domain : 'No item tied to ' + S.domain, e ? 'good' : 'bad'); step('wiki', 'run', '', null, 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(brand.replace(/\s+/g, '_'))); });
      var pWiki = pWd.then(function (e) {
        var t = e && e.sitelinks && e.sitelinks.enwiki && e.sitelinks.enwiki.title;
        if (t) return summary(t).then(function (w) { return { w: w, linked: true }; });
        return summary(brand + ' (company)').then(function (w) { return looksRight(w) ? w : summary(brand).then(function (w2) { return looksRight(w2) ? w2 : null; }); }).then(function (w) { return { w: w, linked: false }; });
      });
      var pDdg = ddg(brand).then(function (d) { return d || ddg(brand + ' company'); });
      return Promise.all([pWd, pWiki, pDdg]).then(function (r) {
        var e = r[0], wk = r[1], d = r[2];
        add('entity', 'wikidata', 'Wikidata item links your site', 'No Wikidata item for your domain', e ? 10 : 0, 10, 'Create or correct your Wikidata item with your official website, logo and founding facts. Google\'s knowledge graph and AI engines read it.');
        var wiki = wk && wk.w && wk.w.type === 'standard';
        add('entity', 'wikipedia', wk && wk.linked ? 'Wikipedia article' : 'Wikipedia article (unlinked)', 'No Wikipedia article', wiki ? (wk.linked ? 8 : 5) : 0, 8, wiki ? 'Link your Wikipedia article and your domain through Wikidata (official website).' : 'No Wikipedia article is tied to you. Earn the independent coverage that makes one possible: press, analyst reports, reviews.');
        add('entity', 'summary', 'Knowledge summary found', 'No knowledge summary', d || wiki ? 2 : 0, 2, 'No knowledge-panel summary exists for you yet; it usually follows Wikidata and Wikipedia.');
        var pool = (S.sameAs || []).concat((S.links && S.links.external) || []).join(' ').toLowerCase();
        var kinds = [/linkedin\.com\/(company|showcase|school)/, /(twitter|x)\.com\/(?!share|intent|home)/, /crunchbase\.com\/organization/, /g2\.com\/products/, /capterra\.(com|co)/, /github\.com\//, /youtube\.com\/(@|c\/|channel)/, /trustpilot\.com\/review/].filter(function (re) { return re.test(pool); }).length;
        add('entity', 'profiles', kinds + ' linked profiles', kinds ? 'Only ' + kinds + ' linked profile' + (kinds > 1 ? 's' : '') : 'No linked profiles', kinds >= 4 ? 5 : kinds >= 2 ? 3 : kinds ? 1 : 0, 5, 'Link your LinkedIn, X, Crunchbase and G2 profiles from the site and from your schema.');
        step('wiki', 'done', wiki ? 'Article: ' + (wk.w.title || brand) : d ? 'No article · summary found' : 'No article or summary', wiki ? 'good' : 'bad');
        if (wiki && wk.w.extract) S.quote = firstSentences(wk.w.extract, 2);
        else if (d && d.Abstract) S.quote = firstSentences(d.Abstract, 2);
        else if (e && e.descriptions && e.descriptions.en) S.quote = e.descriptions.en.value;
      });
    };

    var contentChecks = function () {
      if (S.partial.content) return;
      S.started.content = true;
      var paths = (S.links && S.links.internal || []).join('\n');
      var linked = function (re) { return re.test(paths); };
      var llms = S.llms || { ok: false, links: 0 };
      add('content', 'llms', 'llms.txt' + (llms.ok ? ' (' + llms.links + ' links)' : ''), llms.ok ? 'llms.txt has few links' : 'No llms.txt', llms.ok ? (llms.links >= 5 ? 4 : 3) : 0, 4, 'Publish /llms.txt: a short Markdown map of your key pages for AI agents.');
      add('content', 'questions', S.questions + ' question headings', S.questions ? 'Only ' + S.questions + ' question heading' : 'No question-style headings', S.questions >= 2 || S.faq ? 3 : S.questions ? 1.5 : 0, 3, 'Add question-style headings that match what buyers ask: how much it costs, what it integrates with, how it compares.');
      add('content', 'pricing', 'Pricing page linked', 'No pricing page linked', linked(/\/(pricing|plans|price)(\/|\s|$)/) ? 2 : 0, 2, 'Link a pricing page from the homepage. "How much is X" is one of the most common AI prompts.');
      add('content', 'proof', 'Customer stories linked', 'No customer stories linked', linked(/\/(customers?|case-stud|success-stor|testimonials|clients)/) ? 2 : 0, 2, 'Link customer stories or case studies; engines cite proof pages.');
      add('content', 'docs', 'Docs or help linked', 'No docs or help linked', linked(/\/(docs|documentation|help|support|developers?|api)(\/|\s|$)|^\/?\S*\s(docs|help|support|developers?)\./m) ? 1 : 0, 1, 'Link docs or a help centre; AI answers lean on them for "how does X work".');
      add('content', 'blog', 'Blog or resources linked', 'No blog or resources linked', linked(/\/(blog|resources|guides|learn|insights|articles|news)(\/|\s|$)|\s(blog)\./m) ? 1 : 0, 1, 'Link a blog or resources hub from the homepage.');
      var foundPages = ['pricing', 'proof', 'docs', 'blog'].filter(function (k) { return S.checks.some(function (c) { return c.key === k && c.status === 'pass'; }); }).length + (linked(/(\/vs[\/-]|-vs-|\/compare|\/comparison|alternative)/) ? 1 : 0);
      step('content', 'done', foundPages + ' of 5 buyer pages linked', foundPages >= 4 ? 'good' : 'bad');
      add('content', 'compare', 'Comparison pages linked', 'No comparison pages linked', linked(/(\/vs[\/-]|-vs-|\/compare|\/comparison|alternative)/) ? 2 : 0, 2, 'Publish comparison pages (X vs Y, alternatives). They are cited heavily for buying prompts.');
    };

    /* ---- flow ---- */
    var CACHE = 'fw-vis3:';
    var readCache = function (d) { try { var j = JSON.parse(localStorage.getItem(CACHE + d) || 'null'); return j && Date.now() - j.ts < 864e5 ? j : null; } catch (e) { return null; } };
    var writeCache = function () { if (anyPartial()) return; try { localStorage.setItem(CACHE + S.domain, JSON.stringify(S)); } catch (e) {} };

    var begin = function (domain) {
      S = newState(domain);
      vis.setAttribute('data-state', 'scanning'); vis.removeAttribute('data-grade');
      V.intro.hidden = true; V.result.hidden = true; V.scan.hidden = false; V.engines.hidden = true; V.engines.innerHTML = ''; V.fixes.hidden = true;
      V.lead.hidden = true; V.lead.classList.remove('is-sent'); V.leadBtn.hidden = false; V.actions.hidden = true; V.status.textContent = '';
      $('button[type="submit"]', V.lead).disabled = false;
      V.score.textContent = '…'; V.ring.style.strokeDashoffset = '100';
      V.name.textContent = labelOf(domain); V.domain.textContent = domain; V.say.textContent = ''; V.verdict.textContent = '';
      V.logo.hidden = false; V.logo.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=64'; V.logo.onerror = function () { V.logo.hidden = true; };
      ST = {}; renderSteps(); paint(0); V.scanDomain.textContent = domain; S.t0 = Date.now();
      step('home', 'run', '', null, 'https://' + domain + '/'); step('schema', 'run');
      startCreep();
    };

    var finish = function (fromCache) {
      stopCreep(); vis.setAttribute('data-state', 'done');
      V.scan.hidden = true; V.result.hidden = false;
      if (!fromCache && S.t0) S.secs = (Date.now() - S.t0) / 1000;
      var total = 0; S.checks.forEach(function (c) { total += c.pts; });
      S.score = anyPartial() ? null : Math.round(S.noindex ? Math.min(total, 15) : total);
      S.grade = S.score == null ? '' : S.score >= 80 ? 'Strong' : S.score >= 55 ? 'Fair' : 'Weak';
      var probs = S.checks.filter(function (x) { return x.status !== 'pass'; }).length;
      var name = S.brand || S.domain;
      S.verdict = S.score == null ? 'The public page reader is busy for ' + S.domain + ' right now, so part of the check could not run. Try again in a minute, or ask for the full report and we will run it by hand.' :
        S.score >= 80 ? name + ' is well set up for AI engines. What is left is earning citations; the full report shows where competitors are cited instead.' :
        S.score >= 55 ? name + ' is readable, but AI engines are working from thin material. ' + probs + ' checks need work; the three above cost you the most.' :
        'AI engines have little to go on for ' + name + '. ' + probs + ' of ' + S.checks.length + ' checks failed or need work; the three above cost you the most.';
      V.name.textContent = S.brand; V.say.textContent = S.quote ? '"' + S.quote + '"' : (S.description ? '"' + S.description + '"' : '');
      renderCats(); setRing(); renderFixes(); renderCounts(fromCache);
      var dl = $('[data-vis-detail]', vis); if (dl) dl.href = FOURWARD.toolUrl + '?check=' + encodeURIComponent(S.domain);
      setTimeout(function () { try { vis.dispatchEvent(new CustomEvent('vis:done', { detail: summaryOf() })); } catch (e) {} }, 0);
      V.verdict.textContent = S.verdict; V.actions.hidden = false;
      writeCache();
      capture(fromCache);
      if (FOURWARD.aiCheckUrl) engines(S.domain);
    };

    var run = function (domain) {
      var c = readCache(domain);
      if (c) { begin(domain); STEPS.forEach(function (x, i) { setTimeout(function () { step(x[0], 'done', 'From your earlier scan', 'good'); }, prefersReduced ? 0 : i * 70); }); setTimeout(function () { S = c; S.started = c.started || {}; finish(true); }, prefersReduced ? 0 : 900); return; }
      begin(domain);
      var pPage = jina(domain, '/', true).then(function (r) {
        if (!r.ok || !r.text) throw new Error('unreachable');
        pageChecks(new DOMParser().parseFromString(r.text, 'text/html'));
      }).catch(function (e) {
        return withTimeout(fetch('https://api.microlink.io/?url=' + encodeURIComponent('https://' + domain)).then(function (r) { return r.json(); }), 15000).then(function (j) {
          if (!j || j.status !== 'success') throw e;
          var d = j.data || {}; liteChecks({ brand: d.publisher, description: d.description, logo: d.logo && d.logo.url });
        }).catch(function () { liteChecks({}); });
      });

      step('robots', 'run', '', null, 'https://' + domain + '/robots.txt');
      var pRobots = jina(domain, '/robots.txt').then(function (r) {
        var body = (r.text.split(/Markdown Content:\s*/)[1] || r.text || '');
        if (notFound(r) || !/user-agent/i.test(body)) robotsChecks(null); else robotsChecks(body);
        var smUrl = S.sitemapUrl || 'https://' + domain + '/sitemap.xml';
        step('sitemap', 'run', '', null, smUrl);
        return getText('https://r.jina.ai/' + smUrl, FOURWARD.jinaKey ? { 'Authorization': 'Bearer ' + FOURWARD.jinaKey } : {}, 15000).then(function (sr) {
          if (busy(sr)) throw Object.assign(new Error('busy'), { busy: true });
          var list = notFound(sr) ? [] : (sr.text.match(/https?:\/\/[^\s<>"')\]]+/g) || []).filter(function (u) { return u.indexOf('r.jina.ai') < 0 && u !== smUrl; });
          var subs = list.filter(function (u) { return /\.xml(\.gz)?$|sitemap/i.test(u); }).length;
          var isIndex = /sitemapindex/i.test(sr.text) || (list.length > 0 && subs / list.length > 0.6);
          step('sitemap', 'done', isIndex ? 'Index of ' + subs + ' sitemaps' : list.length ? list.length.toLocaleString() + ' URLs listed' : 'Missing or empty', isIndex || list.length >= 20 ? 'good' : 'bad');
          if (isIndex) add('crawl', 'sitemapurls', 'Sitemap index (' + subs + ' sitemaps)', 'Sitemap index is empty', subs ? 2 : 0, 2, 'Publish an XML sitemap that lists every page you want cited, and keep it current.');
          else add('crawl', 'sitemapurls', list.length + ' URLs in sitemap', list.length ? 'Sitemap lists only ' + list.length + ' URLs' : 'Sitemap missing or empty', list.length >= 20 ? 2 : list.length ? 1 : 0, 2, 'Publish an XML sitemap that lists every page you want cited, and keep it current.');
        }).catch(function (e) { if (e && e.busy) { S.partial.crawl = true; step('sitemap', 'done', 'Reader busy · skipped', 'bad'); return; } step('sitemap', 'done', 'Not reachable', 'bad'); add('crawl', 'sitemapurls', 'Sitemap reachable', 'Sitemap not reachable', 0, 2, 'Publish an XML sitemap at /sitemap.xml that lists every page you want cited.'); });
      }).catch(function (e) { if (e && (e.busy || e.message === 'timeout')) { S.partial.crawl = true; step('robots', 'done', 'Reader busy · skipped', 'bad'); } else robotsChecks(null); if (ST.sitemap !== 'done') step('sitemap', 'done', 'Skipped', 'bad'); });

      step('llms', 'run', '', null, 'https://' + domain + '/llms.txt');
      var pLlms = jina(domain, '/llms.txt').then(function (r) {
        var body = (r.text.split(/Markdown Content:\s*/)[1] || '').trim();
        var ok = !notFound(r) && body.length > 40 && !/not found|doesn'?t exist|page not found/i.test(body.slice(0, 300)) && !/<html/i.test(body.slice(0, 200));
        S.llms = { ok: ok, links: ok ? (body.match(/\]\(https?:\/\//g) || []).length : 0 };
        step('llms', 'done', ok ? 'Found · ' + S.llms.links + ' links' : 'Not found', ok ? 'good' : 'bad');
      }).catch(function (e) { if (e && e.busy) S.partial.content = true; S.llms = { ok: false, links: 0 }; step('llms', 'done', e && e.busy ? 'Reader busy · skipped' : 'Not found', 'bad'); });

      var pEntity = pPage.then(entityChecks).catch(function () { S.partial.entity = true; step('wikidata', 'done', 'Lookup failed', 'bad'); step('wiki', 'done', 'Lookup failed', 'bad'); });
      Promise.all([pPage, pRobots, pLlms, pEntity]).then(function () {
        step('content', 'run', '', null, 'https://' + domain + '/ · internal links');
        contentChecks(); if (ST.content !== 'done') step('content', 'done', 'Skipped', 'bad');
        step('score', 'run', '');
        progress('Weighting every result into one score…');
        setTimeout(function () { step('score', 'done', 'Scored out of 100', 'good'); paint(100); setTimeout(function () { finish(false); }, prefersReduced ? 0 : 450); }, prefersReduced ? 0 : 650);
      });
    };

    /* ---- capture: every finished check is logged once per domain per 12 hours ---- */
    var summaryOf = function () {
      return {
        domain: S.domain, brand: S.brand, score: S.score, grade: S.grade, partial: anyPartial(), quote: S.quote, verdict: S.verdict,
        categories: CATS.map(function (c) { return { id: c.id, label: c.label, score: S.partial[c.id] ? null : Math.round(catTotals(c.id)), max: c.max }; }),
        checks: S.checks.map(function (x) { return { cat: x.cat, key: x.key, status: x.status, label: x.status === 'pass' ? x.label : x.problem, pts: x.pts, max: x.max, fix: '' }; }),
        topIssues: S.checks.filter(function (x) { return x.status !== 'pass'; }).sort(function (a, b) { return (b.max - b.pts) - (a.max - a.pts); }).slice(0, 5).map(function (x) { return x.problem; })
      };
    };
    var capture = function () {
      var k = 'fw-cap:' + S.domain;
      try { var last = +localStorage.getItem(k) || 0; if (Date.now() - last < 432e5) return; localStorage.setItem(k, String(Date.now())); } catch (e) {}
      var p = summaryOf(); p.type = 'check';
      fwSend(p, true).catch(function () {});
    };
    var textReport = function (s, who) {
      var L = [];
      L.push('AI visibility report for ' + s.domain);
      L.push(s.score == null ? 'Score: not available (part of the check could not run)' : 'Score: ' + s.score + '/100 (' + s.grade + ')');
      L.push('');
      CATS.forEach(function (c) {
        var cs = s.categories.filter(function (x) { return x.id === c.id; })[0];
        L.push(c.label.toUpperCase() + (cs && cs.score != null ? '  ' + cs.score + '/' + c.max : '  not checked'));
        s.checks.filter(function (x) { return x.cat === c.id; }).forEach(function (x) { L.push('  ' + (x.status === 'pass' ? '[ok]  ' : x.status === 'warn' ? '[weak]' : '[x]   ') + x.label); });
        L.push('');
      });
      if (s.topIssues && s.topIssues.length) { L.push('BIGGEST GAPS'); s.topIssues.slice(0, 3).forEach(function (t, i) { L.push('  ' + (i + 1) + '. ' + t); }); L.push(''); }
      L.push(s.verdict); L.push('');
      L.push('What to fix first, and in what order, is what we cover in your free session: ' + location.origin + location.pathname + '#book');
      L.push(''); L.push('Fourward · four lanes, one direction');
      return L.join('\n');
    };

    /* ---- report request ---- */
    V.leadBtn.addEventListener('click', function () {
      V.lead.hidden = false; V.actions.hidden = true;
      var nm = $('input[name="name"]', V.lead), em = $('input[name="email"]', V.lead);
      try { var saved = JSON.parse(localStorage.getItem('fw-lead') || 'null'); if (saved) { nm.value = nm.value || saved.name || ''; em.value = em.value || saved.email || ''; } } catch (e) {}
      $('[data-vis-lead-domain]', V.lead).textContent = S.domain;
      (nm.value ? em : nm).focus();
    });
    $('[data-vis-lead-cancel]', V.lead).addEventListener('click', function () { V.lead.hidden = true; V.actions.hidden = false; V.status.textContent = ''; });
    V.lead.addEventListener('submit', function (e) {
      e.preventDefault();
      var nm = $('input[name="name"]', V.lead), em = $('input[name="email"]', V.lead), co = $('input[name="company"]', V.lead), hp = $('input[name="website"]', V.lead);
      var name = nm.value.trim(), email = em.value.trim();
      if (hp.value) { V.status.textContent = 'Sent.'; return; }
      if (name.length < 2) { nm.focus(); V.status.className = 'vis-status err'; V.status.textContent = 'Please add your name.'; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { em.focus(); V.status.className = 'vis-status err'; V.status.textContent = 'Please add a valid email.'; return; }
      var sent = []; try { sent = JSON.parse(localStorage.getItem('fw-sent') || '[]').filter(function (t) { return Date.now() - t < 36e5; }); } catch (err) {}
      if (sent.length >= 3) { V.status.className = 'vis-status err'; V.status.textContent = 'You have requested a few reports already. Give it an hour, or email us.'; return; }
      var btn = $('button[type="submit"]', V.lead); btn.disabled = true; V.status.className = 'vis-status'; V.status.textContent = 'Sending your report…';
      var s = summaryOf(), p = Object.assign({}, s, { type: 'report', name: name, email: email, company: co.value.trim() || S.brand });
      p.textReport = textReport(s);
      fwSend(p).then(function () {
        try { localStorage.setItem('fw-lead', JSON.stringify({ name: name, email: email })); sent.push(Date.now()); localStorage.setItem('fw-sent', JSON.stringify(sent)); } catch (err) {}
        V.lead.classList.add('is-sent'); V.actions.hidden = false; V.leadBtn.hidden = true;
        V.status.className = 'vis-status ok'; V.status.innerHTML = 'Sent. Your full report for <b>' + escH(S.domain) + '</b> is on its way to <b>' + escH(email) + '</b>. Want it walked through? <a href="#book">Book your free session</a>.';
      }).catch(function () {
        btn.disabled = false;
        var mail = 'mailto:' + FOURWARD.emails.join(',') + '?subject=' + encodeURIComponent('AI visibility report for ' + S.domain) + '&body=' + encodeURIComponent('Hi Fourward team,\n\nPlease send me the full AI visibility report for ' + S.domain + '.\n\nName: ' + name + '\nEmail: ' + email + '\n');
        V.status.className = 'vis-status err'; V.status.innerHTML = 'We could not send it automatically just now. <a href="' + mail + '">Email us instead</a> and we will reply with the report.';
      });
    });

    // optional: the real engine answers from a small server (see server/ai-check-worker.js)
    var engines = function (domain) {
      V.engines.hidden = false;
      V.engines.innerHTML = ['ChatGPT', 'Perplexity', 'Google AI'].map(function (n) { return '<div class="vis-eng"><b>' + n + ' says</b><i class="vis-skel" style="width:60%"></i></div>'; }).join('');
      withTimeout(fetch(FOURWARD.aiCheckUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain: domain }) }).then(function (r) { return r.json(); }), 45000)
        .then(function (j) {
          var map = [['ChatGPT', j.chatgpt], ['Perplexity', j.perplexity], ['Google AI', j.google]];
          V.engines.innerHTML = map.map(function (m) { var a = m[1] || {}; return '<div class="vis-eng"><b>' + m[0] + ' says</b>' + (a.text ? escH(a.text) : '<span class="muted">No answer returned.</span>') + (a.mentions === false ? ' ' + chip('Does not name you', 'bad') : a.mentions === true ? ' ' + chip('Names you', 'ok') : '') + '</div>'; }).join('');
        })
        .catch(function () { V.engines.innerHTML = '<div class="vis-eng"><b>Engine answers</b>Not available right now. The full report covers them.</div>'; });
    };

    var reset = function () {
      vis.setAttribute('data-state', 'idle'); vis.removeAttribute('data-grade');
      stopCreep(); V.scan.hidden = true;
      V.score.textContent = '–'; V.ring.style.strokeDashoffset = '100'; V.result.hidden = true; V.intro.hidden = false;
      V.lead.hidden = true; V.lead.classList.remove('is-sent'); V.leadBtn.hidden = false; V.status.textContent = ''; $('button[type="submit"]', V.lead).disabled = false;
      V.input.value = ''; V.input.focus();
    };
    $('[data-vis-reset]', vis).addEventListener('click', reset);
    $$('[data-vis-try]', vis).forEach(function (b) { b.addEventListener('click', function () { V.input.value = b.getAttribute('data-vis-try'); V.form.requestSubmit(); }); });
    V.form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (vis.getAttribute('data-state') === 'scanning') return;
      var d = cleanDomain(V.input.value);
      if (!d) { V.input.setCustomValidity('Enter a domain like yourcompany.com'); V.input.reportValidity(); setTimeout(function () { V.input.setCustomValidity(''); }, 1500); return; }
      V.input.value = d; run(d);
    });
    var vq = /[?&]check=([^&]+)/.exec(location.search);
    if (vq) { var vd = cleanDomain(decodeURIComponent(vq[1])); if (vd) { V.input.value = vd; run(vd); } }
  }
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
      for (var i = 1; i <= 7; i++) m.classList.add('s' + i);
      $$('[data-count]', m).forEach(function (el) { el.textContent = (+el.getAttribute('data-count')).toFixed(+(el.getAttribute('data-dec') || 0)); });
      $$('[data-type]', m).forEach(function (el) { el.textContent = el.getAttribute('data-type'); });
      var c = $('.lm-caret', m); if (c) c.style.display = 'none';
    };
    var reset = function (m) {
      for (var i = 1; i <= 7; i++) m.classList.remove('s' + i);
      $$('[data-count]', m).forEach(function (el) { el.textContent = (0).toFixed(+(el.getAttribute('data-dec') || 0)); });
      $$('[data-type]', m).forEach(function (el) { el.textContent = ''; });
    };
    var PLAY = {
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

})();
