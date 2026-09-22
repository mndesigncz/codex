#!/usr/bin/env node
// Plovoucí panel na průhledné ploše.
//
// Od redesignu Managero 2 znamená `.glass` tónovanou plochu ovládacích
// prvků: 4 % inkoustu, žádné bílé pozadí, žádný blur. Tři rozbalovací
// menu (přepínač podniku, účtové menu vedení i zaměstnance) ale `glass`
// dál nosila jako pozadí panelu, který leží NAD jiným obsahem. Výsledek:
// pod „Nastavení" a „Odhlásit se" prosvítala navigace postranní lišty
// a obojí se četlo přes sebe.
//
// Co plave nad obsahem (menu, popover, našeptávač), patří na
// `.glass-strong`: bílá 88 %, blur, tmavá varianta a pevná plocha při
// `prefers-reduced-transparency`. Pravidlo, které tu hlídáme: `glass`
// se nesmí potkat v jednom className s tím, co z prvku dělá plovoucí
// panel — `absolute`/`fixed` nebo vlastní stín `shadow-…`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  if (f === 'node_modules' || f === '.next' || f.startsWith('.')) return [];
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : (p.endsWith('.tsx') ? [p] : []);
});

const nalezy = [];
for (const soubor of [...walk('components'), ...walk('app')]) {
  const src = readFileSync(soubor, 'utf8');
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const tokeny = (m[1] ?? m[2] ?? '').split(/\s+/);
    if (!tokeny.includes('glass')) continue;
    const plave = tokeny.some((t) => t === 'absolute' || t === 'fixed' || /^shadow-/.test(t));
    if (!plave) continue;
    const radek = src.slice(0, m.index).split('\n').length;
    nalezy.push(`${relative('.', soubor)}:${radek}`);
  }
}

if (nalezy.length) {
  console.error('\nPlovoucí panel na `.glass` — bez pozadí, obsah pod ním prosvítá:\n');
  for (const n of nalezy) console.error('  ' + n);
  console.error('\nPoužij `.glass-strong` (menu, popover, našeptávač). `.glass` je jen tón pro ovládací prvky.\n');
  process.exit(1);
}
console.log('check-floating-glass: v pořádku — plovoucí panely mají pevné pozadí.');
