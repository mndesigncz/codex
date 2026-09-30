// Kolo 72 (audit) — uzávěrky, docházka, kiosk: čistá logika oprav.
//
// Hlídá to, co se v auditu ukázalo jako lež obrazovky: návrh odchodu při
// „Ukončit" (nesmí platit hodiny navíc), obnova cookie identity tabletu
// (po hodině nesmí tiše přepsat zápisy na účet tabletu), stav čtení návodu
// za člověka u tabletu a rozpoznání skryté tržby v detailu uzávěrky.

import type { Testy } from './_testy.ts';
import { navrhOdchodu, konecSmeny } from '../../lib/dochazkaPrehled.ts';
import {
  ACTING_DOTYK_MS, ACTING_MAX_AGE_S, ACTING_OBNOVA_MS, obnovitCookie,
} from '../../lib/kioskIdentity.ts';
import {
  sloucStavCteni, urlNavoduZa, vyberNavodyOsoby, type NavodApi,
} from '../../lib/navodyPrehled.ts';
import { maSkrytouTrzbu, rozdilUzaverky, type RadekUzaverky } from '../../lib/uzaverkyPrehled.ts';

const H = 3600_000;

export default function ({ eq, ok }: Testy) {
  // ---- „Ukončit" zapomenutý odchod: plán, ne teď ----
  const ted = Date.UTC(2026, 8, 30, 17, 0); // 19:00 pražského času
  const prichod = new Date(Date.UTC(2026, 8, 30, 6, 0)); // 8:00
  const konec16 = new Date(Date.UTC(2026, 8, 30, 14, 0)); // 16:00
  const n1 = navrhOdchodu(prichod, konec16, ted);
  ok('návrh odchodu: odešel v 16:00, zavírá se v 19:00 → 16:00, ne 19:00 (tři hodiny navíc ve mzdě)', n1.zPlanu && n1.cas.getTime() === konec16.getTime());
  const n2 = navrhOdchodu(prichod, null, ted);
  ok('návrh odchodu: bez plánu teď', !n2.zPlanu && n2.cas.getTime() === ted);
  const budouci = new Date(Date.UTC(2026, 8, 30, 20, 0));
  ok('návrh odchodu: směna ještě neskončila → teď (budoucí odchod nedává smysl)', !navrhOdchodu(prichod, budouci, ted).zPlanu);
  const vcerejsiPrichod = new Date(Date.UTC(2026, 8, 28, 6, 0));
  ok('návrh odchodu: dnešní plán se nepřilepí k zapomenutému příchodu před dvěma dnů (nad 24 h)', !navrhOdchodu(vcerejsiPrichod, konec16, ted).zPlanu);
  ok('návrh odchodu: konec před příchodem se neberou', !navrhOdchodu(new Date(Date.UTC(2026, 8, 30, 15, 0)), konec16, ted).zPlanu);
  // Noční směna: konec ≤ začátek patří zítřku — a návrh ho respektuje, jakmile uplyne.
  const nocKonec = konecSmeny('2026-09-29', '20:00', '02:00');
  const nocPrichod = new Date(Date.UTC(2026, 8, 29, 18, 0)); // 20:00 pražského
  const nocTed = Date.UTC(2026, 8, 30, 3, 0);                // 5:00 pražského
  ok('návrh odchodu: noční směna končí po půlnoci', navrhOdchodu(nocPrichod, nocKonec, nocTed).zPlanu && nocKonec != null && nocKonec.getTime() - nocPrichod.getTime() === 6 * H);

  // ---- cookie identity tabletu ----
  ok('cookie: nikdy nezapsaná se zapíše', obnovitCookie(0, 1_000_000));
  ok('cookie: čerstvě zapsanou dotyk znovu nepřepisuje', !obnovitCookie(1_000_000, 1_000_000 + ACTING_DOTYK_MS - 1));
  ok('cookie: po odstupu se obnoví', obnovitCookie(1_000_000, 1_000_000 + ACTING_DOTYK_MS));
  // Bez rezervy by cookie vypršela dřív, než přijde další obnova — přesně ta chyba z auditu.
  ok('cookie: obnova je řádově častější než platnost (aspoň 6×)', ACTING_OBNOVA_MS * 6 <= ACTING_MAX_AGE_S * 1000);
  ok('cookie: dotykové obnovení není řidší než časovač', ACTING_DOTYK_MS <= ACTING_OBNOVA_MS);

  // ---- seznam návodů na tabletu: stav čtení člověka, ne účtu tabletu ----
  const g = (id: number, x: Partial<NavodApi> = {}): NavodApi => ({ id, title: `Návod ${id}`, requireRead: true, myRead: false, myReadCurrent: false, ...x });
  const tablet = [g(1), g(2), g(3)];
  const martin = { guides: [g(1, { myRead: true, myReadCurrent: true }), g(2, { myRead: true, myReadCurrent: false }), g(3)], ctenar: 42 };
  const slouceno = sloucStavCteni(tablet, martin, 42);
  eq('návody na tabletu: přečteno Martinem se v seznamu ukáže', slouceno.map(x => [x.myRead, x.myReadCurrent]), [[true, true], [true, false], [false, false]]);
  eq('návody na tabletu: server počítal za někoho jiného → seznam se nemění', sloucStavCteni(tablet, martin, 7).map(x => x.myRead), [false, false, false]);
  eq('návody na tabletu: bez odpovědi (načítá se, chyba) se nic nevymýšlí', sloucStavCteni(tablet, null, 42).map(x => x.myRead), [false, false, false]);
  eq('návody na tabletu: server člověka nepřijal (ctenar null) → beze změny', sloucStavCteni(tablet, { guides: martin.guides, ctenar: null }, 42).map(x => x.myRead), [false, false, false]);
  eq('návody na tabletu: návod, který v odpovědi za osobu chybí, zůstane', sloucStavCteni([...tablet, g(9)], martin, 42).map(x => x.id), [1, 2, 3, 9]);
  eq('adresa seznamu za osobu: s dnem uzávěrky', urlNavoduZa({ id: 5, den: '2026-09-29' }), '/api/guides?actingAs=5&den=2026-09-29');
  eq('adresa seznamu za osobu: bez dne', urlNavoduZa({ id: 5 }), '/api/guides?actingAs=5');
  eq('adresa seznamu za osobu: bez osoby se neptá', [urlNavoduZa(null), urlNavoduZa({ id: 0 })], [null, null]);
  eq('odpověď za osobu: ctenar se přečte jen když je kladné číslo', [
    vyberNavodyOsoby({ guides: [], ctenar: 12 }).ctenar, vyberNavodyOsoby({ guides: [], ctenar: null }).ctenar, vyberNavodyOsoby({ guides: [] }).ctenar,
  ], [12, null, null]);

  // ---- detail uzávěrky bez tržby ----
  const radek = (x: Partial<RadekUzaverky>): RadekUzaverky => ({
    id: 1, team_id: 1, created_by: 7, date: '2026-09-20', shift_label: null,
    opening_cash: 1000, cash_revenue: 5000, card_revenue: 3000, tips: 0, expenses: 0, cash_removed: 0,
    self_payout: 0, closing_cash: 6000, customers: 0, notes: null, author_name: 'Eva', ...x,
  });
  // Server cizí uzávěrce roli bez finance.trzby pole maže (undefined), příznak nese `trzbaSkryta`.
  const bezTrzby = radek({ trzbaSkryta: true, cash_revenue: undefined as any, card_revenue: undefined as any, closing_cash: undefined as any });
  ok('detail: skrytá tržba se pozná i bez příznaku (chybějící pole)', maSkrytouTrzbu(radek({ cash_revenue: undefined as any })) && maSkrytouTrzbu(bezTrzby));
  ok('detail: vlastní uzávěrka skrytá není', !maSkrytouTrzbu(radek({})));
  eq('detail: rozdíl kasy u skryté tržby není číslo (žádné „Manko 0 Kč")', rozdilUzaverky(bezTrzby), null);
}
