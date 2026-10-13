// Poděkování mezi kolegy (kolo 8, balík R8-3) — čistá logika pro okno „Poděkovat",
// Zeď díků a POST /api/rewards/awards s kind 'kolega'.
//
// Bonusly: každý má měsíční „giveable allowance", který se 1. dne obnoví a nevyužitý
// propadne; body od kolegů se počítají do zůstatku jako každé jiné; zpráva nese hodnotu
// podniku jako #hashtag. Tady: příspěvek a hodnoty nastaví vedení v Odměny › Nastavení
// (teams.points_config.mesicniPrispevek a .hodnoty — vedle sazebníku, bez nového sloupce),
// výchozí 50 b a #ochota #čistota #tým #host; 0 = poděkování vypnuté. Sám sobě poslat nejde.

export const VYCHOZI_PRISPEVEK = 50;
export const MAX_PRISPEVEK = 1000;
export const VYCHOZI_HODNOTY = ['ochota', 'čistota', 'tým', 'host'];
export const MAX_HODNOT = 8;
export const MAX_DELKA_HODNOTY = 24;
/** Kolik bodů jde poslat jedním poděkováním. */
export const BODY_DIKU = [5, 10, 20] as const;
export const MAX_VETA_DIKU = 140;

export interface NastaveniDiku {
  /** Kolik bodů může každý za měsíc rozdat; 0 = vypnuto. */
  prispevek: number;
  /** Hodnoty podniku bez „#" (ochota, tým…); prázdné = bez hodnot. */
  hodnoty: string[];
}

const cisteHodnoty = (v: unknown): string[] => {
  const seznam = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[,;\n]/) : [];
  const out: string[] = [];
  for (const x of seznam) {
    const h = String(x ?? '').trim().replace(/^#+/, '').trim().slice(0, MAX_DELKA_HODNOTY);
    if (h && !out.some(o => o.toLowerCase() === h.toLowerCase())) out.push(h);
    if (out.length >= MAX_HODNOT) break;
  }
  return out;
};

/** Nastavení poděkování ze surového points_config (chybí = výchozí 50 b a čtyři hodnoty). */
export function nastaveniDiku(raw: unknown): NastaveniDiku {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const p = r.mesicniPrispevek;
  const prispevek = p === undefined || p === null || p === '' ? VYCHOZI_PRISPEVEK
    : Number.isFinite(Number(p)) ? Math.max(0, Math.min(MAX_PRISPEVEK, Math.round(Number(p)))) : VYCHOZI_PRISPEVEK;
  const hodnoty = r.hodnoty === undefined ? [...VYCHOZI_HODNOTY] : cisteHodnoty(r.hodnoty);
  return { prispevek, hodnoty };
}

/** První den měsíce „RRRR-MM-01" — od kdy se počítá rozdané (příspěvek se 1. dne obnoví). */
export function zacatekMesice(dnes: string): string {
  return `${dnes.slice(0, 7)}-01`;
}

/** Kolik bodů zbývá rozdat (nikdy pod nulu). */
export function zbyvaRozdat(prispevek: number, rozdano: number): number {
  return Math.max(0, prispevek - Math.max(0, rozdano));
}

export interface Dik {
  od: number;
  komu: number;
  body: number;
  hodnota?: string | null;
  veta?: string | null;
}

/**
 * Smí poděkování odejít? Vrací vyčištěné pole, nebo česky, proč ne (hláška jde do odpovědi 400).
 * `rozdano` = body, které odesílatel tento měsíc už rozdal.
 */
export function overDik(d: Dik, n: NastaveniDiku, rozdano: number):
  { ok: true; body: number; hodnota: string | null; veta: string | null } | { ok: false; chyba: string } {
  if (n.prispevek <= 0) return { ok: false, chyba: 'Poděkování mezi kolegy je v tomhle podniku vypnuté.' };
  if (!Number.isFinite(d.komu) || d.komu <= 0) return { ok: false, chyba: 'Chybí, komu děkuješ.' };
  if (d.komu === d.od) return { ok: false, chyba: 'Sám sobě poděkovat nejde.' };
  const body = Math.round(Number(d.body));
  if (!(BODY_DIKU as readonly number[]).includes(body)) return { ok: false, chyba: `Body musí být ${BODY_DIKU.join(', ')}.` };
  const zbyva = zbyvaRozdat(n.prispevek, rozdano);
  if (body > zbyva) return { ok: false, chyba: zbyva > 0 ? `Tento měsíc můžeš rozdat už jen ${zbyva} b.` : 'Tento měsíc už máš rozdáno — příspěvek se obnoví 1. dne.' };
  const h = String(d.hodnota ?? '').trim().replace(/^#+/, '');
  const hodnota = h ? n.hodnoty.find(x => x.toLowerCase() === h.toLowerCase()) ?? null : null;
  if (h && !hodnota) return { ok: false, chyba: 'Tuhle hodnotu podnik nemá.' };
  const veta = String(d.veta ?? '').trim().slice(0, MAX_VETA_DIKU) || null;
  return { ok: true, body, hodnota, veta };
}

export interface RadekZdi {
  id: number;
  komu: number;
  jmeno: string;
  avatar: string | null;
  od: string | null;
  body: number;
  hodnota: string | null;
  veta: string | null;
  kdy: string;
}

/** Odpověď GET /api/rewards/awards?zed=1 ve tvaru, který Zeď díků kreslí; nečekaný tvar je chyba. */
export function vyberZed(raw: any): { diky: RadekZdi[]; prispevek: { mesicni: number; zbyva: number } | null; hodnoty: string[]; kolegove: { id: number; jmeno: string; avatar: string | null }[] } {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.awards)) throw new Error('Zeď díků přišla v nečekaném tvaru.');
  return {
    diky: raw.awards.map((a: any) => ({
      id: Number(a.id), komu: Number(a.userId), jmeno: String(a.name ?? ''), avatar: a.avatar ?? null, od: a.givenBy ?? null,
      body: Number(a.points) || 0, hodnota: a.valueTag ?? null, veta: a.reason ?? null, kdy: String(a.createdAt ?? ''),
    })),
    prispevek: raw.prispevek && typeof raw.prispevek === 'object' ? { mesicni: Number(raw.prispevek.mesicni) || 0, zbyva: Number(raw.prispevek.zbyva) || 0 } : null,
    hodnoty: Array.isArray(raw.hodnoty) ? raw.hodnoty.map(String) : [],
    kolegove: Array.isArray(raw.kolegove) ? raw.kolegove.map((k: any) => ({ id: Number(k.id), jmeno: String(k.name ?? ''), avatar: k.avatar ?? null })) : [],
  };
}
