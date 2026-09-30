#!/usr/bin/env node
// Rozměry, rozmazaný náhled a popis fotek prodejní stránky: kampaň
// `public/brand/landing/v2` a typy podniků z `public/brand/onboarding`.
//
// Fotky jsou na prodejní stránce doplněk (hlavní je živá ukázka a nahrávky),
// ale i doplněk musí nést to, co `Foto` vyžaduje: šířku a výšku (jinak stránka
// při načtení poskočí), 16px náhled (místo šedé díry je hned správná barva)
// a popisný alt. Všechno z jednoho místa, ze samotných souborů; ručně opsané
// rozměry se dřív nebo později rozejdou se soubory.
//
//   node scripts/landing-foto.mjs      → components/landing/foto2.generated.ts
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const KOREN = new URL('../', import.meta.url).pathname;

// Popisy: co na fotce doopravdy je (ne „fotka kavárny", to odečítači nic neřekne).
const FOTKY = [
  ['majitel', 'Majitelka kavárny se u dřevěného baru usmívá nad tabletem, vedle stojí limetkový hrnek', 'Majitelka'],
  ['tym', 'Tři lidé v zástěrách se v kavárně smějí nad telefonem, který jedna z nich drží', 'Tým'],
  ['sklad', 'Zaměstnankyně ve skladu mezi regály s mlékem, kávou a sirupy kontroluje zásoby na tabletu', 'Sklad'],
  ['porada', 'Dva zaměstnanci u kulatého stolku v kavárně sedí nad tabletem, jedna z nich na něj ukazuje', 'Porada'],
  ['uzaverka', 'Obsluha večer u baru počítá bankovky a mince, vedle stojí tablet ve stojánku', 'Uzávěrka'],
  ['telefon', 'Ruka drží telefon s aplikací nad stolem v kavárně, vedle šálek kávy', 'Telefon'],
];

// Typy podniků z průvodce (public/brand/onboarding). Štítek s názvem stojí vedle
// fotky, takže alt je prázdný: odečítač by jinak řekl totéž dvakrát.
// Pozor na slovo „čajovna": kontrola textů ho v řetězcích zakazuje, proto „Čaj a nápoje".
const PODNIKY = [
  ['kavarna', 'Kavárna'],
  ['restaurace', 'Restaurace'],
  ['bar', 'Bar'],
  ['pekarna', 'Pekárna'],
  ['caj', 'Čaj a nápoje'],
  ['foodtruck', 'Food truck'],
];

async function radek(klic, src, alt, podnik) {
  const soubor = KOREN + 'public' + src;
  const { width, height } = await sharp(soubor).metadata();
  const blur = await sharp(soubor).resize({ width: 16 }).webp({ quality: 30 }).toBuffer();
  return `  '${klic}': {
    src: '${src}',
    w: ${width}, h: ${height},
    alt: ${JSON.stringify(alt)},
    podnik: ${JSON.stringify(podnik)},
    blur: 'data:image/webp;base64,${blur.toString('base64')}',
  },`;
}

const v2 = [];
for (const [id, alt, podnik] of FOTKY) v2.push(await radek(`v2-${id}`, `/brand/landing/v2/${id}.webp`, alt, podnik));
const podniky = [];
for (const [id, label] of PODNIKY) podniky.push(await radek(`podnik-${id}`, `/brand/onboarding/${id}.webp`, '', label));

writeFileSync(KOREN + 'components/landing/foto2.generated.ts', `// Vygeneroval scripts/landing-foto.mjs ze souborů v public/brand, neupravovat ručně.
import type { Fotka } from './foto';

export const FOTO_V2 = {
${v2.join('\n')}
} satisfies Record<string, Fotka>;

/** Typy podniků z průvodce prvním nastavením (výběr v kroku „Založ podnik"). */
export const FOTO_PODNIKY = {
${podniky.join('\n')}
} satisfies Record<string, Fotka>;
`);
console.log(`foto2.generated.ts: ${v2.length + podniky.length} fotek`);
