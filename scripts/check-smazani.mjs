#!/usr/bin/env node
// Smazání účtu nesmí zapomenout na tabulku.
//
// Schéma nemá cizí klíče, takže databáze při smazání účtu nic sama nekaskáduje;
// co se má smazat, je vyjmenované ručně v lib/smazaniUctu.ts. Tahle kontrola
// vytáhne z DDL (app/api/init/route.ts) každou tabulku se sloupcem, který
// odkazuje na uživatele, a chce pro ni rozhodnutí (smazat / upravit / ponechat /
// tým). Nová tabulka s `user_id` bez rozhodnutí shodí CI dřív, než by po smazání
// účtu zůstaly osobní údaje (Apple 5.1.1(v), Google Play, GDPR čl. 17).
// Totéž pro tabulky s `team_id`: smazání podniku je musí znát.

import { nactiSchema, SLOUPCE_NA_UZIVATELE } from './ddl-schema.mjs';
import { ZACHAZENI_TABULEK, TYMOVE_TABULKY, TYMOVE_PONECHAT, TYMOVE_NEPRIME } from '../lib/smazaniUctu.ts';

const schema = nactiSchema();
const chyby = [];

for (const [tabulka, sloupce] of schema) {
  if (tabulka === 'users') continue;
  const naUzivatele = [...sloupce].filter(s => SLOUPCE_NA_UZIVATELE.test(s));
  if (naUzivatele.length && !(tabulka in ZACHAZENI_TABULEK)) {
    chyby.push(`tabulka ${tabulka} (sloupce ${naUzivatele.join(', ')}) nemá v lib/smazaniUctu.ts ZACHAZENI_TABULEK rozhodnutí, co se s ní při smazání účtu stane`);
  }
  if (sloupce.has('team_id') && !TYMOVE_TABULKY.includes(tabulka) && !TYMOVE_PONECHAT.includes(tabulka)) {
    chyby.push(`tabulka ${tabulka} má team_id, ale smazání podniku ji nezná (TYMOVE_TABULKY / TYMOVE_PONECHAT v lib/smazaniUctu.ts)`);
  }
}
for (const t of Object.keys(ZACHAZENI_TABULEK)) if (!schema.has(t)) chyby.push(`ZACHAZENI_TABULEK zná tabulku ${t}, která v DDL není`);
for (const t of TYMOVE_TABULKY) if (!schema.has(t)) chyby.push(`TYMOVE_TABULKY zná tabulku ${t}, která v DDL není`);
for (const n of TYMOVE_NEPRIME) if (!schema.has(n.tabulka)) chyby.push(`TYMOVE_NEPRIME zná tabulku ${n.tabulka}, která v DDL není`);

if (chyby.length) {
  console.error('Kontrola smazání účtu selhala:');
  for (const c of chyby) console.error(`  ✗ ${c}`);
  process.exit(1);
}
console.log(`Smazání účtu: ${schema.size} tabulek v DDL, všechny s odkazem na uživatele nebo podnik mají rozhodnutí.`);
