// Přizpůsobení navigace aplikace: co podnik skryje, přejmenuje a přeuspořádá.
//
// Jedno místo, čistá logika, bez Reactu (běží i v `npm test`). Oba layouty
// (vedení, zaměstnanec) z něj berou výchozí seznam pohledů i výsledek skládání,
// takže pravidlo není ve dvou kopiích.
//
// PRAVIDLA, která se nesmějí rozbít:
//  1. Oprávnění a tarif rozhodují JAKO PRVNÍ. Pohled, na který role nemá právo,
//     není v nabídce nikdy, ať `nav_config` říká cokoli (`smiPohled`).
//  2. Skrytí je jen PREFERENCE, ne bezpečnostní vrstva. Skrytý pohled zůstává
//     dostupný přes odkaz (?view=), widget i oznámení; layout v tom případě
//     ukáže štítek „Skrytá sekce". `BezOpravneni` se ukazuje jen při chybějícím právu.
//  3. Nejde skrýt Přehled (`NEUKRYVATELNE`): člověk by neměl kam se vrátit.
//  4. Skrytí neodebírá oprávnění ani widgety na ploše.
//  5. Neznámé id (uložené starší verzí aplikace) se tiše ignoruje.
//  6. Bez `nav_config` (null, sloupec ještě není) je výsledek přesně dnešní navigace.
//
// Přejmenování je OBSAH PODNIKU, jako názvy rolí: mapa jazyk → text. Chybí-li text
// pro jazyk uživatele, ukáže se přeložený VÝCHOZÍ název, ne text v jiném jazyce
// (Němec uvidí „Kassenabschluss", ne českou „Denní odvod" z nastavení českého majitele).

import { cistyJazyk, type Jazyk } from './i18n/config.ts';

export type Rozhrani = 'vedeni' | 'zamestnanec';

export interface PolozkaNav { id: string; label: string; icon: string; short?: string }
export interface SekceNav { id: string; title: string | null; items: PolozkaNav[] }

interface VychoziSekce { id: string; title: string | null; ids: string[] }
interface VychoziNav { polozky: PolozkaNav[]; sekce: VychoziSekce[]; dok: string[] }

/** Česky; kontext `nav` ve slovníku (`Sklad|nav`), protože „Sklad" jinde znamená i jiné věci. */
export const VYCHOZI_NAV: Record<Rozhrani, VychoziNav> = {
  vedeni: {
    polozky: [
      { id: 'overview', label: 'Přehled', icon: 'overview' },
      { id: 'shifts', label: 'Rozvrh', icon: 'calendar' },
      { id: 'inventory', label: 'Sklad', icon: 'box' },
      { id: 'recipes', label: 'Receptury', icon: 'clipboard' },
      { id: 'procedures', label: 'Postupy', icon: 'clipboard' },
      { id: 'tasks', label: 'Úkoly', icon: 'check' },
      { id: 'chat', label: 'Chat', icon: 'chat' },
      { id: 'guides', label: 'Návody', icon: 'book' },
      { id: 'planning', label: 'Plánování', icon: 'kanban' },
      { id: 'reports', label: 'Uzávěrky', icon: 'bon' },
      { id: 'finance', label: 'Finance', icon: 'coins' },
      { id: 'suggestions', label: 'Nápady', icon: 'bulb' },
      { id: 'attendance', label: 'Docházka', icon: 'clock' },
      { id: 'my-shifts', label: 'Moje směny', icon: 'swap' },
      { id: 'rewards', label: 'Odměny', icon: 'award' },
    ],
    sekce: [
      { id: 'prehled', title: null, ids: ['overview'] },
      { id: 'smeny', title: 'Směny', ids: ['shifts', 'my-shifts', 'attendance'] },
      { id: 'kasa', title: 'Kasa & sklad', ids: ['reports', 'finance', 'inventory', 'recipes'] },
      { id: 'prace', title: 'Práce', ids: ['tasks', 'procedures', 'planning'] },
      { id: 'tym', title: 'Tým', ids: ['rewards', 'chat', 'guides', 'suggestions'] },
    ],
    dok: ['overview', 'shifts', 'inventory', 'chat'],
  },
  zamestnanec: {
    polozky: [
      { id: 'home', label: 'Přehled', icon: 'overview' },
      { id: 'my-shifts', label: 'Moje směny', icon: 'calendar', short: 'Směny' },
      { id: 'procedures', label: 'Postupy', icon: 'clipboard' },
      { id: 'availability', label: 'Dostupnost', icon: 'swap' },
      { id: 'inventory', label: 'Sklad', icon: 'box' },
      { id: 'closing', label: 'Uzávěrka', icon: 'bon' },
      { id: 'tasks', label: 'Úkoly', icon: 'check' },
      { id: 'rewards', label: 'Odměny', icon: 'award' },
      { id: 'chat', label: 'Chat', icon: 'chat' },
      { id: 'guides', label: 'Návody', icon: 'book' },
      { id: 'suggestions', label: 'Nápady', icon: 'bulb' },
    ],
    sekce: [
      { id: 'prehled', title: null, ids: ['home'] },
      { id: 'smeny', title: 'Směny', ids: ['my-shifts', 'availability'] },
      { id: 'prace', title: 'Práce', ids: ['closing', 'inventory', 'tasks', 'procedures'] },
      { id: 'tym', title: 'Tým', ids: ['rewards', 'chat', 'guides', 'suggestions'] },
    ],
    dok: ['home', 'my-shifts', 'inventory', 'chat'],
  },
};

/** Vždy vidět: bez Přehledu by člověk neměl kam se vrátit. */
export const NEUKRYVATELNE: Record<Rozhrani, readonly string[]> = { vedeni: ['overview'], zamestnanec: ['home'] };
export const MAX_DOK = 4;
const MAX_NAZEV = 30;
const MAX_SEKCI = 8;

/** Všechny české texty navigace (štítky i nadpisy skupin), pro kontrolu slovníků. */
export const NAV_TEXTY: string[] = Array.from(new Set(
  (Object.values(VYCHOZI_NAV) as VychoziNav[]).flatMap(n => [
    ...n.polozky.map(p => p.label),
    ...n.polozky.flatMap(p => (p.short ? [p.short] : [])),
    ...n.sekce.flatMap(s => (s.title ? [s.title] : [])),
  ]),
));

// ---------------------------------------------------------------------------
// Uložená konfigurace

type JazykovaMapa = Record<string, string>;

export interface NavSekceKonfig { id: string; nazev: JazykovaMapa | null; ids: string[] }
export interface NavRozhraniKonfig {
  skryte: string[];
  /** Pořadí spodního docku (max. 4); null = výchozí. */
  dok: string[] | null;
  /** Vlastní skupiny a jejich pořadí; null = výchozí skupiny. */
  sekce: NavSekceKonfig[] | null;
  prejmenovat: Record<string, JazykovaMapa>;
}
export interface NavKonfig { v: 1; vedeni: NavRozhraniKonfig; zamestnanec: NavRozhraniKonfig }

export const PRAZDNE_ROZHRANI: NavRozhraniKonfig = { skryte: [], dok: null, sekce: null, prejmenovat: {} };

const idsRozhrani = (r: Rozhrani) => new Set(VYCHOZI_NAV[r].polozky.map(p => p.id));

function cistiText(v: unknown, max: number): string {
  // Řídicí znaky pryč (nový řádek v názvu položky nabídky nemá smysl), mezery sloučit.
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cistaMapa(raw: unknown, max: number): JazykovaMapa | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: JazykovaMapa = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const j = cistyJazyk(k);
    const t = cistiText(v, max);
    if (j && t) out[j] = t;
  }
  return Object.keys(out).length ? out : null;
}

function cistaRozhrani(raw: unknown, r: Rozhrani): NavRozhraniKonfig {
  const zname = idsRozhrani(r);
  const o = (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const jenZnama = (v: unknown, strop: number): string[] => {
    const out: string[] = [];
    if (Array.isArray(v)) for (const x of v) if (typeof x === 'string' && zname.has(x) && !out.includes(x)) out.push(x);
    return out.slice(0, strop);
  };
  const skryte = jenZnama(o.skryte, 50).filter(id => !NEUKRYVATELNE[r].includes(id));
  const dok = Array.isArray(o.dok) ? jenZnama(o.dok, MAX_DOK) : null;
  let sekce: NavSekceKonfig[] | null = null;
  if (Array.isArray(o.sekce)) {
    const videne = new Set<string>();
    const tmp: NavSekceKonfig[] = [];
    for (const s of o.sekce.slice(0, MAX_SEKCI)) {
      if (!s || typeof s !== 'object') continue;
      const id = cistiText((s as any).id, 24).toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (!id || tmp.some(t => t.id === id)) continue;
      // Položka patří nejvýš jedné skupině (první vyhrává).
      const ids = jenZnama((s as any).ids, 40).filter(x => !videne.has(x));
      ids.forEach(x => videne.add(x));
      tmp.push({ id, nazev: cistaMapa((s as any).nazev, MAX_NAZEV), ids });
    }
    sekce = tmp.length ? tmp : null;
  }
  const prejmenovat: Record<string, JazykovaMapa> = {};
  if (o.prejmenovat && typeof o.prejmenovat === 'object' && !Array.isArray(o.prejmenovat)) {
    for (const [id, mapa] of Object.entries(o.prejmenovat as Record<string, unknown>)) {
      if (!zname.has(id)) continue;
      const m = cistaMapa(mapa, MAX_NAZEV);
      if (m) prejmenovat[id] = m;
    }
  }
  return { skryte, dok, sekce, prejmenovat };
}

/**
 * Cokoli z databáze nebo z těla požadavku → bezpečná konfigurace, nebo null
 * (nic nenastaveno = výchozí navigace). Nikdy nevyhazuje; neznámá id zahazuje.
 */
export function normalizujNavKonfig(raw: unknown): NavKonfig | null {
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const k: NavKonfig = { v: 1, vedeni: cistaRozhrani(o.vedeni, 'vedeni'), zamestnanec: cistaRozhrani(o.zamestnanec, 'zamestnanec') };
  return jeVychoziKonfig(k) ? null : k;
}

export function jeVychoziRozhrani(r: NavRozhraniKonfig | null | undefined): boolean {
  return !r || (r.skryte.length === 0 && r.dok === null && r.sekce === null && Object.keys(r.prejmenovat).length === 0);
}

export function jeVychoziKonfig(k: NavKonfig | null | undefined): boolean {
  return !k || (jeVychoziRozhrani(k.vedeni) && jeVychoziRozhrani(k.zamestnanec));
}

// ---------------------------------------------------------------------------
// Skládání

export interface SlozenaNavigace {
  sekce: SekceNav[];
  dok: PolozkaNav[];
  /** Všechny viditelné položky v pořadí skupin. */
  vse: PolozkaNav[];
  /** Položky, na které člověk má právo, ale podnik je skryl (pro štítek „Skrytá sekce"). */
  skryte: PolozkaNav[];
}

export interface SlozArg {
  rozhrani: Rozhrani;
  /** Oprávnění a tarif. Rozhoduje první: co sem neprojde, není v nabídce vůbec. */
  smiPohled: (id: string) => boolean;
  nastaveni?: NavKonfig | null;
  jazyk: Jazyk;
  /** Přeložený výchozí název (štítek položky nebo nadpis skupiny); bez něj česky. */
  nazev?: (cs: string) => string;
}

export function slozNavigaci({ rozhrani, smiPohled, nastaveni, jazyk, nazev }: SlozArg): SlozenaNavigace {
  const vych = VYCHOZI_NAV[rozhrani];
  const kfg = nastaveni ? (rozhrani === 'vedeni' ? nastaveni.vedeni : nastaveni.zamestnanec) : null;
  const preloz = nazev ?? ((cs: string) => cs);
  const nezkryte = NEUKRYVATELNE[rozhrani];

  // 1. Oprávnění (a tarif) jako první.
  const povolene = vych.polozky.filter(p => smiPohled(p.id));
  // 2. Skrytí: jen preference, přehled nejde skrýt.
  const skrytaId = new Set((kfg?.skryte ?? []).filter(id => !nezkryte.includes(id)));
  const videne = povolene.filter(p => !skrytaId.has(p.id));
  const videneId = new Set(videne.map(p => p.id));
  const popis = new Map(vych.polozky.map(p => [p.id, p]));

  // 3. Přejmenování; jazyk uživatele, jinak přeložený výchozí název.
  const hotova = (p: PolozkaNav): PolozkaNav => {
    const vlastni = kfg?.prejmenovat[p.id]?.[jazyk];
    const label = vlastni || preloz(p.label);
    return { ...p, label, ...(p.short ? { short: vlastni ? undefined : preloz(p.short) } : {}) };
  };

  // 4. Skupiny: vlastní (z nastavení) nebo výchozí. Položka, kterou vlastní skupiny
  //    nezmiňují (přibyla po uložení), se vrátí do své výchozí skupiny, jinak na konec.
  const zdroj: { id: string; title: string | null; nazev: JazykovaMapa | null; ids: string[] }[] =
    kfg?.sekce ? kfg.sekce.map(s => ({ id: s.id, title: vychoziTitul(vych.sekce, s.id), nazev: s.nazev, ids: [...s.ids] }))
               : vych.sekce.map(s => ({ id: s.id, title: s.title, nazev: null, ids: [...s.ids] }));
  if (kfg?.sekce) {
    const umistene = new Set(zdroj.flatMap(s => s.ids));
    for (const p of vych.polozky) {
      if (umistene.has(p.id)) continue;
      const vychozi = vych.sekce.find(s => s.ids.includes(p.id));
      const cil = (vychozi && zdroj.find(s => s.id === vychozi.id)) ?? zdroj[zdroj.length - 1];
      if (cil) cil.ids.push(p.id); else zdroj.push({ id: vychozi?.id ?? 'dalsi', title: vychozi?.title ?? null, nazev: null, ids: [p.id] });
    }
  }
  const sekce: SekceNav[] = zdroj
    .map(s => ({
      id: s.id,
      title: s.nazev?.[jazyk] ?? (s.title ? preloz(s.title) : null),
      items: s.ids.filter(id => videneId.has(id)).map(id => hotova(popis.get(id)!)),
    }))
    .filter(s => s.items.length > 0);

  // 5. Dok. Bez konfigurace přesně dnešní chování (výchozí čtyři, co člověk smí).
  //    S konfigurací se chybějící místa (skrytý pohled) doplní z výchozích, a pak z ostatních.
  let dokIds = (kfg?.dok ?? vych.dok).filter((id, i, a) => videneId.has(id) && a.indexOf(id) === i).slice(0, MAX_DOK);
  if (kfg && !jeVychoziRozhrani(kfg)) {
    for (const id of [...vych.dok, ...vych.polozky.map(p => p.id)]) {
      if (dokIds.length >= MAX_DOK) break;
      if (videneId.has(id) && !dokIds.includes(id)) dokIds.push(id);
    }
  }
  dokIds = dokIds.slice(0, MAX_DOK);

  const vse = sekce.flatMap(s => s.items);
  const dok = dokIds.map(id => vse.find(p => p.id === id)).filter((p): p is PolozkaNav => !!p);
  const skryte = povolene.filter(p => skrytaId.has(p.id)).map(hotova);
  return { sekce, dok, vse, skryte };
}

function vychoziTitul(sekce: VychoziSekce[], id: string): string | null {
  return sekce.find(s => s.id === id)?.title ?? null;
}
