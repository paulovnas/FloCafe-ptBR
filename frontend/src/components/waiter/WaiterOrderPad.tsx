'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import AddonModal from '@/components/pos/AddonModal';
import { WaiterExistingOrder } from '@/components/waiter/WaiterExistingOrder';
import type { Addon, CartItem, Category, Product, Table } from '@/lib/types';

interface WaiterOrderPadProps {
  table: Table;
  currency: string;
  onBack: () => void;
  onPlaced: () => void;
}

interface MenuSection {
  id: string;
  name: string;
  products: Product[];
}

let cartSequence = 0;

function cartLineTotal(item: CartItem): number {
  const addonsTotal = item.addons.reduce(
    (sum, addon) => sum + Number(addon.price || 0) * (addon.quantity || 1),
    0,
  );
  return (Number(item.product.price) + addonsTotal) * item.quantity;
}

function apiErrorMessage(error: unknown, fallback: string): string {
  const candidate = error as { response?: { data?: { message?: string; error?: string } } };
  return candidate.response?.data?.message || candidate.response?.data?.error || fallback;
}

export function WaiterOrderPad({ table, currency, onBack, onPlaced }: WaiterOrderPadProps) {
  const { t } = useI18n();
  const fmt = useFormatCurrency();
  const [view, setView] = useState<'current' | 'menu'>(table.activeOrder ? 'current' : 'menu');
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [menuError, setMenuError] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [addonProduct, setAddonProduct] = useState<Product | null>(null);
  const stickyHeaderRef = useRef<HTMLElement>(null);
  const menuTopRef = useRef<HTMLElement>(null);
  const categoryNavRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement> | null>(null);
  const categoryButtonRefs = useRef<Map<string, HTMLButtonElement> | null>(null);

  const loadMenu = useCallback(async () => {
    setLoading(true);
    setMenuError(false);
    try {
      const [categoryResponse, productResponse] = await Promise.all([
        api.get('/categories?active=1'),
        api.get('/products?active=1'),
      ]);
      setCategories(categoryResponse.data.categories || []);
      setProducts(productResponse.data.products || []);
    } catch {
      setMenuError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view !== 'menu') return;
    const timeout = window.setTimeout(() => void loadMenu(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadMenu, view]);

  const menuSections = useMemo<MenuSection[]>(() => {
    const query = search.trim().toLocaleLowerCase();
    const knownCategories = new Map(categories.map((category) => [String(category.id), category]));
    const groupedProducts = new Map<string, Product[]>();
    const otherProducts: Product[] = [];

    for (const product of products) {
      if (query && !`${product.name} ${product.description || ''}`.toLocaleLowerCase().includes(query)) continue;
      const categoryId = String(product.category_id);
      if (!knownCategories.has(categoryId)) {
        otherProducts.push(product);
        continue;
      }
      const group = groupedProducts.get(categoryId);
      if (group) group.push(product);
      else groupedProducts.set(categoryId, [product]);
    }

    const sections: MenuSection[] = [];
    for (const category of categories) {
      const id = String(category.id);
      const categoryProducts = groupedProducts.get(id);
      if (categoryProducts?.length) sections.push({ id, name: category.name, products: categoryProducts });
    }
    if (otherProducts.length) {
      sections.push({ id: '__other', name: t('waiter.otherProducts'), products: otherProducts });
    }
    return sections;
  }, [categories, products, search, t]);

  useEffect(() => {
    if (view !== 'menu') return;
    let frame = 0;

    const syncActiveCategory = () => {
      frame = 0;
      const activationLine = (stickyHeaderRef.current?.getBoundingClientRect().bottom ?? 0) + 12;
      let nextCategory: string | null = null;
      for (const section of menuSections) {
        const element = sectionRefs.current?.get(section.id);
        if (!element) continue;
        if (element.getBoundingClientRect().top <= activationLine) nextCategory = section.id;
        else break;
      }
      setActiveCategory((current) => current === nextCategory ? current : nextCategory);
    };

    const requestSync = () => {
      if (frame === 0) frame = window.requestAnimationFrame(syncActiveCategory);
    };

    const timeout = window.setTimeout(requestSync, 0);
    window.addEventListener('scroll', requestSync, { passive: true });
    window.addEventListener('resize', requestSync);
    return () => {
      window.clearTimeout(timeout);
      if (frame !== 0) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', requestSync);
      window.removeEventListener('resize', requestSync);
    };
  }, [menuSections, view]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const key = activeCategory ?? '__all';
      const button = categoryButtonRefs.current?.get(key);
      const nav = categoryNavRef.current;
      if (!button || !nav) return;
      const left = button.offsetLeft - (nav.clientWidth - button.offsetWidth) / 2;
      nav.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeCategory]);

  const scrollToCategory = (categoryId: string | null) => {
    setActiveCategory(categoryId);
    const target = categoryId === null ? menuTopRef.current : sectionRefs.current?.get(categoryId);
    if (!target) return;
    const headerHeight = stickyHeaderRef.current?.offsetHeight ?? 0;
    const top = window.scrollY + target.getBoundingClientRect().top - headerHeight - 8;
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  };

  const itemCount = useMemo(
    () => cartItems.reduce((sum, item) => sum + item.quantity, 0),
    [cartItems],
  );
  const subtotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + cartLineTotal(item), 0),
    [cartItems],
  );

  const addItem = (product: Product, quantity: number, addons: Addon[], specialInstructions: string) => {
    cartSequence += 1;
    setCartItems((items) => [
      ...items,
      {
        id: `waiter-${product.id}-${cartSequence}`,
        product,
        quantity,
        addons,
        special_instructions: specialInstructions,
      },
    ]);
    toast.success(t('waiter.itemAdded', { name: product.name }));
  };

  const changeQuantity = (itemId: string, delta: number) => {
    setCartItems((items) => items.flatMap((item) => {
      if (item.id !== itemId) return [item];
      const quantity = item.quantity + delta;
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
  };

  const submitOrder = async () => {
    if (cartItems.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      const items = cartItems.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        addons: item.addons.length > 0
          ? item.addons.map((addon) => ({
              id: addon.id,
              name: addon.name,
              price: addon.price,
              quantity: addon.quantity || 1,
            }))
          : null,
        special_instructions: item.special_instructions || null,
      }));

      if (table.activeOrder) {
        await api.post(`/orders/${table.activeOrder.id}/items`, {
          items,
          special_instructions: orderNotes || undefined,
        });
      } else {
        await api.post('/orders', {
          table_id: table.id,
          type: 'dine_in',
          guest_count: 1,
          special_instructions: orderNotes || undefined,
          items,
        });
      }

      setCartItems([]);
      setOrderNotes('');
      setCartOpen(false);
      toast.success(t('waiter.orderConfirmed'));
      onPlaced();
    } catch (error) {
      toast.error(apiErrorMessage(error, t('waiter.orderFailed')));
    } finally {
      setSubmitting(false);
    }
  };

  if (view === 'current' && table.activeOrder) {
    return (
      <WaiterExistingOrder
        table={table}
        onBack={onBack}
        onAddItems={() => setView('menu')}
      />
    );
  }

  return (
    <main className="min-h-dvh bg-[#f4f1ea] pb-28 text-[#172033]">
      <header ref={stickyHeaderRef} className="sticky top-0 z-20 border-b border-black/5 bg-[#f4f1ea]/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (cartItems.length === 0 || window.confirm(t('waiter.discardCartConfirm'))) onBack();
              }}
              aria-label={t('waiter.backToTables')}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-black/10 bg-white text-slate-700 shadow-sm"
            >
              <ArrowLeft size={20} />
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">
                {table.activeOrder ? t('waiter.addItems') : t('waiter.newOrder')}
              </p>
              <h1 className="truncate text-xl font-black tracking-tight">{t('waiter.tableName', { name: table.name })}</h1>
            </div>
            <button
              type="button"
              onClick={() => setCartOpen(true)}
              className="relative flex h-11 items-center gap-2 rounded-2xl bg-[#172033] px-4 font-bold text-white shadow-sm"
            >
              <ShoppingBag size={18} />
              <span>{itemCount}</span>
            </button>
          </div>

          <label className="mt-3 flex h-11 items-center gap-3 rounded-2xl border border-black/5 bg-white px-4 shadow-[0_8px_20px_rgba(23,32,51,0.04)] focus-within:border-brand">
            <Search size={17} className="text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('waiter.searchProducts')}
              className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-400"
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label={t('common.clear')} className="p-1 text-slate-400">
                <X size={17} />
              </button>
            )}
          </label>

          <div
            ref={categoryNavRef}
            role="navigation"
            aria-label={t('waiter.categories')}
            className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <button
              ref={(node) => {
                if (!categoryButtonRefs.current) categoryButtonRefs.current = new Map();
                if (node) categoryButtonRefs.current.set('__all', node);
                else categoryButtonRefs.current.delete('__all');
              }}
              type="button"
              aria-pressed={activeCategory === null}
              onClick={() => scrollToCategory(null)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${activeCategory === null ? 'bg-brand text-white shadow-md shadow-brand/20' : 'border border-black/5 bg-white text-slate-600'}`}
            >
              {t('waiter.allCategories')}
            </button>
            {menuSections.map((section) => (
              <button
                ref={(node) => {
                  if (!categoryButtonRefs.current) categoryButtonRefs.current = new Map();
                  if (node) categoryButtonRefs.current.set(section.id, node);
                  else categoryButtonRefs.current.delete(section.id);
                }}
                key={section.id}
                type="button"
                aria-pressed={activeCategory === section.id}
                onClick={() => scrollToCategory(section.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${activeCategory === section.id ? 'bg-brand text-white shadow-md shadow-brand/20' : 'border border-black/5 bg-white text-slate-600'}`}
              >
                {section.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      <section ref={menuTopRef} className="mx-auto max-w-3xl px-4 py-4">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 7 }, (_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl bg-white/80" />
            ))}
          </div>
        ) : menuError ? (
          <div className="mt-2 rounded-[1.7rem] border border-red-100 bg-white px-6 py-10 text-center shadow-sm">
            <p className="font-bold text-slate-800">{t('waiter.menuLoadFailed')}</p>
            <button type="button" onClick={() => void loadMenu()} className="mt-4 rounded-xl bg-[#172033] px-5 py-3 text-sm font-bold text-white">
              {t('common.retry')}
            </button>
          </div>
        ) : menuSections.length === 0 ? (
          <div className="mt-2 rounded-[1.7rem] border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center text-sm font-semibold text-slate-500">
            {t('waiter.noProducts')}
          </div>
        ) : (
          <div className="space-y-6">
            {menuSections.map((section) => (
              <section
                ref={(node) => {
                  if (!sectionRefs.current) sectionRefs.current = new Map();
                  if (node) sectionRefs.current.set(section.id, node);
                  else sectionRefs.current.delete(section.id);
                }}
                key={section.id}
                aria-labelledby={`waiter-category-${section.id}`}
              >
                <h2 id={`waiter-category-${section.id}`} className="mb-2 px-1 text-lg font-black tracking-tight">
                  {section.name}
                </h2>
                <div className="overflow-hidden rounded-[1.5rem] border border-black/5 bg-white shadow-[0_8px_24px_rgba(23,32,51,0.06)]">
                  {section.products.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => setAddonProduct(product)}
                      className="group flex min-h-20 w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left transition active:bg-slate-50 last:border-b-0"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-extrabold leading-5 text-[#172033]">{product.name}</span>
                        {product.description && (
                          <span className="mt-1 line-clamp-1 block text-xs text-slate-500">{product.description}</span>
                        )}
                        <span className="mt-1.5 block text-sm font-black text-brand">{fmt(Number(product.price))}</span>
                      </span>
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white shadow-md shadow-brand/25 transition group-active:scale-95">
                        <Plus size={18} strokeWidth={3} />
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </section>

      {cartItems.length > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex h-16 w-full max-w-xl items-center justify-between rounded-[1.3rem] bg-brand px-5 text-white shadow-[0_18px_45px_rgba(50,72,255,0.38)]"
          >
            <span className="flex items-center gap-3">
              <span className="grid h-9 min-w-9 place-items-center rounded-xl bg-white/15 px-2 text-sm font-black">{itemCount}</span>
              <span className="text-left">
                <span className="block text-[10px] font-bold uppercase tracking-widest text-white/60">{t('waiter.cart')}</span>
                <span className="font-black">{fmt(subtotal)}</span>
              </span>
            </span>
            <span className="flex items-center gap-1 text-sm font-black">
              {t('waiter.reviewOrder')} <ChevronRight size={18} />
            </span>
          </button>
        </div>
      )}

      {cartOpen && (
        <div className="fixed inset-0 z-40 flex flex-col bg-[#f4f1ea] text-[#172033]">
          <header className="flex items-center justify-between border-b border-black/5 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">{t('waiter.tableName', { name: table.name })}</p>
              <h2 className="text-2xl font-black tracking-tight">{t('waiter.reviewOrder')}</h2>
            </div>
            <button type="button" onClick={() => setCartOpen(false)} aria-label={t('common.close')} className="grid h-11 w-11 place-items-center rounded-2xl bg-white shadow-sm">
              <X size={20} />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <div className="mx-auto max-w-xl space-y-3">
              {cartItems.map((item) => (
                <article key={item.id} className="rounded-[1.5rem] border border-black/5 bg-white p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-extrabold leading-5">{item.product.name}</h3>
                      {item.addons.length > 0 && (
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {item.addons.map((addon) => `${addon.quantity || 1}× ${addon.name}`).join(', ')}
                        </p>
                      )}
                      {item.special_instructions && (
                        <p className="mt-1 text-xs italic text-slate-500">“{item.special_instructions}”</p>
                      )}
                      <p className="mt-2 text-sm font-black text-brand">{fmt(cartLineTotal(item))}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCartItems((items) => items.filter((candidate) => candidate.id !== item.id))}
                      aria-label={t('common.remove')}
                      className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-50 text-red-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
                    <button type="button" onClick={() => changeQuantity(item.id, -1)} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 text-slate-700">
                      <Minus size={16} />
                    </button>
                    <span className="w-6 text-center text-base font-black">{item.quantity}</span>
                    <button type="button" onClick={() => changeQuantity(item.id, 1)} className="grid h-9 w-9 place-items-center rounded-xl bg-[#172033] text-white">
                      <Plus size={16} />
                    </button>
                  </div>
                </article>
              ))}

              <label className="block rounded-[1.5rem] border border-black/5 bg-white p-4 shadow-sm">
                <span className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-500">{t('waiter.orderNotes')}</span>
                <textarea
                  value={orderNotes}
                  onChange={(event) => setOrderNotes(event.target.value)}
                  rows={3}
                  placeholder={t('waiter.orderNotesPlaceholder')}
                  className="w-full resize-none bg-transparent text-base outline-none placeholder:text-slate-300"
                />
              </label>
            </div>
          </div>

          <footer className="border-t border-black/5 bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(23,32,51,0.06)]">
            <div className="mx-auto max-w-xl">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-500">{t('common.subtotal')}</span>
                <span className="text-xl font-black">{fmt(subtotal)}</span>
              </div>
              <button
                type="button"
                onClick={() => void submitOrder()}
                disabled={cartItems.length === 0 || submitting}
                className="flex h-15 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-base font-black text-white shadow-lg shadow-brand/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? t('waiter.sendingOrder') : table.activeOrder ? t('waiter.addToOrder') : t('waiter.sendOrder')}
                {!submitting && <Check size={19} strokeWidth={3} />}
              </button>
            </div>
          </footer>
        </div>
      )}

      {addonProduct && (
        <AddonModal
          product={addonProduct}
          currency={currency}
          onAdd={addItem}
          onClose={() => setAddonProduct(null)}
        />
      )}
    </main>
  );
}
