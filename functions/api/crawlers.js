// Cloudflare Pages Function: GET /api/crawlers?domain=example.com
// Fetches robots.txt and llms.txt server-side (no CORS limits), and runs a small firewall test:
// the homepage is requested as a normal browser and as four AI bots, and the status codes compared.
// Only https://<public hostname>/ paths are fetched; IPs, localhost and internal names are refused.

const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BOTS = {
  'GPTBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)',
  'OAI-SearchBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)',
  'ClaudeBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
  'PerplexityBot': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)'
};
const CHECKER = 'Mozilla/5.0 (compatible; FourwardCrawlerCheck/1.0; +https://fourward.pages.dev/tools/ai-crawler-checker/)';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });

function cleanDomain(raw) {
  const d = String(raw || '').trim().toLowerCase().replace(/^https?:\/\//, '').split(/[\/?#\s:]/)[0].replace(/\.$/, '');
  if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(d)) return '';
  if (/(^|\.)(localhost|local|internal|intranet|home|lan|corp)$/.test(d)) return '';
  return d;
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function getText(url) {
  try {
    const r = await withTimeout(fetch(url, { headers: { 'User-Agent': CHECKER, 'Accept': 'text/plain,*/*' }, redirect: 'follow' }), 9000);
    const text = (await r.text()).slice(0, 300000);
    return { status: r.status, url: r.url, type: r.headers.get('content-type') || '', text };
  } catch (e) {
    return { status: 0, error: String(e && e.message || e) };
  }
}

async function probe(url, ua) {
  try {
    const r = await withTimeout(fetch(url, { headers: { 'User-Agent': ua, 'Accept': 'text/html,*/*' }, redirect: 'follow' }), 9000);
    const mitigated = r.headers.get('cf-mitigated') || '';
    const server = r.headers.get('server') || '';
    try { r.body && r.body.cancel(); } catch (e) {}
    return { status: r.status, challenge: /challenge/i.test(mitigated), server };
  } catch (e) {
    return { status: 0, error: String(e && e.message || e) };
  }
}

export async function onRequestOptions() { return new Response(null, { status: 204, headers: cors }); }

export async function onRequestGet({ request }) {
  const u = new URL(request.url);
  const domain = cleanDomain(u.searchParams.get('domain'));
  if (!domain) return json({ ok: false, error: 'Enter a website like yourcompany.com' }, 400);
  const base = 'https://' + domain;
  const [robots, llms, browser, ...bots] = await Promise.all([
    getText(base + '/robots.txt'),
    getText(base + '/llms.txt'),
    probe(base + '/', BROWSER),
    ...Object.values(BOTS).map((ua) => probe(base + '/', ua))
  ]);
  const llmsFound = llms.status === 200 && !/html/i.test(llms.type) && !/^\s*</.test(llms.text || '') && (llms.text || '').trim().length > 0;
  const names = Object.keys(BOTS);
  return json({
    ok: true,
    domain,
    checkedAt: new Date().toISOString(),
    robots: { status: robots.status, url: robots.url || base + '/robots.txt', text: robots.status === 200 && !/html/i.test(robots.type) ? robots.text : '', error: robots.error || '' },
    llms: { found: llmsFound, status: llms.status },
    firewall: { browser, bots: names.map((n, i) => ({ bot: n, ...bots[i] })) }
  });
}
