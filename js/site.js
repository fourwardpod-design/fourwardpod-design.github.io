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
    var targets = links.map(function (a) { return $(a.getAttribute('href')); }).filter(Boolean);
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
    var chip = function (label, href, dark, external) {
      return '<a class="talk-chip' + (dark ? ' dark' : '') + '" href="' + href + '"' + (external ? ' target="_blank" rel="noopener"' : '') + '>' + esc(label) + ' <svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></a>';
    };
    var answers = [
      { re: /\b(hi|hello|hey|yo|namaste)\b/i, text: 'Hi. Ask about the services, the proof, how we report, or pick a time below.', actions: [['See services', '#services'], ['Book a call', '#book', true]] },
      { re: /\b(what do you do|services?|offer|offerings|capabilit\w*|do you do|help (me|us) with|lanes?|everything you do|what can you)\b/i, text: 'Everything a B2B SaaS marketing department does, in four lanes: search, content & AI visibility; brand, PR & partnerships; lifecycle & demand generation; field marketing & events. Twenty-eight disciplines, each with a senior owner, one plan, measured on pipeline.', actions: [['See services', '#services'], ['Book a call', '#book', true]] },
      { re: /\b(free|audit|offer|trial)\b/i, text: 'For a limited time we run a free SEO, AEO and GEO audit and a free 30-minute session to walk you through it. Run the AI visibility check at the top for a first look.', actions: [['Book your free session', '#book', true], ['Run the check', '#vis']] },
      { re: /\b(price|pricing|cost|budget|fee|retainer|sprint|how much|rates?)\b/i, text: 'Three ways in: a 30-day sprint on one lane, a monthly pod retainer for all four, or a fixed-scope project. The price comes with the written 30-day plan, within three working days of a call.', actions: [['Ways to work with us', '#process'], ['Book a call', '#book', true]] },
      { re: /\b(report|reporting|process|cadence|how do you work|dashboard|weekly|monthly|update)\b/i, text: 'A baseline report first, then a written progress update every week, a review call every two weeks and a full report every month. Traffic, rankings, AI citations, coverage and pipeline on one dashboard.', actions: [['How we work', '#process']] },
      { re: /\b(team|who|people|founders?|sharang|deepak|geetanjali|rishabh)\b/i, text: 'Four senior marketers from one B2B SaaS growth team, one per lane: Sharang Misri (lifecycle & demand), Deepak Sharma (search, content & AI visibility), Geetanjali Sharma (brand, PR & partnerships) and Rishabh Gautam (field marketing & events).', actions: [['Meet the team', '#team']] },
      { re: /\b(proof|results?|work|case|cases|numbers?|evidence|portfolio|clients?)\b/i, text: '3× organic traffic per page after consolidating an archive, $12.3M of ARR SQL pipeline influenced, 30+ events measured to SQL, 11 press pieces, and 20 leads in week one for a new school. Every number names its source.', actions: [['See the work', '#work'], ['By the numbers', '#numbers']] },
      { re: /\b(ai|geo|aeo|chatgpt|perplexity|gemini|overview|overviews|llm|cited|citation)\b/i, text: 'Yes, this is lane one. Google\'s AI Overview answers "header bidding" with our film, and cites our comparison page first for "scaler vs masai". We build the pages and films AI engines quote, then consolidate what you already have.', actions: [['See the receipt', '#work'], ['Search & AI visibility', '#services']] },
      { re: /\b(seo|search|content|blog|ranking|rank|traffic|website|cro|landing)\b/i, text: 'Search, content and AI visibility is lane one: SEO and technical SEO, GEO and AEO, editorial programmes, learning hubs and comparison pages, CRO, migrations and attribution.', actions: [['See services', '#services'], ['See the work', '#work']] },
      { re: /\b(pr|press|brand|media|review|reviews|g2|trustpilot|partnership|linkedin|positioning)\b/i, text: 'Brand, PR and partnerships is lane two: positioning, media relations, executive thought leadership, review-site reputation, partnerships and LinkedIn programmes. Eleven press pieces and a review score rebuilt from 2.9 to 3.9 so far.', actions: [['See services', '#services'], ['See the work', '#work']] },
      { re: /\b(email|hubspot|automation|lifecycle|nurture|webinar|webinars|newsletter|demand|abm|pipeline|sql|mql)\b/i, text: 'Lifecycle and demand generation is lane three: HubSpot automation, email workflows, newsletters and gated content, webinars and podcasts, ABM, and funnel reporting from first touch to closed-won.', actions: [['See services', '#services']] },
      { re: /\b(event|events|dinner|summit|conference|roundtable|field|booth)\b/i, text: 'Field marketing and events is lane four: owned event series, executive dinners and summits, partner events (for example with Microsoft), paid media to fill the room, and follow-up within seven days, measured to SQL.', actions: [['See services', '#services'], ['NEXERA with Microsoft', '#work']] },
      { re: /\b(start|begin|first|onboard|kick ?off|engage|hire|work with|how do we)\b/i, text: 'Start with one lane or all four. Pick a 30-minute slot below, tell us the number you need to move, and within three working days you get a written 30-day plan and what it would cost.', actions: [['Book a call', '#book', true], ['Ways to work with us', '#process']] },
      { re: /\b(book|call|meeting|demo|calendar|schedule|talk to|speak|contact|reach)\b/i, text: 'Pick a time below; it opens Google Calendar with the four of us invited. The audit and the session are free for a limited time.', actions: [['Book a call', '#book', true]] },
      { re: /\b(where|location|based|india|remote|timezone)\b/i, text: 'We are based in India and work with teams anywhere; call times are shown in your timezone in the booking calendar.', actions: [['Book a call', '#book', true]] }
    ];
    var reply = function (q) {
      for (var i = 0; i < answers.length; i++) if (answers[i].re.test(q)) return answers[i];
      return { text: 'Noted. The quickest way to get a real answer is to send this to the team, or pick a time below and we will come prepared.', actions: [['Email this to the team', mailAll + '?subject=' + encodeURIComponent('From the Fourward website') + '&body=' + encodeURIComponent(q + '\n\n'), true, true], ['Book a call', '#book']] };
    };
    var add = function (cls, html) { var d = document.createElement('div'); d.className = 'talk-msg ' + cls; d.innerHTML = html; tLog.appendChild(d); tSheet.scrollTop = tSheet.scrollHeight; return d; };
    var ask = function (q) {
      q = q.trim(); if (!q) return;
      openSheet(); tSuggest.hidden = true;
      add('user', esc(q));
      var typing = add('bot', '<span class="talk-typing"><i></i><i></i><i></i></span>');
      var a = reply(q);
      setTimeout(function () {
        typing.innerHTML = esc(a.text) + '<div class="talk-actions">' + a.actions.map(function (x) { return chip(x[0], x[1], x[2], x[3]); }).join('') + '</div>';
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
  var vis = $('#vis');
  if (vis) {
    var V = {
      form: $('#vis-form'), input: $('#vis-domain'), intro: $('[data-vis-intro]', vis), result: $('[data-vis-result]', vis),
      score: $('[data-vis-score]', vis), ring: $('.ring', vis), logo: $('[data-vis-logo]', vis), name: $('[data-vis-name]', vis),
      domain: $('[data-vis-domain-label]', vis), say: $('[data-vis-say]', vis), cats: $('[data-vis-cats]', vis),
      fixes: $('[data-vis-fixes]', vis), verdict: $('[data-vis-verdict]', vis), progress: $('[data-vis-progress]', vis),
      engines: $('[data-vis-engines]', vis), lead: $('[data-vis-lead]', vis), leadBtn: $('[data-vis-report]', vis),
      status: $('[data-vis-status]', vis), actions: $('[data-vis-actions]', vis)
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
    var renderCats = function () {
      V.cats.innerHTML = CATS.map(function (c) {
        var head = '<div class="vis-cat-head"><span class="vis-k"><svg><use href="#' + c.icon + '"/></svg>' + escH(c.label) + '</span>';
        if (S.partial[c.id]) return '<li class="vis-cat">' + head + '<span class="vis-cat-score">–</span></div><div class="vis-v">' + chip('Not checked right now', 'warn') + '</div></li>';
        var mine = S.checks.filter(function (x) { return x.cat === c.id; });
        if (!S.started[c.id]) return '<li class="vis-cat">' + head + '<span class="vis-cat-score"><i class="vis-skel" style="width:34px"></i></span></div><div class="vis-meter"><i></i></div></li>';
        var got = catTotals(c.id), ratio = got / c.max, cls = ratio >= .8 ? 'good' : ratio >= .5 ? 'mid' : 'low';
        var probs = mine.filter(function (x) { return x.status !== 'pass'; }).sort(function (a, b) { return (b.max - b.pts) - (a.max - a.pts); });
        var passed = mine.length - probs.length;
        var chips = probs.slice(0, 4).map(function (x) { return chip(x.problem, x.status === 'fail' ? 'bad' : 'warn'); });
        if (probs.length > 4) chips.push(chip('+' + (probs.length - 4) + ' more', ''));
        if (passed) chips.push(chip(passed + ' passed', 'ok'));
        return '<li class="vis-cat">' + head + '<span class="vis-cat-score">' + (Math.round(got)) + '<small>/' + c.max + '</small></span></div><div class="vis-meter ' + cls + '"><i style="width:' + Math.round(ratio * 100) + '%"></i></div><div class="vis-v">' + chips.join('') + '</div></li>';
      }).join('');
    };
    var setRing = function () {
      if (S.score == null) { V.score.textContent = '–'; V.ring.style.strokeDashoffset = '100'; vis.removeAttribute('data-grade'); return; }
      V.score.textContent = S.score; V.ring.style.strokeDashoffset = String(100 - S.score);
      vis.setAttribute('data-grade', S.score >= 80 ? 'good' : S.score >= 55 ? 'mid' : 'low');
    };
    var renderFixes = function () {
      var probs = S.checks.filter(function (x) { return x.status !== 'pass' && x.fix; }).sort(function (a, b) { return (b.max - b.pts) - (a.max - a.pts); }).slice(0, 3);
      if (!probs.length) { V.fixes.hidden = true; return; }
      V.fixes.hidden = false;
      $('ol', V.fixes).innerHTML = probs.map(function (x) { return '<li><b>' + escH(x.problem) + '.</b> ' + escH(x.fix) + '</li>'; }).join('');
    };
    var progress = function (t) { V.progress.textContent = t || ''; };

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
      S.questions = [].slice.call(doc.querySelectorAll('h2,h3,summary,dt')).filter(function (h) { return /\?\s*$/.test(h.textContent.trim()); }).length;
      S.faq = faq;
    };

    var liteChecks = function (m) {
      S.partial.page = true; S.partial.schema = true; S.partial.content = true;
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

      progress('Looking you up on Wikidata and Wikipedia…');
      var pWd = matchWikidata(brand).then(function (e) { return e || (alnum(label) !== alnum(brand) ? matchWikidata(label) : null); });
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
      add('content', 'compare', 'Comparison pages linked', 'No comparison pages linked', linked(/(\/vs[\/-]|-vs-|\/compare|\/comparison|alternative)/) ? 2 : 0, 2, 'Publish comparison pages (X vs Y, alternatives). They are cited heavily for buying prompts.');
    };

    /* ---- flow ---- */
    var CACHE = 'fw-vis3:';
    var readCache = function (d) { try { var j = JSON.parse(localStorage.getItem(CACHE + d) || 'null'); return j && Date.now() - j.ts < 864e5 ? j : null; } catch (e) { return null; } };
    var writeCache = function () { if (anyPartial()) return; try { localStorage.setItem(CACHE + S.domain, JSON.stringify(S)); } catch (e) {} };

    var begin = function (domain) {
      S = newState(domain);
      vis.setAttribute('data-state', 'scanning'); vis.removeAttribute('data-grade');
      V.intro.hidden = true; V.result.hidden = false; V.engines.hidden = true; V.engines.innerHTML = ''; V.fixes.hidden = true;
      V.lead.hidden = true; V.lead.classList.remove('is-sent'); V.leadBtn.hidden = false; V.actions.hidden = true; V.status.textContent = '';
      $('button[type="submit"]', V.lead).disabled = false;
      V.score.textContent = '…'; V.ring.style.strokeDashoffset = '100';
      V.name.textContent = labelOf(domain); V.domain.textContent = domain; V.say.textContent = ''; V.verdict.textContent = '';
      V.logo.hidden = false; V.logo.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=64'; V.logo.onerror = function () { V.logo.hidden = true; };
      renderCats(); progress('Reading your homepage…');
    };

    var finish = function (fromCache) {
      vis.setAttribute('data-state', 'done'); progress('');
      var total = 0; S.checks.forEach(function (c) { total += c.pts; });
      S.score = anyPartial() ? null : Math.round(S.noindex ? Math.min(total, 15) : total);
      S.grade = S.score == null ? '' : S.score >= 80 ? 'Strong' : S.score >= 55 ? 'Fair' : 'Weak';
      var probs = S.checks.filter(function (x) { return x.status !== 'pass'; }).length;
      var name = S.brand || S.domain;
      S.verdict = S.score == null ? 'The public page reader is busy for ' + S.domain + ' right now, so part of the check could not run. Try again in a minute, or ask for the full report and we will run it by hand.' :
        S.score >= 80 ? name + ' is well set up for AI engines. What is left is earning citations; the full report shows where competitors are cited instead.' :
        S.score >= 55 ? name + ' is readable, but AI engines are working from thin material. ' + probs + ' checks need work; the three above move the score most.' :
        'AI engines have little to go on for ' + name + '. ' + probs + ' of ' + S.checks.length + ' checks failed or need work. Start with the three above.';
      V.name.textContent = S.brand; V.say.textContent = S.quote ? '"' + S.quote + '"' : (S.description ? '"' + S.description + '"' : '');
      renderCats(); setRing(); renderFixes();
      V.verdict.textContent = S.verdict; V.actions.hidden = false;
      writeCache();
      capture(fromCache);
      if (FOURWARD.aiCheckUrl) engines(S.domain);
    };

    var run = function (domain) {
      var c = readCache(domain);
      if (c) { begin(domain); S = c; S.started = c.started || {}; setTimeout(function () { finish(true); }, prefersReduced ? 0 : 500); return; }
      begin(domain);
      var pPage = jina(domain, '/', true).then(function (r) {
        if (!r.ok || !r.text) throw new Error('unreachable');
        pageChecks(new DOMParser().parseFromString(r.text, 'text/html'));
      }).catch(function (e) {
        return withTimeout(fetch('https://api.microlink.io/?url=' + encodeURIComponent('https://' + domain)).then(function (r) { return r.json(); }), 15000).then(function (j) {
          if (!j || j.status !== 'success') throw e;
          var d = j.data || {}; liteChecks({ brand: d.publisher, description: d.description, logo: d.logo && d.logo.url });
        }).catch(function () { liteChecks({}); });
      }).then(function () { renderCats(); progress('Reading robots.txt and llms.txt…'); });

      var pRobots = jina(domain, '/robots.txt').then(function (r) {
        var body = (r.text.split(/Markdown Content:\s*/)[1] || r.text || '');
        if (notFound(r) || !/user-agent/i.test(body)) robotsChecks(null); else robotsChecks(body);
        var smUrl = S.sitemapUrl || 'https://' + domain + '/sitemap.xml';
        return getText('https://r.jina.ai/' + smUrl, FOURWARD.jinaKey ? { 'Authorization': 'Bearer ' + FOURWARD.jinaKey } : {}, 15000).then(function (sr) {
          if (busy(sr)) throw Object.assign(new Error('busy'), { busy: true });
          var list = notFound(sr) ? [] : (sr.text.match(/https?:\/\/[^\s<>"')\]]+/g) || []).filter(function (u) { return u.indexOf('r.jina.ai') < 0 && u !== smUrl; });
          var subs = list.filter(function (u) { return /\.xml(\.gz)?$|sitemap/i.test(u); }).length;
          var isIndex = /sitemapindex/i.test(sr.text) || (list.length > 0 && subs / list.length > 0.6);
          if (isIndex) add('crawl', 'sitemapurls', 'Sitemap index (' + subs + ' sitemaps)', 'Sitemap index is empty', subs ? 2 : 0, 2, 'Publish an XML sitemap that lists every page you want cited, and keep it current.');
          else add('crawl', 'sitemapurls', list.length + ' URLs in sitemap', list.length ? 'Sitemap lists only ' + list.length + ' URLs' : 'Sitemap missing or empty', list.length >= 20 ? 2 : list.length ? 1 : 0, 2, 'Publish an XML sitemap that lists every page you want cited, and keep it current.');
        }).catch(function (e) { if (e && e.busy) { S.partial.crawl = true; return; } add('crawl', 'sitemapurls', 'Sitemap reachable', 'Sitemap not reachable', 0, 2, 'Publish an XML sitemap at /sitemap.xml that lists every page you want cited.'); });
      }).catch(function (e) { if (e && (e.busy || e.message === 'timeout')) S.partial.crawl = true; else robotsChecks(null); }).then(renderCats);

      var pLlms = jina(domain, '/llms.txt').then(function (r) {
        var body = (r.text.split(/Markdown Content:\s*/)[1] || '').trim();
        var ok = !notFound(r) && body.length > 40 && !/not found|doesn'?t exist|page not found/i.test(body.slice(0, 300)) && !/<html/i.test(body.slice(0, 200));
        S.llms = { ok: ok, links: ok ? (body.match(/\]\(https?:\/\//g) || []).length : 0 };
      }).catch(function (e) { if (e && e.busy) S.partial.content = true; S.llms = { ok: false, links: 0 }; });

      var pEntity = pPage.then(entityChecks).then(renderCats).catch(function () { S.partial.entity = true; });
      Promise.all([pPage, pRobots, pLlms, pEntity]).then(function () { contentChecks(); finish(false); });
    };

    /* ---- capture: every finished check is logged once per domain per 12 hours ---- */
    var summaryOf = function () {
      return {
        domain: S.domain, brand: S.brand, score: S.score, grade: S.grade, partial: anyPartial(), quote: S.quote, verdict: S.verdict,
        categories: CATS.map(function (c) { return { id: c.id, label: c.label, score: S.partial[c.id] ? null : Math.round(catTotals(c.id)), max: c.max }; }),
        checks: S.checks.map(function (x) { return { cat: x.cat, key: x.key, status: x.status, label: x.status === 'pass' ? x.label : x.problem, pts: x.pts, max: x.max, fix: x.status === 'pass' ? '' : x.fix }; }),
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
        s.checks.filter(function (x) { return x.cat === c.id; }).forEach(function (x) { L.push('  ' + (x.status === 'pass' ? '[ok]  ' : x.status === 'warn' ? '[fix] ' : '[x]   ') + x.label + (x.fix ? '\n        ' + x.fix : '')); });
        L.push('');
      });
      L.push(s.verdict); L.push('');
      L.push('Book your free session: ' + location.origin + location.pathname + '#book');
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

})();
