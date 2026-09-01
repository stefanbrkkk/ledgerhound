# Ledgerhound — website handoff

The marketing site for Ledgerhound: *the Monday chase list for bookkeepers.*
Forward the messy client threads once a week; the product reads what arrived,
diffs it against each client's checklist, and returns a chase list plus
ready-to-send nudge drafts. The human presses send.

---

## Stack

Static HTML, CSS and JavaScript. **No build step, no framework, no bundler** —
what is in the repo is what ships.

| Path | What it is |
|---|---|
| `index.html` | The whole landing page, including JSON-LD structured data |
| `styles.css` | Design system + every component. Organised in seven numbered sections |
| `assets/js/app.js` | Motion, the scroll-driven device, marquee, forms |
| `assets/js/demo.js` | The interactive demo engine (pure client-side, no API) |
| `assets/js/vendor/` | GSAP + ScrollTrigger, self-hosted |
| `assets/fonts/` | Bricolage Grotesque, Figtree, JetBrains Mono — OFL variable faces |
| `api/request.js` | Vercel serverless intake for founding requests |
| `privacy · terms · refund · security .html` | Legal + trust pages |
| `tools/serve.js` | Local server that applies the real production headers |
| `tests/` | The verification suite (see below) |
| `docs/` | This file, the launch checklist, the outreach kit — not deployed |

## Run it locally

```bash
npm install          # dev tooling only; the site itself has no dependencies
npm run serve        # http://127.0.0.1:8123
```

`tools/serve.js` deliberately mirrors production: it applies the headers from
`vercel.json` (including the strict Content-Security-Policy), resolves clean
URLs, and serves `404.html` for unknown paths. Testing against a plain static
server hides CSP failures, so always use this one.

## Verify it

```bash
npm run lint         # html-validate + stylelint + eslint
npm test             # lint + accessibility + end-to-end
npm run verify       # everything, three times over
```

| Suite | Covers |
|---|---|
| `tests/a11y.mjs` | axe-core (WCAG 2.1/2.2 A + AA) on every page at desktop and mobile, in both motion modes; keyboard order; skip link; focus indicators; target sizes; the pausable marquee; focus handling on the demo gate |
| `tests/e2e.mjs` | Every link and anchor; the full demo flow including the gate and persistence; the request form's success and failure paths; the API contract; and the four degraded modes — no JavaScript, blocked vendor scripts, reduced motion, and deep links |
| `tests/visual.mjs` | No horizontal overflow at 15 widths from 320 to 2560; all six font faces load; every font size resolves to a scale token; the scroll rig plays its full range; cumulative layout shift |

`npm run verify` runs all of it three times and prints a per-run summary, so
flakiness surfaces instead of passing once by luck.

## Two conventions worth knowing

**1. The stylesheet renders the finished page; JavaScript opts in to motion.**
`app.js` adds `js-motion` to `<html>` only after confirming GSAP loaded and the
visitor has not asked for reduced motion. Only then do the hide-then-reveal
rules in `styles.css` §4 apply. Nothing is hidden by default, so no-JS, a
blocked script, or a scroll trigger that never fires cannot strand content
invisible. **If you add an entrance animation, follow this pattern** — put the
resting state in CSS and animate from it, never the reverse.

**2. The Content-Security-Policy forbids inline styles and scripts.**
`style-src 'self'` means a `style="..."` attribute silently does nothing in
production. Use a class. The same applies to inline `<script>` and `<style>`
blocks. `npm test` runs against the real policy and will catch violations.

## Deploying

The site is configured for **Vercel** (`vercel.json`: clean URLs, security
headers, cache policy). `.vercelignore` keeps `docs/`, `tests/`, `tools/` and
the tooling config out of the deployment.

`_headers` and `_redirects` are **Cloudflare Pages / Netlify** formats. Vercel
ignores them; they exist so the site deploys unchanged on those hosts too. If
you change the security headers, change them in both places.

## Before launch — owner checklist

Placeholders are written as `[LIKE THIS]` so they are impossible to miss.
Fill every one:

| Placeholder | Appears in |
|---|---|
| `[LEGAL ENTITY NAME]` | index footer, privacy, terms, refund, security, llms.txt |
| `[MB]` · `[PIB]` | index footer, privacy, terms, refund, security |
| `[REGISTERED ADDRESS]` | index footer, privacy, terms, refund, security, llms.txt |
| `[MERCHANT OF RECORD LEGAL NAME]` | terms, refund, privacy, llms.txt |
| `[HOSTING PROVIDER]` | security |

```bash
grep -rn '\[[A-Z][A-Z ]*\]' *.html llms.txt     # lists every remaining one
```

Then:

1. Buy the domain and point it at the deployment; the site's canonical URLs and
   sitemap already assume `https://ledgerhound.app/`. If you ship on a different
   domain, update `<link rel="canonical">` and the `og:url` in `index.html`, the
   URLs in `sitemap.xml`, `robots.txt`, `llms.txt` and `.well-known/security.txt`.
2. Have a Serbian advisor review the imprint, terms and refund policy. The
   structure is complete; the wording is not legal advice.
3. Set `RESEND_API_KEY` and `NOTIFY_EMAIL` in the Vercel dashboard so founding
   requests reach your inbox. Without them the function still accepts requests
   and writes them to its log, and the browser keeps a local copy — but nothing
   is emailed to you.
4. Create the founding checkout and link it from the founding section.
5. Send a real request through the form and confirm it arrives.
6. A name check is worth doing: an unrelated product also uses "LedgerHound".

The commercial plan — validation gate, outreach scripts, kill thresholds — is in
`docs/LAUNCH_CHECKLIST.md` and `docs/launch-kit/`.
