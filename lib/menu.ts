// Zákaznické menu — to, co visí na iPadu před podnikem a co si host otevře
// v mobilu přes QR. Na rozdíl od share odkazů (/s/[token]) má menu ceny,
// vlastní pořadí a stav „vyprodáno“, který se během akce mění.
//
// Stránka /menu-akce.html si data tahá z /api/menu/public/[slug]. Když API
// nedosáhne (výpadek wifi na akci), použije to, co má zadrátované v sobě —
// proto tady drží i výchozí obsah.

import { cenaMenu } from './cena.ts';
import { JAZYKY, VYCHOZI, cistyJazyk, LOCALE_PRO_JAZYK, type Jazyk } from './i18n/config.ts';
import { cistiAlergeny, cistiStitky, ALERGENY, STITKY } from './alergeny.ts';
import { normalizeCurrency, currencySymbol } from './money.ts';

/** Překlady jednoho textového objektu: jazyk → pole. Výchozí jazyk lístku se sem neukládá, je v samotném poli. */
export type Preklady<K extends string> = Partial<Record<Jazyk, Partial<Record<K, string>>>>;

/** Jazyky lístku: výchozí (jeho texty jsou v polích) a ty, které host smí zvolit. */
export interface JazykyListku {
  vychozi: Jazyk;
  nabizet: Jazyk[];
}

export interface MenuItem {
  id: number;
  name: string;
  /** V jednotkách měny, s haléři (4,50 €) — dřív celé koruny. */
  price: number;
  description: string | null;
  soldOut: boolean;
  /** Vazba na produkt v pokladně, když položka přišla odtamtud. */
  posProductId: string | null;
  position: number;
  /** Kódy alergenů 1–14 (EU 1169/2011). Prázdné = nevyplněno, NE „bez alergenů". */
  allergens: number[];
  /** Štítky: vegan, bez-lepku… Nejsou právní tvrzení. */
  tags: string[];
  /** Překlad jména a popisu; nikdy nemění cenu ani stav vyprodáno. */
  i18n: Preklady<'name' | 'description'>;
}

export interface MenuSection {
  id: number;
  title: string;
  /** 1 = levý sloupec, 2 = pravý. Na výšku a na mobilu se stejně poskládají pod sebe. */
  column: 1 | 2;
  position: number;
  items: MenuItem[];
  i18n: Preklady<'title'>;
}

import { normalizeMenuTheme, type MenuTheme } from './menuTheme.ts';

export interface MenuBoard {
  id: number;
  slug: string;
  name: string;
  eyebrow: string | null;
  title: string | null;
  note: string | null;
  wifiSsid: string | null;
  wifiPassword: string | null;
  currency: string;
  enabled: boolean;
  /** Jen informace pro administraci, samotný PIN se ven nikdy neposílá. */
  hasPin?: boolean;
  theme: MenuTheme;
  sections: MenuSection[];
  updatedAt?: string;
  /** Jazyky lístku; bez nich (sloupec ještě není) nabízí lístek jen češtinu. */
  langs: JazykyListku;
  i18n: Preklady<'eyebrow' | 'title' | 'note'>;
}

export const MAX_NAME = 80;
export const MAX_DESC = 200;
/** Nad tuhle cenu to skoro jistě není cena, ale překlep. */
export const MAX_PRICE = 100000;

export function cleanText(raw: any, max: number): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Cena položky menu s haléři: 4,50 € zůstane 4,50 (dřív Math.round → 5 a
 * v editoru se z „4,50" po vyhození nečíslic stalo 450). Sloupec ještě
 * nemusí být NUMERIC — před zápisem se ještě hlídá lib/cenaSloupce.
 */
export function cleanPrice(raw: any): number {
  return cenaMenu(raw, MAX_PRICE);
}

/** Slug do URL: /menu-akce.html?menu=<slug> a /api/menu/public/<slug>. */
export function cleanSlug(raw: any): string {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function cleanColumn(raw: any): 1 | 2 {
  return Number(raw) === 2 ? 2 : 1;
}

/** PIN pro iPad: čtyři až osm číslic, jinak nic. */
export function cleanPin(raw: any): string | null {
  const v = String(raw ?? '').trim();
  return /^\d{4,8}$/.test(v) ? v : null;
}

// ---------------------------------------------------------------------------
// Jazyky lístku (kolo 76)

/** Výchozí: jen čeština, tedy dnešní chování (pilulka jazyka se nekreslí). */
export const VYCHOZI_JAZYKY: JazykyListku = { vychozi: VYCHOZI, nabizet: [VYCHOZI] };

/**
 * `{"vychozi":"cs","nabizet":["cs","en"]}` z databáze nebo z těla požadavku.
 * Neplatné jazyky pryč, výchozí jazyk je vždy mezi nabízenými a první.
 */
export function cleanLangs(raw: unknown): JazykyListku {
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return { ...VYCHOZI_JAZYKY, nabizet: [...VYCHOZI_JAZYKY.nabizet] }; } }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...VYCHOZI_JAZYKY, nabizet: [...VYCHOZI_JAZYKY.nabizet] };
  const o = v as Record<string, unknown>;
  const vychozi = cistyJazyk(o.vychozi) ?? VYCHOZI;
  const dalsi = (Array.isArray(o.nabizet) ? o.nabizet : [])
    .map(x => cistyJazyk(x))
    .filter((x): x is Jazyk => !!x && x !== vychozi);
  // Pořadí jako v JAZYKY, ať se pilulka nepřeskládává podle toho, co kdo kdy zaškrtl.
  const nabizet = [vychozi, ...JAZYKY.filter(j => j !== vychozi && dalsi.includes(j))];
  return { vychozi, nabizet };
}

/**
 * Překlady z těla požadavku nebo z databáze: jen povolené jazyky a jen
 * vyjmenovaná pole, každé oříznuté na strop. Prázdné pole se nezapisuje
 * (prázdné = „použije se výchozí text"). Jazyk `vychozi` se zahodí, jeho text je
 * v samotném poli. Nikdy nepřijme nic jiného než text, takže překlad nemůže
 * změnit cenu, stav ani strukturu.
 */
export function cleanI18n<K extends string>(raw: unknown, pole: readonly K[], max: Record<K, number>, vychozi: Jazyk = VYCHOZI): Preklady<K> {
  let v: unknown = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return {}; } }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const out: Preklady<K> = {};
  for (const j of JAZYKY) {
    if (j === vychozi) continue;
    const zdroj = (v as Record<string, unknown>)[j];
    if (!zdroj || typeof zdroj !== 'object' || Array.isArray(zdroj)) continue;
    const cil: Partial<Record<K, string>> = {};
    for (const k of pole) {
      const t = cleanText((zdroj as Record<string, unknown>)[k], max[k]);
      if (t) cil[k] = t;
    }
    if (Object.keys(cil).length) out[j] = cil;
  }
  return out;
}

export const POLE_DESKY = ['eyebrow', 'title', 'note'] as const;
export const POLE_SEKCE = ['title'] as const;
export const POLE_POLOZKY = ['name', 'description'] as const;
export const MAX_DESKA_I18N = { eyebrow: MAX_NAME, title: MAX_NAME, note: MAX_DESC } as const;
export const MAX_SEKCE_I18N = { title: MAX_NAME } as const;
export const MAX_POLOZKA_I18N = { name: MAX_NAME, description: MAX_DESC } as const;

/** Sloupec pole (SMALLINT[] / TEXT[]) z databáze: pole, nebo textový zápis `{1,2}`. */
function poleZDb(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.startsWith('{') && raw.endsWith('}')) {
    const vnitrek = raw.slice(1, -1).trim();
    return vnitrek ? vnitrek.split(',').map(x => x.trim().replace(/^"|"$/g, '')) : [];
  }
  return [];
}

/**
 * Jazyk, ve kterém se lístek ukáže: požadovaný, když ho lístek nabízí, jinak
 * výchozí jazyk lístku. Neznámý kód (`?lang=xx`) není chyba, jen se ignoruje.
 */
export function zvolenyJazyk(langs: JazykyListku, pozadovany: unknown): Jazyk {
  const j = cistyJazyk(pozadovany);
  return j && langs.nabizet.includes(j) ? j : langs.vychozi;
}

/** Text v jazyce, s návratem na výchozí. Prázdný překlad = výchozí text. */
function vJazyce<K extends string>(vychozi: string | null, preklady: Preklady<K>, jazyk: Jazyk, langs: JazykyListku, pole: K): string | null {
  if (jazyk === langs.vychozi) return vychozi;
  return preklady[jazyk]?.[pole] || vychozi;
}

export const DEFAULT_CURRENCY = 'Kč';

/**
 * Výchozí obsah pro nově založené menu — přesně to, co dneska visí na iPadu,
 * aby po zapnutí administrace nikdo nemusel nic přepisovat.
 */
export const SEED_BOARD = {
  slug: 'akce',
  name: 'Venkovní akce',
  eyebrow: 'Venkovní akce',
  title: 'Speciální nabídka',
  note: '*Alergeny a složení na vyžádání u obsluhy',
  wifiSsid: 'WiFi podniku',
  wifiPassword: 'heslojeheslo',
  sections: [
    {
      title: 'Nápoje', column: 1 as const,
      items: [
        { name: 'Teplý čaj dle nabídky', price: 49 },
        { name: 'Ledový Tuareg', price: 69 },
        { name: 'Ledový ibišek', price: 69 },
        { name: 'Masala na ledu', price: 69 },
        { name: 'Masala Libre', price: 129 },
        { name: 'Virgin Masala Libre', price: 99 },
        { name: 'Gin tonic / pink', price: 119 },
      ],
    },
    {
      title: 'Jídlo', column: 2 as const,
      items: [
        { name: 'Masová bagetka s trhaným masem', price: 79 },
        { name: 'Vege bagetka se sýrem labneh', price: 79 },
        { name: 'Full plate', price: 139, description: 'Od každého trošku — salát, maso, humus, prostě všechno!' },
      ],
    },
    {
      title: 'Dýmky', column: 2 as const,
      items: [{ name: 'Dýmka', price: 350 }],
    },
  ],
};

/**
 * Výchozí poznámka pod lístkem v jazycích. Přeloží se jen tehdy, když je poznámka
 * přesně ta výchozí ze založení lístku; vlastní text podniku se nepřekládá sám
 * (ten překládá podnik v editoru). Německy „Sie“: text o alergenech a složení je
 * právně citlivý, proto formální oslovení (plán vícejazyčnosti §4.3).
 */
export const POZNAMKA_VYCHOZI: Record<Jazyk, string> = {
  cs: SEED_BOARD.note,
  en: '*Allergens and ingredients on request from our staff',
  de: '*Allergene und Zutaten auf Anfrage beim Service',
  sk: '*Alergény a zloženie na požiadanie u obsluhy',
  pl: '*Alergeny i skład na życzenie u obsługi',
};

/** Věta pod lístkem, jakmile má aspoň jedna položka vyplněné alergeny. Právně citlivé: před spuštěním země ověřit. */
export const POZNAMKA_ALERGENY: Record<Jazyk, string> = {
  cs: 'Alergeny jsou uvedeny u položek. Ptejte se obsluhy na složení a možnou křížovou kontaminaci.',
  en: 'Allergens are listed next to each item. Please ask our staff about ingredients and possible cross-contamination.',
  de: 'Die Allergene sind bei den Artikeln angegeben. Fragen Sie das Servicepersonal nach Zutaten und möglicher Kreuzkontamination.',
  sk: 'Alergény sú uvedené pri položkách. Na zloženie a možnú krížovú kontamináciu sa spýtajte obsluhy.',
  pl: 'Alergeny podano przy pozycjach. Prosimy zapytać obsługę o skład i możliwe zanieczyszczenie krzyżowe.',
};

/** Řádky z databáze → tvar, který čte stránka menu. */
export function buildBoard(boardRow: any, sectionRows: any[], itemRows: any[]): MenuBoard {
  const bySection = new Map<number, MenuItem[]>();
  for (const r of itemRows) {
    const sid = Number(r.section_id);
    if (!bySection.has(sid)) bySection.set(sid, []);
    bySection.get(sid)!.push({
      id: Number(r.id),
      name: String(r.name),
      price: cleanPrice(r.price),
      description: r.description ? String(r.description) : null,
      soldOut: r.sold_out === true,
      posProductId: r.pos_product_id ? String(r.pos_product_id) : null,
      position: Number(r.position ?? 0),
      // Nové sloupce (kolo 76) mohou chybět (před /api/init): pak prázdné, tedy dnešní chování.
      allergens: cistiAlergeny(poleZDb(r.allergens)),
      tags: cistiStitky(poleZDb(r.tags)),
      i18n: cleanI18n(r.i18n, POLE_POLOZKY, MAX_POLOZKA_I18N),
    });
  }
  for (const list of Array.from(bySection.values())) {
    list.sort((a, b) => a.position - b.position || a.id - b.id);
  }

  const sections: MenuSection[] = sectionRows
    .map((r: any) => ({
      id: Number(r.id),
      title: String(r.title),
      column: cleanColumn(r.column_no),
      position: Number(r.position ?? 0),
      items: bySection.get(Number(r.id)) ?? [],
      i18n: cleanI18n(r.i18n, POLE_SEKCE, MAX_SEKCE_I18N),
    }))
    .sort((a, b) => a.position - b.position || a.id - b.id);

  const langs = cleanLangs(boardRow.langs);
  // Překlady desky i jednotlivých částí se čistí proti výchozímu jazyku lístku, ne proti češtině.
  const cistit = <K extends string>(raw: unknown, pole: readonly K[], max: Record<K, number>) => cleanI18n(raw, pole, max, langs.vychozi);
  for (const sec of sections) {
    sec.i18n = cistit(sectionRows.find((r: any) => Number(r.id) === sec.id)?.i18n, POLE_SEKCE, MAX_SEKCE_I18N);
    for (const it of sec.items) {
      const r = itemRows.find((x: any) => Number(x.id) === it.id);
      it.i18n = cistit(r?.i18n, POLE_POLOZKY, MAX_POLOZKA_I18N);
    }
  }
  return {
    id: Number(boardRow.id),
    slug: String(boardRow.slug),
    name: String(boardRow.name),
    eyebrow: boardRow.eyebrow ?? null,
    title: boardRow.title ?? null,
    note: boardRow.note ?? null,
    wifiSsid: boardRow.wifi_ssid ?? null,
    wifiPassword: boardRow.wifi_password ?? null,
    currency: boardRow.currency || DEFAULT_CURRENCY,
    enabled: boardRow.enabled !== false,
    hasPin: !!boardRow.pin_hash,
    theme: normalizeMenuTheme(boardRow.theme),
    sections,
    updatedAt: boardRow.updated_at ?? undefined,
    langs,
    i18n: cistit(boardRow.i18n, POLE_DESKY, MAX_DESKA_I18N),
  };
}

/**
 * Měna lístku: z podniku, ne z desky. Sloupec `menu_boards.currency` má výchozí
 * „Kč“ a editor žádné pole pro měnu nemá, takže „Kč“ u eurové kavárny není volba,
 * ale výchozí hodnota z databáze (host eurové kavárny dřív viděl koruny). Platí proto:
 * deska s jinou měnou než českou korunou (zadaná výslovně) vyhrává, jinak se vezme
 * měna podniku, a bez ní se dosavadní hodnota desky.
 */
export function menaListku(menaDesky: string | null | undefined, menaPodniku?: string | null): string {
  const deska = normalizeCurrency(menaDesky);
  if (deska !== 'CZK') return deska;
  return menaPodniku ? normalizeCurrency(menaPodniku) : deska;
}

/**
 * Nový stav překladů po zápisu jednoho pole. Prázdný text pole odebere (prázdné =
 * „použije se výchozí text“), prázdný jazyk odebere celý. Nemění vstup.
 */
export function nastavPreklad<K extends string>(preklady: Preklady<K> | undefined, jazyk: Jazyk, pole: K, text: string): Preklady<K> {
  const novy: Preklady<K> = { ...(preklady ?? {}) };
  const cil = { ...(novy[jazyk] ?? {}) } as Partial<Record<K, string>>;
  if (text.trim()) cil[pole] = text; else delete cil[pole];
  if (Object.keys(cil).length) novy[jazyk] = cil; else delete novy[jazyk];
  return novy;
}

/** Kolik názvů (deska, sekce, položky) nemá překlad do jazyka. Pro počítadlo „12 bez překladu“ v editoru. */
export function chybiPreklad(deska: { title: string | null; i18n?: Preklady<'eyebrow' | 'title' | 'note'>; sections: { title: string; i18n?: Preklady<'title'>; items: { name: string; i18n?: Preklady<'name' | 'description'> }[] }[] }, jazyk: Jazyk): number {
  let n = 0;
  if (deska.title && !deska.i18n?.[jazyk]?.title) n++;
  for (const s of deska.sections) {
    if (s.title && !s.i18n?.[jazyk]?.title) n++;
    for (const i of s.items) if (i.name && !i.i18n?.[jazyk]?.name) n++;
  }
  return n;
}

/** Desetinná místa měny pro zobrazení cen: koruny a forinty bez haléřů, ostatní se dvěma. */
export function desetinyMeny(menaKod: string): 0 | 2 {
  return menaKod === 'CZK' || menaKod === 'HUF' ? 0 : 2;
}

/**
 * Tvar, který čte statická stránka: bez interních id navíc a bez PINu.
 *
 * Veškerá logika jazyků a alergenů sedí TADY, na serveru: stránka lístku je
 * statická a musí přežít výpadek sítě, takže jen kreslí, co dostala. Jazyk je
 * součástí adresy API (`?lang=`), takže service worker i cache mají pro každý
 * jazyk vlastní záznam. Chybějící překlad padá na výchozí text a NIKDY nemění
 * cenu ani stav vyprodáno.
 *
 * @param lang požadovaný jazyk (neznámý nebo nenabízený = výchozí jazyk lístku)
 * @param opts.locale locale pro ceny (z nastavení podniku); bez něj podle jazyka lístku
 * @param opts.currency měna podniku (viz menaListku)
 */
export function publicShape(board: MenuBoard, lang?: unknown, opts: { locale?: string; currency?: string } = {}) {
  const jazyk = zvolenyJazyk(board.langs, lang);
  const v = board.langs.vychozi;
  const menaKod = menaListku(board.currency, opts.currency);

  const vsechnyPolozky = board.sections.flatMap(s => s.items);
  const maAlergeny = vsechnyPolozky.some(i => i.allergens.length > 0);
  // Některé položky alergeny mají, jiné ne: prázdné pole neznamená „bez alergenů", jen „nevyplněno".
  const neuplne = maAlergeny && vsechnyPolozky.some(i => i.allergens.length === 0);

  const pouzite = Array.from(new Set(vsechnyPolozky.flatMap(i => i.allergens))).sort((a, b) => a - b);
  const pouziteStitky = Array.from(new Set(vsechnyPolozky.flatMap(i => i.tags)));

  const jeVychoziPoznamka = !board.note || board.note === SEED_BOARD.note;
  const vlastniPoznamka = board.i18n[jazyk]?.note;
  // Výchozí poznámku nahradí věta o alergenech, jakmile je u položek vyplňují;
  // vlastní text podniku zůstává (a věta o alergenech jde zvlášť).
  let poznamka: string | null;
  if (jazyk !== v && vlastniPoznamka) poznamka = vlastniPoznamka;
  else if (board.note && jeVychoziPoznamka) poznamka = maAlergeny ? null : POZNAMKA_VYCHOZI[jazyk];
  else poznamka = board.note;

  return {
    slug: board.slug,
    eyebrow: vJazyce(board.eyebrow, board.i18n, jazyk, board.langs, 'eyebrow'),
    title: vJazyce(board.title, board.i18n, jazyk, board.langs, 'title'),
    // Text měny pro starší stránky z cache (nová stránka počítá ze `menaKod`); odvozený z měny, ne z desky.
    mena: currencySymbol(menaKod, opts.locale || LOCALE_PRO_JAZYK[v]),
    menaKod,
    // Peníze podle podniku (stejně pro všechny hosty), ne podle jazyka hosta.
    locale: opts.locale || LOCALE_PRO_JAZYK[v],
    desetiny: desetinyMeny(menaKod),
    jazyky: { vychozi: v, nabizet: board.langs.nabizet, zvoleny: jazyk },
    poznamka,
    alergenyPoznamka: maAlergeny ? POZNAMKA_ALERGENY[jazyk] : null,
    alergenyNeuplne: neuplne,
    alergenyNazvy: Object.fromEntries(pouzite.map(k => [k, (ALERGENY as any)[k]?.[jazyk] ?? (ALERGENY as any)[k]?.cs ?? ''])),
    stitkyNazvy: Object.fromEntries(pouziteStitky.map(k => [k, (STITKY as any)[k]?.[jazyk] ?? (STITKY as any)[k]?.cs ?? k])),
    wifi: board.wifiSsid ? { sit: board.wifiSsid, heslo: board.wifiPassword ?? '' } : null,
    vzhled: board.theme,
    sekce: board.sections.map(s => ({
      nadpis: vJazyce(s.title, s.i18n, jazyk, board.langs, 'title') ?? s.title,
      sloupec: s.column,
      polozky: s.items.map(i => ({
        id: i.id,
        name: vJazyce(i.name, i.i18n, jazyk, board.langs, 'name') ?? i.name,
        // Cena i vyprodáno jsou vždy z položky, nikdy z překladu.
        price: i.price,
        desc: vJazyce(i.description, i.i18n, jazyk, board.langs, 'description') ?? undefined,
        vyprodano: i.soldOut,
        ...(i.allergens.length ? { alergeny: i.allergens } : {}),
        ...(i.tags.length ? { stitky: i.tags } : {}),
      })),
    })),
    updatedAt: board.updatedAt ?? null,
  };
}
