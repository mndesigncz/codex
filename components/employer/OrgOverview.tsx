'use client';

// Všechny podniky na jedné obrazovce — pro vedení řetězce.
//
// Stejná čísla, jaká má každý podnik sám v Uzávěrkách, Financích a Skladu,
// jen vedle sebe a sečtená. Sčítá se jen stejná měna; s korunami a eury
// vedle sebe přehled řekne, že celek nedává smysl, místo aby ho vymyslel.

import { useEffect, useState } from 'react';
import { czCount, czVerb, POLOZKA } from '@/lib/czech';
import { Icon } from '../Icons';
import { PageHeader, ErrorState } from '../ui';
import { okJson, apiMessage } from '@/lib/api';
import { formatMoney } from '@/lib/money';
import { pragueToday } from '@/lib/pragueTime';
import type { RadekPodniku, Souhrn } from '@/lib/prehledOrganizace';

interface Data { available: boolean; reason?: string; message?: string; month?: string; organization?: { name: string }; teams?: RadekPodniku[]; total?: Souhrn }

const posunMesic = (m: string, o: number) => {
  const [y, mm] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mm - 1 + o, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const nazevMesice = (m: string) => new Date(m + '-01T12:00:00Z').toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });

export default function OrgOverview({ onOpenTeam }: { onOpenTeam?: (teamId: number) => Promise<string | null> }) {
  const [month, setMonth] = useState(() => pragueToday().slice(0, 7));
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);
  /** Jiný měsíc se načítá: karty zůstávají, ale ztlumené — ne nový nadpis nad starými čísly. */
  const [nacita, setNacita] = useState(true);

  useEffect(() => {
    let alive = true;
    setErr(''); setNacita(true);
    fetch(`/api/organization/overview?month=${month}`).then(okJson)
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setErr(apiMessage(e, 'Přehled se nenačetl.')); })
      .finally(() => { if (alive) setNacita(false); });
    return () => { alive = false; };
  }, [month, tick]);

  // „Otevřít" přepíná podnik na serveru; když to nevyjde, chyba patří sem.
  const otevri = async (teamId: number) => {
    const chyba = await onOpenTeam?.(teamId);
    if (chyba) setErr(chyba);
  };

  const penize = (n: number, cur: string) => formatMoney(n, cur);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader hintId="orgoverview" title={data?.organization?.name ? `Všechny podniky · ${data.organization.name}` : 'Všechny podniky'}
        subtitle="Tržby, mzdy, uzávěrky a sklad za každý podnik — a celkem." />

      {err && <ErrorState title="Přehled se nenačetl" hint={err} onRetry={() => setTick(t => t + 1)} />}

      {data && !data.available && (
        <div className="glass-card p-8 text-center space-y-2">
          <Icon name="box" size={28} className="mx-auto text-black/30" />
          <p className="text-sm text-black/60">{data.message}</p>
          {data.reason === 'vypnuto' && <p className="text-xs text-black/40">Zapíná se v Nastavení týmu → Organizace.</p>}
        </div>
      )}

      {data?.available && data.teams && data.total && !err && (
        <div className={nacita ? 'opacity-50 pointer-events-none transition-opacity' : 'transition-opacity'} aria-busy={nacita}>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMonth(m => posunMesic(m, -1))} aria-label="Předchozí měsíc" className="btn-icon"><Icon name="chevron" size={16} className="rotate-90" /></button>
            <p className="font-semibold text-[#16181A] cz-sentence min-w-[10rem] text-center">{nazevMesice(month)}</p>
            <button type="button" onClick={() => setMonth(m => posunMesic(m, 1))} aria-label="Další měsíc" className="btn-icon"><Icon name="chevron" size={16} className="-rotate-90" /></button>
          </div>

          {/* Celek */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="glass-card rounded-3xl p-4">
              <p className="t-label text-black/45">Tržby celkem</p>
              <p className="text-2xl font-bold tabular-nums text-[#16181A] mt-1">
                {data.total.currency ? penize(data.total.revenue, data.total.currency) : <span className="text-base text-black/45">různé měny</span>}
              </p>
            </div>
            <div className="glass-card rounded-3xl p-4">
              <p className="t-label text-black/45">Mzdy celkem</p>
              <p className="text-2xl font-bold tabular-nums text-[#16181A] mt-1">
                {data.total.currency ? penize(data.total.wages, data.total.currency) : <span className="text-base text-black/45">různé měny</span>}
              </p>
              {data.total.laborPct != null && <p className="text-xs text-black/45 mt-0.5">{data.total.laborPct} % tržeb</p>}
            </div>
            <div className={`glass-card rounded-3xl p-4 ${data.total.missingClosings > 0 ? 'card-danger' : ''}`}>
              <p className="t-label text-black/45">Chybí uzávěrka</p>
              <p className="text-2xl font-bold tabular-nums text-[#16181A] mt-1">{data.total.missingClosings}</p>
              {data.total.pendingApproval > 0 && <p className="text-xs text-wait-ink mt-0.5">{data.total.pendingApproval} ke schválení</p>}
            </div>
            <div className="glass-card rounded-3xl p-4">
              <p className="t-label text-black/45">Právě na směně</p>
              <p className="text-2xl font-bold tabular-nums text-[#16181A] mt-1">{data.total.onShiftNow}</p>
              {data.total.stockAlerts > 0 && <p className="text-xs text-wait-ink mt-0.5">{czCount(data.total.stockAlerts, POLOZKA)} {czVerb(data.total.stockAlerts, 'dochází', 'docházejí')}</p>}
            </div>
          </div>

          {/* Po podniku */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.teams.map(t => (
              <div key={t.teamId} className="glass-card p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="t-card truncate">{t.name}</h3>
                    <p className="text-xs text-black/45">{t.members} {t.members === 1 ? 'člen' : t.members < 5 ? 'členové' : 'členů'} · {t.closings} {t.closings === 1 ? 'uzávěrka' : t.closings < 5 ? 'uzávěrky' : 'uzávěrek'}</p>
                  </div>
                  {onOpenTeam && (
                    <button type="button" onClick={() => otevri(t.teamId)} className="btn btn-secondary btn-sm shrink-0">Otevřít</button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <div><p className="t-label text-black/45">Tržby</p><p className="font-bold tabular-nums">{penize(t.revenue, t.currency)}</p></div>
                  <div><p className="t-label text-black/45">Mzdy</p><p className="font-bold tabular-nums">{penize(t.wages, t.currency)}{t.revenue > 0 && <span className="ml-1 text-xs font-normal text-black/45">{Math.round((t.wages / t.revenue) * 100)} %</span>}</p></div>
                  <div><p className="t-label text-black/45">Na směně</p><p className="font-bold tabular-nums">{t.onShiftNow}</p></div>
                  <div><p className="t-label text-black/45">Sklad dochází</p><p className={`font-bold tabular-nums ${t.stockAlerts > 0 ? 'text-wait-ink' : ''}`}>{t.stockAlerts}</p></div>
                </div>
                {(t.missingClosings > 0 || t.pendingApproval > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {t.missingClosings > 0 && <span className="chip chip-sm bg-bad/15 text-bad-ink">chybí {t.missingClosings} {t.missingClosings === 1 ? 'uzávěrka' : t.missingClosings < 5 ? 'uzávěrky' : 'uzávěrek'}</span>}
                    {t.pendingApproval > 0 && <span className="chip chip-sm bg-wait/15 text-wait-ink">{t.pendingApproval} ke schválení</span>}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {!data && !err && <div className="flex items-center justify-center h-40"><div className="spinner" /></div>}
    </div>
  );
}
