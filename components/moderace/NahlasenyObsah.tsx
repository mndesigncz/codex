'use client';

// Nahlášený obsah — pohled vedení (Nastavení, Nahlášený obsah). Seznam hlášení
// z chatu a z nápadů s akcemi: odstranit obsah, označit za vyřízené, zamítnout.
// Smí ho otevřít jen ten, kdo smí odebírat členy (tym.odebrat); server to hlídá.

import { useCallback, useEffect, useState } from 'react';
import { Button, Chip, EmptyState, ErrorState, Skeleton } from '../ui';
import { okJson } from '@/lib/api';
import { nazevDuvodu } from '@/lib/moderace';

interface Nahlaseni {
  id: number; kind: 'zprava' | 'napad'; refId: number; reason: string; detail: string | null; snapshot: string | null;
  status: 'open' | 'removed' | 'resolved' | 'dismissed'; createdAt: string; reporterName: string | null; reportedName: string | null;
}

const STAV: Record<string, { label: string; tone: 'wait' | 'ok' | 'muted' }> = {
  open: { label: 'Čeká', tone: 'wait' },
  removed: { label: 'Obsah odstraněn', tone: 'ok' },
  resolved: { label: 'Vyřízeno', tone: 'ok' },
  dismissed: { label: 'Zamítnuto', tone: 'muted' },
};

export default function NahlasenyObsah() {
  const [radky, setRadky] = useState<Nahlaseni[] | null>(null);
  const [chyba, setChyba] = useState('');
  const [akceChyba, setAkceChyba] = useState('');
  const [bezi, setBezi] = useState<number | null>(null);

  const nacti = useCallback(() => {
    setChyba('');
    fetch('/api/reports').then(okJson).then(d => setRadky(Array.isArray(d.reports) ? d.reports : []))
      .catch(() => setChyba('Nahlášení se nenačetla.'));
  }, []);
  useEffect(nacti, [nacti]);

  const proved = async (r: Nahlaseni, akce: 'odstranit' | 'vyreseno' | 'zamitnout') => {
    setAkceChyba(''); setBezi(r.id);
    try {
      const res = await fetch(`/api/reports/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ akce }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setAkceChyba(d.error || 'Akci se nepodařilo provést.'); return; }
      setRadky(prev => (prev ?? []).map(x => x.id === r.id ? { ...x, status: d.status } : x));
    } catch { setAkceChyba('Akci se nepodařilo provést. Zkontrolujte připojení.'); }
    finally { setBezi(null); }
  };

  if (chyba) return <div className="card p-6"><ErrorState title="Nahlášený obsah se nenačetl" detail={chyba} onRetry={nacti} /></div>;
  if (!radky) return <div className="card p-6 space-y-2" aria-busy><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;

  return (
    <section className="card p-6 space-y-4" aria-labelledby="h-nahlaseny">
      <div>
        <h2 id="h-nahlaseny" className="t-section">Nahlášený obsah</h2>
        <p className="t-meta mt-1 text-pretty">Zprávy v chatu a nápady, které tým nahlásil. Odstraňte, co porušuje pravidla, nebo nahlášení zamítněte.</p>
      </div>
      {akceChyba && <p role="alert" className="note note-danger">{akceChyba}</p>}
      {radky.length === 0 ? (
        <EmptyState compact icon="check" title="Nic nahlášeného" hint="Až někdo něco nahlásí, uvidíte to tady a dostanete upozornění." />
      ) : (
        <ul className="list">
          {radky.map(r => {
            const st = STAV[r.status] ?? STAV.open;
            return (
              <li key={r.id} className="list-row items-start">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="t-card">{r.kind === 'zprava' ? 'Zpráva v chatu' : 'Nápad'}</span>
                    <Chip tone={st.tone} size="sm">{st.label}</Chip>
                  </div>
                  {r.snapshot && <p className="text-sm text-black/70 text-pretty break-words">„{r.snapshot}“</p>}
                  <p className="t-meta text-pretty">
                    {nazevDuvodu(r.reason)}{r.detail ? `: ${r.detail}` : ''} · autor {r.reportedName ?? 'neznámý'} · nahlásil {r.reporterName ?? 'neznámý'}
                  </p>
                  {r.status === 'open' && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="danger" icon="trash" loading={bezi === r.id} onClick={() => proved(r, 'odstranit')}>Odstranit obsah</Button>
                      <Button size="sm" variant="secondary" disabled={bezi === r.id} onClick={() => proved(r, 'vyreseno')}>Vyřízeno</Button>
                      <Button size="sm" variant="ghost" disabled={bezi === r.id} onClick={() => proved(r, 'zamitnout')}>Zamítnout</Button>
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
