// Kanály zpráv členům a pravidla „kdo smí co dostat“ — čisté funkce bez Node a bez poštovního klienta, ať je smí
// importovat i prohlížeč (rozhraní zpráv a hromadných akcí). Skládání e-mailu a podpis odhlášení jsou v lib/zpravyEmail.ts.

import { vypadaJakoEmail } from './emailAdresa.ts';
import type { SouhlasNovinek } from './consents.ts';

export type KanalyZpravy = 'push' | 'email' | 'push+email';
export const KANALY_ZPRAVY: { id: KanalyZpravy; label: string; popis: string }[] = [
  { id: 'push', label: 'Oznámení v aplikaci', popis: 'Oznámení v aplikaci a push na telefon. Dostane ho člen, který souhlasil s novinkami.' },
  { id: 'email', label: 'E-mail', popis: 'E-mail s odkazem na odhlášení. Dostane ho člen, který souhlasil s novinkami a má e-mail.' },
  { id: 'push+email', label: 'Oznámení i e-mail', popis: 'Obojí najednou. Kdo má zapnuté jen jedno, dostane jen to jedno.' },
];

export function jeKanal(v: unknown): v is KanalyZpravy {
  return v === 'push' || v === 'email' || v === 'push+email';
}
export const posilaPush = (k: KanalyZpravy) => k !== 'email';
export const posilaEmail = (k: KanalyZpravy) => k !== 'push';

export interface PrijemceZpravy {
  id: number;
  email?: string | null;
  blocked?: boolean | null;
  /** users.notif_prefs — globální souhlas z doby před souhlasy po podnicích (záloha, viz `souhlas`). */
  prefs?: { novinky?: unknown; novinkyEmail?: unknown } | null;
  /**
   * Souhlas s novinkami TOHOTO podniku (tabulka consents, lib/consentsDb.ts). Když je vyplněný, rozhoduje
   * jen on; `undefined` = host v nové tabulce ještě nic nemá (před převodem) a platí globální `prefs`.
   */
  souhlas?: SouhlasNovinek | null;
}

/** Souhlas s novinkami podniku: z tabulky souhlasů, jinak z globálního příznaku (před převodem). */
function souhlasClena(p: PrijemceZpravy): SouhlasNovinek {
  if (p.souhlas) return p.souhlas;
  if (p.prefs?.novinky !== true) return { push: false, email: false };
  return { push: true, email: p.prefs?.novinkyEmail !== false };
}

export type DuvodVynechani = 'blokovany' | 'bez_souhlasu' | 'bez_emailu' | 'email_vypnuty';

/** Proč člen e-mail nedostane; null = dostane. */
export function procNedostaneEmail(p: PrijemceZpravy): DuvodVynechani | null {
  if (p.blocked) return 'blokovany';
  const s = souhlasClena(p);
  if (!s.push && !s.email) return 'bez_souhlasu';
  if (!s.email) return 'email_vypnuty';
  if (!p.email || !vypadaJakoEmail(String(p.email).trim().toLowerCase())) return 'bez_emailu';
  return null;
}

/** Proč člen push/oznámení nedostane; null = dostane. */
export function procNedostanePush(p: PrijemceZpravy): DuvodVynechani | null {
  if (p.blocked) return 'blokovany';
  if (!souhlasClena(p).push) return 'bez_souhlasu';
  return null;
}

export interface DosahZpravy {
  /** Kolik členů je v publiku (bez blokovaných). */
  publikum: number;
  push: number;
  email: number;
  /** Kolik členů nedostane nic přes zvolený kanál. */
  nikdo: number;
  bezSouhlasu: number;
  bezEmailu: number;
  emailVypnuty: number;
  blokovanych: number;
}

/** Kolik lidí zprávu opravdu dostane přes zvolený kanál — číslo, které provozovatel potřebuje vidět předem. */
export function dosahZpravy(prijemci: PrijemceZpravy[], kanal: KanalyZpravy): DosahZpravy {
  const d: DosahZpravy = { publikum: 0, push: 0, email: 0, nikdo: 0, bezSouhlasu: 0, bezEmailu: 0, emailVypnuty: 0, blokovanych: 0 };
  for (const p of prijemci) {
    if (p.blocked) { d.blokovanych++; continue; }
    d.publikum++;
    const push = posilaPush(kanal) && procNedostanePush(p) === null;
    const duvodE = procNedostaneEmail(p);
    const email = posilaEmail(kanal) && duvodE === null;
    if (push) d.push++;
    if (email) d.email++;
    if (!push && !email) d.nikdo++;
    const s = souhlasClena(p);
    if (!s.push && !s.email) d.bezSouhlasu++;
    else if (duvodE === 'bez_emailu') d.bezEmailu++;
    else if (duvodE === 'email_vypnuty') d.emailVypnuty++;
  }
  return d;
}

/** Věta o dosahu pro náhled před odesláním. */
export function vetaDosahu(d: DosahZpravy, kanal: KanalyZpravy, clen: (n: number) => string): string {
  if (d.publikum === 0) return 'V tomhle výběru teď nikdo není.';
  const casti: string[] = [];
  if (posilaPush(kanal)) casti.push(`oznámení dostane ${clen(d.push)}`);
  if (posilaEmail(kanal)) casti.push(`e-mail dostane ${clen(d.email)}`);
  const zbytek = d.bezSouhlasu > 0 ? ` ${clen(d.bezSouhlasu)} nesouhlasí se zprávami, těm nepřijde nic.` : '';
  return `Ve výběru je ${clen(d.publikum)}: ${casti.join(', ')}.${zbytek}`;
}

