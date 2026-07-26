'use client';

import { ChevronRight, LogOut, RefreshCw, Users } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { TABLE_STATUS_LABEL_KEYS } from '@/lib/i18n-enums';
import type { Table } from '@/lib/types';

interface WaiterTablePickerProps {
  businessName: string;
  userName: string;
  tables: Table[];
  loading: boolean;
  onSelect: (table: Table) => void;
  onRefresh: () => void;
  onLogout: () => void;
}

// Whole-card color cue per status: free tables read green at a glance,
// occupied amber, reserved blue, cleaning grey, held violet.
const CARD_STYLES: Record<Table['status'], string> = {
  available: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  occupied: 'border-amber-300 bg-amber-50 text-amber-900',
  reserved: 'border-sky-300 bg-sky-50 text-sky-900',
  cleaning: 'border-slate-300 bg-slate-100 text-slate-700',
  held: 'border-violet-300 bg-violet-50 text-violet-900',
};
const BADGE_STYLES: Record<Table['status'], string> = {
  available: 'border-emerald-400/60 bg-emerald-100/70 text-emerald-800',
  occupied: 'border-amber-400/60 bg-amber-100/70 text-amber-800',
  reserved: 'border-sky-400/60 bg-sky-100/70 text-sky-800',
  cleaning: 'border-slate-400/60 bg-slate-200/70 text-slate-600',
  held: 'border-violet-400/60 bg-violet-100/70 text-violet-800',
};

function canOpenTable(table: Table): boolean {
  if (table.activeOrder) return true;
  return table.status === 'available' || table.status === 'reserved';
}

export function WaiterTablePicker({
  businessName,
  userName,
  tables,
  loading,
  onSelect,
  onRefresh,
  onLogout,
}: WaiterTablePickerProps) {
  const { t } = useI18n();

  return (
    <main className="min-h-dvh bg-[#f4f1ea] text-[#172033]">
      <header className="sticky top-0 z-20 border-b border-black/5 bg-[#f4f1ea]/95 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-bold uppercase tracking-[0.18em] text-brand">{businessName}</p>
            <h1 className="truncate text-2xl font-black tracking-tight">{t('waiter.chooseTable')}</h1>
            <p className="truncate text-sm text-slate-500">{t('waiter.signedInAs', { name: userName })}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              aria-label={t('common.refresh')}
              className="grid h-11 w-11 place-items-center rounded-2xl border border-black/10 bg-white text-slate-600 shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={onLogout}
              aria-label={t('nav.logout')}
              className="grid h-11 w-11 place-items-center rounded-2xl bg-[#172033] text-white shadow-sm"
            >
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-2xl px-4 py-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-slate-500">{t('waiter.tablePrompt')}</p>
            <p className="mt-1 text-xs text-slate-400">{t('waiter.tableAvailabilityHint')}</p>
          </div>
          <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-500 shadow-sm">
            {t('waiter.tableCount', { count: tables.length })}
          </span>
        </div>

        {loading && tables.length === 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-36 animate-pulse rounded-[1.7rem] bg-white/80" />
            ))}
          </div>
        ) : tables.length === 0 ? (
          <div className="rounded-[1.7rem] border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
            <p className="font-bold text-slate-700">{t('waiter.noTables')}</p>
            <p className="mt-2 text-sm text-slate-500">{t('waiter.noTablesHint')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {tables.map((table) => {
              const enabled = canOpenTable(table);
              const labelKey = TABLE_STATUS_LABEL_KEYS[table.status];
              const cardStyle = CARD_STYLES[table.status];
              return (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => enabled && onSelect(table)}
                  disabled={!enabled}
                  aria-label={`${table.name} ${t(labelKey ?? table.status)}`}
                  className={`group min-h-36 rounded-[1.7rem] border p-4 text-left shadow-[0_8px_24px_rgba(23,32,51,0.06)] transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${cardStyle}`}
                >
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${BADGE_STYLES[table.status]}`}>
                    {t(labelKey ?? table.status)}
                  </span>
                  <span className="mt-3 flex items-end justify-between gap-2">
                    <span>
                      <span className="block text-2xl font-black tracking-tight">{table.name}</span>
                      <span className="mt-1 flex items-center gap-1 text-xs font-medium opacity-70">
                        <Users size={13} /> {t('waiter.seats', { count: table.capacity })}
                      </span>
                    </span>
                    {enabled && <ChevronRight size={20} className="mb-1 opacity-40 transition group-hover:opacity-90" />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
