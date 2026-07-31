"use client";

import { useState, useEffect, useCallback } from "react";
import QRCode from "qrcode";
import { Save, Download, QrCode, Clock, Store as StoreIcon, MapPin, Phone, MessageSquare, CalendarClock, Copy, Check, ExternalLink, Rocket } from "lucide-react";

interface OperatingHoursEntry {
  open: string;
  close: string;
  isClosed: boolean;
}

type OperatingHours = Record<string, OperatingHoursEntry>;

interface Store {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  address: string | null;
  phone: string | null;
  avgPrepTimeMins: number;
  maxConcurrentOrders: number;
  status: string;
  operatingHours: OperatingHours | null;
}

// isStoreOpen() looks days up by lowercase English name; the Malaysian week is
// displayed Monday-first.
const WEEK_DAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
] as const;

const DEFAULT_OPEN = "09:00";
const DEFAULT_CLOSE = "21:00";

// isStoreOpen() treats a missing day as closed, so the editor always holds —
// and always submits — all seven days. A day absent from an existing record is
// shown as closed; re-opening it has to be a deliberate edit, not a side effect
// of saving. A store with no record at all starts from the 09:00–21:00 default.
function hoursFromStore(stored: OperatingHours | null): OperatingHours {
  const hours: OperatingHours = {};
  for (const day of WEEK_DAYS) {
    const entry = stored?.[day.key];
    hours[day.key] = {
      open: entry?.open || DEFAULT_OPEN,
      close: entry?.close || DEFAULT_CLOSE,
      isClosed: entry ? entry.isClosed : stored !== null,
    };
  }
  return hours;
}

export default function SettingsPage() {
  const [store, setStore] = useState<Store | null>(null);
  const [hours, setHours] = useState<OperatingHours>(() => hoursFromStore(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [justCreated, setJustCreated] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [hoursMessage, setHoursMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadStore = useCallback(async () => {
    try {
      const res = await fetch("/api/stores");
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        const currentStore: Store = data.data[0];
        setStore(currentStore);
        setHours(hoursFromStore(currentStore.operatingHours));

        // Generate QR code
        const origin = window.location.origin;
        setAppUrl(origin);
        const storeUrl = `${origin}/store/${currentStore.slug}`;
        const qr = await QRCode.toDataURL(storeUrl, {
          width: 400,
          margin: 2,
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
        });
        setQrDataUrl(qr);
      }
    } catch (error) {
      console.error("Failed to fetch store:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStore();
  }, [loadStore]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!store) return;

    setSaving(true);
    setMessage(null);

    try {
      // Send only the fields this form owns. Spreading the whole row fails
      // validation — columns like latitude and paymentGateway come back null,
      // and updateStoreSchema accepts undefined, not null.
      const res = await fetch(`/api/stores/${store.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: store.name,
          description: store.description ?? "",
          address: store.address ?? "",
          phone: store.phone ?? "",
          avgPrepTimeMins: store.avgPrepTimeMins,
          maxConcurrentOrders: store.maxConcurrentOrders,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStore(data.data);
        setMessage({ type: "success", text: "Settings saved successfully!" });
      } else {
        setMessage({ type: "error", text: data.error || "Failed to save settings." });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Something went wrong." });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveHours(e: React.FormEvent) {
    e.preventDefault();
    if (!store) return;

    setSavingHours(true);
    setHoursMessage(null);

    try {
      const res = await fetch(`/api/stores/${store.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operatingHours: hours }),
      });
      const data = await res.json();
      if (data.success) {
        setStore(data.data);
        setHours(hoursFromStore(data.data.operatingHours));
        setHoursMessage({ type: "success", text: "Operating hours saved." });
      } else {
        setHoursMessage({ type: "error", text: data.error || "Failed to save operating hours." });
      }
    } catch (error) {
      setHoursMessage({ type: "error", text: "Something went wrong." });
    } finally {
      setSavingHours(false);
    }
  }

  function updateDay(dayKey: string, patch: Partial<OperatingHoursEntry>) {
    setHours({ ...hours, [dayKey]: { ...hours[dayKey], ...patch } });
  }

  function downloadQR() {
    if (!qrDataUrl || !store) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `qr-${store.slug}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function copyStoreUrl() {
    if (!store) return;
    try {
      await navigator.clipboard.writeText(`${appUrl}/store/${store.slug}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy store link:", error);
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center animate-pulse-glow">Loading…</div>;

  if (!store) {
    return (
      <CreateStoreForm
        onCreated={async () => {
          setJustCreated(true);
          setLoading(true);
          await loadStore();
        }}
      />
    );
  }

  const storeUrl = `${appUrl}/store/${store.slug}`;
  const isActive = store.status === "ACTIVE";

  return (
    <div className="max-w-4xl animate-fade-in">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Store Settings</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Configure your public profile and kitchen parameters</p>
        </div>
      </div>

      {justCreated && (
        <div className="mb-6 glass rounded-2xl p-5 flex items-start gap-4 border border-[var(--color-success)] animate-slide-up">
          <Rocket className="h-5 w-5 shrink-0 text-[var(--color-success)] mt-0.5" />
          <div>
            <h2 className="font-semibold">{store.name} is live!</h2>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              Customers can order from{" "}
              <a href={`/store/${store.slug}`} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline underline-offset-2">
                /store/{store.slug}
              </a>{" "}
              right now. Add your menu items and set your operating hours below.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Main Settings Form */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSave} className="glass rounded-2xl p-6 space-y-5">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <StoreIcon className="h-5 w-5 text-[var(--color-primary)]" />
              General Information
            </h2>

            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium text-[var(--color-text-secondary)] mb-1.5 block">Store Name</label>
                <input
                  type="text"
                  value={store.name}
                  onChange={(e) => setStore({...store, name: e.target.value})}
                  className="w-full rounded-lg border px-4 py-2.5 text-sm glass transition-all focus:ring-2 focus:ring-[var(--color-primary)]"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-[var(--color-text-secondary)] mb-1.5 block">Description</label>
                <textarea
                  rows={3}
                  value={store.description || ""}
                  onChange={(e) => setStore({...store, description: e.target.value})}
                  className="w-full rounded-lg border px-4 py-2.5 text-sm glass transition-all focus:ring-2 focus:ring-[var(--color-primary)]"
                  placeholder="Tell customers about your food..."
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-[var(--color-text-secondary)] mb-1.5 block flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" /> Address
                  </label>
                  <input
                    type="text"
                    value={store.address || ""}
                    onChange={(e) => setStore({...store, address: e.target.value})}
                    className="w-full rounded-lg border px-4 py-2.5 text-sm glass transition-all"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-[var(--color-text-secondary)] mb-1.5 block flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> Phone
                  </label>
                  <input
                    type="text"
                    value={store.phone || ""}
                    onChange={(e) => setStore({...store, phone: e.target.value})}
                    className="w-full rounded-lg border px-4 py-2.5 text-sm glass transition-all"
                  />
                </div>
              </div>
            </div>

            <hr className="border-[var(--color-border)]" />

            <h2 className="text-lg font-semibold flex items-center gap-2 pt-2">
              <Clock className="h-5 w-5 text-[var(--color-primary)]" />
              Kitchen Parameters
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-medium text-[var(--color-text-secondary)] mb-1.5 block">Avg. Prep Time (mins)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min="1" max="60"
                    value={store.avgPrepTimeMins}
                    onChange={(e) => setStore({...store, avgPrepTimeMins: parseInt(e.target.value)})}
                    className="flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="font-bold w-12 text-center">{store.avgPrepTimeMins}m</span>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-[var(--color-text-secondary)] mb-1.5 block">Max Concurrent Orders</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range" min="1" max="20"
                    value={store.maxConcurrentOrders}
                    onChange={(e) => setStore({...store, maxConcurrentOrders: parseInt(e.target.value)})}
                    className="flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="font-bold w-12 text-center">{store.maxConcurrentOrders}</span>
                </div>
              </div>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center justify-center gap-2 w-full md:w-auto px-6 py-2.5 rounded-xl text-white font-semibold gradient-primary transition-all hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Saving…" : <><Save className="h-4 w-4" /> Save Changes</>}
              </button>
              {message && (
                <p className={`mt-3 text-sm ${message.type === "success" ? "text-green-500" : "text-red-500"}`}>
                  {message.text}
                </p>
              )}
            </div>
          </form>

          {/* Operating Hours */}
          <form onSubmit={handleSaveHours} className="glass rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <CalendarClock className="h-5 w-5 text-[var(--color-primary)]" />
                Operating Hours
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                {store.operatingHours
                  ? "Customers can only order while your stall is open."
                  : "No hours set yet — your stall currently accepts orders around the clock."}
              </p>
            </div>

            <div className="space-y-2">
              {WEEK_DAYS.map((day) => {
                const entry = hours[day.key];
                return (
                  <div
                    key={day.key}
                    className={`grid grid-cols-2 md:grid-cols-[7rem_1fr_1fr_auto] items-center gap-3 rounded-lg px-3 py-2 transition-all ${entry.isClosed ? "opacity-60" : ""}`}
                  >
                    <span className="text-sm font-medium col-span-2 md:col-span-1">{day.label}</span>
                    <input
                      type="time"
                      aria-label={`${day.label} opening time`}
                      value={entry.open}
                      disabled={entry.isClosed}
                      onChange={(e) => updateDay(day.key, { open: e.target.value })}
                      className="w-full rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm bg-transparent disabled:opacity-50"
                    />
                    <input
                      type="time"
                      aria-label={`${day.label} closing time`}
                      value={entry.close}
                      disabled={entry.isClosed}
                      onChange={(e) => updateDay(day.key, { close: e.target.value })}
                      className="w-full rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-sm bg-transparent disabled:opacity-50"
                    />
                    <label className="flex items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)] cursor-pointer col-span-2 md:col-span-1">
                      <input
                        type="checkbox"
                        checked={entry.isClosed}
                        onChange={(e) => updateDay(day.key, { isClosed: e.target.checked })}
                        className="accent-[var(--color-primary)]"
                      />
                      Closed
                    </label>
                  </div>
                );
              })}
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingHours}
                className="flex items-center justify-center gap-2 w-full md:w-auto px-6 py-2.5 rounded-xl text-white font-semibold gradient-primary transition-all hover:opacity-90 disabled:opacity-50"
              >
                {savingHours ? "Saving…" : <><Save className="h-4 w-4" /> Save Hours</>}
              </button>
              {hoursMessage && (
                <p className={`mt-3 text-sm ${hoursMessage.type === "success" ? "text-green-500" : "text-red-500"}`}>
                  {hoursMessage.text}
                </p>
              )}
            </div>
          </form>
        </div>

        {/* QR Code Section */}
        <div className="space-y-6">
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <StoreIcon className="h-5 w-5 text-[var(--color-primary)]" />
                Store Link
              </h2>
              <span
                className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
                  isActive
                    ? "bg-green-500/10 text-green-500 border-green-500/20"
                    : "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                }`}
              >
                {store.status}
              </span>
            </div>

            <p className="text-sm text-[var(--color-text-secondary)] mb-3">
              {isActive
                ? "Your stall is live. Share this link and customers can order right away."
                : "Your stall is not accepting orders yet."}
            </p>

            <div className="flex items-center gap-2">
              <code title={storeUrl} className="flex-1 truncate rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-mono text-[var(--color-text-secondary)]">
                {storeUrl}
              </code>
              <button
                type="button"
                onClick={copyStoreUrl}
                aria-label="Copy public store link"
                className="p-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] transition-all"
              >
                {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              </button>
              <a
                href={`/store/${store.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open public store page in a new tab"
                className="p-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] transition-all"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="glass rounded-2xl p-6 text-center">
            <h2 className="text-lg font-semibold flex items-center justify-center gap-2 mb-4">
              <QrCode className="h-5 w-5 text-[var(--color-primary)]" />
              Store QR Code
            </h2>

            <div className="bg-white p-4 rounded-xl inline-block mb-4 shadow-lg">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="Store QR Code" className="h-48 w-48" />
              ) : (
                <div className="h-48 w-48 bg-zinc-100 flex items-center justify-center text-zinc-400">Gen...</div>
              )}
            </div>

            <p className="text-xs text-[var(--color-text-muted)] mb-4 px-4 text-center">
              Print this and place it on your stall. Customers can scan to browse and order.
            </p>

            <button
              onClick={downloadQR}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] transition-all font-medium"
            >
              <Download className="h-4 w-4" /> Download PNG
            </button>
          </div>

          <div className="glass rounded-2xl p-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
              <MessageSquare className="h-5 w-5 text-[var(--color-primary)]" />
              WhatsApp Notifications
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Automatic order confirmation and "order ready" alerts via WhatsApp Cloud API.
            </p>
            <div className="rounded-lg bg-[var(--color-info-bg)] border border-[var(--color-info)] p-3 flex items-start gap-3">
              <div className="text-[var(--color-info)] pt-0.5">ⓘ</div>
              <p className="text-xs text-[var(--color-text)]">
                WhatsApp API requires template approval. Start with SMS fallback first.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CreateStoreFormProps {
  onCreated: () => Promise<void>;
}

function CreateStoreForm({ onCreated }: CreateStoreFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    setFieldErrors({});

    // Blank optional fields are omitted, not sent as "" — the validators treat
    // an empty string as absent and the DB should not store one either.
    const payload: Record<string, string> = { name: name.trim() };
    if (description.trim()) payload.description = description.trim();
    if (phone.trim()) payload.phone = phone.trim();
    if (address.trim()) payload.address = address.trim();

    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      // STORE_EXISTS means an earlier submit already worked — treat as success.
      if (data.success || data.code === "STORE_EXISTS") {
        await onCreated();
        return;
      }
      setFieldErrors(data.errors || {});
      setError(data.error || "Failed to create your store.");
    } catch (err) {
      setError(
        "Network problem — your store may not have been created. Reload the page to check before retrying."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl animate-fade-in">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Create Your Store</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Just the basics to get going — your stall goes live the moment you create it.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="glass rounded-2xl p-6 space-y-5">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <StoreIcon className="h-5 w-5 text-[var(--color-primary)]" />
          Store Details
        </h2>

        <div>
          <label htmlFor="store-name" className="text-sm font-medium text-[var(--color-text-secondary)] mb-1.5 block">
            Store Name
          </label>
          <input
            id="store-name"
            required
            autoFocus
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Nasi Lemak Pak Din"
            className="w-full rounded-lg border px-4 py-2.5 text-sm glass transition-all focus:ring-2 focus:ring-[var(--color-primary)]"
          />
          {fieldErrors.name && <p className="mt-1.5 text-xs text-red-500">{fieldErrors.name}</p>}
        </div>

        <div>
          <label htmlFor="store-description" className="text-sm font-medium text-[var(--color-text-secondary)] mb-1.5 block">
            Description <span className="text-[var(--color-text-muted)] font-normal">(optional)</span>
          </label>
          <textarea
            id="store-description"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Tell customers about your food..."
            className="w-full rounded-lg border px-4 py-2.5 text-sm glass transition-all focus:ring-2 focus:ring-[var(--color-primary)]"
          />
          {fieldErrors.description && <p className="mt-1.5 text-xs text-red-500">{fieldErrors.description}</p>}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="store-address" className="text-sm font-medium text-[var(--color-text-secondary)] mb-1.5 block flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" /> Address <span className="text-[var(--color-text-muted)] font-normal">(optional)</span>
            </label>
            <input
              id="store-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Lot 12, Jalan Ampang, KL"
              className="w-full rounded-lg border px-4 py-2.5 text-sm glass transition-all"
            />
            {fieldErrors.address && <p className="mt-1.5 text-xs text-red-500">{fieldErrors.address}</p>}
          </div>
          <div>
            <label htmlFor="store-phone" className="text-sm font-medium text-[var(--color-text-secondary)] mb-1.5 block flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5" /> Phone <span className="text-[var(--color-text-muted)] font-normal">(optional)</span>
            </label>
            <input
              id="store-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0123456789"
              className="w-full rounded-lg border px-4 py-2.5 text-sm glass transition-all"
            />
            {fieldErrors.phone && <p className="mt-1.5 text-xs text-red-500">{fieldErrors.phone}</p>}
          </div>
        </div>

        <div className="rounded-lg bg-[var(--color-info-bg)] border border-[var(--color-info)] p-3 flex items-start gap-3">
          <div className="text-[var(--color-info)] pt-0.5">ⓘ</div>
          <p className="text-xs text-[var(--color-text)]">
            Your store goes live straight away, open around the clock. You can set operating
            hours, prep time and your QR code in Settings right after.
          </p>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-2 w-full md:w-auto px-6 py-2.5 rounded-xl text-white font-semibold gradient-primary transition-all hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Creating…" : <><Rocket className="h-4 w-4" /> Create Store</>}
          </button>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </div>
      </form>
    </div>
  );
}
