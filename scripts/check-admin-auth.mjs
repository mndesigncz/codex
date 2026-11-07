#!/usr/bin/env node
// Žádná routa správy platformy bez brány.
//
// `/api/admin/*` a `/api/mcp` umí pozastavit cizí podnik a přepnout mu
// tarif. Jedna routa, která zapomene zavolat `requireSuperadmin`, je
// otevřený zásah do každého podniku na platformě — a v editoru to vypadá
// úplně stejně jako ta, která to nezapomněla. Proto to hlídá stroj:
//
//  - každá exportovaná HTTP metoda v admin routách musí volat
//    `requireSuperadmin(` (jedno volání na metodu, ne jedno na soubor),
//  - layout obrazovek správy musí ověřit relaci správy (`spravceZPozadavku(`),
//  - brána nesmí brát relaci aplikace (NextAuth) a aplikace na /admin neodkazuje,
//  - `middleware.ts` musí existovat a volat `rozhodni(` z lib/blokace,
//  - `lib/superadmin.ts` nesmí importovat nic z Node (čte ho edge middleware),
//  - správce se nesmí poznávat podle e-mailu (nikdo ho neověřuje; viz lib/superadmin.ts).

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const chyby = [];

function* routy(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* routy(p);
    else if (n === 'route.ts') yield p;
  }
}

const soubory = [...routy('app/api/admin'), 'app/api/mcp/route.ts'].filter(existsSync);
if (soubory.length < 2) chyby.push('nenašly se admin routy — přejmenované? kontrola by pak hlídala nic');
for (const f of soubory) {
  const s = readFileSync(f, 'utf8');
  const metod = (s.match(/export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b/g) ?? []).length
    + (s.match(/export const (GET|POST|PUT|PATCH|DELETE)\s*=/g) ?? []).length;
  const bran = (s.match(/requireSuperadmin\(/g) ?? []).length;
  if (metod === 0) chyby.push(`${f}: žádná exportovaná HTTP metoda`);
  // Sdílená obsluha (const GET = obsluz) volá bránu jednou pro všechny metody.
  if (bran === 0 || (!/const (GET|POST|DELETE)\s*=\s*\w+/.test(s) && bran < metod)) chyby.push(`${f}: ${metod} metod, ${bran} volání requireSuperadmin`);
  if (!/@\/lib\/superadminGate/.test(s)) chyby.push(`${f}: bránu bere odjinud než z lib/superadminGate`);
}

// Správa platformy běží na vlastním hostu (admin.managero.app) s vlastním přihlášením
// (heslo + TOTP, lib/spravaRelace.ts). Obrazovky pouští layout skupiny (sprava) jen
// s relací správy ověřenou podle databáze; brána API taky — relace aplikace (NextAuth) ne.
const layout = 'app/admin/(sprava)/layout.tsx';
if (!existsSync(layout) || !/spravceZPozadavku\(/.test(readFileSync(layout, 'utf8'))) chyby.push(`${layout}: chybí spravceZPozadavku( — obrazovky správy bez brány`);
const spravaServer = existsSync('lib/spravaServer.ts') ? readFileSync('lib/spravaServer.ts', 'utf8') : '';
if (!/jeSpravcePodleDb\(/.test(spravaServer)) chyby.push('lib/spravaServer.ts nerozhoduje podle databáze (jeSpravcePodleDb)');
if (!/jeAdminHost\(/.test(spravaServer)) chyby.push('lib/spravaServer.ts nehlídá host správy (jeAdminHost)');

if (!existsSync('middleware.ts')) chyby.push('middleware.ts chybí — blokace podniků se nevynucuje');
else {
  const mw = readFileSync('middleware.ts', 'utf8');
  if (!/rozhodni\(/.test(mw)) chyby.push('middleware.ts nevolá rozhodni( z lib/blokace');
  if (!/rozhodniHost\(/.test(mw)) chyby.push('middleware.ts nevolá rozhodniHost( — /admin by byl vidět na www');
}

const brana = readFileSync('lib/superadminGate.ts', 'utf8');
if (!/spravceZPozadavku\(/.test(brana)) chyby.push('lib/superadminGate.ts neověřuje relaci správy (spravceZPozadavku → jeSpravcePodleDb)');
if (/getServerSession|next-auth/.test(brana)) chyby.push('lib/superadminGate.ts bere relaci aplikace (NextAuth) — do správy smí jen relace správy nebo Bearer token');
if (!/jeSpravcePodleDb\(/.test(readFileSync('lib/auth.ts', 'utf8'))) chyby.push('lib/auth.ts nerozhoduje správce při přihlášení podle databáze');
if (/isSuperadmin(Email|Id)\(token/.test(readFileSync('middleware.ts', 'utf8'))) chyby.push('middleware.ts rozhoduje správce sám místo booleanu rozhodnutého při přihlášení');
// Aplikace na správu neodkazuje (dřív položka „Správa platformy" v menu vedení).
function* zdrojaky(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) { if (n !== 'node_modules' && n !== 'api') yield* zdrojaky(p); }
    else if (/\.tsx?$/.test(n)) yield p.split('\\').join('/');
  }
}
for (const dir of ['components', 'app']) {
  for (const f of zdrojaky(dir)) {
    if (f.startsWith('components/admin/') || f.startsWith('app/admin/')) continue;
    if (/['"`]\/admin(['"`/?])/.test(readFileSync(f, 'utf8'))) chyby.push(`${f}: odkaz na /admin — správa je jen na admin.managero.app`);
  }
}
for (const f of ['lib/superadmin.ts', 'lib/superadminDb.ts', 'lib/superadminGate.ts', 'lib/spravaServer.ts', layout, 'middleware.ts', 'lib/auth.ts']) {
  if (/SUPERADMIN_EMAILS|isSuperadminEmail/.test(readFileSync(f, 'utf8'))) chyby.push(`${f}: správce podle e-mailu — e-mail si při registraci volí kdokoli`);
}
const cisty = readFileSync('lib/superadmin.ts', 'utf8');
if (/from ['"](crypto|node:|next-auth|@neondatabase)/.test(cisty)) chyby.push('lib/superadmin.ts importuje Node/next-auth — middleware na edge by spadl');

if (chyby.length) {
  console.error('\ncheck-admin-auth: správa platformy bez brány\n');
  for (const c of chyby) console.error('  ' + c);
  console.error('');
  process.exit(1);
}
console.log(`check-admin-auth: v pořádku — ${soubory.length} admin rout s bránou, layout, middleware.`);
