"use client";

import { useCart } from "@/hooks/useCart";
import { formatPrice } from "@/lib/utils";
import { Plus, Minus, Info, ImageIcon } from "lucide-react";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  isAvailable: boolean;
  imageUrl?: string | null;
}

export default function MenuCard({ item }: { item: MenuItem }) {
  const { addItem, updateQuantity, getItemCount } = useCart();
  const count = getItemCount(item.id);

  return (
    <div className={`glass rounded-2xl overflow-hidden flex flex-col transition-all duration-300 ${!item.isAvailable ? "opacity-60 grayscale-[0.5]" : "hover:shadow-xl hover:translate-y-[-2px]"}`}>
      <div className="relative h-40 bg-[var(--color-bg-tertiary)] flex items-center justify-center text-zinc-600 overflow-hidden">
        {item.imageUrl ? (
          <img 
            src={item.imageUrl} 
            alt={item.name} 
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-110" 
          />
        ) : (
          <ImageIcon className="h-10 w-10 opacity-20" />
        )}
        {!item.isAvailable && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
            <span className="bg-red-500 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full shadow-lg">
              Sold Out
            </span>
          </div>
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-1 gap-2">
          <h3 className="font-bold text-[var(--color-text)] leading-tight">{item.name}</h3>
          <span className="text-sm font-black text-[var(--color-primary)] whitespace-nowrap">
            {formatPrice(item.price)}
          </span>
        </div>

        {item.description && (
          <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 mt-1 flex-1">
            {item.description}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between">
          {!item.isAvailable ? (
            <button disabled className="w-full py-2 rounded-xl bg-zinc-800 text-zinc-500 text-xs font-bold uppercase">
              Unavailable
            </button>
          ) : count > 0 ? (
            <div className="flex items-center justify-between w-full bg-[var(--color-bg-tertiary)] rounded-xl px-1 py-1">
              <button 
                onClick={() => updateQuantity(item.id, count - 1)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
                aria-label="Decrease quantity"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="font-bold text-sm w-8 text-center">{count}</span>
              <button 
                onClick={() => updateQuantity(item.id, count + 1)}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors"
                aria-label="Increase quantity"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => addItem({
                menuItemId: item.id,
                name: item.name,
                price: item.price,
                quantity: 1
              })}
              className="w-full py-2.5 rounded-xl gradient-primary text-white text-xs font-bold uppercase tracking-wider shadow-lg shadow-orange-500/20 active:scale-95 transition-all"
            >
              Add to Cart
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
