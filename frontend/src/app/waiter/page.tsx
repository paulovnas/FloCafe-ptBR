'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, Store } from 'lucide-react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useI18n } from '@/hooks/useI18n';
import { useSyncServerLanguage } from '@/lib/i18n';
import { WaiterLoginForm } from '@/components/waiter/WaiterLoginForm';
import { WaiterTablePicker } from '@/components/waiter/WaiterTablePicker';
import { WaiterOrderPad } from '@/components/waiter/WaiterOrderPad';
import { ROLE_LABEL_KEYS } from '@/lib/i18n-enums';
import type { Table, Tenant } from '@/lib/types';

const ORDER_PAD_ROLES: Record<string, true> = {
  owner: true,
  manager: true,
  cashier: true,
  waiter: true,
};

function canUseOrderPad(tenant: Tenant): boolean {
  return ORDER_PAD_ROLES[tenant.role || ''] === true;
}

export default function WaiterPage() {
  useSyncServerLanguage();
  const { language, t } = useI18n();
  const {
    user,
    currentTenant,
    tenants,
    loading: authLoading,
    login,
    selectTenant,
    logout,
  } = useAuthStore();
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [tenantBusy, setTenantBusy] = useState(false);
  const tablesRequestInFlight = useRef(false);

  const loadTables = useCallback(async (silent = false) => {
    if (tablesRequestInFlight.current) return;
    tablesRequestInFlight.current = true;
    if (!silent) setTablesLoading(true);
    try {
      const response = await api.get('/tables?active=1');
      setTables(response.data.tables || []);
    } catch {
      if (!silent) setTables([]);
    } finally {
      tablesRequestInFlight.current = false;
      if (!silent) setTablesLoading(false);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === 'pt' ? 'pt-BR' : language;
  }, [language]);

  useEffect(() => {
    if (!currentTenant || !canUseOrderPad(currentTenant)) return;
    const timeout = window.setTimeout(() => void loadTables(), 0);
    return () => window.clearTimeout(timeout);
  }, [currentTenant, loadTables]);

  // Silent background refresh so the waiter sees tables free up or fill in
  // without touching the refresh button. Pauses while a table is open so it
  // never disturbs an in-progress order.
  useEffect(() => {
    if (!currentTenant || !canUseOrderPad(currentTenant) || selectedTable) return;
    const interval = window.setInterval(() => void loadTables(true), 5_000);
    return () => window.clearInterval(interval);
  }, [currentTenant, loadTables, selectedTable]);

  const handleLogin = async (email: string, password: string, rememberMe: boolean) => {
    setLoginBusy(true);
    setLoginError(null);
    try {
      await login(email, password, rememberMe);
    } catch (error: unknown) {
      const candidate = error as { response?: { status?: number; data?: { error?: string } } };
      if (candidate.response?.status === 401) {
        setLoginError(t('auth.invalidCredentials'));
      } else {
        setLoginError(candidate.response?.data?.error || t('auth.loginFailed'));
      }
    } finally {
      setLoginBusy(false);
    }
  };

  const handleTenantSelect = async (tenantId: number) => {
    setTenantBusy(true);
    try {
      await selectTenant(tenantId);
    } catch {
      setLoginError(t('auth.selectBusinessFailed'));
    } finally {
      setTenantBusy(false);
    }
  };

  const handleLogout = () => {
    setSelectedTable(null);
    logout();
  };

  const handleOrderPlaced = () => {
    setSelectedTable(null);
    void loadTables();
  };

  if (authLoading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#172033]">
        <div className="h-11 w-11 animate-spin rounded-full border-4 border-white/25 border-t-white" />
      </div>
    );
  }

  if (!user) {
    return <WaiterLoginForm busy={loginBusy} error={loginError} onSubmit={handleLogin} />;
  }

  if (!currentTenant) {
    const availableTenants = tenants.filter(canUseOrderPad);
    return (
      <main className="min-h-dvh bg-[#172033] px-5 py-8 text-[#172033] flex items-center justify-center">
        <section className="w-full max-w-sm rounded-[2rem] bg-[#f7f4ed] p-5 shadow-2xl">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-brand">{t('waiter.eyebrow')}</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">{t('auth.selectBusiness')}</h1>
              <p className="mt-1 text-sm text-slate-500">{t('waiter.selectBusinessHint')}</p>
            </div>
            <button type="button" onClick={handleLogout} aria-label={t('nav.logout')} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-slate-500 shadow-sm">
              <LogOut size={17} />
            </button>
          </div>

          {loginError && <p role="alert" className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{loginError}</p>}

          <div className="space-y-2">
            {availableTenants.map((tenant) => (
              <button
                key={tenant.id}
                type="button"
                onClick={() => void handleTenantSelect(tenant.id)}
                disabled={tenantBusy}
                className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-brand disabled:opacity-50"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand"><Store size={18} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold">{tenant.business_name}</span>
                  <span className="block text-xs text-slate-500">{t(ROLE_LABEL_KEYS[tenant.role || ''] ?? tenant.role ?? '')}</span>
                </span>
              </button>
            ))}
          </div>

          {availableTenants.length === 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <p className="font-bold">{t('waiter.accessDenied')}</p>
              <p className="mt-1">{t('waiter.accessDeniedHint')}</p>
            </div>
          )}
        </section>
      </main>
    );
  }

  if (!canUseOrderPad(currentTenant)) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#172033] px-5 text-center text-white">
        <section className="max-w-sm">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-white/10"><Store size={24} /></div>
          <h1 className="text-2xl font-black">{t('waiter.accessDenied')}</h1>
          <p className="mt-2 text-sm leading-6 text-white/60">{t('waiter.accessDeniedHint')}</p>
          <button type="button" onClick={handleLogout} className="mt-6 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-[#172033]">{t('nav.logout')}</button>
        </section>
      </main>
    );
  }

  if (selectedTable) {
    return (
      <WaiterOrderPad
        table={selectedTable}
        currency={currentTenant.currency}
        onBack={() => setSelectedTable(null)}
        onPlaced={handleOrderPlaced}
      />
    );
  }

  return (
    <WaiterTablePicker
      businessName={currentTenant.business_name}
      userName={user.name}
      tables={tables}
      loading={tablesLoading}
      onSelect={setSelectedTable}
      onRefresh={() => void loadTables()}
      onLogout={handleLogout}
    />
  );
}
