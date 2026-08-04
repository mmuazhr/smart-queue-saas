"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { selectKeyReducer } from "@/lib/select-keys";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel?: string;
  className?: string;
}

/**
 * Dropdown built out of app colours instead of a native <select>, whose OS
 * option list renders unreadably dark-on-dark until hovered. Keyboard
 * behaviour lives in selectKeyReducer so it can be tested without a renderer.
 */
export default function Select({ value, onChange, options, ariaLabel, className }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // An empty string is a legitimate value (menu items use it for
  // "Uncategorized"), so match on identity, never on truthiness.
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedLabel = selectedIndex >= 0 ? options[selectedIndex].label : "";

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  function commit(index: number) {
    const option = options[index];
    if (option) onChange(option.value);
    setIsOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const result = selectKeyReducer({ isOpen, highlightedIndex }, event.key, options.length);
    if (result.handled) event.preventDefault();
    setIsOpen(result.isOpen);
    setHighlightedIndex(result.highlightedIndex);
    if (result.commitIndex !== null) commit(result.commitIndex);
  }

  function toggle() {
    // Reopening should land on the current selection, not wherever the arrow
    // keys were left last time.
    if (!isOpen) setHighlightedIndex(Math.max(0, selectedIndex));
    setIsOpen(!isOpen);
  }

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`} onKeyDown={handleKeyDown}>
      <button
        type="button"
        onClick={toggle}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-sm text-[var(--color-text)] transition-all hover:border-[var(--color-border-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--color-text-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute left-0 right-0 z-50 mt-1.5 max-h-64 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1 shadow-xl shadow-black/20"
        >
          {options.map((option, index) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                onClick={() => commit(index)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  index === highlightedIndex
                    ? "bg-[var(--color-bg-tertiary)] text-[var(--color-text)]"
                    : "text-[var(--color-text-secondary)]"
                }`}
              >
                <span className="truncate">{option.label}</span>
                {isSelected && <Check className="h-4 w-4 shrink-0 text-[var(--color-primary)]" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
