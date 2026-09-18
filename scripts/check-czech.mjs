#!/usr/bin/env node
// Skloňování po číslovce.
//
// Čeština má po číslovce tři tvary, ne dva: 1 položka, 2–4 položky,
// 5+ položek. Kdo to řeší jen ternárním `n === 1 ? 'a' : 'b'`, napíše
// v aplikaci větu „3 návodů čeká na schválení", kterou by rukou nenapsal
// nikdo. Je to tichá chyba: vypadá jako překlep, ale je jich pak všude
// plno a aplikace působí jako strojový překlad.
//
// Pravidlo patří do `lib/czech.ts` (`czForm`, `czCount`, `czVerb`), aby
// existovalo jednou. Tahle kontrola hlídá dvě věci:
//   1. dvoutvarovou podmínku navázanou na počet (`n === 1 ? … : …`),
//   2. opsané pravidlo `n >= 2 && n <= 4` mimo lib/czech.ts.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['app', 'components', 'lib'];
const ALLOW = new Set(['lib/czech.ts', 'lib/plan.ts', 'scripts/check-czech.mjs']);

// Opsané rozmezí 2–4 — pravidlo má být jen na jednom místě.
const COPIED = /\b[a-zA-Z_$][\w$]*\s*>=\s*2\s*&&\s*[a-zA-Z_$][\w$]*\s*<=\s*4\b/;

// `x === 1 ? 'slovo' : 'slovo'` — dva tvary tam, kde patří tři.
//
// Hlídá se jen případ, kdy se vedle toho opravdu vypisuje číslo: věta
// „dokonči povinné postupy" je bez číslovky správně pro dva i pro pět,
// kdežto „2 postupů" je chyba. Rozhoduje tedy přítomnost `${x}` / `{x}`
// se stejnou proměnnou na témže řádku.
const TWO_FORMS = /([\w$.]+)\s*===\s*1\s*\?\s*['"][^'"]{2,}['"]\s*:\s*['"][^'"]{2,}['"]/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '.next') yield* walk(p); }
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

const copied = [];
const twoForms = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative('.', file);
    if (ALLOW.has(rel)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const at = `${rel}:${i + 1}  ${line.trim().slice(0, 110)}`;
      if (COPIED.test(line)) copied.push(at);
      // Jen české texty; `? 'day' : 'days'` v anglickém řetězci nás nezajímá.
      else {
        const m = TWO_FORMS.exec(line);
        if (m && /[áčďéěíňóřšťúůýž]/i.test(line)) {
          const v = m[1].replace(/[.$]/g, '\\$&');
          const rendered = new RegExp(`\\$\\{\\s*${v}\\s*\\}|\\{\\s*${v}\\s*\\}`);
          if (rendered.test(line)) twoForms.push(at);
        }
      }
    });
  }
}

const fail = (title, why, hits) => {
  console.error(`\n${title}`);
  console.error(why + '\n');
  for (const h of hits) console.error('  ' + h);
  console.error(`\n${hits.length} ${hits.length === 1 ? 'místo' : 'míst'} k opravě.\n`);
  process.exit(1);
};

if (copied.length) {
  fail('Pravidlo pro 2–4 se neopisuje — je v lib/czech.ts (czForm/czCount/czVerb).',
    'Opsané rozmezí se rozejde: jedna kopie se opraví a druhá zůstane.', copied);
}
if (twoForms.length) {
  fail('Po číslovce jsou v češtině tři tvary, ne dva.',
    '1 položka · 2–4 položky · 5+ položek. Použij czForm()/czCount() z lib/czech.', twoForms);
}
console.log('check-czech: v pořádku — skloňování po číslovce má tři tvary.');
