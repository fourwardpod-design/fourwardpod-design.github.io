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

## The Talk bar

The floating pill at the bottom (modelled on Conduit's composer) has no backend. It answers the usual questions with short replies that point at the section carrying the proof, and hands anything else to the team by email with the message pre-filled. The intents and answers are the `answers` list in the Talk block of `js/site.js`; add a line there to teach it a new question. The mic uses the browser's own speech recognition (Chrome, Edge, Safari) and hides itself elsewhere. To connect a real assistant later, replace the `reply()` function with a fetch to your endpoint.

## URL switches (for screenshots and QA)

- `?talk=Your+question` — opens the Talk sheet with that question asked

- `?static=1` — reveal everything at once, no scroll animations
- `?flip=2,3` — pre-flip team cards by number
