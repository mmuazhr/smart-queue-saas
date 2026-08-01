"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, Upload, Banknote } from "lucide-react";
import { formatPrice } from "@/lib/utils";
import { normalizeImageForUpload, ImageDecodeError, IMAGE_DECODE_ERROR_MESSAGE } from "@/lib/client-image";

interface PaymentPanelOrder {
  id: string;
  total: number;
  paymentMethod: string;
  hasProof: boolean;
  store: {
    paymentQrUrl: string | null;
    paymentInstructions: string | null;
  };
}

type Props = {
  order: PaymentPanelOrder;
  onProofUploaded: () => void;
};

// Maps the proof PATCH endpoint's error codes to customer-facing copy.
const PROOF_ERROR_MESSAGES: Record<string, string> = {
  FILE_TOO_LARGE: "That file is too large. Please upload an image under 5MB.",
  INVALID_IMAGE: "That doesn't look like a valid image. Please upload a PNG or JPG.",
  PROOF_ALREADY_ATTACHED: "A receipt has already been uploaded for this order.",
  INVALID_STATUS: "This order can no longer accept a receipt.",
  RATE_LIMITED: "Too many attempts. Please wait a moment and try again.",
  NOT_FOUND: "Order not found.",
};

export default function PaymentPanel({ order, onProofUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload() {
    if (!file || isUploading) return;
    setIsUploading(true);
    setError(null);

    try {
      const normalized = await normalizeImageForUpload(file, { kind: "photo" });
      const formData = new FormData();
      formData.append("file", normalized);

      const res = await fetch(`/api/orders/${order.id}/proof`, {
        method: "PATCH",
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        onProofUploaded();
      } else if (data.error === "PROOF_ALREADY_ATTACHED") {
        // A receipt is already attached server-side (e.g. uploaded from another
        // tab/device) — converge the UI to that truth instead of leaving a dead-end
        // error next to an upload control the customer can no longer act on.
        onProofUploaded();
      } else {
        setError(PROOF_ERROR_MESSAGES[data.error as string] ?? "Upload failed. Please try again.");
      }
    } catch (err) {
      if (err instanceof ImageDecodeError) {
        setError(IMAGE_DECODE_ERROR_MESSAGE);
      } else {
        setError("Something went wrong. Check your connection.");
      }
    } finally {
      setIsUploading(false);
    }
  }

  if (order.paymentMethod === "CASH") {
    return (
      <section className="glass rounded-3xl p-6 flex items-start gap-4">
        <Banknote className="h-8 w-8 text-green-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-black text-[var(--color-text)]">Pay at the counter</p>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            The shop will confirm your order once you&apos;ve paid.
          </p>
        </div>
      </section>
    );
  }

  // QR method, but the merchant never uploaded a QR image — never render a broken <img>.
  if (!order.store.paymentQrUrl) {
    return (
      <section className="glass rounded-3xl p-6 text-center">
        <p className="font-black text-[var(--color-text)]">
          {order.store.paymentInstructions || "Please pay at the counter — the shop will confirm your order."}
        </p>
      </section>
    );
  }

  return (
    <section className="glass rounded-3xl p-6 space-y-5 text-center">
      <div>
        <p className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-2">Scan to Pay</p>
        <img
          src={order.store.paymentQrUrl}
          alt="Payment QR code"
          className="w-48 h-48 mx-auto rounded-2xl border border-[var(--color-border)] object-contain bg-white p-2"
        />
      </div>

      <div>
        <p className="text-2xl font-black text-[var(--color-primary)]">
          Transfer exactly {formatPrice(order.total)}
        </p>
        {order.store.paymentInstructions && (
          <p className="text-xs text-[var(--color-text-muted)] mt-1">{order.store.paymentInstructions}</p>
        )}
      </div>

      {order.hasProof ? (
        <div className="flex items-center justify-center gap-2 py-3 text-green-500">
          <CheckCircle2 className="h-5 w-5" />
          <p className="text-sm font-bold">Please show the payment proof at the counter to confirm your order.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="w-full text-xs text-[var(--color-text-muted)] file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-[var(--color-bg-tertiary)] file:text-xs file:font-bold file:text-[var(--color-text)]"
          />
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-500 text-xs">
              {error}
            </div>
          )}
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="w-full py-3 rounded-xl gradient-primary text-white font-black text-xs uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            I&apos;ve paid — upload receipt
          </button>
        </div>
      )}
    </section>
  );
}
