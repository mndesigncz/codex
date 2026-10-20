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
  Badge, BarSpark, Button, Card, Chip, DraftNote, EmptyState, ErrorBoundary, ErrorState, Field, Input, ListRow, Menu, Modal, MonthNav, PageHeader,
  ObdobiLista, PersonChip, SearchField, Segmented, Select, Skeleton, Stat, StatRow, SwitchRow, Textarea, Toast, useLoad, type MenuItem,
} from '../ui';
import { Dock } from '../ui/Dock';
import StaffInbox, { ORDER_STATUS } from './StaffInbox';
import MobileMoreSheet from '../MobileMoreSheet';
import FloorPlanEditor from './FloorPlanEditor';
import QrDesigner from './QrDesigner';
import BrandTab from './BrandTab';
import LoyaltyTabs, { LOYALTY_SUBS, type LoyaltySub } from './LoyaltyTabs';
import PrechodZKarticky, { PRECHOD_TLACITKO, PRECHOD_OTAZKA, PRECHOD_POPIS, useImportKarticky } from './PrechodZKarticky';
import ClenoveSprava from './loyalty/ClenoveSprava';
import ZpravyRozeslani from './loyalty/ZpravyRozeslani';
import Automatizace from './loyalty/Automatizace';
import KuponVybranym from './loyalty/KuponVybranym';
import type { VyberHostu } from './loyalty/ClenoveHromadne';
import MenuEditor from '../employer/MenuEditor';
import EventsView from '../employer/EventsView';
import {
  czDay, dayKey, denProZapis, NEDORAZENI_LIMIT, nedorazilNaRade, nejdriveDnes, RES_STATUS, RUCNI_MAX_JMENO, RUCNI_MAX_POZNAMKA, RUCNI_MAX_TELEFON, slotsFor, validujRucniRezervaci, vOteviraciDobe,
  type PoleRucni,
} from '@/lib/clientSlots';
import { dayPlus, dbTimeDayHM, dbTimeHM, parseDbTime, pragueDaySafe, pragueHM, pragueToday } from '@/lib/pragueTime';
import { obdobiZPresetu, platneRozmezi, type Obdobi as ObdobiHistorie } from '@/lib/obdobi';
import { odsazeniMesice, zacatekTydne, zkratkyDnu } from '@/lib/week';
import { useCurrency, useMoney, usePrice } from '../CurrencyProvider';
import { useDraft, type Koncept } from '@/lib/useDraft';
import { czCount, type CzNoun } from '@/lib/czech';
import { apiMessage } from '@/lib/api';
import { NOTE_MAX } from '@/lib/poznamkyHosta';
import type { Navigace } from '@/lib/widgety/typy';
import {
  TON_REZERVACE, dobaObjednavky, FILTRY_HODNOCENI, filtrujHodnoceni, HLEDANI_MIN, hlavniKrok, jeNevyrizene, klicPrechodu, muzeDo, nabidkaNedorazil, ODPOVED_MAX, odkazTel,
  poctyHodnoceni, poDnech, polozkyKratce, prumerCesky, souhrnDneRezervaci, varovaniHosta, vyberCleny, vyberHistoriiObjednavek, vyberHodnoceni, vyberMesicRezervaci, vyberRezervace,
  type FiltrHodnoceni, type NastaveniZapisu, type Recenze, type Rezervace, type StavRezervace, type Stul,
} from '@/lib/klientPrehled';
import { useOpravneni } from '../role/useOpravneni';
import { NavigaceKontext, useNavigace, useSmi } from '../widgety/NavigaceKontext';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { otevriNaTisk, otevriVeSystemu } from '@/lib/stahni';
import PromoKody from './loyalty/KuponyPromo';
import KartickySprava from './KartickySprava';

// Nastavení účtu v okně: stejná obrazovka jako v administraci (profil, vzhled a jazyk, oznámení, zabezpečení),
// jen se stahuje až při otevření, ať ho Client nenese s každým načtením.
const NastaveniUctu = dynamic(() => import('../Settings'), { loading: () => <div className="flex items-center justify-center h-48"><div className="spinner" /></div> });

type Tab = 'overview' | 'reservations' | 'orders' | 'tables' | 'menu' | 'events' | 'customers' | 'loyalty' | 'cards' | 'brand' | 'settings';

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
  // Fyzické kartičky (spuštění, balík C): dávky k tisku, karty, blokace a náhrada (KartickySprava).
  { id: 'cards', label: 'Kartičky', icon: 'card', klice: ['vernost.zobrazit'] },
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
  { title: 'Hosté', ids: ['customers', 'loyalty', 'cards'] },
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
const HOTOVA: CzNoun = { one: 'hotové', few: 'hotových', many: 'hotových' };

async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, init ? { headers: JSON_HLAVICKA, ...init } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Nepovedlo se.');
  return d;
}

type AkceHlasky = { label: string; onClick: () => void };
/** Potvrzení dole uprostřed; `akce` přidá tlačítko (třeba „Vrátit“ po „Nedorazil“). */
type Hlaska = (text: string, ton?: 'ok' | 'bad', akce?: AkceHlasky) => void;

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
  // Každé hlášení má nové id: stejný text dvakrát po sobě („Novák: nedorazil.") jinak dostane jen zbytek času prvního.
  const [hlaska, setHlaska] = useState<{ id: number; text: string; ton: 'ok' | 'bad'; akce?: AkceHlasky } | null>(null);
  const oznam: Hlaska = useCallback((text, ton = 'ok', akce) => setHlaska({ id: Date.now(), text, ton, akce }), []);
  // Jméno hosta z rezervace otevře Zákazníky s předvyplněným hledáním.
  const [hledatHosta, setHledatHosta] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  const [ucetOtevren, setUcetOtevren] = useState(false);
  const prejdi = useCallback((t: Tab) => { setVolba(t); setMoreOpen(false); }, []);
  // Odkaz z průvodce přechodem z Kartičky umí otevřít rovnou část Věrnosti (Kupony, Poukazy…).
  const [castVernosti, setCastVernosti] = useState<{ id: LoyaltySub; n: number } | null>(null);
  const otevriHosta = useCallback((q: string) => { setHledatHosta(q); prejdi('customers'); }, [prejdi]);
  // Stránka pro hosty: v aplikaci Managero je /client zavřené (lib/obal.ts ho přesměruje na úvod), takže
  // window.open s relativní cestou skončil na přehledu. Celá adresa v prohlížeči uvnitř aplikace (web: nová záložka).
  const strankaProHosty = () => { if (souhrn?.slug) otevriVeSystemu(`/client/${encodeURIComponent(souhrn.slug)}`); };

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
            {/* Název části jen pro odečítač (jako lišta administrace): vidět je
                jednou, jako h1 obrazovky. Dřív tu stál podruhé („Kartičky / Kartičky"). */}
            <p className="sr-only">{aktivni.label}</p>
            <div className="flex-1 min-w-0" />
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
                {tab === 'cards' && <KartickySprava oznam={oznam} />}
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
        <Toast id={hlaska?.id} message={hlaska?.text ?? null} tone={hlaska?.ton} action={hlaska?.akce} onClose={() => setHlaska(null)} />
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
//
// Kolo 8 (R8-7) — obsluha řeší rezervace z telefonu u dveří:
//  - hledání podle jména nebo telefonu (ve všech rezervacích přes API) a skok na den
//    kalendářem (dny s rezervacemi nesou počet); nadpis dne říká kolik rezervací, osob a špičku;
//  - „Nedorazil" jedním klepnutím půl hodiny po čase rezervace (dřív jen v „···"), s Vrátit
//    v toastu; host, který nedorazil, má u dalších rezervací Chip „2× nedorazil";
//  - skupiny hosta a varovná poznámka (alergie) pod jménem, klepnutí na jméno otevře okno
//    Host s návštěvami, útratou, nedorazeními a poznámkami — bez odchodu ze stránky;
//  - Minulé nejsou tiše uříznuté: „Zobrazeno 100 z 240 · Načíst další" a filtr „Nedorazili".

type Obdobi = 'today' | 'upcoming' | 'past';

const REZERVACE: CzNoun = { one: 'rezervace', few: 'rezervace', many: 'rezervací' };
const NAVSTEVA: CzNoun = { one: 'návštěva', few: 'návštěvy', many: 'návštěv' };
/** O kolik řádků se Minulé prodlouží po „Načíst další". */
const STRANKA_MINULYCH = 100;
/** Nejvíc štítků skupin v řádku; zbytek je „+N". */
const SKUPIN_V_RADKU = 2;

function RezervaceStranka({ oznam, onZmena, otevriHosta }: { oznam: Hlaska; onZmena: () => void; otevriHosta?: (q: string) => void }) {
  // Viditelnost tlačítek podle `ma` (před načtením oprávnění ANO, rozhoduje server);
  // přísné useSmi jen tam, kde se podle klíče posílá dotaz (spec §1.5).
  const { ma: smi } = useOpravneni();
  const [obdobi, setObdobi] = useState<Obdobi>('upcoming');
  // Skok na den a hledání mají přednost před obdobím; přepnutí období je zruší.
  const [den, setDen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [hledano, setHledano] = useState('');
  useEffect(() => { const t = setTimeout(() => setHledano(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const hleda = hledano.length >= HLEDANI_MIN;
  const [limit, setLimit] = useState(STRANKA_MINULYCH);
  const [jenNedorazili, setJenNedorazili] = useState(false);
  const [kalendar, setKalendar] = useState(false);
  const [hostOkno, setHostOkno] = useState<Rezervace | null>(null);
  const url = hleda ? `/api/client/admin/reservations?q=${encodeURIComponent(hledano)}`
    : den ? `/api/client/admin/reservations?date=${den}`
    : obdobi === 'past' ? `/api/client/admin/reservations?range=past&limit=${limit}${jenNedorazili ? '&status=no_show' : ''}`
    : `/api/client/admin/reservations?range=${obdobi}`;
  const data = useDataWidgetu(url, vyberRezervace);
  const { reload } = data;
  const [pracuji, setPracuji] = useState<number | null>(null);
  const [odmitam, setOdmitam] = useState<Rezervace | null>(null);
  const [stulPro, setStulPro] = useState<{ r: Rezervace; stul: string } | null>(null);
  const usazuje = smi('rezervace.usadit');
  // Ruční zápis (telefon, u dveří): rezervace vzniká rovnou potvrzená, proto jen s rezervace.schvalovat.
  const zapisuje = smi('rezervace.schvalovat');
  const dnes = pragueToday();
  // „Teď" pro nabídku „Nedorazil" (půl hodiny po čase rezervace) — jednou za načtení, ne při každém vykreslení.
  const [ted, setTed] = useState(() => pragueHM());
  useEffect(() => { const t = setInterval(() => setTed(pragueHM()), 60_000); return () => clearInterval(t); }, []);
  const [novaOtevrena, setNovaOtevrena] = useState(false);
  const [form, setForm] = useState<FormRezervace>(() => prazdnaRezervace(dnes));
  // Rozepsaná rezervace přežije přechod na jinou záložku; po návratu se okno otevře samo (DESIGN „Rozepsané přežije…").
  // Rozepsané je jen psaný text (jméno, telefon, poznámka): bez něj se nic neukládá — okno samo předvybere
  // čas a samotný den nebo počet osob nejsou práce, kvůli které by se mělo příště otevírat samo.
  const maText = !!(form.jmeno.trim() || form.telefon.trim() || form.poznamka.trim());
  const konceptHodnota = useMemo<KonceptRezervace>(() => (maText
    ? { jmeno: form.jmeno, telefon: form.telefon, poznamka: form.poznamka, datum: form.datum, osob: form.osob, stul: form.stul, hostId: form.hostId, hostJmeno: form.hostJmeno }
    : konceptZFormulare(prazdnaRezervace(dnes))), [maText, form.jmeno, form.telefon, form.poznamka, form.datum, form.osob, form.stul, form.hostId, form.hostJmeno, dnes]);
  const koncept = useDraft('rezervace-nova', konceptHodnota, v => setForm(f => ({ ...f, ...v })),
    { vychozi: konceptZFormulare(prazdnaRezervace(dnes)), aktivni: novaOtevrena });
  useEffect(() => { if (koncept.cekaKoncept && zapisuje) setNovaOtevrena(true); }, [koncept.cekaKoncept, zapisuje]);
  const zavriNovou = () => { koncept.zahodit(); setForm(prazdnaRezervace(pragueToday())); setNovaOtevrena(false); };
  const zapsano = () => {
    koncept.hotovo();
    setForm(prazdnaRezervace(pragueToday()));
    setNovaOtevrena(false);
    oznam('Rezervace zapsána.');
    reload();
    if (url !== URL_REZERVACE_DNES) obnovDataWidgetu(URL_REZERVACE_DNES);
    onZmena();
  };

  const zmenit = async (r: Rezervace, telo: { status?: StavRezervace; tableId?: number | null }) => {
    setPracuji(r.id);
    try {
      const x = await j('/api/client/admin/reservations', { method: 'PATCH', body: JSON.stringify({ id: r.id, ...telo }) });
      if (x.posNote) oznam(x.posNote);
      else if (x.loyalty?.rewarded) oznam('Hotovo. Host nasbíral všechna razítka a má odměnu.');
      // Omyl u dveří jde vzít zpět z toastu — host dorazil o chvíli později.
      else if (telo.status === 'no_show') oznam(`${r.host}: nedorazil.`, 'ok', { label: 'Vrátit', onClick: () => { void zmenit(r, { status: 'confirmed' }); } });
      else if (telo.status) oznam(`${r.host}: ${(RES_STATUS[x.status ?? telo.status]?.label ?? telo.status).toLocaleLowerCase('cs-CZ')}.`);
      else oznam('Stůl uložen.');
    } catch (e) { oznam(apiMessage(e, 'Rezervaci se nepodařilo změnit.'), 'bad'); }
    setPracuji(null);
    reload();
    // Dnešní rezervace a odznaky stojí na jiných adresách — ať se nerozjedou.
    if (url !== URL_REZERVACE_DNES) obnovDataWidgetu(URL_REZERVACE_DNES);
    onZmena();
  };
  const vyberObdobi = (o: Obdobi) => { setObdobi(o); setDen(null); setQ(''); setHledano(''); setJenNedorazili(false); setLimit(STRANKA_MINULYCH); };
  const vyberDen = (d: string) => { setDen(d); setQ(''); setHledano(''); setKalendar(false); };

  const rezervace = data.data?.rezervace ?? [];
  const dny = poDnech(rezervace);
  const stoly = data.data?.stoly ?? [];
  const celkem = data.data?.celkem ?? rezervace.length;
  const minule = data.data?.minule ?? null;
  const vMinulych = obdobi === 'past' && !den && !hleda;
  const prazdno = hleda
    ? <EmptyState icon="search" compact title={`Nikdo takový — „${hledano}“`} hint="Zkus část jména, nebo jen číslice telefonu." />
    : den
    ? <EmptyState icon="calendarCheck" compact title={`${czDay(den, true)}: žádné rezervace`} hint="Pro tenhle den není nic zapsané." />
    : vMinulych && jenNedorazili
    ? <EmptyState icon="calendarCheck" compact title="Nikdo nenedorazil" hint="Rezervace označené „Nedorazil“ se objeví tady." />
    : <EmptyState icon="calendarCheck" compact title={obdobi === 'past' ? 'Žádné minulé rezervace' : 'Zatím žádné rezervace'}
        hint={obdobi === 'past' ? undefined : 'Objeví se tu, jakmile si host zarezervuje stůl na tvé stránce.'} />;
  // Hledání a skok na den jsou tam, kde je člověk hledá: první řádek nástroje, nad seznamem.
  const lista = (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SearchField value={q} onChange={setQ} placeholder="Jméno nebo telefon" ariaLabel="Hledat rezervaci podle jména nebo telefonu" className="flex-1 min-w-0" />
        <Button variant={den ? 'primary' : 'secondary'} icon="calendar" className="shrink-0 cz-sentence" aria-haspopup="dialog" aria-label={den ? `Vybraný den ${czDay(den, true)}; změnit den` : 'Vybrat den v kalendáři'}
          onClick={() => setKalendar(true)}>{den ? czDay(den) : 'Den'}</Button>
        {den && <Button variant="ghost" iconOnly icon="close" className="shrink-0" aria-label="Zrušit výběr dne" onClick={() => setDen(null)} />}
      </div>
      {/* Filtrovací pás jen, když je co filtrovat (DESIGN „Filtrovací pás"). */}
      {vMinulych && minule && minule.nedorazeni > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scroll-fade-x" role="group" aria-label="Filtr minulých rezervací">
          <button type="button" aria-pressed={!jenNedorazili} onClick={() => setJenNedorazili(false)}
            className={`filter-pill tap-target-sm tabular-nums ${!jenNedorazili ? 'seg-on' : 'seg-off glass'}`}>Vše · {minule.celkem}</button>
          <button type="button" aria-pressed={jenNedorazili} onClick={() => setJenNedorazili(v => !v)}
            className={`filter-pill tap-target-sm tabular-nums ${jenNedorazili ? 'seg-on' : 'seg-off glass'}`}>Nedorazili · {minule.nedorazeni}</button>
        </div>
      )}
      {hleda && data.data && rezervace.length > 0 && (
        <p className="t-meta tabular-nums" role="status">
          {czCount(celkem, REZERVACE)} pro „{hledano}“{celkem > rezervace.length ? ` · zobrazeno prvních ${rezervace.length}, upřesni hledání` : ''}
        </p>
      )}
    </div>
  );
  const seznam = data.error ? <ErrorState title="Rezervace se nenačetly" onRetry={reload} detail={data.error} />
    : !data.data ? <PageSkel />
    : dny.length === 0 ? <Card>{prazdno}</Card>
    : (
      <div className="space-y-4">
        {dny.map(([datum, radky]) => {
          const s = souhrnDneRezervaci(radky);
          return (
          <Card key={datum} pad="none" aria-labelledby={`rez-${datum}`}>
            <h2 id={`rez-${datum}`} className="t-card cz-sentence px-5 pt-4">
              {czDay(datum, true)}{' '}
              {/* Den, kde nic neproběhlo (jen zrušené a nedorazivší), říká jen počet řádků — „0 osob" by mátlo. */}
              <span className="text-black/40 font-medium tabular-nums">· {s.pocet > 0 ? `${czCount(s.pocet, REZERVACE)} · ${czCount(s.osob, OSOBA)}${s.spicka ? ` · špička ${s.spicka}` : ''}` : czCount(radky.length, REZERVACE)}</span>
            </h2>
            <ul className="list px-5 pb-1">
              {radky.map(r => {
                const krok = hlavniKrok(r.stav, smi);
                const konec = ['done', 'declined', 'cancelled', 'no_show'].includes(r.stav);
                const tel = odkazTel(r.telefon);
                const nedorazil = nabidkaNedorazil(r, smi, nedorazilNaRade(r, dnes, ted));
                const dalsi: MenuItem[] = [
                  ...(krok?.na === 'seated' && muzeDo(r.stav, 'done') && smi(klicPrechodu('done'))
                    ? [{ label: 'Rovnou hotovo', icon: 'check', onClick: () => { void zmenit(r, { status: 'done' }); } }] : []),
                  ...(nedorazil === 'menu' ? [{ label: 'Nedorazil', icon: 'close', hint: 'Host nepřišel. Další rezervace se mu po dvou nedorazeních nepotvrdí sama.', onClick: () => { void zmenit(r, { status: 'no_show' }); } }] : []),
                  ...(r.stav === 'no_show' && muzeDo(r.stav, 'confirmed') && smi(klicPrechodu('confirmed', r.stav))
                    ? [{ label: 'Vrátit na potvrzeno', icon: 'undo', hint: 'Omyl, nebo host dorazil později.', onClick: () => { void zmenit(r, { status: 'confirmed' }); } }] : []),
                  ...(usazuje && !konec ? [{ label: r.stul ? 'Změnit stůl…' : 'Přidělit stůl…', icon: 'location', onClick: () => setStulPro({ r, stul: r.stulId ? String(r.stulId) : '' }) }] : []),
                  ...(tel ? [{ label: 'Zavolat hostovi', icon: 'chat', onClick: () => { window.location.href = tel; } }] : []),
                  ...(r.email ? [{ label: 'Napsat e-mail', icon: 'mail', onClick: () => { window.location.href = `mailto:${r.email}`; } }] : []),
                  ...(r.hostId ? [{ label: 'Karta hosta…', icon: 'user', onClick: () => setHostOkno(r) }] : []),
                  ...(otevriHosta ? [{ label: 'Otevřít v Zákaznících', icon: 'users', onClick: () => otevriHosta(r.host) }] : []),
                  ...(muzeDo(r.stav, 'declined') && smi(klicPrechodu('declined'))
                    ? [{ label: 'Odmítnout rezervaci…', icon: 'close', danger: true, hint: 'Host dostane zprávu, že se to nepovedlo.', onClick: () => setOdmitam(r) }] : []),
                ];
                return (
                  <ListRow key={r.id} value={r.cas} title={<JmenoHosta r={r} onOtevrit={r.hostId ? () => setHostOkno(r) : undefined} />}
                    meta={<>
                      {czCount(r.osob, OSOBA)} · {r.stul ?? 'bez stolu'}
                      {r.rucne && <> · <Chip tone="muted" size="sm">zapsáno ručně</Chip></>}
                      {/* Host odpověděl na ranní připomínku — obsluha ví, že s ním může počítat. */}
                      {r.hostPotvrdil && !konec && <> · <Chip tone="ok" size="sm" icon="check">host potvrdil</Chip></>}
                    </>}
                    // Kontakt a poznámka hosta jsou to, co obsluha u dveří potřebuje celé — `detail`
                    // se zalamuje, `meta` by poznámku na telefonu uřízl na „Oslav…".
                    detail={detailRezervace(r)}
                    right={<Chip tone={TON_REZERVACE[r.stav]} size="sm">{RES_STATUS[r.stav]?.label ?? r.stav}</Chip>}
                    actions={krok || nedorazil === 'tlacitko' || dalsi.length ? (
                      <>
                        {krok && (
                          <Button size="sm" variant="primary" loading={pracuji === r.id} onClick={() => { void zmenit(r, { status: krok.na }); }}
                            aria-label={`${krok.popisek}: ${r.host}, ${r.cas}`}>{krok.popisek}</Button>
                        )}
                        {/* Půl hodiny po čase rezervace: „Nedorazil" vedle „Usadit" — jedno klepnutí u dveří. */}
                        {nedorazil === 'tlacitko' && (
                          <Button size="sm" variant="secondary" icon="close" loading={pracuji === r.id} onClick={() => { void zmenit(r, { status: 'no_show' }); }}
                            aria-label={`Nedorazil: ${r.host}, ${r.cas}`}>Nedorazil</Button>
                        )}
                        {dalsi.length > 0 && <Menu size="sm" label={`Další akce s rezervací ${r.host}`} items={dalsi} />}
                      </>
                    ) : undefined} />
                );
              })}
            </ul>
          </Card>
          );
        })}
        {/* Oříznutý seznam to musí říct (DESIGN „Ořezané seznamy"). */}
        {vMinulych && celkem > rezervace.length && (
          <Card pad="sm" className="flex items-center justify-between gap-3 flex-wrap">
            <p className="t-meta tabular-nums">Zobrazeno {rezervace.length} z {celkem}</p>
            <Button size="sm" variant="secondary" icon="download" onClick={() => setLimit(l => l + STRANKA_MINULYCH)}>Načíst další</Button>
          </Card>
        )}
      </div>
    );
  const nastroj = <div className="space-y-4">{lista}{seznam}</div>;

  return (
    <>
      <PlochaWidgetu
        stranka="vedeni.klient_rezervace"
        hlavicka={{
          title: 'Rezervace',
          hintId: 'clientadmin-5',
          subtitle: 'Požadavky potvrď nebo odmítni; při příchodu hosty usaď — s napojenou pokladnou se rovnou otevře účet na stole. Kdo nepřišel, dostane „Nedorazil“.',
          primary: zapisuje ? <Button variant="accent" icon="plus" onClick={() => setNovaOtevrena(true)}>Nová rezervace</Button> : undefined,
          aside: <Segmented options={[{ id: 'today', label: 'Dnes' }, { id: 'upcoming', label: 'Nadcházející' }, { id: 'past', label: 'Minulé' }]}
            value={(den || hleda ? '' : obdobi) as Obdobi} onChange={vyberObdobi} size="sm" ariaLabel="Období" />,
        }}
        nastroj={nastroj}
      />
      {kalendar && <KalendarRezervaci den={den ?? dnes} dnes={dnes} onVybrat={vyberDen} onZavrit={() => setKalendar(false)} />}
      {hostOkno && hostOkno.hostId && (
        <HostOkno r={hostOkno} hostId={hostOkno.hostId} oznam={oznam} onZavrit={() => setHostOkno(null)} onZmena={reload}
          otevriHosta={otevriHosta ? () => { setHostOkno(null); otevriHosta(hostOkno.host); } : undefined} />
      )}
      {novaOtevrena && (
        <NovaRezervaceOkno form={form} setForm={setForm} koncept={koncept} zapis={data.data?.zapis ?? null} stoly={stoly}
          onZavrit={zavriNovou} onZapsano={zapsano} />
      )}
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

/**
 * Třetí řádek rezervace: skupiny hosta a varovná poznámka (alergie), telefon na klepnutí
 * (jinak e-mail) a celá poznámka hosta. Kontakt přijde jen se zakaznici.kontakty — bez něj
 * API telefon ani e-mail nepošle; skupiny a poznámky jen se zakaznici.zobrazit / zakaznici.poznamky.
 */
function detailRezervace(r: Rezervace): React.ReactNode {
  const tel = odkazTel(r.telefon);
  const varovani = varovaniHosta(r.poznamky);
  const stitky = r.skupiny.length > 0 || !!varovani;
  // Poslední poznámka personálu se pod varováním neopakuje, když je to tatáž věta.
  const poznamkaPersonalu = r.poznamkaPersonalu && r.poznamkaPersonalu !== varovani ? r.poznamkaPersonalu : null;
  if (!tel && !r.email && !r.poznamka && !poznamkaPersonalu && !stitky) return undefined;
  return (
    <>
      {stitky && (
        <span className="flex flex-wrap items-center gap-1 mb-0.5">
          {varovani && <Chip tone="wait" size="sm" icon="warning" className="max-w-full"><span className="truncate"><span className="sr-only">Pozor: </span>{varovani}</span></Chip>}
          {r.skupiny.slice(0, SKUPIN_V_RADKU).map(g => <Chip key={g.nazev} tone="muted" size="sm" icon="tag">{g.nazev}</Chip>)}
          {r.skupiny.length > SKUPIN_V_RADKU && <Chip tone="muted" size="sm" className="tabular-nums">+{r.skupiny.length - SKUPIN_V_RADKU}</Chip>}
        </span>
      )}
      {tel ? (
        <a href={tel} className="tap-target inline-flex items-center font-medium text-[#16181A] tabular-nums underline decoration-black/25 underline-offset-2"
          aria-label={`Zavolat hostovi ${r.host}: ${r.telefon}`}>{r.telefon}</a>
      ) : r.email ? <span className="block truncate">{r.email}</span> : null}
      {r.poznamka && <span className="block text-black/70">„{r.poznamka}“</span>}
      {/* Poslední interní poznámka personálu (Zákazníci › Deník) — jiný hlas než host, proto kurzívou s ikonou. */}
      {poznamkaPersonalu && (
        <span className="flex items-start gap-1.5 italic text-black/60">
          <Icon name="pencil" size={13} className="shrink-0 mt-0.5" />
          <span className="min-w-0"><span className="sr-only">Poznámka personálu: </span>{poznamkaPersonalu}</span>
        </span>
      )}
    </>
  );
}

/**
 * Jméno hosta a kdo to je: štítek úrovně jako v Zákaznících › Členové, „1. návštěva" u člena, který jde
 * poprvé, a „2× nedorazil" u hosta, který nepřišel. S účtem je jméno klepnutí na kartu hosta.
 */
function JmenoHosta({ r, onOtevrit }: { r: Rezervace; onOtevrit?: () => void }) {
  const jmeno = onOtevrit
    ? <button type="button" onClick={onOtevrit} className="truncate text-left tap-target-sm underline decoration-black/20 underline-offset-2 hover:decoration-black/60"
        aria-label={`Karta hosta ${r.host}`}>{r.host}</button>
    : <span className="truncate">{r.host}</span>;
  const nedorazil = (r.nedorazeni ?? 0) > 0;
  if (!r.uroven && r.navstev !== 0 && !nedorazil) return jmeno;
  return (
    <span className="flex items-center gap-2 min-w-0">
      {jmeno}
      {r.uroven && <Chip tone={r.uroven.ton} size="sm">{r.uroven.label}</Chip>}
      {!r.uroven && r.navstev === 0 && <Chip tone="muted" size="sm">1. návštěva</Chip>}
      {nedorazil && <Chip tone="bad" size="sm" className="tabular-nums">{r.nedorazeni}× nedorazil</Chip>}
    </span>
  );
}

// ---- Kalendář: skok na den ---------------------------------------------------------
//
// „Mám u vás v sobotu stůl na Nováka?" — místo scrollování Nadcházejícími měsíc s tečkami:
// den s rezervacemi nese jejich počet. Na telefonu okno vyjede zdola (Modal to dělá sám).

function KalendarRezervaci({ den, dnes, onVybrat, onZavrit }: { den: string; dnes: string; onVybrat: (d: string) => void; onZavrit: () => void }) {
  const [mesic, setMesic] = useState(den.slice(0, 7));
  const { data: pocty, error, reload } = useLoad(`/api/client/admin/reservations?month=${mesic}`, vyberMesicRezervaci);
  // Pořadí dnů podle nastavení podniku (pondělí, nebo neděle) — jako každá mřížka v aplikaci (lib/week).
  const zacatek = zacatekTydne(useCurrency().weekStart);
  const [rok, m] = mesic.split('-').map(Number);
  const dniVMesici = new Date(Date.UTC(rok, m, 0)).getUTCDate();
  const prvni = odsazeniMesice(`${mesic}-01`, zacatek);
  const bunky: (string | null)[] = [...Array<null>(prvni).fill(null), ...Array.from({ length: dniVMesici }, (_, i) => `${mesic}-${String(i + 1).padStart(2, '0')}`)];
  while (bunky.length % 7) bunky.push(null);
  return (
    <Modal open onClose={onZavrit} size="sm" title="Skok na den" subtitle="Den s rezervacemi nese jejich počet."
      footer={<Button variant="secondary" onClick={onZavrit}>Zavřít</Button>}>
      <div className="space-y-3" data-transient>
        <MonthNav value={mesic} onChange={setMesic} />
        {error && <p className="note note-wait">Počty rezervací se nenačetly. <button type="button" className="underline" onClick={reload}>Zkusit znovu</button></p>}
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label={`Kalendář ${mesic}`}>
          {zkratkyDnu(zacatek).map(d => <span key={d} className="t-label text-center py-1" aria-hidden="true">{d}</span>)}
          {bunky.map((d, i) => {
            if (!d) return <span key={`p${i}`} aria-hidden="true" />;
            const n = pocty?.[d] ?? 0;
            const vybrany = d === den;
            return (
              <button key={d} type="button" onClick={() => onVybrat(d)} aria-pressed={vybrany}
                aria-label={`${czDay(d, true)}: ${n ? czCount(n, REZERVACE) : 'bez rezervací'}`}
                className={`tap-target flex flex-col items-center justify-center rounded-2xl min-h-12 py-1 text-sm font-medium tabular-nums transition ${vybrany ? 'seg-on' : 'seg-off glass'} ${d === dnes && !vybrany ? 'ring-1 ring-inset ring-black/30' : ''} ${d < dnes && !n ? 'opacity-50' : ''}`}>
                <span>{Number(d.slice(8))}</span>
                <span className={`t-label leading-none ${vybrany ? 'text-white/70' : n ? '' : 'invisible'}`}>{n || 0}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

// ---- Okno Host ------------------------------------------------------------------------
//
// Klepnutí na jméno v rezervaci: kdo to je (návštěvy, útrata, nedorazení, skupiny), všechny
// poznámky personálu a „Přidat poznámku" — bez odchodu ze stránky. Totéž, co detail člena
// v Zákaznících, jen to, co obsluha u dveří potřebuje.

interface PoznamkaHosta { id: number; body: string; created_at: string; autor: string | null }

function HostOkno({ r, hostId, oznam, onZavrit, onZmena, otevriHosta }: {
  r: Rezervace; hostId: number; oznam: Hlaska; onZavrit: () => void; onZmena: () => void; otevriHosta?: () => void;
}) {
  const money = useMoney();
  // Poznámky posílají dotaz jen s klíčem (spec §1.5) — bez něj se okno obejde tím, co nese řádek.
  const smiPrisne = useSmi();
  const poznamkuje = smiPrisne('zakaznici.poznamky');
  const { data: d, error, reload } = useLoad<{ notes: PoznamkaHosta[] }>(poznamkuje ? `/api/client/admin/notes?customerId=${hostId}` : null,
    raw => ({ notes: Array.isArray(raw?.notes) ? raw.notes : [] }));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const pridej = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      await j('/api/client/admin/notes', { method: 'POST', body: JSON.stringify({ customerId: hostId, body: t }) });
      setText(''); reload(); onZmena();
      oznam('Poznámka uložena. Host ji nevidí.');
    } catch (err) { oznam(apiMessage(err, 'Poznámku se nepodařilo uložit.'), 'bad'); }
    setBusy(false);
  };
  const nedorazeni = r.nedorazeni ?? 0;
  return (
    <Modal open onClose={onZavrit} size="md" title={r.host}
      subtitle={[r.uroven?.label ?? (r.navstev != null ? 'Člen' : null), r.navstev != null ? czCount(r.navstev, NAVSTEVA) : null].filter(Boolean).join(' · ') || 'Host s účtem'}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zavřít</Button>
        {otevriHosta && <Button variant="primary" icon="users" onClick={otevriHosta}>Otevřít v Zákaznících</Button>}
      </>}>
      <div className="space-y-4">
        {/* Čísla hosta jako Stat (ne ListRow s číslem v ocasu, které na telefonu padá pod popisek). */}
        <StatRow>
          <Stat label="Rezervace" value={r.rezervaciCelkem == null ? '–' : String(r.rezervaciCelkem)}
            note={r.rezervaciCelkem == null ? undefined : nedorazeni > 0 ? `${nedorazeni}× nedorazil` : 'vždy dorazil'} tone={nedorazeni > 0 ? 'bad' : undefined} />
          {r.navstev != null && <Stat label="Návštěvy" value={String(r.navstev)} note={r.utrata ? `útrata ${money(r.utrata)}` : undefined} />}
        </StatRow>
        {nedorazeni >= NEDORAZENI_LIMIT && <p className="note note-wait">Další rezervace se mu nepotvrdí sama — počká na tebe.</p>}
        {r.skupiny.length > 0 && (
          <div>
            <p className="t-label mb-1.5">Skupiny</p>
            <div className="flex flex-wrap gap-1">{r.skupiny.map(g => <Chip key={g.nazev} tone="muted" size="sm" icon="tag">{g.nazev}</Chip>)}</div>
          </div>
        )}
        {poznamkuje && (
          <div>
            <p className="t-label mb-1.5">Poznámky pro personál</p>
            {error ? <p className="note note-wait">Poznámky se nenačetly. <button type="button" className="underline" onClick={reload}>Zkusit znovu</button></p>
              : d === null ? <Skeleton className="h-8" />
              : d.notes.length === 0 ? <p className="t-meta mb-2">Zatím nic. Host poznámky nevidí.</p>
              : (
                <ul className="list mb-2" aria-label="Poznámky k hostovi">
                  {d.notes.map(n => (
                    <ListRow key={n.id} title={<span className="whitespace-normal break-words font-normal">{n.body}</span>}
                      meta={[dbTimeDayHM(n.created_at), n.autor].filter(Boolean).join(' · ')}
                      right={varovaniHosta([n.body]) ? <Chip tone="wait" size="sm" icon="warning">pozor</Chip> : undefined} />
                  ))}
                </ul>
              )}
            <form onSubmit={pridej} className="flex gap-2 items-end flex-wrap">
              <Textarea aria-label="Nová poznámka" rows={2} maxLength={NOTE_MAX} value={text} onChange={e => setText(e.target.value)}
                placeholder="Třeba: alergie na ořechy, nesnáší mléko" className="flex-1 basis-56" />
              <Button type="submit" size="sm" variant="secondary" icon="plus" loading={busy} disabled={!text.trim()}>Přidat poznámku</Button>
            </form>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---- Nová rezervace (ruční zápis) ------------------------------------------------
//
// Host zavolá nebo stojí u dveří: obsluha ho zapíše z telefonu nebo tabletu a rezervace
// vzniká rovnou potvrzená. Kontrola je stejná funkce jako na serveru
// (validujRucniRezervaci), čas smí být mimo nabízené sloty, ale v otevírací době.

type FormRezervace = {
  jmeno: string; telefon: string; datum: string; cas: string; jinyCas: boolean;
  osob: string; stul: string; poznamka: string;
  /** Napojený člen (0 = žádný) a jeho jméno pro štítek. */
  hostId: number; hostJmeno: string;
};
const prazdnaRezervace = (dnes: string): FormRezervace => ({
  jmeno: '', telefon: '', datum: dnes, cas: '', jinyCas: false, osob: '2', stul: '', poznamka: '', hostId: 0, hostJmeno: '',
});
/** Co se drží v konceptu: formulář bez času (ten okno předvybere samo podle dne). */
type KonceptRezervace = Omit<FormRezervace, 'cas' | 'jinyCas'>;
const konceptZFormulare = ({ cas: _cas, jinyCas: _jiny, ...zbytek }: FormRezervace): KonceptRezervace => zbytek;
const JINY_CAS = 'jiny';
/** „Jana Dvořáková" → „Jana D." pro štítek napojeného člena. */
const kratkeJmeno = (j: string) => { const c = j.trim().split(/\s+/); return c.length > 1 ? `${c[0]} ${c[c.length - 1][0]}.` : j.trim(); };

function NovaRezervaceOkno({ form, setForm, koncept, zapis, stoly, onZavrit, onZapsano }: {
  form: FormRezervace; setForm: React.Dispatch<React.SetStateAction<FormRezervace>>; koncept: Koncept;
  zapis: NastaveniZapisu | null; stoly: Stul[]; onZavrit: () => void; onZapsano: () => void;
}) {
  // Hledání členů posílá dotaz na Zákazníky — přísně podle klíče (spec §1.5), ne „ano, dokud nevíme".
  const smiPrisne = useSmi();
  const hledaClena = smiPrisne('zakaznici.zobrazit');
  const [q, setQ] = useState('');
  const [hledano, setHledano] = useState('');
  useEffect(() => { const t = setTimeout(() => setHledano(q.trim()), 300); return () => clearTimeout(t); }, [q]);
  const clenove = useLoad(hledaClena && !form.hostId && hledano.length >= 2
    ? `/api/client/admin/customers?q=${encodeURIComponent(hledano)}&limit=5` : null, vyberCleny);
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState<{ pole: PoleRucni | null; text: string } | null>(null);
  // „Teď" se bere jednou při otevření okna — volba „Teď (15:10)" nesmí pod rukama měnit hodnotu.
  const [ted] = useState(() => pragueHM());
  const dnes = pragueToday();
  const zitra = dayPlus(dnes, 1);
  const nejpozdeji = dayPlus(dnes, zapis?.dniDopredu ?? 30);
  const maxOsob = zapis?.maxOsob ?? 40;
  const jeDnes = form.datum === dnes;
  const den = /^\d{4}-\d{2}-\d{2}$/.test(form.datum) ? zapis?.hodiny?.[dayKey(form.datum)] : undefined;
  const zavreno = !!zapis && (!den || den.closed || !den.open || !den.close);
  const sloty = zapis ? slotsFor(zapis.hodiny, form.datum, zapis.krok, jeDnes ? nejdriveDnes(ted, 0) : undefined) : [];
  const nabidnoutTed = jeDnes && !!zapis && vOteviraciDobe(zapis.hodiny, form.datum, ted) && !sloty.includes(ted);
  const volby = [...(nabidnoutTed ? [ted] : []), ...sloty];
  const jiny = form.jinyCas || !zapis || volby.length === 0;
  const zmen = (cast: Partial<FormRezervace>) => { setForm(f => ({ ...f, ...cast })); if (chyba) setChyba(null); };
  // Po změně dne zvolit první nabízený čas (nebo nechat ruční čas, když je zadaný ručně). Funkční
  // aktualizace: efekt běží i ve chvíli, kdy koncept právě dosazuje rozepsané — starý `form` by ho přepsal.
  // Po zavíračce (nebo v zavřený den) nezačínat na dnešku, kde nejde nic vybrat: jednou, jakmile
  // je nastavení zápisu, předvybrat nejbližší den s volným časem. Jen výchozí dnešek bez ručního
  // času — rozepsaný jiný den nebo ručně zadaný čas zůstane.
  const denPredvybran = useRef(false);
  useEffect(() => {
    if (denPredvybran.current || !zapis) return;
    denPredvybran.current = true;
    const den = denProZapis(zapis.hodiny, dnes, zapis.krok, ted, nejpozdeji);
    if (den !== dnes) setForm(f => (f.datum === dnes && !f.jinyCas ? { ...f, datum: den } : f));
  }, [zapis, dnes, ted, nejpozdeji, setForm]);
  const klicVoleb = volby.join(',');
  useEffect(() => {
    if (!zapis || !klicVoleb) return;
    const nabidka = klicVoleb.split(',');
    setForm(f => (f.jinyCas || nabidka.includes(f.cas) ? f : { ...f, cas: nabidka[0] }));
  }, [form.datum, zapis, klicVoleb, setForm]);

  const telo = () => ({
    name: form.jmeno, phone: form.telefon, date: form.datum, time: form.cas, party: Number(form.osob),
    tableId: form.stul ? Number(form.stul) : null, note: form.poznamka, customerId: form.hostId || null,
  });
  const ulozit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (zapis) {
      const v = validujRucniRezervaci(telo(), { dnes, nejpozdeji, maxOsob, hodiny: zapis.hodiny });
      if (!v.ok) { setChyba({ pole: v.pole, text: v.chyba }); return; }
    }
    setBusy(true);
    try {
      const r = await fetch('/api/client/admin/reservations', { method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify(telo()) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setChyba({ pole: typeof x?.pole === 'string' ? x.pole as PoleRucni : null, text: x?.error || 'Rezervaci se nepodařilo zapsat.' }); return; }
      onZapsano();
    } catch {
      setChyba({ pole: null, text: 'Rezervace se nezapsala — vypadlo připojení. Zkus to prosím znovu.' });
    } finally {
      setBusy(false);
    }
  };
  const chybaPole = (pole: PoleRucni) => (chyba?.pole === pole ? chyba.text : undefined);
  const vyberClena = (c: { id: number; jmeno: string }) => {
    setForm(f => ({ ...f, hostId: c.id, hostJmeno: c.jmeno, jmeno: f.jmeno.trim() && f.jmeno !== f.hostJmeno ? f.jmeno : c.jmeno }));
    setQ(''); setHledano(''); setChyba(null);
  };

  return (
    <Modal open onClose={onZavrit} size="md" title="Nová rezervace"
      subtitle="Host zavolal nebo stojí u dveří. Rezervace bude rovnou potvrzená."
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button type="submit" form="rez-nova" variant="primary" icon="check" loading={busy}>Zapsat rezervaci</Button>
      </>}>
      <div className="space-y-4">
        <DraftNote koncept={koncept} />
        {chyba && !chyba.pole && <p className="note note-danger" role="alert">{chyba.text}</p>}
        {hledaClena && (
          form.hostId ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Chip tone="ink" icon="user">člen: {kratkeJmeno(form.hostJmeno)}</Chip>
              <Button type="button" size="sm" variant="ghost" icon="close" onClick={() => zmen({ hostId: 0, hostJmeno: '' })}
                aria-label={`Odpojit člena ${form.hostJmeno}`}>Odpojit</Button>
            </div>
          ) : (
            <div data-transient>
              <p className="field-label">Napojit na člena</p>
              <SearchField value={q} onChange={setQ} placeholder="Najít člena podle jména" ariaLabel="Najít člena" />
              {hledano.length >= 2 && (
                clenove.error ? <p className="t-meta mt-2">Členy se nepodařilo načíst. Rezervaci zapíšeš i bez napojení.</p>
                : !clenove.data ? <Skeleton className="h-11 mt-2" />
                : clenove.data.clenove.length === 0 ? <p className="t-meta mt-2">Nikdo takový mezi členy. Zapiš hosta jen jménem.</p>
                : (
                  <ul className="list mt-1" aria-label="Nalezení členové">
                    {clenove.data.clenove.map(c => (
                      <ListRow key={c.id} title={c.jmeno} meta={c.navstev ? `${c.navstev}× v podniku` : 'zatím nebyl'} onClick={() => vyberClena(c)} />
                    ))}
                  </ul>
                )
              )}
              {chybaPole('customerId') && <p role="alert" className="mt-1.5 text-xs text-[var(--bad-ink)]">{chybaPole('customerId')}</p>}
            </div>
          )
        )}
        <form id="rez-nova" onSubmit={ulozit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="rez-jmeno" label="Jméno" error={chybaPole('name')}>
              <Input id="rez-jmeno" value={form.jmeno} maxLength={RUCNI_MAX_JMENO} autoComplete="off" autoCapitalize="words"
                onChange={e => zmen({ jmeno: e.target.value })} placeholder="Jana Dvořáková" />
            </Field>
            <Field id="rez-tel" label="Telefon" error={chybaPole('phone')} hint={form.hostId ? 'Když ho člen má v profilu, vezme se odtamtud.' : undefined}>
              <Input id="rez-tel" type="tel" inputMode="tel" autoComplete="off" value={form.telefon} maxLength={RUCNI_MAX_TELEFON}
                onChange={e => zmen({ telefon: e.target.value })} placeholder="+420 776 221 004" />
            </Field>
          </div>
          <div className="space-y-2">
            <Segmented options={[{ id: 'dnes', label: 'Dnes' }, { id: 'zitra', label: 'Zítra' }]}
              value={jeDnes ? 'dnes' : form.datum === zitra ? 'zitra' : ''} size="sm" ariaLabel="Den rezervace"
              onChange={v => zmen({ datum: v === 'dnes' ? dnes : zitra, jinyCas: false })} />
            {/* Datum a čas sdílí řádek i na telefonu (DESIGN „Na telefonu nesmí prvek skončit v půlce"). */}
            <div className="grid grid-cols-2 gap-3 items-start">
              <Field id="rez-den" label="Den" error={chybaPole('date')}>
                <Input id="rez-den" type="date" min={dnes} max={nejpozdeji} value={form.datum}
                  onChange={e => zmen({ datum: e.target.value || dnes, jinyCas: false })} />
              </Field>
              <Field id="rez-cas" label="Čas" error={chybaPole('time')}
                hint={zavreno ? 'V tento den má podnik zavřeno.' : jiny && den?.open && den?.close ? `Otevřeno ${den.open}–${den.close}.` : undefined}>
                {zapis && volby.length > 0 && (
                  <Select id={jiny ? 'rez-cas-volba' : 'rez-cas'} aria-label={jiny ? 'Volba času' : undefined} value={jiny ? JINY_CAS : form.cas}
                    onChange={e => (e.target.value === JINY_CAS ? zmen({ jinyCas: true }) : zmen({ cas: e.target.value, jinyCas: false }))}>
                    {volby.map(c => <option key={c} value={c}>{c === ted && nabidnoutTed ? `Teď (${c})` : c}</option>)}
                    <option value={JINY_CAS}>Jiný čas…</option>
                  </Select>
                )}
                {jiny && (
                  <Input id="rez-cas" type="time" step={300} value={form.cas} className={zapis && volby.length > 0 ? 'mt-2' : ''}
                    onChange={e => zmen({ cas: e.target.value })} />
                )}
              </Field>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 items-start">
            <Field id="rez-osob" label="Osob" error={chybaPole('party')}>
              <Input id="rez-osob" type="number" inputMode="numeric" min={1} max={maxOsob} value={form.osob}
                onChange={e => zmen({ osob: e.target.value })} />
            </Field>
            <Field id="rez-stul" label="Stůl" error={chybaPole('tableId')}>
              <Select id="rez-stul" value={form.stul} onChange={e => zmen({ stul: e.target.value })}>
                <option value="">Bez stolu</option>
                {stoly.map(t => <option key={t.id} value={t.id}>{t.nazev} · {czCount(t.mist, MISTO)}</option>)}
              </Select>
            </Field>
          </div>
          <Field id="rez-pozn" label="Poznámka" error={chybaPole('note')}>
            <Textarea id="rez-pozn" rows={2} maxLength={RUCNI_MAX_POZNAMKA} value={form.poznamka}
              onChange={e => zmen({ poznamka: e.target.value })} placeholder="Kočárek, oslava, alergie…" />
          </Field>
        </form>
      </div>
    </Modal>
  );
}

// ---- Objednávky -----------------------------------------------------------------

function ObjednavkyStranka({ oznam, onZmena }: { oznam: Hlaska; onZmena: () => void }) {
  // Fronta beze změny; Historie je pohled majitele na celé období (kolik přišlo, za kolik, kolik nepřijato).
  const [pohled, setPohled] = useState<'fronta' | 'historie'>('fronta');
  // Dnešní rezervace kreslí nástroj (příjem u obsluhy); widget klient.dnesni_rezervace už ve výchozím
  // rozložení Objednávek není (dřív tytéž rezervace dvakrát pod sebou) — kdo ho chce, přidá si ho z galerie.
  return (
    <PlochaWidgetu
      stranka="vedeni.klient_objednavky"
      hlavicka={{
        title: 'Objednávky',
        hintId: 'clientadmin-1',
        subtitle: pohled === 'fronta'
          ? 'Objednávky od stolu čekají na přijetí. Přijaté jdou do pokladny na stůl, hotové připíšou hostovi body.'
          : 'Objednávky od stolu za zvolené období. Skutečnou tržbu podniku ukazují Finance z pokladny.',
        aside: <Segmented options={[{ id: 'fronta', label: 'Fronta' }, { id: 'historie', label: 'Historie' }]}
          value={pohled} onChange={setPohled} size="sm" ariaLabel="Fronta nebo historie objednávek" />,
      }}
      nastroj={pohled === 'fronta' ? <StaffInbox onToast={t => oznam(t)} onZmena={onZmena} /> : <HistorieObjednavek />}
    />
  );
}

/** Objednávky od stolu za období: čtyři čísla (2 × 2 na telefonu) a seznam s časem, dobou přijetí a částkou. */
function HistorieObjednavek() {
  const cena = usePrice();
  const [obdobi, setObdobi] = useState<ObdobiHistorie>(() => obdobiZPresetu('dnes'));
  const r = platneRozmezi(obdobi);
  const url = `/api/client/admin/orders?from=${r.od}&to=${r.do}`;
  const data = useDataWidgetu(url, vyberHistoriiObjednavek);
  const vic = r.od !== r.do;
  const d = data.data;
  return (
    <div className="space-y-4">
      <ObdobiLista value={obdobi} onChange={setObdobi} volby={['dnes', 'vcera', '7_dni', 'mesic']} dnyTydne={false} hrubost={false} />
      {data.error ? <ErrorState title="Historie objednávek se nenačetla" onRetry={data.reload} detail={data.error} />
        : !d ? <PageSkel />
        : (
          <>
            <Card>
              <StatRow>
                <Stat label="Objednávek" value={String(d.souhrn.pocet)} />
                <Stat label="Od stolu celkem" value={cena(d.souhrn.soucet)} note={d.souhrn.hotovych ? `z ${czCount(d.souhrn.hotovych, HOTOVA)}` : 'zatím nic hotového'} />
                <Stat label="Průměr" value={d.souhrn.prumer == null ? '–' : cena(d.souhrn.prumer)} />
                <Stat label="Nepřijato" value={String(d.souhrn.neprijato)} tone={d.souhrn.neprijato > 0 ? 'wait' : 'muted'} />
              </StatRow>
            </Card>
            {d.objednavky.length === 0 ? (
              <Card><EmptyState icon="cup" compact title="Za tohle období žádné objednávky od stolu" hint="Objeví se tu, jakmile si host objedná přes QR kód na stole." /></Card>
            ) : (
              <Card pad="none">
                <ul className="list px-5">
                  {d.objednavky.map(o => {
                    const st = ORDER_STATUS[o.stav] ?? ORDER_STATUS.new;
                    const doba = dobaObjednavky(o, parseDbTime);
                    const kdy = vic ? dbTimeDayHM(o.vytvoreno) : dbTimeHM(o.vytvoreno);
                    const casti = [kdy, doba ? (doba.co === 'prijato' ? `přijato za ${doba.minut} min` : doba.co === 'hotovo' ? `hotovo za ${doba.minut} min` : null) : null, polozkyKratce(o.polozky)];
                    return (
                      <ListRow key={o.id} title={`${o.stul ?? 'bez stolu'} · ${o.host}`} meta={casti.filter(Boolean).join(' · ')}
                        value={<span className="tabular-nums">{cena(o.castka)}</span>}
                        right={<Chip tone={st.tone} size="sm">{st.label}</Chip>} />
                    );
                  })}
                </ul>
                {d.celkem > d.objednavky.length && (
                  <p className="t-meta tabular-nums px-5 py-3 border-t border-black/5">Zobrazeno posledních {d.objednavky.length} z {d.celkem}. Kratší období ukáže všechny.</p>
                )}
              </Card>
            )}
          </>
        )}
    </div>
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
  // Kupon vybraným členům: akce v liště výběru, okno posílání kuponů je z části Kupony.
  const [kuponVyber, setKuponVyber] = useState<VyberHostu | null>(null);
  const dalsiAkce = ma('kupony.spravovat') ? (vyber: VyberHostu) => [{ label: 'Kupon', icon: 'tag', onClick: () => setKuponVyber(vyber) }] : undefined;
  const nastroj = !cast ? null
    : cast.id === 'members' ? <ClenoveSprava oznam={oznam} hledat={hledat} dalsiAkce={dalsiAkce} />
    : cast.id === 'reviews' ? <Recenze oznam={oznam} />
    : cast.id === 'automations' ? <Automatizace oznam={oznam} />
    : <ZpravyRozeslani oznam={oznam} />;
  return (
    <>
    {kuponVyber && <KuponVybranym vyber={kuponVyber} oznam={oznam} onZavrit={() => setKuponVyber(null)} onHotovo={() => setKuponVyber(null)} />}
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
    </>
  );
}

// ---- Hodnocení ------------------------------------------------------------------
//
// Kolo 8 (R8-7): filtr nad seznamem („Vše · 84", „1–2 ★ · 6", „S komentářem", „Nevyřízené")
// a období; u hodnocení „Odpovědět" (okno, na telefonu zdola; host dostane oznámení a odpověď
// vidí v Moje stránka) a „Označit jako vyřízené". Chip „odpovězeno · Martin" a „vyřízeno" u řádku.
// Dřív jen průměr, rozložení a seznam — slabé hodnocení přišlo oznámením, ale vyřídit se nedalo.

type OdpovedNaHodnoceni = { v: Recenze; text: string; vyridit: boolean };

function Recenze({ oznam }: { oznam: Hlaska }) {
  const { data: d, error, reload } = useLoad<{ h: ReturnType<typeof vyberHodnoceni>; crew: Map<number, { name: string; avatar: string | null }[]> }>(
    '/api/client/admin/reviews',
    raw => ({
      h: vyberHodnoceni(raw),
      crew: new Map((Array.isArray(raw?.reviews) ? raw.reviews : []).map((v: any) => [Number(v.id), (Array.isArray(v.crew) ? v.crew : []).map((c: any) => ({
        name: String(c?.name ?? ''), avatar: typeof c?.avatar === 'string' && c.avatar !== '👤' ? c.avatar : null,
      }))])),
    }),
  );
  const [filtr, setFiltr] = useState<FiltrHodnoceni>('vse');
  const [obdobi, setObdobi] = useState<ObdobiHistorie>(() => obdobiZPresetu('90_dni'));
  const [odpovidam, setOdpovidam] = useState<OdpovedNaHodnoceni | null>(null);
  const [busy, setBusy] = useState(false);
  const rozmezi = platneRozmezi(obdobi);
  if (error) return <ErrorState title="Hodnocení se nenačetla" onRetry={reload} detail={error} />;
  if (!d) return <PageSkel />;
  const { h, crew } = d;
  if (h.pocet === 0) return <Card><EmptyState icon="star" title="Zatím žádné hodnocení" hint="Objeví se, jakmile host ohodnotí hotovou návštěvu." compact /></Card>;
  // Počty na pilulkách jsou v rámci období — ať je vidět, kam má cenu klikat (DESIGN „Filtrovací pás").
  const vObdobi = filtrujHodnoceni(h.posledni, 'vse', rozmezi, pragueDaySafe);
  const pocty = poctyHodnoceni(vObdobi);
  const seznam = filtrujHodnoceni(vObdobi, filtr, null, pragueDaySafe);
  const ulozit = async (v: Recenze, telo: { reply?: string; resolved?: boolean }) => {
    setBusy(true);
    try {
      await j('/api/client/admin/reviews', { method: 'PATCH', body: JSON.stringify({ id: v.id, ...telo }) });
      oznam(telo.reply !== undefined ? `${v.host} dostane tvoji odpověď.` : telo.resolved ? 'Hodnocení označeno jako vyřízené.' : 'Hodnocení je zase mezi nevyřízenými.');
      setOdpovidam(null);
      reload();
    } catch (e) { oznam(apiMessage(e, 'Nepovedlo se uložit.'), 'bad'); }
    setBusy(false);
  };
  return (
    <>
    <div className="grid grid-cols-1 md:grid-cols-[minmax(14rem,auto)_1fr] gap-4 items-start">
      <Card className="space-y-4">
        <Stat label="Průměr" value={prumerCesky(h.prumer)} unit="/ 5" note={czCount(h.pocet, HODNOCENI)} />
        <BarSpark height={56} showLabels label="Rozložení hodnocení od jedné do pěti hvězd"
          data={h.rozlozeni.map((n, i) => ({ value: n, label: String(i + 1), tip: `${i + 1} z 5: ${czCount(n, HODNOCENI)}` }))} />
      </Card>
      <div className="space-y-3 min-w-0">
        <ObdobiLista value={obdobi} onChange={setObdobi} volby={['7_dni', 'mesic', '90_dni', '365_dni']} dnyTydne={false} hrubost={false} />
        <div className="flex gap-1.5 overflow-x-auto scroll-fade-x" role="group" aria-label="Filtr hodnocení">
          {FILTRY_HODNOCENI.map(f => (
            <button key={f.id} type="button" aria-pressed={filtr === f.id}
              onClick={() => setFiltr(x => (x === f.id && f.id !== 'vse' ? 'vse' : f.id))}
              className={`filter-pill tap-target-sm tabular-nums whitespace-nowrap ${filtr === f.id ? 'seg-on' : 'seg-off glass'}`}>{f.popisek} · {pocty[f.id]}</button>
          ))}
        </div>
        {seznam.length === 0 ? (
          <Card><EmptyState icon="star" compact title={filtr === 'nevyrizene' ? 'Nic nevyřízeného' : 'Za tohle období žádné hodnocení'}
            hint={filtr === 'nevyrizene' ? 'Všechna slabá hodnocení mají odpověď, nebo jsou vyřízená.' : 'Zkus delší období nebo jiný filtr.'} /></Card>
        ) : (
        <Card pad="none">
          <ul className="list px-5">
            {seznam.map(v => {
              const lide = crew.get(v.id) ?? [];
              const dalsi: MenuItem[] = [
                v.vyrizeno
                  ? { label: 'Vrátit mezi nevyřízené', icon: 'undo', onClick: () => { void ulozit(v, { resolved: false }); } }
                  : { label: 'Označit jako vyřízené', icon: 'check', hint: 'Probráno se směnou nebo host odškodněný. Host to nevidí.', onClick: () => { void ulozit(v, { resolved: true }); } },
              ];
              return (
                <li key={v.id} className="list-row items-start flex-wrap sm:flex-nowrap">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-[15px] font-medium leading-snug text-[#16181A] flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="truncate">{v.host}</span>
                      <span className={`inline-flex items-center gap-0.5 shrink-0 tabular-nums ${v.hvezdy <= 2 ? 'text-wait-ink' : 'text-black/55'}`} aria-label={`${v.hvezdy} z 5`}>
                        {v.hvezdy}<Icon name="star" size={14} />
                      </span>
                      {v.odpoved && <Chip tone="ok" size="sm" icon="check">odpovězeno{v.odpovedel ? ` · ${v.odpovedel}` : ''}</Chip>}
                      {v.vyrizeno && <Chip tone="muted" size="sm">vyřízeno</Chip>}
                      {jeNevyrizene(v) && <Chip tone="wait" size="sm">nevyřízené</Chip>}
                    </p>
                    <p className={`text-sm mt-0.5 text-pretty ${v.poznamka ? 'text-black/70' : 'text-black/45'}`}>{v.poznamka ? `„${v.poznamka}“` : 'Bez komentáře.'}</p>
                    <p className="t-meta mt-1">{dbTimeDayHM(v.kdy)} · {v.zdroj === 'objednavka' ? 'objednávka od stolu' : 'rezervace'}</p>
                    {v.odpoved && (
                      <p className="text-sm mt-1.5 text-black/70 flex items-start gap-1.5 text-pretty">
                        <Icon name="chat" size={13} className="shrink-0 mt-0.5" />
                        <span className="min-w-0 whitespace-pre-line"><span className="sr-only">Odpověď podniku: </span>{v.odpoved}{v.odpovedenoKdy ? <span className="t-meta"> · {dbTimeDayHM(v.odpovedenoKdy)}</span> : null}</span>
                      </p>
                    )}
                    {lide.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="t-meta">Ten den na směně:</span>
                        {lide.map(c => <PersonChip key={c.name} name={c.name} avatar={c.avatar} size="sm" tone={v.hvezdy <= 2 ? 'wait' : 'muted'} />)}
                      </div>
                    )}
                  </div>
                  <div className="list-actions flex gap-1.5 shrink-0 ml-auto">
                    <Button size="sm" variant="secondary" icon="chat" onClick={() => setOdpovidam({ v, text: v.odpoved ?? '', vyridit: v.vyrizeno })}
                      aria-label={`${v.odpoved ? 'Upravit odpověď' : 'Odpovědět'}: ${v.host}, ${v.hvezdy} z 5`}>{v.odpoved ? 'Upravit odpověď' : 'Odpovědět'}</Button>
                    <Menu size="sm" label={`Další akce s hodnocením ${v.host}`} items={dalsi} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
        )}
      </div>
    </div>
    {odpovidam && (
      <Modal open onClose={() => setOdpovidam(null)} size="md" title={`Odpověď pro ${odpovidam.v.host}`}
        subtitle={`${odpovidam.v.hvezdy} z 5 · ${odpovidam.v.poznamka ? `„${odpovidam.v.poznamka}“` : 'bez komentáře'}`}
        footer={<>
          <Button variant="secondary" onClick={() => setOdpovidam(null)}>Zrušit</Button>
          <Button variant="primary" icon="send" loading={busy} disabled={!odpovidam.text.trim()}
            onClick={() => { void ulozit(odpovidam.v, { reply: odpovidam.text.trim(), resolved: odpovidam.vyridit }); }}>Odeslat odpověď</Button>
        </>}>
        <div className="space-y-4">
          <Field id="rec-odpoved" label="Odpověď hostovi" hint="Host dostane oznámení a odpověď uvidí v Moje stránka.">
            <Textarea id="rec-odpoved" rows={4} maxLength={ODPOVED_MAX} value={odpovidam.text} autoFocus
              onChange={e => setOdpovidam(o => (o ? { ...o, text: e.target.value } : o))} placeholder="Děkujeme za zpětnou vazbu. Příště…" />
          </Field>
          <ul className="list">
            <SwitchRow title="Označit jako vyřízené" hint="Probráno se směnou nebo host odškodněný. Jen pro podnik, host to nevidí."
              checked={odpovidam.vyridit} onChange={v => setOdpovidam(o => (o ? { ...o, vyridit: v } : o))} />
          </ul>
        </div>
      </Modal>
    )}
    </>
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
        order_qr_required: p.order_qr_required, order_geo: p.order_geo, lat: p.lat ?? '', lng: p.lng ?? '', geo_radius_m: p.geo_radius_m, order_auto_pos: p.order_auto_pos,
        // Před migrací sloupců (profil je nemá) se nic neposílá, ať uložení zbytku nespadne.
        ...(p.auto_confirm !== undefined ? { auto_confirm: p.auto_confirm === true, auto_confirm_max_party: Number(p.auto_confirm_max_party) || 0 } : {}) }) });
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
          {/* Malá kavárna nemá nikoho, kdo by požadavky hlídal: rezervace se potvrdí sama
              a ručně se schvalují jen velké skupiny (jako instant booking v OpenTable a Resy). */}
          <SwitchRow title="Potvrzovat rezervace automaticky"
            hint={Number(p.auto_confirm_max_party) > 0
              ? `Větší skupiny (od ${Number(p.auto_confirm_max_party) + 1} osob) dál čekají na tvé potvrzení.`
              : 'Host má potvrzeno hned po odeslání. Hranici pro velké skupiny nastavíš pod přepínačem.'}
            checked={p.auto_confirm === true} onChange={v => setP({ ...p, auto_confirm: v })} />
        </ul>
        {p.auto_confirm === true && (
          <Field id="s-auto-max" label="Samy se potvrdí skupiny do (osob)" hint="0 = všechny velikosti. Větší skupiny počkají, až je potvrdíš v Rezervacích.">
            <Input id="s-auto-max" type="number" inputMode="numeric" min={0} max={40} className="!w-full sm:!w-28" value={p.auto_confirm_max_party ?? 0}
              onChange={e => setP({ ...p, auto_confirm_max_party: e.target.value })} />
          </Field>
        )}
        <ul className="list">
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

