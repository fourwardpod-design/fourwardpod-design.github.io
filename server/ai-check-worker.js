/**
 * Fourward · AI visibility check — engine answers
 *
 * A Cloudflare Worker that asks ChatGPT, Perplexity and Google (Gemini with Search grounding)
 * what they know about a domain, and tells the website whether the answer names the brand.
 * The website's hero check works without this; set FOURWARD.aiCheckUrl in js/site.js to the
 * deployed Worker URL and the three "X says" cards appear after the browser-side checks.
 *
 * Deploy (5 minutes):
 *   1. npm i -g wrangler && wrangler login
 *   2. wrangler init fourward-ai-check  → replace src/index.js with this file
 *   3. wrangler secret put OPENAI_API_KEY ; wrangler secret put PERPLEXITY_API_KEY ; wrangler secret put GEMINI_API_KEY
 *      (any one of the three is enough; missing engines return null)
 *   4. wrangler deploy  → copy the *.workers.dev URL into FOURWARD.aiCheckUrl
 *
 * Answers are cached for 24 hours per domain, so repeat checks cost nothing.
 */

const ALLOWED_ORIGINS = ['https://fourwardpod-design.github.io', 'http://localhost:4174'];
const PROMPT = (domain) => `In two sentences, what is ${domain} and who is it for? If you do not know the company, say so plainly.`;

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST {domain}' }, 405, cors);

    let domain = '';
    try { domain = String((await request.json()).domain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#\s]/)[0]; } catch (e) {}
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return json({ error: 'bad domain' }, 400, cors);

    const cache = caches.default;
    const cacheKey = new Request('https://fourward-ai-check.cache/' + domain);
    const hit = await cache.match(cacheKey);
    if (hit) { const body = await hit.text(); return new Response(body, { headers: { 'Content-Type': 'application/json', 'X-Cache': 'HIT', ...cors } }); }

    const brand = domain.split('.')[0];
    const mentions = (text) => text ? new RegExp(brand.replace(/[^a-z0-9]/g, ''), 'i').test(text.replace(/[^a-z0-9]/gi, '')) : null;

    const [chatgpt, perplexity, google] = await Promise.all([
      env.OPENAI_API_KEY ? askOpenAI(env.OPENAI_API_KEY, domain).catch(() => null) : null,
      env.PERPLEXITY_API_KEY ? askPerplexity(env.PERPLEXITY_API_KEY, domain).catch(() => null) : null,
      env.GEMINI_API_KEY ? askGemini(env.GEMINI_API_KEY, domain).catch(() => null) : null
    ]);
    const out = {
      domain,
      chatgpt: chatgpt && { text: chatgpt.text, sources: chatgpt.sources, mentions: mentions(chatgpt.text) },
      perplexity: perplexity && { text: perplexity.text, sources: perplexity.sources, mentions: mentions(perplexity.text) },
      google: google && { text: google.text, sources: google.sources, mentions: mentions(google.text) },
      checkedAt: new Date().toISOString()
    };
    const res = new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=86400', ...cors } });
    ctx.waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  }
};

function json(obj, status, headers) { return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...headers } }); }

// ChatGPT with web search (Responses API)
async function askOpenAI(key, domain) {
  const r = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4.1-mini', tools: [{ type: 'web_search_preview' }], input: PROMPT(domain) })
  });
  const j = await r.json();
  let text = '', sources = [];
  for (const item of j.output || []) if (item.type === 'message') for (const c of item.content || []) { if (c.type === 'output_text') { text += c.text; for (const a of c.annotations || []) if (a.url) sources.push(a.url); } }
  return { text: text.trim(), sources: [...new Set(sources)].slice(0, 5) };
}

// Perplexity (sonar), which always searches the live web
async function askPerplexity(key, domain) {
  const r = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: PROMPT(domain) }] })
  });
  const j = await r.json();
  return { text: (j.choices?.[0]?.message?.content || '').trim(), sources: (j.citations || []).slice(0, 5) };
}

// Gemini with Google Search grounding: the closest public proxy for what Google's AI answers say
async function askGemini(key, domain) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + key, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT(domain) }] }], tools: [{ google_search: {} }] })
  });
  const j = await r.json();
  const cand = j.candidates?.[0];
  const text = (cand?.content?.parts || []).map(p => p.text || '').join('').trim();
  const sources = (cand?.groundingMetadata?.groundingChunks || []).map(c => c.web?.uri).filter(Boolean).slice(0, 5);
  return { text, sources };
}
