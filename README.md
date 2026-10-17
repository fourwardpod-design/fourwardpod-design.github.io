# Fourward website

Live at **https://fourwardpod-design.github.io/** (GitHub Pages, served from the `main` branch of `fourwardpod-design/fourwardpod-design.github.io`). To publish a change, commit and push to `main`; Pages rebuilds in about a minute.

Static site, no build step. Open `index.html` or serve the folder:

```bash
node ../tools/serve.js . 4174
```

## Files

- `index.html` — the homepage (hero, lane showcase, trusted-by wall, services, numbers, work, team cards, process, booking calendar, footer)
- `css/site.css` — design system: white ground, hairline grid, Inter Tight / Inter / JetBrains Mono, gold accent, lane colours as small markers
- `js/site.js` — nav, tabs, reveal, hanging team cards, booking calendar
- `assets/logos/` — monochrome client logos (`manifest.json` lists sources); raw originals in `assets/logos/raw/`
- `assets/team/` — team portraits; `assets/qr/` — LinkedIn QR codes; `assets/proof/` — screenshots used as evidence

## Things to swap in

1. **Portraits.** Only Deepak's photo is in. For the other three, add a portrait (face in the upper third; a cut-out on a plain pastel ground matches the reference best) to `assets/team/` and replace the `<div class="tm-fallback">S</div>` placeholder inside that card's `.tm-portrait` with `<img src="assets/team/sharang.jpg" alt="Sharang Misri">`. Do the same for the small round avatar on the card back (`.tm-avatar`). The tile colours behind the initials are the reference's four (`#D0A2D3`, `#DBD3E6`, `#E9BE76`, `#DCD5E9`).

   The team section is a measured rebuild of the "Hanging Team" component (cord curve, 1.15px wires, 18px eyelets, 268×376 cards, Inter 400 type, holographic back). Desktop: hovering a card lights the sheen, tilts it up to ±9°, pushes it on its wire and flips it; leaving flips it back; clicking toggles. Touch: tap to flip, swipe the row. The physics live at the top of the team block in `js/site.js` (`K_SWAY`, `C_SWAY`, `K_TILT`, `C_TILT`, `MAX_GLOW`). Location lines say "India"; edit per person in `index.html`.
2. **Booking link.** The calendar works without a backend: a visitor picks a slot and "Request this time" opens an email to all four of you with the proposed time, plus a Google Calendar invite link. If you set up Cal.com or Calendly, paste the link into `bookingUrl` at the top of `js/site.js` and the button sends people there instead.
3. **Working hours.** `workStart`, `workEnd`, `slotMin`, `daysAhead` and `leadHours` are at the top of `js/site.js`. Times are defined in India time and shown in the visitor's zone.
4. **Logos.** The wall shows 12. `dextr.svg` is in the folder but not placed. Hirect's file came from a small source and is slightly soft; replace it when a sharper file is available. Zelto has no usable logo (the domain now belongs to another company).

## Lead capture and report emails

Every finished check, every report request and every calendar booking is sent through `fwSend()` in `js/site.js`:

- **Live since 17 Oct 2026.** Sheet: "Fourward leads" (https://docs.google.com/spreadsheets/d/1L_crfYf97khTdndtTgyO1m-_OBM8pmkzT2pbizAibY0) on fourwardpod@gmail.com, with Checks, Reports and Bookings tabs. Script project: "Fourward leads" at https://script.google.com/home/projects/17MbSz3JJgfI-C2tfzXtQRRHHQ6IhGPGOHiUzXaOOvxQR3hw5fwkfilSZ/edit (standalone, writes to the sheet by `SHEET_ID`). To change the script: edit there, then Deploy → Manage deployments → Edit → Version: New version, so the `/exec` URL stays the same.
- **`server/leads.gs`** is the source of that web app on the Fourward Gmail. It logs checks, reports and bookings to a Google Sheet (one tab each) and emails the visitor a formatted HTML report from fourwardpod@gmail.com, with a copy to the team. Deploy steps are at the top of the file (about five minutes); paste the `/exec` URL into `leadUrl` in `js/site.js`.
- **Until then: FormSubmit.** With `leadUrl` empty, payloads go to formsubmit.co for `formTo` (fourwardpod@gmail.com). Each check and booking arrives as an email to that inbox, and a report request also emails the visitor a plain-text copy of their report. FormSubmit needs a one-time activation: the first submission sends an "Activate form" email to fourwardpod@gmail.com; click it once.
- `?dryrun=1` on any page URL records payloads in `window.__fwSent` instead of sending them, for testing.

## The AI visibility check (hero)

The card in the hero runs live checks in the visitor's browser, no server involved: the site's own HTML (title, description, H1, Open Graph, JSON-LD and Organization schema) via r.jina.ai, robots.txt rules for GPTBot, PerplexityBot, Google-Extended and ClaudeBot, llms.txt, and the entity record the engines lean on (Wikipedia, then DuckDuckGo). It scores the domain out of 100 and quotes the most machine-readable sentence it found. `?check=domain.com` runs it on load.

Results are cached in the visitor's browser for 24 hours per domain. The page fetcher (r.jina.ai) limits anonymous callers per domain; when it is busy the card falls back to Microlink for the title, description and logo and marks the rest "not checked right now" instead of scoring. A free key from jina.ai pasted into `jinaKey` in `js/site.js` removes that limit.

The literal engine answers ("what ChatGPT says") need API keys, so they live in `server/ai-check-worker.js`, a Cloudflare Worker you deploy once with your OpenAI, Perplexity and Gemini keys. Paste its URL into `aiCheckUrl` at the top of `js/site.js` and three "X says" cards appear under the checks, each flagged with whether the answer names the brand.

## The Talk bar

The floating pill at the bottom (modelled on Conduit's composer) has no backend. It answers the usual questions with short replies that point at the section carrying the proof, and hands anything else to the team by email with the message pre-filled. The intents and answers are the `answers` list in the Talk block of `js/site.js`; add a line there to teach it a new question. The mic uses the browser's own speech recognition (Chrome, Edge, Safari) and hides itself elsewhere. To connect a real assistant later, replace the `reply()` function with a fetch to your endpoint.

## URL switches (for screenshots and QA)

- `?talk=Your+question` — opens the Talk sheet with that question asked

- `?static=1` — reveal everything at once, no scroll animations
- `?flip=2,3` — pre-flip team cards by number
