// „Stáhnout moje data" (Nastavení → Data a soukromí): sestavení souboru z vlastních dat člověka.
//
// Čistý modul (testy: scripts/testy/k79-nastaveni.ts). Dotazy do databáze jsou v
// app/api/account/export/route.ts a všechny jsou omezené na `me.id` (vlastní směny, docházka,
// žádosti o volno, dostupnost a VLASTNÍ zprávy); co napsali jiní, v souboru není.
// Sem se z databáze nikdy nedostane hash hesla ani tokeny: profil prochází bílou listinou polí.

/** Pole profilu, která smí do souboru. Cokoli jiného (hash hesla, tokeny, interní příznaky) se zahodí. */
export const POLE_PROFILU = ['id', 'name', 'email', 'avatar', 'phone', 'job_title', 'shift_preference', 'theme', 'role', 'created_at'] as const;

export interface SekceExportu {
  ucet: Record<string, unknown> | null;
  nastaveni: Record<string, unknown> | null;
  clenstvi: Record<string, unknown>[] | null;
  smeny: Record<string, unknown>[] | null;
  dochazka: Record<string, unknown>[] | null;
  volno: Record<string, unknown>[] | null;
  dostupnost: Record<string, unknown>[] | null;
  zpravy: Record<string, unknown>[] | null;
}

export const VERZE_EXPORTU = 1;

/** Sestaví dokument. Sekce, kterou se nepodařilo načíst (tabulka ještě není), je v `nedostupne`, ne tiše prázdná. */
export function sestavExport(sekce: SekceExportu, vytvoreno: Date = new Date(), strop: number | null = null) {
  const ucet = sekce.ucet
    ? Object.fromEntries(POLE_PROFILU.filter(k => k in sekce.ucet!).map(k => [k, sekce.ucet![k]]))
    : null;
  const nedostupne = (Object.keys(sekce) as (keyof SekceExportu)[]).filter(k => sekce[k] === null);
  // Sekce, která narazila na strop řádků: soubor jinak vypadá úplný, přestože je ořezaný (GDPR export nesmí mlčet).
  const oriznute = strop === null ? [] : (Object.keys(sekce) as (keyof SekceExportu)[]).filter(k => { const v = sekce[k]; return Array.isArray(v) && v.length >= strop; });
  return {
    aplikace: 'Managero',
    verze: VERZE_EXPORTU,
    vytvoreno: vytvoreno.toISOString(),
    poznamka: 'Jen tvoje vlastní data: profil, nastavení, tvoje směny, docházka, žádosti o volno, dostupnost a zprávy, které jsi napsal(a). Zprávy ostatních a data podniku v souboru nejsou.',
    ucet,
    nastaveni: sekce.nastaveni,
    clenstvi: sekce.clenstvi ?? [],
    smeny: sekce.smeny ?? [],
    dochazka: sekce.dochazka ?? [],
    volno: sekce.volno ?? [],
    dostupnost: sekce.dostupnost ?? [],
    zpravy: sekce.zpravy ?? [],
    nedostupne,
    oriznute,
  };
}

/** Název souboru: managero-moje-data-RRRR-MM-DD.json */
export function nazevExportu(vytvoreno: Date = new Date()): string {
  return `managero-moje-data-${vytvoreno.toISOString().slice(0, 10)}.json`;
}

/**
 * Čitelný popis prohlížeče z adresy push odběru (host push služby je stabilní, cesta ne).
 * Vrací jen skupinu, ne adresu: endpoint je přístupový údaj a do odpovědi nepatří.
 */
export function druhZarizeniZEndpointu(endpoint: unknown): 'chrome' | 'firefox' | 'safari' | 'edge' | 'jine' {
  let host = '';
  try { host = new URL(String(endpoint)).hostname.toLowerCase(); } catch { return 'jine'; }
  if (host.endsWith('push.apple.com')) return 'safari';
  if (host.endsWith('mozilla.com') || host.endsWith('mozaws.net')) return 'firefox';
  if (host.endsWith('notify.windows.com')) return 'edge';
  if (host.endsWith('googleapis.com') || host.endsWith('google.com')) return 'chrome';
  return 'jine';
}
