#!/usr/bin/env node
// Vícejazyčnost: slovníky proti kódu, ráčna natvrdo psaných textů a starých konstrukcí.
//
// Česká věta je klíč: `t('Uložit')`. Čeština slovník nemá, takže se tu hlídá
// hlavně to, co se rozbije potichu:
//
//  1. CHYBÍ: věta z `t('…')` (nebo z dat, která se překládají podle textu: navigace,
//     stavy rezervací, hlášky serveru) není ve slovníku některého jazyka.
//  2. ZASTARALÉ: klíč ve slovníku, který už v kódu není. Nejčastěji proto, že se
//     změnila česká věta. Skript k němu najde nejpodobnější novou větu a napíše
//     „změněná věta?", ať se překlad přenese, ne ztratí. `--rename "stará" "nová"`
//     přepíše klíč ve všech slovnících i v kódu.
//  3. Překlad: prázdný, jiné `{parametry}` než česká věta, chybějící plurálové
//     tvary (pl: one/few/many/other, sk: one/few/other, de/en: one/other), HTML
//     ve zprávě, příliš dlouhý překlad krátkého textu (varování: 390 px).
//  4. Natvrdo psané texty: počet českých řetězců mimo `t()` v souborech, které už
//     jsou přeložené, nesmí růst (BASELINE níž; ráčna jako check-labels). Výjimka:
//     komentář `i18n-ok` na řádku.
//  5. Staré konstrukce: počet `'cs-CZ'` mimo lib/i18n a lib/money nesmí růst,
//     `<html lang="cs">` jen tam, kde to dává smysl, a žádný `dangerouslySetInnerHTML`
//     nad textem z `t()` (překlad je data, nikdy HTML).
//
// Sekce a jazyky: `locales/<jazyk>/<sekce>.json`; které sekce jsou „hotové" říká
// `locales/_meta.json` (klíč `revize`). Hotová sekce bez překladu je chyba, sekce,
// která v `_meta.json` není, jen varování.
//
// Použití:
//   node scripts/check-i18n.mjs                        kontrola (CI)
//   node scripts/check-i18n.mjs --rename "stará" "nová"  přejmenování klíče

import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { jmenaVeZprave, pluralSelektory } from '../lib/i18n/core.ts';
import { NAV_TEXTY } from '../lib/navigace.ts';
import { RES_STATUS, tierFor } from '../lib/clientSlots.ts';

const JAZYKY = ['en', 'de', 'sk', 'pl'];
const ROOTS = ['app', 'components', 'lib'];
/** Kolik `'cs-CZ'` je v kódu mimo výjimky. Klesá s každou dávkou migrace na lib/i18n/format; nesmí růst. */
const BASELINE_CS_CZ = 139; // −2: ceník na prodejní stránce formátuje ceny podle jazyka (kolo 79)
/** Natvrdo psané české řetězce v přeložených souborech (soubor → kolik). Nesmí růst; klesá s dalšími dávkami. */
const BASELINE_NATVRDO = {};

const args = process.argv.slice(2);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name)) yield p;
  }
}

// ---------------------------------------------------------------------------
// --rename

if (args[0] === '--rename') {
  const [, stara, nova] = args;
  if (!stara || !nova) { console.error('Použití: --rename "stará věta" "nová věta"'); process.exit(2); }
  let zmen = 0;
  for (const j of JAZYKY) for (const f of readdirSync(`locales/${j}`).filter(x => x.endsWith('.json'))) {
    const cesta = `locales/${j}/${f}`;
    const d = JSON.parse(readFileSync(cesta, 'utf8'));
    let zmeneno = false;
    for (const k of Object.keys(d)) {
      const [zaklad, ctx] = k.split('|');
      if (zaklad === stara) { d[nova + (ctx ? `|${ctx}` : '')] = d[k]; delete d[k]; zmeneno = true; zmen++; }
    }
    if (zmeneno) writeFileSync(cesta, JSON.stringify(Object.fromEntries(Object.entries(d).sort(([a], [b]) => (a < b ? -1 : 1))), null, 2) + '\n');
  }
  let vKodu = 0;
  for (const root of ROOTS) for (const f of walk(root)) {
    const src = readFileSync(f, 'utf8');
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(\\bt\\(\\s*)'${esc(stara.replace(/'/g, "\\'"))}'`, 'g');
    if (re.test(src)) { writeFileSync(f, src.replace(re, `$1'${nova.replace(/'/g, "\\'")}'`)); vKodu++; }
  }
  console.log(`check-i18n --rename: ${zmen} klíčů ve slovnících, ${vKodu} souborů v kódu.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
let _wz;
function widgetyZdroj(klic) {
  _wz ??= [...walk('components/widgety'), 'lib/rozvrhPrehled.ts', 'lib/procedureScoring.ts'].map(f => readFileSync(f, 'utf8')).join('\n');
  const k = klic.split('|')[0];
  return _wz.includes(`'${k.replace(/'/g, "\\'")}'`) || _wz.includes(`"${k}"`) || _wz.includes(`\`${k}\``);
}

// Klíče z kódu

const RE_SEKCE = /\buseT\(\s*'([a-z-]+)'\s*\)/;
const RE_GETT = /\bgetT\(\s*\[\s*'([a-z-]+)'/;
const RE_KLIC = /(?<![\w.])t\(\s*'((?:[^'\\]|\\.)*)'(?:\s*,\s*(?:undefined|\{[^}]*\})\s*,\s*'([a-z]+)')?/g;

const zKodu = {};          // sekce → Map(klíč → [soubory])
const prelozeneSoubory = new Set();
for (const root of ROOTS) for (const f of walk(root)) {
  const rel = relative('.', f);
  if (rel.startsWith('lib/i18n/')) continue;
  const src = readFileSync(f, 'utf8');
  const sek = src.match(RE_SEKCE)?.[1] ?? src.match(RE_GETT)?.[1] ?? 'common';
  let nalezeno = false;
  for (const m of src.matchAll(RE_KLIC)) {
    const klic = m[1].replace(/\\'/g, "'") + (m[2] ? `|${m[2]}` : '');
    if (!/\p{L}/u.test(klic)) continue;
    ((zKodu[sek] ??= new Map()).get(klic) ?? (zKodu[sek].set(klic, []), zKodu[sek].get(klic))).push(rel);
    nalezeno = true;
  }
  // Ráčna natvrdo psaných textů hlídá jen plně přeložené oblasti (host, přihlášení); slupka aplikace
  // (layouty, Nastavení) je přeložená jen zčásti a tvoří ji většinou česká správa.
  if ((nalezeno || RE_SEKCE.test(src)) && (sek === 'auth' || sek === 'klient-host' || sek === 'zamestnanec' || sek === 'kiosk' || sek === 'chat')) prelozeneSoubory.add(rel);
  if ((nalezeno || RE_SEKCE.test(src)) && ['sprava', 'tym', 'navody', 'postupy'].includes(sek)) prelozeneSoubory.add(rel); // správa podniku (vedení)
}

// Data, která se překládají podle textu a v kódu nejsou jako `t('…')` (volání je nepřímé).
const pridej = (sek, klic, kde) => { ((zKodu[sek] ??= new Map()).get(klic) ?? (zKodu[sek].set(klic, []), zKodu[sek].get(klic))).push(kde); };
for (const t of NAV_TEXTY) pridej('common', `${t}|nav`, 'lib/navigace.ts (NAV_TEXTY)');
for (const s of Object.values(RES_STATUS)) pridej('klient-host', s.label, 'lib/clientSlots.ts (RES_STATUS)');
for (const n of [0, 10, 25, 100]) pridej('klient-host', tierFor(n, { platinumAt: 100 }).label, 'lib/clientSlots.ts (tierFor)');
{
  const bp = readFileSync('components/client/BusinessPage.tsx', 'utf8');
  const m = bp.match(/const ORDER_LABEL[^=]*=\s*\{([^}]*)\}/);
  if (m) for (const v of m[1].matchAll(/:\s*'([^']+)'/g)) pridej('klient-host', v[1], 'BusinessPage.tsx (ORDER_LABEL)');
}
// Texty z datových tabulek, které komponenty překládají podle textu (`t(data.nazev)`):
// průvodce (lib/pruvodce, foto.ts), předplatné (lib/plan), důvody nahlášení (lib/moderace).
{
  const typy = await import('../lib/pruvodce/typy.ts');
  const predv = await import('../lib/pruvodce/predvolby.ts');
  const foto = await import('../components/pruvodce/foto.ts');
  const plan = await import('../lib/plan.ts');
  const moder = await import('../lib/moderace.ts');
  const PV = 'lib/pruvodce (tabulky průvodce)';
  for (const d of typy.TYPY) { pridej('pruvodce', d.nazev, PV); pridej('pruvodce', d.veta, PV); }
  for (const c of typy.CILE) { pridej('pruvodce', c.nazev, PV); pridej('pruvodce', c.veta, PV); pridej('pruvodce', c.ukazka, PV); }
  for (const v of Object.values(typy.NAZEV_ZEME)) pridej('pruvodce', v, PV);
  for (const v of Object.values(typy.NAZEV_VELIKOSTI)) pridej('pruvodce', v, PV);
  for (const p of predv.PREDVOLBY_DOBY) { pridej('pruvodce', p.nazev, PV); pridej('pruvodce', p.popis, PV); }
  for (const d of predv.DNY_DLOUHE) pridej('pruvodce', d, PV);
  for (const f of Object.values(foto.FOTKY)) pridej('pruvodce', f.alt, PV);
  // Shrnutí a finále: názvy operací a řádků (lib/pruvodce/plan.ts) a věta o pravidlech rozvrhu.
  const planPv = readFileSync('lib/pruvodce/plan.ts', 'utf8');
  for (const v of (planPv.match(/const NAZVY_OPERACI[^=]*=\s*\{([^}]*)\}/)?.[1] ?? '').matchAll(/:\s*'([^']+)'/g)) pridej('pruvodce', v[1], PV);
  pridej('pruvodce', 'Nejvýš šest dní v řadě', PV);
  // Výchozí obsah, který průvodce zakládá v jazyce majitele (server ho překládá přes slovník pruvodce):
  // pozice pozvaných, typy směn, kategorie skladu, postupy (název, popis, kroky), poznámky a počty výsledku.
  const plan2 = await import('../lib/pruvodce/plan.ts');
  for (const v of Object.values(predv.POZICE)) pridej('pruvodce', v, PV);
  for (const typ of Object.keys(predv.POZICE)) {
    for (const s of predv.navrhniSmeny(typ, predv.vychoziDoba(typ))) pridej('pruvodce', s.name, PV);
    for (const k of predv.KATEGORIE_SKLADU[typ]) pridej('pruvodce', k, PV);
    for (const p of predv.POSTUPY[typ]) { pridej('pruvodce', p.name, PV); pridej('pruvodce', p.description, PV); for (const k of p.kroky) pridej('pruvodce', k, PV); }
  }
  for (const v of Object.values(plan2.POZNAMKY)) pridej('pruvodce', v, PV);
  for (const v of Object.values(plan2.POCTY)) pridej('pruvodce', v, PV);
  for (const v of Object.values(plan2.KDE_V_NASTAVENI)) pridej('pruvodce', v, PV);
  // Věty, které UI překládá podle textu z modulu (ne přes t('…') přímo).
  {
    const rz = await import('../components/role/rozepsano.ts');
    pridej('spolecne', rz.CO_SE_ZAHODI_ROLE, 'components/role/rozepsano.ts');
    pridej('spolecne', rz.CO_SE_ZAHODI_NAVRH, 'components/role/rozepsano.ts');
  }
  // Předplatné: srovnání tarifů (popisky a textové buňky) a výčet toho, co přidává Max.
  const PL = 'lib/plan.ts (PLAN_FEATURES)';
  for (const f of plan.PLAN_FEATURES) {
    for (const s of ['predplatne']) {
      pridej(s, f.label, PL);
      for (const v of [f.free, f.pro, f.max]) if (typeof v === 'string') pridej(s, v, PL);
    }
  }
  for (const x of plan.MAX_EXTRAS) { pridej('spolecne', x, PL); pridej('predplatne', x, PL); }
  for (const d of moder.DUVODY) pridej('spolecne', d.nazev, 'lib/moderace.ts (DUVODY)');
}

// Prodejní stránka: texty z components/landing/obsah.ts a ze scén živé ukázky se kreslí přes
// `t(data.text)` ze slovníku landing; popisy nahrávek (pro odečítač) taky.
{
  const ob = await import('../components/landing/obsah.ts');
  const sc = await import('../components/landing/ukazka/scenare.ts');
  const LD = 'components/landing (obsah.ts, scenare.ts, nahravky.ts)';
  for (const x of ob.vsechnyTexty()) pridej('landing', x, LD);
  for (const x of sc.vsechnyTextyUkazky()) pridej('landing', x, LD);
  const nahr = readFileSync('components/landing/nahravky.ts', 'utf8');
  for (const m of nahr.matchAll(/popis:\s*'([^']+)'/g)) pridej('landing', m[1], LD);
}

// Katalog widgetů a stránek s plochou: texty z dat se v UI překládají podle textu (`t(definice.nazev)`),
// takže v kódu nejsou jako `t('…')` a bez téhle ruční extrakce by je kontrola neviděla.
{
  const kat = await import('../lib/widgety/katalog/index.ts');
  const str = await import('../lib/widgety/stranky/index.ts');
  const KW = 'lib/widgety/katalog (nazev, popis, nastaveni)';
  const v = (x) => { if (typeof x === 'string' && /\p{L}/u.test(x)) pridej('widgety', x, KW); };
  for (const o of kat.OBLASTI) v(o.nazev);
  for (const w of kat.KATALOG_WIDGETU) {
    v(w.nazev); v(w.popis);
    for (const n of w.nastaveni ?? []) {
      v(n.nazev); v(n.napoveda); v(n.jednotka); v(n.prazdne);
      for (const m of n.moznosti ?? []) v(m.nazev);
    }
  }
  for (const st of str.STRANKY) {
    v(st.nazev);
    if (st.nastroj) { v(st.nastroj.nazev); v(st.nastroj.popis); }
  }
  // Názvy rozsahů rozložení (lib/widgety/rozlozeniDb.ts NAZEV_TYPU) a systémové role se překládají podle textu.
  for (const x of ['Celé vedení', 'Všichni zaměstnanci', 'Všechny tablety']) pridej('widgety', x, 'lib/widgety/rozlozeniDb.ts (NAZEV_TYPU)');
  const ok = await import('../lib/opravneniKatalog.ts');
  for (const r of ok.SYSTEMOVE_ROLE) v(r.nazev);
  // Hlášky hooků widgetů jdou přes apiMessage → slovník `api`.
  for (const x of ['Rozložení se nenačetlo.', 'Rozložení se nepodařilo uložit.', 'Výchozí rozložení se nepodařilo obnovit.', 'Data se nenačetla.', 'Data mají nečekaný tvar.']) pridej('api', x, 'components/widgety/useRozlozeni.ts, useDataWidgetu.ts');
}

// Hlášky serveru: věty v `error: '…'` hostovských rout, statusMessage a blokace/middleware.
const apiKlice = new Set();
const apiVynechat = new Set();
const apiZdroje = [];
for (const dir of ['app/api/client']) for (const f of walk(dir)) if (!/\/(admin|staff|pos|img)\//.test(f)) apiZdroje.push(f);
// Rozvrh, sklad, inventura, receptury a pokladní zásoby: komponenty ukazují `error` z těchhle rout přes tg().
for (const dir of ['schedule', 'inventory', 'stocktake', 'shift-types', 'fixed-assignments', 'recipes', 'production', 'pos/usage', 'pos/sync', 'pos/products', 'opening-hours', 'closings']) {
  const cesta = `app/api/${dir}`;
  if (existsSync(cesta)) for (const f of walk(cesta)) apiZdroje.push(f);
}
apiZdroje.push('lib/api.ts', 'lib/blokace.ts', 'middleware.ts', 'lib/client.ts');
// Hlášky rout, které zobrazují společné komponenty (obnova hesla, smazání účtu, nahlášení, blokace, platby).
apiZdroje.push(
  'app/api/account/route.ts', 'app/api/account/heslo/route.ts', 'app/api/account/heslo/obnovit/route.ts',
  'app/api/account/delete-confirm/route.ts', 'app/api/account/delete-request/route.ts',
  'app/api/reports/route.ts', 'app/api/reports/[id]/route.ts', 'app/api/blocks/route.ts',
  'app/api/billing/checkout/route.ts', 'app/api/billing/portal/route.ts', 'app/api/billing/status/route.ts', 'app/api/billing/upgrade/route.ts',
  'lib/moderace.ts', 'lib/smazaniUctu.ts', 'lib/smazaniUctuDb.ts',
);
for (const f of apiZdroje) {
  if (!existsSync(f)) continue;
  for (const m of readFileSync(f, 'utf8').matchAll(/(?:error|ZPRAVA_423|NEPLATNY|zprava)(?::|\s*=)\s*'((?:[^'\\]|\\.)*)'/g)) apiKlice.add(m[1].replace(/\\'/g, "'"));
  // Věta se šablonou `${…}` se nepřekládá (jméno by se dosadilo do cizího textu); hláška o /api/init je pro správce.
  for (const m of readFileSync(f, 'utf8').matchAll(/error:\s*'((?:[^'\\]|\\.)*)'/g)) if (/\/api\/init/.test(m[1])) apiVynechat.add(m[1].replace(/\\'/g, "'"));
  for (const m of readFileSync(f, 'utf8').matchAll(/return '([^']+)';/g)) if (f === 'lib/api.ts') apiKlice.add(m[1]);
}
apiKlice.add('Načtení se nepovedlo.'); apiKlice.add('Server odpověděl {status}.');
// Věty, které server vrací jako pole varování (smazání účtu) nebo jako záložní hlášku `verejnaHlaska(e, '…')`.
for (const k of [
  'Platby nejsou nastavené, předplatné a zákazníka ve Stripe nešlo zrušit. Napište podpoře, dokončíme to ručně.',
  'Soubory v úložišti se nepodařilo smazat (úložiště není nastavené). Napište podpoře.',
  'Některé nahrané soubory se nepodařilo smazat z úložiště. Napište podpoře, dokončíme to ručně.',
  'Portál se nepodařilo otevřít.',
]) apiKlice.add(k);
// Zpráva, která nekončí větou (začátek sestavované věty „Vyber den od dneška do “), se nepřekládá.
const apiPouzite = [...apiKlice].filter(k => !apiVynechat.has(k) && !/\s$/.test(k) && /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(k));

// ---------------------------------------------------------------------------
// Slovníky

const meta = JSON.parse(readFileSync('locales/_meta.json', 'utf8'));
const chyby = [];
const varovani = [];
const nacti = (j, s) => { const p = `locales/${j}/${s}.json`; return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };

function podobnost(a, b) {
  const bi = s => { const r = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); r.set(g, (r.get(g) ?? 0) + 1); } return r; };
  const A = bi(a), B = bi(b); let shoda = 0;
  for (const [g, n] of A) shoda += Math.min(n, B.get(g) ?? 0);
  return (2 * shoda) / Math.max(1, (a.length - 1) + (b.length - 1));
}

const sekce = new Set([...Object.keys(zKodu), 'api', ...JAZYKY.flatMap(j => existsSync(`locales/${j}`) ? readdirSync(`locales/${j}`).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)) : [])]);
let kontrolovano = 0;
for (const s of sekce) {
  const vKodu = s === 'api' ? new Set(apiPouzite) : new Set((zKodu[s] ?? new Map()).keys());
  for (const j of JAZYKY) {
    const slov = nacti(j, s);
    const hotovo = !!meta.revize?.[j]?.[s];
    const hlas = (zprava) => (hotovo ? chyby : varovani).push(`${j}/${s}: ${zprava}`);
    if (!slov) { if (vKodu.size) hlas(`chybí celý soubor locales/${j}/${s}.json (${vKodu.size} vět)`); continue; }
    const klice = new Set(Object.keys(slov));
    const chybejici = [...vKodu].filter(k => !klice.has(k));
    // Widgety překládají část vět nepřímo (`t(proměnná)` nad tabulkami textů v komponentách): klíč, který stojí
    // v uvozovkách někde v components/widgety, se za zastaralý nepovažuje.
    const zastarale = [...klice].filter(k => !vKodu.has(k) && !(s === 'widgety' && widgetyZdroj(k)));
    for (const k of chybejici) {
      const podobna = zastarale.map(z => [z, podobnost(z, k)]).sort((a, b) => b[1] - a[1])[0];
      hlas(`chybí překlad „${k}“${podobna && podobna[1] > 0.6 ? `\n      ↳ změněná věta? ve slovníku je „${podobna[0]}“ (${Math.round(podobna[1] * 100)} %); přenes ji: --rename "${podobna[0]}" "${k}"` : ''}`);
    }
    for (const k of zastarale) if (!chybejici.some(c => podobnost(k, c) > 0.6)) chyby.push(`${j}/${s}: zastaralý klíč „${k}“ (v kódu není)`);
    for (const [k, v] of Object.entries(slov)) {
      kontrolovano++;
      const cs = k.split('|')[0];
      if (typeof v !== 'string' || v.trim() === '') { chyby.push(`${j}/${s}: prázdný překlad „${k}“`); continue; }
      if (/<[a-z/!]|&[#a-z0-9]+;/i.test(v)) chyby.push(`${j}/${s}: HTML ve zprávě „${k}“ (překlad je prostý text)`);
      if (JSON.stringify(jmenaVeZprave(cs)) !== JSON.stringify(jmenaVeZprave(v))) chyby.push(`${j}/${s}: jiné {parametry} než česká věta „${k}“ → ${JSON.stringify(jmenaVeZprave(v))} místo ${JSON.stringify(jmenaVeZprave(cs))}`);
      const potreba = j === 'pl' ? ['one', 'few', 'many', 'other'] : j === 'sk' ? ['one', 'few', 'other'] : ['one', 'other'];
      for (const bloky of pluralSelektory(v)) if (!potreba.every(p => bloky.includes(p))) chyby.push(`${j}/${s}: plurál bez tvarů ${potreba.join('/')} „${k}“`);
      if (cs.length < 25 && !/plural,/.test(cs + v) && v.length > cs.length * 2.5 && v.length > 14) varovani.push(`${j}/${s}: překlad „${v}“ je ${(v.length / cs.length).toFixed(1)}× delší než „${cs}“ (tlačítko na 390 px?)`);
    }
  }
}
// Slovník za běhu je plochý (věta → překlad bez ohledu na sekci): stejná česká věta ve dvou
// sekcích musí mít stejný překlad, jinak vyhraje ta, která se načetla dřív. Jiný význam = jiný kontext:
// t('Zrušit', undefined, 'dialog').
for (const j of JAZYKY) {
  const videno = new Map();
  for (const s of sekce) {
    const slov = nacti(j, s);
    if (!slov) continue;
    for (const [k, v] of Object.entries(slov)) {
      const dr = videno.get(k);
      if (!dr) videno.set(k, [s, JSON.stringify(v)]);
      else if (dr[1] !== JSON.stringify(v)) chyby.push(`${j}: věta „${k}“ má v sekci ${dr[0]} a ${s} jiný překlad (${dr[1]} × ${JSON.stringify(v)}); sjednoť, nebo dej jednomu z použití kontext t('…', undefined, 'ctx')`);
    }
  }
}
// hlášky serveru musí být v kódu opravdu přítomné (slovník `api` nenese věty, které nikdo neposílá)
for (const j of JAZYKY) {
  const slov = nacti(j, 'api');
  if (!slov) continue;
  const korpus = apiZdroje.filter(existsSync).map(f => readFileSync(f, 'utf8')).join('\n');
  for (const k of Object.keys(slov)) if (!korpus.includes(k.replace(/'/g, "\\'")) && !korpus.includes(k)) chyby.push(`${j}/api: klíč „${k}“ v hostovských routách není (zastaralý?)`);
  break;
}

// ---------------------------------------------------------------------------
// Ráčny

// 4. natvrdo české řetězce v přeložených souborech
const RE_DIAKRITIKA = /[ěščřžýáíéúůďťňĚŠČŘŽÝÁÍÉÚŮĎŤŇ]/;
/** Odstraní z řádku volání t(…) včetně vnořených závorek (argument smí obsahovat české řetězce jako klíče). */
function bezVolaniT(r) {
  let out = '';
  for (let i = 0; i < r.length; i++) {
    if (r[i] === 't' && r[i + 1] === '(' && !/[\w.]/.test(r[i - 1] ?? ' ')) {
      let hloubka = 0, k = i + 1;
      for (; k < r.length; k++) { if (r[k] === '(') hloubka++; else if (r[k] === ')') { hloubka--; if (hloubka === 0) break; } }
      i = k; continue;
    }
    out += r[i];
  }
  return out;
}
function natvrdo(src, vypis) {
  let n = 0;
  // Komentáře (i víceřádkové a JSX) pryč, počet řádků zůstane; značka `i18n-ok` se hledá v původním řádku.
  const puvodni = src.split('\n');
  const bezKomentaru = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).split('\n');
  bezKomentaru.forEach((radek, i) => {
    const r = radek.trim();
    if (!RE_DIAKRITIKA.test(r) || r.startsWith('//') || /i18n-ok/.test(puvodni[i])) return;
    const bezT = bezVolaniT(r).replace(/\/\/.*$/, '');
    if (/^(import|export) /.test(bezT)) return;
    if (/(['"`])(?:\\.|(?!\1)[^\\])*[ěščřžýáíéúůďťňĚŠČŘŽÝÁÍÉÚŮĎŤŇ](?:\\.|(?!\1)[^\\])*\1/.test(bezT) || />[^<>{}]*[ěščřžýáíéúůďťňĚŠČŘŽÝÁÍÉÚŮĎŤŇ][^<>{}]*</.test(bezT)) {
      n++;
      if (vypis) console.log('  natvrdo: ' + r.slice(0, 110));
    }
  });
  return n;
}
const natvrdoZmereno = {};
for (const f of prelozeneSoubory) {
  if (!existsSync(f)) continue;
  if (args.includes('--detail')) console.log(f);
  natvrdoZmereno[f] = natvrdo(readFileSync(f, 'utf8'), args.includes('--detail'));
}
for (const [f, n] of Object.entries(natvrdoZmereno)) {
  const povoleno = BASELINE_NATVRDO[f];
  if (povoleno === undefined) { if (n > 0) chyby.push(`${f}: nový přeložený soubor má ${n} natvrdo psaných českých řetězců (přidej do BASELINE_NATVRDO nebo je převeď na t())`); }
  else if (n > povoleno) chyby.push(`${f}: natvrdo psaných českých řetězců ${n} (povoleno ${povoleno}); nový text patří do t('…')`);
  else if (n < povoleno) chyby.push(`${f}: natvrdo psaných řetězců ubylo (${n} místo ${povoleno}); sniž BASELINE_NATVRDO, ať ráčna drží`);
}

// 4a. Kořenový layout posílá klientovi VŠECHNY sekce (SEKCE_VZDY = SEKCE). Slovníky se na serveru sdílejí mezi požadavky,
// takže jakákoli menší sada nechá SSR přeložit větu, kterou prohlížeč nemá: chyba hydratace #418 a probliknutí češtiny.
{
  const src = readFileSync('lib/i18n/slovniky.ts', 'utf8');
  if (!/export const SEKCE_VZDY[^=]*=\s*SEKCE\s*;/.test(src)) chyby.push('lib/i18n/slovniky.ts: SEKCE_VZDY musí být přesně SEKCE (viz komentář u SEKCE_VZDY: jiná sada rozjede SSR a hydrataci)');
}
// 4b. Sekce správy (sprava, tym, navody, postupy) se v aplikaci slévají do jednoho slovníku
// (pozdější přepisuje dřívější). Stejný klíč s jinou hodnotou v jiné sekci by se proto ukázal
// v jiném významu podle pořadí načtení; dvojí význam patří do klíče s kontextem (`t('Odložit', {}, 'sklad')`).
const SKUPINA_SPRAVY = ['sprava', 'tym', 'navody', 'postupy'];
for (const j of JAZYKY) {
  const videno = new Map();
  for (const sek of SKUPINA_SPRAVY) {
    const slov = nacti(j, sek);
    if (!slov) continue;
    for (const [k, v] of Object.entries(slov)) {
      const d = videno.get(k);
      if (d && d.v !== v) chyby.push(`${j}: klíč „${k}“ má jiný překlad v sekci ${d.s} („${d.v}“) a ${sek} („${v}“); dvojí význam patří do kontextu t('…', {}, 'ctx')`);
      else if (!d) videno.set(k, { s: sek, v });
    }
  }
}
// 4c. České věty v uvozovkách mimo t(), které ale ve slovníku jsou (label: 'Ze skladu'): zapomenuté t().
{
  const klice = new Set();
  for (const sek of SKUPINA_SPRAVY) for (const k of Object.keys(nacti('en', sek) ?? {})) if (!k.includes('|') && /\p{L}{3}/u.test(k)) klice.add(k);
  for (const f of prelozeneSoubory) {
    if (!existsSync(f)) continue;
    const src = readFileSync(f, 'utf8');
    const puvodni = src.split('\n');
    const bezKomentaru = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).split('\n');
    bezKomentaru.forEach((radek, i) => {
      const r = radek.trim();
      if (r.startsWith('//') || /i18n-ok/.test(puvodni[i]) || /^(import|export) /.test(r)) return;
      const bezT = bezVolaniT(r).replace(/\/\/.*$/, '');
      for (const m of bezT.matchAll(/'((?:[^'\\]|\\.)*)'/g)) {
        const text = m[1].replace(/\\'/g, "'");
        // Holé ASCII slovo malými písmeny ('postup', 'ukol') je interní identifikátor typu, ne text pro člověka.
        if (/^[a-z0-9_-]+$/.test(text)) continue;
        if (klice.has(text)) chyby.push(`${f}:${i + 1}: „${text}“ je ve slovníku, ale stojí v uvozovkách mimo t('…'); obal ho t() (nebo označ řádek i18n-ok)`);
      }
    });
  }
}

// 5. staré konstrukce
let csCz = 0;
for (const root of ROOTS) for (const f of walk(root)) {
  const rel = relative('.', f);
  if (rel.startsWith('lib/i18n/') || rel === 'lib/money.ts') continue;
  csCz += (readFileSync(f, 'utf8').match(/'cs-CZ'|"cs-CZ"/g) ?? []).length;
}
if (csCz > BASELINE_CS_CZ) chyby.push(`'cs-CZ' natvrdo: ${csCz} výskytů (povoleno ${BASELINE_CS_CZ}); datum a čas se formátují přes lib/i18n/format s jazykem`);
else if (csCz < BASELINE_CS_CZ) chyby.push(`'cs-CZ' ubylo (${csCz} místo ${BASELINE_CS_CZ}); sniž BASELINE_CS_CZ v check-i18n.mjs`);

const VYJIMKY_LANG = new Set(['app/global-error.tsx', 'app/api/client/admin/tables/qr/route.ts']);
for (const root of ['app', 'components']) for (const f of walk(root)) {
  const rel = relative('.', f);
  if (VYJIMKY_LANG.has(rel)) continue;
  if (/<html\s[^>]*lang="cs"/.test(readFileSync(f, 'utf8'))) chyby.push(`${rel}: <html lang="cs"> natvrdo; jazyk dokumentu bere layout z cookie`);
}
for (const f of [...walk('app'), ...walk('components')]) {
  const src = readFileSync(f, 'utf8');
  if (/dangerouslySetInnerHTML[^}]*\bt\(/.test(src)) chyby.push(`${relative('.', f)}: překlad (t()) se nesmí vkládat přes dangerouslySetInnerHTML`);
}

// ---------------------------------------------------------------------------

if (varovani.length) {
  console.log(`\ncheck-i18n: ${varovani.length} varování`);
  for (const v of varovani.slice(0, 25)) console.log('  ! ' + v);
  if (varovani.length > 25) console.log(`  … a ${varovani.length - 25} dalších`);
}
if (chyby.length) {
  console.error(`\ncheck-i18n: ${chyby.length} ${chyby.length === 1 ? 'chyba' : 'chyb'}\n`);
  for (const c of chyby.slice(0, Number(process.env.CHECK_MAX ?? 60))) console.error('  ' + c);
  if (chyby.length > 60) console.error(`  … a ${chyby.length - 60} dalších`);
  console.error('\nČeská věta je klíč: změníš-li ji v kódu, přenes překlad (--rename) nebo ho doplň ve všech jazycích.\n');
  process.exit(1);
}
console.log(`check-i18n: v pořádku — ${kontrolovano} překladů v ${sekce.size} sekcích × ${JAZYKY.length} jazycích, natvrdo psaných textů nepřibývá, 'cs-CZ' ${csCz}.`);
