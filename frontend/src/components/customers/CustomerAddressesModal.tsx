'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Star, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import { Button } from '@/components/ui/button';
import type { CustomerAddress, Neighborhood } from '@/lib/types';

interface CustomerAddressesModalProps {
  customerId: string | number;
  customerName: string;
  onClose: () => void;
}

export function CustomerAddressesModal({ customerId, customerName, onClose }: CustomerAddressesModalProps) {
  const { t } = useI18n();
  const fmt = useFormatCurrency();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CustomerAddress | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    label: '',
    street: '',
    number: '',
    complement: '',
    reference: '',
    neighborhood_id: '',
    is_default: false,
  });
  const [saving, setSaving] = useState(false);
  // Quick neighborhood create (inline, opened from the address form)
  const [quickNeighborhood, setQuickNeighborhood] = useState({ open: false, name: '', fee: '0' });
  const [quickSaving, setQuickSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [addrRes, nbRes] = await Promise.all([
        api.get('/customer-addresses', { params: { customer_id: customerId } }),
        api.get('/neighborhoods'),
      ]);
      setAddresses(addrRes.data.addresses || []);
      setNeighborhoods(nbRes.data.neighborhoods || []);
    } catch {
      setAddresses([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const openCreate = () => {
    setForm({ label: '', street: '', number: '', complement: '', reference: '', neighborhood_id: '', is_default: false });
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (a: CustomerAddress) => {
    setForm({
      label: a.label || '',
      street: a.street || '',
      number: a.number || '',
      complement: a.complement || '',
      reference: a.reference || '',
      neighborhood_id: a.neighborhood_id ? String(a.neighborhood_id) : '',
      is_default: a.is_default,
    });
    setEditing(a);
    setCreating(false);
  };

  const closeForm = () => {
    setEditing(null);
    setCreating(false);
    setSaving(false);
  };

  const save = async () => {
    if (!form.neighborhood_id) {
      toast.error(t('addresses.neighborhoodRequired'));
      return;
    }
    setSaving(true);
    const payload = {
      label: form.label.trim() || null,
      street: form.street.trim() || null,
      number: form.number.trim() || null,
      complement: form.complement.trim() || null,
      reference: form.reference.trim() || null,
      neighborhood_id: Number(form.neighborhood_id),
      is_default: form.is_default,
    };
    try {
      if (editing) {
        await api.put(`/customer-addresses/${editing.id}`, payload);
      } else {
        await api.post('/customer-addresses', { ...payload, customer_id: customerId });
      }
      toast.success(t('addresses.saved'));
      closeForm();
      void load();
    } catch (error: unknown) {
      const e = error as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || t('addresses.saved'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (a: CustomerAddress) => {
    try {
      await api.delete(`/customer-addresses/${a.id}`);
      toast.success(t('addresses.deleted'));
      void load();
    } catch {
      toast.error(t('addresses.saved'));
    }
  };

  const saveQuickNeighborhood = async () => {
    const name = quickNeighborhood.name.trim();
    if (!name) return;
    setQuickSaving(true);
    try {
      const res = await api.post('/neighborhoods', { name, delivery_fee: Number(quickNeighborhood.fee) || 0 });
      const nb = res.data.neighborhood as Neighborhood;
      setNeighborhoods((list) => [...list, nb].sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error: unknown) {
      const e = error as { response?: { data?: { error?: string } } };
      toast.error(e?.response?.data?.error || t('neighborhoods.duplicate'));
    } finally {
      setQuickSaving(false);
    }
  };

  const formOpen = creating || editing !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{t('addresses.title')}</h2>
            <p className="truncate text-sm text-gray-500">{customerName}</p>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-lg text-gray-400 hover:bg-gray-100" aria-label={t('common.close')}>
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 2 }, (_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-gray-100" />
              ))}
            </div>
          ) : addresses.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">{t('addresses.empty')}</p>
          ) : (
            <div className="space-y-2">
              {addresses.map((a) => (
                <div key={a.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {a.label && <span className="text-sm font-semibold text-gray-900">{a.label}</span>}
                        {a.is_default && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            <Star size={9} className="fill-amber-500 stroke-amber-500" /> {t('addresses.default')}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-gray-700">
                        {[a.street, a.number && `, ${a.number}`].filter(Boolean).join('')}
                        {a.complement && <span className="text-gray-500"> — {a.complement}</span>}
                      </p>
                      <p className="text-xs text-gray-500">
                        {a.neighborhood_name || '—'}
                        {typeof a.delivery_fee === 'number' && a.delivery_fee > 0 && (
                          <span className="ml-1 text-gray-400">· {fmt(a.delivery_fee)}</span>
                        )}
                      </p>
                      {a.reference && <p className="mt-0.5 text-xs italic text-gray-400">“{a.reference}”</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => openEdit(a)} className="grid h-8 w-8 place-items-center rounded-lg text-gray-400 hover:bg-gray-100" aria-label={t('addresses.edit')}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => void remove(a)} className="grid h-8 w-8 place-items-center rounded-lg text-red-400 hover:bg-red-50" aria-label={t('common.delete')}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {formOpen && (
            <div className="mt-4 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t('addresses.label')}</label>
                  <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={t('addresses.labelPlaceholder')} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t('addresses.neighborhood')}</label>
                  <div className="flex gap-2">
                    <select value={form.neighborhood_id} onChange={(e) => setForm({ ...form, neighborhood_id: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand">
                      <option value="">{t('addresses.selectNeighborhood')}</option>
                      {neighborhoods.map((nb) => (
                        <option key={nb.id} value={nb.id}>{nb.name} — {fmt(nb.delivery_fee)}</option>
                      ))}
                    </select>
                    <Button type="button" variant="outline" size="icon" onClick={() => setQuickNeighborhood({ open: true, name: '', fee: '0' })} aria-label={t('addresses.addNeighborhood')}>
                      <Plus size={15} />
                    </Button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t('addresses.street')}</label>
                  <input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t('addresses.number')}</label>
                  <input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t('addresses.complement')}</label>
                  <input value={form.complement} onChange={(e) => setForm({ ...form, complement: e.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">{t('addresses.reference')}</label>
                  <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.is_default} onChange={(e) => setForm({ ...form, is_default: e.target.checked })} className="rounded border-gray-300 text-brand focus:ring-brand" />
                {t('addresses.setAsDefault')}
              </label>

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={closeForm} disabled={saving}>{t('common.cancel')}</Button>
                <Button size="sm" onClick={() => void save()} disabled={saving}>{t('common.save')}</Button>
              </div>

              {quickNeighborhood.open && (
                <div className="mt-2 space-y-2 rounded-lg border border-brand/20 bg-white p-3">
                  <p className="text-xs font-semibold text-gray-700">{t('neighborhoods.add')}</p>
                  <div className="flex gap-2">
                    <input value={quickNeighborhood.name} onChange={(e) => setQuickNeighborhood({ ...quickNeighborhood, name: e.target.value })} placeholder={t('neighborhoods.name')} className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand" />
                    <input value={quickNeighborhood.fee} onChange={(e) => setQuickNeighborhood({ ...quickNeighborhood, fee: e.target.value })} type="number" step="0.01" min="0" placeholder={t('neighborhoods.deliveryFee')} className="w-28 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand" />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setQuickNeighborhood({ open: false, name: '', fee: '0' })} disabled={quickSaving}>{t('common.cancel')}</Button>
                    <Button size="sm" onClick={() => void saveQuickNeighborhood()} disabled={quickSaving || !quickNeighborhood.name.trim()}>{t('common.save')}</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 px-5 py-3">
          <Button onClick={openCreate} className="w-full gap-1.5" disabled={formOpen}>
            <Plus size={15} /> {t('addresses.add')}
          </Button>
        </div>
      </div>
    </div>
  );
}
