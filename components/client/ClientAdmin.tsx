'use client';

// Režim Client pro vedení — vedle TO GO. Tady se spravuje, co host vidí a
// dělá: rezervace, stoly, členové, věrnost a profil podniku. Stejný
// designový systém jako zbytek administrace; jen jiná sada obrazovek.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from '../ThemeProvider';
import { Icon, LogoMark } from '../Icons';
import { Button, PageHeader, Segmented, EmptyState, Skeleton, Menu, type MenuItem, ErrorBoundary, ErrorState, useLoad, ListRow, Modal, SearchField } from '../ui';
import { Initials } from './ClientShell';
import StaffInbox from './StaffInbox';
import MobileMoreSheet from '../MobileMoreSheet';
import FloorPlanEditor from './FloorPlanEditor';
import QrDesigner from './QrDesigner';
import BrandTab from './BrandTab';
import LoyaltyTabs from './LoyaltyTabs';
import MenuEditor from '../employer/MenuEditor';
import EventsView from '../employer/EventsView';
import { levelFor } from '@/lib/clientSlots';
import { czDay, RES_STATUS } from '@/lib/clientSlots';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { czCount } from '@/lib/czech';

type Tab = 'overview' | 'reservations' | 'orders' | 'tables' | 'menu' | 'events' | 'customers' | 'loyalty' | 'brand' | 'settings';
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Přehled', icon: 'overview' },
  { id: 'reservations', label: 'Rezervace', icon: 'calendarCheck' },
  { id: 'orders', label: 'Objednávky', icon: 'cup' },
  { id: 'tables', label: 'Stoly', icon: 'location' },
  { id: 'menu', label: 'Menu', icon: 'leaf' },
  { id: 'events', label: 'Akce', icon: 'calendarCheck' },
  { id: 'customers', label: 'Zákazníci', icon: 'users' },
  { id: 'loyalty', label: 'Věrnost', icon: 'gift' },
  { id: 'brand', label: 'Vzhled', icon: 'sparkle' },
  { id: 'settings', label: 'Nastavení', icon: 'settings' },
];

// Deset sourozenců v jedné řadě je seznam, ne navigace: nedá se z něj
// poznat, co k čemu patří, a na 1280 px se pilulky rozlézají přes půl
// obrazovky. Zbytek aplikace to má dávno vyřešené seskupeným panelem —
// tady se jen používá totéž. Skupiny už existovaly v mobilním „Více",
// jen na počítači se ignorovaly (a byly popsané naopak: „Provoz"
// obsahoval stoly a menu, „Podnik" nastavení).
const NAV_SECTIONS: { title: string | null; ids: Tab[] }[] = [
  { title: null,       ids: ['overview'] },
  { title: 'Dnešek',   ids: ['reservations', 'orders'] },
  { title: 'Podnik',   ids: ['tables', 'menu', 'events'] },
  { title: 'Hosté',    ids: ['customers', 'loyalty'] },
  { title: 'Nastavení', ids: ['brand', 'settings'] },
];
const BY_ID = Object.fromEntries(TABS.map(t => [t.id, t])) as Record<Tab, typeof TABS[number]>;

const input = 'field !py-2.5 text-sm';
const label = 'field-label';
const chip = (tone: string) => `inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${tone === 'ok' ? 'bg-[#C8F542]/25 text-[#3E5406]' : tone === 'wait' ? 'bg-amber-500/15 text-amber-800' : tone === 'done' ? 'bg-black/[0.06] text-black/60' : 'bg-red-500/10 text-red-700'}`;

/** Dlaždice jako na přehledu podniku: štítek, ikona v tónovaném kolečku, číslo. Kliknutím do záložky. */
function StatCard({ icon, label, value, onClick, tone = 'ok' }: { icon: string; label: string; value: number | string; onClick?: () => void; tone?: 'ok' | 'wait' | 'muted' }) {
  const ring = tone === 'wait' ? 'bg-amber-500/15 border-amber-500/25 text-amber-800' : tone === 'muted' ? 'bg-black/[0.05] border-black/[0.08] text-black/55' : 'bg-[#C8F542]/15 border-[#C8F542]/30 text-[#4F6A07]';
  return (
    <button type="button" onClick={onClick} className={`text-left glass-card p-4 sm:p-5 transition duration-300 hover:bg-white/80 active:scale-[0.99] ${tone === 'wait' ? 'ring-1 ring-amber-500/25' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="t-label">{label}</p>
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
      <h2 className="t-section flex items-center gap-2.5">
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

export default function ClientAdmin({ onExit, initialTab, user }: { onExit: () => void; initialTab?: string; user?: { id?: string } }) {
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
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const refreshSummary = useCallback(() => {
    setSummaryError(null);
    fetch('/api/client/admin/summary')
      .then(r => { if (!r.ok) throw new Error(`Server odpověděl ${r.status}`); return r.json(); })
      .then(setSummary)
      .catch((e: any) => setSummaryError(e?.message || 'Načtení se nepovedlo'));
  }, []);
  useEffect(() => { refreshSummary(); }, [refreshSummary, tab]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 4500); return () => clearTimeout(t); } }, [toast]);

  return (
    // Skořápka je svázaná s výškou okna a posouvá se uvnitř <main>, stejně jako
    // administrace a zaměstnanec. Dřív tu bylo `min-h-[100dvh]` (roste s
    // obsahem) a zároveň `overflow-y-auto` na <main> — kombinace, kterou nemá
    // nikde jinde v appce. <main> se tím roztáhlo na celou výšku obsahu, takže
    // nemělo co posouvat, a scrolloval dokument pod ním. Safari na iPhonu ale
    // dotyk uvnitř `overflow-y-auto` přiřkne tomu boxu — a ten nemá kam jet,
    // takže tah spolkne a stránka stojí. Na krátkých záložkách (Přehled) to
    // nebylo vidět, na dlouhých (Stoly) se nedalo scrollovat vůbec.
    <div className="h-[100dvh] flex flex-col overflow-hidden" style={{ background: '#F1F3ED' }}>
      <header className="shrink-0 px-4 sm:px-6 pt-4 pb-2 flex items-center gap-3 flex-wrap chrome-edge">
        <button onClick={onExit} title="Zpět do administrace" aria-label="Zpět do administrace" className="tap-target rounded-full p-2 text-black/55 hover:text-black hover:bg-black/[0.05] transition"><Icon name="chevron" size={20} className="rotate-90" /></button>
        <LogoMark size={30} />
        <p className="font-bold tracking-tight leading-none">Managero <span className="text-black/45 font-semibold">client</span></p>
        {summary?.enabled === false && <span className="chip chip-wait">Pro hosty vypnuto</span>}
        {summary?.attention > 0 && <span className="rounded-full bg-[#16181A] text-[#C8F542] px-2.5 py-1 text-[11px] font-bold tabular-nums">{summary.attention} k vyřízení</span>}
        <div className="ml-auto hidden sm:block"><Button variant="secondary" size="sm" icon="external" onClick={() => summary?.slug && window.open(`/client/${summary.slug}`, '_blank')} disabled={!summary?.slug}>Stránka pro hosty</Button></div>
      </header>

      {toast && <p role="status" className="toast-in shrink-0 mx-4 sm:mx-6 rounded-2xl bg-[#C8F542]/15 border border-[#C8F542]/40 text-[#3E5406] text-sm px-4 py-2.5">{toast}</p>}

      <div className="flex-1 flex min-h-0">
        {/* Postranní panel se skupinami — stejný jazyk jako administrace.
            Na telefonu ho nahrazuje spodní dock a list „Více". */}
        <aside className="hidden md:block shrink-0 w-56 overflow-y-auto scrollbar-thin px-3 pb-6">
          <nav className="space-y-1" aria-label="Části režimu Client">
            {NAV_SECTIONS.map((sec, si) => (
              <div key={sec.title ?? 'top'} className={si > 0 ? 'pt-1.5' : ''}>
                {sec.title && <p className="px-3.5 pb-0.5 text-[11px] font-semibold uppercase tracking-[0.13em] text-black/30">{sec.title}</p>}
                <div className="space-y-px">
                  {sec.ids.map(id => BY_ID[id]).filter(Boolean).map(item => (
                    <button key={item.id} onClick={() => setTab(item.id)} title={item.label}
                      className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-sm font-medium transition duration-200 ${
                        tab === item.id ? 'seg-on' : 'seg-off'
                      }`}>
                      <Icon name={item.icon} size={21} className="flex-shrink-0 i-lead"
                        motion={tab === item.id ? 'pop' : undefined}
                        key={tab === item.id ? 'on' : 'off'} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 overflow-y-auto scrollbar-thin px-4 sm:px-6 py-4 pb-36 md:pb-8">
        <ErrorBoundary resetKey={tab} title={`${TABS.find(t => t.id === tab)?.label ?? 'Tahle část'} se nenačetla`}>
        {tab === 'overview' && (summaryError
          ? <ErrorState title="Přehled se nenačetl" onRetry={refreshSummary} detail={summaryError} />
          : <Overview summary={summary} go={setTab} onCustomer={openCustomer} />)}
        {tab === 'reservations' && <Reservations toast={setToast} onChange={refreshSummary} onCustomer={openCustomer} />}
        {tab === 'orders' && (
          <div className="space-y-5 max-w-3xl">
            <PageHeader hintId="clientadmin-1" title="Objednávky" subtitle="Objednávky od stolu čekají na přijetí. Přijaté jdou do pokladny na stůl, hotové připíšou hostovi body." />
            <StaffInbox onToast={setToast} />
          </div>
        )}
        {tab === 'tables' && <Tables toast={setToast} />}
        {/* Každá záložka začíná stejně: PageHeader s názvem a jednou větou.
            Akce si hlavičku nesou samy (sdílí se s administrací), zbytek ji
            dostává tady. Dřív měla polovina záložek holý odstavec bez
            nadpisu a člověk nepoznal, kde je. */}
        {tab === 'menu' && (
          <div className="space-y-5 max-w-3xl">
            <PageHeader hintId="clientadmin-2" title="Menu" subtitle="Nabídka, kterou hosté vidí na tvé stránce a po naskenování QR u stolu. Ceny odsud se berou i do objednávek." />
            <MenuEditor />
          </div>
        )}
        {tab === 'events' && <EventsView user={(user ?? {}) as any} />}
        {tab === 'customers' && <Customers toast={setToast} initialQuery={custQ} />}
        {tab === 'loyalty' && <Loyalty toast={setToast} />}
        {tab === 'brand' && <BrandTab toast={setToast} onChange={refreshSummary} />}
        {tab === 'settings' && <SettingsTab toast={setToast} onChange={refreshSummary} />}
        </ErrorBoundary>
        </main>
      </div>

      {/* Mobilní spodní dock — stejný jazyk jako administrace a zaměstnanec. */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        <nav className="dock-strong mx-auto max-w-md rounded-3xl px-2 py-2 flex items-center justify-around shadow-[0_10px_34px_rgba(25,35,15,0.16)]" aria-label="Spodní navigace klienta">
          {TABS.filter(t => dockIds.includes(t.id)).map(item => (
            <button key={item.id} onClick={() => { setTab(item.id); setMoreOpen(false); }} title={item.label}
              className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition duration-200 ${tab === item.id ? 'text-[#16181A] -translate-y-0.5' : 'text-black/40'}`}>
              <Icon key={tab === item.id ? 'on' : 'off'} name={item.icon} size={22} strokeWidth={tab === item.id ? 2 : 1.7} className="i-lead" motion={tab === item.id ? 'pop' : undefined} />
              <span className={`text-[11px] leading-none font-medium ${tab === item.id ? 'text-[#16181A]' : 'text-black/40'}`}>{item.label}</span>
            </button>
          ))}
          <button onClick={() => setMoreOpen(v => !v)} title="Více"
            className={`flex flex-col items-center gap-1 rounded-2xl px-3 py-1.5 transition duration-200 ${moreOpen || !dockIds.includes(tab) ? 'text-[#16181A]' : 'text-black/40'}`}>
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
          { title: 'Podnik', items: TABS.filter(t => t.id === 'tables' || t.id === 'menu' || t.id === 'events') },
          { title: 'Hosté', items: TABS.filter(t => t.id === 'customers' || t.id === 'loyalty') },
          { title: 'Nastavení', items: TABS.filter(t => t.id === 'brand' || t.id === 'settings') },
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
        <PageHeader hintId="clientadmin-3" title="Přehled" subtitle="Rezervace, objednávky od stolu, členové a věrnost hostů na jednom místě." />
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
      <PageHeader hintId="clientadmin-4" title="Přehled" subtitle={`Hosté tě najdou na /client/${summary.slug}. Rezervace, objednávky, členové a věrnost na jednom místě.`}
        primary={<Button variant="accent" icon="calendarCheck" onClick={() => go('reservations')}>Rezervace{summary.reservations.requested ? ` (${summary.reservations.requested})` : ''}</Button>}
        secondary={<Button variant="secondary" icon="cup" onClick={() => go('orders')}>Objednávky{summary.orders?.new ? ` (${summary.orders.new})` : ''}</Button>} />

      {attention.length > 0 && (
        <div className="card card-wait p-4 sm:p-5">
          <p className="t-card flex items-center gap-2 mb-2.5"><Icon name="warning" size={17} className="text-[var(--wait-ink)]" /> Čeká na tebe</p>
          <div className="flex flex-wrap gap-2">
            {attention.map(a => (
              <button key={a.label} type="button" onClick={() => go(a.tab)} className="tap-target-sm btn btn-secondary">
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
                  <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${st.done ? 'bg-[#C8F542] on-accent' : 'border-2 border-black/15'}`}>{st.done && <Icon name="check" size={12} strokeWidth={2.6} />}</span>
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
  const seq = useRef(0);
  // Přepnutí období (Dnes/Nadcházející/Minulé) nesmí nechat starou odpověď
  // přepsat novou; tvar odpovědi normalizujeme proti { error } (200).
  const load = useCallback(() => {
    const my = ++seq.current;
    const safe = (x: any) => (my === seq.current ? setD(x && Array.isArray(x.reservations) ? x : { reservations: [], tables: [] }) : undefined);
    return fetch(`/api/client/admin/reservations?range=${range}`).then(r => r.json()).then(safe).catch(() => safe(null));
  }, [range]);
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
      <PageHeader hintId="clientadmin-5" title="Rezervace" subtitle="Požadavky potvrď nebo odmítni; při příchodu hosty usaď — s napojenou pokladnou se rovnou otevře účet na stole."
        aside={<Segmented options={[{ id: 'today', label: 'Dnes' }, { id: 'upcoming', label: 'Nadcházející' }, { id: 'past', label: 'Minulé' }]} value={range} onChange={setRange} size="sm" ariaLabel="Období" />} />
      {d === null ? <PageSkel /> : groups.length === 0
        ? <EmptyState icon="calendarCheck" title={range === 'past' ? 'Žádné minulé rezervace' : 'Zatím žádné rezervace'} hint={range === 'past' ? '' : 'Objeví se tu, jakmile si host zarezervuje stůl na tvé stránce.'} compact />
        : groups.map(([date, rows]) => (
          <section key={date} className="glass-card p-4 sm:p-5">
            <h2 className="t-card cz-sentence mb-1 flex items-center gap-2"><Icon name="calendar" size={15} className="text-[#4F6A07]" />{czDay(date, true)} <span className="text-black/40 font-medium">· {rows.length}</span></h2>
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
                    {/* Jedna hlavní akce, zbytek v „···" — stejné pravidlo jako
                        v Rozvrhu. Dřív tu vedle sebe stála čtyři tlačítka ve
                        čtyřech různých podobách (Potvrdit, Usadit, Hotovo,
                        Odmítnout) a nešlo poznat, co je krok vpřed a co je
                        odmítnutí hosta. Sloupec má pevnou šířku, aby výběr
                        stolu začínal na každém řádku na stejné svislici. */}
                    <div className="col-span-2 md:col-span-1 flex items-center gap-1.5 justify-start md:justify-end md:w-44">
                      {(() => {
                        const step = can('confirmed') ? { s: 'confirmed', label: 'Potvrdit' }
                          : can('seated') ? { s: 'seated', label: 'Usadit' }
                          : can('done') ? { s: 'done', label: 'Hotovo' } : null;
                        const more: MenuItem[] = [];
                        if (step?.s === 'seated' && can('done')) more.push({ label: 'Rovnou hotovo', icon: 'check', onClick: () => act(r.id, { status: 'done' }) });
                        if (can('declined')) more.push({ label: 'Odmítnout rezervaci…', icon: 'close', danger: true,
                          hint: 'Host dostane zprávu, že se to nepovedlo.',
                          onClick: () => { if (confirm('Rezervaci odmítnout? Host dostane zprávu.')) act(r.id, { status: 'declined' }); } });
                        return (<>
                          {step
                            ? <Button size="sm" variant="accent" loading={busy === r.id} onClick={() => act(r.id, { status: step.s })} className="flex-1 md:flex-none justify-center">{step.label}</Button>
                            : <span className="flex-1" />}
                          {more.length > 0 && <Menu size="sm" label={`Další akce s rezervací ${r.customer_name}`} items={more} />}
                        </>);
                      })()}
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
  // Tvar odpovědi se ověří tady, ne až v JSX nad `undefined.length` —
  // jedna nečekaná odpověď API dřív shodila celou záložku na bílo.
  const { data: d, error, reload: load } = useLoad<{ tables: any[]; posConnected?: boolean }>(
    '/api/client/admin/tables',
    raw => ({ tables: Array.isArray(raw?.tables) ? raw.tables : [], posConnected: !!raw?.posConnected }),
  );
  const [name, setName] = useState(''); const [seats, setSeats] = useState(2); const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<{ id: number; name: string; seats: number } | null>(null);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim()) return; setBusy(true);
    try { await j('/api/client/admin/tables', { method: 'POST', body: JSON.stringify({ name, seats }) }); setName(''); setAddOpen(false); await load(); } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!edit || !edit.name.trim()) return; setBusy(true);
    try { await j('/api/client/admin/tables', { method: 'PATCH', body: JSON.stringify({ id: edit.id, name: edit.name, seats: edit.seats }) }); setEdit(null); await load(); } catch (e: any) { toast(e.message); }
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
      <PageHeader hintId="clientadmin-6" title="Stoly" subtitle="Ke stolům se vážou rezervace i objednávky. S napojenou pokladnou je vezmi odtamtud, ať sedí čísla. Ikona tiskárny vytiskne QR na stůl, ze kterého host objedná."
        primary={<Button variant="accent" icon="plus" onClick={() => setAddOpen(true)}>Přidat stůl</Button>}
        menu={d?.posConnected ? [{ label: 'Načíst stoly z pokladny', icon: 'download', onClick: imp,
          hint: 'Převezme čísla stolů z kasy, ať sedí s účty.' }] : undefined} />
      {/* Seznam je seznam, ne formulář.
          Dřív byl každý řádek řadou vstupních polí s rámečky: čtyři stoly
          vypadaly jako čtyřřádkový formulář a nešlo je očima přejet. Název
          a počet míst se teď čtou jako text a upravují se v okně; v řádku
          zůstává jedna hlavní akce (tisk QR) a zbytek v „···". */}
      {error ? <ErrorState title="Stoly se nenačetly" onRetry={load} detail={error} />
        : d === null ? <PageSkel /> : d.tables.length === 0
        ? <EmptyState icon="location" title="Zatím žádné stoly"
            hint={d.posConnected ? 'Načti je z pokladny, nebo přidej ručně.' : 'Ke stolu se váže rezervace i objednávka od hosta.'}
            action={<Button variant="accent" icon="plus" onClick={() => setAddOpen(true)}>Přidat stůl</Button>} />
        : <ul className="glass-card p-3 sm:p-4 list max-w-3xl">
            {d.tables.map((t: any) => (
              <ListRow key={t.id} className={t.active ? '' : 'opacity-55'}
                lead={<span className={`grid h-9 w-9 place-items-center rounded-full ${t.active ? 'bg-[#C8F542]/20 text-[#4F6A07]' : 'bg-black/[0.05] text-black/40'}`}><Icon name="location" size={17} /></span>}
                title={t.name}
                meta={<>{t.seats} {t.seats === 1 ? 'místo' : t.seats < 5 ? 'místa' : 'míst'} · {t.storyous_desk_id ? `kasa #${t.storyous_desk_id}` : 'jen u nás'}{t.active ? '' : ' · skrytý'}</>}
                actions={<>
                  <Button size="sm" variant="secondary" icon="print"
                    onClick={() => window.open(`/api/client/admin/tables/qr?tableId=${t.id}`, '_blank')}>QR na stůl</Button>
                  <Menu size="sm" label={`Další akce se stolem ${t.name}`} items={[
                    { label: 'Upravit název a místa…', icon: 'pencil', onClick: () => setEdit({ id: t.id, name: t.name, seats: Number(t.seats) || 2 }) },
                    { label: t.active ? 'Skrýt hostům' : 'Zobrazit hostům', icon: t.active ? 'close' : 'check', onClick: () => patch(t.id, { active: !t.active }) },
                    { label: 'Nový QR kód…', icon: 'refresh', hint: 'Starý vytištěný kód přestane platit.',
                      onClick: () => { if (confirm(`Vygenerovat nový QR kód pro stůl ${t.name}? Starý vytištěný kód přestane platit.`)) patch(t.id, { rotate_token: true }); } },
                    { label: 'Smazat stůl…', icon: 'trash', danger: true, onClick: () => del(t.id) },
                  ]} />
                </>}
              />
            ))}
          </ul>}

      {/* Tisk QR a plánek jsou samostatné nástroje, ne pokračování seznamu —
          proto sbalené. Rozbalí je, kdo je zrovna potřebuje. */}
      {d !== null && d.tables.length > 0 && (
        <div className="space-y-3 max-w-3xl">
          <QrDesigner toast={toast} tables={d.tables} />
          <FloorPlanEditor toast={toast} onSaved={load} />
        </div>
      )}

      {/* Přidání i úprava v okně: seznam zůstává čitelný. */}
      {(addOpen || edit) && (
        <Modal open onClose={() => { setAddOpen(false); setEdit(null); }} title={edit ? 'Upravit stůl' : 'Nový stůl'} size="sm">
          <form onSubmit={edit ? saveEdit : add} className="space-y-4">
            <div>
              <label htmlFor="t-name" className={label}>Název stolu</label>
              <input id="t-name" autoFocus value={edit ? edit.name : name}
                onChange={e => edit ? setEdit({ ...edit, name: e.target.value }) : setName(e.target.value)}
                placeholder="U okna" className={input} />
            </div>
            <div>
              <label htmlFor="t-seats" className={label}>Kolik míst</label>
              <input id="t-seats" type="number" min={1} max={40} value={edit ? edit.seats : seats}
                onChange={e => { const v = parseInt(e.target.value || '2', 10); edit ? setEdit({ ...edit, seats: v }) : setSeats(v); }}
                className={`${input} !w-24 text-center`} />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button type="submit" variant="accent" icon={edit ? 'check' : 'plus'} loading={busy} className="flex-1 justify-center">
                {edit ? 'Uložit' : 'Přidat stůl'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => { setAddOpen(false); setEdit(null); }}>Zrušit</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
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
      <PageHeader hintId="clientadmin-7" title="Zákazníci" subtitle={sub_title[sub]} />
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
  const seq = useRef(0);
  // Sekvenční čítač: pomalejší odpověď na starší dotaz nesmí přepsat novější
  // výsledek. A tvar odpovědi normalizujeme, ať { error } (200) nespadne na
  // d.customers.length při renderu.
  const load = useCallback(() => {
    const my = ++seq.current;
    const safe = (x: any) => (my === seq.current ? setD(x && Array.isArray(x.customers) ? x : { customers: [], total: 0 }) : undefined);
    return fetch(`/api/client/admin/customers?q=${encodeURIComponent(q)}`).then(r => r.json()).then(safe).catch(() => safe(null));
  }, [q]);
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
        {/* Sdílené pole: stejný tvar jako jinde, plus poslední hledání
            a klávesnice. Dřív tu bylo vlastní `<input>` s ikonou nalepenou
            absolutním pozicováním. */}
        <SearchField className="w-full max-w-sm" value={q} onChange={setQ}
          storageKey="hoste" placeholder="Jméno nebo e-mail" ariaLabel="Hledat zákazníka" />
        {d && <p className="text-sm text-black/55 tabular-nums">{d.total} {d.total === 1 ? 'člen' : d.total < 5 ? 'členové' : 'členů'}</p>}
      </div>
      {d === null ? <PageSkel /> : d.customers.length === 0
        ? <EmptyState icon="users" title={q ? 'Nikdo takový' : 'Zatím žádní členové'} hint={q ? '' : 'Přidají se sami na tvé stránce pro hosty.'} compact />
        : <ul className="glass-card p-3 sm:p-4 list">
            {d.customers.map((c: any) => (
              <li key={c.id} className="py-1">
                <ListRow
                  as="div"
                  className="flex-wrap sm:flex-nowrap"
                  lead={<Initials name={c.name} size={36} />}
                  title={<span className="flex items-center gap-2 min-w-0"><span className="truncate">{c.name}</span>{levelFor(Number(c.visits)).id !== 'bronze' && <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${levelFor(Number(c.visits)).id === 'gold' ? 'bg-[#C8F542]/30 text-[#3E5406]' : 'bg-black/[0.07] text-black/60'}`}>{levelFor(Number(c.visits)).label}</span>}</span>}
                  meta={`${c.email} · člen od ${new Date(c.joined_at).toLocaleDateString('cs-CZ')}${c.last_visit_at ? ` · naposledy ${new Date(c.last_visit_at).toLocaleDateString('cs-CZ')}` : ''}`}
                  value={<>{c.points} <span className="text-xs font-medium text-black/50">b.</span></>}
                  valueMeta={`${c.stamps} raz. · ${c.visits} návšt.`}
                  aside={<>{c.reservations} rez.{c.open_coupons ? ` · ${c.open_coupons} kupon` : ''}</>}
                  actions={<>
                    <Button size="sm" variant="secondary" onClick={() => adjust(c.id, c.name)}>Body ±</Button>
                    <Button size="sm" variant="ghost" onClick={() => showLedger(c.id)}>{openId === c.id ? 'Skrýt' : 'Deník'}</Button>
                  </>}
                />
                {openId === c.id && (
                  <div className="mt-2 ml-0 md:ml-12 well border border-black/[0.06] p-3 text-xs space-y-3">
                    <MemberGroups customerId={c.id} toast={toast} />
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

/** Štítky skupin u člena: klepnutím se host do skupiny přidá / odebere.
 *  Skupiny se zakládají ve Věrnost → Slevy a úrovně. */
function MemberGroups({ customerId, toast }: { customerId: number; toast: (m: string) => void }) {
  const [groups, setGroups] = useState<any[] | null>(null);
  const [mine, setMine] = useState<number[]>([]);
  const [busy, setBusy] = useState(0);
  const load = useCallback(() => fetch(`/api/client/admin/groups?customerId=${customerId}`).then(r => r.json())
    .then(d => { setGroups(d.groups ?? []); setMine(d.customerGroupIds ?? []); }).catch(() => setGroups([])), [customerId]);
  useEffect(() => { load(); }, [load]);
  if (groups === null || groups.length === 0) return null;
  const flip = async (g: any) => {
    const on = mine.includes(g.id);
    setBusy(g.id);
    try {
      await j('/api/client/admin/groups', { method: 'PATCH', body: JSON.stringify({ id: g.id, [on ? 'remove' : 'add']: [customerId] }) });
      setMine(on ? mine.filter(x => x !== g.id) : [...mine, g.id]);
    } catch (e: any) { toast(e.message); }
    setBusy(0);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-black/45 font-semibold uppercase tracking-wider text-[11px] mr-1">Skupiny</span>
      {groups.map((g: any) => (
        <button key={g.id} type="button" onClick={() => flip(g)} disabled={busy === g.id} aria-pressed={mine.includes(g.id)}
          className={`tap-target-sm rounded-full px-2.5 py-1 text-[11px] font-semibold transition border ${mine.includes(g.id) ? 'bg-[#16181A] text-[#C8F542] border-[#16181A]' : 'bg-white/70 text-black/55 border-black/[0.09] hover:bg-black/[0.05]'}`}>
          {g.name}
        </button>
      ))}
    </div>
  );
}

// ---- Věrnost --------------------------------------------------------------------

function Loyalty({ toast }: { toast: (m: string) => void }) {
  return <LoyaltyTabs toast={toast} promos={<Promos toast={toast} />} />;
}

function SettingsTab({ toast, onChange }: { toast: (m: string) => void; onChange: () => void }) {
  const { data: d, error, reload, set: setD } = useLoad<any>('/api/client/admin/profile', raw => {
    if (!raw || typeof raw !== 'object' || !raw.profile) throw new Error('Profil podniku se nepodařilo přečíst');
    return raw;
  });
  const [pOverride, setP] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const p = pOverride ?? d?.profile ?? null;
  if (error) return <ErrorState title="Nastavení se nenačetlo" onRetry={reload} detail={error} />;
  if (!d || !p) return <PageSkel />;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await j('/api/client/admin/profile', { method: 'PUT', body: JSON.stringify({ enabled: p.enabled, slug: p.slug, reservations_on: p.reservations_on, ordering_on: p.ordering_on, max_party: p.max_party, lead_days: p.lead_days, slot_minutes: p.slot_minutes, menu_slug: p.menu_slug || null,
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
      <PageHeader hintId="clientadmin-8" title="Nastavení" subtitle="Jak podnik vidí hosté a co u něj můžou dělat." primary={<Button type="submit" variant="accent" loading={busy}>Uložit</Button>} />
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
        <h2 className="t-section">Nabídka pro hosty</h2>
        <div>
          <label htmlFor="s-menu" className={label}>Které menu se hostům ukáže</label>
          <select id="s-menu" value={p.menu_slug ?? ''} onChange={e => setP({ ...p, menu_slug: e.target.value })} className={input}>
            <option value="">První zapnuté menu</option>
            {(d.boards ?? []).map((b: any) => (
              <option key={b.slug} value={b.slug}>
                {b.name}{b.items > 0 ? ` — ${b.linked} z ${b.items} položek se tiskne na kase` : ' — zatím prázdné'}
              </option>
            ))}
          </select>
          {(() => {
            const boards = d.boards ?? [];
            const vybrane = p.menu_slug ? boards.find((b: any) => b.slug === p.menu_slug) : boards[0];
            const chybi = vybrane ? Number(vybrane.items) - Number(vybrane.linked) : 0;
            if (!p.ordering_on || !vybrane || chybi <= 0) return null;
            return (
              <p className="text-xs rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-900 px-3 py-2 mt-1.5">
                V menu „{vybrane.name}" nemá {chybi} {chybi === 1 ? 'položka produkt' : chybi < 5 ? 'položky produkt' : 'položek produkt'} v pokladně. Objednávka, ve které taková položka bude, se do Storyous nepošle a na terminálu se nevytiskne — spáruj je v záložce Menu.
              </p>
            );
          })()}
          <p className="text-xs text-black/50 mt-1">Nabídku spravuješ v záložce Menu. Logo, fotky a text o podniku najdeš ve Vzhledu.</p>
        </div>
      </section>
      <section className="glass-card p-5 grid gap-4">
        <h2 className="t-section">Rezervace</h2>
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
          <h2 className="t-section">Ochrana objednávek od stolu</h2>
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
            <p className="text-xs text-black/55 mt-1">{d.count} hodnocení</p>
            <ul className="mt-4 space-y-1">
              {[5, 4, 3, 2, 1].map(n => (
                <li key={n} className="flex items-center gap-2 text-xs tabular-nums"><span className="w-3 text-black/55">{n}</span><span className="on-accent">★</span><span className="flex-1 h-2 rounded-full bg-black/[0.06] overflow-hidden"><span className="block h-full bg-[#C8F542]" style={{ width: `${(d.dist[n - 1] / max) * 100}%` }} /></span><span className="w-6 text-right text-black/55">{d.dist[n - 1]}</span></li>
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
                  {v.crew?.length > 0 && (
                    <p className={`text-xs mt-1 ${Number(v.rating) <= 2 ? 'text-amber-800' : 'text-black/45'}`}>
                      Ten den měli směnu: {v.crew.map((c: any) => `${c.avatar} ${c.name}`).join(', ')}
                    </p>
                  )}
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
  const [f, setF] = useState({ title: '', body: '', audience: 'all', linkKind: 'page', scheduledAt: '' }); const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch('/api/client/admin/broadcast').then(r => r.json()).then(setD).catch(() => setD({ history: [], members: 0 })), []);
  useEffect(() => { load(); }, [load]);
  const target = f.audience === 'quiet' ? (d?.quiet ?? 0)
    : f.audience === 'tier:silver' ? (d?.silver ?? 0)
    : f.audience === 'tier:gold' || f.audience === 'gold' ? (d?.gold ?? 0)
    : f.audience === 'tier:platinum' ? (d?.platinum ?? 0)
    : f.audience.startsWith('group:') ? (d?.groups?.find((g: any) => `group:${g.id}` === f.audience)?.members ?? 0)
    : (d?.members ?? 0);
  const planned = !!f.scheduledAt && new Date(f.scheduledAt).getTime() > Date.now();
  const send = async (e: React.FormEvent) => {
    e.preventDefault(); if (!f.title.trim()) return;
    if (!confirm(planned ? `Naplánovat zprávu pro ${target} členů na ${new Date(f.scheduledAt).toLocaleString('cs-CZ')}?` : `Poslat zprávu ${target} členům?`)) return;
    setBusy(true);
    try {
      const r = await j('/api/client/admin/broadcast', { method: 'POST', body: JSON.stringify(f) });
      toast(r.scheduled ? 'Zpráva je naplánovaná — odejde ve svůj čas.' : `Odesláno ${r.broadcast.recipients} členům.`);
      setF({ title: '', body: '', audience: 'all', linkKind: 'page', scheduledAt: '' }); load();
    } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  const cancel = async (h: any) => {
    if (!confirm(`Zrušit naplánovanou zprávu „${h.title}"?`)) return;
    try { await j(`/api/client/admin/broadcast?id=${h.id}`, { method: 'DELETE' }); toast('Zpráva zrušena.'); load(); } catch (e: any) { toast(e.message); }
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
              <option value="tier:silver">Stříbrným a výš ({d.silver ?? 0})</option>
              <option value="tier:gold">Zlatým a výš ({d.gold ?? 0})</option>
              {d.platinum != null && <option value="tier:platinum">Platinovým hostům ({d.platinum})</option>}
              {(d.groups ?? []).map((g: any) => <option key={g.id} value={`group:${g.id}`}>Skupina {g.name} ({g.members})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label htmlFor="bc-link" className={label}>Kam zpráva vezme</label>
              <select id="bc-link" value={f.linkKind} onChange={e => setF({ ...f, linkKind: e.target.value })} className={input}>
                <option value="page">Na stránku podniku</option>
                <option value="loyalty">Na věrnost a kupony</option>
                <option value="order">Na objednávku od stolu</option>
                <option value="me">Na jeho kartičku (Moje)</option>
              </select>
            </div>
            <div><label htmlFor="bc-at" className={label}>Odeslat (prázdné = hned)</label>
              <input id="bc-at" type="datetime-local" value={f.scheduledAt} onChange={e => setF({ ...f, scheduledAt: e.target.value })} className={input} />
            </div>
          </div>
          <p className="text-xs text-black/50">Zpráva se objeví i v Novinkách na tvé stránce pro hosty. Naplánovaná odejde ve svůj čas a do té doby jde zrušit.</p>
          <Button type="submit" variant="accent" icon="send" loading={busy} disabled={!target}>
            {planned
              ? `Naplánovat pro ${czCount(target, { one: 'člena', few: 'členy', many: 'členů' })}`
              : `Poslat ${czCount(target, { one: 'členovi', few: 'členům', many: 'členům' })}`}
          </Button>
        </form>
        <section>
          <SectionTitle icon="mail">Odeslané</SectionTitle>
          {d.history.length === 0 ? <EmptyState icon="mail" title="Zatím nic odeslaného" hint="První zpráva půjde všem, kdo se k podniku přidali." compact />
            : <ul className="glass-card p-3 sm:p-4 divide-y divide-black/[0.06]">{d.history.map((h: any) => (
                <li key={h.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold leading-tight min-w-0">{h.title}
                      {h.status === 'scheduled' && <span className="ml-2 rounded-full bg-amber-500/15 text-amber-800 px-2 py-0.5 text-[11px] font-semibold align-middle">naplánováno</span>}
                    </p>
                    {h.status === 'scheduled' && <Button size="sm" variant="ghost" onClick={() => cancel(h)}>Zrušit</Button>}
                  </div>
                  {h.body && <p className="text-sm text-black/65 mt-0.5 text-pretty">{h.body}</p>}
                  <p className="text-xs text-black/45 mt-1">
                    {h.status === 'scheduled' ? `odejde ${dbTimeDayHM(h.scheduled_at)}` : `${dbTimeDayHM(h.sent_at)} · ${h.recipients} ${h.recipients === 1 ? 'člen' : h.recipients < 5 ? 'členové' : 'členů'}`}
                    {h.audience === 'quiet' ? ' · kdo dlouho nebyl' : h.audience === 'gold' || h.audience === 'tier:gold' ? ' · zlatí hosté' : h.audience === 'tier:silver' ? ' · stříbrní a výš' : h.audience === 'tier:platinum' ? ' · platinoví' : String(h.audience ?? '').startsWith('group:') ? ' · skupina' : ''}
                  </p>
                  {h.status !== 'scheduled' && (Number(h.visits_after) > 0 || Number(h.visits_before) > 0) && (() => {
                    const a = Number(h.visits_after) || 0, bft = Number(h.visits_before) || 0;
                    const diff = a - bft;
                    return (
                      <p className={`text-xs mt-1 ${diff > 0 ? 'text-[#5B7A08]' : 'text-black/45'}`}>
                        {h.still_running ? 'Zatím ' : ''}{a} {a === 1 ? 'člen' : a < 5 ? 'členové' : 'členů'} u kasy do sedmi dní po odeslání
                        {bft > 0 ? `, sedm dní předtím ${bft}` : ''}
                        {diff !== 0 ? ` (${diff > 0 ? '+' : ''}${diff})` : ''}
                        {h.still_running ? ' · ještě běží' : ''}
                      </p>
                    );
                  })()}
                </li>))}</ul>}
          {d.history.length > 0 && <p className="text-[11px] text-black/40 mt-2 px-1">Srovnání sedmi dní po a před odesláním je nejpoctivější, co z našich dat jde. Neříká, že za návštěvu může zpráva — říká, jestli se po ní něco pohnulo.</p>}
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
