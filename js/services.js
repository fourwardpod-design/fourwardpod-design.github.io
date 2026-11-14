/* FOURWARD — the four service pages: motion (GSAP + ScrollTrigger, self-hosted in js/vendor/).
   Everything is progressive. Without JS, with ?static=1 or with reduced motion, every section shows its finished state.
   Only transform and opacity are animated (plus one clip-path wipe and the drawn outlines); nothing loops, so nothing runs off screen. */
(() => {
  const doc = document.documentElement;
  const root = document.querySelector('main.sv');
  if (!root) return;
  const $ = (s, r = root) => r.querySelector(s);
  const $$ = (s, r = root) => [...r.querySelectorAll(s)];
  const STATIC = /[?&]static=1/.test(location.search) || doc.classList.contains('static');
  const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const still = STATIC || REDUCE || !window.gsap || !window.ScrollTrigger;
  const svc = root.getAttribute('data-svc');

  /* outlines: an svg rect sized to its own box (or to a fixed viewBox) */
  const fitRing = (svg) => {
    const rect = svg.querySelector('rect'); if (!rect) return;
    const vb = svg.getAttribute('data-vb');
    if (vb) {
      const [x, y, w, h, rx] = svg.getAttribute('data-ring').split(',').map(Number);
      svg.setAttribute('viewBox', vb); rect.setAttribute('x', x); rect.setAttribute('y', y); rect.setAttribute('width', w); rect.setAttribute('height', h); rect.setAttribute('rx', rx);
    } else {
      const w = svg.clientWidth || svg.getBoundingClientRect().width, h = svg.clientHeight || svg.getBoundingClientRect().height;
      if (!w || !h) return;
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); rect.setAttribute('x', 1.5); rect.setAttribute('y', 1.5); rect.setAttribute('width', Math.max(0, w - 3)); rect.setAttribute('height', Math.max(0, h - 3)); rect.setAttribute('rx', +svg.getAttribute('data-rx') || 10);
    }
  };
  const fitRings = () => $$('.sv-ring').forEach(fitRing);
  fitRings();
  window.addEventListener('resize', fitRings);
  window.addEventListener('load', fitRings);

  /* ---------- sequences: plain state changes shared by the animated and the still versions ---------- */
  const anatomy = (() => {
    const seq = $('[data-seq="anatomy"]'); if (!seq) return null;
    const steps = $$('.sq-step', seq), view = $('.sa-view', seq), page = $('.sa-page', seq), marks = $$('.sa-mark', seq), serp = $('.sa-serp', seq), url = $('.sa-url', seq);
    const U = [url.textContent, 'google.com/search?q=scaler+vs+masai'];
    let cur = -1, camTl = null;
    const target = (i) => { const m = marks[Math.min(i, marks.length - 1)], H = view.clientHeight, ph = page.offsetHeight; const y = m.getAttribute('data-a') === 'top' ? m.offsetTop - 22 : m.offsetTop + m.offsetHeight / 2 - H / 2; return Math.max(-(ph - H), Math.min(0, -y)); };
    const go = (i, instant) => {
      if (i === cur && !instant) return; cur = i;
      const last = i >= marks.length;
      steps.forEach((s, k) => s.classList.toggle('is-on', k === i));
      marks.forEach((m, k) => m.classList.toggle('is-on', !last && k === i));
      serp.classList.toggle('is-on', last); url.textContent = U[last ? 1 : 0];
      const y = target(i);
      if (instant || still) page.style.transform = 'translate3d(0,' + y + 'px,0)';
      else gsap.to(page, { y, duration: 1.3, ease: 'power3.inOut', overwrite: true });
      if (last && !still && !instant) {
        const cam = $('.sa-serp-in', serp), s0 = Math.min(1, view.clientWidth / cam.offsetWidth);
        fitRings();
        if (camTl) camTl.kill();
        camTl = gsap.timeline()
          .fromTo(cam, { scale: s0 }, { scale: 1, duration: 1.5, ease: 'expo.inOut' }, .45)
          .fromTo($('.sv-ring rect', serp), { drawSVG: '0%' }, { drawSVG: '100%', duration: .9, ease: 'power2.inOut' }, 1.55)
          .fromTo($('.sv-tag', serp), { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: .6, ease: 'expo.out' }, 2.1);
      }
    };
    return { steps, go, reset: () => go(Math.max(0, cur), true) };
  })();

  const surfaces = (() => {
    const seq = $('[data-seq="surfaces"]'); if (!seq) return null;
    const steps = $$('.sq-step', seq), nodes = $$('.bs-n', seq), paths = $$('.bs-lines path', seq);
    let cur = -1;
    const go = (i) => {
      if (i === cur) return; const prev = cur; cur = i;
      steps.forEach((s, k) => s.classList.toggle('is-on', k === i));
      nodes.forEach((n) => n.classList.toggle('is-on', +n.getAttribute('data-g') <= i));
      paths.forEach((p) => { const g = +p.getAttribute('data-g'), on = g <= i; p.classList.toggle('is-on', on); if (!still && on && g > prev) gsap.fromTo(p, { drawSVG: '0%' }, { drawSVG: '100%', duration: .9, ease: 'power2.out', delay: .08 * (+p.getAttribute('data-k') || 0) }); });
    };
    return { steps, go };
  })();

  const pathSeq = (() => {
    const seq = $('[data-seq="path"]'); if (!seq) return null;
    const steps = $$('.sq-step', seq), map = $('.lp-map', seq), svg = $('.lp-path', seq), dot = $('.lp-dot', seq), cards = $$('.lp-card', seq);
    const bg = $$('.bg path', svg), fg = $$('.fg path', svg), nd = $$('.nd circle', svg);
    const st = { p: 0 }, lens = [];
    let cur = -1;
    // st.p runs from 0 to the last card: whole numbers are the cards, the fraction is how far along the next connector
    const draw = () => {
      if (!lens.length) return;
      fg.forEach((p, k) => { const t = Math.max(0, Math.min(1, st.p - k)); p.style.strokeDasharray = lens[k]; p.style.strokeDashoffset = lens[k] * (1 - t); p.style.visibility = t > .001 ? 'visible' : 'hidden'; });
      nd.forEach((c, j) => c.classList.toggle('is-on', st.p >= Math.floor(j / 2) + (j % 2) - .001));
      const k = Math.min(fg.length - 1, Math.floor(st.p + .0001)), t = Math.max(0, Math.min(1, st.p - k)), pt = fg[k].getPointAtLength(lens[k] * t);
      dot.style.transform = 'translate3d(' + pt.x + 'px,' + pt.y + 'px,0)';
      cards.forEach((c, n) => c.classList.toggle('is-on', n <= st.p + .14));
    };
    // each connector leaves the bottom of one card and arrives at the side of the next
    const layout = () => {
      const W = map.offsetWidth, H = map.offsetHeight; if (!W || !H) return;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      for (let k = 0; k < cards.length - 1; k++) {
        const a = cards[k], b = cards[k + 1];
        const x0 = a.offsetLeft + a.offsetWidth / 2, y0 = a.offsetTop + a.offsetHeight;
        const x1 = b.offsetLeft > a.offsetLeft ? b.offsetLeft : b.offsetLeft + b.offsetWidth, y1 = b.offsetTop + b.offsetHeight / 2;
        const d = 'M' + x0 + ' ' + y0 + ' C' + x0 + ' ' + y1 + ' ' + (x0 + (x1 - x0) * .42) + ' ' + y1 + ' ' + x1 + ' ' + y1;
        bg[k].setAttribute('d', d); fg[k].setAttribute('d', d); lens[k] = fg[k].getTotalLength();
        nd[k * 2].setAttribute('cx', x0); nd[k * 2].setAttribute('cy', y0); nd[k * 2 + 1].setAttribute('cx', x1); nd[k * 2 + 1].setAttribute('cy', y1);
      }
      map.classList.add('is-laid'); draw();
    };
    const go = (i, instant) => {
      if (i === cur && !instant) return; cur = i;
      steps.forEach((s, k) => s.classList.toggle('is-on', k === i));
      if (instant || still) { st.p = i; draw(); } else gsap.to(st, { p: i, duration: 1.2, ease: 'power3.inOut', onUpdate: draw, overwrite: true });
    };
    layout();
    window.addEventListener('resize', layout); window.addEventListener('load', layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    return { steps, go, map };
  })();

  /* ---------- still version: finished states, no motion ---------- */
  if (still) {
    doc.classList.add('sv-static');
    if (anatomy) { anatomy.go(0, true); window.addEventListener('load', () => anatomy.go(0, true)); }
    if (surfaces) surfaces.go(99);
    if (pathSeq) pathSeq.go(pathSeq.steps.length - 1, true);
    $$('.sv-beat li').forEach((li) => li.classList.add('is-on'));
    window.__svReady = 1;
    return;
  }

  /* ---------- motion ---------- */
  gsap.registerPlugin(ScrollTrigger, SplitText, DrawSVGPlugin, CustomEase);
  gsap.defaults({ ease: 'expo.out', duration: 1 });
  gsap.config({ nullTargetWarn: false });
  const hero = $('.sv-hero');
  const inHero = (el) => hero && hero.contains(el);

  // headings: each line rises out of its own mask
  $$('[data-sv="lines"]').forEach((el) => {
    const first = inHero(el);
    SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'sv-l', autoSplit: true, onSplit(self) {
      gsap.set(el, { autoAlpha: 1 });
      return gsap.from(self.lines, { yPercent: 135, duration: 1.25, stagger: .085, delay: first ? .1 : 0, scrollTrigger: first ? null : { trigger: el, start: 'top 88%', once: true } });
    } });
  });
  // copy and small parts: a short rise
  $$('[data-sv="fade"]').forEach((el) => {
    const d = parseFloat(el.getAttribute('data-d')) || 0;
    gsap.fromTo(el, { autoAlpha: 0, y: 26 }, { autoAlpha: 1, y: 0, duration: 1, delay: (inHero(el) ? .25 : 0) + d, scrollTrigger: inHero(el) ? null : { trigger: el, start: 'top 90%', once: true } });
  });
  // the statement: words light up with the scroll
  $$('[data-sv="words"]').forEach((el) => {
    const sp = SplitText.create(el, { type: 'words', wordsClass: 'w' });
    gsap.to(sp.words, { opacity: 1, ease: 'none', stagger: .12, scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 46%', scrub: .5 } });
  });
  // service rows
  ScrollTrigger.batch($$('[data-sv="row"]'), { start: 'top 92%', once: true, onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, y: 34 }, { autoAlpha: 1, y: 0, duration: 1, stagger: .07 }) });
  // proof cards: the card rises, the image settles, then the outlines draw
  $$('[data-sv="shot"]').forEach((el) => {
    const media = $('.sp-media', el), rings = $$('.sv-ring rect', el);
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 86%', once: true }, onStart: fitRings });
    tl.fromTo(el, { autoAlpha: 0, y: 70 }, { autoAlpha: 1, y: 0, duration: 1.2 }, 0);
    if (media) tl.fromTo(media.children, { y: 46, scale: 1.04 }, { y: 0, scale: 1, duration: 1.4, stagger: .08 }, .05);
    if (rings.length) tl.fromTo(rings, { drawSVG: '0%' }, { drawSVG: '100%', duration: .9, ease: 'power2.inOut', stagger: .16 }, .7);
  });
  // deliverables: ticks draw in one after another
  ScrollTrigger.batch($$('[data-sv="tick"]'), { start: 'top 92%', once: true, onEnter: (els) => { gsap.fromTo(els, { autoAlpha: 0, x: -18 }, { autoAlpha: 1, x: 0, duration: .9, stagger: .08 }); gsap.fromTo(els.map((e) => e.querySelector('path')), { drawSVG: '0%' }, { drawSVG: '100%', duration: .6, ease: 'power2.out', stagger: .08, delay: .25 }); } });
  // the reporting rhythm: the line draws, the points switch on as it passes
  $$('[data-sv="beat"]').forEach((el) => {
    const lis = $$('li', el);
    gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 82%', once: true } })
      .fromTo($('.sv-beat-line path', el), { drawSVG: '0%' }, { drawSVG: '100%', duration: 2, ease: 'power2.inOut' }, 0)
      .fromTo(lis, { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: .9, stagger: .32 }, .1)
      .add(() => lis.forEach((li, i) => setTimeout(() => li.classList.add('is-on'), i * 320)), .15);
  });
  // film strip: drifts sideways as the page scrolls past it
  $$('[data-sv="drift"]').forEach((el) => gsap.fromTo(el, { x: 0 }, { x: () => -Math.max(0, el.scrollWidth - el.parentNode.clientWidth + 40), ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: .6, invalidateOnRefresh: true } }));
  // closing call: the glow rises as it comes into view
  $$('[data-sv="cta"]').forEach((el) => gsap.fromTo(el, { '--glow': 0, scale: .965 }, { '--glow': 1, scale: 1, duration: 1.4, scrollTrigger: { trigger: el, start: 'top 88%', once: true } }));

  // other services: a preview of the page follows the pointer
  $$('[data-sv="more"]').forEach((box) => {
    const pv = $('.sv-more-pv', box), im = pv && pv.querySelector('img'); if (!pv || !window.matchMedia('(hover:hover)').matches) return;
    const xTo = gsap.quickTo(pv, 'x', { duration: .55, ease: 'power3.out' }), yTo = gsap.quickTo(pv, 'y', { duration: .55, ease: 'power3.out' });
    box.addEventListener('mousemove', (e) => { const r = box.getBoundingClientRect(); xTo(e.clientX - r.left + 26); yTo(e.clientY - r.top - 96); });
    $$('.sv-more-a', box).forEach((a) => {
      a.addEventListener('mouseenter', () => { const src = a.getAttribute('data-pv'); if (!src) { pv.classList.remove('is-on'); return; } if (im.getAttribute('src') !== src) im.setAttribute('src', src); pv.classList.add('is-on'); });
    });
    box.addEventListener('mouseleave', () => pv.classList.remove('is-on'));
  });

  /* ---------- sticky sequences: each step sets the stage ---------- */
  const bindSteps = (s, start) => s && s.steps.forEach((st, i) => ScrollTrigger.create({ trigger: st, start: start || 'top 60%', end: 'bottom 60%', onToggle: (self) => { if (self.isActive) s.go(i); } }));
  if (anatomy) { anatomy.go(0, true); bindSteps(anatomy); window.addEventListener('resize', anatomy.reset); window.addEventListener('load', anatomy.reset); }
  if (surfaces) { bindSteps(surfaces); }
  if (pathSeq) {
    pathSeq.go(0, true);
    if (window.matchMedia('(max-width:759px)').matches) ScrollTrigger.create({ trigger: pathSeq.map, start: 'top 62%', once: true, onEnter: () => pathSeq.steps.forEach((x, i) => i && gsap.delayedCall(.2 + (i - 1) * 1.3, () => pathSeq.go(i))) });
    else bindSteps(pathSeq);
  }
  $$('.sq-stick').forEach((el) => gsap.fromTo(el, { autoAlpha: 0, y: 60 }, { autoAlpha: 1, y: 0, duration: 1.3, scrollTrigger: { trigger: el, start: 'top 88%', once: true } }));

  /* ---------- heroes ---------- */
  const stage = $('.sv-stage');
  const par = () => $$('[data-par]', hero).forEach((el) => gsap.to(el, { y: +el.getAttribute('data-par'), ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: .6 } }));
  const tl = gsap.timeline({ delay: .2, onComplete: par });
  if (stage) tl.set(stage, { autoAlpha: 1 }, 0);

  if (svc === 'search') {
    tl.from('.sh-back', { xPercent: 12, y: 70, autoAlpha: 0, rotate: 8, duration: 1.6 }, .15)
      .from('.sh-main', { y: 110, autoAlpha: 0, duration: 1.6 }, .28)
      .from('.sh-main img', { scale: 1.14, transformOrigin: '50% 0%', duration: 2 }, .28)
      .fromTo('.sh-spot', { autoAlpha: 0, scale: 1.3 }, { autoAlpha: 1, scale: 1, duration: .8 }, 1.25)
      .from('.sh-lens', { autoAlpha: 0, scale: .5, xPercent: -34, yPercent: -62, rotate: 5, duration: 1.3 }, 1.5)
      .fromTo('.sh-lens .sv-ring rect', { drawSVG: '0%' }, { drawSVG: '100%', duration: 1.1, ease: 'power2.inOut' }, 2.15)
      .from('.sh-lens .sv-tag', { y: 16, autoAlpha: 0, duration: .8 }, 2.7)
      .from('.sh-eng', { y: 26, autoAlpha: 0, duration: 1 }, 1.8)
      .from('.sh-eng i', { scale: 0, duration: .7, stagger: .07 }, 1.9)
      .from('.sh .sv-cap', { autoAlpha: 0, duration: .9 }, 2.4);
  }

  if (svc === 'brand') {
    const cards = $$('.bh-c');
    stage.classList.add('is-anim');
    tl.from(cards, { y: (i) => 260 + i * 30, rotate: (i, el) => (i % 2 ? 1 : -1) * (12 + i * 3), scale: .86, autoAlpha: 0, duration: 1.7, stagger: { each: .11, from: 0 }, clearProps: 'transform,opacity,visibility' }, .25)
      .add(() => stage.classList.remove('is-anim'));
    gsap.to(stage, { '--sp': 1, ease: 'none', scrollTrigger: { trigger: stage, start: 'top 62%', end: 'bottom top', scrub: .6 } });
  }

  if (svc === 'lifecycle') {
    const rows = $$('.lh-row');
    tl.from('.lh-wall', { rotateX: 34, rotateZ: -13, scale: .9, duration: 2.2 }, .1)
      .from(rows, { xPercent: (i) => (i % 2 ? -16 : 16), autoAlpha: 0, duration: 2, stagger: .14 }, .15)
      .from('.lh-row img', { autoAlpha: 0, scale: .9, duration: 1.2, stagger: { each: .035, from: 'random' } }, .3);
    rows.forEach((r, i) => gsap.to(r, { x: (i % 2 ? 1 : -1) * 150, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: .7 } }));
  }

  if (svc === 'events') {
    tl.fromTo('.eh-main', { clipPath: 'inset(100% 0% 0% 0% round 22px)' }, { clipPath: 'inset(0% 0% 0% 0% round 22px)', duration: 1.7, ease: 'expo.inOut' }, .1)
      .from('.eh-main img', { scale: 1.3, duration: 2.4 }, .1)
      .from('.eh-b', { y: 90, autoAlpha: 0, scale: .9, duration: 1.4 }, .9)
      .from('.eh-c', { y: -70, autoAlpha: 0, scale: .9, duration: 1.4 }, 1.05)
      .from('.eh-chip', { y: 24, autoAlpha: 0, duration: 1 }, 1.5);
    gsap.to('.eh-main img', { yPercent: 7, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: .6 } });

    // a small window scales open into one large photograph, then three points play over it
    const ew = $('.ew');
    if (ew) {
      const ph = $('.ew-ph', ew), inn = $('.ew-ph-in', ew), imgs = $$('img', ph), beats = $$('.ew-beat', ew), bars = $$('.ew-n i', ew);
      const o = { v: 0 };
      let s0 = .34;
      const read = () => { s0 = parseFloat(getComputedStyle(ph).getPropertyValue('--s0')) || .34; };
      const open = () => { const s = s0 + (1 - s0) * o.v, z = 1.16 - .16 * o.v; ph.style.transform = 'scale(' + s + ')'; inn.style.transform = 'scale(' + (z / s) + ')'; };
      read(); open();
      const w = gsap.timeline({ defaults: { ease: 'none' }, scrollTrigger: { trigger: ew, start: 'top top', end: 'bottom bottom', scrub: .7, onRefresh: () => { read(); open(); } } });
      w.to(o, { v: 1, duration: 1, ease: 'power2.inOut', onUpdate: open }, 0)
        .to($('.ew-t .a', ew), { y: '-60vh', autoAlpha: 0, duration: .8, ease: 'power2.in' }, .05)
        .to($('.ew-t .b', ew), { y: '60vh', autoAlpha: 0, duration: .8, ease: 'power2.in' }, .05)
        .to(inn, { '--shade': 1, duration: .4 }, .7)
        .to(bars, { autoAlpha: 1, duration: .2 }, .95);
      beats.forEach((b, i) => {
        const t0 = 1 + i * .75;
        w.fromTo(b, { autoAlpha: 0, y: 50 }, { autoAlpha: 1, y: 0, duration: .25, ease: 'power2.out' }, t0)
          .fromTo(bars[i], { '--p': 0 }, { '--p': 1, duration: .7 }, t0);
        if (i < beats.length - 1) w.to(b, { autoAlpha: 0, y: -40, duration: .2, ease: 'power2.in' }, t0 + .52).to(imgs[i + 1], { opacity: 1, duration: .28 }, t0 + .5).fromTo(imgs[i + 1], { scale: 1.1 }, { scale: 1, duration: .9 }, t0 + .5);
      });
      w.to({}, { duration: .35 });
    }
  }

  // the hero stage leans a little towards the pointer (large screens with a mouse only)
  if (stage && svc !== 'lifecycle' && window.matchMedia('(hover:hover) and (min-width:1100px)').matches) {
    gsap.set(stage, { transformPerspective: 1500 });
    const rx = gsap.quickTo(stage, 'rotationX', { duration: .9, ease: 'power3.out' }), ry = gsap.quickTo(stage, 'rotationY', { duration: .9, ease: 'power3.out' });
    hero.addEventListener('pointermove', (e) => { const r = hero.getBoundingClientRect(); ry(((e.clientX - r.left) / r.width - .5) * 4.5); rx(-((e.clientY - r.top) / r.height - .5) * 3.5); });
    hero.addEventListener('pointerleave', () => { rx(0); ry(0); });
  }

  window.__svReady = 1;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('load', () => ScrollTrigger.refresh());
})();
