// Fourward AI visibility check: the engine behind /tools/ai-visibility-check/, the homepage card and the MCP tool.
//
// GET  /api/ai-check?domain=example.com&part=site|access|entity|pages[&brand=Acme][&paths=/pricing,/blog/]
//      Runs one part of the check on the server and returns a TEASER only: the scan-step lines, points per
//      category, pass / weak / fail counts and a sealed (encrypted) copy of every result. No check names.
// POST /api/ai-check  {action:'summary', domain, sealed:[...]}
//      Opens the sealed parts and returns the score, grade, category scores and counts. Still no findings.
// POST /api/ai-check  {action:'unlock', domain, sealed:[...], email, send, meta}
//      Checks the email, returns every result, and (send:true) emails the report and logs the lead.
//
// Why parts: each part is its own invocation, so each stays well inside the subrequest and CPU limits, and
// the browser can show real progress. Why sealed: the findings never reach the browser until an email is given.
// Only public https://<hostname>/ URLs are fetched; IPs and internal names are refused.
// Results list problems and scores, never fixes.

export const VERSION = 2;                       // bump when checks or the result format change
const ORIGIN = 'https://www.fourwardhq.com';
const TOOL_URL = ORIGIN + '/tools/ai-visibility-check/';
const LEAD_URL = 'https://script.google.com/macros/s/AKfycbyt5YKfhDZ2GhCCBkq8foHfgOr3VVgMCKlh5nlGZB7yP1J4uqV7rF3G6FAw7dKKt7O2JQ/exec';
const LIVE_HOSTS = ['www.fourwardhq.com', 'fourwardhq.com'];   // leads are logged and emailed only from the live site
const SEAL_SECRET = 'fw-aicheck-seal-v1:7f3c1c0e9a4b4d55b1a2c8e6f0d94c21';   // obfuscation, not a secret: set FW_SEAL_KEY in Pages to override
const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CHECKER = 'Mozilla/5.0 (compatible; FourwardAICheck/2.0; +https://www.fourwardhq.com/tools/ai-visibility-check/)';
// The user agents AI companies publish for their crawlers. Used for the firewall test only.
export const BOT_UA = {
  'OAI-SearchBot': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot',
  'ChatGPT-User': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot',
  'GPTBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot',
  'ClaudeBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  'PerplexityBot': 'Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)'
};

export const CATS = [
  { id: 'crawl', label: 'AI crawler access', short: 'Access' },
  { id: 'page', label: 'What your pages tell machines', short: 'Pages' },
  { id: 'schema', label: 'Structured data', short: 'Schema' },
  { id: 'entity', label: 'Entity & authority', short: 'Entity' },
  { id: 'content', label: 'AI-ready content', short: 'Content' }
];
export const PARTS = ['site', 'access', 'entity', 'pages'];
// what a failed check stops AI from telling a buyer (used for the one-line teaser, never names the check)
const GAP = {
  wikidata: 'who runs it', wikipedia: 'who runs it', org: 'who runs it', sameas: 'who runs it', about: 'who runs it', aboutpeople: 'who runs it', linkedin: 'who runs it',
  wikicites: 'who vouches for you', reviews: 'who vouches for you', reddit: 'who vouches for you', hn: 'who vouches for you', youtube: 'who vouches for you', commoncrawl: 'who vouches for you',
  demand: 'whether buyers look for you', rank: 'whether buyers look for you',
  compare: 'how you compare', pricing: 'what you charge', prices: 'what you charge', offer: 'what you charge', proof: 'who already uses you',
  docs: 'how your product works', productpages: 'what your product does', product: 'what you sell', desc: 'what you sell', title: 'what you sell', h1: 'what you sell', h1text: 'what you sell',
  nojs: 'what is on your pages', depth: 'what is on your pages', postnojs: 'what is on your pages', fresh: 'whether you are still active', byline: 'who wrote your content'
};

/* ---------- small helpers ---------- */
const json = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...extra } });
const alnum = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const hostOf = (u) => { try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return ''; } };
const sameSite = (h, d) => !!h && (h === d || h.slice(-(d.length + 1)) === '.' + d || d.slice(-(h.length + 1)) === '.' + h);
const labelOf = (domain) => { const l = domain.split('.')[0]; return l.charAt(0).toUpperCase() + l.slice(1); };
const decode = (s) => String(s || '').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp|#39);/gi, (m, e) => { const k = e.toLowerCase(); if (k[0] === '#') { const n = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); try { return String.fromCodePoint(n); } catch (x) { return m; } } return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }[k] || m; });
const firstSentences = (t, n) => { const s = String(t || '').split(/(?<=[.!?])\s+/); const out = s.slice(0, n || 2).join(' '); return out.length > 220 ? s[0] : out; };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const num = (n) => Number(n).toLocaleString('en-US');
const round1 = (n) => Math.round(n * 10) / 10;
const daysSince = (iso) => { const t = Date.parse(iso); return isNaN(t) ? null : Math.floor((Date.now() - t) / 864e5); };

export function cleanDomain(raw) {
  const d = String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').split(/[\/?#\s:]/)[0].replace(/\.$/, '').replace(/^www\./, '');
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) return '';
  if (/(^|\.)(localhost|local|internal|intranet|home|lan|corp|test|example|invalid)$/.test(d)) return '';
  return d;
}

/* ---------- HTTP: one capped, timed request ---------- */
const KEEP = ['x-robots-tag', 'last-modified', 'cf-mitigated', 'server', 'location', 'link', 'vary', 'content-signal', 'x-markdown-tokens', 'content-length', 'age'];
async function readCapped(r, url, max) {
  let body = r.body; if (!body) return '';
  if (/\.gz($|\?)/i.test(url) && typeof DecompressionStream !== 'undefined' && !/gzip/i.test(r.headers.get('content-encoding') || '')) { try { body = body.pipeThrough(new DecompressionStream('gzip')); } catch (e) {} }
  const reader = body.getReader(), dec = new TextDecoder('utf-8', { fatal: false });
  let out = '', bytes = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    bytes += value.byteLength; out += dec.decode(value, { stream: true });
    if (bytes >= max) { try { await reader.cancel(); } catch (e) {} break; }
  }
  return out + dec.decode();
}
async function http(url, { ua = CHECKER, accept = '*/*', ms = 9000, max = 600000, redirect = 'follow', headers = {} } = {}) {
  const t0 = Date.now(), ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': ua, 'Accept': accept, 'Accept-Language': 'en-US,en;q=0.8', ...headers }, redirect, signal: ctl.signal });
    const ttfb = Date.now() - t0, h = {};
    KEEP.forEach((k) => { const v = r.headers.get(k); if (v) h[k] = v; });
    let text = '';
    if (max > 0) text = await readCapped(r, url, max); else { try { r.body && r.body.cancel(); } catch (e) {} }
    return { ok: r.ok, status: r.status, url: r.url || url, type: r.headers.get('content-type') || '', h, text, ttfb };
  } catch (e) {
    return { ok: false, status: 0, url, type: '', h: {}, text: '', ttfb: 0, error: ctl.signal.aborted ? 'timeout' : String((e && e.message) || e) };
  } finally { clearTimeout(timer); }
}
const getJson = async (url, ms) => { const r = await http(url, { accept: 'application/json', ms: ms || 8000, max: 400000 }); if (!r.ok) return null; try { return JSON.parse(r.text); } catch (e) { return null; } };
const looksBlocked = (r) => !r.ok || /^(just a moment|attention required|access denied|403 forbidden|are you a robot|security check)/i.test(((/<title[^>]*>([^<]*)/i.exec(r.text) || [])[1] || '').trim()) || /challenge/i.test(r.h['cf-mitigated'] || '');

/* ---------- sealing: results travel through the browser unreadable until an email unlocks them ---------- */
const enc = new TextEncoder(), dec8 = new TextDecoder();
const b64u = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/')); const out = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i); return out; };
const keyCache = {};
async function sealKey(env) {
  const secret = (env && env.FW_SEAL_KEY) || SEAL_SECRET;
  if (!keyCache[secret]) keyCache[secret] = crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(secret)), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return keyCache[secret];
}
export async function seal(obj, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(env), enc.encode(JSON.stringify(obj))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return b64u(out);
}
export async function unseal(str, env) {
  try {
    const raw = unb64u(str); if (raw.length < 30) return null;
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.subarray(0, 12) }, await sealKey(env), raw.subarray(12));
    return JSON.parse(dec8.decode(pt));
  } catch (e) { return null; }
}

/* ---------- robots.txt, read the way RFC 9309 and Google read it (same as js/crawler.js) ---------- */
export function parseRobots(text) {
  const groups = [], sitemaps = [], signals = []; let cur = null;
  String(text || '').split(/\r?\n/).forEach((raw) => {
    const line = raw.replace(/#.*$/, '').trim(); if (!line) return;
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line); if (!m) return;
    const key = m[1].toLowerCase(), val = m[2].trim();
    if (key === 'user-agent') { if (!cur || cur.rules.length || cur.signals.length) { cur = { agents: [], rules: [], signals: [] }; groups.push(cur); } cur.agents.push(val.toLowerCase()); }
    else if ((key === 'allow' || key === 'disallow') && cur) cur.rules.push({ allow: key === 'allow', path: val });
    else if (key === 'content-signal') { signals.push(val.toLowerCase()); if (cur) cur.signals.push(val.toLowerCase()); }
    else if (key === 'sitemap') sitemaps.push(val);
  });
  return { groups, sitemaps, signals };
}
const toRegex = (p) => { const end = p.slice(-1) === '$'; if (end) p = p.slice(0, -1); return new RegExp('^' + p.split('*').map((x) => x.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + (end ? '$' : '')); };
export function evaluateBot(rb, token) {
  const t = token.toLowerCase();
  const named = rb.groups.filter((g) => g.agents.indexOf(t) >= 0);
  const groups = named.length ? named : rb.groups.filter((g) => g.agents.indexOf('*') >= 0);
  let rules = []; groups.forEach((g) => { rules = rules.concat(g.rules); });
  rules = rules.filter((r) => r.path !== '');
  let best = null;
  rules.forEach((r) => { let re; try { re = toRegex(r.path); } catch (e) { return; } if (!re.test('/')) return; const len = r.path.replace(/\*/g, '').length; if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len }; });
  const rootBlocked = best ? !best.allow : false;
  return { state: rootBlocked ? 'blocked' : rules.some((r) => !r.allow) ? 'partial' : 'allowed', via: named.length ? 'named' : groups.length ? 'all' : 'none' };
}

/* ---------- page reader: HTMLRewriter on Cloudflare, a regex reader elsewhere (local tests) ---------- */
const newPage = () => ({ lang: '', title: '', meta: {}, canonical: '', alternates: [], h1: [], h2: [], questions: 0, imgs: [], ld: [], links: [], text: '', words: 0, main: false, nav: false, times: [], scripts: 0, spaRoot: false, noscript: '', tables: 0 });
export async function readPage(html) {
  const P = newPage();
  if (typeof HTMLRewriter === 'undefined') return finishPage(readPageRegex(html, P));
  let titleDone = false, skip = 0, ldBuf = '', isLd = false, a = null;
  const heading = (arr, q) => { let buf = ''; return { element(e) { buf = ''; try { e.onEndTag(() => { const t = decode(buf).replace(/\s+/g, ' ').trim(); if (arr && t) arr.push(t.slice(0, 200)); if (q && /\?\s*$/.test(t)) P.questions++; }); } catch (x) {} }, text(t) { if (buf.length < 400) buf += t.text; } }; };
  const skipper = { element(e) { try { e.onEndTag(() => { skip--; }); skip++; } catch (x) {} } };
  const rw = new HTMLRewriter()
    .on('html', { element(e) { if (!P.lang) P.lang = (e.getAttribute('lang') || '').trim(); } })
    .on('head title', { element(e) { try { e.onEndTag(() => { titleDone = true; }); } catch (x) {} }, text(t) { if (!titleDone && P.title.length < 400) P.title += t.text; } })
    .on('meta', { element(e) { const k = (e.getAttribute('name') || e.getAttribute('property') || e.getAttribute('http-equiv') || '').toLowerCase(); if (k && !(k in P.meta)) P.meta[k] = decode(e.getAttribute('content') || '').trim().slice(0, 600); } })
    .on('link', { element(e) { const rel = (e.getAttribute('rel') || '').toLowerCase(); if (/(^|\s)canonical(\s|$)/.test(rel) && !P.canonical) P.canonical = decode(e.getAttribute('href') || '').trim(); else if (/(^|\s)alternate(\s|$)/.test(rel) && P.alternates.length < 20) P.alternates.push((e.getAttribute('type') || '').toLowerCase()); } })
    .on('h1', heading(P.h1, false)).on('h2', heading(P.h2, true)).on('h3', heading(null, true)).on('summary', heading(null, true)).on('dt', heading(null, true))
    .on('img', { element(e) { if (P.imgs.length < 400) P.imgs.push({ w: +e.getAttribute('width') || 0, h: +e.getAttribute('height') || 0, alt: e.hasAttribute('alt'), role: e.getAttribute('role') || '', hidden: e.getAttribute('aria-hidden') || '' }); } })
    .on('script', { element(e) { P.scripts++; isLd = /application\/ld\+json/i.test(e.getAttribute('type') || ''); if (isLd) { ldBuf = ''; try { e.onEndTag(() => { if (P.ld.length < 30) P.ld.push(ldBuf); isLd = false; }); } catch (x) {} } }, text(t) { if (isLd && ldBuf.length < 200000) ldBuf += t.text; } })
    .on('a[href]', { element(e) { if (P.links.length >= 1500) { a = null; return; } a = { href: decode(e.getAttribute('href')), text: '' }; P.links.push(a); const mine = a; try { e.onEndTag(() => { if (a === mine) a = null; }); } catch (x) {} }, text(t) { if (a && a.text.length < 80) a.text += t.text; } })
    .on('main', { element() { P.main = true; } }).on('nav', { element() { P.nav = true; } }).on('table', { element() { P.tables++; } })
    .on('time[datetime]', { element(e) { if (P.times.length < 12) P.times.push(e.getAttribute('datetime')); } })
    .on('div#root, div#app, div#__next, div#__nuxt, div#___gatsby, app-root, div[data-reactroot]', { element() { P.spaRoot = true; } })
    .on('noscript', { text(t) { if (P.noscript.length < 300) P.noscript += t.text; } })
    .on('body', { text(t) { if (!skip && P.text.length < 1200000) P.text += t.text; } })
    .on('body script', skipper).on('body style', skipper).on('body noscript', skipper).on('body template', skipper).on('body svg', skipper);
  await rw.transform(new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })).arrayBuffer();
  return finishPage(P);
}
function readPageRegex(html, P) {
  const attr = (tag, name) => { const m = new RegExp('\\s' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))', 'i').exec(tag); return m ? decode(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3]) : null; };
  const strip = (s) => decode(String(s).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  P.lang = (attr((/<html\b[^>]*>/i.exec(html) || [''])[0], 'lang') || '').trim();
  const head = (/<head\b[\s\S]*?<\/head>/i.exec(html) || [html])[0];
  P.title = strip((/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head) || ['', ''])[1]);
  (html.match(/<meta\b[^>]*>/gi) || []).forEach((t) => { const k = (attr(t, 'name') || attr(t, 'property') || attr(t, 'http-equiv') || '').toLowerCase(); if (k && !(k in P.meta)) P.meta[k] = (attr(t, 'content') || '').trim(); });
  (html.match(/<link\b[^>]*>/gi) || []).forEach((t) => { const rel = (attr(t, 'rel') || '').toLowerCase(); if (/(^|\s)canonical(\s|$)/.test(rel) && !P.canonical) P.canonical = (attr(t, 'href') || '').trim(); else if (/(^|\s)alternate(\s|$)/.test(rel)) P.alternates.push((attr(t, 'type') || '').toLowerCase()); });
  const all = (tag) => [...html.matchAll(new RegExp('<' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'gi'))].map((m) => strip(m[1])).filter(Boolean);
  P.h1 = all('h1'); P.h2 = all('h2');
  P.questions = ['h2', 'h3', 'summary', 'dt'].reduce((n, t) => n + all(t).filter((x) => /\?\s*$/.test(x)).length, 0);
  P.imgs = (html.match(/<img\b[^>]*>/gi) || []).map((t) => ({ w: +attr(t, 'width') || 0, h: +attr(t, 'height') || 0, alt: attr(t, 'alt') != null, role: attr(t, 'role') || '', hidden: attr(t, 'aria-hidden') || '' }));
  P.ld = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  P.scripts = (html.match(/<script\b/gi) || []).length;
  P.links = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].slice(0, 1500).map((m) => ({ href: attr('<a' + m[1] + '>', 'href'), text: strip(m[2]).slice(0, 80) })).filter((l) => l.href != null);
  P.main = /<main\b/i.test(html); P.nav = /<nav\b/i.test(html); P.tables = (html.match(/<table\b/gi) || []).length;
  P.times = [...html.matchAll(/<time\b[^>]*datetime\s*=\s*["']([^"']+)/gi)].slice(0, 12).map((m) => m[1]);
  P.spaRoot = /<div[^>]+id=["'](root|app|__next|__nuxt|___gatsby)["']|<app-root\b|data-reactroot/i.test(html);
  P.noscript = strip((/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/i.exec(html) || ['', ''])[1]).slice(0, 300);
  const body = (/<body\b[\s\S]*$/i.exec(html) || [''])[0].replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1>/gi, ' ');
  P.text = decode(body.replace(/<[^>]+>/g, ' '));
  return P;
}
function finishPage(P) {
  P.title = decode(P.title).replace(/\s+/g, ' ').trim();
  P.text = decode(P.text).replace(/\s+/g, ' ').trim();
  P.words = P.text ? P.text.split(' ').length : 0;
  P.links.forEach((l) => { l.text = decode(l.text || '').replace(/\s+/g, ' ').trim(); });
  return P;
}
// every JSON-LD node on a page, plus how many blocks parsed
function ldNodes(blocks) {
  const nodes = []; let parsed = 0;
  const walk = (o, depth) => { if (!o || typeof o !== 'object' || depth > 12) return; if (Array.isArray(o)) { o.forEach((x) => walk(x, depth + 1)); return; } if (o['@type']) nodes.push(o); Object.keys(o).forEach((k) => { if (o[k] && typeof o[k] === 'object') walk(o[k], depth + 1); }); };
  blocks.forEach((b) => { try { walk(JSON.parse(b), 0); parsed++; } catch (e) {} });
  const types = (n) => [].concat(n['@type']).map(String);
  return { nodes, parsed, has: (re) => nodes.filter((n) => types(n).some((t) => re.test(t))) };
}

/* ---------- a part's result ---------- */
function newResult(part, domain) {
  const R = { part, domain, checks: [], steps: [], hints: {}, extra: {} };
  // add(category, key, label when it passes, label when it does not, points earned, points possible[, status])
  R.add = (cat, key, ok, bad, pts, max, st) => { pts = Math.max(0, Math.min(max, round1(pts))); const status = st || (pts >= max ? 'pass' : pts > 0 ? 'warn' : 'fail'); R.checks.push({ cat, key, label: status === 'pass' ? ok : bad, pts, max, status }); };
  // a check we could not run: shown as "not tested" and left out of the score
  R.skip = (cat, key, why) => { R.checks.push({ cat, key, label: 'Not tested: ' + why, pts: 0, max: 0, status: 'skip' }); };
  R.step = (id, detail, tone) => { R.steps.push({ id, detail, tone: tone || '' }); };
  return R;
}
async function teaserOf(R, env) {
  const agg = {}, n = { pass: 0, warn: 0, fail: 0, skip: 0 };
  R.checks.forEach((c) => { const g = agg[c.cat] || (agg[c.cat] = { pts: 0, max: 0, pass: 0, warn: 0, fail: 0, skip: 0 }); g[c.status]++; n[c.status]++; if (c.status !== 'skip') { g.pts = round1(g.pts + c.pts); g.max = round1(g.max + c.max); } });
  const sealed = await seal({ v: VERSION, part: R.part, domain: R.domain, ts: Date.now(), checks: R.checks, extra: R.extra }, env);
  return { ok: true, v: VERSION, part: R.part, domain: R.domain, steps: R.steps, agg, n, hints: R.hints, sealed };
}

/* ---------- which pages a buyer (and an AI answering for one) looks for ---------- */
const PAGE = {
  pricing: { path: /(^|\/)(pricing|plans|prices?|plans-and-pricing|pricing-plans|plans-pricing)(\/|\.html?)?$/, text: /^(pricing|plans|plans (&|and) pricing|see pricing|view pricing)$/i },
  proof: { path: /(^|\/)(customers?|customer-stories|case-stud(y|ies)|success-stor(y|ies)|testimonials|clients|stories|reviews|wall-of-love)(\/|$)/, text: /^(customers|customer stories|case studies|success stories|testimonials|our customers)$/i },
  docs: { path: /(^|\/)(docs|documentation|help|help-cent(er|re)|support|developers?|api|api-reference|knowledge-?base|kb)(\/|$)/, host: /^(docs|help|support|developers?|developer|api|kb|learn)\./, text: /^(docs|documentation|help|help cent(er|re)|support|developers|api|api docs|knowledge base)$/i },
  blog: { path: /(^|\/)(blog|resources|guides|learn|insights|articles|news|library|academy|journal)(\/|$)/, host: /^(blog|news|resources)\./, text: /^(blog|resources|insights|learn|guides|articles)$/i },
  compare: { path: /(\/vs[\/-]|-vs-|\/versus[\/-]|\/compare|\/comparisons?(\/|$)|alternatives?(\/|-|$)|\/best-[a-z0-9-]+)/ },
  product: { path: /(^|\/)(products?|features?|platform|solutions?|use-cases?|how-it-works|tour|capabilities)(\/|$)/, text: /^(product|products|features|platform|solutions|use cases|how it works)$/i },
  about: { path: /(^|\/)(about|about-us|company|our-story|team|who-we-are|leadership)(\/|\.html?)?$/, text: /^(about|about us|company|our story|team|our team|who we are)$/i },
  privacy: { path: /privacy/, text: /privacy/i },
  terms: { path: /(^|\/)(terms|terms-of-(service|use)|tos|legal)(\/|\.html?|$)/, text: /^(terms|terms of (service|use)|legal)$/i },
  security: { path: /(^|\/)(security|trust|trust-cent(er|re)|compliance|soc-?2|gdpr)(\/|$)/, host: /^(trust|security)\./, text: /^(security|trust|trust cent(er|re)|compliance)$/i },
  contact: { path: /(^|\/)(contact|contact-us|contact-sales|talk-to-sales|get-in-touch|demo|book-a-demo|request-a-demo|get-a-demo)(\/|\.html?)?$/, text: /^(contact|contact us|contact sales|talk to sales|book a demo|get a demo|request a demo)$/i }
};
const POST_PATH = /(^|\/)(blog|resources|insights|articles|news|guides|learn)\/[^\/]{8,}\/?$/;

/* =====================================================================================================
   PART 1 · site: the homepage as a crawler reads it, robots.txt, the sitemap and llms.txt
   ===================================================================================================== */
async function partSite(domain) {
  const R = newResult('site', domain), base = 'https://' + domain;
  const [homeRaw, robots, llms] = await Promise.all([
    http(base + '/', { ua: BROWSER, accept: 'text/html,application/xhtml+xml', ms: 15000, max: 1500000 }),
    http(base + '/robots.txt', { accept: 'text/plain,*/*', max: 300000 }),
    http(base + '/llms.txt', { accept: 'text/plain,text/markdown,*/*', max: 300000 })
  ]);

  /* ----- homepage ----- */
  let home = homeRaw, rendered = false;
  if (looksBlocked(home) || !home.text) {
    // the site turned our plain request away; a reader service shows the page with JavaScript already run
    const viaReader = await http('https://r.jina.ai/' + base + '/', { accept: 'text/html', ms: 20000, max: 1500000, headers: { 'X-Return-Format': 'html' } });
    if (viaReader.ok && viaReader.text && !looksBlocked(viaReader)) { home = viaReader; rendered = true; }
  }
  let P = home.ok && home.text && !looksBlocked(home) ? await readPage(home.text) : null;
  if (P && rendered && P.words < 40 && !P.h1.length) P = null;      // the reader only got a bot wall
  const readable = !!P;
  const S = { brand: labelOf(domain), internal: [], external: [], questions: 0, faq: false, mailto: false };
  R.extra.rendered = rendered;

  if (!readable) {
    R.step('home', homeRaw.status ? 'Your site answered HTTP ' + homeRaw.status + ' to a plain request' : 'Your homepage did not answer', 'bad');
    R.step('nojs', 'Could not read the page', 'bad');
    R.step('schema', 'Skipped: page not readable', 'bad');
    ['nojs', 'title', 'desc', 'h1'].forEach((k) => R.skip('page', k, 'your homepage did not load for us'));
    R.skip('schema', 'jsonld', 'your homepage did not load for us');
    R.skip('entity', 'linkedin', 'your homepage did not load for us');
    R.extra.unreadable = true;
  } else {
    const m = (k) => P.meta[k] || '';
    const title = P.title, desc = m('description'), ogT = m('og:title'), ogD = m('og:description'), ogI = m('og:image');
    const L = ldNodes(P.ld);
    const org = L.has(/^(Organization|Corporation|OnlineBusiness|OnlineStore|LocalBusiness|ProfessionalService|NGO|EducationalOrganization)$/i)[0] || null;
    const site = m('og:site_name');
    if (site && site.length <= 40) S.brand = site;
    else if (org && typeof org.name === 'string' && org.name.length <= 40) S.brand = org.name.replace(/,?\s+(inc|llc|ltd|gmbh|corp|co|pvt|limited)\.?$/i, '').trim() || S.brand;
    else if (title) { const parts = title.split(/\s[|\-–—:·]\s/).map((p) => p.trim()).filter(Boolean).sort((a, b) => a.length - b.length); if (parts[0] && parts[0].length <= 30 && parts.length > 1) S.brand = parts[0]; }
    const robotsMeta = (m('robots') + ' ' + m('googlebot') + ' ' + m('bingbot') + ' ' + (homeRaw.h['x-robots-tag'] || '')).toLowerCase();
    R.extra.noindex = /noindex/.test(robotsMeta);
    R.hints.description = (desc || ogD || '').slice(0, 300);

    // 1. what a crawler that does not run JavaScript gets
    const words = P.words;
    const urls = P.links.map((l) => { try { const u = new URL(l.href, base + '/'); return /^https?:$/.test(u.protocol) ? { u, text: l.text } : null; } catch (e) { return null; } }).filter(Boolean);
    const internalUrls = urls.filter((x) => sameSite(x.u.hostname.replace(/^www\./, ''), domain));
    const il = new Set(internalUrls.map((x) => x.u.pathname.replace(/\/+$/, '') || '/')).size;
    if (rendered) {
      R.skip('page', 'nojs', 'your site turned our plain request away, so we read it through a browser');
      R.skip('page', 'links', 'your site turned our plain request away, so we read it through a browser');
      R.step('nojs', 'Plain request blocked · read through a browser', 'bad');
    } else {
      const spa = P.spaRoot || /javascript/i.test(P.noscript);
      R.add('page', 'nojs', num(words) + ' words readable without JavaScript', words < 80 ? (spa ? 'Homepage is empty until JavaScript runs (' + plural(words, 'word') + ' in the HTML)' : 'Almost no text in the HTML (' + plural(words, 'word') + ')') : 'Only ' + words + ' words readable without JavaScript', words >= 250 ? 5 : words >= 80 ? 2.5 : 0, 5);
      R.add('page', 'links', il + ' internal links in the HTML', il ? 'Only ' + plural(il, 'internal link') + ' in the HTML' : 'No links to other pages in the HTML', il >= 10 ? 1 : il >= 3 ? 0.5 : 0, 1);
      R.step('nojs', words >= 250 ? num(words) + ' words without JavaScript' : 'Only ' + plural(words, 'word') + ' without JavaScript', words >= 250 ? 'good' : 'bad');
    }
    R.add('page', 'depth', num(words) + ' words of copy', 'Thin copy (' + plural(words, 'word') + ')', words >= 900 ? 2 : words >= 500 ? 1.5 : words >= 250 ? 0.5 : 0, 2);

    // 2. the tags engines read first
    const tl = title.length, dl = desc.length;
    R.add('page', 'title', 'Title ' + tl + ' characters', !title ? 'No title' : 'Title ' + tl + ' characters', !title ? 0 : (tl >= 30 && tl <= 60 ? 1.5 : 0.5), 1.5);
    R.add('page', 'brand', 'Brand in title', 'Brand missing from title', alnum(title).indexOf(alnum(S.brand.split(/\s+/)[0])) >= 0 ? 0.5 : 0, 0.5);
    R.add('page', 'desc', 'Description ' + dl + ' characters', !desc ? 'No meta description' : 'Description ' + dl + ' characters', !desc ? 0 : (dl >= 120 && dl <= 160 ? 1.5 : dl >= 70 && dl <= 200 ? 1 : 0.5), 1.5);
    const h1t = P.h1[0] || '', h1w = h1t ? h1t.split(' ').length : 0, h1desc = h1w >= 4 && alnum(h1t) !== alnum(S.brand);
    R.add('page', 'h1', 'One H1', P.h1.length ? P.h1.length + ' H1s' : 'No H1', P.h1.length === 1 ? 1 : P.h1.length > 1 ? 0.5 : 0, 1);
    R.add('page', 'h1text', 'H1 says what you do', P.h1.length ? 'H1 too vague (' + plural(h1w, 'word') + ')' : 'No H1 to describe you', h1desc ? 1.5 : 0, 1.5);
    const h2n = P.h2.length;
    R.add('page', 'h2', h2n + ' H2 sections', h2n ? 'Only ' + plural(h2n, 'H2 section') : 'No H2 sections', h2n >= 3 ? 0.5 : 0, 0.5);
    let canonOk = false, canonHost = '';
    if (P.canonical) { try { const cu = new URL(P.canonical, base + '/'); canonHost = cu.hostname.replace(/^www\./, ''); canonOk = sameSite(canonHost, domain) && cu.protocol === 'https:'; } catch (e) {} }
    R.add('page', 'canonical', 'Canonical set', !P.canonical ? 'No canonical tag' : canonHost && !sameSite(canonHost, domain) ? 'Canonical points to another site (' + canonHost + ')' : 'Canonical is not an https address on this site', canonOk ? 1 : 0, 1);
    R.add('page', 'lang', 'Language set', 'No lang attribute', P.lang ? 0.5 : 0, 0.5);
    const og = (ogT ? 1 : 0) + (ogD ? 1 : 0) + (ogI ? 1 : 0);
    R.add('page', 'og', 'Open Graph complete', og ? 'Open Graph incomplete (' + og + ' of 3 tags)' : 'No Open Graph', og === 3 ? 0.5 : 0, 0.5);
    const imgs = P.imgs.filter((i) => !(i.w && i.w <= 2) && !(i.h && i.h <= 2));
    const alts = imgs.filter((i) => i.alt || i.role === 'presentation' || i.hidden === 'true').length, cov = imgs.length ? alts / imgs.length : 1;
    R.add('page', 'alt', imgs.length ? Math.round(cov * 100) + '% of images have alt text' : 'No images to describe', Math.round(cov * 100) + '% of images have alt text', cov >= 0.9 ? 0.5 : 0, 0.5);
    // directives that keep a page out of answers: Google needs a page to be snippet-eligible, Copilot skips noarchive pages
    const limits = [];
    if (/nosnippet/.test(robotsMeta)) limits.push('nosnippet');
    if (/max-snippet\s*:\s*0(\D|$)/.test(robotsMeta)) limits.push('max-snippet:0');
    if (/noarchive/.test(robotsMeta)) limits.push('noarchive');
    if (/nocache/.test(robotsMeta)) limits.push('nocache');
    if (/ai-grounding\s*:\s*disallow/.test(robotsMeta)) limits.push('ai-grounding:disallow');
    R.add('page', 'limits', 'No snippet or archive limits', 'Homepage sets ' + limits.join(', '), limits.length ? 0 : 2, 2);
    if (R.extra.noindex) R.add('page', 'noindex', 'Indexable', 'Homepage set to noindex', 0, 0, 'fail');
    R.step('home', num(words) + ' words · ' + plural(h2n, 'section') + (homeRaw.ttfb && !rendered ? ' · answered in ' + (homeRaw.ttfb < 1000 ? homeRaw.ttfb + ' ms' : (homeRaw.ttfb / 1000).toFixed(1) + ' s') : ''), words >= 500 ? 'good' : 'bad');

    // 3. structured data on the homepage
    const nb = P.ld.length, sameAs = org ? [].concat(org.sameAs || []).filter((x) => typeof x === 'string') : [];
    R.add('schema', 'jsonld', plural(nb, 'JSON-LD block'), nb ? (L.parsed ? plural(nb - L.parsed, 'JSON-LD block') + ' of ' + nb + ' will not parse' : 'JSON-LD has errors') : 'No JSON-LD', !nb ? 0 : L.parsed === nb ? 1.5 : L.parsed ? 0.5 : 0, 1.5);
    R.add('schema', 'org', 'Organization schema', 'No Organization schema', org ? 3 : 0, 3);
    R.add('schema', 'logo', 'Logo in schema', 'No logo in schema', org && org.logo ? 0.5 : 0, 0.5);
    R.add('schema', 'sameas', sameAs.length + ' profiles in sameAs', sameAs.length ? 'Only ' + plural(sameAs.length, 'profile') + ' in sameAs' : 'No sameAs profiles', sameAs.length >= 3 ? 1.5 : sameAs.length ? 0.5 : 0, 1.5);
    const orgDesc = org && typeof org.description === 'string' ? org.description.trim() : '';
    R.add('schema', 'orgdesc', 'Organization schema says what you do', org ? 'Organization schema has no description' : 'No Organization description', orgDesc.length >= 40 ? 0.5 : 0, 0.5);
    R.add('schema', 'website', 'WebSite schema', 'No WebSite schema', L.has(/^WebSite$/i).length ? 0.5 : 0, 0.5);
    R.add('schema', 'product', 'Product or service schema', 'No product or service schema', L.has(/^(SoftwareApplication|WebApplication|MobileApplication|Product|Service|ProfessionalService)$/i).length ? 1 : 0, 1);
    R.step('schema', nb ? plural(nb, 'JSON-LD block') + (org ? ' · Organization' : ' · no Organization') : 'No JSON-LD found', org ? 'good' : 'bad');

    S.internal = internalUrls.map((x) => ({ path: x.u.pathname.toLowerCase(), host: x.u.hostname.toLowerCase(), href: x.u.href, text: x.text }));
    S.external = urls.map((x) => x.u.href.toLowerCase());
    S.mailto = P.links.some((l) => /^(mailto|tel):/i.test(l.href || ''));
    S.questions = P.questions; S.faq = L.has(/^FAQPage$/i).length > 0;

    // 4. the profiles AI engines cite most, linked from the site or its schema
    const pool = sameAs.concat(S.external).join(' ').toLowerCase(), has = (re) => re.test(pool);
    R.add('entity', 'linkedin', 'LinkedIn company page linked', 'No LinkedIn company page linked', has(/linkedin\.com\/(company|showcase|school)\//) ? 1.5 : 0, 1.5);
    R.add('entity', 'youtube', 'YouTube channel linked', 'No YouTube channel linked', has(/youtube\.com\/(@|c\/|channel\/|user\/)/) ? 1.5 : 0, 1.5);
    const rev = [[/g2\.com\/products\//, 'G2'], [/capterra\.[a-z.]+\//, 'Capterra'], [/trustpilot\.com\/review\//, 'Trustpilot'], [/trustradius\.com\/products\//, 'TrustRadius'], [/gartner\.com\/reviews\//, 'Gartner Peer Insights'], [/producthunt\.com\/(products|posts)\//, 'Product Hunt'], [/getapp\.[a-z.]+\//, 'GetApp']].filter((x) => has(x[0])).map((x) => x[1]);
    R.add('entity', 'reviews', 'Review profile linked (' + rev.join(', ') + ')', rev.length ? 'Only one review profile linked (' + rev[0] + ')' : 'No review profile linked (G2, Capterra, Trustpilot)', rev.length >= 2 ? 2 : rev.length ? 1.5 : 0, 2);
    const other = [/(twitter|x)\.com\/(?!share|intent|home)[a-z0-9_]+/, /github\.com\/[a-z0-9-]+/, /crunchbase\.com\/organization\//, /facebook\.com\/[a-z0-9.]+/, /instagram\.com\/[a-z0-9_.]+/].filter(has).length;
    R.add('entity', 'social', other + ' other profiles linked', other ? 'Only one other profile linked' : 'No X, GitHub or Crunchbase profile linked', other >= 2 ? 1 : other ? 0.5 : 0, 1);
  }
  R.hints.brand = S.brand;

  /* ----- robots.txt ----- */
  const robotsBody = robots.status === 200 && !/html/i.test(robots.type) && !/^\s*</.test(robots.text) ? robots.text : null;
  const rb = parseRobots(robotsBody || '');
  const robotsDown = robots.status === 0 || robots.status >= 500, robotsWalled = [401, 403, 429].indexOf(robots.status) >= 0;
  if (robotsWalled) { ['robots'].concat(ROBOT_BOTS.map((b) => b[0]), ['sitemap']).forEach((k) => R.skip('crawl', k, 'your site turned our request for robots.txt away (HTTP ' + robots.status + ')')); R.step('robots', 'robots.txt request turned away (HTTP ' + robots.status + ')', 'bad'); }
  else {
  R.add('crawl', 'robots', 'robots.txt found', robotsDown ? (robots.status ? 'robots.txt returns a server error (HTTP ' + robots.status + ')' : 'robots.txt did not answer') : 'No robots.txt', robotsBody ? 1 : robotsDown ? 0 : 0.5, 1);
  let allowedBots = 0;
  ROBOT_BOTS.forEach((b) => { const no = robotsBody ? evaluateBot(rb, b[1]).state === 'blocked' : robotsDown; if (!no) allowedBots++; R.add('crawl', b[0], b[3], b[4], no ? 0 : b[2], b[2]); });
  R.step('robots', robotsBody ? allowedBots + ' of ' + ROBOT_BOTS.length + ' AI crawlers allowed' : robotsDown ? 'robots.txt did not load' : 'No robots.txt found', (robotsBody || !robotsDown) && allowedBots === ROBOT_BOTS.length ? 'good' : 'bad');
  // Cloudflare content signals: only scored when the site declares them
  const sig = rb.signals.join(' , ');
  if (sig) { const no = [/ai-input\s*=\s*no/.test(sig) && 'ai-input=no', /search\s*=\s*no/.test(sig) && 'search=no'].filter(Boolean); R.add('crawl', 'signals', 'Content signals allow AI answers', 'robots.txt content signal says ' + no.join(' and '), no.length ? 0 : 0.5, 0.5); }
  }

  /* ----- sitemap ----- */
  const declared = rb.sitemaps[0] || '';
  if (!robotsWalled) R.add('crawl', 'sitemap', 'Sitemap declared in robots.txt', robotsBody ? 'No sitemap line in robots.txt' : 'No robots.txt to declare a sitemap', declared ? 0.5 : 0, 0.5);
  let smUrl = declared || base + '/sitemap.xml';
  if (!sameSite(hostOf(smUrl), domain)) smUrl = base + '/sitemap.xml';
  const sm = await http(smUrl, { accept: 'application/xml,text/xml,*/*', ms: 12000, max: 2500000 });
  const locs = [], mods = []; let sitemapCount = 0, isIndex = false, sampled = false;
  const harvest = (xml) => { for (const x of xml.matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)) { if (locs.length < 60000) locs.push(decode(x[1])); } for (const x of xml.matchAll(/<lastmod>\s*([^<\s]+)/gi)) { if (mods.length < 60000) mods.push(x[1]); } };
  const smOk = sm.ok && /<(urlset|sitemapindex)\b/i.test(sm.text);
  if (smOk) {
    isIndex = /<sitemapindex\b/i.test(sm.text);
    if (isIndex) {
      const kids = [...sm.text.matchAll(/<sitemap>[\s\S]*?<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)/gi)].map((x) => decode(x[1])).filter((u) => sameSite(hostOf(u), domain));
      sitemapCount = kids.length;
      // read up to three child sitemaps: pages first, then posts, then whatever comes first
      const pick = [...new Set([kids.find((u) => /page/i.test(u)), kids.find((u) => /post|blog|article/i.test(u)), kids[0], kids[1]].filter(Boolean))].slice(0, 3);
      const got = await Promise.all(pick.map((u) => http(u, { accept: 'application/xml,text/xml,*/*', ms: 10000, max: 2000000 })));
      got.forEach((g) => { if (g.ok) harvest(g.text); });
      sampled = kids.length > pick.length;
    } else harvest(sm.text);
  }
  const pageLocs = locs.filter((u) => !/\.xml(\.gz)?$/i.test(u) && sameSite(hostOf(u), domain));
  if (!smOk) {
    R.add('crawl', 'sitemapurls', 'Sitemap reachable', sm.status === 404 || sm.status === 410 ? 'No XML sitemap found' : 'Sitemap not reachable' + (sm.status ? ' (HTTP ' + sm.status + ')' : ''), 0, 1);
    R.skip('crawl', 'lastmod', 'no sitemap to read dates from');
    R.skip('crawl', 'smhealth', 'no sitemap to sample');
    R.step('sitemap', 'No sitemap found', 'bad');
  } else {
    const n = pageLocs.length, label = isIndex ? num(n) + (sampled ? '+' : '') + ' URLs across ' + plural(sitemapCount, 'sitemap') : num(n) + ' URLs in sitemap';
    R.add('crawl', 'sitemapurls', label, n ? 'Sitemap lists only ' + plural(n, 'URL') : 'Sitemap is empty', n >= 20 ? 1 : n ? 0.5 : 0, 1);
    const share = n ? Math.min(1, mods.length / Math.max(1, locs.length)) : 0;
    const stamped = mods.length >= 20 && new Set(mods).size === 1;
    R.add('crawl', 'lastmod', 'Sitemap dates its pages (lastmod)', stamped ? 'Every sitemap URL carries the same lastmod date' : mods.length ? 'Only ' + Math.round(share * 100) + '% of sitemap URLs carry a lastmod date' : 'Sitemap has no lastmod dates', share >= 0.8 && !stamped ? 0.5 : 0, 0.5);
    const newest = mods.map((d) => Date.parse(d)).filter((t) => !isNaN(t) && t <= Date.now() + 864e5).sort((a, b) => b - a)[0];
    if (newest) R.extra.freshDays = Math.max(0, Math.floor((Date.now() - newest) / 864e5));
    // do the listed pages still load? six spread across the sitemap
    const pickN = Math.min(6, n), sample = []; for (let i = 0; i < pickN; i++) sample.push(pageLocs[Math.floor(i * n / pickN)]);
    const res = await Promise.all(sample.map((u) => http(u, { ua: BROWSER, accept: 'text/html,*/*', ms: 8000, max: 0, redirect: 'manual' })));
    const broken = res.filter((r) => r.status === 404 || r.status === 410 || r.status >= 500).length, moved = res.filter((r) => r.status >= 300 && r.status < 400).length, walled = res.filter((r) => r.status === 0 || r.status === 401 || r.status === 403 || r.status === 429).length;
    if (!pickN || walled >= Math.ceil(pickN / 2)) R.skip('crawl', 'smhealth', 'your site turned our page requests away');
    else R.add('crawl', 'smhealth', 'Sampled sitemap pages all load (' + pickN + ' of ' + pickN + ')', broken ? broken + ' of ' + pickN + ' sampled sitemap pages are broken' : moved + ' of ' + pickN + ' sampled sitemap pages redirect elsewhere', broken ? 0 : moved >= 2 ? 0.5 : 1, 1);
    R.step('sitemap', label + (R.extra.freshDays != null ? ' · updated ' + (R.extra.freshDays === 0 ? 'today' : plural(R.extra.freshDays, 'day') + ' ago') : ''), n >= 20 && !broken ? 'good' : 'bad');
  }
  // freshness: the newest date the sitemap carries
  if (R.extra.freshDays != null) { const d = R.extra.freshDays; R.add('content', 'fresh', 'Site updated ' + (d === 0 ? 'today' : plural(d, 'day') + ' ago'), 'Newest page in the sitemap is ' + (d > 730 ? 'over two years' : d > 365 ? 'over a year' : plural(d, 'day')) + ' old', d <= 90 ? 2 : d <= 180 ? 1 : d <= 365 ? 0.5 : 0, 2); }
  else R.skip('content', 'fresh', 'your sitemap carries no dates');

  /* ----- llms.txt: a small courtesy for agents; studies find no effect on citations yet ----- */
  const lb = (llms.text || '').trim();
  const llmsOk = llms.ok && !/html/i.test(llms.type) && lb.length > 40 && !/^\s*</.test(lb) && !/not found|doesn'?t exist|page not found/i.test(lb.slice(0, 300));
  const llmsLinks = llmsOk ? (lb.match(/\]\(https?:\/\//g) || []).length : 0;
  R.add('content', 'llms', 'llms.txt found (' + plural(llmsLinks, 'link') + ')', 'No llms.txt', llmsOk ? 0.5 : 0, 0.5);
  R.step('llms', llmsOk ? 'Found · ' + plural(llmsLinks, 'link') : 'Not found', llmsOk ? 'good' : 'bad');

  /* ----- the pages buyers ask about: linked from the homepage or listed in the sitemap ----- */
  if (!readable && !pageLocs.length) {
    ['pricing', 'compare', 'productpages', 'proof', 'docs', 'blog', 'about', 'trust', 'contact', 'questions'].forEach((k) => R.skip('content', k, 'your homepage did not load for us'));
    R.step('content', 'Skipped: page not readable', 'bad');
  } else {
    const smPaths = pageLocs.map((u) => { try { const x = new URL(u); return { path: x.pathname.toLowerCase(), host: x.hostname.toLowerCase(), href: x.href, text: '' }; } catch (e) { return null; } }).filter(Boolean);
    const all = S.internal.concat(smPaths);
    const hitFor = (k) => { const def = PAGE[k]; return (l) => def.path.test(l.path.replace(/\/+$/, '')) || def.path.test(l.path) || !!(def.host && def.host.test(l.host)) || !!(def.text && l.text && def.text.test(l.text)); };
    const found = (k) => all.find(hitFor(k)) || null;
    const where = (hit) => S.internal.indexOf(hit) >= 0 ? 'linked' : 'in your sitemap';
    const pricing = found('pricing'), proof = found('proof'), docs = found('docs'), blog = found('blog'), about = found('about'), privacy = found('privacy'), terms = found('terms'), security = found('security'), contact = found('contact');
    const compareUrls = [...new Set(all.filter((l) => PAGE.compare.path.test(l.path)).map((l) => l.href.replace(/[?#].*$/, '')))];
    const productUrls = [...new Set(all.filter(hitFor('product')).map((l) => l.href.replace(/[?#].*$/, '')))];
    R.add('content', 'pricing', 'Pricing page ' + where(pricing), 'No pricing page found', pricing ? 1.5 : 0, 1.5);
    const cn = compareUrls.length;
    R.add('content', 'compare', plural(cn, 'comparison or best-of page'), cn ? 'Only ' + plural(cn, 'comparison or best-of page') : 'No comparison, alternatives or best-of pages', cn >= 3 ? 2.5 : cn ? 1.5 : 0, 2.5);
    const pn = productUrls.length;
    R.add('content', 'productpages', plural(pn, 'product or feature page'), pn ? 'Only one product or feature page' : 'No product, feature or solution pages found', pn >= 3 ? 1 : pn ? 0.5 : 0, 1);
    R.add('content', 'proof', 'Customer stories ' + where(proof), 'No customer stories found', proof ? 1.5 : 0, 1.5);
    R.add('content', 'docs', 'Docs or help ' + where(docs), 'No docs or help found', docs ? 1 : 0, 1);
    R.add('content', 'blog', 'Blog or resources ' + where(blog), 'No blog or resources found', blog ? 1 : 0, 1);
    R.add('content', 'about', 'About page ' + where(about), 'No about or company page found', about ? 0.5 : 0, 0.5);
    R.add('content', 'trust', security ? 'Privacy, terms and a security page' : 'Privacy and terms pages', privacy || terms ? 'Missing a ' + (!privacy ? 'privacy' : 'terms') + ' page' : 'No privacy or terms pages found', privacy && terms ? 0.5 : 0, 0.5);
    R.add('content', 'contact', 'A way to reach you', 'No contact page, email or phone found', contact || S.mailto ? 0.5 : 0, 0.5);
    if (readable) R.add('content', 'questions', plural(S.questions, 'question heading'), 'No question-style headings', S.questions >= 1 || S.faq ? 0.5 : 0, 0.5);
    else R.skip('content', 'questions', 'your homepage did not load for us');
    const five = [pricing, proof, docs, pn > 0, cn > 0].filter(Boolean).length;
    R.step('content', five + ' of 5 buyer pages found', five >= 4 ? 'good' : 'bad');
    // the next part opens the real pages
    const p = (hit) => hit ? hit.href : '';
    const post = all.find((l) => POST_PATH.test(l.path));
    R.hints.pages = { pricing: p(pricing), blog: post ? post.href : p(blog), about: p(about), compare: compareUrls[0] || '' };
  }
  return R;
}
// robots.txt rules that matter: [key, token, points, label when allowed, label when blocked]
const ROBOT_BOTS = [
  ['oai', 'OAI-SearchBot', 2.5, 'ChatGPT search can read you', 'ChatGPT search is blocked (OAI-SearchBot)'],
  ['claudeuser', 'Claude-User', 1, 'Claude can open your pages', 'Claude is told not to open your pages (Claude-User)'],
  ['pplx', 'PerplexityBot', 1.5, 'Perplexity can read you', 'Perplexity is blocked (PerplexityBot)'],
  ['claudes', 'Claude-SearchBot', 1, 'Claude search can read you', 'Claude search is blocked (Claude-SearchBot)'],
  ['gbot', 'Googlebot', 2, 'Googlebot allowed', 'Googlebot is blocked'],
  ['bing', 'Bingbot', 2, 'Bing and Copilot allowed', 'Bingbot is blocked, which also hides you from Copilot'],
  ['gpt', 'GPTBot', 1, 'GPTBot allowed', 'GPTBot is blocked'],
  ['claude', 'ClaudeBot', 0.5, 'ClaudeBot allowed', 'ClaudeBot is blocked'],
  ['gext', 'Google-Extended', 0.5, 'Gemini can use you', 'Google-Extended is blocked'],
  ['ccbot', 'CCBot', 0.5, 'Common Crawl allowed', 'Common Crawl is blocked (CCBot)']
];

/* =====================================================================================================
   PART 2 · access: the firewall test, speed, HTTPS and one address
   ===================================================================================================== */
async function probe(url, ua) {
  const r = await http(url, { ua, accept: 'text/html,*/*', ms: 9000, max: 60000 });
  return { status: r.status, challenge: /challenge/i.test(r.h['cf-mitigated'] || '') || (r.status === 200 && looksBlocked(r)), ttfb: r.ttfb, size: r.text.length, error: r.error || '' };
}
// [bot, key, points, name in the report]
const FIREWALL = [['OAI-SearchBot', 'fwoai', 2, 'ChatGPT search'], ['ChatGPT-User', 'fwuser', 1, 'ChatGPT browsing'], ['GPTBot', 'fwgpt', 1, 'GPTBot'], ['ClaudeBot', 'fwclaude', 1, 'ClaudeBot'], ['PerplexityBot', 'fwpplx', 1.5, 'PerplexityBot']];
async function partAccess(domain) {
  const R = newResult('access', domain), base = 'https://' + domain;
  const [browser, plain, alt, ...bots] = await Promise.all([
    probe(base + '/', BROWSER),
    http('http://' + domain + '/', { ua: BROWSER, accept: 'text/html,*/*', ms: 8000, max: 0, redirect: 'manual' }),
    http('https://www.' + domain + '/', { ua: BROWSER, accept: 'text/html,*/*', ms: 8000, max: 0, redirect: 'manual' }),
    ...FIREWALL.map((f) => probe(base + '/', BOT_UA[f[0]]))
  ]);
  const browserOk = browser.status >= 200 && browser.status < 400 && !browser.challenge;

  // firewall: the same homepage, asked for as a browser and as five AI bots
  let gotIn = 0;
  FIREWALL.forEach((d, i) => {
    const f = bots[i];
    if (!browserOk) { R.skip('crawl', d[1], 'your homepage did not load for a normal browser request either'); return; }
    const hollow = f.status === 200 && browser.size >= 20000 && f.size < 2000;       // a 200 with nothing in it
    const blocked = f.challenge || hollow || [0, 401, 402, 403, 406, 429, 503].indexOf(f.status) >= 0;
    if (!blocked) gotIn++;
    const how = f.challenge ? 'a challenge page' : hollow ? 'an empty page' : f.status === 402 ? 'HTTP 402, payment required' : f.status ? 'HTTP ' + f.status : 'no answer';
    R.add('crawl', d[1], 'Firewall lets ' + d[3] + ' in', 'Firewall turns away requests that identify as ' + d[3] + ' (' + how + ')', blocked ? 0 : d[2], d[2]);
  });
  R.step('firewall', browserOk ? (gotIn === FIREWALL.length ? 'All ' + FIREWALL.length + ' AI bots got in' : (FIREWALL.length - gotIn) + ' of ' + FIREWALL.length + ' AI bots turned away') : 'Homepage blocked our request · not tested', browserOk && gotIn === FIREWALL.length ? 'good' : 'bad');

  // speed: how long the server takes to start answering
  if (browserOk && browser.ttfb) { const t = browser.ttfb; R.add('crawl', 'speed', 'Server answers in ' + (t < 1000 ? t + ' ms' : (t / 1000).toFixed(1) + ' s'), 'Server takes ' + (t / 1000).toFixed(1) + ' s to answer', t <= 1500 ? 1 : t <= 4000 ? 0.5 : 0, 1); }
  else R.skip('crawl', 'speed', 'your homepage did not load for us');

  // HTTPS: the http address should hand over to https
  const loc = (r) => { try { return new URL(r.h.location || '', r.url); } catch (e) { return null; } };
  const pl = loc(plain), httpsOk = plain.status === 0 || (plain.status >= 300 && plain.status < 400 && pl && pl.protocol === 'https:');
  R.add('crawl', 'https', plain.status === 0 ? 'HTTPS only' : 'HTTP redirects to HTTPS', plain.status >= 300 && plain.status < 400 ? 'HTTP redirects, but not to HTTPS' : 'The http:// address answers without redirecting to HTTPS', httpsOk ? 0.5 : 0, 0.5);

  // one address: www and non-www should end up in the same place
  if (alt.status >= 200 && alt.status < 300 && browser.status >= 200 && browser.status < 300) {
    // www answers by itself; fine only if the bare domain redirects to it
    const bare = await http(base + '/', { ua: BROWSER, accept: 'text/html,*/*', ms: 8000, max: 0, redirect: 'manual' });
    R.add('crawl', 'host', 'www and non-www lead to one address', 'www and non-www both serve the site, as two addresses', bare.status >= 200 && bare.status < 300 ? 0 : 0.5, 0.5);
  } else if ((alt.status >= 300 && alt.status < 400) || !browserOk) R.add('crawl', 'host', 'www and non-www lead to one address', '', 0.5, 0.5);
  else R.add('crawl', 'host', '', 'The www address does not load (' + (alt.status ? 'HTTP ' + alt.status : 'no answer') + ')', 0, 0.5);
  return R;
}

/* =====================================================================================================
   PART 3 · entity: who the wider web says you are
   ===================================================================================================== */
async function partEntity(domain, brandIn) {
  const R = newResult('entity', domain);
  const label = labelOf(domain);
  const brand = String(brandIn || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 60) || label, first = brand.split(/\s+/)[0];
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
  const looksRight = (w) => w && w.type === 'standard' && w.extract && new RegExp(alnum(first), 'i').test(alnum((w.title || '') + ' ' + w.extract.slice(0, 160))) && /company|software|platform|service|startup|corporation|application|app\b|product|brand|firm|agency|school|provider|developer/i.test(w.extract.slice(0, 260));
  // Wikipedia articles that link to the site
  const cites = async () => {
    const q = (p) => getJson('https://en.wikipedia.org/w/api.php?action=query&list=exturlusage&eunamespace=0&eulimit=500&euprop=ids&format=json&euquery=' + encodeURIComponent(p), 9000);
    const [a, b] = await Promise.all([q(domain), q('*.' + domain)]);
    if (!a && !b) return null;
    const ids = new Set(); [a, b].forEach((j) => ((j && j.query && j.query.exturlusage) || []).forEach((x) => ids.add(x.pageid)));
    return ids.size;
  };
  // Reddit posts whose link is on the site (Arctic Shift, a public archive of Reddit); the brand's own profile posts are left out
  const reddit = async () => {
    const q = (prefix) => getJson('https://arctic-shift.photon-reddit.com/api/posts/search?limit=100&fields=id,subreddit&url=' + encodeURIComponent(prefix), 9000);
    const [a, b] = await Promise.all([q('https://' + domain), q('https://www.' + domain)]);
    if (!a && !b) return null;
    const ids = new Set(); [a, b].forEach((j) => ((j && j.data) || []).forEach((x) => { if (x && x.id && !/^u_/i.test(x.subreddit || '')) ids.add(x.id); }));
    return ids.size;
  };
  // Hacker News stories whose link is on the site
  const hn = async () => { const j = await getJson('https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=0&restrictSearchableAttributes=url&query=' + encodeURIComponent('"' + domain + '"'), 8000); return j && typeof j.nbHits === 'number' ? j.nbHits : null; };
  // do buyers search for the brand by name? Google's own autocomplete for "brand pricing", "brand alternatives", "brand vs", "brand reviews"
  const demand = async () => {
    const b = brand.toLowerCase().replace(/\s+/g, ' ').trim();
    const one = async (mod) => { const r = await http('https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=' + encodeURIComponent(b + ' ' + mod), { ua: BROWSER, accept: 'application/json,*/*', ms: 6000, max: 20000 }); if (!r.ok) return null; try { const j = JSON.parse(r.text); return (j[1] || []).some((s) => String(s).toLowerCase().indexOf(b + ' ' + mod) === 0); } catch (e) { return null; } };
    const mods = ['pricing', 'alternatives', 'vs', 'reviews'], got = await Promise.all(mods.map(one));
    if (got.every((x) => x == null)) return null;
    return mods.filter((m, i) => got[i]);
  };
  // Common Crawl: the open web archive many AI models are trained on. Its index is slow and rate limited, so one short try.
  const commonCrawl = async () => {
    const info = await getJson('https://index.commoncrawl.org/collinfo.json', 5000);
    const latest = Array.isArray(info) && info[0] && info[0]['cdx-api'] ? info[0] : null; if (!latest) return null;
    const r = await http(latest['cdx-api'] + '?url=' + encodeURIComponent(domain) + '&matchType=domain&output=json&limit=20&fl=url,status', { accept: 'application/json', ms: 7000, max: 40000 });
    if (r.status === 404) return { id: latest.id, pages: 0 };
    if (!r.ok) return null;
    return { id: latest.id, pages: r.text.split('\n').filter((l) => l.trim().charAt(0) === '{').length };
  };
  // Tranco: a research ranking of the most visited sites
  const tranco = async () => { const j = await getJson('https://tranco-list.eu/api/ranks/domain/' + encodeURIComponent(domain), 6000); if (!j || !Array.isArray(j.ranks)) return null; const r = j.ranks.map((x) => x.rank).filter((x) => x > 0); return { rank: r.length ? r[0] : 0 }; };

  const pWd = matchWikidata(brand).then((e) => e || (alnum(label) !== alnum(brand) ? matchWikidata(label) : null)).catch(() => null);
  const pWiki = pWd.then(async (e) => {
    const t = e && e.sitelinks && e.sitelinks.enwiki && e.sitelinks.enwiki.title;
    if (t) return { w: await summary(t), linked: true };
    let w = await summary(brand + ' (company)'); if (!looksRight(w)) { w = await summary(brand); if (!looksRight(w)) w = null; }
    return { w, linked: false };
  }).catch(() => ({ w: null, linked: false }));
  const safe = (p) => p.catch(() => null);
  const [e, wk, nCites, nReddit, nHn, dm, cc, tr] = await Promise.all([pWd, pWiki, safe(cites()), safe(reddit()), safe(hn()), safe(demand()), safe(commonCrawl()), safe(tranco())]);

  const wiki = !!(wk && wk.w && wk.w.type === 'standard');
  R.add('entity', 'wikipedia', wk && wk.linked ? 'Wikipedia article' : 'Wikipedia article (not tied to your site in Wikidata)', 'No Wikipedia article', wiki ? (wk.linked ? 5 : 3.5) : 0, 5);
  if (nCites == null) R.skip('entity', 'wikicites', 'Wikipedia did not answer');
  else R.add('entity', 'wikicites', 'Wikipedia links to your site from ' + plural(nCites, 'article') + (nCites >= 500 ? ' or more' : ''), nCites ? 'Wikipedia links to your site from only ' + plural(nCites, 'article') : 'No Wikipedia article links to your site', nCites >= 10 ? 3 : nCites >= 3 ? 2 : nCites ? 1 : 0, 3);
  R.add('entity', 'wikidata', 'Wikidata item links your site', 'No Wikidata item for your domain', e ? 3 : 0, 3);
  R.step('wikidata', e ? e.id + ' matches ' + domain : 'No item tied to ' + domain, e ? 'good' : 'bad');
  R.step('wiki', (wiki ? 'Article: ' + (wk.w.title || brand) : 'No article') + (nCites != null ? ' · cited on ' + plural(nCites, 'page') : ''), wiki || nCites >= 3 ? 'good' : 'bad');
  if (nReddit == null) R.skip('entity', 'reddit', 'the Reddit archive did not answer');
  else R.add('entity', 'reddit', (nReddit >= 100 ? '100 or more Reddit posts' : plural(nReddit, 'Reddit post')) + (nReddit === 1 ? ' links' : ' link') + ' to your site', nReddit ? 'Only ' + plural(nReddit, 'Reddit post') + (nReddit === 1 ? ' links' : ' link') + ' to your site' : 'No Reddit post links to your site', nReddit >= 10 ? 2 : nReddit >= 3 ? 1.5 : nReddit ? 1 : 0, 2);
  if (nHn == null) R.skip('entity', 'hn', 'Hacker News search did not answer');
  else R.add('entity', 'hn', plural(nHn, 'Hacker News thread') + (nHn === 1 ? ' links' : ' link') + ' to your site', nHn ? 'Only ' + plural(nHn, 'Hacker News thread') + (nHn === 1 ? ' links' : ' link') + ' to your site' : 'No Hacker News thread links to your site', nHn >= 5 ? 1 : nHn ? 0.5 : 0, 1);
  R.step('community', [nReddit != null ? (nReddit >= 100 ? '100+ Reddit posts' : plural(nReddit, 'Reddit post')) : '', nHn != null ? plural(nHn, 'Hacker News thread') : ''].filter(Boolean).join(' · ') || 'Sources did not answer', nReddit >= 3 || nHn >= 5 ? 'good' : 'bad');
  if (dm == null) R.skip('entity', 'demand', 'Google suggestions did not answer');
  else R.add('entity', 'demand', 'Google suggests searches for your brand (' + dm.join(', ') + ')', dm.length ? 'Google only suggests "' + brand.toLowerCase() + ' ' + dm[0] + '" for your brand' : 'Google suggests no searches like "' + brand.toLowerCase() + ' pricing" or "' + brand.toLowerCase() + ' alternatives"', dm.length >= 3 ? 2.5 : dm.length === 2 ? 2 : dm.length ? 1 : 0, 2.5);
  if (tr == null) R.skip('entity', 'rank', 'the Tranco ranking did not answer');
  else R.add('entity', 'rank', 'Ranked ' + num(tr.rank) + ' among the most visited sites', tr.rank ? 'Ranked ' + num(tr.rank) + ' among the most visited sites' : 'Not among the 1 million most visited sites', !tr.rank ? 0 : tr.rank <= 100000 ? 1.5 : tr.rank <= 500000 ? 1 : 0.5, 1.5);
  if (cc == null) R.skip('entity', 'commoncrawl', 'Common Crawl did not answer');
  else R.add('entity', 'commoncrawl', 'In Common Crawl\'s latest crawl (' + cc.id.replace('CC-MAIN-', '') + ')', cc.pages ? 'Only ' + plural(cc.pages, 'page') + ' in Common Crawl\'s latest crawl (' + cc.id.replace('CC-MAIN-', '') + ')' : 'Not in Common Crawl\'s latest crawl (' + cc.id.replace('CC-MAIN-', '') + ')', cc.pages >= 5 ? 1.5 : cc.pages ? 1 : 0, 1.5);
  R.step('demand', [dm ? (dm.length ? 'Buyers search "' + brand.toLowerCase() + ' ' + dm[0] + '"' : 'No brand searches suggested') : '', tr ? (tr.rank ? 'rank ' + num(tr.rank) : 'outside the top 1M sites') : ''].filter(Boolean).join(' · ') || 'Sources did not answer', (dm && dm.length >= 2) || (tr && tr.rank) ? 'good' : 'bad');
  if (wiki && wk.w.extract) R.extra.quote = firstSentences(wk.w.extract, 2);
  else if (e && e.descriptions && e.descriptions.en) R.extra.quote = e.descriptions.en.value;
  R.extra.brand = brand;
  return R;
}

/* =====================================================================================================
   PART 4 · pages: open the pricing page, a blog post and the about page, the way a crawler would
   ===================================================================================================== */
const PRICE = /(?:[$€£₹]\s?\d{1,3}(?:[,.]\d{3})*(?:\.\d{1,2})?|\b\d{1,5}(?:\.\d{2})?\s?(?:USD|EUR|GBP|INR)\b|\b(?:USD|EUR|GBP|INR)\s?\d{1,5}\b)/g;
async function partPages(domain, pathsIn, blind) {
  const R = newResult('pages', domain), base = 'https://' + domain;
  if (blind) {
    [['content', 'prices'], ['schema', 'offer'], ['content', 'comparepage'], ['page', 'postnojs'], ['schema', 'article'], ['content', 'byline'], ['entity', 'aboutpeople']].forEach((k) => R.skip(k[0], k[1], 'your homepage did not load for us, so we could not find this page'));
    R.step('pages', 'Skipped: homepage not readable', 'bad');
    return R;
  }
  // only this site's own https pages are opened
  const ok = (u) => { if (!u) return ''; try { const x = new URL(u, base + '/'); return x.protocol === 'https:' && sameSite(x.hostname.replace(/^www\./, ''), domain) && x.href.length < 300 ? x.href : ''; } catch (e) { return ''; } };
  const want = { pricing: ok(pathsIn.pricing), blog: ok(pathsIn.blog), about: ok(pathsIn.about), compare: ok(pathsIn.compare) };
  const open = async (u) => { if (!u) return null; const r = await http(u, { ua: BROWSER, accept: 'text/html,application/xhtml+xml', ms: 12000, max: 1200000 }); if (!r.ok || !r.text || looksBlocked(r)) return { r, P: null }; return { r, P: await readPage(r.text) }; };
  let [pr, bl, ab, cp] = await Promise.all([open(want.pricing), open(want.blog), open(want.about), open(want.compare)]);

  // pricing: can an engine quote a price?
  if (!want.pricing) { R.add('content', 'prices', '', 'No pricing page to read prices from', 0, 3); R.add('schema', 'offer', '', 'No prices in structured data', 0, 0.5); R.step('pages', 'No pricing page to open', 'bad'); }
  else if (!pr || !pr.P) { R.skip('content', 'prices', 'your pricing page did not load for us'); R.skip('schema', 'offer', 'your pricing page did not load for us'); R.step('pages', 'Pricing page did not load', 'bad'); }
  else {
    const P = pr.P, prices = [...new Set((P.text.match(PRICE) || []).map((s) => s.replace(/\s+/g, '')))].filter((s) => !/^[$€£₹]?0+(\.0+)?$/.test(s));
    const sales = /(contact (sales|us)|talk to (sales|us)|get a quote|custom pricing|request (a )?(quote|pricing|demo)|book a demo|let'?s talk)/i.test(P.text);
    const n = prices.length;
    R.add('content', 'prices', 'Pricing page shows ' + plural(n, 'price') + ' in text', n ? 'Pricing page shows only one price in text' : P.words < 120 ? 'Pricing page is empty without JavaScript' : sales ? 'Pricing page shows no prices, only "contact sales"' : 'Pricing page shows no prices in text', n >= 2 ? 3 : n ? 2 : 0, 3);
    const offer = ldNodes(P.ld).has(/^(Offer|AggregateOffer)$/i).some((o) => o.price != null || o.lowPrice != null || o.priceSpecification);
    R.add('schema', 'offer', 'Prices in structured data', 'No prices in structured data', offer ? 0.5 : 0, 0.5);
    R.step('pages', n ? plural(n, 'price') + ' readable on your pricing page' : 'No prices readable on your pricing page', n >= 2 ? 'good' : 'bad');
  }

  // a comparison page: is the comparison itself in the HTML?
  if (!want.compare) R.add('content', 'comparepage', '', 'No comparison page to read', 0, 1);
  else if (!cp || !cp.P) R.skip('content', 'comparepage', 'your comparison page did not load for us');
  else { const w = cp.P.words; R.add('content', 'comparepage', 'Comparison page readable without JavaScript (' + num(w) + ' words' + (cp.P.tables ? ', with a table' : '') + ')', 'A comparison page has only ' + plural(w, 'word') + ' without JavaScript', w >= 400 ? 1 : w >= 150 ? 0.5 : 0, 1); }

  // blog: if we were given the blog index, follow it to a post
  if (bl && bl.P && !POST_PATH.test(new URL(bl.r.url).pathname)) {
    const here = new URL(bl.r.url), root = here.pathname.replace(/\/+$/, '') + '/';
    const post = bl.P.links.map((l) => { try { return new URL(l.href, here); } catch (e) { return null; } }).filter(Boolean)
      .find((u) => sameSite(u.hostname.replace(/^www\./, ''), domain) && u.pathname.indexOf(root) === 0 && u.pathname.length > root.length + 8 && !/\/(page|category|categories|tag|tags|author|authors|topics?)\//.test(u.pathname));
    bl = post ? await open(post.href) : { r: bl.r, P: null };
  }
  if (!want.blog) { R.add('page', 'postnojs', '', 'No blog post to read', 0, 1); R.add('schema', 'article', '', 'No blog post to check for Article schema', 0, 1); R.add('content', 'byline', '', 'No blog post to check for an author and a date', 0, 1); }
  else if (!bl || !bl.P) { ['page:postnojs', 'schema:article', 'content:byline'].forEach((k) => R.skip(k.split(':')[0], k.split(':')[1], 'no blog post loaded for us')); }
  else {
    const P = bl.P, L = ldNodes(P.ld), art = L.has(/^(Article|BlogPosting|NewsArticle|TechArticle)$/i)[0] || null;
    R.add('page', 'postnojs', 'Blog posts readable without JavaScript (' + num(P.words) + ' words)', 'A blog post has only ' + plural(P.words, 'word') + ' without JavaScript', P.words >= 300 ? 1 : P.words >= 120 ? 0.5 : 0, 1);
    const hasAuthor = !!(art && art.author && (typeof art.author === 'string' || [].concat(art.author).some((a) => a && (a.name || typeof a === 'string'))));
    const hasDate = !!(art && (art.datePublished || art.dateModified));
    R.add('schema', 'article', 'Blog posts carry Article schema with author and date', !art ? 'Blog posts have no Article schema' : 'Article schema is missing ' + (!hasAuthor && !hasDate ? 'the author and the date' : !hasAuthor ? 'the author' : 'the date'), art && hasAuthor && hasDate ? 1 : art ? 0.5 : 0, 1);
    const visibleDate = hasDate || P.times.length > 0 || !!P.meta['article:published_time'] || !!P.meta['article:modified_time'];
    const named = hasAuthor || !!(P.meta.author || P.meta['article:author']) || /\b(by|written by|author)\b:?\s+[A-Z][a-z]+/.test(P.text.slice(0, 4000));
    R.add('content', 'byline', 'Blog posts name an author and a date', !named && !visibleDate ? 'Blog posts show no author and no date' : !named ? 'Blog posts name no author' : 'Blog posts carry no date', named && visibleDate ? 1 : named || visibleDate ? 0.5 : 0, 1);
  }

  // about: does the company say who is behind it?
  if (!want.about) R.add('entity', 'aboutpeople', '', 'No about page to say who is behind the company', 0, 1.5);
  else if (!ab || !ab.P) R.skip('entity', 'aboutpeople', 'your about page did not load for us');
  else {
    const P = ab.P, people = ldNodes(P.ld).has(/^Person$/i).length > 0 || /\b(founder|co-?founder|ceo|chief executive|leadership|our team|meet the team|founded (in|by))\b/i.test(P.text);
    R.add('entity', 'aboutpeople', 'About page names the people or the founding story', 'About page does not say who is behind the company', people ? 1.5 : 0, 1.5);
  }
  return R;
}

/* ---------- run one part ---------- */
export async function runPart(part, domain, opts = {}) {
  if (part === 'site') return partSite(domain);
  if (part === 'access') return partAccess(domain);
  if (part === 'entity') return partEntity(domain, opts.brand);
  if (part === 'pages') return partPages(domain, opts.pages || {}, !!opts.blind);
  throw new Error('unknown part');
}

/* ---------- put the parts together ---------- */
export function assemble(domain, blobs) {
  const byPart = {}; blobs.forEach((b) => { if (b && b.domain === domain && PARTS.indexOf(b.part) >= 0) byPart[b.part] = b; });
  const have = PARTS.filter((p) => byPart[p]);
  const extra = Object.assign({}, ...have.map((p) => byPart[p].extra || {}));
  const checks = have.flatMap((p) => byPart[p].checks || []);
  const live = checks.filter((c) => c.status !== 'skip');
  const got = live.reduce((a, c) => a + c.pts, 0), max = live.reduce((a, c) => a + c.max, 0);
  // no score when a whole part is missing or the homepage could not be read at all
  const partial = have.length < PARTS.length || !!extra.unreadable || max < 60;
  let score = partial ? null : Math.round(got / max * 100);
  if (score != null && extra.noindex) score = Math.min(score, 15);
  const grade = score == null ? '' : score >= 80 ? 'Strong' : score >= 55 ? 'Fair' : 'Weak';
  const n = { pass: 0, warn: 0, fail: 0, skip: 0 }; checks.forEach((c) => { n[c.status]++; });
  const probs = live.filter((c) => c.status !== 'pass');
  const name = extra.brand || labelOf(domain);
  const verdict = score == null ? (extra.unreadable ? 'Your homepage did not load for our check, so there is no overall score. A site that turns plain requests away can turn AI crawlers away too.' : 'Part of the check could not run for ' + domain + ' right now, so there is no overall score. Try again in a minute.') :
    score >= 80 ? name + ' is well set up for AI engines. ' + (probs.length ? plural(probs.length, 'check') + ' still ' + (probs.length === 1 ? 'needs' : 'need') + ' work.' : 'Every check passed.') :
    score >= 55 ? name + ' is readable, but AI engines are working from thin material. ' + plural(probs.length, 'check') + ' need work.' :
    'AI engines have little to go on for ' + name + '. ' + probs.length + ' of ' + live.length + ' checks failed or need work.';
  const categories = CATS.map((c) => {
    const mine = checks.filter((x) => x.cat === c.id), on = mine.filter((x) => x.status !== 'skip');
    const s = on.reduce((a, x) => a + x.pts, 0), m = on.reduce((a, x) => a + x.max, 0);
    const order = { fail: 0, warn: 1, skip: 2, pass: 3 };
    const rows = mine.slice().sort((x, y) => order[x.status] - order[y.status] || (y.max - y.pts) - (x.max - x.pts)).map((x) => ({ s: x.status, lost: round1(x.max - x.pts), w: Math.max(28, Math.min(92, 24 + x.label.length)) }));
    return { id: c.id, label: c.label, short: c.short, rows, score: on.length ? Math.round(s) : null, max: Math.round(m), pass: mine.filter((x) => x.status === 'pass').length, warn: mine.filter((x) => x.status === 'warn').length, fail: mine.filter((x) => x.status === 'fail').length, skip: mine.filter((x) => x.status === 'skip').length };
  });
  const top = probs.slice().sort((a, b) => (b.max - b.pts) - (a.max - a.pts));
  // the one-line teaser: what AI cannot tell a buyer, never which check failed
  const seen = {}, gaps = [];
  top.forEach((x) => { const p = GAP[x.key]; if (p && !seen[p] && gaps.length < 3) { seen[p] = 1; gaps.push(p); } });
  const ratio = (id) => { const c = categories.filter((x) => x.id === id)[0]; return c && c.max ? c.score / c.max : 0; };
  const lead = extra.unreadable ? 'Your homepage did not load for our check.' : ratio('crawl') >= 0.8 ? (ratio('page') >= 0.8 ? 'AI can reach and read your site.' : 'AI can reach your site.') : 'Some AI crawlers cannot reach your site.';
  return {
    domain, brand: name, checkedAt: new Date().toISOString(), score, grade, partial, verdict, categories, counts: n, total: checks.length,
    lead, gaps, topGaps: top.slice(0, 3).map((x) => ({ cat: x.cat, lost: round1(x.max - x.pts) })), quote: extra.quote || '',
    checks: checks.map((x) => ({ cat: x.cat, key: x.key, status: x.status, label: x.label, pts: x.pts, max: x.max })),
    topIssues: top.slice(0, 5).map((x) => x.label)
  };
}
// what the browser may see before an email unlocks the rest
export function teaserView(full) {
  const { checks, topIssues, ...rest } = full;
  return rest;
}
export function textReport(s) {
  const L = [];
  L.push('AI visibility report for ' + s.domain);
  L.push(s.score == null ? 'Score: not available (part of the check could not run)' : 'Score: ' + s.score + '/100 (' + s.grade + ')');
  L.push('');
  s.categories.forEach((c) => {
    L.push(c.label.toUpperCase() + (c.score != null ? '  ' + c.score + '/' + c.max : '  not checked'));
    s.checks.filter((x) => x.cat === c.id).forEach((x) => { L.push('  ' + (x.status === 'pass' ? '[ok]  ' : x.status === 'warn' ? '[weak]' : x.status === 'skip' ? '[--]  ' : '[x]   ') + x.label); });
    L.push('');
  });
  if (s.topIssues && s.topIssues.length) { L.push('BIGGEST GAPS'); s.topIssues.slice(0, 3).forEach((t, i) => { L.push('  ' + (i + 1) + '. ' + t); }); L.push(''); }
  L.push(s.verdict); L.push('');
  L.push('What to fix first, and in what order, is what we cover in your free session: ' + ORIGIN + '/#book');
  L.push(''); L.push('Fourward · one marketing team for B2B SaaS');
  return L.join('\n');
}

/* ---------- email: light checks that keep typos and throwaway inboxes out ---------- */
const THROWAWAY = new Set('mailinator.com guerrillamail.com guerrillamail.net sharklasers.com grr.la 10minutemail.com 10minutemail.net tempmail.com temp-mail.org temp-mail.io tempmailo.com throwawaymail.com yopmail.com yopmail.net trashmail.com getnada.com nada.email maildrop.cc dispostable.com fakeinbox.com mailnesia.com mintemail.com moakt.com mytemp.email tempail.com emailondeck.com spamgourmet.com mailcatch.com inboxkitten.com tmpmail.org tmpmail.net burnermail.io mohmal.com fakemail.net tempr.email discard.email mailsac.com harakirimail.com getairmail.com minuteinbox.com 1secmail.com 1secmail.org 1secmail.net emltmp.com tmail.ws dropmail.me example.com example.org test.com email.com'.split(' '));
const TYPOS = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com', 'gmaill.com': 'gmail.com', 'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmail.co': 'hotmail.com', 'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yahoo.co': 'yahoo.com', 'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.con': 'outlook.com', 'outlook.co': 'outlook.com', 'icloud.con': 'icloud.com', 'icloud.co': 'icloud.com' };
export async function checkEmail(raw, { dns = true } = {}) {
  const email = String(raw || '').trim();
  if (email.length > 254 || !/^[^\s@<>()",;:\\]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email)) return { ok: false, error: 'Enter a valid email address.' };
  const at = email.lastIndexOf('@'), host = email.slice(at + 1).toLowerCase(), local = email.slice(0, at);
  if (TYPOS[host]) return { ok: false, error: 'Did you mean ' + local + '@' + TYPOS[host] + '?', suggest: local + '@' + TYPOS[host] };
  if (THROWAWAY.has(host)) return { ok: false, error: 'Please use an email address you check, so the report reaches you.' };
  if (dns) {
    // a domain that cannot receive mail is a typo or a fake; if the lookup itself fails we let the address through
    const q = async (type) => { const r = await http('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(host) + '&type=' + type, { accept: 'application/dns-json', ms: 2500, max: 20000 }); if (!r.ok) return null; try { return JSON.parse(r.text); } catch (e) { return null; } };
    const mx = await q('MX');
    if (mx && mx.Status === 3) return { ok: false, error: 'That email domain does not exist. Check the spelling.' };
    if (mx && mx.Status === 0 && !(mx.Answer || []).some((a) => a.type === 15)) { const a = await q('A'); if (a && a.Status === 0 && !(a.Answer || []).length) return { ok: false, error: 'That email domain cannot receive mail. Check the spelling.' }; }
  }
  return { ok: true, email: local + '@' + host };
}
// a first name from the address, for the greeting; "there" when the mailbox is a role or unclear
const ROLE = new Set('info hello hi hey team sales support admin contact marketing growth office mail me founders founder ceo cto cmo hr jobs careers press billing accounts help noreply no-reply webmaster seo dev test user contactus enquiries inquiries business partners partnerships social media pr ops operations finance legal privacy security it tech web'.split(' '));
export function nameFromEmail(email) {
  const first = String(email).split('@')[0].split(/[._+\-0-9]/)[0].toLowerCase();
  return /^[a-z]{2,15}$/.test(first) && !ROLE.has(first) ? first.charAt(0).toUpperCase() + first.slice(1) : 'there';
}

/* ---------- leads: the report email and the sheet row go through the same Apps Script the site already uses ---------- */
async function postLead(payload) {
  try {
    const r = await fetch(LEAD_URL, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow' });
    const j = await r.json(); return !!(j && j.ok);
  } catch (e) { return false; }
}
async function sendLead(full, email, meta, send) {
  const base = { page: meta.page || TOOL_URL, referrer: meta.referrer || '', tz: meta.tz || '', lang: meta.lang || '', ua: meta.ua || '', ts: new Date().toISOString() };
  const note = 'AI check · ' + full.domain + (full.score != null ? ' · ' + full.score + '/100' : ' · partial');
  if (send) {
    const ok = await postLead({ ...base, type: 'report', name: nameFromEmail(email), email, company: full.brand, domain: full.domain, brand: full.brand, score: full.score, grade: full.grade, verdict: full.verdict,
      categories: full.categories.map((c) => ({ id: c.id, label: c.label, score: c.score, max: c.max })), checks: full.checks.map((x) => ({ cat: x.cat, key: x.key, status: x.status === 'skip' ? 'warn' : x.status, label: x.label, pts: x.pts, max: x.max, fix: '' })),
      topIssues: full.topIssues, textReport: textReport(full), source: 'gate' });
    if (ok) return 'sent';
    // the report email could not go out (daily limit or a hiccup): still keep the lead
    return (await postLead({ ...base, type: 'subscribe', email, source: note + ' · report email not sent' })) ? 'logged' : 'failed';
  }
  return (await postLead({ ...base, type: 'subscribe', email, source: note })) ? 'logged' : 'failed';
}
// a small per-visitor limit on unlocks, kept in the edge cache (best effort)
async function tooMany(request, bucket, limit, seconds) {
  let cache = null; try { cache = caches.default; } catch (e) { return false; }
  const ip = request.headers.get('cf-connecting-ip') || ''; if (!cache || !ip) return false;
  const key = new Request(ORIGIN + '/__aicheck-rl/' + bucket + '/' + encodeURIComponent(ip));
  try {
    const hit = await cache.match(key); const n = hit ? Number(await hit.text()) || 0 : 0;
    if (n >= limit) return true;
    await cache.put(key, new Response(String(n + 1), { headers: { 'Cache-Control': 'public, max-age=' + seconds } }));
  } catch (e) {}
  return false;
}

/* ---------- HTTP handlers ---------- */
export async function onRequestGet(context) {
  const { request, env } = context, u = new URL(request.url);
  const domain = cleanDomain(u.searchParams.get('domain')), part = String(u.searchParams.get('part') || '');
  if (!domain) return json({ ok: false, error: 'Enter a website like yourcompany.com' }, 400);
  if (PARTS.indexOf(part) < 0) return json({ ok: false, error: 'Unknown part' }, 400);
  const brand = String(u.searchParams.get('brand') || '').slice(0, 60);
  const pages = { pricing: u.searchParams.get('pricing') || '', blog: u.searchParams.get('blog') || '', about: u.searchParams.get('about') || '', compare: u.searchParams.get('compare') || '' }, blind = u.searchParams.get('blind') === '1';
  // the same part for the same site is reused for three minutes
  let cache = null; try { cache = caches.default; } catch (e) {}
  const key = new Request(ORIGIN + '/__aicheck/v' + VERSION + '/' + part + '/' + domain + '?b=' + encodeURIComponent(brand) + '&p=' + encodeURIComponent(pages.pricing + '|' + pages.blog + '|' + pages.about + '|' + pages.compare + '|' + (blind ? 1 : 0)));
  if (cache) { try { const hit = await cache.match(key); if (hit) return new Response(hit.body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'X-Fw-Cache': 'hit' } }); } catch (e) {} }
  let body;
  try { body = await teaserOf(await runPart(part, domain, { brand, pages, blind }), env); }
  catch (e) { return json({ ok: false, part, error: 'This part of the check failed. Try again in a minute.' }, 502); }
  if (cache) { try { context.waitUntil(cache.put(key, new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=180' } }))); } catch (e) {} }
  return json(body);
}

export async function onRequestPost(context) {
  const { request, env } = context;
  let b; try { b = await request.json(); } catch (e) { return json({ ok: false, error: 'Bad request' }, 400); }
  const domain = cleanDomain(b && b.domain), action = String((b && b.action) || '');
  if (!domain || !Array.isArray(b.sealed) || b.sealed.length > 8) return json({ ok: false, error: 'Bad request' }, 400);
  const blobs = (await Promise.all(b.sealed.map((s) => unseal(s, env)))).filter((x) => x && x.v === VERSION && x.domain === domain && Date.now() - x.ts < 2 * 864e5);
  if (!blobs.length) return json({ ok: false, error: 'This check has expired. Run it again.', expired: true }, 410);
  const full = assemble(domain, blobs);
  const host = new URL(request.url).hostname, live = LIVE_HOSTS.indexOf(host) >= 0 && !b.dry;
  const meta = { page: String((b.meta && b.meta.page) || '').slice(0, 300), referrer: String((b.meta && b.meta.referrer) || '').slice(0, 300), tz: String((b.meta && b.meta.tz) || (request.cf && request.cf.timezone) || '').slice(0, 60), lang: String((b.meta && b.meta.lang) || '').slice(0, 20), ua: (request.headers.get('user-agent') || '').slice(0, 300) };

  if (action === 'summary') {
    // every finished check is logged once (the browser decides when: once per site per 12 hours)
    if (b.log && live) context.waitUntil(postLead({ type: 'check', domain, brand: full.brand, score: full.score, grade: full.grade, partial: full.partial, topIssues: full.topIssues, ...meta, ts: new Date().toISOString() }));
    return json({ ok: true, result: teaserView(full) });
  }
  if (action === 'unlock') {
    if (b.website) return json({ ok: false, error: 'Could not unlock. Try again.' }, 400);          // honeypot
    if (await tooMany(request, 'unlock', 12, 600)) return json({ ok: false, error: 'Too many tries. Give it a few minutes.' }, 429);
    const v = await checkEmail(b.email);
    if (!v.ok) return json({ ok: false, error: v.error, suggest: v.suggest || '' }, 422);
    const send = !!b.send;
    let mail = send ? 'dry' : 'quiet';                       // nothing leaves a preview, localhost or a ?dryrun=1 run
    if (live) { const p = sendLead(full, v.email, meta, send); context.waitUntil(p.catch(() => {})); mail = send ? 'sending' : 'logged'; }
    return json({ ok: true, email: v.email, mail, result: full });
  }
  return json({ ok: false, error: 'Unknown action' }, 400);
}
