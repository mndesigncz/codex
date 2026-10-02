// Kolo 81 — doplňky členů, skupin, zpráv a automatizací v prohlížeči (ruční sonda, v MIMO ve spust.mjs;
// spouští se `node scripts/sondy/k81-clenove-zpravy.mjs` proti `next start -p 3000`). Filtry, výběr, hromadné akce,
// poznámky a základní zprávy hlídá k81-clenove.mjs; tahle sonda hlídá, co přibylo z okruhu G a Z:
// duplicity a jejich sloučení s potvrzením, blokace a odebrání člena s potvrzením, celá historie člena,
// kupon vybraným členům, přidání do skupiny z CSV a archiv skupin, zprávy e-mailem (kanál, dosah, náhled
// s odhlášením, zkouška sobě, kombinace podmínek) a automatizace zapínané zvlášť; na 390 px bez vodorovného posuvu.
import {
  kontext, konec, tvrdi, otevri, dokud, fixtura,
} from './k68-spolecne.mjs';

const CLIENT = (tab) => `/employer/overview?mode=client&tab=${tab}`;
const CLENOVE = [
  { id: 101, name: 'Jana Dvořáková', email: 'jana@example.cz', points: 320, stamps: 4, visits: 12, spend: 3400, credit: 0, level: 'silver', level_label: 'Stříbrný', discount: 0, joined_at: '2026-01-05 10:00:00', last_visit_at: '2026-09-30 12:00:00', reservations: 1, open_coupons: 0, blocked: false, skupiny: [] },
  { id: 102, name: 'Petr Svoboda', email: 'petr@example.cz', points: 80, stamps: 1, visits: 3, spend: 0, credit: 0, level: 'bronze', level_label: 'Člen', discount: 0, joined_at: '2026-06-01 10:00:00', last_visit_at: null, reservations: 0, open_coupons: 1, blocked: false, skupiny: [] },
];
const DOSAH = { publikum: 2, push: 1, email: 1, nikdo: 0, bezSouhlasu: 1, bezEmailu: 0, emailVypnuty: 0, blokovanych: 0 };

const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  stav.z ??= { patch: [], del: [], slouceni: [], coupon: [], skupiny: [], import: [], zpravy: [], automatizace: [] };
  const z = stav.z;
  if (path === '/api/client/admin/customers' && m === 'GET') {
    if (url.searchParams.get('duplicity') === '1') {
      return json({ celkem: 1, skupiny: [{ duvod: 'telefon', clenove: [
        { id: 101, name: 'Jana Dvořáková', email: 'jana@example.cz', phone: '+420777123456', points: 320, visits: 12, joined_at: '2026-01-05 10:00:00', last_visit_at: '2026-09-30 12:00:00' },
        { id: 103, name: 'J. Dvořáková', email: 'j.d@example.cz', phone: '777 123 456', points: 20, visits: 1, joined_at: '2026-08-05 10:00:00', last_visit_at: null },
      ] }] });
    }
    return json({ customers: CLENOVE, total: CLENOVE.length, all: CLENOVE.length, hasMore: false, nextOffset: null });
  }
  if (path === '/api/client/admin/customers' && m === 'PATCH') { z.patch.push(req.postDataJSON()); return json({ ok: true, blocked: true }); }
  if (path === '/api/client/admin/customers' && m === 'DELETE') { z.del.push(url.search); return json({ ok: true, name: 'Jana Dvořáková', body: 320 }); }
  if (path === '/api/client/admin/customers/sloucit') { z.slouceni.push(req.postDataJSON()); return json({ ok: true, body: 340, navstev: 13, presunuto: { denik: 2, kupony: 0 } }); }
  if (path === '/api/client/admin/customers/historie') {
    if (url.searchParams.get('sekce')) return json({ polozky: [{ at: '2026-09-30 12:00:00', note: 'Návštěva u kasy' }], dalsi: false, offset: 1 });
    return json({ clen: { points: 320, stamps: 4, visits: 12, spend: 3400, credit: 0, joined_at: '2026-01-05 10:00:00', last_visit_at: '2026-09-30 12:00:00', blocked: false }, uroven: { id: 'silver', label: 'Stříbrný', discount: 0, nextAt: 25, nextLabel: 'Zlatý', unit: 'visits' }, pocty: { navstevy: 12, body: 4, utraty: 3, kupony: 1, uplatnene: 0, objednavky: 0, poukazy: 0 }, kampane: [] });
  }
  if (path === '/api/client/admin/groups') {
    if (m === 'GET') return json({ groups: [
      { id: 5, name: 'Stálí hosté', description: 'Chodí denně', color: '2', discount_pct: 0, members: 3, rules: null, dynamic: false, archived: false },
      { id: 6, name: 'Stará akce', description: null, color: null, discount_pct: 0, members: 1, rules: null, dynamic: false, archived: true },
    ], memberIds: [], customerGroupIds: [] });
    z.skupiny.push({ m, ...(req.postDataJSON() ?? {}) });
    return json({ ok: true });
  }
  if (path === '/api/client/admin/groups/import') {
    const b = req.postDataJSON(); z.import.push(b);
    return json({ ok: true, potvrzeno: b.potvrdit === true, nalezeno: 1, pridano: b.potvrdit ? 1 : 0, uBylo: b.potvrdit ? 0 : null, nenalezeno: [{ radek: 3, hodnota: 'nezname@x.cz', duvod: 'Není členem podniku.' }], nenalezenoCelkem: 1, prazdnych: 0, zkraceno: false, ukazka: [{ name: 'Jana Dvořáková', podle: 'email' }] });
  }
  if (path === '/api/client/admin/coupons' && m === 'GET') return json({ coupons: [{ id: 9, title: 'Čaj zdarma', draft: false, archived: false, active: true, stav: 'aktivni' }], groups: [] });
  if (path === '/api/client/admin/coupons/send') {
    const b = req.postDataJSON(); z.coupon.push(b);
    return json({ ok: true, zkouska: b.zkouska === true, poslano: 2, celkem: 2, preskoceno: { drzi: 0, limit: 0, neplnolety: 0, kusy: 0 } });
  }
  if (path === '/api/client/admin/notes') return json({ notes: [] });
  if (path === '/api/client/admin/stamps/member') return json({ karty: [], udalosti: [] });
  if (path === '/api/client/admin/loyalty') return json({ ledger: [], claims: [], vouchers: [], orders: [], kampane: [], uroven: { id: 'silver', label: 'Stříbrný', unit: 'visits', nextAt: 25, nextLabel: 'Zlatý host' }, clen: { points: 320, stamps: 4, visits: 12, spend: 3400, credit: 0, joined_at: '2026-01-05 10:00:00', last_visit_at: '2026-09-30 12:00:00' } });
  if (path === '/api/client/admin/broadcast') {
    if (m === 'GET') {
      if (url.searchParams.get('dosah')) return json({ pocet: 2, souhlas: DOSAH.push, dosah: { ...DOSAH, email: url.searchParams.get('kanal') === 'push' ? 0 : 1 } });
      return json({
        history: [{ id: 31, title: 'Jarní čaj', body: 'Ochutnávka', audience: 'all', status: 'sent', sent_at: '2026-09-20 10:00:00', recipients: 2, muted: 1, channels: 'push+email', email_total: 2, email_pos: 2, email_sent: 1, email_failed: 1, visits_after: 4, visits_before: 2, still_running: false, link_kind: 'page' }],
        members: 2, segments: { quiet: 1, 'quiet:60': 1, 'birthday:month': 0 }, quiet: 1, silver: 1, gold: 0, platinum: null,
        groups: [{ id: 5, name: 'Stálí hosté', members: 3, archived: false }], limit: { odeslano: 1, max: 5 },
        prilohy: { kupony: [{ id: 9, title: 'Čaj zdarma' }], promoKody: [] }, slug: 'kavarna', nazevPodniku: 'Čajovna U Lípy',
      });
    }
    const b = req.postDataJSON(); z.zpravy.push({ m, ...b });
    if (b.action === 'test') return json({ ok: true, test: true, push: false, email: { sent: true, error: null }, adresa: 'ja@example.cz' });
    return json({ ok: true, broadcast: { id: 40, email_total: 1 }, doruceno: 2, ztlumeno: 0 });
  }
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
  if (path === '/api/client/admin/automatizace' && m === 'PUT') { z.automatizace.push(req.postDataJSON()); return json({ ok: true, pravidlo: {} }); }
  return undefined;
};

const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function behy(viewport, mobil) {
  const jmeno = `${viewport.width}px`;

  // ---- členové: duplicity, blokace, odebrání, historie, kupon vybraným ----
  {
    const { ctx, p, stav, chyby } = await kontext({ viewport, mobil, fix: fixtura('k69-b8-rozlozeni-zakaznici'), dalsi: podvrh });
    await otevri(p, CLIENT('customers'), 'vedeni.klient_zakaznici');
    await p.getByRole('checkbox', { name: 'Vybrat: Jana Dvořáková' }).waitFor({ timeout: 10000 });
    await p.getByRole('button', { name: 'Duplicity' }).click();
    const dup = p.getByRole('dialog', { name: 'Duplicitní členové' });
    tvrdi(`${jmeno} duplicity: ukážou důvod a obě jména`, await dokud(() => dup.getByText('Stejný telefon').isVisible(), 3000) && await dup.getByText('J. Dvořáková').count() > 0);
    await dup.getByRole('button', { name: /Sloučit J\. Dvořáková do Jana Dvořáková/ }).click();
    const pot = p.getByRole('dialog', { name: 'Sloučit členy?' });
    tvrdi(`${jmeno} duplicity: sloučení se nejdřív potvrdí a řekne, že to nejde vrátit`, await dokud(() => pot.isVisible(), 1500) && /nejde/.test(await pot.innerText()));
    await pot.getByRole('button', { name: 'Sloučit', exact: true }).click();
    tvrdi(`${jmeno} duplicity: pošle POST { hlavniId: 101, duplicitaId: 103 }`, await dokud(() => stav.z.slouceni.some(s => s.hlavniId === 101 && s.duplicitaId === 103), 2500), JSON.stringify(stav.z.slouceni));
    await dup.getByRole('button', { name: 'Hotovo' }).click();

    await p.getByRole('button', { name: 'Deník' }).first().click();
    await p.getByRole('button', { name: 'Zablokovat' }).first().click();
    const blok = p.getByRole('dialog', { name: /Zablokovat/ });
    tvrdi(`${jmeno} blokace: nejdřív potvrzení v okně`, await dokud(() => blok.isVisible(), 1500));
    await blok.getByRole('button', { name: 'Zablokovat', exact: true }).click();
    tvrdi(`${jmeno} blokace: pošle PATCH { blocked: true }`, await dokud(() => stav.z.patch.some(x => x.blocked === true && x.id === 101), 2500), JSON.stringify(stav.z.patch));
    // Po blokaci se detail zavře a seznam načte znovu; teprve potom jde otevřít další (jinak by „Deník“ trefil jiný řádek).
    await p.getByRole('button', { name: 'Skrýt', exact: true }).waitFor({ state: 'detached', timeout: 4000 });
    await p.getByRole('button', { name: 'Deník' }).first().click();
    await p.getByRole('button', { name: 'Odebrat z klubu' }).first().click();
    const smaz = p.getByRole('dialog', { name: /Odebrat .* z klubu/ });
    tvrdi(`${jmeno} odebrání: okno řekne, že to nejde vzít zpět`, await dokud(() => smaz.isVisible(), 1500) && /nejde/.test(await smaz.innerText()));
    await smaz.getByRole('button', { name: 'Odebrat z klubu', exact: true }).click();
    tvrdi(`${jmeno} odebrání: pošle DELETE s id člena`, await dokud(() => stav.z.del.some(d => /id=101/.test(d)), 2500), JSON.stringify(stav.z.del));

    await p.getByRole('button', { name: 'Skrýt', exact: true }).waitFor({ state: 'detached', timeout: 4000 });
    await p.getByRole('button', { name: 'Deník' }).first().click();
    await p.getByRole('button', { name: 'Celá historie' }).first().click();
    tvrdi(`${jmeno} historie: přehled i část Návštěvy se načtou`, await dokud(async () => (await p.getByRole('tab', { name: 'Návštěvy' }).count()) > 0, 3000));
    await p.getByRole('tab', { name: 'Návštěvy' }).first().click();
    tvrdi(`${jmeno} historie: ukáže návštěvu u kasy`, await dokud(() => p.getByText('Návštěva u kasy').first().isVisible(), 3000));

    // Kupon vybraným.
    await p.getByRole('checkbox', { name: 'Vybrat: Jana Dvořáková' }).click();
    await p.getByRole('checkbox', { name: 'Vybrat: Petr Svoboda' }).click();
    await p.getByRole('button', { name: 'Kupon', exact: true }).click();
    const kv = p.getByRole('dialog', { name: 'Poslat kupon vybraným' });
    await kv.getByLabel('Který kupon').waitFor({ timeout: 4000 });
    await kv.getByRole('button', { name: 'Pokračovat' }).click();
    const odesl = p.getByRole('dialog', { name: /Poslat „Čaj zdarma"/ });
    tvrdi(`${jmeno} kupon vybraným: okno posílání ukáže vybrané hosty a zkouška říká, kolik jich kupon dostane`, await dokud(async () => /dostanou\s+2\s+hosté|dostane\s+2/.test(await odesl.innerText()) || /Vybral/.test(await odesl.innerText()) || /vybral/.test(await odesl.innerText()), 4000), (await odesl.innerText()).slice(0, 300));
    tvrdi(`${jmeno} kupon vybraným: zkouška šla s hosty z výběru`, await dokud(() => stav.z.coupon.some(c => c.zkouska === true && c.publikum?.druh === 'hoste' && c.publikum.hostIds?.length === 2), 3000), JSON.stringify(stav.z.coupon));
    await odesl.getByRole('button', { name: /^Poslat/ }).click();
    tvrdi(`${jmeno} kupon vybraným: odeslání pošle POST s kuponem 9 a hosty 101, 102`, await dokud(() => stav.z.coupon.some(c => !c.zkouska && c.id === 9 && c.publikum?.hostIds?.join() === '101,102'), 3000), JSON.stringify(stav.z.coupon));
    tvrdi(`${jmeno}: bez vodorovného scrollu (členové)`, await bezPreteceni(p));
    tvrdi(`${jmeno}: bez chyb v konzoli (členové)`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---- skupiny: archiv a přidání z CSV ----
  {
    const { ctx, p, stav, chyby } = await kontext({ viewport, mobil, fix: fixtura('k69-b8-rozlozeni-vernost'), dalsi: podvrh });
    await otevri(p, CLIENT('loyalty'), 'vedeni.klient_vernost');
    await p.locator('[data-plocha]').getByRole('tab', { name: 'Body a úrovně' }).click();
    await p.getByText('Skupiny hostů', { exact: true }).waitFor({ timeout: 8000 });
    await p.getByText('Stálí hosté').first().waitFor({ timeout: 8000 });
    tvrdi(`${jmeno} skupiny: archivovaná skupina je schovaná`, await p.getByText('Stará akce').count() === 0);
    await p.getByRole('button', { name: 'Ukázat archiv' }).click();
    tvrdi(`${jmeno} skupiny: „Ukázat archiv“ ji ukáže s označením`, await p.getByText('Stará akce').count() === 1 && await p.getByText('Archiv', { exact: true }).count() >= 1);
    await p.getByRole('button', { name: 'Archivovat skupinu Stálí hosté' }).click();
    tvrdi(`${jmeno} skupiny: archivace pošle PATCH { id: 5, archived: true }`, await dokud(() => stav.z.skupiny.some(g => g.m === 'PATCH' && g.id === 5 && g.archived === true), 2500), JSON.stringify(stav.z.skupiny));
    await p.getByRole('button', { name: 'Přidat členy z CSV do skupiny Stálí hosté' }).click();
    const imp = p.getByRole('dialog', { name: /Přidat členy do skupiny/ });
    await imp.getByLabel('Seznam nebo obsah CSV').fill('jana@example.cz\nnezname@x.cz');
    await imp.getByRole('button', { name: 'Zkontrolovat' }).click();
    tvrdi(`${jmeno} CSV: náhled ukáže nalezené i nenalezené a nic nezapíše`, await dokud(async () => /Nalezeno 1 člen/.test(await imp.innerText()) && /nezname@x\.cz/.test(await imp.innerText()), 3000) && stav.z.import.every(i => i.potvrdit === false));
    await imp.getByRole('button', { name: /^Přidat 1 člena|^Přidat 1 člen/ }).click();
    tvrdi(`${jmeno} CSV: potvrzení pošle POST se skupinou a potvrdit: true`, await dokud(() => stav.z.import.some(i => i.skupina === 5 && i.potvrdit === true), 3000), JSON.stringify(stav.z.import));
    tvrdi(`${jmeno}: bez vodorovného scrollu (skupiny)`, await bezPreteceni(p));
    tvrdi(`${jmeno}: bez chyb v konzoli (skupiny)`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---- zprávy e-mailem a automatizace ----
  {
    const { ctx, p, stav, chyby } = await kontext({ viewport, mobil, fix: fixtura('k69-b8-rozlozeni-zakaznici'), dalsi: podvrh });
    await otevri(p, CLIENT('customers'), 'vedeni.klient_zakaznici');
    await p.locator('[data-plocha]').getByRole('tab', { name: 'Zprávy členům' }).click();
    await p.locator('#bc-title').waitFor({ timeout: 8000 });
    await p.locator('#bc-title').fill('Jarní nabídka');
    await p.getByRole('tab', { name: 'E-mail', exact: true }).click();
    tvrdi(`${jmeno} zprávy: náhled ukáže e-mail s odhlášením`, await dokud(() => p.getByText('Odhlásit se z e-mailů').first().isVisible(), 2500));
    tvrdi(`${jmeno} zprávy: dosah řekne, kolik lidí e-mail dostane`, await dokud(async () => /e-mail dostane 1 člen/.test(await p.locator('[data-plocha]').innerText()), 2500));
    tvrdi(`${jmeno} zprávy: dosah se ptá serveru na zvolený kanál`, stav.dotazy.some(d => /broadcast\?dosah=all&kanal=email/.test(d.u)));
    await p.getByRole('button', { name: 'Poslat zkušebně sobě' }).click();
    tvrdi(`${jmeno} zprávy: zkouška sobě pošle action test s kanálem e-mail`, await dokud(() => stav.z.zpravy.some(x => x.action === 'test' && x.channels === 'email'), 2500), JSON.stringify(stav.z.zpravy));
    await p.getByText(/e-mailem na ja@example\.cz/).first().waitFor({ timeout: 3000 });
    await p.locator('#bc-aud').selectOption('__mix__');
    tvrdi(`${jmeno} zprávy: kombinace podmínek se nabízí jako vlastní výběr`, await dokud(async () => (await p.locator('[data-plocha]').innerText()).includes('A zároveň') || (await p.locator('[data-plocha]').innerText()).includes('Vyber'), 2500));
    await p.locator('#bc-aud').selectOption('all');
    await p.getByRole('button', { name: /^Poslat / }).first().click();
    const potvrdit = p.getByRole('dialog', { name: 'Poslat zprávu?' });
    tvrdi(`${jmeno} zprávy: odeslání se potvrdí`, await dokud(() => potvrdit.isVisible(), 1500));
    await potvrdit.getByRole('button', { name: 'Poslat', exact: true }).click();
    tvrdi(`${jmeno} zprávy: POST nese kanál e-mail`, await dokud(() => stav.z.zpravy.some(x => !x.action && x.channels === 'email' && x.title === 'Jarní nabídka'), 2500), JSON.stringify(stav.z.zpravy));
    tvrdi(`${jmeno} zprávy: historie ukáže stav e-mailů (1 odesláno, 1 se nepodařilo)`, await p.getByText(/1 e-mail odesláno, 1 e-mail se nepodařilo/).count() >= 1);
    tvrdi(`${jmeno}: bez vodorovného scrollu (zprávy)`, await bezPreteceni(p));

    await p.locator('[data-plocha]').getByRole('tab', { name: 'Automatizace' }).click();
    const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
    tvrdi(`${jmeno} automatizace: je vidět všech pět pravidel`, await dokud(async () => {
      const t = await nastroj.innerText();
      return ['Uvítací série', 'Po první návštěvě', 'Po dokončení karty', 'Narozeninový kupon', 'Chybíš nám'].every(x => t.includes(x));
    }, 5000));
    await nastroj.getByRole('switch').first().click();
    tvrdi(`${jmeno} automatizace: zapnutí uvítací série pošle PUT s druhem uvitani`, await dokud(() => stav.z.automatizace.some(a => a.druh === 'uvitani' && a.enabled === true), 2500), JSON.stringify(stav.z.automatizace));
    tvrdi(`${jmeno} automatizace: náhled ukáže jméno a podnik dosazené do textu`, /Vítej v .+, Jana/.test(await nastroj.innerText()));
    tvrdi(`${jmeno}: bez vodorovného scrollu (automatizace)`, await bezPreteceni(p));
    tvrdi(`${jmeno}: bez chyb v konzoli (zprávy)`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
    await ctx.close();
  }
}

await behy({ width: 390, height: 844 }, true);
await behy({ width: 1280, height: 900 }, false);
await konec();
