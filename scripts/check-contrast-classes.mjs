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

const problems = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  src.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(SMALL)) {
      const px = parseInt(m[1], 10);
      if (px < 11) problems.push(`${f}:${i + 1} — písmo ${px}px; nejmíň 11px, níž se to na telefonu nepřečte`);
    }
    for (const m of line.matchAll(GREY)) {
      const lvl = m[1];
      if (parseInt(lvl, 10) >= 55) continue;              // od 55 % výš je to v pořádku samo
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
