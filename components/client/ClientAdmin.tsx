'use client';

// Režim Client pro vedení — vedle TO GO. Tady se spravuje, co host vidí a
// dělá: rezervace, stoly, členové, věrnost a profil podniku. Stejný
// designový systém jako zbytek administrace; jen jiná sada obrazovek.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../ThemeProvider';
import { Icon, LogoMark } from '../Icons';
import { Button, PageHeader, Segmented, EmptyState, Skeleton, Menu } from '../ui';
import { Initials } from './ClientShell';
import StaffInbox from './StaffInbox';
import MobileMoreSheet from '../MobileMoreSheet';
import { levelFor } from '@/lib/clientSlots';
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

/** Dlaždice jako na přehledu podniku: štítek, ikona v tónovaném kolečku, číslo. Kliknutím do záložky. */
function StatCard({ icon, label, value, onClick, tone = 'ok' }: { icon: string; label: string; value: number | string; onClick?: () => void; tone?: 'ok' | 'wait' | 'muted' }) {
  const ring = tone === 'wait' ? 'bg-amber-500/15 border-amber-500/25 text-amber-800' : tone === 'muted' ? 'bg-black/[0.05] border-black/[0.08] text-black/55' : 'bg-[#C8F542]/15 border-[#C8F542]/30 text-[#4F6A07]';
  return (
    <button type="button" onClick={onClick} className={`text-left glass-card p-4 sm:p-5 transition-all duration-300 hover:bg-white/80 active:scale-[0.99] ${tone === 'wait' ? 'ring-1 ring-amber-500/25' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider text-black/50 leading-tight">{label}</p>
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${ring}`}><Icon name={icon} size={16} /></span>
      </div>
      <p className="text-3xl font-bold tracking-tight tabular-nums text-[#16181A] mt-3">{value}</p>
    </button>
  );
}

/** Nadpis sekce s ikonou v kolečku a volitelnou akcí vpravo — stejný rytmus jako dashboard. */
function SectionTitle({ icon, children, action }: { icon: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <h2 className="text-base font-bold tracking-tight flex items-center gap-2.5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#C8F542]/15 border border-[#C8F542]/30 text-[#4F6A07]"><Icon name={icon} size={15} /></span>
        {children}
      </h2>
      {action}
    </div>
  );
}

/** Odkaz do jiné záložky — v textu, s šipkou. */
function GoLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="tap-target-sm inline-flex items-center gap-1 text-sm font-semibold text-[#16181A] hover:text-[#4F6A07] transition">{children}<Icon name="chevron" size={14} className="-rotate-90" /></button>;
}

async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, init ? { headers: { 'Content-Type': 'application/json' }, ...init } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Nepovedlo se.');
  return d;
}

export default function ClientAdmin({ onExit, initialTab }: { onExit: () => void; initialTab?: string }) {
  const [tab, setTab] = useState<Tab>((TABS.some(t => t.id === initialTab) ? initialTab : 'overview') as Tab);
  // Správa Managero client je světlá i při tmavém motivu účtu (viz ThemeProvider).
  const { setForcedLight } = useTheme();
  useEffect(() => { setForcedLight(true); return () => setForcedLight(false); }, [setForcedLight]);
  const [summary, setSummary] = useState<any | null>(null);
  const [toast, setToast] = useState('');
  // Jméno hosta z rezervace nebo přehledu otevře Zákazníky s předvyplněným hledáním.
  const [custQ, setCustQ] = useState('');
  const openCustomer = useCallback((q: string) => { setCustQ(q); setTab('customers'); }, []);
  // Mobil: spodní dock jako ve zbytku aplikace; horní záložky jen na počítači.
  const [moreOpen, setMoreOpen] = useState(false);
  const dockIds: Tab[] = ['overview', 'reservations', 'orders'];
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
      <div className="hidden md:block px-4 sm:px-6 pb-2">
        <Segmented options={TABS.map(t => ({ id: t.id, label: t.label }))} value={tab} onChange={setTab} size="sm" ariaLabel="Části režimu Client" wrap />
      </div>
      {toast && <p role="status" className="mx-4 sm:mx-6 rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/40 text-[#3E5406] text-sm px-4 py-2.5">{toast}</p>}
      <main className="flex-1 overflow-y-auto scrollbar-thin px-4 sm:px-6 py-4 pb-36 md:pb-8">
        {tab === 'overview' && <Overview summary={summary} go={setTab} onCustomer={openCustomer} />}
        {tab === 'reservations' && <Reservations toast={setToast} onChange={refreshSummary} onCustomer={openCustomer} />}
        {tab === 'orders' && (
          <div className="space-y-5 max-w-3xl">
            <PageHeader title="Objednávky" subtitle="Objednávky od stolu čekají na přijetí. Přijaté jdou do pokladny na stůl, hotové připíšou hostovi body." />
            <StaffInbox onToast={setToast} />
          </div>
        )}
        {tab === 'tables' && <Tables toast={setToast} />}
        {tab === 'customers' && <Customers toast={setToast} initialQuery={custQ} />}
        {tab === 'loyalty' && <Loyalty toast={setToast} />}
        {tab === 'settings' && <SettingsTab toast={setToast} onChange={refreshSummary} />}
      </main>

      {/* Mobilní spodní dock — stejný jazyk jako administrace a zaměstnanec. */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <nav className="dock-strong mx-auto max-w-md rounded-[26px] px-2 py-2 flex items-center justify-around shadow-[0_10px_34px_rgba(25,35,15,0.16)]" aria-label="Spodní navigace klienta">
          {TABS.filter(t => dockIds.includes(t.id)).map(item => (
            <button key={item.id} onClick={() => { setTab(item.id); setMoreOpen(false); }} title={item.label}
              className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition-all duration-200 ${tab === item.id ? 'text-[#16181A] -translate-y-0.5' : 'text-black/40'}`}>
              <Icon key={tab === item.id ? 'on' : 'off'} name={item.icon} size={22} strokeWidth={tab === item.id ? 2 : 1.7} className="i-lead" motion={tab === item.id ? 'pop' : undefined} />
              <span className={`text-[11px] leading-none font-medium ${tab === item.id ? 'text-[#16181A]' : 'text-black/40'}`}>{item.label}</span>
            </button>
          ))}
          <button onClick={() => setMoreOpen(v => !v)} title="Více"
            className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition-all duration-200 ${moreOpen || !dockIds.includes(tab) ? 'text-[#16181A]' : 'text-black/40'}`}>
            <Icon name="menu" size={22} />
            <span className="text-[11px] leading-none font-medium">Více</span>
          </button>
        </nav>
      </div>
      <MobileMoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="Managero client"
        groups={[
          { title: 'Provoz', items: TABS.filter(t => t.id === 'tables') },
          { title: 'Hosté', items: TABS.filter(t => t.id === 'customers' || t.id === 'loyalty') },
          { title: 'Podnik', items: TABS.filter(t => t.id === 'settings') },
        ]}
        activeId={tab}
        onSelect={id => { setTab(id as Tab); setMoreOpen(false); }}
        actions={[
          { label: 'Stránka pro hosty', icon: 'external', onClick: () => { setMoreOpen(false); if (summary?.slug) window.open(`/client/${summary.slug}`, '_blank'); } },
          { label: 'Zpět do administrace', icon: 'swap', onClick: onExit },
        ]}
      />
    </div>
  );
}

// ---- Přehled --------------------------------------------------------------------

function Overview({ summary, go, onCustomer }: { summary: any; go: (t: Tab) => void; onCustomer: (q: string) => void }) {
  const [today, setToday] = useState<any[] | null>(null);
  useEffect(() => { fetch('/api/client/admin/reservations?range=today').then(r => r.json()).then(d => setToday(d.reservations ?? [])).catch(() => setToday([])); }, []);
  if (!summary) return <PageSkel />;
  if (!summary.enabled) {
    return (
      <div className="max-w-2xl">
        <PageHeader title="Přehled" subtitle="Rezervace, objednávky od stolu, členové a věrnost hostů na jednom místě." />
        <div className="mt-6">
          <EmptyState icon="sparkle" title="Managero client je pro hosty vypnutý"
            hint="Nastav profil podniku a zapni ho. Hosté pak podnik najdou, přidají se, rezervují a objednají od stolu."
            action={<Button variant="accent" icon="settings" onClick={() => go('settings')}>Nastavit a zapnout</Button>} />
        </div>
      </div>
    );
  }
  const su = summary.setup ?? {};
  const rv = summary.reviews ?? { count: 0, avg: null, new7: 0, low7: 0 };
  const attention: { n: number; label: string; icon: string; tab: Tab }[] = [
    { n: Number(summary.orders?.new ?? 0), label: 'nová objednávka od stolu', icon: 'cup', tab: 'orders' as Tab },
    { n: Number(summary.reservations.requested), label: 'rezervace k potvrzení', icon: 'calendarCheck', tab: 'reservations' as Tab },
    { n: Number(rv.low7), label: 'slabé hodnocení za týden', icon: 'star', tab: 'customers' as Tab },
  ].filter(a => a.n > 0);
  const steps: { done: boolean; label: string; tab: Tab }[] = [
    { done: !!su.enabled, label: 'Podnik zapnutý pro hosty', tab: 'settings' },
    { done: !!su.menu, label: 'Nabídka z Menu pro hosty', tab: 'settings' },
    { done: (su.tables ?? 0) > 0, label: su.tables ? `${su.tables} stolů${su.tablesPaired ? `, ${su.tablesPaired} spárovaných s pokladnou` : ''}` : 'Stoly pro rezervace a objednávky', tab: 'tables' },
    { done: !!su.pos, label: su.pos ? 'Pokladna napojená: objednávky jdou na stůl v kase' : 'Napojit pokladnu (Nastavení → Pokladna)', tab: 'tables' },
    { done: !!su.location, label: su.location ? 'Poloha podniku nastavená, objednávky jen od stolu' : 'Nastavit polohu podniku pro ochranu objednávek', tab: 'settings' },
    { done: !!su.loyaltyOn, label: su.loyaltyOn ? `Věrnost: ${su.pointsPer100} b. za 100 Kč, ${su.stampTarget} razítek za ${su.stampReward || 'odměnu'}` : 'Zapnout věrnost', tab: 'loyalty' },
  ];
  const doneN = steps.filter(x => x.done).length;
  return (
    <div className="space-y-6">
      <PageHeader title="Přehled" subtitle={`Hosté tě najdou na /client/${summary.slug}. Rezervace, objednávky, členové a věrnost na jednom místě.`}
        primary={<Button variant="accent" icon="calendarCheck" onClick={() => go('reservations')}>Rezervace{summary.reservations.requested ? ` (${summary.reservations.requested})` : ''}</Button>}
        secondary={<Button variant="secondary" icon="cup" onClick={() => go('orders')}>Objednávky{summary.orders?.new ? ` (${summary.orders.new})` : ''}</Button>} />

      {attention.length > 0 && (
        <div className="rounded-3xl border border-orange-500/25 bg-orange-500/[0.07] p-4 sm:p-5">
          <p className="font-bold text-[#16181A] flex items-center gap-2 mb-2"><Icon name="warning" size={17} className="text-orange-600" /> Čeká na tebe</p>
          <div className="flex flex-wrap gap-2">
            {attention.map(a => (
              <button key={a.label} type="button" onClick={() => go(a.tab)} className="tap-target-sm rounded-full bg-white/70 border border-black/[0.07] px-4 py-2 text-sm font-medium text-[#16181A] hover:bg-white transition inline-flex items-center gap-1.5">
                <Icon name={a.icon} size={15} className="text-black/45" /> {a.n}× {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon="cup" label="Nové objednávky" value={summary.orders?.new ?? 0} tone={(summary.orders?.new ?? 0) > 0 ? 'wait' : 'ok'} onClick={() => go('orders')} />
        <StatCard icon="calendarCheck" label="Čeká na potvrzení" value={summary.reservations.requested} tone={summary.reservations.requested > 0 ? 'wait' : 'ok'} onClick={() => go('reservations')} />
        <StatCard icon="calendar" label="Dnes rezervací" value={summary.reservations.today} onClick={() => go('reservations')} />
        <StatCard icon="users" label="Členů" value={summary.members} tone="muted" onClick={() => go('customers')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 items-start">
        <section className="glass-card p-4 sm:p-5">
          <SectionTitle icon="calendar" action={<GoLink onClick={() => go('reservations')}>Všechny</GoLink>}>Dnešní rezervace</SectionTitle>
          {today === null ? <Skeleton className="h-24 rounded-2xl" /> : today.length === 0
            ? <p className="text-sm text-black/55">Dnes nikdo rezervovaný. Klid, nebo prostor pro walk-in.</p>
            : <ul className="divide-y divide-black/[0.06]">{today.map(r => (
                <li key={r.id} className="py-2.5 flex items-center gap-x-3 gap-y-1 flex-wrap">
                  <span className="font-semibold tabular-nums w-12 shrink-0">{r.time}</span>
                  <Initials name={r.customer_name} size={28} />
                  <button type="button" onClick={() => onCustomer(r.customer_name)} className="tap-target-sm min-w-0 flex-1 basis-40 truncate text-left hover:text-[#4F6A07] transition">
                    <span className="font-medium">{r.customer_name}</span> <span className="text-black/50">· {r.party} os.{r.table_name ? ` · ${r.table_name}` : ''}</span>
                  </button>
                  <span className={`${chip(RES_STATUS[r.status]?.tone ?? 'wait')} ml-auto`}>{RES_STATUS[r.status]?.label ?? r.status}</span>
                </li>))}</ul>}
        </section>

        <div className="space-y-6">
          <section className="glass-card p-4 sm:p-5">
            <SectionTitle icon="gift" action={<GoLink onClick={() => go('customers')}>Zákazníci</GoLink>}>Členové a hodnocení</SectionTitle>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-2xl font-bold tabular-nums leading-none">{summary.members}</p>
                <p className="text-xs text-black/55 mt-1">členů · {summary.newMembers30 ?? 0} nových za 30 dní</p>
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums leading-none">{rv.avg ?? '–'}<span className="text-sm font-medium text-black/45"> / 5</span></p>
                <p className="text-xs text-black/55 mt-1">{rv.count ? `${rv.count} hodnocení · ${rv.new7} za týden` : 'zatím bez hodnocení'}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon="send" onClick={() => go('customers')}>Zpráva členům</Button>
              <Button size="sm" variant="ghost" icon="tag" onClick={() => go('loyalty')}>Promo kód</Button>
            </div>
          </section>

          <section className="glass-card p-4 sm:p-5">
            <SectionTitle icon="check">Propojení <span className="text-black/35 font-semibold tabular-nums ml-1">{doneN}/{steps.length}</span></SectionTitle>
            <div className="space-y-1.5">
              {steps.map((st, i) => (
                <button key={i} type="button" onClick={() => go(st.tab)}
                  className={`group w-full flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-sm text-left transition ${st.done ? 'bg-[#C8F542]/10 text-black/60' : 'bg-black/[0.03] text-[#16181A] hover:bg-black/[0.06]'}`}>
                  <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${st.done ? 'bg-[#C8F542] text-[#16181A]' : 'border-2 border-black/15'}`}>{st.done && <Icon name="check" size={12} strokeWidth={2.6} />}</span>
                  <span className="min-w-0 flex-1 leading-snug">{st.label}</span>
                  <Icon name="chevron" size={15} className="shrink-0 -rotate-90 text-black/25 group-hover:text-black/50 transition-colors" />
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function PageSkel() { return <div className="space-y-4"><Skeleton className="h-10 w-56 rounded-full" /><Skeleton className="h-28 rounded-3xl" /><Skeleton className="h-48 rounded-3xl" /></div>; }

// ---- Rezervace ------------------------------------------------------------------

function Reservations({ toast, onChange, onCustomer }: { toast: (m: string) => void; onChange: () => void; onCustomer: (q: string) => void }) {
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
          <section key={date} className="glass-card p-4 sm:p-5">
            <h2 className="text-sm font-bold tracking-tight cz-sentence mb-1 flex items-center gap-2"><Icon name="calendar" size={15} className="text-[#4F6A07]" />{czDay(date, true)} <span className="text-black/40 font-medium">· {rows.length}</span></h2>
            <ul className="divide-y divide-black/[0.06]">
              {rows.map((r: any) => {
                const st = RES_STATUS[r.status] ?? RES_STATUS.requested;
                const can = (s: string) => ({ requested: ['confirmed', 'declined'], confirmed: ['seated', 'declined', 'done'], seated: ['done'] } as Record<string, string[]>)[r.status]?.includes(s);
                return (
                  <li key={r.id} className="py-3 grid grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_auto_auto] gap-x-3 gap-y-2 items-center">
                    <span className="font-semibold tabular-nums text-lg leading-none">{r.time}</span>
                    <div className="min-w-0">
                      <p className="font-semibold truncate flex items-center gap-2"><Initials name={r.customer_name} size={24} /><button type="button" onClick={() => onCustomer(r.customer_name)} title="Otevřít v Zákaznících" className="tap-target-sm truncate hover:text-[#4F6A07] transition">{r.customer_name}</button> <span className="text-black/50 font-medium">· {r.party} os.</span></p>
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
        : <ul className="glass-card p-3 sm:p-4 divide-y divide-black/[0.06] max-w-2xl">
            {d.tables.map((t: any) => (
              <li key={t.id} className={`py-2.5 flex items-center gap-3 ${t.active ? '' : 'opacity-50'}`}>
                <input aria-label={`Název stolu ${t.name}`} defaultValue={t.name} onBlur={e => e.target.value !== t.name && patch(t.id, { name: e.target.value })} className={`${input} py-1.5 flex-1 min-w-0`} />
                <input aria-label="Počet míst" type="number" min={1} max={40} defaultValue={t.seats} onBlur={e => Number(e.target.value) !== t.seats && patch(t.id, { seats: Number(e.target.value) })} className={`${input} py-1.5 !w-16 text-center`} />
                <span className={`hidden sm:inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium w-24 truncate ${t.storyous_desk_id ? 'bg-[#C8F542]/15 text-[#4F6A07]' : 'bg-black/[0.05] text-black/50'}`}><Icon name={t.storyous_desk_id ? 'receipt' : 'location'} size={11} />{t.storyous_desk_id ? `kasa #${t.storyous_desk_id}` : 'jen u nás'}</span>
                <button onClick={() => window.open(`/api/client/admin/tables/qr?tableId=${t.id}`, '_blank')} aria-label={`Vytisknout QR stolu ${t.name}`} title="QR na stůl k tisku" className="tap-target-sm rounded-full p-2 text-black/55 hover:text-black hover:bg-black/[0.05] transition"><Icon name="print" size={16} /></button>
                <button onClick={() => { if (confirm(`Vygenerovat nový QR kód pro stůl ${t.name}? Starý vytištěný kód přestane platit.`)) patch(t.id, { rotate_token: true }); }} aria-label={`Nový QR kód stolu ${t.name}`} title="Nový QR kód (starý přestane platit)" className="tap-target-sm rounded-full p-2 text-black/40 hover:text-black hover:bg-black/[0.05] transition hidden sm:inline-grid"><Icon name="refresh" size={16} /></button>
                <button onClick={() => patch(t.id, { active: !t.active })} aria-pressed={!!t.active} className={`tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold transition ${t.active ? 'bg-[#C8F542]/25 text-[#3E5406]' : 'bg-black/[0.06] text-black/55'}`}>{t.active ? 'Aktivní' : 'Skrytý'}</button>
                <button onClick={() => del(t.id)} aria-label="Smazat stůl" className="tap-target-sm rounded-full p-2 text-black/40 hover:text-red-700 hover:bg-red-500/10 transition"><Icon name="trash" size={16} /></button>
              </li>
            ))}
          </ul>}
      {d !== null && d.tables.length > 0 && <MapEditor tables={d.tables} toast={toast} onSaved={load} />}
    </div>
  );
}

/**
 * Editor plánku stolů: přetažením se stůl posadí tam, kde v podniku stojí.
 * Souřadnice jsou v procentech, takže plánek sedí na telefonu i na monitoru.
 * Hosté pak při objednávce klepnou na stůl místo hádání názvů.
 */
function MapEditor({ tables, toast, onSaved }: { tables: any[]; toast: (m: string) => void; onSaved: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const act = useMemo(() => tables.filter((t: any) => t.active), [tables]);
  const orig = useMemo(() => Object.fromEntries(act.map((t: any) => [t.id, t.map_x != null && t.map_y != null ? { x: Number(t.map_x), y: Number(t.map_y) } : null])) as Record<number, { x: number; y: number } | null>, [act]);
  const [pos, setPos] = useState(orig);
  useEffect(() => { setPos(orig); }, [orig]);
  const [busy, setBusy] = useState(false);
  const placed = act.filter((t: any) => pos[t.id]);
  const unplaced = act.filter((t: any) => !pos[t.id]);
  const same = (a: any, b: any) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const dirty = act.some((t: any) => !same(pos[t.id], orig[t.id]));
  const move = (id: number, e: React.PointerEvent) => {
    const el = boxRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(4, Math.min(96, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.max(8, Math.min(92, ((e.clientY - r.top) / r.height) * 100));
    setPos(p => ({ ...p, [id]: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 } }));
  };
  const save = async () => {
    setBusy(true);
    try {
      for (const t of act) {
        if (same(pos[t.id], orig[t.id])) continue;
        const v = pos[t.id];
        await j('/api/client/admin/tables', { method: 'PATCH', body: JSON.stringify({ id: t.id, map_x: v?.x ?? null, map_y: v?.y ?? null }) });
      }
      toast('Plánek stolů uložen. Hosté ho uvidí při objednávce.'); onSaved();
    } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  if (!act.length) return null;
  return (
    <section className="glass-card p-4 sm:p-5 max-w-2xl">
      <SectionTitle icon="location" action={dirty ? <Button size="sm" variant="accent" loading={busy} onClick={save}>Uložit plánek</Button> : undefined}>Plánek stolů</SectionTitle>
      <p className="text-xs text-black/50 -mt-1 mb-3">Přetáhni stoly tak, jak stojí v podniku. Hosté pak při objednávce klepnou na svůj stůl na plánku. Křížkem stůl z plánku sundáš.</p>
      {unplaced.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-black/50">Mimo plánek:</span>
          {unplaced.map((t: any) => (
            <button key={t.id} type="button" onClick={() => setPos(p => ({ ...p, [t.id]: { x: 20 + (t.id % 4) * 18, y: 30 + (t.id % 3) * 18 } }))}
              className="tap-target-sm rounded-full bg-black/[0.05] hover:bg-black/[0.09] px-3 py-1.5 text-xs font-semibold transition">+ {t.name}</button>
          ))}
        </div>
      )}
      <div ref={boxRef} className="relative w-full aspect-[3/2] rounded-3xl border border-black/[0.08] bg-white/60 overflow-hidden touch-none select-none"
        style={{ backgroundImage: 'radial-gradient(rgba(22,24,26,0.07) 1px, transparent 1px)', backgroundSize: '18px 18px' }}>
        {placed.map((t: any) => {
          const v = pos[t.id]!;
          const shape = t.seats >= 5 ? 'rounded-2xl px-3 py-2.5 text-xs' : 'rounded-full px-3 py-2 text-[11px]';
          return (
            <div key={t.id} style={{ left: `${v.x}%`, top: `${v.y}%` }} className="absolute -translate-x-1/2 -translate-y-1/2">
              <button type="button" aria-label={`Stůl ${t.name} — přetáhni na místo`}
                onPointerDown={e => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }}
                onPointerMove={e => { if (e.buttons === 1) move(t.id, e); }}
                className={`tap-target-sm inline-flex items-center whitespace-nowrap font-bold leading-none border bg-white text-[#16181A] border-black/[0.12] shadow-sm cursor-grab active:cursor-grabbing active:shadow-lg transition-shadow ${shape}`}>
                {t.name}
              </button>
              <button type="button" onClick={() => setPos(p => ({ ...p, [t.id]: null }))} aria-label={`Sundat stůl ${t.name} z plánku`}
                className="tap-target-sm absolute -top-1.5 -right-1.5 h-5 w-5 grid place-items-center rounded-full bg-[#16181A] text-white text-[11px] leading-none shadow"><Icon name="close" size={9} /></button>
            </div>
          );
        })}
        {placed.length === 0 && <p className="absolute inset-0 grid place-items-center text-sm text-black/40 px-6 text-center">Klepni nahoře na stůl a pak ho přetáhni na místo.</p>}
      </div>
    </section>
  );
}

// ---- Zákazníci ------------------------------------------------------------------

function Customers({ toast, initialQuery = '' }: { toast: (m: string) => void; initialQuery?: string }) {
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
      {sub === 'members' && <Members toast={toast} initialQuery={initialQuery} />}
      {sub === 'reviews' && <Reviews />}
      {sub === 'messages' && <Broadcast toast={toast} />}
    </div>
  );
}

function Members({ toast, initialQuery = '' }: { toast: (m: string) => void; initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery); const [d, setD] = useState<any | null>(null);
  useEffect(() => { setQ(initialQuery); }, [initialQuery]);
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
        : <ul className="glass-card p-3 sm:p-4 divide-y divide-black/[0.06]">
            {d.customers.map((c: any) => (
              <li key={c.id} className="py-3">
                <div className="grid grid-cols-[auto_1fr_auto] md:grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 gap-y-1 items-center">
                  <Initials name={c.name} size={36} />
                  <div className="min-w-0">
                    <p className="font-semibold truncate flex items-center gap-2">{c.name}{levelFor(Number(c.visits)).id !== 'bronze' && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${levelFor(Number(c.visits)).id === 'gold' ? 'bg-[#C8F542]/30 text-[#3E5406]' : 'bg-black/[0.07] text-black/60'}`}>{levelFor(Number(c.visits)).label}</span>}</p>
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
    try { await j('/api/client/admin/profile', { method: 'PUT', body: JSON.stringify({ loyalty_on: p.loyalty_on, points_per_100: p.points_per_100, stamp_target: p.stamp_target, stamp_reward: p.stamp_reward, birthday_points: p.birthday_points }) }); toast('Pravidla věrnosti uložena.'); } catch (e: any) { toast(e.message); }
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
            <div className="grid grid-cols-[7rem_1fr] gap-3 items-end">
              <div><label htmlFor="l-bday" className={label}>Narozeniny</label><input id="l-bday" type="number" min={0} max={1000} value={p.birthday_points ?? 0} onChange={e => setP({ ...p, birthday_points: e.target.value })} className={input} /></div>
              <p className="text-xs text-black/50 pb-2.5">bodů jako dárek v den narozenin. 0 = nedávat. Datum si host vyplní ve svém účtu.</p>
            </div>
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
  const [locating, setLocating] = useState(false);
  useEffect(() => { fetch('/api/client/admin/profile').then(r => r.json()).then(x => { setD(x); setP(x.profile); }).catch(() => {}); }, []);
  if (!d || !p) return <PageSkel />;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await j('/api/client/admin/profile', { method: 'PUT', body: JSON.stringify({ enabled: p.enabled, slug: p.slug, tagline: p.tagline, description: p.description, address: p.address, cover_url: p.cover_url, reservations_on: p.reservations_on, ordering_on: p.ordering_on, max_party: p.max_party, lead_days: p.lead_days, slot_minutes: p.slot_minutes, menu_slug: p.menu_slug || null,
        order_qr_required: p.order_qr_required, order_geo: p.order_geo, lat: p.lat ?? '', lng: p.lng ?? '', geo_radius_m: p.geo_radius_m, order_auto_pos: p.order_auto_pos }) });
      setP(r.profile); setD({ ...d, url: r.url }); toast(r.profile.enabled ? 'Uloženo. Podnik je pro hosty zapnutý.' : 'Uloženo. Podnik je zatím vypnutý.'); onChange();
    } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  const copy = () => { navigator.clipboard?.writeText(d.url).then(() => toast('Adresa zkopírována.')).catch(() => {}); };
  const useMyPosition = () => {
    if (!navigator.geolocation) { toast('Prohlížeč neumí polohu.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setP((x: any) => ({ ...x, lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) })); setLocating(false); toast(`Poloha načtena s přesností ${Math.round(pos.coords.accuracy)} m. Nezapomeň uložit.`); },
      () => { setLocating(false); toast('Polohu se nepodařilo zjistit. Povol ji v prohlížeči.'); },
      { enableHighAccuracy: true, timeout: 12000 });
  };
  const hasCoords = p.lat != null && p.lat !== '' && p.lng != null && p.lng !== '';
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
      <section className="glass-card p-5 grid gap-4">
        <div>
          <h2 className="font-bold tracking-tight">Ochrana objednávek od stolu</h2>
          <p className="text-xs text-black/50 mt-0.5">Aby objednával jen ten, kdo u stolu opravdu sedí. Dvě nezávislé stopy: QR kód na stole a poloha telefonu.</p>
        </div>
        <label className="flex items-start min-h-9 py-1 gap-3 text-sm"><input type="checkbox" checked={p.order_qr_required !== false} onChange={e => setP({ ...p, order_qr_required: e.target.checked })} className="h-4 w-4 mt-0.5 accent-[#16181A]" />
          <span>Objednat jde jen přes QR kód na stole<span className="block text-xs text-black/50">Každý stůl má v QR svůj tajný kód (Stoly → ikona tiskárny). Odkaz z domova nebo ručně vybraný stůl neprojde.</span></span></label>
        <div>
          <label htmlFor="s-geo" className={label}>Poloha hosta</label>
          <select id="s-geo" value={p.order_geo ?? 'block'} onChange={e => setP({ ...p, order_geo: e.target.value })} className={input}>
            <option value="block">Blokovat objednávky mimo podnik</option>
            <option value="warn">Jen upozornit obsluhu, objednávku nechat čekat</option>
            <option value="off">Neověřovat</option>
          </select>
          {p.order_geo !== 'off' && !hasCoords && <p className="text-xs rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-800 px-3 py-2 mt-2">Poloha podniku není nastavená, ověření polohy zatím neběží. Stoupni si v podniku s telefonem a klepni na „Použít moji polohu".</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div><label htmlFor="s-lat" className={label}>Zeměpisná šířka</label><input id="s-lat" inputMode="decimal" value={p.lat ?? ''} onChange={e => setP({ ...p, lat: e.target.value })} placeholder="49.1951" className={input} /></div>
          <div><label htmlFor="s-lng" className={label}>Zeměpisná délka</label><input id="s-lng" inputMode="decimal" value={p.lng ?? ''} onChange={e => setP({ ...p, lng: e.target.value })} placeholder="16.6068" className={input} /></div>
          <Button type="button" variant="secondary" icon="location" loading={locating} onClick={useMyPosition}>Použít moji polohu</Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label htmlFor="s-radius" className={label}>Poloměr (m)</label><input id="s-radius" type="number" min={30} max={1000} step={10} value={p.geo_radius_m ?? 100} onChange={e => setP({ ...p, geo_radius_m: e.target.value })} className={input} /></div>
          <p className="text-xs text-black/50 self-end pb-2">K poloměru se přičítá přesnost telefonu (nejvýš 50 m). Sto metrů pokryje podnik i zahrádku.</p>
        </div>
        <label className="flex items-start min-h-9 py-1 gap-3 text-sm border-t border-black/[0.06] pt-4"><input type="checkbox" checked={p.order_auto_pos !== false} onChange={e => setP({ ...p, order_auto_pos: e.target.checked })} className="h-4 w-4 mt-0.5 accent-[#16181A]" />
          <span>Ověřené objednávky posílat rovnou do pokladny<span className="block text-xs text-black/50">S QR i polohou v pořádku jde objednávka bez čekání na stůl v kase a terminál Storyous ji vytiskne podle svého nastavení tiskáren. Neověřené čekají na přijetí obsluhou. Odmítnutí nebo vydání v kase se propíše zpátky sem.</span></span></label>
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
          <ul className="glass-card p-3 sm:p-4 divide-y divide-black/[0.06]">
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
  const [f, setF] = useState({ title: '', body: '', audience: 'all' }); const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch('/api/client/admin/broadcast').then(r => r.json()).then(setD).catch(() => setD({ history: [], members: 0 })), []);
  useEffect(() => { load(); }, [load]);
  const target = f.audience === 'quiet' ? (d?.quiet ?? 0) : f.audience === 'gold' ? (d?.gold ?? 0) : (d?.members ?? 0);
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); if (!f.title.trim()) return;
    if (!confirm(`Poslat zprávu ${target} členům?`)) return;
    setBusy(true);
    try { const r = await j('/api/client/admin/broadcast', { method: 'POST', body: JSON.stringify(f) }); toast(`Odesláno ${r.broadcast.recipients} členům.`); setF({ title: '', body: '', audience: 'all' }); load(); } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  if (!d) return <PageSkel />;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6 items-start">
        <form onSubmit={send} className="glass-card p-5 grid gap-3">
          <div><label htmlFor="bc-title" className={label}>Nadpis</label><input id="bc-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Nový čaj z jarní sklizně" maxLength={80} className={input} /></div>
          <div><label htmlFor="bc-body" className={label}>Text</label><textarea id="bc-body" value={f.body} onChange={e => setF({ ...f, body: e.target.value })} placeholder="Tento týden ochutnávka zdarma ke každé konvici." maxLength={300} rows={3} className={`${input} resize-none`} /></div>
          <div><label htmlFor="bc-aud" className={label}>Komu</label>
            <select id="bc-aud" value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })} className={input}>
              <option value="all">Všem členům ({d.members})</option>
              <option value="quiet">Kdo dlouho nebyl — 30 a víc dní ({d.quiet ?? 0})</option>
              <option value="gold">Zlatým hostům — 25+ návštěv ({d.gold ?? 0})</option>
            </select>
            <p className="text-xs text-black/50 mt-1">Zpráva se objeví i v Novinkách na tvé stránce pro hosty.</p></div>
          <Button type="submit" variant="accent" icon="send" loading={busy} disabled={!target}>Poslat {target} {target === 1 ? 'členovi' : 'členům'}</Button>
        </form>
        <section>
          <SectionTitle icon="mail">Odeslané</SectionTitle>
          {d.history.length === 0 ? <EmptyState icon="mail" title="Zatím nic odeslaného" hint="První zpráva půjde všem, kdo se k podniku přidali." compact />
            : <ul className="glass-card p-3 sm:p-4 divide-y divide-black/[0.06]">{d.history.map((h: any) => (
                <li key={h.id} className="py-3">
                  <p className="font-semibold leading-tight">{h.title}</p>
                  {h.body && <p className="text-sm text-black/65 mt-0.5 text-pretty">{h.body}</p>}
                  <p className="text-xs text-black/45 mt-1">{dbTimeDayHM(h.sent_at)} · {h.recipients} {h.recipients === 1 ? 'člen' : h.recipients < 5 ? 'členové' : 'členů'}{h.audience === 'quiet' ? ' · kdo dlouho nebyl' : h.audience === 'gold' ? ' · zlatí hosté' : ''}</p>
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
          <SectionTitle icon="tag">Kódy</SectionTitle>
          {d.promos.length === 0 ? <EmptyState icon="tag" title="Zatím žádný promo kód" hint="Vytvoř první vlevo. Krátký a snadno opsatelný funguje nejlíp." compact />
            : <ul className="glass-card p-3 sm:p-4 divide-y divide-black/[0.06]">{d.promos.map((p: any) => (
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
