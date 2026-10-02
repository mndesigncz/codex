// W3 — Kupony a promo kódy (Věrnost → Kupony a kódy). Ruční sonda (MIMO v spust.mjs): API podvrhuje.
// Na 390 a 1280 px bez vodorovného scrollu. Tvrdí, co pošle UI:
//  · uplatnění: kontrola kuponu → varování (útrata pod minimem) → „Uplatnit i přesto“ pošle confirm + částku,
//  · editor: noční okno 22:00–02:00 projde, půlka okna se nepustí, koncept pošle draft=true, náhled pohledem hosta,
//  · katalog: koncept/archiv v záložkách, duplikace otevře koncept „(kopie)“, smazání s nevyzvednutými kódy nabídne
//    „Zrušit nevyzvednuté a smazat“ a pošle force=1,
//  · poslat hostům: zkouška ukáže počet a přeskočené, odeslání pošle publikum,
//  · promo kódy: dávka pošle davka=true, úprava pošle PATCH s odměnou.
//   NEXTAUTH_SECRET=… SONDY_ZAKLAD=http://localhost:3414 node scripts/sondy/kupony.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, DIR } from './k68-spolecne.mjs';

const nacti = (j) => JSON.parse(readFileSync(DIR + j + '.json', 'utf8'));
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const kupon = (id, o = {}) => ({
  id, title: 'Káva zdarma', description: '', costPoints: 100, active: true, draft: false, archived: false, stav: 'aktivni',
  benefitKind: 'free_item', benefit: 'Položka zdarma', badges: [], percentOff: null, amountOff: null, xyBuy: null, xyFree: null,
  minOrderValue: null, maxTotal: null, issued: 0, remaining: null, dailyLimit: null, targetTiers: [], targetGroups: [],
  perCustomer: 0, cooldownDays: 0, daysOfWeek: [], hourFrom: null, hourTill: null, adultOnly: false, welcome: false,
  validSince: null, validUntil: null, claimed: 0, redeemed: 0, ...o,
});

for (const sirka of [1280, 390]) {
  const L = `${sirka}`;
  const volani = [];
  const seznam = [
    kupon(1, { title: 'Sleva 15 %', benefitKind: 'percent', percentOff: 15, benefit: 'Sleva 15 %', claimed: 4, redeemed: 4, maxTotal: 50, issued: 4, remaining: 46 }),
    kupon(2, { title: 'Dezert k čaji', claimed: 2, redeemed: 0 }),
    kupon(3, { title: 'Rozepsaná akce', draft: true, stav: 'koncept' }),
    kupon(4, { title: 'Loňská sleva', archived: true, stav: 'archiv' }),
  ];
  const dalsi = (req, json) => {
    const url = new URL(req.url()); const path = url.pathname; const m = req.method();
    const body = m === 'GET' ? null : req.postDataJSON?.() ?? null;
    if (path === '/api/client/admin/coupons') {
      if (m === 'GET') return json({ coupons: seznam, groups: [{ id: 5, name: 'Štamgasti', members: 12 }] });
      volani.push({ m, body, q: url.search });
      if (m === 'DELETE') return url.searchParams.get('force') === '1' ? json({ ok: true, zruseno: 2, vraceno: 2 }) : json({ error: 'Hosté drží 2 neuplatněných kódů.' }, 409);
      return json({ ok: true, coupon: kupon(9, { title: body?.title ?? '' }) });
    }
    if (path === '/api/client/admin/coupons/prehled') {
      const s = { vydano: 7, uplatneno: 5, otevrene: 1, propadle: 1, miraUplatneni: 71, sUtratou: 4, prumernaUtrata: 212.5, celkemUtrata: 850, medianHodin: 6, odhadSlevy: 127.5 };
      return json({ celkem: s, zkraceno: false, kupony: [{ id: 1, title: 'Sleva 15 %', ...s }], posledni: [{ id: 1, title: 'Sleva 15 %', host: 'Jana Nováková', obsluha: 'Eva', order_value: '300.00', redeemed_at: '2026-10-01 10:00:00' }] });
    }
    if (path === '/api/client/admin/coupons/send') {
      if (m === 'GET') return json({ hoste: [{ id: 21, name: 'Jana Nováková' }] });
      volani.push({ m, body, send: true });
      return json({ ok: true, zkouska: body.zkouska === true, poslano: 5, celkem: 8, preskoceno: { drzi: 3, limit: 0, neplnolety: 0, kusy: 0 } });
    }
    if (path === '/api/client/admin/redeem') {
      volani.push({ m, body, redeem: true });
      if (body.preview) {
        const pod = Number(String(body.orderValue || '0').replace(',', '.')) < 200 ;
        return json({ preview: true, code: 'ABC-DEF', title: 'Sleva 15 %', description: '', customer: 'Jana Nováková', benefit: 'Sleva 15 %', badges: ['od 200 Kč útraty'], validUntil: null, claimedAt: '2026-09-30 10:00:00', redeemed: false, problem: null, usable: true, minOrderValue: 200, warnings: pod ? [body.orderValue ? 'Útrata 150 Kč je pod minimem 200 Kč.' : 'Kupon platí od 200 Kč útraty. Zkontroluj účtenku.'] : [], needsConfirm: pod });
      }
      if (body.confirm !== true) return json({ error: 'Potvrď.', needsConfirm: true, warnings: ['x'] }, 409);
      return json({ ok: true, title: 'Sleva 15 %', customer: 'Jana Nováková', benefit: 'Sleva 15 %', badges: [], orderValue: 150, warnings: ['x'] });
    }
    if (path === '/api/client/admin/promos') {
      if (m === 'GET') return json({ promos: [{ id: 1, code: 'JARO26', title: 'Jarní leták', points: 50, coupon_id: null, coupon_title: null, max_uses: 100, uses: 3, valid_until: null, active: true, batch: null, stav: 'aktivni' }] });
      volani.push({ m, body, promo: true });
      return json({ ok: true, vytvoreno: 20, davka: 'LETAK 2026-10-02', promo: { id: 1, code: 'JARO26' } });
    }
    return undefined;
  };
  const { ctx, p, chyby } = await kontext({ viewport: { width: sirka, height: 950 }, mobil: sirka < 500, fix: nacti('k69-b8-rozlozeni-vernost'), dalsi });
  await otevri(p, '/employer/overview?mode=client&tab=loyalty', 'vedeni.klient_vernost');
  await p.getByRole('tab', { name: 'Kupony a kódy' }).click();
  await p.getByRole('heading', { name: 'Katalog kuponů' }).waitFor({ timeout: 15000 });
  await p.waitForTimeout(400);

  // --- katalog ---
  const text = await p.locator('main, body').first().innerText();
  tvrdi(`${L}: v aktuálních jsou dva kupony, ne koncept ani archiv`, text.includes('Sleva 15 %') && text.includes('Dezert k čaji') && !text.includes('Rozepsaná akce') && !text.includes('Loňská sleva'));
  tvrdi(`${L}: řádek ukazuje zbývající kusy`, text.includes('zbývá 46 kusů z 50'));
  tvrdi(`${L}: přehled uplatnění má ROI`, /přehled uplatnění/i.test(text) && /průměrná útrata/i.test(text) && /odhad slev/i.test(text), text.slice(-400));
  tvrdi(`${L}: bez vodorovného scrollu`, await bezPreteceni(p));
  await p.getByRole('tab', { name: /Koncepty/ }).click();
  tvrdi(`${L}: záložka Koncepty ukáže rozepsaný kupon`, (await p.locator('body').innerText()).includes('Rozepsaná akce'));
  await p.getByRole('tab', { name: /Archiv/ }).click();
  tvrdi(`${L}: záložka Archiv ukáže archivovaný kupon`, (await p.locator('body').innerText()).includes('Loňská sleva'));
  await p.getByRole('tab', { name: /Aktuální/ }).click();

  // --- uplatnění s varováním ---
  await p.getByLabel('Kód od hosta').fill('abcdef');
  await p.getByRole('button', { name: 'Zkontrolovat kupon' }).click();
  const okno = p.getByRole('dialog');
  await okno.waitFor({ timeout: 5000 });
  tvrdi(`${L}: okno uplatnění ukazuje varování o minimu`, (await okno.innerText()).includes('Kupon platí od 200'));
  tvrdi(`${L}: tlačítko je „Uplatnit i přesto“`, await okno.getByRole('button', { name: 'Uplatnit i přesto' }).count() === 1);
  await okno.getByLabel(/Částka účtenky/).fill('150');
  await p.waitForTimeout(700);
  tvrdi(`${L}: po zadání částky se varování přepočítá`, (await okno.innerText()).includes('pod minimem'));
  await okno.getByRole('button', { name: 'Uplatnit i přesto' }).click();
  await p.waitForTimeout(500);
  const uplatneni = volani.find(v => v.redeem && !v.body.preview);
  tvrdi(`${L}: uplatnění pošle confirm a částku`, uplatneni?.body?.confirm === true && String(uplatneni?.body?.orderValue) === '150', JSON.stringify(uplatneni));
  tvrdi(`${L}: okno se zavřelo`, await p.getByRole('dialog').count() === 0);

  // --- editor: noční okno, koncept, náhled ---
  await p.getByRole('button', { name: 'Nový kupon' }).click();
  await p.locator('#cp-title').fill('Noční káva');
  await p.getByRole('tab', { name: 'Zdarma' }).click();
  await p.getByLabel('Od hodiny').fill('22:00');
  tvrdi(`${L}: samotné „od“ se nepustí`, await (async () => { await p.getByRole('button', { name: 'Založit kupon' }).click(); return (await p.locator('p.note-danger').innerText()).includes('obě hodiny'); })());
  await p.getByLabel('Do hodiny').fill('02:00');
  tvrdi(`${L}: u nočního okna je vysvětlení přes půlnoc`, (await p.locator('body').innerText()).includes('jde přes půlnoc'));
  tvrdi(`${L}: náhled pohledem hosta ukazuje název a „Vzít“`, (await p.getByLabel('Náhled kuponu pro hosta').innerText()).includes('Noční káva'));
  tvrdi(`${L}: editor s náhledem bez vodorovného scrollu`, await bezPreteceni(p));
  await p.screenshot({ path: new URL(`./shots/kupony-editor-${sirka}.png`, import.meta.url).pathname, fullPage: true }).catch(() => {});
  await p.getByRole('button', { name: 'Uložit jako koncept' }).click();
  await p.waitForTimeout(400);
  const koncept = volani.find(v => v.m === 'POST' && v.body?.title === 'Noční káva');
  tvrdi(`${L}: koncept pošle draft=true a noční okno`, koncept?.body?.draft === true && koncept?.body?.hourFrom === '22:00' && koncept?.body?.hourTill === '02:00', JSON.stringify(koncept));

  // --- duplikace a smazání ---
  await p.getByRole('button', { name: 'Další akce s kuponem Dezert k čaji' }).click();
  await p.getByRole('menuitem', { name: /Duplikovat/ }).click();
  tvrdi(`${L}: duplikace otevře koncept „(kopie)“`, (await p.locator('#cp-title').inputValue()) === 'Dezert k čaji (kopie)');
  await p.getByRole('button', { name: 'Zpět na kupony' }).click();
  await p.getByRole('button', { name: 'Další akce s kuponem Dezert k čaji' }).click();
  await p.getByRole('menuitem', { name: /Smazat/ }).click();
  const dlg = p.getByRole('dialog');
  tvrdi(`${L}: dialog smazání říká totéž co API (nevyzvednuté kódy)`, (await dlg.innerText()).includes('2 kódy'), await dlg.innerText());
  await dlg.getByRole('button', { name: 'Zrušit nevyzvednuté a smazat' }).click();
  await p.waitForTimeout(400);
  tvrdi(`${L}: smazání pošle force=1`, volani.some(v => v.m === 'DELETE' && v.q.includes('force=1')), JSON.stringify(volani.filter(v => v.m === 'DELETE')));

  // --- poslat hostům ---
  await p.getByRole('button', { name: 'Další akce s kuponem Sleva 15 %' }).click();
  await p.getByRole('menuitem', { name: /Poslat hostům/ }).click();
  const od = p.getByRole('dialog');
  await od.getByText(/^Kupon dostan/).waitFor({ timeout: 5000 });
  const veta = await od.innerText();
  tvrdi(`${L}: zkouška ukáže počet a přeskočené`, veta.includes('5 hostů') && veta.includes('3 hosté ho už drží'), veta.replace(/\n/g, ' | '));
  tvrdi(`${L}: zkouška nic nezapsala (zkouska=true)`, volani.filter(v => v.send).every(v => v.body.zkouska === true));
  await od.getByRole('button', { name: /^Poslat 5/ }).click();
  await p.waitForTimeout(400);
  const odeslano = volani.find(v => v.send && v.body.zkouska !== true);
  tvrdi(`${L}: odeslání pošle publikum „všichni“`, odeslano?.body?.publikum?.druh === 'vsichni', JSON.stringify(odeslano));

  // --- promo kódy ---
  await p.getByRole('tab', { name: 'Dávka kódů' }).click();
  await p.getByLabel('Předpona').fill('letak');
  await p.getByLabel(/^Počet/).fill('20');
  await p.locator('#pr-title').fill('Podzimní leták');
  await p.getByRole('button', { name: 'Vytvořit dávku' }).click();
  await p.waitForTimeout(400);
  const davka = volani.find(v => v.promo && v.body?.davka === true);
  tvrdi(`${L}: dávka pošle davka=true, předponu a počet`, davka?.body?.prefix === 'LETAK' && String(davka?.body?.count) === '20', JSON.stringify(davka));
  await p.getByRole('button', { name: 'Další akce s kódem JARO26' }).click();
  await p.getByRole('menuitem', { name: /Upravit/ }).click();
  await p.getByRole('dialog').getByLabel('Bodů').fill('80');
  await p.getByRole('dialog').getByRole('button', { name: 'Uložit' }).click();
  await p.waitForTimeout(400);
  const uprava = volani.find(v => v.promo && v.m === 'PATCH');
  tvrdi(`${L}: úprava kódu pošle PATCH s novou odměnou`, Number(uprava?.body?.points) === 80 && uprava?.body?.id === 1, JSON.stringify(uprava));
  tvrdi(`${L}: bez vodorovného scrollu na konci`, await bezPreteceni(p));
  tvrdi(`${L}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await konec();
