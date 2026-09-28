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
import { zkratkyDnu, odsazeniMesice, zacatekTydne, type ZacatekTydne } from '@/lib/week';
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
import { czCount, czForm, SMENA, DEN, HODINA, HODINU } from '@/lib/czech';
import { pragueToday } from '@/lib/pragueTime';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu } from '../widgety/useDataWidgetu';
import { nactiTeamsMine, useOpravneni } from '../role/useOpravneni';
import { nastavRozepsanyNavrh } from '../role/rozepsano';
import { prepocitejDen, stavClenaDne, seradRadky, kolize, vychoziTyp, type StavClenaDne, type TypDne } from '@/lib/rozvrhDen';
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

// `CZ_DAYS_FULL` se dál používá tam, kde index NENÍ sloupec mřížky, ale
// klíč otevírací doby (0 = pondělí). Ten se nesmí přeskládat podle toho,
// jak si podnik nastavil začátek týdne — posunulo by mu to otevírací dobu.
const CZ_DAYS_FULL = ['Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota', 'Neděle'];
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
const SHIFT_PRESETS: Record<string, { start: string; end: string; label: string }> = {
  morning: { start: '08:00', end: '14:00', label: 'Ranní' },
  afternoon: { start: '14:00', end: '22:00', label: 'Odpolední' },
};
const SHIFT_LABEL: Record<string, string> = { morning: 'Ranní', afternoon: 'Odpolední', flexible: 'Vlastní' };

// Resolve a shift's display name + colour from the team's configured shift
// types — matched by name first, then by exact times — so the calendar always
// shows the configured naming instead of the legacy morning/afternoon labels.
function resolveShiftType(
  s: { type?: string; startTime?: string; endTime?: string },
  types: ShiftType[],
): { label: string; color: string } {
  const byName = types.find((t) => t.name === s.type);
  if (byName) return { label: byName.name, color: byName.color || '#64748B' };
  const byTime = types.find((t) => t.startTime === s.startTime && t.endTime === s.endTime);
  if (byTime) return { label: byTime.name, color: byTime.color || '#64748B' };
  const legacy = s.type ? SHIFT_LABEL[s.type] : undefined;
  if (legacy) return { label: legacy, color: s.type === 'morning' ? '#C8F542' : s.type === 'afternoon' ? '#3B82F6' : '#64748B' };
  return { label: s.type || 'Směna', color: '#64748B' };
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

function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
}
/** „3 směny, které už v měsíci jsou" — kolik uložených směn přepsání měsíce smaže. */
function ulozeneVMesici(n: number) {
  return `${czCount(n, SMENA)}, ${n === 1 ? 'která už v měsíci je' : 'které už v měsíci jsou'}`;
}
/** „5. 10." — krátce do výčtu dnů. */
function kratkeDatum(date: string) {
  const [, m, d] = date.split('-').map(Number);
  return `${d}. ${m}.`;
}
function dayLabel(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });
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
const TABS: { id: Tab; label: string }[] = [
  { id: 'rozvrh', label: 'Rozvrh' },
  { id: 'kalendar', label: 'Kalendář' },
  { id: 'typy', label: 'Typy směn' },
  { id: 'oteviraci', label: 'Otevírací doba' },
  { id: 'pevne', label: 'Pevné dny' },
  { id: 'pravidla', label: 'Pravidla' },
];

/** Žádost widgetu, která čekala na připojení plánovače (přechod z jiné stránky). */
function vezmiZadost(klic: string): string | null {
  try {
    const v = sessionStorage.getItem(klic);
    if (v != null) sessionStorage.removeItem(klic);
    return v || null;
  } catch { return null; }
}

const TITULEK = 'Rozvrh';
const PODTITULEK = 'Sestav měsíční rozvrh podle dostupnosti týmu.';

export default function ScheduleBuilder({ onNavigate, user }: Props & { onNavigate?: (view: string, arg?: string) => void }) {
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
    return `${mon.getDate()}. ${mon.getMonth() + 1}. – ${end.getDate()}. ${end.getMonth() + 1}.`;
  };
  const weekOptions = (back: number, fwd: number) => {
    const base = mondayOf(new Date());
    const out: { value: string; label: string }[] = [];
    for (let i = -back; i <= fwd; i++) {
      const m = new Date(base); m.setDate(m.getDate() + i * 7);
      out.push({ value: iso(m), label: `${weekLabel(m)}${i === 0 ? ' (tento týden)' : ''}` });
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
          id: s.id, employeeId: s.employeeId, employeeName: s.employeeName ?? 'Kolega', employeeAvatar: s.employeeAvatar ?? '',
          date: denZ(s.date), startTime: hmZ(s.startTime), endTime: hmZ(s.endTime), type: s.type,
        })));
        setShiftTypes(stData.shiftTypes ?? []);
        setOpeningHours(ohData.openingHours ?? {});
        setMembers([]); setSubmissions([]); setGaps([]); setUnderstaffed([]); setDemand({}); setTimeOff([]); setEvents([]);
      }
    } catch (e) {
      // Dřív console.error a prázdná mřížka — výpadek vypadal jako prázdný měsíc.
      if (req === reqRef.current) setLoadError(apiMessage(e, 'Rozvrh se nenačetl.'));
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
    if (!m) { setBoardError('Ten člověk už v týmu není.'); return; }
    // Bez dostupnost.upravit se okno otevře jen ke čtení: kdo skládá rozvrh, musí vidět,
    // které dny člověk nemůže a co vedení napsal do poznámky — upravit to ale nesmí.
    if (!smiDostupnost) { setBoardError('Dostupnost týmu tvoje role nevidí.'); return; }
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
      if (selhalo > 0) setBoardError('Výchozí typy směn se nepodařilo založit celé. Doplň je v záložce Typy směn.');
      await reloadTypes().catch(() => setBoardError('Typy směn se nenačetly.'));
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
    return (d as any)?.error || vychozi;
  };

  const addShift = async (payload: { employeeId: number; date: string; startTime: string; endTime: string; type: string }) => {
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shifts: [payload] }),
    }).catch(() => null);
    if (res?.ok) { await poZmene(); return true; }
    setBoardError(await chybaZ(res, 'Směnu se nepodařilo přidat.'));
    return false;
  };

  const removeShift = async (id: number) => {
    const res = await fetch(`/api/schedule?id=${id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) { setShifts((prev) => prev.filter((s) => s.id !== id)); obnovWidgety(); }
    else setBoardError('Směnu se nepodařilo smazat.');
  };

  const clearMonth = async () => {
    setClearing(true);
    const res = await fetch(`/api/schedule?month=${month}`, { method: 'DELETE' }).catch(() => null);
    setClearing(false);
    setConfirmClear(false);
    if (res?.ok) { setShifts([]); obnovWidgety(); }
    else setBoardError('Vymazání měsíce se nepodařilo.');
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
        setBoardError('Návrh je prázdný — přidej do něj směny, nebo ho zahoď, a pak publikuj.');
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
          ? { text: 'V tomhle měsíci zatím nikdo nemá směnu — není komu dát vědět.', ok: false }
          : { text: `Hotovo — rozvrh dostal${n === 1 ? '' : 'o'} ${czCount(n, { one: 'člověk', few: 'lidé', many: 'lidí' })} jako upozornění. Každá další změna se jim ukáže v Mých směnách.`, ok: true });
      } else {
        setPublishNote({ text: d.error || 'Publikování se nepodařilo — zkus to znovu.', ok: false });
      }
    } catch {
      setPublishNote({ text: 'Publikování se nepodařilo — zkus to znovu.', ok: false });
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
      if (!res.ok) setBoardError(d.error || 'Kontrola se nepodařila.');
      else { setAdjust({ changes: d.changes ?? [], warnings: d.warnings ?? [] }); setAdjustSkipped(new Set()); }
    } catch { setBoardError('Kontrola se nepodařila.'); }
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
      if (!res.ok) setBoardError(d.error || 'Úpravy se nepodařilo uložit.');
      else { setAdjust(null); await poZmene(); }
    } catch { setBoardError('Úpravy se nepodařilo uložit.'); }
    setApplyingAdjust(false);
  };

  const copyWeek = async () => {
    if (!copySrc || !copyDst || copySrc === copyDst) { setCopyMsg({ text: 'Vyber dva různé týdny.', ok: false }); return; }
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
      if (toCreate.length === 0) { setCopyMsg({ text: 'Ve zdrojovém týdnu nejsou žádné směny.', ok: false }); setCopying(false); return; }
      const res = await fetch('/api/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shifts: toCreate }),
      });
      if (res.ok) {
        setCopyMsg({ text: `Hotovo — zkopírováno ${czCount(toCreate.length, SMENA)}.`, ok: true });
        await poZmene();
      } else {
        setCopyMsg({ text: await chybaZ(res, 'Kopírování se nepodařilo.'), ok: false });
      }
    } catch (e) { setCopyMsg({ text: apiMessage(e, 'Kopírování se nepodařilo.'), ok: false }); }
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
        setPreview({ proposed: [], warnings: [data.error ?? 'Generování selhalo.'], gaps: [], understaffed: [] });
      }
    } catch {
      setPreview({ proposed: [], warnings: ['Generování selhalo.'], gaps: [], understaffed: [] });
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
      setBoardError(await chybaZ(res, 'Uložení rozvrhu se nepodařilo — nic se nezměnilo, zkus to znovu.'));
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
      employeeName: clen?.name ?? 'Kolega',
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
  const typUlozene = (s: Shift) => resolveShiftType(s, shiftTypes).label;
  const typNavrhu = (p: Proposed) => p.shiftTypeName || resolveShiftType(p, shiftTypes).label;
  const smenyFiltru = useMemo<SmenaFiltru[]>(() => [
    ...(nahradiUlozene ? [] : shifts.map(s => ({
      employeeId: s.employeeId, jmeno: s.employeeName, avatar: s.employeeAvatar || null,
      date: s.date, startTime: s.startTime, endTime: s.endTime, typ: resolveShiftType(s, shiftTypes).label,
    }))),
    ...(preview?.proposed ?? []).map(p => ({
      employeeId: p.employeeId, jmeno: p.employeeName, avatar: p.employeeAvatar || null,
      date: p.date, startTime: p.startTime, endTime: p.endTime, typ: p.shiftTypeName || resolveShiftType(p, shiftTypes).label,
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
      return { id, jmeno: clen?.name || znamy?.jmeno || 'Bez jména', avatar: clen?.avatar ?? znamy?.avatar ?? null };
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
  const popisAktivniho = filtrAktivni ? `Filtr: ${popisFiltru(filtr, jmenaFiltru, kratkaFiltru)} — ${popisVysledku(viditelnych, !!preview)}` : '';
  // Hlášení pro odečítač: výsledek filtru, po vypnutí „Filtr vypnut".
  // Při načtení stránky mlčí (nic se nezměnilo, jen obnovil uložený stav).
  const bylFiltrRef = useRef(false);
  if (filtrAktivni) bylFiltrRef.current = true;
  const stavFiltru = filtrAktivni ? popisAktivniho : bylFiltrRef.current ? 'Filtr vypnut, celý měsíc.' : '';
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
  const hintCelyMesic = filtrAktivni ? ' Vždy celý měsíc — filtr se nepoužije.' : '';
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
    const jmeno = (id: number) => (members.find(m => Number(m.id) === id)?.name || znamiRef.current.get(id)?.jmeno || 'Kolega').split(/\s+/)[0];
    const text = mimo.length === 1
      ? `Přidáno — ${jmeno(mimo[0].employeeId)} je mimo filtr`
      : `Přidáno — ${czCount(mimo.length, SMENA)} mimo filtr`;
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
    if (!pro) { setUpgradeFor('Export CSV'); return; }
    // Středník, ne čárka: český Excel čte čárku jako desetinnou a soubor
    // oddělený čárkami naveze celý měsíc do jednoho sloupce. Import si poradí
    // s obojím (`splitLine` níž).
    const header = 'datum;zaměstnanec;od;do;typ';
    const lines = shifts
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .map((s) => {
        const name = /[";\n]/.test(s.employeeName) ? `"${s.employeeName.replace(/"/g, '""')}"` : s.employeeName;
        return `${s.date};${name};${s.startTime};${s.endTime};${s.type}`;
      });
    const csv = [header, ...lines].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rozvrh-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
          ${esc(dt.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' }))}
          <div class="note">${esc(dt.toLocaleDateString('cs-CZ', { weekday: 'long' }))}</div>
        </td>
        <td>${list.map(x => `<div>${esc(x.employeeName || 'Neobsazeno')} — ${esc(x.startTime)}–${esc(x.endTime)}`
          + `${x.type ? ` · ${esc(resolveShiftType(x, shiftTypes).label)}` : ''}</div>`).join('')}</td>
        <td class="num">${list.length}</td>
      </tr>`;
    }).join('');
    const ok = openPrint({
      title: `Rozvrh — ${monthLabel(month)}`,
      subtitle: `${czCount(shifts.length, SMENA)} · ${czCount(days.length, DEN)} se směnou`,
      body: `<table>
        <thead><tr><th style="width:26mm">Den</th><th>Kdo a kdy</th><th class="num">Lidí</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`,
    });
    setPrintFailed(!ok);
  };

  // ---- Import CSV ----
  const splitLine = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',' || ch === ';') out.push(cur), (cur = '');
      else cur += ch;
    }
    out.push(cur);
    return out.map((c) => c.trim());
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length === 0) {
      setImportPreview({ rows: [], errors: ['Soubor je prázdný.'] });
      return;
    }
    const startIdx = /datum/i.test(lines[0]) ? 1 : 0;
    const rows: any[] = [];
    const errors: string[] = [];
    for (let i = startIdx; i < lines.length; i++) {
      const cols = splitLine(lines[i]);
      const [date, who, start, end, type] = cols;
      if (!date || !who || !start || !end) {
        errors.push(`Řádek ${i + 1}: neúplný (${lines[i]})`);
        continue;
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        errors.push(`Řádek ${i + 1}: neplatné datum „${date}" (očekává RRRR-MM-DD)`);
        continue;
      }
      const key = who.toLowerCase();
      const emp = employees.find((e) => e.email.toLowerCase() === key || e.name.toLowerCase() === key);
      if (!emp) {
        errors.push(`Řádek ${i + 1}: zaměstnanec „${who}" není v týmu`);
        continue;
      }
      const normType =
        type && ['morning', 'afternoon', 'flexible'].includes(type.toLowerCase()) ? type.toLowerCase() : 'flexible';
      rows.push({ employeeId: emp.id, employeeName: emp.name, date, startTime: start, endTime: end, type: normType });
    }
    setImportPreview({ rows, errors });
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
        setBoardError(await chybaZ(res, 'Import se nepodařilo uložit.'));
      }
    } finally {
      setImporting(false);
    }
  };

  // ---- Hlavička, záložky, akce ----
  const zalozky = TABS.filter(t => t.id === 'rozvrh'
    || (t.id === 'kalendar' && smiKalendar)
    || ((t.id === 'typy' || t.id === 'pevne' || t.id === 'pravidla') && smiNastaveni)
    || (t.id === 'oteviraci' && (smiNastaveni || smiOteviraci)));
  const aktivniTab: Tab = zalozky.some(z => z.id === tab) ? tab : 'rozvrh';
  const naRozvrhu = aktivniTab === 'rozvrh';
  const aside = zalozky.length > 1
    ? <Segmented ariaLabel="Část rozvrhu" value={aktivniTab} onChange={(v) => setTab(v as Tab)} options={zalozky} />
    : undefined;

  const menu: MenuItem[] = [];
  // Import, kopírování týdne a úprava podle požadavků zapisují rovnou do
  // uložených směn. S otevřeným návrhem by je jeho uložení (výchozí
  // s přepsáním měsíce) vzápětí smazalo — stejná příčina jako u „Přidat
  // směnu" v okně dne. Proto do té doby nejdou.
  const hintNavrh = 'Nejdřív ulož nebo zahoď návrh — jinak by jeho uložení tuhle změnu přepsalo.';
  if (naRozvrhu && !loading && !loadError) {
    if (smiPublikovat) menu.push(preview
      ? { label: 'Uložit návrh a publikovat', icon: 'send', onClick: () => { void publish(); }, disabled: committing || publishing, hint: `Návrh se uloží i s tvými úpravami a lidé dostanou upozornění.${hintCelyMesic}` }
      : { label: 'Publikovat rozvrh', icon: 'send', onClick: () => { void publish(); }, disabled: publishing, hint: `Lidé dostanou upozornění, že je rozvrh hotový.${hintCelyMesic}` });
    if (smiUpravit) {
      menu.push({ label: 'Upravit podle nových požadavků', icon: 'swap', onClick: runAdjust, disabled: !!preview || adjusting || shifts.length === 0,
        hint: preview ? hintNavrh : 'Zkontroluje uložený rozvrh proti nejnovější dostupnosti.' });
      menu.push({ label: 'Kopírovat týden…', icon: 'copy', disabled: !!preview, hint: preview ? hintNavrh : undefined,
        onClick: () => { setCopyOpen(true); setCopyMsg(null); setCopySrc(''); setCopyDst(''); } });
      menu.push({ label: 'Import CSV…', icon: 'upload', disabled: !!preview, hint: preview ? hintNavrh : undefined, onClick: () => fileRef.current?.click() });
    }
    if (smiExport) {
      // Export a tisk berou vždy uložené směny celého měsíce (`shifts`), ne
      // to, co zrovna ukazuje filtr — soubor pro účetní ani papír na zeď
      // nesmí potichu vynechat lidi, které si plánovač zrovna skryl.
      menu.push({ label: 'Export CSV', icon: 'download', onClick: exportCsv, disabled: shifts.length === 0, hint: hintCelyMesic.trim() || undefined });
      menu.push({ label: 'Vytisknout rozvrh', icon: 'print', onClick: printSchedule, disabled: shifts.length === 0,
        hint: `Na papír k baru — černobíle, s typem směny slovem.${hintCelyMesic}` });
    }
    if (smiMazat) menu.push({ label: 'Vymazat měsíc…', icon: 'trash', onClick: () => setConfirmClear(true), danger: true,
      hint: 'Smaže všechny směny tohoto měsíce. Potvrdíš to ještě jednou.' });
  }
  const hlavicka = {
    title: TITULEK,
    subtitle: PODTITULEK,
    hintId: 'schedulebuilder',
    aside,
    // S otevřeným návrhem je hlavní akcí jeho uložení, ne nové generování:
    // limetka přejde na „Uložit a publikovat" a „Vygenerovat znovu" je jen
    // sekundární (a u upraveného návrhu se nejdřív zeptá). Dřív svítila
    // limetkou pořád „Vygenerovat" a vedla prst přímo k zahození úprav.
    primary: !naRozvrhu || loadError ? undefined
      : preview
        ? (smiPublikovat
          ? <Button variant="accent" icon="send" onClick={() => { void publish(); }} loading={publishing} disabled={committing}>Uložit a publikovat</Button>
          : undefined)
        : smiGenerovat
          ? <Button variant="accent" icon="bulb" onClick={() => zadejGenerovani(clearBeforeCommit)} loading={generating}>Vygenerovat rozvrh</Button>
          : undefined,
    secondary: !naRozvrhu || loadError ? undefined
      : preview
        ? (smiGenerovat
          ? <Button variant="secondary" icon="bulb" onClick={() => zadejGenerovani(clearBeforeCommit)} loading={generating} disabled={committing || publishing}>Vygenerovat znovu</Button>
          : undefined)
        : smiPublikovat
          ? <Button variant="secondary" icon="send" onClick={() => { void publish(); }} loading={publishing}>Publikovat</Button>
          : undefined,
    menu: menu.length ? menu : undefined,
  };

  // ---- Nástroj: měsíční plánovač ----
  const rychleMesice = [
    { id: currentMonth, label: 'Tento měsíc' },
    { id: nextMonth, label: 'Příští měsíc' },
  ];
  const nastroj = (
    <Card as="section" aria-labelledby="planovac-nadpis" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="planovac-nadpis" className="t-card cz-sentence">{monthLabel(month)}</h2>
        {/* Šipky pro libovolný měsíc, pilulky pro dva obvyklé (tento slouží i jako „zpět na dnešek"). */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <MonthNav value={month} onChange={(m) => { zmenMesic(m); }} />
          <div className="flex gap-1.5" role="group" aria-label="Rychlý výběr měsíce">
            {rychleMesice.map(m => (
              <button key={m.id} type="button" aria-pressed={month === m.id} onClick={() => zmenMesic(m.id)}
                className={`filter-pill tap-target-sm ${month === m.id ? 'seg-on' : 'seg-off glass'}`}>{m.label}</button>
            ))}
          </div>
        </div>
      </div>

      {!planovac && pripraveno && (
        <p className="note note-info text-sm">Vidíš náhled rozvrhu týmu — jména a časy. Plánovat může vedení s přístupem k rozvrhu.</p>
      )}
      {printFailed && (
        <p className="note note-wait text-sm flex items-center justify-between gap-3">
          <span className="cz-sentence">Tiskové okno prohlížeč zablokoval. Povol vyskakovací okna pro tuhle stránku a zkus to znovu.</span>
          <Button variant="ghost" size="sm" iconOnly icon="close" aria-label="Zavřít" className="shrink-0 -my-1.5" onClick={() => setPrintFailed(false)} />
        </p>
      )}
      {boardError && (
        <p className="note note-danger text-sm font-medium flex items-center justify-between gap-3" role="alert">
          <span className="flex items-center gap-2"><Icon name="warning" size={16} className="shrink-0" /> {boardError}</span>
          <Button variant="ghost" size="sm" iconOnly icon="close" aria-label="Zavřít" className="shrink-0 -my-1.5" onClick={() => setBoardError('')} />
        </p>
      )}
      {publishNote && (
        <p className={`note ${publishNote.ok ? 'note-ok' : 'note-wait'} text-sm flex items-center justify-between gap-3`} role="status">
          <span>{publishNote.text}</span>
          <Button variant="ghost" size="sm" iconOnly icon="close" aria-label="Zavřít" className="shrink-0 -my-1.5" onClick={() => setPublishNote(null)} />
        </p>
      )}

      {/* Náhled „Upravit podle nových požadavků" */}
      {adjust && (
        <Well className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="t-card flex items-center gap-2"><Icon name="sparkle" size={17} className="shrink-0 text-black/40" /> Úprava podle nových požadavků</h3>
              <p className="t-meta mt-0.5">
                {adjust.changes.length === 0
                  ? 'Všechno sedí — žádná směna není v rozporu s dostupností.'
                  : `${czCount(adjust.changes.length, { one: 'navržená změna', few: 'navržené změny', many: 'navržených změn' })}. Odškrtni, co měnit nechceš.`}
              </p>
            </div>
            <Button variant="ghost" size="sm" iconOnly icon="close" aria-label="Zavřít úpravu" className="shrink-0" onClick={() => setAdjust(null)} />
          </div>
          {adjust.changes.length > 0 && (
            <>
              <ul className="list max-h-72 overflow-y-auto scrollbar-thin">
                {adjust.changes.map((ch: any, i: number) => {
                  const vynechat = adjustSkipped.has(i);
                  const datum = `${parseInt(ch.date.split('-')[2])}. ${parseInt(ch.date.split('-')[1])}.`;
                  return (
                    <li key={i} className={`flex items-center gap-3 py-2.5 ${vynechat ? 'opacity-45' : ''}`}>
                      <SelectBox checked={!vynechat} label={`Použít změnu ${datum} ${ch.startTime}–${ch.endTime}`}
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
                            <Chip tone="bad" size="sm">zrušit — nikdo nemůže</Chip>
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
                  Použít vybrané ({adjust.changes.length - adjustSkipped.size})
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setAdjust(null)}>Zahodit</Button>
              </div>
              <p className="t-meta text-pretty">
                Důvody vycházejí z uložené dostupnosti — když nesedí, oprav ji ve widgetu Dostupnost týmu. Dotčení lidé dostanou upozornění.
              </p>
            </>
          )}
        </Well>
      )}

      {/* Náhled vygenerovaného návrhu */}
      {preview && (
        <Well className="space-y-3">
          <div className="min-w-0">
            <h3 className="t-card flex items-center gap-2"><Icon name="sparkle" size={17} className="shrink-0 text-black/40" /> Navržený rozvrh</h3>
            <p className="t-meta mt-0.5 text-pretty">
              {/* Jedna věta s jednou tečkou na konci — dřív „… upozornění. · 80 hodin." */}
              {[
                czCount(preview.proposed.length, { one: 'navržená směna', few: 'navržené směny', many: 'navržených směn' }),
                preview.warnings.length > 0 ? czCount(preview.warnings.length, { one: 'upozornění', few: 'upozornění', many: 'upozornění' }) : null,
                preview.hodiny ? czCount(Math.round(preview.hodiny.celkem), HODINA) : null,
              ].filter(Boolean).join(' · ')}.
              {' '}Návrh je v mřížce přerušovaně.
              {preview.upraveno ? ' Obsahuje tvoje ruční úpravy.' : ''}
              {' '}Klepnutím na den návrh upravíš — uloží se přesně to, co tu vidíš.
            </p>
          </div>
          {povinneDny.length > 0 && (
            // Povinná díra = podnik se neotevře. Musí být vidět hned, ne až
            // jako řádek v seznamu upozornění.
            <div className="note note-danger" data-povinne-diry>
              <p className="text-sm font-semibold flex items-center gap-1.5"><Icon name="warning" size={16} className="shrink-0" /> Nikdo neotevře — {czCount(povinneDny.length, DEN)} bez otevírací směny</p>
              <p className="text-xs mt-0.5 text-pretty">Bez člověka na otevření se podnik ten den neotevře: {povinneDny.slice(0, 8).map((d) => kratkeDatum(d)).join(', ')}{povinneDny.length > 8 ? ' …' : ''}. Klepni na den a doplň někoho.</p>
            </div>
          )}
          {problemDates.length > povinneDny.length && (
            <p className="t-meta text-pretty" data-zadouci-diry>
              <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-wait mr-1.5 align-middle" />
              {czCount(problemDates.length - povinneDny.length, DEN)} bez druhého člověka — otevře se, jen s menší obsluhou.
            </p>
          )}
          {preview.trzby && <SouhrnTrzeb trzby={preview.trzby} doporuceni={preview.doporuceni ?? []} hodiny={preview.hodiny} />}
          {preview.warnings.length > 0 && (
            <div className="note note-wait">
              <p className="text-sm font-medium flex items-center gap-1.5"><Icon name="warning" size={16} className="shrink-0" /> Upozornění ({preview.warnings.length})</p>
              <ul className="text-xs space-y-0.5 max-h-40 overflow-y-auto list-disc pl-4 mt-1">
                {preview.warnings.slice(0, 40).map((w, i) => <li key={i}>{w}</li>)}
                {preview.warnings.length > 40 && <li>…a dalších {preview.warnings.length - 40}</li>}
              </ul>
            </div>
          )}
          {smiMazat && (
            // Přepnutí platí hned: návrh se přegeneruje proti tomu, co v měsíci
            // zůstane (bez přepisu počítá s uloženými směnami jako s obsazenými).
            <ul className="list">
              <SwitchRow checked={clearBeforeCommit} onChange={(v) => zadejGenerovani(v)} title="Nahradit uložené směny měsíce"
                hint={clearBeforeCommit
                  ? (shifts.length > 0
                    ? `Uložením návrhu zmizí ${ulozeneVMesici(shifts.length)}.`
                    : 'V měsíci zatím nic uloženého není.')
                  : 'Návrh se přidá k uloženým směnám a počítá s nimi — nic se nesmaže.'} />
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" icon="check" loading={committing} disabled={preview.proposed.length === 0 || publishing} onClick={() => { void commitPreview(); }}>
              Potvrdit a uložit
            </Button>
            <Button variant="secondary" size="sm" disabled={committing || publishing} onClick={zahoditNavrh}>Zahodit náhled</Button>
          </div>
        </Well>
      )}

      {loading ? (
        <div className="space-y-2" aria-busy>
          <Skeleton className="h-4 w-1/2 rounded-full" />
          <Skeleton className="h-72" />
        </div>
      ) : loadError ? (
        <ErrorState compact title="Rozvrh se nenačetl" onRetry={load} detail={loadError} />
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
              onPrepni={(t) => setFiltr(f => ({ ...f, typy: prepni(f.typy, t) }))}
              diry={problemDates.length > 0 || filtr.jenDiry ? problemDates.length : null}
              jenDiry={filtr.jenDiry} onJenDiry={() => setFiltr(f => ({ ...f, jenDiry: !f.jenDiry }))} />
          )}
          {planovac && lideMesice.length > 0 && (
            <div className="mt-2">
              <PrehledLidi v={vytizeniLidi} radky={radkyPrehledu} razeni={razeni} onRazeni={setRazeni}
                otevreno={prehledOtevren} onOtevreno={setPrehledOtevren} vybrani={filtr.lide}
                onVyber={vyberClovekaZPrehledu} navrh={!!preview} dostupnostViditelna={smiDostupnost}
                bezFiltru={filtr.typy.length > 0 && filtr.jenDiry ? 'všechny typy a dny' : filtr.typy.length > 0 ? 'všechny typy směn' : filtr.jenDiry ? 'všechny dny' : null} />
            </div>
          )}
          {filtrAktivni && (
            <div className="mt-3">
              <ListaFiltru popis={popisFiltru(filtr, jmenaFiltru, kratkaFiltru)} vysledek={popisVysledku(viditelnych, !!preview)} onZrusit={zrusFiltr} />
            </div>
          )}
          </div>
          <ul className="flex items-center gap-x-3 gap-y-1 t-meta flex-wrap mb-3 mt-3" aria-label="Legenda">
            {/* Typy s tečkou ukazuje pás typů — v legendě by byly podruhé. */}
            {!ukazPasTypu && shiftTypes.map((t) => (
              <li key={t.id} className="flex items-center gap-1.5">
                <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${tridaTecky(t.color)}`} /> {t.name}
              </li>
            ))}
            {preview && (
              <li className="flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full border border-dashed border-black/50 dark:border-white/50" /> Návrh</li>
            )}
            {/* Dvě úrovně se liší barvou I tvarem: povinná = červený výstražný
                trojúhelník, žádoucí = oranžová tečka (tokeny wait jako v okně dne
                a ve widgetu Díry). Samotný odstín červené na telefonu a v tmavém
                režimu nešel rozlišit. */}
            {povinneDny.length > 0 && (
              <li className="flex items-center gap-1.5 text-bad-ink"><Icon name="warning" size={13} className="shrink-0" /> Nikdo neotevře</li>
            )}
            {problemDates.length > povinneDny.length && (
              <li className="flex items-center gap-1.5 text-wait-ink"><span aria-hidden className="h-2 w-2 rounded-full bg-wait" /> Chybí druhý člověk</li>
            )}
            {Object.keys(demand).length > 0 && (
              <li className="flex items-center gap-1.5"><Icon name="users" size={13} className="shrink-0 text-black/45" /> Rezervovaní hosté</li>
            )}
          </ul>
          {/* tabIndex -1: kam se vrátí fokus, když zmizí poslední prvek filtru. */}
          <div ref={mrizkaRef} tabIndex={-1} aria-label="Mřížka rozvrhu" className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-1.5 scroll-mt-4 outline-none">
            {zkratkyDnu(zacatek).map((d) => (
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
                      ? `Nikdo neotevře — ${g.from}–${g.to} v podniku nikdo, podnik se neotevře`
                      : `${g.from}–${g.to} v podniku nikdo — chybí druhý člověk`),
                    ...problem.missing.map(m => `Neobsazená směna „${m.shiftTypeName}"`),
                  ].join(' · ')
                : undefined;
              return (
                <button
                  key={cell}
                  type="button"
                  onClick={() => otevriDen(cell)}
                  title={problemTitle}
                  aria-label={`${dayLabel(cell)}: ${czCount(dayShifts.length, SMENA)}${filtrujeSmeny ? ' podle filtru' : ''}${nahradiUlozene && dayShifts.length > 0 ? ' (uložením návrhu se nahradí)' : ''}${dayProposed.length > 0 ? `, v návrhu ${czCount(dayProposed.length, SMENA)}` : ''}${hole ? ', nikdo neotevře' : problem ? ', chybí druhý člověk' : ''}`}
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
                      <span title={`${czCount(demand[cell].reservations, { one: 'rezervace', few: 'rezervace', many: 'rezervací' })} na ${czCount(demand[cell].guests, { one: 'hosta', few: 'hosty', many: 'hostů' })}`}
                        className="flex items-center gap-1 min-w-0 rounded-full px-1 py-0.5 text-[11px] font-semibold overflow-hidden bg-black/[0.06] text-black/70">
                        <Icon name="users" size={11} className="flex-shrink-0" />
                        <span className="truncate min-w-0 tabular-nums">{demand[cell].guests}</span>
                      </span>
                    )}
                    {(eventsByDate[cell] ?? []).map((ev: any) => (
                      <span key={`e-${ev.id}`} title={`Akce: ${ev.title}${ev.startTime ? ` od ${ev.startTime}` : ''}`}
                        className="flex items-center gap-1 min-w-0 rounded-full px-1 py-0.5 text-[11px] font-semibold overflow-hidden bg-info/15 text-info-ink">
                        <Icon name="calendarCheck" size={11} className="flex-shrink-0" />
                        <span className="truncate min-w-0">{ev.title}</span>
                      </span>
                    ))}
                    {dayShifts.slice(0, 3).map((s) => {
                      const rt = resolveShiftType(s, shiftTypes);
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
                    {dayShifts.length > 3 && <span className="text-[11px] text-black/45">+{dayShifts.length - 3} další</span>}
                    {dayProposed.slice(0, 3).map((p, idx) => (
                      <span key={`p-${idx}`}
                        title={`Návrh: ${p.employeeName} · ${p.shiftTypeName} ${p.startTime}–${p.endTime}${(p as any).split ? ' (část směny)' : ''}`}
                        className="flex items-center gap-1 min-w-0 rounded-full px-1 py-0.5 text-[11px] font-medium overflow-hidden border border-dashed border-black/30 dark:border-white/40 text-black/70">
                        <span className="flex-shrink-0 inline-flex items-center gap-0.5"><Icon name="sparkle" size={11} />{p.employeeAvatar}</span>
                        <span className="truncate min-w-0">{p.startTime}</span>
                      </span>
                    ))}
                    {dayProposed.length > 3 && <span className="text-[11px] text-black/45">+{dayProposed.length - 3} v návrhu</span>}
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
      <p className="t-meta">Kdo kdy pracoval, kdo udělal uzávěrku a kde chybí.</p>
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
          <PageHeader title={TITULEK} subtitle={PODTITULEK} aside={aside} />
          {loading && aktivniTab !== 'kalendar' && aktivniTab !== 'pravidla'
            ? <Skeleton className="h-64" />
            : loadError && aktivniTab !== 'kalendar' && aktivniTab !== 'pravidla'
              ? <Card><ErrorState compact title="Nastavení rozvrhu se nenačetlo" onRetry={load} detail={loadError} /></Card>
              : obsahZalozky}
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        aria-label="Soubor CSV s rozvrhem"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />

      {upgradeFor && <UpgradeModal feature={upgradeFor} onClose={() => setUpgradeFor(null)} />}

      {confirmClear && (
        <Modal open onClose={() => setConfirmClear(false)} size="sm" title="Vymazat celý měsíc?" subtitle={<span className="cz-sentence">{monthLabel(month)}</span>}
          footer={<>
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>Zrušit</Button>
            <Button variant="danger-solid" icon="trash" loading={clearing} onClick={clearMonth}>Vymazat měsíc</Button>
          </>}>
          <p className="text-sm text-black/60 text-pretty">Smaže {czCount(shifts.length, SMENA)} tohoto měsíce. Nejde to vzít zpět — lidé, kterým rozvrh přišel, ho ale v upozornění pořád mají.</p>
        </Modal>
      )}

      {copyOpen && (
        <Modal open onClose={() => setCopyOpen(false)} size="sm" title="Kopírovat týden"
          subtitle="Směny zdrojového týdne se naplánují do cílového — stejné dny, časy i lidi."
          footer={<>
            <Button variant="secondary" onClick={() => setCopyOpen(false)}>Zrušit</Button>
            <Button variant="primary" icon="copy" loading={copying} disabled={!copySrc || !copyDst} onClick={copyWeek}>Zkopírovat</Button>
          </>}>
          <div className="space-y-3">
            <Field id="kopie-z" label="Zkopírovat týden">
              <Select id="kopie-z" value={copySrc} onChange={(e) => setCopySrc(e.target.value)}>
                <option value="">Vyber týden…</option>
                {weekOptions(4, 0).map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
              </Select>
            </Field>
            <Field id="kopie-do" label="Do týdne">
              <Select id="kopie-do" value={copyDst} onChange={(e) => setCopyDst(e.target.value)}>
                <option value="">Vyber týden…</option>
                {weekOptions(0, 5).map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
              </Select>
            </Field>
            {copyMsg && <p className={`note ${copyMsg.ok ? 'note-ok' : 'note-danger'} text-sm`} role={copyMsg.ok ? 'status' : 'alert'}>{copyMsg.text}</p>}
          </div>
        </Modal>
      )}

      {importPreview && (
        <Modal open onClose={() => setImportPreview(null)} size="lg" title="Náhled importu"
          subtitle={importPreview.rows.length ? `${czCount(importPreview.rows.length, { one: 'platná směna', few: 'platné směny', many: 'platných směn' })} k importu` : undefined}
          footer={<>
            <Button variant="secondary" onClick={() => setImportPreview(null)}>Zrušit</Button>
            <Button variant="primary" icon="upload" loading={importing} disabled={importPreview.rows.length === 0} onClick={confirmImport}>
              Importovat {czCount(importPreview.rows.length, SMENA)}
            </Button>
          </>}>
          <div className="space-y-4">
            <Well className="t-meta">
              Očekávaný formát: <code className="text-black/80">datum;zaměstnanec;od;do;typ</code> — např.{' '}
              <code className="text-black/80">2026-08-03;anna@priklad.cz;08:00;14:00;morning</code>. Sloupec „zaměstnanec"
              může být e-mail nebo jméno, typ morning, afternoon nebo flexible.
            </Well>
            {importPreview.rows.length > 0 && (
              <div className="rounded-2xl border border-black/[0.08] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-xs">
                    <thead className="bg-black/[0.04] text-black/55">
                      <tr>
                        <th className="text-left px-3 py-2">Datum</th>
                        <th className="text-left px-3 py-2">Zaměstnanec</th>
                        <th className="text-left px-3 py-2">Od</th>
                        <th className="text-left px-3 py-2">Do</th>
                        <th className="text-left px-3 py-2">Typ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-black/[0.06]">
                      {importPreview.rows.slice(0, 40).map((r, i) => (
                        <tr key={i} className="text-black/80">
                          <td className="px-3 py-1.5 tabular-nums">{r.date}</td>
                          <td className="px-3 py-1.5">{r.employeeName}</td>
                          <td className="px-3 py-1.5 tabular-nums">{r.startTime}</td>
                          <td className="px-3 py-1.5 tabular-nums">{r.endTime}</td>
                          <td className="px-3 py-1.5">{resolveShiftType(r, shiftTypes).label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importPreview.rows.length > 40 && <p className="t-meta px-3 py-2">…a dalších {importPreview.rows.length - 40}</p>}
              </div>
            )}
            {importPreview.errors.length > 0 && (
              <div className="note note-danger">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Icon name="warning" size={16} className="shrink-0" /> {czCount(importPreview.errors.length, { one: 'problém', few: 'problémy', many: 'problémů' })} (přeskočeno)
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
        <Modal open onClose={() => setCekaMesic(null)} size="sm" title="Návrh není uložený"
          subtitle={<span className="cz-sentence">{monthLabel(month)}</span>}
          footer={<>
            <Button variant="secondary" onClick={() => {
              const c = cekaMesic; setCekaMesic(null); setPreview(null); maNavrhRef.current = false;
              setMonth(c.mesic); if (c.den) setDayModal(c.den);
            }}>Zahodit</Button>
            <Button variant="primary" icon="check" loading={committing} disabled={!preview || preview.proposed.length === 0}
              onClick={async () => {
                const c = cekaMesic;
                if (!(await commitPreview())) { setCekaMesic(null); return; }
                setCekaMesic(null); maNavrhRef.current = false;
                setMonth(c.mesic); if (c.den) setDayModal(c.den);
              }}>Uložit a přepnout</Button>
          </>}>
          <p className="text-sm text-black/60 text-pretty">
            Navržený rozvrh i s tvými úpravami je zatím jen tady v prohlížeči. Při přepnutí měsíce by se zahodil.
            {nahradiUlozene && shifts.length > 0 ? ` Uložením zmizí ${ulozeneVMesici(shifts.length)}.` : ''}
          </p>
        </Modal>
      )}

      {ptamSe && (
        <Modal open onClose={() => setPtamSe(null)} size="sm" title="Návrh má tvoje úpravy"
          subtitle={<span className="cz-sentence">{monthLabel(month)}</span>}
          footer={<>
            <Button variant="secondary" onClick={() => setPtamSe(null)}>Nechat</Button>
            <Button variant="danger-solid" onClick={() => {
              const a = ptamSe; setPtamSe(null);
              if (a.akce === 'zahodit') { setPreview(null); return; }
              setClearBeforeCommit(a.nahradit);
              void generate(a.nahradit);
            }}>{ptamSe.akce === 'zahodit' ? 'Zahodit návrh' : 'Zahodit a vygenerovat znovu'}</Button>
          </>}>
          <p className="text-sm text-black/60 text-pretty">
            {ptamSe.akce === 'zahodit'
              ? 'V návrhu jsou ruční úpravy (přidané nebo odebrané směny). Zahozením zmizí i ony.'
              : 'Nové generování vytvoří návrh od začátku — ruční úpravy (přidané nebo odebrané směny) zmizí. Chceš-li je zachovat, návrh nejdřív ulož.'}
          </p>
        </Modal>
      )}

      {potvrdNahrazeni && (
        <Modal open onClose={() => setPotvrdNahrazeni(false)} size="sm" title="Nahradit uložené směny?"
          subtitle={<span className="cz-sentence">{monthLabel(month)}</span>}
          footer={<>
            <Button variant="secondary" onClick={() => setPotvrdNahrazeni(false)}>Zrušit</Button>
            <Button variant="primary" icon="send" loading={publishing} onClick={async () => { setPotvrdNahrazeni(false); await publish(true); }}>Nahradit a publikovat</Button>
          </>}>
          <p className="text-sm text-black/60 text-pretty">
            Uložením návrhu zmizí {ulozeneVMesici(shifts.length)}, a lidé hned dostanou rozvrh jen z návrhu.
            {' '}Chceš-li je ponechat, vypni v náhledu „Nahradit uložené směny měsíce".
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
        action={hlaskaFiltru ? { label: 'Ukázat', onClick: () => { ukazPridane(hlaskaFiltru.ukazat); setHlaskaFiltru(null); } } : undefined} />
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
  const { money } = useCurrency();
  if (trzby.stav !== 'ok') {
    const text = trzby.stav === 'bez_opravneni'
      ? 'Počet lidí podle tržeb je zapnutý, ale na tržby nemáš oprávnění — generátor ho vynechal a řídil se jen otevírací směnou.'
      : trzby.stav === 'bez_prahu'
        ? 'Počet lidí podle tržeb je zapnutý, ale chybí práh — nastav ho v záložce Pravidla.'
        : 'Počet lidí podle tržeb je zapnutý, ale za posledních 8 týdnů nejsou uzávěrky s tržbou — generátor se řídil jen otevírací směnou.';
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
        {jeden.length > 0 && <>Stačí jeden — {czCount(jeden.length, DEN)}, očekávaná tržba ~{money(prumerJeden)}. </>}
        {dva.length > 0 && <>Dva lidé — {czCount(dva.length, DEN)} nad prahem {money(trzby.prah ?? 0)}. </>}
        {nepokryje.length > 0 && <>{czCount(nepokryje.length, DEN)} by tržba stačila na jednoho, ale otevírací směna nepokryje celou otevírací dobu — proto dva. </>}
        {jeden.length === 0 && dva.length === 0 && nepokryje.length === 0 && <>Na dny v tomhle měsíci nejsou tržby k porovnání s prahem. </>}
        {hodiny && hodiny.usporaDoporucenim > 0 && <>Oproti dvěma lidem to ušetří ~{czCount(Math.round(hodiny.usporaDoporucenim), HODINU)}.</>}
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

const NAZEV_BARVY: Record<string, string> = {
  '#C8F542': 'limetková', '#0A84FF': 'modrá', '#8B5CF6': 'fialová', '#F59E0B': 'oranžová',
  '#14B8A6': 'tyrkysová', '#EC4899': 'růžová',
};

function ShiftTypesManager({ shiftTypes, onReload }: { shiftTypes: ShiftType[]; onReload: () => Promise<void> }) {
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
  const beginEdit = (t: ShiftType) => {
    setEditing(t.id); setName(t.name); setStart(t.startTime); setEnd(t.endTime); setColor(t.color ?? COLORS[0]);
    setStartsAtOpen(!!t.startsAtOpen); setEndsAtClose(!!t.endsAtClose); setErr('');
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
        setErr(d?.error || 'Typ směny se nepodařilo uložit.');
        return;
      }
      setEditing(null);
      await onReload();
    } catch {
      setErr('Nepodařilo se spojit se serverem.');
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
      if (!res.ok) setErr('Typ směny se nepodařilo smazat.');
      setSmazat(null);
      await onReload();
    } catch {
      setErr('Nepodařilo se spojit se serverem.');
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
          <Icon name="clock" size={17} className="text-black/40 shrink-0" /><span className="truncate">Typy směn</span>
        </h2>
        {editing !== 'new' && <Button variant="accent" size="sm" icon="plus" onClick={beginNew}>Přidat typ</Button>}
      </div>
      {err && <p className="note note-danger text-sm" role="alert">{err}</p>}

      {shiftTypes.length === 0 && editing !== 'new' && (
        <EmptyState illustration="smeny" title="Zatím žádné typy směn" hint="Ranní, odpolední, otvíračka — podle nich generátor obsazuje dny. Přidej první." compact />
      )}

      {shiftTypes.length > 0 && (
        <ul className="list">
          {shiftTypes.map((t) => editing === t.id ? (
            <li key={t.id} className="py-3">{formular}</li>
          ) : (
            <ListRow key={t.id}
              lead={<span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/[0.035]"><TeckaBarvy barva={t.color} className="h-3 w-3" /></span>}
              title={<>{t.name}{t.zOrganizace && <Chip tone="muted" size="sm" className="ml-2 align-middle">z organizace</Chip>}{t.sdileno && <Chip tone="info" size="sm" className="ml-2 align-middle">sdíleno</Chip>}</>}
              meta={<>{t.startsAtOpen ? 'otevření' : t.startTime}–{t.endsAtClose ? 'zavření' : t.endTime}{t.zOrganizace && t.spravuje ? ` · spravuje: ${t.spravuje}` : ''}</>}
              // Typ ze zdrojového podniku upraví jen jeho vedení — tlačítka by jen vracela 403.
              actions={t.zOrganizace ? undefined : (
                <>
                  <Button variant="ghost" size="sm" iconOnly icon="pencil" aria-label={`Upravit typ ${t.name}`} onClick={() => beginEdit(t)} />
                  <Button variant="ghost" size="sm" iconOnly icon="trash" aria-label={`Smazat typ ${t.name}`} onClick={() => setSmazat(t)} />
                </>
              )}
            />
          ))}
        </ul>
      )}

      {editing === 'new' && formular}

      {smazat && (
        <Modal open onClose={() => setSmazat(null)} size="sm" title={`Smazat typ „${smazat.name}"?`}
          footer={<>
            <Button variant="secondary" onClick={() => setSmazat(null)}>Zrušit</Button>
            <Button variant="danger-solid" icon="trash" loading={busy} onClick={remove}>Smazat typ</Button>
          </>}>
          <p className="text-sm text-black/60 text-pretty">Naplánované směny tohoto typu zůstanou, ale ztratí barvu i název.</p>
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
  return (
    <Well className="space-y-3">
      <Field id="typ-nazev" label="Název" hint="Třeba Ranní, Odpolední nebo Otvíračka.">
        <Input id="typ-nazev" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field id="typ-od" label="Od">
          {startsAtOpen
            ? <p id="typ-od" className="t-meta py-3">Otevření podniku</p>
            : <Input id="typ-od" type="time" value={start} onChange={(e) => setStart(e.target.value)} />}
        </Field>
        <Field id="typ-do" label="Do">
          {endsAtClose
            ? <p id="typ-do" className="t-meta py-3">Zavření podniku</p>
            : <Input id="typ-do" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />}
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-black/70 cursor-pointer">
          <input type="checkbox" checked={startsAtOpen} onChange={(e) => setStartsAtOpen(e.target.checked)} className="h-4 w-4 accent-[#8FB811]" />
          Začíná otevřením podniku
        </label>
        <label className="flex items-center gap-2 text-sm text-black/70 cursor-pointer">
          <input type="checkbox" checked={endsAtClose} onChange={(e) => setEndsAtClose(e.target.checked)} className="h-4 w-4 accent-[#8FB811]" />
          Končí zavřením podniku <span className="text-black/45">(do konce směny)</span>
        </label>
      </div>
      <div role="radiogroup" aria-label="Barva typu" className="space-y-1.5">
        <p className="text-[13px] font-medium text-black/70" aria-hidden>Barva</p>
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
        <Button variant="primary" size="sm" loading={busy} disabled={!name.trim()} onClick={onSave}>Uložit</Button>
        <Button variant="secondary" size="sm" onClick={onCancel}>Zrušit</Button>
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
      setErr(apiMessage(e, 'Otevírací dobu se nepodařilo uložit.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card as="section" aria-labelledby="oteviraci-doba" className="space-y-4">
      <div>
        <h2 id="oteviraci-doba" className="t-section flex items-center gap-2"><Icon name="clock" size={17} className="text-black/40 shrink-0" /> Otevírací doba</h2>
        <p className="t-meta mt-0.5">Kdy má provoz otevřeno. Zavřené dny generátor přeskočí a díry hlídá jen v otevírací době.</p>
      </div>

      <ul className="list">
        {CZ_DAYS_FULL.map((label, d) => {
          const day = hours[String(d)] ?? { open: '08:00', close: '20:00', closed: false };
          const idDne = `oteviraci-${d}`;
          return (
            <li key={d} className="flex items-center gap-3 py-3 flex-wrap min-h-[3.25rem]">
              <span id={idDne} className="w-24 text-[15px] font-medium text-[#16181A] truncate">{label}</span>
              <Switch checked={!day.closed} onChange={(on) => update(d, { closed: !on })} labelledBy={idDne} disabled={readOnly} />
              <span className="t-meta w-20">{day.closed ? 'Zavřeno' : 'Otevřeno'}</span>
              {!day.closed && (
                <div className="flex items-center gap-2">
                  <Input type="time" aria-label={`${label} — otevírá v`} value={day.open} disabled={readOnly}
                    onChange={(e) => update(d, { open: e.target.value })} className="!w-auto" />
                  <span className="text-black/40" aria-hidden>–</span>
                  <Input type="time" aria-label={`${label} — zavírá v`} value={day.close} disabled={readOnly}
                    onChange={(e) => update(d, { close: e.target.value })} className="!w-auto" />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {err && <p className="note note-danger text-sm" role="alert">{err}</p>}
      {readOnly ? (
        <p className="t-meta">Otevírací dobu mění vedení s oprávněním k nastavení podniku.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="accent" icon="check" loading={saving} onClick={save}>Uložit otevírací dobu</Button>
          {saved && <Chip tone="ok" icon="check">Uloženo</Chip>}
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
      setErr(apiMessage(e, 'Pevný den se nepodařilo přidat.'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!smazat) return;
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/fixed-assignments?id=${smazat.id}`, { method: 'DELETE' });
      if (!res.ok) setErr('Přiřazení se nepodařilo smazat.');
      setSmazat(null);
      await onReload();
    } catch {
      setErr('Nepodařilo se spojit se serverem.');
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
    else setErr('Změnu se nepodařilo uložit.');
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
          <h2 id="pevny-den" className="t-section flex items-center gap-2"><Icon name="swap" size={17} className="text-black/40 shrink-0" /> Přidat pevný den</h2>
          <p className="t-meta mt-0.5">Přiřaď člověka k opakujícímu se dni v týdnu. Generátor ho na ten den nasadí přednostně.</p>
        </div>

        {employees.length === 0 ? (
          // Holá věta je slepá ulička: prázdný stav má vést tam, kde se to spraví.
          <EmptyState icon="users" compact title="Zatím nikdo v týmu"
            hint="Pevné dny se přiřazují lidem — nejdřív je pozvi do týmu."
            action={onNavigate ? <Button variant="secondary" icon="users" onClick={() => onNavigate('team-settings')}>Pozvat do týmu</Button> : undefined} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field id="pevny-kdo" label="Kdo">
              <Select id="pevny-kdo" value={employeeId} onChange={(e) => setEmployeeId(e.target.value === '' ? '' : parseInt(e.target.value))}>
                <option value="">Vyber člověka…</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </Field>
            <Field id="pevny-den-tydne" label="Den v týdnu">
              <Select id="pevny-den-tydne" value={weekday} onChange={(e) => setWeekday(parseInt(e.target.value))}>
                {CZ_DAYS_FULL.map((label, d) => <option key={d} value={d}>{label}</option>)}
              </Select>
            </Field>
            <Field id="pevny-typ" label="Typ směny" hint="Nepovinné — bez něj libovolná směna.">
              <Select id="pevny-typ" value={shiftTypeId} onChange={(e) => setShiftTypeId(e.target.value === '' ? '' : parseInt(e.target.value))}>
                <option value="">Libovolná</option>
                {shiftTypes.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.startTime}–{t.endTime})</option>)}
              </Select>
            </Field>
            <div className="flex items-end">
              <Button variant="accent" icon="plus" block loading={busy} disabled={!employeeId} onClick={add} className="sm:!w-full">Přidat pevný den</Button>
            </div>
          </div>
        )}
      </Card>

      <Card as="section" aria-labelledby="pevne-dny" className="space-y-3">
        <h2 id="pevne-dny" className="t-section flex items-center gap-2"><Icon name="calendar" size={17} className="text-black/40 shrink-0" /> Pevné dny</h2>
        {assignments.length === 0 ? (
          <EmptyState icon="calendar" title="Zatím žádné pevné dny" hint="Kdo chodí vždycky v pondělí, dostane pondělí — generátor to bere jako první." compact />
        ) : (
          <div className="space-y-4">
            {CZ_DAYS_FULL.map((label, d) => {
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
                          <Select aria-label={`Typ směny — ${a.employeeName}, ${label.toLowerCase()}`} value={a.shiftTypeId ?? ''}
                            onChange={(e) => zmenTyp(a, e.target.value === '' ? null : parseInt(e.target.value))} className="!w-auto !py-2 text-sm">
                            <option value="">Libovolná</option>
                            {shiftTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </Select>
                        )}
                        actions={<Button variant="ghost" size="sm" iconOnly icon="trash" aria-label={`Odebrat pevný den — ${a.employeeName}, ${label.toLowerCase()}`} onClick={() => setSmazat(a)} />}
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
        <Modal open onClose={() => setSmazat(null)} size="sm" title="Odebrat pevný den?"
          subtitle={`${smazat.employeeName} · ${CZ_DAYS_FULL[smazat.weekday]?.toLowerCase() ?? ''}`}
          footer={<>
            <Button variant="secondary" onClick={() => setSmazat(null)}>Zrušit</Button>
            <Button variant="danger-solid" icon="trash" loading={busy} onClick={remove}>Odebrat</Button>
          </>}>
          <p className="text-sm text-black/60 text-pretty">Z příštího generování rozvrhu vypadne. Už naplánované směny zůstanou.</p>
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
    const empName = employees.find((e) => e.id === emp)?.name ?? 'Tenhle člověk';
    const shiftCat = start < '12:00' ? 'morning' : 'afternoon';
    const dayPref = sub?.dayPreferences?.[date];
    const prefTypesForCheck = shiftTypes.map((t) => ({ id: t.id, name: t.name, start: t.startTime }));
    const slotTypeId = shiftTypes.find((t) => t.name === typeName)?.id ?? null;
    const prefBlocks = dayPref && dayPref !== 'off' && dayPref !== 'flexible'
      && !prefAllowsSlot(dayPref, { typeId: slotTypeId, start }, prefTypesForCheck);
    if (unavailable.has(emp)) return `${empName} má tento den jako nedostupný (nebo schválené volno).`;
    if (prefBlocks) return `${empName} má na tento den závaznou volbu „${dayPrefLabel(dayPref, prefTypesForCheck)}" — tahle směna jí neodpovídá.`;
    if (!dayPref && sub?.preferredShift && sub.preferredShift !== 'flexible' && sub.preferredShift !== shiftCat) {
      return `${empName} preferuje ${sub.preferredShift === 'morning' ? 'ranní' : 'odpolední'} směny.`;
    }
    return null;
  }, [employeeId, start, typeName, submissions, employees, shiftTypes, unavailable, date]);

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

  const nadpis = dayLabel(date);
  // S Týmem na den se přidává z řádku člověka. Formulář s vlastním časem je
  // pak jen doplněk pod rozbalením a jeho tlačítko je u něj — lepivá patička
  // s „Přidat do návrhu" mířila na vzdálený select pod dlouhým seznamem
  // a vedle rozbaleného řádku byla druhým tmavým tlačítkem se stejným textem.
  const sTymem = !!dostupnost && !readOnly;
  const [vlastniCas, setVlastniCas] = useState(false);
  const tlacitkoPridat = (
    <Button variant="primary" icon="plus" loading={saving} disabled={!employeeId || employees.length === 0 || kolidujeRucne} onClick={save}>
      {varovani ? 'Přesto přidat' : navrh ? 'Přidat do návrhu' : 'Přidat směnu'}
    </Button>
  );
  return (
    <Modal open onClose={onClose} size="md" title={nadpis.charAt(0).toUpperCase() + nadpis.slice(1)}
      subtitle={dayOpen ? `Otevřeno ${dayOpen}–${dayClose}` : oh?.closed ? 'Zavřeno' : undefined}
      footer={readOnly || sTymem ? <Button variant="secondary" onClick={onClose}>Zavřít</Button> : <>
        <Button variant="secondary" onClick={onClose}>Zavřít</Button>
        {tlacitkoPridat}
      </>}>
      <div className="space-y-5">
        {filtrAktivni && (
          // Okno dne je místo, kde se den opravuje: potřebuje vidět všechny
          // (kdo už stojí, kdo může) — filtr by tu schoval právě ty, kým se díra zaplní.
          <p className="t-meta flex items-center gap-1.5" data-okno-bez-filtru>
            <Icon name="info" size={14} className="shrink-0 text-black/45" />
            Okno ukazuje celý den — filtr platí jen pro mřížku.
          </p>
        )}
        {!readOnly && (dayGaps.length > 0 || missingHere.length > 0) && (
          // Povinná (nikdo neotevře) výrazně, žádoucí (chybí druhý) mírně.
          <div className={`note ${nikdoNeotevre ? 'note-danger' : 'note-wait'}`} data-dira={nikdoNeotevre ? 'povinna' : 'zadouci'}>
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <Icon name="warning" size={16} className="shrink-0" />
              {nikdoNeotevre ? 'Nikdo neotevře — podnik se ten den neotevře'
                : lidiDne === 1 ? 'Druhá směna neobsazená — otevře se s jedním člověkem' : 'Směna neobsazená — otevře se i bez ní'}
            </p>
            <ul className="text-xs mt-1 space-y-0.5 list-disc pl-4">
              {dayGaps.map((g, i) => <li key={`g-${i}`}>Od {toHM(g.start)} do {toHM(g.end)} není v podniku nikdo, přitom je otevřeno.</li>)}
              {missingHere.map((n) => <li key={`m-${n}`}>Směna „{n}" nemá nikoho.</li>)}
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
                ? <>Podle tržby by stačil 1 člověk (průměrná tržba v tento den v týdnu ~{money(doporuceni.trzba)}), ale otevírací směna nepokryje celou otevírací dobu — proto dva.</>
                : <>Doporučení: {doporuceni.lidi === 1 ? '1 člověk' : '2 lidé'} · průměrná tržba v tento den v týdnu ~{money(doporuceni.trzba)}
                  {doporuceni.usporaHodin > 0 ? ` · ušetří ${czCount(Math.round(doporuceni.usporaHodin), HODINU)}` : ''}</>}
            </span>
          </p>
        )}

        {events.length > 0 && (
          <div>
            <p className="t-label mb-1">Akce</p>
            <ul className="list">
              {events.map((ev: any) => (
                <ListRow key={ev.id}
                  lead={<span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-black/[0.035] text-black/55"><Icon name="calendarCheck" size={16} /></span>}
                  title={ev.title}
                  meta={`${ev.startTime ? `${ev.startTime}${ev.endTime ? `–${ev.endTime}` : ''}` : 'celý den'}${ev.location ? ` · ${ev.location}` : ''}${ev.crewPeople?.length ? ` · na akci: ${ev.crewPeople.map((p: any) => p.name).join(', ')}` : ' · zatím bez obsazení'}`}
                />
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="t-label mb-1">Přiřazené směny</p>
          {shifts.length > 0 && nahradiUlozene && (
            <p className="t-meta mb-1 text-pretty">Uložením návrhu se tyhle směny smažou — je zapnuté vymazání stávajících směn měsíce.</p>
          )}
          {shifts.length === 0 ? (
            <p className="t-meta">Na tento den zatím nikdo nemá směnu.</p>
          ) : (
            // Směny, které uložení návrhu smaže: tlumí se jen jméno a typ
            // (token + přeškrtnutí) a stav řekne i Chip „zmizí". Dřív opacity
            // na celém seznamu ztlumila i aktivní tlačítko koše.
            <ul className="list">
              {shifts.map((s) => {
                const rt = resolveShiftType(s, shiftTypes);
                return (
                  <ListRow key={s.id}
                    lead={<Avatar emoji={s.employeeAvatar} size="sm" />}
                    title={nahradiUlozene ? <span className="line-through text-black/45">{s.employeeName}</span> : s.employeeName}
                    meta={<span className={`inline-flex items-center gap-1.5 ${nahradiUlozene ? 'line-through text-black/45' : ''}`}><TeckaBarvy barva={rt.color} className="h-2 w-2" />{rt.label}</span>}
                    value={`${s.startTime}–${s.endTime}`}
                    right={nahradiUlozene ? <Chip tone="muted" size="sm">zmizí</Chip> : undefined}
                    actions={readOnly ? undefined : (
                      <Button variant="ghost" size="sm" iconOnly icon="trash" aria-label={`Odebrat směnu — ${s.employeeName}`} onClick={() => onRemove(s.id)} />
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
            <p className="t-label">Navržené směny</p>
            <p className="t-meta mb-1 text-pretty">Náhled, zatím neuloženo — uloží se přesně takhle tlačítkem „Potvrdit a uložit" nebo „Uložit a publikovat".</p>
            <ul className="list">
              {proposed.map((p, idx) => (
                <ListRow key={`prop-${idx}`}
                  lead={<Avatar emoji={p.employeeAvatar} size="sm" />}
                  title={p.employeeName}
                  meta={<span className="inline-flex items-center gap-1.5">{p.color && <TeckaBarvy barva={p.color} className="h-2 w-2" />}{p.shiftTypeName || 'Směna'}</span>}
                  value={`${p.startTime}–${p.endTime}`}
                  right={<Chip tone="muted" size="sm" icon="sparkle">Návrh</Chip>}
                  actions={onRemoveProposed ? (
                    <Button variant="ghost" size="sm" iconOnly icon="close" aria-label={`Odebrat z návrhu — ${p.employeeName}`} onClick={() => onRemoveProposed(p)} />
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
            <Button variant="ghost" icon="clock" aria-expanded={false} onClick={() => setVlastniCas(true)}>Přidat s vlastním časem…</Button>
          </div>
        )}
        {!readOnly && (!sTymem || vlastniCas || employees.length === 0) && (
          <div className="space-y-4 border-t border-black/[0.08] pt-4">
            <h3 className="t-card flex items-center gap-2"><Icon name="plus" size={17} className="text-black/40 shrink-0" /> {navrh ? 'Přidat do návrhu' : 'Přidat směnu'}</h3>
            {employees.length === 0 ? (
              <EmptyState icon="users" compact title="Zatím nikdo v týmu"
                hint="Směnu je komu přiřadit, až budou v týmu lidé."
                action={onNavigate ? <Button variant="secondary" icon="users" onClick={() => onNavigate('team-settings')}>Pozvat do týmu</Button> : undefined} />
            ) : (
              <>
                <Field id="den-kdo" label="Kdo">
                  <Select id="den-kdo" value={employeeId} onChange={(e) => setEmployeeId(e.target.value === '' ? '' : parseInt(e.target.value))}>
                    <option value="">Vyber člověka…</option>
                    {employees.map((e) => {
                      const sub = submissions.find((s) => s.employeeId === e.id);
                      const pozn = unavailable.has(e.id) ? ' — nemůže'
                        : sub?.preferredShift && sub.preferredShift !== 'flexible' ? ` — preferuje ${sub.preferredShift === 'morning' ? 'ranní' : 'odpolední'}` : '';
                      return <option key={e.id} value={e.id}>{e.name}{pozn}</option>;
                    })}
                  </Select>
                </Field>
                {kolidujeRucne
                  ? <p className="note note-danger text-sm" role="alert">Tenhle člověk už ten den má směnu, která se s tímhle časem překrývá.</p>
                  : varovani && <p className="note note-wait text-sm" role="status">{varovani}</p>}

                {shiftTypes.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[13px] font-medium text-black/70" aria-hidden>Typ směny</p>
                    <Segmented ariaLabel="Typ směny" value={typeName || VLASTNI_CAS}
                      onChange={(v) => {
                        if (v === VLASTNI_CAS) { pickCustom(); return; }
                        const t = shiftTypes.find(x => x.name === v);
                        if (t) applyShiftType(t);
                      }}
                      options={[...shiftTypes.map(t => ({ id: t.name, label: t.name })), { id: VLASTNI_CAS, label: 'Vlastní čas' }]} />
                    {typeName !== '' && shiftTypes.find(t => t.name === typeName)?.endsAtClose && !dayClose && (
                      <p className="text-xs text-wait-ink">Tento den je zavřeno — použije se výchozí konec typu.</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <Field id="den-od" label="Od">
                    <Input id="den-od" type="time" value={start} onChange={(e) => { setStart(e.target.value); pickCustom(); }} />
                  </Field>
                  <Field id="den-do" label="Do">
                    <Input id="den-do" type="time" value={end} onChange={(e) => { setEnd(e.target.value); pickCustom(); }} />
                  </Field>
                </div>
                {sTymem && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button variant="ghost" aria-expanded onClick={() => setVlastniCas(false)}>Sbalit</Button>
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

  const pridej = async (e: Member, t: TypDne) => {
    setPridavam(true); setChyba('');
    try {
      const ok = await onAdd({ employeeId: e.id, date, startTime: t.od, endTime: t.do, type: t.name });
      if (ok) {
        setOtevreny(null);
        setHlaska(`${e.name} — ${navrh ? 'přidáno do návrhu' : 'směna přidána'} · ${t.name} ${t.od}–${t.do}`);
        fokusNaRadek(e.id);
      } else setChyba('Nepřidalo se — zkus to znovu.');
    } finally { setPridavam(false); }
  };

  const pocetMuze = radky.filter((r) => (r.stav === 'muze' || r.stav === 'omezeni') && !r.maSmenu).length;

  return (
    <section ref={sekceRef} aria-labelledby={`tym-den-${date}`}>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <p id={`tym-den-${date}`} className="t-label">Tým na tento den</p>
        <p className="t-meta tabular-nums">{pocetMuze > 0 ? czCount(pocetMuze, { one: 'člověk může', few: 'lidé můžou', many: 'lidí může' }) : 'další nikdo nemůže'}</p>
      </div>
      <p ref={hlaskaRef} tabIndex={-1} role="status" className={`t-meta flex items-center gap-1.5 outline-none ${hlaska ? 'mb-1' : 'sr-only'}`} data-hlaska-tym>
        {hlaska && <><Icon name="check" size={14} className="shrink-0 text-ok-ink" />{hlaska}</>}
      </p>
      {radky.length === 0 ? (
        <p className="t-meta">V týmu zatím nikdo není.</p>
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
              r.maSmenu ? `má směnu ${smeny.map((x) => `${x.startTime}–${x.endTime}`).join(', ')}` : null,
              info.preferuje,
            ].filter(Boolean).join(' · ');
            const poznamky = [
              info.poznamkaDne ? `k tomuto dni: „${info.poznamkaDne}“` : null,
              info.poznamka ? `„${info.poznamka}“` : null,
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
                  right={<span data-stav={info.stav}><Chip tone={info.ton} size="sm">{info.popis}</Chip></span>}
                  actions={muzePridat ? (
                    <Button variant="secondary" size="sm" icon="plus" aria-expanded={otevreny === clen.id} data-pridat={clen.id}
                      aria-label={`Přidat — ${clen.name}`} onClick={() => rozbal(clen.id, info, smeny)}>Přidat</Button>
                  ) : undefined}
                />
                {otevreny === clen.id && vybrany && (
                  <li className="py-3">
                    <div ref={wellRef}><Well className="space-y-3">
                      {volneTypy.length > 1 && (
                        <Segmented ariaLabel={`Typ směny pro ${clen.name}`} size="sm" value={vybrany.name}
                          onChange={(v) => setTyp(v)} options={volneTypy.map((t) => ({ id: t.name, label: t.name }))} />
                      )}
                      <p className="t-meta tabular-nums">{vybrany.name} · {vybrany.od}–{vybrany.do}{navrh ? ' · do návrhu' : ''}</p>
                      {proti && (
                        <p className="note note-wait text-sm text-pretty" role="status">
                          {info.stav === 'volno'
                            ? `${clen.name} má na tento den ${info.popis === 'dovolená' ? 'dovolenou' : info.popis}.`
                            : `${clen.name} podle své dostupnosti tento den nemůže.`}
                          {' '}Přidat jde, ale jen když je to domluvené.
                        </p>
                      )}
                      {!proti && mimoVolbu && (
                        <p className="note note-wait text-sm text-pretty" role="status">
                          {clen.name} má na tento den v dostupnosti „{info.popis}“ — {vybrany.name} tomu neodpovídá.
                        </p>
                      )}
                      {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setOtevreny(null)}>Zrušit</Button>
                        <Button variant="primary" size="sm" icon="plus" loading={pridavam} onClick={() => pridej(clen, vybrany)}>
                          {proti || mimoVolbu ? 'Přesto přidat' : navrh ? 'Přidat do návrhu' : 'Přidat směnu'}
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
  const [cela, setCela] = useState(false);
  // Odhad podle délky: změřit přetečení by chtělo ResizeObserver na každý
  // řádek; dva řádky na telefonu pojmou zhruba 90 znaků.
  const dlouha = text.length > 90;
  return (
    <span className="block whitespace-normal text-pretty">
      <span className={cela ? 'block' : 'line-clamp-2'}>{text}</span>
      {dlouha && (
        <Button variant="ghost" size="sm" className="-ml-2" aria-expanded={cela} onClick={() => setCela((v) => !v)}>
          {cela ? 'Méně' : 'Celá poznámka'}
        </Button>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Pravidla generování — max dní v řadě, hodiny, střídání, dělení směn
// ---------------------------------------------------------------------------

function ScheduleRulesManager() {
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
    }).catch((e) => setLoadErr(apiMessage(e, 'Pravidla se nenačetla.'))).finally(() => setLoading(false));
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
    if (prahChyba) { setPrahDotcen(true); setErr('Zadej práh tržby, nad kterým mají být dva lidé — nebo počet lidí podle tržeb vypni.'); return; }
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
        setErr('Počet lidí podle tržeb se neuložil — databáze ho ještě nezná (spusť /api/init). Ostatní pravidla jsou uložená.');
      } else {
        setUlozeneTrzby(trzbyTed);
        setMsg('Uloženo. Pravidla se použijí při dalším generování rozvrhu.');
      }
      // Widget „Naplánované hodiny" ukazuje strop z pravidel.
      obnovDataWidgetu('/api/schedule/rules');
    } catch (e) { setErr(apiMessage(e, 'Uložení se nepodařilo.')); }
    setSaving(false);
  };

  const teamLimit = teamMax === '' ? null : parseInt(teamMax);

  if (loading) return <Skeleton className="h-64 max-w-2xl" />;
  if (loadErr) return <Card className="max-w-2xl"><ErrorState compact title="Pravidla se nenačetla" onRetry={() => setTick(t => t + 1)} detail={loadErr} /></Card>;

  return (
    <div className="space-y-5 max-w-2xl">
      <Card as="section" aria-labelledby="pravidla-dny" className="space-y-3">
        <h2 id="pravidla-dny" className="t-section flex items-center gap-2"><Icon name="clock" size={17} className="text-black/40 shrink-0" /> Maximálně dní v řadě</h2>
        <p className="t-meta text-pretty">
          Kolik dní po sobě může někdo pracovat. Generátor po dosažení limitu naplánuje volno — a počítá i směny na přelomu měsíce.
        </p>
        <Field id="pravidla-tym-dny" label="Pro celý tým">
          <Select id="pravidla-tym-dny" value={teamMax} onChange={e => setTeamMax(e.target.value)} className="sm:!w-64">
            <option value="">Bez omezení</option>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14].map(n => (
              <option key={n} value={n}>max {n} {n <= 4 ? 'dny' : 'dní'} po sobě</option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card as="section" aria-labelledby="pravidla-hodiny" className="space-y-3">
        <h2 id="pravidla-hodiny" className="t-section flex items-center gap-2"><Icon name="overview" size={17} className="text-black/40 shrink-0" /> Maximálně hodin za měsíc</h2>
        <p className="t-meta text-pretty">
          Strop hodin na osobu a měsíc — hodí se pro brigádníky (DPP) nebo úvazky. Generátor po dosažení limitu už směnu nepřidá.
        </p>
        <Field id="pravidla-tym-hodiny" label="Pro celý tým (hodin za měsíc)" hint="Prázdné = bez omezení.">
          <Input id="pravidla-tym-hodiny" type="number" inputMode="numeric" min={8} max={400} value={teamMaxHours}
            onChange={e => setTeamMaxHours(e.target.value)} className="!w-full sm:!w-36" />
        </Field>
      </Card>

      <Card as="section" aria-labelledby="pravidla-generator">
        <h2 id="pravidla-generator" className="t-section flex items-center gap-2"><Icon name="users" size={17} className="text-black/40 shrink-0" /> Generátor</h2>
        <ul className="list mt-1">
          <SwitchRow checked={balance} onChange={setBalance} title="Spravedlivé střídání"
            hint="Přednost dostane ten, kdo má zatím méně směn, a střídá se, kdo s kým slouží. Nedostupnost a limity mají vždy přednost." />
          <SwitchRow checked={split} onChange={setSplit} title="Dělení směn mezi dva lidi"
            hint="Když směnu nemůže vzít nikdo celou, generátor ji rozpůlí — začátek jednomu, konec druhému. V náhledu jsou půlky označené." />
          {/* Bez finance.trzby je přepínač vidět (ať je jasné, jestli je
              zapnutý), ale měnit ho nejde — práh prozrazuje tržby a bez
              oprávnění by generátor doporučení stejně vynechal. */}
          <SwitchRow checked={podleTrzeb} onChange={prepniTrzby} title="Počet lidí podle tržeb" disabled={!trzbyInfo.smiTrzby}
            hint={trzbyInfo.smiTrzby
              ? 'Otevírací směnu generátor obsadí vždy. Pod prahem stačí jeden člověk na celý den (když ho otevírací směna pokryje), nad ním dva — podle průměrné tržby stejného dne za posledních 8 týdnů. Platí po uložení.'
              : 'Zapnout a nastavit může jen někdo s přístupem k tržbám.'} />
        </ul>
        {podleTrzeb && (
          <Well className="mt-3 space-y-3" data-trzby-nastaveni>
            {trzbyInfo.smiTrzby ? (
              <Field id="pravidla-prah" label={`Dva lidé, když průměrná tržba dne přesáhne (${symbol})`}
                error={prahChyba && prahDotcen ? 'Zadej kladné číslo.' : undefined}
                hint={trzbyInfo.navrhPrahu ? `Návrh z vašich tržeb: ${money(trzbyInfo.navrhPrahu)} — zhruba půlka dnů v týdnu je nad ním.` : 'Pod prahem stačí jeden člověk na celý den.'}>
                <Input id="pravidla-prah" type="number" inputMode="numeric" min={1} value={prah}
                  onChange={e => setPrah(e.target.value)} onBlur={() => setPrahDotcen(true)} className="!w-full sm:!w-44" />
              </Field>
            ) : (
              <p className="t-meta text-pretty">{trzbyInfo.prahNastaven ? 'Práh tržby je nastavený.' : 'Práh tržby zatím není nastavený.'} Hodnotu vidí jen ten, kdo smí vidět tržby.</p>
            )}
            {!trzbyInfo.smiTrzby ? (
              <p className="t-meta text-pretty">Doporučení spočítá generování u někoho, kdo tržby vidět smí — u tebe ho generátor vynechá a řekne to.</p>
            ) : trzbyInfo.dny && Object.keys(trzbyInfo.dny).length > 0 ? (
              <div>
                <p className="t-label mb-1">Průměrná tržba podle dne v týdnu</p>
                <ul className="list">
                  {CZ_DAYS_FULL.map((nazev, i) => {
                    const d = trzbyInfo.dny?.[String(i)];
                    if (!d) return null;
                    const lidi = prahCislo && prahCislo > 0 ? (d.prumer > prahCislo ? 2 : 1) : null;
                    return (
                      <ListRow key={nazev} title={nazev} meta={`z ${czCount(d.vzorek, DEN)}`}
                        value={`~${money(d.prumer)}`}
                        right={lidi ? <Chip tone={lidi === 2 ? 'info' : 'muted'} size="sm">{lidi === 2 ? '2 lidé' : '1 člověk'}</Chip> : undefined} />
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="t-meta text-pretty">Za posledních 8 týdnů nejsou uzávěrky s tržbou — dokud nebudou, generátor se řídí jen otevírací směnou.</p>
            )}
          </Well>
        )}
        {split && members.length > 0 && (
          <Well className="mt-3 space-y-1">
            <p className="t-label">Komu se smí směna rozdělit</p>
            <ul className="list">
              {members.map(m => (
                <SwitchRow key={m.id} checked={splitOks[m.id] !== false}
                  onChange={on => setSplitOks(o => ({ ...o, [m.id]: on }))}
                  title={m.name} hint={splitOks[m.id] === false ? 'Jen celé směny' : undefined} />
              ))}
            </ul>
          </Well>
        )}
      </Card>

      <Card as="section" aria-labelledby="pravidla-vyjimky" className="space-y-3">
        <h2 id="pravidla-vyjimky" className="t-section">Výjimky pro jednotlivce</h2>
        <p className="t-meta text-pretty">Kdo to má jinak než tým — třeba brigádník, co chce co nejvíc směn v kuse, nebo někdo, komu tři dny stačí.</p>
        <ul className="list">
          {members.map(m => {
            const v = overrides[m.id] ?? '';
            const effective = v === '' ? (teamLimit != null ? `podle týmu (max ${teamLimit})` : 'bez omezení')
              : v === '0' ? 'bez omezení' : `max ${v} po sobě`;
            const hv = hourOverrides[m.id] ?? '';
            const effHours = hv === '' ? (teamMaxHours !== '' ? `podle týmu (${teamMaxHours} h)` : 'hodiny bez omezení')
              : hv === '0' ? 'hodiny bez omezení' : `max ${hv} h za měsíc`;
            return (
              <li key={m.id} className="flex items-center gap-3 py-3 flex-wrap">
                <Avatar emoji={m.avatar} size="sm" />
                <div className="min-w-0 flex-1 basis-40">
                  <p className="text-[15px] font-medium text-[#16181A] truncate">{m.name}</p>
                  <p className="t-meta">{effective} · {effHours}</p>
                </div>
                <Field id={`vyjimka-dny-${m.id}`} label="Dní po sobě" className="w-40">
                  <Select id={`vyjimka-dny-${m.id}`} value={v} onChange={e => setOverrides(o => ({ ...o, [m.id]: e.target.value }))}>
                    <option value="">Podle týmu</option>
                    <option value="0">Bez omezení</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14].map(n => <option key={n} value={n}>max {n} po sobě</option>)}
                  </Select>
                </Field>
                <Field id={`vyjimka-hodiny-${m.id}`} label="Hodin za měsíc" className="w-32">
                  <Input id={`vyjimka-hodiny-${m.id}`} type="number" inputMode="numeric" min={0} max={400}
                    value={hourOverrides[m.id] ?? ''} title="Prázdné = podle týmu, 0 = bez omezení"
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
        <Button variant={neulozeno ? 'accent' : 'secondary'} icon="check" loading={saving} onClick={save}>Uložit pravidla</Button>
        {neulozeno && <span className="t-meta" data-neulozeno>Neuložené změny</span>}
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
    if (v === 'off') return 'nemůže';
    if (v === 'morning') return 'ranní';
    if (v === 'afternoon') return 'odpo';
    const t = shiftTypes.find((x) => `type:${x.id}` === v);
    return (t?.name ?? 'směna').slice(0, 6).toLowerCase();
  };
  const cyklusSlovy = ['volno', 'nemůže', ...(shiftTypes.length ? shiftTypes.map(t => `jen ${t.name}`) : ['jen ranní', 'jen odpolední'])].join(', ');

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
    } catch (e) { setErr(apiMessage(e, 'Uložení se nepodařilo.')); }
    setSaving(false);
  };

  // Dovolená, která zasahuje do měsíce (API vrací celé dny „RRRR-MM-DD", někdy s časem).
  const volnoVMesici = volno
    .map((v) => ({ od: denZ(v.fromDate), do: denZ(v.toDate) }))
    .filter((v) => v.od && v.od.slice(0, 7) <= month && (v.do || v.od).slice(0, 7) >= month);
  const PREFERENCE: Record<string, string> = { flexible: 'Flexibilní', morning: 'Ranní', afternoon: 'Odpolední' };

  if (jenCist) {
    // Náhled pro vedení bez dostupnost.upravit: všechno, co člověk zadal, bez možnosti to měnit.
    const zadano = Object.entries(days).filter(([, v]) => v).sort((a, b) => a[0].localeCompare(b[0]));
    return (
      <Modal open onClose={onClose} size="md" title={`Dostupnost — ${member.name}`} subtitle={<span className="cz-sentence">{monthLabel(month)}</span>}
        footer={<Button variant="secondary" onClick={onClose}>Zavřít</Button>}>
        <div className="space-y-4">
          {!initial ? (
            <p className="t-meta text-pretty">Dostupnost na tento měsíc zatím není zadaná.</p>
          ) : (
            <>
              <div>
                <p className="t-label mb-1">Dny</p>
                {zadano.length === 0 ? <p className="t-meta">Žádný den není omezený — může kdykoli.</p> : (
                  <ul className="list">
                    {zadano.map(([d, v]) => (
                      <li key={d} className="flex items-center justify-between gap-3 py-2 text-sm">
                        <span className="cz-sentence tabular-nums">{new Date(`${d}T12:00:00Z`).toLocaleDateString('cs-CZ', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' })}</span>
                        <Chip size="sm" tone={v === 'off' ? 'bad' : 'muted'}><span className="cz-sentence">{v === 'off' ? 'nemůže' : (dayPrefLabel(v, shiftTypes.map((t) => ({ id: t.id, name: t.name, start: t.startTime }))) ?? labelOf(v))}</span></Chip>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div><dt className="t-label">Preferuje</dt><dd className="mt-0.5">{PREFERENCE[preferred] ?? preferred}</dd></div>
                <div><dt className="t-label">Max směn</dt><dd className="mt-0.5 tabular-nums">{maxShifts || 'bez limitu'}</dd></div>
              </dl>
              <div>
                <p className="t-label mb-1">Poznámka pro vedení</p>
                <p className="text-sm text-pretty whitespace-pre-line">{note.trim() || <span className="t-meta">Bez poznámky.</span>}</p>
              </div>
            </>
          )}
          {volnoVMesici.length > 0 && (
            <div>
              <p className="t-label mb-1">Schválené volno</p>
              <ul className="space-y-1 text-sm tabular-nums">
                {volnoVMesici.map((v, i) => <li key={i}>{rozsahVolna(v.od, v.do)}</li>)}
              </ul>
            </div>
          )}
          <p className="t-meta text-pretty">Upravit dostupnost za jiné může jen role s oprávněním k úpravě dostupnosti.</p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open onClose={onClose} size="md" title={`Dostupnost — ${member.name}`} subtitle={<span className="cz-sentence">{monthLabel(month)}</span>}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Zrušit</Button>
        <Button variant="primary" icon="send" loading={saving} onClick={save}>Uložit a upozornit</Button>
      </>}>
      <div className="space-y-4">
        <p className="t-meta text-pretty">
          Klepnutím na den přepínáš: {cyklusSlovy}. Denní volby jsou pro generátor závazné — typy se berou z nastavení Typy směn.
        </p>
        {volnoVMesici.length > 0 && (
          <p className="note note-wait text-sm text-pretty">Schválené volno: {volnoVMesici.map((v) => rozsahVolna(v.od, v.do)).join(', ')}</p>
        )}

        <div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {zkratkyDnu(zacatek).map((d) => (
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
                  aria-label={`${cislo}. — ${v ? labelOf(v) : 'volno'}`}
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
          <Field id="dostupnost-preferuje" label="Preferuje celkově">
            <Select id="dostupnost-preferuje" value={preferred} onChange={(e) => setPreferred(e.target.value)}>
              <option value="flexible">Flexibilní</option>
              <option value="morning">Ranní</option>
              <option value="afternoon">Odpolední</option>
            </Select>
          </Field>
          <Field id="dostupnost-max" label="Max směn" hint="Prázdné = bez limitu.">
            <Input id="dostupnost-max" type="number" inputMode="numeric" min={1} max={31} value={maxShifts}
              onChange={(e) => setMaxShifts(e.target.value)} />
          </Field>
        </div>

        <Field id="dostupnost-pozn" label="Poznámka">
          <Input id="dostupnost-pozn" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>

        {err && <p className="note note-danger text-sm" role="alert">{err}</p>}
      </div>
    </Modal>
  );
}
