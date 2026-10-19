/* AI crawler checker (/tools/ai-crawler-checker/).
   Reads robots.txt through our Cloudflare function (/api/crawlers), applies the rules per bot the way
   RFC 9309 and Google do (matching group, longest rule wins, Allow wins ties, * and $ wildcards),
   and shows which AI search and AI training bots can read the homepage. The function also returns a
   firewall test (homepage fetched as a browser and as four AI bots) and whether llms.txt exists.
   ?domain=example.com runs on load. */
(function () {
  var root = document.getElementById('cc');
  if (!root) return;
  var BOTS = window.FW_BOTS || [];
  var API = /^(localhost|127\.)/.test(location.hostname) || /\.github\.io$/.test(location.hostname) ? 'https://fourward.pages.dev/api/crawlers' : '/api/crawlers';
  var $ = function (s, el) { return (el || root).querySelector(s); };
  var form = $('#cc-form'), input = $('#cc-domain'), out = $('#cc-out'), btn = $('#cc-go');
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var clean = function (s) { s = String(s || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#\s]/)[0]; return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : ''; };
  var track = function (n, p) { try { if (window.fwTrack) window.fwTrack(n, p || {}); } catch (e) {} };

  /* ---- robots.txt ---- */
  function parse(text) {
    var groups = [], cur = null, sitemaps = [];
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var line = raw.replace(/#.*$/, '').trim(); if (!line) return;
      var m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line); if (!m) return;
      var key = m[1].toLowerCase(), val = m[2].trim();
      if (key === 'user-agent') { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(val.toLowerCase()); }
      else if ((key === 'allow' || key === 'disallow') && cur) cur.rules.push({ allow: key === 'allow', path: val });
      else if (key === 'sitemap') sitemaps.push(val);
    });
    return { groups: groups, sitemaps: sitemaps };
  }
  function toRegex(p) {
    var end = p.slice(-1) === '$'; if (end) p = p.slice(0, -1);
    return new RegExp('^' + p.split('*').map(function (x) { return x.replace(/[.+?^${}()|[\]\\]/g, '\\$&'); }).join('.*') + (end ? '$' : ''));
  }
  function evaluate(rb, token) {
    var t = token.toLowerCase();
    var named = rb.groups.filter(function (g) { return g.agents.indexOf(t) >= 0; });
    var groups = named.length ? named : rb.groups.filter(function (g) { return g.agents.indexOf('*') >= 0; });
    var rules = []; groups.forEach(function (g) { rules = rules.concat(g.rules); });
    rules = rules.filter(function (r) { return r.path !== ''; });            // "Disallow:" with no path allows everything
    var best = null;
    rules.forEach(function (r) {
      if (!toRegex(r.path).test('/')) return;
      var len = r.path.replace(/\*/g, '').length;
      if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len: len };
    });
    var rootBlocked = best ? !best.allow : false;
    var someBlocked = rules.some(function (r) { return !r.allow; });
    return { state: rootBlocked ? 'blocked' : someBlocked ? 'partial' : 'allowed', via: named.length ? 'named' : groups.length ? 'all' : 'none' };
  }

  /* ---- rendering ---- */
  var LABEL = { allowed: 'Allowed', partial: 'Partly blocked', blocked: 'Blocked' };
  var pill = function (st) { return '<span class="cc-pill is-' + st + '">' + LABEL[st] + '</span>'; };
  function row(b, res) {
    var note = res.via === 'named' ? 'Named in your robots.txt' : res.via === 'all' ? 'Follows your rule for all bots' : 'No rule, so allowed';
    return '<li class="cc-row"><div class="cc-bot"><b>' + esc(b.ua) + '</b><span>' + esc(b.company) + ' · ' + esc(b.use) + '</span><em>' + note + '</em></div>' + pill(res.state) + '</li>';
  }
  function fixSnippet(blocked) {
    if (!blocked.length) return '';
    var txt = blocked.map(function (b) { return 'User-agent: ' + b.ua + '\nAllow: /'; }).join('\n\n');
    return '<div class="cc-fix"><div class="cc-fix-head"><b>Let AI search bots in</b><button type="button" class="cc-copy" data-copy>Copy</button></div>' +
      '<p>Add this to the top of your robots.txt. It only opens the door for bots that put your pages into AI answers.</p><pre>' + esc(txt) + '</pre></div>';
  }
  function render(data) {
    var rb = parse(data.robots.text || '');
    var noRobots = data.robots.status === 404 || data.robots.status === 410;
    var robotsErr = !noRobots && data.robots.status >= 500;
    var res = BOTS.map(function (b) { return { b: b, r: data.robots.text ? evaluate(rb, b.ua) : { state: robotsErr ? 'blocked' : 'allowed', via: 'none' } }; });
    var search = res.filter(function (x) { return x.b.type !== 'training'; }), train = res.filter(function (x) { return x.b.type === 'training'; });
    var okCount = function (list) { return list.filter(function (x) { return x.r.state !== 'blocked'; }).length; };
    var ok = okCount(res);
    var fw = (data.firewall && data.firewall.bots) || [], br = data.firewall && data.firewall.browser || {};
    var browserOk = br.status >= 200 && br.status < 400;
    var fwBlocked = browserOk ? fw.filter(function (f) { return f.challenge || f.status === 401 || f.status === 403 || f.status === 429 || f.status === 503 || f.status === 0; }) : [];
    var blockedSearch = search.filter(function (x) { return x.r.state === 'blocked' && x.b.type === 'search'; }).map(function (x) { return x.b; });
    var verdict = blockedSearch.length || fwBlocked.length ? 'Some AI search bots can\'t read your site, so AI answers may skip you.' : ok === res.length ? 'Every AI crawler we test can read your homepage.' : 'AI search bots can read you. Some training bots are blocked, which is your choice.';
    var robotsLine = noRobots ? 'No robots.txt found, so every bot is allowed by default.' : robotsErr ? 'Your robots.txt returned a server error. Google treats that as "keep out" until it loads.' : data.robots.status === 0 ? 'We could not reach your robots.txt.' : 'Read from ' + esc(data.robots.url);
    out.innerHTML =
      '<div class="cc-sum">' +
        '<div class="cc-score"><b>' + ok + '<small>/' + res.length + '</small></b><span>AI crawlers can read ' + esc(data.domain) + '</span></div>' +
        '<p class="cc-verdict">' + verdict + '</p>' +
        '<ul class="cc-stats"><li><b>' + okCount(search) + '/' + search.length + '</b><span>AI search and answer bots</span></li><li><b>' + okCount(train) + '/' + train.length + '</b><span>AI training bots</span></li><li><b>' + (data.llms.found ? 'Found' : 'Missing') + '</b><span>llms.txt file</span></li><li><b>' + (rb.sitemaps.length ? 'Listed' : 'Missing') + '</b><span>Sitemap in robots.txt</span></li></ul>' +
        '<p class="cc-src">' + robotsLine + '</p>' +
      '</div>' +
      fixSnippet(blockedSearch) +
      '<h3 class="cc-h">AI search and answer bots</h3><p class="cc-sub">These decide whether ChatGPT, Perplexity, Claude, Copilot and Google\'s AI can read and cite you.</p><ul class="cc-list">' + search.map(function (x) { return row(x.b, x.r); }).join('') + '</ul>' +
      '<h3 class="cc-h">AI training bots</h3><p class="cc-sub">These collect pages to train AI models. Blocking them is a business choice and doesn\'t remove you from AI answers.</p><ul class="cc-list">' + train.map(function (x) { return row(x.b, x.r); }).join('') + '</ul>' +
      '<h3 class="cc-h">Firewall test</h3><p class="cc-sub">robots.txt is only half of it. Some firewalls and CDNs block AI bots before they ever see it. We loaded your homepage as a normal browser and as four AI bots.</p>' +
      (browserOk ? '<ul class="cc-list">' + fw.map(function (f) { var bad = fwBlocked.indexOf(f) >= 0; return '<li class="cc-row"><div class="cc-bot"><b>' + esc(f.bot) + '</b><span>' + (bad ? (f.challenge ? 'Got a bot challenge page' : f.status ? 'Got error ' + f.status : 'No response') : 'Got your homepage (' + f.status + ')') + '</span></div>' + pill(bad ? 'blocked' : 'allowed') + '</li>'; }).join('') + '</ul><p class="cc-note">We test from Cloudflare\'s network using each bot\'s name. Real bots come from their own servers, so treat a block here as a strong hint, not proof.</p>'
        : '<p class="cc-note">Your homepage didn\'t load for a normal browser either (' + (br.status || 'no response') + '), so we skipped this test.</p>') +
      (data.robots.text ? '<details class="cc-raw"><summary>See your robots.txt</summary><pre>' + esc(data.robots.text.slice(0, 20000)) + '</pre></details>' : '') +
      '<div class="cc-next"><div><b>This only checks the door.</b><p>AI also needs to understand who you are and trust your pages. Our free AI visibility check runs 30 tests on that.</p></div><a class="btn btn-dark" href="../ai-visibility-check/?check=' + encodeURIComponent(data.domain) + '">Run the full check</a></div>';
    out.hidden = false;
    var copy = out.querySelector('[data-copy]');
    if (copy) copy.addEventListener('click', function () { var t = out.querySelector('.cc-fix pre').textContent; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy'; }, 1600); }).catch(function () {}); });
    track('crawler_check_complete', { allowed: ok, total: res.length, search_blocked: blockedSearch.length, firewall_blocked: fwBlocked.length });
  }

  /* ---- run ---- */
  function run(domain) {
    root.setAttribute('data-state', 'scan');
    btn.disabled = true; btn.textContent = 'Checking…';
    out.hidden = false; out.innerHTML = '<div class="cc-load"><i></i><span>Reading robots.txt and testing ' + BOTS.length + ' AI bots on ' + esc(domain) + '…</span></div>';
    fetch(API + '?domain=' + encodeURIComponent(domain)).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || !d.ok) throw new Error((d && d.error) || 'failed');
      render(d);
      try { history.replaceState(null, '', location.pathname + '?domain=' + encodeURIComponent(domain)); } catch (e) {}
    }).catch(function (e) {
      out.innerHTML = '<p class="cc-err">We couldn\'t check ' + esc(domain) + ' right now. ' + esc(e.message === 'failed' ? 'Please try again in a minute.' : e.message) + '</p>';
    }).then(function () { root.setAttribute('data-state', 'done'); btn.disabled = false; btn.textContent = 'Check crawlers'; });
  }
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var d = clean(input.value);
    if (!d) { input.focus(); input.setAttribute('aria-invalid', 'true'); return; }
    input.removeAttribute('aria-invalid'); run(d);
  });
  root.addEventListener('click', function (e) { var t = e.target.closest('[data-try]'); if (t) { input.value = t.getAttribute('data-try'); run(t.getAttribute('data-try')); } });
  var q = new URLSearchParams(location.search).get('domain');
  if (q && clean(q)) { input.value = clean(q); run(clean(q)); }
})();
