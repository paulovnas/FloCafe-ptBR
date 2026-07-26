'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { CustomerAddressesSection } from '@/components/customers/CustomerAddressesSection';
import { useAuthStore } from '@/store/auth';
import { useI18n } from '@/hooks/useI18n';
import { dialCodeFor, parsePhone } from '@/lib/phone';
import { countryName } from '@/lib/countries';
import api from '@/lib/api';
import type { Customer } from '@/lib/types';

interface CustomerFormSheetProps {
  open: boolean;
  /** When set, edits this customer; when null, creates a new one. */
  customer: Customer | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (customer: Customer) => void;
}

export function CustomerFormSheet({ open, customer, onOpenChange, onSaved }: CustomerFormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        {/* Keyed by customer id (or 'new') so the form state resets cleanly when
            switching between customers or create-mode — no effect-based sync. */}
        <CustomerFormBody
          key={customer?.id ?? 'new'}
          customer={customer}
          onSaved={onSaved}
          onOpenChange={onOpenChange}
        />
      </SheetContent>
    </Sheet>
  );
}

function CustomerFormBody({ customer, onSaved, onOpenChange }: Omit<CustomerFormSheetProps, 'open'>) {
  const { currentTenant } = useAuthStore();
  const { t } = useI18n();
  const defaultCountry = currentTenant?.country || 'IN';
  const dialCode = dialCodeFor(defaultCountry) || '+91';
  const [form, setForm] = useState({
    name: customer?.name || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    country_code: customer?.country_code || dialCode,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const parsed = parsePhone(form.phone, defaultCountry);
    if (form.phone && !parsed) {
      toast.error(t('pos.invalidPhone', { country: countryName(defaultCountry) }));
      return;
    }
    const payload = {
      name: form.name.trim(),
      phone: parsed ? parsed.e164 : form.phone.trim(),
      email: form.email.trim() || null,
      country_code: parsed ? parsed.countryCode : form.country_code,
    };
    if (!payload.name) {
      toast.error(t('pos.nameRequired', { defaultValue: 'Name is required' }));
      return;
    }
    setSaving(true);
    try {
      let saved: Customer;
      if (customer) {
        const { data } = await api.put(`/customers/${customer.id}`, payload);
        saved = data.customer;
        toast.success(t('customer.updated'));
      } else {
        const { data } = await api.post('/customers', payload);
        saved = data.customer;
        toast.success(t('customer.added'));
      }
      onSaved(saved);
      onOpenChange(false);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string; message?: string } } };
      toast.error(error.response?.data?.error || error.response?.data?.message || t('customer.saveFailed'));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <SheetHeader className="border-b border-gray-100 px-6 pb-4 pt-5">
          <SheetTitle>{customer ? t('customer.edit') : t('customer.add')}</SheetTitle>
          <SheetDescription className="sr-only">
            {customer ? t('customer.edit') : t('customer.add')}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          {/* Customer data */}
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">{t('customer.name')}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t('customer.name')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">{t('customer.phone')}</label>
              <input
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder={dialCode ? `${dialCode} ${t('customer.phone')}` : t('customer.phone')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">{t('customer.email')}</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder={`${t('customer.email')} (${t('common.optional')})`}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
          </div>

          {/* Addresses — only when editing an existing customer (needs an id). */}
          {customer && (
            <div className="border-t border-gray-100 pt-5">
              <CustomerAddressesSection customerId={customer.id} onChanged={() => onSaved(customer)} />
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-gray-100 px-6 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} className="flex-1">
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving} className="flex-1">
            {saving ? t('pos.loadingEllipsis') : customer ? t('customer.update') : t('customer.add')}
          </Button>
        </div>
    </>
  );
}
