// „Stáhnout moje data“ pro hosta (Managero client; GDPR čl. 15 a 20): sestavení souboru.
//
// Čistý modul (testy: scripts/testy/k90-gdpr-export.ts). Dotazy do databáze jsou
// v app/api/client/account/export/route.ts a všechny jsou omezené na `customer_id = me`
// (u souhlasů `user_id = me`). Do souboru se nikdy nedostane hash hesla ani tokeny: profil
// prochází bílou listinou polí.
//
// Co v souboru schválně není: interní poznámky obsluhy k hostovi (client_member_notes) a skupiny,
// do kterých podnik hosta zařadil — vede si je podnik jako správce a hostovi je na žádost vydá
// podnik (poznámka v souboru to říká). Kdo obsluhu u kasy dělal (staff_id), taky ne: to je údaj
// o zaměstnanci, ne o hostovi.

/** Pole profilu hosta, která smí do souboru. */
export const POLE_PROFILU_HOSTA = ['id', 'name', 'email', 'phone', 'birthday', 'avatar', 'role', 'lang', 'created_at',
  'terms_version', 'privacy_version', 'terms_accepted_at'] as const;

export interface SekceExportuHosta {
  ucet: Record<string, unknown> | null;
  karta: Record<string, unknown> | null;
  clenstvi: Record<string, unknown>[] | null;
  body: Record<string, unknown>[] | null;
  razitka: Record<string, unknown>[] | null;
  razitkaHistorie: Record<string, unknown>[] | null;
  kupony: Record<string, unknown>[] | null;
  promoKody: Record<string, unknown>[] | null;
  objednavky: Record<string, unknown>[] | null;
  rezervace: Record<string, unknown>[] | null;
  hodnoceni: Record<string, unknown>[] | null;
  poukazy: Record<string, unknown>[] | null;
  akce: Record<string, unknown>[] | null;
  souhlasy: Record<string, unknown>[] | null;
}

export const VERZE_EXPORTU_HOSTA = 1;

export const POZNAMKA_EXPORTU_HOSTA = 'Všechno, co o tobě v Managero client vedeme: profil, kartička, členství v podnicích (body, razítka, kredit, návštěvy, útrata), historie bodů a kreditu, razítkové karty a jejich historie, kupony, promo kódy, objednávky, rezervace, hodnocení, dárkové poukazy, akce, které sleduješ, a souhlasy (kdy a kde jsi je dal nebo odvolal). Interní poznámky obsluhy a skupiny, do kterých tě podnik zařadil, vede podnik; vydá ti je na žádost přímo podnik.';

/** Řádek bez klíčů, které do souboru nepatří (kdo z obsluhy co udělal, interní příznaky). */
const BEZ = new Set(['staff_id', 'redeemed_by', 'created_by', 'replied_by', 'password_hash', 'pin', 'pin_hash']);
const ocisti = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).filter(([k]) => !BEZ.has(k)));

/**
 * Sestaví dokument. Sekce, kterou se nepodařilo načíst (tabulka ještě není), je v `nedostupne`,
 * ne tiše prázdná; sekce, která narazila na strop řádků, je v `oriznute`.
 */
export function sestavExportHosta(sekce: SekceExportuHosta, vytvoreno: Date = new Date(), strop: number | null = null) {
  const ucet = sekce.ucet
    ? Object.fromEntries(POLE_PROFILU_HOSTA.filter(k => k in sekce.ucet!).map(k => [k, sekce.ucet![k]]))
    : null;
  const klice = Object.keys(sekce) as (keyof SekceExportuHosta)[];
  const nedostupne = klice.filter(k => sekce[k] === null);
  const oriznute = strop === null ? [] : klice.filter(k => { const v = sekce[k]; return Array.isArray(v) && v.length >= strop; });
  const pole = (k: keyof SekceExportuHosta) => ((sekce[k] as Record<string, unknown>[] | null) ?? []).map(ocisti);
  return {
    aplikace: 'Managero client',
    verze: VERZE_EXPORTU_HOSTA,
    vytvoreno: vytvoreno.toISOString(),
    poznamka: POZNAMKA_EXPORTU_HOSTA,
    ucet,
    karta: sekce.karta ? ocisti(sekce.karta) : null,
    clenstvi: pole('clenstvi'),
    body: pole('body'),
    razitka: pole('razitka'),
    razitkaHistorie: pole('razitkaHistorie'),
    kupony: pole('kupony'),
    promoKody: pole('promoKody'),
    objednavky: pole('objednavky'),
    rezervace: pole('rezervace'),
    hodnoceni: pole('hodnoceni'),
    poukazy: pole('poukazy'),
    akce: pole('akce'),
    souhlasy: pole('souhlasy'),
    nedostupne,
    oriznute,
  };
}

/** Název souboru: managero-client-moje-data-RRRR-MM-DD.json (den podle UTC stačí, je to jen jméno). */
export function nazevExportuHosta(d: Date = new Date()): string {
  return `managero-client-moje-data-${d.toISOString().slice(0, 10)}.json`;
}
