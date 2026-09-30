#!/usr/bin/env node
// Demo účty a ukázkový podnik pro recenzenty obchodů.
//
//   DATABASE_URL=… node scripts/seed-recenzent.mjs --db=<hostitel> --generuj
//   DATABASE_URL=… RECENZENT_HESLO='…' node scripts/seed-recenzent.mjs --db=<hostitel>
//
// Volby:
//   --db=<hostitel>          POVINNÉ: musí odpovídat hostiteli v DATABASE_URL (pojistka proti omylu)
//   --heslo=…                jedno heslo pro všechny tři účty (nebo RECENZENT_HESLO)
//   --heslo-provoz=… --heslo-zamestnanec=… --heslo-host=…   (nebo RECENZENT_HESLO_PROVOZ apod.)
//   --generuj                chybějící hesla vygeneruje a JEDNOU je vypíše na konci
//   --domena=…               doména e-mailů účtů (výchozí managero.invalid, nikdy skutečná schránka)
//
// NESPOUŠTĚJ proti produkční databázi. Demo data patří do zkušební databáze
// (nebo do produkce jen s vědomím majitele, protože vznikne veřejně viditelný
// podnik „Café Demo" v adresáři hostů). Skript je idempotentní: opakované
// spuštění řádky aktualizuje a nezdvojuje je. Heslo se nikdy neukládá do repa
// a bez --generuj se nevypisuje. Logika je v scripts/seed-recenzent-jadro.mjs
// a má testy (scripts/testy/k77-ucet.ts).
//
// Po schválení obchodem hesla změň (spusť znovu s novými), ať recenzentům
// nezůstane přístup.

import { randomBytes } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { seed, nactiHesla, kontrolaDatabaze, VYCHOZI_DOMENA } from './seed-recenzent-jadro.mjs';

const argv = process.argv.slice(2);
const dnesPraha = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
const nahodne = (n) => randomBytes(Math.ceil(n * 0.75)).toString('base64url').slice(0, n);
const kod = (n) => randomBytes(n).toString('hex').toUpperCase().slice(0, n);

async function main() {
  const url = process.env.DATABASE_URL;
  const host = kontrolaDatabaze({ url, argv });
  const { hesla, vygenerovana } = nactiHesla({ argv, env: process.env, nahodne });
  const domena = (argv.find(a => a.startsWith('--domena=')) ?? '').slice(9) || VYCHOZI_DOMENA;
  const sql = neon(url);

  // Upsert podle přirozeného klíče: najít, jinak vložit. Objekty (jsonb) se posílají jako JSON s přetypováním.
  const db = {
    async upsert(tabulka, klic, hodnoty, jenPriVytvoreni = {}) {
      const kk = Object.keys(klic);
      const kde = kk.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
      const [nalezen] = await sql.query(`SELECT * FROM ${tabulka} WHERE ${kde} LIMIT 1`, kk.map(k => klic[k]));
      const param = (v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
      const typ = (v, i) => (v !== null && typeof v === 'object' ? `$${i}::jsonb` : `$${i}`);
      if (nalezen) {
        const hk = Object.keys(hodnoty);
        if (hk.length) {
          const set = hk.map((k, i) => `${k} = ${typ(hodnoty[k], kk.length + i + 1)}`).join(', ');
          await sql.query(`UPDATE ${tabulka} SET ${set} WHERE ${kde}`, [...kk.map(k => klic[k]), ...hk.map(k => param(hodnoty[k]))]);
        }
        return nalezen.id ?? nalezen.team_id ?? nalezen.customer_id ?? null;
      }
      const vse = { ...klic, ...hodnoty, ...jenPriVytvoreni };
      const vk = Object.keys(vse);
      const [radek] = await sql.query(
        `INSERT INTO ${tabulka} (${vk.join(', ')}) VALUES (${vk.map((k, i) => typ(vse[k], i + 1)).join(', ')}) RETURNING *`,
        vk.map(k => param(vse[k])),
      );
      return radek?.id ?? radek?.team_id ?? radek?.customer_id ?? null;
    },
  };

  const vysledek = await seed(db, { hesla, hash: (h) => bcrypt.hash(h, 12), dnes: dnesPraha(), domena, kod });

  // Správce platformy nesmí být mezi demo účty: měl by práva nad všemi podniky.
  const spravci = (process.env.SUPERADMIN_USER_IDS ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const pozor = [vysledek.ids.provoz, vysledek.ids.zamestnanec, vysledek.ids.host].filter(i => spravci.includes(String(i)));
  if (pozor.length) throw new Error(`Demo účet ${pozor.join(', ')} je v SUPERADMIN_USER_IDS. Odeber ho, demo účty nesmí být správci.`);

  console.log(`Hotovo na ${host}. Podnik Café Demo (slug cafe-demo), účty:`);
  for (const [role, email] of Object.entries(vysledek.emaily)) console.log(`  ${role}: ${email}`);
  if (vygenerovana) {
    console.log('\nVygenerovaná hesla (vypsána jen teď, nikde se neukládají):');
    for (const [role, h] of Object.entries(hesla)) console.log(`  ${role}: ${h}`);
  }
}

main().catch((e) => { console.error(`Chyba: ${e.message}`); process.exit(1); });
