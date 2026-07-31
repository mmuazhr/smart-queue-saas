"use client";

// =============================================================================
// Account — profile + password management for the signed-in merchant
// =============================================================================

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function AccountPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    // Seed from the DB, not the session JWT — the JWT's name is frozen at
    // login and carries no phone, so seeding from it silently reverts and
    // wipes saved values on the next save.
    fetch("/api/account")
      .then((r) => r.json())
      .then((res) => {
        if (res?.success && res.data) {
          setName(res.data.name ?? "");
          setEmail(res.data.email ?? "");
          setPhone(res.data.phone ?? "");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (savingProfile) return;
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/account", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, phone: phone.trim() === "" ? null : phone }),
      });
      const data = await res.json();
      if (data.success) setProfileMsg({ ok: true, text: "Profile updated." });
      else if (data.code === "EMAIL_TAKEN") setProfileMsg({ ok: false, text: "That email is already in use." });
      else setProfileMsg({ ok: false, text: data.errors ? Object.values(data.errors).join(" ") : data.error });
    } catch {
      setProfileMsg({ ok: false, text: "Network problem — please try again." });
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (savingPassword) return;
    setSavingPassword(true);
    setPasswordMsg(null);
    try {
      const res = await fetch("/api/account/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (data.success) {
        setPasswordMsg({ ok: true, text: "Password changed." });
        setCurrentPassword("");
        setNewPassword("");
      } else if (data.code === "WRONG_PASSWORD") {
        setPasswordMsg({ ok: false, text: "Current password is incorrect." });
      } else {
        setPasswordMsg({ ok: false, text: data.errors ? Object.values(data.errors).join(" ") : data.error });
      }
    } catch {
      setPasswordMsg({ ok: false, text: "Network problem — please try again." });
    } finally {
      setSavingPassword(false);
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)]" /></div>;

  const inputCls = "w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[var(--color-primary)] outline-none";
  const labelCls = "text-xs font-bold text-[var(--color-text-secondary)]";
  const btnCls = "rounded-xl gradient-primary px-6 py-3 text-sm font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed";
  const msg = (m: { ok: boolean; text: string }) => (
    <p className={`rounded-lg px-3 py-2 text-sm ${m.ok ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"}`}>{m.text}</p>
  );

  return (
    <div className="max-w-2xl space-y-8 pb-12">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Account</h1>
        <p className="text-sm text-[var(--color-text-secondary)]">Your profile and sign-in details.</p>
      </div>

      <form onSubmit={saveProfile} className="glass rounded-2xl p-6 space-y-4">
        <h2 className="font-bold">Profile</h2>
        <div className="space-y-1.5">
          <label htmlFor="acct-name" className={labelCls}>Full Name</label>
          <input id="acct-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="acct-email" className={labelCls}>Email</label>
          <input id="acct-email" type="email" className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="acct-phone" className={labelCls}>Phone <span className="font-normal">(optional — leave blank to remove)</span></label>
          <input id="acct-phone" type="tel" className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+60123456789" />
        </div>
        {profileMsg && msg(profileMsg)}
        <button type="submit" disabled={savingProfile} className={btnCls}>{savingProfile ? "Saving…" : "Save Profile"}</button>
      </form>

      <form onSubmit={savePassword} className="glass rounded-2xl p-6 space-y-4">
        <h2 className="font-bold">Change Password</h2>
        <div className="space-y-1.5">
          <label htmlFor="acct-current" className={labelCls}>Current Password</label>
          <input id="acct-current" type="password" className={inputCls} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="acct-new" className={labelCls}>New Password <span className="font-normal">(min 8 characters)</span></label>
          <input id="acct-new" type="password" className={inputCls} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
        </div>
        {passwordMsg && msg(passwordMsg)}
        <button type="submit" disabled={savingPassword} className={btnCls}>{savingPassword ? "Changing…" : "Change Password"}</button>
      </form>
    </div>
  );
}
