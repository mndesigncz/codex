#!/usr/bin/env node
// Každá akce, kterou kód zapíše do historie změn, musí mít český popisek.
//
// Slovník v app/api/audit/route.ts znal 17 z víc než 40 akcí, takže vedení
// v Nastavení → Historie změn číst „team.switch“ a „pos.sync“. Slovník je teď
// v lib/auditPopisky.ts a tahle kontrola projde každé volání `audit(...)`
// v app/ a lib/ a ověří, že klíč (třetí argument) ve slovníku je.
//
//   audit(t, u, 'role.create', …)             → 'role.create' musí být ve slovníku
//   audit(t, u, `reward.${status}`, …)        → musí existovat klíč začínající „reward.“
//   audit(t, u, a ? 'x.jedna' : 'x.druha', …) → oba klíče musí být ve slovníku
//
// Naopak popisky, které kód nepoužívá, nevadí (zůstávají pro staré záznamy).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['app', 'lib'];
const SLOVNIK = readFileSync('lib/auditPopisky.ts', 'utf8');
const klice = new Set([...SLOVNIK.matchAll(/^\s*'([a-z][a-zA-Z_.-]*)':\s*'/gm)].map(m => m[1]));
if (klice.size < 10) { console.error('Slovník lib/auditPopisky.ts se nepodařilo přečíst.'); process.exit(1); }

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '.next') yield* walk(p); }
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

/** Argumenty volání od otevírací závorky; dělí jen na nejvyšší úrovni a respektuje řetězce. */
function argumenty(zdroj, odZavorky) {
  const out = [];
  let hloubka = 0, cur = '', q = null;
  for (let i = odZavorky; i < zdroj.length; i++) {
    const ch = zdroj[i];
    if (q) {
      cur += ch;
      if (ch === '\\') { cur += zdroj[++i] ?? ''; continue; }
      if (ch === q) q = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { hloubka++; if (hloubka > 1) cur += ch; continue; }
    if (ch === ')' || ch === ']' || ch === '}') {
      hloubka--;
      if (hloubka === 0) { out.push(cur.trim()); return out; }
      cur += ch; continue;
    }
    if (ch === ',' && hloubka === 1) { out.push(cur.trim()); cur = ''; if (out.length === 3) return out; continue; }
    cur += ch;
  }
  return out;
}

const chyby = [];
let pocet = 0;
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative('.', file);
    if (rel === 'lib/audit.ts' || rel === 'lib/auditPopisky.ts') continue;
    const zdroj = readFileSync(file, 'utf8');
    for (const m of zdroj.matchAll(/(?<![\w.])audit\(/g)) {
      const radek = zdroj.slice(0, m.index).split('\n').length;
      const args = argumenty(zdroj, m.index + m[0].length - 1);
      if (args.length < 3) continue; // definice funkce nebo jiné volání
      const akce = args[2];
      pocet++;
      // U ternáru se podmínka („b.x === 'checkout' ? …“) nekontroluje, jen obě větve.
      const vetve = /^[^'"`]*\?/.test(akce) || /^[\w.\s=!]+(===|!==)\s*['"][^'"]*['"]\s*\?/.test(akce) ? akce.slice(akce.indexOf('?') + 1) : akce;
      const literaly = [...vetve.matchAll(/'([^']+)'|"([^"]+)"|`([^`]*)`/g)];
      if (literaly.length === 0) { chyby.push(`${rel}:${radek}  klíč akce není literál (${akce.slice(0, 60)}) — kontrola ho nedokáže ověřit`); continue; }
      for (const l of literaly) {
        const text = l[1] ?? l[2] ?? l[3];
        if (l[3] !== undefined && text.includes('${')) {
          const predpona = text.slice(0, text.indexOf('${'));
          if (!predpona || ![...klice].some(k => k.startsWith(predpona))) {
            chyby.push(`${rel}:${radek}  dynamický klíč \`${text}\` nemá ve slovníku žádný klíč začínající „${predpona}“`);
          }
        } else if (!klice.has(text)) {
          chyby.push(`${rel}:${radek}  akce „${text}“ nemá popisek v lib/auditPopisky.ts`);
        }
      }
    }
  }
}

if (pocet === 0) { console.error('Kontrola nenašla jediné volání audit(...) — regex je rozbitý.'); process.exit(1); }
if (chyby.length) {
  console.error(`Historie změn: ${chyby.length} akcí bez českého popisku (z ${pocet} volání).\n`);
  for (const c of chyby) console.error('  ' + c);
  console.error('\nDoplň klíč do AUDIT_POPISKY v lib/auditPopisky.ts.');
  process.exit(1);
}
console.log(`Historie změn: všech ${pocet} volání audit() má český popisek (${klice.size} klíčů ve slovníku).`);
