// =============================================================================
// Landing Page — High-Conversion Marketing Page for Merchants
// =============================================================================

import { Fragment } from "react";
import Link from "next/link";
import Image from "next/image";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ArrowDown, ArrowRight, Check, CheckCircle2, Zap } from "lucide-react";
import MobileNav from "./MobileNav";
import FAQ from "./components/landing/FAQ";

// Scoped to this page only: the dashboard keeps Inter from the root layout.
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

const CTA_LABEL = "Start Free Trial";

const marqueeItems = [
  "QR Ordering",
  "DuitNow Payments",
  "Auto Queue Numbers",
  "Live Order Tracking",
  "Daily Sales Reports",
  "No Hardware",
];

const facts = [
  { value: "10 min", label: "Setup time" },
  { value: "RM0", label: "Hardware cost" },
  { value: "0%", label: "Payment fees" },
  { value: "7 days", label: "Free trial" },
];

const reasons = [
  {
    headline: "Customers walk away when they see a long line.",
    support:
      "With QR ordering, they can order from anywhere in the market. No need to stand in line.",
  },
  {
    headline: "Serve more customers with the same staff.",
    support:
      "No one is stuck taking orders at the counter. You just cook and hand over the food.",
  },
  {
    headline: "No missed orders during rush hour.",
    support: "Every order is numbered, paid for, and on your screen.",
  },
  {
    headline: "Works even when the internet is slow.",
    support:
      "QueLess is a lightweight web app built for spotty night market WiFi.",
  },
];

const steps = [
  {
    title: "Sign up, add your menu, print your QR",
    support: "Takes 10 minutes, all from your phone. Put the QR code on your table.",
    image: "/landing-qr-table.jpg",
    alt: "QueLess QR code standing on a food stall table",
  },
  {
    title: "Customers scan and pay",
    support: "They browse your menu, pay with DuitNow and upload the receipt.",
    image: "/landing-scan-order.jpg",
    alt: "Customer scanning a QueLess QR code and ordering from their phone",
  },
  {
    title: "You confirm, they track their order",
    support:
      "Confirm the payment and start cooking. Customers watch their queue number on their phone and pick up when it's ready.",
    image: "/landing-order-ready.jpg",
    alt: "Stall owner handing a finished order to a customer at a night market",
  },
];

const features = [
  {
    title: "Free QR menu",
    desc: "Print once and place it on the table. Update your menu anytime from your phone.",
  },
  {
    title: "DuitNow with zero fees",
    desc: "Money goes straight into your bank account. No deductions, no middleman.",
  },
  {
    title: "Automatic queue numbers",
    desc: "Every order gets its own number. No more shouting names.",
  },
  {
    title: "Live order tracking",
    desc: "Customers see their order status on their own phone. No crowd waiting at your stall.",
  },
  {
    title: "Daily sales report",
    desc: "See today's sales, best sellers and busiest hours.",
  },
  {
    title: "Installs like an app",
    desc: "Add to home screen straight from the browser. No App Store, no download.",
  },
];

const inclusions = [
  "All features included",
  "Unlimited orders every month",
  "Live tracking for every order",
  "Support in English and Malay",
  "Cancel anytime",
];

const trustPlaces = [
  "Roadside stalls",
  "Night markets",
  "Food trucks",
  "Warungs",
];

const trustFacts = [
  {
    label: "DuitNow payments",
    desc: "Money goes straight into your own bank account.",
  },
  {
    label: "Nothing to install",
    desc: "Runs in the browser your customers already have.",
  },
  {
    label: "Your data stays yours",
    desc: "Your menu, sales and customer info always belong to you.",
  },
];

export default function HomePage() {
  return (
    <div
      className={`${jakarta.className} flex min-h-screen flex-col bg-[var(--color-bg)]`}
    >
      {/* Launch offer announcement bar — the first element on the page */}
      <div className="gradient-primary px-4 py-2.5 text-center text-white">
        <p className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm font-extrabold">
          <Zap aria-hidden className="h-4 w-4 shrink-0 fill-current" />
          <span>Launch offer: first 5 merchants get RM10 off per month for 6 months</span>
          <span className="rounded-full bg-black/20 px-3 py-0.5 text-xs uppercase tracking-widest">
            5 of 5 spots open · Be the first
          </span>
        </p>
      </div>

      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-[var(--color-bg)]/80 backdrop-blur-xl border-b border-[var(--color-border)] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center text-white font-extrabold text-sm">QL</div>
            <span className="text-lg font-extrabold tracking-tight"><span className="text-[var(--color-primary)]">Que</span>Less</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-bold text-[var(--color-text-secondary)]">
            <a href="#features" className="py-3 hover:text-[var(--color-primary)] transition-colors">Features</a>
            <a href="#pricing" className="py-3 hover:text-[var(--color-primary)] transition-colors">Pricing</a>
            <a href="#faq" className="py-3 hover:text-[var(--color-primary)] transition-colors">FAQ</a>
            <Link href="/login" className="py-3 hover:text-[var(--color-primary)] transition-colors">Sign In</Link>
            <Link href="/register" className="px-5 py-3 rounded-full gradient-primary text-white shadow-lg shadow-orange-500/20 hover:scale-105 transition-all">
              {CTA_LABEL}
            </Link>
          </div>
          <MobileNav />
        </div>
      </nav>

      <main>
        {/* 1. Hero */}
        <section className="relative px-6 pt-16 pb-24 md:pt-20 md:pb-32 overflow-hidden">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="space-y-8 animate-slide-up">
              <p className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs font-extrabold uppercase tracking-widest">
                <Zap aria-hidden className="h-3 w-3 fill-current" />
                7-Day Free Trial · Full Access
              </p>
              <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold leading-[1.1] tracking-tight">
                Turn Long Queues Into <span className="text-[var(--color-primary)]">Sales.</span>
              </h1>
              <p className="text-lg text-[var(--color-text-secondary)] leading-relaxed max-w-lg">
                Customers scan, order and pay from their own phones. No app, no hardware, no lost orders.
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <Link href="/register" className="flex items-center justify-center gap-2 px-8 py-4 rounded-full gradient-primary text-white font-extrabold tracking-wide whitespace-nowrap shadow-2xl shadow-orange-500/40 hover:scale-105 active:scale-95 transition-all">
                  {CTA_LABEL} <ArrowRight aria-hidden className="h-5 w-5" />
                </Link>
                <a href="#pricing" className="flex items-center justify-center gap-2 px-4 py-4 text-base font-bold text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors">
                  See Pricing <ArrowDown aria-hidden className="h-4 w-4" />
                </a>
              </div>
            </div>

            <div className="relative animate-fade-in">
              <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/20 to-transparent rounded-3xl blur-3xl -z-10" />

              {/* Sibling of the image frame, not a child: the frame clips overflow. */}
              <div aria-hidden className="absolute -left-5 -top-5 z-10 hidden h-28 w-28 md:block">
                <div className="absolute inset-0 rounded-full border border-amber-400/50 bg-zinc-950" />
                <svg viewBox="0 0 112 112" className="absolute inset-0 h-full w-full animate-spin-slow">
                  <defs>
                    <path
                      id="sticker-arc"
                      fill="none"
                      d="M 56,56 m -44,0 a 44,44 0 1,1 88,0 a 44,44 0 1,1 -88,0"
                    />
                  </defs>
                  <text fill="#fbbf24" fontSize="10" fontWeight="800">
                    <textPath href="#sticker-arc" textLength="276" lengthAdjust="spacing">
                      7-DAY FREE TRIAL • NO CREDIT CARD •
                    </textPath>
                  </text>
                </svg>
                <Zap className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 fill-amber-400 text-amber-400" />
              </div>

              <div className="glass rounded-3xl overflow-hidden shadow-2xl border border-white/10 aspect-video lg:aspect-square relative">
                <Image
                  src="/hero-queless.png"
                  alt="Merchant managing QueLess orders at a food stall"
                  fill
                  preload
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />
                <div className="absolute bottom-6 left-6 right-6 p-4 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-3">
                  <span className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle2 aria-hidden className="h-6 w-6 text-green-500" />
                  </span>
                  <span>
                    <span className="block text-xs font-bold text-white">Payment Received</span>
                    <span className="block text-[10px] text-zinc-400">Order #124 · RM 24.50</span>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Marquee strip. Spacing lives inside each copy so the two copies are
            identical widths and the -50% loop has no seam. */}
        <div className="overflow-hidden bg-amber-400 py-3">
          <ul className="sr-only">
            {marqueeItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div aria-hidden className="flex w-max animate-marquee items-center">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center">
                {marqueeItems.map((item) => (
                  <Fragment key={item}>
                    <span className="whitespace-nowrap px-6 text-sm font-extrabold uppercase tracking-wide text-zinc-950">
                      {item}
                    </span>
                    <span className="text-sm text-zinc-950/60">✳</span>
                  </Fragment>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Facts band */}
        <section className="px-6 py-14 md:py-16">
          <div className="max-w-7xl mx-auto grid grid-cols-2 gap-y-10 md:flex md:items-start md:justify-between">
            {facts.map((fact, index) => (
              <Fragment key={fact.value}>
                {index > 0 && (
                  <span aria-hidden className="hidden md:flex md:items-center md:gap-1.5 md:self-center">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                  </span>
                )}
                <div className="space-y-2">
                  <p className="text-4xl lg:text-5xl font-extrabold tracking-tight text-amber-400">
                    {fact.value}
                  </p>
                  <p className="text-base text-[var(--color-text-secondary)]">{fact.label}</p>
                </div>
              </Fragment>
            ))}
          </div>
        </section>

        {/* 2. Why QueLess */}
        <section className="relative anchor-panel hatch-top px-6 py-20 md:py-28">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16">
            <div className="lg:col-span-7 space-y-12">
              <div className="space-y-4">
                <p className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest text-[var(--color-text-secondary)]">
                  <span aria-hidden className="flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  </span>
                  Why QueLess
                </p>
                <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight max-w-xl">
                  Long queues kill your sales.
                </h2>
              </div>
              <ol className="space-y-10">
                {reasons.map((reason, index) => (
                  <li key={reason.headline} className="flex gap-5 md:gap-8">
                    <span aria-hidden className="text-3xl md:text-4xl font-extrabold leading-none text-zinc-500 shrink-0 tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="space-y-2">
                      <h3 className="text-xl md:text-2xl font-extrabold tracking-tight leading-snug">
                        {reason.headline}
                      </h3>
                      <p className="text-base text-[var(--color-text-secondary)] leading-relaxed">
                        {reason.support}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="lg:col-span-5">
              <div className="lg:sticky lg:top-28">
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[var(--color-border)]">
                  <Image
                    src="/landing-scan-order.jpg"
                    alt="Customer scanning a QueLess QR code and ordering from their own phone"
                    fill
                    sizes="(max-width: 1024px) 100vw, 40vw"
                    className="object-cover"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. How it works */}
        <section className="px-6 py-20 md:py-28">
          <div className="max-w-7xl mx-auto space-y-14">
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight max-w-2xl">
              Three simple steps.
            </h2>

            <ol className="grid grid-cols-1 gap-14 md:grid-cols-3 md:gap-10">
              {steps.map((step, index) => {
                const isLast = index === steps.length - 1;
                return (
                  <li key={step.title} className="relative">
                    {!isLast && (
                      <span
                        aria-hidden
                        className="absolute left-7 top-12 -bottom-14 border-l border-dashed border-[var(--color-border)] md:hidden"
                      />
                    )}
                    <div className="mb-6 flex items-center">
                      <span aria-hidden className="inline-flex min-w-14 shrink-0 items-center justify-center rounded-full border border-amber-400/40 px-4 py-1.5 text-lg font-extrabold text-amber-400 tabular-nums">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {!isLast && (
                        <span aria-hidden className="hidden flex-1 border-t border-dashed border-[var(--color-border)] md:-mr-10 md:block" />
                      )}
                    </div>

                    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[var(--color-border)]">
                      <Image
                        src={step.image}
                        alt={step.alt}
                        fill
                        sizes="(max-width: 768px) 100vw, 33vw"
                        className="object-cover"
                      />
                    </div>

                    <h3 className="mt-6 text-xl md:text-2xl font-extrabold tracking-tight">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-base text-[var(--color-text-secondary)] leading-relaxed">
                      {step.support}
                    </p>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* 4. Features */}
        <section id="features" className="relative anchor-panel hatch-top px-6 py-20 md:py-28">
          <div className="max-w-7xl mx-auto space-y-12">
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight max-w-2xl">
              Everything your stall needs.
            </h2>

            <ul className="grid grid-cols-1 md:grid-cols-2 md:gap-x-16 border-t border-[var(--color-border)]">
              {features.map((feature) => (
                <li key={feature.title} className="flex gap-4 border-b border-[var(--color-border)] py-6">
                  <Check aria-hidden className="mt-1 h-5 w-5 shrink-0 text-[var(--color-primary)]" />
                  <div className="space-y-1">
                    <h3 className="text-base font-extrabold tracking-tight">{feature.title}</h3>
                    <p className="text-base text-[var(--color-text-secondary)] leading-relaxed">{feature.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 5. Pricing */}
        <section id="pricing" className="px-6 py-20 md:py-28">
          <div className="max-w-7xl mx-auto space-y-12">
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight max-w-2xl">
              Simple pricing. No hidden fees.
            </h2>

            <div className="max-w-lg">
              {/* The page's one bright card. `.glass` is unlayered CSS and would
                  win over any Tailwind background, so it is dropped, not overridden. */}
              <div className="rounded-2xl bg-amber-400 p-8 md:p-10 space-y-8 text-amber-950">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="text-2xl font-bold text-amber-800 line-through">RM49</span>
                    <span className="text-6xl font-extrabold tracking-tight text-amber-950">RM39</span>
                  </div>
                  <p className="text-base text-amber-900">
                    /month · for your first 6 months
                  </p>
                  <p className="text-base text-amber-900">
                    Free 7-day trial, no credit card needed.
                  </p>
                  <p className="inline-flex rounded-full bg-amber-950/10 px-3 py-1 text-xs font-extrabold uppercase tracking-widest text-amber-950">
                    Launch offer · 5 of 5 spots open
                  </p>
                </div>

                <ul className="space-y-3">
                  {inclusions.map((item) => (
                    <li key={item} className="flex gap-3 text-base text-amber-950">
                      <Check aria-hidden className="mt-1 h-5 w-5 shrink-0 text-amber-950" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>

                <Link href="/register" className="flex items-center justify-center gap-2 w-full px-8 py-4 rounded-full gradient-primary text-white font-extrabold tracking-wide shadow-xl shadow-orange-500/30 hover:scale-[1.02] active:scale-95 transition-all">
                  {CTA_LABEL} <ArrowRight aria-hidden className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* 6. Trust strip */}
        <section className="px-6 py-20 md:py-24 bg-[var(--color-bg-secondary)] border-y border-[var(--color-border)]">
          <div className="max-w-7xl mx-auto space-y-10">
            <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight max-w-2xl">
              Built in Malaysia, for Malaysian hawkers.
            </h2>

            <ul className="flex flex-wrap gap-x-10 gap-y-3 text-lg font-bold text-[var(--color-text-secondary)]">
              {trustPlaces.map((place) => (
                <li key={place}>{place}</li>
              ))}
            </ul>

            <dl className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 border-t border-[var(--color-border)] pt-8">
              {trustFacts.map((fact) => (
                <div key={fact.label} className="space-y-2">
                  <dt className="text-base font-extrabold tracking-tight">{fact.label}</dt>
                  <dd className="text-base text-[var(--color-text-secondary)] leading-relaxed">{fact.desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* 7. FAQ */}
        <section id="faq" className="px-6 py-20 md:py-28">
          <div className="max-w-3xl mx-auto space-y-10">
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight">
              Frequently asked questions.
            </h2>
            <FAQ />
          </div>
        </section>

        {/* 8. Final CTA */}
        <section className="gradient-primary px-6 py-20 md:py-28">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Make tonight the last time you lose customers to a long queue.
            </h2>
            <p className="text-xl font-bold text-white">
              Free for 7 days. No credit card. Set up in 10 minutes.
            </p>
            <div className="pt-2">
              <Link href="/register" className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-full bg-white text-[#9a3412] font-extrabold tracking-wide shadow-2xl hover:scale-105 active:scale-95 transition-all">
                {CTA_LABEL} <ArrowRight aria-hidden className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-20 px-6 border-t border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="space-y-4 max-w-sm">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center text-white font-extrabold text-sm">QL</div>
              <span className="text-lg font-extrabold tracking-tight">QueLess</span>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)] font-bold">Empowering micro food businesses in Malaysia.</p>
          </div>

          <div className="flex flex-wrap justify-center gap-x-8 text-xs font-extrabold uppercase tracking-widest text-[var(--color-text-secondary)]">
            <a href="#faq" className="py-3.5 hover:text-[var(--color-primary)]">FAQ</a>
          </div>

          <div className="text-[var(--color-text-secondary)] text-sm">
            &copy; 2026 QueLess. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
