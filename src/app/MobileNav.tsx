"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);

  const close = () => setIsOpen(false);

  return (
    <div className="md:hidden">
      <button type="button" onClick={() => setIsOpen((open) => !open)}
        aria-label={isOpen ? "Close menu" : "Open menu"} aria-expanded={isOpen}
        className="h-11 w-11 -mr-2 flex items-center justify-center rounded-xl text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)] transition-all">
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 bg-[var(--color-bg)] border-b border-[var(--color-border)] px-6 py-4 flex flex-col gap-1 text-sm font-bold text-[var(--color-text-secondary)] shadow-xl">
          <a href="#features" onClick={close} className="py-3 hover:text-[var(--color-primary)] transition-colors">Features</a>
          <a href="#pricing" onClick={close} className="py-3 hover:text-[var(--color-primary)] transition-colors">Pricing</a>
          <a href="#faq" onClick={close} className="py-3 hover:text-[var(--color-primary)] transition-colors">FAQ</a>
          <Link href="/login" onClick={close} className="py-3 hover:text-[var(--color-primary)] transition-colors">Sign In</Link>
          <Link href="/register" onClick={close}
            className="mt-2 py-3 rounded-full gradient-primary text-white text-center shadow-lg shadow-orange-500/20">
            Start Free Trial
          </Link>
        </div>
      )}
    </div>
  );
}
