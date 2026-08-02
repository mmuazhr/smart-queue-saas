# QueLess Landing Page Redesign — Audit + Plan

Date: 2026-08-02 · Branch: main · Scope: `src/app/page.tsx` + landing-only components. No auth, dashboard, or store customer flow changes.

---

## PHASE 1 — AUDIT REPORT (live page, localhost:3000)

Evidence: `.superpowers/landing-desktop-full.png`, `landing-desktop-hero.png`, `landing-mobile-full.png`, Lighthouse mobile run, Chrome perf trace.

### First impression (desktop 1440)
The site communicates "young Malaysian food-tech with energy". I notice the BM headline "Tukarkan Barisan Panjang Kepada Jualan." is genuinely strong and the satay-stall hero photo is real and local. Eye goes to: 1) headline, 2) hero photo, 3) orange CTA. That order is correct. One word: promising-but-empty. The page is a hero, six identical cards, and a footer. A merchant who scrolls looking for "how much?" or "how does it work?" finds nothing and leaves.

### Scores (0-10)

| Dimension | Score | Evidence |
|---|---|---|
| Visual hierarchy & hero impact | 6.5 | Split hero works; BM headline + real photo is the best asset on the page. But the "No hardware. No app download." tagline floats in a flex row beside the CTA (hero-stack violation), and the fake shimmer pill in the payment toast reads as broken UI. |
| Trust / social proof | 1 | Zero. No merchants, no stall types, no "built in Malaysia" signal beyond a footer tagline in 12px muted caps that fails WCAG contrast (Lighthouse flagged it). |
| Value proposition clarity (WHY) | 5 | Headline promises the outcome, but nothing after the hero backs it up. Features describe software ("Live Queue Logic", "PWA Native App" — developer words), not outcomes ("serve more customers with the same staff"). |
| Ease-of-use story (HOW) | 2 | "Set up in minutes" is the entire story. No how-it-works section. A pakcik at 11pm cannot picture what happens after he signs up. |
| CTA prominence & conversion path | 4 | Hero CTA is fine, then the path dies: no pricing, no repeat CTA, page ends at a legal footer. Two labels for the same intent ("Start Free Trial" in nav, "Get Started Free" in hero) — pick one. |
| Mobile UX | 6 | Clean collapse, 44px hamburger, readable type. But six stacked identical cards make the mobile page one long grey scroll, and `maximum-scale=1` blocks pinch-zoom (Lighthouse a11y fail). |
| Anti-slop check | 4 | The #1 AI tell is here: 3-column icon-card feature grid, icons in tinted squares, rainbow accent icons (orange/blue/green/amber/purple/rose — six accents on a one-accent brand), hover-scale on everything, Inter as the only face, an em-dash in visible copy. |
| Missing sections | 1 | **Nav links to `#pricing` but no pricing section exists — a dead anchor on the money question.** No how-it-works, no FAQ, no social proof, no final CTA, no promo anywhere. |

**Overall: 3.7/10 (C-).** The hero is a B; everything below it is missing or generic.

### Technical audit
- **Lighthouse (mobile):** A11y 88, Best Practices 92, SEO 100. Fails: muted-text contrast (footer/copyright), no `<main>` landmark, `maximum-scale=1` in viewport meta.
- **Perf trace:** LCP 123ms local, CLS 0.00. Real-world risk: hero image is the LCP element but lazy-loads (`fill` without `priority`/`sizes` — both flagged in console). On night-market 4G this will feel like the black box I caught in the first screenshot.
- **Trunk test:** PARTIAL (4/6) — site ID and options clear; "where am I in the scheme of things" fails because the page has no scheme.

---

## PHASE 2 — STRATEGY: NEW INFORMATION ARCHITECTURE

Design-review passes applied to this IA (ratings after fixes were folded in):
Pass 1 Info Arch 9/10 · Pass 2 States 8/10 (accordion + reduced-motion specified; page is static content otherwise) · Pass 3 Journey 9/10 · Pass 4 AI-slop 8/10 · Pass 5 Design System 8/10 (extends existing tokens; no DESIGN.md — deferred) · Pass 6 Responsive/a11y 9/10 · Pass 7: 3 decisions surfaced (bottom of file).

### The 30-second merchant journey (mobile, 11pm, tired)
1. **0-5s (hero):** "Free 7 days" badge + BM headline + one CTA → *"this is for people like me, and trying it costs nothing"*
2. **5-15s (why + how):** four outcome statements, then 3 pictures-first steps → *"I lose sales every Saturday… and this looks senang"*
3. **15-25s (pricing + promo):** real RM prices + RM10-off launch offer with spots left → *"cheaper than one lost customer a day, and there's a deal"*
4. **25-30s (FAQ skim + final CTA):** objections killed (no hardware, DuitNow, no customer app) → tap **Mula Percubaan Percuma**

### Section order (8 sections, ≥4 layout families)

| # | Section | Job | Layout family |
|---|---|---|---|
| 1 | **Hero** | Promise + promo badge + one CTA | Asymmetric split (keep, refine) |
| 2 | **Kenapa QueLess** (Why) | 4 business outcomes | Editorial 2-col: big statements left, supporting photo right — **no cards** |
| 3 | **Cara Guna** (How it works) | 3 steps in 10 seconds | Numbered horizontal flow (desktop) / vertical timeline (mobile), real product screenshot per step |
| 4 | **Features** | Compact reassurance | 2-col checklist rows with `divide-y` — kills the 3×2 card grid |
| 5 | **Pricing + Promo** | Money question + urgency | 3 tier columns + full-width promo band above them |
| 6 | **Trust strip** | "Untuk peniaga Malaysia" | Full-width band: stall types + DuitNow/WhatsApp/PWA facts (honest signals — no fabricated testimonials) |
| 7 | **FAQ** | Kill objections | Accordion (only new client component) |
| 8 | **Final CTA** | Repeat offer | Full-bleed orange gradient band |

### Copy deck (BM headline energy + EN clarity, zero em-dashes)

**Nav:** Ciri-ciri · Harga · FAQ · Sign In · [Mula Percubaan Percuma]

**1. Hero**
- Badge: `Percuma 7 Hari · Percubaan Penuh`
- H1: `Tukarkan Barisan Panjang Kepada Jualan.` (keep — it works)
- Sub (18 words): `Customers scan, order and pay from their own phone. No app, no hardware, no missed orders during rush.`
- CTA primary: `Mula Percubaan Percuma` · Secondary text link: `Lihat Harga ↓` (anchors #pricing)
- Payment toast on photo: keep, remove the fake shimmer pill.

**2. Kenapa QueLess** — H2: `Barisan panjang bunuh jualan anda.`
- `Pelanggan nampak line panjang, terus blah.` With QR ordering they order from anywhere in the market, no need to stand in line.
- `Serve lebih ramai, staff yang sama.` No one stuck taking orders; the counter just cooks and hands over food.
- `Zero order hilang waktu peak.` Every order is numbered, paid, and on your screen. Nothing shouted, nothing forgotten.
- `Jalan even bila WiFi pasar malam sangkut.` QueLess is a PWA built for spotty connections.

**3. Cara Guna** — H2: `Senang je. Tiga langkah.`
1. `Daftar, isi menu, print QR` — 10 minutes, from your phone. Lekat QR atas meja.
2. `Pelanggan scan dan bayar` — they browse your menu, pay with DuitNow, upload the receipt.
3. `Anda confirm, WhatsApp notify` — you confirm payment, the kitchen cooks, customer gets a WhatsApp when it's ready.

**4. Features** — H2: `Semua yang stall anda perlukan.` Six one-line rows (QR menu percuma · DuitNow tanpa gateway fee · Nombor giliran automatik · WhatsApp bila siap · Sales report harian · Install macam app, no download). Copy is merchant-language, not "Live Queue Logic".

**5. Pricing** — H2: `Harga jujur. Tak ada caj tersembunyi.` (DECIDED 2026-08-02: single price, no tier grid)
- One price card: `RM69` struck through → **RM59/bulan** with `untuk 6 bulan pertama` note. The RM10 slash IS the launch promo.
- Promo copy: `⚡ 5 peniaga pertama: RM10 diskaun/bulan selama 6 bulan` + `3 daripada 5 slot masih ada` + `Percuma 7 hari dulu, tak perlu kad kredit.`
- 4-5 plain inclusion bullets (semua ciri, unlimited orders, WhatsApp alerts, cancel bila-bila) + CTA.

**6. Trust strip** — H2: `Dibina di Malaysia, untuk peniaga Malaysia.`
- Row: `Gerai tepi jalan · Pasar malam · Food truck · Warung`
- Facts: DuitNow-native (bayaran terus masuk akaun anda) · WhatsApp-native · Data anda, akaun anda.

**7. FAQ** (6): Berapa lama nak setup? / Macam mana pelanggan bayar? / Kena beli hardware? / Pelanggan kena download app? / Internet pasar malam slow, jalan ke? / Lepas 7 hari percuma, apa jadi? (cancel bila-bila, tak ada kontrak)

**8. Final CTA** — H2: `Malam ni last kali anda hilang pelanggan sebab line panjang.`
- Sub: `Percuma 7 hari. Tak perlu kad kredit. Setup 10 minit.` · CTA: `Mula Percubaan Percuma`

**Footer:** unchanged, plus fix contrast + FAQ link.

---

## PHASE 3 — DESIGN DIRECTION

**Design Read:** redesign-overhaul of a micro-SaaS landing for Malaysian food-stall merchants on phones at night, confident local BM/EN voice, keeping the orange QueLess brand and dark theme.

**Dials:** DESIGN_VARIANCE 6 · MOTION_INTENSITY 4 · VISUAL_DENSITY 4 (trust-first mobile audience; motion = entrance fades + accordion + hover only, all behind `prefers-reduced-motion`).

- **Theme lock:** dark, whole page (existing `.dark` tokens). No section flips.
- **Color:** ONE accent — the existing orange (`--color-primary` + `gradient-primary`). Kill the six rainbow icon accents; all icons/checks become orange or zinc. Semantic green stays only on the payment toast.
- **Typography:** swap Inter → **Plus Jakarta Sans** via `next/font/google` (free, Southeast-Asian provenance, strong bold weights for BM headlines). Scoped to the landing page wrapper only so the dashboard app is untouched. Display: 800 tracking-tight; body 400/500.
- **Shape lock:** rounded-2xl for imagery/panels, full-pill for buttons, documented rule.
- **Imagery:** existing hero photo (add `priority` + `sizes`); 2-3 new supercool-generated lifestyle shots (customer scanning QR at a stall table; merchant confirming an order on phone) + **real product screenshots** (customer menu + merchant board from the live app) framed in the how-it-works steps. No div-built fake UI.
- **References:** StoreHub/Slurp-style Malaysian F&B pragmatism (price-forward, WhatsApp-forward) but with night-market warmth instead of corporate POS blue; avoids the generic Stripe-clone rhythm by using editorial outcome statements and a checklist instead of card grids.

## PHASE 4 — IMPLEMENTATION PLAN

### Components (all under `src/app/` unless noted)
1. `page.tsx` — rebuilt with the 8 sections (server component), wrapped in `<main>` + landing font className.
2. `components/landing/FAQ.tsx` — `"use client"` accordion (native `<details>`-based, styled; no new deps).
3. `MobileNav.tsx` — add Harga/FAQ links, unify CTA label.
4. `globals.css` — landing font variable; no token changes.
5. `layout.tsx` — viewport meta: remove `maximum-scale=1` (a11y; app-wide but strictly beneficial).
6. `public/` — new generated images + product screenshots.

### Acceptance criteria
- [ ] `#features`, `#pricing`, `#faq` anchors all resolve; no dead nav links
- [ ] One CTA label per intent (`Mula Percubaan Percuma`) across nav/hero/pricing/final
- [ ] Promo (7-day trial + RM10×6 bulan + spots-left) visible in hero badge, pricing band, final CTA
- [ ] Mobile 390px: hero headline ≤3 lines, CTA above fold, page scannable by headlines alone
- [ ] Lighthouse a11y ≥ 95 (contrast fixed, `<main>` added, pinch-zoom allowed)
- [ ] Hero image `priority` + `sizes`; CLS stays 0; no console errors
- [ ] Zero em-dashes in visible copy; no 3-col icon-card grid anywhere
- [ ] `npm run build` passes; auth/dashboard/store routes untouched (diff limited to files above)

### Open decisions (Pass 7)
1. **Tier names/prices** — assumed Starter/Growth/Pro at RM59/129/299 from project records. Confirm before build.
2. **Scarcity counter** — "3 daripada 5 slot masih ada" hardcoded at launch (honest as long as it's manually updated). OK, or wire to a real count later?
3. **Testimonials** — deferred until real merchant quotes exist; trust strip carries the load meanwhile.

### NOT in scope
Auth/dashboard/store flows · light-theme pass (page is theme-locked dark) · DESIGN.md creation (recommend later) · analytics events · SEO slug changes (none needed, SEO already 100).
