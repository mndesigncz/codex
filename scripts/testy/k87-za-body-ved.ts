// Kolo 11, balík V: „Úkoly za body" u vedení — formulář okna (z položky a zpět do těla pro
// validujNabidku), souhrn dne pro widget a část Úkolů, fronta z úkolů za body, předání `arg`,
// widget v katalogu a ve výchozích rozloženích, akce hledání.
import type { Testy } from './_testy.ts';
import { validujNabidku, type NabidkaNavic, type Navic, type UkolNavic } from '../../lib/navic.ts';
import {
  ARG_ZA_BODY, ARG_ZA_BODY_NOVY, cekajiciZUkolu, formularZNabidky, krokBoduUkolu, prepniDen, rozborArgZaBody, seradProVedeni, souhrnZaBody, teloFormulare, volnaMista,
} from '../../components/navic-vedeni/zaBody.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';
import { STRANKA as UKOLY } from '../../lib/widgety/stranky/vedeni.ukoly.ts';
import { STRANKA as ODMENY } from '../../lib/widgety/stranky/vedeni.odmeny.ts';
import { STRANKA as PREHLED } from '../../lib/widgety/stranky/vedeni.prehled.ts';
import { AKCE_HLEDANI } from '../../components/widgety/akceHledani.ts';

const n = (p: Partial<NabidkaNavic>): NabidkaNavic => ({
  id: 1, title: 'Umýt okna', description: null, points: 20, bonusCzk: null, autoApprove: false, active: true, validFrom: null, validTo: null,
  maxPerDay: 1, recurrence: 'kdykoli', recDays: [], recInterval: null, capacity: null, requirePhoto: false, targetUsers: [], createdAt: '', ...p,
});
const u = (nab: Partial<NabidkaNavic>, obsazeno: number, kdo: UkolNavic['kdo'] = []): UkolNavic => ({
  nabidka: n(nab), termin: '2026-10-14', obsazeno, stav: 'volne', mojeZapisy: 0, workId: null, kdo,
});

export default function ({ eq, ok }: Testy) {
  // ---- předání ----
  eq('arg: za-body otevře část, za-body:novy i okno, jiné nic', [rozborArgZaBody(ARG_ZA_BODY), rozborArgZaBody(ARG_ZA_BODY_NOVY), rozborArgZaBody('stav:dnes'), rozborArgZaBody(null)],
    [{ novy: false }, { novy: true }, null, null]);

  // ---- formulář ----
  const novy = formularZNabidky(null, { nazev: '  Vytřít sklad ', popis: 'i chodbu' });
  eq('nový: předvyplněný název a popis (oříznuté), 20 b, kdykoli, 1 člověk jednou', [novy.nazev, novy.popis, novy.body, novy.opakovani, novy.kapacita, novy.limit, novy.aktivni],
    ['Vytřít sklad', 'i chodbu', '20', 'kdykoli', '1', '1', true]);
  const v1 = validujNabidku(teloFormulare(novy));
  ok('nový úkol z výchozího formuláře projde validací serveru', v1.ok && v1.nabidka.capacity === 1 && v1.nabidka.maxPerDay === 1 && v1.nabidka.points === 20);
  const upr = formularZNabidky(n({ recurrence: 'dny', recDays: [5, 1], capacity: null, maxPerDay: null, targetUsers: [16, 17], bonusCzk: 150, requirePhoto: true, autoApprove: true }));
  eq('úprava: dny, kdokoli, bez limitu, vybraní lidé, prémie, fotka, auto', [upr.opakovani, upr.dny, upr.kapacita, upr.limit, upr.jenVybranym, upr.komu, upr.premie, upr.fotka, upr.auto],
    ['dny', [5, 1], '', '', true, [16, 17], '150', true, true]);
  const telo = teloFormulare(upr);
  eq('tělo: dny seřazené, prázdná kapacita = null (kdokoli), limit null, komu', [telo.recDays, telo.capacity, telo.maxPerDay, telo.targetUsers, telo.bonusCzk], [[1, 5], null, null, [16, 17], 150]);
  ok('tělo úpravy projde validací serveru', validujNabidku(telo).ok);
  eq('tělo: „všem" pošle prázdné komu, i když jsou lidé vybraní', teloFormulare({ ...upr, jenVybranym: false }).targetUsers, []);
  eq('tělo: dny a interval se posílají jen u svého opakování', [teloFormulare({ ...upr, opakovani: 'tydne' }).recDays, teloFormulare({ ...upr, opakovani: 'tydne' }).recInterval], [[], null]);
  const iv = formularZNabidky(n({ recurrence: 'interval', recInterval: 3, validFrom: '2026-10-10' }));
  eq('interval: 3 dny od 10. 10.', [iv.interval, iv.od, teloFormulare(iv).recInterval], ['3', '2026-10-10', 3]);
  const ivBezOd = validujNabidku(teloFormulare({ ...iv, od: '' }));
  eq('interval bez „od" → hláška serveru', ivBezOd.ok ? '' : ivBezOd.chyba, 'U opakování po dnech vyplň, od kdy se počítá (platí od).');
  const dnyPrazdne = validujNabidku(teloFormulare({ ...upr, dny: [] }));
  eq('vybrané dny bez dne → hláška', dnyPrazdne.ok ? '' : dnyPrazdne.chyba, 'Vyber aspoň jeden den v týdnu.');
  eq('přepnutí dne: přidá seřazeně, druhé klepnutí ubere', [prepniDen([3], 1), prepniDen([1, 3], 3)], [[1, 3], [1]]);
  eq('krokovač bodů: ±5 v mezích 0–500, nečíslo = 0', [krokBoduUkolu('20', 1, 500), krokBoduUkolu('3', -1, 500), krokBoduUkolu('498', 1, 500), krokBoduUkolu('x', 1, 500)], [25, 0, 500, 5]);

  // ---- souhrn dne ----
  const ukoly = [
    u({ id: 1, points: 20, capacity: 1 }, 1, [{ userId: 16, name: 'Eva', stav: 'vzato' }]),
    u({ id: 2, points: 30, capacity: 2 }, 1, [{ userId: 17, name: 'Jakub', stav: 'hotovo' }]),
    u({ id: 3, points: 10, capacity: null }, 0),
  ];
  eq('volná místa: plný 0, 1 z 2, kdokoli null', ukoly.map(volnaMista), [0, 1, null]);
  eq('souhrn: 3 úkoly, 2 volné, 1 vzato, 1 hotovo, až 60 b', souhrnZaBody(ukoly), { pocet: 3, volne: 2, vzato: 1, hotovo: 1, body: 60 });
  eq('řazení pro vedení: kde se něco děje, pak volné, plné dole', seradProVedeni(ukoly).map(x => x.nabidka.id), [2, 3, 1]);

  // ---- fronta ----
  const z = (id: number, status: Navic['status'], offerId: number | null) => ({ id, status, offerId } as Navic);
  eq('fronta: jen čekající zápisy z úkolů za body', cekajiciZUkolu([z(1, 'ceka', 4), z(2, 'ceka', null), z(3, 'uznano', 4)]).map(x => x.id), [1]);

  // ---- widget a rozložení ----
  const w = widget('odmeny.za_body_tymu');
  ok('katalog: Úkoly za body dnes je hotový, M/L, vedení, pridano 2026-10-14, proklik do Úkolů › za-body',
    !!w && w.stav === 'hotovo' && w.pridano === '2026-10-14' && w.velikosti.join() === 'M,L' && w.rozhrani.join() === 'vedeni' && w.cil?.pohled === 'tasks' && w.cil?.arg === ARG_ZA_BODY);
  eq('katalog: oprávnění navic.zobrazit_tym, Uznat s navic.uznat, Nový s navic.nabidka', [w?.opravneni.vse, w?.opravneni.pole?.['akce:uznat'], w?.opravneni.pole?.['akce:novy']],
    [['navic.zobrazit_tym'], 'navic.uznat', 'navic.nabidka']);
  const vUkolech = UKOLY.vychozi['typ:vedeni'] ?? [];
  eq('Úkoly vedení: výchozí = nástroj a pod ním Úkoly za body dnes', vUkolech.map(x => x.w), ['nastroj', 'odmeny.za_body_tymu']);
  const vOdmenach = (ODMENY.vychozi['typ:vedeni'] ?? []).map(x => x.w);
  ok('Odměny: Úkoly za body dnes hned za Navíc v týmu', vOdmenach.indexOf('odmeny.za_body_tymu') === vOdmenach.indexOf('odmeny.navic_tymu') + 1);
  // Přehled: zatím jen v Doporučených — na konci výchozího by ho doplnNove přidalo i do řádků bez `upraveno`
  // v testech k68-widgety (hlášení balíku V). Ukázka beze změny: test k86 drží Tresty v týmu úplně na konci.
  ok('Přehled: Úkoly za body dnes je v Doporučených', PREHLED.doporucene.includes('odmeny.za_body_tymu'));

  // ---- hledání ----
  const akce = AKCE_HLEDANI.find(a => a.id === 'ukoly-za-body');
  const novyA = AKCE_HLEDANI.find(a => a.id === 'ukoly-za-body-novy');
  eq('hledání: Úkoly za body vedou do Úkolů s za-body pro vedení i zaměstnance', [akce?.stranka, akce?.arg, akce?.rozhrani], ['tasks', ARG_ZA_BODY, ['vedeni', 'zamestnanec']]);
  eq('hledání: Nový úkol za body jen vedení, s oknem', [novyA?.stranka, novyA?.arg, novyA?.rozhrani], ['tasks', ARG_ZA_BODY_NOVY, ['vedeni']]);
  ok('hledání: slova volitelné, extra body, bonusové úkoly, nabídka navíc', ['volitelné', 'extra body', 'bonusové úkoly', 'nabídka navíc', 'za body'].every(s => akce?.slova.includes(s)));
}
