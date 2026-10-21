/* FOURWARD — case study motion: hero tilt, scroll timeline, 3D screenshot carousel.
   Runs after product.js (word reveals, count-ups and video-on-view live there). */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]static=1/.test(location.search) || document.documentElement.classList.contains('static');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  /* ---------- hero: the browser rises flat as you scroll, and leans toward the pointer ---------- */
  const tilt = $('#c2-tilt');
  if (tilt && !reduce) {
    let ry = 0, ticking = false;
    const apply = () => {
      ticking = false;
      const r = tilt.getBoundingClientRect(), vh = innerHeight;
      const p = clamp((vh - r.top) / (vh * 0.9));
      tilt.style.setProperty('--rx', (16 * (1 - p)).toFixed(2) + 'deg');
      tilt.style.setProperty('--sc', (0.94 + 0.06 * p).toFixed(4));
      tilt.style.setProperty('--ry', ry.toFixed(2) + 'deg');
    };
    const ask = () => { if (!ticking) { ticking = true; requestAnimationFrame(apply); } };
    addEventListener('scroll', ask, { passive: true }); addEventListener('resize', ask); apply();
    const stage = tilt.parentElement;
    stage.addEventListener('pointermove', (e) => { const r = stage.getBoundingClientRect(); ry = ((e.clientX - r.left) / r.width - 0.5) * 6; ask(); });
    stage.addEventListener('pointerleave', () => { ry = 0; ask(); });
  } else if (tilt) { tilt.style.setProperty('--rx', '0deg'); tilt.style.setProperty('--sc', '1'); }

  /* ---------- timeline: the rail fills and milestones light up as you scroll ---------- */
  const time = $('#c2-time');
  if (time) {
    const nodes = $$('.c2-node', time), rail = $('.c2-rail i', time);
    if (reduce) { nodes.forEach(n => n.classList.add('on')); if (rail) rail.style.setProperty('--p', '100%'); }
    else if (matchMedia('(max-width:640px)').matches) {
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) e.target.classList.add('on'); }), { rootMargin: '0px 0px -25% 0px' });
      nodes.forEach(n => io.observe(n));
    } else {
      let ticking = false;
      const apply = () => {
        ticking = false;
        const r = time.getBoundingClientRect(), vh = innerHeight;
        const p = clamp((vh * 0.82 - r.top) / (vh * 0.55));
        if (rail) rail.style.setProperty('--p', (p * 100).toFixed(1) + '%');
        nodes.forEach((n, i) => n.classList.toggle('on', p >= i / (nodes.length - 1) - 0.02));
      };
      addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(apply); } }, { passive: true });
      apply();
    }
  }

  /* ---------- the proof: a 3D carousel of real Google screenshots ---------- */
  const cz = $('#cz');
  if (!cz) return;
  const stage = $('#cz-stage'), slides = $$('.cz-slide', cz), dotsBox = $('#cz-dots');
  const count = $('#cz-count'), cap = $('#cz-cap'), qEl = $('#cz-q'), rk = $('#cz-rank'), ai = $('#cz-ai');
  const N = slides.length, DUR = 5600;
  let cur = 0, start = performance.now(), paused = false, visible = false, typingTo = null;

  // outlines draw as a fraction of their own length, whatever the screen size
  slides.forEach(s => $$('.cz-hl rect', s).forEach(r => r.setAttribute('pathLength', '100')));
  // a soft pulse sits on the first outline of each slide
  slides.forEach(s => {
    const r = $('.cz-hl rect', s), svg = $('.cz-hl', s); if (!r) return;
    const vb = svg.viewBox.baseVal, p = document.createElement('i'); p.className = 'cz-pulse';
    p.style.left = (r.x.baseVal.value / vb.width * 100) + '%'; p.style.top = (r.y.baseVal.value / vb.height * 100) + '%';
    p.style.width = (r.width.baseVal.value / vb.width * 100) + '%'; p.style.height = (r.height.baseVal.value / vb.height * 100) + '%';
    $('.cz-card', s).appendChild(p);
  });
  slides.forEach((s, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cz-dot'; b.setAttribute('aria-label', 'Show screenshot ' + (i + 1)); b.innerHTML = '<i></i>';
    b.addEventListener('click', () => go(i, true)); dotsBox.appendChild(b);
  });
  const dots = $$('.cz-dot', dotsBox);

  const typeQuery = (text) => {
    clearTimeout(typingTo);
    if (reduce) { qEl.textContent = text; return; }
    let i = 0; qEl.textContent = '';
    const step = () => { qEl.textContent = text.slice(0, ++i); if (i < text.length) typingTo = setTimeout(step, 28); };
    step();
  };
  const fitStage = () => { const h = slides[cur].offsetHeight; if (h) stage.style.height = (h + 34) + 'px'; };

  const layout = () => {
    slides.forEach((s, i) => {
      let o = i - cur; if (o > N / 2) o -= N; if (o < -N / 2) o += N;
      const a = Math.abs(o);
      s.style.transform = `translate(-50%,-50%) translateX(${o * 58}%) translateZ(${-a * 240}px) rotateY(${-o * 26}deg) scale(${a ? 0.84 : 1})`;
      s.style.opacity = a > 2 ? '0' : a === 2 ? '.35' : a === 1 ? '.7' : '1';
      s.style.zIndex = String(10 - a);
      s.style.filter = a ? 'saturate(.5) brightness(.98)' : 'none';
      s.style.pointerEvents = a > 1 ? 'none' : 'auto';
      s.classList.toggle('on', o === 0);
      s.setAttribute('aria-hidden', o === 0 ? 'false' : 'true');
    });
    dots.forEach((d, i) => { d.classList.toggle('on', i === cur); $('i', d).style.width = i < cur ? '100%' : '0%'; });
    count.textContent = String(cur + 1).padStart(2, '0') + ' / ' + String(N).padStart(2, '0');
    const s = slides[cur];
    cap.innerHTML = '<b>' + s.dataset.t + '</b><span>' + s.dataset.c + '</span>';
    cap.classList.remove('swap'); void cap.offsetWidth; cap.classList.add('swap');
    typeQuery(s.dataset.q);
    [rk, ai].forEach(t => t.classList.add('off'));
    setTimeout(() => { rk.textContent = s.dataset.rank; ai.textContent = s.dataset.ai; rk.classList.remove('off'); setTimeout(() => ai.classList.remove('off'), 160); }, reduce ? 0 : 380);
    fitStage();
  };
  const go = (i, user) => { cur = (i + N) % N; start = performance.now(); layout(); if (user) cz.focus({ preventScroll: true }); };

  // autoplay with a progress bar in the active dot; pauses on hover, focus, off screen or hidden tab
  const tick = (t) => {
    if (!reduce && visible && !paused && !document.hidden) {
      const p = clamp((t - start) / DUR);
      const fillEl = $('i', dots[cur]); if (fillEl) fillEl.style.width = (p * 100) + '%';
      if (p >= 1) go(cur + 1);
    } else start = t - (parseFloat(($('i', dots[cur]) || {}).style?.width || 0) / 100) * DUR;
    requestAnimationFrame(tick);
  };
  new IntersectionObserver(es => es.forEach(e => { visible = e.isIntersecting; }), { threshold: .35 }).observe(cz);
  cz.addEventListener('pointerenter', () => { paused = true; });
  cz.addEventListener('pointerleave', () => { paused = false; });
  cz.addEventListener('focusin', () => { paused = true; });
  cz.addEventListener('focusout', () => { paused = false; });

  $('#cz-prev').addEventListener('click', () => go(cur - 1, true));
  $('#cz-next').addEventListener('click', () => go(cur + 1, true));
  cz.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1, true); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1, true); } });
  slides.forEach((s, i) => s.addEventListener('click', () => { if (i !== cur && !dragged) go(i, true); }));

  // drag or swipe
  let x0 = null, dragged = false;
  stage.addEventListener('pointerdown', (e) => { x0 = e.clientX; dragged = false; stage.classList.add('drag'); });
  addEventListener('pointermove', (e) => { if (x0 === null) return; const dx = e.clientX - x0; if (Math.abs(dx) > 48) { dragged = true; go(cur + (dx < 0 ? 1 : -1), true); x0 = e.clientX; } });
  addEventListener('pointerup', () => { x0 = null; stage.classList.remove('drag'); setTimeout(() => { dragged = false; }, 0); });

  addEventListener('resize', fitStage);
  $$('img', cz).forEach(img => img.complete ? fitStage() : img.addEventListener('load', fitStage, { once: true }));
  layout();
  requestAnimationFrame(tick);
})();
