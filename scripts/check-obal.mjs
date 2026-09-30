#!/usr/bin/env node
// Nativní obal (App Store, Google Play): žádný nákup, cena ani odkaz na Stripe.
//
// Apple 3.1.1 a Google Play Billing nedovolí, aby aplikace nabízela předplatné
// mimo jejich nákup. V obalu proto nesmí být cena, tlačítko „Odemknout“, pokladna
// ani odkaz na platbu. Skrývání se dá snadno rozbít (nová komponenta s cenou, nový
// fetch na /api/billing), proto tahle kontrola hlídá:
//  1. kód, který načítá Stripe nebo volá /api/billing/*, smí ležet jen v povolených
//     souborech (a ty mají ve skutečnosti svoji ochranu, viz bod 2),
//  2. ochrany jsou na svých místech (brána v middleware, serverová 403, useObal v zámcích,
//     registrace bez tarifu, Nastavení bez předplatného, úvodní stránka bez cen),
//  3. serverová brána zná všechny tři cesty pokladny.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const chyby = [];
const cti = (p) => readFileSync(p, 'utf8');

function* soubory(dir) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n === '.next') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* soubory(p);
    else if (/\.(ts|tsx)$/.test(n)) yield p;
  }
}

// Soubory, které smějí sahat na Stripe nebo na /api/billing z prohlížeče, a proč jsou v obalu bezpečné.
const POVOLENE = {
  'components/Pro.tsx': 'zámky: OdemknoutButton, MaxGate, ProGate, UpgradeModal a odznaky v obalu používají useObal',
  'components/Billing.tsx': 'Nastavení → Předplatné; Settings.tsx ji v obalu nevykreslí (smiPlatby)',
  'components/CheckoutModal.tsx': 'pokladna; otevře ji jen OdemknoutButton / registrace, které v obalu nejsou',
  'components/SpravovatPredplatneButton.tsx': 'stránka pozastaveno ji v obalu nevykreslí',
  'app/(auth)/register/page.tsx': 'registrace: v obalu jen tarif Zdarma a žádná pokladna (smiPlatby)',
};

for (const dir of ['app', 'components', 'lib']) {
  for (const p of soubory(dir)) {
    if (p.startsWith('lib/demo') || p.startsWith('app/api/') || p.startsWith('lib/billing') || p === 'lib/obal.ts' || p === 'lib/blokace.ts' || p.startsWith('lib/predplatne')) continue;
    const s = cti(p);
    const stripe = /from\s+['"]@stripe\/stripe-js['"]|import\(['"]@stripe\/stripe-js['"]\)/.test(s);
    const checkout = /from\s+['"][^'"]*CheckoutModal['"]|import\(['"][^'"]*CheckoutModal['"]\)/.test(s);
    const billingFetch = /fetch\(\s*[`'"]\/api\/billing\//.test(s) || /['"`]\/api\/billing\/(checkout|portal|upgrade)/.test(s);
    if ((stripe || checkout || billingFetch) && !(p in POVOLENE)) {
      chyby.push(`${p}: načítá Stripe / pokladnu / /api/billing mimo povolené soubory (scripts/check-obal.mjs, POVOLENE). V obalu nesmí být nákup.`);
    }
  }
}

const vyzaduje = (soubor, vzor, proc) => {
  let s = '';
  try { s = cti(soubor); } catch { chyby.push(`${soubor}: soubor chybí (${proc})`); return; }
  if (!vzor.test(s)) chyby.push(`${soubor}: ${proc}`);
};

vyzaduje('components/Pro.tsx', /useObal/, 'zámky funkcí musí v obalu ukazovat neutrální text (useObal), ne cenu a odemknutí');
vyzaduje('components/Pro.tsx', /Zamceno/, 'chybí neutrální zamčená funkce bez ceny a výzvy');
vyzaduje('components/Settings.tsx', /smiPlatby[\s\S]*<Billing/, 'Nastavení musí v obalu schovat Předplatné (smiPlatby před <Billing/>)');
vyzaduje('app/(auth)/register/page.tsx', /smiPlatby/, 'registrace musí v obalu schovat volbu tarifu a pokladnu');
vyzaduje('components/employer/EmployerLayout.tsx', /smiPlatby/, 'bannery o předplatném a zkoušce se v obalu nesmějí ukázat');
vyzaduje('components/client/ClientShell.tsx', /jeObal/, 'odkaz „Jsem podnik“ (prodejní stránka) se v obalu nesmí ukázat');
vyzaduje('app/page.tsx', /obalZHlavicek[\s\S]*redirect\('\/login'\)/, 'úvodní stránka s cenami se v obalu nesmí vykreslit (přesměrování na přihlášení)');
vyzaduje('app/pozastaveno/page.tsx', /vObalu/, 'portál předplatného se v obalu nenabízí');
vyzaduje('middleware.ts', /obalZUserAgent[\s\S]*rozhodniObal[\s\S]*getToken/, 'brána obalu musí běžet v middleware PŘED čtením relace (getToken)');
vyzaduje('app/api/billing/status/route.ts', /obalZHlavicek/, 'stav předplatného nesmí v obalu vracet ceny a odkaz na odměnu');
vyzaduje('app/api/notifications/route.ts', /type <> 'billing'/, 'oznámení o platbách se v obalu nesmí zobrazit');
vyzaduje('lib/push.ts', /neutralniProNativni/, 'nativní push o platbě musí být neutrální');

const obal = cti('lib/obal.ts');
for (const cesta of ['checkout', 'portal', 'upgrade']) {
  if (!new RegExp(`checkout\\|portal\\|upgrade`).test(obal) || !obal.includes(cesta)) chyby.push(`lib/obal.ts: serverová brána nezná /api/billing/${cesta}`);
}
if (!/status:\s*403/.test(obal)) chyby.push('lib/obal.ts: platby v obalu se musí odmítnout stavem 403');

if (chyby.length) {
  console.error('Kontrola obalu selhala:');
  for (const c of chyby) console.error(`  ✗ ${c}`);
  process.exit(1);
}
console.log('Obal: nákup a platby jsou mimo obal, ochrany na místě.');
