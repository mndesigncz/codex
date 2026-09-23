// Kontrola SQL: každý dotaz v `sql\`…\`` (Neon tagged template) musí projít
// parserem Postgresu. Aplikace nemá lokální databázi a testy ji nepouští,
// takže překlep v dotazu se dřív ukázal až v produkci jako pětistovka.
// Parser je libpg_query (WASM), tedy stejná gramatika jako server; `${…}`
// se nahradí parametrem $n, jak to dělá Neon.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'libpg-query';

const KORENY = ['app', 'lib', 'middleware.ts'];
const soubory = [];
function projdi(p) {
  const st = statSync(p);
  if (st.isDirectory()) { for (const f of readdirSync(p)) projdi(join(p, f)); return; }
  if (/\.(ts|tsx)$/.test(p) && !/\.d\.ts$/.test(p)) soubory.push(p);
}
for (const k of KORENY) projdi(k);

/** Najde tagged templates `sql\`…\`` (i `neon(…)\`…\``) a vrátí text s $n místo ${…}. */
function dotazy(zdroj) {
  const out = [];
  const re = /(\bsql|\bneon\([^)]*\))\s*`/g;
  let m;
  while ((m = re.exec(zdroj))) {
    let i = m.index + m[0].length; let hloubka = 0; let text = ''; let n = 0; let radek = zdroj.slice(0, m.index).split('\n').length;
    for (; i < zdroj.length; i++) {
      const ch = zdroj[i];
      if (hloubka === 0) {
        if (ch === '`') break;
        if (ch === '$' && zdroj[i + 1] === '{') { hloubka = 1; i++; text += `$${++n}`; continue; }
        if (ch === '\\') { text += zdroj[i + 1] ?? ''; i++; continue; }
        text += ch;
      } else {
        if (ch === '{') hloubka++;
        else if (ch === '}') hloubka--;
        else if (ch === '`') { // vnořený template uvnitř ${…}: přeskočit
          i++; while (i < zdroj.length && zdroj[i] !== '`') i++;
        }
      }
    }
    re.lastIndex = i + 1;
    out.push({ text, radek });
  }
  return out;
}

let chyb = 0, dotazu = 0;
for (const f of soubory) {
  const zdroj = readFileSync(f, 'utf8');
  for (const d of dotazy(zdroj)) {
    const t = d.text.trim();
    if (!t) continue;
    dotazu++;
    try { await parse(t); }
    catch (e) {
      chyb++;
      console.log(`${f}:${d.radek}: ${String(e.message ?? e).split('\n')[0]}`);
      console.log('   ' + t.replace(/\s+/g, ' ').slice(0, 160));
    }
  }
}
console.log(`SQL: ${dotazu} dotazů v ${soubory.length} souborech, ${chyb} chyb`);
process.exit(chyb ? 1 : 0);
