# Ledgerhound — website + launch package

The Monday chase list for bookkeepers: forward the mess, get the chase list, send the nudges.

## Stack
- Static site: `index.html` + `styles.css` + `assets/js/{app,demo}.js` — no build step, no framework
- GSAP + ScrollTrigger self-hosted (`assets/js/vendor/`)
- Fonts self-hosted OFL: Bricolage Grotesque (display), Figtree (body), JetBrains Mono (functional)
- Demo: fully client-side, deterministic, zero API keys, zero upload
- Legal: privacy.html, terms.html, refund.html (placeholders marked `[___]`)
- Infra: `_headers` (Cloudflare Pages), `vercel.json` (Vercel headers + cleanUrls), `_redirects`, robots.txt, llms.txt, sitemap.xml, site.webmanifest, .well-known/security.txt

## Local preview
```
python3 -m http.server 8123   # from this folder
# open http://127.0.0.1:8123
```

## Deploy (Vercel, 2 minutes)
1. Done — the site is pushed to github.com/stefanbrkkk/ledgerhound (private).
2. Import → Framework preset "Other" → Deploy. `vercel.json` handles clean URLs + security headers.
3. Add your domain (ledgerhound.app) in Project → Settings → Domains.

## Before you launch — owner checklist
1. Fill every `[___]` placeholder: legal entity name, m.b., PIB, address (index footer + 3 legal pages).
2. Buy ledgerhound.app (RDAP-verified free Aug 31, 2026) and point it at the deployment.
3. Set `FORM_ENDPOINT` in `assets/js/app.js` (Formspree free tier) so founding requests actually reach you.
4. Create the Polar founding-plan checkout ($349) and link it from the founding section + outreach.
5. Legal pass: the imprint/disclaimer structure is done; have a Serbian advisor sanity-check before paid launch (see research/third-bet-20260831-1415/legal_foundations.md).
6. Optional analytics: none by default (no cookie banner needed). If adding Plausible/Umami, update privacy.html + add consent.

## QA
- Suite 1 + Suite 2: 94/94 green (console, e2e demo flow, gate, forms, axe WCAG 2.1 A/AA = 0 violations, contrast, tap targets, overflow 320–1920, reduced-motion, CLS/LCP, XSS probes, keyboard, no-JS, motion, asset checks)
- Screenshots in `qa/`
