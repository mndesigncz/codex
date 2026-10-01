// Tisk dárkových poukazů: karta s názvem podniku, hodnotou, kódem a QR kódem.
// Čistá funkce (QR jako hotové SVG dostane zvenku), ať jde otestovat bez prohlížeče. Okno otevírá openPrint (lib/printDoc.ts).

import { esc } from './printDoc.ts';
import { formatMoney } from './money.ts';

export interface KartaPoukazu {
  code: string;
  value_amount: number;
  currency: string;
  /** `YYYY-MM-DD` nebo null (bez omezení). */
  valid_until: string | null;
  recipient_name?: string | null;
}

const STYL = `<style>
  .poukaz { box-sizing: border-box; width: 100%; max-width: 560px; margin: 0 auto 18px; padding: 28px 24px; border: 2px solid #16181A; border-radius: 18px; text-align: center; page-break-inside: avoid; break-inside: avoid; }
  .poukaz .pod { font-size: 13px; letter-spacing: .12em; text-transform: uppercase; color: #555; margin: 0; }
  .poukaz .nadpis { font-size: 22px; font-weight: 800; margin: 4px 0 14px; }
  .poukaz .hodnota { font-size: 44px; font-weight: 800; line-height: 1.1; margin: 0 0 6px; }
  .poukaz .komu { font-size: 15px; margin: 0 0 10px; }
  .poukaz .qr { width: 168px; height: 168px; margin: 8px auto; }
  .poukaz .qr svg { width: 100%; height: 100%; display: block; }
  .poukaz .kod { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 24px; letter-spacing: .14em; font-weight: 700; margin: 6px 0; word-break: break-all; }
  .poukaz .plati { font-size: 13px; color: #555; margin: 8px 0 0; }
</style>`;

/** Datum `YYYY-MM-DD` jako „31. 12. 2026“ bez závislosti na časové zóně. */
export function datumCesky(d: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${Number(m[3])}. ${Number(m[2])}. ${m[1]}` : d;
}

/** Tělo tiskového dokumentu: jedna karta na poukaz, karty se nerozdělují přes okraj stránky. */
export function poukazyKartyHtml(karty: KartaPoukazu[], podnik: string, qr: Record<string, string>): string {
  const html = karty.map(k => `<section class="poukaz">
  <p class="pod">${esc(podnik)}</p>
  <p class="nadpis">Dárkový poukaz</p>
  <p class="hodnota">${esc(formatMoney(k.value_amount, k.currency))}</p>
  ${k.recipient_name ? `<p class="komu">pro ${esc(k.recipient_name)}</p>` : ''}
  <div class="qr" role="img" aria-label="QR kód poukazu">${qr[k.code] ?? ''}</div>
  <p class="kod">${esc(k.code)}</p>
  <p class="plati">${k.valid_until ? `Platí do ${esc(datumCesky(k.valid_until))}` : 'Bez omezení platnosti'} · uplatní se u kasy</p>
</section>`).join('\n');
  return STYL + html;
}
