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
import KuponVybranym from './loyalty/KuponVybranym';
import CteckaPanel from './sprava/CteckaPanel';
import OsaRezervaci from './sprava/OsaRezervaci';
import KampaneStranka, { CASTI_KAMPANI, type CastKampani } from './sprava/KampaneStranka';
import KuponyAPoukazy, { type CastKuponu } from './sprava/KuponyAPoukazy';
import type { VyberHostu } from './loyalty/ClenoveHromadne';
import MenuEditor from '../employer/MenuEditor';
import EventsView from '../employer/EventsView';
import {
  dayKey, denProZapis, NEDORAZENI_LIMIT, nedorazilNaRade, nejdriveDnes, RES_STATUS, RUCNI_MAX_JMENO, RUCNI_MAX_POZNAMKA, RUCNI_MAX_TELEFON, slotsFor, validujRucniRezervaci, vOteviraciDobe,
  type PoleRucni,
} from '@/lib/clientSlots';
import { dayPlus, dbTimeDayHM, dbTimeHM, parseDbTime, pragueDaySafe, pragueHM, pragueToday } from '@/lib/pragueTime';
import { obdobiZPresetu, platneRozmezi, type Obdobi as ObdobiHistorie } from '@/lib/obdobi';
import { odsazeniMesice, zacatekTydne } from '@/lib/week';
import { useCurrency, useMoney, usePrice } from '../CurrencyProvider';
import { useDraft, type Koncept } from '@/lib/useDraft';
import { useJazyk, useT, type PrekladFn } from '@/lib/i18n/client';
import type { Jazyk } from '@/lib/i18n/config';
import { fmtDatum, fmtDenVTydnu } from '@/lib/i18n/format';
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

// Nastavení účtu v okně: stejná obrazovka jako v administraci (profil, vzhled a jazyk, oznámení, zabezpečení),
// jen se stahuje až při otevření, ať ho Client nenese s každým načtením.
const NastaveniUctu = dynamic(() => import('../Settings'), { loading: () => <div className="flex items-center justify-center h-48"><div className="spinner" /></div> });

// Kolo 92 (přestavba správy Managero client, audit C + koncept B): čtyři oblasti místo jedenácti
// rovnocenných záložek. IA je z auditu C (Provoz · Hosté · Program · Podnik), pojmenování oblasti
// s programem z konceptu B („Věrnost"): majitel kavárny hledá „věrnost", slovo „program" samo nic
// neříká, a „Provoz" (ne „Dnes" z B) proto, že stoly a čtečka nejsou jen dnešek. Přehled stojí nad
// oblastmi sám. Id záložek zůstávají kvůli odkazům z oznámení, widgetů a sond (`tab=customers`
// = Hosté, `tab=loyalty` = Program, `tab=cards` = Kupony a poukazy, `tab=brand` = Stránka podniku);
// nové jsou `reader` (čtečka u kasy uvnitř správy, dřív jen zvláštní trasa), `campaigns`
// (zprávy, automatizace a bannery — dřív rozházené po Zákaznících a Vzhledu) a `reviews`.
type Tab = 'overview' | 'reservations' | 'orders' | 'tables' | 'reader' | 'menu' | 'events' | 'customers' | 'campaigns' | 'reviews' | 'loyalty' | 'cards' | 'brand' | 'settings';

/** Záložky Clientu a klíče, které je otevírají (stačí kterýkoli; null = každý s klient.prehled). */
const TABS: { id: Tab; label: string; icon: string; klice: readonly string[] | null }[] = [
  { id: 'overview', label: 'Přehled', icon: 'overview', klice: null }, // i18n-ok: překlad v nazevTabu
  { id: 'reservations', label: 'Rezervace', icon: 'calendarCheck', klice: ['rezervace.zobrazit'] }, // i18n-ok
  { id: 'orders', label: 'Objednávky', icon: 'cup', klice: ['objednavky.zobrazit'] }, // i18n-ok
  { id: 'tables', label: 'Stoly', icon: 'location', klice: ['stoly.zobrazit'] }, // i18n-ok
  { id: 'reader', label: 'Čtečka u kasy', icon: 'card', klice: ['vernost.karta', 'kupony.uplatnit', 'poukazy.uplatnit'] }, // i18n-ok
  { id: 'customers', label: 'Hosté', icon: 'users', klice: ['zakaznici.zobrazit'] }, // i18n-ok
  { id: 'campaigns', label: 'Kampaně', icon: 'send', klice: ['zakaznici.zpravy', 'klient.vzhled'] }, // i18n-ok
  { id: 'reviews', label: 'Hodnocení', icon: 'star', klice: ['zakaznici.recenze'] }, // i18n-ok
  { id: 'loyalty', label: 'Program', icon: 'gift', klice: ['vernost.zobrazit'] }, // i18n-ok
  // Kupony a promo kódy, dárkové poukazy a plastové karty (dřív Věrnost → Kupony, Věrnost → Poukazy a samostatné Kartičky).
  { id: 'cards', label: 'Kupony a poukazy', icon: 'tag', klice: ['kupony.spravovat', 'kupony.uplatnit', 'poukazy.zobrazit', 'poukazy.uplatnit', 'vernost.zobrazit'] }, // i18n-ok
  { id: 'brand', label: 'Stránka podniku', icon: 'sparkle', klice: ['klient.vzhled'] }, // i18n-ok
  { id: 'menu', label: 'Menu', icon: 'leaf', klice: ['menu.zobrazit'] }, // i18n-ok
  { id: 'events', label: 'Akce', icon: 'calendar', klice: ['akce.zobrazit'] }, // i18n-ok
  { id: 'settings', label: 'Nastavení', icon: 'settings', klice: ['klient.nastaveni'] }, // i18n-ok
];
/** Popisky záložek v jazyce uživatele (TABS.label je jen české id pro sondy a komentáře). */
function nazvyTabu(t: PrekladFn): Record<Tab, string> {
  return {
    overview: t('Přehled'), reservations: t('Rezervace'), orders: t('Objednávky'), tables: t('Stoly'), reader: t('Čtečka u kasy'),
    customers: t('Hosté'), campaigns: t('Kampaně'), reviews: t('Hodnocení'), loyalty: t('Program'), cards: t('Kupony a poukazy'),
    brand: t('Stránka podniku'), menu: t('Menu'), events: t('Akce'), settings: t('Nastavení'),
  };
}
const JE_TAB = (x: unknown): x is Tab => TABS.some(t => t.id === x);

/** Čtyři oblasti správy (rail na počítači, skupiny v listu „Více" na telefonu). */
const NAV_SECTIONS: { title: string | null; ids: Tab[] }[] = [
  { title: null, ids: ['overview'] },
  { title: 'Provoz', ids: ['reservations', 'orders', 'tables', 'reader'] }, // i18n-ok: překlad v nazevOblasti
  { title: 'Hosté', ids: ['customers', 'campaigns', 'reviews'] }, // i18n-ok
  { title: 'Věrnost', ids: ['loyalty', 'cards'] }, // i18n-ok
  { title: 'Podnik', ids: ['brand', 'menu', 'events', 'settings'] }, // i18n-ok
];
function nazevOblasti(t: PrekladFn, titul: string | null): string | null {
  return titul === 'Provoz' ? t('Provoz', undefined, 'oblast') : titul === 'Hosté' ? t('Hosté') : titul === 'Věrnost' ? t('Věrnost') : titul === 'Podnik' ? t('Podnik') : titul; // i18n-ok: porovnání s id oblasti
}
/** Telefon: čtečka uprostřed pod palcem (obsluha u kasy), Hosté vedle; zbytek v „Více". */
const DOCK: Tab[] = ['overview', 'reservations', 'reader', 'customers'];

const URL_SOUHRN = '/api/client/admin/summary';
/** Jak často skořápka obnoví odznaky (stejný rytmus jako příjem objednávek ve StaffInbox). */
const OBNOVA_SOUHRNU_MS = 20_000;
const URL_REZERVACE_DNES = '/api/client/admin/reservations?range=today';
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

const osob = (t: PrekladFn, n: number) => t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n });
const mist = (t: PrekladFn, n: number) => t('{n, plural, one {# místo} few {# místa} other {# míst}}', { n });
const novychObjednavek = (t: PrekladFn, n: number) => t('{n, plural, one {# nová objednávka} few {# nové objednávky} other {# nových objednávek}}', { n });
const rezervaciKPotvrzeni = (t: PrekladFn, n: number) => t('{n, plural, one {# rezervace k potvrzení} few {# rezervace k potvrzení} other {# rezervací k potvrzení}}', { n });
const hodnoceni = (t: PrekladFn, n: number) => t('{n, plural, one {# hodnocení} few {# hodnocení} other {# hodnocení}}', { n });
const rezervaci = (t: PrekladFn, n: number) => t('{n, plural, one {# rezervace} few {# rezervace} other {# rezervací}}', { n });
const navstev = (t: PrekladFn, n: number) => t('{n, plural, one {# návštěva} few {# návštěvy} other {# návštěv}}', { n });
/** „úterý 27. října" / „út 27. 10." v jazyce uživatele (dřív czDay jen česky). */
const denText = (d: string, jazyk: Jazyk, dlouze = false) => fmtDatum(d, { jazyk, styl: dlouze ? 'denDlouze' : 'denKratce' });
/** Stav rezervace slovy (RES_STATUS nese české popisky, překládají se při vykreslení). */
function stavRezervaceText(stav: string, t: PrekladFn): string {
  switch (stav) {
    case 'requested': return t('Čeká na potvrzení');
    case 'confirmed': return t('Potvrzeno');
    case 'seated': return t('Usazeni');
    case 'done': return t('Proběhlo');
    case 'declined': return t('Nepřijato');
    case 'cancelled': return t('Zrušeno');
    case 'no_show': return t('Nedorazil');
    default: return RES_STATUS[stav]?.label ?? stav;
  }
}
/** Stav objednávky od stolu slovy (ORDER_STATUS ze StaffInbox nese české popisky). */
function stavObjednavkyText(stav: string, cs: string, t: PrekladFn): string {
  return stav === 'new' ? t('Nová') : stav === 'confirmed' ? t('Připravuje se') : stav === 'done' ? t('Hotovo') : stav === 'declined' ? t('Nepřijato') : cs;
}
/** Úroveň hosta slovy (API posílá české popisky z tierFor). */
function urovenText(id: string, t: PrekladFn): string {
  return id === 'platinum' ? t('Platinový host') : id === 'gold' ? t('Zlatý host') : t('Stříbrný host');
}
/** Popisek hlavního kroku rezervace (hlavniKrok vrací české slovo). */
function popisekKroku(na: StavRezervace, t: PrekladFn): string {
  return na === 'confirmed' ? t('Potvrdit') : na === 'seated' ? t('Usadit') : t('Hotovo');
}

async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, init ? { headers: JSON_HLAVICKA, ...init } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Nepovedlo se.'); // i18n-ok: záložní text chyby serveru (apiMessage)
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
  const t = useT('sprava');
  const nazvy = nazvyTabu(t);
  const moje = TABS.filter(x => !x.klice || ma(x.klice)).map(x => ({ ...x, label: nazvy[x.id] }));
  const klicMoje = moje.map(t => t.id).join(',');
  const [volba, setVolba] = useState<Tab>(JE_TAB(initialTab) ? initialTab : 'overview');
  // Odkaz z oznámení („nová rezervace") nebo proklik z widgetu jinde v aplikaci
  // může přijít, i když je Client už otevřený.
  useEffect(() => { if (JE_TAB(initialTab)) setVolba(initialTab); }, [initialTab]);
  const tab: Tab = moje.some(t => t.id === volba) ? volba : 'overview';
  const aktivni = { ...TABS.find(x => x.id === tab)!, label: nazvy[tab] };

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
  const [castKuponu, setCastKuponu] = useState<{ id: CastKuponu; n: number } | null>(null);
  const [castKampani, setCastKampani] = useState<{ id: CastKampani; n: number } | null>(null);
  const [profilHosta, setProfilHosta] = useState<{ id: number; n: number } | null>(null);
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
        // Kupony a poukazy se z Věrnosti přestěhovaly do vlastní stránky; staré odkazy (průvodce importem) tam vedou dál.
        if (t === 'loyalty' && (arg === 'coupons' || arg === 'vouchers')) {
          setCastKuponu(c => ({ id: arg === 'coupons' ? 'kupony' : 'poukazy', n: (c?.n ?? 0) + 1 }));
          prejdi('cards');
          return;
        }
        if (t === 'loyalty' && arg && LOYALTY_SUBS.some(c => c.id === arg)) setCastVernosti(c => ({ id: arg as LoyaltySub, n: (c?.n ?? 0) + 1 }));
        if (t === 'campaigns' && arg && CASTI_KAMPANI.some(c => c.id === arg)) setCastKampani(c => ({ id: arg as CastKampani, n: (c?.n ?? 0) + 1 }));
        // Globální hledání otevře profil hosta (`clen:<id>`).
        if (t === 'customers' && arg?.startsWith('clen:')) setProfilHosta(c => ({ id: Number(arg.slice(5)) || 0, n: (c?.n ?? 0) + 1 }));
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
  const popisOdznaku = (id: Tab, n: number) => (id === 'reservations' ? rezervaciKPotvrzeni(t, n) : novychObjednavek(t, n));
  const kVyrizeni = (souhrn?.rezervaceCekaji ?? 0) + (souhrn?.objednavkyNove ?? 0);

  return (
    <NavigaceKontext.Provider value={navigace}>
      <div className="flex h-[100dvh] overflow-hidden">
        {/* Boční pás jako v administraci (plovoucí bílá lišta se skupinami).
            Na telefonu ho nahrazuje spodní dok a list „Více". */}
        <aside className="glass-strong hidden md:flex m-4 mr-0 w-60 rounded-3xl text-[#16181A] flex-col flex-shrink-0">
          <div className="flex items-center gap-2.5 py-3.5 px-3 border-b border-black/[0.07]">
            <Button variant="ghost" size="sm" iconOnly icon="arrowLeft" className="shrink-0"
              aria-label={t('Zpět do administrace')} title={t('Zpět do administrace')} onClick={onExit} />
            <LogoMark size={32} />
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight tracking-tight">Managero</p>
              <p className="t-label mt-0.5">Client</p>
            </div>
          </div>
          <div className="flex-1 min-h-0 relative">
            <nav className="h-full py-1.5 space-y-px px-3 overflow-y-auto scrollbar-thin" aria-label={t('Části Managero client')}>
              {NAV_SECTIONS.map((sec, si) => {
                const polozky = sec.ids.map(id => moje.find(x => x.id === id)).filter((x): x is (typeof moje)[number] => !!x);
                if (!polozky.length) return null;
                return (
                  <div key={sec.title ?? 'top'} className={si > 0 ? 'pt-1.5' : ''}>
                    {sec.title && <p className="t-label px-3.5 pb-0.5">{nazevOblasti(t, sec.title)}</p>}
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
            <Button variant="secondary" size="sm" icon="external" block disabled={!souhrn?.slug} onClick={strankaProHosty}>{t('Stránka pro hosty')}</Button>
            {/* Účet dole v menu: klepnutí otevře Nastavení v okně (profil, jazyk a vzhled, oznámení, heslo). */}
            <button type="button" onClick={() => setUcetOtevren(true)} aria-haspopup="dialog"
              className="w-full flex items-center gap-2.5 rounded-2xl px-2.5 py-2 text-left seg-off transition duration-200">
              <span className="w-8 h-8 rounded-full bg-black/[0.06] flex items-center justify-center text-base shrink-0" aria-hidden="true">{user?.avatar || '👤'}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-tight truncate">{user?.name || t('Účet')}</span>
                <span className="block t-meta leading-tight truncate">{t('Účet a nastavení')}</span>
              </span>
              <Icon name="settings" size={18} className="shrink-0 i-lead" />
            </button>
          </div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <header className="px-4 sm:px-6 pt-5 pb-1 flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <Button variant="ghost" size="sm" iconOnly icon="arrowLeft" className="md:hidden shrink-0"
              aria-label={t('Zpět do administrace')} title={t('Zpět do administrace')} onClick={onExit} />
            <div className="hidden min-[380px]:block md:hidden shrink-0"><LogoMark size={30} /></div>
            {/* Název části jen pro odečítač (jako lišta administrace): vidět je
                jednou, jako h1 obrazovky. Dřív tu stál podruhé („Kartičky / Kartičky"). */}
            <p className="sr-only">{aktivni.label}</p>
            <div className="flex-1 min-w-0" />
            {souhrn?.zapnuto === false && <Chip tone="wait" size="sm" icon="warning">{t('Pro hosty vypnuto')}</Chip>}
            {kVyrizeni > 0 && <Chip tone="wait" size="sm" className="hidden sm:inline-flex">{t('{n} k vyřízení', { n: kVyrizeni })}</Chip>}
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
                {tab === 'reader' && <CteckaPanel />}
                {tab === 'customers' && <ZakazniciStranka oznam={oznam} hledat={hledatHosta} profil={profilHosta} />}
                {tab === 'campaigns' && <KampaneStranka oznam={oznam} castKampani={castKampani} />}
                {tab === 'reviews' && <HodnoceniStranka oznam={oznam} />}
                {tab === 'loyalty' && <LoyaltyTabs toast={x => oznam(x)} oznam={oznam} otevriCast={castVernosti} />}
                {tab === 'cards' && <KuponyAPoukazy oznam={oznam} promos={<PromoKody oznam={oznam} />} otevriCast={castKuponu} />}
                {tab === 'brand' && <div className="px-4 min-[360px]:px-5 pt-3 pb-4 sm:p-6"><BrandTab toast={x => oznam(x)} onChange={obnovSouhrn} /></div>}
                {tab === 'settings' && <div className="px-4 min-[360px]:px-5 pt-3 pb-4 sm:p-6"><SettingsTab oznam={oznam} onChange={obnovSouhrn} /></div>}
              </ErrorBoundary>
            </div>
          </main>
        </div>

        <Dock label={t('Spodní navigace klienta')}
          items={DOCK.map(id => moje.find(x => x.id === id)).filter((x): x is (typeof moje)[number] => !!x).map(x => {
            const n = odznak(x.id);
            // Dok má na telefonu pět míst po ~70 px: čtečka dostane v cizích jazycích krátký popisek („Scanner").
            const label = x.id === 'reader' ? t('Čtečka u kasy', undefined, 'dok') : x.label;
            return { id: x.id, label, icon: x.icon, ...(n > 0 ? { badge: n, badgeLabel: popisOdznaku(x.id, n) } : {}) };
          })}
          activeId={tab}
          onSelect={id => prejdi(id as Tab)}
          // Objednávky od stolu nejsou v doku (místo nich Čtečka a Hosté): jejich odznak nese „Více", ať nová
          // objednávka na telefonu nezůstane bez upozornění.
          more={{ onClick: () => setMoreOpen(v => !v), active: moreOpen || !DOCK.includes(tab),
            badge: moreOpen || tab === 'orders' ? 0 : odznak('orders'), badgeLabel: popisOdznaku('orders', odznak('orders')) }} />
        <MobileMoreSheet
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          title="Managero client"
          groups={NAV_SECTIONS.filter(sec => sec.title && sec.title !== 'Dnešek').map(sec => ({ // i18n-ok: id oblasti
            title: nazevOblasti(t, sec.title), items: sec.ids.map(id => moje.find(x => x.id === id)).filter((x): x is (typeof moje)[number] => !!x)
              .map(x => { const n = odznak(x.id); return n > 0 ? { ...x, badge: n, badgeLabel: popisOdznaku(x.id, n) } : x; }),
          }))}
          activeId={tab}
          onSelect={id => prejdi(id as Tab)}
          actions={[
            { label: t('Stránka pro hosty'), icon: 'external', onClick: () => { setMoreOpen(false); strankaProHosty(); } },
            { label: t('Účet a nastavení'), icon: 'settings', onClick: () => { setMoreOpen(false); setUcetOtevren(true); } },
            { label: t('Zpět do administrace'), icon: 'arrowLeft', onClick: onExit },
          ]}
        />
        {ucetOtevren && (
          <Modal open onClose={() => setUcetOtevren(false)} size="lg" title={t('Účet a nastavení')} subtitle={t('Profil, jazyk a vzhled, oznámení a zabezpečení')}>
            {user && user.id !== undefined
              ? <NastaveniUctu user={{ id: Number(user.id), name: user.name ?? '', role: user.role ?? 'employer', avatar: user.avatar }} initialTab="account" vOkne />
              : <EmptyState icon="settings" title={t('Účet se nenačetl')} hint={t('Obnov stránku a zkus to znovu.')} />}
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
  const t = useT('sprava');
  const vypnuto = zapnuto === false;
  // Krok „Začni": podnik bez členů a s právem importu dostane nahoře přechod z Kartičky.
  const imp = useImportKarticky(oznam, onZmena);
  return (
    <>
    <PlochaWidgetu
      stranka="vedeni.klient"
      hlavicka={{
        title: t('Přehled'),
        hintId: 'clientadmin-4',
        subtitle: vypnuto
          ? t('Managero client je pro hosty vypnutý. Nastav profil podniku a zapni ho — hosté pak podnik najdou, rezervují a objednají od stolu.')
          : slug ? t('Hosté tě najdou na {adresa}.', { adresa: `/client/${slug}` })
          : t('Co se dnes děje s hosty a jak si vede věrnostní program.'),
        primary: vypnuto && ma('klient.nastaveni')
          ? <Button variant="accent" icon="settings" onClick={() => prejdi('settings')}>{t('Nastavit a zapnout')}</Button>
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
  const t = useT('sprava');
  return (
    <Modal open onClose={onZavrit} size="sm" title={title}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>{t('Zrušit')}</Button>
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

/** O kolik řádků se Minulé prodlouží po „Načíst další". */
const STRANKA_MINULYCH = 100;
/** Nejvíc štítků skupin v řádku; zbytek je „+N". */
const SKUPIN_V_RADKU = 2;

function RezervaceStranka({ oznam, onZmena, otevriHosta }: { oznam: Hlaska; onZmena: () => void; otevriHosta?: (q: string) => void }) {
  // Viditelnost tlačítek podle `ma` (před načtením oprávnění ANO, rozhoduje server);
  // přísné useSmi jen tam, kde se podle klíče posílá dotaz (spec §1.5).
  const { ma: smi } = useOpravneni();
  const t = useT('sprava');
  const { jazyk } = useJazyk();
  const [obdobi, setObdobi] = useState<Obdobi>('upcoming');
  // Skok na den a hledání mají přednost před obdobím; přepnutí období je zruší.
  const [den, setDen] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [hledano, setHledano] = useState('');
  useEffect(() => { const c = setTimeout(() => setHledano(q.trim()), 300); return () => clearTimeout(c); }, [q]);
  const hleda = hledano.length >= HLEDANI_MIN;
  const [limit, setLimit] = useState(STRANKA_MINULYCH);
  const [jenNedorazili, setJenNedorazili] = useState(false);
  const [kalendar, setKalendar] = useState(false);
  const [hostOkno, setHostOkno] = useState<Rezervace | null>(null);
  // Kolo 92: osa stolů × hodin pro jeden den (dnes nebo vybraný); seznam zůstává výchozí.
  const [osa, setOsa] = useState(false);
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
  useEffect(() => { const c = setInterval(() => setTed(pragueHM()), 60_000); return () => clearInterval(c); }, []);
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
    oznam(t('Rezervace zapsána.'));
    reload();
    if (url !== URL_REZERVACE_DNES) obnovDataWidgetu(URL_REZERVACE_DNES);
    onZmena();
  };

  const zmenit = async (r: Rezervace, telo: { status?: StavRezervace; tableId?: number | null }) => {
    setPracuji(r.id);
    try {
      const x = await j('/api/client/admin/reservations', { method: 'PATCH', body: JSON.stringify({ id: r.id, ...telo }) });
      if (x.posNote) oznam(x.posNote);
      else if (x.loyalty?.rewarded) oznam(t('Hotovo. Host nasbíral všechna razítka a má odměnu.'));
      // Omyl u dveří jde vzít zpět z toastu — host dorazil o chvíli později.
      else if (telo.status === 'no_show') oznam(t('{host}: nedorazil.', { host: r.host }), 'ok', { label: t('Vrátit'), onClick: () => { void zmenit(r, { status: 'confirmed' }); } });
      else if (telo.status) oznam(`${r.host}: ${stavRezervaceText(x.status ?? telo.status, t).toLocaleLowerCase()}.`);
      else oznam(t('Stůl uložen.'));
    } catch (e) { oznam(apiMessage(e, t('Rezervaci se nepodařilo změnit.')), 'bad'); }
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
    ? <EmptyState icon="search" compact title={t('Nikdo takový — „{hledano}“', { hledano })} hint={t('Zkus část jména, nebo jen číslice telefonu.')} />
    : den
    ? <EmptyState icon="calendarCheck" compact title={t('{den}: žádné rezervace', { den: denText(den, jazyk, true) })} hint={t('Pro tenhle den není nic zapsané.')} />
    : vMinulych && jenNedorazili
    ? <EmptyState icon="calendarCheck" compact title={t('Nikdo nenedorazil')} hint={t('Rezervace označené „Nedorazil“ se objeví tady.')} />
    : <EmptyState icon="calendarCheck" compact title={obdobi === 'past' ? t('Žádné minulé rezervace') : t('Zatím žádné rezervace')}
        hint={obdobi === 'past' ? undefined : t('Objeví se tu, jakmile si host zarezervuje stůl na tvé stránce.')} />;
  // Hledání a skok na den jsou tam, kde je člověk hledá: první řádek nástroje, nad seznamem.
  const lista = (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SearchField value={q} onChange={setQ} placeholder={t('Jméno nebo telefon')} ariaLabel={t('Hledat rezervaci podle jména nebo telefonu')} className="flex-1 min-w-0" />
        <Button variant={den ? 'primary' : 'secondary'} icon="calendar" className="shrink-0 cz-sentence" aria-haspopup="dialog" aria-label={den ? t('Vybraný den {den}; změnit den', { den: denText(den, jazyk, true) }) : t('Vybrat den v kalendáři')}
          onClick={() => setKalendar(true)}>{den ? denText(den, jazyk) : t('Den')}</Button>
        {den && <Button variant="ghost" iconOnly icon="close" className="shrink-0" aria-label={t('Zrušit výběr dne')} onClick={() => setDen(null)} />}
        <Button variant={osa ? 'primary' : 'secondary'} icon="grid" className="shrink-0" aria-pressed={osa}
          aria-label={osa ? t('Zpět na seznam rezervací') : t('Osa stolů: rezervace dne po stolech a hodinách')}
          onClick={() => { if (!osa && !den && obdobi !== 'today') { setObdobi('today'); setQ(''); setHledano(''); } setOsa(v => !v); }}>
          <span className="max-sm:sr-only">{osa ? t('Seznam') : t('Osa stolů')}</span>
        </Button>
      </div>
      {/* Filtrovací pás jen, když je co filtrovat (DESIGN „Filtrovací pás"). */}
      {vMinulych && minule && minule.nedorazeni > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scroll-fade-x" role="group" aria-label={t('Filtr minulých rezervací')}>
          <button type="button" aria-pressed={!jenNedorazili} onClick={() => setJenNedorazili(false)}
            className={`filter-pill tap-target-sm tabular-nums ${!jenNedorazili ? 'seg-on' : 'seg-off glass'}`}>{t('Vše')} · {minule.celkem}</button>
          <button type="button" aria-pressed={jenNedorazili} onClick={() => setJenNedorazili(v => !v)}
            className={`filter-pill tap-target-sm tabular-nums ${jenNedorazili ? 'seg-on' : 'seg-off glass'}`}>{t('Nedorazili')} · {minule.nedorazeni}</button>
        </div>
      )}
      {hleda && data.data && rezervace.length > 0 && (
        <p className="t-meta tabular-nums" role="status">
          {t('{pocet} pro „{hledano}“', { pocet: rezervaci(t, celkem), hledano })}{celkem > rezervace.length ? ` · ${t('zobrazeno prvních {n}, upřesni hledání', { n: rezervace.length })}` : ''}
        </p>
      )}
    </div>
  );
  const seznam = data.error ? <ErrorState title={t('Rezervace se nenačetly')} onRetry={reload} detail={data.error} />
    : !data.data ? <PageSkel />
    : dny.length === 0 ? <Card>{prazdno}</Card>
    : (
      <div className="space-y-4">
        {dny.map(([datum, radky]) => {
          const s = souhrnDneRezervaci(radky);
          return (
          <Card key={datum} pad="none" aria-labelledby={`rez-${datum}`}>
            <h2 id={`rez-${datum}`} className="t-card cz-sentence px-5 pt-4">
              {denText(datum, jazyk, true)}{' '}
              {/* Den, kde nic neproběhlo (jen zrušené a nedorazivší), říká jen počet řádků — „0 osob" by mátlo. */}
              <span className="text-black/40 font-medium tabular-nums">· {s.pocet > 0 ? `${rezervaci(t, s.pocet)} · ${osob(t, s.osob)}${s.spicka ? ` · ${t('špička {cas}', { cas: s.spicka })}` : ''}` : rezervaci(t, radky.length)}</span>
            </h2>
            <ul className="list px-5 pb-1">
              {radky.map(r => {
                const krok = hlavniKrok(r.stav, smi);
                const konec = ['done', 'declined', 'cancelled', 'no_show'].includes(r.stav);
                const tel = odkazTel(r.telefon);
                const nedorazil = nabidkaNedorazil(r, smi, nedorazilNaRade(r, dnes, ted));
                const dalsi: MenuItem[] = [
                  ...(krok?.na === 'seated' && muzeDo(r.stav, 'done') && smi(klicPrechodu('done'))
                    ? [{ label: t('Rovnou hotovo'), icon: 'check', onClick: () => { void zmenit(r, { status: 'done' }); } }] : []),
                  ...(nedorazil === 'menu' ? [{ label: t('Nedorazil'), icon: 'close', hint: t('Host nepřišel. Další rezervace se mu po dvou nedorazeních nepotvrdí sama.'), onClick: () => { void zmenit(r, { status: 'no_show' }); } }] : []),
                  ...(r.stav === 'no_show' && muzeDo(r.stav, 'confirmed') && smi(klicPrechodu('confirmed', r.stav))
                    ? [{ label: t('Vrátit na potvrzeno'), icon: 'undo', hint: t('Omyl, nebo host dorazil později.'), onClick: () => { void zmenit(r, { status: 'confirmed' }); } }] : []),
                  ...(usazuje && !konec ? [{ label: r.stul ? t('Změnit stůl…') : t('Přidělit stůl…'), icon: 'location', onClick: () => setStulPro({ r, stul: r.stulId ? String(r.stulId) : '' }) }] : []),
                  ...(tel ? [{ label: t('Zavolat hostovi'), icon: 'chat', onClick: () => { window.location.href = tel; } }] : []),
                  ...(r.email ? [{ label: t('Napsat e-mail'), icon: 'mail', onClick: () => { window.location.href = `mailto:${r.email}`; } }] : []),
                  ...(r.hostId ? [{ label: t('Karta hosta…'), icon: 'user', onClick: () => setHostOkno(r) }] : []),
                  ...(otevriHosta ? [{ label: t('Otevřít v Zákaznících'), icon: 'users', onClick: () => otevriHosta(r.host) }] : []),
                  ...(muzeDo(r.stav, 'declined') && smi(klicPrechodu('declined'))
                    ? [{ label: t('Odmítnout rezervaci…'), icon: 'close', danger: true, hint: t('Host dostane zprávu, že se to nepovedlo.'), onClick: () => setOdmitam(r) }] : []),
                ];
                return (
                  <ListRow key={r.id} value={r.cas} title={<JmenoHosta r={r} onOtevrit={r.hostId ? () => setHostOkno(r) : undefined} />}
                    meta={<>
                      {osob(t, r.osob)} · {r.stul ?? t('bez stolu')}
                      {r.rucne && <> · <Chip tone="muted" size="sm">{t('zapsáno ručně')}</Chip></>}
                      {/* Host odpověděl na ranní připomínku — obsluha ví, že s ním může počítat. */}
                      {r.hostPotvrdil && !konec && <> · <Chip tone="ok" size="sm" icon="check">{t('host potvrdil')}</Chip></>}
                    </>}
                    // Kontakt a poznámka hosta jsou to, co obsluha u dveří potřebuje celé — `detail`
                    // se zalamuje, `meta` by poznámku na telefonu uřízl na „Oslav…".
                    detail={detailRezervace(r, t)}
                    right={<Chip tone={TON_REZERVACE[r.stav]} size="sm">{stavRezervaceText(r.stav, t)}</Chip>}
                    // Akce mají na počítači jednu šířku (Usadit + Nedorazil + ···), ať čas a stav všech
                    // řádků stojí v jednom sloupci — dřív „Hotovo“ vs. „Usadit · Nedorazil“ posouvaly čip i čas.
                    actions={krok || nedorazil === 'tlacitko' || dalsi.length ? (
                      <span className="flex items-center justify-end gap-1.5 sm:min-w-[15.5rem]">
                        {krok && (
                          <Button size="sm" variant="primary" loading={pracuji === r.id} onClick={() => { void zmenit(r, { status: krok.na }); }}
                            aria-label={t('{krok}: {host}, {cas}', { krok: popisekKroku(krok.na, t), host: r.host, cas: r.cas })}>{popisekKroku(krok.na, t)}</Button>
                        )}
                        {/* Půl hodiny po čase rezervace: „Nedorazil" vedle „Usadit" — jedno klepnutí u dveří. */}
                        {nedorazil === 'tlacitko' && (
                          <Button size="sm" variant="secondary" icon="close" loading={pracuji === r.id} onClick={() => { void zmenit(r, { status: 'no_show' }); }}
                            aria-label={t('{krok}: {host}, {cas}', { krok: t('Nedorazil'), host: r.host, cas: r.cas })}>{t('Nedorazil')}</Button>
                        )}
                        {dalsi.length > 0 && <Menu size="sm" label={t('Další akce s rezervací {host}', { host: r.host })} items={dalsi} />}
                      </span>
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
            <p className="t-meta tabular-nums">{t('Zobrazeno {n} z {celkem}', { n: rezervace.length, celkem })}</p>
            <Button size="sm" variant="secondary" icon="download" onClick={() => setLimit(l => l + STRANKA_MINULYCH)}>{t('Načíst další')}</Button>
          </Card>
        )}
      </div>
    );
  const denOsy = den ?? (obdobi === 'today' ? dnes : null);
  const nastroj = (
    <div className="space-y-4">
      {lista}
      {osa && denOsy && !hleda && data.data ? (
        <Card aria-label={`${t('Osa stolů')} · ${denText(denOsy, jazyk, true)}`}>
          <OsaRezervaci rezervace={rezervace} stoly={stoly} den={denOsy} dnes={dnes} ted={ted}
            onStul={r => setStulPro({ r, stul: r.stulId ? String(r.stulId) : '' })} />
        </Card>
      ) : seznam}
    </div>
  );

  return (
    <>
      <PlochaWidgetu
        stranka="vedeni.klient_rezervace"
        hlavicka={{
          title: t('Rezervace'),
          hintId: 'clientadmin-5',
          subtitle: t('Požadavky potvrď nebo odmítni; při příchodu hosty usaď — s napojenou pokladnou se rovnou otevře účet na stole. Kdo nepřišel, dostane „Nedorazil“.'),
          primary: zapisuje ? <Button variant="accent" icon="plus" onClick={() => setNovaOtevrena(true)}>{t('Nová rezervace')}</Button> : undefined,
          aside: <Segmented options={[{ id: 'today', label: t('Dnes') }, { id: 'upcoming', label: t('Nadcházející') }, { id: 'past', label: t('Minulé') }]}
            value={(den || hleda ? '' : obdobi) as Obdobi} onChange={vyberObdobi} size="sm" ariaLabel={t('Období')} />,
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
        <Potvrzeni title={t('Odmítnout rezervaci?')} akce={t('Odmítnout')} onZavrit={() => setOdmitam(null)}
          text={t('{host} ({den} v {cas}, {osob}) dostane zprávu, že se rezervace nepovedla.', { host: odmitam.host, den: denText(odmitam.datum, jazyk), cas: odmitam.cas, osob: osob(t, odmitam.osob) })}
          onPotvrdit={() => { void zmenit(odmitam, { status: 'declined' }); }} />
      )}
      {stulPro && (
        <Modal open onClose={() => setStulPro(null)} size="sm" title={t('Stůl pro {host}', { host: stulPro.r.host })}
          footer={<>
            <Button variant="secondary" onClick={() => setStulPro(null)}>{t('Zrušit')}</Button>
            <Button variant="primary" onClick={() => { const { r, stul } = stulPro; setStulPro(null); void zmenit(r, { tableId: stul ? Number(stul) : null }); }}>{t('Uložit')}</Button>
          </>}>
          <Field id="rez-stul" label={t('Stůl')} hint={`${osob(t, stulPro.r.osob)} · ${stulPro.r.cas}`}>
            <Select id="rez-stul" value={stulPro.stul} onChange={e => setStulPro({ ...stulPro, stul: e.target.value })}>
              <option value="">{t('Bez stolu')}</option>
              {stoly.map(s => <option key={s.id} value={s.id}>{s.nazev} · {mist(t, s.mist)}</option>)}
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
function detailRezervace(r: Rezervace, t: PrekladFn): React.ReactNode {
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
          {varovani && <Chip tone="wait" size="sm" icon="warning" className="max-w-full"><span className="truncate"><span className="sr-only">{t('Pozor:')} </span>{varovani}</span></Chip>}
          {r.skupiny.slice(0, SKUPIN_V_RADKU).map(g => <Chip key={g.nazev} tone="muted" size="sm" icon="tag">{g.nazev}</Chip>)}
          {r.skupiny.length > SKUPIN_V_RADKU && <Chip tone="muted" size="sm" className="tabular-nums">+{r.skupiny.length - SKUPIN_V_RADKU}</Chip>}
        </span>
      )}
      {tel ? (
        <a href={tel} className="tap-target inline-flex items-center font-medium text-[#16181A] tabular-nums underline decoration-black/25 underline-offset-2"
          aria-label={t('Zavolat hostovi {host}: {telefon}', { host: r.host, telefon: r.telefon })}>{r.telefon}</a>
      ) : r.email ? <span className="block truncate">{r.email}</span> : null}
      {r.poznamka && <span className="block text-black/70">„{r.poznamka}“</span>}
      {/* Poslední interní poznámka personálu (Zákazníci › Deník) — jiný hlas než host, proto kurzívou s ikonou. */}
      {poznamkaPersonalu && (
        <span className="flex items-start gap-1.5 italic text-black/60">
          <Icon name="pencil" size={13} className="shrink-0 mt-0.5" />
          <span className="min-w-0"><span className="sr-only">{t('Poznámka personálu:')} </span>{poznamkaPersonalu}</span>
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
  const t = useT('sprava');
  const jmeno = onOtevrit
    ? <button type="button" onClick={onOtevrit} className="truncate text-left tap-target-sm underline decoration-black/20 underline-offset-2 hover:decoration-black/60"
        aria-label={t('Karta hosta {host}', { host: r.host })}>{r.host}</button>
    : <span className="truncate">{r.host}</span>;
  const nedorazil = (r.nedorazeni ?? 0) > 0;
  if (!r.uroven && r.navstev !== 0 && !nedorazil) return jmeno;
  return (
    <span className="flex items-center gap-2 min-w-0">
      {jmeno}
      {r.uroven && <Chip tone={r.uroven.ton} size="sm">{urovenText(r.uroven.id, t)}</Chip>}
      {!r.uroven && r.navstev === 0 && <Chip tone="muted" size="sm">{t('1. návštěva')}</Chip>}
      {nedorazil && <Chip tone="bad" size="sm" className="tabular-nums">{t('{n}× nedorazil', { n: r.nedorazeni ?? 0 })}</Chip>}
    </span>
  );
}

// ---- Kalendář: skok na den ---------------------------------------------------------
//
// „Mám u vás v sobotu stůl na Nováka?" — místo scrollování Nadcházejícími měsíc s tečkami:
// den s rezervacemi nese jejich počet. Na telefonu okno vyjede zdola (Modal to dělá sám).

function KalendarRezervaci({ den, dnes, onVybrat, onZavrit }: { den: string; dnes: string; onVybrat: (d: string) => void; onZavrit: () => void }) {
  const t = useT('sprava');
  const { jazyk } = useJazyk();
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
    <Modal open onClose={onZavrit} size="sm" title={t('Skok na den')} subtitle={t('Den s rezervacemi nese jejich počet.')}
      footer={<Button variant="secondary" onClick={onZavrit}>{t('Zavřít')}</Button>}>
      <div className="space-y-3" data-transient>
        <MonthNav value={mesic} onChange={setMesic} />
        {error && <p className="note note-wait">{t('Počty rezervací se nenačetly.')} <button type="button" className="underline" onClick={reload}>{t('Zkusit znovu')}</button></p>}
        <div className="grid grid-cols-7 gap-1" role="grid" aria-label={t('Kalendář {mesic}', { mesic })}>
          {(zacatek === 0 ? [6, 0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6]).map(i => { const d = fmtDenVTydnu(i, { jazyk }); return <span key={i} className="t-label text-center py-1" aria-hidden="true">{d.charAt(0).toUpperCase() + d.slice(1)}</span>; })}
          {bunky.map((d, i) => {
            if (!d) return <span key={`p${i}`} aria-hidden="true" />;
            const n = pocty?.[d] ?? 0;
            const vybrany = d === den;
            return (
              <button key={d} type="button" onClick={() => onVybrat(d)} aria-pressed={vybrany}
                aria-label={`${denText(d, jazyk, true)}: ${n ? rezervaci(t, n) : t('bez rezervací')}`}
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
  const t = useT('sprava');
  // Poznámky posílají dotaz jen s klíčem (spec §1.5) — bez něj se okno obejde tím, co nese řádek.
  const smiPrisne = useSmi();
  const poznamkuje = smiPrisne('zakaznici.poznamky');
  const { data: d, error, reload } = useLoad<{ notes: PoznamkaHosta[] }>(poznamkuje ? `/api/client/admin/notes?customerId=${hostId}` : null,
    raw => ({ notes: Array.isArray(raw?.notes) ? raw.notes : [] }));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const pridej = async (e: React.FormEvent) => {
    e.preventDefault();
    const telo = text.trim();
    if (!telo || busy) return;
    setBusy(true);
    try {
      await j('/api/client/admin/notes', { method: 'POST', body: JSON.stringify({ customerId: hostId, body: telo }) });
      setText(''); reload(); onZmena();
      oznam(t('Poznámka uložena. Host ji nevidí.'));
    } catch (err) { oznam(apiMessage(err, t('Poznámku se nepodařilo uložit.')), 'bad'); }
    setBusy(false);
  };
  const nedorazeni = r.nedorazeni ?? 0;
  return (
    <Modal open onClose={onZavrit} size="md" title={r.host}
      subtitle={[r.uroven ? urovenText(r.uroven.id, t) : (r.navstev != null ? t('Člen') : null), r.navstev != null ? navstev(t, r.navstev) : null].filter(Boolean).join(' · ') || t('Host s účtem')}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>{t('Zavřít')}</Button>
        {otevriHosta && <Button variant="primary" icon="users" onClick={otevriHosta}>{t('Otevřít v Zákaznících')}</Button>}
      </>}>
      <div className="space-y-4">
        {/* Čísla hosta jako Stat (ne ListRow s číslem v ocasu, které na telefonu padá pod popisek). */}
        <StatRow>
          <Stat label={t('Rezervace')} value={r.rezervaciCelkem == null ? '–' : String(r.rezervaciCelkem)}
            note={r.rezervaciCelkem == null ? undefined : nedorazeni > 0 ? t('{n}× nedorazil', { n: nedorazeni }) : t('vždy dorazil')} tone={nedorazeni > 0 ? 'bad' : undefined} />
          {r.navstev != null && <Stat label={t('Návštěvy')} value={String(r.navstev)} note={r.utrata ? t('útrata {castka}', { castka: money(r.utrata) }) : undefined} />}
        </StatRow>
        {nedorazeni >= NEDORAZENI_LIMIT && <p className="note note-wait">{t('Další rezervace se mu nepotvrdí sama — počká na tebe.')}</p>}
        {r.skupiny.length > 0 && (
          <div>
            <p className="t-label mb-1.5">{t('Skupiny')}</p>
            <div className="flex flex-wrap gap-1">{r.skupiny.map(g => <Chip key={g.nazev} tone="muted" size="sm" icon="tag">{g.nazev}</Chip>)}</div>
          </div>
        )}
        {poznamkuje && (
          <div>
            <p className="t-label mb-1.5">{t('Poznámky pro personál')}</p>
            {error ? <p className="note note-wait">{t('Poznámky se nenačetly.')} <button type="button" className="underline" onClick={reload}>{t('Zkusit znovu')}</button></p>
              : d === null ? <Skeleton className="h-8" />
              : d.notes.length === 0 ? <p className="t-meta mb-2">{t('Zatím nic. Host poznámky nevidí.')}</p>
              : (
                <ul className="list mb-2" aria-label={t('Poznámky k hostovi')}>
                  {d.notes.map(n => (
                    <ListRow key={n.id} title={<span className="whitespace-normal break-words font-normal">{n.body}</span>}
                      meta={[dbTimeDayHM(n.created_at), n.autor].filter(Boolean).join(' · ')}
                      right={varovaniHosta([n.body]) ? <Chip tone="wait" size="sm" icon="warning">{t('pozor')}</Chip> : undefined} />
                  ))}
                </ul>
              )}
            <form onSubmit={pridej} className="flex gap-2 items-end flex-wrap">
              <Textarea aria-label={t('Nová poznámka')} rows={2} maxLength={NOTE_MAX} value={text} onChange={e => setText(e.target.value)}
                placeholder={t('Třeba: alergie na ořechy, nesnáší mléko')} className="flex-1 basis-56" />
              <Button type="submit" size="sm" variant="secondary" icon="plus" loading={busy} disabled={!text.trim()}>{t('Přidat poznámku')}</Button>
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
  const t = useT('sprava');
  const hledaClena = smiPrisne('zakaznici.zobrazit');
  const [q, setQ] = useState('');
  const [hledano, setHledano] = useState('');
  useEffect(() => { const c = setTimeout(() => setHledano(q.trim()), 300); return () => clearTimeout(c); }, [q]);
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
      if (!r.ok) { setChyba({ pole: typeof x?.pole === 'string' ? x.pole as PoleRucni : null, text: x?.error || t('Rezervaci se nepodařilo zapsat.') }); return; }
      onZapsano();
    } catch {
      setChyba({ pole: null, text: t('Rezervace se nezapsala — vypadlo připojení. Zkus to prosím znovu.') });
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
    <Modal open onClose={onZavrit} size="md" title={t('Nová rezervace')}
      subtitle={t('Host zavolal nebo stojí u dveří. Rezervace bude rovnou potvrzená.')}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>{t('Zrušit')}</Button>
        <Button type="submit" form="rez-nova" variant="primary" icon="check" loading={busy}>{t('Zapsat rezervaci')}</Button>
      </>}>
      <div className="space-y-4">
        <DraftNote koncept={koncept} />
        {chyba && !chyba.pole && <p className="note note-danger" role="alert">{chyba.text}</p>}
        {hledaClena && (
          form.hostId ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Chip tone="ink" icon="user">{t('člen: {jmeno}', { jmeno: kratkeJmeno(form.hostJmeno) })}</Chip>
              <Button type="button" size="sm" variant="ghost" icon="close" onClick={() => zmen({ hostId: 0, hostJmeno: '' })}
                aria-label={t('Odpojit člena {jmeno}', { jmeno: form.hostJmeno })}>{t('Odpojit')}</Button>
            </div>
          ) : (
            <div data-transient>
              <p className="field-label">{t('Napojit na člena')}</p>
              <SearchField value={q} onChange={setQ} placeholder={t('Najít člena podle jména')} ariaLabel={t('Najít člena')} />
              {hledano.length >= 2 && (
                clenove.error ? <p className="t-meta mt-2">{t('Členy se nepodařilo načíst. Rezervaci zapíšeš i bez napojení.')}</p>
                : !clenove.data ? <Skeleton className="h-11 mt-2" />
                : clenove.data.clenove.length === 0 ? <p className="t-meta mt-2">{t('Nikdo takový mezi členy. Zapiš hosta jen jménem.')}</p>
                : (
                  <ul className="list mt-1" aria-label={t('Nalezení členové')}>
                    {clenove.data.clenove.map(c => (
                      <ListRow key={c.id} title={c.jmeno} meta={c.navstev ? t('{n}× v podniku', { n: c.navstev }) : t('zatím nebyl')} onClick={() => vyberClena(c)} />
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
            <Field id="rez-jmeno" label={t('Jméno')} error={chybaPole('name')}>
              <Input id="rez-jmeno" value={form.jmeno} maxLength={RUCNI_MAX_JMENO} autoComplete="off" autoCapitalize="words"
                onChange={e => zmen({ jmeno: e.target.value })} placeholder="Jana Dvořáková" /* i18n-ok: ukázkové jméno */ />
            </Field>
            <Field id="rez-tel" label={t('Telefon')} error={chybaPole('phone')} hint={form.hostId ? t('Když ho člen má v profilu, vezme se odtamtud.') : undefined}>
              <Input id="rez-tel" type="tel" inputMode="tel" autoComplete="off" value={form.telefon} maxLength={RUCNI_MAX_TELEFON}
                onChange={e => zmen({ telefon: e.target.value })} placeholder="+420 776 221 004" />
            </Field>
          </div>
          <div className="space-y-2">
            <Segmented options={[{ id: 'dnes', label: t('Dnes') }, { id: 'zitra', label: t('Zítra') }]}
              value={jeDnes ? 'dnes' : form.datum === zitra ? 'zitra' : ''} size="sm" ariaLabel={t('Den rezervace')}
              onChange={v => zmen({ datum: v === 'dnes' ? dnes : zitra, jinyCas: false })} />
            {/* Datum a čas sdílí řádek i na telefonu (DESIGN „Na telefonu nesmí prvek skončit v půlce"). */}
            <div className="grid grid-cols-2 gap-3 items-start">
              <Field id="rez-den" label={t('Den')} error={chybaPole('date')}>
                <Input id="rez-den" type="date" min={dnes} max={nejpozdeji} value={form.datum}
                  onChange={e => zmen({ datum: e.target.value || dnes, jinyCas: false })} />
              </Field>
              <Field id="rez-cas" label={t('Čas')} error={chybaPole('time')}
                hint={zavreno ? t('V tento den má podnik zavřeno.') : jiny && den?.open && den?.close ? t('Otevřeno {od}–{do}.', { od: den.open, do: den.close }) : undefined}>
                {zapis && volby.length > 0 && (
                  <Select id={jiny ? 'rez-cas-volba' : 'rez-cas'} aria-label={jiny ? t('Volba času') : undefined} value={jiny ? JINY_CAS : form.cas}
                    onChange={e => (e.target.value === JINY_CAS ? zmen({ jinyCas: true }) : zmen({ cas: e.target.value, jinyCas: false }))}>
                    {volby.map(c => <option key={c} value={c}>{c === ted && nabidnoutTed ? t('Teď ({cas})', { cas: c }) : c}</option>)}
                    <option value={JINY_CAS}>{t('Jiný čas…')}</option>
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
            <Field id="rez-osob" label={t('Osob')} error={chybaPole('party')}>
              <Input id="rez-osob" type="number" inputMode="numeric" min={1} max={maxOsob} value={form.osob}
                onChange={e => zmen({ osob: e.target.value })} />
            </Field>
            <Field id="rez-stul" label={t('Stůl')} error={chybaPole('tableId')}>
              <Select id="rez-stul" value={form.stul} onChange={e => zmen({ stul: e.target.value })}>
                <option value="">{t('Bez stolu')}</option>
                {stoly.map(s => <option key={s.id} value={s.id}>{s.nazev} · {mist(t, s.mist)}</option>)}
              </Select>
            </Field>
          </div>
          <Field id="rez-pozn" label={t('Poznámka')} error={chybaPole('note')}>
            <Textarea id="rez-pozn" rows={2} maxLength={RUCNI_MAX_POZNAMKA} value={form.poznamka}
              onChange={e => zmen({ poznamka: e.target.value })} placeholder={t('Kočárek, oslava, alergie…')} />
          </Field>
        </form>
      </div>
    </Modal>
  );
}

// ---- Objednávky -----------------------------------------------------------------

function ObjednavkyStranka({ oznam, onZmena }: { oznam: Hlaska; onZmena: () => void }) {
  // Fronta beze změny; Historie je pohled majitele na celé období (kolik přišlo, za kolik, kolik nepřijato).
  const t = useT('sprava');
  const [pohled, setPohled] = useState<'fronta' | 'historie'>('fronta');
  // Dnešní rezervace kreslí nástroj (příjem u obsluhy); widget klient.dnesni_rezervace už ve výchozím
  // rozložení Objednávek není (dřív tytéž rezervace dvakrát pod sebou) — kdo ho chce, přidá si ho z galerie.
  return (
    <PlochaWidgetu
      stranka="vedeni.klient_objednavky"
      hlavicka={{
        title: t('Objednávky'),
        hintId: 'clientadmin-1',
        subtitle: pohled === 'fronta'
          ? t('Objednávky od stolu čekají na přijetí. Přijaté jdou do pokladny na stůl, hotové připíšou hostovi body.')
          : t('Objednávky od stolu za zvolené období. Skutečnou tržbu podniku ukazují Finance z pokladny.'),
        aside: <Segmented options={[{ id: 'fronta', label: t('Fronta') }, { id: 'historie', label: t('Historie') }]}
          value={pohled} onChange={setPohled} size="sm" ariaLabel={t('Fronta nebo historie objednávek')} />,
      }}
      nastroj={pohled === 'fronta' ? <StaffInbox onToast={x => oznam(x)} onZmena={onZmena} /> : <HistorieObjednavek />}
    />
  );
}

/** Objednávky od stolu za období: čtyři čísla (2 × 2 na telefonu) a seznam s časem, dobou přijetí a částkou. */
function HistorieObjednavek() {
  const cena = usePrice();
  const t = useT('sprava');
  const [obdobi, setObdobi] = useState<ObdobiHistorie>(() => obdobiZPresetu('dnes'));
  const r = platneRozmezi(obdobi);
  const url = `/api/client/admin/orders?from=${r.od}&to=${r.do}`;
  const data = useDataWidgetu(url, vyberHistoriiObjednavek);
  const vic = r.od !== r.do;
  const d = data.data;
  return (
    <div className="space-y-4">
      <ObdobiLista value={obdobi} onChange={setObdobi} volby={['dnes', 'vcera', '7_dni', 'mesic']} dnyTydne={false} hrubost={false} />
      {data.error ? <ErrorState title={t('Historie objednávek se nenačetla')} onRetry={data.reload} detail={data.error} />
        : !d ? <PageSkel />
        : (
          <>
            <Card>
              <StatRow>
                <Stat label={t('Objednávek')} value={String(d.souhrn.pocet)} />
                <Stat label={t('Od stolu celkem')} value={cena(d.souhrn.soucet)} note={d.souhrn.hotovych ? t('{n, plural, one {z # hotové} few {z # hotových} other {z # hotových}}', { n: d.souhrn.hotovych }) : t('zatím nic hotového')} />
                <Stat label={t('Průměr')} value={d.souhrn.prumer == null ? '–' : cena(d.souhrn.prumer)} />
                <Stat label={t('Nepřijato')} value={String(d.souhrn.neprijato)} tone={d.souhrn.neprijato > 0 ? 'wait' : 'muted'} />
              </StatRow>
            </Card>
            {d.objednavky.length === 0 ? (
              <Card><EmptyState icon="cup" compact title={t('Za tohle období žádné objednávky od stolu')} hint={t('Objeví se tu, jakmile si host objedná přes QR kód na stole.')} /></Card>
            ) : (
              <Card pad="none">
                <ul className="list px-5">
                  {d.objednavky.map(o => {
                    const st = ORDER_STATUS[o.stav] ?? ORDER_STATUS.new;
                    const doba = dobaObjednavky(o, parseDbTime);
                    const kdy = vic ? dbTimeDayHM(o.vytvoreno) : dbTimeHM(o.vytvoreno);
                    const casti = [kdy, doba ? (doba.co === 'prijato' ? t('přijato za {n} min', { n: doba.minut }) : doba.co === 'hotovo' ? t('hotovo za {n} min', { n: doba.minut }) : null) : null, polozkyKratce(o.polozky)];
                    return (
                      <ListRow key={o.id} title={`${o.stul ?? t('bez stolu')} · ${o.host}`} meta={casti.filter(Boolean).join(' · ')}
                        value={<span className="tabular-nums">{cena(o.castka)}</span>}
                        right={<Chip tone={st.tone} size="sm">{stavObjednavkyText(o.stav, st.label, t)}</Chip>} />
                    );
                  })}
                </ul>
                {d.celkem > d.objednavky.length && (
                  <p className="t-meta tabular-nums px-5 py-3 border-t border-black/5">{t('Zobrazeno posledních {n} z {celkem}. Kratší období ukáže všechny.', { n: d.objednavky.length, celkem: d.celkem })}</p>
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
  const t = useT('sprava');
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
    } catch (err) { oznam(apiMessage(err, t('Stůl se nepodařilo uložit.')), 'bad'); }
    setBusy(false);
  };
  const imp = async () => {
    setBusy(true);
    try { const r = await j('/api/client/admin/tables', { method: 'POST', body: JSON.stringify({ action: 'import' }) }); oznam(t('Z pokladny: {n} nových stolů, celkem {celkem}.', { n: r.added, celkem: r.total })); await load(); }
    catch (err) { oznam(apiMessage(err, t('Načtení z pokladny se nepovedlo.')), 'bad'); }
    setBusy(false);
  };
  const patch = async (id: number, body: Record<string, unknown>) => {
    try { await j('/api/client/admin/tables', { method: 'PATCH', body: JSON.stringify({ id, ...body }) }); await load(); }
    catch (err) { oznam(apiMessage(err, t('Změna se nepovedla.')), 'bad'); }
  };
  const smazat = async (s: StulRadek) => {
    try {
      const r = await fetch(`/api/client/admin/tables?id=${s.id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || t('Stůl se nepodařilo smazat.'));
      oznam(t('Stůl {nazev} smazán.', { nazev: s.name }));
    } catch (err) { oznam(apiMessage(err, t('Stůl se nepodařilo smazat.')), 'bad'); }
    load();
  };
  const novy = () => setOkno({ id: null, name: '', seats: 2 });

  const nastroj = error ? <ErrorState title={t('Stoly se nenačetly')} onRetry={load} detail={error} />
    : d === null ? <PageSkel />
    : d.tables.length === 0 ? (
      <Card>
        <EmptyState icon="location" title={t('Zatím žádné stoly')} compact
          hint={d.posConnected ? t('Načti je z pokladny, nebo přidej ručně.') : t('Ke stolu se váže rezervace i objednávka od hosta.')}
          action={upravuje && d.posConnected ? <Button variant="secondary" icon="download" loading={busy} onClick={imp}>{t('Načíst z pokladny')}</Button> : undefined} />
      </Card>
    ) : (
      <div className="space-y-4">
        <Card pad="none">
          <ul className="list px-5">
            {d.tables.map(s => {
              const polozky: MenuItem[] = [
                { label: t('Upravit název a místa…'), icon: 'pencil', onClick: () => setOkno({ id: s.id, name: s.name, seats: Number(s.seats) || 2 }) },
                { label: s.active ? t('Skrýt hostům') : t('Zobrazit hostům'), icon: s.active ? 'close' : 'check', onClick: () => { void patch(s.id, { active: !s.active }); } },
                ...(tiskne ? [{ label: t('Nový QR kód…'), icon: 'refresh', hint: t('Starý vytištěný kód přestane platit.'), onClick: () => setNovyQr(s) }] : []),
                { label: t('Smazat stůl…'), icon: 'trash', danger: true, onClick: () => setMazu(s) },
              ];
              return (
                <ListRow key={s.id} className={s.active ? '' : 'opacity-55'} title={s.name}
                  meta={`${mist(t, Number(s.seats) || 0)} · ${s.storyous_desk_id ? t('kasa #{id}', { id: s.storyous_desk_id }) : t('jen u nás')}${s.active ? '' : ` · ${t('skrytý')}`}`}
                  actions={(tiskne || upravuje) ? (
                    <>
                      {tiskne && <Button size="sm" variant="secondary" icon="print" onClick={() => otevriNaTisk(`/api/client/admin/tables/qr?tableId=${s.id}`, `qr-stul-${s.id}.html`)}>{t('QR na stůl')}</Button>}
                      {upravuje && <Menu size="sm" label={t('Další akce se stolem {nazev}', { nazev: s.name })} items={polozky} />}
                    </>
                  ) : undefined} />
              );
            })}
          </ul>
        </Card>
        {/* Tisk QR a plánek jsou samostatné nástroje, ne pokračování seznamu — proto sbalené. */}
        {tiskne && <QrDesigner toast={x => oznam(x)} tables={d.tables} smiUlozit={smi('klient.vzhled')} />}
        <FloorPlanEditor toast={x => oznam(x)} onSaved={load} smiUpravit={upravuje} />
      </div>
    );

  return (
    <>
      <PlochaWidgetu
        stranka="vedeni.klient_stoly"
        hlavicka={{
          title: t('Stoly'),
          hintId: 'clientadmin-6',
          subtitle: t('Ke stolům se vážou rezervace i objednávky. S napojenou pokladnou je vezmi odtamtud, ať sedí čísla. Tlačítko „QR na stůl" vytiskne kód, ze kterého host objedná.'),
          primary: upravuje ? <Button variant="accent" icon="plus" onClick={novy}>{t('Přidat stůl')}</Button> : undefined,
          menu: upravuje && d?.posConnected ? [{ label: t('Načíst stoly z pokladny'), icon: 'download', onClick: () => { void imp(); }, hint: t('Převezme čísla stolů z kasy, ať sedí s účty.') }] : undefined,
        }}
        nastroj={nastroj}
      />
      {okno && (
        <Modal open onClose={() => setOkno(null)} title={okno.id ? t('Upravit stůl') : t('Nový stůl')} size="sm"
          footer={<>
            <Button variant="secondary" onClick={() => setOkno(null)}>{t('Zrušit')}</Button>
            <Button type="submit" form="stul-okno" variant="primary" icon={okno.id ? 'check' : 'plus'} loading={busy}>{okno.id ? t('Uložit') : t('Přidat stůl')}</Button>
          </>}>
          <form id="stul-okno" onSubmit={ulozit} className="space-y-4">
            <Field id="t-name" label={t('Název stolu')}>
              <Input id="t-name" autoFocus value={okno.name} maxLength={60} onChange={e => setOkno({ ...okno, name: e.target.value })} placeholder={t('U okna')} />
            </Field>
            <Field id="t-seats" label={t('Kolik míst')}>
              <Input id="t-seats" type="number" min={1} max={40} value={okno.seats}
                onChange={e => setOkno({ ...okno, seats: Math.max(1, parseInt(e.target.value || '1', 10) || 1) })} />
            </Field>
          </form>
        </Modal>
      )}
      {mazu && (
        <Potvrzeni title={t('Smazat stůl {nazev}?', { nazev: mazu.name })} akce={t('Smazat')} onZavrit={() => setMazu(null)}
          text={t('Rezervace a objednávky, které na něj byly, zůstanou — jen bez stolu. Vytištěný QR kód přestane fungovat.')}
          onPotvrdit={() => { void smazat(mazu); }} />
      )}
      {novyQr && (
        <Potvrzeni title={t('Nový QR kód pro stůl {nazev}?', { nazev: novyQr.name })} akce={t('Vygenerovat')} onZavrit={() => setNovyQr(null)}
          text={t('Starý vytištěný kód přestane platit. Nový pak vytiskni a vyměň na stole.')}
          onPotvrdit={() => { void patch(novyQr.id, { rotate_token: true }); }} />
      )}
    </>
  );
}

// ---- Hosté ----------------------------------------------------------------------
//
// Kolo 92: Hosté jsou CRM — segmenty s počty, hodnota hosta v řádku, štítky a profil
// s časovou osou (ClenoveSprava). Hodnocení, zprávy a automatizace mají vlastní stránky
// (Hodnocení, Kampaně) — dřív čtyři části pod jedním přepínačem „Zákazníci".

function ZakazniciStranka({ oznam, hledat, profil }: { oznam: Hlaska; hledat: string; profil: { id: number; n: number } | null }) {
  const { ma } = useOpravneni();
  const t = useT('sprava');
  // Kupon vybraným členům: akce v liště výběru, okno posílání kuponů je z části Kupony.
  const [kuponVyber, setKuponVyber] = useState<VyberHostu | null>(null);
  const dalsiAkce = ma('kupony.spravovat') ? (vyber: VyberHostu) => [{ label: t('Kupon'), icon: 'tag', onClick: () => setKuponVyber(vyber) }] : undefined;
  return (
    <>
    {kuponVyber && <KuponVybranym vyber={kuponVyber} oznam={oznam} onZavrit={() => setKuponVyber(null)} onHotovo={() => setKuponVyber(null)} />}
    <PlochaWidgetu
      stranka="vedeni.klient_zakaznici"
      hlavicka={{
        title: t('Hosté'),
        hintId: 'clientadmin-7',
        subtitle: t('Kdo k vám chodí, kolik utratí a kdy přišel naposledy.'),
      }}
      nastroj={<ClenoveSprava oznam={oznam} hledat={hledat} dalsiAkce={dalsiAkce} otevritProfil={profil} />}
    />
    </>
  );
}

/** Hodnocení: samostatná stránka (dřív část Zákazníků). */
function HodnoceniStranka({ oznam }: { oznam: Hlaska }) {
  const t = useT('sprava');
  return (
    <div className="px-4 min-[360px]:px-5 pt-3 pb-4 sm:p-6 space-y-5">
      <PageHeader hintId="clientadmin-hodnoceni" title={t('Hodnocení')}
        subtitle={t('Host dostane po návštěvě výzvu k hodnocení. Slabé hodnocení ti přijde jako oznámení.')} />
      <Recenze oznam={oznam} />
    </div>
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
  const t = useT('sprava');
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
  if (error) return <ErrorState title={t('Hodnocení se nenačetla')} onRetry={reload} detail={error} />;
  if (!d) return <PageSkel />;
  const { h, crew } = d;
  if (h.pocet === 0) return <Card><EmptyState icon="star" title={t('Zatím žádné hodnocení')} hint={t('Objeví se, jakmile host ohodnotí hotovou návštěvu.')} compact /></Card>;
  // Počty na pilulkách jsou v rámci období — ať je vidět, kam má cenu klikat (DESIGN „Filtrovací pás").
  const vObdobi = filtrujHodnoceni(h.posledni, 'vse', rozmezi, pragueDaySafe);
  const pocty = poctyHodnoceni(vObdobi);
  const seznam = filtrujHodnoceni(vObdobi, filtr, null, pragueDaySafe);
  const ulozit = async (v: Recenze, telo: { reply?: string; resolved?: boolean }) => {
    setBusy(true);
    try {
      await j('/api/client/admin/reviews', { method: 'PATCH', body: JSON.stringify({ id: v.id, ...telo }) });
      oznam(telo.reply !== undefined ? t('{host} dostane tvoji odpověď.', { host: v.host }) : telo.resolved ? t('Hodnocení označeno jako vyřízené.') : t('Hodnocení je zase mezi nevyřízenými.'));
      setOdpovidam(null);
      reload();
    } catch (e) { oznam(apiMessage(e, t('Nepovedlo se uložit.')), 'bad'); }
    setBusy(false);
  };
  const popisFiltru = (id: FiltrHodnoceni, popisek: string) =>
    id === 'vse' ? t('Vše') : id === 'komentar' ? t('S komentářem') : id === 'nevyrizene' ? t('Nevyřízené') : popisek;
  return (
    <>
    <div className="grid grid-cols-1 md:grid-cols-[minmax(14rem,auto)_1fr] gap-4 items-start">
      <Card className="space-y-4">
        <Stat label={t('Průměr')} value={prumerCesky(h.prumer)} unit="/ 5" note={hodnoceni(t, h.pocet)} />
        <BarSpark height={56} showLabels label={t('Rozložení hodnocení od jedné do pěti hvězd')}
          data={h.rozlozeni.map((n, i) => ({ value: n, label: String(i + 1), tip: t('{h} z 5: {pocet}', { h: i + 1, pocet: hodnoceni(t, n) }) }))} />
      </Card>
      <div className="space-y-3 min-w-0">
        <ObdobiLista value={obdobi} onChange={setObdobi} volby={['7_dni', 'mesic', '90_dni', '365_dni']} dnyTydne={false} hrubost={false} />
        <div className="flex gap-1.5 overflow-x-auto scroll-fade-x" role="group" aria-label={t('Filtr hodnocení')}>
          {FILTRY_HODNOCENI.map(f => (
            <button key={f.id} type="button" aria-pressed={filtr === f.id}
              onClick={() => setFiltr(x => (x === f.id && f.id !== 'vse' ? 'vse' : f.id))}
              className={`filter-pill tap-target-sm tabular-nums whitespace-nowrap ${filtr === f.id ? 'seg-on' : 'seg-off glass'}`}>{popisFiltru(f.id, f.popisek)} · {pocty[f.id]}</button>
          ))}
        </div>
        {seznam.length === 0 ? (
          <Card><EmptyState icon="star" compact title={filtr === 'nevyrizene' ? t('Nic nevyřízeného') : t('Za tohle období žádné hodnocení')}
            hint={filtr === 'nevyrizene' ? t('Všechna slabá hodnocení mají odpověď, nebo jsou vyřízená.') : t('Zkus delší období nebo jiný filtr.')} /></Card>
        ) : (
        <Card pad="none">
          <ul className="list px-5">
            {seznam.map(v => {
              const lide = crew.get(v.id) ?? [];
              const dalsi: MenuItem[] = [
                v.vyrizeno
                  ? { label: t('Vrátit mezi nevyřízené'), icon: 'undo', onClick: () => { void ulozit(v, { resolved: false }); } }
                  : { label: t('Označit jako vyřízené'), icon: 'check', hint: t('Probráno se směnou nebo host odškodněný. Host to nevidí.'), onClick: () => { void ulozit(v, { resolved: true }); } },
              ];
              return (
                <li key={v.id} className="list-row items-start flex-wrap sm:flex-nowrap">
                  <div className="min-w-0 flex-1 basis-56">
                    <p className="text-[15px] font-medium leading-snug text-[#16181A] flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="truncate">{v.host}</span>
                      <span className={`inline-flex items-center gap-0.5 shrink-0 tabular-nums ${v.hvezdy <= 2 ? 'text-wait-ink' : 'text-black/55'}`} aria-label={t('{h} z 5', { h: v.hvezdy })}>
                        {v.hvezdy}<Icon name="star" size={14} />
                      </span>
                      {v.odpoved && <Chip tone="ok" size="sm" icon="check">{t('odpovězeno')}{v.odpovedel ? ` · ${v.odpovedel}` : ''}</Chip>}
                      {v.vyrizeno && <Chip tone="muted" size="sm">{t('vyřízeno')}</Chip>}
                      {jeNevyrizene(v) && <Chip tone="wait" size="sm">{t('nevyřízené')}</Chip>}
                    </p>
                    <p className={`text-sm mt-0.5 text-pretty ${v.poznamka ? 'text-black/70' : 'text-black/45'}`}>{v.poznamka ? `„${v.poznamka}“` : t('Bez komentáře.')}</p>
                    <p className="t-meta mt-1">{dbTimeDayHM(v.kdy)} · {v.zdroj === 'objednavka' ? t('objednávka od stolu') : t('rezervace')}</p>
                    {v.odpoved && (
                      <p className="text-sm mt-1.5 text-black/70 flex items-start gap-1.5 text-pretty">
                        <Icon name="chat" size={13} className="shrink-0 mt-0.5" />
                        <span className="min-w-0 whitespace-pre-line"><span className="sr-only">{t('Odpověď podniku:')} </span>{v.odpoved}{v.odpovedenoKdy ? <span className="t-meta"> · {dbTimeDayHM(v.odpovedenoKdy)}</span> : null}</span>
                      </p>
                    )}
                    {lide.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span className="t-meta">{t('Ten den na směně:')}</span>
                        {lide.map(c => <PersonChip key={c.name} name={c.name} avatar={c.avatar} size="sm" tone={v.hvezdy <= 2 ? 'wait' : 'muted'} />)}
                      </div>
                    )}
                  </div>
                  <div className="list-actions flex gap-1.5 shrink-0 ml-auto">
                    <Button size="sm" variant="secondary" icon="chat" onClick={() => setOdpovidam({ v, text: v.odpoved ?? '', vyridit: v.vyrizeno })}
                      aria-label={`${v.odpoved ? t('Upravit odpověď') : t('Odpovědět')}: ${v.host}, ${t('{h} z 5', { h: v.hvezdy })}`}>{v.odpoved ? t('Upravit odpověď') : t('Odpovědět')}</Button>
                    <Menu size="sm" label={t('Další akce s hodnocením {host}', { host: v.host })} items={dalsi} />
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
      <Modal open onClose={() => setOdpovidam(null)} size="md" title={t('Odpověď pro {host}', { host: odpovidam.v.host })}
        subtitle={`${t('{h} z 5', { h: odpovidam.v.hvezdy })} · ${odpovidam.v.poznamka ? `„${odpovidam.v.poznamka}“` : t('bez komentáře')}`}
        footer={<>
          <Button variant="secondary" onClick={() => setOdpovidam(null)}>{t('Zrušit')}</Button>
          <Button variant="primary" icon="send" loading={busy} disabled={!odpovidam.text.trim()}
            onClick={() => { void ulozit(odpovidam.v, { reply: odpovidam.text.trim(), resolved: odpovidam.vyridit }); }}>{t('Odeslat odpověď')}</Button>
        </>}>
        <div className="space-y-4">
          <Field id="rec-odpoved" label={t('Odpověď hostovi')} hint={t('Host dostane oznámení a odpověď uvidí v Moje stránka.')}>
            <Textarea id="rec-odpoved" rows={4} maxLength={ODPOVED_MAX} value={odpovidam.text} autoFocus
              onChange={e => setOdpovidam(o => (o ? { ...o, text: e.target.value } : o))} placeholder={t('Děkujeme za zpětnou vazbu. Příště…')} />
          </Field>
          <ul className="list">
            <SwitchRow title={t('Označit jako vyřízené')} hint={t('Probráno se směnou nebo host odškodněný. Jen pro podnik, host to nevidí.')}
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
  const t = useT('sprava');
  const { data: d, error, reload, set: setD } = useLoad<any>('/api/client/admin/profile', raw => {
    if (!raw || typeof raw !== 'object' || !raw.profile) throw new Error(t('Profil podniku se nepodařilo přečíst'));
    return raw;
  });
  const [pOverride, setP] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const p = pOverride ?? d?.profile ?? null;
  if (error) return <ErrorState title={t('Nastavení se nenačetlo')} onRetry={reload} detail={error} />;
  if (!d || !p) return <PageSkel />;
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const r = await j('/api/client/admin/profile', { method: 'PUT', body: JSON.stringify({ enabled: p.enabled, slug: p.slug, reservations_on: p.reservations_on, ordering_on: p.ordering_on, max_party: p.max_party, lead_days: p.lead_days, slot_minutes: p.slot_minutes, menu_slug: p.menu_slug || null,
        order_qr_required: p.order_qr_required, order_geo: p.order_geo, lat: p.lat ?? '', lng: p.lng ?? '', geo_radius_m: p.geo_radius_m, order_auto_pos: p.order_auto_pos,
        // Před migrací sloupců (profil je nemá) se nic neposílá, ať uložení zbytku nespadne.
        ...(p.auto_confirm !== undefined ? { auto_confirm: p.auto_confirm === true, auto_confirm_max_party: Number(p.auto_confirm_max_party) || 0 } : {}) }) });
      setP(r.profile); setD({ ...d, url: r.url }); oznam(r.profile.enabled ? t('Uloženo. Podnik je pro hosty zapnutý.') : t('Uloženo. Podnik je zatím vypnutý.')); onChange();
    } catch (err) { oznam(apiMessage(err, t('Uložení se nepovedlo.')), 'bad'); }
    setBusy(false);
  };
  const copy = () => { navigator.clipboard?.writeText(d.url).then(() => oznam(t('Adresa zkopírována.'))).catch(() => {}); };
  const useMyPosition = () => {
    if (!navigator.geolocation) { oznam(t('Prohlížeč neumí polohu.'), 'bad'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => { setP((x: any) => ({ ...(x ?? p), lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) })); setLocating(false); oznam(t('Poloha načtena s přesností {n} m. Nezapomeň uložit.', { n: Math.round(pos.coords.accuracy) })); },
      () => { setLocating(false); oznam(t('Polohu se nepodařilo zjistit. Povol ji v prohlížeči.'), 'bad'); },
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
      <PageHeader hintId="clientadmin-8" title={t('Nastavení')} subtitle={t('Jak podnik vidí hosté a co u něj můžou dělat.')} primary={<Button type="submit" variant="accent" loading={busy}>{t('Uložit')}</Button>} />
      {/* v4 (P13): karty nastavení jedna stupnice — skupiny 12 (řádek přepínače má vlastních 12),
          pole ↔ pole 16, popisek ↔ pole 6; řady 44 přes celou šířku (P2, P7). */}
      <Card className="sloupec sloupec-3">
        <ul className="list">
          <SwitchRow title={t('Zapnout pro hosty')} hint={t('Podnik se ukáže na své adrese a hosté se k němu můžou přidat.')} checked={!!p.enabled} onChange={v => setP({ ...p, enabled: v })} />
        </ul>
        <Field id="s-slug" label={t('Veřejná adresa')} hint={<span className="break-all">{d.url}</span>}>
          <div className="rada rada-pruzna rada-m">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm text-black/50 shrink-0">/client/</span>
              <Input id="s-slug" value={p.slug} onChange={e => setP({ ...p, slug: e.target.value })} className="flex-1 min-w-0 !w-auto" />
            </div>
            {/* Na telefonu jen ikona (popisek zůstává čtečce a v bublině), ať zbude místo na adresu. */}
            <Button type="button" variant="secondary" icon="copy" title={t('Kopírovat')} className="max-sm:!w-11 max-sm:!px-0" onClick={copy}><span className="max-sm:sr-only">{t('Kopírovat')}</span></Button>
          </div>
        </Field>
        {!hoursOk && <p className="note note-wait">{t('Podnik nemá vyplněnou otevírací dobu (Rozvrh → Otevírací doba). Bez ní hosté nemůžou rezervovat.')}</p>}
      </Card>
      <Card className="sloupec sloupec-4">
        <h2 className="t-card">{t('Nabídka pro hosty')}</h2>
        <Field id="s-menu" label={t('Které menu se hostům ukáže')} hint={t('Nabídku spravuješ v záložce Menu. Logo, fotky a text o podniku najdeš ve Vzhledu.')}>
          <Select id="s-menu" value={p.menu_slug ?? ''} onChange={e => setP({ ...p, menu_slug: e.target.value })}>
            <option value="">{t('První zapnuté menu')}</option>
            {boards.map((b: any) => (
              <option key={b.slug} value={b.slug}>{b.name}{b.items > 0 ? ` — ${t('{n} z {celkem} položek se tiskne na kase', { n: b.linked, celkem: b.items })}` : ` — ${t('zatím prázdné')}`}</option>
            ))}
          </Select>
        </Field>
        {p.ordering_on && vybrane && chybi > 0 && (
          <p className="note note-wait">
            {t('V menu „{menu}" nemá {n, plural, one {# položka} few {# položky} other {# položek}} produkt v pokladně. Objednávka, ve které taková položka bude, se do Storyous nepošle a na terminálu se nevytiskne — spáruj je v záložce Menu.', { menu: vybrane.name, n: chybi })}
          </p>
        )}
      </Card>
      <Card className="sloupec sloupec-3">
        <h2 className="t-card">{t('Rezervace a objednávky')}</h2>
        {/* Tři přepínače v jednom seznamu (dřív dva seznamy po sobě — mezera 36 uprostřed karty);
            hranice automatického potvrzení je řádek seznamu hned pod svým přepínačem. */}
        <ul className="list">
          <SwitchRow title={t('Hosté můžou rezervovat')} checked={!!p.reservations_on} onChange={v => setP({ ...p, reservations_on: v })} />
          {/* Malá kavárna nemá nikoho, kdo by požadavky hlídal: rezervace se potvrdí sama
              a ručně se schvalují jen velké skupiny (jako instant booking v OpenTable a Resy). */}
          <SwitchRow title={t('Potvrzovat rezervace automaticky')}
            hint={Number(p.auto_confirm_max_party) > 0
              ? t('Větší skupiny (od {n} osob) dál čekají na tvé potvrzení.', { n: Number(p.auto_confirm_max_party) + 1 })
              : t('Host má potvrzeno hned po odeslání. Hranici pro velké skupiny nastavíš pod přepínačem.')}
            checked={p.auto_confirm === true} onChange={v => setP({ ...p, auto_confirm: v })} />
          {p.auto_confirm === true && (
            <li className="pb-3">
              <Field id="s-auto-max" label={t('Samy se potvrdí skupiny do (osob)')} hint={t('0 = všechny velikosti. Větší skupiny počkají, až je potvrdíš v Rezervacích.')}>
                <Input id="s-auto-max" type="number" inputMode="numeric" min={0} max={40} value={p.auto_confirm_max_party ?? 0}
                  onChange={e => setP({ ...p, auto_confirm_max_party: e.target.value })} />
              </Field>
            </li>
          )}
          <SwitchRow title={t('Hosté můžou objednávat od stolu')} hint={t('Objednávky potřebují stoly (záložka Stoly) a nabídku z Menu. S napojenou pokladnou jdou přijaté objednávky rovnou na stůl v kase.')}
            checked={!!p.ordering_on} onChange={v => setP({ ...p, ordering_on: v })} />
        </ul>
        {/* Tři krátká čísla jako 3 × ⅓ i na telefonu (P2). */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <Field id="s-party" label={t('Nejvíc osob')}><Input id="s-party" type="number" min={1} max={40} value={p.max_party} onChange={e => setP({ ...p, max_party: e.target.value })} /></Field>
          <Field id="s-lead" label={t('Dní dopředu')}><Input id="s-lead" type="number" min={1} max={180} value={p.lead_days} onChange={e => setP({ ...p, lead_days: e.target.value })} /></Field>
          <Field id="s-slot" label={t('Krok (min)')}><Input id="s-slot" type="number" min={15} max={120} step={15} value={p.slot_minutes} onChange={e => setP({ ...p, slot_minutes: e.target.value })} /></Field>
        </div>
      </Card>
      <Card className="sloupec sloupec-3">
        <div>
          <h2 className="t-card">{t('Ochrana objednávek od stolu')}</h2>
          <p className="t-meta mt-0.5">{t('Aby objednával jen ten, kdo u stolu opravdu sedí. Dvě nezávislé stopy: QR kód na stole a poloha telefonu.')}</p>
        </div>
        <ul className="list">
          <SwitchRow title={t('Objednat jde jen přes QR kód na stole')} hint={t('Každý stůl má v QR svůj tajný kód (Stoly → QR na stůl). Odkaz z domova nebo ručně vybraný stůl neprojde.')}
            checked={p.order_qr_required !== false} onChange={v => setP({ ...p, order_qr_required: v })} />
        </ul>
        <Field id="s-geo" label={t('Poloha hosta')}>
          <Select id="s-geo" value={p.order_geo ?? 'block'} onChange={e => setP({ ...p, order_geo: e.target.value })}>
            <option value="block">{t('Blokovat objednávky mimo podnik')}</option>
            <option value="warn">{t('Jen upozornit obsluhu, objednávku nechat čekat')}</option>
            <option value="off">{t('Neověřovat')}</option>
          </Select>
        </Field>
        {p.order_geo !== 'off' && !hasCoords && <p className="note note-wait">{t('Poloha podniku není nastavená, ověření polohy zatím neběží. Stoupni si v podniku s telefonem a klepni na „Použít moji polohu".')}</p>}
        {/* Šířka a délka 2 × ½, „Použít moji polohu" pod nimi přes celou šířku (na telefonu se dřív zalomila vlevo). */}
        <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_auto] gap-x-3 gap-y-4 items-end">
          <Field id="s-lat" label={t('Zeměpisná šířka')}><Input id="s-lat" inputMode="decimal" value={p.lat ?? ''} onChange={e => setP({ ...p, lat: e.target.value })} placeholder="49.1951" /></Field>
          <Field id="s-lng" label={t('Zeměpisná délka')}><Input id="s-lng" inputMode="decimal" value={p.lng ?? ''} onChange={e => setP({ ...p, lng: e.target.value })} placeholder="16.6068" /></Field>
          <Button type="button" variant="secondary" icon="location" className="col-span-2 sm:col-span-1" loading={locating} onClick={useMyPosition}>{t('Použít moji polohu')}</Button>
        </div>
        <Field id="s-radius" label={t('Poloměr (m)')} hint={t('K poloměru se přičítá přesnost telefonu (nejvýš 50 m). Sto metrů pokryje podnik i zahrádku.')}>
          <Input id="s-radius" type="number" min={30} max={1000} step={10} value={p.geo_radius_m ?? 100} onChange={e => setP({ ...p, geo_radius_m: e.target.value })} />
        </Field>
        <ul className="list">
          <SwitchRow title={t('Ověřené objednávky posílat rovnou do pokladny')}
            hint={t('S QR i polohou v pořádku jde objednávka bez čekání na stůl v kase a terminál Storyous ji vytiskne podle svého nastavení tiskáren. Neověřené čekají na přijetí obsluhou.')}
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
    <Card className="sloupec sloupec-4" aria-labelledby="s-karticka">
      <div>
        <h2 id="s-karticka" className="t-card">{PRECHOD_OTAZKA}</h2>
        <p className="t-meta mt-0.5 text-pretty">{PRECHOD_POPIS}</p>
      </div>
      <Button type="button" variant="secondary" icon="upload" className="w-full" onClick={imp.otevri}>{PRECHOD_TLACITKO}</Button>
      {imp.okno}
    </Card>
  );
}

