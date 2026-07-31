"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import QRCode from "qrcode";
import { Save, Download, QrCode, Clock, Store as StoreIcon, MapPin, Phone, MessageSquare } from "lucide-react";

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
}

export default function SettingsPage() {
  const sessionData = useSession();
  const session = sessionData?.data;
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    async function fetchStore() {
      try {
        const res = await fetch("/api/stores");
        const data = await res.json();
        if (data.success && data.data.length > 0) {
          const currentStore = data.data[0];
          setStore(currentStore);
          
          // Generate QR code
          const appUrl = window.location.origin;
          const storeUrl = `${appUrl}/store/${currentStore.slug}`;
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
    }
    fetchStore();
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!store) return;
    
    setSaving(true);
    setMessage(null);
    
    try {
      const res = await fetch(`/api/stores/${store.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(store),
      });
      const data = await res.json();
      if (data.success) {
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

  function downloadQR() {
    if (!qrDataUrl || !store) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `qr-${store.slug}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (loading) return <div className="flex h-64 items-center justify-center animate-pulse-glow">Loading…</div>;
  if (!store) return <div className="text-center py-12">No store found. Contact support.</div>;

  return (
    <div className="max-w-4xl animate-fade-in">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Store Settings</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Configure your public profile and kitchen parameters</p>
        </div>
      </div>

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
        </div>

        {/* QR Code Section */}
        <div className="space-y-6">
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
