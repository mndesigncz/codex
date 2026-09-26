// Převod starého `teams.dashboard_config` na rozložení stránek (kolo 68, spec §1.7).
//
// Do kola 67 si vedení skládalo dva přehledy (svůj a zaměstnanců) editorem
// se šipkami a výsledek leželo v jednom JSON sloupci podniku. Teď má každá
// stránka vlastní řádek v rozlozeni_stranek. Tahle funkce je čistá a má
// testy: jednorázový backfill v /api/init podle ní zapíše výchozí podniku
// a dokud init neproběhne, GET /api/rozlozeni počítá totéž za běhu.
//
// Z lib/dashboardWidgets.ts se sem přesunulo jen to, co převod potřebuje
// (normalizeLayout, readLayout, readShortcuts); starý soubor zmizí s editorem.

import type { IdStranky, PolozkaRozlozeni, Rozsah, Velikost } from './typy.ts';
import { widget } from './katalog/index.ts';
import { idZWidgetu } from './hash.ts';

// ---------------------------------------------------------------------------
// Starý formát (přesunuto z lib/dashboardWidgets.ts)
// ---------------------------------------------------------------------------

/** Pořadí starých widgetů — readLayout podle něj skládal přehled ze samotných příznaků. */
export const STARE_WIDGETY_VEDENI = ['posToday', 'nextEvent', 'guests', 'sharedLink', 'clock', 'kpis', 'onShift', 'rateShifts', 'announcements', 'availability', 'lowStock', 'todayShifts'] as const;
export const STARE_WIDGETY_ZAMESTNANCE = ['nextEvent', 'handover', 'monthly', 'sharedLink', 'clock', 'nextShift', 'feedback', 'stats', 'announcements', 'closing', 'availability', 'lowStock'] as const;

export type LayoutEntry =
  | { type: 'widget'; id: string }
  | { type: 'link'; label: string; target: string; icon?: string };

export interface Shortcut { label: string; target: string; icon?: string }

const jeObjekt = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Jen řetězec, oříznutý; cokoli jiného je prázdné. Config zapisuje klient
 * (PATCH /api/teams) a String() na objektu s `toString: 1` vyhodí —
 * převod by pak shodil GET /api/rozlozeni celému podniku.
 */
const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Widget je zapnutý, dokud ho config výslovně nevypne (`false`). */
export function isWidgetOn(config: Record<string, any> | undefined | null, id: string): boolean {
  return !config || config[id] !== false;
}

export function normalizeShortcuts(raw: any): Shortcut[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s: any) => ({
      label: text(s?.label, 40),
      target: text(s?.target, 80),
      icon: text(s?.icon, 24) || undefined,
    }))
    .filter(s => s.label && s.target)
    .slice(0, 8);
}

export function readShortcuts(config: Record<string, any> | undefined | null): Shortcut[] {
  return normalizeShortcuts(config?.shortcuts);
}

export function normalizeLayout(raw: any): LayoutEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LayoutEntry[] = [];
  for (const e of raw) {
    if (e?.type === 'link') {
      const label = text(e.label, 40);
      const target = text(e.target, 120);
      if (label && target) out.push({ type: 'link', label, target, icon: text(e.icon, 24) || undefined });
    } else {
      // Starý editor ukládal `{type:'widget', id}`, ještě starší config holé id.
      const id = text(typeof e === 'string' ? e : e?.id, 40);
      if (id) out.push({ type: 'widget', id });
    }
  }
  return out.slice(0, 40);
}

/**
 * Rozložení, které starý přehled kreslil: explicitní `layout`, jinak
 * zapnuté widgety ve vestavěném pořadí a za nimi zkratky.
 */
export function readLayout(config: Record<string, any> | undefined | null, poradi: readonly string[]): LayoutEntry[] {
  const explicit = normalizeLayout(config?.layout);
  if (explicit.length) return explicit;
  const entries: LayoutEntry[] = poradi
    .filter(id => isWidgetOn(config, id))
    .map(id => ({ type: 'widget' as const, id }));
  readShortcuts(config).forEach(s => entries.push({ type: 'link', label: s.label, target: s.target, icon: s.icon }));
  return entries;
}

// ---------------------------------------------------------------------------
// Převod na nové widgety
// ---------------------------------------------------------------------------

/** Cíl převodu: samostatný widget (řetězec), nebo dlaždice z rozpadu `kpis`/`stats` s pevnou velikostí. */
type Cil = string | { w: string; s: Velikost };

/**
 * Staré id → nové widgety (katalog: mapovani_puvodnich_id). `kpis` a `stats`
 * se rozpadnou na malé dlaždice. Mapy jsou obyčejné objekty, takže se z nich
 * čte jen přes cileZ() — `layout: ['constructor']` by jinak vrátil funkci
 * z Object.prototype.
 */
export const MAPA_VEDENI: Readonly<Record<string, readonly Cil[]>> = {
  posToday: ['pokladna.dnes'],
  nextEvent: ['akce.nejblizsi'],
  guests: ['klient.hoste_vernost'],
  sharedLink: ['sdileni.pripnuta_nabidka'],
  clock: ['dochazka.moje_pichacky'],
  kpis: [{ w: 'tym.clenove', s: 'S' }, { w: 'rozvrh.dnesni_smeny', s: 'S' }, { w: 'ukoly.dnes', s: 'S' }, { w: 'sklad.dochazi', s: 'S' }],
  onShift: ['dochazka.prave_na_smene'],
  rateShifts: ['hodnoceni.ohodnotit_smeny'],
  announcements: ['oznameni.nastenka'],
  availability: ['rozvrh.dostupnost_tymu'],
  lowStock: ['sklad.dochazi'],
  todayShifts: ['rozvrh.dnesni_smeny'],
};

export const MAPA_ZAMESTNANCE: Readonly<Record<string, readonly Cil[]>> = {
  nextEvent: ['akce.nejblizsi'],
  handover: ['uzaverky.predavka'],
  monthly: ['moje.tento_mesic'],
  sharedLink: ['sdileni.pripnuta_nabidka'],
  clock: ['dochazka.moje_pichacky'],
  nextShift: ['moje.nejblizsi_smena'],
  feedback: ['moje.zpetna_vazba'],
  stats: [{ w: 'ukoly.dnes', s: 'S' }, { w: 'chat.neprectene', s: 'S' }, { w: 'dochazka.moje_odpracovano', s: 'S' }],
  announcements: ['oznameni.nastenka'],
  closing: ['uzaverky.moje_uzaverka'],
  availability: ['rozvrh.pripominka_dostupnosti'],
  lowStock: ['sklad.dochazi'],
};

/**
 * Co dnes stálo natvrdo mimo rozložení, přijde na začátek, aby se nic
 * neposunulo: vedení mělo nad přehledem „Čeká na tvoje rozhodnutí" a první
 * kroky, zaměstnanec frontu objednávek od stolu a výrobu.
 */
export const NATVRDO_VEDENI: readonly { w: string; s: Velikost }[] = [{ w: 'prehled.ceka_na_tebe', s: 'L' }, { w: 'prehled.prvni_kroky', s: 'L' }];
export const NATVRDO_ZAMESTNANCE: readonly { w: string; s: Velikost }[] = [{ w: 'klient.objednavky_od_stolu', s: 'M' }, { w: 'vyroba.k_vyrobe', s: 'L' }];

const CASTI = [
  { klic: 'employer', stranka: 'vedeni.prehled', rozsah: 'typ:vedeni', poradi: STARE_WIDGETY_VEDENI, mapa: MAPA_VEDENI, natvrdo: NATVRDO_VEDENI },
  { klic: 'employee', stranka: 'zamestnanec.domu', rozsah: 'typ:zamestnanec', poradi: STARE_WIDGETY_ZAMESTNANCE, mapa: MAPA_ZAMESTNANCE, natvrdo: NATVRDO_ZAMESTNANCE },
] as const;

/** Cíle starého id jen z vlastních klíčů mapy; neznámé id (i „toString", „__proto__") nic. */
function cileZ(mapa: Readonly<Record<string, readonly Cil[]>>, id: string): readonly Cil[] {
  return Object.prototype.hasOwnProperty.call(mapa, id) ? mapa[id] : [];
}

/**
 * Stojí část configu za převod? Jen když ji vedení opravdu měnilo:
 * explicitní `layout`, nějaký vypnutý widget nebo zkratky. Kdo nic neměnil,
 * dostane nové výchozí z kódu, ne kopii starého přehledu.
 */
export function stojiZaPrevod(cast: unknown, poradi: readonly string[]): boolean {
  if (!jeObjekt(cast)) return false;
  return normalizeLayout(cast.layout).length > 0
    || poradi.some(id => cast[id] === false)
    || normalizeShortcuts(cast.shortcuts).length > 0;
}

/** Jedna část configu (employer / employee) → položky. Může vyhodit; volá ji jen zDashboardConfig. */
function prevedCast(c: Record<string, any>, cast: (typeof CASTI)[number]): PolozkaRozlozeni[] {
  const polozky: PolozkaRozlozeni[] = [];
  const pocty = new Map<string, number>();
  const pridej = (w: string, s?: Velikost, nastaveni?: Record<string, unknown>) => {
    const n = (pocty.get(w) ?? 0) + 1;
    pocty.set(w, n);
    polozky.push({ id: idZWidgetu(w, n), widget: w, velikost: s ?? widget(w)?.vychoziVelikost ?? 'M', ...(nastaveni ? { nastaveni } : {}) });
  };
  const zaznamy = readLayout(c, cast.poradi);
  // Widgety, které část má i jako samostatný blok (lowStock → sklad.dochazi,
  // todayShifts → rozvrh.dnesni_smeny). Starý přehled kreslil dlaždici
  // v `kpis` i seznam zvlášť, nový widget je na stránce jen jednou —
  // a kdyby vyhrála dlaždice z `kpis` (stojí dřív), normalizace by seznam
  // zahodila a vedení by přišlo o „Nízké zásoby" a „Dnešní směny".
  const samostatne = new Set<string>();
  for (const z of zaznamy) {
    if (z.type === 'widget') for (const cil of cileZ(cast.mapa, z.id)) if (typeof cil === 'string') samostatne.add(cil);
  }
  for (const p of cast.natvrdo) pridej(p.w, p.s);
  for (const z of zaznamy) {
    if (z.type === 'link') {
      pridej('odkaz', undefined, { cil: z.target, popisek: z.label, ...(z.icon ? { ikona: z.icon } : {}) });
      continue;
    }
    for (const cil of cileZ(cast.mapa, z.id)) {
      if (typeof cil === 'string') pridej(cil);
      else if (!samostatne.has(cil.w)) pridej(cil.w, cil.s);
    }
  }
  return polozky;
}

/** Popis výjimky do logu — ani ten nesmí vyhodit (výjimka nemusí být Error). */
function popisChyby(e: unknown): string {
  try { return String((e as Error)?.message ?? e).slice(0, 120); } catch { return 'neznámá chyba'; }
}

export interface VolbyPrevodu {
  /** Převést jen část pro tuhle stránku (GET počítá jen stránku, na kterou se divák dívá). */
  stranka?: IdStranky;
  /** Sem se zapíše, co se převést nepovedlo (init to zaloguje); vadná část se přeskočí. */
  chyby?: string[];
}

/**
 * `teams.dashboard_config` → výchozí rozložení podniku `[stránka, rozsah, položky]`.
 * Pořadí se zachová, vypnuté widgety se vynechají, odkazy a zkratky se
 * stanou widgetem `odkaz`. Tým s příznakem `migrovano68` už převedený je —
 * vrací se nic, aby se smazané výchozí při dalším initu nevrátilo.
 * Výstup ještě projde normalizací (duplicity, velikosti, limity).
 *
 * Nikdy nevyhodí. Config zapisuje klient, takže v něm může být cokoli;
 * výjimka by shodila GET, PUT i DELETE /api/rozlozeni obou aktivních
 * stránek všem členům podniku a init by tým nikdy neoznačil. Část, kterou
 * nejde převést, se přeskočí (a zapíše do `chyby`), druhá část platí dál.
 */
export function zDashboardConfig(cfg: unknown, volby: VolbyPrevodu = {}): [IdStranky, Rozsah, PolozkaRozlozeni[]][] {
  const out: [IdStranky, Rozsah, PolozkaRozlozeni[]][] = [];
  try {
    if (!jeObjekt(cfg) || cfg.migrovano68) return out;
  } catch (e) {
    volby.chyby?.push(`config: ${popisChyby(e)}`);
    return out;
  }
  for (const cast of CASTI) {
    if (volby.stranka && volby.stranka !== cast.stranka) continue;
    try {
      const c = cfg[cast.klic];
      if (!stojiZaPrevod(c, cast.poradi)) continue;
      out.push([cast.stranka, cast.rozsah, prevedCast(c, cast)]);
    } catch (e) {
      volby.chyby?.push(`${cast.klic}: ${popisChyby(e)}`);
    }
  }
  return out;
}
