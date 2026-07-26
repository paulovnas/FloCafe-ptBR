'use client';

import { useState } from 'react';
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

interface WaiterLoginFormProps {
  busy: boolean;
  error: string | null;
  onSubmit: (email: string, password: string, rememberMe: boolean) => Promise<void>;
}

export function WaiterLoginForm({ busy, error, onSubmit }: WaiterLoginFormProps) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(email.trim(), password, rememberMe);
  };

  return (
    <main className="min-h-dvh bg-[#172033] px-5 py-8 text-[#172033] flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center text-white">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-brand shadow-[0_14px_40px_rgba(50,72,255,0.38)]">
            <span className="text-xl font-black tracking-[-0.08em]">FLO</span>
          </div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.22em] text-white/50">{t('waiter.eyebrow')}</p>
          <h1 className="text-3xl font-black tracking-tight">{t('waiter.loginTitle')}</h1>
          <p className="mt-2 text-sm text-white/60">{t('waiter.loginSubtitle')}</p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-[2rem] bg-[#f7f4ed] p-5 shadow-2xl">
          {error && (
            <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          <label className="mb-4 block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">{t('auth.email')}</span>
            <span className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
              <Mail size={18} className="shrink-0 text-slate-400" />
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-300"
              />
            </span>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-slate-500">{t('auth.password')}</span>
            <span className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 focus-within:border-brand focus-within:ring-4 focus-within:ring-brand/10">
              <LockKeyhole size={18} className="shrink-0 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={t('auth.passwordPlaceholder')}
                className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-slate-300"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                className="-mr-2 rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
              </button>
            </span>
          </label>

          <label className="my-5 flex items-center gap-3 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            {t('auth.rememberMe')}
          </label>

          <button
            type="submit"
            disabled={busy}
            className="h-14 w-full rounded-2xl bg-brand px-5 text-base font-bold text-white shadow-[0_10px_24px_rgba(50,72,255,0.24)] transition hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? t('auth.signingIn') : t('waiter.signIn')}
          </button>
        </form>
      </div>
    </main>
  );
}
