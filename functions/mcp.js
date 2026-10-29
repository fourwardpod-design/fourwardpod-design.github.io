// Fourward MCP server: POST https://www.fourwardhq.com/mcp
// A remote Model Context Protocol server (Streamable HTTP, stateless, JSON responses, no auth) that exposes
// Fourward's two free tools to AI assistants such as Claude, ChatGPT, Cursor and VS Code:
//   check_ai_visibility  the 30-check AI visibility score from /tools/ai-visibility-check/ (problems and scores, never fixes)
//   check_ai_crawlers    the 20-bot robots.txt and firewall test from /tools/ai-crawler-checker/
// Both are read-only and only fetch public https://<hostname>/ URLs; IPs and internal names are refused.
// Nothing about a request is stored or logged; only the public result is cached by domain for 12 hours.
// The scoring mirrors js/site.js (section 7) and js/crawler.js so results match the website.

const SERVER = { name: 'fourward', title: 'Fourward AI visibility tools', version: '1.0.0', websiteUrl: 'https://www.fourwardhq.com/tools/mcp/', icons: [{ src: 'https://www.fourwardhq.com/assets/logo-512.png', mimeType: 'image/png', sizes: ['512x512'] }] };
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const ORIGIN = 'https://www.fourwardhq.com';
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CHECKER = 'Mozilla/5.0 (compatible; FourwardAICheck/1.0; +https://www.fourwardhq.com/tools/mcp/)';
const INSTRUCTIONS = 'Fourward\'s free tools check how ready a website is for AI search. Use check_ai_visibility for an overall score out of 100 across crawler access, homepage, structured data, entity and content signals. Use check_ai_crawlers to see which of 20 AI crawlers (ChatGPT, Claude, Perplexity, Gemini and others) a site\'s robots.txt and firewall let in. Pass a bare domain such as example.com. Results list problems and scores, not fixes. Both tools only read public pages and change nothing.';

const DOMAIN_ARG = { type: 'object', properties: { domain: { type: 'string', description: 'The website to check, as a domain such as example.com. A full URL also works; only the hostname is used.' } }, required: ['domain'], additionalProperties: false };
const TOOLS = [
  {
    name: 'check_ai_visibility',
    title: 'AI visibility check',
    description: 'Scores how well AI search engines (ChatGPT, Perplexity, Gemini, Google AI Overviews) can find, read and understand a website. Runs 30 checks in five groups: AI crawler access, what the homepage tells machines, structured data, entity and authority (Wikidata, Wikipedia, linked profiles) and AI-ready content (llms.txt, pricing, proof, docs, comparison pages). Returns a score out of 100, a grade, a score per group and every problem found, with the points it costs. Takes 10 to 30 seconds.',
    inputSchema: DOMAIN_ARG,
    annotations: { title: 'AI visibility check', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  },
  {
    name: 'check_ai_crawlers',
    title: 'AI crawler checker',
    description: 'Shows which of 20 AI crawlers can read a website\'s homepage: AI search and answer bots (OAI-SearchBot, ChatGPT-User, Claude-SearchBot, PerplexityBot, Googlebot, Bingbot and more) and AI training bots (GPTBot, ClaudeBot, Google-Extended, CCBot and more). Applies the site\'s robots.txt rules per bot the way RFC 9309 and Google do, tests the firewall by fetching the homepage as a browser and as four AI bots, and reports llms.txt and sitemap lines. Takes about 10 seconds.',
    inputSchema: DOMAIN_ARG,
    annotations: { title: 'AI crawler checker', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
  }
];

/* ---------- shared helpers ---------- */
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID', 'Access-Control-Expose-Headers': 'Mcp-Session-Id, Mcp-Protocol-Version' };
const jsonRes = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors, ...extra } });
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
const alnum = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; } };
const sameSite = (h, d) => !!h && (h === d || h.slice(-(d.length + 1)) === '.' + d || d.slice(-(h.length + 1)) === '.' + h);
const labelOf = (domain) => { const l = domain.split('.')[0]; return l.charAt(0).toUpperCase() + l.slice(1); };
const decode = (s) => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|#39);/gi, (m, e) => { const k = e.toLowerCase(); if (k[0] === '#') { const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); try { return String.fromCodePoint(n); } catch (x) { return m; } } return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }[k] || m; });
const firstSentences = (t, n) => { const s = String(t || '').split(/(?<=[.!?])\s+/); const out = s.slice(0, n || 2).join(' '); return out.length > 220 ? s[0] : out; };

function cleanDomain(raw) {
  const d = String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').split(/[\/?#\s:]/)[0].replace(/\.$/, '').replace(/^www\./, '');
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) return '';
  if (/(^|\.)(localhost|local|internal|intranet|home|lan|corp)$/.test(d)) return '';
  return d;
}

async function getText(url, { ua = CHECKER, accept = 'text/plain,*/*', ms = 9000, max = 2000000 } = {}) {
  try {
    const r = await withTimeout(fetch(url, { headers: { 'User-Agent': ua, 'Accept': accept, 'Accept-Language': 'en-US,en;q=0.8' }, redirect: 'follow' }), ms);
    let body = r.body;
    if (/\.gz($|\?)/i.test(url) && body && typeof DecompressionStream !== 'undefined' && !/gzip/i.test(r.headers.get('content-encoding') || '')) { try { body = body.pipeThrough(new DecompressionStream('gzip')); } catch (e) {} }
    const text = (await new Response(body).text()).slice(0, max);
    return { status: r.status, ok: r.ok, url: r.url, type: r.headers.get('content-type') || '', mitigated: r.headers.get('cf-mitigated') || '', text };
  } catch (e) {
    return { status: 0, ok: false, url, type: '', mitigated: '', text: '', error: String((e && e.message) || e) };
  }
}
const getJson = async (url, ms) => { const r = await getText(url, { accept: 'application/json', ms }); if (!r.ok) return null; try { return JSON.parse(r.text); } catch (e) { return null; } };

/* ---------- robots.txt, as js/crawler.js reads it ---------- */
function parseRobots(text) {
  const groups = [], sitemaps = []; let cur = null;
  String(text || '').split(/\r?\n/).forEach((raw) => {
    const line = raw.replace(/#.*$/, '').trim(); if (!line) return;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line); if (!m) return;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') { if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(val.toLowerCase()); }
    else if ((key === 'allow' || key === 'disallow') && cur) cur.rules.push({ allow: key === 'allow', path: val });
    else if (key === 'sitemap') sitemaps.push(val);
  });
  return { groups, sitemaps };
}
const toRegex = (p) => { const end = p.slice(-1) === '$'; if (end) p = p.slice(0, -1); return new RegExp('^' + p.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (end ? '$' : '')); };
function evaluateBot(rb, token) {
  const t = token.toLowerCase();
  const named = rb.groups.filter((g) => g.agents.indexOf(t) >= 0);
  const groups = named.length ? named : rb.groups.filter((g) => g.agents.indexOf('*') >= 0);
  let rules = []; groups.forEach((g) => { rules = rules.concat(g.rules); });
  rules = rules.filter((r) => r.path !== '');
  let best = null;
  rules.forEach((r) => { if (!toRegex(r.path).test('/')) return; const len = r.path.replace(/\*/g, '').length; if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len }; });
  const rootBlocked = best ? !best.allow : false;
  const someBlocked = rules.some((r) => !r.allow);
  return { state: rootBlocked ? 'blocked' : someBlocked ? 'partial' : 'allowed', via: named.length ? 'named' : groups.length ? 'all' : 'none' };
}

/* ---------- tool 1: AI crawler checker (20 bots + firewall test) ---------- */
const CRAWLERS = [
  ['Googlebot', 'Google', 'Google Search and AI Overviews', 'search'], ['Bingbot', 'Microsoft', 'Bing and Copilot answers', 'search'],
  ['OAI-SearchBot', 'OpenAI', 'ChatGPT search results', 'search'], ['ChatGPT-User', 'OpenAI', 'ChatGPT opening a page a person asked about', 'user'],
  ['PerplexityBot', 'Perplexity', 'Perplexity answers', 'search'], ['Perplexity-User', 'Perplexity', 'Perplexity opening a page a person asked about', 'user'],
  ['Claude-SearchBot', 'Anthropic', 'Claude search results', 'search'], ['Claude-User', 'Anthropic', 'Claude opening a page a person asked about', 'user'],
  ['Applebot', 'Apple', 'Siri and Spotlight answers', 'search'], ['DuckAssistBot', 'DuckDuckGo', 'DuckDuckGo AI answers', 'search'],
  ['MistralAI-User', 'Mistral', 'Le Chat opening a page a person asked about', 'user'], ['GPTBot', 'OpenAI', 'Training OpenAI models', 'training'],
  ['ClaudeBot', 'Anthropic', 'Training Claude models', 'training'], ['Google-Extended', 'Google', 'Gemini model training and grounding', 'training'],
  ['Applebot-Extended', 'Apple', 'Apple AI model training', 'training'], ['Meta-ExternalAgent', 'Meta', 'Meta AI model training', 'training'],
  ['CCBot', 'Common Crawl', 'Open web dataset many AI models train on', 'training'], ['Bytespider', 'ByteDance', 'ByteDance AI model training', 'training'],
  ['Amazonbot', 'Amazon', 'Alexa and Amazon AI', 'training'], ['cohere-ai', 'Cohere', 'Cohere AI models', 'training']
].map(([ua, company, use, type]) => ({ ua, company, use, type }));
const PROBES = {
  'GPTBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
  'OAI-SearchBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
  'ClaudeBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  'PerplexityBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)'
};
async function probe(url, ua) {
  try {
    const r = await withTimeout(fetch(url, { headers: { 'User-Agent': ua, 'Accept': 'text/html,*/*' }, redirect: 'follow' }), 9000);
    const challenge = /challenge/i.test(r.headers.get('cf-mitigated') || '');
    try { r.body && r.body.cancel(); } catch (e) {}
    return { status: r.status, challenge };
  } catch (e) { return { status: 0, challenge: false, error: String((e && e.message) || e) }; }
}

async function crawlerCheck(domain) {
  const base = 'https://' + domain;
  const [robots, llms, browser, ...bots] = await Promise.all([getText(base + '/robots.txt'), getText(base + '/llms.txt'), probe(base + '/', BROWSER), ...Object.values(PROBES).map((ua) => probe(base + '/', ua))]);
  const robotsText = robots.status === 200 && !/html/i.test(robots.type) ? robots.text : '';
  const rb = parseRobots(robotsText);
  const noRobots = robots.status === 404 || robots.status === 410, robotsErr = !noRobots && robots.status >= 500;
  const results = CRAWLERS.map((b) => ({ ...b, ...(robotsText ? evaluateBot(rb, b.ua) : { state: robotsErr ? 'blocked' : 'allowed', via: 'none' }) }));
  const search = results.filter((x) => x.type !== 'training'), train = results.filter((x) => x.type === 'training');
  const okIn = (l) => l.filter((x) => x.state !== 'blocked').length;
  const fw = Object.keys(PROBES).map((n, i) => ({ bot: n, ...bots[i] }));
  const browserOk = browser.status >= 200 && browser.status < 400;
  const fwBlocked = browserOk ? fw.filter((f) => f.challenge || [0, 401, 403, 429, 503].includes(f.status)) : [];
  const blockedSearch = search.filter((x) => x.state === 'blocked' && x.type === 'search');
  const ok = okIn(results);
  const verdict = blockedSearch.length || fwBlocked.length ? 'Some AI search bots can\'t read this site, so AI answers may skip it.' : ok === results.length ? 'Every AI crawler tested can read the homepage.' : 'AI search bots can read the site. Some training bots are blocked, which is the owner\'s choice.';
  const llmsFound = llms.status === 200 && !/html/i.test(llms.type) && !/^\s*</.test(llms.text || '') && (llms.text || '').trim().length > 0;
  const robotsLine = noRobots ? 'No robots.txt found, so every bot is allowed by default.' : robotsErr ? 'robots.txt returned a server error. Google treats that as "keep out" until it loads.' : robots.status === 0 ? 'robots.txt could not be reached.' : 'Read from ' + (robots.url || base + '/robots.txt');
  const L = [];
  L.push('AI crawler check for ' + domain);
  L.push(ok + ' of ' + results.length + ' AI crawlers can read the homepage. ' + verdict);
  L.push('');
  // compact text: blocked bots by name, allowed bots as one list; full detail stays in structuredContent
  const group = (title, list) => {
    const blocked = list.filter((x) => x.state === 'blocked'), allowed = list.filter((x) => x.state !== 'blocked'), part = list.filter((x) => x.state === 'partial');
    L.push(title + '  ' + allowed.length + '/' + list.length + ' allowed');
    if (blocked.length) L.push('  Blocked: ' + blocked.map((x) => x.ua + ' (' + x.company + ', ' + x.use + ')').join('; '));
    if (allowed.length) L.push('  Allowed: ' + allowed.map((x) => x.ua).join(', '));
    if (part.length) L.push('  ' + part.length + ' of the allowed bots have some folders off-limits by robots.txt rules.');
  };
  group('AI SEARCH AND ANSWER BOTS', search);
  L.push('');
  group('AI TRAINING BOTS', train);
  L.push('');
  L.push('FIREWALL TEST (homepage fetched as a browser and as four AI bots)');
  L.push('  Browser: HTTP ' + (browser.status || 'no response') + ' · ' + fw.map((f) => f.bot + ': ' + (f.challenge ? 'challenge page' : 'HTTP ' + (f.status || 'no response')) + (fwBlocked.indexOf(f) >= 0 ? ' (blocked)' : '')).join(' · '));
  if (!browserOk) L.push('  The homepage did not load for a normal browser either, so the firewall result is inconclusive.');
  L.push('');
  L.push('robots.txt: ' + robotsLine);
  L.push('Sitemap lines in robots.txt: ' + (rb.sitemaps.length ? rb.sitemaps.length + ' (' + rb.sitemaps.slice(0, 3).join(', ') + ')' : 'none'));
  L.push('llms.txt: ' + (llmsFound ? 'found' : 'not found'));
  L.push('');
  L.push('Interactive version: ' + ORIGIN + '/tools/ai-crawler-checker/?domain=' + encodeURIComponent(domain));
  return {
    text: L.join('\n'),
    data: {
      domain, checkedAt: new Date().toISOString(), allowed: ok, total: results.length, verdict,
      bots: results.map((x) => ({ bot: x.ua, company: x.company, use: x.use, type: x.type, state: x.state === 'partial' ? 'allowed' : x.state, someFoldersBlocked: x.state === 'partial', rule: x.via })),
      firewall: { browser: { status: browser.status }, bots: fw.map((f) => ({ bot: f.bot, status: f.status, challenge: f.challenge, blocked: fwBlocked.indexOf(f) >= 0 })) },
      robotsTxt: { status: robots.status, url: robots.url || base + '/robots.txt', sitemaps: rb.sitemaps },
      llmsTxt: { found: llmsFound }, url: ORIGIN + '/tools/ai-crawler-checker/?domain=' + encodeURIComponent(domain)
    }
  };
}

/* ---------- homepage parsing: HTMLRewriter on Cloudflare, a regex reader elsewhere (local tests) ---------- */
async function readPage(html) {
  const P = { lang: '', title: '', meta: {}, canonical: false, h1: [], h2: [], questions: 0, imgs: [], ld: [], hrefs: [], text: '' };
  if (typeof HTMLRewriter === 'undefined') return readPageRegex(html, P);
  let titleDone = false, skip = 0, inBody = 0;
  const heading = (arr, q) => { let buf = ''; return { element(e) { buf = ''; try { e.onEndTag(() => { const t = decode(buf).replace(/\s+/g, ' ').trim(); if (arr && t) arr.push(t); if (q && /\?\s*$/.test(t)) P.questions++; }); } catch (x) {} }, text(t) { buf += t.text; } }; };
  const skipper = { element(e) { try { e.onEndTag(() => { skip--; }); skip++; } catch (x) {} } };
  let ldBuf = '', isLd = false;
  const rw = new HTMLRewriter()
    .on('html', { element(e) { if (!P.lang) P.lang = (e.getAttribute('lang') || '').trim(); } })
    .on('head title', { element(e) { try { e.onEndTag(() => { titleDone = true; }); } catch (x) {} }, text(t) { if (!titleDone) P.title += t.text; } })
    .on('meta', { element(e) { const k = (e.getAttribute('name') || e.getAttribute('property') || '').toLowerCase(); if (k && !(k in P.meta)) P.meta[k] = decode(e.getAttribute('content') || '').trim(); } })
    .on('link', { element(e) { if (/(^|\s)canonical(\s|$)/i.test(e.getAttribute('rel') || '')) P.canonical = true; } })
    .on('h1', heading(P.h1, false)).on('h2', heading(P.h2, true)).on('h3', heading(null, true)).on('summary', heading(null, true)).on('dt', heading(null, true))
    .on('img', { element(e) { P.imgs.push({ w: +e.getAttribute('width') || 0, h: +e.getAttribute('height') || 0, alt: e.hasAttribute('alt'), role: e.getAttribute('role') || '', hidden: e.getAttribute('aria-hidden') || '' }); } })
    .on('script', { element(e) { isLd = /application\/ld\+json/i.test(e.getAttribute('type') || ''); if (isLd) { ldBuf = ''; try { e.onEndTag(() => { P.ld.push(ldBuf); isLd = false; }); } catch (x) {} } }, text(t) { if (isLd) ldBuf += t.text; } })
    .on('a[href]', { element(e) { if (P.hrefs.length < 3000) P.hrefs.push(decode(e.getAttribute('href'))); } })
    .on('body', { element(e) { inBody++; }, text(t) { if (!skip && P.text.length < 1500000) P.text += t.text; } })
    .on('body script', skipper).on('body style', skipper).on('body noscript', skipper).on('body template', skipper).on('body svg', skipper);
  await rw.transform(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })).arrayBuffer();
  P.title = decode(P.title).trim(); P.text = decode(P.text);
  return P;
}
function readPageRegex(html, P) {
  const attr = (tag, a) => { const m = new RegExp('\\s' + a + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(tag); return m ? decode(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]) : null; };
  const strip = (s) => decode(String(s).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  P.lang = (attr((/<html\b[^>]*>/i.exec(html) || [''])[0], 'lang') || '').trim();
  const head = (/<head\b[\s\S]*?<\/head>/i.exec(html) || [html])[0];
  P.title = strip((/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head) || ['', ''])[1]);
  (html.match(/<meta\b[^>]*>/gi) || []).forEach((t) => { const k = (attr(t, 'name') || attr(t, 'property') || '').toLowerCase(); if (k && !(k in P.meta)) P.meta[k] = (attr(t, 'content') || '').trim(); });
  P.canonical = (html.match(/<link\b[^>]*>/gi) || []).some((t) => /(^|\s)canonical(\s|$)/i.test(attr(t, 'rel') || ''));
  const all = (tag) => [...html.matchAll(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'gi'))].map((m) => strip(m[1])).filter(Boolean);
  P.h1 = all('h1'); P.h2 = all('h2');
  P.questions = ['h2', 'h3', 'summary', 'dt'].reduce((n, t) => n + all(t).filter((x) => /\?\s*$/.test(x)).length, 0);
  P.imgs = (html.match(/<img\b[^>]*>/gi) || []).map((t) => ({ w: +attr(t, 'width') || 0, h: +attr(t, 'height') || 0, alt: attr(t, 'alt') != null, role: attr(t, 'role') || '', hidden: attr(t, 'aria-hidden') || '' }));
  P.ld = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  P.hrefs = (html.match(/<a\b[^>]*>/gi) || []).map((t) => attr(t, 'href')).filter((h) => h != null).slice(0, 3000);
  const body = (/<body\b[\s\S]*$/i.exec(html) || [''])[0].replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ');
  P.text = decode(body.replace(/<[^>]+>/g, ''));
  return P;
}

/* ---------- tool 2: AI visibility check (mirrors js/site.js, section 7) ---------- */
const CATS = [
  { id: 'crawl', label: 'AI crawler access', max: 15 }, { id: 'page', label: 'What your homepage tells machines', max: 25 },
  { id: 'schema', label: 'Structured data', max: 20 }, { id: 'entity', label: 'Entity & authority', max: 25 }, { id: 'content', label: 'AI-ready content', max: 15 }
];
const looksBlocked = (r) => !r.ok || /^(just a moment|attention required|access denied|403 forbidden)/i.test(((/<title[^>]*>([^<]*)/i.exec(r.text) || [])[1] || '').trim()) || /challenge/i.test(r.mitigated);

async function visibilityCheck(domain) {
  const S = { domain, brand: labelOf(domain), checks: [], partial: {}, started: {}, quote: '', noindex: false, sameAs: [], links: { internal: [], external: [] }, questions: 0, faq: false, llms: { ok: false, links: 0 }, sitemapUrl: '', description: '' };
  const add = (cat, key, ok, bad, pts, max, st) => { pts = Math.max(0, Math.min(max, Math.round(pts * 10) / 10)); S.checks.push({ cat, key, label: ok, problem: bad, pts, max, status: st || (pts >= max ? 'pass' : pts > 0 ? 'warn' : 'fail') }); };
  const base = 'https://' + domain;

  const robotsChecks = (body) => {
    S.started.crawl = true;
    const rb = parseRobots(body || '');
    const blocked = (agent) => {
      const g = rb.groups.filter((x) => x.agents.indexOf(agent.toLowerCase()) >= 0)[0] || rb.groups.filter((x) => x.agents.indexOf('*') >= 0)[0];
      if (!g) return false;
      return g.rules.some((r) => !r.allow && (r.path === '/' || r.path === '/*')) && !g.rules.some((r) => r.allow && (r.path === '/' || r.path === '/*' || r.path === '/$'));
    };
    [['oai', 'OAI-SearchBot', 3, 'ChatGPT search can read you', 'ChatGPT search blocked'], ['gpt', 'GPTBot', 1, 'GPTBot allowed', 'GPTBot blocked'], ['pplx', 'PerplexityBot', 2, 'Perplexity can read you', 'Perplexity blocked'], ['gext', 'Google-Extended', 1, 'Gemini can use you', 'Google-Extended blocked'], ['gbot', 'Googlebot', 2, 'Googlebot allowed', 'Googlebot blocked'], ['bing', 'Bingbot', 2, 'Bing / Copilot allowed', 'Bingbot blocked'], ['claude', 'ClaudeBot', 1, 'Claude can read you', 'ClaudeBot blocked']]
      .forEach((b) => { const no = body ? blocked(b[1]) : false; add('crawl', b[0], b[3], b[4], no ? 0 : b[2], b[2]); });
    const sm = body && /^\s*sitemap\s*:\s*(\S+)/im.exec(body);
    S.sitemapUrl = sm ? sm[1] : '';
    add('crawl', 'sitemap', 'Sitemap declared', body ? 'No sitemap in robots.txt' : 'No robots.txt', sm ? 1 : 0, 1);
  };

  const pageChecks = (P) => {
    S.started.page = true; S.started.schema = true;
    const m = (k) => P.meta[k] || '';
    const title = P.title, desc = m('description'), ogT = m('og:title'), ogD = m('og:description'), ogI = m('og:image'), tw = m('twitter:card');
    const site = m('og:site_name');
    if (site) S.brand = site;
    else if (title) { const parts = title.split(/\s[|\-–—:·]\s/).map((p) => p.trim()).filter(Boolean).sort((a, b) => a.length - b.length); if (parts[0] && parts[0].length <= 30 && parts.length > 1) S.brand = parts[0]; }
    S.noindex = /noindex/i.test(m('robots') + ' ' + m('googlebot'));
    S.description = desc || ogD;
    const tl = title.length, dl = desc.length;
    add('page', 'title', 'Title ' + tl + ' chars', !title ? 'No title' : 'Title ' + tl + ' chars', !title ? 0 : (tl >= 30 && tl <= 60 ? 3 : 1), 3);
    add('page', 'brand', 'Brand in title', 'Brand missing from title', alnum(title).indexOf(alnum(S.brand.split(/\s+/)[0])) >= 0 ? 1 : 0, 1);
    add('page', 'desc', 'Description ' + dl + ' chars', !desc ? 'No meta description' : 'Description ' + dl + ' chars', !desc ? 0 : (dl >= 120 && dl <= 160 ? 3 : dl >= 70 && dl <= 200 ? 1.5 : 0.5), 3);
    const h1t = P.h1[0] || '', h1w = h1t ? h1t.split(' ').length : 0, h1desc = h1w >= 4 && alnum(h1t) !== alnum(S.brand);
    add('page', 'h1', 'One H1', P.h1.length ? P.h1.length + ' H1s' : 'No H1', P.h1.length === 1 ? 1.5 : P.h1.length > 1 ? 0.5 : 0, 1.5);
    add('page', 'h1text', 'H1 says what you do', P.h1.length ? 'H1 too vague (' + h1w + ' words)' : 'No H1 to describe you', h1desc ? 1.5 : 0, 1.5);
    add('page', 'canonical', 'Canonical set', 'No canonical tag', P.canonical ? 1 : 0, 1);
    add('page', 'lang', 'Language set', 'No lang attribute', P.lang ? 1 : 0, 1);
    const og = (ogT ? 1 : 0) + (ogD ? 1 : 0) + (ogI ? 1 : 0);
    add('page', 'og', 'Open Graph complete', og ? 'Open Graph incomplete' : 'No Open Graph', og === 3 ? 2 : og ? 1 : 0, 2);
    add('page', 'twitter', 'Twitter card', 'No Twitter card', tw ? 1 : 0, 1);
    const h2n = P.h2.length;
    add('page', 'h2', h2n + ' H2 sections', h2n ? 'Only ' + h2n + ' H2 section' + (h2n > 1 ? 's' : '') : 'No H2 sections', h2n >= 4 ? 2 : h2n >= 2 ? 1 : 0, 2);
    const text = P.text.replace(/\s+/g, ' ').trim(), words = text ? text.split(' ').length : 0;
    add('page', 'depth', words + ' words of copy', 'Thin copy (' + words + ' words)', words >= 1000 ? 5 : words >= 600 ? 3 : words >= 300 ? 1.5 : 0, 5);
    const imgs = P.imgs.filter((i) => !(i.w && i.w <= 2) && !(i.h && i.h <= 2));
    const alts = imgs.filter((i) => i.alt || i.role === 'presentation' || i.hidden === 'true').length, cov = imgs.length ? alts / imgs.length : 1;
    add('page', 'alt', imgs.length ? Math.round(cov * 100) + '% of images have alt text' : 'No images to describe', Math.round(cov * 100) + '% of images have alt text', cov >= 0.9 ? 3 : cov >= 0.6 ? 1.5 : 0, 3);
    if (S.noindex) add('page', 'noindex', 'Indexable', 'Homepage set to noindex', 0, 0, 'fail');
    // structured data
    const nodes = []; let parsed = 0;
    const walk = (o) => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) { o.forEach(walk); return; } if (o['@type']) nodes.push(o); Object.keys(o).forEach((k) => { if (o[k] && typeof o[k] === 'object') walk(o[k]); }); };
    P.ld.forEach((b) => { try { walk(JSON.parse(b)); parsed++; } catch (e) {} });
    const types = (n) => [].concat(n['@type']).map(String);
    const has = (re) => nodes.filter((n) => types(n).some((t) => re.test(t)));
    const org = has(/^(Organization|Corporation|OnlineBusiness|OnlineStore|LocalBusiness|ProfessionalService|NGO)$/i)[0] || null;
    const sameAs = org ? [].concat(org.sameAs || []).filter((x) => typeof x === 'string') : [];
    S.sameAs = sameAs;
    const nb = P.ld.length;
    add('schema', 'jsonld', nb + ' JSON-LD block' + (nb > 1 ? 's' : ''), nb ? 'JSON-LD has errors' : 'No JSON-LD', parsed ? 3 : 0, 3);
    add('schema', 'org', 'Organization schema', 'No Organization schema', org ? 6 : 0, 6);
    add('schema', 'logo', 'Logo in schema', 'No logo in schema', org && org.logo ? 2 : 0, 2);
    add('schema', 'sameas', sameAs.length + ' profiles in sameAs', sameAs.length ? 'Only ' + sameAs.length + ' profile' + (sameAs.length > 1 ? 's' : '') + ' in sameAs' : 'No sameAs profiles', sameAs.length >= 3 ? 4 : sameAs.length ? 2 : 0, 4);
    add('schema', 'website', 'WebSite schema', 'No WebSite schema', has(/^WebSite$/i).length ? 1 : 0, 1);
    add('schema', 'product', 'Product / offer schema', 'No product or offer schema', has(/^(SoftwareApplication|WebApplication|MobileApplication|Product|Offer|AggregateOffer|Service)$/i).length ? 2 : 0, 2);
    const faq = has(/^FAQPage$/i).length > 0;
    add('schema', 'faq', 'FAQ schema', 'No FAQ schema', faq ? 2 : 0, 2);
    const urls = P.hrefs.map((h) => { try { return new URL(h, base + '/'); } catch (e) { return null; } }).filter(Boolean);
    S.links = { internal: urls.filter((u) => sameSite(u.hostname.replace(/^www\./, ''), domain)).map((u) => u.pathname.toLowerCase() + ' ' + u.hostname.toLowerCase()), external: urls.map((u) => u.href.toLowerCase()) };
    S.questions = P.questions; S.faq = faq;
  };

  const liteChecks = (m) => { S.partial.page = true; S.partial.schema = true; S.partial.content = true; if (m.brand) S.brand = m.brand; S.description = m.description || ''; };

  const entityChecks = async () => {
    S.started.entity = true;
    const brand = S.brand, label = labelOf(domain), first = brand.split(/\s+/)[0];
    const wd = (params) => getJson('https://www.wikidata.org/w/api.php?' + params + '&format=json', 9000);
    const matchWikidata = async (term) => {
      const j = await wd('action=wbsearchentities&language=en&type=item&limit=8&search=' + encodeURIComponent(term));
      const ids = ((j && j.search) || []).map((s) => s.id); if (!ids.length) return null;
      const j2 = await wd('action=wbgetentities&props=claims|sitelinks|descriptions&languages=en&sitefilter=enwiki&ids=' + ids.join('|'));
      const ents = (j2 && j2.entities) || {};
      for (const id of ids) { const e = ents[id]; if (e && e.claims && e.claims.P856 && e.claims.P856.some((c) => { const v = c.mainsnak && c.mainsnak.datavalue && c.mainsnak.datavalue.value; return sameSite(hostOf(v), domain); })) return e; }
      return null;
    };
    const summary = (t) => getJson('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(t.replace(/\s+/g, '_')), 8000);
    const looksRight = (w) => w && w.type === 'standard' && w.extract && new RegExp(alnum(first), 'i').test(alnum((w.title || '') + ' ' + w.extract.slice(0, 160))) && /company|software|platform|service|startup|corporation|application|app\b|product|brand|firm|agency|school/i.test(w.extract.slice(0, 260));
    const ddg = async (term) => { const d = await getJson('https://api.duckduckgo.com/?q=' + encodeURIComponent(term) + '&format=json&no_html=1&skip_disambig=1', 8000); return d && d.Abstract && d.Abstract.length > 40 && new RegExp(alnum(first), 'i').test(alnum(d.Abstract.slice(0, 120))) ? d : null; };
    const pWd = matchWikidata(brand).then((e) => e || (alnum(label) !== alnum(brand) ? matchWikidata(label) : null)).catch(() => null);
    const pWiki = pWd.then(async (e) => {
      const t = e && e.sitelinks && e.sitelinks.enwiki && e.sitelinks.enwiki.title;
      if (t) return { w: await summary(t), linked: true };
      let w = await summary(brand + ' (company)'); if (!looksRight(w)) { w = await summary(brand); if (!looksRight(w)) w = null; }
      return { w, linked: false };
    }).catch(() => ({ w: null, linked: false }));
    const pDdg = ddg(brand).then((d) => d || ddg(brand + ' company')).catch(() => null);
    const [e, wk, d] = await Promise.all([pWd, pWiki, pDdg]);
    add('entity', 'wikidata', 'Wikidata item links your site', 'No Wikidata item for your domain', e ? 10 : 0, 10);
    const wiki = wk && wk.w && wk.w.type === 'standard';
    add('entity', 'wikipedia', wk && wk.linked ? 'Wikipedia article' : 'Wikipedia article (unlinked)', 'No Wikipedia article', wiki ? (wk.linked ? 8 : 5) : 0, 8);
    add('entity', 'summary', 'Knowledge summary found', 'No knowledge summary', d || wiki ? 2 : 0, 2);
    const pool = (S.sameAs || []).concat(S.links.external || []).join(' ').toLowerCase();
    const kinds = [/linkedin\.com\/(company|showcase|school)/, /(twitter|x)\.com\/(?!share|intent|home)/, /crunchbase\.com\/organization/, /g2\.com\/products/, /capterra\.(com|co)/, /github\.com\//, /youtube\.com\/(@|c\/|channel)/, /trustpilot\.com\/review/].filter((re) => re.test(pool)).length;
    add('entity', 'profiles', kinds + ' linked profiles', kinds ? 'Only ' + kinds + ' linked profile' + (kinds > 1 ? 's' : '') : 'No linked profiles', kinds >= 4 ? 5 : kinds >= 2 ? 3 : kinds ? 1 : 0, 5);
    if (wiki && wk.w.extract) S.quote = firstSentences(wk.w.extract, 2);
    else if (d && d.Abstract) S.quote = firstSentences(d.Abstract, 2);
    else if (e && e.descriptions && e.descriptions.en) S.quote = e.descriptions.en.value;
  };

  const contentChecks = () => {
    if (S.partial.content) return;
    S.started.content = true;
    const paths = S.links.internal.join('\n'), linked = (re) => re.test(paths);
    const llms = S.llms;
    add('content', 'llms', 'llms.txt' + (llms.ok ? ' (' + llms.links + ' links)' : ''), llms.ok ? 'llms.txt has few links' : 'No llms.txt', llms.ok ? (llms.links >= 5 ? 4 : 3) : 0, 4);
    add('content', 'questions', S.questions + ' question headings', S.questions ? 'Only ' + S.questions + ' question heading' : 'No question-style headings', S.questions >= 2 || S.faq ? 3 : S.questions ? 1.5 : 0, 3);
    add('content', 'pricing', 'Pricing page linked', 'No pricing page linked', linked(/\/(pricing|plans|price)(\/|\s|$)/) ? 2 : 0, 2);
    add('content', 'proof', 'Customer stories linked', 'No customer stories linked', linked(/\/(customers?|case-stud|success-stor|testimonials|clients)/) ? 2 : 0, 2);
    add('content', 'docs', 'Docs or help linked', 'No docs or help linked', linked(/\/(docs|documentation|help|support|developers?|api)(\/|\s|$)|^\/?\S*\s(docs|help|support|developers?)\./m) ? 1 : 0, 1);
    add('content', 'blog', 'Blog or resources linked', 'No blog or resources linked', linked(/\/(blog|resources|guides|learn|insights|articles|news)(\/|\s|$)|\s(blog)\./m) ? 1 : 0, 1);
    add('content', 'compare', 'Comparison pages linked', 'No comparison pages linked', linked(/(\/vs[\/-]|-vs-|\/compare|\/comparison|alternative)/) ? 2 : 0, 2);
  };

  // homepage: direct first, then the r.jina.ai reader, then Microlink for title and description only
  const pPage = (async () => {
    let r = await getText(base + '/', { ua: BROWSER, accept: 'text/html,application/xhtml+xml', ms: 15000 });
    if (looksBlocked(r) || !r.text) r = await getText('https://r.jina.ai/' + base + '/', { ua: CHECKER, accept: 'text/html', ms: 20000 }).then((x) => x).catch(() => r);
    if (r.ok && r.text && !looksBlocked(r)) { pageChecks(await readPage(r.text)); return; }
    const j = await getJson('https://api.microlink.io/?url=' + encodeURIComponent(base), 15000);
    liteChecks(j && j.status === 'success' ? { brand: j.data && j.data.publisher, description: j.data && j.data.description } : {});
  })().catch(() => liteChecks({}));

  const pRobots = (async () => {
    const r = await getText(base + '/robots.txt');
    const body = r.status === 200 && !/html/i.test(r.type) && /user-agent/i.test(r.text) ? r.text : null;
    if (r.status === 0 && r.error === 'timeout') { S.partial.crawl = true; robotsChecks(null); return; }
    robotsChecks(body);
    const smUrl = S.sitemapUrl || base + '/sitemap.xml';
    const sr = await getText(smUrl, { accept: 'application/xml,text/xml,*/*', ms: 15000 });
    if (!sr.ok) { add('crawl', 'sitemapurls', 'Sitemap reachable', 'Sitemap not reachable', 0, 2); return; }
    const list = (sr.text.match(/https?:\/\/[^\s<>"')\]]+/g) || []).filter((u) => u !== smUrl && !/sitemaps\.org\/schemas|w3\.org\//.test(u));
    const subs = list.filter((u) => /\.xml(\.gz)?$|sitemap/i.test(u)).length;
    const isIndex = /sitemapindex/i.test(sr.text) || (list.length > 0 && subs / list.length > 0.6);
    if (isIndex) add('crawl', 'sitemapurls', 'Sitemap index (' + subs + ' sitemaps)', 'Sitemap index is empty', subs ? 2 : 0, 2);
    else add('crawl', 'sitemapurls', list.length + ' URLs in sitemap', list.length ? 'Sitemap lists only ' + list.length + ' URLs' : 'Sitemap missing or empty', list.length >= 20 ? 2 : list.length ? 1 : 0, 2);
  })().catch(() => { if (!S.started.crawl) robotsChecks(null); });

  const pLlms = (async () => {
    const r = await getText(base + '/llms.txt');
    const body = (r.text || '').trim();
    const ok = r.ok && !/html/i.test(r.type) && body.length > 40 && !/not found|doesn'?t exist|page not found/i.test(body.slice(0, 300)) && !/<html/i.test(body.slice(0, 200));
    S.llms = { ok, links: ok ? (body.match(/\]\(https?:\/\//g) || []).length : 0 };
  })().catch(() => { S.llms = { ok: false, links: 0 }; });

  await pPage;
  await Promise.all([pRobots, pLlms, entityChecks().catch(() => { S.partial.entity = true; })]);
  contentChecks();

  const anyPartial = Object.keys(S.partial).some((k) => S.partial[k]);
  const total = S.checks.reduce((a, c) => a + c.pts, 0);
  const score = anyPartial ? null : Math.round(S.noindex ? Math.min(total, 15) : total);
  const grade = score == null ? '' : score >= 80 ? 'Strong' : score >= 55 ? 'Fair' : 'Weak';
  const probs = S.checks.filter((x) => x.status !== 'pass');
  const name = S.brand || domain;
  const verdict = score == null ? 'Part of the check could not run for ' + domain + ' right now, so there is no overall score. Try again in a minute.' :
    score >= 80 ? name + ' is well set up for AI engines. What is left is earning citations.' :
    score >= 55 ? name + ' is readable, but AI engines are working from thin material. ' + probs.length + ' checks need work.' :
    'AI engines have little to go on for ' + name + '. ' + probs.length + ' of ' + S.checks.length + ' checks failed or need work.';
  const catTotal = (id) => Math.round(S.checks.filter((c) => c.cat === id).reduce((a, c) => a + c.pts, 0) * 10) / 10;
  const categories = CATS.map((c) => ({ id: c.id, label: c.label, score: S.partial[c.id] || !S.started[c.id] ? null : Math.round(catTotal(c.id)), max: c.max }));
  const top = probs.slice().sort((a, b) => (b.max - b.pts) - (a.max - a.pts));
  const lost = (x) => Math.round((x.max - x.pts) * 10) / 10;
  const L = [];
  L.push('AI visibility check for ' + domain + (name && alnum(name) !== alnum(labelOf(domain)) ? ' (' + name + ')' : ''));
  L.push(score == null ? 'Score: not available (part of the check could not run)' : 'Score: ' + score + '/100 (' + grade + ')');
  L.push(verdict);
  L.push('');
  CATS.forEach((c) => {
    const cs = categories.filter((x) => x.id === c.id)[0];
    L.push(c.label.toUpperCase() + (cs.score != null ? '  ' + cs.score + '/' + c.max : '  not checked'));
    const mine = S.checks.filter((x) => x.cat === c.id), passed = mine.filter((x) => x.status === 'pass').length;
    mine.filter((x) => x.status !== 'pass').forEach((x) => L.push('  ' + (x.status === 'warn' ? '[weak] ' : '[x]    ') + x.problem + '  (-' + lost(x) + ' pts)'));
    if (mine.length) L.push('  ' + passed + ' of ' + mine.length + ' checks passed');
    L.push('');
  });
  if (top.length) { L.push('BIGGEST GAPS'); top.slice(0, 3).forEach((x, i) => L.push('  ' + (i + 1) + '. ' + x.problem + ' (-' + lost(x) + ' pts)')); L.push(''); }
  if (S.quote) { L.push('What public knowledge sources say: "' + S.quote + '"'); L.push(''); }
  L.push('Every check, including the ones that passed, is in the structured result and the visual report: ' + ORIGIN + '/tools/ai-visibility-check/?check=' + encodeURIComponent(domain));
  return {
    text: L.join('\n'),
    data: {
      domain, brand: name, checkedAt: new Date().toISOString(), score, grade, partial: anyPartial, verdict, categories,
      checks: S.checks.map((x) => ({ category: x.cat, key: x.key, status: x.status, result: x.status === 'pass' ? x.label : x.problem, points: x.pts, max: x.max })),
      biggestGaps: top.slice(0, 3).map((x) => ({ problem: x.problem, pointsLost: lost(x) })),
      knowledgeSummary: S.quote || null, reportUrl: ORIGIN + '/tools/ai-visibility-check/?check=' + encodeURIComponent(domain)
    }
  };
}

/* ---------- JSON-RPC over Streamable HTTP ---------- */
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id == null ? null : id, error: { code, message } });

async function callTool(name, args, ctx) {
  const domain = cleanDomain(args && args.domain);
  if (!domain) return { content: [{ type: 'text', text: 'Pass a public website as a domain, for example "example.com".' }], isError: true };
  const key = ctx.origin + '/__mcp-cache/' + name + '/' + domain;
  let cache = null; try { cache = caches.default; } catch (e) {}
  if (cache) { try { const hit = await cache.match(key); if (hit) return await hit.json(); } catch (e) {} }
  const out = name === 'check_ai_crawlers' ? await crawlerCheck(domain) : await visibilityCheck(domain);
  const result = { content: [{ type: 'text', text: out.text }], structuredContent: out.data, isError: false };
  const stable = name === 'check_ai_crawlers' || !out.data.partial;
  if (cache && stable) { try { ctx.waitUntil(cache.put(key, new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=43200' } }))); } catch (e) {} }
  // nothing about the request is stored or logged: only the public result is cached, keyed by domain, for 12 hours
  return result;
}

async function handle(msg, ctx) {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') return rpcError(msg && msg.id, -32600, 'Invalid request');
  const { id, method, params } = msg;
  const isNote = id === undefined || id === null;
  if (method.startsWith('notifications/')) return null;
  if (isNote) return null;
  if (method === 'initialize') {
    const asked = params && params.protocolVersion;
    return { jsonrpc: '2.0', id, result: { protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[1], capabilities: { tools: { listChanged: false } }, serverInfo: SERVER, instructions: INSTRUCTIONS } };
  }
  if (method === 'ping') return { jsonrpc: '2.0', id, result: {} };
  if (method === 'tools/list') return { jsonrpc: '2.0', id, result: { tools: TOOLS } };
  if (method === 'tools/call') {
    const name = params && params.name;
    if (!TOOLS.some((t) => t.name === name)) return rpcError(id, -32602, 'Unknown tool: ' + name);
    try { return { jsonrpc: '2.0', id, result: await callTool(name, (params && params.arguments) || {}, ctx) }; }
    catch (e) { return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'The check failed: ' + String((e && e.message) || e) + '. Try again in a minute.' }], isError: true } }; }
  }
  if (method === 'resources/list') return { jsonrpc: '2.0', id, result: { resources: [] } };
  if (method === 'prompts/list') return { jsonrpc: '2.0', id, result: { prompts: [] } };
  return rpcError(id, -32601, 'Method not found: ' + method);
}

export async function onRequest(context) {
  const { request } = context;
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (method === 'GET') {
    // no server-to-client stream; people opening the URL in a browser get the setup page
    if (/text\/html/i.test(request.headers.get('accept') || '')) return Response.redirect(ORIGIN + '/tools/mcp/', 302);
    return new Response('This MCP endpoint accepts POST requests. Setup: ' + ORIGIN + '/tools/mcp/', { status: 405, headers: { 'Allow': 'POST, OPTIONS', 'Content-Type': 'text/plain; charset=utf-8', ...cors } });
  }
  if (method !== 'POST') return new Response(null, { status: 405, headers: { 'Allow': 'POST, OPTIONS', ...cors } });
  let body;
  try { body = await request.json(); } catch (e) { return jsonRes(rpcError(null, -32700, 'Parse error'), 400); }
  const ctx = { waitUntil: (p) => { try { context.waitUntil(p); } catch (e) {} }, origin: new URL(request.url).origin };
  const batch = Array.isArray(body);
  const replies = (await Promise.all((batch ? body : [body]).map((m) => handle(m, ctx)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202, headers: cors });
  return jsonRes(batch ? replies : replies[0]);
}

// exported for local tests (website-src/mcp-test.mjs)
export const _test = { handle, crawlerCheck, visibilityCheck, readPage, cleanDomain, evaluateBot, parseRobots };
