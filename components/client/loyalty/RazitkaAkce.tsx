'use client';

// Akce nad seznamem razítkových kartiček (balík W1): duplikovat, řadit, měnit stav,
// statistika kampaně. LoyaltyTabs si bere `useRazitkaAkce` (položky menu u řádku
// a okna) a `RazitkaFiltr` (Běží / Koncept / Pozastavené / Archiv).

import { useCallback, useEffect, useState } from 'react';
import { BarSpark, Button, Chip, EmptyState, ErrorState, ListRow, Modal, Segmented, Skeleton, Stat, StatRow, type MenuItem } from '../../ui';
import { czCount, type CzNoun } from '@/lib/czech';
import { apiMessage, okJson } from '@/lib/api';
import type { Stav } from '@/lib/stampsPlan';

export const STAV_NAZEV: Record<Stav, string> = { active: 'Běží', draft: 'Koncept', paused: 'Pozastavená', archived: 'Archiv' };

const HOST: CzNoun = { one: 'host', few: 'hosté', many: 'hostů' };
const DEN: CzNoun = { one: 'den', few: 'dny', many: 'dní' };
const KARTA: CzNoun = { one: 'karta', few: 'karty', many: 'karet' };

async function posli(url: string, body: unknown) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Nepovedlo se.');
  return d;
}

export type FiltrStavu = 'all' | Stav;

/** Přepínač stavů nad seznamem; stav bez kartiček se nenabízí (kromě „Vše"). */
export function RazitkaFiltr({ list, value, onChange }: { list: { status?: string }[]; value: FiltrStavu; onChange: (v: FiltrStavu) => void }) {
  const pocet = (s: Stav) => list.filter(c => (c.status ?? 'active') === s).length;
  const opts = [
    { id: 'all' as FiltrStavu, label: 'Všechny', count: list.filter(c => c.status !== 'archived').length },
    ...(['active', 'draft', 'paused', 'archived'] as Stav[]).filter(s => pocet(s) > 0).map(s => ({ id: s as FiltrStavu, label: STAV_NAZEV[s], count: pocet(s) })),
  ];
  if (opts.length <= 2 && value === 'all') return null;
  return <Segmented options={opts} value={value} onChange={onChange} size="sm" ariaLabel="Stav kartiček" />;
}

/** Kartičky podle zvoleného stavu. „Všechny" nezahrnují archiv. */
export function podleFiltru<T extends { status?: string }>(list: T[], f: FiltrStavu): T[] {
  return list.filter(c => (f === 'all' ? c.status !== 'archived' : (c.status ?? 'active') === f));
}

export function useRazitkaAkce(opt: { reload: () => void; toast: (m: string) => void; meni: boolean; upravit: (c: any) => void; smazat: (c: any) => void; rucne?: (c: any) => void }) {
  const { reload, toast, meni } = opt;
  const [stat, setStat] = useState<any | null>(null);

  const spust = useCallback(async (nazev: string, fn: () => Promise<any>, ok: string) => {
    try { await fn(); toast(ok); reload(); } catch (e) { toast(apiMessage(e, `${nazev} se nepovedlo.`)); }
  }, [reload, toast]);

  const stav = (c: any, s: Stav, ok: string) => spust('Změna stavu', () => posli('/api/client/admin/stamps/akce', { action: 'status', id: c.id, status: s }), ok);

  /** Položky menu „···" u řádku kartičky. `i` a `n` = pořadí v celém seznamu (řazení nahoru/dolů). */
  const polozky = (c: any, i: number, n: number): MenuItem[] => {
    const out: MenuItem[] = [{ label: 'Statistika…', icon: 'chart', onClick: () => setStat(c) }];
    if (opt.rucne && (c.status ?? 'active') !== 'archived') out.push({ label: 'Razítka ručně…', icon: 'plus', hint: 'Připsat nebo odebrat jednomu hostovi, vybraným hostům nebo celé skupině.', onClick: () => opt.rucne!(c) });
    if (!meni) return out;
    // Export nese e-maily členů, proto jen pro toho, kdo kampaně spravuje.
    out.push({ label: 'Exportovat hosty (CSV)', icon: 'download', onClick: () => { window.location.assign(`/api/client/admin/stamps?export=${c.id}`); } });
    out.push({ label: 'Exportovat deník razítek (CSV)', icon: 'download', onClick: () => { window.location.assign(`/api/client/admin/stamps?export=${c.id}&udalosti=1`); } });
    out.push({ label: 'Upravit…', icon: 'pencil', onClick: () => opt.upravit(c) });
    out.push({ label: 'Duplikovat', icon: 'copy', hint: 'Kopie vznikne jako koncept bez hostů.', onClick: () => { void spust('Kopírování', () => posli('/api/client/admin/stamps/akce', { action: 'duplicate', id: c.id }), `Kopie „${c.name}“ je mezi koncepty.`); } });
    if (i > 0) out.push({ label: 'Posunout výš', onClick: () => { void spust('Řazení', () => posli('/api/client/admin/stamps/akce', { action: 'move', id: c.id, dir: 'up' }), 'Pořadí změněno.'); } });
    if (i < n - 1) out.push({ label: 'Posunout níž', onClick: () => { void spust('Řazení', () => posli('/api/client/admin/stamps/akce', { action: 'move', id: c.id, dir: 'down' }), 'Pořadí změněno.'); } });
    const s = (c.status ?? 'active') as Stav;
    if (s !== 'active') out.push({ label: s === 'archived' ? 'Obnovit z archivu a spustit' : 'Spustit', icon: 'check', onClick: () => { void stav(c, 'active', `„${c.name}“ běží.`); } });
    if (s === 'active') out.push({ label: 'Pozastavit', icon: 'clock', onClick: () => { void stav(c, 'paused', `„${c.name}“ je pozastavená.`); } });
    if (s !== 'archived') out.push({ label: 'Archivovat', icon: 'archive', onClick: () => { void stav(c, 'archived', `„${c.name}“ je v archivu.`); } });
    out.push({ label: 'Smazat…', icon: 'trash', danger: true, onClick: () => opt.smazat(c) });
    return out;
  };

  /** Zapnout / vypnout přepínačem v řádku (běží ↔ pozastavená). */
  const prepni = (c: any) => stav(c, c.status === 'active' ? 'paused' : 'active', c.status === 'active' ? `„${c.name}“ je pozastavená.` : `„${c.name}“ běží.`);

  const okna = stat ? <RazitkaStatistika c={stat} onClose={() => setStat(null)} /> : null;
  return { polozky, prepni, okna };
}

/** Statistika jedné kampaně v okně: uplatněné odměny, doba dokončení, nejvěrnější hosté, rozpad po dnech. */
export function RazitkaStatistika({ c, onClose }: { c: { id: number; name: string }; onClose: () => void }) {
  const [d, setD] = useState<any | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const nacti = useCallback(() => {
    setChyba(null); setD(null);
    fetch(`/api/client/admin/stamps/stats?id=${c.id}`).then(okJson).then(setD).catch(e => setChyba(apiMessage(e, 'Statistika se nenačetla.')));
  }, [c.id]);
  useEffect(() => { nacti(); }, [nacti]);
  const prazdne = d && d.razitekCelkem === 0 && d.sbirajici === 0;
  return (
    <Modal open onClose={onClose} size="md" title={`Statistika: ${c.name}`}
      footer={<Button variant="secondary" onClick={onClose}>Zavřít</Button>}>
      {chyba ? <ErrorState title="Statistika se nenačetla" onRetry={nacti} detail={chyba} />
        : !d ? <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-24" /></div>
        : prazdne ? <EmptyState icon="chart" compact title="Zatím žádná data" hint="Statistika se objeví, jakmile host dostane první razítko." />
        : (
          <div className="space-y-5">
            <StatRow>
              <Stat label="Sbírá" value={d.sbirajici} note={`${d.otevrenaRazitka} rozdělaných razítek`} />
              <Stat label="Dokončeno" value={d.dokonceno} note={czCount(d.dokonceno, KARTA)} />
              <Stat label="Odměn uplatněno" value={d.odmenVydano ? `${d.odmenUplatneno} z ${d.odmenVydano}` : '—'} note={d.odmenCeka > 0 ? `${d.odmenCeka} čeká na uplatnění` : d.odmenVydano ? 'vše uplatněno' : 'zatím žádná odměna'} />
              <Stat label="Doba dokončení" value={d.prumernaDobaDni == null ? '—' : d.prumernaDobaDni} unit={d.prumernaDobaDni == null ? undefined : 'dní'}
                note={d.prumernaDobaDni == null ? 'zatím nikdo nedokončil' : `průměr z ${czCount(d.dobaZVzorku, KARTA)}, od prvního razítka`} />
            </StatRow>
            <div>
              <p className="t-label mb-1.5">Razítka za posledních 30 dní</p>
              <BarSpark height={56} showLabels={false} label="Razítka za posledních 30 dní"
                data={d.poDnech.map((x: any) => ({ value: x.razitek, tip: `${x.den.split('-').reverse().join('. ')}: ${x.razitek} razítek${x.karet ? `, ${czCount(x.karet, KARTA)} dokončeno` : ''}` }))} />
            </div>
            <div>
              <p className="t-label mb-1.5">Nejvěrnější hosté</p>
              {d.top.length === 0 ? <p className="t-meta">Zatím nikdo.</p> : (
                <ul className="list">
                  {d.top.map((h: any) => (
                    <ListRow key={h.customerId} as="div" title={h.jmeno || 'Host'} meta={`${czCount(h.dokonceno, KARTA)} dokončeno`}
                      value={<>{h.razitek} <span className="text-xs font-medium text-black/50">rozdělaných</span></>} />
                  ))}
                </ul>
              )}
            </div>
            <p className="t-meta">Počítá se od zavedení deníku razítek; starší razítka v rozpadu po dnech chybí. {czCount(d.sbirajici, HOST)} má u téhle kartičky průběh.</p>
          </div>
        )}
    </Modal>
  );
}

/** Štítek stavu u řádku (jen když kartička neběží). */
export function StavChip({ stav }: { stav?: string }) {
  if (!stav || stav === 'active') return null;
  const s = stav as Stav;
  return <Chip tone={s === 'archived' ? 'muted' : 'wait'} size="sm">{STAV_NAZEV[s] ?? stav}</Chip>;
}
