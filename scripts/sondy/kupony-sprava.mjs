// Ruční sonda kola 81: doplňky správy kuponů z okruhu K (Věrnost → Kupony a kódy). Základní toky (uplatnění s varováním,
// koncept, noční okno, smazání, poslání hostům, promo dávka) hlídá kupony.mjs; tahle sonda hlídá, co přibylo navíc.
// Není v ZELENE ve spust.mjs (je v MIMO): API se podvrhuje, sonda tvrdí, co UI zobrazí a pošle.
//
//   SONDY_ZAKLAD=http://localhost:3411 SONDY_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node scripts/sondy/kupony-sprava.mjs
//
// Měří na 390 a 1280 px (bez vodorovného scrollu): hromadné akce nad kupony (Vybrat → Pozastavit pošle PATCH s ids
// a akcí), export katalogu do CSV, historie změn kuponu před → po, editor posílá nová pole (položka nabídky, vyloučené
// kategorie, X+Y, kusy celkem, uplatnění za den, noční hodiny 22–02) a náhled pohledem hosta ukáže „zdarma na položku“.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, DIR } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const kupon = (id, o = {}) => ({
  id, title: 'Káva zdarma', description: '', costPoints: 100, active: true, draft: false, archived: false, stav: 'aktivni',
  benefitKind: 'free_item', benefit: 'Položka zdarma', badges: [], percentOff: null, amountOff: null, xyBuy: null, xyFree: null,
  minOrderValue: null, maxTotal: null, issued: 0, remaining: null, dailyLimit: null, targetTiers: [], targetGroups: [],
  perCustomer: 0, cooldownDays: 0, daysOfWeek: [], hourFrom: null, hourTill: null, adultOnly: false, welcome: false,
  validSince: null, validUntil: null, claimed: 0, redeemed: 0, menuItemId: null, menuItemName: null, excludedItems: [], excludedSections: [], ...o,
});

for (const sirka of [1280, 390]) {
  const L = `${sirka}px`;
  const volani = [];
  const seznam = [
    kupon(1, { title: 'Sleva 15 % pro zlaté', benefitKind: 'percent', percentOff: 15, benefit: 'Sleva 15 %', claimed: 4, redeemed: 4, maxTotal: 10, issued: 4, remaining: 6 }),
    kupon(2, { title: 'Dezert k čaji' }),
    kupon(3, { title: 'Uvítací káva', welcome: true, costPoints: 0 }),
  ];
  const dalsi = (req, json) => {
    const url = new URL(req.url()); const path = url.pathname; const m = req.method();
    const body = m === 'GET' ? null : req.postDataJSON?.() ?? null;
    if (path === '/api/client/admin/coupons') {
      if (m === 'GET') {
        return json({ coupons: seznam, groups: [] });
      }
      volani.push({ m, body });
      return json(body?.ids ? { ok: true, hotovo: body.ids.length, preskoceno: 0 } : { ok: true, coupon: kupon(9, { title: body?.title ?? '' }) });
    }
    if (path === '/api/client/admin/coupons/historie') {
      return json({ historie: [
        { id: 1, kdy: '2026-09-30 10:00:00', kdo: 'Marie Nováková', co: 'Kupon upraven', detail: 'Cena: 100 b. → 150 b.' },
        { id: 2, kdy: '2026-09-01 09:00:00', kdo: 'Marie Nováková', co: 'Kupon založen', detail: '' },
      ] });
    }
    if (path === '/api/client/admin/coupons/prehled') return json({ celkem: { vydano: 0, uplatneno: 0, otevrene: 0, propadle: 0, miraUplatneni: null, sUtratou: 0, prumernaUtrata: null, celkemUtrata: 0, medianHodin: null, odhadSlevy: 0 }, zkraceno: false, kupony: [], posledni: [] });
    if (path === '/api/client/admin/promos') return json({ promos: [] });
    if (path === '/api/menu' && m === 'GET') return json({ boards: [{ id: 1, name: 'Nápoje', sections: [{ id: 3, title: 'Alkohol', items: [{ id: 12, name: 'Víno bílé' }] }, { id: 2, title: 'Čaje', items: [{ id: 11, name: 'Matcha latte' }] }] }] });
    return undefined;
  };
  const { ctx, p, stav, chyby } = await kontext({ viewport: { width: sirka, height: 950 }, mobil: sirka < 500, fix: nacti('k69-b8-rozlozeni-vernost'), dalsi });
  await otevri(p, '/employer/overview?mode=client&tab=loyalty', 'vedeni.klient_vernost');
  await p.getByRole('tab', { name: 'Kupony a kódy' }).click();
  await p.getByRole('heading', { name: 'Katalog kuponů' }).waitFor({ timeout: 15000 });
  await p.waitForTimeout(400);

  // Hromadné akce.
  await p.getByRole('button', { name: 'Vybrat', exact: true }).click();
  await p.getByRole('checkbox', { name: 'Vybrat kupon Dezert k čaji' }).click();
  await p.getByRole('checkbox', { name: 'Vybrat kupon Uvítací káva' }).click();
  await p.getByRole('button', { name: 'Pozastavit' }).click();
  await p.waitForTimeout(400);
  tvrdi(`${L}: hromadné pozastavení pošle PATCH s ids a akcí`, volani.some(v => v.m === 'PATCH' && v.body?.action === 'pozastavit' && v.body.ids?.length === 2), JSON.stringify(volani));
  tvrdi(`${L}: bez vodorovného scrollu (hromadné akce)`, await bezPreteceni(p));

  // Export katalogu.
  await p.getByRole('button', { name: 'Exportovat kupony do CSV' }).click();
  const stazeni = p.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await p.getByRole('menuitem', { name: /Katalog kuponů \(CSV\)/ }).click();
  const soubor = await stazeni;
  tvrdi(`${L}: export katalogu stáhne ?export=kupony`, !!soubor && /coupons\?export=kupony/.test(soubor.url()), String(soubor?.url()));

  // Historie změn.
  await p.getByRole('button', { name: 'Další akce s kuponem Sleva 15 % pro zlaté' }).click();
  await p.getByRole('menuitem', { name: /Historie změn/ }).click();
  const hist = p.getByRole('dialog');
  await hist.waitFor({ timeout: 4000 });
  tvrdi(`${L}: historie ukazuje, kdo a co změnil před → po`, await p.getByText(/Cena: 100 b\. → 150 b\./).first().isVisible() && (await hist.innerText()).includes('Marie Nováková'));
  await p.keyboard.press('Escape');

  // Editor: položka, vyloučení, X+Y, limity, noční hodiny.
  await p.getByRole('button', { name: 'Nový kupon' }).click();
  await p.locator('#cp-title').fill('Noční 2+1');
  await p.getByRole('tab', { name: 'X+Y', exact: true }).click();
  await p.getByLabel('Koupí (X)').fill('2');
  await p.getByLabel('Od hodiny').fill('22:00');
  await p.getByLabel('Do hodiny').fill('02:00');
  await p.getByLabel('Kusů celkem').fill('50');
  await p.getByLabel('Uplatnění za den').fill('5');
  await p.getByLabel('Platí jen na položku').selectOption('11');
  tvrdi(`${L}: bez vodorovného scrollu (editor)`, await bezPreteceni(p));
  await p.getByRole('button', { name: 'Uložit jako koncept' }).click();
  await p.waitForTimeout(500);
  const post = volani.find(v => v.m === 'POST');
  tvrdi(`${L}: POST nese nová pole`, post?.body?.draft === true && post.body.hourFrom === '22:00' && post.body.hourTill === '02:00' && Number(post.body.maxTotal) === 50 && Number(post.body.dailyLimit) === 5 && Number(post.body.menuItemId) === 11 && Number(post.body.xyBuy) === 2, JSON.stringify(post));
  tvrdi(`${L}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await konec();
