// Zákaznické menu — to, co visí na iPadu před podnikem a co si host otevře
// v mobilu přes QR. Na rozdíl od share odkazů (/s/[token]) má menu ceny,
// vlastní pořadí a stav „vyprodáno“, který se během akce mění.
//
// Stránka /menu-akce.html si data tahá z /api/menu/public/[slug]. Když API
// nedosáhne (výpadek wifi na akci), použije to, co má zadrátované v sobě —
// proto tady drží i výchozí obsah.

export interface MenuItem {
  id: number;
  name: string;
  /** V celých korunách. */
  price: number;
  description: string | null;
  soldOut: boolean;
  /** Vazba na produkt v pokladně, když položka přišla odtamtud. */
  posProductId: string | null;
  position: number;
}

export interface MenuSection {
  id: number;
  title: string;
  /** 1 = levý sloupec, 2 = pravý. Na výšku a na mobilu se stejně poskládají pod sebe. */
  column: 1 | 2;
  position: number;
  items: MenuItem[];
}

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
  sections: MenuSection[];
  updatedAt?: string;
}

export const MAX_NAME = 80;
export const MAX_DESC = 200;
/** Nad tuhle cenu to skoro jistě není cena, ale překlep. */
export const MAX_PRICE = 100000;

export function cleanText(raw: any, max: number): string {
  return String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function cleanPrice(raw: any): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, MAX_PRICE);
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
  wifiSsid: 'Pangea',
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
    }))
    .sort((a, b) => a.position - b.position || a.id - b.id);

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
    sections,
    updatedAt: boardRow.updated_at ?? undefined,
  };
}

/** Tvar, který čte statická stránka — bez interních id navíc a bez PINu. */
export function publicShape(board: MenuBoard) {
  return {
    slug: board.slug,
    eyebrow: board.eyebrow,
    title: board.title,
    mena: board.currency,
    poznamka: board.note,
    wifi: board.wifiSsid ? { sit: board.wifiSsid, heslo: board.wifiPassword ?? '' } : null,
    sekce: board.sections.map(s => ({
      nadpis: s.title,
      sloupec: s.column,
      polozky: s.items.map(i => ({
        id: i.id,
        name: i.name,
        price: i.price,
        desc: i.description ?? undefined,
        vyprodano: i.soldOut,
      })),
    })),
    updatedAt: board.updatedAt ?? null,
  };
}
