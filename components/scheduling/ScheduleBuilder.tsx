'use client';

// Rozvrh (vedení) — plocha s widgety a měsíční plánovač jako hlavní nástroj
// (kolo 69, balík B1, spec §6.2).
//
// Do kola 68 měla obrazovka vlastní hlavičku s ručním přepínačem měsíce
// a záložkami z ručních pilulek, nad mřížkou natvrdo kartu Dostupnost týmu
// (limetkové dlaždice lidí) a červenou tónovanou kartu Děr v obsazení, pod
// ní (v layoutu) modrou kartu Výměn a Žádosti o volno s limetkou v každém
// řádku — devět limetkových ploch na jedné obrazovce (DP §1.3). Ty bloky
// jsou teď widgety (components/widgety/oblasti/rozvrh.tsx), každý se svým
// dotazem za svým oprávněním. Tady zůstal plánovač: měsíc, lišta akcí
// v hlavičce (Vygenerovat = jediná limetka, Publikovat vedle, zbytek v „···"),
// náhled návrhu a úprav a mřížka s oknem dne. Záložky nastavení (Typy směn,
// Otevírací doba, Pevné dny, Pravidla) widgety nemají — plocha je jen u
// záložky Rozvrh, ostatní mají stejnou hlavičku bez mřížky widgetů.
//
// Oprávnění (dřív žádná — role s náhledem rozvrhu dostala plánovač, jehož
// dotazy skončily 403 a nakreslily prázdný měsíc): plánovač jen
// s rozvrh.zobrazit, jinak náhled z /api/shifts?team=1 bez akcí; každá akce
// za svým klíčem (upravit, generovat, publikovat, mazat_mesic, exportovat,
// nastaveni), dostupnost a volno se načítají jen s dostupnost.zobrazit
// a volno.zobrazit.
//
// Widgety s plánovačem mluví událostmi (lib/rozvrhPrehled.ts): „Díry"
// otevřou den, „Dostupnost týmu" okno dostupnosti člověka a schválená výměna
// nebo volno plánovač znovu načte. EmployerLayout (jiný balík) argument
// pohledu Rozvrhu nepředává, proto z jiné stránky žádost počká
// v sessionStorage.

import { Fragment, useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { odsazeniMesice, zacatekTydne, type ZacatekTydne } from '@/lib/week';
import { nazvyDnuDlouze, zkratkyDnuJazyk } from '@/lib/weekJazyk';
import { useCurrency } from '@/components/CurrencyProvider';
import { dayPrefLabel, prefAllowsSlot } from '@/lib/dayPrefs';
import { openSpan, uncovered, typeFitsDay, toHM, urovenDiry } from '@/lib/coverage';
import { Icon } from '../Icons';
import {
  Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Modal, MonthNav, PageHeader, Segmented,
  SelectBox, Select, Skeleton, Switch, SwitchRow, Toast, Well, type MenuItem,
} from '../ui';
import ShiftCalendar from './ShiftCalendar';
import { usePlan, UpgradeModal } from '../Pro';
import { apiMessage, okJson } from '@/lib/api';
import { openPrint, esc } from '@/lib/printDoc';
import { ulozSoubor } from '@/lib/stahni';
import { useJazyk, useT, type PrekladFn } from '@/lib/i18n/client';
import { tg } from '@/lib/i18n/stav';
import { fmtDatum } from '@/lib/i18n/format';
import type { Jazyk } from '@/lib/i18n/config';
import { dnuTxt, hodinTxt, hodinuTxt, hodinyTextJ, prelozPopisStavu, rozsahVolnaJ, smenTxt, upozorneniTxt } from './texty';
import { pragueToday } from '@/lib/pragueTime';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu } from '../widgety/useDataWidgetu';
import { nactiTeamsMine, useOpravneni } from '../role/useOpravneni';
import { nastavRozepsanyNavrh } from '../role/rozepsano';
import { prepocitejDen, stavClenaDne, seradRadky, kolize, vychoziTyp, type StavClenaDne, type TypDne } from '@/lib/rozvrhDen';
import { sestavCsv, rozeberCsv } from '@/lib/rozvrhCsv';
import {
  KLIC_DEN, KLIC_DOSTUPNOST, UDALOST_DEN, UDALOST_DOSTUPNOST, UDALOST_ZMENA, den as denZ, hm as hmZ, posunMesice,
  kategorieBarvy, rozsahVolna,
} from '@/lib/rozvrhPrehled';
import {
  KLIC_FILTRU, KLIC_PREHLEDU, PRAZDNY_FILTR, klicFiltru, procistiFiltr, jeAktivni, nactiFiltr, nactiRazeni, prepni, projdeSmena, denProjde,
  pocetPodleLidi, pocetPodleTypu, lideFiltru, lideDoPasu, typyDoPasu, popisFiltru, popisVysledku, vytizeni, seradVytizeni,
  type FiltrRozvrhu, type RazeniVytizeni, type SmenaFiltru,
} from '@/lib/rozvrhFiltr';
import { ListaFiltru, PasLidi, PasTypu, PrehledLidi, StavFiltru } from './RozvrhFiltr';

interface Props {
  user: { id?: string; name?: string | null; avatar?: string; role?: string };
}

interface Member {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}
interface Submission {
  employeeId: number;
  employeeName: string;
  employeeAvatar: string;
  unavailableDates: string[];
  dayPreferences?: Record<string, string>;
  preferredShift: string | null;
  maxShifts: number | null;
  note: string | null;
}
interface Shift {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeAvatar: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
}
/**
 * Úsek otevírací doby, kdy v podniku není nikdo. `uroven` od generátoru
 * i z /api/schedule: povinná = nikdo neotevře (podnik se neotevře),
 * žádoucí = prázdno později během dne. Bez úrovně (starší odpověď) se bere
 * jako povinná — radši hlasitě než potichu.
 */
interface Gap {
  date: string;
  from: string;
  to: string;
  minutes: number;
  uroven?: 'povinna' | 'zadouci';
}
/** Typ směny, který se na ten den vejde, ale nikdo na něm není. */
interface MissingSlot {
  date: string;
  shiftTypeName: string;
  uroven?: 'povinna' | 'zadouci';
}
/** Doporučení počtu lidí podle tržeb — jen když je v Pravidlech zapnuté. */
interface Doporuceni {
  date: string;
  lidi: 1 | 2;
  trzba: number;
  vzorek: number;
  usporaHodin: number;
  /** Tržba by stačila na jednoho, ale otevírací směna nepokryje celý den — obsazeno normálně. */
  nepokryjeJeden?: boolean;
}
/** Doporučení „stačí jeden", které generátor opravdu uplatnil (druhou směnu vynechal). */
const jedenUplatnen = (x: Doporuceni | undefined) => x?.lidi === 1 && !x.nepokryjeJeden;
interface NahledGeneratoru {
  proposed: Proposed[];
  warnings: string[];
  gaps: Gap[];
  understaffed: MissingSlot[];
  /** Chybí, když je doporučení podle tržeb vypnuté (UI pak o tržbách mlčí). */
  doporuceni?: Doporuceni[];
  trzby?: { stav: 'ok' | 'bez_opravneni' | 'bez_dat' | 'bez_prahu'; prah: number | null };
  hodiny?: { celkem: number; usporaDoporucenim: number };
  /** Z čeho návrh vyšel: true = uložení přepíše měsíc, false = návrh vedle uložených směn. */
  nahradit?: boolean;
  /**
   * Vedení návrh ručně upravilo (přidalo nebo odebralo směnu). Pak se před
   * každou akcí, která návrh zahodí (nové generování, Zahodit náhled,
   * přepnutí přepisu měsíce), ptáme — ruční úpravy jsou práce, kterou už
   * generátor nevrátí.
   */
  upraveno?: boolean;
}
const jePovinna = (g: { uroven?: string }) => g.uroven !== 'zadouci';
interface ShiftType {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  position: number;
  startsAtOpen?: boolean;
  endsAtClose?: boolean;
  /** Typ ze zdrojového podniku organizace (kolo 60) — jen ke čtení. */
  zOrganizace?: boolean;
  /** Vlastní typ, který organizace sdílí do ostatních podniků. */
  sdileno?: boolean;
  /** Název podniku, který sdílený typ spravuje. */
  spravuje?: string | null;
}
interface FixedAssignment {
  id: number;
  employeeId: number;
  employeeName: string;
  employeeAvatar: string;
  weekday: number;
  shiftTypeId: number | null;
  shiftTypeName: string | null;
  startTime: string | null;
  endTime: string | null;
  color: string | null;
}
interface OpeningDay {
  open: string;
  close: string;
  closed: boolean;
}
interface Proposed {
  employeeId: number;
  employeeName: string;
  employeeAvatar: string;
  date: string;
  startTime: string;
  endTime: string;
  type: string;
  shiftTypeId: number;
  shiftTypeName: string;
  color: string;
  /** Směna, která otvírá podnik (od generátoru). */
  oteviraci?: boolean;
}

// `nazvyDnuDlouze` (lib/weekJazyk) se používá tam, kde index NENÍ sloupec mřížky, ale
// klíč otevírací doby (0 = pondělí). Ten se nesmí přeskládat podle toho,
// jak si podnik nastavil začátek týdne — posunulo by mu to otevírací dobu.
// Barvy typů = kategorie cat-dot-1…6 z globals.css (DP §6.9), ve stejném pořadí. Ukládá se dál
// hex kvůli kompatibilitě se staršími typy a s API; kreslí se ale vždy třídou kategorie
// (tridaTecky), takže „Odpolední" má v plánovači stejný odstín jako ve widgetech a Mých směnách.
const COLORS = ['#C8F542', '#0A84FF', '#8B5CF6', '#F59E0B', '#14B8A6', '#EC4899'];
/** Třída tečky typu: kategorie podle barvy, neznámá (i stará šedá #64748B) = neutrální šedá. */
function tridaTecky(barva: unknown): string {
  const k = kategorieBarvy(barva);
  return k ? `cat-dot-${k}` : 'bg-black/15';
}
const DEFAULT_TYPES = [
  { name: 'Ranní', startTime: '06:00', endTime: '14:00', color: '#C8F542' },
  { name: 'Odpolední', startTime: '14:00', endTime: '22:00', color: '#3B82F6' },
];

/** Bez překladu: klíč pro filtr typů. */
const KLIC_CS = (klic: string) => klic;

// Resolve a shift's display name + colour from the team's configured shift
// types — matched by name first, then by exact times — so the calendar always
// shows the configured naming instead of the legacy morning/afternoon labels.
function resolveShiftType(
  s: { type?: string; startTime?: string; endTime?: string },
  types: ShiftType[],
  t: (klic: string) => string,
): { label: string; color: string } {
  const byName = types.find((x) => x.name === s.type);
  if (byName) return { label: byName.name, color: byName.color || '#64748B' };
  const byTime = types.find((x) => x.startTime === s.startTime && x.endTime === s.endTime);
  if (byTime) return { label: byTime.name, color: byTime.color || '#64748B' };
  const legacy = s.type === 'morning' ? t('Ranní') : s.type === 'afternoon' ? t('Odpolední') : s.type === 'flexible' ? t('Vlastní') : undefined;
  if (legacy) return { label: legacy, color: s.type === 'morning' ? '#C8F542' : s.type === 'afternoon' ? '#3B82F6' : '#64748B' };
  return { label: s.type || t('Směna'), color: '#64748B' };
}

// Opening hours are keyed 0=Mon..6=Sun; convert a 'YYYY-MM-DD' to that index.
function weekdayKey(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return String((d.getDay() + 6) % 7);
}

function ym(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
// Step a 'YYYY-MM' string by whole months — lets the employer plan any month
// ahead (or look back), not just this one and the next.
function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(month: string, jazyk: Jazyk) {
  return fmtDatum(`${month}-01`, { jazyk, styl: 'mesic' });
}
/** „3 směny, které už v měsíci jsou" — kolik uložených směn přepsání měsíce smaže. */
function ulozeneVMesici(t: PrekladFn, n: number) {
  return t('{n, plural, one {# směna, která už v měsíci je} few {# směny, které už v měsíci jsou} other {# směn, které už v měsíci jsou}}', { n });
}
/** „5. 10." — krátce do výčtu dnů. */
/** Název dne uprostřed věty: malým písmenem, kromě němčiny (tam jsou to podstatná jména: „Montag“). */
function denVeVete(den: string, jazyk: Jazyk) {
  return jazyk === 'de' ? den : den.toLowerCase();
}
function kratkeDatum(date: string, jazyk: Jazyk) {
  return fmtDatum(date, { jazyk, styl: 'kratce' });
}
function dayLabel(date: string, jazyk: Jazyk) {
  return fmtDatum(date, { jazyk, styl: 'denDlouze' });
}
function buildGrid(month: string, zacatek: ZacatekTydne) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = odsazeniMesice(first, zacatek);
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

type Tab = 'rozvrh' | 'kalendar' | 'typy' | 'oteviraci' | 'pevne' | 'pravidla';
const tabs = (t: PrekladFn): { id: Tab; label: string }[] => [
  { id: 'rozvrh', label: t('Rozvrh') },
  { id: 'kalendar', label: t('Kalendář') },
  { id: 'typy', label: t('Typy směn') },
  { id: 'oteviraci', label: t('Otevírací doba') },
  { id: 'pevne', label: t('Pevné dny') },
  { id: 'pravidla', label: t('Pravidla') },
];

/** Žádost widgetu, která čekala na připojení plánovače (přechod z jiné stránky). */
function vezmiZadost(klic: string): string | null {
  try {
    const v = sessionStorage.getItem(klic);
    if (v != null) sessionStorage.removeItem(klic);
    return v || null;
  } catch { return null; }
}

export default function ScheduleBuilder({ onNavigate, user }: Props & { onNavigate?: (view: string, arg?: string) => void }) {
  const t = useT('rozvrh');
  const { jazyk } = useJazyk();
  // Začátek týdne si volí podnik; kalendáře vedle ho ctí taky.
  const zacatek = zacatekTydne(useCurrency().weekStart);
  const currentMonth = pragueToday().slice(0, 7);
  const nextMonth = posunMesice(currentMonth, 1);

  const { ma } = useOpravneni();
  // Dokud nevíme, na co divák má, nic se nenačítá ani nekreslí — jinak by se
  // plánovač zeptal na /api/schedule dřív, než víme, jestli to není jen
  // náhled. Po odpovědi rozhoduje `ma`: s oprávněními přísně, po chybě nebo
  // u odpovědi bez pole (starší server) „ukázat vše" — rozhodne server.
  const [pripraveno, setPripraveno] = useState(false);
  // Aktivní podnik — jen pro klíč uloženého filtru (id lidí platí v jednom podniku).
  const [podnikId, setPodnikId] = useState<number | null>(null);
  useEffect(() => {
    let zije = true;
    nactiTeamsMine()
      .then((d) => { if (zije) setPodnikId(d?.activeTeamId != null ? Number(d.activeTeamId) : null); })
      .catch(() => { /* chyba je ve stavu oprávnění */ }).finally(() => { if (zije) setPripraveno(true); });
    return () => { zije = false; };
  }, []);
  const smi = (klic: string) => pripraveno && ma(klic);
  const planovac = smi('rozvrh.zobrazit');
  const smiUpravit = planovac && smi('rozvrh.upravit');
  const smiGenerovat = planovac && smi('rozvrh.generovat');
  const smiPublikovat = planovac && smi('rozvrh.publikovat');
  const smiMazat = planovac && smi('rozvrh.mazat_mesic');
  const smiExport = planovac && smi('rozvrh.exportovat');
  const smiNastaveni = smi('rozvrh.nastaveni');
  const smiOteviraci = smi('podnik.oteviraci_doba');
  const smiDostupnost = smi('dostupnost.zobrazit');
  const smiDostupnostUpravit = smi('dostupnost.upravit');
  const smiVolno = smi('volno.zobrazit');
  const smiAkce = smi('akce.zobrazit');
  const smiKalendar = smi('uzaverky.zobrazit_vse');

  const [tab, setTab] = useState<Tab>('rozvrh');
  const [month, setMonth] = useState(nextMonth);
  const [members, setMembers] = useState<Member[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [fixed, setFixed] = useState<FixedAssignment[]>([]);
  const [openingHours, setOpeningHours] = useState<Record<string, OpeningDay>>({});
  // Schválené volno — směna nesmí potichu padnout na něčí dovolenou.
  const [timeOff, setTimeOff] = useState<{ employeeId: number; fromDate: string; toDate: string; status: string; type?: string | null }[]>([]);
  // Akce jsou v plánovači taky — koncertní večer potřebuje jiné obsazení.
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editAvail, setEditAvail] = useState<{ id: number; name: string; avatar: string } | null>(null);
  // Widget „Dostupnost týmu" požádal o okno člověka; otevře se, až dorazí lidé.
  const [cekaDostupnost, setCekaDostupnost] = useState<number | null>(null);
  const [dayModal, setDayModal] = useState<string | null>(null);
  const [publishNote, setPublishNote] = useState<{ text: string; ok: boolean } | null>(null);
  const { pro } = usePlan();
  const [upgradeFor, setUpgradeFor] = useState<string | null>(null);
  // Zkopírovat celý týden směn do jiného — „typický týden".
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySrc, setCopySrc] = useState('');
  const [copyDst, setCopyDst] = useState('');
  const [copying, setCopying] = useState(false);
  // Zpráva o kopírování nese vlastní příznak úspěchu. Dřív se barva odvozovala
  // z toho, jestli text obsahoval ✓ — stačilo přeformulovat hlášku.
  const [copyMsg, setCopyMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const mondayOf = (d: Date) => {
    const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(12, 0, 0, 0);
    return x;
  };
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const weekLabel = (mon: Date) => {
    const end = new Date(mon); end.setDate(end.getDate() + 6);
    return `${fmtDatum(iso(mon), { jazyk, styl: 'kratce' })} – ${fmtDatum(iso(end), { jazyk, styl: 'kratce' })}`;
  };
  const weekOptions = (back: number, fwd: number) => {
    const base = mondayOf(new Date());
    const out: { value: string; label: string }[] = [];
    for (let i = -back; i <= fwd; i++) {
      const m = new Date(base); m.setDate(m.getDate() + i * 7);
      out.push({ value: iso(m), label: `${weekLabel(m)}${i === 0 ? ` (${t('tento týden')})` : ''}` });
    }
    return out;
  };

  const [publishing, setPublishing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  // Akce v plánovači, která na server nedošla.
  const [boardError, setBoardError] = useState('');
  // Blokovač vyskakovacích oken tiskové okno zavře a bez tohohle by se po kliknutí nestalo nic.
  const [printFailed, setPrintFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const seededRef = useRef(false);
  // Hlídá závod při přepnutí měsíce: odpověď starého měsíce nesmí přepsat nový.
  const reqRef = useRef(0);

  // Díry v pokrytí otevírací doby a neobsazená místa — uložený rozvrh je hlásí
  // stejně jako návrh, protože vzniknou i ruční úpravou. V mřížce svítí
  // červeně; seznam je widget „Díry v obsazení".
  const [gaps, setGaps] = useState<Gap[]>([]);
  const [understaffed, setUnderstaffed] = useState<MissingSlot[]>([]);
  // Kolik hostů na ten den čeká — z rezervací v Managero client.
  const [demand, setDemand] = useState<Record<string, { reservations: number; guests: number }>>({});

  // Náhled generování
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<NahledGeneratoru | null>(null);
  const [adjust, setAdjust] = useState<{ changes: any[]; warnings: string[] } | null>(null);
  const [adjustSkipped, setAdjustSkipped] = useState<Set<number>>(new Set());
  const [adjusting, setAdjusting] = useState(false);
  const [applyingAdjust, setApplyingAdjust] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [clearBeforeCommit, setClearBeforeCommit] = useState(true);
  // Přepnutí měsíce by neuložený návrh zahodilo (useEffect níž ho maže) —
  // bez ptaní to byla další tichá ztráta ručních úprav. Čeká tu cílový měsíc
  // (a případně den, který chtěl otevřít widget), dokud vedení nerozhodne.
  const [cekaMesic, setCekaMesic] = useState<{ mesic: string; den?: string } | null>(null);
  const maNavrhRef = useRef(false);
  maNavrhRef.current = preview != null;
  // Akce, která by zahodila RUČNĚ UPRAVENÝ návrh, čeká na potvrzení (stejné
  // okno jako přepnutí měsíce). Dřív „Vygenerovat rozvrh" a „Zahodit náhled"
  // úpravy smazaly jedním klepnutím — přesně ta ztráta, na kterou si Martin
  // stěžoval.
  const [ptamSe, setPtamSe] = useState<{ akce: 'generovat'; nahradit: boolean } | { akce: 'zahodit' } | null>(null);
  // „Uložit a publikovat" s přepsáním měsíce smaže i uložené směny — při
  // zavřeném náhledu to nebylo nikde vidět, proto se nejdřív zeptá.
  const [potvrdNahrazeni, setPotvrdNahrazeni] = useState(false);
  // Uložení návrhu běží nejvýš jednou: „Potvrdit a uložit" a hned „Uložit
  // a publikovat" (nebo „Uložit a přepnout") by jinak poslaly dva commity
  // a každý by vložil celý návrh — každý člověk by měl každou směnu dvakrát.
  const ukladaRef = useRef(false);
  // Verze uloženého měsíce, ze které plánovač vychází (GET /api/schedule).
  // Commit ji pošle zpátky; když ji mezitím změnila jiná záložka nebo jiné
  // zařízení, server vrátí 409 místo tichého přepsání.
  const [verzeMesice, setVerzeMesice] = useState<string | null>(null);

  // Filtr mřížky (lidé, typ, jen díry) a přehled „Směny podle lidí".
  // Pamatuje se v localStorage jednoho zařízení, ne v URL: adresu stránky
  // spravuje EmployerLayout a filtr je pohodlí plánovače, ne sdílený stav.
  // Jeden záznam pro všechny měsíce — „Eva" platí i po přepnutí na další
  // měsíc (jak chtěl Martin: přepnu měsíc a pořád vidím její směny) —, ale
  // zvlášť pro každého přihlášeného a podnik (klicFiltru).
  const [filtr, setFiltr] = useState<FiltrRozvrhu>(PRAZDNY_FILTR);
  const [prehledOtevren, setPrehledOtevren] = useState(false);
  const [razeni, setRazeni] = useState<RazeniVytizeni>('smeny');
  const klicUlozeni = pripraveno ? klicFiltru(user?.id ?? null, podnikId) : null;
  // Pod jakým klíčem je filtr načtený — dřív se neukládá (první běh by
  // přepsal uložený filtr prázdným) a po přepnutí podniku ne pod starý.
  const [nactenyKlic, setNactenyKlic] = useState<string | null>(null);
  useEffect(() => {
    if (!klicUlozeni) return;
    // Soukromé okno nebo zablokované úložiště: filtr prostě začne prázdný.
    try {
      setFiltr(nactiFiltr(localStorage.getItem(klicUlozeni)));
      // Společný záznam z první verze (bez podniku a uživatele) už neplatí.
      localStorage.removeItem(KLIC_FILTRU);
      const p = JSON.parse(localStorage.getItem(KLIC_PREHLEDU) || '{}');
      // Otevřený přehled se obnoví jen na širší obrazovce: na telefonu by
      // po načtení odsunul mřížku o víc než obrazovku.
      const siroka = window.matchMedia?.('(min-width: 640px)').matches ?? true;
      setPrehledOtevren(siroka && p?.otevreno === true);
      setRazeni(nactiRazeni(p?.razeni));
    } catch { /* bez úložiště */ }
    setNactenyKlic(klicUlozeni);
  }, [klicUlozeni]);
  useEffect(() => {
    if (!nactenyKlic) return;
    try {
      localStorage.setItem(nactenyKlic, JSON.stringify(filtr));
      localStorage.setItem(KLIC_PREHLEDU, JSON.stringify({ otevreno: prehledOtevren, razeni }));
    } catch { /* bez úložiště */ }
    // Ukládá se změna filtru, ne načtení pod novým klíčem (to by uložilo starý filtr).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtr, prehledOtevren, razeni]);
  // Den, který plánovač s „Jen dny s dírou" právě opravuje: zůstane
  // v mřížce, i když díru zaplnil — jinak by zmizel i s přidanou směnou
  // a nešla by zkontrolovat ani odebrat. Platí, dokud se filtr nezmění.
  const [drzeneDny, setDrzeneDny] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => { setDrzeneDny(d => (d.size ? new Set() : d)); }, [filtr]);
  const otevriDen = (den: string) => {
    if (filtr.jenDiry) setDrzeneDny(d => (d.has(den) ? d : new Set([...d, den])));
    setDayModal(den);
  };
  // Směny přidané v okně dne, které filtr mřížky skryje — po zavření okna
  // se to řekne (jinak směna „zmizí" a plánovač neví proč).
  const mimoFiltrRef = useRef<{ employeeId: number; typ: string }[]>([]);
  const [hlaskaFiltru, setHlaskaFiltru] = useState<{ text: string; id: number; ukazat: { lide: number[]; typy: string[] } } | null>(null);
  // Kde byl naposledy fokus: když zmizí prvek filtru, na kterém stál
  // (Zrušit filtr, poslední pilulka), vrátí se fokus na začátek filtru,
  // ne na <body> a začátek stránky.
  const filtrObalRef = useRef<HTMLDivElement>(null);
  const fokusVeFiltruRef = useRef(false);
  useEffect(() => {
    const kde = (e: FocusEvent) => { fokusVeFiltruRef.current = !!filtrObalRef.current?.contains(e.target as Node); };
    document.addEventListener('focusin', kde);
    return () => document.removeEventListener('focusin', kde);
  }, []);
  const mrizkaRef = useRef<HTMLDivElement>(null);
  // Jména lidí, které plánovač už viděl (i v jiném měsíci): vybraný člověk
  // bez směny v novém měsíci musí v pásu zůstat, jinak by nešel odkliknout.
  const znamiRef = useRef(new Map<number, { jmeno: string; avatar: string | null }>());

  // Náhled importu
  const [importPreview, setImportPreview] = useState<{ rows: any[]; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const employees = useMemo(() => members.filter((m) => m.role === 'employee'), [members]);
  // Na směnu jde zaměstnanec i vedení (i vedoucí může mít směnu).
  const assignable = useMemo(() => members.filter((m) => m.role === 'employee' || m.role === 'employer'), [members]);
  const grid = useMemo(() => buildGrid(month, zacatek), [month, zacatek]);

  /** Widgety na stejné URL (Díry, Hodiny, Poptávka, Dostupnost týmu) se po zápisu srovnají. */
  const obnovWidgety = (m = month) => {
    obnovDataWidgetu(`/api/schedule?month=${m}`);
    obnovDataWidgetu(`/api/availability?month=${m}`);
  };

  const load = async () => {
    if (!pripraveno) return;
    const req = ++reqRef.current;
    setLoading(true);
    setLoadError(null);
    const ziskej = (url: string) => fetch(url).then(okJson);
    try {
      if (planovac) {
        const [tData, sData, stData, faData, ohData, aData, toData] = await Promise.all([
          ziskej('/api/teams'),
          ziskej(`/api/schedule?month=${month}`),
          ziskej('/api/shift-types'),
          ziskej('/api/fixed-assignments'),
          ziskej('/api/opening-hours'),
          // Dostupnost a volno jen s oprávněním — bez něj by server vrátil 403
          // (nebo jen vlastní záznam) a plánovač by lhal, že nikdo nezadal.
          smiDostupnost ? ziskej(`/api/availability?month=${month}`) : Promise.resolve({ submissions: [] }),
          smiVolno ? ziskej('/api/timeoff') : Promise.resolve({ requests: [] }),
        ]);
        if (req !== reqRef.current) return;
        setMembers(tData.members ?? []);
        setSubmissions(Array.isArray(aData?.submissions) ? aData.submissions : []);
        setShifts(sData.shifts ?? []);
        setVerzeMesice(typeof sData.verze === 'string' ? sData.verze : null);
        setGaps(Array.isArray(sData.gaps) ? sData.gaps : []);
        setUnderstaffed(Array.isArray(sData.understaffed) ? sData.understaffed : []);
        setDemand(sData.demand && typeof sData.demand === 'object' ? sData.demand : {});
        setShiftTypes(stData.shiftTypes ?? []);
        setFixed(faData.assignments ?? []);
        setOpeningHours(ohData.openingHours ?? {});
        setTimeOff(Array.isArray(toData?.requests) ? toData.requests.filter((r: any) => r.status === 'approved') : []);
        // Akce jsou doplněk: jejich výpadek plánovač neshodí, jen je v mřížce neuvidíš.
        if (smiAkce) {
          fetch('/api/events').then(okJson)
            .then(d => { if (req === reqRef.current) setEvents((Array.isArray(d.events) ? d.events : []).filter((e: any) => e.status !== 'cancelled')); })
            .catch(() => { if (req === reqRef.current) setEvents([]); });
        }
      } else {
        // Jen náhled (rozvrh.nahled): jména a časy týmu, bez dostupnosti, volna a akcí.
        const [nData, stData, ohData] = await Promise.all([
          ziskej(`/api/shifts?team=1&month=${month}`),
          ziskej('/api/shift-types'),
          ziskej('/api/opening-hours'),
        ]);
        if (req !== reqRef.current) return;
        setShifts((Array.isArray(nData?.shifts) ? nData.shifts : []).map((s: any) => ({
          id: s.id, employeeId: s.employeeId, employeeName: s.employeeName ?? t('Kolega'), employeeAvatar: s.employeeAvatar ?? '',
          date: denZ(s.date), startTime: hmZ(s.startTime), endTime: hmZ(s.endTime), type: s.type,
        })));
        setShiftTypes(stData.shiftTypes ?? []);
        setOpeningHours(ohData.openingHours ?? {});
        setMembers([]); setSubmissions([]); setGaps([]); setUnderstaffed([]); setDemand({}); setTimeOff([]); setEvents([]);
      }
    } catch (e) {
      // Dřív console.error a prázdná mřížka — výpadek vypadal jako prázdný měsíc.
      if (req === reqRef.current) setLoadError(apiMessage(e, t('Rozvrh se nenačetl.')));
    } finally {
      if (req === reqRef.current) setLoading(false);
    }
  };
  const loadRef = useRef(load);
  loadRef.current = load;
  /** Po zápisu: znovu načíst plánovač a srovnat widgety na stejných URL. */
  const poZmene = async () => { await load(); obnovWidgety(); };

  useEffect(() => {
    load();
    setPublishNote(null);
    setConfirmClear(false);
    setPreview(null);
    setAdjust(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, pripraveno, planovac]);

  const mesicRef = useRef(month);
  mesicRef.current = month;
  /** Přepnout měsíc — s otevřeným návrhem až po rozhodnutí, co s ním. */
  const zmenMesic = (m: string, den?: string) => {
    if (maNavrhRef.current && m !== mesicRef.current) { setCekaMesic({ mesic: m, den }); return false; }
    setMonth(m);
    if (den) setDayModal(den);
    return true;
  };
  const zmenMesicRef = useRef(zmenMesic);
  zmenMesicRef.current = zmenMesic;

  // Neuložený návrh a přechod na jiný pohled aplikace (navigace, „Pozvat do
  // týmu", proklik z widgetu): EmployerLayout se přes stráž zeptá. Stav je
  // v modulu, protože navigace je o několik úrovní výš.
  const maNavrh = preview != null;
  useEffect(() => { nastavRozepsanyNavrh(maNavrh); }, [maNavrh]);
  useEffect(() => () => nastavRozepsanyNavrh(false), []);

  // Neuložený návrh a zavření karty: prohlížeč se zeptá (text si volí sám).
  useEffect(() => {
    if (!preview) return;
    const pred = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', pred);
    return () => window.removeEventListener('beforeunload', pred);
  }, [preview]);

  // Widgety → plánovač: otevřít den, okno dostupnosti, znovu načíst po zápisu.
  useEffect(() => {
    const otevriDen = (d: string) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      setTab('rozvrh'); zmenMesicRef.current(d.slice(0, 7), d);
    };
    const otevriDostupnost = (v: string) => {
      const [id, m] = v.split('|');
      if (!Number(id) || !/^\d{4}-\d{2}$/.test(m ?? '')) return;
      setTab('rozvrh');
      if (zmenMesicRef.current(m)) setCekaDostupnost(Number(id));
    };
    const naDen = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d?.hodnota) return;
      d.prijato = true; otevriDen(String(d.hodnota));
    };
    const naDostupnost = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (!d?.hodnota) return;
      d.prijato = true; otevriDostupnost(String(d.hodnota));
    };
    const naZmenu = () => { void loadRef.current(); };
    window.addEventListener(UDALOST_DEN, naDen);
    window.addEventListener(UDALOST_DOSTUPNOST, naDostupnost);
    window.addEventListener(UDALOST_ZMENA, naZmenu);
    const d = vezmiZadost(KLIC_DEN);
    if (d) otevriDen(d);
    const v = vezmiZadost(KLIC_DOSTUPNOST);
    if (v) otevriDostupnost(v);
    return () => {
      window.removeEventListener(UDALOST_DEN, naDen);
      window.removeEventListener(UDALOST_DOSTUPNOST, naDostupnost);
      window.removeEventListener(UDALOST_ZMENA, naZmenu);
    };
  }, []);

  // Okno dostupnosti z widgetu se otevře, až je načtený měsíc i lidé.
  useEffect(() => {
    if (cekaDostupnost == null || loading || loadError) return;
    const m = members.find(x => x.id === cekaDostupnost);
    setCekaDostupnost(null);
    if (!m) { setBoardError(t('Ten člověk už v týmu není.')); return; }
    // Bez dostupnost.upravit se okno otevře jen ke čtení: kdo skládá rozvrh, musí vidět,
    // které dny člověk nemůže a co vedení napsal do poznámky — upravit to ale nesmí.
    if (!smiDostupnost) { setBoardError(t('Dostupnost týmu tvoje role nevidí.')); return; }
    setEditAvail({ id: m.id, name: m.name, avatar: m.avatar ?? '' });
  }, [cekaDostupnost, loading, loadError, members, smiDostupnost]);

  const reloadTypes = async () => {
    const d = await fetch('/api/shift-types').then(okJson);
    setShiftTypes(d.shiftTypes ?? []);
  };
  const reloadFixed = async () => {
    const d = await fetch('/api/fixed-assignments').then(okJson);
    setFixed(d.assignments ?? []);
  };

  // Výchozí typy směn se založí při prvním otevření záložky Typy směn, když žádné nejsou.
  useEffect(() => {
    if (tab !== 'typy' || loading || seededRef.current || !smiNastaveni) return;
    if (shiftTypes.length > 0) {
      seededRef.current = true;
      return;
    }
    seededRef.current = true;
    (async () => {
      // Bez kontroly se mlčky založila jen část výchozích typů.
      let selhalo = 0;
      for (const t of DEFAULT_TYPES) {
        try {
          const res = await fetch('/api/shift-types', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(t),
          });
          if (!res.ok) selhalo += 1;
        } catch { selhalo += 1; }
      }
      if (selhalo > 0) setBoardError(t('Výchozí typy směn se nepodařilo založit celé. Doplň je v záložce Typy směn.'));
      await reloadTypes().catch(() => setBoardError(t('Typy směn se nenačetly.')));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, loading, shiftTypes.length, smiNastaveni]);

  const shiftsByDay = useMemo(() => {
    const map: Record<string, Shift[]> = {};
    shifts.forEach((s) => {
      (map[s.date] ||= []).push(s);
    });
    return map;
  }, [shifts]);
  const proposedByDay = useMemo(() => {
    const map: Record<string, Proposed[]> = {};
    (preview?.proposed ?? []).forEach((p) => {
      (map[p.date] ||= []).push(p);
    });
    return map;
  }, [preview]);

  // Návrh přebíjí uložený stav: když je na obrazovce náhled, svítí červeně to,
  // co by po uložení opravdu chybělo, ne to, co chybí teď.
  const activeGaps = preview ? preview.gaps : gaps;
  const activeUnderstaffed = preview ? preview.understaffed : understaffed;
  const problemsByDate = useMemo(() => {
    const map: Record<string, { gaps: Gap[]; missing: MissingSlot[] }> = {};
    for (const g of activeGaps) {
      (map[g.date] ||= { gaps: [], missing: [] }).gaps.push(g);
    }
    for (const m of activeUnderstaffed) {
      (map[m.date] ||= { gaps: [], missing: [] }).missing.push(m);
    }
    return map;
  }, [activeGaps, activeUnderstaffed]);
  const problemDates = useMemo(() => Object.keys(problemsByDate).sort(), [problemsByDate]);
  // Dny, kdy nikdo neotevře — ty mají být vidět na první pohled.
  const povinneDny = useMemo(() => problemDates.filter((d) => problemsByDate[d].gaps.some(jePovinna)), [problemDates, problemsByDate]);
  const doporuceniByDate = useMemo(() => {
    const map: Record<string, Doporuceni> = {};
    (preview?.doporuceni ?? []).forEach((x) => { map[x.date] = x; });
    return map;
  }, [preview]);

  const eventsByDate = useMemo(() => {
    const map: Record<string, any[]> = {};
    events.forEach(e => { (map[e.date] ||= []).push(e); });
    return map;
  }, [events]);

  const unavailableOn = (date: string) => {
    const set = new Set(
      submissions
        .filter((s) => (s.unavailableDates ?? []).includes(date) || s.dayPreferences?.[date] === 'off')
        .map((s) => s.employeeId),
    );
    // Schválená dovolená se počítá jako nedostupnost — proto se schvaluje.
    timeOff.forEach(t => {
      if (t.fromDate <= date && date <= t.toDate) set.add(t.employeeId);
    });
    return set;
  };

  const chybaZ = async (res: Response | null, vychozi: string) => {
    const d = res ? await res.json().catch(() => ({} as any)) : {};
    // Česká věta ze serveru se hledá ve slovníku `api`; co tam není, zůstane česky.
    return (d as any)?.error ? tg((d as any).error) : vychozi;
  };

  const addShift = async (payload: { employeeId: number; date: string; startTime: string; endTime: string; type: string }) => {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shifts: [payload] }),
    }).catch(() => null);
    if (res?.ok) { await poZmene(); return true; }
    setBoardError(await chybaZ(res, t('Směnu se nepodařilo přidat.')));
    return false;
  };

  const removeShift = async (id: number) => {
    const res = await fetch(`/api/schedule?id=${id}`, { method: 'DELETE' }).catch(() => null);
    // Mřížka se hned zbaví směny, ale díry a podobsazení počítá server —
    // bez znovunačtení (poZmene) by den, který smazáním osiřel, nedostal
    // červené „Nikdo neotevře“ a legenda by ukazovala starý stav.
    if (res?.ok) { setShifts((prev) => prev.filter((s) => s.id !== id)); await poZmene(); }
    else setBoardError(t('Směnu se nepodařilo smazat.'));
  };

  const clearMonth = async () => {
    setClearing(true);
    const res = await fetch(`/api/schedule?month=${month}`, { method: 'DELETE' }).catch(() => null);
    setClearing(false);
    setConfirmClear(false);
    // Znovunačtení srovná i díry a podobsazení (server je počítá z prázdného měsíce).
    if (res?.ok) { setShifts([]); await poZmene(); }
    else setBoardError(t('Vymazání měsíce se nepodařilo.'));
  };

  // Publikovat při otevřeném návrhu: nejdřív uložit návrh (i s ručními
  // úpravami), teprve pak dát lidem vědět. Dřív publish poslal jen {month}
  // a návrh visel dál jen v prohlížeči — upozornění odešlo na starý (nebo
  // prázdný) rozvrh a úpravy návrhu se ztratily při první změně měsíce, nebo
  // je pozdější „Potvrdit a uložit" s přepsáním měsíce smazalo.
  const publish = async (nahrazeniPotvrzeno = false) => {
    // Běží-li uložení (tlačítko ve Wellu, okno měsíce), druhé nezačíná.
    if (ukladaRef.current || publishing) return;
    if (preview) {
      if (preview.proposed.length === 0) {
        setBoardError(t('Návrh je prázdný — přidej do něj směny, nebo ho zahoď, a pak publikuj.'));
        return;
      }
      // Přepsání měsíce smaže i uložené směny a hned je publikuje — přepínač
      // je jen ve Wellu náhledu, který může být odrolovaný pryč.
      if (nahradiUlozene && shifts.length > 0 && !nahrazeniPotvrzeno) { setPotvrdNahrazeni(true); return; }
      setPublishing(true);
      const ulozeno = await commitPreview();
      if (!ulozeno) { setPublishing(false); return; }
    }
    setPublishing(true);
    try {
      const res = await fetch('/api/schedule/publish', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        const n = Number(d.notified) || 0;
        setPublishNote(n === 0
          ? { text: t('V tomhle měsíci zatím nikdo nemá směnu — není komu dát vědět.'), ok: false }
          : { text: t('Hotovo — rozvrh {n, plural, one {dostal # člověk} few {dostalo # lidé} other {dostalo # lidí}} jako upozornění. Každá další změna se jim ukáže v Mých směnách.', { n }), ok: true });
      } else {
        setPublishNote({ text: d.error ? tg(d.error) : t('Publikování se nepodařilo — zkus to znovu.'), ok: false });
      }
    } catch {
      setPublishNote({ text: t('Publikování se nepodařilo — zkus to znovu.'), ok: false });
    }
    setPublishing(false);
  };

  // „Upravit podle nových požadavků": uložený měsíc proti nejnovější
  // dostupnosti a nejmenší sada přeobsazení nebo zrušení.
  const runAdjust = async () => {
    setAdjusting(true); setBoardError('');
    try {
      const res = await fetch('/api/schedule/adjust', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setBoardError(d.error ? tg(d.error) : t('Kontrola se nepodařila.'));
      else { setAdjust({ changes: d.changes ?? [], warnings: d.warnings ?? [] }); setAdjustSkipped(new Set()); }
    } catch { setBoardError(t('Kontrola se nepodařila.')); }
    setAdjusting(false);
  };

  const applyAdjust = async () => {
    if (!adjust) return;
    const chosen = adjust.changes.filter((_, i) => !adjustSkipped.has(i));
    if (chosen.length === 0) { setAdjust(null); return; }
    setApplyingAdjust(true); setBoardError('');
    try {
      const res = await fetch('/api/schedule/adjust', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, commit: true, changes: chosen }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setBoardError(d.error ? tg(d.error) : t('Úpravy se nepodařilo uložit.'));
      else { setAdjust(null); await poZmene(); }
    } catch { setBoardError(t('Úpravy se nepodařilo uložit.')); }
    setApplyingAdjust(false);
  };

  const copyWeek = async () => {
    if (!copySrc || !copyDst || copySrc === copyDst) { setCopyMsg({ text: t('Vyber dva různé týdny.'), ok: false }); return; }
    setCopying(true); setCopyMsg(null);
    try {
      // Zdrojový týden může ležet i mimo načtený měsíc — načtou se oba měsíce týdne.
      const months = new Set([copySrc.slice(0, 7), iso(new Date(new Date(copySrc + 'T12:00:00').getTime() + 6 * 86400000)).slice(0, 7)]);
      let source: Shift[] = [];
      for (const m of Array.from(months)) {
        const d = await fetch(`/api/schedule?month=${m}`).then(okJson);
        source = source.concat(Array.isArray(d?.shifts) ? d.shifts : []);
      }
      const srcStart = copySrc;
      const srcEnd = iso(new Date(new Date(copySrc + 'T12:00:00').getTime() + 6 * 86400000));
      const offsetDays = Math.round((new Date(copyDst + 'T12:00:00').getTime() - new Date(copySrc + 'T12:00:00').getTime()) / 86400000);
      const toCreate = source
        .filter(sh => sh.date >= srcStart && sh.date <= srcEnd)
        .map(sh => {
          const nd = new Date(sh.date + 'T12:00:00'); nd.setDate(nd.getDate() + offsetDays);
          return { employeeId: sh.employeeId, date: iso(nd), startTime: sh.startTime, endTime: sh.endTime, type: sh.type };
        });
      if (toCreate.length === 0) { setCopyMsg({ text: t('Ve zdrojovém týdnu nejsou žádné směny.'), ok: false }); setCopying(false); return; }
      const res = await fetch('/api/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shifts: toCreate }),
      });
      if (res.ok) {
        setCopyMsg({ text: t('Hotovo — zkopírováno {smen}.', { smen: smenTxt(t, toCreate.length) }), ok: true });
        await poZmene();
      } else {
        setCopyMsg({ text: await chybaZ(res, t('Kopírování se nepodařilo.')), ok: false });
      }
    } catch (e) { setCopyMsg({ text: apiMessage(e, t('Kopírování se nepodařilo.')), ok: false }); }
    setCopying(false);
  };

  // ---- Generování ----
  // `nahradit` = uložení návrhu přepíše měsíc. Bez přepisu generátor počítá
  // s uloženými směnami jako s obsazenými (nenavrhne je podruhé a nehlásí
  // falešné díry), proto přepnutí přepínače vyvolá nové generování.
  const generate = async (nahradit: boolean) => {
    setGenerating(true);
    setPreview(null);
    try {
      const res = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, nahradit: nahradit && smiMazat }),
      });
      const data = await res.json();
      if (res.ok) {
        setPreview({
          proposed: data.proposed ?? [],
          warnings: data.warnings ?? [],
          gaps: Array.isArray(data.gaps) ? data.gaps : [],
          understaffed: Array.isArray(data.understaffed) ? data.understaffed : [],
          // Doporučení a stav tržeb jen tehdy, když je server poslal (funkce zapnutá).
          ...(Array.isArray(data.doporuceni) ? { doporuceni: data.doporuceni } : {}),
          ...(data.trzby && typeof data.trzby === 'object' ? { trzby: data.trzby } : {}),
          ...(data.hodiny && typeof data.hodiny === 'object' ? { hodiny: data.hodiny } : {}),
          nahradit: typeof data.nahradit === 'boolean' ? data.nahradit : nahradit && smiMazat,
        });
      } else {
        setPreview({ proposed: [], warnings: [data.error ? tg(data.error) : t('Generování selhalo.')], gaps: [], understaffed: [] });
      }
    } catch {
      setPreview({ proposed: [], warnings: [t('Generování selhalo.')], gaps: [], understaffed: [] });
    } finally {
      setGenerating(false);
    }
  };

  /**
   * Vygenerovat (znovu). Ručně upravený návrh se bez ptaní nezahodí;
   * `nahradit` je nový stav přepínače „Nahradit uložené směny" — nastaví se
   * až po potvrzení, ať „Nechat" nechá přepínač i návrh, jak byly.
   */
  const zadejGenerovani = (nahradit: boolean) => {
    if (preview?.upraveno) { setPtamSe({ akce: 'generovat', nahradit }); return; }
    setClearBeforeCommit(nahradit);
    void generate(nahradit);
  };
  const zahoditNavrh = () => {
    if (preview?.upraveno) { setPtamSe({ akce: 'zahodit' }); return; }
    setPreview(null);
  };

  /** Uloží návrh přesně tak, jak je na obrazovce (s ručními úpravami). Vrací, jestli se to povedlo. */
  const commitPreview = async (): Promise<boolean> => {
    if (!preview || preview.proposed.length === 0) return false;
    if (ukladaRef.current) return false;
    ukladaRef.current = true;
    setCommitting(true);
    try {
      // Server maže a vkládá jedním příkazem (atomicky) — neúspěch nechá
      // stávající rozvrh netknutý. Přepsání celého měsíce smí jen
      // rozvrh.mazat_mesic (katalog oprávnění). `verze` = uložený měsíc,
      // ze kterého návrh vychází; jiná záložka ho mezitím změnila → 409.
      const res = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, commit: true, replaceMonth: clearBeforeCommit && smiMazat, verze: verzeMesice, shifts: preview.proposed }),
      }).catch(() => null);
      if (res?.ok) {
        setPreview(null);
        await poZmene();
        return true;
      }
      setBoardError(await chybaZ(res, t('Uložení rozvrhu se nepodařilo — nic se nezměnilo, zkus to znovu.')));
      // Souběh: načíst, co teď v měsíci opravdu je (a novou verzi). Návrh
      // zůstává — vedení se podívá a uloží znovu vědomě.
      if (res?.status === 409) await poZmene();
      return false;
    } finally {
      ukladaRef.current = false;
      setCommitting(false);
    }
  };

  // ---- Ruční úpravy návrhu ----
  // Návrh je jediný zdroj pravdy, dokud je otevřený: přidání v okně dne jde
  // do něj, ne do uložených směn. Dřív „Přidat směnu" zapsalo rovnou do
  // databáze a „Potvrdit a uložit" (výchozí s přepsáním měsíce) ho vzápětí
  // smazalo spolu se vším ostatním — v rozvrhu zůstal původní návrh.
  const nahradiUlozene = !!preview && clearBeforeCommit && smiMazat;
  const smenyNavrhuDne = (datum: string, proposed: Proposed[]) => [
    ...(nahradiUlozene ? [] : (shiftsByDay[datum] ?? [])),
    ...proposed.filter((x) => x.date === datum),
  ];
  // Doporučení „stačí jeden" platí i po ruční úpravě: odebraná druhá směna
  // se pak do neobsazených nevrací, generátor ji za potřebnou nepovažoval.
  const jedenStaciDne = (n: NahledGeneratoru, datum: string) => jedenUplatnen(n.doporuceni?.find((x) => x.date === datum));
  const pridejDoNavrhu = (payload: { employeeId: number; date: string; startTime: string; endTime: string; type: string }) => {
    const clen = members.find((m) => m.id === payload.employeeId);
    const typ = shiftTypes.find((t) => t.name === payload.type);
    const novy: Proposed = {
      employeeId: payload.employeeId,
      employeeName: clen?.name ?? t('Kolega'),
      employeeAvatar: clen?.avatar ?? '',
      date: payload.date,
      startTime: payload.startTime,
      endTime: payload.endTime,
      type: payload.type,
      shiftTypeId: typ?.id ?? 0,
      shiftTypeName: typ?.name ?? payload.type,
      color: typ?.color ?? '',
    };
    setPreview((prev) => {
      if (!prev) return prev;
      const proposed = [...prev.proposed, novy];
      const prepocet = prepocitejDen(prev, payload.date, openingHours[weekdayKey(payload.date)],
        smenyNavrhuDne(payload.date, proposed), { pridanTyp: typ?.name ?? null, jedenStaci: jedenStaciDne(prev, payload.date) });
      return { ...prev, proposed, ...prepocet, upraveno: true };
    });
    return true;
  };
  const odeberZNavrhu = (p: Proposed) => {
    setPreview((prev) => {
      if (!prev) return prev;
      // Odebere se právě jedna položka — stejný člověk může mít v návrhu
      // i rozdělenou směnu se stejným začátkem jen výjimečně, ale dvě kopie
      // naráz zmizet nesmí.
      const i = prev.proposed.findIndex((x) => x.date === p.date && x.employeeId === p.employeeId && x.startTime === p.startTime && x.endTime === p.endTime);
      if (i < 0) return prev;
      const proposed = prev.proposed.filter((_, j) => j !== i);
      const prepocet = prepocitejDen(prev, p.date, openingHours[weekdayKey(p.date)],
        smenyNavrhuDne(p.date, proposed), { odebranTyp: p.shiftTypeName || p.type, jedenStaci: jedenStaciDne(prev, p.date) });
      return { ...prev, proposed, ...prepocet, upraveno: true };
    });
  };

  // ---- Filtr mřížky ----
  // Počítá se z toho, co mřížka právě kreslí a co by po uložení platilo:
  // s otevřeným návrhem návrh (a s přepisem měsíce bez uložených směn),
  // jinak uložené směny. Dřív šlo počty lidí zjistit jen z widgetu
  // „Naplánované hodiny", který o návrhu neví.
  const typUlozene = (s: Shift) => resolveShiftType(s, shiftTypes, t).label;
  const typNavrhu = (p: Proposed) => p.shiftTypeName || resolveShiftType(p, shiftTypes, t).label;
  // Hodnota filtru typů se ukládá do prohlížeče, takže nesmí záviset na jazyce: starší typy
  // (morning/afternoon/flexible) mají v klíči filtru českou podobu a překládá se jen zobrazení.
  const smenyFiltru = useMemo<SmenaFiltru[]>(() => [
    ...(nahradiUlozene ? [] : shifts.map(s => ({
      employeeId: s.employeeId, jmeno: s.employeeName, avatar: s.employeeAvatar || null,
      date: s.date, startTime: s.startTime, endTime: s.endTime, typ: resolveShiftType(s, shiftTypes, KLIC_CS).label,
    }))),
    ...(preview?.proposed ?? []).map(p => ({
      employeeId: p.employeeId, jmeno: p.employeeName, avatar: p.employeeAvatar || null,
      date: p.date, startTime: p.startTime, endTime: p.endTime, typ: p.shiftTypeName || resolveShiftType(p, shiftTypes, KLIC_CS).label,
    })),
  ], [nahradiUlozene, shifts, preview, shiftTypes]);
  const filtrAktivni = jeAktivni(filtr);
  // Lidé a typy filtrují směny; „jen díry" filtruje dny.
  const filtrujeSmeny = filtr.lide.length > 0 || filtr.typy.length > 0;
  const lideMesice = useMemo(() => {
    const lide = lideFiltru(members, smenyFiltru, smiDostupnost ? submissions : null);
    for (const c of lide) znamiRef.current.set(c.id, { jmeno: c.jmeno, avatar: c.avatar });
    return lide;
  }, [members, smenyFiltru, smiDostupnost, submissions]);
  // Vybraný člověk bez směny v měsíci (vedoucí, zaměstnanec mimo pás):
  // jméno ze seznamu týmu, jinak z paměti. Neznámé id pročistí efekt níž.
  const lidePlanovace = useMemo(() => [
    ...lideMesice,
    ...filtr.lide.filter(id => !lideMesice.some(c => c.id === id)).map(id => {
      const clen = members.find(m => Number(m.id) === id);
      const znamy = znamiRef.current.get(id);
      return { id, jmeno: clen?.name || znamy?.jmeno || t('Bez jména'), avatar: clen?.avatar ?? znamy?.avatar ?? null };
    }),
  ], [lideMesice, filtr.lide, members]);
  // Id, která ve filtru nemají co dělat — nejsou v týmu ani nemají směnu
  // v načteném měsíci (odešli, smazaní). Jen s načteným týmem: bez seznamu
  // (náhled) nevíme, kdo v týmu je, a vyhodili bychom i platný výběr.
  useEffect(() => {
    if (!nactenyKlic || loading || loadError || members.length === 0) return;
    const zname = new Set<number>([...members.map(m => Number(m.id)), ...smenyFiltru.map(s => Number(s.employeeId))]);
    setFiltr(f => procistiFiltr(f, zname));
  }, [nactenyKlic, loading, loadError, members, smenyFiltru]);
  /** Ukazuje mřížka den? (S „jen díry" den s dírou nebo den, který plánovač opravuje.) */
  const denVidet = (datum: string) => !!problemsByDate[datum] || drzeneDny.has(datum);
  const pocetLidi = useMemo(() => pocetPodleLidi(smenyFiltru, filtr, denVidet),
    // denVidet = problemsByDate + drzeneDny
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [smenyFiltru, filtr, problemsByDate, drzeneDny]);
  const pasLidi = useMemo(() => lideDoPasu(lidePlanovace, pocetLidi), [lidePlanovace, pocetLidi]);
  const celkemVPasu = useMemo(() => [...pocetLidi.values()].reduce((n, x) => n + x, 0), [pocetLidi]);
  const pasTypu = useMemo(() => typyDoPasu(shiftTypes, pocetPodleTypu(smenyFiltru, filtr, denVidet), filtr.typy),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shiftTypes, smenyFiltru, filtr, problemsByDate, drzeneDny]);
  const dobaDne = (datum: string) => {
    const oh = openingHours[weekdayKey(datum)];
    return oh && !oh.closed && oh.close ? { open: oh.open ?? null, close: oh.close } : null;
  };
  const dnyMesice = useMemo(() => grid.filter((d): d is string => !!d), [grid]);
  const vytizeniLidi = useMemo(
    () => vytizeni(lideMesice, smenyFiltru, smiDostupnost ? submissions : null, dobaDne, { dny: dnyMesice, volno: timeOff }),
    // dobaDne závisí jen na openingHours
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lideMesice, smenyFiltru, smiDostupnost, submissions, openingHours, dnyMesice, timeOff],
  );
  const radkyPrehledu = useMemo(() => seradVytizeni(vytizeniLidi.radky, razeni), [vytizeniLidi, razeni]);
  const jmenaFiltru = useMemo(() => new Map(lidePlanovace.map(c => [c.id, c.jmeno])), [lidePlanovace]);
  const kratkaFiltru = useMemo(() => new Map(pasLidi.map(c => [c.id, c.kratce])), [pasLidi]);
  const viditelnych = useMemo(
    () => smenyFiltru.filter(s => projdeSmena(s, filtr) && denProjde(denVidet(s.date), filtr)).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [smenyFiltru, filtr, problemsByDate, drzeneDny],
  );
  const popisAktivniho = filtrAktivni ? t('Filtr: {popis} — {vysledek}', { popis: popisFiltru(filtr, jmenaFiltru, kratkaFiltru, t), vysledek: popisVysledku(viditelnych, !!preview, t) }) : '';
  // Hlášení pro odečítač: výsledek filtru, po vypnutí „Filtr vypnut".
  // Při načtení stránky mlčí (nic se nezměnilo, jen obnovil uložený stav).
  const bylFiltrRef = useRef(false);
  if (filtrAktivni) bylFiltrRef.current = true;
  const stavFiltru = filtrAktivni ? popisAktivniho : bylFiltrRef.current ? t('Filtr vypnut, celý měsíc.') : '';
  // Pás typů má smysl od dvou typů (nebo když je co odkliknout / jsou díry).
  const ukazPasTypu = pasTypu.length >= 2 || filtr.typy.length > 0 || filtr.jenDiry || (problemDates.length > 0 && pasTypu.length >= 1);
  // Filtr se změnil a prvek s fokusem zmizel (Zrušit filtr i s lištou,
  // poslední pilulka pásu typů): fokus na první pilulku, jinak na mřížku.
  useLayoutEffect(() => {
    if (!fokusVeFiltruRef.current) return;
    const ztracen = !document.activeElement || document.activeElement === document.body;
    if (!ztracen) return;
    const cil = filtrObalRef.current?.querySelector<HTMLElement>('[data-pas] button') ?? mrizkaRef.current;
    cil?.focus({ preventScroll: false });
  }, [filtr]);
  const zrusFiltr = () => setFiltr(PRAZDNY_FILTR);
  /**
   * Klepnutí na člověka v přehledu: mřížka jen na jeho směny, VŠECH typů
   * a dnů — tedy přesně to číslo, na které plánovač klepl. Kdyby zůstal
   * filtr „Ranní", řádek by říkal 5 a mřížka ukázala 3. Druhé klepnutí na
   * jediného vybraného filtr lidí zruší.
   */
  const vyberClovekaZPrehledu = (id: number) => {
    setFiltr(f => (f.lide.length === 1 && f.lide[0] === id ? { ...f, lide: [] } : { lide: [id], typy: [], jenDiry: false }));
    const el = mrizkaRef.current;
    if (el && el.getBoundingClientRect().top > window.innerHeight * 0.75) {
      const klid = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'start', behavior: klid ? 'auto' : 'smooth' });
    }
  };
  const hintCelyMesic = filtrAktivni ? ` ${t('Vždy celý měsíc — filtr se nepoužije.')}` : '';
  /** Přidání v okně dne: směnu, kterou filtr mřížky skryje, si zapamatovat na hlášku. */
  const pridejVOkne = async (x: { employeeId: number; date: string; startTime: string; endTime: string; type: string }) => {
    const ok = preview ? pridejDoNavrhu(x) : await addShift(x);
    const typ = shiftTypes.find(t => t.name === x.type)?.name ?? x.type;
    if (ok && jeAktivni(filtr) && !projdeSmena({ employeeId: x.employeeId, typ }, filtr)) mimoFiltrRef.current.push({ employeeId: x.employeeId, typ });
    return ok;
  };
  const zavriDen = () => {
    setDayModal(null);
    const mimo = mimoFiltrRef.current;
    mimoFiltrRef.current = [];
    if (mimo.length === 0) return;
    const lide = [...new Set(mimo.map(m => m.employeeId))];
    const jmeno = (id: number) => (members.find(m => Number(m.id) === id)?.name || znamiRef.current.get(id)?.jmeno || t('Kolega')).split(/\s+/)[0];
    const text = mimo.length === 1
      ? t('Přidáno — {jmeno} je mimo filtr', { jmeno: jmeno(mimo[0].employeeId) })
      : t('Přidáno — {smen} mimo filtr', { smen: smenTxt(t, mimo.length) });
    setHlaskaFiltru({ text, id: Date.now(), ukazat: { lide, typy: [...new Set(mimo.map(m => m.typ))] } });
  };
  /** „Ukázat" v hlášce: přidat přidané lidi a typy do filtru, ať je směna v mřížce vidět. */
  const ukazPridane = (u: { lide: number[]; typy: string[] }) => setFiltr(f => ({
    ...f,
    lide: f.lide.length > 0 ? [...new Set([...f.lide, ...u.lide])] : f.lide,
    typy: f.typy.length > 0 ? [...new Set([...f.typy, ...u.typy])] : f.typy,
  }));

  // ---- Export CSV ----
  const exportCsv = () => {
    if (!pro) { setUpgradeFor(t('Export CSV')); return; }
    // Tvar souboru řeší lib/rozvrhCsv, ať export a import spolu vždy sedí.
    const csv = sestavCsv(shifts);
    // V nativním obalu se soubor sdílí přes systémový list (lib/stahni), v prohlížeči stáhne.
    void ulozSoubor(`rozvrh-${month}.csv`, '﻿' + csv, 'text/csv;charset=utf-8;');
  };

  // ---- Tisk na zeď ----
  // Rozvrh visí u baru na papíře. Papír je černobílý, takže typ směny musí být
  // napsaný slovem — barevná tečka z obrazovky je na výtisku neviditelná.
  const printSchedule = () => {
    const byDate = new Map<string, typeof shifts>();
    for (const sh of shifts) {
      const arr = byDate.get(sh.date);
      if (arr) arr.push(sh); else byDate.set(sh.date, [sh]);
    }
    const days = Array.from(byDate.keys()).sort();
    const rows = days.map(d => {
      const list = byDate.get(d)!.slice().sort((a, b) => a.startTime.localeCompare(b.startTime));
      const dt = new Date(d + 'T00:00:00');
      const weekend = dt.getDay() === 0 || dt.getDay() === 6;
      return `<tr>
        <td style="white-space:nowrap${weekend ? ';font-weight:700' : ''}">
          ${esc(fmtDatum(d, { jazyk, styl: 'kratce' }))}
          <div class="note">${esc(fmtDatum(d, { jazyk, styl: 'denvtydnu' }))}</div>
        </td>
        <td>${list.map(x => `<div>${esc(x.employeeName || t('Neobsazeno'))} — ${esc(x.startTime)}–${esc(x.endTime)}`
          + `${x.type ? ` · ${esc(resolveShiftType(x, shiftTypes, t).label)}` : ''}</div>`).join('')}</td>
        <td class="num">${list.length}</td>
      </tr>`;
    }).join('');
    const ok = openPrint({
      title: t('Rozvrh — {mesic}', { mesic: monthLabel(month, jazyk) }),
      subtitle: t('{smeny} · {dny} se směnou', { smeny: smenTxt(t, shifts.length), dny: dnuTxt(t, days.length) }),
      jazyk,
      paticka: cas => t('vytištěno {cas} z aplikace Managero', { cas }),
      body: `<table>
        <thead><tr><th style="width:26mm">${esc(t('Den'))}</th><th>${esc(t('Kdo a kdy'))}</th><th class="num">${esc(t('Lidí'))}</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`,
    });
    setPrintFailed(!ok);
  };

  // ---- Import CSV ----
  const handleFile = async (file: File) => {
    // Na směnu jde zaměstnanec i vedení a export píše obojí — import proto hledá mezi `assignable`.
    setImportPreview(rozeberCsv(await file.text(), assignable));
  };

  const confirmImport = async () => {
    if (!importPreview || importPreview.rows.length === 0) return;
    setImporting(true);
    try {
      const res = await fetch('/api/schedule/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month, rows: importPreview.rows }),
      }).catch(() => null);
      if (res?.ok) {
        setImportPreview(null);
        await poZmene();
      } else {
        setBoardError(await chybaZ(res, t('Import se nepodařilo uložit.')));
      }
    } finally {
      setImporting(false);
    }
  };

  // ---- Hlavička, záložky, akce ----
  const zalozky = tabs(t).filter(z => z.id === 'rozvrh'
    || (z.id === 'kalendar' && smiKalendar)
    || ((z.id === 'typy' || z.id === 'pevne' || z.id === 'pravidla') && smiNastaveni)
    || (z.id === 'oteviraci' && (smiNastaveni || smiOteviraci)));
  const aktivniTab: Tab = zalozky.some(z => z.id === tab) ? tab : 'rozvrh';
  const naRozvrhu = aktivniTab === 'rozvrh';
  const aside = zalozky.length > 1
    ? <Segmented ariaLabel={t('Část rozvrhu')} value={aktivniTab} onChange={(v) => setTab(v as Tab)} options={zalozky} />
    : undefined;

  const menu: MenuItem[] = [];
  // Import, kopírování týdne a úprava podle požadavků zapisují rovnou do
  // uložených směn. S otevřeným návrhem by je jeho uložení (výchozí
  // s přepsáním měsíce) vzápětí smazalo — stejná příčina jako u „Přidat
  // směnu" v okně dne. Proto do té doby nejdou.
  const hintNavrh = t('Nejdřív ulož nebo zahoď návrh — jinak by jeho uložení tuhle změnu přepsalo.');
  if (naRozvrhu && !loading && !loadError) {
    if (smiPublikovat) menu.push(preview
      ? { label: t('Uložit návrh a publikovat'), icon: 'send', onClick: () => { void publish(); }, disabled: committing || publishing, hint: `${t('Návrh se uloží i s tvými úpravami a lidé dostanou upozornění.')}${hintCelyMesic}` }
      : { label: t('Publikovat rozvrh'), icon: 'send', onClick: () => { void publish(); }, disabled: publishing, hint: `${t('Lidé dostanou upozornění, že je rozvrh hotový.')}${hintCelyMesic}` });
    if (smiUpravit) {
      menu.push({ label: t('Upravit podle nových požadavků'), icon: 'swap', onClick: runAdjust, disabled: !!preview || adjusting || shifts.length === 0,
        hint: preview ? hintNavrh : t('Zkontroluje uložený rozvrh proti nejnovější dostupnosti.') });
      menu.push({ label: t('Kopírovat týden…'), icon: 'copy', disabled: !!preview, hint: preview ? hintNavrh : undefined,
        onClick: () => { setCopyOpen(true); setCopyMsg(null); setCopySrc(''); setCopyDst(''); } });
      menu.push({ label: t('Import CSV…'), icon: 'upload', disabled: !!preview, hint: preview ? hintNavrh : undefined, onClick: () => fileRef.current?.click() });
    }
    if (smiExport) {
      // Export a tisk berou vždy uložené směny celého měsíce (`shifts`), ne
      // to, co zrovna ukazuje filtr — soubor pro účetní ani papír na zeď
      // nesmí potichu vynechat lidi, které si plánovač zrovna skryl.
      menu.push({ label: t('Export CSV'), icon: 'download', onClick: exportCsv, disabled: shifts.length === 0, hint: hintCelyMesic.trim() || undefined });
      menu.push({ label: t('Vytisknout rozvrh'), icon: 'print', onClick: printSchedule, disabled: shifts.length === 0,
        hint: `${t('Na papír k baru — černobíle, s typem směny slovem.')}${hintCelyMesic}` });
    }
    if (smiMazat) menu.push({ label: t('Vymazat měsíc…'), icon: 'trash', onClick: () => setConfirmClear(true), danger: true,
      hint: t('Smaže všechny směny tohoto měsíce. Potvrdíš to ještě jednou.') });
  }
  const hlavicka = {
    title: t('Rozvrh'),
    subtitle: t('Sestav měsíční rozvrh podle dostupnosti týmu.'),
    hintId: 'schedulebuilder',
    aside,
    // S otevřeným návrhem je hlavní akcí jeho uložení, ne nové generování:
    // limetka přejde na „Uložit a publikovat" a „Vygenerovat znovu" je jen
    // sekundární (a u upraveného návrhu se nejdřív zeptá). Dřív svítila
    // limetkou pořád „Vygenerovat" a vedla prst přímo k zahození úprav.
    primary: !naRozvrhu || loadError ? undefined
      : preview
        ? (smiPublikovat
          ? <Button variant="accent" icon="send" onClick={() => { void publish(); }} loading={publishing} disabled={committing}>{t('Uložit a publikovat')}</Button>
          : undefined)
        : smiGenerovat
          ? <Button variant="accent" icon="bulb" onClick={() => zadejGenerovani(clearBeforeCommit)} loading={generating}>{t('Vygenerovat rozvrh')}</Button>
          : undefined,
    secondary: !naRozvrhu || loadError ? undefined
      : preview
        ? (smiGenerovat
          ? <Button variant="secondary" icon="bulb" onClick={() => zadejGenerovani(clearBeforeCommit)} loading={generating} disabled={committing || publishing}>{t('Vygenerovat znovu')}</Button>
          : undefined)
        : smiPublikovat
          ? <Button variant="secondary" icon="send" onClick={() => { void publish(); }} loading={publishing}>{t('Publikovat')}</Button>
          : undefined,
    menu: menu.length ? menu : undefined,
  };

  // ---- Nástroj: měsíční plánovač ----
  const rychleMesice = [
    { id: currentMonth, label: t('Tento měsíc') },
    { id: nextMonth, label: t('Příští měsíc') },
  ];
  const nastroj = (
    <Card as="section" aria-labelledby="planovac-nadpis" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="planovac-nadpis" className="t-card cz-sentence">{monthLabel(month, jazyk)}</h2>
        {/* Šipky pro libovolný měsíc, pilulky pro dva obvyklé (tento slouží i jako „zpět na dnešek"). */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <MonthNav value={month} onChange={(m) => { zmenMesic(m); }} />
          <div className="flex gap-1.5" role="group" aria-label={t('Rychlý výběr měsíce')}>
            {rychleMesice.map(m => (
              <button key={m.id} type="button" aria-pressed={month === m.id} onClick={() => zmenMesic(m.id)}
                className={`filter-pill tap-target-sm ${month === m.id ? 'seg-on' : 'seg-off glass'}`}>{m.label}</button>
            ))}
          </div>
        </div>
      </div>

      {!planovac && pripraveno && (
        <p className="note note-info text-sm">{t('Vidíš náhled rozvrhu týmu — jména a časy. Plánovat může vedení s přístupem k rozvrhu.')}</p>
      )}
      {printFailed && (
        <p className="note note-wait text-sm flex items-center justify-between gap-3">
          <span className="cz-sentence">{t('Tiskové okno prohlížeč zablokoval. Povol vyskakovací okna pro tuhle stránku a zkus to znovu.')}</span>
          <Button variant="ghost" size="sm" iconOnly icon="close" aria-label={t('Zavřít')} className="shrink-0 -my-1.5" onClick={() => setPrintFailed(false)} />
        </p>
      )}
      {boardError && (
        <p className="note note-danger text-sm font-medium flex items-center justify-between gap-3" role="alert">
          <span className="flex items-center gap-2"><Icon name="warning" size={16} className="shrink-0" /> {boardError}</span>
          <Button variant="ghost" size="sm" iconOnly icon="close" aria-label={t('Zavřít')} className="shrink-0 -my-1.5" onClick={() => setBoardError('')} />
        </p>
      )}
      {publishNote && (
        <p className={`note ${publishNote.ok ? 'note-ok' : 'note-wait'} text-sm flex items-center justify-between gap-3`} role="status">
          <span>{publishNote.text}</span>
          <Button variant="ghost" size="sm" iconOnly icon="close" aria-label={t('Zavřít')} className="shrink-0 -my-1.5" onClick={() => setPublishNote(null)} />
        </p>
      )}

      {/* Náhled „Upravit podle nových požadavků" */}
      {adjust && (
        <Well className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="t-card flex items-center gap-2"><Icon name="sparkle" size={17} className="shrink-0 text-black/40" /> {t('Úprava podle nových požadavků')}</h3>
              <p className="t-meta mt-0.5">
                {adjust.changes.length === 0
                  ? t('Všechno sedí — žádná směna není v rozporu s dostupností.')
                  : t('{n, plural, one {# navržená změna} few {# navržené změny} other {# navržených změn}}. Odškrtni, co měnit nechceš.', { n: adjust.changes.length })}
              </p>
            </div>
            <Button variant="ghost" size="sm" iconOnly icon="close" aria-label={t('Zavřít úpravu')} className="shrink-0" onClick={() => setAdjust(null)} />
          </div>
          {adjust.changes.length > 0 && (
            <>
              <ul className="list max-h-72 overflow-y-auto scrollbar-thin">
                {adjust.changes.map((ch: any, i: number) => {
                  const vynechat = adjustSkipped.has(i);
                  const datum = fmtDatum(ch.date, { jazyk, styl: 'kratce' });
                  return (
                    <li key={i} className={`flex items-center gap-3 py-2.5 ${vynechat ? 'opacity-45' : ''}`}>
                      <SelectBox checked={!vynechat} label={t('Použít změnu {datum} {od}–{do}', { datum, od: ch.startTime, do: ch.endTime })}
                        onChange={() => setAdjustSkipped(prev => {
                          const n = new Set(prev);
                          if (n.has(i)) n.delete(i); else n.add(i);
                          return n;
                        })} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[#16181A] tabular-nums">{datum} · {ch.startTime}–{ch.endTime}</p>
                        <p className="t-meta flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span>{ch.fromName}</span>
                          {ch.action === 'reassign' ? (
                            <><Icon name="chevronRight" size={13} className="shrink-0 text-black/40" /><span className="font-medium text-[#16181A]">{ch.toName}</span></>
                          ) : (
                            <Chip tone="bad" size="sm">{t('zrušit — nikdo nemůže')}</Chip>
                          )}
                          {ch.reason && <span>· {ch.reason}</span>}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {adjust.warnings.length > 0 && (
                <ul className="text-xs text-wait-ink space-y-0.5 list-disc pl-4">
                  {adjust.warnings.slice(0, 10).map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" size="sm" icon="check" loading={applyingAdjust}
                  disabled={adjust.changes.length === adjustSkipped.size} onClick={applyAdjust}>
                  {t('Použít vybrané ({n})', { n: adjust.changes.length - adjustSkipped.size })}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setAdjust(null)}>{t('Zahodit')}</Button>
              </div>
              <p className="t-meta text-pretty">
                {t('Důvody vycházejí z uložené dostupnosti — když nesedí, oprav ji ve widgetu Dostupnost týmu. Dotčení lidé dostanou upozornění.')}
              </p>
            </>
          )}
        </Well>
      )}

      {/* Náhled vygenerovaného návrhu */}
      {preview && (
        <Well className="space-y-3">
          <div className="min-w-0">
            <h3 className="t-card flex items-center gap-2"><Icon name="sparkle" size={17} className="shrink-0 text-black/40" /> {t('Navržený rozvrh')}</h3>
            <p className="t-meta mt-0.5 text-pretty">
              {/* Jedna věta s jednou tečkou na konci — dřív „… upozornění. · 80 hodin." */}
              {[
                t('{n, plural, one {# navržená směna} few {# navržené směny} other {# navržených směn}}', { n: preview.proposed.length }),
                preview.warnings.length > 0 ? upozorneniTxt(t, preview.warnings.length) : null,
                preview.hodiny ? hodinTxt(t, Math.round(preview.hodiny.celkem)) : null,
              ].filter(Boolean).join(' · ')}.
              {' '}{t('Návrh je v mřížce přerušovaně.')}
              {preview.upraveno ? ` ${t('Obsahuje tvoje ruční úpravy.')}` : ''}
              {' '}{t('Klepnutím na den návrh upravíš — uloží se přesně to, co tu vidíš.')}
            </p>
          </div>
          {povinneDny.length > 0 && (
            // Povinná díra = podnik se neotevře. Musí být vidět hned, ne až
            // jako řádek v seznamu upozornění.
            <div className="note note-danger" data-povinne-diry>
              <p className="text-sm font-semibold flex items-center gap-1.5"><Icon name="warning" size={16} className="shrink-0" /> {t('Nikdo neotevře — {dny} bez otevírací směny', { dny: dnuTxt(t, povinneDny.length) })}</p>
              <p className="text-xs mt-0.5 text-pretty">{t('Bez člověka na otevření se podnik ten den neotevře: {dny}. Klepni na den a doplň někoho.', { dny: `${povinneDny.slice(0, 8).map((d) => kratkeDatum(d, jazyk)).join(', ')}${povinneDny.length > 8 ? ' …' : ''}` })}</p>
            </div>
          )}
          {problemDates.length > povinneDny.length && (
            <p className="t-meta text-pretty" data-zadouci-diry>
              <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-wait mr-1.5 align-middle" />
              {t('{dny} bez druhého člověka — otevře se, jen s menší obsluhou.', { dny: dnuTxt(t, problemDates.length - povinneDny.length) })}
            </p>
          )}
          {preview.trzby && <SouhrnTrzeb trzby={preview.trzby} doporuceni={preview.doporuceni ?? []} hodiny={preview.hodiny} />}
          {preview.warnings.length > 0 && (
            <div className="note note-wait">
              <p className="text-sm font-medium flex items-center gap-1.5"><Icon name="warning" size={16} className="shrink-0" /> {t('Upozornění ({n})', { n: preview.warnings.length })}</p>
              <ul className="text-xs space-y-0.5 max-h-40 overflow-y-auto list-disc pl-4 mt-1">
                {preview.warnings.slice(0, 40).map((w, i) => <li key={i}>{w}</li>)}
                {preview.warnings.length > 40 && <li>{t('…a dalších {n}', { n: preview.warnings.length - 40 })}</li>}
              </ul>
            </div>
          )}
          {smiMazat && (
            // Přepnutí platí hned: návrh se přegeneruje proti tomu, co v měsíci
            // zůstane (bez přepisu počítá s uloženými směnami jako s obsazenými).
            <ul className="list">
              <SwitchRow checked={clearBeforeCommit} onChange={(v) => zadejGenerovani(v)} title={t('Nahradit uložené směny měsíce')}
                hint={clearBeforeCommit
                  ? (shifts.length > 0
                    ? t('Uložením návrhu zmizí {smeny}.', { smeny: ulozeneVMesici(t, shifts.length) })
                    : t('V měsíci zatím nic uloženého není.'))
                  : t('Návrh se přidá k uloženým směnám a počítá s nimi — nic se nesmaže.')} />
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" icon="check" loading={committing} disabled={preview.proposed.length === 0 || publishing} onClick={() => { void commitPreview(); }}>
              {t('Potvrdit a uložit')}
            </Button>
            <Button variant="secondary" size="sm" disabled={committing || publishing} onClick={zahoditNavrh}>{t('Zahodit náhled')}</Button>
          </div>
        </Well>
      )}

      {loading ? (
        <div className="space-y-2" aria-busy>
          <Skeleton className="h-4 w-1/2 rounded-full" />
          <Skeleton className="h-72" />
        </div>
      ) : loadError ? (
        <ErrorState compact title={t('Rozvrh se nenačetl')} onRetry={load} detail={loadError} />
      ) : (
        <div className="min-w-0">
          <StavFiltru text={stavFiltru} />
          <div ref={filtrObalRef}>
          {/* Filtr: pás lidí (kolik kdo má směn), přehled vytížení, pás typů
              a „jen díry". Pás se ukáže, až je co filtrovat (DESIGN.md). */}
          {(pasLidi.length >= 2 || filtr.lide.length > 0) && (
            <PasLidi lide={pasLidi} vybrani={filtr.lide} celkem={celkemVPasu} navrh={!!preview}
              onPrepni={(id) => setFiltr(f => ({ ...f, lide: prepni(f.lide, id) }))}
              onVsichni={() => setFiltr(f => ({ ...f, lide: [] }))} />
          )}
          {ukazPasTypu && (
            <PasTypu typy={pasTypu} vybrane={filtr.typy} tecka={tridaTecky} navrh={!!preview}
              onPrepni={(nazev) => setFiltr(f => ({ ...f, typy: prepni(f.typy, nazev) }))}
              diry={problemDates.length > 0 || filtr.jenDiry ? problemDates.length : null}
              jenDiry={filtr.jenDiry} onJenDiry={() => setFiltr(f => ({ ...f, jenDiry: !f.jenDiry }))} />
          )}
          {planovac && lideMesice.length > 0 && (
            <div className="mt-2">
              <PrehledLidi v={vytizeniLidi} radky={radkyPrehledu} razeni={razeni} onRazeni={setRazeni}
                otevreno={prehledOtevren} onOtevreno={setPrehledOtevren} vybrani={filtr.lide}
                onVyber={vyberClovekaZPrehledu} navrh={!!preview} dostupnostViditelna={smiDostupnost}
                bezFiltru={filtr.typy.length > 0 && filtr.jenDiry ? t('všechny typy a dny') : filtr.typy.length > 0 ? t('všechny typy směn') : filtr.jenDiry ? t('všechny dny') : null} />
            </div>
          )}
          {filtrAktivni && (
            <div className="mt-3">
              <ListaFiltru popis={popisFiltru(filtr, jmenaFiltru, kratkaFiltru, t)} vysledek={popisVysledku(viditelnych, !!preview, t)} onZrusit={zrusFiltr} />
            </div>
          )}
          </div>
          <ul className="flex items-center gap-x-3 gap-y-1 t-meta flex-wrap mb-3 mt-3" aria-label={t('Legenda')}>
            {/* Typy s tečkou ukazuje pás typů — v legendě by byly podruhé. */}
            {!ukazPasTypu && shiftTypes.map((ty) => (
              <li key={ty.id} className="flex items-center gap-1.5">
                <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${tridaTecky(ty.color)}`} /> {ty.name}
              </li>
            ))}
            {preview && (
              <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full border border-dashed border-black/50 dark:border-white/50" /> {t('Návrh')}</li>
            )}
            {/* Dvě úrovně se liší barvou I tvarem: povinná = červený výstražný
                trojúhelník, žádoucí = oranžová tečka (tokeny wait jako v okně dne
                a ve widgetu Díry). Samotný odstín červené na telefonu a v tmavém
                režimu nešel rozlišit. */}
            {povinneDny.length > 0 && (
              <li className="flex items-center gap-1.5 text-bad-ink"><Icon name="warning" size={13} className="shrink-0" /> {t('Nikdo neotevře')}</li>
            )}
            {problemDates.length > povinneDny.length && (
              <li className="flex items-center gap-1.5 text-wait-ink"><span aria-hidden className="h-2 w-2 rounded-full bg-wait" /> {t('Chybí druhý člověk')}</li>
            )}
            {Object.keys(demand).length > 0 && (
              <li className="flex items-center gap-1.5"><Icon name="users" size={13} className="shrink-0 text-black/45" /> {t('Rezervovaní hosté')}</li>
            )}
          </ul>
          {/* tabIndex -1: kam se vrátí fokus, když zmizí poslední prvek filtru. */}
          <div ref={mrizkaRef} tabIndex={-1} aria-label={t('Mřížka rozvrhu')} className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5 scroll-mt-4 outline-none">
            {zkratkyDnuJazyk(zacatek, jazyk).map((d) => (
              <div key={d} className="text-center text-[11px] font-medium text-black/35 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
            {grid.map((cell, i) => {
              if (!cell) return <div key={i} />;
              const day = parseInt(cell.split('-')[2]);
              // Filtr lidí a typů směny ostatních SKRYJE (ne ztlumí): ztlumené
              // by v plné mřížce pořád přehlušily těch pár, o které jde.
              const dayShifts = (shiftsByDay[cell] ?? []).filter(s => projdeSmena({ employeeId: s.employeeId, typ: typUlozene(s) }, filtr));
              const dayProposed = (proposedByDay[cell] ?? []).filter(p => projdeSmena({ employeeId: p.employeeId, typ: typNavrhu(p) }, filtr));
              const problem = problemsByDate[cell];
              // „Jen dny s dírou": den bez díry zůstane v mřížce jako prázdné
              // místo s číslem (týden se nerozsype), bez směn a bez klepnutí.
              if (!denProjde(denVidet(cell), filtr)) {
                return (
                  <div key={cell} data-mimo-filtr className="min-h-[84px] min-w-0 rounded-xl p-1 sm:p-1.5 border border-dashed border-black/[0.08]">
                    <span className="text-[11px] sm:text-xs font-medium text-black/35">{day}</span>
                  </div>
                );
              }
              // Dvě úrovně: nikdo neotevře (povinná — podnik se neotevře) svítí
              // plně červeně, chybějící druhý člověk (žádoucí) jen jemně.
              const hole = !!problem?.gaps.some(jePovinna);
              // S filtrem lidí nebo typu je díra jen tenká značka u horní hrany:
              // plánovač řeší Evu, ne obsazení — ale přehled o dírách neztratí.
              // S „jen díry" zůstává plné zvýraznění, o díry tam jde.
              const znacka = !!problem && filtrujeSmeny && !filtr.jenDiry;
              const problemTitle = problem
                ? [
                    ...problem.gaps.map(g => jePovinna(g)
                      ? t('Nikdo neotevře — {od}–{do} v podniku nikdo, podnik se neotevře', { od: g.from, do: g.to })
                      : t('{od}–{do} v podniku nikdo — chybí druhý člověk', { od: g.from, do: g.to })),
                    ...problem.missing.map(m => t('Neobsazená směna „{nazev}"', { nazev: m.shiftTypeName })),
                  ].join(' · ')
                : undefined;
              return (
                <button
                  key={cell}
                  type="button"
                  onClick={() => otevriDen(cell)}
                  title={problemTitle}
                  aria-label={`${dayLabel(cell, jazyk)}: ${smenTxt(t, dayShifts.length)}${filtrujeSmeny ? ` ${t('podle filtru')}` : ''}${nahradiUlozene && dayShifts.length > 0 ? ` (${t('uložením návrhu se nahradí')})` : ''}${dayProposed.length > 0 ? `, ${t('v návrhu {smen}', { smen: smenTxt(t, dayProposed.length) })}` : ''}${hole ? `, ${t('nikdo neotevře')}` : problem ? `, ${t('chybí druhý člověk')}` : ''}`}
                  data-dira={hole ? 'povinna' : problem ? 'zadouci' : undefined}
                  data-znacka-diry={znacka ? 'ano' : undefined}
                  className={`min-h-[84px] min-w-0 rounded-xl p-1 sm:p-1.5 text-left transition-colors flex flex-col gap-1 overflow-hidden border ${
                    hole && !znacka
                      ? 'bg-bad/15 border-bad/60 hover:bg-bad/20'
                      : problem && !znacka
                        ? 'bg-wait/[0.08] border-wait/40 hover:bg-wait/15'
                        : 'bg-black/[0.03] border-black/[0.08] hover:border-black/20'
                  }`}
                >
                  <span className="flex items-center gap-1 min-w-0">
                    <span className={`text-[11px] sm:text-xs font-medium ${hole && !znacka ? 'text-bad-ink' : 'text-black/55'}`}>{day}</span>
                    {/* Díra se tvarem pozná i bez barvy (WCAG 1.4.1): povinná
                        = výstražná ikona, žádoucí = tečka. S filtrem jen bez
                        podbarvení buňky a tečka v sytém odstínu (-ink), světlá
                        wait na šedé buňce má kontrast ~2:1. */}
                    {hole
                      ? <Icon name="warning" size={11} className="flex-shrink-0 text-bad-ink" />
                      : problem && <span aria-hidden className={`flex-shrink-0 rounded-full h-1.5 w-1.5 ${znacka ? 'bg-wait-ink' : 'bg-wait'}`} />}
                  </span>
                  <span className="flex flex-col gap-1 min-w-0 overflow-hidden" aria-hidden>
                    {demand[cell]?.guests > 0 && (
                      <span title={t('{rez, plural, one {# rezervace} few {# rezervace} other {# rezervací}} na {hoste, plural, one {# hosta} few {# hosty} other {# hostů}}', { rez: demand[cell].reservations, hoste: demand[cell].guests })}
                        className="flex items-center gap-1 min-w-0 rounded-full px-1 py-0.5 text-[11px] font-semibold overflow-hidden bg-black/[0.06] text-black/70">
                        <Icon name="users" size={11} className="flex-shrink-0" />
                        <span className="truncate min-w-0 tabular-nums">{demand[cell].guests}</span>
                      </span>
                    )}
                    {(eventsByDate[cell] ?? []).map((ev: any) => (
                      <span key={`e-${ev.id}`} title={ev.startTime ? t('Akce: {nazev} od {cas}', { nazev: ev.title, cas: ev.startTime }) : t('Akce: {nazev}', { nazev: ev.title })}
                        className="flex items-center gap-1 min-w-0 rounded-full px-1 py-0.5 text-[11px] font-semibold overflow-hidden bg-info/15 text-info-ink">
                        <Icon name="calendarCheck" size={11} className="flex-shrink-0" />
                        <span className="truncate min-w-0">{ev.title}</span>
                      </span>
                    ))}
                    {dayShifts.slice(0, 3).map((s) => {
                      const rt = resolveShiftType(s, shiftTypes, t);
                      return (
                        <span key={s.id} title={`${s.employeeName} · ${rt.label} · ${s.startTime}–${s.endTime}`}
                          // Uložení návrhu tyhle směny přepíše — v mřížce proto ztlumené a přeškrtnuté,
                          // ať je vidět, co zůstane. Tlumí se tokenem (text-black/45 hlídá kontrola
                          // kontrastu), ne opacity: ta na 11 px srazila kontrast asi na 2 : 1.
                          className={`flex items-center gap-1 min-w-0 rounded-full px-1 py-0.5 text-[11px] font-medium overflow-hidden bg-black/[0.05] ${nahradiUlozene ? 'line-through text-black/45' : 'text-black/70'}`}>
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 ${tridaTecky(rt.color)}`} />
                          <span className="flex-shrink-0">{s.employeeAvatar}</span>
                          <span className="truncate min-w-0">{s.startTime}</span>
                        </span>
                      );
                    })}
                    {dayShifts.length > 3 && <span className="text-[11px] text-black/45">{t('+{n} další', { n: dayShifts.length - 3 })}</span>}
                    {dayProposed.slice(0, 3).map((p, idx) => (
                      <span key={`p-${idx}`}
                        title={`${t('Návrh')}: ${p.employeeName} · ${p.shiftTypeName} ${p.startTime}–${p.endTime}${(p as any).split ? ` (${t('část směny')})` : ''}`}
                        className="flex items-center gap-1 min-w-0 rounded-full px-1 py-0.5 text-[11px] font-medium overflow-hidden border border-dashed border-black/30 dark:border-white/40 text-black/70">
                        <span className="flex-shrink-0 inline-flex items-center gap-0.5"><Icon name="sparkle" size={11} />{p.employeeAvatar}</span>
                        <span className="truncate min-w-0">{p.startTime}</span>
                      </span>
                    ))}
                    {dayProposed.length > 3 && <span className="text-[11px] text-black/45">{t('+{n} v návrhu', { n: dayProposed.length - 3 })}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );

  const obsahZalozky = aktivniTab === 'kalendar' ? (
    <div className="space-y-3">
      <p className="t-meta">{t('Kdo kdy pracoval, kdo udělal uzávěrku a kde chybí.')}</p>
      <ShiftCalendar />
    </div>
  ) : aktivniTab === 'typy' ? (
    <ShiftTypesManager shiftTypes={shiftTypes} onReload={reloadTypes} />
  ) : aktivniTab === 'oteviraci' ? (
    <OpeningHoursEditor value={openingHours} readOnly={!smiOteviraci} onSaved={(v) => setOpeningHours(v)} />
  ) : aktivniTab === 'pevne' ? (
    <FixedAssignmentsManager onNavigate={onNavigate} employees={assignable} shiftTypes={shiftTypes} assignments={fixed} onReload={reloadFixed} />
  ) : aktivniTab === 'pravidla' ? (
    <ScheduleRulesManager />
  ) : null;

  return (
    <>
      {naRozvrhu ? (
        <PlochaWidgetu stranka="vedeni.rozvrh" hlavicka={hlavicka} nastroj={nastroj} />
      ) : (
        // Záložky nastavení widgety nemají: stejná hlavička, pod ní jen obsah záložky.
        <div className="space-y-6 pb-24 p-4 sm:p-6">
          <PageHeader title={t('Rozvrh')} subtitle={t('Sestav měsíční rozvrh podle dostupnosti týmu.')} aside={aside} />
          {loading && aktivniTab !== 'kalendar' && aktivniTab !== 'pravidla'
            ? <Skeleton className="h-64" />
            : loadError && aktivniTab !== 'kalendar' && aktivniTab !== 'pravidla'
              ? <Card><ErrorState compact title={t('Nastavení rozvrhu se nenačetlo')} onRetry={load} detail={loadError} /></Card>
              : obsahZalozky}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        aria-label={t('Soubor CSV s rozvrhem')}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />

      {upgradeFor && <UpgradeModal feature={upgradeFor} onClose={() => setUpgradeFor(null)} />}

      {confirmClear && (
        <Modal open onClose={() => setConfirmClear(false)} size="sm" title={t('Vymazat celý měsíc?')} subtitle={<span className="cz-sentence">{monthLabel(month, jazyk)}</span>}
          footer={<>
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>{t('Zrušit', undefined, 'dialog')}</Button>
            <Button variant="danger-solid" icon="trash" loading={clearing} onClick={clearMonth}>{t('Vymazat měsíc')}</Button>
          </>}>
          <p className="text-sm text-black/60 text-pretty">{t('Smaže {smeny} tohoto měsíce. Nejde to vzít zpět — lidé, kterým rozvrh přišel, ho ale v upozornění pořád mají.', { smeny: smenTxt(t, shifts.length) })}</p>
        </Modal>
      )}

      {copyOpen && (
        <Modal open onClose={() => setCopyOpen(false)} size="sm" title={t('Kopírovat týden')}
          subtitle={t('Směny zdrojového týdne se naplánují do cílového — stejné dny, časy i lidi.')}
          footer={<>
            <Button variant="secondary" onClick={() => setCopyOpen(false)}>{t('Zrušit', undefined, 'dialog')}</Button>
            <Button variant="primary" icon="copy" loading={copying} disabled={!copySrc || !copyDst} onClick={copyWeek}>{t('Zkopírovat')}</Button>
          </>}>
          <div className="space-y-3">
            <Field id="kopie-z" label={t('Zkopírovat týden')}>
              <Select id="kopie-z" value={copySrc} onChange={(e) => setCopySrc(e.target.value)}>
                <option value="">{t('Vyber týden…')}</option>
                {weekOptions(4, 0).map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
              </Select>
            </Field>
            <Field id="kopie-do" label={t('Do týdne')}>
              <Select id="kopie-do" value={copyDst} onChange={(e) => setCopyDst(e.target.value)}>
                <option value="">{t('Vyber týden…')}</option>
                {weekOptions(0, 5).map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
              </Select>
            </Field>
            {copyMsg && <p className={`note ${copyMsg.ok ? 'note-ok' : 'note-danger'} text-sm`} role={copyMsg.ok ? 'status' : 'alert'}>{copyMsg.text}</p>}
          </div>
        </Modal>
      )}

      {importPreview && (
        <Modal open onClose={() => setImportPreview(null)} size="lg" title={t('Náhled importu')}
          subtitle={importPreview.rows.length ? t('{n, plural, one {# platná směna} few {# platné směny} other {# platných směn}} k importu', { n: importPreview.rows.length }) : undefined}
          footer={<>
            <Button variant="secondary" onClick={() => setImportPreview(null)}>{t('Zrušit', undefined, 'dialog')}</Button>
            <Button variant="primary" icon="upload" loading={importing} disabled={importPreview.rows.length === 0} onClick={confirmImport}>
              {t('Importovat {smeny}', { smeny: smenTxt(t, importPreview.rows.length) })}
            </Button>
          </>}>
          <div className="space-y-4">
            <Well className="t-meta">
              {t('Očekávaný formát:')} <code className="text-black/80">datum;zaměstnanec;od;do;typ</code> {t('— např.')}{' '}
              <code className="text-black/80">2026-08-03;anna@priklad.cz;08:00;14:00;morning</code>. {t('Sloupec „zaměstnanec" může být e-mail nebo jméno (i vedení), typ název typu směny nebo morning, afternoon, flexible. Soubor z Exportu CSV jde načíst zpátky beze změny.')}
            </Well>
            {importPreview.rows.length > 0 && (
              <div className="rounded-2xl border border-black/[0.08] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-xs">
                    <thead className="bg-black/[0.04] text-black/55">
                      <tr>
                        <th className="text-left px-3 py-2">{t('Datum')}</th>
                        <th className="text-left px-3 py-2">{t('Zaměstnanec')}</th>
                        <th className="text-left px-3 py-2">{t('Od')}</th>
                        <th className="text-left px-3 py-2">{t('Do')}</th>
                        <th className="text-left px-3 py-2">{t('Typ')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.06]">
                      {importPreview.rows.slice(0, 40).map((r, i) => (
                        <tr key={i} className="text-black/80">
                          <td className="px-3 py-1.5 tabular-nums">{r.date}</td>
                          <td className="px-3 py-1.5">{r.employeeName}</td>
                          <td className="px-3 py-1.5 tabular-nums">{r.startTime}</td>
                          <td className="px-3 py-1.5 tabular-nums">{r.endTime}</td>
                          <td className="px-3 py-1.5">{resolveShiftType(r, shiftTypes, t).label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importPreview.rows.length > 40 && <p className="t-meta px-3 py-2">{t('…a dalších {n}', { n: importPreview.rows.length - 40 })}</p>}
              </div>
            )}
            {importPreview.errors.length > 0 && (
              <div className="note note-danger">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Icon name="warning" size={16} className="shrink-0" /> {t('{n, plural, one {# problém} few {# problémy} other {# problémů}} (přeskočeno)', { n: importPreview.errors.length })}
                </p>
                <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto list-disc pl-4 mt-1">
                  {importPreview.errors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>
        </Modal>
      )}

      {cekaMesic && (
        <Modal open onClose={() => setCekaMesic(null)} size="sm" title={t('Návrh není uložený')}
          subtitle={<span className="cz-sentence">{monthLabel(month, jazyk)}</span>}
          footer={<>
            <Button variant="secondary" onClick={() => {
              const c = cekaMesic; setCekaMesic(null); setPreview(null); maNavrhRef.current = false;
              setMonth(c.mesic); if (c.den) setDayModal(c.den);
            }}>{t('Zahodit')}</Button>
            <Button variant="primary" icon="check" loading={committing} disabled={!preview || preview.proposed.length === 0}
              onClick={async () => {
                const c = cekaMesic;
                if (!(await commitPreview())) { setCekaMesic(null); return; }
                setCekaMesic(null); maNavrhRef.current = false;
                setMonth(c.mesic); if (c.den) setDayModal(c.den);
              }}>{t('Uložit a přepnout')}</Button>
          </>}>
          <p className="text-sm text-black/60 text-pretty">
            {t('Navržený rozvrh i s tvými úpravami je zatím jen tady v prohlížeči. Při přepnutí měsíce by se zahodil.')}
            {nahradiUlozene && shifts.length > 0 ? ` ${t('Uložením zmizí {smeny}.', { smeny: ulozeneVMesici(t, shifts.length) })}` : ''}
          </p>
        </Modal>
      )}

      {ptamSe && (
        <Modal open onClose={() => setPtamSe(null)} size="sm" title={t('Návrh má tvoje úpravy')}
          subtitle={<span className="cz-sentence">{monthLabel(month, jazyk)}</span>}
          footer={<>
            <Button variant="secondary" onClick={() => setPtamSe(null)}>{t('Nechat')}</Button>
            <Button variant="danger-solid" onClick={() => {
              const a = ptamSe; setPtamSe(null);
              if (a.akce === 'zahodit') { setPreview(null); return; }
              setClearBeforeCommit(a.nahradit);
              void generate(a.nahradit);
            }}>{ptamSe.akce === 'zahodit' ? t('Zahodit návrh') : t('Zahodit a vygenerovat znovu')}</Button>
          </>}>
          <p className="text-sm text-black/60 text-pretty">
            {ptamSe.akce === 'zahodit'
              ? t('V návrhu jsou ruční úpravy (přidané nebo odebrané směny). Zahozením zmizí i ony.')
              : t('Nové generování vytvoří návrh od začátku — ruční úpravy (přidané nebo odebrané směny) zmizí. Chceš-li je zachovat, návrh nejdřív ulož.')}
          </p>
        </Modal>
      )}

      {potvrdNahrazeni && (
        <Modal open onClose={() => setPotvrdNahrazeni(false)} size="sm" title={t('Nahradit uložené směny?')}
          subtitle={<span className="cz-sentence">{monthLabel(month, jazyk)}</span>}
          footer={<>
            <Button variant="secondary" onClick={() => setPotvrdNahrazeni(false)}>{t('Zrušit', undefined, 'dialog')}</Button>
            <Button variant="primary" icon="send" loading={publishing} onClick={async () => { setPotvrdNahrazeni(false); await publish(true); }}>{t('Nahradit a publikovat')}</Button>
          </>}>
          <p className="text-sm text-black/60 text-pretty">
            {t('Uložením návrhu zmizí {smeny}, a lidé hned dostanou rozvrh jen z návrhu.', { smeny: ulozeneVMesici(t, shifts.length) })}
            {' '}{t('Chceš-li je ponechat, vypni v náhledu „Nahradit uložené směny měsíce".')}
          </p>
        </Modal>
      )}

      {editAvail && (
        <EditAvailabilityModal
          member={editAvail}
          month={month}
          shiftTypes={shiftTypes}
          initial={submissions.find((x) => x.employeeId === editAvail.id) ?? null}
          jenCist={!smiDostupnostUpravit}
          volno={timeOff.filter((t) => t.employeeId === editAvail.id && t.status === 'approved')}
          onClose={() => setEditAvail(null)}
          onSaved={() => { setEditAvail(null); void poZmene(); }}
        />
      )}

      {dayModal && (
        <DayModal
          onNavigate={onNavigate}
          date={dayModal}
          readOnly={!smiUpravit}
          employees={assignable}
          shifts={shiftsByDay[dayModal] ?? []}
          proposed={proposedByDay[dayModal] ?? []}
          events={eventsByDate[dayModal] ?? []}
          shiftTypes={shiftTypes}
          openingHours={openingHours}
          unavailable={unavailableOn(dayModal)}
          submissions={submissions}
          navrh={!!preview}
          nahradiUlozene={nahradiUlozene}
          filtrAktivni={filtrujeSmeny}
          // Jen se zapnutým doporučením podle tržeb — jinak undefined a okno o tržbách mlčí.
          doporuceni={doporuceniByDate[dayModal]}
          // Dostupnost týmu jen s dostupnost.zobrazit — data jsou tatáž, která
          // plánovač načetl pro měsíc (jeden dotaz, ne dotaz na každý den).
          dostupnost={smiDostupnost ? { submissions, volno: timeOff } : null}
          onClose={zavriDen}
          // S otevřeným návrhem se přidává do návrhu, jinak rovnou do rozvrhu.
          onAdd={pridejVOkne}
          onRemove={removeShift}
          onRemoveProposed={odeberZNavrhu}
        />
      )}
      <Toast message={hlaskaFiltru?.text ?? null} id={hlaskaFiltru?.id} onClose={() => setHlaskaFiltru(null)}
        action={hlaskaFiltru ? { label: t('Ukázat'), onClick: () => { ukazPridane(hlaskaFiltru.ukazat); setHlaskaFiltru(null); } } : undefined} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Souhrn doporučení podle tržeb v náhledu návrhu. Kreslí se jen tehdy, když
// server poslal `trzby` — tedy když je funkce v Pravidlech zapnutá. Vypnutá
// = o tržbách ani slovo (Martin: „ať to tam zbytečně není").
// ---------------------------------------------------------------------------

function SouhrnTrzeb({ trzby, doporuceni, hodiny }: {
  trzby: NonNullable<NahledGeneratoru['trzby']>;
  doporuceni: Doporuceni[];
  hodiny?: NahledGeneratoru['hodiny'];
}) {
  const t = useT('rozvrh');
  const { money } = useCurrency();
  if (trzby.stav !== 'ok') {
    const text = trzby.stav === 'bez_opravneni'
      ? t('Počet lidí podle tržeb je zapnutý, ale na tržby nemáš oprávnění — generátor ho vynechal a řídil se jen otevírací směnou.')
      : trzby.stav === 'bez_prahu'
        ? t('Počet lidí podle tržeb je zapnutý, ale chybí práh — nastav ho v záložce Pravidla.')
        : t('Počet lidí podle tržeb je zapnutý, ale za posledních 8 týdnů nejsou uzávěrky s tržbou — generátor se řídil jen otevírací směnou.');
    return <p className="note note-wait text-sm text-pretty" data-souhrn-trzeb={trzby.stav}>{text}</p>;
  }
  const jeden = doporuceni.filter((x) => jedenUplatnen(x));
  const dva = doporuceni.filter((x) => x.lidi === 2);
  // Tržba by stačila na jednoho, ale otevírací směna nepokryje celý den —
  // generátor proto dal dva (jinak by „jeden" znamenal zavřít v půli dne).
  const nepokryje = doporuceni.filter((x) => x.lidi === 1 && x.nepokryjeJeden);
  const prumerJeden = jeden.length ? Math.round(jeden.reduce((n, x) => n + x.trzba, 0) / jeden.length) : 0;
  return (
    <p className="t-meta flex items-start gap-1.5 text-pretty" data-souhrn-trzeb="ok">
      <Icon name="users" size={15} className="shrink-0 mt-0.5 text-black/40" />
      <span>
        {jeden.length > 0 && <>{t('Stačí jeden — {dny}, očekávaná tržba ~{trzba}.', { dny: dnuTxt(t, jeden.length), trzba: money(prumerJeden) })} </>}
        {dva.length > 0 && <>{t('Dva lidé — {dny} nad prahem {prah}.', { dny: dnuTxt(t, dva.length), prah: money(trzby.prah ?? 0) })} </>}
        {nepokryje.length > 0 && <>{t('{dny} by tržba stačila na jednoho, ale otevírací směna nepokryje celou otevírací dobu — proto dva.', { dny: dnuTxt(t, nepokryje.length) })} </>}
        {jeden.length === 0 && dva.length === 0 && nepokryje.length === 0 && <>{t('Na dny v tomhle měsíci nejsou tržby k porovnání s prahem.')} </>}
        {hodiny && hodiny.usporaDoporucenim > 0 && <>{t('Oproti dvěma lidem to ušetří ~{hodiny}.', { hodiny: hodinuTxt(t, Math.round(hodiny.usporaDoporucenim)) })}</>}
      </span>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Typy směn
// ---------------------------------------------------------------------------

/** Barevná tečka typu směny — třída kategorie, ne inline hex (stejně jako widgety). */
function TeckaBarvy({ barva, className = '' }: { barva: string | null | undefined; className?: string }) {
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${tridaTecky(barva)} ${className}`} />;
}

const nazvyBarev = (t: PrekladFn): Record<string, string> => ({
  '#C8F542': t('limetková'), '#0A84FF': t('modrá'), '#8B5CF6': t('fialová'), '#F59E0B': t('oranžová'),
  '#14B8A6': t('tyrkysová'), '#EC4899': t('růžová'),
});

function ShiftTypesManager({ shiftTypes, onReload }: { shiftTypes: ShiftType[]; onReload: () => Promise<void> }) {
  const t = useT('rozvrh');
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [name, setName] = useState('');
  const [start, setStart] = useState('06:00');
  const [end, setEnd] = useState('14:00');
  const [color, setColor] = useState(COLORS[0]);
  const [startsAtOpen, setStartsAtOpen] = useState(false);
  const [endsAtClose, setEndsAtClose] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [smazat, setSmazat] = useState<ShiftType | null>(null);

  const beginNew = () => {
    setEditing('new'); setName(''); setStart('06:00'); setEnd('14:00'); setColor(COLORS[0]);
    setStartsAtOpen(false); setEndsAtClose(false); setErr('');
  };
  const beginEdit = (ty: ShiftType) => {
    setEditing(ty.id); setName(ty.name); setStart(ty.startTime); setEnd(ty.endTime); setColor(ty.color ?? COLORS[0]);
    setStartsAtOpen(!!ty.startsAtOpen); setEndsAtClose(!!ty.endsAtClose); setErr('');
  };

  const save = async () => {
    if (!name.trim()) return;
    setErr('');
    setBusy(true);
    try {
      const payload = { name: name.trim(), startTime: start, endTime: end, color, startsAtOpen, endsAtClose };
      const res = editing === 'new'
        ? await fetch('/api/shift-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch(`/api/shift-types/${editing}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) {
        // Server umí říct, že typ spravuje jiný podnik organizace — ať to člověk vidí.
        const d = await res.json().catch(() => ({}));
        setErr(d?.error ? tg(d.error) : t('Typ směny se nepodařilo uložit.'));
        return;
      }
      setEditing(null);
      await onReload();
    } catch {
      setErr(t('Nepodařilo se spojit se serverem.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!smazat) return;
    setErr('');
    setBusy(true);
    try {
      const res = await fetch(`/api/shift-types/${smazat.id}`, { method: 'DELETE' });
      if (!res.ok) setErr(t('Typ směny se nepodařilo smazat.'));
      setSmazat(null);
      await onReload();
    } catch {
      setErr(t('Nepodařilo se spojit se serverem.'));
    } finally {
      setBusy(false);
    }
  };

  const formular = (
    <TypeForm
      name={name} start={start} end={end} color={color} startsAtOpen={startsAtOpen} endsAtClose={endsAtClose} busy={busy}
      setName={setName} setStart={setStart} setEnd={setEnd} setColor={setColor}
      setStartsAtOpen={setStartsAtOpen} setEndsAtClose={setEndsAtClose}
      onSave={save} onCancel={() => setEditing(null)}
    />
  );

  return (
    <Card as="section" aria-labelledby="typy-smen" className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="typy-smen" className="t-section flex items-center gap-2 min-w-0">
          <Icon name="clock" size={17} className="text-black/40 shrink-0" /><span className="truncate">{t('Typy směn')}</span>
        </h2>
        {editing !== 'new' && <Button variant="accent" size="sm" icon="plus" onClick={beginNew}>{t('Přidat typ')}</Button>}
      </div>
      {err && <p className="note note-danger text-sm" role="alert">{err}</p>}

      {shiftTypes.length === 0 && editing !== 'new' && (
        <EmptyState illustration="smeny" title={t('Zatím žádné typy směn')} hint={t('Ranní, odpolední, otvíračka — podle nich generátor obsazuje dny. Přidej první.')} compact />
      )}

      {shiftTypes.length > 0 && (
        <ul className="list">
          {shiftTypes.map((ty) => editing === ty.id ? (
            <li key={ty.id} className="py-3">{formular}</li>
          ) : (
            <ListRow key={ty.id}
              lead={<span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/[0.035]"><TeckaBarvy barva={ty.color} className="h-3 w-3" /></span>}
              title={<>{ty.name}{ty.zOrganizace && <Chip tone="muted" size="sm" className="ml-2 align-middle">{t('z organizace')}</Chip>}{ty.sdileno && <Chip tone="info" size="sm" className="ml-2 align-middle">{t('sdíleno')}</Chip>}</>}
              meta={<>{ty.startsAtOpen ? t('otevření') : ty.startTime}–{ty.endsAtClose ? t('zavření') : ty.endTime}{ty.zOrganizace && ty.spravuje ? ` · ${t('spravuje: {podnik}', { podnik: ty.spravuje })}` : ''}</>}
              // Typ ze zdrojového podniku upraví jen jeho vedení — tlačítka by jen vracela 403.
              actions={ty.zOrganizace ? undefined : (
                <>
                  <Button variant="ghost" size="sm" iconOnly icon="pencil" aria-label={t('Upravit typ {nazev}', { nazev: ty.name })} onClick={() => beginEdit(ty)} />
                  <Button variant="ghost" size="sm" iconOnly icon="trash" aria-label={t('Smazat typ {nazev}', { nazev: ty.name })} onClick={() => setSmazat(ty)} />
                </>
              )}
            />
          ))}
        </ul>
      )}

      {editing === 'new' && formular}

      {smazat && (
        <Modal open onClose={() => setSmazat(null)} size="sm" title={t('Smazat typ „{nazev}"?', { nazev: smazat.name })}
          footer={<>
            <Button variant="secondary" onClick={() => setSmazat(null)}>{t('Zrušit', undefined, 'dialog')}</Button>
            <Button variant="danger-solid" icon="trash" loading={busy} onClick={remove}>{t('Smazat typ')}</Button>
          </>}>
          <p className="text-sm text-black/60 text-pretty">{t('Naplánované směny tohoto typu zůstanou, ale ztratí barvu i název.')}</p>
        </Modal>
      )}
    </Card>
  );
}

function TypeForm({
  name, start, end, color, startsAtOpen, endsAtClose, busy,
  setName, setStart, setEnd, setColor, setStartsAtOpen, setEndsAtClose, onSave, onCancel,
}: {
  name: string; start: string; end: string; color: string; startsAtOpen: boolean; endsAtClose: boolean; busy: boolean;
  setName: (v: string) => void; setStart: (v: string) => void; setEnd: (v: string) => void; setColor: (v: string) => void;
  setStartsAtOpen: (v: boolean) => void; setEndsAtClose: (v: boolean) => void; onSave: () => void; onCancel: () => void;
}) {
  const t = useT('rozvrh');
  const NAZEV_BARVY = nazvyBarev(t);
  return (
    <Well className="space-y-3">
      <Field id="typ-nazev" label={t('Název')} hint={t('Třeba Ranní, Odpolední nebo Otvíračka.')}>
        <Input id="typ-nazev" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="typ-od" label={t('Od')}>
          {startsAtOpen
            ? <p id="typ-od" className="t-meta py-3">{t('Otevření podniku')}</p>
            : <Input id="typ-od" type="time" value={start} onChange={(e) => setStart(e.target.value)} />}
        </Field>
        <Field id="typ-do" label={t('Do')}>
          {endsAtClose
            ? <p id="typ-do" className="t-meta py-3">{t('Zavření podniku')}</p>
            : <Input id="typ-do" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-black/70 cursor-pointer">
          <input type="checkbox" checked={startsAtOpen} onChange={(e) => setStartsAtOpen(e.target.checked)} className="h-4 w-4 accent-[#8FB811]" />
          {t('Začíná otevřením podniku')}
        </label>
        <label className="flex items-center gap-2 text-sm text-black/70 cursor-pointer">
          <input type="checkbox" checked={endsAtClose} onChange={(e) => setEndsAtClose(e.target.checked)} className="h-4 w-4 accent-[#8FB811]" />
          {t('Končí zavřením podniku')} <span className="text-black/45">{t('(do konce směny)')}</span>
        </label>
      </div>
      <div role="radiogroup" aria-label={t('Barva typu')} className="space-y-1.5">
        <p className="text-[13px] font-medium text-black/70" aria-hidden>{t('Barva')}</p>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c) => (
            // Vybraná podle kategorie: starý typ uložený jako #3B82F6 je pořád „modrá".
            // Prstenec má odsazení v barvě plochy a v tmavém režimu světlou barvu.
            <button key={c} type="button" role="radio" aria-checked={kategorieBarvy(color) === kategorieBarvy(c)} aria-label={NAZEV_BARVY[c] ?? c}
              onClick={() => setColor(c)}
              className={`tap-target-sm h-7 w-7 rounded-full transition-shadow ${tridaTecky(c)} ${kategorieBarvy(color) === kategorieBarvy(c) ? 'ring-2 ring-offset-2 ring-offset-[var(--surface)] ring-black/40 dark:ring-white/60' : ''}`} />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button variant="primary" size="sm" loading={busy} disabled={!name.trim()} onClick={onSave}>{t('Uložit')}</Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>{t('Zrušit', undefined, 'dialog')}</Button>
      </div>
    </Well>
  );
}

// ---------------------------------------------------------------------------
// Otevírací doba
// ---------------------------------------------------------------------------

function OpeningHoursEditor({ value, onSaved, readOnly = false }: {
  value: Record<string, OpeningDay>;
  onSaved: (v: Record<string, OpeningDay>) => void;
  /** Bez podnik.oteviraci_doba jen ke čtení — server by uložení odmítl. */
  readOnly?: boolean;
}) {
  const t = useT('rozvrh');
  const { jazyk } = useJazyk();
  const dnyTydne = nazvyDnuDlouze(jazyk);
  const norm = (v: Record<string, OpeningDay>) => {
    const out: Record<string, OpeningDay> = {};
    for (let d = 0; d <= 6; d++) {
      const cur = v[String(d)] ?? { open: '08:00', close: '20:00', closed: false };
      out[String(d)] = { open: cur.open ?? '08:00', close: cur.close ?? '20:00', closed: !!cur.closed };
    }
    return out;
  };
  const [hours, setHours] = useState<Record<string, OpeningDay>>(() => norm(value));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setHours(norm(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const update = (d: number, patch: Partial<OpeningDay>) => {
    setSaved(false);
    setHours((prev) => ({ ...prev, [String(d)]: { ...prev[String(d)], ...patch } }));
  };

  const save = async () => {
    setSaving(true); setErr('');
    try {
      const res = await fetch('/api/opening-hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openingHours: hours }),
      });
      const d = await okJson(res);
      onSaved(d.openingHours ?? hours);
      setSaved(true);
    } catch (e) {
      setErr(apiMessage(e, t('Otevírací dobu se nepodařilo uložit.')));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card as="section" aria-labelledby="oteviraci-doba" className="space-y-4">
      <div>
        <h2 id="oteviraci-doba" className="t-section flex items-center gap-2"><Icon name="clock" size={17} className="text-black/40 shrink-0" /> {t('Otevírací doba')}</h2>
        <p className="t-meta mt-0.5">{t('Kdy má provoz otevřeno. Zavřené dny generátor přeskočí a díry hlídá jen v otevírací době.')}</p>
      </div>

      <ul className="list">
        {dnyTydne.map((label, d) => {
          const day = hours[String(d)] ?? { open: '08:00', close: '20:00', closed: false };
          const idDne = `oteviraci-${d}`;
          return (
            <li key={d} className="flex items-center gap-3 py-3 flex-wrap min-h-[3.25rem]">
              <span id={idDne} className="w-24 text-[15px] font-medium text-[#16181A] truncate">{label}</span>
              <Switch checked={!day.closed} onChange={(on) => update(d, { closed: !on })} labelledBy={idDne} disabled={readOnly} />
              <span className="t-meta w-20">{day.closed ? t('Zavřeno') : t('Otevřeno')}</span>
              {!day.closed && (
                <div className="flex items-center gap-2">
                  <Input type="time" aria-label={t('{den} — otevírá v', { den: label })} value={day.open} disabled={readOnly}
                    onChange={(e) => update(d, { open: e.target.value })} className="!w-auto" />
                  <span className="text-black/40" aria-hidden>–</span>
                  <Input type="time" aria-label={t('{den} — zavírá v', { den: label })} value={day.close} disabled={readOnly}
                    onChange={(e) => update(d, { close: e.target.value })} className="!w-auto" />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {err && <p className="note note-danger text-sm" role="alert">{err}</p>}
      {readOnly ? (
        <p className="t-meta">{t('Otevírací dobu mění vedení s oprávněním k nastavení podniku.')}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="accent" icon="check" loading={saving} onClick={save}>{t('Uložit otevírací dobu')}</Button>
          {saved && <Chip tone="ok" icon="check">{t('Uloženo')}</Chip>}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Pevné dny
// ---------------------------------------------------------------------------

function FixedAssignmentsManager({ employees, shiftTypes, assignments, onReload, onNavigate }: {
  onNavigate?: (view: string, arg?: string) => void;
  employees: Member[];
  shiftTypes: ShiftType[];
  assignments: FixedAssignment[];
  onReload: () => Promise<void>;
}) {
  const t = useT('rozvrh');
  const { jazyk } = useJazyk();
  const dnyTydne = nazvyDnuDlouze(jazyk);
  const [employeeId, setEmployeeId] = useState<number | ''>('');
  const [weekday, setWeekday] = useState<number>(0);
  const [shiftTypeId, setShiftTypeId] = useState<number | ''>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [smazat, setSmazat] = useState<FixedAssignment | null>(null);

  const add = async () => {
    if (!employeeId) return;
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/fixed-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId, weekday, shiftTypeId: shiftTypeId === '' ? null : shiftTypeId }),
      });
      await okJson(res);
      setEmployeeId('');
      setShiftTypeId('');
      await onReload();
    } catch (e) {
      setErr(apiMessage(e, t('Pevný den se nepodařilo přidat.')));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!smazat) return;
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/fixed-assignments?id=${smazat.id}`, { method: 'DELETE' });
      if (!res.ok) setErr(t('Přiřazení se nepodařilo smazat.'));
      setSmazat(null);
      await onReload();
    } catch {
      setErr(t('Nepodařilo se spojit se serverem.'));
    } finally {
      setBusy(false);
    }
  };

  const zmenTyp = async (a: FixedAssignment, v: number | null) => {
    setErr('');
    const res = await fetch('/api/fixed-assignments', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: a.id, shiftTypeId: v }),
    }).catch(() => null);
    if (res?.ok) await onReload();
    else setErr(t('Změnu se nepodařilo uložit.'));
  };

  const byWeekday = useMemo(() => {
    const map: Record<number, FixedAssignment[]> = {};
    assignments.forEach((a) => { (map[a.weekday] ||= []).push(a); });
    return map;
  }, [assignments]);

  return (
    <div className="space-y-6">
      {err && <p className="note note-danger text-sm" role="alert">{err}</p>}
      <Card as="section" aria-labelledby="pevny-den" className="space-y-4">
        <div>
          <h2 id="pevny-den" className="t-section flex items-center gap-2"><Icon name="swap" size={17} className="text-black/40 shrink-0" /> {t('Přidat pevný den')}</h2>
          <p className="t-meta mt-0.5">{t('Přiřaď člověka k opakujícímu se dni v týdnu. Generátor ho na ten den nasadí přednostně.')}</p>
        </div>

        {employees.length === 0 ? (
          // Holá věta je slepá ulička: prázdný stav má vést tam, kde se to spraví.
          <EmptyState icon="users" compact title={t('Zatím nikdo v týmu')}
            hint={t('Pevné dny se přiřazují lidem — nejdřív je pozvi do týmu.')}
            action={onNavigate ? <Button variant="secondary" icon="users" onClick={() => onNavigate('team-settings')}>{t('Pozvat do týmu')}</Button> : undefined} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field id="pevny-kdo" label={t('Kdo')}>
              <Select id="pevny-kdo" value={employeeId} onChange={(e) => setEmployeeId(e.target.value === '' ? '' : parseInt(e.target.value))}>
                <option value="">{t('Vyber člověka…')}</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
            <Field id="pevny-den-tydne" label={t('Den v týdnu')}>
              <Select id="pevny-den-tydne" value={weekday} onChange={(e) => setWeekday(parseInt(e.target.value))}>
                {dnyTydne.map((label, d) => <option key={d} value={d}>{label}</option>)}
              </Select>
            </Field>
            <Field id="pevny-typ" label={t('Typ směny')} hint={t('Nepovinné — bez něj libovolná směna.')}>
              <Select id="pevny-typ" value={shiftTypeId} onChange={(e) => setShiftTypeId(e.target.value === '' ? '' : parseInt(e.target.value))}>
                <option value="">{t('Libovolná')}</option>
                {shiftTypes.map((ty) => <option key={ty.id} value={ty.id}>{ty.name} ({ty.startTime}–{ty.endTime})</option>)}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button variant="accent" icon="plus" block loading={busy} disabled={!employeeId} onClick={add} className="sm:!w-full">{t('Přidat pevný den')}</Button>
            </div>
          </div>
        )}
      </Card>

      <Card as="section" aria-labelledby="pevne-dny" className="space-y-3">
        <h2 id="pevne-dny" className="t-section flex items-center gap-2"><Icon name="calendar" size={17} className="text-black/40 shrink-0" /> {t('Pevné dny')}</h2>
        {assignments.length === 0 ? (
          <EmptyState icon="calendar" title={t('Zatím žádné pevné dny')} hint={t('Kdo chodí vždycky v pondělí, dostane pondělí — generátor to bere jako první.')} compact />
        ) : (
          <div className="space-y-4">
            {dnyTydne.map((label, d) => {
              const list = byWeekday[d] ?? [];
              if (list.length === 0) return null;
              return (
                <div key={d}>
                  <p className="t-label mb-1">{label}</p>
                  <ul className="list">
                    {list.map((a) => (
                      <ListRow key={a.id}
                        lead={<Avatar emoji={a.employeeAvatar} size="sm" />}
                        title={a.employeeName}
                        right={(
                          <Select aria-label={t('Typ směny — {jmeno}, {den}', { jmeno: a.employeeName, den: denVeVete(label, t.jazyk) })} value={a.shiftTypeId ?? ''}
                            onChange={(e) => zmenTyp(a, e.target.value === '' ? null : parseInt(e.target.value))} className="!w-auto !py-2 text-sm">
                            <option value="">{t('Libovolná')}</option>
                            {shiftTypes.map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
                          </Select>
                        )}
                        actions={<Button variant="ghost" size="sm" iconOnly icon="trash" aria-label={t('Odebrat pevný den — {jmeno}, {den}', { jmeno: a.employeeName, den: denVeVete(label, t.jazyk) })} onClick={() => setSmazat(a)} />}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {smazat && (
        <Modal open onClose={() => setSmazat(null)} size="sm" title={t('Odebrat pevný den?')}
          subtitle={`${smazat.employeeName} · ${denVeVete(dnyTydne[smazat.weekday] ?? '', t.jazyk)}`}
          footer={<>
            <Button variant="secondary" onClick={() => setSmazat(null)}>{t('Zrušit', undefined, 'dialog')}</Button>
            <Button variant="danger-solid" icon="trash" loading={busy} onClick={remove}>{t('Odebrat')}</Button>
          </>}>
          <p className="text-sm text-black/60 text-pretty">{t('Z příštího generování rozvrhu vypadne. Už naplánované směny zůstanou.')}</p>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Okno dne — přiřazení směn
// ---------------------------------------------------------------------------

const VLASTNI_CAS = '__vlastni';

function DayModal({
  date, onNavigate, employees, shifts, proposed = [], shiftTypes, openingHours, unavailable, submissions,
  onClose, onAdd, onRemove, onRemoveProposed, events = [], readOnly = false,
  navrh = false, nahradiUlozene = false, dostupnost = null, doporuceni, filtrAktivni = false,
}: {
  onNavigate?: (view: string, arg?: string) => void;
  date: string;
  employees: Member[];
  shifts: Shift[];
  proposed?: Proposed[];
  shiftTypes: ShiftType[];
  openingHours: Record<string, OpeningDay>;
  unavailable: Set<number>;
  submissions: Submission[];
  onClose: () => void;
  onAdd: (p: { employeeId: number; date: string; startTime: string; endTime: string; type: string }) => Promise<boolean>;
  onRemove: (id: number) => void;
  onRemoveProposed?: (p: Proposed) => void;
  events?: any[];
  /** Náhled rozvrhu (rozvrh.nahled) nebo bez rozvrh.upravit: jen čtení. */
  readOnly?: boolean;
  /** Je otevřený neuložený návrh — přidání jde do něj. */
  navrh?: boolean;
  /** Uložení návrhu přepíše měsíc: uložené směny dne zmizí, počítá se jen návrh. */
  nahradiUlozene?: boolean;
  /** Dostupnost týmu na měsíc; null = role ji nevidí a sekce se nekreslí. */
  dostupnost?: { submissions: Submission[]; volno: { employeeId: number; fromDate: string; toDate: string; type?: string | null }[] } | null;
  /** Doporučení počtu lidí podle tržeb (jen když je funkce zapnutá a v návrhu). */
  doporuceni?: Doporuceni;
  /** Mřížka je vyfiltrovaná na lidi nebo typ — okno přesto ukazuje celý den. */
  filtrAktivni?: boolean;
}) {
  const t = useT('rozvrh');
  const { jazyk } = useJazyk();
  const { money } = useCurrency();
  // Otevírací doba TOHO dne (klíč 0 = pondělí … 6 = neděle).
  const oh = openingHours[weekdayKey(date)] as OpeningDay | undefined;
  const dayOpen = oh && !oh.closed ? oh.open : null;
  const dayClose = oh && !oh.closed ? oh.close : null;

  // Konkrétní časy typu pro tento den (podle otevření a zavření).
  const resolveTimes = (t: ShiftType) => ({
    start: t.startsAtOpen && dayOpen ? dayOpen : t.startTime,
    end: t.endsAtClose && dayClose ? dayClose : t.endTime,
  });

  // Pokrytí toho jednoho dne — okno je místo, kde se díra opravuje.
  // Co ten den po uložení opravdu bude: s přepsáním měsíce jen návrh.
  const obsazene = useMemo<{ employeeId: number; startTime: string; endTime: string; type?: string; shiftTypeName?: string }[]>(
    () => [...(nahradiUlozene ? [] : shifts), ...proposed],
    [nahradiUlozene, shifts, proposed],
  );
  const dayGaps = useMemo(
    () => uncovered(openSpan(oh ?? null), obsazene.map((x) => ({ start: x.startTime, end: x.endTime }))),
    [oh, obsazene],
  );
  // Stejné dvě úrovně jako generátor: díra od otevření = nikdo neotevře.
  const nikdoNeotevre = useMemo(() => {
    const open = openSpan(oh ?? null);
    return !!open && dayGaps.some((g) => urovenDiry(open, g) === 'povinna');
  }, [oh, dayGaps]);
  const lidiDne = useMemo(() => new Set(obsazene.map((x) => x.employeeId)).size, [obsazene]);
  const missingHere = useMemo(() => {
    if (!oh || oh.closed) return [] as string[];
    // Podle tržeb stačí jeden: druhou směnu generátor vědomě neobsadil,
    // okno ji nesmí hlásit jako chybějící (jen když ho opravdu uplatnil).
    if (jedenUplatnen(doporuceni)) return [] as string[];
    const taken = new Set(obsazene.map((x) => String((x as any).type ?? (x as any).shiftTypeName ?? '').trim().toLowerCase()));
    // Den psaný ručně (vlastní časy, žádný nastavený typ) se neřeší.
    const known = new Set(shiftTypes.map((t) => t.name.trim().toLowerCase()));
    if (taken.size === 0 || !Array.from(taken).some((t) => known.has(t))) return [] as string[];
    return shiftTypes
      .filter((t) => typeFitsDay(t as any, oh as any) && !taken.has(t.name.trim().toLowerCase()))
      .map((t) => t.name);
  }, [oh, obsazene, shiftTypes, doporuceni]);

  const first = shiftTypes[0];
  const [employeeId, setEmployeeId] = useState<number | ''>('');
  // Vybraný typ ('' = vlastní čas).
  const [typeName, setTypeName] = useState<string>(first ? first.name : '');
  const [start, setStart] = useState(first ? resolveTimes(first).start : '08:00');
  const [end, setEnd] = useState(first ? resolveTimes(first).end : '16:00');
  const [saving, setSaving] = useState(false);

  const applyShiftType = (t: ShiftType) => {
    const rt = resolveTimes(t);
    setStart(rt.start); setEnd(rt.end); setTypeName(t.name);
  };
  const pickCustom = () => setTypeName('');

  // Varování místo confirm(): člověk den označil jako nedostupný, nebo má na
  // něj závaznou volbu jiného typu, nebo obecně preferuje jinou směnu. Ukáže
  // se hned při výběru a tlačítko řekne „Přesto přidat" — dřív vyskočilo
  // systémové okno, které na telefonu zakrylo celý den.
  const varovani = useMemo(() => {
    if (!employeeId) return null;
    const emp = Number(employeeId);
    const sub = submissions.find((s) => s.employeeId === emp);
    const empName = employees.find((e) => e.id === emp)?.name ?? t('Tenhle člověk');
    const shiftCat = start < '12:00' ? 'morning' : 'afternoon';
    const dayPref = sub?.dayPreferences?.[date];
    const prefTypesForCheck = shiftTypes.map((t) => ({ id: t.id, name: t.name, start: t.startTime }));
    const slotTypeId = shiftTypes.find((t) => t.name === typeName)?.id ?? null;
    const prefBlocks = dayPref && dayPref !== 'off' && dayPref !== 'flexible'
      && !prefAllowsSlot(dayPref, { typeId: slotTypeId, start }, prefTypesForCheck);
    if (unavailable.has(emp)) return t('{jmeno} má tento den jako nedostupný (nebo schválené volno).', { jmeno: empName });
    if (prefBlocks) return t('{jmeno} má na tento den závaznou volbu „{volba}" — tahle směna jí neodpovídá.', { jmeno: empName, volba: prelozPopisStavu(t, dayPrefLabel(dayPref, prefTypesForCheck) ?? '') });
    if (!dayPref && sub?.preferredShift && sub.preferredShift !== 'flexible' && sub.preferredShift !== shiftCat) {
      return sub.preferredShift === 'morning' ? t('{jmeno} preferuje ranní směny.', { jmeno: empName }) : t('{jmeno} preferuje odpolední směny.', { jmeno: empName });
    }
    return null;
  }, [employeeId, start, typeName, submissions, employees, shiftTypes, unavailable, date, t]);

  // Druhá směna téhož člověka na překrývající se čas je vždycky omyl.
  const kolidujeRucne = !!employeeId && kolize(obsazene.filter((x) => x.employeeId === Number(employeeId)), { startTime: start, endTime: end });

  const save = async () => {
    if (!employeeId || !start || !end || kolidujeRucne) return;
    setSaving(true);
    try {
      const ok = await onAdd({ employeeId: Number(employeeId), date, startTime: start, endTime: end, type: typeName || 'Vlastní' });
      // Výběr se smaže jen po uložení — neúspěch nesmí vypadat jako úspěch.
      if (ok) setEmployeeId('');
    } finally {
      setSaving(false);
    }
  };

  const nadpis = dayLabel(date, jazyk);
  // S Týmem na den se přidává z řádku člověka. Formulář s vlastním časem je
  // pak jen doplněk pod rozbalením a jeho tlačítko je u něj — lepivá patička
  // s „Přidat do návrhu" mířila na vzdálený select pod dlouhým seznamem
  // a vedle rozbaleného řádku byla druhým tmavým tlačítkem se stejným textem.
  const sTymem = !!dostupnost && !readOnly;
  const [vlastniCas, setVlastniCas] = useState(false);
  const tlacitkoPridat = (
    <Button variant="primary" icon="plus" loading={saving} disabled={!employeeId || employees.length === 0 || kolidujeRucne} onClick={save}>
      {varovani ? t('Přesto přidat') : navrh ? t('Přidat do návrhu') : t('Přidat směnu')}
    </Button>
  );
  return (
    <Modal open onClose={onClose} size="md" title={nadpis.charAt(0).toUpperCase() + nadpis.slice(1)}
      subtitle={dayOpen ? t('Otevřeno {od}–{do}', { od: dayOpen, do: dayClose }) : oh?.closed ? t('Zavřeno') : undefined}
      footer={readOnly || sTymem ? <Button variant="secondary" onClick={onClose}>{t('Zavřít')}</Button> : <>
        <Button variant="secondary" onClick={onClose}>{t('Zavřít')}</Button>
        {tlacitkoPridat}
      </>}>
      <div className="space-y-5">
        {filtrAktivni && (
          // Okno dne je místo, kde se den opravuje: potřebuje vidět všechny
          // (kdo už stojí, kdo může) — filtr by tu schoval právě ty, kým se díra zaplní.
          <p className="t-meta flex items-center gap-1.5" data-okno-bez-filtru>
            <Icon name="info" size={14} className="shrink-0 text-black/45" />
            {t('Okno ukazuje celý den — filtr platí jen pro mřížku.')}
          </p>
        )}
        {!readOnly && (dayGaps.length > 0 || missingHere.length > 0) && (
          // Povinná (nikdo neotevře) výrazně, žádoucí (chybí druhý) mírně.
          <div className={`note ${nikdoNeotevre ? 'note-danger' : 'note-wait'}`} data-dira={nikdoNeotevre ? 'povinna' : 'zadouci'}>
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <Icon name="warning" size={16} className="shrink-0" />
              {nikdoNeotevre ? t('Nikdo neotevře — podnik se ten den neotevře')
                : lidiDne === 1 ? t('Druhá směna neobsazená — otevře se s jedním člověkem') : t('Směna neobsazená — otevře se i bez ní')}
            </p>
            <ul className="text-xs mt-1 space-y-0.5 list-disc pl-4">
              {dayGaps.map((g, i) => <li key={`g-${i}`}>{t('Od {od} do {do} není v podniku nikdo, přitom je otevřeno.', { od: toHM(g.start), do: toHM(g.end) })}</li>)}
              {missingHere.map((n) => <li key={`m-${n}`}>{t('Směna „{nazev}" nemá nikoho.', { nazev: n })}</li>)}
            </ul>
          </div>
        )}

        {doporuceni && (
          // Tržba je PRŮMĚR stejného dne v týdnu za posledních 8 týdnů, ne
          // předpověď — text to musí říct, jinak se čte jako odhad na ten den.
          <p className="t-meta flex items-start gap-1.5 text-pretty" data-doporuceni>
            <Icon name="users" size={15} className="shrink-0 mt-0.5 text-black/40" />
            <span>
              {doporuceni.nepokryjeJeden
                ? <>{t('Podle tržby by stačil 1 člověk (průměrná tržba v tento den v týdnu ~{trzba}), ale otevírací směna nepokryje celou otevírací dobu — proto dva.', { trzba: money(doporuceni.trzba) })}</>
                : <>{t('Doporučení: {n, plural, one {# člověk} few {# lidé} other {# lidí}} · průměrná tržba v tento den v týdnu ~{trzba}', { n: doporuceni.lidi, trzba: money(doporuceni.trzba) })}
                  {doporuceni.usporaHodin > 0 ? ` · ${t('ušetří {hodiny}', { hodiny: hodinuTxt(t, Math.round(doporuceni.usporaHodin)) })}` : ''}</>}
            </span>
          </p>
        )}

        {events.length > 0 && (
          <div>
            <p className="t-label mb-1">{t('Akce')}</p>
            <ul className="list">
              {events.map((ev: any) => (
                <ListRow key={ev.id}
                  lead={<span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/[0.035] text-black/55"><Icon name="calendarCheck" size={16} /></span>}
                  title={ev.title}
                  meta={`${ev.startTime ? `${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ''}` : t('celý den')}${ev.location ? ` · ${ev.location}` : ''}${ev.crewPeople?.length ? ` · ${t('na akci: {jmena}', { jmena: ev.crewPeople.map((p: any) => p.name).join(', ') })}` : ` · ${t('zatím bez obsazení')}`}`}
                />
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="t-label mb-1">{t('Přiřazené směny')}</p>
          {shifts.length > 0 && nahradiUlozene && (
            <p className="t-meta mb-1 text-pretty">{t('Uložením návrhu se tyhle směny smažou — je zapnuté vymazání stávajících směn měsíce.')}</p>
          )}
          {shifts.length === 0 ? (
            <p className="t-meta">{t('Na tento den zatím nikdo nemá směnu.')}</p>
          ) : (
            // Směny, které uložení návrhu smaže: tlumí se jen jméno a typ
            // (token + přeškrtnutí) a stav řekne i Chip „zmizí". Dřív opacity
            // na celém seznamu ztlumila i aktivní tlačítko koše.
            <ul className="list">
              {shifts.map((s) => {
                const rt = resolveShiftType(s, shiftTypes, t);
                return (
                  <ListRow key={s.id}
                    lead={<Avatar emoji={s.employeeAvatar} size="sm" />}
                    title={nahradiUlozene ? <span className="line-through text-black/45">{s.employeeName}</span> : s.employeeName}
                    meta={<span className={`inline-flex items-center gap-1.5 ${nahradiUlozene ? 'line-through text-black/45' : ''}`}><TeckaBarvy barva={rt.color} className="h-2 w-2" />{rt.label}</span>}
                    value={`${s.startTime}–${s.endTime}`}
                    right={nahradiUlozene ? <Chip tone="muted" size="sm">{t('zmizí')}</Chip> : undefined}
                    actions={readOnly ? undefined : (
                      <Button variant="ghost" size="sm" iconOnly icon="trash" aria-label={t('Odebrat směnu — {jmeno}', { jmeno: s.employeeName })} onClick={() => onRemove(s.id)} />
                    )}
                  />
                );
              })}
            </ul>
          )}
        </div>

        {/* Návrh generátoru pro tento den — kontrola, kterou ikonky v mřížce nedají. */}
        {proposed.length > 0 && (
          <div>
            <p className="t-label">{t('Navržené směny')}</p>
            <p className="t-meta mb-1 text-pretty">{t('Náhled, zatím neuloženo — uloží se přesně takhle tlačítkem „Potvrdit a uložit" nebo „Uložit a publikovat".')}</p>
            <ul className="list">
              {proposed.map((p, idx) => (
                <ListRow key={`prop-${idx}`}
                  lead={<Avatar emoji={p.employeeAvatar} size="sm" />}
                  title={p.employeeName}
                  meta={<span className="inline-flex items-center gap-1.5">{p.color && <TeckaBarvy barva={p.color} className="h-2 w-2" />}{p.shiftTypeName || t('Směna')}</span>}
                  value={`${p.startTime}–${p.endTime}`}
                  right={<Chip tone="muted" size="sm" icon="sparkle">{t('Návrh')}</Chip>}
                  actions={onRemoveProposed ? (
                    <Button variant="ghost" size="sm" iconOnly icon="close" aria-label={t('Odebrat z návrhu — {jmeno}', { jmeno: p.employeeName })} onClick={() => onRemoveProposed(p)} />
                  ) : undefined}
                />
              ))}
            </ul>
          </div>
        )}

        {dostupnost && (
          <TymNaDen date={date} employees={employees} obsazene={obsazene} dostupnost={dostupnost}
            shiftTypes={shiftTypes} oh={oh} resolveTimes={resolveTimes} missingHere={missingHere}
            navrh={navrh} readOnly={readOnly} onAdd={onAdd} />
        )}

        {!readOnly && sTymem && !vlastniCas && employees.length > 0 && (
          <div className="border-t border-black/[0.08] pt-3">
            <Button variant="ghost" icon="clock" aria-expanded={false} onClick={() => setVlastniCas(true)}>{t('Přidat s vlastním časem…')}</Button>
          </div>
        )}
        {!readOnly && (!sTymem || vlastniCas || employees.length === 0) && (
          <div className="space-y-4 border-t border-black/[0.08] pt-4">
            <h3 className="t-card flex items-center gap-2"><Icon name="plus" size={17} className="text-black/40 shrink-0" /> {navrh ? t('Přidat do návrhu') : t('Přidat směnu')}</h3>
            {employees.length === 0 ? (
              <EmptyState icon="users" compact title={t('Zatím nikdo v týmu')}
                hint={t('Směnu je komu přiřadit, až budou v týmu lidé.')}
                action={onNavigate ? <Button variant="secondary" icon="users" onClick={() => onNavigate('team-settings')}>{t('Pozvat do týmu')}</Button> : undefined} />
            ) : (
              <>
                <Field id="den-kdo" label={t('Kdo')}>
                  <Select id="den-kdo" value={employeeId} onChange={(e) => setEmployeeId(e.target.value === '' ? '' : parseInt(e.target.value))}>
                    <option value="">{t('Vyber člověka…')}</option>
                    {employees.map((e) => {
                      const sub = submissions.find((s) => s.employeeId === e.id);
                      const pozn = unavailable.has(e.id) ? ` — ${t('nemůže')}`
                        : sub?.preferredShift && sub.preferredShift !== 'flexible' ? ` — ${sub.preferredShift === 'morning' ? t('preferuje ranní') : t('preferuje odpolední')}` : '';
                      return <option key={e.id} value={e.id}>{e.name}{pozn}</option>;
                    })}
                  </Select>
                </Field>
                {kolidujeRucne
                  ? <p className="note note-danger text-sm" role="alert">{t('Tenhle člověk už ten den má směnu, která se s tímhle časem překrývá.')}</p>
                  : varovani && <p className="note note-wait text-sm" role="status">{varovani}</p>}

                {shiftTypes.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[13px] font-medium text-black/70" aria-hidden>{t('Typ směny')}</p>
                    <Segmented ariaLabel={t('Typ směny')} value={typeName || VLASTNI_CAS}
                      onChange={(v) => {
                        if (v === VLASTNI_CAS) { pickCustom(); return; }
                        const t = shiftTypes.find(x => x.name === v);
                        if (t) applyShiftType(t);
                      }}
                      options={[...shiftTypes.map(ty => ({ id: ty.name, label: ty.name })), { id: VLASTNI_CAS, label: t('Vlastní čas') }]} />
                    {typeName !== '' && shiftTypes.find(t => t.name === typeName)?.endsAtClose && !dayClose && (
                      <p className="text-xs text-wait-ink">{t('Tento den je zavřeno — použije se výchozí konec typu.')}</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field id="den-od" label={t('Od')}>
                    <Input id="den-od" type="time" value={start} onChange={(e) => { setStart(e.target.value); pickCustom(); }} />
                  </Field>
                  <Field id="den-do" label={t('Do')}>
                    <Input id="den-do" type="time" value={end} onChange={(e) => { setEnd(e.target.value); pickCustom(); }} />
                  </Field>
                </div>
                {sTymem && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button variant="ghost" aria-expanded onClick={() => setVlastniCas(false)}>{t('Sbalit')}</Button>
                    {tlacitkoPridat}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Tým na den — kdo z lidí ten den může, s poznámkou, a přidání jedním klepnutím
// ---------------------------------------------------------------------------
//
// Vedení po vygenerování doplňovalo lidi se dvěma zařízeními v ruce: na
// jednom rozvrh, na druhém dostupnost. Tady je celý tým se stavem právě na
// tenhle den (lib/rozvrhDen.ts) a s poznámkou pro vedení. „Přidat" rozbalí
// výběr typu přímo pod řádkem; u „nemůže" a volna chce tlačítko potvrzení
// („Přesto přidat"), protože jde proti tomu, co člověk sám napsal.

function TymNaDen({
  date, employees, obsazene, dostupnost, shiftTypes, oh, resolveTimes, missingHere, navrh, readOnly, onAdd,
}: {
  date: string;
  employees: Member[];
  obsazene: { employeeId: number; startTime: string; endTime: string }[];
  dostupnost: { submissions: Submission[]; volno: { employeeId: number; fromDate: string; toDate: string; type?: string | null }[] };
  shiftTypes: ShiftType[];
  oh: OpeningDay | undefined;
  resolveTimes: (t: ShiftType) => { start: string; end: string };
  missingHere: string[];
  navrh: boolean;
  readOnly: boolean;
  onAdd: (p: { employeeId: number; date: string; startTime: string; endTime: string; type: string }) => Promise<boolean>;
}) {
  const t = useT('rozvrh');
  const typyPref = useMemo(() => shiftTypes.map((t) => ({ id: t.id, name: t.name, start: t.startTime })), [shiftTypes]);
  // Nabízejí se typy, které se do otevírací doby dne vejdou; zavřený den
  // (nebo den, kam se nevejde nic) nabídne všechny — vedení ví, proč tam
  // někoho chce.
  const typyDne = useMemo<TypDne[]>(() => {
    const vejdou = oh && !oh.closed ? shiftTypes.filter((t) => typeFitsDay(t as any, oh as any)) : [];
    return (vejdou.length ? vejdou : shiftTypes).map((t) => {
      const rt = resolveTimes(t);
      return { id: t.id, name: t.name, start: t.startTime, od: rt.start, do: rt.end };
    });
    // resolveTimes závisí jen na `oh`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shiftTypes, oh]);

  // Člověk jednou, i když ho seznam týmu vrátí dvakrát (členství + zrcadlo
  // users.team_id po přepnutí podniku) — jinak by šel přidat „dvakrát".
  const lide = useMemo(() => employees.filter((e, i) => employees.findIndex((x) => x.id === e.id) === i), [employees]);
  // Pořadí (může → omezení → má směnu → …) se určí při otevření dne a pak
  // drží: po „Přidat" by člověk jinak odskočil do skupiny „má směnu" jinam
  // v seznamu a řádek pod prstem (i fokus) by se ztratil.
  const poradiRef = useRef<{ date: string; ids: number[] } | null>(null);
  const radky = useMemo(() => {
    const serazene = seradRadky(lide.map((e) => {
      const smeny = obsazene.filter((x) => x.employeeId === e.id);
      const stav = stavClenaDne(date, dostupnost.submissions.find((x) => x.employeeId === e.id) ?? null,
        dostupnost.volno.filter((v) => v.employeeId === e.id), typyPref);
      return { id: e.id, jmeno: e.name, clen: e, stav: stav.stav, info: stav, smeny, maSmenu: smeny.length > 0 };
    }));
    const drzene = poradiRef.current;
    if (!drzene || drzene.date !== date) {
      poradiRef.current = { date, ids: serazene.map((x) => x.id) };
      return serazene;
    }
    const kde = new Map(drzene.ids.map((id, i) => [id, i]));
    return [...serazene].sort((a, b) => (kde.get(a.id) ?? 1e9) - (kde.get(b.id) ?? 1e9));
  }, [lide, obsazene, dostupnost, date, typyPref]);

  const [otevreny, setOtevreny] = useState<number | null>(null);
  const [typ, setTyp] = useState<string>('');
  const [pridavam, setPridavam] = useState(false);
  const [chyba, setChyba] = useState('');
  // Potvrzení přidání pro oči i odečítač (přidání do návrhu je jinak tiché).
  const [hlaska, setHlaska] = useState('');
  const sekceRef = useRef<HTMLElement>(null);
  const hlaskaRef = useRef<HTMLParagraphElement>(null);
  const wellRef = useRef<HTMLDivElement>(null);
  /** Fokus zpátky na „Přidat — jméno"; když tlačítko zmizelo (žádný volný typ), na hlášku. */
  const fokusNaRadek = (id: number) => setTimeout(() => {
    const tl = sekceRef.current?.querySelector<HTMLElement>(`[data-pridat="${id}"]`);
    (tl ?? hlaskaRef.current)?.focus({ preventScroll: false });
  }, 0);

  // Escape v rozbaleném výběru typu sbalí jen ten výběr, ne celé okno dne
  // (useModal chytá Escape na documentu ve fázi capture — window capture je
  // před ním, proto se tady zastaví dřív, než k oknu dojde).
  useEffect(() => {
    if (otevreny == null) return;
    const naKlavesu = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !wellRef.current?.contains(document.activeElement)) return;
      e.preventDefault();
      e.stopPropagation();
      const id = otevreny;
      setOtevreny(null);
      fokusNaRadek(id);
    };
    window.addEventListener('keydown', naKlavesu, true);
    return () => window.removeEventListener('keydown', naKlavesu, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otevreny]);

  const rozbal = (id: number, info: StavClenaDne, smeny: { startTime: string; endTime: string }[]) => {
    if (otevreny === id) { setOtevreny(null); return; }
    const t = vychoziTyp(typyDne, info.volba, missingHere, smeny);
    setTyp(t?.name ?? '');
    setChyba('');
    setOtevreny(id);
  };

  const pridej = async (e: Member, typ: TypDne) => {
    setPridavam(true); setChyba('');
    try {
      const ok = await onAdd({ employeeId: e.id, date, startTime: typ.od, endTime: typ.do, type: typ.name });
      if (ok) {
        setOtevreny(null);
        setHlaska(navrh ? t('{jmeno} — přidáno do návrhu · {typ} {od}–{do}', { jmeno: e.name, typ: typ.name, od: typ.od, do: typ.do }) : t('{jmeno} — směna přidána · {typ} {od}–{do}', { jmeno: e.name, typ: typ.name, od: typ.od, do: typ.do }));
        fokusNaRadek(e.id);
      } else setChyba(t('Nepřidalo se — zkus to znovu.'));
    } finally { setPridavam(false); }
  };

  const pocetMuze = radky.filter((r) => (r.stav === 'muze' || r.stav === 'omezeni') && !r.maSmenu).length;

  return (
    <section ref={sekceRef} aria-labelledby={`tym-den-${date}`}>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <p id={`tym-den-${date}`} className="t-label">{t('Tým na tento den')}</p>
        <p className="t-meta tabular-nums">{pocetMuze > 0 ? t('{n, plural, one {# člověk může} few {# lidé můžou} other {# lidí může}}', { n: pocetMuze }) : t('další nikdo nemůže')}</p>
      </div>
      <p ref={hlaskaRef} tabIndex={-1} role="status" className={`t-meta flex items-center gap-1.5 outline-none ${hlaska ? 'mb-1' : 'sr-only'}`} data-hlaska-tym>
        {hlaska && <><Icon name="check" size={14} className="shrink-0 text-ok-ink" />{hlaska}</>}
      </p>
      {radky.length === 0 ? (
        <p className="t-meta">{t('V týmu zatím nikdo není.')}</p>
      ) : (
        <ul className="list" data-tym-den>
          {radky.map((r) => {
            const { clen, info, smeny } = r;
            const volneTypy = typyDne.filter((t) => !kolize(smeny, { startTime: t.od, endTime: t.do }));
            const muzePridat = !readOnly && volneTypy.length > 0;
            const proti = info.stav === 'nemuze' || info.stav === 'volno';
            // První řádek: směna a preference; poznámky pod ním zvlášť a zkrácené
            // na dva řádky, ať odstavcová poznámka nenatáhne okno přes celý telefon.
            const meta = [
              r.maSmenu ? t('má směnu {casy}', { casy: smeny.map((x) => `${x.startTime}–${x.endTime}`).join(', ') }) : null,
              info.preferuje ? prelozPopisStavu(t, info.preferuje) : null,
            ].filter(Boolean).join(' · ');
            const poznamky = [
              info.poznamkaDne ? t('k tomuto dni: „{text}“', { text: info.poznamkaDne }) : null,
              info.poznamka ? t('„{text}“', { text: info.poznamka }) : null,
            ].filter(Boolean).join(' · ');
            const vybrany = volneTypy.find((t) => t.name === typ) ?? volneTypy[0];
            // Omezení na jiný typ, než se právě vybírá — stejné varování jako ve formuláři.
            const mimoVolbu = info.stav === 'omezeni' && vybrany
              && !prefAllowsSlot(info.volba, { typeId: vybrany.id, start: vybrany.od }, typyPref);
            return (
              <Fragment key={clen.id}>
                <ListRow
                  lead={<Avatar emoji={clen.avatar} name={clen.name} size="sm" />}
                  title={clen.name}
                  meta={meta || poznamky ? <>
                    {meta && <span className="block whitespace-normal text-pretty">{meta}</span>}
                    {poznamky && <PoznamkaClena text={poznamky} />}
                  </> : undefined}
                  right={<span data-stav={info.stav}><Chip tone={info.ton} size="sm">{prelozPopisStavu(t, info.popis)}</Chip></span>}
                  actions={muzePridat ? (
                    <Button variant="secondary" size="sm" icon="plus" aria-expanded={otevreny === clen.id} data-pridat={clen.id}
                      aria-label={t('Přidat — {jmeno}', { jmeno: clen.name })} onClick={() => rozbal(clen.id, info, smeny)}>{t('Přidat')}</Button>
                  ) : undefined}
                />
                {otevreny === clen.id && vybrany && (
                  <li className="py-3">
                    <div ref={wellRef}><Well className="space-y-3">
                      {volneTypy.length > 1 && (
                        <Segmented ariaLabel={t('Typ směny pro {jmeno}', { jmeno: clen.name })} size="sm" value={vybrany.name}
                          onChange={(v) => setTyp(v)} options={volneTypy.map((t) => ({ id: t.name, label: t.name }))} />
                      )}
                      <p className="t-meta tabular-nums">{vybrany.name} · {vybrany.od}–{vybrany.do}{navrh ? ` · ${t('do návrhu')}` : ''}</p>
                      {proti && (
                        <p className="note note-wait text-sm text-pretty" role="status">
                          {info.stav === 'volno'
                            ? (info.popis === 'dovolená'
                              ? t('{jmeno} má na tento den dovolenou.', { jmeno: clen.name })
                              : info.popis === 'nemoc'
                                ? t('{jmeno} má na tento den nemoc.', { jmeno: clen.name })
                                : info.popis === 'volno'
                                  ? t('{jmeno} má na tento den volno.', { jmeno: clen.name })
                                  : info.popis === 'schválené volno'
                                    ? t('{jmeno} má na tento den schválené volno.', { jmeno: clen.name })
                                    : t('{jmeno} má na tento den {popis}.', { jmeno: clen.name, popis: prelozPopisStavu(t, info.popis) }))
                            : t('{jmeno} podle své dostupnosti tento den nemůže.', { jmeno: clen.name })}
                          {' '}{t('Přidat jde, ale jen když je to domluvené.')}
                        </p>
                      )}
                      {!proti && mimoVolbu && (
                        <p className="note note-wait text-sm text-pretty" role="status">
                          {t('{jmeno} má na tento den v dostupnosti „{popis}“ — {typ} tomu neodpovídá.', { jmeno: clen.name, popis: prelozPopisStavu(t, info.popis), typ: vybrany.name })}
                        </p>
                      )}
                      {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setOtevreny(null)}>{t('Zrušit', undefined, 'dialog')}</Button>
                        <Button variant="primary" size="sm" icon="plus" loading={pridavam} onClick={() => pridej(clen, vybrany)}>
                          {proti || mimoVolbu ? t('Přesto přidat') : navrh ? t('Přidat do návrhu') : t('Přidat směnu')}
                        </Button>
                      </div>
                    </Well></div>
                  </li>
                )}
              </Fragment>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Poznámka člena v Týmu na den: dva řádky, delší se rozbalí na klepnutí. */
function PoznamkaClena({ text }: { text: string }) {
  const t = useT('rozvrh');
  const [cela, setCela] = useState(false);
  // Odhad podle délky: změřit přetečení by chtělo ResizeObserver na každý
  // řádek; dva řádky na telefonu pojmou zhruba 90 znaků.
  const dlouha = text.length > 90;
  return (
    <span className="block whitespace-normal text-pretty">
      <span className={cela ? 'block' : 'line-clamp-2'}>{text}</span>
      {dlouha && (
        <Button variant="ghost" size="sm" className="-ml-2" aria-expanded={cela} onClick={() => setCela((v) => !v)}>
          {cela ? t('Méně', undefined, 'text') : t('Celá poznámka')}
        </Button>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pravidla generování — max dní v řadě, hodiny, střídání, dělení směn
// ---------------------------------------------------------------------------

function ScheduleRulesManager() {
  const t = useT('rozvrh');
  const { jazyk } = useJazyk();
  const dnyTydne = nazvyDnuDlouze(jazyk);
  const [teamMax, setTeamMax] = useState<string>('');
  const [teamMaxHours, setTeamMaxHours] = useState<string>('');
  const [balance, setBalance] = useState(true);
  const [split, setSplit] = useState(false);
  const [members, setMembers] = useState<{ id: number; name: string; avatar: string | null; role: string; maxConsecutive: number | null; maxHours?: number | null; splitOk?: boolean }[]>([]);
  const [overrides, setOverrides] = useState<Record<number, string>>({});
  const [hourOverrides, setHourOverrides] = useState<Record<number, string>>({});
  const [splitOks, setSplitOks] = useState<Record<number, boolean>>({});
  // Počet lidí podle tržeb — výchozí vypnuto; práh a průměry jen s finance.trzby.
  const [podleTrzeb, setPodleTrzeb] = useState(false);
  const [prah, setPrah] = useState('');
  const [trzbyInfo, setTrzbyInfo] = useState<{ smiTrzby: boolean; prahNastaven?: boolean; dny?: Record<string, { prumer: number; vzorek: number }>; navrhPrahu?: number | null }>({ smiTrzby: false });
  // Chyba prahu až po pokusu o uložení nebo po opuštění pole — zapnutí
  // funkce bez dat nesmí vypadat jako chyba uživatele.
  const [prahDotcen, setPrahDotcen] = useState(false);
  // Co je uložené na serveru — z toho se pozná neuložená změna (limetka
  // u Uložit) a jestli se mají posílat tržby.
  const [ulozeno, setUlozeno] = useState('');
  const [ulozeneTrzby, setUlozeneTrzby] = useState('');
  const { money, symbol } = useCurrency();
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');
  const [tick, setTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true); setLoadErr('');
    fetch('/api/schedule/rules').then(okJson).then(d => {
      setTeamMax(d.teamMax != null ? String(d.teamMax) : '');
      setTeamMaxHours(d.teamMaxHours != null ? String(d.teamMaxHours) : '');
      setBalance(d.balanceShifts !== false);
      setSplit(d.splitShifts === true);
      const t = d.trzby && typeof d.trzby === 'object' ? d.trzby : {};
      setPodleTrzeb(t.podleTrzeb === true);
      setPrah(t.prah != null ? String(t.prah) : '');
      setPrahDotcen(false);
      setTrzbyInfo({ smiTrzby: t.smiTrzby === true, prahNastaven: t.prahNastaven === true, dny: t.dny ?? undefined, navrhPrahu: t.navrhPrahu ?? null });
      const list = Array.isArray(d.members) ? d.members : [];
      setMembers(list);
      const ov: Record<number, string> = {};
      const hov: Record<number, string> = {};
      const sok: Record<number, boolean> = {};
      list.forEach((m: any) => {
        ov[m.id] = m.maxConsecutive != null ? String(m.maxConsecutive) : '';
        hov[m.id] = m.maxHours != null ? String(m.maxHours) : '';
        sok[m.id] = m.splitOk !== false;
      });
      setOverrides(ov);
      setHourOverrides(hov);
      setSplitOks(sok);
      const tz = JSON.stringify({ podleTrzeb: t.podleTrzeb === true, prah: t.prah != null ? String(t.prah) : '' });
      setUlozeneTrzby(tz);
      setUlozeno(JSON.stringify({
        teamMax: d.teamMax != null ? String(d.teamMax) : '', teamMaxHours: d.teamMaxHours != null ? String(d.teamMaxHours) : '',
        balance: d.balanceShifts !== false, split: d.splitShifts === true, ov, hov, sok, tz,
      }));
    }).catch((e) => setLoadErr(apiMessage(e, t('Pravidla se nenačetla.')))).finally(() => setLoading(false));
  }, [tick]);

  const prahCislo = prah.trim() === '' ? null : Math.round(Number(prah));
  // Bez finance.trzby práh nevidí ani nemění (server ho nevydá), takže ho ani nekontroluje.
  const prahChyba = trzbyInfo.smiTrzby && podleTrzeb && (prahCislo == null || !Number.isFinite(prahCislo) || prahCislo <= 0);
  const trzbyTed = JSON.stringify({ podleTrzeb, prah: prah.trim() });
  const trzbyZmena = trzbyTed !== ulozeneTrzby;
  const stavPravidel = (tz: string) => JSON.stringify({ teamMax, teamMaxHours, balance, split, ov: overrides, hov: hourOverrides, sok: splitOks, tz });
  const stavTed = stavPravidel(trzbyTed);
  const neulozeno = ulozeno !== '' && stavTed !== ulozeno;
  /** Zapnutí předvyplní práh návrhem z dat, ať se nezačíná od prázdného pole. */
  const prepniTrzby = (on: boolean) => {
    setPodleTrzeb(on);
    if (on && prah === '' && trzbyInfo.navrhPrahu) setPrah(String(trzbyInfo.navrhPrahu));
  };

  const save = async () => {
    if (prahChyba) { setPrahDotcen(true); setErr(t('Zadej práh tržby, nad kterým mají být dva lidé — nebo počet lidí podle tržeb vypni.')); return; }
    setSaving(true); setMsg(''); setErr('');
    try {
      const res = await fetch('/api/schedule/rules', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamMax: teamMax === '' ? null : parseInt(teamMax),
          teamMaxHours: teamMaxHours === '' ? null : parseInt(teamMaxHours),
          balanceShifts: balance,
          splitShifts: split,
          // Tržby jen se změnou a jen s finance.trzby: jinak by uložení
          // jiného pravidla přepsalo práh (bez oprávnění ho klient ani nezná).
          ...(trzbyInfo.smiTrzby && trzbyZmena ? { trzby: { podleTrzeb, prah: prahCislo } } : {}),
          overrides: members.map(m => ({
            id: m.id,
            maxConsecutive: overrides[m.id] === '' ? null : parseInt(overrides[m.id]),
            maxHours: hourOverrides[m.id] === '' || hourOverrides[m.id] == null ? null : parseInt(hourOverrides[m.id]),
            splitOk: splitOks[m.id] !== false,
          })),
        }),
      });
      const d = await okJson(res);
      // Neuložené tržby zůstanou „neuložené" i v signálu u tlačítka.
      setUlozeno(d?.trzbyNeulozeny ? stavPravidel(ulozeneTrzby) : stavTed);
      if (d?.trzbyNeulozeny) {
        setErr(t('Počet lidí podle tržeb se neuložil — databáze ho ještě nezná (spusť /api/init). Ostatní pravidla jsou uložená.'));
      } else {
        setUlozeneTrzby(trzbyTed);
        setMsg(t('Uloženo. Pravidla se použijí při dalším generování rozvrhu.'));
      }
      // Widget „Naplánované hodiny" ukazuje strop z pravidel.
      obnovDataWidgetu('/api/schedule/rules');
    } catch (e) { setErr(apiMessage(e, t('Uložení se nepodařilo.'))); }
    setSaving(false);
  };

  const teamLimit = teamMax === '' ? null : parseInt(teamMax);

  if (loading) return <Skeleton className="h-64 max-w-2xl" />;
  if (loadErr) return <Card className="max-w-2xl"><ErrorState compact title={t('Pravidla se nenačetla')} onRetry={() => setTick(t => t + 1)} detail={loadErr} /></Card>;

  return (
    <div className="space-y-5 max-w-2xl">
      <Card as="section" aria-labelledby="pravidla-dny" className="space-y-3">
        <h2 id="pravidla-dny" className="t-section flex items-center gap-2"><Icon name="clock" size={17} className="text-black/40 shrink-0" /> {t('Maximálně dní v řadě')}</h2>
        <p className="t-meta text-pretty">
          {t('Kolik dní po sobě může někdo pracovat. Generátor po dosažení limitu naplánuje volno — a počítá i směny na přelomu měsíce.')}
        </p>
        <Field id="pravidla-tym-dny" label={t('Pro celý tým')}>
          <Select id="pravidla-tym-dny" value={teamMax} onChange={e => setTeamMax(e.target.value)} className="sm:!w-64">
            <option value="">{t('Bez omezení')}</option>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14].map(n => (
              <option key={n} value={n}>{t('max {n, plural, one {# den} few {# dny} other {# dní}} po sobě', { n })}</option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card as="section" aria-labelledby="pravidla-hodiny" className="space-y-3">
        <h2 id="pravidla-hodiny" className="t-section flex items-center gap-2"><Icon name="overview" size={17} className="text-black/40 shrink-0" /> {t('Maximálně hodin za měsíc')}</h2>
        <p className="t-meta text-pretty">
          {t('Strop hodin na osobu a měsíc — hodí se pro brigádníky (DPP) nebo úvazky. Generátor po dosažení limitu už směnu nepřidá.')}
        </p>
        <Field id="pravidla-tym-hodiny" label={t('Pro celý tým (hodin za měsíc)')} hint={t('Prázdné = bez omezení.')}>
          <Input id="pravidla-tym-hodiny" type="number" inputMode="numeric" min={8} max={400} value={teamMaxHours}
            onChange={e => setTeamMaxHours(e.target.value)} className="!w-full sm:!w-36" />
        </Field>
      </Card>

      <Card as="section" aria-labelledby="pravidla-generator">
        <h2 id="pravidla-generator" className="t-section flex items-center gap-2"><Icon name="users" size={17} className="text-black/40 shrink-0" /> {t('Generátor')}</h2>
        <ul className="list mt-1">
          <SwitchRow checked={balance} onChange={setBalance} title={t('Spravedlivé střídání')}
            hint={t('Přednost dostane ten, kdo má zatím méně směn, a střídá se, kdo s kým slouží. Nedostupnost a limity mají vždy přednost.')} />
          <SwitchRow checked={split} onChange={setSplit} title={t('Dělení směn mezi dva lidi')}
            hint={t('Když směnu nemůže vzít nikdo celou, generátor ji rozpůlí — začátek jednomu, konec druhému. V náhledu jsou půlky označené.')} />
          {/* Bez finance.trzby je přepínač vidět (ať je jasné, jestli je
              zapnutý), ale měnit ho nejde — práh prozrazuje tržby a bez
              oprávnění by generátor doporučení stejně vynechal. */}
          <SwitchRow checked={podleTrzeb} onChange={prepniTrzby} title={t('Počet lidí podle tržeb')} disabled={!trzbyInfo.smiTrzby}
            hint={trzbyInfo.smiTrzby
              ? t('Otevírací směnu generátor obsadí vždy. Pod prahem stačí jeden člověk na celý den (když ho otevírací směna pokryje), nad ním dva — podle průměrné tržby stejného dne za posledních 8 týdnů. Platí po uložení.')
              : t('Zapnout a nastavit může jen někdo s přístupem k tržbám.')} />
        </ul>
        {podleTrzeb && (
          <Well className="mt-3 space-y-3" data-trzby-nastaveni>
            {trzbyInfo.smiTrzby ? (
              <Field id="pravidla-prah" label={t('Dva lidé, když průměrná tržba dne přesáhne ({symbol})', { symbol })}
                error={prahChyba && prahDotcen ? t('Zadej kladné číslo.') : undefined}
                hint={trzbyInfo.navrhPrahu ? t('Návrh z vašich tržeb: {castka} — zhruba půlka dnů v týdnu je nad ním.', { castka: money(trzbyInfo.navrhPrahu) }) : t('Pod prahem stačí jeden člověk na celý den.')}>
                <Input id="pravidla-prah" type="number" inputMode="numeric" min={1} value={prah}
                  onChange={e => setPrah(e.target.value)} onBlur={() => setPrahDotcen(true)} className="!w-full sm:!w-44" />
              </Field>
            ) : (
              <p className="t-meta text-pretty">{trzbyInfo.prahNastaven ? t('Práh tržby je nastavený.') : t('Práh tržby zatím není nastavený.')} {t('Hodnotu vidí jen ten, kdo smí vidět tržby.')}</p>
            )}
            {!trzbyInfo.smiTrzby ? (
              <p className="t-meta text-pretty">{t('Doporučení spočítá generování u někoho, kdo tržby vidět smí — u tebe ho generátor vynechá a řekne to.')}</p>
            ) : trzbyInfo.dny && Object.keys(trzbyInfo.dny).length > 0 ? (
              <div>
                <p className="t-label mb-1">{t('Průměrná tržba podle dne v týdnu')}</p>
                <ul className="list">
                  {dnyTydne.map((nazev, i) => {
                    const d = trzbyInfo.dny?.[String(i)];
                    if (!d) return null;
                    const lidi = prahCislo && prahCislo > 0 ? (d.prumer > prahCislo ? 2 : 1) : null;
                    return (
                      <ListRow key={nazev} title={nazev} meta={t('z {dny}', { dny: dnuTxt(t, d.vzorek) })}
                        value={`~${money(d.prumer)}`}
                        right={lidi ? <Chip tone={lidi === 2 ? 'info' : 'muted'} size="sm">{t('{n, plural, one {# člověk} few {# lidé} other {# lidí}}', { n: lidi })}</Chip> : undefined} />
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="t-meta text-pretty">{t('Za posledních 8 týdnů nejsou uzávěrky s tržbou — dokud nebudou, generátor se řídí jen otevírací směnou.')}</p>
            )}
          </Well>
        )}
        {split && members.length > 0 && (
          <Well className="mt-3 space-y-1">
            <p className="t-label">{t('Komu se smí směna rozdělit')}</p>
            <ul className="list">
              {members.map(m => (
                <SwitchRow key={m.id} checked={splitOks[m.id] !== false}
                  onChange={on => setSplitOks(o => ({ ...o, [m.id]: on }))}
                  title={m.name} hint={splitOks[m.id] === false ? t('Jen celé směny') : undefined} />
              ))}
            </ul>
          </Well>
        )}
      </Card>

      <Card as="section" aria-labelledby="pravidla-vyjimky" className="space-y-3">
        <h2 id="pravidla-vyjimky" className="t-section">{t('Výjimky pro jednotlivce')}</h2>
        <p className="t-meta text-pretty">{t('Kdo to má jinak než tým — třeba brigádník, co chce co nejvíc směn v kuse, nebo někdo, komu tři dny stačí.')}</p>
        <ul className="list">
          {members.map(m => {
            const v = overrides[m.id] ?? '';
            const effective = v === '' ? (teamLimit != null ? t('podle týmu (max {n})', { n: teamLimit }) : t('bez omezení'))
              : v === '0' ? t('bez omezení') : t('max {n} po sobě', { n: v });
            const hv = hourOverrides[m.id] ?? '';
            const effHours = hv === '' ? (teamMaxHours !== '' ? t('podle týmu ({n} h)', { n: teamMaxHours }) : t('hodiny bez omezení'))
              : hv === '0' ? t('hodiny bez omezení') : t('max {n} h za měsíc', { n: hv });
            return (
              <li key={m.id} className="flex items-center gap-3 py-3 flex-wrap">
                <Avatar emoji={m.avatar} size="sm" />
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-[15px] font-medium text-[#16181A] truncate">{m.name}</p>
                  <p className="t-meta">{effective} · {effHours}</p>
                </div>
                <Field id={`vyjimka-dny-${m.id}`} label={t('Dní po sobě')} className="w-40">
                  <Select id={`vyjimka-dny-${m.id}`} value={v} onChange={e => setOverrides(o => ({ ...o, [m.id]: e.target.value }))}>
                    <option value="">{t('Podle týmu')}</option>
                    <option value="0">{t('Bez omezení')}</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14].map(n => <option key={n} value={n}>{t('max {n} po sobě', { n })}</option>)}
                  </Select>
                </Field>
                <Field id={`vyjimka-hodiny-${m.id}`} label={t('Hodin za měsíc')} className="w-32">
                  <Input id={`vyjimka-hodiny-${m.id}`} type="number" inputMode="numeric" min={0} max={400}
                    value={hourOverrides[m.id] ?? ''} title={t('Prázdné = podle týmu, 0 = bez omezení')}
                    onChange={e => setHourOverrides(o => ({ ...o, [m.id]: e.target.value }))} />
                </Field>
              </li>
            );
          })}
        </ul>
      </Card>

      {err && <p className="note note-danger text-sm" role="alert">{err}</p>}
      {msg && <p className="note note-ok text-sm" role="status">{msg}</p>}
      {/* Limetka jen při neuložené změně (DESIGN.md: „Uložit … při dirty stavu
          limetkou") — přepínače se tu projeví až po uložení, a bez signálu
          šlo odejít s vypnutou funkcí v domnění, že je zapnutá. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant={neulozeno ? 'accent' : 'secondary'} icon="check" loading={saving} onClick={save}>{t('Uložit pravidla')}</Button>
        {neulozeno && <span className="t-meta" data-neulozeno>{t('Neuložené změny')}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dostupnost jednoho člověka očima vedení — všechny požadavky na jedné
// obrazovce, upravitelné na místě. Klepnutí na den cyklí: volno → nemůže →
// jen <typ> → … → volno. Dotyčný dostane upozornění o každé změně.
// ---------------------------------------------------------------------------
function EditAvailabilityModal({ member, month, initial, shiftTypes = [], jenCist = false, volno = [], onClose, onSaved }: {
  member: { id: number; name: string; avatar: string };
  month: string;
  initial: Submission | null;
  shiftTypes?: ShiftType[];
  /** Bez dostupnost.upravit: stejné okno, jen bez přepínání dnů a bez uložení. */
  jenCist?: boolean;
  /** Schválená dovolená toho člověka — v náhledu se ukáže, aby vedení nehledalo jinde. */
  volno?: { fromDate: string; toDate: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Jeden stav na den: '' | 'off' | 'type:<id>' (staré 'morning'/'afternoon' zůstávají čitelné).
  const t = useT('rozvrh');
  const { jazyk } = useJazyk();
  const [days, setDays] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {};
    (initial?.unavailableDates ?? []).forEach((x) => { if (x.startsWith(month + '-')) d[x] = 'off'; });
    Object.entries(initial?.dayPreferences ?? {}).forEach(([k, v]) => {
      if (!k.startsWith(month + '-')) return;
      if (v === 'morning' || v === 'afternoon' || /^type:\d+$/.test(v)) d[k] = v;
      if (v === 'off') d[k] = 'off';
    });
    return d;
  });
  const [preferred, setPreferred] = useState<string>(initial?.preferredShift ?? 'flexible');
  const [maxShifts, setMaxShifts] = useState<string>(initial?.maxShifts != null ? String(initial.maxShifts) : '');
  const [note, setNote] = useState<string>(initial?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  // Cyklus kopíruje typy směn týmu; binární „ranní/odpolední" jen bez nich.
  const CYCLE = shiftTypes.length
    ? ['', 'off', ...shiftTypes.map((t) => `type:${t.id}`)]
    : ['', 'off', 'morning', 'afternoon'];
  const cycle = (date: string) =>
    setDays((d) => {
      const i = CYCLE.indexOf(d[date] ?? '');
      return { ...d, [date]: CYCLE[(i < 0 ? 1 : i + 1) % CYCLE.length] };
    });

  const zacatek = zacatekTydne(useCurrency().weekStart);
  const grid = buildGrid(month, zacatek);
  // Kategoriální paleta z globals.css — stejné odstíny jako v Dostupnosti.
  const TYPE_TONES = ['cat-4 border', 'cat-2 border', 'cat-3 border', 'cat-5 border'];
  const toneOf = (v: string) => {
    if (v === 'off') return 'bg-bad/15 border-bad/40 text-bad-ink';
    if (v === 'morning') return TYPE_TONES[0];
    if (v === 'afternoon') return TYPE_TONES[1];
    const idx = shiftTypes.findIndex((t) => `type:${t.id}` === v);
    return TYPE_TONES[(idx < 0 ? 0 : idx) % TYPE_TONES.length];
  };
  const labelOf = (v: string) => {
    if (v === 'off') return t('nemůže', {}, 'kratce');
    if (v === 'morning') return t('ranní', {}, 'kratce');
    if (v === 'afternoon') return t('odpo', {}, 'kratce');
    const ty = shiftTypes.find((x) => `type:${x.id}` === v);
    return (ty?.name ?? t('směna')).slice(0, 6).toLowerCase();
  };
  const cyklusSlovy = [t('volno'), t('nemůže'), ...(shiftTypes.length ? shiftTypes.map(ty => t('jen {nazev}', { nazev: ty.name })) : [t('jen ranní'), t('jen odpolední')])].join(', ');

  const save = async () => {
    setSaving(true); setErr('');
    const unavailableDates = Object.entries(days).filter(([, v]) => v === 'off').map(([k]) => k);
    const dayPreferences: Record<string, string> = {};
    Object.entries(days).forEach(([k, v]) => {
      if (v === 'morning' || v === 'afternoon' || /^type:\d+$/.test(v)) dayPreferences[k] = v;
    });
    try {
      const res = await fetch('/api/availability', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: member.id, month,
          unavailableDates, dayPreferences,
          preferredShift: preferred,
          maxShifts: maxShifts === '' ? null : parseInt(maxShifts),
          note: note.trim() || null,
        }),
      });
      await okJson(res);
      onSaved();
    } catch (e) { setErr(apiMessage(e, t('Uložení se nepodařilo.'))); }
    setSaving(false);
  };

  // Dovolená, která zasahuje do měsíce (API vrací celé dny „RRRR-MM-DD", někdy s časem).
  const volnoVMesici = volno
    .map((v) => ({ od: denZ(v.fromDate), do: denZ(v.toDate) }))
    .filter((v) => v.od && v.od.slice(0, 7) <= month && (v.do || v.od).slice(0, 7) >= month);
  const PREFERENCE: Record<string, string> = { flexible: t('Flexibilní'), morning: t('Ranní'), afternoon: t('Odpolední') };

  if (jenCist) {
    // Náhled pro vedení bez dostupnost.upravit: všechno, co člověk zadal, bez možnosti to měnit.
    const zadano = Object.entries(days).filter(([, v]) => v).sort((a, b) => a[0].localeCompare(b[0]));
    return (
      <Modal open onClose={onClose} size="md" title={t('Dostupnost — {jmeno}', { jmeno: member.name })} subtitle={<span className="cz-sentence">{monthLabel(month, jazyk)}</span>}
        footer={<Button variant="secondary" onClick={onClose}>{t('Zavřít')}</Button>}>
        <div className="space-y-4">
          {!initial ? (
            <p className="t-meta text-pretty">{t('Dostupnost na tento měsíc zatím není zadaná.')}</p>
          ) : (
            <>
              <div>
                <p className="t-label mb-1">{t('Dny')}</p>
                {zadano.length === 0 ? <p className="t-meta">{t('Žádný den není omezený — může kdykoli.')}</p> : (
                  <ul className="list">
                    {zadano.map(([d, v]) => (
                      <li key={d} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="cz-sentence tabular-nums">{fmtDatum(d, { jazyk, styl: 'denKratce' })}</span>
                        <Chip size="sm" tone={v === 'off' ? 'bad' : 'muted'}><span className="cz-sentence">{v === 'off' ? t('nemůže') : (prelozPopisStavu(t, dayPrefLabel(v, shiftTypes.map((ty) => ({ id: ty.id, name: ty.name, start: ty.startTime }))) ?? '') || labelOf(v))}</span></Chip>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="t-label">{t('Preferuje')}</dt><dd className="mt-0.5">{PREFERENCE[preferred] ?? preferred}</dd></div>
                <div><dt className="t-label">{t('Max směn')}</dt><dd className="mt-0.5 tabular-nums">{maxShifts || t('bez limitu')}</dd></div>
              </dl>
              <div>
                <p className="t-label mb-1">{t('Poznámka pro vedení')}</p>
                <p className="text-sm text-pretty whitespace-pre-line">{note.trim() || <span className="t-meta">{t('Bez poznámky.')}</span>}</p>
              </div>
            </>
          )}
          {volnoVMesici.length > 0 && (
            <div>
              <p className="t-label mb-1">{t('Schválené volno')}</p>
              <ul className="space-y-1 text-sm tabular-nums">
                {volnoVMesici.map((v, i) => <li key={i}>{rozsahVolnaJ(v.od, v.do, jazyk)}</li>)}
              </ul>
            </div>
          )}
          <p className="t-meta text-pretty">{t('Upravit dostupnost za jiné může jen role s oprávněním k úpravě dostupnosti.')}</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} size="md" title={t('Dostupnost — {jmeno}', { jmeno: member.name })} subtitle={<span className="cz-sentence">{monthLabel(month, jazyk)}</span>}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit', undefined, 'dialog')}</Button>
        <Button variant="primary" icon="send" loading={saving} onClick={save}>{t('Uložit a upozornit')}</Button>
      </>}>
      <div className="space-y-4">
        <p className="t-meta text-pretty">
          {t('Klepnutím na den přepínáš: {cyklus}. Denní volby jsou pro generátor závazné — typy se berou z nastavení Typy směn.', { cyklus: cyklusSlovy })}
        </p>
        {volnoVMesici.length > 0 && (
          <p className="note note-wait text-sm text-pretty">{t('Schválené volno: {rozsahy}', { rozsahy: volnoVMesici.map((v) => rozsahVolnaJ(v.od, v.do, jazyk)).join(', ') })}</p>
        )}

        <div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {zkratkyDnuJazyk(zacatek, jazyk).map((d) => (
              <span key={d} className="text-center text-[11px] font-medium text-black/35">{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {grid.map((cell, i) => {
              if (!cell) return <div key={i} />;
              const v = days[cell] ?? '';
              const cislo = parseInt(cell.split('-')[2]);
              return (
                <button key={cell} type="button" onClick={() => cycle(cell)}
                  aria-label={`${cislo}. — ${v ? labelOf(v) : t('volno')}`}
                  className={`aspect-square rounded-xl border text-center flex flex-col items-center justify-center gap-0.5 transition-colors ${
                    v ? toneOf(v) : 'bg-black/[0.03] border-black/[0.08] text-black/60 hover:bg-black/[0.06]'
                  }`}>
                  <span className="text-xs font-semibold leading-none">{cislo}</span>
                  {v && <span className="text-[11px] font-medium leading-none">{labelOf(v)}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field id="dostupnost-preferuje" label={t('Preferuje celkově')}>
            <Select id="dostupnost-preferuje" value={preferred} onChange={(e) => setPreferred(e.target.value)}>
              <option value="flexible">{t('Flexibilní')}</option>
              <option value="morning">{t('Ranní')}</option>
              <option value="afternoon">{t('Odpolední')}</option>
            </Select>
          </Field>
          <Field id="dostupnost-max" label={t('Max směn')} hint={t('Prázdné = bez limitu.')}>
            <Input id="dostupnost-max" type="number" inputMode="numeric" min={1} max={31} value={maxShifts}
              onChange={(e) => setMaxShifts(e.target.value)} />
          </Field>
        </div>

        <Field id="dostupnost-pozn" label={t('Poznámka')}>
          <Input id="dostupnost-pozn" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>

        {err && <p className="note note-danger text-sm" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}
