// Jeden e-mail, dvě strany (lib/dveStrany.ts): strana podle role, pořadí
// kandidátů při přihlášení, kdo se smí párovat a lístek pro přepnutí strany bez hesla. Lístek
// pouští do cizího účtu, proto tu padělek, prošlý lístek i nesmysly musí
// skončit na null.

import type { Testy } from './_testy.ts';
import { stranaRole, jeStrana, opacnaStrana, cestaStrany, seradPodleStrany, vydejListek, overListek, jeMetoda, metodaRelace, smiNaStranu, lzeParovat, hesloOdSpravcePredMigraci, dvojnikZ, protejsekZ, chybiSloupec } from '../../lib/dveStrany.ts';

export default function ({ eq, ok }: Testy) {
  // ---- Strana podle role ----
  eq('host je jen customer', stranaRole('customer'), 'host');
  eq('majitel je podnik', stranaRole('employer'), 'podnik');
  eq('zaměstnanec je podnik', stranaRole('employee'), 'podnik');
  eq('neznámá role spadne do podniku', stranaRole(undefined), 'podnik');
  ok('jeStrana pozná host i podnik', jeStrana('host') && jeStrana('podnik'));
  ok('jeStrana odmítne cokoli jiného', !jeStrana('customer') && !jeStrana('') && !jeStrana(null));
  eq('opačná strana k hostovi', opacnaStrana('host'), 'podnik');
  eq('opačná strana k podniku', opacnaStrana('podnik'), 'host');
  eq('host jde do /client', cestaStrany('host'), '/client');
  eq('podnik jde na úvod', cestaStrany('podnik'), '/');

  // ---- Pořadí kandidátů ----
  const k = [{ id: 1, role: 'employer' }, { id: 2, role: 'customer' }];
  eq('formulář hosta: host první', seradPodleStrany(k, 'host').map(u => u.id), [2, 1]);
  eq('formulář správy: podnik první', seradPodleStrany(k, 'podnik').map(u => u.id), [1, 2]);
  eq('bez strany se pořadí nemění', seradPodleStrany(k, undefined).map(u => u.id), [1, 2]);
  eq('nesmyslná strana se ignoruje', seradPodleStrany(k, 'admin').map(u => u.id), [1, 2]);
  eq('druhá strana zůstává jako záloha', seradPodleStrany([{ id: 3, role: 'customer' }], 'podnik').map(u => u.id), [3]);
  ok('řazení nemění vstup', seradPodleStrany(k, 'host') !== k && k[0].id === 1);

  // ---- Lístek pro přepnutí ----
  const T = 'tajemstvi-jen-pro-test';
  const ted = 1_800_000_000_000;
  const L = { zId: 7, naId: 9, sv: 3, metoda: 'heslo' as const };
  const l = vydejListek(L, T, ted);
  eq('platný lístek vrátí obsah', overListek(l, T, ted), L);
  eq('platí ještě po 59 s', overListek(l, T, ted + 59_000), L);
  eq('po minutě vyprší', overListek(l, T, ted + 61_000), null);
  eq('jiné tajemství = padělek', overListek(l, 'jine-tajemstvi', ted), null);
  eq('lístek z kódu nese metodu', overListek(vydejListek({ ...L, metoda: 'kod' }, T, ted), T, ted), { ...L, metoda: 'kod' });
  const [z, na, exp, sv, m, sig] = l.split('.');
  eq('přepsaný cíl neprojde', overListek(`${z}.10.${exp}.${sv}.${m}.${sig}`, T, ted), null);
  eq('prodloužená platnost neprojde', overListek(`${z}.${na}.${Number(exp) + 3600}.${sv}.${m}.${sig}`, T, ted), null);
  eq('přepsaná verze relace neprojde', overListek(`${z}.${na}.${exp}.4.${m}.${sig}`, T, ted), null);
  const kodem = vydejListek({ ...L, metoda: 'kod' }, T, ted).split('.');
  eq('kód přepsaný na heslo neprojde', overListek([...kodem.slice(0, 4), 'h', kodem[5]].join('.'), T, ted), null);
  eq('neznámá metoda neprojde', overListek(`${z}.${na}.${exp}.${sv}.x.${sig}`, T, ted), null);
  eq('useknutý podpis neprojde', overListek(`${z}.${na}.${exp}.${sv}.${m}.${sig.slice(0, -2)}`, T, ted), null);
  eq('lístek sám na sebe neplatí', overListek(vydejListek({ ...L, naId: 7 }, T, ted), T, ted), null);
  eq('ne-řetězec', overListek(123, T, ted), null);
  eq('prázdný řetězec', overListek('', T, ted), null);
  eq('málo částí', overListek('1.2.3', T, ted), null);
  eq('starý formát (4 části) neplatí', overListek(`${z}.${na}.${exp}.${sig}`, T, ted), null);
  eq('moc částí', overListek(`${l}.x`, T, ted), null);
  eq('písmena místo id', overListek(`a.${na}.${exp}.${sv}.${m}.${sig}`, T, ted), null);
  eq('záporné id', overListek(`-1.${na}.${exp}.${sv}.${m}.${sig}`, T, ted), null);
  eq('příliš dlouhý lístek', overListek('1'.repeat(201), T, ted), null);

  // ---- Způsob přihlášení ----
  ok('heslo je metoda', jeMetoda('heslo') && jeMetoda('kod'));
  ok('nesmysl není metoda', !jeMetoda('magic') && !jeMetoda(undefined));
  eq('metoda z tokenu má přednost', metodaRelace('kod', 'employer'), 'kod');
  eq('starý token podniku = heslo', metodaRelace(undefined, 'employer'), 'heslo');
  eq('starý token hosta = kód', metodaRelace(undefined, 'customer'), 'kod');
  eq('podvržená metoda se nečte', metodaRelace('admin', 'customer'), 'kod');
  ok('heslem do správy', smiNaStranu('podnik', 'heslo'));
  ok('kódem do správy ne', !smiNaStranu('podnik', 'kod'));
  ok('bez metody do správy ne', !smiNaStranu('podnik', undefined));
  ok('kódem k hostovi ano', smiNaStranu('host', 'kod') && smiNaStranu('host', 'heslo'));

  // ---- Párování (stejné heslo, heslo od vedoucího, kiosk) ----
  ok('před migrací se páruje jen host', !hesloOdSpravcePredMigraci('customer'));
  ok('před migrací podnik ne (vedení má roli employer)', hesloOdSpravcePredMigraci('employee') && hesloOdSpravcePredMigraci('employer') && hesloOdSpravcePredMigraci('kiosk'));
  ok('kiosk se nepáruje', !lzeParovat({ role: 'kiosk', hesloOdSpravce: false }));
  ok('heslo od vedoucího se nepáruje', !lzeParovat({ role: 'employee', hesloOdSpravce: true }));
  ok('vlastní heslo se páruje', lzeParovat({ role: 'employee', hesloOdSpravce: false }));
  const ucet = (id: number, role: string, hesloOdSpravce = false, passwordHash = 'h') => ({ id, role, hesloOdSpravce, passwordHash });
  eq('jiné heslo = cizí člověk, ne dvojník', dvojnikZ([ucet(1, 'employer', false, 'a'), ucet(2, 'customer', false, 'b')], 1), null);
  eq('host od podniku (náhodné heslo) nevidí cizí podnik', dvojnikZ([ucet(1, 'employer', false, 'a'), ucet(2, 'customer', false, 'b')], 2), null);
  eq('prázdné heslo se nepáruje', dvojnikZ([ucet(1, 'employer', false, ''), ucet(2, 'customer', false, '')], 1), null);
  eq('obnova najde druhou stranu i s jiným heslem', protejsekZ([ucet(1, 'employee', true, 'a'), ucet(2, 'customer', false, 'b')], 2)?.id, 1);
  eq('obnova zaměstnance najde hosta', protejsekZ([ucet(1, 'employee', true, 'a'), ucet(2, 'customer', false, 'b')], 1)?.id, 2);
  eq('obnova kiosk vynechá', protejsekZ([ucet(1, 'kiosk'), ucet(2, 'customer')], 2), null);
  eq('obnova kiosku nesahá na hosta', protejsekZ([ucet(1, 'kiosk'), ucet(2, 'customer')], 1), null);
  eq('obnova bez druhé strany', protejsekZ([ucet(1, 'employer'), ucet(2, 'employee')], 1), null);
  eq('majitel ↔ host', dvojnikZ([ucet(1, 'employer'), ucet(2, 'customer')], 1)?.id, 2);
  eq('host ↔ majitel', dvojnikZ([ucet(1, 'employer'), ucet(2, 'customer')], 2)?.id, 1);
  eq('zaměstnanec s heslem od vedoucího nemá dvojníka', dvojnikZ([ucet(1, 'employee', true), ucet(2, 'customer')], 1), null);
  eq('host nevidí zaměstnance s heslem od vedoucího', dvojnikZ([ucet(1, 'employee', true), ucet(2, 'customer')], 2), null);
  eq('kiosk nemá dvojníka', dvojnikZ([ucet(1, 'kiosk'), ucet(2, 'customer')], 1), null);
  eq('host nevidí kiosk', dvojnikZ([ucet(1, 'kiosk'), ucet(2, 'customer')], 2), null);
  eq('host vidí člověka, ne kiosk', dvojnikZ([ucet(1, 'kiosk'), ucet(2, 'customer'), ucet(3, 'employee')], 2)?.id, 3);
  eq('stejná strana není dvojník', dvojnikZ([ucet(1, 'employer'), ucet(2, 'employee')], 1), null);
  eq('smazaný (chybí v seznamu) nemá dvojníka', dvojnikZ([ucet(2, 'customer')], 1), null);
  ok('42703 = chybí sloupec', chybiSloupec({ code: '42703' }));
  ok('jiná chyba není chybějící sloupec', !chybiSloupec({ code: '57P01' }) && !chybiSloupec(new Error('x')) && !chybiSloupec(null));
}
