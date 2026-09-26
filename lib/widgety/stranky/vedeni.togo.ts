// Stránka „TO GO" (vedení) — kapesní režim na telefonu. Plocha je aktivní od kola 69 (balík B5b).
//
// Dřív byly dlaždice a karty TO GO natvrdo v kódu (tmavý hero, devět šedých dlaždic, karty zpráv
// a zásob) a nedalo se nic přeskládat ani skrýt — přitom zrovna na telefonu chce majitel domovskou
// obrazovku „jako iOS" nejvíc. Teď jede ze stejného registru jako Přehled: hero je Pokladna dnes
// (jediná inkoustová plocha), týden je Tržba po dnech, zprávy, sklad a účtenky jsou malé widgety.
// Místo devíti dlaždic jsou tu widgety, které samy vedou do svých záložek a nesou i číslo:
// Uzávěrky ke schválení (dřív odznak na dlaždici Přehledy), Úkoly na dnes a Odkaz na Postupy.
// Odkaz je ve výchozím rozložení jen jeden — každý nese katalogovou ikonu `chevronRight`
// a druhý by ji opakoval (AK-19); další zkratky si člověk přidá sám.
// „Kdo je dnes v podniku" nese zatím Právě na směně: 'dochazka.dnes_v_podniku' (plán proti
// skutečnosti) je plánovaný widget balíku B2 a plánovaný se nekreslí. Až ho B2 dodá jako
// hotový, vymění se tady za Právě na směně (pro integraci, §6.4 bod 3).
// Nástroj stránka nemá.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.togo',
  rozhrani: 'vedeni',
  nazev: 'TO GO',
  pohled: 'togo',
  pristup: null,
  nastroj: null,
  inkoust: true,
  doporucene: [
    'pokladna.dnes',
    'trzby.po_dnech',
    'dochazka.prave_na_smene',
    'dochazka.dnes_v_podniku',
    'vyroba.k_vyrobe',
    'uzaverky.ke_schvaleni',
    'ukoly.dnes',
    'chat.neprectene',
    'sklad.dochazi',
    'finance.uctenky',
    'odkaz',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'pokladna.dnes', s: 'M' },
      { w: 'trzby.po_dnech', s: 'M' },
      { w: 'dochazka.prave_na_smene', s: 'M' },
      { w: 'vyroba.k_vyrobe', s: 'M' },
      { w: 'uzaverky.ke_schvaleni', s: 'S' },
      { w: 'ukoly.dnes', s: 'S' },
      { w: 'chat.neprectene', s: 'S' },
      { w: 'sklad.dochazi', s: 'S' },
      { w: 'finance.uctenky', s: 'S' },
      { w: 'odkaz', s: 'S', o: { cil: 'view:procedures' } },
    ],
  },
  aktivni: true,
};
