// Texty prodejní stránky na jednom místě. Česká věta je klíč do slovníku
// `landing` (locales/<jazyk>/landing.json): komponenty je kreslí přes
// `t(…)` z useT('landing'), takže se stránka ukáže v jazyce návštěvníka
// (cookie z přepínače, jinak jazyk prohlížeče, jinak podle země, lib/i18n/jazykPozadavku.ts).
//
// Pravidla, která tu platí a hlídá je scripts/check-landing-obsah.mjs:
//  - žádná vymyšlená jména zákazníků, loga, hodnocení ani čísla o zákaznících;
//    tvrdí se jen to, co o produktu platí (30 dní, tým zdarma, ceny z lib/plan),
//  - čísla jdou do věty jako parametr s plurálem ({n, plural, …}), nikdy napevno,
//  - bez pomlček jako interpunkce a bez slova „čajovna" (kontrola univerzálních textů).
//  - tyká se, stejně jako v aplikaci a v průvodci nastavením.
//
// Jen typové importy: soubor čte i scripts/check-i18n.mjs (Node bez aliasů).

import type { IconName } from '@/components/Icons';
import type { IdNahravky } from './nahravky';
import type { IdSceny } from './ukazka/scenare';

/** `t(ZKUSIT_ZDARMA, { n: TRIAL_DAYS })` */
export const ZKUSIT_ZDARMA = 'Vyzkoušet {n, plural, one {# den} few {# dny} other {# dní}} zdarma';
/** `t(ZDARMA_VETA, { n: LIMITS.free.members })` */
export const ZDARMA_VETA = 'Registrace bez karty. Tým do {n, plural, one {# člověka} other {# lidí}} může na tarifu Zdarma zůstat napořád.';

export const HERO = {
  h1: 'Provoz bez Excelu a bez WhatsAppu. A hosté s kartou v telefonu.',
  podtitulek: 'Směny, sklad a uzávěrky pro tým, věrnostní karty a rezervace pro hosty. Pod tímhle je skutečná aplikace. Klikej, nic nerozbiješ.',
};

// ——— Rozcestník: první obrazovka, kam patříš ————————————————————
// Obrazovka rozdělená napůl (Rozcestnik.tsx). Stejný účet (e-mail a heslo)
// platí pro správu podniku i pro hostovskou část, ale přihlašují se do dvou
// různých míst. Volba podniku se pamatuje v cookie do zavření prohlížeče.
export const COOKIE_ROZCESTNIK = 'mg_volba';
export const ROZCESTNIK = {
  skupina: 'Vyber, kam patříš',
  podnik: {
    stitek: 'Pro podniky',
    nadpis: 'Řídím podnik',
    text: 'Směny, docházka, sklad a uzávěrky na jednom místě. Správa podniku a týmu.',
    hlavni: 'Ukázat, co Managero umí',
    vedlejsi: 'Přihlásit do správy',
  },
  host: {
    stitek: 'Pro hosty',
    nadpis: 'Jsem zákazník',
    text: 'Věrnostní karty, odměny a rezervace v telefonu. Bez instalace.',
    hlavni: 'Otevřít moje karty',
    vedlejsi: 'Vytvořit účet hosta',
  },
  jedenUcet: 'Jeden účet: stejný e-mail a heslo platí pro správu podniku i pro karty.',
};

// ——— Přihlášení v liště ————————————————————————————————————
export const PRIHLASENI = {
  tlacitko: 'Přihlásit',
  skupina: 'Kam se chceš přihlásit',
  podnik: { nazev: 'Správa podniku', popis: 'Směny, sklad, uzávěrky a tým' },
  host: { nazev: 'Moje karty a rezervace', popis: 'Věrnostní karty, odměny a stoly' },
};

// ——— Pro koho ——————————————————————————————————————————————
export const PRO_KOHO = {
  nadpis: 'Pro koho je Managero',
  veta: 'Pro každý podnik, kde se točí směny, počítá kasa a dochází mléko. Jeden podnik nebo víc poboček.',
};

// Typy podniků, ze kterých se vybírá v prvním kroku registrace.
export const TYPY_PODNIKU: string[] = ['Kavárna', 'Restaurace', 'Bar', 'Pekárna', 'Čaj a nápoje', 'Food truck'];

// ——— Funkce ————————————————————————————————————————————————
export interface Funkce {
  icon: IconName;
  title: string;
  text: string;
  /** Scéna živé ukázky, která to ukazuje (chybí = bez odkazu). */
  scena?: IdSceny;
}

export const FUNKCE_NADPIS = {
  nadpis: 'Všechno, co provoz potřebuje',
  perex: 'Věci, které jinak řešíš ve třech aplikacích, dvou sešitech a jedné hlavě.',
};

export const FUNKCE: Funkce[] = [
  { icon: 'calendar', title: 'Rozvrh a směny', scena: 'rozvrh',
    text: 'Generátor navrhne směny podle dostupnosti lidí. Kolizi uvidíš dřív, než rozvrh zveřejníš.' },
  { icon: 'clock', title: 'Docházka', scena: 'kiosk',
    text: 'Příchod jedním klepnutím na telefonu nebo tabletu. Hodiny, mzdové náklady i podklad pro výplaty se sečtou samy.' },
  { icon: 'coins', title: 'Uzávěrky', scena: 'uzaverka',
    text: 'Kasa po bankovkách. Rozdíl se nezamlčí ani nezaokrouhlí a dokud nejsou hotové povinné věci, uzávěrka zůstane zamčená.' },
  { icon: 'box', title: 'Sklad', scena: 'sklad',
    text: 'Minima a nákupní seznam, který se skládá sám. Objednávka pro dodavatele odejde rovnou z aplikace.' },
  { icon: 'cup', title: 'Receptury',
    text: 'Cena receptury spočítaná ze surovin na gramy. Marži vidíš na první pohled.' },
  { icon: 'clipboard', title: 'Úkoly a postupy', scena: 'uzaverka',
    text: 'Otevírání, zavírání a návody pro nováčky. Za splněné úkoly jsou body, u postupů se měří, jak dlouho trvají. Co je povinné, pohlídá aplikace za tebe.' },
  { icon: 'award', title: 'Body, odměny a spropitné',
    text: 'Tým sbírá body za úkoly a povedenou směnu a mění je za odměny. Bonusy navíc, tresty i spropitné po lidech jsou na jednom místě.' },
  { icon: 'chat', title: 'Týmový chat',
    text: 'Kanály, přímé zprávy a ankety. Důležitá věc nezapadne pod padesát zpráv ve skupině.' },
  { icon: 'play', title: 'Tablet u baru', scena: 'kiosk',
    text: 'Jeden sdílený tablet bez hesel. Klepnutí na jméno a každý zapisuje sám za sebe.' },
];

export const FUNKCE_DALSI = 'A k tomu finance s exportem pro účetní, výroba vlastních produktů (tarif Max), akce a catering, widgety na přehledu a rychlé hledání na Ctrl K. Pro hosty je Managero client, viz níž.';
export const V_UKAZCE_VPRAVO = 'V ukázce vpravo: {scena}';
export const UKAZ_V_UKAZCE = 'Ukaž v ukázce';

// ——— Hosté: Managero client ———————————————————————————————————
// Hostovská část Managera (tarif Max). Neslibuje se tu nic, co aplikace
// neumí: žádné aplikace v obchodech, host ji otevře v prohlížeči.
export const HOSTE = {
  max: 'Tarif Max',
  nadpis: 'Hosté mají kartu v telefonu. Ty víš, kdo se vrací.',
  perex: 'Managero client je část pro hosty. Host si u tebe vytvoří věrnostní kartu, rezervuje stůl a objedná od stolu. Ty to spravuješ vedle směn a skladu.',
  poznamka: 'Hostovská část patří do tarifu Max. Co je v kterém tarifu, najdeš v ceníku.',
  ukazka: 'Vyzkoušet ukázku pro hosty',
  cenik: 'Ceník a tarif Max',
  seznam: 'Co hosté a ty dostanete',
  karta: {
    popis: 'Ukázka karty hosta: razítka, úroveň hosta, QR kód a přidání do Wallet',
    nadpis: 'Věrnostní karta',
    razitka: 'Razítka {hotovo}/{celkem}',
    odmena: 'Odměna: káva zdarma',
    uroven: 'Zlatý host',
    qr: 'QR kód pro čtečku u kasy',
    wallet: 'Přidat do Wallet',
  },
};

export const HOSTE_FUNKCE: { icon: IconName; title: string; text: string }[] = [
  { icon: 'card', title: 'Věrnostní karta',
    text: 'Razítka nebo body, úrovně hostů (stříbrný, zlatý, platinový) a odměny. Karta je v telefonu a jde přidat do Apple nebo Google Wallet.' },
  { icon: 'qr', title: 'QR kód u kasy',
    text: 'Host ukáže QR kód, ty ho načteš čtečkou u kasy a razítko nebo body naskočí. Žádné kartičky v peněžence.' },
  { icon: 'gift', title: 'Kupony a poukazy',
    text: 'Slevové kupony a dárkové poukazy, které host uvidí v telefonu a uplatní u kasy.' },
  { icon: 'calendarCheck', title: 'Rezervace a plán stolů',
    text: 'Host si rezervuje stůl, ty potvrdíš nebo odmítneš. Stoly si rozložíš do plánu sálu.' },
  { icon: 'cart', title: 'Menu a objednávka od stolu',
    text: 'Menu přes QR kód a objednávka přímo od stolu. Objednávky ti chodí do přehledu.' },
  { icon: 'chat', title: 'Zpětná vazba hostů',
    text: 'Host ti po návštěvě napíše, jak se mu u tebe líbilo. Všechno vidíš na jednom místě.' },
  { icon: 'bell', title: 'Kampaně a automatiky',
    text: 'Nabídky a oznámení pro hosty a automatiky, které odměňují stálé hosty samy.' },
  { icon: 'print', title: 'Karty z papíru i z plastu',
    text: 'Papírové razítkové kartičky převedeš do aplikace a můžeš vydat i fyzické karty s QR kódem.' },
];

// ——— Jeden den s podnikem ———————————————————————————————————
export interface Moment {
  cas: string;
  title: string;
  text: string;
  nahravka: IdNahravky;
}

export const DEN_NADPIS = {
  nadpis: 'Jeden den s Managerem',
  perex: 'Od otevření po uzávěrku. Nahrávky jsou ze skutečné aplikace, data v nich jsou vymyšlená.',
};

export const DEN_MOMENTY: Moment[] = [
  { cas: '7:30', title: 'Otevření bez přemýšlení', nahravka: 'kiosk',
    text: 'Otevírací postup a úkoly se odškrtávají na tabletu u baru. Klepneš na jméno a jedeš, žádné heslo.' },
  { cas: '9:00', title: 'Rozvrh, který má tým v telefonu', nahravka: 'rozvrh',
    text: 'Rozvrh se navrhne podle toho, kdo může. Po zveřejnění ho má každý v telefonu i v kalendáři.' },
  { cas: '11:00', title: 'Sklad se hlídá sám', nahravka: 'sklad',
    text: 'Když něco dochází, nákupní seznam už je poskládaný. Objednávky pro dodavatele vzniknou jedním kliknutím.' },
  { cas: '16:00', title: 'Podnik v kapse', nahravka: 'togo',
    text: 'Přehled dne, docházející zásoby a rozvrh v telefonu. Pár ťuknutí, i když zrovna nejsi v podniku.' },
  { cas: '22:00', title: 'Uzávěrka, která sedí', nahravka: 'ukol-uzaverka',
    text: 'Uzávěrka se neodemkne, dokud nejsou hotové povinné věci. Kasa se počítá po bankovkách a každý rozdíl má vysvětlení.' },
];

// ——— Místo čeho ————————————————————————————————————————————
export const MISTO_NADPIS = {
  nadpis: 'Excel, WhatsApp a sešit, nebo Managero',
  perex: 'Managero se neměří tím, kolik toho umí, ale tím, co po jeho zapnutí z provozu zmizí.',
  oblast: 'Oblast',
  dnes: 'Dnes: Excel, WhatsApp, sešit',
  dnesKratce: 'Dnes:',
  sManagerem: 'S Managerem',
  sManageremKratce: 'S Managerem:',
  tabulka: 'Dnešní řešení a Managero',
};

export const MISTO: { tema: string; dnes: string; managero: string }[] = [
  { tema: 'Rozvrh', dnes: 'Tabulka v Excelu a zprávy „kdy mám zítra?"', managero: 'Jeden rozvrh v telefonu a v kalendáři každého' },
  { tema: 'Docházka', dnes: 'Papírek u kasy a dohady na konci měsíce', managero: 'Příchod klepnutím, hodiny a mzdové náklady se sečtou samy' },
  { tema: 'Sklad', dnes: 'Sešit ve skladu, který po měsíci nikdo nevede', managero: 'Minima hlídá aplikace a objednávku poskládá sama' },
  { tema: 'Uzávěrka', dnes: 'Blok pod kasou a rozdíl, který nikdo nevysvětlí', managero: 'Kasa po bankovkách a rozdíl, který se nezamlčí' },
  { tema: 'Komunikace', dnes: 'Skupina na WhatsAppu, kde zapadne důležitá věc', managero: 'Kanály podniku, ankety a oznámení, která dojdou všem' },
  { tema: 'Objednávky', dnes: 'Telefonát dodavateli, na který si nikdo nevzpomene', managero: 'Objednávka rovnou ze skladu, e-mailem z aplikace' },
];

export const MISTO_PATA = {
  hlavni: 'Nejsme pokladna. Managero řeší všechno kolem ní: lidi, sklad, receptury, uzávěrky a hosty (Managero client, tarif Max). Tržby z pokladny Storyous se načtou samy (také tarif Max).',
  vedlejsi: 'Na vlastní výpočty je Excel pořád skvělý. Managero je na provoz.',
};

// ——— Jak začít ————————————————————————————————————————————
export const ZACATEK_NADPIS = {
  nadpis: 'Jak se začíná',
  perex: 'Tři kroky. Bez schůzky, bez implementace a bez školení pro celý tým.',
  tlacitko: 'Založit podnik',
  karta: 'Kartu chceme až na konci, a jen když si vybereš placený tarif.',
};

export const KROKY: { n: string; icon: IconName; title: string; text: string }[] = [
  { n: '1', icon: 'plus', title: 'Založ podnik',
    text: 'Typ podniku, název a pár otázek o tom, co chceš řešit. Bez schůzky s obchodníkem.' },
  { n: '2', icon: 'users', title: 'Pozvi tým jedním kódem',
    text: 'Kód nebo pozvánka e-mailem. Lidé se připojí z vlastního telefonu a nic neinstalují.' },
  { n: '3', icon: 'calendar', title: 'Pověs první rozvrh',
    text: 'Generátor rozvrh navrhne podle dostupnosti, ty ho projdeš a zveřejníš. Od té chvíle se nikdo neptá, kdy má zítra.' },
];

// Malé obrazovky v krocích (ukázková data).
export const MINI = {
  typ: 'Jaký podnik vedeš?',
  pokracovat: 'Pokračovat',
  kod: 'Kód pro připojení',
  kodPopis: 'Kód {kod}',
  pripojena: 'připojila se',
  pripojen: 'připojil se',
  rozvrh: 'Rozvrh na příští týden',
  rozvrhPopis: 'Rozvrh na týden se směnami tří lidí',
  zverejneno: 'Zveřejněno',
};

// ——— Jistoty ——————————————————————————————————————————————
export const JISTOTY_NADPIS = {
  nadpis: 'Než se zeptáš na cenu',
  perex: 'Věci, kvůli kterým podniky software mění a kvůli kterým ho zase opouštějí.',
};

export const JISTOTY: { icon: IconName; title: string; text: string }[] = [
  { icon: 'archive', title: 'Data jsou tvoje', text: 'Rozvrh, docházku i finance stáhneš v CSV, které účetní otevře (tarif Pro a Max). Po konci předplatného data nemažeme, dokud podnik používáš.' },
  { icon: 'lock', title: 'Každý vidí jen své', text: 'Vlastník, manažer, brigádník. Kdo nemá vidět mzdy, ten je neuvidí, ani omylem přes odkaz.' },
  { icon: 'key', title: 'Tablet u baru bez hesel', text: 'Klepnutí na jméno místo přihlašování. Sdílený tablet nemá komu vyzradit heslo, když žádné nemá.' },
  { icon: 'warning', title: 'Výpadek wifi nelže', text: 'Aplikace řekne, co neprošlo, a rozepsané nezahodí. Tablet u baru zapíše příchody i bez internetu. Starý stav nevydává za nový.' },
  { icon: 'coins', title: 'Koruny, eura i zloté', text: 'Měnu podniku si zvolíš a menu, uzávěrky i přehledy počítají v ní. Host vidí ceny v měně podniku.' },
  { icon: 'check', title: 'Nic se nezapomene', text: 'Dokud nejsou hotové povinné věci, uzávěrka zůstane zamčená. Nikdo ji neodešle napůl.' },
];

export const MINI_JISTOTY = {
  stahnout: 'Stáhnout',
  soubory: ['rozvrh-rijen.csv', 'dochazka-rijen.csv', 'finance-rijen.csv'],
  mzdy: 'Mzdy',
  finance: 'Finance',
  vlastnik: 'Vlastník',
  manazer: 'Manažer',
  brigadnik: 'Brigádník',
  vidi: 'vidí',
  nevidi: 'nevidí',
  kdoJsi: 'Kdo jsi?',
  bezPripojeni: 'Bez připojení',
  pockaji: '{n, plural, one {# změna počká} few {# změny počkají} other {# změn počká}} a odešle se sama',
  mena: 'Volba měny podniku: koruny, eura, zloté',
  trzba: 'Tržba dnes',
  predUzaverkou: 'Před uzávěrkou {hotovo}/{celkem}',
  zamcena: 'Uzávěrka zamčená',
  ukoly: ['Vynést koš', 'Umýt kávovar', 'Spočítat kasu'],
};

// ——— Časté otázky ——————————————————————————————————————————
export const FAQ_NADPIS = {
  nadpis: 'Časté otázky',
  perex: 'Krátké odpovědi na to, co se řeší, než podnik založíš.',
};

/** Odpovědi s parametrem {n} dostávají počet dní zkušební doby. */
export const FAQ: { q: string; a: string }[] = [
  { q: 'Je ukázka nahoře skutečná aplikace?', a: 'Ano, je to skutečná aplikace s vymyšlenými daty. Všechno, co v ní uděláš, zůstane jen v tvém prohlížeči a po obnovení stránky zmizí. Nic se neodesílá a nikdo jiný to neuvidí.' },
  { q: 'Potřebuju k vyzkoušení kartu?', a: 'Na tarifu Zdarma nikdy. Pro a Max zkoušíš {n, plural, one {# den} few {# dny} other {# dní}} zdarma: kartu zadáš až na konci registrace a první platba proběhne po zkušební době. Když předplatné do té doby zrušíš, nezaplatíš nic.' },
  { q: 'Jak se připojí zaměstnanci?', a: 'Jedním kódem nebo pozvánkou e-mailem. Připojí se z telefonu a hned vidí svůj rozvrh. Nic se neinstaluje, je to webová aplikace, kterou si jde připnout na plochu.' },
  { q: 'Co je Managero client?', a: 'Hostovská část Managera: věrnostní karta, kupony, rezervace, menu a objednávka od stolu. Patří do tarifu Max. Host ji otevře v prohlížeči a kartu si může přidat do Apple nebo Google Wallet, nic neinstaluje. Vyzkoušet ji můžeš v ukázce pro hosty.' },
  { q: 'Je aplikace i v jiných jazycích?', a: 'Ano: česky, anglicky, německy, slovensky a polsky. Stránka i aplikace se nastaví podle jazyka prohlížeče a jazyk jde kdykoli přepnout.' },
  { q: 'Funguje to na telefonu?', a: 'Ano, celá aplikace je stavěná pro telefon, tablet i počítač. Na tablet u baru je zvláštní režim s velkými tlačítky.' },
  { q: 'Máme ceny v eurech.', a: 'Měnu podniku si zvolíš a všechno (menu, uzávěrky, přehledy) počítá v ní. Host vidí ceny v měně podniku.' },
  { q: 'Co se stane po zkušební době?', a: 'Předplatné se samo spustí, nebo ho zrušíš a zůstaneš na tarifu Zdarma s menším týmem. Data zůstávají tvoje.' },
  { q: 'Máme víc poboček.', a: 'Každá pobočka má vlastní rozvrh, sklad i uzávěrky a vedení vidí všechny pohromadě. Člověk může patřit do víc poboček a přepíná se mezi nimi.' },
  { q: 'Nahradí to pokladnu?', a: 'Ne a nechce. Managero řeší provoz kolem pokladny: lidi, sklad, receptury, uzávěrky a hosty. Tržby z pokladny Storyous se načtou samy (tarif Max), samotné účtování zůstává na pokladně.' },
  { q: 'Kolik to zabere času na začátku?', a: 'Podnik založíš za pár minut a tým se připojí kódem. Sklad a receptury můžeš doplňovat postupně, rozvrh a docházka fungují hned.' },
  { q: 'Co když to týmu nesedne?', a: 'Zrušíš předplatné, data si vyexportuješ a víc nic neřešíš. Žádná výpovědní lhůta a žádný telefonát, kde tě budou přemlouvat.' },
];

// ——— Závěr a patička ——————————————————————————————————————————
export const ZAVER = {
  nadpis: 'Zítřejší směna už může viset v aplikaci.',
  perex: 'Tým se připojí jedním kódem a hned vidí, kdy jde do práce.',
};

export const PATICKA = {
  popis: 'Provoz podniku na jednom místě: směny, docházka, uzávěrky, sklad, receptury, úkoly, chat a věrnostní program pro hosty (Managero client).',
  naStrance: 'Na stránce',
  poctivost: 'Obrazovky, ukázka i nahrávky na této stránce jsou ze skutečné aplikace. Data v nich jsou vymyšlená a nepatří žádnému podniku ani zákazníkovi.',
};

export const NAVIGACE: { id: string; label: string; dlouze?: string }[] = [
  { id: 'ukazka-okno', label: 'Ukázka' },
  { id: 'funkce', label: 'Co umí' },
  { id: 'hoste', label: 'Pro hosty' },
  { id: 'den', label: 'Jeden den', dlouze: 'Jeden den s Managerem' },
  { id: 'zacatek', label: 'Jak začít' },
  { id: 'cenik', label: 'Ceník' },
  { id: 'otazky', label: 'Otázky', dlouze: 'Časté otázky' },
];

/** Všechny texty souboru pro kontrolu překladů (scripts/check-i18n.mjs). */
export function vsechnyTexty(): string[] {
  const out: string[] = [ZKUSIT_ZDARMA, ZDARMA_VETA, FUNKCE_DALSI, V_UKAZCE_VPRAVO, UKAZ_V_UKAZCE, ...TYPY_PODNIKU];
  const plocha = (v: unknown): string[] => typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(plocha) : v && typeof v === 'object' ? Object.values(v).flatMap(plocha) : [];
  out.push(...plocha(ROZCESTNIK), ...plocha(PRIHLASENI), ...plocha(HOSTE), ...HOSTE_FUNKCE.flatMap(f => [f.title, f.text]));
  const objekty = [HERO, PRO_KOHO, FUNKCE_NADPIS, DEN_NADPIS, MISTO_NADPIS, MISTO_PATA, ZACATEK_NADPIS, MINI, JISTOTY_NADPIS, FAQ_NADPIS, ZAVER, PATICKA];
  for (const o of objekty) out.push(...Object.values(o));
  for (const [k, v] of Object.entries(MINI_JISTOTY)) if (k !== 'soubory') out.push(...(Array.isArray(v) ? v : [v]));
  for (const f of FUNKCE) out.push(f.title, f.text);
  for (const m of DEN_MOMENTY) out.push(m.title, m.text);
  for (const m of MISTO) out.push(m.tema, m.dnes, m.managero);
  for (const k of KROKY) out.push(k.title, k.text);
  for (const j of JISTOTY) out.push(j.title, j.text);
  for (const f of FAQ) out.push(f.q, f.a);
  for (const n of NAVIGACE) out.push(n.label, ...(n.dlouze ? [n.dlouze] : []));
  return out;
}
