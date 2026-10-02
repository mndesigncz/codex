// Kolo 81 — členové, skupiny, zprávy a automatizace v prohlížeči (ruční sonda, v MIMO ve spust.mjs;
// spouští se `node scripts/sondy/k81-clenove-zpravy.mjs` proti `next start -p 3000`).
//
// Hlídá: hledání, řazení a filtry posílají parametry serveru; telefon je v řádku; výběr a hromadné přidání
// do skupiny pošle POST se seznamem id; blokace člena a odebrání z klubu se nejdřív potvrdí v okně;
// duplicity se ukážou a sloučení se potvrdí; zpráva jde e-mailem s náhledem a odhlášením, zkouška sobě
// pošle test a odeslání se potvrdí; automatizace se zapínají zvlášť; na 390 px není vodorovný posuv.
import {
  kontext, konec, tvrdi, otevri, dokud, dotazyNa, fixtura,
} from './k68-spolecne.mjs';

const CLIENT = (tab) => `/employer/overview?mode=client&tab=${tab}`;
const CLENOVE = [
  { id: 101, name: 'Jana Dvořáková', email: 'jana@example.cz', phone: '+420777123456', points: 320, stamps: 4, visits: 12, spend: 3400, level: 'silver', level_label: 'Stříbrný', discount: 0, joined_at: '2026-01-05 10:00:00', last_visit_at: '2026-09-30 12:00:00', reservations: 1, open_coupons: 0, blocked: false, note: null, novinky: true },
  { id: 102, name: 'Petr Svoboda', email: 'petr@example.cz', phone: null, points: 80, stamps: 1, visits: 3, spend: 0, level: 'bronze', level_label: 'Člen', discount: 0, joined_at: '2026-06-01 10:00:00', last_visit_at: null, reservations: 0, open_coupons: 1, blocked: false, note: 'Alergie na ořechy', novinky: false },
];

const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (path === '/api/client/admin/customers' && m === 'GET') {
    if (url.searchParams.get('duplicity') === '1') {
      return json({ celkem: 1, skupiny: [{ duvod: 'telefon', clenove: [
        { id: 101, name: 'Jana Dvořáková', email: 'jana@example.cz', phone: '+420777123456', points: 320, visits: 12, joined_at: '2026-01-05 10:00:00', last_visit_at: '2026-09-30 12:00:00' },
        { id: 103, name: 'J. Dvořáková', email: 'j.d@example.cz', phone: '777 123 456', points: 20, visits: 1, joined_at: '2026-08-05 10:00:00', last_visit_at: null },
      ] }] });
    }
    if (url.searchParams.get('format') === 'ids') return json({ ids: CLENOVE.map(c => c.id), total: CLENOVE.length });
    return json({ customers: CLENOVE, total: CLENOVE.length, strana: 1, naStranu: 50 });
  }
  if (path === '/api/client/admin/customers' && m === 'PATCH') { (stav.patche ??= []).push(req.postDataJSON()); return json({ ok: true, blocked: true, note: null }); }
  if (path === '/api/client/admin/customers/hromadne') { (stav.hromadne ??= []).push(req.postDataJSON()); return json({ ok: true, zmeneno: 2, uzBylo: 0 }); }
  if (path === '/api/client/admin/customers/sloucit') { (stav.slouceni ??= []).push(req.postDataJSON()); return json({ ok: true, body: 340, navstev: 13, presunuto: { denik: 2, kupony: 0 } }); }
  if (path === '/api/client/admin/groups' && m === 'GET') {
    return json({ groups: [{ id: 5, name: 'Stálí hosté', members: 3, rule: null, archived: false, description: 'Chodí denně', color: '2', discount_pct: 0, rule_popis: null }], memberIds: [], customerGroupIds: [] });
  }
  if (path === '/api/client/admin/broadcast' && m === 'GET') {
    if (url.searchParams.get('nahled') === '1') return json({ dosah: { publikum: 2, push: 1, email: 1, nikdo: 0, bezSouhlasu: 1, bezEmailu: 0, emailVypnuty: 0, blokovanych: 0 }, label: 'všem členům' });
    return json({ history: [], members: 2, segments: {}, silver: 1, gold: 0, platinum: null, groups: [{ id: 5, name: 'Stálí hosté', members: 3, dynamic: false }], kupony: [{ id: 9, title: 'Čaj zdarma' }], promo: [{ code: 'JARO25', title: 'Jarní akce' }] });
  }
  if (path === '/api/client/admin/broadcast' && m === 'POST') { (stav.zpravy ??= []).push(req.postDataJSON()); return json(req.postDataJSON().akce === 'test' ? { ok: true, push: false, email: { sent: true, error: null }, adresa: 'ja@example.cz' } : { ok: true, broadcast: { recipients: 2 } }); }
  if (path === '/api/client/admin/automatizace' && m === 'GET') {
    const def = (druh, cfg) => ({ druh, enabled: false, config: cfg, enabled_at: null });
    return json({
      pravidla: [
        def('uvitani', { kroky: [{ dny: 0, title: 'Vítej v {podnik}, {jmeno}', body: 'Ukaž kartičku u kasy.', kuponId: null }] }),
        def('prvni_navsteva', { title: 'Díky za návštěvu, {jmeno}', body: '', kuponId: null }),
        def('dokoncena_karta', { title: 'Karta je plná, {jmeno}', body: '', kuponId: null }),
        def('narozeniny_kupon', { title: 'Všechno nejlepší, {jmeno}!', body: '', kuponId: null, body_bodu: 0 }),
        def('chybis_nam', { title: 'Chybíš nám, {jmeno}', body: 'Už je to {dny}.', kuponId: null, dny: 30, body_bodu: 0 }),
      ],
      pocty: {}, log: [], kupony: [{ id: 9, title: 'Čaj zdarma' }], muzePravidla: true,
    });
  }
  if (path === '/api/client/admin/automatizace' && m === 'PUT') { (stav.automatizace ??= []).push(req.postDataJSON()); return json({ ok: true, pravidlo: {} }); }
  if (path === '/api/client/admin/customers/historie') return json({ clen: { points: 320, stamps: 4, visits: 12, spend: 3400, credit: 0, joined_at: '2026-01-05 10:00:00', last_visit_at: '2026-09-30 12:00:00', blocked: false, note: null }, uroven: { id: 'silver', label: 'Stříbrný', discount: 0, nextAt: 25, nextLabel: 'Zlatý', unit: 'visits' }, pocty: { navstevy: 12, body: 4, utraty: 3, kupony: 1, uplatnene: 0, objednavky: 0, poukazy: 0 }, kampane: [] });
  return undefined;
};

const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

{
  const { ctx, p, stav, chyby } = await kontext({ fix: fixtura('k69-b8-rozlozeni-zakaznici'), dalsi: podvrh });
  await otevri(p, CLIENT('customers'), 'vedeni.klient_zakaznici');
  const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
  await nastroj.getByText('Jana Dvořáková').first().waitFor({ timeout: 8000 });
  tvrdi('C1: telefon je v řádku člena česky s mezerami', await nastroj.getByText('+420 777 123 456').count() > 0);
  tvrdi('C1: poznámka se v seznamu ukáže štítkem', await nastroj.getByText('Poznámka', { exact: true }).count() > 0);
  await nastroj.getByLabel('Hledat zákazníka').fill('jana');
  tvrdi('C2: hledání jde na server (q=jana)', await dokud(() => dotazyNa(stav, ['/api/client/admin/customers']).some(d => d.u.includes('q=jana')), 2500));
  await nastroj.getByLabel('Řazení členů').selectOption('body');
  tvrdi('C3: řazení jde na server (sort=body)', await dokud(() => dotazyNa(stav, ['/api/client/admin/customers']).some(d => d.u.includes('sort=body')), 2500));
  await nastroj.getByRole('button', { name: /Filtry/ }).click();
  await nastroj.getByLabel('Úroveň').selectOption('silver');
  tvrdi('C4: filtr úrovně jde na server (uroven=silver)', await dokud(() => dotazyNa(stav, ['/api/client/admin/customers']).some(d => d.u.includes('uroven=silver')), 2500));
  await nastroj.getByRole('button', { name: 'Zrušit hledání a filtry' }).click();

  // Výběr a hromadné přidání do skupiny.
  await nastroj.getByRole('button', { name: 'Vybrat', exact: true }).click();
  await nastroj.getByRole('checkbox', { name: 'Vybrat Jana Dvořáková' }).click();
  await nastroj.getByRole('checkbox', { name: 'Vybrat Petr Svoboda' }).click();
  await p.getByRole('button', { name: 'Do skupiny' }).click();
  const okno = p.getByRole('dialog', { name: /Přidat do skupiny/ });
  await okno.getByLabel('Skupina').selectOption('5');
  await okno.getByRole('button', { name: 'Přidat', exact: true }).click();
  tvrdi('C5: hromadné přidání pošle POST se skupinou a oběma id', await dokud(() => (stav.hromadne ?? []).some(h => h.akce === 'skupina_pridat' && h.skupina === 5 && h.ids?.length === 2), 2500), JSON.stringify(stav.hromadne));

  // Duplicity a sloučení s potvrzením.
  await nastroj.getByRole('button', { name: 'Duplicity' }).click();
  const dup = p.getByRole('dialog', { name: 'Duplicitní členové' });
  tvrdi('C6: duplicity ukážou důvod a obě jména', await dokud(() => dup.getByText('Stejný telefon').isVisible(), 2500) && await dup.getByText('J. Dvořáková').count() > 0);
  await dup.getByRole('button', { name: /Sloučit J\. Dvořáková do Jana Dvořáková/ }).click();
  const pot = p.getByRole('dialog', { name: 'Sloučit členy?' });
  tvrdi('C6: sloučení se nejdřív potvrdí a řekne, že to nejde vrátit', await dokud(() => pot.isVisible(), 1500) && /nejde/.test(await pot.innerText()));
  await pot.getByRole('button', { name: 'Sloučit', exact: true }).click();
  tvrdi('C6: …a pošle POST { hlavniId: 101, duplicitaId: 103 }', await dokud(() => (stav.slouceni ?? []).some(s => s.hlavniId === 101 && s.duplicitaId === 103), 2500), JSON.stringify(stav.slouceni));
  await dup.getByRole('button', { name: 'Hotovo' }).click();

  // Blokace člena se potvrdí.
  await nastroj.getByRole('button', { name: 'Hotovo', exact: true }).click();
  await nastroj.getByRole('button', { name: 'Deník' }).first().click();
  await nastroj.getByRole('button', { name: 'Zablokovat' }).first().click();
  const blok = p.getByRole('dialog', { name: /Zablokovat/ });
  tvrdi('C7: blokace se nejdřív potvrdí v okně', await dokud(() => blok.isVisible(), 1500));
  await blok.getByRole('button', { name: 'Zablokovat', exact: true }).click();
  tvrdi('C7: …a pošle PATCH { blocked: true }', await dokud(() => (stav.patche ?? []).some(x => x.blocked === true), 2500), JSON.stringify(stav.patche));
  tvrdi('C: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

{
  const { ctx, p, stav, chyby } = await kontext({ fix: fixtura('k69-b8-rozlozeni-zakaznici'), dalsi: podvrh });
  await otevri(p, CLIENT('customers'), 'vedeni.klient_zakaznici');
  const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Zprávy členům' }).click();
  await nastroj.getByLabel('Nadpis').waitFor({ timeout: 8000 });
  await nastroj.getByLabel('Nadpis').fill('Jarní nabídka');
  await nastroj.getByRole('tab', { name: 'E-mail', exact: true }).click().catch(async () => { await nastroj.getByRole('button', { name: 'E-mail', exact: true }).click(); });
  tvrdi('Z1: náhled ukáže e-mail s odhlášením', await dokud(() => nastroj.getByText('Odhlásit se z e-mailů').first().isVisible(), 2500));
  tvrdi('Z1: dosah řekne, kolik lidí e-mail dostane', await dokud(async () => /e-mail dostane 1 člen/.test(await nastroj.innerText()), 2500));
  await nastroj.getByRole('button', { name: 'Poslat zkoušku sobě' }).click();
  tvrdi('Z2: zkouška sobě pošle POST s akcí test', await dokud(() => (stav.zpravy ?? []).some(z => z.akce === 'test' && z.channels === 'email'), 2500), JSON.stringify(stav.zpravy));
  await nastroj.getByLabel('Přiložit kupon').selectOption('9');
  await nastroj.getByRole('button', { name: /^Poslat / }).first().click();
  const potvrdit = p.getByRole('dialog', { name: 'Poslat zprávu?' });
  tvrdi('Z3: odeslání se potvrdí a zopakuje dosah', await dokud(() => potvrdit.isVisible(), 1500) && /Čaj zdarma/.test(await potvrdit.innerText()));
  await potvrdit.getByRole('button', { name: 'Poslat', exact: true }).click();
  tvrdi('Z3: …a pošle POST s kanálem e-mail a kuponem', await dokud(() => (stav.zpravy ?? []).some(z => !z.akce && z.channels === 'email' && Number(z.couponId) === 9), 2500), JSON.stringify(stav.zpravy));
  tvrdi('Z: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

{
  const { ctx, p, stav, chyby } = await kontext({ fix: fixtura('k69-b8-rozlozeni-zakaznici'), dalsi: podvrh });
  await otevri(p, CLIENT('customers'), 'vedeni.klient_zakaznici');
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Automatizace' }).click();
  const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
  tvrdi('A1: je vidět všech pět pravidel', await dokud(async () => {
    const t = await nastroj.innerText();
    return ['Uvítací série', 'Po první návštěvě', 'Po dokončení karty', 'Narozeninový kupon', 'Chybíš nám'].every(x => t.includes(x));
  }, 5000));
  await nastroj.getByRole('switch').first().click();
  tvrdi('A2: zapnutí uvítací série pošle PUT s druhem uvitani a enabled', await dokud(() => (stav.automatizace ?? []).some(a => a.druh === 'uvitani' && a.enabled === true), 2500), JSON.stringify(stav.automatizace));
  tvrdi('A3: náhled ukáže jméno a podnik dosazené do textu', /Vítej v .+, Jana/.test(await nastroj.innerText()));
  tvrdi('A: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

{
  const { ctx, p } = await kontext({ fix: fixtura('k69-b8-rozlozeni-zakaznici'), dalsi: podvrh, viewport: { width: 390, height: 844 }, mobil: true });
  await otevri(p, CLIENT('customers'), 'vedeni.klient_zakaznici');
  await p.locator('[data-plocha] li[data-widget="nastroj"]').getByText('Jana Dvořáková').first().waitFor({ timeout: 8000 });
  tvrdi('M1: členové na 390 px bez vodorovného posuvu', await bezPreteceni(p));
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Zprávy členům' }).click();
  await p.getByLabel('Nadpis').first().waitFor({ timeout: 8000 });
  tvrdi('M2: zprávy na 390 px bez vodorovného posuvu', await bezPreteceni(p));
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Automatizace' }).click();
  await p.getByText('Uvítací série').first().waitFor({ timeout: 8000 });
  tvrdi('M3: automatizace na 390 px bez vodorovného posuvu', await bezPreteceni(p));
  await ctx.close();
}

await konec();
