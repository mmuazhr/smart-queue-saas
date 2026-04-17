"use client";

import { useTheme } from "./ThemeProvider";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by waiting for mount
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return <div className={`h-10 w-10 ${className}`} />;

  return (
    <button
      onClick={toggleTheme}
      className={`relative flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] transition-all hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-primary)] hover:border-[var(--color-primary)] active:scale-95 group ${className}`}
      aria-label="Toggle Theme"
      title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
    >
      <div className="relative h-5 w-5">
        <Sun
          className={`absolute inset-0 h-5 w-5 transition-all duration-500 transform ${
            theme === "dark" ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
          }`}
        />
        <Moon
          className={`absolute inset-0 h-5 w-5 transition-all duration-500 transform ${
            theme === "dark" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
          }`}
        />
      </div>
    </button>
  );
}
