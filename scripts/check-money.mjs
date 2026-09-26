#!/usr/bin/env node
// Natvrdo napsaná měna.
//
// Aplikace je vícem­ěnová: podnik si v nastavení vybere měnu i jazyk
// a všechno se má formátovat přes `useMoney()` / `useSymbol()` (obrazovka)
// nebo `formatMoney()` z `lib/money` (server a veřejné stránky). Kde se
// místo toho lepí `"Kč"` k číslu, vidí rakouská kavárna svoje ceny
// v korunách — a k tomu bez oddělovače tisíců, protože ruční interpolace
// `${n} Kč` neumí, co umí `Intl`.
//
// Hostovská část (`components/client/*`) je tím nejhorším případem, protože
// tam to čte zákazník; ta je vyčištěná. Zbytek je práce na dál, a tahle
// kontrola je ráčna: počet nesmí růst. Když klesne, sníží se i BASELINE —
// ať je vidět, že se to opravdu uklízí, a ne že se jen přestalo přidávat.
//
// Výjimky: `lib/money` sám, ceník předplatného Managera (ten je záměrně
// v korunách, prodává se v ČR) a komentáře.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['app', 'components', 'lib'];
const BASELINE = 59; // kolo 69 (B5b): účtenky přes useMoney/useSymbol místo „Kč"

// Kde je koruna v pořádku: vlastní formátovač a ceník předplatného.
const ALLOW = [
  'lib/money.ts',
  'lib/plan.ts',
  'lib/billing.ts',
  'components/Pricing.tsx',
  'components/Billing.tsx',
  'components/CheckoutModal.tsx',
  'components/Pro.tsx',
  'scripts/check-money.mjs',
];

// Jen symbol, ne kód. `'CZK'` v datové struktuře (výchozí měna týmu,
// sady bankovek, odpověď z kasy) je správné použití — kód je právě to,
// co `formatMoney` čeká. Chyba je symbol nalepený na číslo k zobrazení.
const MONEY = /Kč/;

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== 'node_modules' && name !== '.next') yield* walk(p); }
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

const hits = [];
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const rel = relative('.', file);
    if (ALLOW.includes(rel)) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      const code = line.trimStart();
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
      if (MONEY.test(line)) hits.push(`${rel}:${i + 1}  ${line.trim().slice(0, 96)}`);
    });
  }
}

const n = hits.length;
if (n > BASELINE) {
  console.error(`\nNatvrdo napsané měny přibylo: ${n}, dovoleno ${BASELINE}.`);
  console.error('Použij useMoney()/useSymbol() na obrazovce nebo formatMoney() z lib/money.\n');
  for (const h of hits.slice(-12)) console.error('  ' + h);
  console.error(`\n(vypsáno posledních ${Math.min(12, n)} z ${n})\n`);
  process.exit(1);
}
if (n < BASELINE) {
  console.error(`\nNatvrdo napsané měny ubylo: ${n} místo ${BASELINE}. Sniž BASELINE`);
  console.error('v scripts/check-money.mjs, ať ráčna drží nový stav.\n');
  process.exit(1);
}
console.log(`check-money: v pořádku — ${n} míst s natvrdo psanou měnou, nepřibývá.`);
