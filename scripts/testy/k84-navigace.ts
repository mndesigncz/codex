// Kolo 8 (R8-6): adresa obrazovky a historie (lib/navigace.ts). Každý pohled má
// adresu `?view=…&arg=…`, okno k ní přidá `&okno=1`; starší odkazy (`tab`,
// `guide`, `billing` ze Stripe) se čtou jako `arg`, cizí parametry (ukázka:
// `scena`, `role`) přechod nechává být, `mode` zahazuje.

import type { Testy } from './_testy.ts';
import { adresaOkna, adresaPohledu, rozeberAdresu, stejnyPohled } from '../../lib/navigace.ts';

export default function ({ eq, ok }: Testy) {
  // ---- čtení adresy ----
  eq('prázdná adresa: žádný pohled', rozeberAdresu(''), { view: null, arg: null, okno: false });
  eq('?view=finance', rozeberAdresu('?view=finance'), { view: 'finance', arg: null, okno: false });
  eq('view + arg', rozeberAdresu('?view=tasks&arg=ukol%3A12'), { view: 'tasks', arg: 'ukol:12', okno: false });
  eq('bez otazníku taky', rozeberAdresu('view=inventory&arg=Sirupy'), { view: 'inventory', arg: 'Sirupy', okno: false });
  eq('okno=1', rozeberAdresu('?view=tasks&okno=1').okno, true);
  eq('starší odkaz: tab u Nastavení je arg', rozeberAdresu('?view=settings&tab=billing').arg, 'billing');
  eq('starší odkaz: billing=success ze Stripe znamená záložku Předplatné', rozeberAdresu('?view=settings&billing=success').arg, 'billing');
  eq('starší odkaz: guide u Návodů je arg', rozeberAdresu('?view=guides&guide=12').arg, '12');
  eq('guide, který není číslo, se zahodí', rozeberAdresu('?view=guides&guide=abc').arg, null);
  eq('tab mimo Nastavení se nečte', rozeberAdresu('?view=finance&tab=billing').arg, null);
  eq('arg má přednost před tab', rozeberAdresu('?view=settings&tab=billing&arg=pos').arg, 'pos');
  eq('mezery kolem se ořežou, prázdné = nic', rozeberAdresu('?view=%20%20&arg=%20'), { view: null, arg: null, okno: false });

  // ---- zápis adresy ----
  eq('pohled bez argumentu', adresaPohledu('', 'finance'), '?view=finance');
  eq('pohled s argumentem', adresaPohledu('', 'tasks', 'ukol:12'), '?view=tasks&arg=ukol%3A12');
  eq('prázdný argument se nepíše', adresaPohledu('', 'tasks', ''), '?view=tasks');
  eq('přepíše starý pohled i arg', adresaPohledu('?view=tasks&arg=ukol%3A12', 'finance'), '?view=finance');
  eq('zahodí tab, guide, billing a okno', adresaPohledu('?view=settings&tab=billing&guide=3&billing=success&okno=1', 'overview'), '?view=overview');
  eq('mode se zahazuje (pohled administrace = plný režim)', adresaPohledu('?mode=client&tab=menu', 'inventory'), '?view=inventory');
  eq('cizí parametry (ukázka) zůstávají', adresaPohledu('?scena=sklad&role=vedeni&view=inventory', 'finance'), '?scena=sklad&role=vedeni&view=finance');
  ok('výsledek jde zase přečíst', (() => { const a = rozeberAdresu(adresaPohledu('', 'tasks', 'ukol:12')); return a.view === 'tasks' && a.arg === 'ukol:12'; })());

  // ---- okno ----
  eq('okno otevřené', adresaOkna('?view=tasks', true), '?view=tasks&okno=1');
  eq('okno zavřené', adresaOkna('?view=tasks&okno=1', false), '?view=tasks');
  eq('okno bez pohledu (přehled)', adresaOkna('', true), '?okno=1');
  eq('zavření okna bez parametrů = bez otazníku', adresaOkna('?okno=1', false), '');
  eq('druhé otevření záznam nezdvojí', adresaOkna('?view=tasks&okno=1', true), '?view=tasks&okno=1');

  // ---- porovnání ----
  ok('tentýž pohled bez argumentu', stejnyPohled({ view: 'tasks' }, { view: 'tasks', arg: null }));
  ok('prázdný a chybějící argument jsou totéž', stejnyPohled({ view: 'tasks', arg: '' }, { view: 'tasks' }));
  ok('jiný argument = jiný pohled', !stejnyPohled({ view: 'tasks', arg: 'ukol:1' }, { view: 'tasks', arg: 'ukol:2' }));
  ok('jiný pohled', !stejnyPohled({ view: 'tasks' }, { view: 'finance' }));
}
