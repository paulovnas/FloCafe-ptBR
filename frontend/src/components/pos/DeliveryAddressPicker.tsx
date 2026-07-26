'use client';

import { MapPin, Star, Check } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useFormatCurrency } from '@/hooks/useFormatCurrency';
import type { CustomerAddress } from '@/lib/types';

interface DeliveryAddressPickerProps {
  addresses: CustomerAddress[];
  selectedId: number | null;
  onSelect: (addr: CustomerAddress) => void;
}

/**
 * Delivery destination picker for the POS cart. Lists the customer's saved
 * addresses as selectable cards (default one is badged). No free-text input —
 * the address must come from the customer's saved addresses. The cashier can
 * add/edit addresses via the customer sidebar.
 */
export function DeliveryAddressPicker({ addresses, selectedId, onSelect }: DeliveryAddressPickerProps) {
  const { t } = useI18n();
  const fmt = useFormatCurrency();

  if (addresses.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 px-3 py-3 text-center text-xs text-gray-400">
        {t('delivery.noAddresses')}
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {addresses.map((a) => {
        const selected = a.id === selectedId;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a)}
            className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
              selected
                ? 'border-brand bg-brand/5'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <MapPin size={14} className={`mt-0.5 shrink-0 ${selected ? 'text-brand' : 'text-gray-400'}`} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {a.label && <span className="text-xs font-semibold text-gray-900">{a.label}</span>}
                    {a.is_default && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                        <Star size={8} className="fill-amber-500 stroke-amber-500" /> {t('addresses.default')}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-700 break-words">
                    {[a.street, a.number].filter(Boolean).join(', ')}
                    {a.complement && <span className="text-gray-500"> — {a.complement}</span>}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {a.neighborhood_name || '—'}
                    {typeof a.delivery_fee === 'number' && a.delivery_fee > 0 && (
                      <span className="ml-1 text-gray-400">· {fmt(a.delivery_fee)}</span>
                    )}
                  </p>
                </div>
              </div>
              {selected && <Check size={15} className="shrink-0 text-brand mt-0.5" />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
