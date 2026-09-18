// Šedý text a drobné písmo — hlídač, aby se to nevrátilo.
//
// Kontrast se měří v prohlížeči, ne tady. Tenhle skript hlídá to, co se dá
// poznat ze zdroje: že nikdo nenapsal písmo menší než 11 px a že se
// nezavedly nové stupně šedé mimo ty, které mají v globals.css nastavenou
// čitelnou sytost. Zdrojová třída si dál nese svůj význam; kdo přidá nový
// stupeň, musí ho v globals.css taky doladit, jinak spadne pod normu tiše.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Strom se prochází ručně. Vzorec „components/**/*.tsx" v gitu vynechá
// soubory ležící přímo v components/ — z 86 jich viděl 67 a hlídač mlčel
// o zbytku. Stejnou past mají i ostatní kontroly obejitou takhle.
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(name)) files.push(full);
  }
})('components');
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.tsx?$/.test(name)) files.push(full);
  }
})('app');

const css = readFileSync('app/globals.css', 'utf8');
// Které stupně šedé mají ve světlém režimu narovnaný kontrast?
const fixed = new Set([...css.matchAll(/\.text-black\\\/(\d+)/g)].map(m => m[1]));

const SMALL = /text-\[([0-9]{1,2})px\]/g;
const GREY = /\btext-black\/(\d{1,3})\b/g;

// Inkoust zapsaný hexem s průhledností. Tmavý režim přepisuje `.text-[#16181A]`,
// ale `text-[#16181A]/75` je jiný název třídy — a ten nepřepíše nic, takže
// zůstane tmavý inkoust na tmavém podkladu. Naměřeno 1,01:1 v chatu
// a ve Financích, tedy text, který na obrazovce prostě není.
const HEX_INK = /\btext-\[#16181A\]\/(\d{1,3})\b/g;

// Nejsvětlejší tmavý podklad je sklo (zhruba +9 % bílé přes #17191C).
// Světlý inkoust #EDF2E4 na něm potřebuje aspoň 0,55, aby dal 4,5:1.
const TMAVE_MIN = 0.55;
const tmave = new Map();
for (const m of css.matchAll(/data-theme="dark"\]\s*\.text-black\\\/(\d{1,3})\s*\{[^}]*rgba\([^)]*?,\s*([0-9.]+)\s*\)/g)) {
  tmave.set(m[1], parseFloat(m[2]));
}

const problems = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(SMALL)) {
      const px = parseInt(m[1], 10);
      if (px < 11) problems.push(`${f}:${i + 1} — písmo ${px}px; nejmíň 11px, níž se to na telefonu nepřečte`);
    }
    for (const m of line.matchAll(HEX_INK)) {
      problems.push(`${f}:${i + 1} — text-[#16181A]/${m[1]} míjí přepis pro tmavý režim; napiš text-black/${m[1]}`);
    }
    for (const m of line.matchAll(GREY)) {
      const lvl = m[1];
      // Tmavý režim: stupeň musí mít přepis a ten musí být dost světlý.
      // Tohle tu dřív nebylo — kontrola ověřovala jen světlý režim, takže
      // `/25` prošla s narovnáním na 0,58 ve světlém a v tmavém spadla
      // na 0,30, což je 2,53:1.
      if (!tmave.has(lvl)) {
        problems.push(`${f}:${i + 1} — text-black/${lvl} nemá přepis pro tmavý režim (zůstane černá na tmavém)`);
      } else if (tmave.get(lvl) < TMAVE_MIN) {
        problems.push(`${f}:${i + 1} — text-black/${lvl} má v tmavém jen ${tmave.get(lvl)}; nejmíň ${TMAVE_MIN}, níž je to na skle pod 4,5:1`);
      }
      if (parseInt(lvl, 10) >= 55) continue;              // od 55 % výš je světlý režim v pořádku sám
      if (fixed.has(lvl)) continue;                        // globals.css tenhle stupeň narovnává
      problems.push(`${f}:${i + 1} — text-black/${lvl} nemá v globals.css narovnaný kontrast (na #F1F3ED by byl pod 4,5:1)`);
    }
  });
}

if (problems.length) {
  console.error('check-contrast-classes: nálezy\n' + problems.map(p => '  ' + p).join('\n'));
  process.exit(1);
}
console.log('check-contrast-classes: v pořádku — písmo aspoň 11px, šedé stupně narovnané.');
