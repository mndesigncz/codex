// Kolo 73a — drobnosti vzhledu na telefonu a malém okně: vodorovné přetečení a překryvy.
//
// Hlídá se kořen každé opravy z průzkumu `scripts/sondy/pruchod-hloubka.mjs`:
//  • výtisk (lib/printDoc) má viewport a lámání dlouhých slov, jinak ho telefon ukáže 980 px široký
//    a dlouhý název položky uřízne pravé sloupce tabulky,
//  • toast sedí nad dolním dokem (dok zapisuje --dok-vyska, toast ji čte),
//  • menu sekcí na landingu se ukazuje až od 1024 px (na 768 px se nevešlo a ořízlo „Vyzkoušet 30 dní zdarma"),
//  • mezisoučet bankovek v uzávěrce se na telefonu nevejde do řádku vedle počítadla,
//  • statická kontrola pevných šířek (scripts/check-pevne-sirky.mjs) skutečně chytá řádek, který se nevejde.

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Testy } from './_testy.ts';
import { printHtml } from '../../lib/printDoc.ts';

const cti = (cesta: string) => readFileSync(new URL('../../' + cesta, import.meta.url), 'utf8');

export default function ({ ok }: Testy) {
  // ---- výtisk ----
  const html = printHtml({ title: 'Rozvrh', body: '<table><tr><td>x</td></tr></table>' });
  ok('výtisk: viewport pro telefon (jinak 980 px široká stránka)', /<meta name="viewport" content="width=device-width, initial-scale=1">/.test(html));
  ok('výtisk: dlouhé slovo se láme i v buňce tabulky', /h1, h2, p, td, th, li \{ overflow-wrap: anywhere; \}/.test(html));
  ok('výtisk: široká tabulka se na telefonu posouvá sama', /@media screen and \(max-width: 700px\)[\s\S]*table \{ display: block; overflow-x: auto; \}/.test(html));

  // ---- toast nad dokem ----
  const css = cti('app/globals.css');
  ok('toast: spodní odsazení bere i výšku doku', /\.toast-misto \{ bottom: max\([^;]*var\(--dok-vyska, 0px\)/.test(css));
  const dock = cti('components/ui/Dock.tsx');
  ok('dok: zapisuje --dok-vyska a při odchodu ji maže', dock.includes("setProperty('--dok-vyska'") && dock.includes("removeProperty('--dok-vyska')"));

  // ---- landing: hlavička ----
  const hlavicka = cti('components/landing/LandingHeader.tsx');
  ok('landing: menu sekcí až od lg (na md se nevejde)', /<nav ref=\{nav\}[^>]*className="relative hidden lg:flex /.test(hlavicka) && !/hidden md:flex/.test(hlavicka));
  ok('landing: dlouhé tlačítko „Vyzkoušet … zdarma" jen tam, kde se vejde', hlavicka.includes('hidden sm:inline lg:hidden xl:inline'));

  // ---- uzávěrka: bankovky ----
  const uzaverka = cti('components/employee/CashClosing.tsx');
  ok('uzávěrka: pravý mezisoučet je jen od sm, na telefonu je pod nominálem', uzaverka.includes('hidden sm:block w-20 shrink-0') && uzaverka.includes('block sm:hidden text-[11px]'));

  // ---- tlačítko jen s ikonou ----
  const tlacitko = cti('components/ui/Button.tsx');
  const iconOnly = tlacitko.match(/const ICON_ONLY[^\n]*\n?[^\n]*/)?.[0] ?? '';
  ok('tlačítko s ikonou: všechny tři velikosti mají shrink-0 (vedle pole w-full se nesmrští)', (iconOnly.match(/px-0 shrink-0/g) ?? []).length === 3);

  // ---- statická kontrola pevných šířek ----
  const kontrola = join(process.cwd(), 'scripts', 'check-pevne-sirky.mjs');
  const spust = (zdroj: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'pevne-sirky-'));
    try {
      mkdirSync(join(dir, 'c'));
      writeFileSync(join(dir, 'c', 'X.tsx'), zdroj);
      return spawnSync(process.execPath, [kontrola], { env: { ...process.env, PEVNE_SIRKY_KOREN: join(dir, 'c') }, encoding: 'utf8', cwd: process.cwd() });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  };
  const spatny = `export const X = () => (
    <div className="flex items-center gap-2 px-3">
      <span className="w-16 shrink-0">2000</span>
      <div className="flex items-center gap-1">
        <button className="w-9 h-9">-</button><input className="w-14" /><button className="w-9 h-9">+</button>
      </div>
      <span className="w-20 shrink-0">4 000 Kč</span>
      <span className="w-20 shrink-0">navíc</span>
    </div>);`;
  const r1 = spust(spatny);
  ok('pevné šířky: řádek 64+136+80+80 px se nevejde na 320 px', r1.status === 1 && /řádek s pevnými šířkami/.test(r1.stderr));
  const dobry = spatny.replace('<span className="w-20 shrink-0">4 000 Kč</span>', '<span className="hidden sm:block w-20 shrink-0">4 000 Kč</span>')
    .replace('<span className="w-20 shrink-0">navíc</span>', '');
  const r2 = spust(dobry);
  ok('pevné šířky: stejný řádek s mezisoučtem jen od sm projde', r2.status === 0);
  const scBreakpoint = spust(`export const X = () => <div className="flex gap-2"><span className="w-40 shrink-0 sm:w-10">a</span><span className="w-40 shrink-0 sm:w-10">b</span></div>;`);
  ok('pevné šířky: 2 × w-40 = 320 px nad limitem, prefix sm: se na telefonu nepočítá', scBreakpoint.status === 1);
  const zalamovany = spust(`export const X = () => <div className="flex flex-wrap gap-2"><span className="w-40 shrink-0">a</span><span className="w-40 shrink-0">b</span></div>;`);
  ok('pevné šířky: flex-wrap se nepočítá', zalamovany.status === 0);
  const scroller = spust(`export const X = () => <div className="flex gap-2 overflow-x-auto"><span className="w-40 shrink-0">a</span><span className="w-40 shrink-0">b</span></div>;`);
  ok('pevné šířky: posuvný pás se nepočítá', scroller.status === 0);
  // celý repozitář musí projít (jinak to hlídá i check-*.mjs smyčka, tady je to proto, aby test spadl se jménem)
  let repo = 0;
  try { execFileSync(process.execPath, [kontrola], { stdio: 'pipe', cwd: process.cwd() }); } catch { repo = 1; }
  ok('pevné šířky: v repozitáři žádný řádek nad 288 px', repo === 0);
}
