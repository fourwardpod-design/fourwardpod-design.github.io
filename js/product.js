/* FOURWARD — product and case study pages: motion and the hero plan preview.
   Everything here is progressive: without JS the content is all visible. */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]static=1/.test(location.search) || document.documentElement.classList.contains('static');
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  /* ---------- two-tone headings: wrap each word so it can rise in ---------- */
  $$('.tt').forEach(el => {
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const parts = n.textContent.split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach(p => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
            const w = document.createElement('span'); w.className = 'w'; w.style.setProperty('--i', i++); w.textContent = p; frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && !n.classList.contains('w')) walk(n);
      });
    };
    walk(el);
  });

  /* ---------- reveal on scroll ---------- */
  const revealEls = $$('[data-rv], .tt');
  if (reduce || !('IntersectionObserver' in window)) revealEls.forEach(e => e.classList.add('in'));
  else {
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: .12 });
    revealEls.forEach(e => io.observe(e));
  }

  /* run a loop only while its element is on screen */
  const whenVisible = (el, start, stop) => {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { start(); return; }
    new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? start() : stop && stop()), { threshold: .25 }).observe(el);
  };

  /* ---------- hero: what has to move? ---------- */
  const PLANS = {
    demos: { label: 'More demo requests', title: 'Where we would start for more demos', rows: [
      'Comparison and alternatives pages for the "X vs Y" questions buyers ask before a demo.',
      'Reviews and founder posts, so the shortlist sees you before sales does.',
      'A demo nurture from pricing-page visits to booked calls, tracked in your CRM.',
      'Small dinners for the accounts your sales team already names.'] },
    ai: { label: 'Show up in AI answers', title: 'Where we would start for AI visibility', rows: [
      'Open the crawler access, then build the pages ChatGPT, Perplexity and AI Overviews quote.',
      'Mentions on the listicles, review sites and communities AI engines cite for your category.',
      'AI referrals tracked from first visit to pipeline, so the work shows up in reports.',
      'Talks, recaps and films from your events that give AI something new to cite.'] },
    launch: { label: 'A product launch', title: 'Where we would start for a launch', rows: [
      'Launch, comparison and integration pages live on day one, with schema in place.',
      'Press, partner and analyst announcements planned on one date.',
      'Launch emails and a webinar for customers and prospects, with follow-up built in.',
      'Launch dinners in the cities where your buyers work.'] },
    events: { label: 'A conference season', title: 'Where we would start for an event season', rows: [
      'Event and topic pages that rank for the subject, not just the date.',
      'Speaker, sponsor and partner announcements in the trade press.',
      'Invite, reminder and follow-up workflows, so every attendee reaches sales.',
      'Owned dinners and partner rooms around each conference, for the right thirty people.'] }
  };
  const AREAS = [['Search and AI visibility', 'var(--d)'], ['Brand and PR', 'var(--g)'], ['Lifecycle and demand', 'var(--s)'], ['Events', 'var(--r)']];
  const ta = $('#pp-ask-text'), plan = $('#pp-plan'), chips = $$('.pp-chip');
  if (ta && plan) {
    const examples = ['More demo requests from mid-market SaaS teams', 'Show up when buyers ask ChatGPT for a shortlist', 'Launch our new product with press, email and events', 'Fill a CIO dinner with the right thirty people'];
    let typing = !reduce, ex = 0;
    (async function cyclePlaceholder() {
      while (typing) {
        const t = examples[ex++ % examples.length];
        for (let i = 0; i <= t.length && typing; i++) { ta.placeholder = t.slice(0, i); await sleep(32); }
        await sleep(1700);
        for (let i = t.length; i >= 0 && typing; i--) { ta.placeholder = t.slice(0, i); await sleep(14); }
        await sleep(300);
      }
      ta.placeholder = examples[0];
    })();
    const show = (key) => {
      const p = PLANS[key] || PLANS.demos;
      $('#pp-plan-title').textContent = p.title;
      $('#pp-plan-rows').innerHTML = p.rows.map((r, i) => `<li><b><i style="background:${AREAS[i][1]}"></i>${AREAS[i][0]}</b><span>${r}</span></li>`).join('');
      plan.classList.remove('open'); void plan.offsetWidth; plan.classList.add('open');
      const goal = ta.value.trim() || p.label;
      const mail = $('#pp-plan-mail');
      if (mail) mail.href = 'mailto:fourwardpod@gmail.com?subject=' + encodeURIComponent('Fourward: ' + goal) + '&body=' + encodeURIComponent('What has to move: ' + goal + '\n\nCompany website: \n\nAnything we should know: \n');
    };
    chips.forEach(c => c.addEventListener('click', () => {
      typing = false;
      chips.forEach(x => x.setAttribute('aria-pressed', x === c ? 'true' : 'false'));
      ta.value = PLANS[c.dataset.plan].label;
      show(c.dataset.plan);
    }));
    const guess = (t) => /ai|chatgpt|perplexity|gemini|llm|geo|aeo|overview|cite/i.test(t) ? 'ai' : /launch|release|new product/i.test(t) ? 'launch' : /event|dinner|conference|summit|room/i.test(t) ? 'events' : 'demos';
    $('#pp-ask-go').addEventListener('click', (e) => { e.preventDefault(); typing = false; chips.forEach(x => x.setAttribute('aria-pressed', 'false')); show(guess(ta.value)); });
    ta.addEventListener('focus', () => { typing = false; ta.placeholder = 'What has to move?'; });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#pp-ask-go').click(); } });
  }

  /* ---------- card 1: an AI answer that names the brand ---------- */
  const ans = $('#m-ans'), src = $('#m-src'), q = $('#m-q');
  if (ans) {
    const runs = [
      ['Best onboarding software for a B2B SaaS team?', 'For B2B SaaS teams, ', 'Your brand', ' stands out for in-app checklists, activation tracking and a clear published price.'],
      ['Your brand vs its biggest competitor?', 'Teams that need faster onboarding tend to pick ', 'Your brand', ', while larger companies with dedicated admins compare both.'],
      ['Which tool do SaaS teams use for activation?', 'Several, but ', 'Your brand', ' comes up most often in reviews for setup speed and support.']];
    let on = false, k = 0, loop = null;
    const typeInto = async (el, text) => { for (let i = 1; i <= text.length && on; i++) { el.textContent = text.slice(0, i); await sleep(22); } };
    const run = async () => {
      while (on) {
        const r = runs[k++ % runs.length];
        q.textContent = r[0]; src.classList.remove('on'); ans.innerHTML = '';
        const a = document.createElement('span'), m = document.createElement('mark'), b = document.createElement('span'), c = document.createElement('i');
        c.className = 'm-caret'; ans.append(a, m, b, c);
        await sleep(500); await typeInto(a, r[1]); await typeInto(m, r[2]); await typeInto(b, r[3]);
        if (!on) break; c.remove(); src.classList.add('on'); await sleep(2600);
      }
    };
    if (reduce) { const r = runs[0]; q.textContent = r[0]; ans.innerHTML = r[1] + '<mark>' + r[2] + '</mark>' + r[3]; src.classList.add('on'); }
    else whenVisible(ans.closest('.pp-card'), () => { if (!on) { on = true; loop = run(); } }, () => { on = false; });
  }

  /* ---------- card 3: a workflow that lights up step by step ---------- */
  const flow = $('#m-flow');
  if (flow) {
    const steps = $$('.m-step', flow), bar = $('.bar', flow);
    let on = false;
    const light = (n) => { steps.forEach((s, i) => s.classList.toggle('on', i < n)); const last = steps[Math.max(0, n - 1)]; bar.style.height = n ? (last.offsetTop + last.offsetHeight / 2 - 16) + 'px' : '0px'; };
    const run = async () => { while (on) { for (let n = 1; n <= steps.length && on; n++) { light(n); await sleep(1100); } await sleep(1600); light(0); await sleep(700); } };
    if (reduce) light(steps.length); else whenVisible(flow.closest('.pp-card'), () => { if (!on) { on = true; run(); } }, () => { on = false; });
  }

  /* ---------- card 4: seats that fill, then follow-ups go out ---------- */
  const seats = $('#m-seats');
  if (seats) {
    for (let i = 0; i < 30; i++) seats.appendChild(document.createElement('i'));
    const dots = $$('i', seats), fu = $('#m-follow');
    let on = false;
    const run = async () => {
      while (on) {
        dots.forEach(d => d.classList.remove('on')); fu.classList.remove('ok'); fu.textContent = 'Invites out';
        const order = dots.map((d, i) => i).sort(() => Math.random() - .5).slice(0, 26);
        for (const i of order) { if (!on) return; dots[i].classList.add('on'); await sleep(140); }
        fu.classList.add('ok'); fu.textContent = 'Follow-ups sent'; await sleep(2600);
      }
    };
    if (reduce) { dots.slice(0, 26).forEach(d => d.classList.add('on')); fu.classList.add('ok'); fu.textContent = 'Follow-ups sent'; }
    else whenVisible(seats.closest('.pp-card'), () => { if (!on) { on = true; run(); } }, () => { on = false; });
  }

  /* ---------- sticky steps: highlight the step in view, swap the scene ---------- */
  const sts = $$('.pp-st');
  if (sts.length) {
    const scenes = $$('.pp-scene');
    const set = (i) => { sts.forEach((s, k) => s.classList.toggle('on', k === i)); scenes.forEach((s, k) => s.classList.toggle('on', k === i)); };
    set(0);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) set(sts.indexOf(e.target)); }), { rootMargin: '-45% 0px -45% 0px' });
      sts.forEach(s => io.observe(s));
    }
  }

  /* ---------- numbers count up once ---------- */
  $$('[data-count]').forEach(el => {
    const end = +el.dataset.count, suffix = el.dataset.suffix || '';
    if (reduce) { el.textContent = end + suffix; return; }
    el.textContent = '0' + suffix;
    whenVisible(el, async () => {
      if (el.dataset.done) return; el.dataset.done = 1;
      const t0 = performance.now(), dur = 1400;
      const tick = (t) => { const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3); el.textContent = Math.round(end * e) + suffix; if (p < 1) requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
  });

  /* ---------- real search recordings play only on screen ---------- */
  $$('video[data-auto]').forEach(v => {
    if (reduce) { v.removeAttribute('autoplay'); return; }
    whenVisible(v, () => { v.play().catch(() => {}); }, () => v.pause());
  });

  /* ---------- case study rail: highlight the section in view ---------- */
  const railLinks = $$('.cs-rail nav a');
  if (railLinks.length && 'IntersectionObserver' in window) {
    const map = new Map(railLinks.map(a => [a.getAttribute('href').slice(1), a]));
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { railLinks.forEach(a => a.classList.remove('on')); const a = map.get(e.target.id); if (a) a.classList.add('on'); } }), { rootMargin: '-20% 0px -70% 0px' });
    $$('.cs-body h2[id], .cs-main [id="overview"]').forEach(h => io.observe(h));
  }
})();
