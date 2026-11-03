'use client';

// Dvě velké dlaždice po přihlášení: správa podniku, nebo vlastní karty a
// rezervace. Volba se zapamatuje (cookie mgr_strana), příště se už neptá;
// přepnout jde kdykoli z menu účtu.

import { useState } from 'react';
import { Icon, LogoMark, type IconName } from '../Icons';
import { odhlasit } from '@/lib/odhlaseni';
import { prejdiNaStranu } from '@/lib/dveStranyKlient';
import type { Strana } from '@/lib/dveStrany';
import { useT } from '@/lib/i18n/client';

export default function VolbaStrany({ strana, email }: { strana: Strana; email: string }) {
  const t = useT('auth');
  const [busy, setBusy] = useState<Strana | null>(null);
  const [err, setErr] = useState('');
  const moznosti: { id: Strana; ikona: IconName; nazev: string; popis: string }[] = [
    { id: 'podnik', ikona: 'overview', nazev: t('Správa podniku'), popis: t('Směny, kasa, sklad, rezervace a tým.') },
    { id: 'host', ikona: 'card', nazev: t('Moje karty a rezervace'), popis: t('Věrnostní karty, body a rezervace v podnicích, kam chodím.') },
  ];
  const vyber = async (s: Strana) => {
    if (busy) return;
    setErr(''); setBusy(s);
    const chyba = await prejdiNaStranu(s);
    if (chyba) { setErr(t(chyba)); setBusy(null); }
  };
  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-4 py-10 pb-[max(env(safe-area-inset-bottom),40px)]">
      <div className="w-full max-w-3xl">
        <div className="flex items-center gap-2.5 mb-8">
          <LogoMark size={34} />
          <span className="font-bold tracking-tight">Managero</span>
        </div>
        <h1 className="t-page sm:text-[2.5rem] sm:leading-[1.05] text-balance">{t('Kam teď?')}</h1>
        <p className="mt-2 text-[15px] sm:text-base text-black/60 leading-relaxed max-w-[52ch] text-pretty">
          {t('Jeden účet, dvě strany. Volbu si zapamatujeme a přepnout jde kdykoli z menu účtu.')}
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {moznosti.map(m => (
            <button key={m.id} type="button" onClick={() => vyber(m.id)} disabled={busy !== null}
              aria-busy={busy === m.id}
              className="group card text-left p-6 sm:p-7 min-h-[180px] flex flex-col justify-between gap-6 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[shadow:var(--shadow-float)] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 disabled:hover:translate-y-0">
              <span className={`inline-flex h-12 w-12 items-center justify-center rounded-2xl ${m.id === 'podnik' ? 'bg-[#16181A] text-white' : 'bg-[#C8F542] text-[#16181A]'}`}>
                <Icon name={m.ikona} size={24} />
              </span>
              <span className="grid gap-1.5">
                <span className="text-xl font-bold tracking-tight flex items-center gap-2">
                  {m.nazev}
                  <Icon name="chevronRight" size={18} className="opacity-40 transition-transform duration-200 group-hover:translate-x-0.5" />
                </span>
                <span className="t-meta text-pretty">{busy === m.id ? t('Načítání…') : m.popis}</span>
                {m.id === strana && <span className="text-xs font-semibold text-black/45">{t('Právě přihlášeno')}</span>}
              </span>
            </button>
          ))}
        </div>
        {err && <p role="alert" className="note note-danger text-sm px-3 py-2 mt-4">{err}</p>}
        <p className="mt-8 t-meta">
          {email && <span className="mr-2">{email}</span>}
          <button type="button" onClick={() => odhlasit({ callbackUrl: '/login' })} className="tap-target-sm font-semibold text-[#16181A] underline-offset-2 hover:underline">{t('Odhlásit se')}</button>
        </p>
      </div>
    </main>
  );
}
