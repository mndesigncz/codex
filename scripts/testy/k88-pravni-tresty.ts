// Tresty po právní revizi (spuštění, balík P): § 346b odst. 1 zákoníku práce zakazuje peněžní
// postihy (NS 21 Cdo 3471/2024). Strop krácení jen z nenárokové prémie, manko trestem není,
// tresty mimo veřejný žebříček, citace § 346b, věta o výtce podle § 52 písm. g).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Testy } from './_testy.ts';
import {
  VETA_BEZ_PREMIE, VETA_MANKO, VETA_VYTKA, ZDROJ_NENAROKOVE_PREMIE, druhZKlice, platnyKlicNavrhu, stropKraceni, validujTrest, vyberTresty,
} from '../../lib/tresty.ts';

const KOREN = new URL('../../', import.meta.url).pathname;
const cti = (cesta: string) => readFileSync(join(KOREN, cesta), 'utf8');

/** Všechny zdrojáky ve složkách (bez node_modules a .next). */
function zdrojaky(slozky: string[]): string[] {
  const out: string[] = [];
  const projdi = (d: string) => {
    for (const f of readdirSync(join(KOREN, d))) {
      if (f === 'node_modules' || f.startsWith('.')) continue;
      const rel = join(d, f);
      if (statSync(join(KOREN, rel)).isDirectory()) projdi(rel);
      else if (/\.(ts|tsx|mjs|json)$/.test(f)) out.push(rel);
    }
  };
  for (const s of slozky) projdi(s);
  return out;
}

export default function ({ eq, ok }: Testy) {
  const DNES = '2026-10-14';
  // ---- strop krácení: jen nenároková prémie ----
  eq('zdroj nenárokové prémie je „premie"', ZDROJ_NENAROKOVE_PREMIE, 'premie');
  eq('strop: prémie minus už kráceno, nikdy záporně', [stropKraceni(1000, 300), stropKraceni(0, 0), stropKraceni(200, 500)], [700, 0, 0]);
  const spol = cti('app/api/tresty/_spolecne.ts');
  ok('strop v databázi počítá jen source = nenároková prémie (ne manual, navic, reward)',
    /FILTER \(WHERE amount > 0 AND source = \$\{ZDROJ_NENAROKOVE_PREMIE\}\)/.test(spol) && !/COALESCE\(source, 'manual'\) <> 'trest'/.test(spol));
  const route = cti('app/api/tresty/route.ts');
  const upr = cti('app/api/tresty/[id]/route.ts');
  ok('strop 0: server vrací větu, proč a jak prémii založit', /VETA_BEZ_PREMIE, 409/.test(route) && /VETA_BEZ_PREMIE, 409/.test(upr));
  ok('úprava trestu: snížení nebo starší krácení strop nehlídá', /z\.bonusCut > puvodni\.bonusCut \|\| z\.day\.slice\(0, 7\) !== puvodni\.day\.slice\(0, 7\)/.test(upr));
  ok('věta strop 0 jmenuje nenárokovou prémii a cestu, jak ji založit', /nenárokovou prémii/.test(VETA_BEZ_PREMIE) && /Prémie a srážky/.test(VETA_BEZ_PREMIE) && /bez typu se nepočítají/.test(VETA_BEZ_PREMIE));

  // ---- typ prémie při zápisu úpravy mzdy ----
  const wa = cti('app/api/wage-adjustments/route.ts');
  ok('úprava mzdy: druh „premie" + kladná částka = source premie, jinak manual',
    /b\.druh === 'premie' && Number\(b\.amount\) > 0 \? ZDROJ_NENAROKOVE_PREMIE : 'manual'/.test(wa) && /\$\{zdroj\}, \$\{c\.meId\}/.test(wa));
  const doch = cti('components/widgety/oblasti/dochazka.tsx');
  ok('okno Prémie a srážky: volba Nenároková prémie / Mzda a ostatní a posílá druh',
    /t\('Nenároková prémie'\)/.test(doch) && /t\('Mzda \/ ostatní'\)/.test(doch) && /druh: druh === 'premie' \? typPremie : undefined/.test(doch));

  // ---- manko trestem není ----
  eq('manko: klíč se odmítne větou', validujTrest({ userId: 3, text: 'Manko v kase', sourceKey: 'manko:9' }, DNES), { ok: false, chyba: VETA_MANKO });
  ok('manko: druh zůstává kvůli starým záznamům (klíč i výběr z odpovědi)', platnyKlicNavrhu('manko:9') && druhZKlice('manko:9') === 'manko'
    && vyberTresty([{ id: 1, userId: 2, day: DNES, source: 'manko' }])[0]?.source === 'manko');
  const navrhy = cti('app/api/tresty/navrhy/route.ts');
  ok('návrhy: manko se jen spočítá (manka), návrh trestu z něj nevznikne', !/druh: 'manko'/.test(navrhy) && /manka\+\+/.test(navrhy) && /NextResponse\.json\(\{ navrhy, manka \}\)/.test(navrhy));
  const widget = cti('components/widgety/oblasti/odmeny.tsx');
  ok('widget Tresty v týmu: věta o dohodě o odpovědnosti, bez akce', /useMankaNavrhu\(/.test(widget) && /t\('Manko řeš dohodou o odpovědnosti, ne trestem\.'\)/.test(widget));
  const demo = cti('lib/demo/routy/tresty.ts');
  ok('ukázka: žádný návrh ani položka sazebníku „manko", jen počet', !/druh: 'manko'/.test(demo) && !/'Manko v kase'/.test(demo) && /manka: 1/.test(demo));

  // ---- žebříček bez trestů ----
  const balance = cti('lib/pointsBalance.ts');
  ok('žebříček: body bez trestů a rozpad bez trestů', /export function bodyZebricku/.test(balance) && /totalPoints\(\{ \.\.\.b, trestPoints: 0 \}, pt\)/.test(balance)
    && /return \{ \.\.\.b, trestPoints: 0, trestCount: 0 \}/.test(balance));
  ok('zůstatek člověka dál počítá tresty (totalPoints s trestPoints)', /\+ \(b\.trestPoints \?\? 0\)/.test(balance));
  const rewards = cti('app/api/rewards/route.ts');
  ok('GET /api/rewards: standings přes bodyZebricku a rozpadZebricku, vlastní body přes totalPoints',
    /const b0 = rozpadZebricku\(/.test(rewards) && /const total = bodyZebricku\(b0, points\)/.test(rewards) && /const total = totalPoints\(b, points\)/.test(rewards));

  // ---- citace a věty ----
  const vsechny = zdrojaky(['lib', 'app', 'components', 'locales']);
  const s346d = vsechny.filter(f => /§\s*346d/.test(readFileSync(join(KOREN, f), 'utf8')));
  eq('citace: nikde § 346d (peněžní postihy zakazuje § 346b)', s346d, []);
  ok('lib/tresty cituje § 346b', /§ 346b/.test(cti('lib/tresty.ts')));
  eq('věta o výtce podle § 52 písm. g)', VETA_VYTKA, 'Napomenutí v aplikaci není výtka podle § 52 písm. g) zákoníku práce.');
}
