// Kolo 11: volitelné úkoly za body (lib/navic.ts — opakování, termín, stav) a doplnění
// nových widgetů do uložených rozložení (lib/widgety/rozlozeni.ts doplnNove).
import type { Testy } from './_testy.ts';
import {
  denVTydnu, lzeVzit, pondeli, popisOpakovani, rozsahTerminu, seradUkoly, stavUkolu, terminNabidky, urcenoPro, validujNabidku, vyberNabidku, vyberUkoly,
  type NabidkaNavic, type UkolNavic,
} from '../../lib/navic.ts';
import { doplnNove } from '../../lib/widgety/rozlozeni.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';

const n = (p: Partial<NabidkaNavic>): NabidkaNavic => ({
  id: 1, title: 'Umýt okna', description: null, points: 20, bonusCzk: null, autoApprove: false, active: true, validFrom: null, validTo: null,
  maxPerDay: 1, recurrence: 'kdykoli', recDays: [], recInterval: null, capacity: null, requirePhoto: false, targetUsers: [], createdAt: '', ...p,
});

export default function ({ eq, ok }: Testy) {
  // ---- kalendář ----
  eq('den v týdnu: 2026-10-12 je pondělí, 2026-10-18 neděle', [denVTydnu('2026-10-12'), denVTydnu('2026-10-18')], [1, 7]);
  eq('pondělí týdne', [pondeli('2026-10-14'), pondeli('2026-10-18'), pondeli('2026-10-12')], ['2026-10-12', '2026-10-12', '2026-10-12']);

  // ---- termín ----
  eq('kdykoli / denně: termín = den', [terminNabidky(n({}), '2026-10-14'), terminNabidky(n({ recurrence: 'denne' }), '2026-10-14')], ['2026-10-14', '2026-10-14']);
  eq('vybrané dny: Po a St ano, Út ne', [terminNabidky(n({ recurrence: 'dny', recDays: [1, 3] }), '2026-10-12'), terminNabidky(n({ recurrence: 'dny', recDays: [1, 3] }), '2026-10-13'), terminNabidky(n({ recurrence: 'dny', recDays: [1, 3] }), '2026-10-14')],
    ['2026-10-12', null, '2026-10-14']);
  eq('týdně: termín = pondělí', terminNabidky(n({ recurrence: 'tydne' }), '2026-10-16'), '2026-10-12');
  eq('měsíčně: termín = první den měsíce', terminNabidky(n({ recurrence: 'mesicne' }), '2026-10-16'), '2026-10-01');
  eq('jednou: jeden termín', terminNabidky(n({ recurrence: 'jednou' }), '2026-10-16'), 'jednou');
  const iv = n({ recurrence: 'interval', recInterval: 3, validFrom: '2026-10-10' });
  eq('interval 3 dny od 10. 10.: 10., 13., 16. ano, 11. a 9. ne', ['2026-10-10', '2026-10-13', '2026-10-16', '2026-10-11', '2026-10-09'].map(d => terminNabidky(iv, d)),
    ['2026-10-10', '2026-10-13', '2026-10-16', null, null]);
  eq('vypnuté a mimo platnost: nikdy', [terminNabidky(n({ active: false }), '2026-10-14'), terminNabidky(n({ validTo: '2026-10-13' }), '2026-10-14'), terminNabidky(n({ validFrom: '2026-10-15' }), '2026-10-14')], [null, null, null]);
  eq('rozsah termínu', [rozsahTerminu(n({ recurrence: 'tydne' }), '2026-10-12'), rozsahTerminu(n({ recurrence: 'mesicne' }), '2026-10-01'), rozsahTerminu(n({}), '2026-10-14'), rozsahTerminu(n({ recurrence: 'jednou', validFrom: '2026-10-01' }), 'jednou')],
    [{ od: '2026-10-12', do: '2026-10-18' }, { od: '2026-10-01', do: '2026-10-31' }, { od: '2026-10-14', do: '2026-10-14' }, { od: '2026-10-01', do: '9999-12-31' }]);
  eq('komu: prázdné = všem, jinak jen vybraní', [urcenoPro(n({}), 5), urcenoPro(n({ targetUsers: [3] }), 5), urcenoPro(n({ targetUsers: [3] }), 3)], [true, false, true]);

  // ---- stav ----
  const st = (o: Partial<Parameters<typeof stavUkolu>[0]>) => stavUkolu({ zapisy: [], vzato: false, obsazeno: 0, capacity: null, maxPerDay: 1, ...o });
  eq('stav: volné, vzaté, plné, čeká, uznané, odmítnuté', [
    st({}), st({ vzato: true }), st({ obsazeno: 1, capacity: 1 }), st({ zapisy: [{ status: 'ceka' }] }), st({ zapisy: [{ status: 'uznano' }] }), st({ zapisy: [{ status: 'odmitnuto' }] }),
  ], ['volne', 'vzato', 'plno', 'ceka', 'uznano', 'odmitnuto']);
  eq('stav: limit 3, jeden zápis → jde znovu', st({ zapisy: [{ status: 'uznano' }], maxPerDay: 3 }), 'volne');
  eq('stav: bez limitu a po zápisu → hotovo (čeká)', st({ zapisy: [{ status: 'ceka' }], maxPerDay: null }), 'ceka');
  eq('lze vzít', [lzeVzit('volne'), lzeVzit('odmitnuto'), lzeVzit('plno'), lzeVzit('vzato')], [true, true, false, false]);

  // ---- validace ----
  ok('validace: výchozí opakování kdykoli', (() => { const v = validujNabidku({ title: 'X', points: 10 }); return v.ok && v.nabidka.recurrence === 'kdykoli' && v.nabidka.capacity === null; })());
  eq('validace: vybrané dny bez dnů', validujNabidku({ title: 'X', recurrence: 'dny' }), { ok: false, chyba: 'Vyber aspoň jeden den v týdnu.' });
  eq('validace: interval bez „od"', validujNabidku({ title: 'X', recurrence: 'interval', recInterval: 3 }), { ok: false, chyba: 'U opakování po dnech vyplň, od kdy se počítá (platí od).' });
  ok('validace: interval 1 neprojde, 3 s datem ano', !validujNabidku({ title: 'X', recurrence: 'interval', recInterval: 1, validFrom: '2026-10-01' }).ok && validujNabidku({ title: 'X', recurrence: 'interval', recInterval: 3, validFrom: '2026-10-01' }).ok);
  ok('validace: dny seřazené bez duplicit, mimo 1–7 pryč', (() => { const v = validujNabidku({ title: 'X', recurrence: 'dny', recDays: [5, 1, 1, 9] }); return v.ok && v.nabidka.recDays.join() === '1,5'; })());
  ok('validace: kapacita 0 neprojde, neznámé opakování neprojde', !validujNabidku({ title: 'X', capacity: 0 }).ok && !validujNabidku({ title: 'X', recurrence: 'kazdou-chvili' }).ok);
  ok('validace: komu bez duplicit', (() => { const v = validujNabidku({ title: 'X', targetUsers: [3, 3, '4'] }); return v.ok && v.nabidka.targetUsers.join() === '3,4'; })());

  // ---- výběr z odpovědi ----
  const [vn] = vyberNabidku({ offers: [{ id: 1, title: 'X', recurrence: 'nesmysl', recDays: [1, 8, '3'], requirePhoto: 'ano' }] });
  eq('výběr nabídky: cizí opakování = kdykoli, dny jen 1–7, fotka jen true', [vn.recurrence, vn.recDays, vn.requirePhoto, vn.targetUsers], ['kdykoli', [1, 3], false, []]);
  const uk = vyberUkoly({ ukoly: [{ nabidka: { id: 2, title: 'Y', points: 5 }, termin: '2026-10-14', stav: 'bla', kdo: [{ userId: 3, name: 'Eva', stav: 'vzato' }, { bez: 1 }] }, { termin: 'x' }] });
  eq('výběr úkolů: cizí stav = volné, kdo bez id pryč, bez nabídky pryč', [uk.length, uk[0].stav, uk[0].kdo.length], [1, 'volne', 1]);
  const u = (id: number, stav: UkolNavic['stav'], points: number): UkolNavic => ({ nabidka: n({ id, points, title: `U${id}` }), termin: 'x', obsazeno: 0, stav, mojeZapisy: 0, workId: null, kdo: [] });
  eq('řazení: vzaté, volné podle bodů, čeká, uznané, plné', seradUkoly([u(1, 'plno', 50), u(2, 'volne', 10), u(3, 'uznano', 90), u(4, 'vzato', 5), u(5, 'volne', 30), u(6, 'ceka', 1)]).map(x => x.nabidka.id), [4, 5, 2, 6, 3, 1]);
  eq('popis opakování', [popisOpakovani(n({})).klic, popisOpakovani(n({ recurrence: 'interval', recInterval: 4 })), popisOpakovani(n({ recurrence: 'dny', recDays: [1, 5] })).dny], ['Kdykoli', { klic: 'Každých {n} dní', n: 4 }, [1, 5]]);

  // ---- doplnění nových widgetů do uloženého rozložení ----
  const najdi = (id: string) => (id === 'novy' ? { ...widget('chat.neprectene')!, id: 'novy', pridano: '2026-10-14' } : id === 'stary' ? { ...widget('chat.neprectene')!, id: 'stary' } : widget(id));
  const kod = [{ id: 'a', widget: 'a-w', velikost: 'M' as const }, { id: 'novy', widget: 'novy', velikost: 'M' as const }, { id: 'b', widget: 'b-w', velikost: 'M' as const }, { id: 'stary', widget: 'stary', velikost: 'S' as const }];
  const ulozene = [{ id: 'b', widget: 'b-w', velikost: 'M' as const }, { id: 'a', widget: 'a-w', velikost: 'S' as const }];
  eq('doplnění: rozložení uložené před přidáním dostane nový widget za předchůdce', doplnNove(ulozene, kod, '2026-10-01T10:00:00Z', najdi as any).map(p => p.widget), ['b-w', 'a-w', 'novy']);
  eq('doplnění: uložené po přidání — volba člověka platí', doplnNove(ulozene, kod, '2026-10-20T10:00:00Z', najdi as any).map(p => p.widget), ['b-w', 'a-w']);
  eq('doplnění: widget bez data přidání se nedoplňuje (starý)', doplnNove([], kod, '2026-10-01', najdi as any).map(p => p.widget), ['novy']);
  eq('doplnění: už přítomný se nepřidá', doplnNove([{ id: 'x', widget: 'novy', velikost: 'S' }], kod, '2026-10-01', najdi as any).length, 1);
  eq('doplnění: bez data uložení se bere jako staré', doplnNove(ulozene, kod, null, najdi as any).map(p => p.widget), ['b-w', 'a-w', 'novy']);
  ok('Navíc a Tresty mají datum přidání', ['moje-smeny.navic', 'moje-smeny.tresty', 'odmeny.navic_tymu', 'odmeny.tresty_tymu'].every(id => typeof widget(id)?.pridano === 'string'));
}
