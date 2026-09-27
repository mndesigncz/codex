// Kolo 69, rámcové opravy B0 — věci, které balíky nahlásily a nesměly
// opravit, protože soubory rámce byly zamčené.
//
// Komponenty jsou .tsx a Node si JSX sám neodloupne, proto se tu většina
// hlídá nad zdrojákem: jde o to, aby se obchvaty (prázdný ocas, šipka jen
// od `sm`, vlastní SVG sponky) nevrátily. Čistou funkci `inicialy` z Avataru
// vyřízneme a spustíme — logika jmen je to jediné, co tu má vstupy a výstupy.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as modul from 'node:module';
import type { Testy } from './_testy.ts';

// @types/node v repu je starší než Node 22.13, který funkci přinesl.
const { stripTypeScriptTypes } = modul as unknown as { stripTypeScriptTypes: (kod: string) => string };

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

/** Všechny .ts/.tsx pod složkou (bez node_modules). */
function soubory(koren: string): string[] {
  const ven: string[] = [];
  const projdi = (dir: string) => {
    for (const jmeno of readdirSync(dir)) {
      if (jmeno === 'node_modules') continue;
      const cesta = join(dir, jmeno);
      if (statSync(cesta).isDirectory()) projdi(cesta);
      else if (/\.tsx?$/.test(jmeno)) ven.push(cesta);
    }
  };
  projdi(koren);
  return ven;
}

export default function ({ eq, ok }: Testy) {
  // ---- 1) ListRow: prázdný ocas se nekreslí, šipka zůstává u názvu ----
  const listRow = cti('components/ui/ListRow.tsx');
  ok('ListRow: ocas se kreslí jen s obsahem', /\{maOcas && <span className=\{`list-tail/.test(listRow));
  ok('ListRow: žádný nepodmíněný <span className="list-tail">', !listRow.includes('<span className="list-tail">'));
  const css = cti('app/globals.css');
  const mobil = css.slice(css.indexOf('@media (max-width: 640px)', css.indexOf('.list-tail { display: contents; }')));
  ok('globals.css: na telefonu jde ocas za šipku (order: 1)', /\.list-tail \{[^}]*order: 1/.test(mobil.slice(0, 1200)));
  ok('globals.css: ocas jen se skrytým doplňkem se na telefonu nekreslí', /\.list-tail-tichy \{ display: none; \}/.test(mobil.slice(0, 1200)));

  const koren = new URL('../../components', import.meta.url).pathname;
  const obchvaty = soubory(koren).filter(f => /list-tail:empty|BEZ_PRAZDNEHO_OCASU/.test(readFileSync(f, 'utf8')));
  eq('components: obchvat prázdného ocasu zmizel', obchvaty.map(f => f.slice(koren.length + 1)), []);

  const uzaverky = cti('components/widgety/oblasti/uzaverky.tsx');
  ok('uzávěrky: šipka řádku není schovaná na telefonu', !/name="chevron"[^>]*hidden sm:/.test(uzaverky) && !uzaverky.includes('function Sipka'));

  // ---- 2) Ikony Zpět a sponka ----
  const ikony = cti('components/Icons.tsx');
  ok('Icons: arrowLeft', /\n  arrowLeft: /.test(ikony));
  ok('Icons: paperclip', /\n  paperclip: /.test(ikony));
  for (const f of ['components/chat/ChatView.tsx', 'components/chat/MessengerDock.tsx']) {
    const src = cti(f);
    ok(`${f}: sponka ze sdílené sady, ne vlastní SVG`, !/function (Paperclip|File)Icon/.test(src) && src.includes('name="paperclip"'));
  }
  const klient = cti('components/client/ClientAdmin.tsx');
  ok('ClientAdmin: Zpět má šipku doleva, ne otočený chevron ani swap',
    !/icon="chevron"[^>]*rotate-90/.test(klient) && (klient.match(/icon="arrowLeft"/g) ?? []).length === 2 && klient.includes("label: 'Zpět do administrace', icon: 'arrowLeft'"));

  // ---- 3) Avatar s iniciálami ----
  const avatar = cti('components/ui/Avatar.tsx');
  const od = avatar.indexOf('export function inicialy');
  const kod = avatar.slice(od, avatar.indexOf('\n}\n', od) + 2).replace('export ', '');
  // eslint-disable-next-line no-new-func
  const inicialy = new Function(`${stripTypeScriptTypes(kod)}; return inicialy;`)() as (j: string | null | undefined) => string;
  eq('avatar: dvě slova → první písmena', inicialy('Martin Nemeškal'), 'MN');
  eq('avatar: jedno slovo → první dvě písmena', inicialy('martin'), 'MA');
  eq('avatar: tři slova → první a poslední', inicialy('Jana Nováková Dvořáková'), 'JD');
  eq('avatar: diakritika velkými písmeny', inicialy('šárka čermáková'), 'ŠČ');
  eq('avatar: mezery a nepísmena navíc', inicialy('  Eva  – (Host) '), 'EH');
  eq('avatar: prázdné jméno → nic (silueta)', [inicialy(''), inicialy(null), inicialy('  2  ')], ['', '', '']);
  ok('avatar: emoji má přednost před iniciálami', /const zkratka = has \? '' : inicialy\(name\)/.test(avatar));
  ok('avatar: kruh je bez title skrytý pro odečítač', avatar.includes('aria-hidden={title ? undefined : true}'));

  // ---- 4) Prázdný nástroj v mřížce ----
  const plocha = cti('components/widgety/PlochaWidgetu.tsx');
  ok('plocha: prázdnota nástroje se měří v DOM a hlásí jako skrytí',
    plocha.includes('new MutationObserver(zmer)') && plocha.includes('nahlasSkryti(el.childElementCount === 0')
    && plocha.includes('<div ref={obalNastroje} hidden={upravy}>'));
  ok('plocha: skrytí platí jen v klidu (v úpravách zůstane zástupce)', plocha.includes('const skrytaVKlidu = (p: PolozkaRozlozeni) => !upravy && (skryte.has(p.id)'));
}
