// Ručně spouštěná sonda dárkových poukazů (Kolo 74). Není v ZELENE ve spust.mjs (je v MIMO): API se podvrhuje.
//
// Spuštění proti lokálnímu buildu:
//   SONDY_ZAKLAD=http://localhost:3415 SONDY_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node scripts/sondy/poukazy.mjs
//
// Na 390 a 1280 px projde: správa (Věrnost → Poukazy: seznam, hledání, filtr, nový poukaz i dávka, detail s historií,
// uplatnění částky i celého zůstatku s ref, vrácení, zrušení s potvrzením, tisk karty s QR, export CSV), obsluhu
// (CardScan → Poukaz: kód → zůstatek → uplatnit) a hosta („Mám poukaz“ v Moje i na stránce podniku, generické chyby).
// V každém kroku: žádný vodorovný scroll stránky ani okna, žádné chyby v konzoli.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, browser, tokenPro, BASE, DIR, OUT } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const VERNOST = '/employer/overview?mode=client&tab=loyalty';
const DNES = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
const plus = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

const radek = (id, code, value, balance, o = {}) => ({
  id, code, value_amount: value, balance, currency: 'CZK', recipient_name: null, buyer_name: null, note: null, customer_id: null,
  valid_until: plus(DNES, 200), status: 'active', created_at: `${DNES}T09:00:00`, stav: 'active', ...o,
});
const POUKAZY = [
  radek(1, 'DP-ABCD-2349', 1000, 1000, { recipient_name: 'Jana Nováková', note: 'k narozeninám' }),
  radek(2, 'DP-BCDE-345S', 500, 150, { recipient_name: 'Petr' }),
  radek(3, 'DP-CDEF-456B', 300, 0, { status: 'used', stav: 'used', valid_until: null }),
  radek(4, 'DP-DEFG-567U', 800, 800, { valid_until: plus(DNES, -3), stav: 'expired' }),
  radek(5, 'DP-EFGH-678D', 200, 0, { status: 'void', stav: 'void' }),
];
const HISTORIE = [
  { id: 11, kind: 'use', amount: 350, balance_after: 150, by_name: 'Anna Obsluha', note: 'účtenka 12', ref: 'r1', created_at: `${DNES}T10:00:00` },
];

/** Podvrh API poukazů; co UI pošle, se zapisuje do `stav.pk`. */
const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  const s = (stav.pk ??= { posty: [], patche: [], uplatneni: [], exporty: 0, dotazy: [], selhatUplatneni: 0, zustatek: 150 });
  if (path === '/api/client/admin/profile' && m === 'GET') return json({ profile: { name: 'Kavárna U Lípy', team_name: 'Kavárna U Lípy', cashback_pct: 0, points_per_100: 5, silver_at: 10, gold_at: 25 }, boards: [], url: '' });
  if (path === '/api/client/admin/vouchers/redeem') {
    if (m === 'GET') {
      const k = url.searchParams.get('code');
      const p = POUKAZY.find(x => x.code === k);
      return p ? json({ poukaz: p.id === 2 ? { ...p, balance: s.zustatek, stav: s.zustatek > 0 ? 'active' : 'used' } : p, historie: [] }) : json({ error: 'Poukaz nenalezen.' }, 404);
    }
    const b = req.postDataJSON();
    s.uplatneni.push(b);
    if (s.selhatUplatneni > 0) { s.selhatUplatneni--; return json({ error: 'Na poukazu je méně, než chceš uplatnit.' }, 409); }
    s.zustatek -= b.amount;
    return json({ ok: true, castka: b.amount, opakovani: false, poukaz: { ...POUKAZY[1], balance: s.zustatek, stav: s.zustatek > 0 ? 'active' : 'used' } });
  }
  if (path === '/api/client/admin/vouchers') {
    if (m === 'GET') {
      const id = url.searchParams.get('id');
      s.dotazy.push(url.search);
      // Přehled závazku a náhled hromadného prodloužení (W5).
      if (url.searchParams.get('prehled') === '1') return json({
        prehled: { zavazek: 3150, pocetPlatnych: 2, propadlo: 800, pocetPropadlych: 1, brzyPropadne: { pocet: 1, castka: 150 }, vJineMene: 0, brzyDni: 30 },
        mesice: Array.from({ length: 12 }, (_, i) => { const d = new Date(Date.UTC(Number(DNES.slice(0, 4)), Number(DNES.slice(5, 7)) - 1 - (11 - i), 1)); return { mesic: d.toISOString().slice(0, 7), prodano: i === 11 ? 1800 : i === 9 ? 500 : 0, pocetProdanych: i === 11 ? 3 : i === 9 ? 1 : 0, uplatneno: i === 11 ? 350 : 0, vraceno: 0, cistoUplatneno: i === 11 ? 350 : 0 }; }),
        limity: { min: 0, max: 0 }, currency: 'CZK', dnes: DNES });
      if (url.searchParams.get('nahled') === 'prodlouzeni') return json({ pocet: 2, castka: 950 });
      if (id) { const p = POUKAZY.find(x => x.id === Number(id)); return p ? json({ poukaz: p.id === 2 ? { ...p, balance: s.zustatek, stav: s.zustatek > 0 ? 'active' : 'used' } : p, historie: p.id === 2 ? HISTORIE : [] }) : json({ error: 'Poukaz nenalezen.' }, 404); }
      const q = (url.searchParams.get('q') ?? '').toLowerCase();
      const st = url.searchParams.get('stav') ?? '';
      let l = POUKAZY.filter(p => (!st || p.stav === st) && (!q || (p.code + (p.recipient_name ?? '') + (p.note ?? '')).toLowerCase().includes(q)));
      return json({ poukazy: l, celkem: l.length, strana: 1, naStranu: 25, currency: 'CZK', dnes: DNES });
    }
    if (m === 'POST') {
      const b = req.postDataJSON();
      s.posty.push(b);
      const n = b.count ?? 1;
      return json({ ok: true, poukazy: Array.from({ length: n }, (_, i) => radek(20 + i, `DP-ZZZ${i % 8 + 2}-2222`, b.value, b.value, { recipient_name: b.recipient || null })) });
    }
    if (m === 'PATCH') { s.patche.push(req.postDataJSON()); return json({ ok: true, poukaz: POUKAZY[0] }); }
  }
  return undefined;
};

const bezScrollu = (p) => p.evaluate(() => ({ strana: document.documentElement.scrollWidth - window.innerWidth,
  okno: (() => { const d = document.querySelector('[role="dialog"]'); return d ? d.scrollWidth - d.clientWidth : 0; })() }));
const zmer = async (p, popis) => {
  const m = await bezScrollu(p);
  tvrdi(`${popis}: bez vodorovného scrollu stránky`, m.strana <= 1, `${m.strana}px`);
  tvrdi(`${popis}: bez vodorovného scrollu okna`, m.okno <= 1, `${m.okno}px`);
};
const okno = (p) => p.locator('[role="dialog"]').last();
const s_pk = (_p, stav) => stav.pk;

async function sprava(viewport, mobil) {
  const jm = `${viewport.width}px`;
  const { ctx, p, stav, chyby } = await kontext({ viewport, mobil, fix: nacti('k69-b8-rozlozeni-vernost'), dalsi: podvrh });
  // Export CSV: odpověď je potřeba vyřídit přímo přes route (podvrh nemá k route přístup).
  await ctx.route('**/api/client/admin/vouchers?export=csv**', route => { stav.pk.exporty++; return route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', body: '﻿Kód;Stav\r\nDP-ABCD-2349;Platný\r\n' }); });
  await p.addInitScript(() => {
    window.__tisk = [];
    window.open = () => ({ document: { write: (h) => window.__tisk.push(h), close() {} }, focus() {}, print() {} });
  });
  await otevri(p, VERNOST, 'vedeni.klient_vernost');
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Poukazy' }).click();
  await p.getByText('DP-ABCD-2349').first().waitFor({ timeout: 8000 });
  tvrdi(`${jm} seznam: 5 poukazů se stavy`, (await p.getByText(/^(Platný|Vyčerpaný|Propadlý|Zrušený)$/).count()) >= 5);
  tvrdi(`${jm} seznam: zůstatek 150 Kč a „z 500 Kč“ u částečně uplatněného`, /150\s*Kč/.test(await p.locator('main, body').first().innerText()) && /z\s*500\s*Kč/.test(await p.locator('body').innerText()));
  await zmer(p, `${jm} seznam`);
  await p.screenshot({ path: `${OUT}poukazy-${jm}-1-seznam.png` });

  // Přehled závazku, měsíce, nastavení uplatnění a hromadné prodloužení (W5).
  await p.getByRole('heading', { name: 'Přehled poukazů' }).waitFor({ timeout: 8000 });
  tvrdi(`${jm} přehled: závazek 3 150 Kč a propadlo 800 Kč`, /3\s*150\s*Kč/.test(await p.locator('body').innerText()) && /800\s*Kč/.test(await p.locator('body').innerText()));
  tvrdi(`${jm} přehled: měsíc s prodejem je v seznamu`, await p.locator('[data-mesic]').count() === 12);
  await zmer(p, `${jm} přehled`);
  await p.getByRole('button', { name: /Prodloužit platnost/ }).click();
  await okno(p).waitFor();
  await okno(p).getByText(/Dotkne se 2 poukazy/).waitFor({ timeout: 5000 });
  await zmer(p, `${jm} hromadné prodloužení`);
  await okno(p).getByRole('button', { name: 'Prodloužit 2 poukazy' }).click();
  await p.waitForTimeout(400);
  tvrdi(`${jm} prodloužení: PATCH extend s doDne a novou platností`, s_pk(p, stav).patche.some(x => x.action === 'extend' && x.validUntil && x.doDne));
  await p.getByLabel(/Nejmenší uplatnění/).fill('50');
  await p.getByLabel(/Největší uplatnění/).fill('500');
  await p.getByRole('button', { name: 'Uložit nastavení' }).click();
  await p.waitForTimeout(300);
  tvrdi(`${jm} nastavení uplatnění: PATCH limits`, s_pk(p, stav).patche.some(x => x.action === 'limits' && x.min === 50 && x.max === 500));

  // Hledání a filtr.
  await p.getByLabel('Hledat poukazy').fill('jana');
  await p.waitForTimeout(500);
  tvrdi(`${jm} hledání: zůstane jen Jana`, await p.getByText('DP-BCDE-345S').count() === 0 && await p.getByText('DP-ABCD-2349').count() > 0);
  await p.getByLabel('Hledat poukazy').fill('');
  await p.getByRole('tab', { name: 'Propadlé' }).or(p.getByRole('button', { name: 'Propadlé' })).first().click();
  await p.waitForTimeout(400);
  tvrdi(`${jm} filtr: Propadlé ukáže jen propadlý`, await p.getByText('DP-DEFG-567U').count() > 0 && await p.getByText('DP-ABCD-2349').count() === 0);
  await p.getByRole('tab', { name: 'Vše' }).or(p.getByRole('button', { name: 'Vše' })).first().click();
  await p.waitForTimeout(400);

  // Nový poukaz (dávka).
  await p.getByRole('button', { name: 'Nový poukaz' }).click();
  await okno(p).waitFor();
  await zmer(p, `${jm} nový poukaz`);
  await okno(p).getByLabel(/Hodnota/).fill('500');
  await okno(p).getByLabel('Počet kusů').fill('3');
  await okno(p).getByRole('button', { name: '+1 rok' }).click();
  await okno(p).getByLabel(/Obdarovaný/).fill('Eva');
  await p.screenshot({ path: `${OUT}poukazy-${jm}-2-novy.png` });
  await okno(p).getByRole('button', { name: 'Založit 3 poukazů' }).or(okno(p).getByRole('button', { name: /Založit 3/ })).click();
  await okno(p).getByText(/Hotovo: 3 poukazy/).waitFor({ timeout: 5000 });
  const post = stav.pk.posty.at(-1);
  tvrdi(`${jm} nový: POST má hodnotu 500, 3 kusy, platnost a obdarovaného`, post?.value === 500 && post.count === 3 && /^\d{4}-\d{2}-\d{2}$/.test(post.validUntil) && post.recipient === 'Eva', JSON.stringify(post));
  await zmer(p, `${jm} po založení dávky`);
  // Tisk celé dávky.
  await okno(p).getByRole('button', { name: 'Vytisknout všechny' }).click();
  await p.waitForFunction(() => window.__tisk.length > 0, null, { timeout: 5000 });
  const html = (await p.evaluate(() => window.__tisk[0]));
  tvrdi(`${jm} tisk: tři karty s kódem a QR (svg)`, (html.match(/class="poukaz"/g) ?? []).length === 3 && html.includes('<svg') && html.includes('DP-ZZZ2-2222') && html.includes('Kavárna U Lípy'));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);

  // Detail částečně uplatněného poukazu a uplatnění.
  await p.getByText('DP-BCDE-345S').first().click();
  await okno(p).getByText('Historie').waitFor();
  tvrdi(`${jm} detail: historie ukazuje uplatnění 350 Kč obsluhou`, /Anna Obsluha/.test(await okno(p).innerText()) && /350\s*Kč/.test(await okno(p).innerText()));
  await zmer(p, `${jm} detail`);
  await p.screenshot({ path: `${OUT}poukazy-${jm}-3-detail.png` });
  const castka = okno(p).getByLabel(/Částka k uplatnění/);
  const uplatnit = okno(p).getByRole('button', { name: 'Uplatnit', exact: true });
  tvrdi(`${jm} detail: Uplatnit je bez částky zakázané`, await uplatnit.isDisabled());
  await castka.fill('151');
  tvrdi(`${jm} detail: částka nad zůstatek (151 z 150) je zakázaná`, await uplatnit.isDisabled());
  await castka.fill('50');
  await uplatnit.click();
  await p.waitForFunction(() => true);
  await p.waitForTimeout(500);
  const u1 = stav.pk.uplatneni.at(-1);
  tvrdi(`${jm} uplatnění: POST kód, částka 50 a ref (idempotence)`, u1?.code === 'DP-BCDE-345S' && u1.amount === 50 && typeof u1.ref === 'string' && u1.ref.length >= 8, JSON.stringify(u1));
  tvrdi(`${jm} uplatnění: zůstatek v detailu klesl na 100 Kč`, /100\s*Kč/.test(await okno(p).locator('p.text-3xl').innerText()), await okno(p).locator('p.text-3xl').innerText());
  const rychle = okno(p).getByRole('button', { name: /Celý zůstatek/ });
  await rychle.click();
  await p.waitForTimeout(500);
  tvrdi(`${jm} „Celý zůstatek“ pošle amount = 100`, stav.pk.uplatneni.at(-1)?.amount === 100, JSON.stringify(stav.pk.uplatneni.at(-1)));
  tvrdi(`${jm} po vyčerpání je poukaz Vyčerpaný a uplatnění zmizí`, await okno(p).getByText('Vyčerpaný').count() > 0 && await okno(p).getByRole('button', { name: 'Uplatnit', exact: true }).count() === 0);
  tvrdi(`${jm} a ref dalšího uplatnění je jiný než prvního`, stav.pk.uplatneni.at(-1).ref !== u1.ref);
  // Vrácení.
  await okno(p).getByRole('button', { name: 'Vrátit', exact: true }).first().click();
  await p.getByRole('dialog', { name: 'Vrátit uplatněnou částku?' }).waitFor();
  await p.getByRole('button', { name: /Vrátit 350/ }).click();
  await p.waitForTimeout(400);
  const patch = stav.pk.patche.at(-1);
  tvrdi(`${jm} vrácení: PATCH refund s částkou 350`, patch?.action === 'refund' && patch.amount === 350 && patch.id === 2, JSON.stringify(patch));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);

  // Zrušení s potvrzením.
  await p.getByText('DP-ABCD-2349').first().click();
  await okno(p).getByText('Historie').waitFor();
  const pocetPatchu = stav.pk.patche.length;
  await okno(p).getByRole('button', { name: /Zrušit poukaz/ }).click();
  await p.getByRole('dialog', { name: 'Zrušit poukaz?' }).waitFor();
  tvrdi(`${jm} zrušení: bez potvrzení se nic neposlalo`, stav.pk.patche.length === pocetPatchu);
  await p.getByRole('dialog', { name: 'Zrušit poukaz?' }).getByRole('button', { name: 'Zrušit poukaz' }).click();
  await p.waitForTimeout(400);
  tvrdi(`${jm} zrušení: po potvrzení PATCH action void`, stav.pk.patche.at(-1)?.action === 'void' && stav.pk.patche.at(-1).id === 1, JSON.stringify(stav.pk.patche.at(-1)));
  // Platnost.
  const plat = okno(p).getByLabel('Platí do');
  await plat.fill(plus(DNES, 400));
  await okno(p).getByRole('button', { name: 'Uložit platnost' }).click();
  await p.waitForTimeout(400);
  tvrdi(`${jm} prodloužení: PATCH validUntil`, stav.pk.patche.at(-1)?.validUntil === plus(DNES, 400), JSON.stringify(stav.pk.patche.at(-1)));
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);

  // Export CSV.
  const [stazeni] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.getByRole('button', { name: 'Export CSV' }).click()]);
  tvrdi(`${jm} export: stáhne poukazy.csv`, !!stazeni && /poukazy\.csv$/.test(stazeni.suggestedFilename()), stazeni?.suggestedFilename());
  await zmer(p, `${jm} po exportu`);
  tvrdi(`${jm} správa: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

async function obsluha(viewport, mobil) {
  const jm = `${viewport.width}px`;
  const { ctx, p, stav, chyby } = await kontext({ viewport, mobil, fix: nacti('k69-b8-rozlozeni-vernost'), dalsi: podvrh });
  await otevri(p, VERNOST, 'vedeni.klient_vernost');
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Poukazy' }).click();
  await p.getByLabel('Kód poukazu').first().waitFor();
  // Uplatnění z karty „Uplatnit poukaz“ (nahoře) otevře detail.
  await p.getByLabel('Kód poukazu').fill('dp bcde 345s');
  tvrdi(`${jm} kód se při psaní formátuje`, (await p.getByLabel('Kód poukazu').inputValue()) === 'BCDE-345S', await p.getByLabel('Kód poukazu').inputValue());
  await p.getByRole('button', { name: 'Najít poukaz' }).click();
  await okno(p).getByText('Historie').waitFor({ timeout: 5000 });
  tvrdi(`${jm} nalezení podle kódu otevře detail`, await okno(p).getByText('DP-BCDE-345S').count() > 0);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  // Špatný kontrolní znak: nejde ani na server.
  const pred = stav.pk.dotazy.length;
  await p.getByLabel('Kód poukazu').fill('ABCD-2348');
  await p.getByRole('button', { name: 'Najít poukaz' }).click();
  await p.waitForTimeout(400);
  tvrdi(`${jm} špatný kontrolní znak: hláška a žádný dotaz na server`, stav.pk.dotazy.length === pred && await okno(p).count() === 0);
  tvrdi(`${jm} obsluha: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

async function cardscan(viewport, mobil) {
  const jm = `${viewport.width}px`;
  // CardScan je v „Kartička hosta u kasy“ (StaffInbox / widget Objednávky od stolu): Rezervace a Objednávky v Clientu.
  const { ctx, p, stav, chyby } = await kontext({ viewport, mobil, fix: nacti('k69-b8-rozlozeni-objednavky'), dalsi: podvrh });
  await otevri(p, '/employer/overview?mode=client&tab=orders', 'vedeni.klient_objednavky');
  await p.getByText('Kartička hosta u kasy').first().click();
  await p.getByRole('radio', { name: 'Poukaz' }).or(p.getByRole('tab', { name: 'Poukaz' })).or(p.getByRole('button', { name: 'Poukaz', exact: true })).first().click();
  await p.getByRole('heading', { name: 'Dárkový poukaz' }).waitFor({ timeout: 5000 });
  await zmer(p, `${jm} CardScan poukaz`);
  await p.getByLabel('Kód poukazu').fill('DP-BCDE-345S');
  await p.getByRole('button', { name: 'Najít', exact: true }).click();
  await p.getByText(/Celý zůstatek/).waitFor({ timeout: 5000 });
  stav.pk.zustatek = 150;
  tvrdi(`${jm} CardScan: zůstatek 150 Kč a platnost`, /150\s*Kč/.test(await p.locator('body').innerText()) && /platí do/.test(await p.locator('body').innerText()));
  await zmer(p, `${jm} CardScan nalezený poukaz`);
  await p.screenshot({ path: `${OUT}poukazy-${jm}-4-kasa.png` });
  await p.getByLabel(/Částka k uplatnění/).fill('40');
  await p.getByRole('button', { name: 'Uplatnit', exact: true }).click();
  await p.waitForTimeout(500);
  const u = stav.pk.uplatneni.at(-1);
  tvrdi(`${jm} CardScan: uplatnění 40 s ref`, u?.amount === 40 && u.code === 'DP-BCDE-345S' && !!u.ref, JSON.stringify(u));
  // Odmítnutí serverem (409) ukáže důvod a nechá zadání k opravě.
  stav.pk.selhatUplatneni = 1;
  await p.getByLabel(/Částka k uplatnění/).fill('10');
  await p.getByRole('button', { name: 'Uplatnit', exact: true }).click();
  await p.getByRole('alert').filter({ hasText: 'méně, než chceš' }).waitFor({ timeout: 4000 });
  tvrdi(`${jm} CardScan: 409 ukáže důvod`, true);
  tvrdi(`${jm} CardScan: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

async function host(viewport, mobil) {
  const jm = `${viewport.width}px`;
  const b = await browser();
  const ctx = await b.newContext({ viewport, locale: 'cs-CZ', isMobile: mobil, hasTouch: mobil });
  const volani = [];
  await ctx.addCookies([{ name: 'next-auth.session-token', value: tokenPro('customer'), domain: 'localhost', path: '/', httpOnly: true, sameSite: 'Lax' }]);
  await ctx.route('**/api/**', route => {
    const u = new URL(route.request().url());
    const fulfill = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (u.pathname.endsWith('/voucher')) {
      const kod = route.request().postDataJSON().code;
      volani.push(kod);
      if (/ABCD/i.test(kod)) return fulfill({ ok: true, balance: 150, value: 500, currency: 'CZK', validUntil: plus(DNES, 90) });
      if (/LIMI/i.test(kod)) return fulfill({ error: 'Moc pokusů. Zkus to za čtvrt hodiny.' }, 429);
      return fulfill({ error: 'Poukaz nenalezen nebo neplatí' }, 404);
    }
    if (u.pathname === '/api/client/b/kavarna-u-lipy') return fulfill(nacti('client_b_kavarna-u-lipy'));
    if (u.pathname === '/api/client/me') return fulfill(nacti('client_me'));
    if (u.pathname === '/api/client/card') return fulfill(nacti('client_card'));
    return fulfill({});
  });
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', e => chyby.push(String(e)));
  p.on('console', msg => { if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) chyby.push(msg.text()); });

  // Moje
  await p.goto(BASE + '/client/me', { waitUntil: 'networkidle' });
  await p.getByLabel('Kód z poukazu').or(p.getByPlaceholder('Kód z poukazu')).first().waitFor({ timeout: 10000 });
  await p.getByPlaceholder('Kód z poukazu').fill('abcd 2345');
  tvrdi(`${jm} Moje: kód se formátuje`, (await p.getByPlaceholder('Kód z poukazu').inputValue()) === 'ABCD-2345');
  await p.getByRole('button', { name: 'Zkontrolovat' }).click();
  await p.getByText(/Zůstatek/).waitFor({ timeout: 5000 });
  tvrdi(`${jm} Moje: zůstatek 150 Kč z 500 Kč a platnost`, /150\s*Kč/.test(await p.locator('div[role="status"]').innerText()) && /500\s*Kč/.test(await p.locator('div[role="status"]').innerText()) && /platí do/.test(await p.locator('div[role="status"]').innerText()));
  tvrdi(`${jm} Moje: host se nedozví jméno ani poznámku (jen zůstatek a platnost)`, !/Jana|narozenin/.test(await p.locator('div[role="status"]').innerText()));
  await zmer(p, `${jm} Moje s poukazem`);
  await p.screenshot({ path: `${OUT}poukazy-${jm}-5-host-moje.png` });
  await p.getByPlaceholder('Kód z poukazu').fill('ZZZZ-2222');
  await p.getByRole('button', { name: 'Zkontrolovat' }).click();
  await p.getByRole('alert').filter({ hasText: 'Poukaz nenalezen nebo neplatí' }).waitFor({ timeout: 5000 });
  tvrdi(`${jm} Moje: neznámý kód → generická chyba a výsledek zmizí`, await p.locator('div[role="status"]').count() === 0);
  await p.getByPlaceholder('Kód z poukazu').fill('LIMI-TAAA');
  await p.getByRole('button', { name: 'Zkontrolovat' }).click();
  await p.getByRole('alert').filter({ hasText: 'Moc pokusů' }).waitFor({ timeout: 5000 });
  tvrdi(`${jm} Moje: limit pokusů hlásí srozumitelně`, true);

  // Stránka podniku
  await p.goto(BASE + '/client/kavarna-u-lipy?tab=loyalty', { waitUntil: 'networkidle' });
  await p.getByPlaceholder('Kód z poukazu').waitFor({ timeout: 10000 });
  await p.getByPlaceholder('Kód z poukazu').fill('ABCD2345');
  await p.getByRole('button', { name: 'Zkontrolovat' }).click();
  await p.getByText(/Zůstatek/).waitFor({ timeout: 5000 });
  tvrdi(`${jm} Podnik: zůstatek se ukáže`, /150\s*Kč/.test(await p.locator('div[role="status"]').innerText()));
  await zmer(p, `${jm} Podnik s poukazem`);
  await p.screenshot({ path: `${OUT}poukazy-${jm}-6-host-podnik.png` });
  tvrdi(`${jm} host: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

for (const [v, mobil] of [[{ width: 390, height: 844 }, true], [{ width: 1280, height: 950 }, false]]) {
  await sprava(v, mobil);
  await obsluha(v, mobil);
  await cardscan(v, mobil);
  await host(v, mobil);
}
await konec();
