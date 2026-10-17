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
    // "Request this time" button will send visitors there instead of email.
    bookingUrl: '',
    // Optional: a small server that returns the real ChatGPT / Perplexity / Google answers for a
    // domain (see server/ai-check-worker.js). Leave empty and the hero check runs browser-only.
    aiCheckUrl: '',
    // Optional: a free key from jina.ai lifts the per-domain limit on the anonymous page fetcher.
    jinaKey: '',
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

      var subject = 'Intro call request · ' + host;
      var body = 'Hi Fourward team,\n\nI would like a 30-minute intro call.\n\nProposed time: ' + host +
        (same ? '' : '\n(' + local + ' in my timezone, ' + saved + ')') +
        '\n\nThe number I need to move:\nWebsite:\n\nThanks,\n';
      reqBtn.setAttribute('aria-disabled', 'false');
      reqBtn.href = FOURWARD.bookingUrl || ('mailto:' + FOURWARD.emails.join(',') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body));
      if (FOURWARD.bookingUrl) { reqBtn.target = '_blank'; reqBtn.rel = 'noopener'; }

      var iso = function (ms) { return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); };
      gcal.href = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
        '&text=' + encodeURIComponent('Fourward · intro call') +
        '&dates=' + iso(start) + '/' + iso(end) +
        '&details=' + encodeURIComponent('30-minute intro call with Fourward. The number I need to move: ') +
        '&add=' + encodeURIComponent(FOURWARD.emails.join(','));
      gcal.hidden = false; gcalSep.hidden = false;
    };

    var pickDay = function (day) { selectedDay = day; selectedSlot = null; renderMonth(); renderSlots(); renderConfirm(); };

    prevBtn.addEventListener('click', function () { view.m--; if (view.m < 0) { view.m = 11; view.y--; } renderMonth(); });
    nextBtn.addEventListener('click', function () { view.m++; if (view.m > 11) { view.m = 0; view.y++; } renderMonth(); });
    tzSel.addEventListener('change', function () { renderSlots(); renderConfirm(); });
    reqBtn.addEventListener('click', function (e) { if (reqBtn.getAttribute('aria-disabled') === 'true') e.preventDefault(); });

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
      { re: /\b(book|call|meeting|demo|calendar|schedule|talk to|speak|contact|reach)\b/i, text: 'Pick a time below. The request goes to all four of us, and the owner of the lane your problem belongs to joins the call.', actions: [['Book a call', '#book', true]] },
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
     Everything here runs in the visitor's browser against the public web:
       - the site's own HTML (via r.jina.ai, which adds CORS headers): title, description, schema;
         if that fetcher is busy, Microlink supplies title, description and logo instead
       - robots.txt: may GPTBot, PerplexityBot, Google-Extended and ClaudeBot read the site?
       - llms.txt
       - the entity record AI engines lean on: Wikipedia (REST summary, search) and DuckDuckGo
     Results are cached in the browser for 24 hours per domain.
     FOURWARD.jinaKey (free at jina.ai) lifts the anonymous per-domain limit; FOURWARD.aiCheckUrl
     adds the real ChatGPT / Perplexity / Google answers (see server/ai-check-worker.js). */
  var vis = $('#vis');
  if (vis) {
    var vForm = $('#vis-form'), vInput = $('#vis-domain'), vIntro = $('[data-vis-intro]', vis), vResult = $('[data-vis-result]', vis);
    var vScore = $('[data-vis-score]', vis), vRing = $('.ring', vis), vLogo = $('[data-vis-logo]', vis), vName = $('[data-vis-name]', vis);
    var vDomain = $('[data-vis-domain-label]', vis), vSay = $('[data-vis-say]', vis), vVerdict = $('[data-vis-verdict]', vis), vCta = $('[data-vis-cta]', vis), vEngines = $('[data-vis-engines]', vis);
    var ROWS = ['site', 'entity', 'crawl', 'schema'];
    var cell = function (k) { return $('[data-v="' + k + '"]', vis); };
    var chip = function (label, cls) { return '<span class="vis-chip ' + (cls || '') + '">' + esc(label) + '</span>'; };
    var withTimeout = function (p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); };
    var getText = function (url, headers, ms) { return withTimeout(fetch(url, { headers: headers || {} }).then(function (r) { return r.text().then(function (t) { return { ok: r.ok, status: r.status, text: t }; }); }), ms || 22000); };
    var busy = function (r) { return r.status === 403 || r.status === 429 || /AbuseAlleviation|rate limit/i.test((r.text || '').slice(0, 300)); };
    var jina = function (domain, path, html) {
      var h = html ? { 'X-Return-Format': 'html' } : { 'X-No-Cache': 'true' };
      if (FOURWARD.jinaKey) h['Authorization'] = 'Bearer ' + FOURWARD.jinaKey;
      return getText('https://r.jina.ai/https://' + domain + (path || ''), h).then(function (r) { if (busy(r)) throw Object.assign(new Error('busy'), { busy: true }); return r; });
    };
    var cleanDomain = function (s) { s = String(s || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#\s]/)[0]; return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : ''; };
    var meta = function (html, name) { var re = new RegExp('<meta[^>]+(?:name|property)=["\']' + name + '["\'][^>]*content=["\']([^"\']*)["\']', 'i'); var m = re.exec(html); if (m) return m[1]; re = new RegExp('<meta[^>]+content=["\']([^"\']*)["\'][^>]*(?:name|property)=["\']' + name + '["\']', 'i'); m = re.exec(html); return m ? m[1] : ''; };
    var decode = function (s) { var t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
    var labelOf = function (domain) { var l = domain.split('.')[0]; return l.charAt(0).toUpperCase() + l.slice(1); };
    var brandFrom = function (domain, html) {
      var site = meta(html, 'og:site_name'); if (site) return decode(site).trim();
      var t = /<title[^>]*>([^<]*)<\/title>/i.exec(html); if (t) { var parts = decode(t[1]).split(/\s[|\-–—:·]\s/).map(function (p) { return p.trim(); }).filter(Boolean); if (parts.length) { parts.sort(function (a, b) { return a.length - b.length; }); if (parts[0].length <= 30) return parts[0]; } }
      return labelOf(domain);
    };
    var firstSentences = function (t, n) { return String(t || '').split(/(?<=[.!?])\s+/).slice(0, n || 2).join(' '); };
    var state = { domain: '', score: 0, parts: {}, partial: false };
    var setScore = function () {
      var s = 0; Object.keys(state.parts).forEach(function (k) { s += state.parts[k]; }); s = Math.max(0, Math.min(100, Math.round(s)));
      state.score = s;
      if (state.partial) { vScore.textContent = '–'; vRing.style.strokeDashoffset = '100'; vis.removeAttribute('data-grade'); return; }
      vScore.textContent = s; vRing.style.strokeDashoffset = String(100 - s);
      vis.setAttribute('data-grade', s >= 70 ? 'good' : s >= 40 ? 'mid' : 'low');
    };
    var skel = function () { ROWS.forEach(function (k) { cell(k).innerHTML = '<i class="vis-skel"></i>'; }); };
    var reset = function () {
      vis.setAttribute('data-state', 'idle'); vis.removeAttribute('data-grade'); state = { domain: '', score: 0, parts: {}, partial: false };
      vScore.textContent = '–'; vRing.style.strokeDashoffset = '100'; vResult.hidden = true; vIntro.hidden = false; vEngines.hidden = true; vEngines.innerHTML = '';
      skel(); vSay.textContent = ''; vVerdict.textContent = ''; vLogo.hidden = true; vInput.value = ''; vInput.focus();
    };
    $('[data-vis-reset]', vis).addEventListener('click', reset);
    $$('[data-vis-try]', vis).forEach(function (b) { b.addEventListener('click', function () { vInput.value = b.getAttribute('data-vis-try'); vForm.requestSubmit(); }); });

    // 24h cache of rendered results, per domain
    var cacheKey = function (d) { return 'fw-vis:' + d; };
    var readCache = function (d) { try { var j = JSON.parse(localStorage.getItem(cacheKey(d)) || 'null'); return j && Date.now() - j.ts < 864e5 ? j : null; } catch (e) { return null; } };
    var writeCache = function () {
      if (state.partial) return;
      try { localStorage.setItem(cacheKey(state.domain), JSON.stringify({ ts: Date.now(), score: state.score, name: vName.textContent, say: vSay.textContent, verdict: vVerdict.textContent, logo: vLogo.hidden ? '' : vLogo.src, rows: ROWS.reduce(function (o, k) { o[k] = cell(k).innerHTML; return o; }, {}) })); } catch (e) {}
    };
    var begin = function (domain) {
      state = { domain: domain, score: 0, parts: {}, partial: false };
      vis.setAttribute('data-state', 'scanning'); vis.removeAttribute('data-grade');
      vIntro.hidden = true; vResult.hidden = false; vEngines.hidden = true; vEngines.innerHTML = ''; skel();
      vScore.textContent = '…'; vRing.style.strokeDashoffset = '100';
      vName.textContent = labelOf(domain); vDomain.textContent = domain; vSay.textContent = ''; vVerdict.textContent = '';
      vLogo.hidden = false; vLogo.src = 'https://www.google.com/s2/favicons?domain=' + encodeURIComponent(domain) + '&sz=64'; vLogo.onerror = function () { vLogo.hidden = true; };
    };
    var finish = function (brand) {
      vis.setAttribute('data-state', 'done');
      var s = state.score, name = brand || state.domain, domain = state.domain;
      var v = state.partial ? 'The public fetcher is busy for ' + domain + ' right now, so part of the check could not run. Try again in a minute, or let us run the full report.' :
              s >= 70 ? name + ' is readable to the engines. The next question is what they actually say about you when a buyer asks, and whether they cite you or a competitor.' :
              s >= 40 ? name + ' can be read, but the engines are working from thin material. A clear entity record, Organization schema and a tight description are quick wins.' :
              'The engines have very little to go on for ' + name + '. Before any AI answer can name you, the basics above need fixing.';
      vVerdict.textContent = v;
      var subject = 'AI visibility report for ' + domain;
      var body = 'Hi Fourward team,\n\nPlease run the full AI visibility report for ' + domain + (state.partial ? '' : ' (quick check scored ' + s + '/100)') + '.\n\nName:\nRole:\n';
      vCta.href = 'mailto:' + FOURWARD.emails.join(',') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
      writeCache();
      if (FOURWARD.aiCheckUrl) engines(domain);
    };
    var replay = function (domain, c) {
      begin(domain); vName.textContent = c.name; if (c.logo) vLogo.src = c.logo;
      var i = 0; var step = function () { if (i < ROWS.length) { cell(ROWS[i]).innerHTML = c.rows[ROWS[i]]; i++; setTimeout(step, prefersReduced ? 0 : 260); } else { vSay.textContent = c.say; state.parts.all = c.score; setScore(); vVerdict.textContent = c.verdict; finish(c.name); } };
      setTimeout(step, prefersReduced ? 0 : 300);
    };

    var run = function (domain) {
      var c = readCache(domain); if (c) return replay(domain, c);
      begin(domain);
      var brand = null;

      // 1) the site's own HTML, or Microlink's reading of it when the fetcher is busy
      var pHtml = jina(domain, '/', true).then(function (r) {
        if (!r.ok || !r.text) throw new Error('unreachable');
        return { html: r.text };
      }).catch(function (e) {
        return withTimeout(fetch('https://api.microlink.io/?url=' + encodeURIComponent('https://' + domain)).then(function (r) { return r.json(); }), 15000).then(function (j) {
          if (!j || j.status !== 'success') throw e;
          var d = j.data || {}; return { lite: true, title: d.title || '', description: d.description || '', brand: d.publisher || '', logo: d.logo && d.logo.url };
        });
      }).then(function (res) {
        var title, description, chips = [];
        if (res.lite) {
          brand = res.brand || labelOf(domain); title = res.title; description = res.description;
          if (res.logo) { vLogo.src = res.logo; vLogo.hidden = false; }
          chips.push(title ? chip('Title', 'ok') : chip('No title', 'bad'));
          chips.push(!description ? chip('No description', 'bad') : (description.length < 50 || description.length > 170) ? chip('Description ' + description.length + ' chars', 'warn') : chip('Description', 'ok'));
          chips.push(chip('H1 and schema not checked right now', 'warn'));
          cell('site').innerHTML = chips.join('');
          cell('schema').innerHTML = chip('Not checked right now', 'warn') + '<i class="vis-skel" data-skel="llms" style="width:52px"></i>';
          state.partial = true; state.parts.site = (title ? 5 : 0) + (description ? (description.length >= 50 && description.length <= 170 ? 15 : 9) : 0);
        } else {
          var html = res.html;
          brand = brandFrom(domain, html);
          title = decode((/<title[^>]*>([^<]*)<\/title>/i.exec(html) || [])[1] || '').trim();
          description = decode(meta(html, 'description') || meta(html, 'og:description') || '').trim();
          var h1 = /<h1[\s>]/i.test(html), og = !!meta(html, 'og:title');
          var ld = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) || [];
          var types = []; ld.forEach(function (s) { (s.match(/"@type"\s*:\s*"([^"]+)"/g) || []).forEach(function (x) { types.push(x.replace(/.*:\s*"/, '').replace(/"$/, '')); }); });
          var orgType = types.filter(function (t) { return /Organization|Corporation|LocalBusiness|SoftwareApplication|WebSite|Brand/i.test(t); })[0];
          chips.push(title ? chip('Title', 'ok') : chip('No title', 'bad'));
          chips.push(!description ? chip('No description', 'bad') : (description.length < 50 || description.length > 170) ? chip('Description ' + description.length + ' chars', 'warn') : chip('Description', 'ok'));
          chips.push(h1 ? chip('H1', 'ok') : chip('No H1', 'warn'));
          chips.push(og ? chip('Open Graph', 'ok') : chip('No Open Graph', 'warn'));
          cell('site').innerHTML = chips.join('');
          state.parts.site = (title ? 5 : 0) + (description ? (description.length >= 50 && description.length <= 170 ? 15 : 9) : 0) + (h1 ? 5 : 0) + (og ? 5 : 0);
          cell('schema').innerHTML = (ld.length ? chip('JSON-LD ×' + ld.length, 'ok') : chip('No JSON-LD', 'bad')) + (orgType ? chip(orgType, 'ok') : chip('No Organization schema', 'warn')) + '<i class="vis-skel" data-skel="llms" style="width:52px"></i>';
          state.parts.schema = (ld.length ? 10 : 0) + (orgType ? 10 : 0);
        }
        vName.textContent = brand;
        if (description) vSay.textContent = '"' + description + '"';
        setScore();
      }).catch(function () {
        cell('site').innerHTML = chip('Could not reach the homepage', 'bad');
        cell('schema').innerHTML = chip('Not checked', 'warn');
        state.partial = true; setScore();
      });

      // 2) robots.txt: the AI crawlers
      var pRobots = jina(domain, '/robots.txt').then(function (r) {
        var body = (r.text.split(/Markdown Content:\s*/)[1] || r.text || '');
        if (!r.ok || /^Warning: Target URL returned error/m.test(r.text) || !/user-agent/i.test(body)) throw new Error('no robots');
        var groups = [], cur = null;
        body.split(/\r?\n/).forEach(function (line) {
          line = line.replace(/#.*$/, '').trim(); if (!line) return;
          var m = /^user-agent\s*:\s*(.+)$/i.exec(line);
          if (m) { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(m[1].trim().toLowerCase()); return; }
          var d = /^(allow|disallow)\s*:\s*(.*)$/i.exec(line); if (d && cur) cur.rules.push({ allow: d[1].toLowerCase() === 'allow', path: d[2].trim() });
        });
        var blockedFor = function (agent) {
          var g = groups.filter(function (x) { return x.agents.indexOf(agent.toLowerCase()) >= 0; })[0] || groups.filter(function (x) { return x.agents.indexOf('*') >= 0; })[0];
          return g ? g.rules.some(function (r) { return !r.allow && (r.path === '/' || r.path === '/*'); }) : false;
        };
        var bots = [['ChatGPT', ['GPTBot', 'OAI-SearchBot']], ['Perplexity', ['PerplexityBot']], ['Google AI', ['Google-Extended', 'Googlebot']], ['Claude', ['ClaudeBot', 'anthropic-ai']]];
        var sitemap = /sitemap\s*:/i.test(body), score = 0;
        var chips = bots.map(function (b) { var blocked = b[1].some(blockedFor); if (!blocked) score += 5; return chip(b[0] + (blocked ? ' blocked' : ' allowed'), blocked ? 'bad' : 'ok'); });
        state.parts.crawl = score + (sitemap ? 5 : 0);
        cell('crawl').innerHTML = chips.join('') + (sitemap ? chip('Sitemap', 'ok') : chip('No sitemap in robots', 'warn'));
        setScore();
      }).catch(function (e) {
        if (e && (e.busy || e.message === 'timeout')) { cell('crawl').innerHTML = chip('Not checked right now', 'warn'); state.partial = true; }
        else { cell('crawl').innerHTML = chip('No robots.txt: crawlers allowed by default', 'warn'); state.parts.crawl = 20; }
        setScore();
      });

      // 3) llms.txt
      var pLlms = jina(domain, '/llms.txt').then(function (r) {
        var ok = r.ok && !/^Warning: Target URL returned error/m.test(r.text) && !/Title:\s*(page not found|404)/i.test(r.text);
        var body = (r.text.split(/Markdown Content:\s*/)[1] || '').trim();
        ok = ok && body.length > 40 && !/not found|doesn'?t exist/i.test(body.slice(0, 300));
        state.parts.llms = ok ? 5 : 0; return ok ? 'yes' : 'no';
      }).catch(function (e) { state.parts.llms = 0; return (e && e.busy) ? 'unknown' : 'no'; });
      Promise.all([pHtml, pLlms]).then(function (res) {
        var st = res[1]; var c = st === 'unknown' ? '' : chip(st === 'yes' ? 'llms.txt' : 'No llms.txt', st === 'yes' ? 'ok' : 'warn');
        var sk = $('[data-skel="llms"]', vis); if (sk) sk.outerHTML = c; else if (c) cell('schema').insertAdjacentHTML('beforeend', c);
        setScore();
      });

      // 4) entity record: Wikipedia (company-style titles, then search), then DuckDuckGo
      var pEntity = pHtml.then(function () {
        var name = brand || labelOf(domain), first = name.split(/\s+/)[0];
        var summary = function (title) { return withTimeout(fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/\s+/g, '_'))).then(function (r) { return r.ok ? r.json() : null; }), 8000).catch(function () { return null; }); };
        var good = function (w) { return w && w.type === 'standard' && w.extract && new RegExp(first.replace(/[^a-z0-9]/gi, ''), 'i').test(((w.title || '') + ' ' + w.extract.slice(0, 160)).replace(/[^a-z0-9 ]/gi, '')); };
        var tryTitles = function (titles) { if (!titles.length) return Promise.resolve(null); return summary(titles[0]).then(function (w) { return good(w) ? w : tryTitles(titles.slice(1)); }); };
        var viaSearch = function () { return withTimeout(fetch('https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=4&format=json&origin=*&srsearch=' + encodeURIComponent(name + ' company')).then(function (r) { return r.ok ? r.json() : null; }), 8000).catch(function () { return null; }).then(function (j) { var hits = ((j && j.query && j.query.search) || []).filter(function (h) { return new RegExp(first, 'i').test(h.title) && /company|software|platform|service|brand|startup|corporation/i.test(h.snippet); }); return hits.length ? summary(hits[0].title).then(function (w) { return good(w) ? w : null; }) : null; }); };
        var ddg = function (q) { return withTimeout(fetch('https://api.duckduckgo.com/?q=' + encodeURIComponent(q) + '&format=json&no_html=1&skip_disambig=1').then(function (r) { return r.ok ? r.json() : null; }), 8000).catch(function () { return null; }).then(function (d) { return d && d.Abstract && d.Abstract.length > 40 && new RegExp(first, 'i').test(d.Abstract.slice(0, 120)) ? d : null; }); };
        return tryTitles([name + ' (company)', name + ', Inc.', name]).then(function (w) { return w || viaSearch(); }).then(function (w) {
          if (w) return { text: w.extract, src: 'Wikipedia' };
          return ddg(name).then(function (d) { return d || ddg(name + ' company'); }).then(function (d) { return d ? { text: d.Abstract, src: d.AbstractSource || 'DuckDuckGo' } : null; });
        }).then(function (hit) {
          if (hit) { cell('entity').innerHTML = chip('Found on ' + hit.src, 'ok'); state.parts.entity = 20; vSay.textContent = '"' + firstSentences(hit.text, 2) + '"'; }
          else { cell('entity').innerHTML = chip('No entity record found', 'bad'); state.parts.entity = 0; }
          setScore();
        });
      });

      Promise.all([pHtml, pRobots, pLlms, pEntity]).then(function () { finish(brand); });
    };

    // optional: the real engine answers from a small server (see server/ai-check-worker.js)
    var engines = function (domain) {
      vEngines.hidden = false;
      vEngines.innerHTML = ['ChatGPT', 'Perplexity', 'Google AI'].map(function (n) { return '<div class="vis-eng"><b>' + n + ' says</b><i class="vis-skel" style="width:60%"></i></div>'; }).join('');
      withTimeout(fetch(FOURWARD.aiCheckUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain: domain }) }).then(function (r) { return r.json(); }), 45000)
        .then(function (j) {
          var map = [['ChatGPT', j.chatgpt], ['Perplexity', j.perplexity], ['Google AI', j.google]];
          vEngines.innerHTML = map.map(function (m) { var a = m[1] || {}; return '<div class="vis-eng"><b>' + m[0] + ' says</b>' + (a.text ? esc(a.text) : '<span class="muted">No answer returned.</span>') + (a.mentions === false ? ' ' + chip('Does not name you', 'bad') : a.mentions === true ? ' ' + chip('Names you', 'ok') : '') + '</div>'; }).join('');
        })
        .catch(function () { vEngines.innerHTML = '<div class="vis-eng"><b>Engine answers</b>Not available right now. The full report covers them.</div>'; });
    };

    vForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = cleanDomain(vInput.value);
      if (!d) { vInput.setCustomValidity('Enter a domain like yourcompany.com'); vInput.reportValidity(); setTimeout(function () { vInput.setCustomValidity(''); }, 1500); return; }
      vInput.value = d; run(d);
    });
    var vq = /[?&]check=([^&]+)/.exec(location.search);
    if (vq) { var vd = cleanDomain(decodeURIComponent(vq[1])); if (vd) { vInput.value = vd; run(vd); } }
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
