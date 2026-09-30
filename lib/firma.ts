// Údaje provozovatele pro právní stránky, patičky a e-maily — na JEDNOM místě.
//
// Sem nepatří vymyšlené údaje. Dokud provozovatel nemá zapsané své údaje,
// vrací se viditelné zástupné pole ({{NAZEV_FIRMY}} apod.): stránky
// /soukromi, /podminky, /podpora a /smazat-ucet pak na první pohled ukážou,
// že se musí doplnit, a nikdo neodešle do obchodu text s cizím nebo
// smyšleným subjektem. Skutečné hodnoty se nastaví v prostředí (Vercel →
// Environment Variables), ne v kódu:
//   FIRMA_NAZEV, FIRMA_ICO, FIRMA_ADRESA, FIRMA_EMAIL_PODPORY, FIRMA_REGION_DAT
// Texty, které z nich skládáme (lib/pravni/texty.ts), MUSÍ před zveřejněním
// schválit právník: jsou napsané podle toho, jaká data kód skutečně sbírá, ne
// jako právní služba.

export interface Firma {
  nazev: string;
  ico: string;
  adresa: string;
  emailPodpory: string;
  /** Kde leží databáze a soubory (země/region poskytovatele); doplní provozovatel podle nastavení Neon a Vercel. */
  regionDat: string;
  web: string;
}

export const ZASTUPNA = {
  nazev: '{{NAZEV_FIRMY}}',
  ico: '{{ICO}}',
  adresa: '{{ADRESA}}',
  emailPodpory: '{{EMAIL_PODPORY}}',
  regionDat: '{{REGION_DAT}}',
} as const;

const hodnota = (env: string | undefined, zastupna: string) => (env ?? '').trim() || zastupna;

/** Údaje provozovatele z prostředí; co chybí, zůstane viditelným zástupným polem. */
export function firma(env: Record<string, string | undefined> = process.env): Firma {
  return {
    nazev: hodnota(env.FIRMA_NAZEV, ZASTUPNA.nazev),
    ico: hodnota(env.FIRMA_ICO, ZASTUPNA.ico),
    adresa: hodnota(env.FIRMA_ADRESA, ZASTUPNA.adresa),
    emailPodpory: hodnota(env.FIRMA_EMAIL_PODPORY, ZASTUPNA.emailPodpory),
    regionDat: hodnota(env.FIRMA_REGION_DAT, ZASTUPNA.regionDat),
    web: 'https://www.managero.app',
  };
}

/** Které údaje ještě nejsou vyplněné (pro kontrolu před odesláním do obchodu). */
export function chybejiciUdaje(f: Firma = firma()): string[] {
  return (Object.keys(ZASTUPNA) as (keyof typeof ZASTUPNA)[]).filter(k => f[k] === ZASTUPNA[k]);
}

/** Je to e-mail, na který se dá odkázat přes mailto:, nebo jen zástupné pole? */
export function jeEmail(s: string): boolean {
  return /^[^@\s{}]+@[^@\s{}]+\.[^@\s{}]+$/.test(s);
}
