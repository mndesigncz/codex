'use client';

// Režim Client pro vedení — vedle TO GO. Tady se spravuje, co host vidí a
// dělá: rezervace, stoly, členové, věrnost a profil podniku.
//
// Kolo 69 (balík B8):
//  - Skořápka je stejná jako administrace: plovoucí boční pás `glass-strong`
//    se skupinami (štítky t-label), lišta s názvem obrazovky, papír z body
//    (dřív natvrdo #F1F3ED a plochá navigace přímo na papíře), zpět jako
//    tlačítko s popiskem. Na telefonu sdílený Dock s odznaky u Rezervací
//    a Objednávek — dřív třetí kopie doku bez odznaků, takže nová objednávka
//    od stolu na navigaci nebyla vidět. Potvrzení akcí jde přes jeden Toast
//    dole uprostřed (dřív limetkový proužek nahoře, který posunul obsah).
//  - Přehled, Rezervace, Objednávky, Stoly, Zákazníci a Věrnost jsou plochy
//    s widgety (PlochaWidgetu): vlastní hlavička se přesunula do plochy,
//    pracovní část je nástroj. Přehled nástroj nemá — je celý z widgetů
//    (katalog). Menu a Akce kreslí své plochy samy (B4, EventsView), Vzhled
//    a Nastavení jsou formuláře bez plochy.
//  - Oprávnění: záložka jen s klíčem (dřív viděl každý s klient.prehled
//    všechno a server pak vracel 403). Uvnitř záložek akce jen s jejich
//    klíčem — potvrzovat rezervace, spravovat stoly, upravovat body.
//  - Navigace z widgetů na záložky Clientu (klient:*) zůstává uvnitř —
//    layout by jinak jen přepsal výchozí záložku, kterou komponenta čte
//    jednou při připojení, a proklik z widgetu by nikam nevedl.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTheme } from '../ThemeProvider';
import { Icon, LogoMark } from '../Icons';
import {
  Badge, BarSpark, Button, Card, Chip, EmptyState, ErrorBoundary, ErrorState, Field, Input, ListRow, Menu, Modal, PageHeader,
  PersonChip, Segmented, Select, Skeleton, Stat, SwitchRow, Toast, useLoad, type MenuItem,
} from '../ui';
import { Dock } from '../ui/Dock';
import StaffInbox from './StaffInbox';
import MobileMoreSheet from '../MobileMoreSheet';
import FloorPlanEditor from './FloorPlanEditor';
import QrDesigner from './QrDesigner';
import BrandTab from './BrandTab';
import LoyaltyTabs, { LOYALTY_SUBS, type LoyaltySub } from './LoyaltyTabs';
import PrechodZKarticky, { PRECHOD_TLACITKO, PRECHOD_OTAZKA, PRECHOD_POPIS, useImportKarticky } from './PrechodZKarticky';
import ClenoveSprava from './loyalty/ClenoveSprava';
import ZpravyRozeslani from './loyalty/ZpravyRozeslani';
import MenuEditor from '../employer/MenuEditor';
import EventsView from '../employer/EventsView';
import { czDay, RES_STATUS } from '@/lib/clientSlots';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { czCount, type CzNoun } from '@/lib/czech';
import { apiMessage } from '@/lib/api';
import type { Navigace } from '@/lib/widgety/typy';
import {
  TON_REZERVACE, hlavniKrok, klicPrechodu, muzeDo, poDnech, prumerCesky, vyberHodnoceni, vyberRezervace,
  type Rezervace, type StavRezervace,
} from '@/lib/klientPrehled';
import { useOpravneni } from '../role/useOpravneni';
import { NavigaceKontext, useNavigace } from '../widgety/NavigaceKontext';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { otevriNaTisk } from '@/lib/stahni';
import PromoKody from './loyalty/KuponyPromo';

// Nastavení účtu v okně: stejná obrazovka jako v administraci (profil, vzhled a jazyk, oznámení, zabezpečení),
// jen se stahuje až při otevření, ať ho Client nenese s každým načtením.
const NastaveniUctu = dynamic(() => import('../Settings'), { loading: () => <div className="flex items-center justify-center h-48"><div className="spinner" /></div> });

type Tab = 'overview' | 'reservations' | 'orders' | 'tables' | 'menu' | 'events' | 'customers' | 'loyalty' | 'brand' | 'settings';

/** Záložky Clientu a klíče, které je otevírají (stačí kterýkoli; null = každý s klient.prehled). */
const TABS: { id: Tab; label: string; icon: string; klice: readonly string[] | null }[] = [
  { id: 'overview', label: 'Přehled', icon: 'overview', klice: null },
  { id: 'reservations', label: 'Rezervace', icon: 'calendarCheck', klice: ['rezervace.zobrazit'] },
  { id: 'orders', label: 'Objednávky', icon: 'cup', klice: ['objednavky.zobrazit'] },
  { id: 'tables', label: 'Stoly', icon: 'location', klice: ['stoly.zobrazit'] },
  { id: 'menu', label: 'Menu', icon: 'leaf', klice: ['menu.zobrazit'] },
  { id: 'events', label: 'Akce', icon: 'calendar', klice: ['akce.zobrazit'] },
  { id: 'customers', label: 'Zákazníci', icon: 'users', klice: ['zakaznici.zobrazit', 'zakaznici.recenze', 'zakaznici.zpravy'] },
  { id: 'loyalty', label: 'Věrnost', icon: 'gift', klice: ['vernost.zobrazit', 'kupony.spravovat', 'kupony.uplatnit'] },
  { id: 'brand', label: 'Vzhled', icon: 'sparkle', klice: ['klient.vzhled'] },
  { id: 'settings', label: 'Nastavení', icon: 'settings', klice: ['klient.nastaveni'] },
];
const JE_TAB = (x: unknown): x is Tab => TABS.some(t => t.id === x);

// Deset sourozenců v jedné řadě je seznam, ne navigace — proto skupiny, stejně
// jako v administraci a v mobilním „Více".
const NAV_SECTIONS: { title: string | null; ids: Tab[] }[] = [
  { title: null, ids: ['overview'] },
  { title: 'Dnešek', ids: ['reservations', 'orders'] },
  { title: 'Podnik', ids: ['tables', 'menu', 'events'] },
  { title: 'Hosté', ids: ['customers', 'loyalty'] },
  { title: 'Nastavení', ids: ['brand', 'settings'] },
];
const DOCK: Tab[] = ['overview', 'reservations', 'orders'];

const URL_SOUHRN = '/api/client/admin/summary';
/** Jak často skořápka obnoví odznaky (stejný rytmus jako příjem objednávek ve StaffInbox). */
const OBNOVA_SOUHRNU_MS = 20_000;
const URL_REZERVACE_DNES = '/api/client/admin/reservations?range=today';
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

const OSOBA: CzNoun = { one: 'osoba', few: 'osoby', many: 'osob' };
const MISTO: CzNoun = { one: 'místo', few: 'místa', many: 'míst' };
const NOVA_OBJEDNAVKA: CzNoun = { one: 'nová objednávka', few: 'nové objednávky', many: 'nových objednávek' };
const REZERVACE_KE_SCHVALENI: CzNoun = { one: 'rezervace k potvrzení', few: 'rezervace k potvrzení', many: 'rezervací k potvrzení' };
const HODNOCENI: CzNoun = { one: 'hodnocení', few: 'hodnocení', many: 'hodnocení' };

async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, init ? { headers: JSON_HLAVICKA, ...init } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Nepovedlo se.');
  return d;
}

type Hlaska = (text: string, ton?: 'ok' | 'bad') => void;

/** Souhrn Clientu pro skořápku: slug, zapnuto, odznaky. Sdílí mezipaměť s widgety Přehledu. */
interface SouhrnSkorapky { zapnuto: boolean | null; slug: string | null; rezervaceCekaji: number; objednavkyNove: number; clenu: number | null }
const vyberSouhrnSkorapky = (raw: any): SouhrnSkorapky => ({
  zapnuto: typeof raw?.enabled === 'boolean' ? raw.enabled : null,
  slug: typeof raw?.slug === 'string' && raw.slug ? raw.slug : null,
  // N13: bez klíče přijde null — odznak se pak nekreslí.
  rezervaceCekaji: Number(raw?.reservations?.requested) || 0,
  objednavkyNove: Number(raw?.orders?.new) || 0,
  // Bez oprávnění (nebo před načtením) přijde null: výzva k přechodu z Kartičky se pak neukáže.
  clenu: typeof raw?.members === 'number' ? raw.members : null,
});

export default function ClientAdmin({ onExit, initialTab, user }: { onExit: () => void; initialTab?: string; user?: { id?: string | number; name?: string; role?: string; avatar?: string } }) {
  const { ma } = useOpravneni();
  const moje = TABS.filter(t => !t.klice || ma(t.klice));
  const klicMoje = moje.map(t => t.id).join(',');
  const [volba, setVolba] = useState<Tab>(JE_TAB(initialTab) ? initialTab : 'overview');
  // Odkaz z oznámení („nová rezervace") nebo proklik z widgetu jinde v aplikaci
  // může přijít, i když je Client už otevřený.
  useEffect(() => { if (JE_TAB(initialTab)) setVolba(initialTab); }, [initialTab]);
  const tab: Tab = moje.some(t => t.id === volba) ? volba : 'overview';
  const aktivni = TABS.find(t => t.id === tab)!;

  // Správa Managero client je světlá i při tmavém motivu účtu (viz ThemeProvider).
  const { setForcedLight } = useTheme();
  useEffect(() => { setForcedLight(true); return () => setForcedLight(false); }, [setForcedLight]);

  const souhrn = useDataWidgetu(URL_SOUHRN, vyberSouhrnSkorapky).data;
  const obnovSouhrn = useCallback(() => obnovDataWidgetu(URL_SOUHRN), []);
  // Odznaky v doku a „N k vyřízení" musí žít i mimo Přehled: nová objednávka od
  // stolu přijde, zatímco vedoucí stojí na Rezervacích nebo Stolech. Mezipaměť
  // widgetů po připojení sama znovu nenačítá, proto obnova při každé změně
  // záložky (jako dřív) a na viditelné kartě jednou za čas (jako příjem objednávek).
  const minulaZalozka = useRef(tab);
  useEffect(() => {
    if (minulaZalozka.current === tab) return;
    minulaZalozka.current = tab;
    obnovSouhrn();
  }, [tab, obnovSouhrn]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === 'visible') obnovSouhrn(); }, OBNOVA_SOUHRNU_MS);
    return () => clearInterval(t);
  }, [obnovSouhrn]);
  const [hlaska, setHlaska] = useState<{ text: string; ton: 'ok' | 'bad' } | null>(null);
  const oznam: Hlaska = useCallback((text, ton = 'ok') => setHlaska({ text, ton }), []);
  // Jméno hosta z rezervace otevře Zákazníky s předvyplněným hledáním.
  const [hledatHosta, setHledatHosta] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [ucetOtevren, setUcetOtevren] = useState(false);
  const prejdi = useCallback((t: Tab) => { setVolba(t); setMoreOpen(false); }, []);
  // Odkaz z průvodce přechodem z Kartičky umí otevřít rovnou část Věrnosti (Kupony, Poukazy…).
  const [castVernosti, setCastVernosti] = useState<{ id: LoyaltySub; n: number } | null>(null);
  const otevriHosta = useCallback((q: string) => { setHledatHosta(q); prejdi('customers'); }, [prejdi]);
  const strankaProHosty = () => { if (souhrn?.slug) window.open(`/client/${souhrn.slug}`, '_blank'); };

  // Widgety na plochách Clientu navigují přes kontext. Záložky Clientu (klient:*),
  // Akce a Menu jsou tady, všechno ostatní jde dál do layoutu.
  const nadrazena = useNavigace();
  const navigace = useMemo<Navigace>(() => {
    const mistni = (pohled: string): Tab | null => {
      const id = pohled.startsWith('klient:') ? pohled.slice('klient:'.length) : pohled === 'events' || pohled === 'menu' ? pohled : null;
      return JE_TAB(id) && klicMoje.split(',').includes(id) ? id : null;
    };
    return {
      onNavigate: (pohled, arg) => {
        const t = mistni(pohled);
        if (!t) { nadrazena.onNavigate(pohled, arg); return; }
        if (t === 'loyalty' && arg && LOYALTY_SUBS.some(c => c.id === arg)) setCastVernosti(c => ({ id: arg as LoyaltySub, n: (c?.n ?? 0) + 1 }));
        prejdi(t);
      },
      // Odkaz „Věrnost ›" na stránce Věrnost by vedl tam, kde člověk už je —
      // záložka, která je právě otevřená, se widgetům hlásí jako nedostupná.
      smiPohled: pohled => {
        const t = mistni(pohled);
        if (t) return t !== tab;
        return !pohled.startsWith('klient:') && nadrazena.smiPohled(pohled);
      },
      pohledy: nadrazena.pohledy,
    };
  }, [nadrazena, klicMoje, prejdi, tab]);

  const odznak = (id: Tab) => (id === 'reservations' ? souhrn?.rezervaceCekaji ?? 0 : id === 'orders' ? souhrn?.objednavkyNove ?? 0 : 0);
  const popisOdznaku = (id: Tab, n: number) => (id === 'reservations' ? czCount(n, REZERVACE_KE_SCHVALENI) : czCount(n, NOVA_OBJEDNAVKA));
  const kVyrizeni = (souhrn?.rezervaceCekaji ?? 0) + (souhrn?.objednavkyNove ?? 0);

  return (
    <NavigaceKontext.Provider value={navigace}>
      <div className="flex h-[100dvh] overflow-hidden">
        {/* Boční pás jako v administraci (plovoucí bílá lišta se skupinami).
            Na telefonu ho nahrazuje spodní dok a list „Více". */}
        <aside className="glass-strong hidden md:flex m-4 mr-0 w-60 rounded-3xl text-[#16181A] flex-col flex-shrink-0">
          <div className="flex items-center gap-2.5 py-3.5 px-3 border-b border-black/[0.07]">
            <Button variant="ghost" size="sm" iconOnly icon="arrowLeft" className="shrink-0"
              aria-label="Zpět do administrace" title="Zpět do administrace" onClick={onExit} />
            <LogoMark size={32} />
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight tracking-tight">Managero</p>
              <p className="t-label mt-0.5">Client</p>
            </div>
          </div>
          <div className="flex-1 min-h-0 relative">
            <nav className="h-full py-1.5 space-y-px px-3 overflow-y-auto scrollbar-thin" aria-label="Části Managero client">
              {NAV_SECTIONS.map((sec, si) => {
                const polozky = sec.ids.map(id => moje.find(t => t.id === id)).filter((t): t is typeof TABS[number] => !!t);
                if (!polozky.length) return null;
                return (
                  <div key={sec.title ?? 'top'} className={si > 0 ? 'pt-1.5' : ''}>
                    {sec.title && <p className="t-label px-3.5 pb-0.5">{sec.title}</p>}
                    <div className="space-y-px">
                      {polozky.map(item => {
                        const n = odznak(item.id);
                        return (
                          <button key={item.id} type="button" onClick={() => prejdi(item.id)} title={item.label}
                            aria-current={tab === item.id ? 'page' : undefined}
                            className={`w-full flex items-center gap-3 px-3.5 py-2 rounded-2xl text-sm font-medium transition duration-200 ${tab === item.id ? 'seg-on' : 'seg-off'}`}>
                            <Icon name={item.icon} size={21} className="flex-shrink-0 i-lead" motion={tab === item.id ? 'pop' : undefined} key={tab === item.id ? 'on' : 'off'} />
                            <span className="truncate flex-1 text-left">{item.label}</span>
                            {n > 0 && tab !== item.id && <Badge count={n} label={popisOdznaku(item.id, n)} ring={false} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </nav>
            <div className="nav-fade" aria-hidden="true" />
          </div>
          <div className="p-2.5 border-t border-black/[0.07] space-y-2">
            <Button variant="secondary" size="sm" icon="external" block disabled={!souhrn?.slug} onClick={strankaProHosty}>Stránka pro hosty</Button>
            {/* Účet dole v menu: klepnutí otevře Nastavení v okně (profil, jazyk a vzhled, oznámení, heslo). */}
            <button type="button" onClick={() => setUcetOtevren(true)} aria-haspopup="dialog"
              className="w-full flex items-center gap-2.5 rounded-2xl px-2.5 py-2 text-left seg-off transition duration-200">
              <span className="w-8 h-8 rounded-full bg-black/[0.06] flex items-center justify-center text-base shrink-0" aria-hidden="true">{user?.avatar || '👤'}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-tight truncate">{user?.name || 'Účet'}</span>
                <span className="block t-meta leading-tight truncate">Účet a nastavení</span>
              </span>
              <Icon name="settings" size={18} className="shrink-0 i-lead" />
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <header className="px-4 sm:px-6 pt-5 pb-1 flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <Button variant="ghost" size="sm" iconOnly icon="arrowLeft" className="md:hidden shrink-0"
              aria-label="Zpět do administrace" title="Zpět do administrace" onClick={onExit} />
            <div className="hidden min-[380px]:block md:hidden shrink-0"><LogoMark size={30} /></div>
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-[#16181A] text-lg tracking-tight truncate">{aktivni.label}</h2>
            </div>
            {souhrn?.zapnuto === false && <Chip tone="wait" size="sm" icon="warning">Pro hosty vypnuto</Chip>}
            {kVyrizeni > 0 && <Chip tone="wait" size="sm" className="hidden sm:inline-flex">{kVyrizeni} k vyřízení</Chip>}
          </header>

          {/* relative: sr-only popisky plochy se vztahují k <main>, ne k dokumentu
              (jinak ho nafouknou a tah po pozadí posune celé rozvržení). */}
          <main className="relative flex-1 overflow-y-auto scrollbar-thin pb-36 md:pb-4">
            <div className="mx-auto w-full max-w-7xl">
              <ErrorBoundary resetKey={tab} zalozka={aktivni.label}>
                {tab === 'overview' && <PrehledClientu zapnuto={souhrn?.zapnuto ?? null} slug={souhrn?.slug ?? null} clenu={souhrn?.clenu ?? null} prejdi={prejdi} oznam={oznam} onZmena={obnovSouhrn} />}
                {tab === 'reservations' && <RezervaceStranka oznam={oznam} onZmena={obnovSouhrn} otevriHosta={moje.some(t => t.id === 'customers') ? otevriHosta : undefined} />}
                {tab === 'orders' && <ObjednavkyStranka oznam={oznam} onZmena={obnovSouhrn} />}
                {tab === 'tables' && <StolyStranka oznam={oznam} />}
                {tab === 'menu' && <MenuEditor />}
                {tab === 'events' && <EventsView user={(user ?? {}) as { id?: string }} oznam={oznam} />}
                {tab === 'customers' && <ZakazniciStranka oznam={oznam} hledat={hledatHosta} />}
                {tab === 'loyalty' && <LoyaltyTabs toast={t => oznam(t)} promos={<PromoKody oznam={oznam} />} oznam={oznam} otevriCast={castVernosti} />}
                {tab === 'brand' && <div className="p-4 sm:p-6"><BrandTab toast={t => oznam(t)} onChange={obnovSouhrn} /></div>}
                {tab === 'settings' && <div className="p-4 sm:p-6"><SettingsTab oznam={oznam} onChange={obnovSouhrn} /></div>}
              </ErrorBoundary>
            </div>
          </main>
        </div>

        <Dock label="Spodní navigace klienta"
          items={DOCK.map(id => moje.find(t => t.id === id)).filter((t): t is typeof TABS[number] => !!t).map(t => {
            const n = odznak(t.id);
            return { id: t.id, label: t.label, icon: t.icon, ...(n > 0 ? { badge: n, badgeLabel: popisOdznaku(t.id, n) } : {}) };
          })}
          activeId={tab}
          onSelect={id => prejdi(id as Tab)}
          more={{ onClick: () => setMoreOpen(v => !v), active: moreOpen || !DOCK.includes(tab) }} />
        <MobileMoreSheet
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          title="Managero client"
          groups={NAV_SECTIONS.filter(sec => sec.title && sec.title !== 'Dnešek').map(sec => ({
            title: sec.title, items: sec.ids.map(id => moje.find(t => t.id === id)).filter((t): t is typeof TABS[number] => !!t),
          }))}
          activeId={tab}
          onSelect={id => prejdi(id as Tab)}
          actions={[
            { label: 'Stránka pro hosty', icon: 'external', onClick: () => { setMoreOpen(false); strankaProHosty(); } },
            { label: 'Účet a nastavení', icon: 'settings', onClick: () => { setMoreOpen(false); setUcetOtevren(true); } },
            { label: 'Zpět do administrace', icon: 'arrowLeft', onClick: onExit },
          ]}
        />
        {ucetOtevren && (
          <Modal open onClose={() => setUcetOtevren(false)} size="lg" title="Účet a nastavení" subtitle="Profil, jazyk a vzhled, oznámení a zabezpečení">
            {user && user.id !== undefined
              ? <NastaveniUctu user={{ id: Number(user.id), name: user.name ?? '', role: user.role ?? 'employer', avatar: user.avatar }} initialTab="account" vOkne />
              : <EmptyState icon="settings" title="Účet se nenačetl" hint="Obnovte stránku a zkuste to znovu." />}
          </Modal>
        )}
        <Toast message={hlaska?.text ?? null} tone={hlaska?.ton} onClose={() => setHlaska(null)} />
      </div>
    </NavigaceKontext.Provider>
  );
}

// ---- Přehled --------------------------------------------------------------------
//
// Celý z widgetů (Čeká na tebe, objednávky, rezervace, členové, hodnocení,
// věrnost, propojení). Vypnutý Client řekne hlavička a jediná limetka ho
// nabídne nastavit — jen tomu, kdo smí do Nastavení.

function PrehledClientu({ zapnuto, slug, clenu, prejdi, oznam, onZmena }: {
  zapnuto: boolean | null; slug: string | null; clenu: number | null; prejdi: (t: Tab) => void; oznam: Hlaska; onZmena: () => void;
}) {
  const { ma } = useOpravneni();
  const vypnuto = zapnuto === false;
  // Krok „Začni": podnik bez členů a s právem importu dostane nahoře přechod z Kartičky.
  const imp = useImportKarticky(oznam, onZmena);
  return (
    <>
    <PlochaWidgetu
      stranka="vedeni.klient"
      hlavicka={{
        title: 'Přehled',
        hintId: 'clientadmin-4',
        subtitle: vypnuto
          ? 'Managero client je pro hosty vypnutý. Nastav profil podniku a zapni ho — hosté pak podnik najdou, rezervují a objednají od stolu.'
          : slug ? `Hosté tě najdou na /client/${slug}. Rezervace, objednávky, členové a věrnost na jednom místě.`
          : 'Rezervace, objednávky, členové a věrnost na jednom místě.',
        primary: vypnuto && ma('klient.nastaveni')
          ? <Button variant="accent" icon="settings" onClick={() => prejdi('settings')}>Nastavit a zapnout</Button>
          : undefined,
        aside: imp.smi && clenu === 0 ? <PrechodZKarticky clenu={0} krok onOtevri={imp.otevri} className="mt-3" /> : undefined,
      }}
    />
    {imp.okno}
    </>
  );
}

function PageSkel() {
  return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-48" /></div>;
}

/** Potvrzení nevratného kroku v okně — místo confirm(), které na iPhonu vypadá jako systémová chyba. */
function Potvrzeni({ title, text, akce, onPotvrdit, onZavrit }: {
  title: string; text: string; akce: string; onPotvrdit: () => void; onZavrit: () => void;
}) {
  return (
    <Modal open onClose={onZavrit} size="sm" title={title}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button variant="danger-solid" onClick={() => { onZavrit(); onPotvrdit(); }}>{akce}</Button>
      </>}>
      <p className="text-sm text-black/70 text-pretty">{text}</p>
    </Modal>
  );
}

// ---- Rezervace ------------------------------------------------------------------
//
// Dřív vlastní grid v `divide-y`, pět limetkových „Potvrdit/Usadit" na jedné
// obrazovce, výběr stolu jako přepsané pole a odmítnutí přes confirm(). Teď
// den = karta se seznamem (ListRow, čas v pevném sloupci), jeden tmavý krok
// vpředu (jen s jeho klíčem), zbytek v „···", stůl a odmítnutí v okně.

type Obdobi = 'today' | 'upcoming' | 'past';

function RezervaceStranka({ oznam, onZmena, otevriHosta }: { oznam: Hlaska; onZmena: () => void; otevriHosta?: (q: string) => void }) {
  // Viditelnost tlačítek podle `ma` (před načtením oprávnění ANO, rozhoduje server);
  // přísné useSmi jen tam, kde se podle klíče posílá dotaz (spec §1.5).
  const { ma: smi } = useOpravneni();
  const [obdobi, setObdobi] = useState<Obdobi>('upcoming');
  const url = `/api/client/admin/reservations?range=${obdobi}`;
  const data = useDataWidgetu(url, vyberRezervace);
  const { reload } = data;
  const [pracuji, setPracuji] = useState<number | null>(null);
  const [odmitam, setOdmitam] = useState<Rezervace | null>(null);
  const [stulPro, setStulPro] = useState<{ r: Rezervace; stul: string } | null>(null);
  const usazuje = smi('rezervace.usadit');

  const zmenit = async (r: Rezervace, telo: { status?: StavRezervace; tableId?: number | null }) => {
    setPracuji(r.id);
    try {
      const x = await j('/api/client/admin/reservations', { method: 'PATCH', body: JSON.stringify({ id: r.id, ...telo }) });
      if (x.posNote) oznam(x.posNote);
      else if (x.loyalty?.rewarded) oznam('Hotovo. Host nasbíral všechna razítka a má odměnu.');
      else if (telo.status) oznam(`${r.host}: ${(RES_STATUS[x.status ?? telo.status]?.label ?? telo.status).toLocaleLowerCase('cs-CZ')}.`);
      else oznam('Stůl uložen.');
    } catch (e) { oznam(apiMessage(e, 'Rezervaci se nepodařilo změnit.'), 'bad'); }
    setPracuji(null);
    reload();
    // Dnešní rezervace a odznaky stojí na jiných adresách — ať se nerozjedou.
    if (url !== URL_REZERVACE_DNES) obnovDataWidgetu(URL_REZERVACE_DNES);
    onZmena();
  };

  const dny = poDnech(data.data?.rezervace ?? []);
  const stoly = data.data?.stoly ?? [];
  const nastroj = data.error ? <ErrorState title="Rezervace se nenačetly" onRetry={reload} detail={data.error} />
    : !data.data ? <PageSkel />
    : dny.length === 0 ? (
      <Card>
        <EmptyState icon="calendarCheck" compact title={obdobi === 'past' ? 'Žádné minulé rezervace' : 'Zatím žádné rezervace'}
          hint={obdobi === 'past' ? undefined : 'Objeví se tu, jakmile si host zarezervuje stůl na tvé stránce.'} />
      </Card>
    ) : (
      <div className="space-y-4">
        {dny.map(([datum, radky]) => (
          <Card key={datum} pad="none" aria-labelledby={`rez-${datum}`}>
            <h2 id={`rez-${datum}`} className="t-card cz-sentence px-5 pt-4">{czDay(datum, true)} <span className="text-black/40 font-medium">· {radky.length}</span></h2>
            <ul className="list px-5 pb-1">
              {radky.map(r => {
                const krok = hlavniKrok(r.stav, smi);
                const konec = ['done', 'declined', 'cancelled'].includes(r.stav);
                const dalsi: MenuItem[] = [
                  ...(krok?.na === 'seated' && muzeDo(r.stav, 'done') && smi(klicPrechodu('done'))
                    ? [{ label: 'Rovnou hotovo', icon: 'check', onClick: () => { void zmenit(r, { status: 'done' }); } }] : []),
                  ...(usazuje && !konec ? [{ label: r.stul ? 'Změnit stůl…' : 'Přidělit stůl…', icon: 'location', onClick: () => setStulPro({ r, stul: r.stulId ? String(r.stulId) : '' }) }] : []),
                  ...(otevriHosta ? [{ label: 'Otevřít v Zákaznících', icon: 'users', onClick: () => otevriHosta(r.host) }] : []),
                  ...(muzeDo(r.stav, 'declined') && smi(klicPrechodu('declined'))
                    ? [{ label: 'Odmítnout rezervaci…', icon: 'close', danger: true, hint: 'Host dostane zprávu, že se to nepovedlo.', onClick: () => setOdmitam(r) }] : []),
                ];
                return (
                  <ListRow key={r.id} value={r.cas} title={r.host}
                    meta={[czCount(r.osob, OSOBA), r.stul ?? 'bez stolu', r.email, r.poznamka ? `„${r.poznamka}"` : null].filter(Boolean).join(' · ')}
                    right={<Chip tone={TON_REZERVACE[r.stav]} size="sm">{RES_STATUS[r.stav]?.label ?? r.stav}</Chip>}
                    actions={krok || dalsi.length ? (
                      <>
                        {krok && (
                          <Button size="sm" variant="primary" loading={pracuji === r.id} onClick={() => { void zmenit(r, { status: krok.na }); }}
                            aria-label={`${krok.popisek}: ${r.host}, ${r.cas}`}>{krok.popisek}</Button>
                        )}
                        {dalsi.length > 0 && <Menu size="sm" label={`Další akce s rezervací ${r.host}`} items={dalsi} />}
                      </>
                    ) : undefined} />
                );
              })}
            </ul>
          </Card>
        ))}
      </div>
    );

  return (
    <>
      <PlochaWidgetu
        stranka="vedeni.klient_rezervace"
        hlavicka={{
          title: 'Rezervace',
          hintId: 'clientadmin-5',
          subtitle: 'Požadavky potvrď nebo odmítni; při příchodu hosty usaď — s napojenou pokladnou se rovnou otevře účet na stole.',
          aside: <Segmented options={[{ id: 'today', label: 'Dnes' }, { id: 'upcoming', label: 'Nadcházející' }, { id: 'past', label: 'Minulé' }]}
            value={obdobi} onChange={setObdobi} size="sm" ariaLabel="Období" />,
        }}
        nastroj={nastroj}
      />
      {odmitam && (
        <Potvrzeni title="Odmítnout rezervaci?" akce="Odmítnout" onZavrit={() => setOdmitam(null)}
          text={`${odmitam.host} (${czDay(odmitam.datum)} v ${odmitam.cas}, ${czCount(odmitam.osob, OSOBA)}) dostane zprávu, že se rezervace nepovedla.`}
          onPotvrdit={() => { void zmenit(odmitam, { status: 'declined' }); }} />
      )}
      {stulPro && (
        <Modal open onClose={() => setStulPro(null)} size="sm" title={`Stůl pro ${stulPro.r.host}`}
          footer={<>
            <Button variant="secondary" onClick={() => setStulPro(null)}>Zrušit</Button>
            <Button variant="primary" onClick={() => { const { r, stul } = stulPro; setStulPro(null); void zmenit(r, { tableId: stul ? Number(stul) : null }); }}>Uložit</Button>
          </>}>
          <Field id="rez-stul" label="Stůl" hint={`${czCount(stulPro.r.osob, OSOBA)} · ${stulPro.r.cas}`}>
            <Select id="rez-stul" value={stulPro.stul} onChange={e => setStulPro({ ...stulPro, stul: e.target.value })}>
              <option value="">Bez stolu</option>
              {stoly.map(t => <option key={t.id} value={t.id}>{t.nazev} · {czCount(t.mist, MISTO)}</option>)}
            </Select>
          </Field>
        </Modal>
      )}
    </>
  );
}

// ---- Objednávky -----------------------------------------------------------------

function ObjednavkyStranka({ oznam, onZmena }: { oznam: Hlaska; onZmena: () => void }) {
  return (
    <PlochaWidgetu
      stranka="vedeni.klient_objednavky"
      hlavicka={{
        title: 'Objednávky',
        hintId: 'clientadmin-1',
        subtitle: 'Objednávky od stolu čekají na přijetí. Přijaté jdou do pokladny na stůl, hotové připíšou hostovi body.',
      }}
      nastroj={<StaffInbox onToast={t => oznam(t)} onZmena={onZmena} />}
    />
  );
}

// ---- Stoly ----------------------------------------------------------------------
//
// Seznam je seznam, ne formulář: název a místa se čtou jako text a upravují
// v okně (tlačítka dole, hlavní vpravo — dřív opačně než ve zbytku aplikace).
// Spravovat stoly jen se stoly.upravit, tisk QR jen se stoly.qr.

interface StulRadek { id: number; name: string; seats: number; active: boolean; storyous_desk_id: string | null }

function StolyStranka({ oznam }: { oznam: Hlaska }) {
  // Viditelnost tlačítek podle `ma` (před načtením oprávnění ANO, rozhoduje server);
  // přísné useSmi jen tam, kde se podle klíče posílá dotaz (spec §1.5).
  const { ma: smi } = useOpravneni();
  const upravuje = smi('stoly.upravit');
  const tiskne = smi('stoly.qr');
  const { data: d, error, reload: load } = useLoad<{ tables: StulRadek[]; posConnected: boolean }>(
    '/api/client/admin/tables',
    raw => ({ tables: Array.isArray(raw?.tables) ? raw.tables : [], posConnected: !!raw?.posConnected }),
  );
  const [busy, setBusy] = useState(false);
  const [okno, setOkno] = useState<{ id: number | null; name: string; seats: number } | null>(null);
  const [mazu, setMazu] = useState<StulRadek | null>(null);
  const [novyQr, setNovyQr] = useState<StulRadek | null>(null);

  const ulozit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!okno || !okno.name.trim()) return;
    setBusy(true);
    try {
      await j('/api/client/admin/tables', { method: okno.id ? 'PATCH' : 'POST', body: JSON.stringify({ id: okno.id ?? undefined, name: okno.name, seats: okno.seats }) });
      setOkno(null); await load();
    } catch (err) { oznam(apiMessage(err, 'Stůl se nepodařilo uložit.'), 'bad'); }
    setBusy(false);
  };
  const imp = async () => {
    setBusy(true);
    try { const r = await j('/api/client/admin/tables', { method: 'POST', body: JSON.stringify({ action: 'import' }) }); oznam(`Z pokladny: ${r.added} nových stolů, celkem ${r.total}.`); await load(); }
    catch (err) { oznam(apiMessage(err, 'Načtení z pokladny se nepovedlo.'), 'bad'); }
    setBusy(false);
  };
  const patch = async (id: number, body: Record<string, unknown>) => {
    try { await j('/api/client/admin/tables', { method: 'PATCH', body: JSON.stringify({ id, ...body }) }); await load(); }
    catch (err) { oznam(apiMessage(err, 'Změna se nepovedla.'), 'bad'); }
  };
  const smazat = async (t: StulRadek) => {
    try {
      const r = await fetch(`/api/client/admin/tables?id=${t.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Stůl se nepodařilo smazat.');
      oznam(`Stůl ${t.name} smazán.`);
    } catch (err) { oznam(apiMessage(err, 'Stůl se nepodařilo smazat.'), 'bad'); }
    load();
  };
  const novy = () => setOkno({ id: null, name: '', seats: 2 });

  const nastroj = error ? <ErrorState title="Stoly se nenačetly" onRetry={load} detail={error} />
    : d === null ? <PageSkel />
    : d.tables.length === 0 ? (
      <Card>
        <EmptyState icon="location" title="Zatím žádné stoly" compact
          hint={d.posConnected ? 'Načti je z pokladny, nebo přidej ručně.' : 'Ke stolu se váže rezervace i objednávka od hosta.'}
          action={upravuje && d.posConnected ? <Button variant="secondary" icon="download" loading={busy} onClick={imp}>Načíst z pokladny</Button> : undefined} />
      </Card>
    ) : (
      <div className="space-y-4">
        <Card pad="none">
          <ul className="list px-5">
            {d.tables.map(t => {
              const polozky: MenuItem[] = [
                { label: 'Upravit název a místa…', icon: 'pencil', onClick: () => setOkno({ id: t.id, name: t.name, seats: Number(t.seats) || 2 }) },
                { label: t.active ? 'Skrýt hostům' : 'Zobrazit hostům', icon: t.active ? 'close' : 'check', onClick: () => { void patch(t.id, { active: !t.active }); } },
                ...(tiskne ? [{ label: 'Nový QR kód…', icon: 'refresh', hint: 'Starý vytištěný kód přestane platit.', onClick: () => setNovyQr(t) }] : []),
                { label: 'Smazat stůl…', icon: 'trash', danger: true, onClick: () => setMazu(t) },
              ];
              return (
                <ListRow key={t.id} className={t.active ? '' : 'opacity-55'} title={t.name}
                  meta={`${czCount(Number(t.seats) || 0, MISTO)} · ${t.storyous_desk_id ? `kasa #${t.storyous_desk_id}` : 'jen u nás'}${t.active ? '' : ' · skrytý'}`}
                  actions={(tiskne || upravuje) ? (
                    <>
                      {tiskne && <Button size="sm" variant="secondary" icon="print" onClick={() => otevriNaTisk(`/api/client/admin/tables/qr?tableId=${t.id}`, `qr-stul-${t.id}.html`)}>QR na stůl</Button>}
                      {upravuje && <Menu size="sm" label={`Další akce se stolem ${t.name}`} items={polozky} />}
                    </>
                  ) : undefined} />
              );
            })}
          </ul>
        </Card>
        {/* Tisk QR a plánek jsou samostatné nástroje, ne pokračování seznamu — proto sbalené. */}
        {tiskne && <QrDesigner toast={t => oznam(t)} tables={d.tables} smiUlozit={smi('klient.vzhled')} />}
        <FloorPlanEditor toast={t => oznam(t)} onSaved={load} smiUpravit={upravuje} />
      </div>
    );

  return (
    <>
      <PlochaWidgetu
        stranka="vedeni.klient_stoly"
        hlavicka={{
          title: 'Stoly',
          hintId: 'clientadmin-6',
          subtitle: 'Ke stolům se vážou rezervace i objednávky. S napojenou pokladnou je vezmi odtamtud, ať sedí čísla. Tlačítko „QR na stůl" vytiskne kód, ze kterého host objedná.',
          primary: upravuje ? <Button variant="accent" icon="plus" onClick={novy}>Přidat stůl</Button> : undefined,
          menu: upravuje && d?.posConnected ? [{ label: 'Načíst stoly z pokladny', icon: 'download', onClick: () => { void imp(); }, hint: 'Převezme čísla stolů z kasy, ať sedí s účty.' }] : undefined,
        }}
        nastroj={nastroj}
      />
      {okno && (
        <Modal open onClose={() => setOkno(null)} title={okno.id ? 'Upravit stůl' : 'Nový stůl'} size="sm"
          footer={<>
            <Button variant="secondary" onClick={() => setOkno(null)}>Zrušit</Button>
            <Button type="submit" form="stul-okno" variant="primary" icon={okno.id ? 'check' : 'plus'} loading={busy}>{okno.id ? 'Uložit' : 'Přidat stůl'}</Button>
          </>}>
          <form id="stul-okno" onSubmit={ulozit} className="space-y-4">
            <Field id="t-name" label="Název stolu">
              <Input id="t-name" autoFocus value={okno.name} maxLength={60} onChange={e => setOkno({ ...okno, name: e.target.value })} placeholder="U okna" />
            </Field>
            <Field id="t-seats" label="Kolik míst">
              <Input id="t-seats" type="number" min={1} max={40} className="!w-28" value={okno.seats}
                onChange={e => setOkno({ ...okno, seats: Math.max(1, parseInt(e.target.value || '1', 10) || 1) })} />
            </Field>
          </form>
        </Modal>
      )}
      {mazu && (
        <Potvrzeni title={`Smazat stůl ${mazu.name}?`} akce="Smazat" onZavrit={() => setMazu(null)}
          text="Rezervace a objednávky, které na něj byly, zůstanou — jen bez stolu. Vytištěný QR kód přestane fungovat."
          onPotvrdit={() => { void smazat(mazu); }} />
      )}
      {novyQr && (
        <Potvrzeni title={`Nový QR kód pro stůl ${novyQr.name}?`} akce="Vygenerovat" onZavrit={() => setNovyQr(null)}
          text="Starý vytištěný kód přestane platit. Nový pak vytiskni a vyměň na stole."
          onPotvrdit={() => { void patch(novyQr.id, { rotate_token: true }); }} />
      )}
    </>
  );
}

// ---- Zákazníci ------------------------------------------------------------------

type CastZakazniku = 'members' | 'reviews' | 'messages' | 'automations';
const CASTI_ZAKAZNIKU: { id: CastZakazniku; label: string; klic: string; popis: string }[] = [
  { id: 'members', label: 'Členové', klic: 'zakaznici.zobrazit', popis: 'Kdo se k podniku přidal, kolik má bodů a razítek, deník změn.' },
  { id: 'reviews', label: 'Hodnocení', klic: 'zakaznici.recenze', popis: 'Host dostane po hotové rezervaci nebo objednávce výzvu k hodnocení. Slabé hodnocení (1 až 2 hvězdy) ti přijde jako oznámení.' },
  { id: 'messages', label: 'Zprávy členům', klic: 'zakaznici.zpravy', popis: 'Novinka, akce nebo nabídka pro členy: oznámení v aplikaci a push, nebo e-mail. Nejvýš pět za den.' },
  { id: 'automations', label: 'Automatizace', klic: 'zakaznici.zpravy', popis: 'Zprávy, které odejdou samy: uvítání, po první návštěvě, po dokončení karty, k narozeninám a „Chybíš nám“.' },
];

function ZakazniciStranka({ oznam, hledat }: { oznam: Hlaska; hledat: string }) {
  // Části jako záložky aplikace: podle `ma` (do načtení oprávnění všechny, pak jen povolené).
  const { ma } = useOpravneni();
  const casti = CASTI_ZAKAZNIKU.filter(c => ma(c.klic));
  const [volba, setVolba] = useState<CastZakazniku>('members');
  const cast = casti.find(c => c.id === volba) ?? casti[0] ?? null;
  const nastroj = !cast ? null
    : cast.id === 'members' ? <ClenoveSprava oznam={oznam} hledat={hledat} />
    : cast.id === 'reviews' ? <Recenze />
    : <ZpravyRozeslani oznam={oznam} />;
  return (
    <PlochaWidgetu
      stranka="vedeni.klient_zakaznici"
      hlavicka={{
        title: 'Zákazníci',
        hintId: 'clientadmin-7',
        subtitle: cast?.popis,
        aside: casti.length > 1 && cast
          ? <Segmented options={casti.map(c => ({ id: c.id, label: c.label }))} value={cast.id} onChange={setVolba} size="sm" ariaLabel="Části zákazníků" />
          : undefined,
      }}
      nastroj={nastroj}
    />
  );
}

// ---- Hodnocení ------------------------------------------------------------------

function Recenze() {
  const { data: d, error, reload } = useLoad<{ h: ReturnType<typeof vyberHodnoceni>; crew: Map<number, { name: string; avatar: string | null }[]> }>(
    '/api/client/admin/reviews',
    raw => ({
      h: vyberHodnoceni(raw),
      crew: new Map((Array.isArray(raw?.reviews) ? raw.reviews : []).map((v: any) => [Number(v.id), (Array.isArray(v.crew) ? v.crew : []).map((c: any) => ({
        name: String(c?.name ?? ''), avatar: typeof c?.avatar === 'string' && c.avatar !== '👤' ? c.avatar : null,
      }))])),
    }),
  );
  if (error) return <ErrorState title="Hodnocení se nenačetla" onRetry={reload} detail={error} />;
  if (!d) return <PageSkel />;
  const { h, crew } = d;
  if (h.pocet === 0) return <Card><EmptyState icon="star" title="Zatím žádné hodnocení" hint="Objeví se, jakmile host ohodnotí hotovou návštěvu." compact /></Card>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-[minmax(14rem,auto)_1fr] gap-4 items-start">
      <Card className="space-y-4">
        <Stat label="Průměr" value={prumerCesky(h.prumer)} unit="/ 5" note={czCount(h.pocet, HODNOCENI)} />
        <BarSpark height={56} showLabels label="Rozložení hodnocení od jedné do pěti hvězd"
          data={h.rozlozeni.map((n, i) => ({ value: n, label: String(i + 1), tip: `${i + 1} z 5: ${czCount(n, HODNOCENI)}` }))} />
      </Card>
      <Card pad="none">
        <ul className="list px-5">
          {h.posledni.map(v => {
            const lide = crew.get(v.id) ?? [];
            return (
              <li key={v.id} className="list-row items-start">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium leading-snug text-[#16181A] flex items-center gap-2 min-w-0">
                    <span className="truncate">{v.host}</span>
                    <span className={`inline-flex items-center gap-0.5 shrink-0 tabular-nums ${v.hvezdy <= 2 ? 'text-wait-ink' : 'text-black/55'}`} aria-label={`${v.hvezdy} z 5`}>
                      {v.hvezdy}<Icon name="star" size={14} />
                    </span>
                  </p>
                  <p className={`text-sm mt-0.5 text-pretty ${v.poznamka ? 'text-black/70' : 'text-black/45'}`}>{v.poznamka ? `„${v.poznamka}"` : 'Bez komentáře.'}</p>
                  <p className="t-meta mt-1">{dbTimeDayHM(v.kdy)} · {v.zdroj === 'objednavka' ? 'objednávka od stolu' : 'rezervace'}</p>
                  {lide.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className="t-meta">Ten den na směně:</span>
                      {lide.map(c => <PersonChip key={c.name} name={c.name} avatar={c.avatar} size="sm" tone={v.hvezdy <= 2 ? 'wait' : 'muted'} />)}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

// ---- Nastavení ------------------------------------------------------------------
//
// Zapnutí pro hosty, rezervace, objednávky, QR a odesílání do kasy jsou
// přepínače (Switch v řádku), ne nativní zaškrtávátka; tři ruční jantarové
// hlášky jsou `.note note-wait`.

function SettingsTab({ oznam, onChange }: { oznam: Hlaska; onChange: () => void }) {
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
      setP(r.profile); setD({ ...d, url: r.url }); oznam(r.profile.enabled ? 'Uloženo. Podnik je pro hosty zapnutý.' : 'Uloženo. Podnik je zatím vypnutý.'); onChange();
    } catch (err) { oznam(apiMessage(err, 'Uložení se nepovedlo.'), 'bad'); }
    setBusy(false);
  };
  const copy = () => { navigator.clipboard?.writeText(d.url).then(() => oznam('Adresa zkopírována.')).catch(() => {}); };
  const useMyPosition = () => {
    if (!navigator.geolocation) { oznam('Prohlížeč neumí polohu.', 'bad'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setP((x: any) => ({ ...(x ?? p), lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) })); setLocating(false); oznam(`Poloha načtena s přesností ${Math.round(pos.coords.accuracy)} m. Nezapomeň uložit.`); },
      () => { setLocating(false); oznam('Polohu se nepodařilo zjistit. Povol ji v prohlížeči.', 'bad'); },
      { enableHighAccuracy: true, timeout: 12000 });
  };
  const hasCoords = p.lat != null && p.lat !== '' && p.lng != null && p.lng !== '';
  const hoursOk = Object.values(p.opening_hours ?? {}).some((h: any) => h && !h.closed && h.open);
  const boards = d.boards ?? [];
  const vybrane = p.menu_slug ? boards.find((b: any) => b.slug === p.menu_slug) : boards[0];
  const chybi = vybrane ? Number(vybrane.items) - Number(vybrane.linked) : 0;
  return (
    <div className="space-y-6 max-w-3xl">
    <form onSubmit={save} className="space-y-6">
      <PageHeader hintId="clientadmin-8" title="Nastavení" subtitle="Jak podnik vidí hosté a co u něj můžou dělat." primary={<Button type="submit" variant="accent" loading={busy}>Uložit</Button>} />
      <Card className="space-y-4">
        <ul className="list">
          <SwitchRow title="Zapnout pro hosty" hint="Podnik se ukáže na své adrese a hosté se k němu můžou přidat." checked={!!p.enabled} onChange={v => setP({ ...p, enabled: v })} />
        </ul>
        <Field id="s-slug" label="Veřejná adresa" hint={<span className="break-all">{d.url}</span>}>
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-sm text-black/50">/client/</span>
            <Input id="s-slug" value={p.slug} onChange={e => setP({ ...p, slug: e.target.value })} className="flex-1 min-w-[10rem] !w-auto" />
            <Button type="button" variant="secondary" size="sm" icon="copy" onClick={copy}>Kopírovat</Button>
          </div>
        </Field>
        {!hoursOk && <p className="note note-wait">Podnik nemá vyplněnou otevírací dobu (Rozvrh → Otevírací doba). Bez ní hosté nemůžou rezervovat.</p>}
      </Card>
      <Card className="grid gap-4">
        <h2 className="t-card">Nabídka pro hosty</h2>
        <Field id="s-menu" label="Které menu se hostům ukáže" hint="Nabídku spravuješ v záložce Menu. Logo, fotky a text o podniku najdeš ve Vzhledu.">
          <Select id="s-menu" value={p.menu_slug ?? ''} onChange={e => setP({ ...p, menu_slug: e.target.value })}>
            <option value="">První zapnuté menu</option>
            {boards.map((b: any) => (
              <option key={b.slug} value={b.slug}>{b.name}{b.items > 0 ? ` — ${b.linked} z ${b.items} položek se tiskne na kase` : ' — zatím prázdné'}</option>
            ))}
          </Select>
        </Field>
        {p.ordering_on && vybrane && chybi > 0 && (
          <p className="note note-wait">
            V menu „{vybrane.name}" nemá {czCount(chybi, { one: 'položka', few: 'položky', many: 'položek' })} produkt v pokladně. Objednávka, ve které taková položka bude, se do Storyous nepošle a na terminálu se nevytiskne — spáruj je v záložce Menu.
          </p>
        )}
      </Card>
      <Card className="grid gap-4">
        <h2 className="t-card">Rezervace a objednávky</h2>
        <ul className="list">
          <SwitchRow title="Hosté můžou rezervovat" checked={!!p.reservations_on} onChange={v => setP({ ...p, reservations_on: v })} />
          <SwitchRow title="Hosté můžou objednávat od stolu" hint="Objednávky potřebují stoly (záložka Stoly) a nabídku z Menu. S napojenou pokladnou jdou přijaté objednávky rovnou na stůl v kase."
            checked={!!p.ordering_on} onChange={v => setP({ ...p, ordering_on: v })} />
        </ul>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field id="s-party" label="Nejvíc osob"><Input id="s-party" type="number" min={1} max={40} value={p.max_party} onChange={e => setP({ ...p, max_party: e.target.value })} /></Field>
          <Field id="s-lead" label="Dní dopředu"><Input id="s-lead" type="number" min={1} max={180} value={p.lead_days} onChange={e => setP({ ...p, lead_days: e.target.value })} /></Field>
          <Field id="s-slot" label="Krok (min)"><Input id="s-slot" type="number" min={15} max={120} step={15} value={p.slot_minutes} onChange={e => setP({ ...p, slot_minutes: e.target.value })} /></Field>
        </div>
      </Card>
      <Card className="grid gap-4">
        <div>
          <h2 className="t-card">Ochrana objednávek od stolu</h2>
          <p className="t-meta mt-0.5">Aby objednával jen ten, kdo u stolu opravdu sedí. Dvě nezávislé stopy: QR kód na stole a poloha telefonu.</p>
        </div>
        <ul className="list">
          <SwitchRow title="Objednat jde jen přes QR kód na stole" hint="Každý stůl má v QR svůj tajný kód (Stoly → QR na stůl). Odkaz z domova nebo ručně vybraný stůl neprojde."
            checked={p.order_qr_required !== false} onChange={v => setP({ ...p, order_qr_required: v })} />
        </ul>
        <Field id="s-geo" label="Poloha hosta">
          <Select id="s-geo" value={p.order_geo ?? 'block'} onChange={e => setP({ ...p, order_geo: e.target.value })}>
            <option value="block">Blokovat objednávky mimo podnik</option>
            <option value="warn">Jen upozornit obsluhu, objednávku nechat čekat</option>
            <option value="off">Neověřovat</option>
          </Select>
        </Field>
        {p.order_geo !== 'off' && !hasCoords && <p className="note note-wait">Poloha podniku není nastavená, ověření polohy zatím neběží. Stoupni si v podniku s telefonem a klepni na „Použít moji polohu".</p>}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
          <Field id="s-lat" label="Zeměpisná šířka"><Input id="s-lat" inputMode="decimal" value={p.lat ?? ''} onChange={e => setP({ ...p, lat: e.target.value })} placeholder="49.1951" /></Field>
          <Field id="s-lng" label="Zeměpisná délka"><Input id="s-lng" inputMode="decimal" value={p.lng ?? ''} onChange={e => setP({ ...p, lng: e.target.value })} placeholder="16.6068" /></Field>
          <Button type="button" variant="secondary" icon="location" loading={locating} onClick={useMyPosition}>Použít moji polohu</Button>
        </div>
        <Field id="s-radius" label="Poloměr (m)" hint="K poloměru se přičítá přesnost telefonu (nejvýš 50 m). Sto metrů pokryje podnik i zahrádku.">
          <Input id="s-radius" type="number" min={30} max={1000} step={10} className="!w-36" value={p.geo_radius_m ?? 100} onChange={e => setP({ ...p, geo_radius_m: e.target.value })} />
        </Field>
        <ul className="list">
          <SwitchRow title="Ověřené objednávky posílat rovnou do pokladny"
            hint="S QR i polohou v pořádku jde objednávka bez čekání na stůl v kase a terminál Storyous ji vytiskne podle svého nastavení tiskáren. Neověřené čekají na přijetí obsluhou."
            checked={p.order_auto_pos !== false} onChange={v => setP({ ...p, order_auto_pos: v })} />
        </ul>
      </Card>
    </form>
    <DataZKarticky oznam={oznam} onZmena={onChange} />
    </div>
  );
}

/** Nastavení → Data: přenos členů a pravidel z Kartičky (jen s oprávněním Import členů). */
function DataZKarticky({ oznam, onZmena }: { oznam: Hlaska; onZmena: () => void }) {
  const imp = useImportKarticky(oznam, onZmena);
  if (!imp.smi) return null;
  return (
    <Card className="grid gap-3" aria-labelledby="s-karticka">
      <div>
        <h2 id="s-karticka" className="t-card">{PRECHOD_OTAZKA}</h2>
        <p className="t-meta mt-0.5 text-pretty">{PRECHOD_POPIS}</p>
      </div>
      <div>
        <Button type="button" variant="secondary" icon="upload" className="max-sm:w-full" onClick={imp.otevri}>{PRECHOD_TLACITKO}</Button>
      </div>
      {imp.okno}
    </Card>
  );
}

