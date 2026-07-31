"use client";

import { useState, useEffect } from "react";
import MenuCard from "@/components/customer/MenuCard";
import CartDrawer from "@/components/customer/CartDrawer";
import { useCart } from "@/hooks/useCart";
import { ShoppingBag, ChevronRight, MapPin, Clock, Info } from "lucide-react";
import { isStoreOpen } from "@/lib/store-hours";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

interface StoreMenuClientProps {
  store: any; // Type according to Prisma include
}

export default function StoreMenuClient({ store }: StoreMenuClientProps) {
  const { setStoreId, items, getTotalItemsCount } = useCart();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);

  useEffect(() => {
    setStoreId(store.id);
    if (store.categories.length > 0) {
      setActiveCategory(store.categories[0].id);
    }
    
    const handleScroll = () => {
      setIsHeaderScrolled(window.scrollY > 200);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [store.id, store.categories, setStoreId]);

  const cartCount = getTotalItemsCount();
  const isOpen = isStoreOpen(store.operatingHours);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] pb-24">
      {/* Hero Banner */}
      <div className="relative h-64 bg-zinc-900 overflow-hidden">
        {store.bannerUrl ? (
          <img src={store.bannerUrl} alt={store.name} className="w-full h-full object-cover opacity-60" />
        ) : (
          <div className="w-full h-full gradient-primary opacity-20" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] to-transparent" />
        
        <div className="absolute bottom-6 left-6 right-6 flex items-end gap-4">
          <div className="h-20 w-20 rounded-2xl bg-white p-1 shadow-2xl shrink-0">
            {store.logoUrl ? (
              <img src={store.logoUrl} alt={store.name} className="w-full h-full object-cover rounded-xl" />
            ) : (
              <div className="w-full h-full bg-zinc-100 rounded-xl flex items-center justify-center font-bold text-zinc-400">
                {store.name[0]}
              </div>
            )}
          </div>
          <div className="mb-1">
            <h1 className="text-2xl font-black text-white drop-shadow-md">{store.name}</h1>
            <div className="flex items-center gap-3 mt-1">
              <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${isOpen ? "bg-green-500/10 text-green-500 border-green-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"}`}>
                {isOpen ? "Open Now" : "Currently Closed"}
              </span>
              <p className="text-xs text-white/70 flex items-center gap-1">
                <Clock className="h-3 w-3" /> {store.avgPrepTimeMins} min prep
              </p>
            </div>
          </div>
        </div>

        <div className="absolute top-6 right-6 z-10">
          <ThemeToggle className="bg-black/20 border-white/20 text-white hover:bg-black/40 hover:border-white/40" />
        </div>
      </div>

      {/* Main Info */}
      <div className="px-6 py-4 flex flex-col gap-2">
        {store.description && (
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed italic">
            "{store.description}"
          </p>
        )}
        <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3 w-3 text-[var(--color-primary)]" />
            {store.address || "Location provided upon pickup"}
          </div>
        </div>
      </div>

      {/* Sticky Categories */}
      <div className={`sticky top-0 z-50 bg-[var(--color-bg)]/80 backdrop-blur-xl border-b border-[var(--color-border)] py-2 transition-shadow ${isHeaderScrolled ? "shadow-lg" : ""}`}>
        <div className="overflow-x-auto flex gap-2 px-6 no-scrollbar">
          {store.categories.map((cat: any) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                activeCategory === cat.id 
                ? "bg-[var(--color-primary)] text-white shadow-lg shadow-orange-500/20" 
                : "bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Menu Grid */}
      <div className="px-6 py-6 space-y-12">
        {store.categories
          .filter((cat: any) => activeCategory === null || activeCategory === cat.id)
          .map((category: any) => (
            <section key={category.id} className="animate-fade-in">
              <h2 className="text-lg font-black mb-4 flex items-center gap-2">
                <div className="h-4 w-1 gradient-primary rounded-full" />
                {category.name}
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {category.menuItems.map((item: any) => (
                  <MenuCard key={item.id} item={item} />
                ))}
              </div>
            </section>
          ))}

        {/* Uncategorized */}
        {store.menuItems.length > 0 && (activeCategory === null) && (
          <section className="animate-fade-in">
            <h2 className="text-lg font-black mb-4 flex items-center gap-2">
              <div className="h-4 w-1 bg-zinc-600 rounded-full" />
              Others
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {store.menuItems.map((item: any) => (
                <MenuCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Floating Cart Button */}
      {cartCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-48px)] max-w-sm z-[100] animate-bounce-in">
          <button
            onClick={() => setIsCartOpen(true)}
            className="flex items-center justify-between w-full h-14 gradient-primary px-6 rounded-2xl text-white font-black shadow-2xl shadow-orange-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingBag className="h-6 w-6" />
                <span className="absolute -top-1 -right-1 bg-white text-[var(--color-primary)] text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-black animate-pulse">
                  {cartCount}
                </span>
              </div>
              <span className="uppercase tracking-widest text-xs">View My Cart</span>
            </div>
            <div className="flex items-center gap-2">
              <ChevronRight className="h-5 w-5" />
            </div>
          </button>
        </div>
      )}

      {/* Cart Drawer */}
      <CartDrawer 
        isOpen={isCartOpen} 
        onClose={() => setIsCartOpen(false)} 
        storeSlug={store.slug} 
      />
    </div>
  );
}
