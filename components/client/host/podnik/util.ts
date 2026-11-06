// Drobné pomůcky stránky podniku (směr A): krátká podoba jména na obálku, město z adresy,
// odkazy na mapu a telefon. Nic se tu nepřekládá — jde o data podniku.

/** Obecná slova na začátku jména, která na obálce nejsou potřeba („Kavárna U Lípy“ → „U Lípy“). */
const DRUHY = /^(kavárna|kavarna|café|cafe|caffè|kaffeehaus|kawiarnia|bistro|bistró|bar|restaurace|restaurant|restauracja|reštaurácia|kaviareň|hospoda|pivnice|pivovar|čajovna|cukrárna|pekárna|vinárna|bufet|jídelna|herna)\s+/i; // generic-ok: druhy podniků se z názvu odřezávají, nejde o text

export function kratkyNazev(nazev: string): string {
  const jmeno = String(nazev ?? '').trim();
  const kratke = jmeno.replace(DRUHY, '').trim();
  // Jen když po odříznutí něco zbude a není to jedno písmeno.
  return kratke.length >= 2 ? kratke : jmeno;
}

/** „Lipová 12, Brno“ → „Brno“ (poslední část adresy bez PSČ). */
export function mestoZAdresy(adresa: string | null | undefined): string {
  const casti = String(adresa ?? '').split(',').map(s => s.trim()).filter(Boolean);
  if (casti.length < 2) return '';
  return casti[casti.length - 1].replace(/^\d{3}\s?\d{2}\s*/, '').trim();
}

export function mapaOdkaz(nazev: string, adresa: string | null | undefined): string | null {
  return adresa ? `https://mapy.cz/zakladni?q=${encodeURIComponent(`${nazev}, ${adresa}`)}` : null;
}

export function telOdkaz(tel: string | null | undefined): string | null {
  return tel ? `tel:${String(tel).replace(/\s/g, '')}` : null;
}

/** Uložené podniky jsou pohodlí jednoho prohlížeče (localStorage), ne data účtu. */
const KLIC = 'managero-ulozene-podniky';
export function ulozenePodniky(): string[] {
  try { const x = JSON.parse(window.localStorage.getItem(KLIC) ?? '[]'); return Array.isArray(x) ? x.map(String) : []; } catch { return []; }
}
export function nastavUlozeny(slug: string, ulozit: boolean): void {
  try {
    const s = new Set(ulozenePodniky());
    if (ulozit) s.add(slug); else s.delete(slug);
    window.localStorage.setItem(KLIC, JSON.stringify([...s]));
  } catch { /* soukromé okno: uložení vydrží jen do obnovení */ }
}
