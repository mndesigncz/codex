// Sondy v prohlížeči — spouštěč.
//
// Každá sonda (*.mjs v téhle složce) otevře aplikaci na localhost:3000
// v Chromiu, API podvrhne fixturami z ./fixtury a tvrdí, co má být na
// obrazovce vidět. Dřív žily jen v pracovní složce jedné session a při
// její ztrátě se musely skládat z historie; tady jsou v repu a v CI.
//
// Použití:
//   node scripts/sondy/spust.mjs            # sondy ze seznamu ZELENE
//   node scripts/sondy/spust.mjs k64 k60    # jen vybrané
//   node scripts/sondy/spust.mjs --vse      # všechny (i rozpracované)
//
// Předpoklad: běží `next start -p 3000` se stejným NEXTAUTH_SECRET, jaký
// má tenhle proces (sondy si podle něj razí session cookie).

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';

const DIR = new URL('./', import.meta.url).pathname;

// Sondy, které na aktuálním kódu procházejí a hlídají se v CI. Kdo
// sondu rozbije, opraví kód, ne seznam; kdo přidá novou zelenou, připíše ji.
export const ZELENE = [
  'a11y',
  'att',
  'b2',
  'barva',
  'boundary',
  'bulk',
  'chat',
  'chatdom',
  'chatgeom',
  'crash',
  'csp',
  'cta',
  'dark',
  'esc2',
  'esc3',
  'focus',
  'fokus',
  'formulare',
  'guard',
  'hints',
  'host',
  'ipad',
  'k10',
  'k11',
  'k12',
  'k13',
  'k15',
  'k17',
  'k40',
  'k54',
  'k55',
  'k56',
  'k57',
  'k60',
  'k61',
  'k62',
  'k64',
  'k9',
  'kb',
  'kiosk',
  'kolize',
  'koncept',
  'landing',
  'listy',
  'menu',
  'menu-bg',
  'menu-ipad',
  'mobil',
  'modal',
  'modal2',
  'odeslani',
  'odeslani2',
  'offline',
  'one',
  'prostor',
  'role',
  'sanity',
  'skok',
  'stavy',
  'taps',
  'tokeny',
  'trial',
  'tyden',
  'zamek',
  'zasah',
  'hledani',
  'k53',
  'koncept2',
  'navody',
  'prepnuti',
  'search',
  'slib',
  'k68-plocha',
  'k68-telefon',
  'k68-klavesnice',
  'k68-opravneni',
  'k68-vychozi',
  'k68-design',
  'k68-fyzika',
  'k69-b5a',
  'k69-b5b',
  'k69-b3',
  'k69-b4',
  'k69-b1',
  'k69-b2',
];

const MIMO = new Set(['spust', 'cookie-role', 'fixtury-k53', 'fixtury-navody', 'k68-spolecne']);
const vsechny = readdirSync(DIR).filter(f => f.endsWith('.mjs')).map(f => f.slice(0, -4)).filter(n => !MIMO.has(n)).sort();

const args = process.argv.slice(2);
const jmena = args.includes('--vse') ? vsechny : args.length ? args : ZELENE;
const nezname = jmena.filter(n => !vsechny.includes(n));
if (nezname.length) { console.error(`Neznámé sondy: ${nezname.join(', ')}`); process.exit(2); }

// Chromium: v CI ho stáhne `playwright-core install`, v cloudové session je
// předinstalovaný v /opt/pw-browsers — tam se vezme natvrdo, jinak by
// playwright-core hledal revizi, která na disku není.
const env = { ...process.env };
if (!env.SONDY_CHROMIUM) {
  const kandidat = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (existsSync(kandidat)) env.SONDY_CHROMIUM = kandidat;
}

// Snímky obrazovek (shots/, v .gitignore) se píšou vedle sond, ne do kořene repa.
mkdirSync(DIR + 'shots', { recursive: true });

const SOUBEZNE = Number(env.SONDY_SOUBEZNE ?? 3);
const LIMIT_MS = Number(env.SONDY_LIMIT_MS ?? 240_000);

function spust(jmeno) {
  return new Promise(resolve => {
    const start = Date.now();
    const p = spawn(process.execPath, [DIR + jmeno + '.mjs'], { env, cwd: DIR, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { out += d; });
    const casovac = setTimeout(() => { out += `\n(čas vypršel po ${LIMIT_MS / 1000} s)`; p.kill('SIGKILL'); }, LIMIT_MS);
    p.on('close', code => {
      clearTimeout(casovac);
      resolve({ jmeno, ok: code === 0, sekund: Math.round((Date.now() - start) / 1000), out });
    });
  });
}

const fronta = [...jmena];
const vysledky = [];
await Promise.all(Array.from({ length: Math.min(SOUBEZNE, fronta.length) }, async () => {
  while (fronta.length) {
    const r = await spust(fronta.shift());
    vysledky.push(r);
    console.log(`${r.ok ? '✓' : '✗'} ${r.jmeno} (${r.sekund} s)`);
  }
}));

const spadle = vysledky.filter(r => !r.ok).sort((a, b) => a.jmeno.localeCompare(b.jmeno));
for (const r of spadle) {
  console.log(`\n──── ${r.jmeno} ────`);
  console.log(r.out.split('\n').filter(l => !l.startsWith('✓') && !l.startsWith('  ✓')).slice(-25).join('\n'));
}
console.log(`\nSondy: ${vysledky.length - spadle.length} z ${vysledky.length} prošlo.`);
if (args.includes('--vse')) console.log('Zelené: ' + JSON.stringify(vysledky.filter(r => r.ok).map(r => r.jmeno).sort()));
process.exit(spadle.length ? 1 : 0);
