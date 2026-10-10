// Úkoly: filtry, záložky stavu, hledání, řazení, statistika, graf a měsíční kalendář (lib/ukolyFiltr.ts).
import type { Testy } from './_testy.ts';
import {
  VYCHOZI_FILTR, filtrujUkoly, poctyStavu, stavUkolu, odpovidaHledani, ukolyPoDnech, statistikaUkolu, splneniPodleLidi,
  kalendarUkolu, ukolyDne, postupChecklistu, pocetFiltru, seradUkoly,
} from '../../lib/ukolyFiltr.ts';
import type { Ukol } from '../../lib/ukolyPrehled.ts';

const DNES = '2026-10-07'; // středa
const TYDEN = '2026-10-14';
const u = (id: number, o: Partial<Ukol> = {}): Ukol => ({
  id, title: `Úkol ${id}`, description: null, status: 'pending', priority: 'medium', dueDate: DNES, assignedTo: 1, createdBy: 1, teamTask: false,
  assigneeName: 'Eva Testová', assigneeAvatar: null, completedBy: null, completedByName: null, completedAt: null, createdAt: '2026-10-01T08:00:00Z',
  recurrence: null, seriesId: null, checklist: [], source: null, sourceMeta: null, requireBeforeClosing: false, ...o,
});

export default function ({ eq, ok }: Testy) {
  const ukoly: Ukol[] = [
    u(1, { dueDate: '2026-10-05', priority: 'high', title: 'Objednat mléko' }),                         // po termínu
    u(2, { dueDate: DNES, title: 'Umýt okna', description: 'Včetně rámů' }),                           // dnes
    u(3, { dueDate: '2026-10-10', assignedTo: null, teamTask: true, assigneeName: null }),             // týden, pro kohokoli
    u(4, { dueDate: '2026-10-30', priority: 'low' }),                                                  // později
    u(5, { dueDate: null }),                                                                           // bez termínu
    u(6, { dueDate: DNES, status: 'done', completedAt: '2026-10-07T06:30:00Z', completedBy: 1, completedByName: 'Eva Testová' }),
    u(7, { dueDate: '2026-10-05', status: 'done', completedAt: '2026-10-06T10:00:00Z', completedBy: 2, completedByName: 'Martin', assignedTo: 2, assigneeName: 'Martin' }), // pozdě
    u(8, { dueDate: DNES, source: 'production', requireBeforeClosing: true, title: 'Vyrobit limonádu', checklist: [{ text: 'Citrony', done: true }, { text: 'Cukr', done: false }] }),
  ];

  eq('stav: včerejší termín = po termínu', stavUkolu(ukoly[0], DNES, TYDEN), 'po_terminu');
  eq('stav: dnešní termín = dnes (ne po termínu)', stavUkolu(ukoly[1], DNES, TYDEN), 'dnes');
  eq('stav: do týdne', stavUkolu(ukoly[2], DNES, TYDEN), 'tyden');
  eq('stav: později', stavUkolu(ukoly[3], DNES, TYDEN), 'pozdeji');
  eq('stav: bez termínu', stavUkolu(ukoly[4], DNES, TYDEN), 'bez_terminu');
  eq('stav: hotový vždy hotové', stavUkolu(ukoly[6], DNES, TYDEN), 'hotove');

  const p = poctyStavu(ukoly, VYCHOZI_FILTR, DNES, TYDEN);
  eq('počty: po termínu / dnes / týden / později / bez / hotové', [p.po_terminu, p.dnes, p.tyden, p.pozdeji, p.bez_terminu, p.hotove], [1, 2, 1, 1, 1, 2]);
  eq('počty: „vše" jsou všechny úkoly včetně hotových', p.vse, 8);

  eq('filtr: záložka Dnes', filtrujUkoly(ukoly, { ...VYCHOZI_FILTR, stav: 'dnes' }, DNES, TYDEN).map(x => x.id), [2, 8]);
  eq('filtr: záložka Hotové', filtrujUkoly(ukoly, { ...VYCHOZI_FILTR, stav: 'hotove' }, DNES, TYDEN).map(x => x.id).sort(), [6, 7]);
  eq('filtr: priorita vysoká', filtrujUkoly(ukoly, { ...VYCHOZI_FILTR, priorita: ['high'] }, DNES, TYDEN).map(x => x.id), [1]);
  eq('filtr: priorita vysoká nebo nízká', filtrujUkoly(ukoly, { ...VYCHOZI_FILTR, priorita: ['high', 'low'] }, DNES, TYDEN).map(x => x.id), [1, 4]);
  eq('filtr: pro kohokoli', filtrujUkoly(ukoly, { ...VYCHOZI_FILTR, kdo: 'volne' }, DNES, TYDEN).map(x => x.id), [3]);
  eq('filtr: konkrétní člověk', filtrujUkoly(ukoly, { ...VYCHOZI_FILTR, kdo: 2 }, DNES, TYDEN).map(x => x.id), [7]);
  eq('filtr: výroba', filtrujUkoly(ukoly, { ...VYCHOZI_FILTR, zdroj: 'vyroba' }, DNES, TYDEN).map(x => x.id), [8]);
  eq('filtr: povinné před uzávěrkou', filtrujUkoly(ukoly, { ...VYCHOZI_FILTR, zdroj: 'povinne' }, DNES, TYDEN).map(x => x.id), [8]);
  eq('filtr: ručně zadané nejsou výroba', filtrujUkoly(ukoly, { ...VYCHOZI_FILTR, zdroj: 'rucni' }, DNES, TYDEN).some(x => x.id === 8), false);
  eq('filtr: dny v týdnu termínu (středa = 2)', filtrujUkoly(ukoly, { ...VYCHOZI_FILTR, dny: [2] }, DNES, TYDEN).map(x => x.id).sort(), [2, 6, 8]);
  eq('filtr: úkol bez termínu neprojde filtrem dne v týdnu', filtrujUkoly(ukoly, { ...VYCHOZI_FILTR, dny: [0, 1, 2, 3, 4, 5, 6] }, DNES, TYDEN).some(x => x.id === 5), false);
  eq('filtr: počty záložek respektují ostatní filtry', poctyStavu(ukoly, { ...VYCHOZI_FILTR, priorita: ['high'] }, DNES, TYDEN).po_terminu, 1);

  ok('hledání: bez diakritiky (mleko → mléko)', odpovidaHledani(ukoly[0], 'mleko'));
  ok('hledání: v popisu', odpovidaHledani(ukoly[1], 'ramu'));
  ok('hledání: v bodech seznamu', odpovidaHledani(ukoly[7], 'citrony'));
  ok('hledání: ve jméně zadaného člověka', odpovidaHledani(ukoly[1], 'testova'));
  ok('hledání: víc slov musí sedět všechna', !odpovidaHledani(ukoly[1], 'okna mleko'));
  ok('hledání: prázdné pustí vše', odpovidaHledani(ukoly[1], '   '));
  eq('filtr: hledání v seznamu', filtrujUkoly(ukoly, { ...VYCHOZI_FILTR, hledat: 'limonad' }, DNES, TYDEN).map(x => x.id), [8]);

  eq('řazení: podle priority (vysoká první)', seradUkoly(ukoly, 'priorita').map(x => x.id).slice(0, 1), [1]);
  eq('řazení: podle termínu, bez termínu nakonec', seradUkoly(ukoly, 'termin').at(-1)?.id, 5);
  eq('řazení: podle názvu', seradUkoly([u(1, { title: 'Ždímat' }), u(2, { title: 'Auto' })], 'nazev').map(x => x.id), [2, 1]);
  eq('filtry: počet zapnutých (priorita, den, řazení)', pocetFiltru({ ...VYCHOZI_FILTR, priorita: ['high'], dny: [1], razeni: 'nazev' }), 3);
  eq('filtry: člověk a stav se do počtu nepočítají', pocetFiltru({ ...VYCHOZI_FILTR, kdo: 3, stav: 'dnes' }), 0);

  // Graf a statistika
  const sp = ukolyPoDnech(ukoly, '2026-10-05', '2026-10-08', 'splneno');
  eq('graf: splněno po dnech (6. a 7.)', sp.map(x => x.hodnota), [0, 1, 1, 0]);
  eq('graf: termíny po dnech', ukolyPoDnech(ukoly, '2026-10-05', '2026-10-07', 'terminy').map(x => x.hodnota), [2, 0, 3]);
  eq('graf: založeno po dnech', ukolyPoDnech(ukoly, '2026-10-01', '2026-10-02', 'zalozeno').map(x => x.hodnota), [8, 0]);
  const s = statistikaUkolu(ukoly, '2026-10-01', '2026-10-31', DNES);
  eq('statistika: splněno / založeno', [s.splneno, s.zalozeno], [2, 8]);
  eq('statistika: v termínu (jeden z dvou splněných pozdě)', s.vTerminuPct, 50);
  eq('statistika: úspěšnost = hotové z těch, jejichž termín nastal', s.uspesnostPct, 40); // termíny do dneška: úkoly 1, 2, 6, 7, 8 → hotové 6 a 7
  eq('statistika: po termínu', s.poTerminu, 1);

  const lidi = splneniPodleLidi(ukoly, '2026-10-01', '2026-10-31', DNES);
  eq('lidé: kdo kolik splnil', lidi.filter(x => x.splneno > 0).map(x => [x.jmeno, x.splneno]).sort(), [['Eva Testová', 1], ['Martin', 1]]);
  eq('lidé: Eva má po termínu jeden', lidi.find(x => x.id === 1)?.poTerminu, 1);

  // Kalendář
  const kal = kalendarUkolu(ukoly, '2026-10', DNES, 1);
  eq('kalendář: každý týden má sedm buněk', kal.every(r => r.length === 7), true);
  eq('kalendář: říjen 2026 začíná ve čtvrtek (3 prázdné buňky)', kal[0].filter(b => b.den == null).length, 3);
  const bunka = (d: string) => kal.flat().find(b => b.den === d)!;
  eq('kalendář: dnešek má 3 úkoly, 1 hotový', [bunka(DNES).celkem, bunka(DNES).hotovo, bunka(DNES).dnes], [3, 1, true]);
  eq('kalendář: 5. října má jeden po termínu a jeden hotový', [bunka('2026-10-05').celkem, bunka('2026-10-05').poTerminu, bunka('2026-10-05').hotovo], [2, 1, 1]);
  eq('kalendář: s týdnem od neděle začíná říjen po čtyřech prázdných buňkách', kalendarUkolu(ukoly, '2026-10', DNES, 0)[0].filter(b => b.den == null).length, 4);
  eq('úkoly dne: nehotové první', ukolyDne(ukoly, DNES).map(x => x.id), [2, 8, 6]);
  eq('checklist: postup 50 %', postupChecklistu(ukoly[7]), 50);
  eq('checklist: bez bodů = null', postupChecklistu(ukoly[0]), null);
}
