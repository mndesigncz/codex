// Kolo 69, balík B9 (Tablet, chat a nastavení) — jednotkové testy stránky Směna a zdrojů.
//
// Směna na tabletu je od kola 69 plocha s widgety (kiosk.smena). Tablet má vlastní
// systémovou roli a jiné záložky než aplikace vedení, takže se hlídá hlavně to, co by
// se tu rozbilo potichu: widget ve výchozím rozložení, na který tablet nemá klíč
// (server by ho vyřadil a Směna by přišla o blok, který do kola 68 měla), proklik
// z widgetu na pohled, který tablet nezná, a návrat ručních kopií, které balík
// nahradil sdílenými komponentami (confirm(), ruční přepínač, limetka v chatu).

import { existsSync, readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { STRANKA } from '../../lib/widgety/stranky/kiosk.smena.ts';
import { stranka } from '../../lib/widgety/stranky/index.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';
import { jeViditelny } from '../../lib/widgety/rozlozeni.ts';
import { SYSTEMOVE_ROLE } from '../../lib/opravneniKatalog.ts';

const precti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Zdroják bez řádkových komentářů — komentáře o odstraněném confirm() a banneru mluví záměrně. */
const bezKomentaru = (s: string) => s.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');

export default function ({ eq, ok }: Testy) {
  // ---- stránka ----
  ok('kiosk.smena: stránka je aktivní a v registru stránek', STRANKA.aktivni === true && stranka('kiosk.smena')?.aktivni === true);
  eq('kiosk.smena: rozhraní kiosk, pohled shift, přístup každý tablet', [STRANKA.rozhrani, STRANKA.pohled, STRANKA.pristup], ['kiosk', 'shift', null]);
  eq('kiosk.smena: nástroj „Kdo je na směně" s ikonou clock', [STRANKA.nastroj?.nazev, STRANKA.nastroj?.ikona], ['Kdo je na směně', 'clock']);

  const vychozi = STRANKA.vychozi['typ:kiosk'] ?? [];
  ok('výchozí: obsahuje právě jeden nástroj', vychozi.filter(v => v.w === 'nastroj').length === 1);
  // Do kola 68 stál AnnouncementBanner nad „Kdo teď pracuje" — nástěnka zůstává nad nástrojem.
  ok('výchozí: nástěnka je nad nástrojem (jako dřív banner)', vychozi.findIndex(v => v.w === 'oznameni.nastenka') < vychozi.findIndex(v => v.w === 'nastroj'));
  // Bloky, které Směna měla do kola 68 (KioskHomeExtras), nesmí z výchozího zmizet.
  for (const id of ['oznameni.nastenka', 'sklad.zapsat_novou', 'akce.nejblizsi', 'uzaverky.predavka', 'rozvrh.dnesni_smeny', 'postupy.povinne_dnes', 'sdileni.pripnuta_nabidka']) {
    ok(`výchozí: blok ze staré Směny zůstal (${id})`, vychozi.some(v => v.w === id));
  }

  const kiosk = SYSTEMOVE_ROLE.find(r => r.klic === 'kiosk');
  ok('systémová role kiosk existuje', !!kiosk);
  const divak = { typ: 'kiosk' as const, tarif: 'max' as const, opravneni: new Set(kiosk?.opravneni ?? []) };
  for (const v of vychozi.filter(x => x.w !== 'nastroj')) {
    const w = widget(v.w);
    ok(`výchozí: ${v.w} je v katalogu, hotový a pro tablet`, !!w && w.stav === 'hotovo' && w.rozhrani.includes('kiosk'));
    // Server by widget bez klíče z rozložení tiše vyřadil (AK-13) — tablet by přišel o blok.
    ok(`výchozí: systémová role tabletu ${v.w} vidí`, !!w && jeViditelny(w, divak));
    ok(`výchozí: velikost ${v.w} je povolená`, !!w && (v.s == null || w.velikosti.includes(v.s)));
  }
  eq('výchozí: ikony se na stránce neopakují (AK-19)',
    new Set(vychozi.map(v => (v.w === 'nastroj' ? STRANKA.nastroj?.ikona : widget(v.w)?.ikona))).size, vychozi.length);
  for (const id of STRANKA.doporucene) {
    const w = widget(id);
    ok(`doporučené: ${id} existuje a patří tabletu`, !!w && w.rozhrani.includes('kiosk'));
  }

  // ---- KioskApp ----
  const app = precti('components/kiosk/KioskApp.tsx');
  const appKod = bezKomentaru(app);
  ok('KioskApp: Směna je PlochaWidgetu kiosk.smena v režimu jen-čtení', /<PlochaWidgetu[\s\S]*?stranka="kiosk\.smena"[\s\S]*?rezim="jen-cteni"/.test(appKod));
  ok('KioskApp: nástroj plochy je „Kdo je na směně" (WhoIsWorkingOrLock)', /nastroj=\{<WhoIsWorkingOrLock \/>\}/.test(appKod));
  ok('KioskApp: poskytuje NavigaceKontext widgetům', appKod.includes('<NavigaceKontext.Provider value={navigaceWidgetu}>'));
  ok('KioskApp: AnnouncementBanner i ruční KioskHomeExtras jsou pryč', !appKod.includes('AnnouncementBanner') && !appKod.includes('KioskHomeExtras'));
  ok('AnnouncementBanner.tsx je smazaný (nástěnku nese widget oznameni.nastenka)', !existsSync(new URL('../../components/AnnouncementBanner.tsx', import.meta.url)));
  // DP §1.3: chip „moon Zavírací rutina" tiskl název ikony jako text.
  ok('KioskApp: název ikony postupu se netiskne jako text', !/<span>\{p\.icon\}<\/span>/.test(app));
  ok('KioskApp: skrytý h1 tabletu jen mimo Směnu (tam je h1 v hlavičce plochy)', /tab !== 'shift' && <h1 className="sr-only">/.test(appKod));
  // Proklik z widgetu: jen na záložky tabletu, ostatní pohledy nemají kam vést.
  const mapa = /POHLED_NA_ZALOZKU: Record<string, IdZalozky> = \{([\s\S]*?)\};/.exec(appKod)?.[1] ?? '';
  const pohledy = [...mapa.matchAll(/'?([\w:-]+)'?:\s*'(\w+)'/g)].map(m => [m[1], m[2]]);
  eq('KioskApp: pohledy widgetů → záložky tabletu', pohledy, [
    ['tasks', 'tasks'], ['procedures', 'procedures'], ['inventory', 'inventory'], ['klient:orders', 'orders'], ['closing', 'closing'], ['guides', 'guides'],
  ]);
  ok('KioskApp: smiPohled pustí jen známé pohledy (Rozvrh, Finance… ne)', appKod.includes('(pohled: string) => pohled in POHLED_NA_ZALOZKU'));
  ok('KioskApp: odznak objednávek je Badge, ne ruční limetka', appKod.includes('<Badge count={newOrders}') && !/bg-\[#C8F542\] on-accent/.test(appKod));

  // ---- KioskShiftGate ----
  const gate = bezKomentaru(precti('components/kiosk/KioskShiftGate.tsx'));
  ok('KioskShiftGate: „Kdo teď pracuje" je karta s .list, ne karty lidí v kartě', /<Card as="section"[\s\S]*?<ul className="list mt-3">/.test(gate) && !gate.includes("'glass-card hover:bg-black/[0.03]'"));
  ok('KioskShiftGate: kdo se zapisuje = stavový chip, ne limetkový rámeček', gate.includes("<Chip tone=\"ok\" icon=\"check\">{t('Zapisuje se')}</Chip>") && !gate.includes('ring-[#C8F542]/35'));
  ok('KioskShiftGate: zamykací obrazovka má h2 (h1 patří obrazovce)', !/<h1\b/.test(gate));
  ok('KioskShiftGate: hlavní akce zamčeného tabletu je Button accent', gate.includes('<Button variant="accent" size="lg" icon="play"'));
  ok('KioskShiftGate: bez ručních štítků verzálkami a „✓" v textu', !/uppercase tracking-\[0\.1[24]em\]/.test(gate) && !gate.includes('zaznamenán ✓'));

  // ---- chat ----
  const chat = bezKomentaru(precti('components/chat/ChatView.tsx'));
  const dock = bezKomentaru(precti('components/chat/MessengerDock.tsx'));
  const polls = bezKomentaru(precti('components/chat/Polls.tsx'));
  // Vlásková čára „Nepřečtené" (h-px) limetková zůstává — je to čára, ne plocha.
  ok('chat: žádná ručně psaná plná limetka (bubliny, odznaky, odeslání, plovoucí tlačítko)',
    ![chat, dock].some(s => s.split('\n').some(l => /bg-\[#C8F542\](?!\/)/.test(l) && !l.includes('h-px'))));
  ok('chat: filtr Nepřečtené je filter-pill (chip na tlačítku neměl odsazení)', chat.includes('filter-pill tap-target-sm'));
  ok('chat: nepřečtené přes Badge v seznamu i v doku', chat.includes('<Badge count={conv.unreadCount}') && dock.includes('<Badge count={c.unreadCount}') && dock.includes('<Badge count={totalUnread}'));
  ok('chat: plovoucí tlačítko je inkoustové (chrom-inkoust)', dock.includes('fab-chat chrom-inkoust'));
  ok('chat: bez vlastní animace chatDockIn a stínu 50 % černé', !dock.includes('chatDockIn') && !dock.includes('rgba(0,0,0,0.5)'));
  ok('ankety: uzavření oknem, ne confirm()', !/\bconfirm\(/.test(polls) && polls.includes("title={t('Uzavřít anketu?')}"));
  ok('ankety: můj hlas ikonou, ne znakem „●"', !polls.includes('●') && polls.includes('<Icon name="check" size={13}'));
  ok('ankety: počet hlasů přes plurál překladače', polls.includes("{n, plural, one {# hlas} few {# hlasy} other {# hlasů}}") && polls.includes('{ n: p.total }'));

  // ---- nastavení ----
  const nast = bezKomentaru(precti('components/Settings.tsx'));
  ok('Nastavení: PageHeader místo vlastní hlavičky', nast.includes('<PageHeader title="Nastavení"') && !nast.includes('<h1 className="t-page">'));
  ok('Nastavení: bez ručního přepínače Toggle (SwitchRow)', !/function Toggle\b/.test(nast) && !nast.includes('<Toggle ') && (nast.match(/<SwitchRow /g) ?? []).length >= 5);
  ok('Nastavení: bez nativního confirm()', !/\bconfirm\(/.test(nast));
  ok('Nastavení: bez ručně psané limetky (primaryBtn, btn-accent)', !nast.includes('primaryBtn') && !nast.includes('btn-accent') && !/bg-\[#C8F542\](?!\/)/.test(nast));
  ok('Nastavení: motiv přes Segmented, ne dvě limetkové volby', nast.includes('ariaLabel="Motiv aplikace"') || nast.includes("ariaLabel={t('Motiv aplikace')}"));
  ok('Nastavení: úspěch pokladny nese tón, ne „✓" v textu', !nast.includes('✓') && nast.includes("posMsg.ok ? 'note-ok' : 'note-danger'"));
  ok('Nastavení: preference směn bez emoji', !/🌅|🌆|🔄/.test(nast));
  ok('Nastavení: statistiky pokladny přes Stat/StatRow', (nast.match(/<Stat label=/g) ?? []).length === 4);

  const kset = bezKomentaru(precti('components/KioskSettings.tsx'));
  ok('Tabletový účet: pole s popiskem (Field), ne jen placeholder', kset.includes("label={t('E-mail tabletu')}"));
  ok('Tabletový účet: lidé v .list s Avatar, PIN jako chip', kset.includes('<ul className="list">') && kset.includes('<Chip tone="ok" size="sm" icon="lock">PIN</Chip>') && !kset.includes("?? '👤'"));

  const bill = bezKomentaru(precti('components/Billing.tsx'));
  ok('Předplatné: nejvýš jedna tónovaná karta tarifu (card-info u tarifu pryč)', !bill.includes("p === 'pro' ? 'card-accent' : 'card-info'"));
  ok('Předplatné: ceny 28 px, ne text-3xl', !bill.includes('text-3xl'));
  ok('Předplatné: měsíce zdarma přes plurál slovníku', bill.includes('{n, plural, one {# měsíc} few {# měsíce} other {# měsíců}}') && bill.includes('n: st.referral.total'));

  const sheet = bezKomentaru(precti('components/MobileMoreSheet.tsx'));
  ok('Další (telefon): štítek skupiny je t-label', sheet.includes('<p className="px-1 pb-1 t-label">'));

  // ---- opravy po review kola 69 ----
  const appR = bezKomentaru(precti('components/kiosk/KioskApp.tsx'));
  ok('Tablet: plocha Směna je obalená pojistkou zápisu (ZapisPodJmenem)', /<ZapisPodJmenem>[\s\S]*stranka="kiosk.smena"/.test(appR));
  ok('Tablet: zamčený tablet dá widgetům inert, nástroj ne', appR.includes("toggleAttribute('inert'") && appR.includes('li.dataset.widget !== NASTROJ_PLOCHY'));
  ok('Tablet: bez vybrané osoby se zápis z widgetu ptá (requireActive)', /onClickCapture[\s\S]*requireActive\(\)/.test(appR));
  ok('Tablet: záložky mají aria-current', appR.includes("aria-current={tab === t.id ? 'page' : undefined}"));
  ok('Tablet: portály oken widgetů dědí .kiosk-surface (třída na <body>)', appR.includes("document.body.classList.add('kiosk-surface')") && appR.includes("document.body.classList.remove('kiosk-surface')"));

  const brana = bezKomentaru(precti('components/kiosk/KioskShiftGate.tsx'));
  ok('Tablet: hlášení přes sdílený Toast, ne ruční limetkový proužek', brana.includes('<Toast ') && !brana.includes('text-[#5B7A08]') && !brana.includes('border-[#C8F542]/40'));
  ok('Tablet: přepínač osoby je MenuPanel s usePopover, aria-expanded a aria-checked', brana.includes('<MenuPanel') && brana.includes('usePopover(open, setOpen')
    && brana.includes('aria-expanded={canSwitch ? open : undefined}') && brana.includes('aria-checked={vybrany}') && !brana.includes("? 'bg-[#C8F542]/20'"));
  ok('Tablet: PIN bez znaku ⌫, smazání je ikona s aria-label', !brana.includes('⌫') && brana.includes("aria-label={t('Smazat číslici')}"));
  ok('Tablet: PunchDialog je <Modal>, ne ruční překryv', !brana.includes('modal-overlay') && /export function PunchDialog[\s\S]*<Modal open/.test(brana));

  const pollsR = bezKomentaru(precti('components/chat/Polls.tsx'));
  ok('Anketa: otázka a možnosti mají viditelný popisek (Field), ne jen placeholder', pollsR.includes("label={t('Otázka')}") && pollsR.includes("label={t('Možnost {n}', { n: i + 1 })}") && !pollsR.includes('placeholder="Otázka ankety…"'));

  ok('Nastavení: odpojení pokladny kontroluje res.ok', /method: 'DELETE' \}\)\.catch\(\(\) => null\);\s*if \(!res\?\.ok\)/.test(nast));
}
