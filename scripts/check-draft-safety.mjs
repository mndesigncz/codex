#!/usr/bin/env node
// Heslo se do konceptu nedostane.
//
// `useDraft` uchovává rozepsaný formulář v `sessionStorage`, aby přežil
// odchod na jinou záložku. U hesla, tokenu nebo čísla karty by to nebyla
// laskavost, ale bezpečnostní chyba: tajemství by leželo v úložišti
// prohlížeče déle, než musí, a přečetl by ho každý skript na té stránce.
//
// Kontrola je záměrně tupá a přísná — soubor, který koncept používá, nesmí
// obsahovat pole s heslem ani klíč, který zní jako tajemství. Když někdo
// takový formulář opravdu potřebuje, ať koncept rozdělí, ne obejde tenhle
// soubor.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const TAJEMSTVI = /\b(password|heslo|token|secret|pin|cvv|cardNumber|cisloKarty|apiKey|otp)\b/i;

const nalezy = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const file = join(dir, name);
    if (statSync(file).isDirectory()) { walk(file); continue; }
    if (!/\.tsx?$/.test(file)) continue;
    const s = readFileSync(file, 'utf8');
    if (!s.includes('useDraft(')) continue;
    s.split('\n').forEach((line, i) => {
      if (/type="password"/.test(line) || /type={'password'}/.test(line)) {
        nalezy.push(`${relative('.', file)}:${i + 1}  pole s heslem ve formuláři, který má koncept`);
      }
    });
    // Klíče uvnitř sledovaného objektu: useDraft('jmeno', { ... }, ...)
    for (const m of s.matchAll(/useDraft\([^,]+,\s*\{([^}]*)\}/g)) {
      for (const klic of m[1].split(',')) {
        const jmeno = klic.split(':')[0].trim();
        if (jmeno && TAJEMSTVI.test(jmeno)) {
          const radek = s.slice(0, m.index).split('\n').length;
          nalezy.push(`${relative('.', file)}:${radek}  klíč „${jmeno}" v konceptu`);
        }
      }
    }
  }
};
walk('components');
walk('app');

if (nalezy.length) {
  console.error(`\nTajemství v rozepsaném konceptu: ${nalezy.length}.`);
  console.error('Koncept leží v úložišti prohlížeče. Heslo, token ani číslo karty tam nepatří —');
  console.error('rozděl formulář, nebo koncept u tohohle formuláře nepoužívej.\n');
  for (const n of nalezy) console.error('  ' + n);
  process.exit(1);
}
console.log('check-draft-safety: v pořádku — žádné tajemství se neuchovává v konceptu.');
