"use client";

import { useCart } from "@/hooks/useCart";
import { formatPrice } from "@/lib/utils";
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowRight, MessageSquare } from "lucide-react";
import Link from "next/link";

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  storeSlug: string;
}

export default function CartDrawer({ isOpen, onClose, storeSlug }: CartDrawerProps) {
  const { items, updateQuantity, updateInstructions, removeItem, getTotal, getTax, getFinalTotal } = useCart();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] animate-fade-in">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm" 
        onClick={onClose} 
      />
      
      {/* Drawer */}
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-[var(--color-bg)] shadow-2xl flex flex-col animate-slide-left border-l border-[var(--color-border)]">
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-[var(--color-primary)]" />
            <h2 className="text-lg font-bold">Your Cart</h2>
            <span className="bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] text-[10px] font-bold px-2 py-0.5 rounded-full">
              {items.length} items
            </span>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[var(--color-bg-tertiary)] rounded-full transition-all">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
              <ShoppingBag className="h-16 w-16 mb-4" />
              <p className="font-medium">Your cart is empty</p>
              <button onClick={onClose} className="text-sm text-[var(--color-primary)] mt-2">Start adding items</button>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.menuItemId} className="glass rounded-xl p-3 space-y-3">
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <h4 className="font-bold text-sm leading-tight">{item.name}</h4>
                    <p className="text-xs text-[var(--color-primary)] font-bold mt-0.5">{formatPrice(item.price)}</p>
                  </div>
                  <button 
                    onClick={() => removeItem(item.menuItemId)}
                    className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex items-center justify-between bg-[var(--color-bg-tertiary)] rounded-lg p-1">
                  <div className="flex items-center gap-1">
                    <button 
                      onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}
                      className="w-7 h-7 flex items-center justify-center hover:bg-white/5 rounded-md"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="text-sm font-bold w-6 text-center">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}
                      className="w-7 h-7 flex items-center justify-center hover:bg-white/5 rounded-md"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <span className="text-xs font-black px-2">{formatPrice(item.price * item.quantity)}</span>
                </div>

                <div className="relative">
                  <MessageSquare className="absolute left-2.5 top-2.5 h-3 w-3 text-[var(--color-text-muted)]" />
                  <input 
                    type="text" 
                    placeholder="Add special instructions..."
                    value={item.specialInstructions || ""}
                    onChange={(e) => updateInstructions(item.menuItemId, e.target.value)}
                    className="w-full bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] rounded-lg pl-8 pr-3 py-2 text-[10px] focus:ring-1 focus:ring-[var(--color-primary)] outline-none"
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="p-4 bg-[var(--color-bg)] border-t border-[var(--color-border)] space-y-3">
            <div className="space-y-1.5 px-1">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">Subtotal</span>
                <span>{formatPrice(getTotal())}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">SST (6%)</span>
                <span>{formatPrice(getTax())}</span>
              </div>
              <div className="flex justify-between text-lg font-black border-t border-[var(--color-border)] pt-2 mt-2">
                <span>Total</span>
                <span className="text-[var(--color-primary)]">{formatPrice(getFinalTotal())}</span>
              </div>
            </div>

            <Link 
              href={`/store/${storeSlug}/checkout`}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl gradient-primary text-white font-bold tracking-wider shadow-lg shadow-orange-500/20 hover:opacity-90 active:scale-[0.98] transition-all"
            >
              Checkout <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
