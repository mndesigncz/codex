#!/usr/bin/env node
// Texty, které mluví o jednom konkrétním podniku.
//
// Managero se prodává kavárnám, restauracím, barům i čajovnám. Když
// v placeholderu svítí „Např. Sencha Gyokuro" nebo hlavička slibuje
// „Pro čajovny…", zákazník s bistrem si řekne, že to není pro něj —
// a má pravdu, protože to tak vypadá.
//
// Hlídáme jen text, který uvidí uživatel: řetězce v uvozovkách uvnitř
// komponent a stránek. Komentáře v kódu a data, která si člověk zadá
// sám (názvy položek, odměny, postupy), sem nepatří.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Slova vázaná na jeden druh provozu. „Čaj" samo o sobě v pořádku je —
// kavárna ho taky nalévá; problém je „čajovna" jako typ podniku
// a konkrétní čajový sortiment v ukázkách.
// Bez diakritiky taky: „cajovna.cz" v adrese e-mailu má stejnou váhu jako
// „čajovna" ve větě, a právě takhle přežila v `lib/push.ts` celé jedno kolo.
const WORDS = /([čc]ajovn\w*|pangea|sencha\w*|gyokuro|pu-?erh|matcha\w*|matchu|matchy|oolong|gunpowder|darjeeling)/i;

// Konvička v předmětu uvítacího e-mailu je totéž co „čajovna" v textu —
// nový člověk v pizzerii dostane do schránky čaj. Ostatní emoji jsou
// v pořádku; tenhle jeden je pozůstatek po jednom provozu.
const TEAPOT = /🍵/;
// Řetězec v uvozovkách nebo v JSX textu.
const STRING = /(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g;

const hits = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const file = join(dir, name);
    if (statSync(file).isDirectory()) { walk(file); continue; }
    if (!/\.(tsx|ts|html)$/.test(file)) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const code = line.trimStart();
      // Komentáře neřešíme — nejdou uživateli na oči.
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith('/*')) return;
      // Klíče localStorage si nesou starý název kvůli zpětné kompatibilitě.
      // `_STARY` je česká obdoba `_OLD`: klíč, který se pořád čte, aby
      // se lidem v provozu nezahodilo, co mají uložené v prohlížeči.
      if (/localStorage|COOKIE|LS_|_OLD|_STARY/.test(line)) return;
      // Vnitřní identifikátor není text. `id: 'pangea'` u barevné předlohy
      // se jmenuje „Zlatá a krémová" a to `id` nikdo nevidí; přejmenovat by
      // ho navíc znamenalo rozbít data podnikům, které si ji vybraly.
      if (/\bid:\s*['"`]/.test(line)) return;
      let m;
      STRING.lastIndex = 0;
      while ((m = STRING.exec(line))) {
        // Emoji, které si člověk vybírá jako avatara, je jeho volba, ne
        // text aplikace — konvička vedle ☕ a 🧋 v kavárně nikomu nevadí.
        // Hlídá se konvička ve větě, ne v nabídce obrázků.
        const onlyEmoji = !/[\p{L}\p{N}]/u.test(m[2]);
        if (onlyEmoji) continue;
        if (WORDS.test(m[2]) || TEAPOT.test(m[2])) {
          hits.push(`${relative('.', file)}:${i + 1}  „${m[2].slice(0, 70)}"`);
          break;
        }
      }
      // JSX text mimo uvozovky
      const jsxText = line.replace(/<[^>]*>/g, ' ');
      if (!hits.some(h => h.startsWith(`${relative('.', file)}:${i + 1}`)) && WORDS.test(jsxText) && !/import |from '/.test(line)) {
        hits.push(`${relative('.', file)}:${i + 1}  ${code.slice(0, 80)}`);
      }
    });
  }
};
walk('components');
walk('app');
// `lib/` se dlouho nehlídalo, a přitom právě tam žijí e-maily a push
// notifikace — tedy text, který zákazníkovi dorazí do schránky a na telefon,
// ne jen na obrazovku. Konvička v uvítacím e-mailu a `info@cajovna.cz`
// jako kontakt v každé notifikaci tak přežily celé kolo o univerzálních
// textech. Obrazovka není jediné místo, kde aplikace mluví.
walk('lib');
// `public/` se nehlídalo vůbec — a leží tam 300 kB ručně psaného HTML
// venkovního menu, které si podnik pověsí na iPad k chodníku. Je to živá
// funkce (QR na ni generuje editor menu), jen ji žádná kontrola neviděla,
// protože všechny chodily jen za `.ts` a `.tsx`. Pokrytí kontroly je
// součást kontroly: co neprojde, to se nekontroluje.
walk('public');

if (hits.length) {
  console.error('\nText mluví o jednom konkrétním typu podniku.');
  console.error('Aplikace se prodává kavárnám, restauracím i barům — ukázky a popisky musí sedět všem.\n');
  for (const h of hits) console.error('  ' + h);
  console.error(`\n${hits.length} ${hits.length === 1 ? 'místo' : 'míst'} k přepsání.\n`);
  process.exit(1);
}
console.log('check-generic-copy: v pořádku — texty nevážou aplikaci na jeden provoz.');
