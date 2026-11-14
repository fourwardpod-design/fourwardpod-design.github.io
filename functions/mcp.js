// Fourward MCP server: POST https://www.fourwardhq.com/mcp
// A remote Model Context Protocol server (Streamable HTTP, stateless, JSON responses, no auth) that exposes
// Fourward's two free tools to AI assistants such as Claude, ChatGPT, Cursor and VS Code:
//   check_ai_visibility  the 75-check AI visibility score from /tools/ai-visibility-check/ (problems and scores, never fixes)
//   check_ai_crawlers    the 20-bot robots.txt and firewall test from /tools/ai-crawler-checker/
// Both are read-only and only fetch public https://<hostname>/ URLs; IPs and internal names are refused.
// Nothing about a request is stored or logged; only the public result is cached by domain for 12 hours.
// The visibility check runs on the website's own engine (functions/api/ai-check.js); the crawler check mirrors js/crawler.js.

import { runPart, assemble, unseal, VERSION as CHECK_VERSION, CATS } from './api/ai-check.js';

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
    description: 'Scores how well AI search engines (ChatGPT, Claude, Perplexity, Gemini, Google AI Overviews) can reach, read and understand a website. Runs 75 checks in five groups: AI crawler access (robots.txt rules for 10 crawlers and a firewall test under five AI bot names), what pages tell machines without JavaScript, structured data, entity and authority (Wikipedia, Wikidata, review and social profiles, Reddit and Hacker News threads, brand search demand) and AI-ready content (readable prices, comparison and product pages, proof, docs, freshness). Returns a score out of 100, a grade, a score per group and every problem found, with the points it costs. Takes 10 to 30 seconds.',
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

/* ---------- tool 2: AI visibility check (the same engine as the website: functions/api/ai-check.js) ---------- */
// Each part of the check runs as its own request to this site when it can, so each has its own limits and the
// website's three-minute cache is shared. If that request fails, the part runs here instead.
async function getPart(ctx, part, domain, params) {
  if (ctx.origin && /^https:/.test(ctx.origin)) {
    try {
      const r = await withTimeout(fetch(ctx.origin + '/api/ai-check?' + new URLSearchParams({ domain, part, ...params }), { headers: { 'Accept': 'application/json', 'User-Agent': CHECKER } }), 45000);
      if (r.ok) { const j = await r.json(); const blob = j && j.ok ? await unseal(j.sealed, ctx.env) : null; if (blob) return { blob, hints: j.hints || {} }; }
    } catch (e) {}
  }
  const R = await runPart(part, domain, { brand: params.brand, pages: params, blind: params.blind === '1' });
  return { blob: { v: CHECK_VERSION, part, domain, ts: Date.now(), checks: R.checks, extra: R.extra }, hints: R.hints || {} };
}

async function visibilityCheck(domain, ctx) {
  ctx = ctx || {};
  const safe = (p) => p.catch(() => null);
  const [site, access] = await Promise.all([safe(getPart(ctx, 'site', domain, {})), safe(getPart(ctx, 'access', domain, {}))]);
  const h = (site && site.hints) || {}, pg = h.pages;
  const [entity, pages] = await Promise.all([
    safe(getPart(ctx, 'entity', domain, { brand: h.brand || '' })),
    safe(getPart(ctx, 'pages', domain, pg ? { pricing: pg.pricing || '', blog: pg.blog || '', about: pg.about || '', compare: pg.compare || '' } : { blind: '1' }))
  ]);
  const s = assemble(domain, [site, access, entity, pages].filter(Boolean).map((x) => x.blob));
  const lost = (x) => Math.round((x.max - x.pts) * 10) / 10;
  const probs = s.checks.filter((x) => x.status === 'warn' || x.status === 'fail').sort((a, b) => lost(b) - lost(a));
  const L = [];
  L.push('AI visibility check for ' + domain + (s.brand && alnum(s.brand) !== alnum(labelOf(domain)) ? ' (' + s.brand + ')' : ''));
  L.push(s.score == null ? 'Score: not available (part of the check could not run)' : 'Score: ' + s.score + '/100 (' + s.grade + ')');
  L.push(s.verdict);
  L.push('');
  s.categories.forEach((c) => {
    L.push(c.label.toUpperCase() + (c.score != null ? '  ' + c.score + '/' + c.max : '  not checked'));
    const mine = s.checks.filter((x) => x.cat === c.id);
    mine.filter((x) => x.status === 'warn' || x.status === 'fail').forEach((x) => L.push('  ' + (x.status === 'warn' ? '[weak] ' : '[x]    ') + x.label + '  (-' + lost(x) + ' pts)'));
    const skipped = mine.filter((x) => x.status === 'skip').length;
    if (mine.length) L.push('  ' + c.pass + ' of ' + mine.length + ' checks passed' + (skipped ? ', ' + skipped + ' not tested' : ''));
    L.push('');
  });
  if (probs.length) { L.push('BIGGEST GAPS'); probs.slice(0, 3).forEach((x, i) => L.push('  ' + (i + 1) + '. ' + x.label + ' (-' + lost(x) + ' pts)')); L.push(''); }
  if (s.quote) { L.push('What public knowledge sources say: "' + s.quote + '"'); L.push(''); }
  L.push('Every check, including the ones that passed, is in the structured result.');
  return {
    text: L.join('\n'),
    data: {
      domain, brand: s.brand, checkedAt: s.checkedAt, score: s.score, grade: s.grade, partial: s.partial, verdict: s.verdict,
      categories: s.categories.map((c) => ({ id: c.id, label: c.label, score: c.score, max: c.max })),
      checks: s.checks.map((x) => ({ category: x.cat, key: x.key, status: x.status === 'skip' ? 'not_tested' : x.status, result: x.label, points: x.pts, max: x.max })),
      biggestGaps: probs.slice(0, 3).map((x) => ({ problem: x.label, pointsLost: lost(x) })),
      knowledgeSummary: s.quote || null
    }
  };
}

/* ---------- JSON-RPC over Streamable HTTP ---------- */
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id: id == null ? null : id, error: { code, message } });

async function callTool(name, args, ctx) {
  const domain = cleanDomain(args && args.domain);
  if (!domain) return { content: [{ type: 'text', text: 'Pass a public website as a domain, for example "example.com".' }], isError: true };
  const key = ctx.origin + '/__mcp-cache/v3/' + name + '/' + domain; // bump the version when the result format changes
  let cache = null; try { cache = caches.default; } catch (e) {}
  if (cache) { try { const hit = await cache.match(key); if (hit) return await hit.json(); } catch (e) {} }
  const out = name === 'check_ai_crawlers' ? await crawlerCheck(domain) : await visibilityCheck(domain, ctx);
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
  const ctx = { waitUntil: (p) => { try { context.waitUntil(p); } catch (e) {} }, origin: new URL(request.url).origin, env: context.env };
  const batch = Array.isArray(body);
  const replies = (await Promise.all((batch ? body : [body]).map((m) => handle(m, ctx)))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202, headers: cors });
  return jsonRes(batch ? replies : replies[0]);
}

// exported for local tests (website-src/mcp-test.mjs)
export const _test = { handle, crawlerCheck, visibilityCheck, cleanDomain, evaluateBot, parseRobots };
