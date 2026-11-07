// Jednorázové kódy z autentizační aplikace (TOTP, RFC 6238) pro přihlášení do správy platformy.
//
// Bez knihovny: TOTP je HMAC-SHA1 nad pořadovým číslem 30sekundového okna
// (RFC 4226 + 6238) a celé se to vejde na pár řádků. Klíč se drží v Base32
// (RFC 4648), protože tak ho čtou všechny aplikace (Google Authenticator,
// 1Password, Authy…) z QR kódu i z ručního opisu.
//
// Ověření bere okno ±1 krok (hodiny telefonu se rozcházejí o pár sekund)
// a vrací ČÍSLO kroku, ve kterém kód sedí. Volající si ho uloží a znovu
// použitý kód (stejný nebo starší krok) odmítne — kód opsaný přes rameno
// tak nejde použít podruhé ani během své půlminuty.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const ABECEDA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const KROK_S = 30;
export const CISLIC = 6;

/** Base32 bez zarovnání (`=`), jak ho chtějí autentizační aplikace. */
export function base32(buf: Uint8Array): string {
  let bity = 0, hodnota = 0, out = '';
  for (const b of buf) {
    hodnota = (hodnota << 8) | b;
    bity += 8;
    while (bity >= 5) {
      out += ABECEDA[(hodnota >>> (bity - 5)) & 31];
      bity -= 5;
    }
  }
  if (bity > 0) out += ABECEDA[(hodnota << (5 - bity)) & 31];
  return out;
}

/** Base32 → bajty. Mezery, pomlčky a malá písmena projdou (ruční opis); jiný znak = null. */
export function zBase32(s: string): Buffer | null {
  const cisty = String(s ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  let bity = 0, hodnota = 0;
  const out: number[] = [];
  for (const ch of cisty) {
    const i = ABECEDA.indexOf(ch);
    if (i < 0) return null;
    hodnota = (hodnota << 5) | i;
    bity += 5;
    if (bity >= 8) {
      out.push((hodnota >>> (bity - 8)) & 255);
      bity -= 8;
    }
  }
  return Buffer.from(out);
}

/** Nový klíč: 20 náhodných bajtů (160 bitů, doporučení RFC 4226 pro SHA-1). */
export function novyKlic(): string {
  return base32(randomBytes(20));
}

/** HOTP (RFC 4226): kód pro dané pořadové číslo. */
export function hotp(klic: Uint8Array, citac: number, cislic = CISLIC): string {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(citac)));
  const h = createHmac('sha1', klic).update(c).digest();
  const o = h[h.length - 1] & 0x0f;
  const bin = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** cislic).padStart(cislic, '0');
}

/** Pořadové číslo 30s okna pro daný čas. */
export function krokZCasu(casMs: number, krokS = KROK_S): number {
  return Math.floor(casMs / 1000 / krokS);
}

/** TOTP (RFC 6238, SHA-1) pro daný čas. */
export function totp(klic: Uint8Array, casMs: number, cislic = CISLIC, krokS = KROK_S): string {
  return hotp(klic, krokZCasu(casMs, krokS), cislic);
}

/**
 * Ověří kód. Vrací číslo kroku, ve kterém sedí (pro zákaz opakování),
 * nebo null. `okno` = kolik kroků vedle aktuálního se toleruje (výchozí ±1).
 */
export function overTotp(klicBase32: string, kod: unknown, casMs: number, okno = 1): number | null {
  const k = zBase32(klicBase32);
  if (!k || k.length < 10) return null;
  const zadany = String(kod ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(zadany)) return null;
  const ted = krokZCasu(casMs);
  let nalezeny: number | null = null;
  // Projdou se všechny kroky okna (ne první shoda a konec): čas odpovědi pak
  // neprozradí, ve kterém kroku kód seděl.
  for (let d = -okno; d <= okno; d++) {
    const krok = ted + d;
    if (krok < 0) continue;
    const ok = timingSafeEqual(Buffer.from(hotp(k, krok)), Buffer.from(zadany));
    if (ok && nalezeny === null) nalezeny = krok;
  }
  return nalezeny;
}

/** Odkaz pro QR kód (Key Uri Format, který čtou autentizační aplikace). */
export function otpauthUri(v: { klic: string; ucet: string; vydavatel?: string }): string {
  const vydavatel = v.vydavatel ?? 'Managero správa';
  const stitek = `${encodeURIComponent(vydavatel)}:${encodeURIComponent(v.ucet)}`;
  const q = new URLSearchParams({ secret: v.klic, issuer: vydavatel, algorithm: 'SHA1', digits: String(CISLIC), period: String(KROK_S) });
  return `otpauth://totp/${stitek}?${q.toString().replace(/\+/g, '%20')}`;
}

/** Klíč po čtveřicích pro ruční opis („ABCD EFGH …"). */
export function klicProOpis(klic: string): string {
  return klic.replace(/(.{4})/g, '$1 ').trim();
}
