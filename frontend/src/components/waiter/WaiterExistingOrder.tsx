'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react';
import api from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import type { Order, OrderItem, Table } from '@/lib/types';

interface WaiterExistingOrderProps {
  table: Table;
  onBack: () => void;
  onAddItems: () => void;
}

export function WaiterExistingOrder({ table, onBack, onAddItems }: WaiterExistingOrderProps) {
  const { t } = useI18n();
  const fmt = useFormatCurrency();
  const orderId = table.activeOrder?.id;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadOrder = useCallback(async () => {
    if (!orderId) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadFailed(false);
    try {
      const response = await api.get(`/orders/${orderId}`);
      setOrder(response.data.order as Order);
    } catch {
      setOrder(null);
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void loadOrder(), 0);
    return () => window.clearTimeout(timeout);
  }, [loadOrder]);

  const items = useMemo(
    () => (order?.items || []).filter((item) => item.status !== 'void_adjustment'),
    [order],
  );

  return (
    <main className="min-h-dvh bg-[#f4f1ea] pb-28 text-[#172033]">
      <header className="sticky top-0 z-20 border-b border-black/5 bg-[#f4f1ea]/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('waiter.backToTables')}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-black/10 bg-white text-slate-700 shadow-sm"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-brand">{t('waiter.currentOrder')}</p>
            <h1 className="truncate text-xl font-black tracking-tight">{t('waiter.tableName', { name: table.name })}</h1>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 py-5">
        <div className="mb-4">
          <h2 className="text-lg font-black tracking-tight">{t('waiter.currentItems')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('waiter.currentItemsHint')}</p>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-20 animate-pulse rounded-2xl bg-white/80" />
            ))}
          </div>
        ) : loadFailed ? (
          <div className="rounded-[1.5rem] border border-red-100 bg-white px-5 py-8 text-center shadow-sm">
            <p className="font-bold text-slate-800">{t('waiter.currentOrderLoadFailed')}</p>
            <button
              type="button"
              onClick={() => void loadOrder()}
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-[#172033] px-4 text-sm font-bold text-white"
            >
              <RefreshCw size={16} /> {t('common.retry')}
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-[1.5rem] border border-dashed border-slate-300 bg-white/60 px-5 py-10 text-center text-sm font-semibold text-slate-500">
            {t('waiter.noCurrentItems')}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[1.5rem] border border-black/5 bg-white shadow-[0_8px_24px_rgba(23,32,51,0.06)]">
            {items.map((item: OrderItem) => {
              const removed = item.status === 'cancelled' || item.status === 'voided';
              return (
                <article key={item.id} className={`flex gap-3 border-b border-slate-100 p-4 last:border-b-0 ${removed ? 'opacity-50' : ''}`}>
                  <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-xl bg-brand/10 px-2 text-sm font-black text-brand">
                    {item.quantity}×
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className={`font-extrabold leading-5 ${removed ? 'line-through' : ''}`}>{item.product_name}</h3>
                    {item.addons && item.addons.length > 0 && (
                      <p className="mt-1 text-xs leading-5 text-slate-500">
                        {item.addons.map((addon) => `${addon.quantity || 1}× ${addon.name}`).join(', ')}
                      </p>
                    )}
                    {item.special_instructions && (
                      <p className="mt-1 text-xs italic leading-5 text-slate-500">“{item.special_instructions}”</p>
                    )}
                  </div>
                  <span className="shrink-0 text-sm font-black text-slate-700">{fmt(Number(item.total ?? item.subtotal))}</span>
                </article>
              );
            })}
          </div>
        )}

        {order?.special_instructions && (
          <div className="mt-4 rounded-[1.5rem] border border-black/5 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wider text-slate-500">{t('waiter.orderNotes')}</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">{order.special_instructions}</p>
          </div>
        )}
      </section>

      {!loading && !loadFailed && (
        <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-black/5 bg-white px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(23,32,51,0.06)]">
          <button
            type="button"
            onClick={onAddItems}
            className="mx-auto flex h-15 w-full max-w-xl items-center justify-center gap-2 rounded-2xl bg-brand px-5 text-base font-black text-white shadow-lg shadow-brand/25"
          >
            <Plus size={19} strokeWidth={3} /> {t('waiter.addItems')}
          </button>
        </footer>
      )}
    </main>
  );
}
