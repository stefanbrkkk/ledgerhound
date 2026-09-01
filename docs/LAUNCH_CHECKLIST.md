# LAUNCH CHECKLIST — Ledgerhound

## A. Ship-blocking (do these, in order)
- [ ] Fill legal placeholders `[LEGAL ENTITY NAME]`, `[MB]`, `[PIB]`, `[REGISTERED ADDRESS]` in: index.html footer, privacy.html, terms.html, refund.html
- [ ] Serbian advisor sanity pass on terms/refund/imprint (structure done; see legal_foundations.md)
- [ ] Buy domain: ledgerhound.app (free per RDAP Aug 31 2026; .io / .co.uk fallback)
- [x] Site pushed to the project repository
- [x] DEPLOYED: https://ledgerhound-tau.vercel.app (public; API intake live; project `ledgerhound` under stefanbrkkk)
- [ ] Optional now: add RESEND_API_KEY + NOTIFY_EMAIL env vars in Vercel dashboard (free resend.com account) → request notifications land in your inbox
- [ ] Name risk flagged: an unrelated crypto product "LedgerHound" exists (ledgerhound.vercel.app) — decide keep vs rename before heavy branding spend
- [ ] Point domain at deployment; verify HTTPS + HSTS
- [ ] Set FORM_ENDPOINT in assets/js/app.js (Formspree) — otherwise founding requests only queue locally
- [ ] Create Polar founding checkout ($349/yr) + paste link into launch-kit outreach + (optionally) founding tier CTA
- [ ] Send a real test request through the form; confirm it reaches you

## B. 7-day validation gate (Sept 1–7) — BEFORE spending on ads/anything
- [ ] 10 named firms contacted (script in launch-kit/outreach.md)
- [ ] 25+ Mom-Test conversations logged (hours chasing, current spend)
- [ ] Kill thresholds checked — ANY one = stop:
  - <3 of 10 named firms pre-pay
  - <25% report present-tense 3+ hrs/wk chasing
  - >60% of interested say "my portal does this"
  - pre-payers demand OAuth instead of forward-in
  - <2 unsolicited demo requests by day 7
- [ ] If gate passes: 3+ founding pre-pays = $1,047 = build sprint funded
- [ ] If gate fails: run PlateCost protocol before building anything

## C. Week-2 (post-gate, pre-build)
- [ ] Announce founding cohort in the same communities (waitlist open)
- [ ] llms.txt + FAQ are live — verify AI crawlers (GPTBot etc.) can fetch /robots.txt
- [ ] Set up weekly review of queued requests (localStorage queue is per-visitor — the FORM_ENDPOINT replaces it)

## D. Definition of "launched"
- [ ] Site live on ledgerhound.app with real imprint
- [ ] Checkout live
- [ ] 3 founding pre-pays cleared (September goal = $1,047)
- [ ] v1 build sprint started (onboarding target: October 2026)
