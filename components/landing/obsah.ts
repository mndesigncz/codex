// Texty prodejní stránky na jednom místě (jedno místo = jedna cesta k překladu, #106).
//
// Pravidla, která tu platí a hlídá je scripts/check-landing-obsah.mjs:
//  - žádná vymyšlená jména zákazníků, loga, hodnocení ani čísla o zákaznících;
//    tvrdí se jen to, co o produktu platí (30 dní, tým zdarma, ceny z lib/plan),
//  - čísla se skloňují přes lib/czech.ts,
//  - bez pomlček jako interpunkce a bez slova „čajovna" (kontrola univerzálních textů).

import { czCount, czForm, DEN, type CzNoun } from '@/lib/czech';
import { LIMITS, TRIAL_DAYS } from '@/lib/plan';
import type { IconName } from '@/components/Icons';
import type { IdNahravky } from './nahravky';
import type { FotoId } from './foto';
import type { IdSceny } from './ukazka/scenare';

const CLOVEK_DO: CzNoun = { one: 'člověka', few: 'lidí', many: 'lidí' };

export const ZKUSIT_ZDARMA = `Vyzkoušet ${czCount(TRIAL_DAYS, DEN)} zdarma`;
export const ZDARMA_CLENU = LIMITS.free.members ?? 0;
export const ZDARMA_VETA = `Tým do ${ZDARMA_CLENU} ${czForm(ZDARMA_CLENU, CLOVEK_DO)} zůstává na tarifu Zdarma napořád.`;

export const HERO = {
  h1: 'Směny, sklad a uzávěrka bez Excelu a bez WhatsAppu.',
  podtitulek:
    'Managero je aplikace pro kavárny, restaurace a bary. Rozvrh, docházka, sklad, uzávěrky a úkoly jsou na jednom místě a v telefonu celého týmu. Ukázka níž je skutečná aplikace: zkus si ji sám.',
  druhe: 'Vyzkoušet přímo tady',
  mikro: `Registrace bez karty. ${ZDARMA_VETA}`,
};

// ——— Pás funkcí ————————————————————————————————————————————
export interface Funkce {
  icon: IconName;
  title: string;
  text: string;
  /** Scéna živé ukázky, která to ukazuje (chybí = bez odkazu). */
  scena?: IdSceny;
}

export const FUNKCE: Funkce[] = [
  { icon: 'calendar', title: 'Rozvrh a směny', scena: 'rozvrh',
    text: 'Generátor navrhne směny podle dostupnosti. Kolize řekne dřív, než rozvrh zveřejníš.' },
  { icon: 'clock', title: 'Docházka',
    text: 'Příchod klepnutím na telefonu nebo tabletu. Hodiny a mzdové náklady se sečtou samy.' },
  { icon: 'coins', title: 'Uzávěrky', scena: 'uzaverka',
    text: 'Kasa po bankovkách. Rozdíl se nezamlčí ani nezaokrouhlí a povinné věci uzávěrku drží zamčenou.' },
  { icon: 'box', title: 'Sklad', scena: 'sklad',
    text: 'Minima a nákupní seznam. Objednávka pro dodavatele jde rovnou z aplikace.' },
  { icon: 'cup', title: 'Receptury',
    text: 'Cena receptury spočítaná ze surovin na gramy a marže na první pohled.' },
  { icon: 'clipboard', title: 'Úkoly a postupy',
    text: 'Otevírací a zavírací postupy, úkoly i návody pro nováčky. Co je povinné, hlídá aplikace.' },
  { icon: 'chat', title: 'Týmový chat',
    text: 'Kanály, přímé zprávy a ankety. Důležitá věc nezapadne ve skupině.' },
  { icon: 'play', title: 'Tablet u baru', scena: 'kiosk',
    text: 'Sdílený tablet bez hesel: klepnutí na jméno a člověk zapisuje sám sebe.' },
];

export const FUNKCE_DALSI = 'A k tomu stránka pro hosty (menu přes QR, rezervace, věrnostní kartičky), akce a catering a finance s exportem pro účetní.';

// ——— Jeden den s podnikem ———————————————————————————————————
export interface Moment {
  cas: string;
  title: string;
  text: string;
  nahravka: IdNahravky;
  foto: FotoId;
}

export const DEN_MOMENTY: Moment[] = [
  { cas: '7:30', title: 'Otevření bez přemýšlení', nahravka: 'kiosk', foto: 'v2-majitel',
    text: 'Otevírací postup a úkoly se odškrtávají na tabletu u baru. Stačí klepnout na jméno, žádné heslo.' },
  { cas: '9:00', title: 'Rozvrh, který má tým v telefonu', nahravka: 'rozvrh', foto: 'v2-tym',
    text: 'Rozvrh se nechá navrhnout podle dostupnosti lidí. Po publikování ho má každý v telefonu i v kalendáři.' },
  { cas: '11:00', title: 'Sklad se hlídá sám', nahravka: 'sklad', foto: 'v2-sklad',
    text: 'Když něco dochází, nákupní seznam je poskládaný. Objednávky pro dodavatele vzniknou jedním kliknutím.' },
  { cas: '16:00', title: 'Majitel v kapse', nahravka: 'togo', foto: 'v2-telefon',
    text: 'Přehled dne, docházející zásoby i rozvrh v telefonu. Pár ťuknutí, i když nejste v podniku.' },
  { cas: '22:00', title: 'Uzávěrka, která sedí', nahravka: 'ukol-uzaverka', foto: 'v2-uzaverka',
    text: 'Uzávěrka se neodemkne, dokud nejsou hotové povinné věci. Kasa se počítá po bankovkách a každý rozdíl má vysvětlení.' },
];

// ——— Místo čeho ————————————————————————————————————————————
export const MISTO: { tema: string; dnes: string; managero: string }[] = [
  { tema: 'Rozvrh', dnes: 'Tabulka v Excelu a zprávy „kdy mám zítra"', managero: 'Jeden rozvrh v telefonu a v kalendáři každého' },
  { tema: 'Docházka', dnes: 'Papírek u kasy a dohady na konci měsíce', managero: 'Příchod klepnutím, hodiny a mzdové náklady se sečtou samy' },
  { tema: 'Sklad', dnes: 'Sešit ve skladu, který po měsíci nikdo nevede', managero: 'Minima hlídá aplikace a objednávku poskládá' },
  { tema: 'Uzávěrka', dnes: 'Blok pod kasou a rozdíl, který nikdo nevysvětlí', managero: 'Kasa po bankovkách a rozdíl, který se nezamlčí' },
  { tema: 'Komunikace', dnes: 'Skupina na WhatsAppu, kde zapadne důležitá věc', managero: 'Kanály podniku, ankety a oznámení, která dojdou všem' },
  { tema: 'Objednávky', dnes: 'Telefonát nebo zpráva dodavateli, na kterou si nikdo nevzpomene', managero: 'Objednávka rovnou ze skladu, e-mailem z aplikace' },
];

export const MISTO_PATA = {
  hlavni: 'Nejsme pokladna. Managero řeší to, co je kolem ní: lidi, sklad, receptury, uzávěrky a hosty. Tržby se do něj dají přenést.',
  vedlejsi: 'Excel je pořád lepší na vlastní výpočty. Managero je na provoz.',
};

// ——— Jak začít ————————————————————————————————————————————
export const KROKY: { n: string; icon: IconName; title: string; text: string }[] = [
  { n: '1', icon: 'plus', title: 'Založ podnik',
    text: 'Název, měna, typ podniku a otevírací doba. Bez schůzky s obchodníkem a bez implementace.' },
  { n: '2', icon: 'users', title: 'Pozvi tým jedním kódem',
    text: 'Kód nebo pozvánka e-mailem. Lidé se připojí z vlastního telefonu a nic neinstalují.' },
  { n: '3', icon: 'calendar', title: 'Pověs první rozvrh',
    text: 'Generátor rozvrh navrhne podle dostupnosti, ty ho projdeš a zveřejníš. Od té chvíle nikdo nevolá, kdy má zítra.' },
];

export const TYPY_PODNIKU: { id: FotoId; label: string }[] = [
  { id: 'podnik-kavarna', label: 'Kavárna' },
  { id: 'podnik-restaurace', label: 'Restaurace' },
  { id: 'podnik-bar', label: 'Bar' },
  { id: 'podnik-pekarna', label: 'Pekárna' },
  { id: 'podnik-caj', label: 'Čaj a nápoje' },
  { id: 'podnik-foodtruck', label: 'Food truck' },
];

// ——— Jistoty ——————————————————————————————————————————————
export const JISTOTY: { icon: IconName; title: string; text: string }[] = [
  { icon: 'archive', title: 'Data jsou vaše', text: 'Export kdykoli: rozvrh, docházka i finance ve formátu, který účetní otevře. Nic se nemaže ani po konci předplatného.' },
  { icon: 'lock', title: 'Každý vidí jen své', text: 'Vlastník, manažer, brigádník. Kdo nemá vidět mzdy, nevidí je, ani omylem přes odkaz.' },
  { icon: 'key', title: 'Tablet u baru bez hesel', text: 'Klepnutí na jméno místo přihlášení. Sdílené zařízení nemá komu vyzradit heslo, když žádné nemá.' },
  { icon: 'warning', title: 'Výpadek wifi nelže', text: 'Aplikace řekne, co neprošlo, rozepsané nezahodí a po návratu spojení to dopíše. Starý stav nevydává za nový.' },
  { icon: 'coins', title: 'Česky, koruny i eura', text: 'Měnu podniku si zvolíte a menu, uzávěrky i přehledy počítají v ní. Host vidí ceny v měně podniku.' },
  { icon: 'check', title: 'Nic se nezapomene', text: 'Povinné věci před uzávěrkou drží uzávěrku zamčenou, dokud nejsou hotové. Nikdo ji neodešle napůl.' },
];

// ——— Časté otázky ——————————————————————————————————————————
export const FAQ: { q: string; a: string }[] = [
  { q: 'Je ukázka nahoře skutečná aplikace?', a: 'Ano, je to skutečná aplikace s vymyšlenými daty. Všechno, co v ní uděláš, zůstane jen v tvém prohlížeči a po obnovení stránky zmizí. Nic se neodesílá a nikdo jiný to neuvidí.' },
  { q: 'Potřebuju k vyzkoušení kartu?', a: `Nemusíte. Při zakládání podniku si vyberete: buď kartu zadáte rovnou a po zkušební době (${czCount(TRIAL_DAYS, DEN)}) se předplatné samo spustí, nebo ji přeskočíte a zůstanete na tarifu Zdarma. Malý tým na něm může zůstat napořád.` },
  { q: 'Jak se připojí zaměstnanci?', a: 'Jedním kódem nebo pozvánkou e-mailem. Připojí se z telefonu za minutu a hned vidí svůj rozvrh. Nic se neinstaluje, je to webová aplikace, která si jde připnout na plochu.' },
  { q: 'Funguje to na telefonu?', a: 'Ano, celá aplikace je stavěná pro telefon, tablet i počítač. Na tablet za barem je zvláštní kioskový režim s velkými tlačítky.' },
  { q: 'Máme ceny v eurech.', a: 'Měnu podniku si zvolíte a všechno (menu, uzávěrky, přehledy) počítá v ní. Host vidí ceny v měně podniku, ne v korunách.' },
  { q: 'Co se stane po zkušební době?', a: 'Vyberete si tarif, nebo zůstanete na Zdarma s menším týmem. Data zůstávají vaše, nic nemizí.' },
  { q: 'Máme víc poboček.', a: 'Každá pobočka má vlastní rozvrh, sklad i uzávěrky, a vedení vidí všechny pohromadě. Člověk může patřit do víc poboček a přepíná se mezi nimi.' },
  { q: 'Nahradí to pokladnu?', a: 'Ne a nechce. Managero řeší provoz kolem pokladny: lidi, sklad, receptury, uzávěrky a hosty. Tržby se do něj dají přenést, samotné účtování zůstává na pokladně.' },
  { q: 'Kolik to zabere času na začátku?', a: 'Podnik založíte za pár minut, tým se připojí kódem. Sklad a receptury se dají doplňovat postupně. Na to, aby začal fungovat rozvrh a docházka, je čekat nemusíte.' },
  { q: 'Co když to týmu nesedne?', a: 'Zrušíte předplatné, data si vyexportujete a nic dalšího neřešíte. Žádná výpovědní lhůta a žádný telefonát s retencí.' },
];

export const PATICKA_POCTIVOST =
  'Fotografie na této stránce jsou ilustrační a nezobrazují konkrétní podniky ani zákazníky. Obrazovky a nahrávky jsou ze skutečné aplikace, data v nich jsou vymyšlená.';
