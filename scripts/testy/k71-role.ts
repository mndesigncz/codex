// Kolo 71 — úpravy přednastavených rolí podnikem: jednotkové testy.
//
// Čistá pravidla jsou v lib/roleUpravy.ts. Hlídá se hlavně to, co by
// otevřelo díru: úprava Vedení (role vlastníka) nebo Tabletu, přidání práv,
// která upravující sám nemá, úprava vlastní role, zcitlivění výchozí role
// (a Baristy, která je náhradní výchozí vždy) a „Obnovit výchozí", které
// umí práva i přidat. K tomu pojistky nad zdrojáky: kdo počítá oprávnění
// člena nebo roli přiděluje, jde přes úpravu podniku, ne přes sadu z kódu.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { SYSTEMOVE_ROLE, VSECHNA, sZavislostmi, systemovaRole } from '../../lib/opravneni.ts';
import { efektivniSystemova, smiUpravitSystemovou, jeUpravitelnaSystemova, procNeupravitelna, poleOpravneni, NEUPRAVITELNE_ROLE, type UpravaRole } from '../../lib/roleUpravy.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Kód bez komentářů — komentáře popisují, co se opravilo, a pojistky by chytaly je. */
const kod = (cesta: string) => zdroj(cesta).split('\n').filter(r => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(r)).join('\n');

const role = (klic: string) => systemovaRole(klic)!;
const uprava = (klic: string, opravneni: string[], extra: Partial<UpravaRole> = {}): UpravaRole => ({ klic, opravneni, nazev: null, popis: null, verze: 1, ...extra });

export default function ({ eq, ok }: Testy) {
  // ---- A: Provozní smí odeslat uzávěrku i bez povinných věcí ----
  const provozni = role('provozni').opravneni;
  ok('Provozní má uzaverky.obejit_postupy', provozni.includes('uzaverky.obejit_postupy'));
  ok('Provozní je dál uzavřená na závislosti', sZavislostmi(provozni).length === new Set(provozni).size);
  ok('Barista obejít povinné nesmí (beze změny)', !role('barista').opravneni.includes('uzaverky.obejit_postupy'));

  // ---- co jde upravit ----
  ok('Vedení (role vlastníka) upravit nejde', !jeUpravitelnaSystemova('vedeni') && NEUPRAVITELNE_ROLE.has('vedeni'));
  ok('Tablet upravit nejde', !jeUpravitelnaSystemova('kiosk'));
  ok('neznámý klíč upravit nejde', !jeUpravitelnaSystemova('neexistuje') && !jeUpravitelnaSystemova(null));
  eq('ostatní přednastavené upravit jde',
    SYSTEMOVE_ROLE.filter(r => jeUpravitelnaSystemova(r.klic)).map(r => r.klic).sort(),
    SYSTEMOVE_ROLE.map(r => r.klic).filter(k => k !== 'vedeni' && k !== 'kiosk').sort());
  ok('zamčené role mají české vysvětlení', !!procNeupravitelna('vedeni') && !!procNeupravitelna('kiosk') && procNeupravitelna('provozni') === null);

  // ---- efektivní sada ----
  const bez = efektivniSystemova(role('provozni'));
  eq('bez úpravy platí kód', bez.opravneni, provozni);
  ok('bez úpravy: upraveno=false, verze 0', !bez.upraveno && bez.verze === 0 && bez.nazev === role('provozni').nazev);
  const s = efektivniSystemova(role('provozni'), uprava('provozni', ['sklad.ceny_upravit', 'admin.vse', 42 as unknown as string], { nazev: 'Směnový', verze: 3 }));
  eq('úprava: doplní závislosti a zahodí neznámé klíče', s.opravneni, ['sklad.ceny', 'sklad.ceny_upravit', 'sklad.zobrazit']);
  ok('úprava: upraveno, název z úpravy, výchozí zůstává po ruce',
    s.upraveno && s.nazev === 'Směnový' && s.vychoziNazev === role('provozni').nazev && s.verze === 3 && s.vychoziOpravneni.length === provozni.length);
  ok('úprava: prázdný název = výchozí', efektivniSystemova(role('provozni'), uprava('provozni', [], { nazev: '  ' })).nazev === role('provozni').nazev);
  eq('úprava jiné role se nepoužije', efektivniSystemova(role('provozni'), uprava('kuchar', [])).opravneni, provozni);
  eq('úprava Vedení se ignoruje (vlastník se nezamkne)', efektivniSystemova(role('vedeni'), uprava('vedeni', [])).opravneni, role('vedeni').opravneni);
  eq('úprava Tabletu se ignoruje (bílá listina)', efektivniSystemova(role('kiosk'), uprava('kiosk', ['finance.trzby'])).opravneni, role('kiosk').opravneni);
  eq('JSONB jako řetězec i pole', [poleOpravneni('["a","b"]'), poleOpravneni(['c']), poleOpravneni('rozbité'), poleOpravneni(null)], [['a', 'b'], ['c'], [], []]);

  // ---- eskalace ----
  const vlastnik = { jeVlastnik: true, opravneni: VSECHNA };
  const P = { jeVlastnik: false, opravneni: [...provozni, 'tym.role_spravovat'] };
  ok('ani vlastník neupraví Vedení', !smiUpravitSystemovou(vlastnik, 'vedeni', role('vedeni').opravneni, []).ok);
  ok('ani vlastník neupraví Tablet', !smiUpravitSystemovou(vlastnik, 'kiosk', role('kiosk').opravneni, role('kiosk').opravneni).ok);
  ok('neznámou roli nejde upravit', !smiUpravitSystemovou(vlastnik, 'nic', [], []).ok);
  ok('vlastník upraví Provozní na cokoli', smiUpravitSystemovou(vlastnik, 'provozni', provozni, VSECHNA).ok);
  const kuchar = role('kuchar').opravneni;
  const zPodmnoziny = kuchar.filter(k => P.opravneni.includes(k));
  ok('Provozní upraví Kuchaře jen o svá práva', kuchar.every(k => P.opravneni.includes(k))
    ? smiUpravitSystemovou(P, 'kuchar', kuchar, zPodmnoziny).ok : true);
  ok('do role nejde dát, co sám nemám (finance.mzdy)', !smiUpravitSystemovou(P, 'kuchar', kuchar, [...kuchar, 'finance.mzdy']).ok);
  ok('roli s víc právy nejde osekat (Účetní má finance)', !smiUpravitSystemovou(P, 'ucetni', role('ucetni').opravneni, []).ok);
  ok('svou vlastní přednastavenou roli si nikdo neupraví', !smiUpravitSystemovou(P, 'provozni', provozni, provozni, { jeJehoRole: true }).ok);
  // Obnovit výchozí = úprava na sadu z kódu: když úprava roli osekala
  // a kód má víc, než volající, návrat by mu práva přidal.
  const osekany = { jeVlastnik: false, opravneni: ['sklad.zobrazit', 'tym.role_spravovat'] };
  ok('obnovit výchozí nepřidá práva, která nemám', !smiUpravitSystemovou(osekany, 'kuchar', ['sklad.zobrazit'], kuchar).ok);

  // ---- výchozí role pro nové členy ----
  const barista = role('barista').opravneni;
  ok('Barista: přidat Kuchaři citlivé jde, když není výchozí', smiUpravitSystemovou(vlastnik, 'kuchar', kuchar, [...kuchar, 'finance.mzdy']).ok);
  ok('Kuchař jako výchozí: citlivé nejde', !smiUpravitSystemovou(vlastnik, 'kuchar', kuchar, [...kuchar, 'finance.mzdy'], { jeVychozi: true }).ok);
  ok('Barista (náhradní výchozí) nezcitliví nikdy', !smiUpravitSystemovou(vlastnik, 'barista', barista, [...barista, 'finance.mzdy']).ok);
  ok('Barista: správa týmu nejde', !smiUpravitSystemovou(vlastnik, 'barista', barista, [...barista, 'tym.pozvat']).ok);
  ok('Barista: osekat jde', smiUpravitSystemovou(vlastnik, 'barista', barista, barista.filter(k => k !== 'rozvrh.nahled')).ok);

  // ---- pojistky nad zdrojáky ----
  const db = kod('lib/opravneniDb.ts');
  ok('roleClena počítá přednastavenou roli s úpravou podniku', /efektivniSystemova\(sys, await upravaRole\(teamId, sys\.klic\)\)/.test(db));
  ok('úprava se čte jen u upravitelných rolí', /if \(jeUpravitelnaSystemova\(sys\.klic\)\)/.test(db));
  ok('přidělení role členovi bere sadu podniku', /systemovaRolePodniku\(c\.teamId, klic\)/.test(kod('app/api/teams/members/route.ts')));
  ok('výchozí role bere sadu podniku', /systemovaRolePodniku\(c\.teamId, b\?\.klic\)/.test(kod('app/api/roles/vychozi/route.ts')));
  ok('nový člen dostane výchozí se sadou podniku', /zeSystemovePodniku\(teamId, String\(t\.vychozi_role_klic\)\)/.test(kod('app/api/teams/_role.ts')));
  const api = kod('app/api/roles/system/[klic]/route.ts');
  ok('API úprav: brána tym.role_spravovat', api.includes("pozaduj('tym.role_spravovat')"));
  ok('API úprav: pravidla smiUpravitSystemovou v PUT i DELETE', (api.match(/smiUpravitSystemovou\(/g) ?? []).length === 2);
  ok('API úprav: po změně zahodí cache celého podniku', (api.match(/zneplatniOpravneniPodniku\(c\.teamId\)/g) ?? []).length === 2);
  ok('API úprav: podnik z kontextu, ne z těla', !/b\??\.team_?[iI]d/.test(api));
  ok('init zakládá role_upravy idempotentně', /CREATE TABLE IF NOT EXISTS role_upravy/.test(kod('app/api/init/route.ts')));
}
