'use client';

// Režim Client pro vedení — vedle TO GO. Tady se spravuje, co host vidí a
// dělá: rezervace, stoly, členové, věrnost a profil podniku. Stejný
// designový systém jako zbytek administrace; jen jiná sada obrazovek.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon, LogoMark } from '../Icons';
import { Button, PageHeader, Segmented, EmptyState, Skeleton, Menu } from '../ui';
import { Initials } from './ClientShell';
import StaffInbox from './StaffInbox';
import { czDay, RES_STATUS } from '@/lib/clientSlots';
import { dbTimeDayHM } from '@/lib/pragueTime';

type Tab = 'overview' | 'reservations' | 'orders' | 'tables' | 'customers' | 'loyalty' | 'settings';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Přehled', icon: 'overview' },
  { id: 'reservations', label: 'Rezervace', icon: 'calendarCheck' },
  { id: 'orders', label: 'Objednávky', icon: 'cup' },
  { id: 'tables', label: 'Stoly', icon: 'location' },
  { id: 'customers', label: 'Zákazníci', icon: 'users' },
  { id: 'loyalty', label: 'Věrnost', icon: 'gift' },
  { id: 'settings', label: 'Nastavení', icon: 'settings' },
];

const input = 'w-full rounded-2xl bg-white/70 border border-black/[0.08] px-4 py-2.5 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/60 focus:ring-2 focus:ring-[#C8F542]/25 focus:outline-none transition text-sm';
const label = 'block text-xs font-semibold text-black/55 mb-1.5';
const chip = (tone: string) => `inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone === 'ok' ? 'bg-[#C8F542]/25 text-[#3E5406]' : tone === 'wait' ? 'bg-amber-500/15 text-amber-800' : tone === 'done' ? 'bg-black/[0.06] text-black/60' : 'bg-red-500/10 text-red-700'}`;

async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, init ? { headers: { 'Content-Type': 'application/json' }, ...init } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Nepovedlo se.');
  return d;
}

export default function ClientAdmin({ onExit, initialTab }: { onExit: () => void; initialTab?: string }) {
  const [tab, setTab] = useState<Tab>((TABS.some(t => t.id === initialTab) ? initialTab : 'overview') as Tab);
  const [summary, setSummary] = useState<any | null>(null);
  const [toast, setToast] = useState('');
  const refreshSummary = useCallback(() => { fetch('/api/client/admin/summary').then(r => r.json()).then(setSummary).catch(() => {}); }, []);
  useEffect(() => { refreshSummary(); }, [refreshSummary, tab]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); } }, [toast]);

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: '#F1F3ED' }}>
      <header className="px-4 sm:px-6 pt-4 pb-2 flex items-center gap-3 flex-wrap chrome-edge">
        <button onClick={onExit} title="Zpět do administrace" aria-label="Zpět do administrace" className="tap-target rounded-full p-2 text-black/55 hover:text-black hover:bg-black/[0.05] transition"><Icon name="chevron" size={20} className="rotate-90" /></button>
        <LogoMark size={30} />
        <p className="font-bold tracking-tight leading-none">Managero <span className="text-black/45 font-semibold">client</span></p>
        {summary?.enabled === false && <span className="rounded-full bg-amber-500/15 text-amber-800 px-2.5 py-1 text-[11px] font-semibold">Pro hosty vypnuto</span>}
        {summary?.attention > 0 && <span className="rounded-full bg-[#16181A] text-[#C8F542] px-2.5 py-1 text-[11px] font-bold tabular-nums">{summary.attention} k vyřízení</span>}
        <div className="ml-auto hidden sm:block"><Button variant="secondary" size="sm" icon="external" onClick={() => summary?.slug && window.open(`/client/${summary.slug}`, '_blank')} disabled={!summary?.slug}>Stránka pro hosty</Button></div>
      </header>
      <div className="px-4 sm:px-6 pb-2">
        <Segmented options={TABS.map(t => ({ id: t.id, label: t.label }))} value={tab} onChange={setTab} size="sm" ariaLabel="Části režimu Client" wrap />
      </div>
      {toast && <p role="status" className="mx-4 sm:mx-6 rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/40 text-[#3E5406] text-sm px-4 py-2.5">{toast}</p>}
      <main className="flex-1 overflow-y-auto scrollbar-thin px-4 sm:px-6 py-4 pb-24 md:pb-8">
        {tab === 'overview' && <Overview summary={summary} go={setTab} />}
        {tab === 'reservations' && <Reservations toast={setToast} onChange={refreshSummary} />}
        {tab === 'orders' && (
          <div className="space-y-5 max-w-3xl">
            <PageHeader title="Objednávky" subtitle="Objednávky od stolu čekají na přijetí. Přijaté jdou do pokladny na stůl, hotové připíšou hostovi body." />
            <StaffInbox onToast={setToast} />
          </div>
        )}
        {tab === 'tables' && <Tables toast={setToast} />}
        {tab === 'customers' && <Customers toast={setToast} />}
        {tab === 'loyalty' && <Loyalty toast={setToast} />}
        {tab === 'settings' && <SettingsTab toast={setToast} onChange={refreshSummary} />}
      </main>
    </div>
  );
}

// ---- Přehled --------------------------------------------------------------------

function Overview({ summary, go }: { summary: any; go: (t: Tab) => void }) {
  const [today, setToday] = useState<any[] | null>(null);
  useEffect(() => { fetch('/api/client/admin/reservations?range=today').then(r => r.json()).then(d => setToday(d.reservations ?? [])).catch(() => setToday([])); }, []);
  if (!summary) return <PageSkel />;
  if (!summary.enabled) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Přehled" subtitle="Rezervace, členové a věrnost hostů na jednom místě." />
        <div className="mt-6">
          <EmptyState icon="sparkle" title="Managero client je pro hosty vypnutý"
            hint="Nastav profil podniku a zapni ho. Hosté pak podnik najdou, přidají se a rezervují."
            action={<Button variant="accent" icon="settings" onClick={() => go('settings')}>Nastavit a zapnout</Button>} />
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Přehled" subtitle={`Veřejná adresa: /client/${summary.slug}`}
        primary={<Button variant="accent" icon="calendarCheck" onClick={() => go('reservations')}>Rezervace{summary.reservations.requested ? ` (${summary.reservations.requested})` : ''}</Button>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([
          ['Nové objednávky', summary.orders?.new ?? 0, 'wait'],
          ['Čeká na potvrzení', summary.reservations.requested, 'wait'],
          ['Dnes rezervací', summary.reservations.today, 'ok'],
          ['Členů', summary.members, ''],
        ] as const).map(([k, v, tone]) => (
          <div key={k} className={`rounded-3xl p-4 border ${tone === 'wait' && v > 0 ? 'bg-amber-500/[0.08] border-amber-500/25' : 'glass-card border-transparent'}`}>
            <p className="text-[11px] uppercase tracking-wider text-black/50">{k}</p>
            <p className="text-2xl font-bold tabular-nums mt-1">{v}</p>
          </div>
        ))}
      </div>
      <section>
        <h2 className="text-base font-bold tracking-tight mb-2">Dnešní rezervace</h2>
        {today === null ? <Skeleton className="h-24 rounded-3xl" /> : today.length === 0
          ? <p className="text-sm text-black/55">Dnes nikdo rezervovaný. Klid, nebo prostor pro walk-in.</p>
          : <ul className="divide-y divide-black/[0.06]">{today.map(r => (
              <li key={r.id} className="py-2.5 flex items-center gap-x-3 gap-y-1 flex-wrap">
                <span className="font-semibold tabular-nums w-14 shrink-0">{r.time}</span>
                <Initials name={r.customer_name} size={28} />
                <span className="min-w-0 flex-1 basis-40 truncate">{r.customer_name} <span className="text-black/50">· {r.party} os.{r.table_name ? ` · ${r.table_name}` : ''}</span></span>
                <span className={`${chip(RES_STATUS[r.status]?.tone ?? 'wait')} ml-auto`}>{RES_STATUS[r.status]?.label ?? r.status}</span>
              </li>))}</ul>}
      </section>
    </div>
  );
}

function PageSkel() { return <div className="space-y-4"><Skeleton className="h-10 w-56 rounded-full" /><Skeleton className="h-28 rounded-3xl" /><Skeleton className="h-48 rounded-3xl" /></div>; }

// ---- Rezervace ------------------------------------------------------------------

function Reservations({ toast, onChange }: { toast: (m: string) => void; onChange: () => void }) {
  const [range, setRange] = useState<'today' | 'upcoming' | 'past'>('upcoming');
  const [d, setD] = useState<any | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const load = useCallback(() => fetch(`/api/client/admin/reservations?range=${range}`).then(r => r.json()).then(setD).catch(() => setD({ reservations: [], tables: [] })), [range]);
  useEffect(() => { setD(null); load(); }, [load]);
  const act = async (id: number, body: any) => {
    setBusy(id);
    try {
      const r = await j('/api/client/admin/reservations', { method: 'PATCH', body: JSON.stringify({ id, ...body }) });
      if (r.posNote) toast(r.posNote);
      else if (r.loyalty?.rewarded) toast('Hotovo. Host nasbíral všechna razítka a má odměnu.');
      else if (body.status) toast(`Rezervace: ${RES_STATUS[r.status]?.label ?? r.status}.`);
      await load(); onChange();
    } catch (e: any) { toast(e.message); }
    setBusy(null);
  };
  const groups = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const r of d?.reservations ?? []) { (m.get(r.date) ?? m.set(r.date, []).get(r.date)!).push(r); }
    return Array.from(m.entries());
  }, [d]);
  return (
    <div className="space-y-5">
      <PageHeader title="Rezervace" subtitle="Požadavky potvrď nebo odmítni; při příchodu hosty usaď — s napojenou pokladnou se rovnou otevře účet na stole."
        aside={<Segmented options={[{ id: 'today', label: 'Dnes' }, { id: 'upcoming', label: 'Nadcházející' }, { id: 'past', label: 'Minulé' }]} value={range} onChange={setRange} size="sm" ariaLabel="Období" />} />
      {d === null ? <PageSkel /> : groups.length === 0
        ? <EmptyState icon="calendarCheck" title={range === 'past' ? 'Žádné minulé rezervace' : 'Zatím žádné rezervace'} hint={range === 'past' ? '' : 'Objeví se tu, jakmile si host zarezervuje stůl na tvé stránce.'} compact />
        : groups.map(([date, rows]) => (
          <section key={date}>
            <h2 className="text-sm font-bold tracking-tight cz-sentence mb-1.5">{czDay(date, true)}</h2>
            <ul className="divide-y divide-black/[0.06]">
              {rows.map((r: any) => {
                const st = RES_STATUS[r.status] ?? RES_STATUS.requested;
                const can = (s: string) => ({ requested: ['confirmed', 'declined'], confirmed: ['seated', 'declined', 'done'], seated: ['done'] } as Record<string, string[]>)[r.status]?.includes(s);
                return (
                  <li key={r.id} className="py-3 grid grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto_auto] gap-x-3 gap-y-2 items-center">
                    <span className="font-semibold tabular-nums text-lg leading-none">{r.time}</span>
                    <div className="min-w-0">
                      <p className="font-semibold truncate flex items-center gap-2"><Initials name={r.customer_name} size={24} />{r.customer_name} <span className="text-black/50 font-medium">· {r.party} os.</span></p>
                      <p className="text-xs text-black/55 truncate">{r.customer_email}{r.note ? ` · „${r.note}"` : ''}</p>
                      <span className={`${chip(st.tone)} mt-1`}>{st.label}</span>
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <label className="sr-only" htmlFor={`tbl-${r.id}`}>Stůl</label>
                      <select id={`tbl-${r.id}`} value={r.table_id ?? ''} disabled={busy === r.id || ['done', 'declined', 'cancelled'].includes(r.status)} onChange={e => act(r.id, { tableId: e.target.value || null })} className={`${input} py-2 md:!w-40`}>
                        <option value="">Bez stolu</option>
                        {(d.tables ?? []).map((t: any) => <option key={t.id} value={t.id}>{t.name} · {t.seats} m.</option>)}
                      </select>
                    </div>
                    <div className="col-span-2 md:col-span-1 flex flex-wrap gap-1.5 justify-start md:justify-end">
                      {can('confirmed') && <Button size="sm" variant="accent" loading={busy === r.id} onClick={() => act(r.id, { status: 'confirmed' })}>Potvrdit</Button>}
                      {can('seated') && <Button size="sm" variant="primary" loading={busy === r.id} onClick={() => act(r.id, { status: 'seated' })}>Usadit</Button>}
                      {can('done') && <Button size="sm" variant="secondary" loading={busy === r.id} onClick={() => act(r.id, { status: 'done' })}>Hotovo</Button>}
                      {can('declined') && <Button size="sm" variant="ghost" loading={busy === r.id} onClick={() => { if (confirm('Rezervaci odmítnout? Host dostane zprávu.')) act(r.id, { status: 'declined' }); }}>Odmítnout</Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
    </div>
  );
}

// ---- Stoly ----------------------------------------------------------------------

function Tables({ toast }: { toast: (m: string) => void }) {
  const [d, setD] = useState<any | null>(null);
  const [name, setName] = useState(''); const [seats, setSeats] = useState(2); const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch('/api/client/admin/tables').then(r => r.json()).then(setD).catch(() => setD({ tables: [] })), []);
  useEffect(() => { load(); }, [load]);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim()) return; setBusy(true);
    try { await j('/api/client/admin/tables', { method: 'POST', body: JSON.stringify({ name, seats }) }); setName(''); await load(); } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  const imp = async () => {
    setBusy(true);
    try { const r = await j('/api/client/admin/tables', { method: 'POST', body: JSON.stringify({ action: 'import' }) }); toast(`Z pokladny: ${r.added} nových stolů, celkem ${r.total}.`); await load(); } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  const patch = async (id: number, body: any) => { try { await j('/api/client/admin/tables', { method: 'PATCH', body: JSON.stringify({ id, ...body }) }); await load(); } catch (e: any) { toast(e.message); } };
  const del = async (id: number) => { if (!confirm('Smazat stůl?')) return; await fetch(`/api/client/admin/tables?id=${id}`, { method: 'DELETE' }); load(); };
  return (
    <div className="space-y-5">
      <PageHeader title="Stoly" subtitle="Ke stolům se vážou rezervace i objednávky. S napojenou pokladnou je vezmi odtamtud, ať sedí čísla. Ikona tiskárny vytiskne QR na stůl, ze kterého host objedná."
        primary={d?.posConnected ? <Button variant="accent" icon="download" loading={busy} onClick={imp}>Načíst z pokladny</Button> : undefined} />
      <form onSubmit={add} className="grid grid-cols-[1fr_auto_auto] gap-2 items-end max-w-md">
        <div><label htmlFor="t-name" className={label}>Název stolu</label><input id="t-name" value={name} onChange={e => setName(e.target.value)} placeholder="U okna" className={input} /></div>
        <div><label htmlFor="t-seats" className={label}>Míst</label><input id="t-seats" type="number" min={1} max={40} value={seats} onChange={e => setSeats(parseInt(e.target.value || '2', 10))} className={`${input} !w-20 text-center`} /></div>
        <Button type="submit" variant="primary" icon="plus" loading={busy}>Přidat</Button>
      </form>
      {d === null ? <PageSkel /> : d.tables.length === 0
        ? <EmptyState icon="location" title="Zatím žádné stoly" hint={d.posConnected ? 'Načti je z pokladny, nebo přidej ručně.' : 'Přidej první stůl výš.'} compact />
        : <ul className="divide-y divide-black/[0.06] max-w-2xl">
            {d.tables.map((t: any) => (
              <li key={t.id} className={`py-2.5 flex items-center gap-3 ${t.active ? '' : 'opacity-50'}`}>
                <input aria-label={`Název stolu ${t.name}`} defaultValue={t.name} onBlur={e => e.target.value !== t.name && patch(t.id, { name: e.target.value })} className={`${input} py-1.5 flex-1 min-w-0`} />
                <input aria-label="Počet míst" type="number" min={1} max={40} defaultValue={t.seats} onBlur={e => Number(e.target.value) !== t.seats && patch(t.id, { seats: Number(e.target.value) })} className={`${input} py-1.5 !w-16 text-center`} />
                <span className="text-xs text-black/45 hidden sm:inline w-24 truncate">{t.storyous_desk_id ? `kasa #${t.storyous_desk_id}` : 'jen u nás'}</span>
                <button onClick={() => window.open(`/api/client/admin/tables/qr?tableId=${t.id}`, '_blank')} aria-label={`Vytisknout QR stolu ${t.name}`} title="QR na stůl k tisku" className="tap-target-sm rounded-full p-2 text-black/55 hover:text-black hover:bg-black/[0.05] transition"><Icon name="print" size={16} /></button>
                <button onClick={() => patch(t.id, { active: !t.active })} aria-pressed={!!t.active} className={`tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold transition ${t.active ? 'bg-[#C8F542]/25 text-[#3E5406]' : 'bg-black/[0.06] text-black/55'}`}>{t.active ? 'Aktivní' : 'Skrytý'}</button>
                <button onClick={() => del(t.id)} aria-label="Smazat stůl" className="tap-target-sm rounded-full p-2 text-black/40 hover:text-red-700 hover:bg-red-500/10 transition"><Icon name="trash" size={16} /></button>
              </li>
            ))}
          </ul>}
    </div>
  );
}

// ---- Zákazníci ------------------------------------------------------------------

function Customers({ toast }: { toast: (m: string) => void }) {
  const [sub, setSub] = useState<'members' | 'reviews' | 'messages'>('members');
  const sub_title: Record<string, string> = {
    members: 'Kdo se k podniku přidal, kolik má bodů a razítek, deník změn.',
    reviews: 'Host dostane po hotové rezervaci nebo objednávce výzvu k hodnocení. Slabé hodnocení (1 až 2 hvězdy) ti přijde jako oznámení.',
    messages: 'Novinka, akce nebo sezónní nabídka pro všechny členy. Přijde jako oznámení v aplikaci a push na telefon. Nejvýš pět za den.',
  };
  return (
    <div className="space-y-5">
      <PageHeader title="Zákazníci" subtitle={sub_title[sub]} />
      <Segmented options={[{ id: 'members', label: 'Členové' }, { id: 'reviews', label: 'Hodnocení' }, { id: 'messages', label: 'Zprávy členům' }]} value={sub} onChange={setSub} size="sm" ariaLabel="Části zákazníků" wrap />
      {sub === 'members' && <Members toast={toast} />}
      {sub === 'reviews' && <Reviews />}
      {sub === 'messages' && <Broadcast toast={toast} />}
    </div>
  );
}

function Members({ toast }: { toast: (m: string) => void }) {
  const [q, setQ] = useState(''); const [d, setD] = useState<any | null>(null);
  const [openId, setOpenId] = useState<number | null>(null); const [ledger, setLedger] = useState<any[] | null>(null);
  const load = useCallback(() => fetch(`/api/client/admin/customers?q=${encodeURIComponent(q)}`).then(r => r.json()).then(setD).catch(() => setD({ customers: [], total: 0 })), [q]);
  useEffect(() => { const t = setTimeout(load, q ? 250 : 0); return () => clearTimeout(t); }, [load, q]);
  const adjust = async (id: number, name: string) => {
    const v = prompt(`Body pro ${name} (kladné přičtou, záporné odečtou):`); if (!v) return;
    const delta = parseInt(v, 10); if (!delta) return;
    const note = prompt('Proč? (volitelné)') || '';
    try { const r = await j('/api/client/admin/loyalty', { method: 'POST', body: JSON.stringify({ customerId: id, delta, note }) }); toast(`${name}: teď ${r.points} bodů.`); load(); if (openId === id) showLedger(id); } catch (e: any) { toast(e.message); }
  };
  const showLedger = async (id: number) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id); setLedger(null);
    const r = await fetch(`/api/client/admin/loyalty?customerId=${id}`).then(r => r.json()).catch(() => ({ ledger: [] }));
    setLedger(r.ledger ?? []);
  };
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full max-w-sm"><Icon name="search" size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-black/40" /><input aria-label="Hledat zákazníka" value={q} onChange={e => setQ(e.target.value)} placeholder="Jméno nebo e-mail" className={`${input} pl-10 rounded-full`} /></div>
        {d && <p className="text-sm text-black/55 tabular-nums">{d.total} {d.total === 1 ? 'člen' : d.total < 5 ? 'členové' : 'členů'}</p>}
      </div>
      {d === null ? <PageSkel /> : d.customers.length === 0
        ? <EmptyState icon="users" title={q ? 'Nikdo takový' : 'Zatím žádní členové'} hint={q ? '' : 'Přidají se sami na tvé stránce pro hosty.'} compact />
        : <ul className="divide-y divide-black/[0.06]">
            {d.customers.map((c: any) => (
              <li key={c.id} className="py-3">
                <div className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 gap-y-1 items-center">
                  <Initials name={c.name} size={36} />
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{c.name}</p>
                    <p className="text-xs text-black/55 break-words md:truncate">{c.email} · člen od {new Date(c.joined_at).toLocaleDateString('cs-CZ')}{c.last_visit_at ? ` · naposledy ${new Date(c.last_visit_at).toLocaleDateString('cs-CZ')}` : ''}</p>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="font-bold">{c.points} <span className="text-xs font-medium text-black/50">b.</span></p>
                    <p className="text-xs text-black/55">{c.stamps} raz. · {c.visits} návšt.</p>
                  </div>
                  <span className="hidden md:inline text-xs text-black/55">{c.reservations} rez.{c.open_coupons ? ` · ${c.open_coupons} kupon` : ''}</span>
                  <div className="col-span-3 md:col-span-1 flex gap-1.5 justify-end">
                    <Button size="sm" variant="secondary" onClick={() => adjust(c.id, c.name)}>Body ±</Button>
                    <Button size="sm" variant="ghost" onClick={() => showLedger(c.id)}>{openId === c.id ? 'Skrýt' : 'Deník'}</Button>
                  </div>
                </div>
                {openId === c.id && (
                  <div className="mt-2 ml-0 md:ml-12 rounded-2xl bg-black/[0.03] border border-black/[0.06] p-3 text-xs">
                    {ledger === null ? <Skeleton className="h-10 rounded-xl" /> : ledger.length === 0 ? <p className="text-black/55">Deník je prázdný.</p>
                      : <ul className="divide-y divide-black/[0.06]">{ledger.map((l: any) => (
                          <li key={l.id} className="py-1.5 flex gap-3"><span className="text-black/45 w-24 shrink-0">{dbTimeDayHM(l.created_at)}</span><span className={`w-12 shrink-0 font-semibold tabular-nums ${l.delta > 0 ? 'text-[#3E5406]' : l.delta < 0 ? 'text-red-700' : 'text-black/45'}`}>{l.delta > 0 ? '+' : ''}{l.delta}</span><span className="min-w-0 truncate">{l.note || l.kind}</span></li>))}</ul>}
                  </div>
                )}
              </li>
            ))}
          </ul>}
    </div>
  );
}

// ---- Věrnost --------------------------------------------------------------------

function Loyalty({ toast }: { toast: (m: string) => void }) {
  const [sub, setSub] = useState<'rules' | 'promos'>('rules');
  return (
    <div className="space-y-5">
      <PageHeader title="Věrnost" subtitle={sub === 'rules'
        ? 'Razítka za návštěvy, body za útratu, kupony za body. Host ukáže kartičku nebo kód kuponu u kasy; obsluha ho načte v Objednávkách nebo v kiosku.'
        : 'Na leták, do příspěvku, na účtenku. Host kód zadá na tvé stránce ve Věrnosti a dostane body, kupon, nebo obojí. Každý host jednou.'} />
      <Segmented options={[{ id: 'rules', label: 'Pravidla a kupony' }, { id: 'promos', label: 'Promo kódy' }]} value={sub} onChange={setSub} size="sm" ariaLabel="Části věrnosti" wrap />
      {sub === 'rules' && <LoyaltyRules toast={toast} />}
      {sub === 'promos' && <Promos toast={toast} />}
    </div>
  );
}

function LoyaltyRules({ toast }: { toast: (m: string) => void }) {
  const [p, setP] = useState<any | null>(null); const [coupons, setCoupons] = useState<any[] | null>(null);
  const [form, setForm] = useState({ title: '', description: '', cost_points: 100, valid_until: '' });
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetch('/api/client/admin/profile').then(r => r.json()).then(d => setP(d.profile)).catch(() => {});
    fetch('/api/client/admin/coupons').then(r => r.json()).then(d => setCoupons(d.coupons ?? [])).catch(() => setCoupons([]));
  }, []);
  useEffect(() => { load(); }, [load]);
  const saveRules = async () => {
    setBusy(true);
    try { await j('/api/client/admin/profile', { method: 'PUT', body: JSON.stringify({ loyalty_on: p.loyalty_on, points_per_100: p.points_per_100, stamp_target: p.stamp_target, stamp_reward: p.stamp_reward }) }); toast('Pravidla věrnosti uložena.'); } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  const addCoupon = async (e: React.FormEvent) => {
    e.preventDefault(); if (!form.title.trim()) return; setBusy(true);
    try { await j('/api/client/admin/coupons', { method: 'POST', body: JSON.stringify(form) }); setForm({ title: '', description: '', cost_points: 100, valid_until: '' }); load(); } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  const redeem = async (e: React.FormEvent) => {
    e.preventDefault(); if (!code.trim()) return; setBusy(true);
    try { const r = await j('/api/client/admin/redeem', { method: 'POST', body: JSON.stringify({ code }) }); toast(`Uplatněno: ${r.title} · ${r.customer}.`); setCode(''); load(); } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  if (!p || coupons === null) return <PageSkel />;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6 items-start">
        <div className="space-y-5">
          <section className="glass-card p-5 space-y-3">
            <h2 className="font-bold tracking-tight">Pravidla</h2>
            <label className="flex items-center min-h-9 py-1 gap-3 text-sm"><input type="checkbox" checked={!!p.loyalty_on} onChange={e => setP({ ...p, loyalty_on: e.target.checked })} className="h-4 w-4 accent-[#16181A]" /> Věrnost pro hosty zapnutá</label>
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor="l-pts" className={label}>Bodů za 100 Kč</label><input id="l-pts" type="number" min={0} max={100} value={p.points_per_100} onChange={e => setP({ ...p, points_per_100: e.target.value })} className={input} /></div>
              <div><label htmlFor="l-stamps" className={label}>Razítek do odměny</label><input id="l-stamps" type="number" min={0} max={50} value={p.stamp_target} onChange={e => setP({ ...p, stamp_target: e.target.value })} className={input} /></div>
            </div>
            <div><label htmlFor="l-reward" className={label}>Odměna za razítka</label><input id="l-reward" value={p.stamp_reward ?? ''} onChange={e => setP({ ...p, stamp_reward: e.target.value })} placeholder="Nápoj zdarma" className={input} /></div>
            <p className="text-xs text-black/50">Razítko přibude, když rezervaci nebo objednávku označíš jako hotovou. Body za útratu přijdou s objednávkami od stolu.</p>
            <Button variant="accent" loading={busy} onClick={saveRules}>Uložit pravidla</Button>
          </section>
          <form onSubmit={redeem} className="glass-card p-5 space-y-3">
            <h2 className="font-bold tracking-tight">Uplatnit kupon</h2>
            <div><label htmlFor="l-code" className={label}>Kód od hosta</label><input id="l-code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABC-123" className={`${input} font-mono tracking-widest`} /></div>
            <Button type="submit" variant="primary" icon="check" loading={busy}>Uplatnit</Button>
          </form>
        </div>
        <div className="space-y-5">
          <form onSubmit={addCoupon} className="glass-card p-5 grid gap-3">
            <h2 className="font-bold tracking-tight">Nový kupon za body</h2>
            <div><label htmlFor="c-title" className={label}>Název</label><input id="c-title" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Dezert k čaji zdarma" className={input} /></div>
            <div><label htmlFor="c-desc" className={label}>Popis</label><input id="c-desc" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Jeden dezert z vitríny podle výběru." className={input} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label htmlFor="c-cost" className={label}>Cena v bodech</label><input id="c-cost" type="number" min={0} value={form.cost_points} onChange={e => setForm({ ...form, cost_points: parseInt(e.target.value || '0', 10) })} className={input} /></div>
              <div><label htmlFor="c-until" className={label}>Platí do</label><input id="c-until" type="date" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} className={input} /></div>
            </div>
            <Button type="submit" variant="primary" icon="plus" loading={busy}>Přidat kupon</Button>
          </form>
          <section>
            <h2 className="font-bold tracking-tight mb-2">Kupony</h2>
            {coupons.length === 0 ? <EmptyState icon="gift" title="Zatím žádný kupon" hint="Přidej první výš. Sto bodů je asi dva tisíce korun útraty." compact />
              : <ul className="divide-y divide-black/[0.06]">{coupons.map(c => (
                  <li key={c.id} className={`py-3 flex items-center gap-3 ${c.active ? '' : 'opacity-50'}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{c.title} <span className="text-black/50 font-medium tabular-nums">· {Number(c.cost_points) === 0 ? 'zdarma' : `${c.cost_points} b.`}</span></p>
                      <p className="text-xs text-black/55 truncate">{c.description || '—'}{c.valid_until ? ` · do ${czDay(c.valid_until)}` : ''} · vzato {c.claimed}×, uplatněno {c.redeemed}×</p>
                    </div>
                    <button onClick={async () => { await j('/api/client/admin/coupons', { method: 'PATCH', body: JSON.stringify({ id: c.id, active: !c.active }) }); load(); }} aria-pressed={!!c.active}
                      className={`tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold transition ${c.active ? 'bg-[#C8F542]/25 text-[#3E5406]' : 'bg-black/[0.06] text-black/55'}`}>{c.active ? 'Aktivní' : 'Vypnutý'}</button>
                  </li>))}</ul>}
          </section>
        </div>
      </div>
    </div>
  );
}

// ---- Nastavení ------------------------------------------------------------------

function SettingsTab({ toast, onChange }: { toast: (m: string) => void; onChange: () => void }) {
  const [d, setD] = useState<any | null>(null); const [p, setP] = useState<any | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/client/admin/profile').then(r => r.json()).then(x => { setD(x); setP(x.profile); }).catch(() => {}); }, []);
  if (!d || !p) return <PageSkel />;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await j('/api/client/admin/profile', { method: 'PUT', body: JSON.stringify({ enabled: p.enabled, slug: p.slug, tagline: p.tagline, description: p.description, address: p.address, cover_url: p.cover_url, reservations_on: p.reservations_on, ordering_on: p.ordering_on, max_party: p.max_party, lead_days: p.lead_days, slot_minutes: p.slot_minutes, menu_slug: p.menu_slug || null }) });
      setP(r.profile); setD({ ...d, url: r.url }); toast(r.profile.enabled ? 'Uloženo. Podnik je pro hosty zapnutý.' : 'Uloženo. Podnik je zatím vypnutý.'); onChange();
    } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  const copy = () => { navigator.clipboard?.writeText(d.url).then(() => toast('Adresa zkopírována.')).catch(() => {}); };
  const hoursOk = Object.values(p.opening_hours ?? {}).some((h: any) => h && !h.closed && h.open);
  return (
    <form onSubmit={save} className="space-y-6 max-w-3xl">
      <PageHeader title="Nastavení" subtitle="Jak podnik vidí hosté a co u něj můžou dělat." primary={<Button type="submit" variant="accent" loading={busy}>Uložit</Button>} />
      <section className="glass-card p-5 space-y-4">
        <label className="flex items-center min-h-9 py-1 gap-3"><input type="checkbox" checked={!!p.enabled} onChange={e => setP({ ...p, enabled: e.target.checked })} className="h-4 w-4 accent-[#16181A]" /><span className="font-semibold">Zapnout pro hosty</span></label>
        <div>
          <label htmlFor="s-slug" className={label}>Veřejná adresa</label>
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-sm text-black/50">/client/</span>
            <input id="s-slug" value={p.slug} onChange={e => setP({ ...p, slug: e.target.value })} className={`${input} flex-1 min-w-[10rem]`} />
            <Button type="button" variant="secondary" size="sm" icon="copy" onClick={copy}>Kopírovat</Button>
          </div>
          <p className="text-xs text-black/50 mt-1 break-all">{d.url}</p>
        </div>
        {!hoursOk && <p className="text-xs rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-800 px-3 py-2">Podnik nemá vyplněnou otevírací dobu (Rozvrh → Otevírací doba). Bez ní hosté nemůžou rezervovat.</p>}
      </section>
      <section className="glass-card p-5 grid gap-4">
        <h2 className="font-bold tracking-tight">Profil</h2>
        <div><label htmlFor="s-tag" className={label}>Motto</label><input id="s-tag" value={p.tagline ?? ''} onChange={e => setP({ ...p, tagline: e.target.value })} placeholder="Čaj z lístků, ne z pytlíků." className={input} maxLength={120} /></div>
        <div><label htmlFor="s-desc" className={label}>O podniku</label><textarea id="s-desc" value={p.description ?? ''} onChange={e => setP({ ...p, description: e.target.value })} rows={3} className={input} maxLength={1200} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label htmlFor="s-addr" className={label}>Adresa</label><input id="s-addr" value={p.address ?? ''} onChange={e => setP({ ...p, address: e.target.value })} className={input} /></div>
          <div><label htmlFor="s-cover" className={label}>Fotka (adresa obrázku)</label><input id="s-cover" value={p.cover_url ?? ''} onChange={e => setP({ ...p, cover_url: e.target.value })} placeholder="https://…" className={input} /></div>
        </div>
        <div>
          <label htmlFor="s-menu" className={label}>Nabídka pro hosty</label>
          <select id="s-menu" value={p.menu_slug ?? ''} onChange={e => setP({ ...p, menu_slug: e.target.value })} className={input}>
            <option value="">První zapnuté menu</option>
            {(d.boards ?? []).map((b: any) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
          </select>
          <p className="text-xs text-black/50 mt-1">Bere se z obrazovky Menu. Bez menu se hostům ukáže jen profil.</p>
        </div>
      </section>
      <section className="glass-card p-5 grid gap-4">
        <h2 className="font-bold tracking-tight">Rezervace</h2>
        <label className="flex items-center min-h-9 py-1 gap-3 text-sm"><input type="checkbox" checked={!!p.reservations_on} onChange={e => setP({ ...p, reservations_on: e.target.checked })} className="h-4 w-4 accent-[#16181A]" /> Hosté můžou rezervovat</label>
        <label className="flex items-center min-h-9 py-1 gap-3 text-sm"><input type="checkbox" checked={!!p.ordering_on} onChange={e => setP({ ...p, ordering_on: e.target.checked })} className="h-4 w-4 accent-[#16181A]" /> Hosté můžou objednávat od stolu</label>
        <p className="text-xs text-black/50 -mt-2">Objednávky potřebují stoly (záložka Stoly) a nabídku z Menu. S napojenou pokladnou jdou přijaté objednávky rovnou na stůl v kase.</p>
        <div className="grid grid-cols-3 gap-3">
          <div><label htmlFor="s-party" className={label}>Nejvíc osob</label><input id="s-party" type="number" min={1} max={40} value={p.max_party} onChange={e => setP({ ...p, max_party: e.target.value })} className={input} /></div>
          <div><label htmlFor="s-lead" className={label}>Dní dopředu</label><input id="s-lead" type="number" min={1} max={180} value={p.lead_days} onChange={e => setP({ ...p, lead_days: e.target.value })} className={input} /></div>
          <div><label htmlFor="s-slot" className={label}>Krok (min)</label><input id="s-slot" type="number" min={15} max={120} step={15} value={p.slot_minutes} onChange={e => setP({ ...p, slot_minutes: e.target.value })} className={input} /></div>
        </div>
      </section>
    </form>
  );
}

// ---- Hodnocení ------------------------------------------------------------------

function Reviews() {
  const [d, setD] = useState<any | null>(null);
  useEffect(() => { fetch('/api/client/admin/reviews').then(r => r.json()).then(setD).catch(() => setD({ reviews: [], count: 0, avg: null, dist: [0, 0, 0, 0, 0] })); }, []);
  if (!d) return <PageSkel />;
  const max = Math.max(1, ...(d.dist ?? []));
  return (
    <div className="space-y-5">
      {d.count === 0 ? <EmptyState icon="star" title="Zatím žádné hodnocení" hint="Objeví se, jakmile host ohodnotí hotovou návštěvu." compact /> : (
        <div className="grid grid-cols-1 md:grid-cols-[auto_1fr] gap-6 items-start">
          <div className="glass-card p-5 min-w-[14rem]">
            <p className="text-4xl font-bold tabular-nums leading-none">{d.avg ?? '–'}<span className="text-base font-medium text-black/45"> / 5</span></p>
            <p className="text-xs text-black/55 mt-1">{d.count} {d.count === 1 ? 'hodnocení' : 'hodnocení'}</p>
            <ul className="mt-4 space-y-1">
              {[5, 4, 3, 2, 1].map(n => (
                <li key={n} className="flex items-center gap-2 text-xs tabular-nums"><span className="w-3 text-black/55">{n}</span><span className="text-[#16181A]">★</span><span className="flex-1 h-2 rounded-full bg-black/[0.06] overflow-hidden"><span className="block h-full bg-[#C8F542]" style={{ width: `${(d.dist[n - 1] / max) * 100}%` }} /></span><span className="w-6 text-right text-black/55">{d.dist[n - 1]}</span></li>
              ))}
            </ul>
          </div>
          <ul className="divide-y divide-black/[0.06]">
            {d.reviews.map((v: any) => (
              <li key={v.id} className="py-3 flex items-start gap-3">
                <Initials name={v.customer_name} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight flex items-center gap-2 flex-wrap"><span className="truncate">{v.customer_name}</span><span className="text-[#16181A] tracking-tight" aria-label={`${v.rating} z 5`}>{'★'.repeat(Number(v.rating))}<span className="text-black/20">{'★'.repeat(5 - Number(v.rating))}</span></span></p>
                  {v.note ? <p className="text-sm text-black/70 mt-0.5 text-pretty">„{v.note}"</p> : <p className="text-sm text-black/45 mt-0.5">Bez komentáře.</p>}
                  <p className="text-xs text-black/45 mt-1">{dbTimeDayHM(v.created_at)} · {String(v.ref).startsWith('ord:') ? 'objednávka od stolu' : 'rezervace'}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---- Zprávy členům --------------------------------------------------------------

function Broadcast({ toast }: { toast: (m: string) => void }) {
  const [d, setD] = useState<any | null>(null);
  const [f, setF] = useState({ title: '', body: '' }); const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch('/api/client/admin/broadcast').then(r => r.json()).then(setD).catch(() => setD({ history: [], members: 0 })), []);
  useEffect(() => { load(); }, [load]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); if (!f.title.trim()) return;
    if (!confirm(`Poslat zprávu všem členům (${d?.members ?? 0})?`)) return;
    setBusy(true);
    try { const r = await j('/api/client/admin/broadcast', { method: 'POST', body: JSON.stringify(f) }); toast(`Odesláno ${r.broadcast.recipients} členům.`); setF({ title: '', body: '' }); load(); } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  if (!d) return <PageSkel />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6 items-start">
        <form onSubmit={send} className="glass-card p-5 grid gap-3">
          <div><label htmlFor="bc-title" className={label}>Nadpis</label><input id="bc-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Nový čaj z jarní sklizně" maxLength={80} className={input} /></div>
          <div><label htmlFor="bc-body" className={label}>Text</label><textarea id="bc-body" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} placeholder="Tento týden ochutnávka zdarma ke každé konvici." maxLength={300} rows={3} className={`${input} resize-none`} /></div>
          <Button type="submit" variant="accent" icon="send" loading={busy} disabled={!d.members}>Poslat {d.members} {d.members === 1 ? 'členovi' : 'členům'}</Button>
        </form>
        <section>
          <h2 className="font-bold tracking-tight mb-2">Odeslané</h2>
          {d.history.length === 0 ? <EmptyState icon="mail" title="Zatím nic odeslaného" hint="První zpráva pojde všem, kdo se k podniku přidali." compact />
            : <ul className="divide-y divide-black/[0.06]">{d.history.map((h: any) => (
                <li key={h.id} className="py-3">
                  <p className="font-semibold leading-tight">{h.title}</p>
                  {h.body && <p className="text-sm text-black/65 mt-0.5 text-pretty">{h.body}</p>}
                  <p className="text-xs text-black/45 mt-1">{dbTimeDayHM(h.sent_at)} · {h.recipients} {h.recipients === 1 ? 'člen' : h.recipients < 5 ? 'členové' : 'členů'}</p>
                </li>))}</ul>}
        </section>
      </div>
    </div>
  );
}

// ---- Promo kódy -----------------------------------------------------------------

function Promos({ toast }: { toast: (m: string) => void }) {
  const [d, setD] = useState<any | null>(null); const [coupons, setCoupons] = useState<any[]>([]);
  const [f, setF] = useState({ code: '', title: '', points: 50, coupon_id: '', max_uses: '', valid_until: '' }); const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    fetch('/api/client/admin/promos').then(r => r.json()).then(x => setD({ promos: x.promos ?? [] })).catch(() => setD({ promos: [] }));
    fetch('/api/client/admin/coupons').then(r => r.json()).then(x => setCoupons((x.coupons ?? []).filter((c: any) => c.active))).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await j('/api/client/admin/promos', { method: 'POST', body: JSON.stringify(f) }); toast(`Kód ${f.code.toUpperCase()} je aktivní.`); setF({ code: '', title: '', points: 50, coupon_id: '', max_uses: '', valid_until: '' }); load(); } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  if (!d) return <PageSkel />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6 items-start">
        <form onSubmit={add} className="glass-card p-5 grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="pr-code" className={label}>Kód</label><input id="pr-code" value={f.code} onChange={e => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) })} placeholder="JARO26" className={`${input} font-mono tracking-widest`} /></div>
            <div><label htmlFor="pr-pts" className={label}>Bodů</label><input id="pr-pts" type="number" min={0} max={10000} value={f.points} onChange={e => setF({ ...f, points: parseInt(e.target.value || '0', 10) })} className={input} /></div>
          </div>
          <div><label htmlFor="pr-title" className={label}>Název</label><input id="pr-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Jarní leták" maxLength={80} className={input} /></div>
          <div><label htmlFor="pr-coupon" className={label}>Kupon navíc</label>
            <select id="pr-coupon" value={f.coupon_id} onChange={e => setF({ ...f, coupon_id: e.target.value })} className={input}><option value="">Žádný</option>{coupons.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="pr-max" className={label}>Nejvýš použití</label><input id="pr-max" type="number" min={1} value={f.max_uses} onChange={e => setF({ ...f, max_uses: e.target.value })} placeholder="bez limitu" className={input} /></div>
            <div><label htmlFor="pr-until" className={label}>Platí do</label><input id="pr-until" type="date" value={f.valid_until} onChange={e => setF({ ...f, valid_until: e.target.value })} className={input} /></div>
          </div>
          <Button type="submit" variant="accent" icon="plus" loading={busy}>Vytvořit kód</Button>
        </form>
        <section>
          <h2 className="font-bold tracking-tight mb-2">Kódy</h2>
          {d.promos.length === 0 ? <EmptyState icon="tag" title="Zatím žádný promo kód" hint="Vytvoř první vlevo. Krátký a snadno opsatelný funguje nejlíp." compact />
            : <ul className="divide-y divide-black/[0.06]">{d.promos.map((p: any) => (
                <li key={p.id} className={`py-3 flex items-center gap-3 ${p.active ? '' : 'opacity-50'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate"><span className="font-mono tracking-widest">{p.code}</span> <span className="text-black/50 font-medium">· {p.title}</span></p>
                    <p className="text-xs text-black/55 truncate">{Number(p.points) > 0 ? `${p.points} b.` : ''}{Number(p.points) > 0 && p.coupon_title ? ' + ' : ''}{p.coupon_title ? `kupon ${p.coupon_title}` : ''} · použito {p.uses}×{p.max_uses ? ` z ${p.max_uses}` : ''}{p.valid_until ? ` · do ${czDay(p.valid_until)}` : ''}</p>
                  </div>
                  <button onClick={async () => { try { await j('/api/client/admin/promos', { method: 'PATCH', body: JSON.stringify({ id: p.id, active: !p.active }) }); load(); } catch (e: any) { toast(e.message); } }} aria-pressed={!!p.active}
                    className={`tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold transition ${p.active ? 'bg-[#C8F542]/25 text-[#3E5406]' : 'bg-black/[0.06] text-black/55'}`}>{p.active ? 'Aktivní' : 'Vypnutý'}</button>
                </li>))}</ul>}
        </section>
      </div>
    </div>
  );
}
