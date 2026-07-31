// =============================================================================
// Landing Page — High-Conversion Marketing Page for Merchants
// =============================================================================

import Link from "next/link";
import Image from "next/image";
import { CheckCircle2, Zap, Smartphone, BarChart3, Clock, ArrowRight, ShieldCheck } from "lucide-react";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-bg)]">
      {/* Navbar */}
      <nav className="sticky top-0 z-50 bg-[var(--color-bg)]/80 backdrop-blur-xl border-b border-[var(--color-border)] px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center text-white font-black text-sm">QL</div>
            <span className="text-lg font-black tracking-tight"><span className="text-[var(--color-primary)]">Que</span>Less</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm font-bold text-[var(--color-text-secondary)]">
            <a href="#features" className="hover:text-[var(--color-primary)] transition-colors">Features</a>
            <a href="#pricing" className="hover:text-[var(--color-primary)] transition-colors">Pricing</a>
            <Link href="/login" className="hover:text-[var(--color-primary)] transition-colors">Sign In</Link>
            <Link href="/register" className="px-5 py-2.5 rounded-full gradient-primary text-white shadow-lg shadow-orange-500/20 hover:scale-105 transition-all">
              Start Free Trial
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-20 pb-32 px-6 overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div className="space-y-8 animate-slide-up">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--color-primary)]/10 border border-[var(--color-primary)]/20 text-[var(--color-primary)] text-xs font-black uppercase tracking-widest">
              <Zap className="h-3 w-3 fill-current" />
              Built for Malaysian Food Stalls
            </div>
            <h1 className="text-5xl md:text-7xl font-black leading-[1.1] tracking-tight">
              Tukarkan Barisan Panjang Kepada <span className="text-orange-500">Jualan.</span>
            </h1>
            <p className="text-lg text-[var(--color-text-secondary)] leading-relaxed max-w-lg">
              QueLess is the digital queue & ordering system that lets your customers scan, order, and pay from their phone. No more physical lines, no more missed sales.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/register" className="flex items-center justify-center gap-2 px-8 py-4 rounded-2xl gradient-primary text-white font-black tracking-wide whitespace-nowrap shadow-2xl shadow-orange-500/40 hover:scale-105 active:scale-95 transition-all">
                Get Started Free <ArrowRight className="h-5 w-5" />
              </Link>
              <div className="flex items-center px-6 py-4 text-sm text-[var(--color-text-secondary)]">
                <p>No hardware. No app download. Set up in minutes.</p>
              </div>
            </div>
          </div>

          <div className="relative animate-fade-in delay-200">
            <div className="absolute inset-0 bg-gradient-to-tr from-orange-500/20 to-transparent rounded-3xl blur-3xl -z-10" />
            <div className="glass rounded-3xl overflow-hidden shadow-2xl border border-white/10 aspect-video lg:aspect-square relative">
              <Image 
                src="/hero-queless.png" 
                alt="Merchant using QueLess"
                fill
                className="object-cover hover:scale-105 transition-all duration-700" 
              />
              <div className="absolute bottom-6 left-6 right-6 p-4 glass-dark rounded-2xl flex items-center justify-between animate-slide-up delay-500">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center">
                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">Payment Received</p>
                    <p className="text-[10px] text-zinc-400">Order #124 · RM 24.50</p>
                  </div>
                </div>
                <div className="h-8 w-16 bg-white/10 rounded-lg animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section id="features" className="py-24 px-6 bg-[var(--color-bg-secondary)]">
        <div className="max-w-7xl mx-auto space-y-16">
          <div className="text-center space-y-4 max-w-2xl mx-auto">
            <h2 className="text-3xl md:text-5xl font-black tracking-tight">Everything you need to scale your stall.</h2>
            <p className="text-[var(--color-text-secondary)]">Simple enough for a roadside stall, powerful enough for a food truck fleet.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { 
                icon: <Smartphone className="h-8 w-8 text-orange-400" />, 
                title: "QR-Ordering", 
                desc: "Customers scan your unique QR code and browse your beautiful, digital menu instantly." 
              },
              { 
                icon: <ShieldCheck className="h-8 w-8 text-blue-400" />, 
                title: "Secure Payments", 
                desc: "Integrated with Stripe and Billplz for instant FPX bank transfers and cards." 
              },
              { 
                icon: <Clock className="h-8 w-8 text-green-400" />, 
                title: "Live Queue Logic", 
                desc: "Automatic queue numbering and ETA calculation based on your actual prep time." 
              },
              { 
                icon: <Zap className="h-8 w-8 text-amber-400" />, 
                title: "WhatsApp Alerts", 
                desc: "Auto-notify customers when their food is ready. Zero person-to-person contact needed." 
              },
              { 
                icon: <BarChart3 className="h-8 w-8 text-purple-400" />, 
                title: "Live Insights", 
                desc: "Track your sales, popular items, and peak hours in real-time from any device." 
              },
              { 
                icon: <CheckCircle2 className="h-8 w-8 text-rose-400" />, 
                title: "PWA Native App", 
                desc: "Install to your phone home screen. Works fast, even on spotty night market networks." 
              }
            ].map((feature, i) => (
              <div key={i} className="p-8 glass rounded-3xl space-y-4 hover:shadow-2xl hover:-translate-y-2 transition-all group">
                <div className="h-16 w-16 rounded-2xl bg-zinc-900 flex items-center justify-center group-hover:scale-110 transition-transform">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-bold">{feature.title}</h3>
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof / Footer */}
      <footer className="py-20 px-6 border-t border-[var(--color-border)]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="space-y-4 max-w-sm">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center text-white font-black text-sm">QL</div>
              <span className="text-lg font-black tracking-tight">QueLess</span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-widest font-bold">Empowering micro food businesses in Malaysia.</p>
          </div>
          
          <div className="flex flex-wrap justify-center gap-8 text-xs font-black uppercase tracking-widest text-[var(--color-text-secondary)]">
            <a href="#" className="hover:text-[var(--color-primary)]">Privacy</a>
            <a href="#" className="hover:text-[var(--color-primary)]">Terms</a>
            <a href="#" className="hover:text-[var(--color-primary)]">Contact</a>
            <a href="#" className="hover:text-[var(--color-primary)]">Status</a>
          </div>

          <div className="text-[var(--color-text-muted)] text-sm">
            &copy; 2026 QueLess. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
