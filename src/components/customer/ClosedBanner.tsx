import { Moon, PauseCircle } from "lucide-react";
import { DEFAULT_TIMEZONE, type NextOpening } from "@/lib/store-hours";

const DAY_LABELS: Record<string, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
};

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours < 12 ? "am" : "pm";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes).padStart(2, "0")}${suffix}`;
}

/**
 * Builds the human-readable reopening line. Must be called server-side: the
 * "today"/"tomorrow" wording depends on the store's timezone, not the browser's.
 */
export function openingLabel(
  nextOpen: NextOpening | null,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIMEZONE
): string {
  if (!nextOpen) return "Reopening time not available";

  const dayKeyAt = (d: Date): string =>
    new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone }).format(d).toLowerCase();
  const currentTime = new Intl.DateTimeFormat("en-CA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(now);

  const at = `at ${formatTime(nextOpen.time)}`;

  // Same weekday key does not mean today — a store open only on Mondays, asked
  // on a Monday evening, reopens a full week later.
  if (nextOpen.day === dayKeyAt(now) && nextOpen.time > currentTime) return `Opens ${at}`;

  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (nextOpen.day === dayKeyAt(tomorrow)) return `Opens tomorrow ${at}`;

  return `Opens ${DAY_LABELS[nextOpen.day] ?? nextOpen.day} ${at}`;
}

export default function ClosedBanner({ label }: { label: string }) {
  return (
    <div className="glass rounded-2xl px-5 py-4 flex items-center gap-4 border border-[var(--color-border)]">
      <div className="h-11 w-11 shrink-0 rounded-xl bg-[var(--color-bg-tertiary)] flex items-center justify-center text-[var(--color-text-secondary)]">
        <Moon className="h-5 w-5" />
      </div>
      <div>
        <p className="font-black text-[var(--color-text)] leading-tight">Closed</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          {label} &mdash; browse the menu now, order when we reopen.
        </p>
      </div>
    </div>
  );
}

// Emergency pause banner — same shell/styling as ClosedBanner, distinct copy
// so customers don't mistake a kitchen pause for the store being closed.
export function PausedBanner() {
  return (
    <div className="glass rounded-2xl px-5 py-4 flex items-center gap-4 border border-[var(--color-border)]">
      <div className="h-11 w-11 shrink-0 rounded-xl bg-[var(--color-bg-tertiary)] flex items-center justify-center text-[var(--color-text-secondary)]">
        <PauseCircle className="h-5 w-5" />
      </div>
      <div>
        <p className="font-black text-[var(--color-text)] leading-tight">Temporarily not accepting orders</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          The shop has paused new orders for a moment. Please check back soon.
        </p>
      </div>
    </div>
  );
}
