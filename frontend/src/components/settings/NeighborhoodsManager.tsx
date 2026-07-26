'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import type { Neighborhood } from '@/lib/types';

export function NeighborhoodsManager() {
  const { t } = useI18n();
  const fmt = useFormatCurrency();
  const [items, setItems] = useState<Neighborhood[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Neighborhood | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', delivery_fee: '0', sort_order: '0' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/neighborhoods?include_inactive=1');
      setItems(res.data.neighborhoods || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const openCreate = () => {
    setForm({ name: '', delivery_fee: '0', sort_order: '0' });
    setCreating(true);
    setEditing(null);
  };

  const openEdit = (n: Neighborhood) => {
    setForm({ name: n.name, delivery_fee: String(n.delivery_fee), sort_order: String(n.sort_order || 0) });
    setEditing(n);
    setCreating(false);
  };

  const close = () => {
    setEditing(null);
    setCreating(false);
    setSaving(false);
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error(t('neighborhoods.nameRequired'));
      return;
    }
    const fee = Number(form.delivery_fee);
    const sortOrder = Number(form.sort_order) || 0;
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/neighborhoods/${editing.id}`, { name, delivery_fee: fee, sort_order: sortOrder, is_active: editing.is_active });
      } else {
        await api.post('/neighborhoods', { name, delivery_fee: fee, sort_order: sortOrder });
      }
      toast.success(t('addresses.saved'));
      close();
      void load();
    } catch (error: unknown) {
      const e = error as { response?: { data?: { error?: string } } };
      const msg = e?.response?.data?.error;
      toast.error(typeof msg === 'string' && msg ? msg : t('addresses.saved'));
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (n: Neighborhood) => {
    if (!window.confirm(t('neighborhoods.confirmDeactivate'))) return;
    try {
      await api.delete(`/neighborhoods/${n.id}`);
      toast.success(t('neighborhoods.deactivated'));
      void load();
    } catch {
      toast.error(t('addresses.saved'));
    }
  };

  const dialogOpen = creating || editing !== null;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-semibold text-gray-900">{t('neighborhoods.title')}</h2>
        <Button onClick={openCreate} size="sm" className="gap-1.5">
          <Plus size={15} /> {t('neighborhoods.add')}
        </Button>
      </div>
      <p className="text-sm text-gray-500 mb-4">{t('neighborhoods.subtitle')}</p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-gray-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">{t('neighborhoods.empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-100">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 font-semibold">{t('neighborhoods.name')}</th>
                <th className="px-4 py-2 font-semibold text-right">{t('neighborhoods.deliveryFee')}</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {items.map((n) => (
                <tr key={n.id} className={!n.is_active ? 'opacity-50' : ''}>
                  <td className="px-4 py-3 font-medium text-gray-900">{n.name}</td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-700">{fmt(Number(n.delivery_fee))}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(n)} className="grid h-8 w-8 place-items-center rounded-lg text-gray-500 hover:bg-gray-100" aria-label={t('neighborhoods.edit')}>
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => void deactivate(n)} className="grid h-8 w-8 place-items-center rounded-lg text-red-500 hover:bg-red-50" aria-label={t('common.delete')}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t('neighborhoods.edit') : t('neighborhoods.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">{t('neighborhoods.name')}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">{t('neighborhoods.deliveryFee')}</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.delivery_fee}
                  onChange={(e) => setForm({ ...form, delivery_fee: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Sort order</label>
                <input
                  type="number"
                  min="0"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={close} disabled={saving}>{t('common.cancel')}</Button>
            <Button onClick={() => void save()} disabled={saving}>{t('common.save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
