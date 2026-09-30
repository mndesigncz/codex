'use client';

// Nahlášený obsah — pohled vedení (Nastavení, Nahlášený obsah). Seznam hlášení
// z chatu a z nápadů s akcemi: odstranit obsah, označit za vyřízené, zamítnout.
// Smí ho otevřít jen ten, kdo smí odebírat členy (tym.odebrat); server to hlídá.

import { useCallback, useEffect, useState } from 'react';
import { Button, Chip, EmptyState, ErrorState, Skeleton } from '../ui';
import { okJson } from '@/lib/api';
import { nazevDuvodu } from '@/lib/moderace';
import { useT } from '@/lib/i18n/client';
import { tg } from '@/lib/i18n/stav';

interface Nahlaseni {
  id: number; kind: 'zprava' | 'napad'; refId: number; reason: string; detail: string | null; snapshot: string | null;
  status: 'open' | 'removed' | 'resolved' | 'dismissed'; createdAt: string; reporterName: string | null; reportedName: string | null;
}

const TON_STAVU: Record<string, 'wait' | 'ok' | 'muted'> = { open: 'wait', removed: 'ok', resolved: 'ok', dismissed: 'muted' };

export default function NahlasenyObsah() {
  const t = useT('spolecne');
  const popisStavu: Record<string, string> = { open: t('Čeká'), removed: t('Obsah odstraněn'), resolved: t('Vyřízeno'), dismissed: t('Zamítnuto') };
  const [radky, setRadky] = useState<Nahlaseni[] | null>(null);
  const [chyba, setChyba] = useState('');
  const [akceChyba, setAkceChyba] = useState('');
  const [bezi, setBezi] = useState<number | null>(null);

  const nacti = useCallback(() => {
    setChyba('');
    fetch('/api/reports').then(okJson).then(d => setRadky(Array.isArray(d.reports) ? d.reports : []))
      .catch(() => setChyba(t('Nahlášení se nenačetla.')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(nacti, [nacti]);

  const proved = async (r: Nahlaseni, akce: 'odstranit' | 'vyreseno' | 'zamitnout') => {
    setAkceChyba(''); setBezi(r.id);
    try {
      const res = await fetch(`/api/reports/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ akce }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setAkceChyba(d.error ? tg(d.error) : t('Akci se nepodařilo provést.')); return; }
      setRadky(prev => (prev ?? []).map(x => x.id === r.id ? { ...x, status: d.status } : x));
    } catch { setAkceChyba(t('Akci se nepodařilo provést. Zkontrolujte připojení.')); }
    finally { setBezi(null); }
  };

  if (chyba) return <div className="card p-6"><ErrorState title={t('Nahlášený obsah se nenačetl')} detail={chyba} onRetry={nacti} /></div>;
  if (!radky) return <div className="card p-6 space-y-2" aria-busy><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;

  return (
    <section className="card p-6 space-y-4" aria-labelledby="h-nahlaseny">
      <div>
        <h2 id="h-nahlaseny" className="t-section">{t('Nahlášený obsah')}</h2>
        <p className="t-meta mt-1 text-pretty">{t('Zprávy v chatu a nápady, které tým nahlásil. Odstraňte, co porušuje pravidla, nebo nahlášení zamítněte.')}</p>
      </div>
      {akceChyba && <p role="alert" className="note note-danger">{akceChyba}</p>}
      {radky.length === 0 ? (
        <EmptyState compact icon="check" title={t('Nic nahlášeného')} hint={t('Až někdo něco nahlásí, uvidíte to tady a dostanete upozornění.')} />
      ) : (
        <ul className="list">
          {radky.map(r => {
            const stav = TON_STAVU[r.status] ? r.status : 'open';
            return (
              <li key={r.id} className="list-row items-start">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="t-card">{r.kind === 'zprava' ? t('Zpráva v chatu') : t('Nápad')}</span>
                    <Chip tone={TON_STAVU[stav]} size="sm">{popisStavu[stav]}</Chip>
                  </div>
                  {r.snapshot && <p className="text-sm text-black/70 text-pretty break-words">„{r.snapshot}“</p>}
                  <p className="t-meta text-pretty">
                    {t(nazevDuvodu(r.reason))}{r.detail ? `: ${r.detail}` : ''} · {t('autor {jmeno}', { jmeno: r.reportedName ?? t('neznámý') })} · {t('nahlásil {jmeno}', { jmeno: r.reporterName ?? t('neznámý') })}
                  </p>
                  {r.status === 'open' && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="danger" icon="trash" loading={bezi === r.id} onClick={() => proved(r, 'odstranit')}>{t('Odstranit obsah')}</Button>
                      <Button size="sm" variant="secondary" disabled={bezi === r.id} onClick={() => proved(r, 'vyreseno')}>{t('Vyřízeno')}</Button>
                      <Button size="sm" variant="ghost" disabled={bezi === r.id} onClick={() => proved(r, 'zamitnout')}>{t('Zamítnout')}</Button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
