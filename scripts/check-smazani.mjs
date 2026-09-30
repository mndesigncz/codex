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

import { nactiSchema, SLOUPCE_NA_UZIVATELE, SLOUPCE_OSOBNI_UDAJE } from './ddl-schema.mjs';
import {
  ZACHAZENI_TABULEK, TYMOVE_TABULKY, TYMOVE_PONECHAT, TYMOVE_NEPRIME, OSOBNI_UDAJE, RESET_SLOUPCU, planUzivatele, planPodniku,
} from '../lib/smazaniUctu.ts';

const schema = nactiSchema();
const chyby = [];
const planTexty = [
  ...planUzivatele({ id: 1, email: 'a@b.cz', role: 'employer', hash: '!x', dnes: '2026-01-01' }),
  ...planPodniku(1, 1),
].map(k => k.text);
const maKrok = (t) => planTexty.some(x => new RegExp(`(FROM|UPDATE)\\s+${t}\\b`).test(x));

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

// Osobní údaje (e-mail, telefon, volný text, soubory, Stripe, mzdová sazba): každá tabulka má dokumentované zacházení
// a to, co slibuje smazání nebo anonymizaci, má v plánu skutečný krok.
for (const [tabulka, sloupce] of schema) {
  if (tabulka === 'users') continue;
  const osobni = [...sloupce].filter(s => SLOUPCE_OSOBNI_UDAJE.test(s));
  if (osobni.length && !(tabulka in OSOBNI_UDAJE)) {
    chyby.push(`tabulka ${tabulka} (sloupce ${osobni.join(', ')}) má osobní údaje, ale chybí v OSOBNI_UDAJE v lib/smazaniUctu.ts`);
  }
}
for (const [t, d] of Object.entries(OSOBNI_UDAJE)) {
  if (!schema.has(t)) { chyby.push(`OSOBNI_UDAJE zná tabulku ${t}, která v DDL není`); continue; }
  if (!d.co || d.co.length < 20) chyby.push(`OSOBNI_UDAJE: tabulka ${t} nemá popis zacházení`);
  if ((d.zpusob === 'smazat' || d.zpusob === 'anonymizovat' || d.zpusob === 'podnik') && !maKrok(t)) {
    chyby.push(`OSOBNI_UDAJE slibuje pro ${t} zacházení „${d.zpusob}“, ale plán smazání účtu ani podniku ji nezasahuje`);
  }
  if (d.zpusob === 'ponechat' && maKrok(t)) chyby.push(`OSOBNI_UDAJE: ${t} je k ponechání, ale plán smazání ji mění`);
}
const sloupceUsers = schema.get('users');
for (const [sloupec] of RESET_SLOUPCU) if (!sloupceUsers.has(sloupec)) chyby.push(`RESET_SLOUPCU: users.${sloupec} v DDL není`);
for (const sloupec of ['pin', 'pin_hash', 'hourly_rate', 'max_consecutive_days', 'max_month_hours', 'job_title', 'active_team_id']) {
  if (!RESET_SLOUPCU.some(([s]) => s === sloupec)) chyby.push(`users.${sloupec} se při smazání účtu nevynuluje (RESET_SLOUPCU)`);
}

if (chyby.length) {
  console.error('Kontrola smazání účtu selhala:');
  for (const c of chyby) console.error(`  ✗ ${c}`);
  process.exit(1);
}
console.log(`Smazání účtu: ${schema.size} tabulek v DDL, všechny s odkazem na uživatele nebo podnik mají rozhodnutí, ${Object.keys(OSOBNI_UDAJE).length} tabulek s osobními údaji má dokumentované zacházení.`);
