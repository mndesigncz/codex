'use client';

// Příjem u obsluhy: nové objednávky od stolu a dnešní rezervace. Běží
// v kiosku na baru i v mobilu zaměstnance. Objednávku je potřeba potvrdit
// do pár minut, jinak host zbytečně čeká — proto se nová hlásí nahlas
// (žlutý pruh, počet v záložce) a obnovuje se každých dvacet vteřin.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button, EmptyState, Skeleton } from '../ui';
import { Initials } from './ClientShell';
import CardScan from './CardScan';
import { RES_STATUS } from '@/lib/clientSlots';

const EVERY_MS = 20 * 1000;

export function useStaffInbox(enabled = true) {
  const [d, setD] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const load = useCallback(() => fetch('/api/client/staff/inbox').then(r => r.json()).then(x => { if (!x.error) { setD(x); setErr(''); } else setErr(x.error); }).catch(() => setErr('Příjem se nenačetl.')), []);
  useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, EVERY_MS);
    const onVis = () => { if (document.visibilityState === 'visible') load(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [enabled, load]);
  return { d, err, reload: load };
}

const ORDER_STATUS: Record<string, { label: string; tone: string }> = {
  new: { label: 'Nová', tone: 'wait' }, confirmed: { label: 'Připravuje se', tone: 'ok' }, done: { label: 'Hotovo', tone: 'done' }, declined: { label: 'Nepřijato', tone: 'off' },
};
const POS_STATE: Record<string, string> = { NEW: 'v kase čeká na přijetí', CONFIRMED: 'v kase, připravuje se', DISPATCHED: 'v kase vydáno', DECLINED: 'kasa odmítla', SCHEDULING_DELIVERY: 'v kase' };
/** Jak víme, že host sedí u stolu: QR ze stolu a poloha telefonu. */
function Verified({ o }: { o: any }) {
  const parts: { txt: string; tone: 'ok' | 'wait' | 'off' }[] = [];
  if (o.via_qr) parts.push({ txt: 'QR ze stolu', tone: 'ok' });
  else if (o.via_qr === false) parts.push({ txt: 'bez QR', tone: 'wait' });
  if (o.geo_status === 'ok') parts.push({ txt: `u podniku${o.geo_distance_m != null ? ` · ${o.geo_distance_m} m` : ''}`, tone: 'ok' });
  else if (o.geo_status === 'far') parts.push({ txt: `daleko · ${o.geo_distance_m} m`, tone: 'off' });
  else if (o.geo_status === 'none') parts.push({ txt: 'bez polohy', tone: 'wait' });
  if (!parts.length) return null;
  return <>{parts.map(p => <span key={p.txt} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${p.tone === 'ok' ? 'bg-[#C8F542]/20 text-[#3E5406]' : p.tone === 'wait' ? 'bg-amber-500/15 text-amber-800' : 'bg-red-500/10 text-red-700'}`}><Icon name={p.txt.startsWith('QR') || p.txt === 'bez QR' ? 'tag' : 'location'} size={11} />{p.txt}</span>)}</>;
}
const chip = (tone: string) => `inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone === 'ok' ? 'bg-[#C8F542]/25 text-[#3E5406]' : tone === 'wait' ? 'bg-amber-500/15 text-amber-800' : tone === 'done' ? 'bg-black/[0.06] text-black/60' : 'bg-red-500/10 text-red-700'}`;

function ago(iso: string) {
  const m = Math.max(0, Math.round((Date.now() - new Date(String(iso).replace(' ', 'T') + (String(iso).match(/[Zz]$|[+-]\d{2}:?\d{2}$/) ? '' : 'Z')).getTime()) / 60000));
  return m < 1 ? 'právě teď' : m === 1 ? 'před minutou' : m < 5 ? `před ${m} minutami` : `před ${m} min`;
}

export default function StaffInbox({ compact = false, onToast }: { compact?: boolean; onToast?: (m: string) => void }) {
  const { d, err, reload } = useStaffInbox(true);
  const [busy, setBusy] = useState<number | null>(null);
  const beeped = useRef<Set<number>>(new Set());
  const [flash, setFlash] = useState('');
  useEffect(() => { if (flash) { const t = setTimeout(() => setFlash(''), 4500); return () => clearTimeout(t); } }, [flash]);
  const toast = (m: string) => { onToast ? onToast(m) : setFlash(m); };

  // Nová objednávka, kterou jsme ještě neviděli → krátké pípnutí (kiosk na baru bývá bez očí).
  useEffect(() => {
    for (const o of d?.orders ?? []) {
      if (o.status === 'new' && !beeped.current.has(o.id)) {
        beeped.current.add(o.id);
        try {
          const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const osc = ctx.createOscillator(); const g = ctx.createGain();
          osc.frequency.value = 880; g.gain.value = 0.04; osc.connect(g); g.connect(ctx.destination);
          osc.start(); osc.stop(ctx.currentTime + 0.18);
        } catch { /* bez zvuku */ }
      }
    }
  }, [d]);

  const act = async (id: number, status: string) => {
    setBusy(id);
    try {
      const r = await fetch('/api/client/staff/inbox', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(x.error || 'Nepovedlo se.');
      if (x.posNote) toast(x.posNote);
      else if (status === 'done' && x.loyalty?.stamp?.rewarded) toast('Hotovo. Host nasbíral všechna razítka a má odměnu.');
      else if (status === 'done') toast('Hotovo. Body připsány.');
      await reload();
    } catch (e: any) { toast(e.message); }
    setBusy(null);
  };

  if (err) return <p className="rounded-2xl bg-red-500/10 border border-red-500/20 text-red-700 text-sm px-4 py-3">{err}</p>;
  if (!d) return <div className="space-y-3"><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-16 rounded-2xl" /></div>;
  const orders: any[] = d.orders ?? [];
  const news = orders.filter(o => o.status === 'new');
  const inProgress = orders.filter(o => o.status === 'confirmed');
  const recent = orders.filter(o => ['done', 'declined'].includes(o.status));
  const reservations: any[] = d.reservations ?? [];

  return (
    <div className="space-y-5">
      {flash && <p role="status" className="rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/40 text-[#3E5406] text-sm px-4 py-2.5">{flash}</p>}
      {compact ? (
        <details className="group">
          <summary className="tap-target-sm inline-flex items-center gap-2 text-sm font-semibold text-black/60 cursor-pointer hover:text-black list-none"><Icon name="card" size={16} />Kartička hosta u kasy<Icon name="chevron" size={14} className="transition-transform group-open:rotate-180" /></summary>
          <div className="mt-2"><CardScan onToast={toast} /></div>
        </details>
      ) : <CardScan onToast={toast} onChange={reload} />}
      {news.length > 0 && (
        <section className="rounded-3xl bg-amber-500/[0.10] border border-amber-500/40 p-4 space-y-3">
          <h2 className="font-bold tracking-tight flex items-center gap-2"><Icon name="bell" size={18} className="text-amber-800" />{news.length === 1 ? 'Nová objednávka od stolu' : `${news.length} nové objednávky od stolu`}</h2>
          <ul className="space-y-3">{news.map(o => <OrderRow key={o.id} o={o} busy={busy === o.id} act={act} />)}</ul>
        </section>
      )}
      {inProgress.length > 0 && (
        <section>
          <h2 className="text-sm font-bold tracking-tight mb-2">Připravuje se</h2>
          <ul className="space-y-3">{inProgress.map(o => <OrderRow key={o.id} o={o} busy={busy === o.id} act={act} />)}</ul>
        </section>
      )}
      {!compact && reservations.length > 0 && (
        <section>
          <h2 className="text-sm font-bold tracking-tight mb-2">Dnešní rezervace</h2>
          <ul className="divide-y divide-black/[0.06]">
            {reservations.map(r => (
              <li key={r.id} className="py-2 flex items-center gap-3 flex-wrap">
                <span className="font-semibold tabular-nums w-14 shrink-0">{r.time}</span>
                <Initials name={r.customer_name} size={26} />
                <span className="min-w-0 flex-1 basis-40 truncate">{r.customer_name} <span className="text-black/50">· {r.party} os.{r.table_name ? ` · ${r.table_name}` : ''}</span></span>
                <span className={`${chip(RES_STATUS[r.status]?.tone ?? 'wait')} ml-auto`}>{RES_STATUS[r.status]?.label ?? r.status}</span>
              </li>))}
          </ul>
        </section>
      )}
      {!compact && recent.length > 0 && (
        <details>
          <summary className="text-sm text-black/55 cursor-pointer hover:text-black">Vyřízené za poslední tři hodiny ({recent.length})</summary>
          <ul className="space-y-2 mt-2">{recent.map(o => <OrderRow key={o.id} o={o} busy={false} act={act} />)}</ul>
        </details>
      )}
      {!compact && orders.length === 0 && reservations.length === 0 && (
        <EmptyState icon="inbox" title="Nic k vyřízení" hint="Objednávky od stolu a dnešní rezervace se objeví tady." compact />
      )}
    </div>
  );
}

function OrderRow({ o, busy, act }: { o: any; busy: boolean; act: (id: number, s: string) => void }) {
  const st = ORDER_STATUS[o.status] ?? ORDER_STATUS.new;
  return (
    <li className="rounded-2xl bg-white/70 border border-black/[0.06] p-3.5">
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1 basis-56">
          <p className="font-bold leading-tight flex items-center gap-2 flex-wrap">
            <span className="rounded-lg bg-[#16181A] text-[#C8F542] px-2 py-0.5 text-sm tabular-nums">{o.table_name ?? 'bez stolu'}</span>
            <span className="truncate">{o.customer_name}</span>
            <span className="text-xs font-medium text-black/45">{ago(o.created_at)}</span>
          </p>
          <ul className="mt-1.5 text-sm">
            {(o.items ?? []).map((l: any, i: number) => <li key={i} className="flex justify-between gap-3"><span><span className="font-semibold tabular-nums">{l.count}×</span> {l.name}</span><span className="tabular-nums text-black/60">{l.price * l.count} Kč</span></li>)}
          </ul>
          {o.note && <p className="text-xs text-black/60 mt-1">„{o.note}"</p>}
          <p className="mt-1.5 flex items-center gap-2 flex-wrap"><span className="font-bold tabular-nums">{o.total} Kč</span><span className={chip(st.tone)}>{st.label}</span><Verified o={o} />{o.pos_state && <span className="text-[11px] text-black/45">{POS_STATE[o.pos_state] ?? `kasa: ${o.pos_state}`}</span>}</p>
        </div>
        <div className="flex gap-1.5 flex-wrap justify-end ml-auto">
          {o.status === 'new' && <><Button size="sm" variant="accent" icon="check" loading={busy} onClick={() => act(o.id, 'confirmed')}>Přijmout</Button><Button size="sm" variant="ghost" loading={busy} onClick={() => { if (confirm('Objednávku odmítnout? Host dostane zprávu.')) act(o.id, 'declined'); }}>Odmítnout</Button></>}
          {o.status === 'confirmed' && <Button size="sm" variant="primary" loading={busy} onClick={() => act(o.id, 'done')}>Hotovo</Button>}
        </div>
      </div>
    </li>
  );
}
