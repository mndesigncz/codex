// W2 — Body, úrovně, cashback a přehledy ve Věrnosti.
//
// Hlídá, co se dalo vidět a použít: náhled „kolik host dostane z účtu" ze zadaných pravidel
// (zaokrouhlení, minimum, strop, kredit/poukaz), kontrolu pravidel PŘED odesláním (zlato musí být
// nad stříbrem, žádný PUT na server), nová pole v uloženém požadavku, úpravu kreditu v okně člena
// (kontrola zůstatku, náhled „po úpravě", POST s what: credit), přehledy (závazek, zdroje bodů,
// top hosté, export CSV za období) a telefon 390 px bez vodorovného posunu.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, DIR } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const dnes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());

const PREHLED = {
  obdobi: { od: dnes, do: dnes },
  zavazek: { members: 148, points: 18420, credit: 3150, membersWithPoints: 120, membersWithCredit: 31, pointValue: 0.5, pointsValue: 9210 },
  zdroje: [
    { id: 'utrata', label: 'Útrata u kasy a z účtenek', given: 1800, spent: 0, n: 90 },
    { id: 'objednavky', label: 'Objednávky z aplikace', given: 510, spent: 0, n: 22 },
    { id: 'kupony', label: 'Kupony za body', given: 0, spent: 1180, n: 9 },
  ],
  top: [
    { id: 101, name: 'Jana Dvořáková', points: 320, credit: 150, visits: 18, spend: 8200, lastVisitAt: null },
    { id: 102, name: 'Petr Novák', points: 140, credit: 0, visits: 7, spend: 2100, lastVisitAt: null },
  ],
};

const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (path === '/api/client/admin/profile' && m === 'PUT') { (stav.profilPuty ??= []).push(req.postDataJSON()); return json({ ok: true, profile: { ...nacti('client_admin_profile').profile, ...req.postDataJSON() } }); }
  if (path === '/api/client/admin/loyalty/prehled') { (stav.prehledy ??= []).push(url.search); return json(PREHLED); }
  if (path === '/api/client/admin/loyalty/export') { (stav.exporty ??= []).push(url.search); return json({ ok: true }); }
  if (path === '/api/client/admin/loyalty' && m === 'POST') { (stav.body ??= []).push(req.postDataJSON()); return json({ ok: true, points: 370, credit: 200 }); }
  if (path === '/api/client/admin/customers') {
    const d = nacti('client_admin_customers');
    d.customers = d.customers.map(c => (c.id === 101 ? { ...c, credit: 150 } : c));
    return json(d);
  }
  if (path === '/api/menu' && m === 'GET') return json({ boards: [{ id: 1, name: 'Nápoje', sections: [{ id: 1, items: [{ id: 11, name: 'Dárková karta', posProductId: 'p1' }, { id: 12, name: 'Espresso', posProductId: 'p2' }] }] }] });
  if (path === '/api/pos/places') return json({ places: [] });
  return undefined;
};

const CLIENT = (tab) => `/employer/overview?mode=client&tab=${tab}`;
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const nastroj = (p) => p.locator('[data-plocha] li[data-widget="nastroj"]');

// ---------------------------------------------------------------------------
// Body a úrovně: náhled, kontrola před uložením, nová pole
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ fix: nacti('k69-b8-rozlozeni-vernost'), dalsi: podvrh });
  await otevri(p, CLIENT('loyalty'), 'vedeni.klient_vernost');
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Body a úrovně' }).click();
  const n = nastroj(p);
  await n.getByText('Náhled: kolik host dostane z účtu').waitFor({ timeout: 8000 });
  const nahled = n.locator('[aria-labelledby="b-nahled"]');
  tvrdi('B1: náhled z výchozího pravidla: 250 při 10 b./100 za celé stovky = 20 b.', /20\s*b\./.test(await nahled.innerText()), (await nahled.innerText()).replace(/\n/g, ' | '));
  await n.getByRole('tab', { name: 'Poměrně, na nejbližší' }).click();
  tvrdi('B2: poměrně na nejbližší = 25 b.', await dokud(async () => /25\s*b\./.test(await nahled.innerText()), 1500));
  await n.getByLabel(/Nejvíc bodů z jedné účtenky/).fill('10');
  tvrdi('B3: strop 10 b. — náhled ořízne a řekne proč', await dokud(async () => { const t = await nahled.innerText(); return /10\s*b\./.test(t) && /strop 10 b\./.test(t); }, 1500), (await nahled.innerText()).replace(/\n/g, ' | '));
  await n.getByLabel(/Nejvíc bodů z jedné účtenky/).fill('0');
  await n.getByLabel(/Body od útraty/).fill('300');
  tvrdi('B4: minimum 300 — z 250 žádné body a věta o minimu', await dokud(async () => { const t = await nahled.innerText(); return /0\s*b\./.test(t) && /body se dávají od/.test(t); }, 1500), (await nahled.innerText()).replace(/\n/g, ' | '));
  await n.getByLabel(/Body od útraty/).fill('0');
  await n.getByLabel('Z toho kreditem nebo poukazem').fill('100');
  tvrdi('B5: 100 z účtu kreditem se nepočítá — zbývá 150 → 15 + 10 b. a věta', await dokud(async () => /zaplaceno kreditem nebo poukazem se nepočítá/.test(await nahled.innerText()), 1500), (await nahled.innerText()).replace(/\n/g, ' | '));

  // Kontrola před odesláním: zlato musí být nad stříbrem.
  await n.getByLabel('Návštěv', { exact: true }).nth(1).fill('5');
  await p.locator('[data-plocha]').getByRole('button', { name: 'Uložit', exact: true }).click();
  tvrdi('B6: zlato pod stříbrem → chyba u pole, bez volání serveru', await dokud(async () => (await n.getByText(/musí být nad stříbrem/).count()) > 0, 2000) && !(stav.profilPuty ?? []).length, JSON.stringify(stav.profilPuty));
  await n.getByLabel('Návštěv', { exact: true }).nth(1).fill('25');
  await n.getByLabel('Z toho kreditem nebo poukazem').fill('0');
  await p.locator('[data-plocha]').getByRole('button', { name: 'Uložit', exact: true }).click();
  tvrdi('B7: oprava → PUT nese nová pole (zaokrouhlení, minimum, strop, pauza)', await dokud(() => (stav.profilPuty ?? []).some(b => b.points_round === 'nejblizsi' && 'points_min_spend' in b && 'points_cap_per_bill' in b && 'tier_inactive_months' in b && Array.isArray(b.points_exclude_items)), 2500), JSON.stringify(stav.profilPuty));
  await n.getByLabel('Snížit po (měsících bez návštěvy)').fill('99');
  await p.locator('[data-plocha]').getByRole('button', { name: 'Uložit', exact: true }).click();
  tvrdi('B8: pauza 99 měsíců → rozsah v češtině, žádný další PUT', await dokud(async () => (await n.getByText(/povolený rozsah je 0 až 36/).count()) > 0, 2500) && (stav.profilPuty ?? []).length === 1, `${(stav.profilPuty ?? []).length} PUT · ${(await n.locator('[role=alert]').allInnerTexts()).join(' | ')} · hodnota ${await n.getByLabel('Snížit po (měsících bez návštěvy)').inputValue()}`);
  // vyloučená položka
  await n.getByLabel('Hledat položku, za kterou se body nedávají').fill('dárk');
  await n.getByRole('listitem').filter({ hasText: 'Dárková karta' }).first().click();
  tvrdi('B9: vyloučená položka je štítek, který jde odebrat', await n.getByRole('button', { name: 'Znovu počítat body za: Dárková karta' }).count() === 1);
  tvrdi('B10: bez vodorovného posunu na počítači', await bezPreteceni(p));
  tvrdi('B: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Body a úrovně na telefonu
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await kontext({ fix: nacti('k69-b8-rozlozeni-vernost'), viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh });
  await otevri(p, CLIENT('loyalty'), 'vedeni.klient_vernost');
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Body a úrovně' }).click();
  await nastroj(p).getByText('Náhled: kolik host dostane z účtu').waitFor({ timeout: 8000 });
  tvrdi('T1: Body a úrovně na 390 px bez vodorovného posunu', await bezPreteceni(p));
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Přehled' }).click();
  await nastroj(p).getByText('Závazek vůči hostům').waitFor({ timeout: 8000 });
  tvrdi('T2: Přehled s přehledy na 390 px bez vodorovného posunu', await bezPreteceni(p));
  tvrdi('T: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Přehledy: závazek, zdroje, top, export
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ fix: nacti('k69-b8-rozlozeni-vernost'), dalsi: podvrh });
  await otevri(p, CLIENT('loyalty'), 'vedeni.klient_vernost');
  const n = nastroj(p);
  await n.getByText('Závazek vůči hostům').waitFor({ timeout: 8000 });
  const txt = (await n.innerText()).replace(/[\s  ]+/g, ' ');
  tvrdi('P1: závazek — kredit 3 150 a odhad hodnoty bodů 9 210 v měně podniku', /3 150/.test(txt) && /9 210/.test(txt), txt.slice(0, 300));
  tvrdi('P2: odkud se berou body — zdroje s rozpadem', /Útrata u kasy a z účtenek/.test(txt) && /Kupony za body/.test(txt) && /−1 180/.test(txt));
  tvrdi('P3: nejvěrnější hosté — Jana Dvořáková první', /1\. Jana Dvořáková/.test(txt));
  await n.getByRole('tab', { name: '90 dní' }).click();
  tvrdi('P4: přepnutí období zavolá přehled znovu s novým od', await dokud(() => (stav.prehledy ?? []).length >= 2, 2500), JSON.stringify(stav.prehledy));
  await n.getByRole('tab', { name: 'Útrata', exact: true }).waitFor();
  await n.getByRole('tab', { name: 'Body', exact: true }).click();
  tvrdi('P5: řazení hostů se pošle serveru (razeni=body)', await dokud(() => (stav.prehledy ?? []).some(q => /razeni=body/.test(q)), 2500), JSON.stringify(stav.prehledy));
  await n.getByRole('button', { name: 'Export deníku (CSV)' }).click();
  tvrdi('P6: export deníku volá server s obdobím od–do', await dokud(() => (stav.exporty ?? []).some(q => /od=\d{4}-\d{2}-\d{2}/.test(q) && /do=\d{4}-\d{2}-\d{2}/.test(q)), 3000), JSON.stringify(stav.exporty));
  tvrdi('P: bez vodorovného posunu', await bezPreteceni(p));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Členové: úprava kreditu v okně
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ fix: nacti('k69-b8-rozlozeni-zakaznici'), dalsi: podvrh });
  await otevri(p, CLIENT('customers'), 'vedeni.klient_zakaznici');
  const n = nastroj(p);
  await n.getByRole('button', { name: 'Upravit body a kredit: Jana Dvořáková' }).click();
  const okno = p.getByRole('dialog');   // název okna se mění podle záložky (Body / Kredit / Útrata)
  await okno.getByText('Body pro Jana Dvořáková').waitFor({ timeout: 3000 });
  await okno.getByRole('tab', { name: 'Kredit', exact: true }).click();
  tvrdi('K1: okno nabízí Kredit a ukáže jeho stav', await okno.getByText(/Teď má 150/).count() === 1 || (await okno.innerText()).includes('150'), (await okno.innerText()).replace(/\n/g, ' | '));
  await okno.getByLabel(/O kolik upravit kredit/).fill('-999');
  tvrdi('K2: odepsat víc kreditu, než host má → chyba a tlačítko Uložit zhasnuté', await dokud(async () => (await okno.getByText(/víc odepsat nejde/).count()) > 0, 1500) && await okno.getByRole('button', { name: 'Uložit' }).isDisabled());
  await okno.getByLabel(/O kolik upravit kredit/).fill('50');
  tvrdi('K3: náhled „Po úpravě: 150 → 200"', await dokud(async () => /Po úpravě/.test(await okno.innerText()), 1500) && /200/.test(await okno.innerText()), (await okno.innerText()).replace(/\n/g, ' | '));
  await okno.getByLabel('Proč').fill('Reklamace');
  await okno.getByRole('button', { name: 'Uložit' }).click();
  tvrdi('K4: POST nese what: credit, částku a důvod', await dokud(() => (stav.body ?? []).some(b => b.customerId === 101 && b.delta === 50 && b.what === 'credit' && b.note === 'Reklamace'), 2500), JSON.stringify(stav.body));
  tvrdi('K: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await konec();
