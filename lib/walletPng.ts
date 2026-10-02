// Nejmenší možný zapisovač PNG: kulatá ikona v barvě podniku s tečkou uprostřed.
// Karta do Apple Wallet potřebuje ikonu a logo; tohle jde bez závislosti na
// `sharp` (ten je jen dev nástroj a na serveru by se nenačetl).

import { deflateSync } from 'node:zlib';
import { barvaRgb } from './walletKarta.ts';

const TABULKA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = TABULKA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function blok(typ: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(typ, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Čtverec `px` × `px` v barvě podniku, uprostřed kulatá výplň barvou textu (průhledné rohy). RGBA, 8 bitů. */
export function pngIkona(px: number, barva: string, textBarva: string): Buffer {
  const [r, g, b] = barvaRgb(barva);
  const [tr, tg, tb] = barvaRgb(textBarva);
  const stred = (px - 1) / 2, polomerKruh = px * 0.5, polomerTecka = px * 0.2;
  const radky = Buffer.alloc((px * 4 + 1) * px);
  for (let y = 0; y < px; y++) {
    radky[y * (px * 4 + 1)] = 0; // filtr řádku: žádný
    for (let x = 0; x < px; x++) {
      const d = Math.hypot(x - stred, y - stred);
      const o = y * (px * 4 + 1) + 1 + x * 4;
      const uvnitr = d <= polomerKruh;
      const tecka = d <= polomerTecka;
      radky[o] = tecka ? tr : r; radky[o + 1] = tecka ? tg : g; radky[o + 2] = tecka ? tb : b;
      radky[o + 3] = uvnitr ? 255 : 0;
    }
  }
  const hlavicka = Buffer.alloc(13);
  hlavicka.writeUInt32BE(px, 0); hlavicka.writeUInt32BE(px, 4);
  hlavicka[8] = 8; hlavicka[9] = 6; // 8 bitů, RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    blok('IHDR', hlavicka), blok('IDAT', deflateSync(radky)), blok('IEND', new Uint8Array(0)),
  ]);
}
