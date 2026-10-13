// Obsah návodu: fotky v textu (kolo 7). Čistá logika bez Reactu, ať ji hlídají testy
// (scripts/testy/k83-postupy.ts) a ať editor (vložení) i čtečka (vykreslení) mluví
// o téže syntaxi.
//
// Fotka je samostatný řádek `![popis](/api/upload/<id>)` — stejný zápis jako Markdown,
// takže ho lidé znají, a schéma se nemění (obsah zůstává text). Vykreslí se JEN adresa
// z našeho úložiště (/api/upload/…, servírované po přihlášení a jen členům podniku):
// cizí doména nebo sledovací pixel v interním návodu zůstane obyčejným textem.

/** Řádek fotky: celý řádek, popis bez `]`, adresa jen /api/upload/<id>. */
const RADEK_FOTKY = /^!\[([^\]\n]*)\]\((\/api\/upload\/[A-Za-z0-9_-]+)\)$/;

export const MAX_POPIS_FOTKY = 80;

export interface FotkaVNavodu { popis: string; url: string }

/** Je řádek (po oříznutí mezer) fotka z našeho úložiště? Jinak null — řádek je text. */
export function radekFotky(radek: string): FotkaVNavodu | null {
  const m = RADEK_FOTKY.exec(String(radek ?? '').trim());
  if (!m) return null;
  return { popis: m[1].trim(), url: m[2] };
}

/** Popis bez znaků, které by rozbily zápis (`[`, `]`, závorky, zalomení), nejvýš 80 znaků. */
export function cistyPopis(popis: string): string {
  return String(popis ?? '').replace(/[[\]()\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_POPIS_FOTKY);
}

/** Popis fotky z názvu souboru: bez přípony (IMG_2041.jpg → IMG_2041), uživatel ho pak přepíše. */
export function popisZNazvuSouboru(nazev: string): string {
  return cistyPopis(String(nazev ?? '').replace(/\.[A-Za-z0-9]{1,5}$/, ''));
}

/** Zápis řádku fotky; null, když adresa není z našeho úložiště. */
export function zapisFotky(popis: string, url: string): string | null {
  const radek = `![${cistyPopis(popis)}](${url})`;
  return radekFotky(radek) ? radek : null;
}

/**
 * Vloží řádek fotky na pozici kurzoru jako samostatný řádek: stojí-li kurzor uprostřed
 * řádku, doplní se zalomení před fotku i za ni (jinak by `![…](…)` uprostřed věty
 * zůstalo textem). Vrací nový text a pozici kurzoru hned za vloženým řádkem.
 */
export function vlozFotku(text: string, pozice: number, radek: string): { text: string; kurzor: number } {
  const t = String(text ?? '');
  const p = Math.max(0, Math.min(Number.isFinite(pozice) ? pozice : t.length, t.length));
  const pred = t.slice(0, p);
  const po = t.slice(p);
  const zacatek = pred.length === 0 || pred.endsWith('\n') ? '' : '\n';
  const konec = po.length === 0 ? '' : po.startsWith('\n') ? '' : '\n';
  const vlozeno = `${zacatek}${radek}${konec}`;
  return { text: pred + vlozeno + po, kurzor: pred.length + zacatek.length + radek.length };
}
