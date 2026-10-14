// Akce a nastavení v globálním hledání (Ctrl/⌘ K): „Export docházky", „Nastavení › Pokladna", „Úkoly po termínu"…
// Paleta příkazů jako v Linearu, Notionu nebo Slacku — člověk napíše, co chce udělat, a hledání ho pošle rovnou
// na místo s tím správným filtrem (stránka + `arg`, stejný deep link jako z widgetů). Dřív se funkce hledaly po
// stránkách a záložkách, a kdo nevěděl, kde co je, ji nenašel.
//
// Registr je data: text, klíčová slova (synonyma, hovorové výrazy), cíl a kdo ji má (vedení / zaměstnanec).
// Texty jsou klíče překladu v sekci „widgety" (tam žije i GlobalniHledani); soubor je pod components/widgety, protože
// check-i18n bere klíče v uvozovkách odtud jako použité (překládají se nepřímo přes t(akce.nazev)).

export type Rozhrani = 'vedeni' | 'zamestnanec';

export interface AkceHledani {
  id: string;
  /** Název akce (klíč překladu). */
  nazev: string;
  /** Kde to je — podtitulek („Nastavení", „Sklad"); klíč překladu. */
  kde: string;
  ikona: string;
  /** Synonyma, bez diakritiky i s ní nevadí (hledání ji stejně odstraňuje). */
  slova: string[];
  stranka: string;
  arg?: string;
  rozhrani: Rozhrani[];
}

const V: Rozhrani[] = ['vedeni'];
const Z: Rozhrani[] = ['zamestnanec'];
const VZ: Rozhrani[] = ['vedeni', 'zamestnanec'];

export const AKCE_HLEDANI: AkceHledani[] = [
  // Úkoly
  { id: 'ukoly-po-terminu', nazev: 'Úkoly po termínu', kde: 'Úkoly', ikona: 'check', slova: ['zpožděné', 'nesplněné', 'deadline'], stranka: 'tasks', arg: 'stav:po_terminu', rozhrani: VZ },
  { id: 'ukoly-dnes', nazev: 'Úkoly na dnes', kde: 'Úkoly', ikona: 'check', slova: ['dnešní', 'co mám dělat'], stranka: 'tasks', arg: 'stav:dnes', rozhrani: VZ },
  { id: 'ukoly-tyden', nazev: 'Úkoly v týdnu', kde: 'Úkoly', ikona: 'calendar', slova: ['týdenní', 'plán týdne'], stranka: 'tasks', arg: 'pohled:week', rozhrani: VZ },
  { id: 'ukoly-prehled', nazev: 'Přehled plnění úkolů', kde: 'Úkoly', ikona: 'trend', slova: ['statistika', 'graf', 'výkon', 'kdo plní'], stranka: 'tasks', arg: 'pohled:prehled', rozhrani: V },
  // Sklad
  { id: 'sklad-dochazi', nazev: 'Co dochází ve skladu', kde: 'Sklad', ikona: 'box', slova: ['zásoby', 'málo', 'kriticky', 'objednat', 'nákup'], stranka: 'inventory', arg: 'stav:dochazi', rozhrani: V },
  { id: 'sklad-nakup', nazev: 'Nákupní seznam', kde: 'Sklad', ikona: 'cart', slova: ['objednávka', 'nakoupit', 'dodavatel'], stranka: 'inventory', arg: 'stav:dochazi', rozhrani: V },
  { id: 'sklad-zapsat', nazev: 'Zapsat stav skladu', kde: 'Sklad', ikona: 'box', slova: ['inventura', 'zbytky', 'spočítat', 'hlášení'], stranka: 'inventory', rozhrani: Z },
  { id: 'receptury', nazev: 'Receptury a odpis z kasy', kde: 'Receptury', ikona: 'clipboard', slova: ['recept', 'suroviny', 'odepsat', 'kasa', 'produkt'], stranka: 'recipes', rozhrani: VZ },
  // Docházka a lidé
  { id: 'dochazka-export', nazev: 'Export docházky pro účetní', kde: 'Docházka', ikona: 'download', slova: ['csv', 'mzdy', 'účetní', 'hodiny', 'výplata'], stranka: 'attendance', rozhrani: V },
  { id: 'dochazka-premie', nazev: 'Prémie a srážky k mzdě', kde: 'Docházka › Souhrn hodin', ikona: 'coins', slova: ['bonus', 'odměna v penězích', 'srážka', 'výplata'], stranka: 'attendance', rozhrani: V },
  { id: 'tym-pozvat', nazev: 'Pozvat člena týmu', kde: 'Tým', ikona: 'users', slova: ['pozvánka', 'kód', 'nový zaměstnanec', 'přidat člověka'], stranka: 'team-settings', rozhrani: V },
  // Role a oprávnění bydlí v Nastavení (záložka roles), ne v Týmu — dřív akce vedla na Tým a člověk hledal dál.
  { id: 'tym-role', nazev: 'Role a oprávnění', kde: 'Nastavení', ikona: 'lock', slova: ['práva', 'přístup', 'kdo smí'], stranka: 'settings', arg: 'roles', rozhrani: V },
  // Rozvrh
  { id: 'rozvrh-generovat', nazev: 'Vygenerovat rozvrh', kde: 'Rozvrh', ikona: 'calendar', slova: ['směny', 'naplánovat', 'plán směn'], stranka: 'shifts', rozhrani: V },
  // Kolo 7: jen navigace na Rozvrh (widget Dostupnost týmu s tlačítkem Připomenout) — push z palety se neposílá.
  { id: 'dostupnost-pripomenout', nazev: 'Připomenout dostupnost', kde: 'Rozvrh', ikona: 'bell', slova: ['nezadali dostupnost', 'připomínka', 'upozornit', 'chybí dostupnost'], stranka: 'shifts', rozhrani: V },
  { id: 'dostupnost', nazev: 'Zadat dostupnost', kde: 'Dostupnost', ikona: 'calendar', slova: ['kdy můžu', 'volno', 'směny'], stranka: 'availability', rozhrani: Z },
  // Kolo 7: žádost o volno má vlastní akci — `arg: 'volno'` otevře na Dostupnosti rovnou okno žádosti.
  { id: 'volno-zadost', nazev: 'Požádat o volno', kde: 'Dostupnost', ikona: 'calendar', slova: ['dovolená', 'nemoc', 'volno', 'nepřítomnost'], stranka: 'availability', arg: 'volno', rozhrani: Z },
  { id: 'moje-smeny', nazev: 'Moje směny', kde: 'Směny', ikona: 'calendar', slova: ['kdy pracuju', 'rozvrh', 'výměna směny'], stranka: 'my-shifts', rozhrani: VZ },
  // Kasa a finance
  { id: 'uzaverka-nova', nazev: 'Nová uzávěrka', kde: 'Uzávěrky', ikona: 'coins', slova: ['kasa', 'zavřít kasu', 'spočítat kasu', 'tržba', 'konec směny'], stranka: 'reports', rozhrani: V },
  { id: 'uzaverka-zam', nazev: 'Vyplnit uzávěrku', kde: 'Uzávěrka', ikona: 'coins', slova: ['kasa', 'zavřít kasu', 'spočítat kasu', 'tržba', 'konec směny'], stranka: 'closing', rozhrani: Z },
  { id: 'finance-export', nazev: 'Export pro účetní', kde: 'Finance', ikona: 'download', slova: ['účetnictví', 'výdaje', 'účtenky', 'csv'], stranka: 'finance', rozhrani: V },
  { id: 'finance-dysko', nazev: 'Spropitné za měsíc', kde: 'Finance', ikona: 'coins', slova: ['dýško', 'tips', 'spropitne'], stranka: 'finance', rozhrani: V },
  // Návody, postupy, nápady
  { id: 'navody-kprecteni', nazev: 'Návody k přečtení', kde: 'Návody', ikona: 'book', slova: ['povinné čtení', 'nepřečtené'], stranka: 'guides', arg: 'stav:kprecteni', rozhrani: VZ },
  { id: 'navody-navrhy', nazev: 'Návody ke schválení', kde: 'Návody', ikona: 'book', slova: ['návrhy', 'schválit'], stranka: 'guides', arg: 'stav:navrhy', rozhrani: V },
  { id: 'postupy-navrhy', nazev: 'Postupy ke schválení', kde: 'Postupy', ikona: 'clipboard', slova: ['návrhy', 'schválit'], stranka: 'procedures', arg: 'stav:navrhy', rozhrani: V },
  { id: 'napady-nove', nazev: 'Nové nápady', kde: 'Nápady', ikona: 'bulb', slova: ['podněty', 'návrhy týmu', 'hlasování'], stranka: 'suggestions', arg: 'stav:new', rozhrani: V },
  { id: 'napad-pridat', nazev: 'Přidat nápad', kde: 'Nápady', ikona: 'bulb', slova: ['podnět', 'zlepšení', 'navrhnout'], stranka: 'suggestions', rozhrani: VZ },
  // Odměny
  { id: 'odmeny-ohodnotit', nazev: 'Ohodnotit směny', kde: 'Odměny', ikona: 'award', slova: ['body', 'hodnocení', 'žebříček'], stranka: 'rewards', rozhrani: V },
  { id: 'odmeny-katalog', nazev: 'Katalog odměn', kde: 'Odměny', ikona: 'gift', slova: ['vyměnit body', 'bonus', 'odměna'], stranka: 'rewards', rozhrani: VZ },
  { id: 'odmeny-pochvalit', nazev: 'Pochválit člena', kde: 'Odměny', ikona: 'award', slova: ['pochvala', 'body navíc', 'uznání', 'kudos', 'ocenit', 'poděkovat'], stranka: 'rewards', rozhrani: V },
  // Kolo 9 (N1): „navíc" — fronta k uznání a nabídka u vedení (Odměny › Navíc), zápis u zaměstnance na Domů.
  { id: 'navic-uznat', nazev: 'Navíc k uznání', kde: 'Odměny', ikona: 'star', slova: ['navíc', 'uznat', 'body navíc', 'nabídka navíc', 'co se dá udělat navíc', 'nad rámec'], stranka: 'rewards', arg: 'navic', rozhrani: V },
  { id: 'navic-zapsat', nazev: 'Zapsat navíc', kde: 'Domů', ikona: 'star', slova: ['navíc', 'udělal jsem navíc', 'nad rámec', 'body'], stranka: 'home', arg: 'navic', rozhrani: Z },
  { id: 'navic-zapsat-vedeni', nazev: 'Zapsat navíc', kde: 'Odměny', ikona: 'star', slova: ['navíc', 'za člena', 'nad rámec', 'body'], stranka: 'rewards', arg: 'navic', rozhrani: V },
  // Kolo 10: tresty — Odměny › Tresty (sazebník; widget Tresty v týmu s Dát trest, nesouhlasy a návrhy je na ploše nad ním).
  { id: 'tresty-dat', nazev: 'Dát trest', kde: 'Odměny', ikona: 'warning', slova: ['trest', 'potrestat', 'napomenutí', 'výtka', 'průšvih', 'pokuta', 'body dolů', 'krácení prémie'], stranka: 'rewards', arg: 'tresty', rozhrani: V },
  { id: 'tresty-sazebnik', nazev: 'Sazebník trestů', kde: 'Odměny', ikona: 'clipboard', slova: ['sazebník', 'tresty', 'prohřešky', 'pozdní příchod', 'manko', 'pokuta'], stranka: 'rewards', arg: 'tresty', rozhrani: V },
  // Nastavení
  { id: 'nastaveni-pokladna', nazev: 'Nastavení › Pokladna', kde: 'Nastavení', ikona: 'trend', slova: ['kasa', 'propojit', 'pos', 'storyous', 'dotykačka'], stranka: 'settings', arg: 'pos', rozhrani: V },
  { id: 'nastaveni-notifikace', nazev: 'Nastavení › Notifikace', kde: 'Nastavení', ikona: 'bell', slova: ['oznámení', 'push', 'upozornění', 'e-mail'], stranka: 'settings', arg: 'notifications', rozhrani: VZ },
  { id: 'nastaveni-jazyk', nazev: 'Nastavení › Jazyk a region', kde: 'Nastavení', ikona: 'globe', slova: ['čeština', 'angličtina', 'měna', 'language'], stranka: 'settings', arg: 'jazyk', rozhrani: VZ },
  { id: 'nastaveni-vzhled', nazev: 'Nastavení › Vzhled', kde: 'Nastavení', ikona: 'sparkle', slova: ['tmavý režim', 'motiv', 'dark mode', 'hustota'], stranka: 'settings', arg: 'app', rozhrani: VZ },
  { id: 'nastaveni-zabezpeceni', nazev: 'Nastavení › Zabezpečení', kde: 'Nastavení', ikona: 'lock', slova: ['heslo', 'pin', 'přihlášení'], stranka: 'settings', arg: 'security', rozhrani: VZ },
  { id: 'nastaveni-podnik', nazev: 'Nastavení › Profil podniku', kde: 'Nastavení', ikona: 'receipt', slova: ['název podniku', 'adresa', 'prahy skladu', 'ičo'], stranka: 'settings', arg: 'podnik', rozhrani: V },
  { id: 'nastaveni-predplatne', nazev: 'Nastavení › Předplatné', kde: 'Nastavení', ikona: 'award', slova: ['platba', 'faktura', 'pro', 'tarif'], stranka: 'settings', arg: 'billing', rozhrani: V },
  { id: 'nastaveni-historie', nazev: 'Historie změn', kde: 'Nastavení', ikona: 'clock', slova: ['audit', 'kdo co změnil', 'log'], stranka: 'settings', arg: 'audit', rozhrani: V },
  { id: 'nastaveni-zkratky', nazev: 'Klávesové zkratky', kde: 'Nastavení', ikona: 'menu', slova: ['klávesnice', 'ctrl k', 'hotkey'], stranka: 'settings', arg: 'zkratky', rozhrani: VZ },
  { id: 'menu', nazev: 'Menu pro hosty', kde: 'Menu', ikona: 'clipboard', slova: ['nabídka', 'jídelní lístek', 'qr', 'ipad'], stranka: 'menu', rozhrani: V },
  { id: 'planovani', nazev: 'Nová karta v plánování', kde: 'Plánování', ikona: 'kanban', slova: ['tabule', 'projekt', 'nápady rozpracovat'], stranka: 'planning', rozhrani: V },
];

/** Akce pro dané rozhraní, které divák smí otevřít (stránka podle `smiPohled`). */
export function akceProHledani(rozhrani: Rozhrani, smiPohled: (stranka: string) => boolean): AkceHledani[] {
  return AKCE_HLEDANI.filter(a => a.rozhrani.includes(rozhrani) && smiPohled(a.stranka));
}
