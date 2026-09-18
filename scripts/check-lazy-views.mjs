#!/usr/bin/env node
// Pohled, který se stáhne, i když ho nikdo neotevře.
//
// Hlavní obrazovka měla 421 kB prvního načtení, zatímco zbytek aplikace
// 87–137 kB: rozvržení importovalo všech dvaadvacet pohledů staticky, takže
// se rozvrh, sklad, receptury, postupy i správa hostovské části stahovaly
// dřív, než se ukázal přehled. Manažer na telefonu v kavárně čekal na věci,
// které ten den vůbec neotevře. Po převedení na `next/dynamic`: 167 kB.
//
// Tahle kontrola hlídá, aby se do rozvržení nevrátil statický import těžkého
// pohledu. První obrazovka po přihlášení (přehled, domů) statická zůstává —
// ta čekat nemá.
import { readFileSync } from 'node:fs';

const ROZVRZENI = [
  ['components/employer/EmployerLayout.tsx', ['EmployerDashboard']],
  ['components/employee/EmployeeLayout.tsx', ['EmployeeDashboard']],
];

// Co je „těžký pohled": komponenta, kterou `switch` vykresluje jako celou
// obrazovku. Poznáme ji podle toho, že se objeví v `case '...': return <X`.
const chyby = [];
for (const [soubor, vyjimky] of ROZVRZENI) {
  const s = readFileSync(soubor, 'utf8');
  const pohledy = new Set(
    [...s.matchAll(/case\s+'[^']+':\s*return\s*\(?\s*<([A-Z]\w+)/g)].map(m => m[1]),
  );
  const staticke = new Set(
    [...s.matchAll(/^import\s+([A-Z]\w+)\s+from\s+'[^']+';$/gm)].map(m => m[1]),
  );
  for (const p of pohledy) {
    if (vyjimky.includes(p)) continue;
    if (staticke.has(p)) chyby.push(`${soubor}: ${p} se importuje staticky`);
  }
}

if (chyby.length) {
  console.error(`\nTěžký pohled ve statickém importu: ${chyby.length}.`);
  console.error('Rozvržení stáhne pohled, i když ho nikdo neotevře. Použij `naLine(() => import(…))`,');
  console.error('ať se stáhne až při otevření — a uživatel nečeká na to, co dnes nepotřebuje.\n');
  for (const c of chyby) console.error('  ' + c);
  process.exit(1);
}
console.log('check-lazy-views: v pořádku — pohledy se stahují až při otevření.');
