// E-maily kolem dárkových poukazů: obsah (předmět + HTML) bez odesílání, ať jde otestovat bez sítě.
// Odesílá lib/email.ts (sendVoucherEmail). Texty jsou česky jako zbytek e-mailů podniku;
// jméno, zpráva a název podniku jdou do HTML jen přes escHtml (nikdy syrově).
// Dárce může přidat vlastní vzkaz (nejvýš MAX_VZKAZ znaků); kód se ukazuje velký a opsatelný (DP-XXXX-XXXX).

import { escHtml } from './email.ts';
import { datumCesky } from './poukazyTisk.ts';
import { formatMoney } from './money.ts';
import { czCount, DEN } from './czech.ts';
import { normalizujEmail, vypadaJakoEmail } from './emailAdresa.ts';

export const MAX_VZKAZ = 300;

/** E-mail obdarovaného z formuláře: malá písmena, bez mezer, ověřený tvar; jinak null. */
export function emailObdarovaneho(raw: unknown): string | null {
  const e = normalizujEmail(raw);
  return e && e.length <= 120 && vypadaJakoEmail(e) ? e : null;
}

/** Vzkaz dárce: oříznutý, bez řídicích znaků; prázdný = null. */
export function vzkazDarce(raw: unknown): string | null {
  const s = String(raw ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, MAX_VZKAZ);
  return s || null;
}

export interface ObsahPoukazu {
  podnik: string; kod: string; castka: number; mena: string;
  /** `YYYY-MM-DD` nebo null (bez omezení). */
  platnost: string | null;
  komu?: string | null; vzkaz?: string | null;
  /** Odkaz na stránku podniku (host si tam zůstatek ověří), nebo null. */
  odkaz?: string | null;
}

const OBAL = 'font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:28px;background:#F1F4EC;color:#16181A;border-radius:20px;';

function karta(o: ObsahPoukazu, nadpis: string): string {
  return `
    <div style="background:#ffffff;border:2px solid #16181A;border-radius:18px;padding:24px;text-align:center;margin:16px 0;">
      <p style="margin:0;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#5c6353;">${escHtml(o.podnik)}</p>
      <p style="margin:4px 0 12px;font-size:20px;font-weight:800;">${escHtml(nadpis)}</p>
      <p style="margin:0 0 8px;font-size:38px;font-weight:800;line-height:1.1;">${escHtml(formatMoney(o.castka, o.mena))}</p>
      <p style="margin:12px 0 4px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:24px;font-weight:700;letter-spacing:.14em;word-break:break-all;">${escHtml(o.kod)}</p>
      <p style="margin:8px 0 0;font-size:13px;color:#5c6353;">${o.platnost ? `Platí do ${escHtml(datumCesky(o.platnost))}` : 'Bez omezení platnosti'} · uplatní se u kasy</p>
    </div>`;
}

/** E-mail s poukazem pro obdarovaného: karta s kódem, vzkaz a odkaz na stránku podniku. */
export function emailPoukazu(o: ObsahPoukazu): { subject: string; html: string } {
  const osloveni = o.komu ? `Ahoj ${escHtml(o.komu)},` : 'Ahoj,';
  return {
    subject: `Dárkový poukaz od podniku ${o.podnik}`,
    html: `
      <div style="${OBAL}">
        <p style="margin:0 0 4px;">${osloveni}</p>
        <p style="margin:0;color:#5c6353;">dostáváš dárkový poukaz. Ukaž kód u kasy a obsluha ho odečte.</p>
        ${o.vzkaz ? `<p style="margin:14px 0 0;padding:12px 14px;background:#ffffff;border-radius:12px;white-space:pre-wrap;">${escHtml(o.vzkaz)}</p>` : ''}
        ${karta(o, 'Dárkový poukaz')}
        ${o.odkaz ? `<p style="margin:0;font-size:13px;color:#5c6353;">Zůstatek a platnost si ověříš na <a href="${escHtml(o.odkaz)}" style="color:#16181A;">stránce podniku</a> (Věrnost → Mám poukaz).</p>` : ''}
        <p style="margin:16px 0 0;font-size:12px;color:#8a917f;">Kód je jako hotovost: nikomu ho nepřeposílej.</p>
      </div>`,
  };
}

/** Připomenutí, že poukaz brzy propadne (obdarovanému i podniku se stejnou kartou). */
export function emailPripominky(o: ObsahPoukazu & { zbyvaDni: number }): { subject: string; html: string } {
  const kdy = o.zbyvaDni <= 0 ? 'dnes' : o.zbyvaDni === 1 ? 'zítra' : `za ${czCount(o.zbyvaDni, DEN)}`;
  return {
    subject: `Poukaz ${o.podnik} brzy propadne`,
    html: `
      <div style="${OBAL}">
        <p style="margin:0 0 4px;">${o.komu ? `Ahoj ${escHtml(o.komu)},` : 'Ahoj,'}</p>
        <p style="margin:0;color:#5c6353;">tvůj dárkový poukaz propadne <strong>${escHtml(kdy)}</strong>. Zbývá na něm ${escHtml(formatMoney(o.castka, o.mena))}, využij ho, dokud platí.</p>
        ${karta(o, 'Dárkový poukaz')}
        ${o.odkaz ? `<p style="margin:0;font-size:13px;color:#5c6353;">Podnik: <a href="${escHtml(o.odkaz)}" style="color:#16181A;">stránka podniku</a>.</p>` : ''}
      </div>`,
  };
}
