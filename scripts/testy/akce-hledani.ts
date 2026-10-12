// Paleta akcí v globálním hledání (lib/akceHledani.ts): filtr podle rozhraní a oprávnění, cíle existují a jsou jednoznačné.
import type { Testy } from './_testy.ts';
import { AKCE_HLEDANI, akceProHledani } from '../../components/widgety/akceHledani.ts';
import { obsahujeNekde, proHledani } from '../../lib/hledani.ts';

export default function ({ eq, ok }: Testy) {
  const ids = AKCE_HLEDANI.map(a => a.id);
  eq('akce: id jsou jedinečná', new Set(ids).size, ids.length);
  ok('akce: každá má název, kde, ikonu, stránku a rozhraní', AKCE_HLEDANI.every(a => a.nazev && a.kde && a.ikona && a.stranka && a.rozhrani.length > 0));
  const vedeni = akceProHledani('vedeni', () => true);
  const zam = akceProHledani('zamestnanec', () => true);
  ok('akce: vedení má export docházky a pokladnu, zaměstnanec ne', vedeni.some(a => a.id === 'dochazka-export') && vedeni.some(a => a.id === 'nastaveni-pokladna') && !zam.some(a => a.id === 'nastaveni-pokladna'));
  ok('akce: zaměstnanec má vyplnit uzávěrku a dostupnost', zam.some(a => a.id === 'uzaverka-zam') && zam.some(a => a.id === 'dostupnost'));
  eq('akce: bez oprávnění na stránku se akce nenabídne', akceProHledani('vedeni', s => s !== 'settings').some(a => a.stranka === 'settings'), false);
  // Hledání podle synonym: „kasa" najde nastavení pokladny i uzávěrku, „dýško" spropitné.
  const najdi = (q: string) => vedeni.filter(a => obsahujeNekde(proHledani(q), a.nazev, a.kde, ...a.slova)).map(a => a.id);
  ok('akce: „kasa" najde Nastavení › Pokladna i Novou uzávěrku', najdi('kasa').includes('nastaveni-pokladna') && najdi('kasa').includes('uzaverka-nova'));
  eq('akce: „dysko" bez diakritiky najde spropitné', najdi('dysko'), ['finance-dysko']);
  ok('akce: „csv" najde exporty', najdi('csv').includes('dochazka-export') && najdi('csv').includes('finance-export'));
  // Kolo 6 (B3): Role a oprávnění jsou záložka Nastavení, ne Tým.
  const role = AKCE_HLEDANI.find(a => a.id === 'tym-role');
  eq('akce: Role a oprávnění vedou do Nastavení › Role', [role?.stranka, role?.arg], ['settings', 'roles']);
}
