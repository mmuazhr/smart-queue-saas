"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface CartItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  specialInstructions?: string;
}

interface CartStore {
  storeId: string | null;
  items: CartItem[];
  setStoreId: (id: string) => void;
  addItem: (item: CartItem) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  updateInstructions: (itemId: string, instructions: string) => void;
  removeItem: (itemId: string) => void;
  clearCart: () => void;
  getTotal: () => number;
  getTax: () => number;
  getFinalTotal: () => number;
  getItemCount: (itemId: string) => number;
  getTotalItemsCount: () => number;
}

export const useCart = create<CartStore>()(
  persist(
    (set, get) => ({
      storeId: null,
      items: [],
      
      setStoreId: (id) => {
        // If switching stores, clear cart
        if (get().storeId !== id) {
          set({ storeId: id, items: [] });
        }
      },

      addItem: (newItem) => {
        const existingItems = get().items;
        const existingItem = existingItems.find((i) => i.menuItemId === newItem.menuItemId);

        if (existingItem) {
          set({
            items: existingItems.map((i) =>
              i.menuItemId === newItem.menuItemId
                ? { ...i, quantity: i.quantity + newItem.quantity }
                : i
            ),
          });
        } else {
          set({ items: [...existingItems, newItem] });
        }
      },

      updateQuantity: (itemId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(itemId);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.menuItemId === itemId ? { ...i, quantity } : i
          ),
        });
      },

      updateInstructions: (itemId, specialInstructions) => {
        set({
          items: get().items.map((i) =>
            i.menuItemId === itemId ? { ...i, specialInstructions } : i
          ),
        });
      },

      removeItem: (itemId) => {
        set({
          items: get().items.filter((i) => i.menuItemId !== itemId),
        });
      },

      clearCart: () => set({ items: [] }),

      getTotal: () => {
        return get().items.reduce((sum, i) => sum + i.price * i.quantity, 0);
      },

      getTax: () => get().getTotal() * 0.06, // 6% SST

      getFinalTotal: () => get().getTotal() + get().getTax(),

      getItemCount: (itemId) => {
        return get().items.find((i) => i.menuItemId === itemId)?.quantity || 0;
      },

      getTotalItemsCount: () => {
        return get().items.reduce((sum, i) => sum + i.quantity, 0);
      },
    }),
    {
      name: "smart-queue-cart",
      storage: createJSONStorage(() => localStorage),
    }
  )
);
