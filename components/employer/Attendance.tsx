'use client';

// Docházka (vedení) — plocha s widgety (kolo 69, balík B2, spec §6.2).
//
// Dřív jedna dlouhá stránka: „Právě na směně" v limetkových kartách, dvě
// dlaždice mezd s ručními štítky, mřížka karet „Souhrn hodin" a pod tím
// záznamy. Teď jsou bloky widgety (Právě na směně, Mzdy za období, Souhrn
// hodin, Otevřené příchody, Chybí sazba) a tahle komponenta nese jen
// hlavičku a nástroj: záznamy po dnech s hledáním, úpravou, přidáním
// a exportem — v jedné kartě s .list (DP §4 B), ne karta na den.
//
// Období 7/30/90 v hlavičce řídí nástroj i widgety s volbou „Podle stránky"
// (ObdobiStrankyDochazky). Nástroj čte záznamy přes useDataWidgetu na téže
// adrese jako tyto widgety, takže plocha pošle jediný dotaz a po úpravě
// záznamu (obnovDochazku) se překreslí obojí najednou.
//
// Kolo 7 (R7-2): u záznamu plán směny a odchylka („+12 min pozdě", „odešel o 25 min
// dřív"; lib/dochazkaPrehled.odchylkyZaznamu — přestávka nehlásí pozdní příchod), ruční
// oprava a přidání nesou důvod (Textarea do 300 znaků) a v řádku „upraveno (Martin)"
// s chipem Upraveno; CSV pro účetní má Plán od/do, Odchylku, Poznámku a kdo upravil.
//
// Kolo 8 (R8-2, Záznamy docházky a tablet) — Martin: „najít filtr nebo funkci je hardcore":
//  - pás lidí a pozic s počty nad seznamem („Eva · 12", „Barista · 41", druhý klik ruší) a pilulka
//    „Jen k ověření" (zapomenutý odchod, pozdě, dřív, poznámka, nad 24 h, mimo podnik); volba se pamatuje
//    (useUlozeno); u vybraného člověka souhrn období (hodiny, směny, pozdě, pauzy) a CSV jen za něj;
//  - dva záznamy kolem pauzy jsou jeden řádek „9:02 – 17:31 · pauza 30 min" (lib/dochazkaZaznamy.radkyZaznamu),
//    v CSV sloupec „Pauza (min)"; úprava mění příchod první a odchod poslední části, pauza zůstává;
//  - uzavřené výplatní období (zámky z GET /api/attendance): u dne chip „uzavřeno", místo tužky zámek a hláška
//    „Září je uzavřené — otevři ho ve Výplatní listině" (server to samé odmítne 409);
//  - poloha z telefonu: chip „z telefonu · 40 m" / „mimo podnik 1,2 km" / „bez polohy"; „···" › „Pravidla
//    píchání" (jen u podniku, poloměr, Použít moji polohu — PUT /api/attendance);
//  - píchnutí doručená z tabletu po výpadku: chip „offline" a počet v hlavičce nástroje.
//
// Oprávnění (kolo 67, katalog): přidat a opravit čas jen s dochazka.upravit,
// smazat s dochazka.mazat, export s dochazka.exportovat (sloupec Mzda jen
// s finance.mzdy). Dřív se tlačítka ukazovala všem, kdo docházku vidí,
// a končila 403.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../Icons';
import { Avatar, Button, Card, Chip, ErrorState, Field, Input, ListRow, Menu, Modal, ObdobiLista, SearchField, Segmented, Select, Skeleton, Stat, StatRow, SwitchRow, Textarea, Toast } from '../ui';
import { usePersonProfile } from './ProfileLinkProvider';
import { useSymbol } from '../CurrencyProvider';
import { usePlan, UpgradeModal } from '../Pro';
import { ulozSoubor } from '@/lib/stahni';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { useOpravneni } from '../role/useOpravneni';
import { ObdobiStrankyDochazky, obnovDochazku, zapamatujDniDochazky } from '../widgety/oblasti/dochazka';
import { dbTimeHM, parseDbTime, pragueDayOf, pragueToday } from '@/lib/pragueTime';
import { earnedFor } from '@/lib/wages';
import { apiMessage, okJson } from '@/lib/api';
import { obsahuje } from '@/lib/hledani';
import { csvPlanAUprava, hodinyMinuty, konecSmeny, navrhOdchodu, odchylkyZaznamu, sazbyZRosteru, spropitneZaObdobi, upravyVRozmezi, zaznamyVRozmezi, type ClenRosteru, type UpravaMzdy, type UzaverkaSpropitne, type ZamekObdobi } from '@/lib/dochazkaPrehled';
import {
  BEZ_POZICE, csvPauzaMin, csvPoloha, filtrujRadky, kOvereni, mesicZamku, pasLidi, pasPozic, poziceZRosteru, prepniHodnotu, priznakyRadku, radkyZaznamu, souhrnRadku, zamekDne,
  type RadekZaznamu, type ZaznamSeStavem,
} from '@/lib/dochazkaZaznamy';
import { POLOMERY_M, VYCHOZI_PRAVIDLA_PICHANI, normalizujPravidlaPichani, vzdalenostText, type PolomerM, type PravidlaPichani } from '@/lib/geoPichani';
import { fmtDatum, fmtHM, fmtMesic } from '@/lib/i18n/format';
import { obdobiZPresetu, platneRozmezi, pocetDni } from '@/lib/obdobi';
import { useObdobi } from '@/lib/useObdobi';
import { useUlozeno } from '@/lib/useUlozeno';
import { dayPlus } from '@/lib/pragueTime';
import { useJazyk, useT } from '@/lib/i18n/client';
import { TlacitkoHodnotitSmenu } from '../hodnoceni-smeny/TlacitkoHodnotitSmenu';
import { useNavrhyTrestu } from '../tresty-vedeni/data';
import { DatTrest } from '../tresty-vedeni/DatTrest';
import type { PredvolbyTrestu } from '../tresty-vedeni/logika';
import { DNI_NAVRHU, DNI_ZPETNE, posunDni, textNavrhu } from '@/lib/tresty';
import { useLocale } from './jazyk';

type Zaznam = ZaznamSeStavem & { id: number | string; employeeId: number | string };
type Radek = RadekZaznamu<Zaznam>;
type Clen = ClenRosteru & { jobTitle?: string | null };
interface Data { roster: Clen[]; entries: Zaznam[]; adjustments: UpravaMzdy[]; zamky: ZamekObdobi[]; pravidlaPichani: PravidlaPichani | null }

function vyberData(raw: any): Data {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.roster)) throw new Error('Docházka přišla v nečekaném tvaru.'); // i18n-ok
  return {
    roster: raw.roster, entries: Array.isArray(raw.entries) ? raw.entries : [], adjustments: Array.isArray(raw.adjustments) ? raw.adjustments : [],
    zamky: Array.isArray(raw.zamky) ? raw.zamky : [],
    pravidlaPichani: raw.pravidlaPichani && typeof raw.pravidlaPichani === 'object' ? normalizujPravidlaPichani(raw.pravidlaPichani) : null,
  };
}
function vyberUzaverky(raw: any): UzaverkaSpropitne[] {
  if (!raw || !Array.isArray(raw.closings)) throw new Error('Uzávěrky přišly v nečekaném tvaru.'); // i18n-ok
  return raw.closings;
}

/** Server vrací docházku nejvýš 180 dní zpět. */
const NEJDALE_DNI = 180;
/** Nejdelší důvod ruční opravy — stejný strop jako server (app/api/attendance). */
const MAX_DUVOD = 300;
/** Mezery na pevné, ať se číslo ve Stat nezalomí. */
const pevne = (s: string) => s.replace(/ /g, '\u00a0');
/** Křestní jméno do řádku („upraveno (Martin)"); celé jméno nese CSV a title. */
const krestni = (jmeno: string | null | undefined) => String(jmeno ?? '').trim().split(/\s+/)[0] ?? '';
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };
/** Šířka vyblednutí okraje pásu, když za ním ještě něco je (jako Segmented a RozvrhFiltr). */
const FADE = 24;

/** Datum na vstup datetime-local v místním čase prohlížeče. */
function doVstupu(v: string | Date | null | undefined): string {
  const d = v instanceof Date ? v : parseDbTime(v ?? null);
  if (!d) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** „H:MM" pro CSV (účetní sčítá sloupec). */
function hMM(ms: number): string {
  const min = Math.max(0, Math.floor(ms / 60000));
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
}

const ZDROJ: Record<string, string> = { kiosk: 'tablet', closing: 'z uzávěrky', self: 'sám', manual: 'ručně', break: 'po pauze' }; // i18n-ok (CSV pro účetní zůstává česky)

/**
 * Vodorovně posuvný pás pilulek (DESIGN „Filtrovací pás"): na telefonu se nezalamuje, že je kus mimo,
 * prozradí vyblednutý okraj. Stejný kus jako v plánovači rozvrhu (RozvrhFiltr) — tam je součástí
 * rozvrhu, tady docházky; sdílený modul by svázal dvě oblasti, které se nemají potkat.
 */
function PosuvnyPas({ ariaLabel, children, data }: { ariaLabel: string; children: ReactNode; data: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [okraje, setOkraje] = useState({ vlevo: false, vpravo: false });
  const zmer = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const vlevo = el.scrollLeft > 1;
    const vpravo = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setOkraje(o => (o.vlevo === vlevo && o.vpravo === vpravo ? o : { vlevo, vpravo }));
  }, []);
  useLayoutEffect(() => {
    zmer();
    const el = ref.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(zmer) : null;
    ro?.observe(el);
    const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(zmer) : null;
    mo?.observe(el, { childList: true, subtree: true, characterData: true });
    return () => { ro?.disconnect(); mo?.disconnect(); };
  }, [zmer]);
  const maska = okraje.vlevo || okraje.vpravo
    ? `linear-gradient(to right, ${okraje.vlevo ? 'transparent' : '#000'} 0, #000 ${okraje.vlevo ? FADE : 0}px, #000 calc(100% - ${okraje.vpravo ? FADE : 0}px), ${okraje.vpravo ? 'transparent' : '#000'} 100%)`
    : undefined;
  return (
    <div ref={ref} role="group" aria-label={ariaLabel} onScroll={zmer} data-pas={data}
      style={maska ? { WebkitMaskImage: maska, maskImage: maska } : undefined}
      className="flex gap-1.5 min-w-0 max-w-[calc(100%+0.5rem)] -mx-1 px-1 overflow-x-auto overscroll-x-contain snap-x snap-proximity scroll-px-1 scrollbar-none py-1 [&:has(:focus-visible)]:![mask-image:none] [&:has(:focus-visible)]:![-webkit-mask-image:none]">
      {children}
    </div>
  );
}

/** Počet v pilulce — stejný tvar jako v Segmented. */
function Pocet({ n, on }: { n: number; on: boolean }) {
  return (
    <span aria-hidden className={`rounded-full px-1.5 min-w-[1.25rem] text-center text-[11px] font-semibold tabular-nums ${
      on ? 'bg-white/20 text-white' : 'bg-black/[0.08] text-[#16181A]'}`}>{n}</span>
  );
}

const pilulka = (on: boolean) => `filter-pill tap-target snap-start ${on ? 'seg-on' : 'seg-off glass'}`;

export default function Attendance({ user: _user }: { user: { id?: string | number } }) {
  const t = useT('sprava');
  const zdrojText = (s?: string | null) => s === 'kiosk' ? t('tablet') : s === 'closing' ? t('z uzávěrky') : s === 'self' ? t('sám') : s === 'break' ? t('po pauze') : t('ručně');
  const loc = useLocale();
  const { jazyk } = useJazyk();
  // Akce stránky podle `ma` (před načtením oprávnění a u staršího serveru ANO —
  // rozhoduje server), ne přísné useSmi widgetů: tlačítko se nesmí schovat
  // navždy jen proto, že /api/teams/mine oprávnění nepošle.
  const { ma: smi, nacteno } = useOpravneni();
  const smiUpravit = smi('dochazka.upravit');
  const smiMazat = smi('dochazka.mazat');
  const smiExport = smi('dochazka.exportovat');
  // Trest za pozdní příchod přímo u záznamu (dřív jen ze Souhrnu hodin ve widgetu). Klíč návrhu `pozde:<id záznamu>`
  // jako ve widgetu, takže návrh v Trestech v týmu po udělení zmizí; nabízí se jen do DNI_ZPETNE a u čerstvých
  // příchodů (do DNI_NAVRHU) jen dokud návrh ještě čeká — vyřízený nebo zahozený se znovu nenabídne.
  const smiTrest = smi('tresty.udelit');
  const navrhyTrestu = useNavrhyTrestu(smiTrest);
  const [trest, setTrest] = useState<PredvolbyTrestu | null>(null);
  const vidiMzdy = smi('finance.mzdy');
  // Profil člena jen s tym.profil (přísně, jako widgety a Tým) — jinak by
  // okno profilu skončilo 403.
  const otevriProfil = usePersonProfile();
  const smiProfil = !!otevriProfil && nacteno && smi('tym.profil');
  const symbol = useSymbol();
  const { pro } = usePlan();
  const [upgradeFor, setUpgradeFor] = useState<string | null>(null);
  // Hlášení nástroje (zámek, uložená pravidla) — sdílený Toast; `id` odliší dvě stejná po sobě.
  const [hlaska, setHlaska] = useState<{ text: string; tone: 'ok' | 'bad'; id: number } | null>(null);
  const oznam = useCallback((text: string, tone: 'ok' | 'bad' = 'ok') => setHlaska({ text, tone, id: Date.now() }), []);

  // Období je libovolné rozmezí (rychlé volby i od–do), ne jen 7 / 30 / 90 dní. Server ale umí nejvýš 180 dní zpět,
  // takže se načte od nejstaršího zvoleného dne a záznamy se pak zúží na rozmezí.
  const dnesDen = pragueToday();
  const { obdobi, nastav: nastavObdobi } = useObdobi('dochazka-stranka', obdobiZPresetu('30_dni', dnesDen));
  const rHrube = platneRozmezi(obdobi, dnesDen);
  const nejdrive = dayPlus(dnesDen, -(NEJDALE_DNI - 1));
  const r = { od: rHrube.od < nejdrive ? nejdrive : rHrube.od, do: rHrube.do };
  const dni = pocetDni(r.od, dnesDen);
  zapamatujDniDochazky(dni);
  const data = useDataWidgetu<Data>(`/api/attendance?days=${dni}`, vyberData);
  const entries = useMemo(() => zaznamyVRozmezi(data.data?.entries ?? [], r.od, r.do), [data.data, r.od, r.do]);
  const roster = useMemo(() => data.data?.roster ?? [], [data.data]);
  const zamky = useMemo(() => data.data?.zamky ?? [], [data.data]);
  // Hledání zúží patnáct lidí krát devadesát dní (přes tisíc řádků) na jednoho člověka.
  const [q, setQ] = useState('');
  // Filtr pásem (kolo 8): člověk, pozice, jen k ověření — pamatuje se v prohlížeči.
  const [filtrClovek, setFiltrClovek] = useUlozeno<string>('dochazka-filtr-clovek', '');
  const [filtrPozice, setFiltrPozice] = useUlozeno<string>('dochazka-filtr-pozice', '');
  const [jenKOvereni, setJenKOvereni] = useUlozeno<boolean>('dochazka-filtr-overeni', false);

  // Běžící směny tikají po půl minutě — sekundy v seznamu nikdo nečte a
  // překreslovat tisíc řádků každou vteřinu je zbytečné.
  const [ted, setTed] = useState(() => Date.now());
  const nekdoBezi = entries.some(e => !e.clockOut);
  useEffect(() => {
    if (!nekdoBezi) return;
    const t = setInterval(() => setTed(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [nekdoBezi]);

  const sazby = useMemo(() => sazbyZRosteru(roster), [roster]);
  // Plán proti skutečnosti po záznamech (kolo 7) — počítá se ze všech záznamů období, ne jen
  // z vyhledaných: přestávka (dva záznamy na směnu) se posuzuje jako jedna směna.
  const plany = useMemo(() => odchylkyZaznamu(entries, ted), [entries, ted]);
  // Řádky: směna s pauzami jako jeden kus (kolo 8).
  const radky = useMemo(() => radkyZaznamu(entries, ted), [entries, ted]);
  const priznaky = useCallback((x: Radek) => priznakyRadku(x, plany, ted), [plany, ted]);
  const pozice = useMemo(() => poziceZRosteru(roster), [roster]);
  const lide = useMemo(() => pasLidi(radky, roster), [radky, roster]);
  const pozicePas = useMemo(() => pasPozic(radky, pozice), [radky, pozice]);
  // Uložená volba, kterou období nezná (člověk bez směn v tomhle měsíci), se tiše nepoužije — pilulka by nebyla vidět.
  const clovek = lide.some(l => l.id === filtrClovek) ? filtrClovek : '';
  const poz = pozicePas.some(p => p.id === filtrPozice) ? filtrPozice : '';
  const kOvereniCelkem = useMemo(() => radky.filter(x => kOvereni(priznaky(x))).length, [radky, priznaky]);
  const overeniAktivni = jenKOvereni && kOvereniCelkem > 0;
  // Spropitné do exportu: z uzávěrek, rozpočítané podle hodin na směně (lib/dochazkaPrehled.spropitneZaObdobi) — jen
  // s celými tržbami, jinak by podíl lhal. Stejná adresa jako widgety, takže dotaz se sdílí.
  const vidiDyska = vidiMzdy && smi('finance.trzby') && smi('uzaverky.zobrazit_vse');
  const uzaverky = useDataWidgetu<UzaverkaSpropitne[]>(vidiDyska ? '/api/closings' : null, vyberUzaverky);
  const zobrazene = useMemo(() => {
    const n = q.trim().toLowerCase();
    return filtrujRadky(radky, { clovek, pozice: poz, jenKOvereni: overeniAktivni }, pozice, priznaky, n ? x => obsahuje(x.hlavni.employeeName, n) : undefined);
  }, [radky, q, clovek, poz, overeniAktivni, pozice, priznaky]);
  const filtrAktivni = !!clovek || !!poz || overeniAktivni;
  const souhrn = useMemo(() => souhrnRadku(radky, plany, ted), [radky, plany, ted]);
  const souhrnCloveka = useMemo(() => (clovek ? souhrnRadku(radky.filter(x => String(x.hlavni.employeeId) === clovek), plany, ted) : null), [clovek, radky, plany, ted]);
  // Po dnech podle pražského dne příchodu (API řadí od nejnovějšího).
  const dny = useMemo(() => {
    const m = new Map<string, Radek[]>();
    for (const x of zobrazene) {
      const d = parseDbTime(x.clockIn);
      const k = d ? pragueDayOf(d) : '';
      m.set(k, [...(m.get(k) ?? []), x]);
    }
    return [...m.entries()].map(([den, list]) => ({
      den,
      nazev: den ? new Date(`${den}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }) : t('Bez data'),
      zamek: den ? zamekDne(zamky, den) : null,
      list,
    }));
  }, [zobrazene, loc, t, zamky]);

  // Hláška k uzavřenému období: měsíc jménem („Září je uzavřené…"), jiné rozmezí dny.
  const hlaskaZamku = (z: ZamekObdobi) => {
    const mesic = mesicZamku(z);
    if (mesic) {
      const n = fmtMesic(mesic, { jazyk });
      return t('{mesic} je uzavřené — otevři ho ve Výplatní listině.', { mesic: n.charAt(0).toUpperCase() + n.slice(1) });
    }
    return t('Období {od} – {do} je uzavřené — otevři ho ve Výplatní listině.', { od: fmtDatum(`${z.od}T12:00:00`, { jazyk, styl: 'kratce' }), do: fmtDatum(`${z.do}T12:00:00`, { jazyk, styl: 'kratce' }) });
  };

  // ---- Úprava a ukončení ----
  // Řádek s pauzou: příchod patří první části, odchod poslední; pauza mezi nimi zůstává, jak je.
  const [uprava, setUprava] = useState<{ r: Radek; od: string; do: string; duvod: string; zPlanu?: boolean } | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [chybaUpravy, setChybaUpravy] = useState<string | null>(null);
  // „Ukončit" zapomenutého odchodu nesmí předvyplnit teď: kdo odešel v 16:00 a vedoucí
  // to zavírá v 19:00, dostal by tři hodiny navíc ve mzdě. Stejně jako widgety
  // Právě na směně a Otevřené příchody navrhne plánovaný konec směny; bez plánu
  // (nebo u staršího dne, kam dnešní plán nepatří) teď.
  const otevriUpravu = (x: Radek, ukoncit = false) => {
    setChybaUpravy(null);
    let odchod = doVstupu(x.clockOut);
    let zPlanu = false;
    if (ukoncit) {
      const od = parseDbTime(x.clockIn);
      const clen = roster.find(m => String(m.id) === String(x.hlavni.employeeId));
      const konec = konecSmeny(pragueToday(), clen?.shiftStart, clen?.shiftEnd);
      const n = od ? navrhOdchodu(od, konec, Date.now()) : null;
      odchod = doVstupu(n?.cas ?? new Date());
      zPlanu = !!n?.zPlanu;
    }
    // Důvod předvyplní dosavadní poznámku — kdo ji nechá, nic nezmění; kdo ji smaže, smaže ji.
    const poznamka = x.casti.map(c => String(c.note ?? '').trim()).filter(Boolean).join(' · ');
    setUprava({ r: x, od: doVstupu(x.clockIn), do: odchod, duvod: poznamka, zPlanu });
  };
  const ulozUpravu = async () => {
    if (!uprava) return;
    setUkladam(true); setChybaUpravy(null);
    const patch = (telo: Record<string, unknown>) => fetch('/api/attendance', { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify(telo) }).then(okJson);
    try {
      const prvni = uprava.r.hlavni, posledni = uprava.r.casti[uprava.r.casti.length - 1];
      const od = uprava.od ? new Date(uprava.od).toISOString() : undefined;
      const doD = uprava.do ? new Date(uprava.do).toISOString() : null;
      const note = uprava.duvod.trim();
      if (uprava.r.casti.length === 1) {
        await patch({ id: prvni.id, clockIn: od, clockOut: doD, note });
      } else {
        // Dvě části: příchod a důvod na první, odchod na poslední (PATCH bez clockOut nechá odchod první části být).
        await patch({ id: prvni.id, clockIn: od, note });
        if (uprava.do !== doVstupu(posledni.clockOut)) await patch({ id: posledni.id, clockOut: doD });
      }
      setUprava(null);
      obnovDochazku();
    } catch (err) {
      setChybaUpravy(apiMessage(err, t('Změnu se nepodařilo uložit.')));
    } finally {
      setUkladam(false);
    }
  };

  // ---- Přidání záznamu (někdo se zapomněl odpíchnout úplně) ----
  const [pridat, setPridat] = useState(false);
  const [novy, setNovy] = useState<{ kdo: string; od: string; do: string; duvod: string }>({ kdo: '', od: '', do: '', duvod: '' });
  const [pridavam, setPridavam] = useState(false);
  const [chybaPridani, setChybaPridani] = useState<string | null>(null);
  const ulozNovy = async () => {
    if (!novy.kdo || !novy.od || !novy.do) { setChybaPridani(t('Vyplň člověka i oba časy.')); return; }
    setPridavam(true); setChybaPridani(null);
    try {
      await fetch('/api/attendance', {
        method: 'POST', headers: JSON_HLAVICKA,
        body: JSON.stringify({ employeeId: Number(novy.kdo), clockIn: new Date(novy.od).toISOString(), clockOut: new Date(novy.do).toISOString(), note: novy.duvod.trim() || undefined }),
      }).then(okJson);
      setPridat(false);
      setNovy({ kdo: '', od: '', do: '', duvod: '' });
      obnovDochazku();
    } catch (err) {
      setChybaPridani(apiMessage(err, t('Záznam se nepodařilo přidat.')));
    } finally {
      setPridavam(false);
    }
  };

  // ---- Smazání (potvrzení v okně, ne confirm()) ----
  const [smazat, setSmazat] = useState<Radek | null>(null);
  const [mazu, setMazu] = useState(false);
  const [chybaSmazani, setChybaSmazani] = useState<string | null>(null);
  const potvrdSmazani = async () => {
    if (!smazat) return;
    setMazu(true); setChybaSmazani(null);
    try {
      // Směna s pauzou = víc záznamů; mažou se všechny, od poslední části, ať po chybě nezůstane sirotek bez začátku.
      const ids = [...smazat.casti].reverse().map(c => c.id);
      for (const id of ids) await fetch(`/api/attendance?id=${id}`, { method: 'DELETE' }).then(okJson);
      const smazane = new Set(ids.map(String));
      data.set(d => ({ roster: d?.roster ?? [], entries: (d?.entries ?? []).filter(x => !smazane.has(String(x.id))), adjustments: d?.adjustments ?? [], zamky: d?.zamky ?? [], pravidlaPichani: d?.pravidlaPichani ?? null }));
      setSmazat(null);
      obnovDochazku();
    } catch (err) {
      setChybaSmazani(apiMessage(err, t('Záznam se nepodařilo smazat.')));
    } finally {
      setMazu(false);
    }
  };

  // ---- Pravidla píchání z telefonu (kolo 8) ----
  const [pravidlaOkno, setPravidlaOkno] = useState<PravidlaPichani | null>(null);
  const [ukladamPravidla, setUkladamPravidla] = useState(false);
  const [chybaPravidel, setChybaPravidel] = useState<string | null>(null);
  const [hledamPolohu, setHledamPolohu] = useState(false);
  const otevriPravidla = () => { setChybaPravidel(null); setPravidlaOkno({ ...(data.data?.pravidlaPichani ?? VYCHOZI_PRAVIDLA_PICHANI) }); };
  const pouzitMojiPolohu = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setChybaPravidel(t('Prohlížeč neumí polohu.')); return; }
    setHledamPolohu(true); setChybaPravidel(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setPravidlaOkno(p => (p ? { ...p, lat: Number(pos.coords.latitude.toFixed(6)), lng: Number(pos.coords.longitude.toFixed(6)) } : p));
        setHledamPolohu(false);
        oznam(t('Poloha načtena s přesností {m} m. Nezapomeň uložit.', { m: Math.round(pos.coords.accuracy) }));
      },
      () => { setHledamPolohu(false); setChybaPravidel(t('Polohu se nepodařilo zjistit. Povol ji v prohlížeči a stůj v podniku.')); },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };
  const ulozPravidla = async () => {
    if (!pravidlaOkno) return;
    setUkladamPravidla(true); setChybaPravidel(null);
    try {
      const d = await fetch('/api/attendance', { method: 'PUT', headers: JSON_HLAVICKA, body: JSON.stringify({ pravidlaPichani: pravidlaOkno }) }).then(okJson);
      const ulozena = normalizujPravidlaPichani(d?.pravidlaPichani ?? pravidlaOkno);
      data.set(x => ({ roster: x?.roster ?? [], entries: x?.entries ?? [], adjustments: x?.adjustments ?? [], zamky: x?.zamky ?? [], pravidlaPichani: ulozena }));
      setPravidlaOkno(null);
      oznam(ulozena.zapnuto ? t('Uloženo. Příchod z telefonu dál než {m} m od podniku se označí „mimo podnik".', { m: ulozena.polomerM }) : t('Uloženo. Poloha se při píchání z telefonu neověřuje.'));
    } catch (err) {
      setChybaPravidel(apiMessage(err, t('Pravidla se nepodařilo uložit.')));
    } finally {
      setUkladamPravidla(false);
    }
  };

  const exportCsv = () => {
    if (!pro) { setUpgradeFor('Export CSV'); return; } // i18n-ok (název funkce)
    const dyska = vidiDyska && uzaverky.data ? spropitneZaObdobi(uzaverky.data, entries, Date.now(), r.od, r.do) : null;
    const sDyskem = !!dyska && !dyska.skryto;
    // Export bere, co je vidět: s filtrem na Evu jen Evu (nález: „export CSV jen za něj"), jinak celé období.
    const exportovane = filtrAktivni || q.trim() ? zobrazene.flatMap(x => x.casti) : entries;
    // Plán, odchylka a stopa ruční opravy (kolo 7) stojí hned za Zdrojem: účetní chce vidět, co je z tabletu, co opravené a proč.
    // Pauza (min) a Poloha (kolo 8) za Upravil: pauza u záznamu po ní, poloha jen u příchodu z telefonu.
    const hlava = ['Datum', 'Zaměstnanec', 'Příchod', 'Odchod', 'Odpracováno', 'Zdroj', 'Plán od', 'Plán do', 'Odchylka (min)', 'Poznámka', 'Upravil', 'Pauza (min)', 'Poloha', ...(vidiMzdy ? [`Mzda (${symbol})`] : []), ...(sDyskem ? [`Spropitné podíl (${symbol})`] : [])]; // i18n-ok (CSV pro účetní zůstává česky)
    // Podíl na spropitném je za den a člověka — v CSV ho nese první záznam toho dne, ať se nesčítá dvakrát.
    const dyskoVyplneno = new Set<string>();
    const pauzaPodleId = new Map<string, string>();
    for (const x of radky) if (x.casti.length > 1) pauzaPodleId.set(String(x.casti[x.casti.length - 1].id), csvPauzaMin(x));
    const radkyCsv = exportovane.map(e => {
      const od = parseDbTime(e.clockIn);
      const z = radkyZaznamu([e], Date.now())[0];
      const sazba = sazby.get(String(e.employeeId));
      const klicDne = `${od ? pragueDayOf(od) : ''}|${e.employeeId}`;
      const dysko = sDyskem && !dyskoVyplneno.has(klicDne) ? dyska!.poDnech.get(klicDne) ?? 0 : 0;
      if (sDyskem) dyskoVyplneno.add(klicDne);
      return [
        od ? od.toLocaleDateString('cs-CZ', { timeZone: 'Europe/Prague' }) : '',
        e.employeeName ?? 'Neznámý', // i18n-ok
        dbTimeHM(e.clockIn),
        e.clockOut ? dbTimeHM(e.clockOut) : '',
        hMM(z?.delka ?? 0),
        ZDROJ[e.source ?? ''] ?? 'ručně', // i18n-ok
        ...csvPlanAUprava(e, plany.get(String(e.id))),
        pauzaPodleId.get(String(e.id)) ?? '',
        csvPoloha(e),
        // Stejné pravidlo jako součty (lib/wages): mzda po záznamu, záznam nad 24 h 0.
        ...(vidiMzdy ? [sazba ? String(earnedFor(z?.ms ?? 0, sazba)) : ''] : []),
        ...(sDyskem ? [dysko > 0 ? String(Math.round(dysko)) : ''] : []),
      ];
    });
    // Prémie a srážky jako vlastní řádky (den, člověk, částka ve sloupci Mzda) — účetní je sečte se mzdou.
    const upravy = vidiMzdy ? upravyVRozmezi(data.data?.adjustments ?? [], r.od, r.do).filter(u => !clovek || String(u.userId) === clovek).map(u => {
      const kdo = roster.find(m => String(m.id) === String(u.userId));
      return [
        String(u.day).slice(0, 10).split('-').reverse().map(Number).join('. '), // „12. 10. 2026" bez locale — CSV je pro účetní
        kdo?.name ?? 'Neznámý', '', '', '', // i18n-ok
        `${u.amount > 0 ? 'prémie' : 'srážka'}${u.note ? `: ${u.note}` : ''}`, // i18n-ok
        '', '', '', '', '', '', '',
        String(u.amount),
        ...(sDyskem ? [''] : []),
      ];
    }) : [];
    const csv = [hlava, ...radkyCsv, ...upravy].map(rr => rr.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    const kdo = clovek ? `-${(lide.find(l => l.id === clovek)?.nazev ?? clovek).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')}` : '';
    void ulozSoubor(`dochazka-${r.od}_${r.do}${kdo}.csv`, '﻿' + csv, 'text/csv;charset=utf-8');
  };

  const pocet = zobrazene.length;
  const nazevPozice = (p: { id: string; nazev: string }) => (p.id === BEZ_POZICE ? t('Bez pozice') : p.nazev);
  const nastroj = (
    <Card pad="none" aria-labelledby="dochazka-zaznamy-t">
      <div className="px-5 pt-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="dochazka-zaznamy-t" className="t-card flex items-center gap-2">
            {t('Záznamy docházky')}
            {data.data && (
              <Chip tone="muted" size="sm">{(q.trim() || filtrAktivni) && pocet !== radky.length ? t('{a} z {b}', { a: pocet.toLocaleString(loc), b: radky.length.toLocaleString(loc) }) : pocet.toLocaleString(loc)}</Chip>
            )}
          </h2>
          {souhrn.offline > 0 && (
            <Chip tone="info" size="sm" icon="refresh">{t('{n, plural, one {# píchnutí doručeno} few {# píchnutí doručena} other {# píchnutí doručeno}} po výpadku', { n: souhrn.offline })}</Chip>
          )}
        </div>
        {/* Pás lidí: až od dvou lidí (DESIGN „Filtrovací pás": ukáže se, až když je co filtrovat). Druhý klik ruší. */}
        {lide.length > 1 && (
          <PosuvnyPas ariaLabel={t('Filtr podle lidí')} data="lide">
            <button type="button" aria-pressed={!clovek} onClick={() => setFiltrClovek('')} className={pilulka(!clovek)} data-clovek="">
              <span aria-hidden>{t('Všichni')}</span><Pocet n={radky.length} on={!clovek} />
            </button>
            {lide.map(l => {
              const on = clovek === l.id;
              return (
                <button key={l.id} type="button" aria-pressed={on} onClick={() => setFiltrClovek(prepniHodnotu(clovek, l.id))} data-clovek={l.id}
                  aria-label={`${l.nazev}, ${t('{n, plural, one {# směna} few {# směny} other {# směn}}', { n: l.pocet })}`} title={l.nazev}
                  className={`${pilulka(on)} !pl-1.5`}>
                  <Avatar emoji={l.avatar} name={l.nazev} size="xs" ring={false} className={on ? '!bg-white/20 !text-white' : ''} />
                  <span aria-hidden>{krestni(l.nazev) || l.nazev}</span>
                  <Pocet n={l.pocet} on={on} />
                </button>
              );
            })}
          </PosuvnyPas>
        )}
        {/* Pás pozic (od dvou) a „Jen k ověření" (jen když je co ověřovat). */}
        {(pozicePas.length > 1 || kOvereniCelkem > 0 || jenKOvereni) && (
          <PosuvnyPas ariaLabel={t('Filtr podle pozice a stavu')} data="pozice">
            {pozicePas.length > 1 && pozicePas.map(p => {
              const on = poz === p.id;
              return (
                <button key={p.id} type="button" aria-pressed={on} onClick={() => setFiltrPozice(prepniHodnotu(poz, p.id))} data-pozice={p.id}
                  aria-label={`${nazevPozice(p)}, ${t('{n, plural, one {# směna} few {# směny} other {# směn}}', { n: p.pocet })}`} className={pilulka(on)}>
                  <span aria-hidden>{nazevPozice(p)}</span><Pocet n={p.pocet} on={on} />
                </button>
              );
            })}
            {(kOvereniCelkem > 0 || jenKOvereni) && (
              <button type="button" aria-pressed={overeniAktivni} onClick={() => setJenKOvereni(!jenKOvereni)} data-jen-overeni
                aria-label={`${t('Jen k ověření')}, ${kOvereniCelkem}`} className={pilulka(overeniAktivni)}>
                <Icon name="warning" size={13} className="shrink-0" />
                <span aria-hidden>{t('Jen k ověření')}</span><Pocet n={kOvereniCelkem} on={overeniAktivni} />
              </button>
            )}
          </PosuvnyPas>
        )}
        {/* Souhrn vybraného člověka: co by jinak Martin hledal v Souhrnu hodin. */}
        {souhrnCloveka && (
          <StatRow podleKarty className="pt-1" >
            {/* Pevné mezery: „23 h 59 min" se ve dvou sloupcích na 390 px nesmí zalomit na „23 h 59 / min" — Stat číslo zmenší. */}
            <Stat label={t('Odpracováno')} value={pevne(hodinyMinuty(souhrnCloveka.ms))} note={lide.find(l => l.id === clovek)?.nazev} />
            <Stat label={t('Směny')} value={souhrnCloveka.smen} />
            <Stat label={t('Pozdě')} value={souhrnCloveka.pozde} tone={souhrnCloveka.pozde > 0 ? 'wait' : 'muted'} />
            <Stat label={t('Pauzy')} value={souhrnCloveka.pauzaMs > 0 ? pevne(hodinyMinuty(souhrnCloveka.pauzaMs)) : '—'} />
          </StatRow>
        )}
        {entries.length > 10 && (
          <SearchField value={q} onChange={setQ} storageKey="dochazka" placeholder={t('Hledat člověka…')} ariaLabel={t('Hledat člověka v docházce')} />
        )}
      </div>
      <div className="px-5 pb-3 pt-2">
        {data.loading ? (
          <div className="space-y-2 pb-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.error ? (
          <ErrorState compact title={t('Záznamy se nenačetly')} detail={data.error} onRetry={data.reload} />
        ) : entries.length === 0 ? (
          <p className="t-meta py-4">{t('V tomto období nejsou žádné záznamy docházky.')}</p>
        ) : pocet === 0 ? (
          <p className="t-meta py-4">{overeniAktivni && !q.trim() ? t('Všechno je ověřené — nic tu nečeká.') : t('Nikdo takový za tohle období nic neodpíchl.')}</p>
        ) : dny.map(d => (
          <section key={d.den} aria-label={d.nazev} className="pt-2">
            <p className="t-label cz-sentence pt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{d.nazev}</span>
              {d.zamek && <Chip tone="muted" size="sm" icon="lock">{t('uzavřeno')}</Chip>}
              {/* Hodnocení celé směny toho dne (pochvala i kritika) — jen kdo smí hodnotit. */}
              <span className="ml-auto normal-case"><TlacitkoHodnotitSmenu den={d.den} variant="ghost" size="sm" label={t('Ohodnotit směnu')} /></span>
            </p>
            <ul className="list">
              {d.list.map(x => {
                const e = x.hlavni;
                const pr = priznaky(x);
                const bezi = x.druh === 'bezi' || x.naPauze;
                const zapomenuty = pr.zapomenuty;
                const upraveno = pr.upraveno;
                const cas = `${dbTimeHM(x.clockIn)} – ${x.clockOut ? dbTimeHM(x.clockOut) : '…'}`;
                const kdoUpravil = krestni(x.casti.find(c => c.updatedBy != null && c.updatedBy !== '')?.updatedByName);
                const poznamka = x.casti.map(c => String(c.note ?? '').trim()).filter(Boolean).join(' · ');
                // Meta se na úzkém displeji zkracuje — nejdřív čas, pauza a plán, pak zdroj a kdo upravil.
                // Důvod (poznámka) jde do `detail`, který se zalamuje: věta na 300 znaků by v meta zmizela.
                const meta = [
                  cas,
                  x.naPauze ? t('na pauze od {cas}', { cas: dbTimeHM(x.pauzaOd) }) : x.pauzaMs > 0 ? t('pauza {n} min', { n: Math.round(x.pauzaMs / 60000) }) : null,
                  e.planStart ? t('plán {od}–{do}', { od: fmtHM(e.planStart), do: fmtHM(e.planEnd) }) : null,
                  zdrojText(e.source),
                  pr.upraveno ? (kdoUpravil ? t('upraveno ({kdo})', { kdo: kdoUpravil }) : t('upraveno')) : null,
                ].filter(Boolean).join(' · ');
                const pozde = pr.pozdeMin != null ? t('+{n} min pozdě', { n: pr.pozdeMin }) : null;
                const driv = pr.drivMin != null ? t('odešel o {n} min dřív', { n: pr.drivMin }) : null;
                // Pravý slot: zapomenutý odchod má přednost, pak neukončená pauza, odchylka od plánu (při obojím chip
                // pozdě a v title obojí), pak poznámka ze samoobsluhy k ověření. „Upraveno", pauza, poloha a offline vedle.
                const stav = zapomenuty ? <Chip tone="wait" size="sm" icon="warning">{t('Zapomenutý odchod?')}</Chip>
                  : pr.pauzaBezKonce ? <Chip tone="wait" size="sm" icon="warning">{t('Neukončená pauza')}</Chip>
                  : pozde ? <span title={driv ? `${pozde} · ${driv}` : undefined} className="inline-flex"><Chip tone="wait" size="sm">{pozde}</Chip>{driv && <span className="sr-only">{` · ${driv}`}</span>}</span>
                  : driv ? <Chip tone="wait" size="sm">{driv}</Chip>
                  : (e.note && !upraveno) || pr.poznamka ? <Chip tone="wait" size="sm">{t('Zkontrolovat')}</Chip>
                  : pr.dlouhy ? <Chip tone="wait" size="sm">{t('Nad 24 h')}</Chip> : null;
                const poloha = pr.mimoPodnik ? <Chip tone="wait" size="sm" icon="location">{t('mimo podnik {d}', { d: vzdalenostText(Math.max(...x.casti.map(c => c.geoDistanceM ?? 0)), loc) })}</Chip>
                  : pr.uPodniku ? <Chip tone="muted" size="sm" icon="location">{e.geoDistanceM != null ? t('z telefonu · {d}', { d: vzdalenostText(e.geoDistanceM, loc) }) : t('z telefonu')}</Chip>
                  : pr.bezPolohy ? <Chip tone="muted" size="sm" icon="location">{t('bez polohy')}</Chip> : null;
                const chipy = stav || pr.upraveno || pr.pauza || poloha || pr.offline ? (
                  <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                    {stav}
                    {x.naPauze && !pr.pauzaBezKonce ? <Chip tone="info" size="sm" icon="cup">{t('na pauze')}</Chip> : x.pauzaMs > 0 ? <Chip tone="muted" size="sm" icon="cup">{t('pauza')}</Chip> : null}
                    {poloha}
                    {pr.offline && <span title={t('Píchnuto na tabletu bez internetu — čas je z tabletu.')} className="inline-flex"><Chip tone="info" size="sm">{t('offline')}</Chip></span>}
                    {pr.upraveno && <span title={e.updatedByName ? t('Upravil(a) {kdo}', { kdo: e.updatedByName }) : undefined} className="inline-flex"><Chip tone="muted" size="sm">{t('Upraveno', undefined, 'zaznam')}</Chip></span>}
                  </span>
                ) : null;
                const jmeno = e.employeeName ?? '';
                const denSmeny = (() => { const od = parseDbTime(x.clockIn); return e.planDate && /^\d{4}-\d{2}-\d{2}$/.test(e.planDate) ? e.planDate : od ? pragueDayOf(od) : ''; })();
                const klicPozde = `pozde:${e.id}`;
                const zaPozde: PredvolbyTrestu | null = smiTrest && pr.pozdeMin != null && e.id != null && e.employeeId != null && denSmeny
                  && denSmeny >= posunDni(dnesDen, -DNI_ZPETNE) && denSmeny <= dnesDen
                  && (denSmeny < posunDni(dnesDen, -DNI_NAVRHU) || !!navrhyTrestu.data?.some(n => n.klic === klicPozde))
                  ? { userId: Number(e.employeeId), jmeno, day: denSmeny, sourceKey: klicPozde, druhNavrhu: 'pozde',
                      text: textNavrhu({ druh: 'pozde', minuty: pr.pozdeMin, castka: null, poznamka: null }, String, t) }
                  : null;
                const polozkaTrestu = zaPozde ? { label: t('Dát trest za pozdní příchod'), icon: 'warning', hint: zaPozde.text, onClick: () => setTrest(zaPozde) } : null;
                // Tužka a koš mají na telefonu 44 px (palec), na počítači zůstávají drobné v hustém seznamu.
                // V uzavřeném období místo nich zámek s hláškou, kam jít (server by úpravu stejně odmítl).
                const akce = d.zamek ? (
                  <Button variant="ghost" size="sm" iconOnly icon="lock" className="max-sm:!h-11 max-sm:!w-11" onClick={() => oznam(hlaskaZamku(d.zamek!), 'bad')}
                    aria-label={t('Období je uzavřené: {jmeno}', { jmeno })} title={t('Období je uzavřené')} data-zamek />
                ) : (smiUpravit && smiMazat && !zapomenuty) || (polozkaTrestu && !smiUpravit && !smiMazat) ? (
                  // v4 (V4): úprava a smazání jsou jedno „···" 36 na R — dřív tužka a koš jako dvě holé ikony
                  // na vlastním druhém řádku (prázdný řádek jen kvůli dvěma ikonám u pravé hrany).
                  <Menu size="sm" label={t('Upravit nebo smazat záznam: {jmeno}', { jmeno })} items={[
                    ...(smiUpravit && smiMazat && !zapomenuty ? [
                      { label: t('Upravit čas…'), icon: 'pencil', onClick: () => otevriUpravu(x) },
                      { label: t('Smazat záznam…'), icon: 'trash', danger: true, onClick: () => { setChybaSmazani(null); setSmazat(x); } },
                    ] : []),
                    ...(polozkaTrestu ? [polozkaTrestu] : []),
                  ]} />
                ) : (
                  <>
                    {smiUpravit && (zapomenuty
                      ? <Button variant="secondary" size="sm" className="max-sm:!h-11" onClick={() => otevriUpravu(x, true)} aria-label={t('Ukončit příchod: {jmeno}', { jmeno })}>{t('Ukončit')}</Button>
                      : <Button variant="ghost" size="sm" iconOnly icon="pencil" className="max-sm:!h-11 max-sm:!w-11" onClick={() => otevriUpravu(x)} aria-label={t('Upravit čas: {jmeno}', { jmeno })} />)}
                    {smiMazat && (
                      <Button variant="ghost" size="sm" iconOnly icon="trash" className="max-sm:!h-11 max-sm:!w-11" onClick={() => { setChybaSmazani(null); setSmazat(x); }} aria-label={t('Smazat záznam: {jmeno}', { jmeno })} />
                    )}
                    {polozkaTrestu && (
                      <Button variant="ghost" size="sm" iconOnly icon="warning" className="max-sm:!h-11 max-sm:!w-11" onClick={polozkaTrestu.onClick} aria-label={t('Dát trest za pozdní příchod: {jmeno}', { jmeno })} title={zaPozde?.text} />
                    )}
                  </>
                );
                return (
                  <ListRow key={e.id}
                    lead={<Avatar emoji={e.employeeAvatar} size="sm" />}
                    // Odkaz na profil nese jméno, ne avatar (ten je aria-hidden):
                    // odečítač tak přečte „Profil: Petra", ne jen „Zobrazit profil".
                    // Celý řádek klikací být nemůže — uvnitř jsou Upravit a Smazat.
                    title={smiProfil && otevriProfil ? (
                      <button type="button" onClick={() => otevriProfil(Number(e.employeeId))} aria-label={`Profil: ${e.employeeName ?? t('Neznámý')}`}
                        className="max-w-full truncate text-left rounded-sm hover:underline decoration-black/25 underline-offset-2">
                        {e.employeeName ?? t('Neznámý')}
                      </button>
                    ) : (e.employeeName ?? t('Neznámý'))}
                    meta={meta}
                    detail={poznamka || undefined}
                    value={zapomenuty ? undefined : bezi ? t('běží {cas}', { cas: hodinyMinuty(x.delka) }) : hodinyMinuty(x.delka)}
                    // Chipy na počítači (lg+) ve sloupci pevné šířky `aside` — u každého řádku, i prázdný —
                    // ať hodiny stojí v jedné svislici, i když má jen každý třetí řádek „+12 min pozdě".
                    // Pod lg je doplněk skrytý a chipy jdou do `right`, který ocas zalomí pod jméno. `right`
                    // dostane každý řádek (na lg+ prázdný), jinak by mezera navíc posunula čísla o 12 px.
                    aside={chipy ?? ''}
                    right={chipy ? <span className="lg:hidden">{chipy}</span> : undefined}
                    actions={smiUpravit || smiMazat || polozkaTrestu ? akce : undefined}
                  />
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );

  const menu = [
    ...(smiExport && entries.length > 0 ? [{ label: t('Export CSV'), icon: 'download', onClick: exportCsv }] : []),
    ...(smiUpravit ? [{ label: t('Pravidla píchání'), icon: 'location', hint: t('Píchat z telefonu jen u podniku'), onClick: otevriPravidla }] : []),
  ];
  const polomerVolby = POLOMERY_M.map(m => ({ id: String(m), label: `${m} m` }));

  return (
    <ObdobiStrankyDochazky.Provider value={dni}>
      <PlochaWidgetu
        stranka="vedeni.dochazka"
        hlavicka={{
          title: t('Docházka'),
          subtitle: t('Kdo je na směně, odpracované hodiny a mzdy za období.'),
          hintId: 'attendance',
          primary: smiUpravit ? (
            <Button variant="accent" icon="plus" onClick={() => { setChybaPridani(null); setPridat(true); }}>{t('Přidat záznam')}</Button>
          ) : undefined,
          secondary: smiExport && entries.length > 0 ? <Button variant="secondary" icon="download" onClick={exportCsv}>{t('Export CSV')}</Button> : undefined,
          // Vedlejší akce se na telefonu schovají (DP §3.4) — Export proto i v „···"; Pravidla píchání jsou jen tam.
          menu: menu.length ? menu : undefined,
          aside: (
            <ObdobiLista value={obdobi} onChange={nastavObdobi} dnyTydne={false} hrubost={false}
              volby={['dnes', 'vcera', 'tyden', '7_dni', '30_dni', 'mesic', 'minuly_mesic', '90_dni', '180_dni']} />
          ),
        }}
        nastroj={nastroj}
      />

      {smiTrest && <DatTrest open={!!trest} predvolby={trest} onClose={() => setTrest(null)} />}
      <Toast message={hlaska?.text ?? null} tone={hlaska?.tone} id={hlaska?.id} ms={hlaska?.tone === 'bad' ? 6000 : undefined} onClose={() => setHlaska(null)} />

      {pridat && (
        <Modal open onClose={() => setPridat(false)} size="sm" title={t('Přidat záznam docházky')} subtitle={t('Když se někdo zapomněl odpíchnout úplně.')}
          footer={<>
            <Button variant="secondary" onClick={() => setPridat(false)}>{t('Zrušit')}</Button>
            <Button variant="primary" icon="plus" loading={pridavam} onClick={ulozNovy}>{t('Přidat záznam')}</Button>
          </>}>
          <div className="space-y-3">
            <Field id="dochazka-novy-kdo" label={t('Kdo')}>
              <Select id="dochazka-novy-kdo" value={novy.kdo} onChange={e => setNovy(n => ({ ...n, kdo: e.target.value }))}>
                <option value="">{t('Vyber člověka')}</option>
                {roster.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
              </Select>
            </Field>
            <Field id="dochazka-novy-od" label={t('Příchod')}>
              <Input id="dochazka-novy-od" type="datetime-local" value={novy.od} onChange={e => setNovy(n => ({ ...n, od: e.target.value }))} />
            </Field>
            <Field id="dochazka-novy-do" label={t('Odchod')}>
              <Input id="dochazka-novy-do" type="datetime-local" value={novy.do} onChange={e => setNovy(n => ({ ...n, do: e.target.value }))} />
            </Field>
            <Field id="dochazka-novy-duvod" label={t('Důvod (nepovinné)')} hint={t('Uvidí ho účetní v exportu.')}>
              <Textarea id="dochazka-novy-duvod" rows={2} maxLength={MAX_DUVOD} value={novy.duvod} placeholder={t('Např. zapomněl se odpíchnout')}
                onChange={e => setNovy(n => ({ ...n, duvod: e.target.value }))} />
            </Field>
            {chybaPridani && <p className="note note-danger text-sm" role="alert">{chybaPridani}</p>}
          </div>
        </Modal>
      )}

      {uprava && (
        <Modal open onClose={() => setUprava(null)} size="sm" title={t('Upravit čas na směně')} subtitle={uprava.r.hlavni.employeeName ?? undefined}
          footer={<>
            <Button variant="secondary" onClick={() => setUprava(null)}>{t('Zrušit')}</Button>
            <Button variant="primary" icon="check" loading={ukladam} onClick={ulozUpravu}>{t('Uložit')}</Button>
          </>}>
          <div className="space-y-3">
            <Field id="dochazka-uprava-od" label={t('Příchod')}>
              <Input id="dochazka-uprava-od" type="datetime-local" value={uprava.od} onChange={e => setUprava(u => (u ? { ...u, od: e.target.value } : u))} />
            </Field>
            <Field id="dochazka-uprava-do" label={t('Odchod')} hint={uprava.zPlanu ? t('Předvyplněný je plánovaný konec směny. Uprav ho, jestli odešel jindy.') : t('Prázdné pole = pořád na směně.')}>
              <Input id="dochazka-uprava-do" type="datetime-local" value={uprava.do} onChange={e => setUprava(u => (u ? { ...u, do: e.target.value } : u))} />
            </Field>
            {uprava.r.casti.length > 1 && (
              <p className="t-meta text-pretty">{uprava.r.naPauze
                ? t('Pauza běží od {od} — odchod ji ukončí.', { od: dbTimeHM(uprava.r.pauzaOd) })
                : t('Pauza {od}–{do} ({n} min) zůstane, jak je.', { od: dbTimeHM(uprava.r.casti[0].clockOut), do: dbTimeHM(uprava.r.casti[uprava.r.casti.length - 1].clockIn), n: Math.round(uprava.r.pauzaMs / 60000) })}</p>
            )}
            <Field id="dochazka-uprava-duvod" label={t('Důvod (nepovinné)')} hint={t('Uvidí ho i člověk v oznámení o změně a účetní v exportu.')}>
              <Textarea id="dochazka-uprava-duvod" rows={2} maxLength={MAX_DUVOD} value={uprava.duvod} placeholder={t('Např. zapomněl se odpíchnout')}
                onChange={e => setUprava(u => (u ? { ...u, duvod: e.target.value } : u))} />
            </Field>
            {chybaUpravy && <p className="note note-danger text-sm" role="alert">{chybaUpravy}</p>}
          </div>
        </Modal>
      )}

      {smazat && (
        <Modal open onClose={() => setSmazat(null)} size="sm" title={t('Smazat záznam?')}
          subtitle={`${smazat.hlavni.employeeName ?? t('Neznámý')} · ${dbTimeHM(smazat.clockIn)} – ${smazat.clockOut ? dbTimeHM(smazat.clockOut) : '…'}`}
          footer={<>
            <Button variant="secondary" onClick={() => setSmazat(null)}>{t('Zrušit')}</Button>
            <Button variant="danger-solid" loading={mazu} onClick={potvrdSmazani}>{t('Smazat')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{smazat.casti.length > 1 ? t('Smaže se celá směna i s pauzou. Odpracované hodiny zmizí i ze mzdy. Vrátit to nejde.') : t('Odpracované hodiny ze záznamu zmizí i ze mzdy. Vrátit to nejde.')}</p>
          {chybaSmazani && <p className="note note-danger mt-3" role="alert">{chybaSmazani}</p>}
        </Modal>
      )}

      {pravidlaOkno && (
        <Modal open onClose={() => setPravidlaOkno(null)} size="sm" title={t('Pravidla píchání')} subtitle={t('Příchod z telefonu jen u podniku.')}
          footer={<>
            <Button variant="secondary" onClick={() => setPravidlaOkno(null)}>{t('Zrušit')}</Button>
            <Button variant="primary" icon="check" loading={ukladamPravidla} onClick={ulozPravidla}>{t('Uložit')}</Button>
          </>}>
          <div className="space-y-4">
            <ul className="list">
              <SwitchRow title={t('Píchat z telefonu jen u podniku')} hint={t('Mimo okruh se příchod zapíše s označením „mimo podnik" a vedení dostane upozornění. Tabletu a ručních záznamů se to netýká.')}
                checked={pravidlaOkno.zapnuto} onChange={v => setPravidlaOkno(p => (p ? { ...p, zapnuto: v } : p))} />
            </ul>
            <div className="space-y-1.5">
              <p className="t-label">{t('Poloměr')}</p>
              <Segmented ariaLabel={t('Poloměr')} value={String(pravidlaOkno.polomerM)} options={polomerVolby}
                onChange={id => setPravidlaOkno(p => (p ? { ...p, polomerM: Number(id) as PolomerM } : p))} />
            </div>
            <div className="space-y-2">
              <p className="t-label">{t('Poloha podniku')}</p>
              <p className="t-meta tabular-nums" data-poloha-podniku>
                {pravidlaOkno.lat != null && pravidlaOkno.lng != null ? `${pravidlaOkno.lat}, ${pravidlaOkno.lng}` : t('Zatím nenastavená — stoupni si v podniku a klepni na „Použít moji polohu".')}
              </p>
              <Button variant="secondary" icon="location" loading={hledamPolohu} onClick={pouzitMojiPolohu} block>{t('Použít moji polohu')}</Button>
            </div>
            {chybaPravidel && <p className="note note-danger text-sm" role="alert">{chybaPravidel}</p>}
          </div>
        </Modal>
      )}

      {upgradeFor && <UpgradeModal feature={upgradeFor} onClose={() => setUpgradeFor(null)} />}
    </ObdobiStrankyDochazky.Provider>
  );
}
