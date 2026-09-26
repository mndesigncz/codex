// Stránka „Všechny podniky" (vedení). Katalog widgetů ji nezná (OrgOverview zůstává stránkou);
// plochu zapnul balík B5b v kole 69.
//
// Součty celé organizace (tržby, mzdy, chybějící uzávěrky, lidé na směně, sklad) jsou widget
// Všechny podniky ve střední velikosti; seznam podniků s „Otevřít" je nástroj stránky. Měsíc
// z přepínače v hlavičce řídí obojí. Ikona nástroje je `overview` — `chart` nese widget.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.vsechny_podniky',
  rozhrani: 'vedeni',
  nazev: 'Všechny podniky',
  pohled: 'org',
  pristup: null,
  nastroj: {
    nazev: 'Podniky organizace',
    ikona: 'overview',
    popis: 'Každý podnik organizace zvlášť: tržby, mzdy, uzávěrky, lidé na směně a sklad, s přepnutím do podniku.',
  },
  doporucene: ['organizace.podniky'],
  vychozi: { 'typ:vedeni': [{ w: 'organizace.podniky', s: 'M' }, { w: 'nastroj' }] },
  aktivni: true,
};
