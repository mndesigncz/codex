// Kolo 76: přizpůsobení navigace (lib/navigace.ts). Hlavní pravidlo: oprávnění
// rozhoduje první, skrytí je jen preference. Dále: přehled nejde skrýt, dok má
// nejvýš čtyři položky a doplní se, neznámá id se ignorují, přejmenování bez
// jazyka uživatele padá na přeložený výchozí název, bez konfigurace je navigace
// přesně dnešní.

import type { Testy } from './_testy.ts';
import { slozNavigaci, normalizujNavKonfig, VYCHOZI_NAV, NEUKRYVATELNE, NAV_TEXTY, MAX_DOK, jeVychoziKonfig, type NavKonfig } from '../../lib/navigace.ts';

const vse = () => true;
const ids = (p: { id: string }[]) => p.map(x => x.id);
const kfg = (o: any): NavKonfig => normalizujNavKonfig({ v: 1, ...o })!;

export default function ({ eq, ok }: Testy) {
  // ---- bez konfigurace = dnešní navigace ----
  const v = slozNavigaci({ rozhrani: 'vedeni', smiPohled: vse, nastaveni: null, jazyk: 'cs' });
  eq('výchozí vedení: skupiny a pořadí jako dřív', v.sekce.map(s => [s.title, ids(s.items)]), [
    [null, ['overview']],
    ['Směny', ['shifts', 'my-shifts', 'attendance']],
    ['Kasa & sklad', ['reports', 'finance', 'inventory', 'recipes']],
    ['Práce', ['tasks', 'procedures', 'planning']],
    ['Tým', ['rewards', 'chat', 'guides', 'suggestions']],
  ]);
  eq('výchozí vedení: dok', ids(v.dok), ['overview', 'shifts', 'inventory', 'chat']);
  eq('výchozí vedení: nic skrytého', v.skryte, []);
  eq('výchozí vedení: všech 15 pohledů', v.vse.length, 15);
  const z = slozNavigaci({ rozhrani: 'zamestnanec', smiPohled: vse, nastaveni: null, jazyk: 'cs' });
  eq('výchozí zaměstnanec: dok', ids(z.dok), ['home', 'my-shifts', 'inventory', 'chat']);
  eq('zaměstnanec: zkrácený štítek Směny pro dok', z.dok.find(p => p.id === 'my-shifts')?.short, 'Směny');

  // ---- oprávnění jako první ----
  const bezSkladu = slozNavigaci({ rozhrani: 'vedeni', smiPohled: id => id !== 'inventory', nastaveni: null, jazyk: 'cs' });
  ok('bez práva: pohled není v nabídce ani v doku', !ids(bezSkladu.vse).includes('inventory') && !ids(bezSkladu.dok).includes('inventory'));
  eq('bez práva: dnešní chování, dok se nedoplňuje', ids(bezSkladu.dok), ['overview', 'shifts', 'chat']);
  const prepsani = slozNavigaci({ rozhrani: 'vedeni', smiPohled: id => id !== 'finance', nastaveni: kfg({ vedeni: { dok: ['finance', 'overview'], prejmenovat: { finance: { cs: 'Peníze' } } } }), jazyk: 'cs' });
  ok('oprávnění vyhrává nad nastavením: Finance v doku ani v nabídce není', !ids(prepsani.dok).includes('finance') && !ids(prepsani.vse).includes('finance'));
  ok('pohled bez práva se nevrátí ani mezi skryté (štítek Skrytá sekce je jen pro ty, kam smí)', !ids(prepsani.skryte).includes('finance'));

  // ---- skrytí ----
  const s1 = slozNavigaci({ rozhrani: 'vedeni', smiPohled: vse, nastaveni: kfg({ vedeni: { skryte: ['planning', 'suggestions', 'overview', 'nesmysl'] } }), jazyk: 'cs' });
  ok('skrytí: plánování a nápady zmizí', !ids(s1.vse).includes('planning') && !ids(s1.vse).includes('suggestions'));
  ok('přehled nejde skrýt', ids(s1.vse).includes('overview') && NEUKRYVATELNE.vedeni.includes('overview'));
  eq('skryté se vrací zvlášť (pro štítek „Skrytá sekce")', ids(s1.skryte).sort(), ['planning', 'suggestions']);
  ok('skupina, která zůstane prázdná, zmizí', !slozNavigaci({ rozhrani: 'vedeni', smiPohled: vse, nastaveni: kfg({ vedeni: { skryte: ['tasks', 'procedures', 'planning'] } }), jazyk: 'cs' }).sekce.some(s => s.id === 'prace'));
  ok('skrytí jednoho rozhraní se nedotkne druhého', ids(slozNavigaci({ rozhrani: 'zamestnanec', smiPohled: vse, nastaveni: kfg({ vedeni: { skryte: ['inventory'] } }), jazyk: 'cs' }).vse).includes('inventory'));

  // ---- dok ----
  const sk = slozNavigaci({ rozhrani: 'vedeni', smiPohled: vse, nastaveni: kfg({ vedeni: { skryte: ['shifts'] } }), jazyk: 'cs' });
  eq('skrytý pohled z docku: doplní se z výchozích a pak z ostatních na čtyři', ids(sk.dok), ['overview', 'inventory', 'chat', 'recipes']);
  eq('dok má po doplnění čtyři položky', sk.dok.length, MAX_DOK);
  ok('skrytý pohled v doku není', !ids(sk.dok).includes('shifts'));
  const vlastniDok = slozNavigaci({ rozhrani: 'vedeni', smiPohled: vse, nastaveni: kfg({ vedeni: { dok: ['tasks', 'finance', 'tasks', 'chat', 'reports', 'guides', 'overview'] } }), jazyk: 'cs' });
  eq('vlastní dok: duplicity pryč, nejvýš čtyři, pořadí zachováno', ids(vlastniDok.dok), ['tasks', 'finance', 'chat', 'reports']);
  eq('dok s jedinou položkou se doplní', slozNavigaci({ rozhrani: 'vedeni', smiPohled: vse, nastaveni: kfg({ vedeni: { dok: ['tasks'] } }), jazyk: 'cs' }).dok.length, MAX_DOK);

  // ---- přejmenování ----
  const prej = slozNavigaci({ rozhrani: 'vedeni', smiPohled: vse, nastaveni: kfg({ vedeni: { prejmenovat: { reports: { cs: 'Denní odvod', en: 'Daily cash-out' } } } }), jazyk: 'cs' });
  eq('přejmenování v jazyce uživatele', prej.vse.find(p => p.id === 'reports')?.label, 'Denní odvod');
  const prejEn = slozNavigaci({ rozhrani: 'vedeni', smiPohled: vse, nastaveni: kfg({ vedeni: { prejmenovat: { reports: { cs: 'Denní odvod' } } } }), jazyk: 'en', nazev: cs => ({ Uzávěrky: 'Closings' } as Record<string, string>)[cs] ?? cs });
  eq('chybí-li jazyk, ukáže se PŘELOŽENÝ výchozí název, ne text v jiném jazyce', prejEn.vse.find(p => p.id === 'reports')?.label, 'Closings');
  eq('nepřejmenovaná položka jde přes překlad názvů', slozNavigaci({ rozhrani: 'vedeni', smiPohled: vse, nastaveni: null, jazyk: 'en', nazev: cs => `[${cs}]` }).vse.find(p => p.id === 'tasks')?.label, '[Úkoly]');
  eq('přejmenování nezmění id (odkazy fungují dál)', prej.vse.find(p => p.label === 'Denní odvod')?.id, 'reports');

  // ---- vlastní skupiny ----
  const sek = slozNavigaci({ rozhrani: 'vedeni', smiPohled: vse, jazyk: 'cs', nastaveni: kfg({ vedeni: { sekce: [
    { id: 'kasa', nazev: { cs: 'Peníze' }, ids: ['finance', 'reports'] },
    { id: 'smeny', ids: ['shifts'] },
  ] } }) });
  eq('vlastní skupiny: pořadí a přejmenování skupiny', [sek.sekce[0].title, sek.sekce[1].title], ['Peníze', 'Směny']);
  eq('vlastní skupiny: zadané položky stojí první', [ids(sek.sekce[0].items).slice(0, 2), sek.sekce[1].items[0].id], [['finance', 'reports'], 'shifts']);
  ok('položky mimo vlastní skupiny se neztratí (vrátí se do výchozí skupiny, jinak na konec)', ids(sek.vse).length === 15 && ids(sek.vse).includes('overview') && ids(sek.vse).includes('inventory'));
  ok('položka je nejvýš v jedné skupině', new Set(ids(sek.vse)).size === ids(sek.vse).length);

  // ---- normalizace uložené konfigurace ----
  eq('normalizace: null, nesmysl, pole, prázdný objekt = výchozí', [normalizujNavKonfig(null), normalizujNavKonfig('x'), normalizujNavKonfig([]), normalizujNavKonfig({}), normalizujNavKonfig({ vedeni: { skryte: [] } })], [null, null, null, null, null]);
  eq('normalizace: JSON v řetězci', normalizujNavKonfig('{"vedeni":{"skryte":["tasks"]}}')?.vedeni.skryte, ['tasks']);
  eq('normalizace: neznámá id a přehled pryč, duplicity pryč', normalizujNavKonfig({ vedeni: { skryte: ['tasks', 'tasks', 'xyz', 'overview', 42] } })?.vedeni.skryte, ['tasks']);
  eq('normalizace: dok max 4', normalizujNavKonfig({ vedeni: { dok: ['tasks', 'finance', 'chat', 'reports', 'guides'] } })?.vedeni.dok, ['tasks', 'finance', 'chat', 'reports']);
  eq('normalizace: přejmenování jen pro známé jazyky a id, oříznuté na 30 znaků a bez řídicích znaků', normalizujNavKonfig({ vedeni: { prejmenovat: {
    tasks: { cs: '  Dlouhý\nnázev '.padEnd(80, 'x'), xx: 'nic', en: '' }, nesmysl: { cs: 'a' } } } })?.vedeni.prejmenovat,
    { tasks: { cs: 'Dlouhý název ' + 'x'.repeat(17) } });
  ok('normalizace: prototypový útok nic nenastaví', (() => { const k = normalizujNavKonfig(JSON.parse('{"__proto__":{"x":1},"vedeni":{"prejmenovat":{"__proto__":{"cs":"a"},"tasks":{"__proto__":"a","cs":"Ok"}}}}')); return !!k && ({} as any).x === undefined && k.vedeni.prejmenovat.tasks?.cs === 'Ok'; })());
  eq('normalizace: vlastní skupiny čistí id, duplicitní skupinu zahodí', normalizujNavKonfig({ vedeni: { sekce: [
    { id: 'A B!', nazev: { cs: 'Jedna' }, ids: ['tasks', 'finance'] }, { id: 'ab', ids: ['reports'] } ] } })?.vedeni.sekce,
    [{ id: 'ab', nazev: { cs: 'Jedna' }, ids: ['tasks', 'finance'] }]);
  eq('normalizace: položka ve dvou skupinách zůstane v první', normalizujNavKonfig({ vedeni: { sekce: [
    { id: 'a', ids: ['tasks', 'finance'] }, { id: 'b', ids: ['finance', 'reports'] } ] } })?.vedeni.sekce?.map(x => x.ids), [['tasks', 'finance'], ['reports']]);
  ok('jeVychoziKonfig', jeVychoziKonfig(null) && !jeVychoziKonfig(kfg({ zamestnanec: { skryte: ['tasks'] } })));

  // ---- soudržnost výchozích dat ----
  ok('každá položka patří do právě jedné výchozí skupiny a dok zná jen existující pohledy', (['vedeni', 'zamestnanec'] as const).every(r => {
    const n = VYCHOZI_NAV[r];
    const vSekcich = n.sekce.flatMap(s => s.ids);
    return vSekcich.length === new Set(vSekcich).size && n.polozky.every(p => vSekcich.includes(p.id)) && n.dok.every(d => n.polozky.some(p => p.id === d));
  }));
  ok('NAV_TEXTY obsahuje štítky i nadpisy skupin', ['Přehled', 'Sklad', 'Kasa & sklad', 'Směny'].every(t => NAV_TEXTY.includes(t)));
}
