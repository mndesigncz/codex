// PIN tabletu (spuštění, balík S): nové 6 číslic, staré platí, pauza po pěti špatných.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { novyPin, pinKratky, tecekPinu, pinKompletni, poSpatnemPinu, zbyvaPauza, PIN_PAUZA_MS } from '../../lib/pinTabletu.ts';
import { RESET_SLOUPCU } from '../../lib/smazaniUctu.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  eq('nový PIN: 6 číslic projde', novyPin('123456'), { ok: true, pin: '123456' });
  eq('nový PIN: mezery a pomlčky se zahodí', novyPin('12 34-56'), { ok: true, pin: '123456' });
  ok('nový PIN: 4 číslice už ne', !novyPin('1234').ok);
  ok('nový PIN: 7 číslic ne (dřív se tiše ořízlo)', !novyPin('1234567').ok);
  eq('nový PIN: prázdné = smazat', [novyPin(null), novyPin('')], [{ ok: true, pin: null }, { ok: true, pin: null }]);
  ok('krátký: 4 a neznámá délka doporučit, 6 ne', pinKratky(4) && pinKratky(null) && pinKratky(5) && !pinKratky(6));
  eq('tečky: známá délka', [tecekPinu(4, 0), tecekPinu(6, 2)], [4, 6]);
  eq('tečky: neznámá roste 4 → 6', [tecekPinu(null, 0), tecekPinu(null, 5), tecekPinu(null, 9)], [4, 5, 6]);
  ok('kompletní: známá 4 jen přesně 4', pinKompletni(4, 4) && !pinKompletni(4, 5) && !pinKompletni(4, 3));
  ok('kompletní: neznámá 4–6', !pinKompletni(null, 3) && pinKompletni(null, 4) && pinKompletni(null, 6));

  const t0 = 1_000_000;
  let s = undefined as ReturnType<typeof poSpatnemPinu> | undefined;
  for (let i = 0; i < 4; i++) s = poSpatnemPinu(s, t0 + i);
  ok('pauza: čtyři špatné ještě ne', zbyvaPauza(s, t0 + 4) === 0 && s!.spatne === 4);
  s = poSpatnemPinu(s, t0 + 5);
  eq('pauza: pátý špatný = 30 s', zbyvaPauza(s, t0 + 5), 30);
  ok('pauza: po 30 s se smí znovu a počítá se od nuly', zbyvaPauza(s, t0 + 5 + PIN_PAUZA_MS) === 0 && s!.spatne === 0);
  ok('pauza: po pauze další čtyři ještě nezamknou', (() => { let x = s; for (let i = 0; i < 4; i++) x = poSpatnemPinu(x, t0 + PIN_PAUZA_MS + 10 + i); return zbyvaPauza(x, t0 + PIN_PAUZA_MS + 20) === 0; })());

  const kiosk = cti('app/api/kiosk/route.ts');
  ok('server: nový PIN přes novyPin (6 číslic)', /const novy = novyPin\(b\.pin\)/.test(kiosk) && !/4–6 číslic/.test(kiosk));
  ok('server: PIN jen jako otisk, čitelný se nuluje', /SET pin_hash = \$\{pinHash\}, pin = NULL/.test(kiosk));
  const att = cti('app/api/attendance/route.ts');
  ok('píchnutí: čitelný PIN se po úspěchu převede a vynuluje', /SET pin_hash = \$\{nh\}, pin = NULL WHERE id = \$\{employeeId\}/.test(att));
  ok('píchnutí: server dál omezuje pokusy (5 za 10 min)', /hit\(`pin:\$\{employeeId\}`, 5, 10 \* 60, \{ failClosed: true \}\)/.test(att));
  ok('píchnutí: délka PINu se zapamatuje po správném zadání', /SET pin_delka = \$\{given\.length\}/.test(att));
  ok('roster: délku vidí jen tablet a dochazka.piny', /if \(otiskyProTablet \|\| opr\.has\('dochazka\.piny'\)\)/.test(att));
  const init = cti('app/api/init/route.ts');
  ok('init: jednorázově pin = NULL tam, kde je pin_hash', /UPDATE users SET pin = NULL WHERE pin IS NOT NULL AND pin_hash IS NOT NULL AND pin_hash <> ''/.test(init));
  ok('init: zbylé čitelné PINy se hašují po dávkách', /LIMIT 50/.test(init) && /bcryptPin\.hash/.test(init));
  ok('smazání účtu: pin_delka se vynuluje', RESET_SLOUPCU.some(([c]) => c === 'pin_delka'));
  const gate = cti('components/kiosk/KioskShiftGate.tsx');
  ok('tablet: pauza po pěti špatných i bez internetu', /overPinOffline\(member\.id, pin\)\)\) \{ spatnyPin\(\)/.test(gate) && /zbyvaPauza\(spatnePiny\.get\(member\.id\)/.test(gate));
}
