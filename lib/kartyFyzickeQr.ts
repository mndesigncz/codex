// QR fyzické karty pro tiskový arch: nese jen kód (ABCD-EFGH), stejně jako QR kartičky
// v aplikaci (app/api/client/card), takže kartu přečte každá čtečka i kamera u kasy.
// Černý na průhledném s okrajem dvou modulů; zbytek tiché zóny dělá odsazení na kartě.

import QRCode from 'qrcode';
import { parseDbTime, pragueDaySafe } from './pragueTime';

export function qrKarty(kod: string): Promise<string> {
  return QRCode.toString(kod, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#00000000' } });
}

/** Den z databáze česky („15. 10. 2026“), přes pražský den. */
export function denCesky(v: string | null | undefined): string {
  const d = parseDbTime(v);
  const den = d ? pragueDaySafe(d) : '';
  return den ? `${Number(den.slice(8, 10))}. ${Number(den.slice(5, 7))}. ${den.slice(0, 4)}` : '';
}
