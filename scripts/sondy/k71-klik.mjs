// Kolo 71 — klepnutí na kartu widgetu v klidu a výměna plné a minimalizované karty
// (review widgetů: klikKlid, fokus a hlášení pro odečítač).
//
// Přehled vedení s widgetem Uzávěrky ke schválení (Schválit, „···" → Smazat
// uzávěrku… s oknem uvnitř <li>) a podvrženým API. Tvrdí:
//  - čisté klepnutí do těla karty naviguje (základ, ať ostatní tvrzení nejsou zdarma),
//  - klepnutí vedle okna (pozadí Modalu uvnitř <li>) okno zavře a nenaviguje,
//  - klepnutí do karty, které zavřelo popover „···", nenaviguje,
//  - stisk na tlačítku, který ujede o pár pixelů na kartu (click dopadne na <li>), nenaviguje,
//  - po „Schválit" (poslední čekající → minimalizace) zůstane fokus v kartě na nadpisu a odečítač
//    dostane hlášení; totéž po „Ukázat celý widget",
//  - minimalizace při načtení stránky (fokus jinde) je tichá.
// Navigace se pozná podle toho, že plocha Přehledu zmizí (otevře se jiný pohled).
import {
  kontext, konec, tvrdi, otevri, li, dokud, hlaseni, stred, OUT, FIX_VEDENI,
} from './k68-spolecne.mjs';

const PREHLED = '/employer/overview';
const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));

const FIX = {
  ...FIX_VEDENI,
  polozky: [{ id: 'schvaleni', widget: 'uzaverky.ke_schvaleni', velikost: 'M' }],
  dostupne: [...new Set([...(FIX_VEDENI.dostupne ?? []), 'uzaverky.ke_schvaleni'])],
};

/** Uzávěrka odeslaná bez směny: ve widgetu má „Schválit" a „···" (Smazat → okno uvnitř <li>). */
const CEKAJICI = {
  id: 502, team_id: 1, created_by: 21, date: praha(-2), shift_date: praha(-2), shift_label: '8:00–16:00', opening_cash: 2000,
  cash_revenue: 12400, card_revenue: 8600, tips: 300, tips_card: 0, expenses: 0, cash_removed: 0, self_payout: 0, closing_cash: 14200,
  customers: 86, notes: null, approved: false, covered_by: null, author_name: 'Petr Novák', author_avatar: '🙂',
  movements: [], denominations: {}, shiftEmployees: [], final_removal: 0,
};

/** Podvrh API: po PATCH uzávěrky (`stav2.schvaleno`) vrací další GET prázdnou frontu. */
const podvrh = (stav2) => (req, json) => {
  const path = new URL(req.url()).pathname;
  if (path === '/api/closings/502' && req.method() === 'PATCH') { stav2.patche++; stav2.schvaleno = true; return json({ ok: true }); }
  if (req.method() !== 'GET') return undefined;
  if (path === '/api/closings') {
    return json({ closings: [{ ...CEKAJICI, approved: stav2.schvaleno }], meId: 15, payDailyCash: false });
  }
  return undefined;
};

const naPrehledu = (p) => p.locator('[data-plocha="vedeni.prehled"]').count().then(n => n > 0);
const OTEVRI_MENU = /Další akce s uzávěrkou/;

/** Volný bod v hlavičce karty (nadpis): mimo menu, které se otevírá pod tlačítkem, a mimo tlačítka. */
async function nadpisKarty(p, id) {
  return stred(li(p, id).locator('[data-w-titulek]'));
}

// ---- 1: klepnutí a zavírání překryvů ----
{
  const stav2 = { schvaleno: false, patche: 0 };
  const { p, chyby } = await kontext({ fix: FIX, dalsi: podvrh(stav2) });
  await otevri(p, PREHLED);
  await li(p, 'schvaleni').getByRole('button', { name: OTEVRI_MENU }).waitFor({ timeout: 8000 });

  // Základ: klepnutí na nadpis karty naviguje.
  const n0 = await nadpisKarty(p, 'schvaleni');
  await p.mouse.click(n0.x, n0.y);
  tvrdi('1: čisté klepnutí do karty naviguje (základ)', await dokud(async () => !(await naPrehledu(p)), 2500));
  await otevri(p, PREHLED);
  await li(p, 'schvaleni').getByRole('button', { name: OTEVRI_MENU }).waitFor({ timeout: 8000 });

  // (a) Okno uvnitř <li>: klepnutí na pozadí vedle okna ho zavře a nenaviguje.
  await li(p, 'schvaleni').getByRole('button', { name: OTEVRI_MENU }).click();
  await p.getByRole('menuitem', { name: /Smazat uzávěrku/ }).click();
  await p.getByRole('dialog').waitFor({ timeout: 3000 });
  await p.mouse.click(8, 8);
  tvrdi('1a: klepnutí vedle okna okno zavře', await dokud(async () => (await p.getByRole('dialog').count()) === 0, 2000));
  await p.waitForTimeout(300);
  tvrdi('1a: …a nenaviguje na jiný pohled', await naPrehledu(p));

  // (b) Popover „···": klepnutí do karty ho zavře a nenaviguje.
  await li(p, 'schvaleni').getByRole('button', { name: OTEVRI_MENU }).click();
  await p.getByRole('menu').waitFor({ timeout: 2000 });
  const n1 = await nadpisKarty(p, 'schvaleni');
  await p.mouse.click(n1.x, n1.y);
  tvrdi('1b: klepnutí do karty menu zavře', await dokud(async () => (await p.getByRole('menu').count()) === 0, 2000));
  await p.waitForTimeout(300);
  tvrdi('1b: …a nenaviguje na jiný pohled', await naPrehledu(p));

  // (c) Stisk na tlačítku „···", puštění o pár px vedle na kartě (pod hysterezí): click dopadne na <li>.
  const tl = await stred(li(p, 'schvaleni').getByRole('button', { name: OTEVRI_MENU }));
  await p.mouse.move(tl.x, tl.y);
  await p.mouse.down();
  await p.mouse.move(tl.x, tl.y - tl.r.height / 2 - 4, { steps: 3 });
  await p.mouse.up();
  await p.waitForTimeout(400);
  tvrdi('1c: stisk na tlačítku, puštění mimo něj na kartě, nenaviguje', await naPrehledu(p));
  await p.screenshot({ path: OUT + 'k71-klik.png' });
  tvrdi('1: bez chyb v konzoli', chyby.length === 0, chyby.join(' | '));
}

// ---- 2: fokus a hlášení při výměně karet (Schválit poslední čekající) ----
{
  const stav2 = { schvaleno: false, patche: 0 };
  const { p, chyby } = await kontext({ fix: FIX, dalsi: podvrh(stav2) });
  await otevri(p, PREHLED);
  const karta = li(p, 'schvaleni');
  const schvalit = karta.getByRole('button', { name: 'Schválit' });
  await schvalit.waitFor({ timeout: 8000 });
  await schvalit.focus();
  await p.keyboard.press('Enter');
  const mini = karta.getByRole('button', { name: /^Ukázat celý widget/ });
  tvrdi('2: po schválení poslední uzávěrky je widget minimalizovaný', await dokud(() => mini.count().then(n => n > 0), 5000));
  tvrdi('2: schválení odešlo jednou', stav2.patche === 1, String(stav2.patche));
  const fokus = () => p.evaluate(() => {
    const a = document.activeElement;
    return { tag: a?.tagName, titulek: a?.hasAttribute('data-w-titulek') ?? false, vKarte: !!a?.closest('li[data-instance="schvaleni"]') };
  });
  const f1 = await fokus();
  tvrdi('2: fokus po minimalizaci není na <body>, ale na nadpisu karty', f1.tag === 'H2' && f1.titulek && f1.vKarte, JSON.stringify(f1));
  const h1 = await hlaseni(p);
  tvrdi('2: odečítač dostane hlášení o minimalizaci', /Uzávěrky ke schválení: vyřízeno, widget minimalizován\. Nic nečeká na schválení/.test(h1), h1);

  await mini.focus();
  await p.keyboard.press('Enter');
  tvrdi('2: „Ukázat celý widget" rozbalí kartu', await dokud(() => karta.getByRole('button', { name: /^Ukázat celý widget/ }).count().then(n => n === 0), 3000));
  const f2 = await fokus();
  tvrdi('2: fokus po rozbalení není na <body>, ale na nadpisu rozbalené karty', f2.tag === 'H2' && f2.titulek && f2.vKarte, JSON.stringify(f2));
  const h2 = await hlaseni(p);
  tvrdi('2: odečítač dostane hlášení o rozbalení', /Uzávěrky ke schválení: widget rozbalen\./.test(h2), h2);
  tvrdi('2: li v klidu pořád nemá tabIndex', await p.$$eval('[data-plocha] li[data-widget]', els => els.every(e => !e.hasAttribute('tabindex'))));
  tvrdi('2: bez chyb v konzoli', chyby.length === 0, chyby.join(' | '));
}

// ---- 3: minimalizace při načtení stránky je tichá (fokus není ve widgetu) ----
{
  const { p } = await kontext({ fix: FIX, dalsi: podvrh({ schvaleno: true, patche: 0 }) });
  await otevri(p, PREHLED);
  await li(p, 'schvaleni').getByRole('button', { name: /^Ukázat celý widget/ }).waitFor({ timeout: 8000 });
  tvrdi('3: minimalizace při načtení stránky nic nehlásí a fokus nekrade', (await hlaseni(p)).trim() === ''
    && (await p.evaluate(() => document.activeElement === document.body)));
}

await konec();
