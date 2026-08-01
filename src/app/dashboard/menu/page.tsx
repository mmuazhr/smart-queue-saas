"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Edit2, Trash2, Check, X, ChevronDown, ChevronUp, Image as ImageIcon, Loader2 } from "lucide-react";
import { formatPrice, isHttpUrl } from "@/lib/utils";

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  isAvailable: boolean;
  categoryId: string | null;
  imageUrl?: string | null;
}

interface Category {
  id: string;
  name: string;
  menuItems: MenuItem[];
}

export default function MenuManagementPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [uncategorized, setUncategorized] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [noStore, setNoStore] = useState(false);
  
  // Modal states
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");

  const fetchMenu = useCallback(async () => {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/stores/${storeId}/menu`);
      const data = await res.json();
      if (data.success) {
        setCategories(data.data.categories);
        setUncategorized(data.data.uncategorized);
      }
    } catch (error) {
      console.error("Failed to fetch menu:", error);
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    async function init() {
      const res = await fetch("/api/stores");
      const data = await res.json();
      if (data.success && data.data.length > 0) {
        setStoreId(data.data[0].id);
      } else {
        // No store yet — stop the spinner and show the create-store pointer
        setNoStore(true);
        setLoading(false);
      }
    }
    init();
  }, []);

  useEffect(() => {
    if (storeId) fetchMenu();
  }, [storeId, fetchMenu]);

  async function toggleAvailability(itemId: string, currentStatus: boolean) {
    if (!storeId) return;
    try {
      const res = await fetch(`/api/stores/${storeId}/menu/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAvailable: !currentStatus }),
      });
      if (res.ok) fetchMenu();
    } catch (error) {
      console.error("Failed to toggle availability:", error);
    }
  }

  async function deleteItem(itemId: string) {
    if (!window.confirm("Are you sure you want to delete this item?")) return;
    if (!storeId) return;
    try {
      const res = await fetch(`/api/stores/${storeId}/menu/${itemId}`, {
        method: "DELETE",
      });
      if (res.ok) fetchMenu();
    } catch (error) {
      console.error("Failed to delete item:", error);
    }
  }

  async function handleItemSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId || !editingItem) return;

    const method = editingItem.id ? "PUT" : "POST";
    const url = editingItem.id 
      ? `/api/stores/${storeId}/menu/${editingItem.id}` 
      : `/api/stores/${storeId}/menu`;

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingItem),
      });
      if (res.ok) {
        setIsItemModalOpen(false);
        fetchMenu();
      }
    } catch (error) {
      console.error("Failed to save item:", error);
    }
  }

  async function handleAddCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId || !newCategoryName) return;

    try {
      const res = await fetch(`/api/stores/${storeId}/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName }),
      });
      if (res.ok) {
        setIsCategoryModalOpen(false);
        setNewCategoryName("");
        fetchMenu();
      }
    } catch (error) {
      console.error("Failed to add category:", error);
    }
  }

  if (noStore) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-[var(--color-text-secondary)]">
          You don&apos;t have a store yet — create one to start building your menu.
        </p>
        <Link href="/dashboard/settings" className="rounded-xl gradient-primary px-5 py-2.5 text-sm font-bold text-white">
          Create your store
        </Link>
      </div>
    );
  }
  if (loading) return <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[var(--color-primary)]" /></div>;

  return (
    <div className="animate-fade-in max-w-6xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Menu Management</h1>
          <p className="text-sm text-[var(--color-text-muted)]">Organize your categories and menu items</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setIsCategoryModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-bg-tertiary)] transition-all text-sm font-medium"
          >
            <Plus className="h-4 w-4" /> Add Category
          </button>
          <button 
            onClick={() => {
              setEditingItem({ name: "", price: 0, isAvailable: true, categoryId: categories[0]?.id || null, imageUrl: "" });
              setIsItemModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white font-medium gradient-primary transition-all hover:opacity-90 text-sm"
          >
            <Plus className="h-4 w-4" /> Add Item
          </button>
        </div>
      </div>

      <div className="space-y-10">
        {categories.map((category) => (
          <section key={category.id}>
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-lg font-bold text-[var(--color-primary)]">{category.name}</h2>
              <div className="h-px flex-1 bg-[var(--color-border)]" />
              <span className="text-xs text-[var(--color-text-muted)] font-medium uppercase tracking-wider">
                {category.menuItems.length} Items
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {category.menuItems.map((item) => (
                <div key={item.id} className={`glass rounded-2xl p-4 flex flex-col transition-all ${!item.isAvailable ? "opacity-60" : ""}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="h-16 w-full rounded-xl bg-[var(--color-bg-tertiary)] flex items-center justify-center text-[var(--color-text-muted)] overflow-hidden">
                      {isHttpUrl(item.imageUrl) ? (
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="h-6 w-6 opacity-20" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1 ml-2">
                      <button
                        onClick={() => { setEditingItem({ ...item, imageUrl: isHttpUrl(item.imageUrl) ? item.imageUrl : "" }); setIsItemModalOpen(true); }}
                        aria-label={`Edit ${item.name}`}
                        className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-all"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        aria-label={`Delete ${item.name}`}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  <h3 className="font-semibold text-[var(--color-text)] line-clamp-1">{item.name}</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1 line-clamp-2 min-h-[2rem]">
                    {item.description || "No description provided."}
                  </p>

                  <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--color-primary)]">{formatPrice(item.price)}</span>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-tighter text-[var(--color-text-muted)]">
                        {item.isAvailable ? "Available" : "Sold Out"}
                      </span>
                      <button
                        onClick={() => toggleAvailability(item.id, item.isAvailable)}
                        aria-label={item.isAvailable ? `Mark ${item.name} as sold out` : `Mark ${item.name} as available`}
                        className={`w-10 h-5 rounded-full relative transition-all ${item.isAvailable ? "gradient-primary" : "bg-gray-600"}`}
                      >
                        <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${item.isAvailable ? "right-1" : "left-1"}`} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              <button 
                onClick={() => {
                  setEditingItem({ name: "", price: 0, isAvailable: true, categoryId: category.id, imageUrl: "" });
                  setIsItemModalOpen(true);
                }}
                className="rounded-2xl border-2 border-dashed border-[var(--color-border)] p-4 flex flex-col items-center justify-center gap-2 text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-all min-h-[160px]"
              >
                <Plus className="h-6 w-6" />
                <span className="text-sm font-medium">Add to {category.name}</span>
              </button>
            </div>
          </section>
        ))}

        {uncategorized.length > 0 && (
          <section>
            <h2 className="text-lg font-bold text-[var(--color-text-secondary)] mb-4">Uncategorized</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uncategorized.map((item) => (
                <div key={item.id} className="glass rounded-2xl p-4 flex flex-col">
                   <div className="flex justify-between items-start mb-3">
                    <div className="h-16 w-full rounded-xl bg-[var(--color-bg-tertiary)] flex items-center justify-center text-[var(--color-text-muted)] overflow-hidden">
                      {isHttpUrl(item.imageUrl) ? (
                        <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="h-6 w-6 opacity-20" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1 ml-2">
                      <button
                        onClick={() => { setEditingItem({ ...item, imageUrl: isHttpUrl(item.imageUrl) ? item.imageUrl : "" }); setIsItemModalOpen(true); }}
                        aria-label={`Edit ${item.name}`}
                        className="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-all"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => deleteItem(item.id)}
                        aria-label={`Delete ${item.name}`}
                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <h3 className="font-semibold">{item.name}</h3>
                   <div className="mt-4 flex items-center justify-between">
                    <span className="text-sm font-bold text-[var(--color-primary)]">{formatPrice(item.price)}</span>
                    <button
                      onClick={() => toggleAvailability(item.id, item.isAvailable)}
                      aria-label={item.isAvailable ? `Mark ${item.name} as sold out` : `Mark ${item.name} as available`}
                      className={`w-10 h-5 rounded-full relative transition-all ${item.isAvailable ? "gradient-primary" : "bg-gray-600"}`}
                    >
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${item.isAvailable ? "right-1" : "left-1"}`} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Item Modal */}
      {isItemModalOpen && editingItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass w-full max-w-md rounded-2xl p-6 shadow-2xl animate-slide-up max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-6">{editingItem.id ? "Edit Item" : "New Menu Item"}</h2>
            <form onSubmit={handleItemSubmit} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Item Name</label>
                <input 
                  required
                  type="text" 
                  value={editingItem.name} 
                  onChange={(e) => setEditingItem({...editingItem, name: e.target.value})}
                  className="w-full rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm bg-transparent"
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-1.5 block">Product Photo</label>
                <div className="flex flex-col gap-3">
                  <div className="flex gap-3">
                    <div className="h-12 w-12 shrink-0 rounded-lg bg-[var(--color-bg-tertiary)] flex items-center justify-center overflow-hidden border border-[var(--color-border)]">
                      {editingItem.imageUrl ? (
                        <img src={editingItem.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="h-6 w-6 opacity-20" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => document.getElementById("file-upload")?.click()}
                          className="flex-1 px-3 py-2 rounded-lg border border-[var(--color-border)] text-xs font-bold hover:bg-[var(--color-bg-tertiary)] transition-all flex items-center justify-center gap-2"
                        >
                          <Plus className="h-3 w-3" /> Upload from Device
                        </button>
                        <input
                          id="file-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;

                            const formData = new FormData();
                            formData.append("file", file);

                            try {
                              const res = await fetch("/api/upload", {
                                method: "POST",
                                body: formData,
                              });
                              const data = await res.json();
                              if (data.success) {
                                setEditingItem({ ...editingItem, imageUrl: data.data.url });
                              } else {
                                alert(data.error || "Upload failed");
                              }
                            } catch (err) {
                              console.error("Upload failed", err);
                              alert("An unexpected error occurred during upload.");
                            }
                          }}
                        />
                      </div>
                      <input 
                        type="text" 
                        placeholder="Or paste an image URL instead..."
                        value={editingItem.imageUrl || ""} 
                        onChange={(e) => setEditingItem({...editingItem, imageUrl: e.target.value})}
                        className="w-full rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[10px] bg-transparent font-mono"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-[var(--color-text-muted)] italic">Square photos (e.g. 500x500) look best on the menu.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Price (MYR)</label>
                  <input 
                    required
                    type="number" step="0.01"
                    value={editingItem.price} 
                    onChange={(e) => setEditingItem({...editingItem, price: parseFloat(e.target.value)})}
                    className="w-full rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm bg-transparent"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Category</label>
                  <select 
                    value={editingItem.categoryId || ""} 
                    onChange={(e) => setEditingItem({...editingItem, categoryId: e.target.value || null})}
                    className="w-full rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm bg-[var(--color-bg-secondary)] text-[var(--color-text)] appearance-none cursor-pointer focus:ring-2 focus:ring-[var(--color-primary)] outline-none"
                  >
                    <option value="">Uncategorized</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Description</label>
                <textarea 
                  value={editingItem.description || ""} 
                  onChange={(e) => setEditingItem({...editingItem, description: e.target.value})}
                  className="w-full rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm bg-transparent"
                  rows={2}
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setIsItemModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-xl border border-[var(--color-border)] font-medium"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-xl text-white font-medium gradient-primary"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="glass w-full max-w-sm rounded-2xl p-6 shadow-2xl animate-slide-up">
            <h2 className="text-xl font-bold mb-6">Add New Category</h2>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Category Name</label>
                <input 
                  required
                  autoFocus
                  type="text" 
                  placeholder="e.g. Western Food, Desserts"
                  value={newCategoryName} 
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm bg-transparent"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="flex-1 px-4 py-2 rounded-xl border border-[var(--color-border)] font-medium"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 px-4 py-2 rounded-xl text-white font-medium gradient-primary"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
