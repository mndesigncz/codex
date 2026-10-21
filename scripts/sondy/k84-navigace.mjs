// Kolo 8 (R8-6): navigace, hledání a komunikace.
//  1) Zpět a adresa obrazovky (telefon 390 i monitor): přechod zapíše `?view=…`, Zpět vrátí předchozí
//     pohled místo opuštění aplikace, Vpřed ho zase otevře; otevřené okno přidá `&okno=1` a Zpět ho
//     nejdřív zavře; rozepsané okno se při Zpět zeptá; odkaz `?view=tasks&arg=ukol:2` otevře detail.
//  2) Rychlý filtr v hlavičce widgetu: Chip „Měsíc: Tento ▾" vedle titulku (Sbalit zůstává vpravo), klepnutí
//     nabídne volby (monitor: nabídka, telefon: list zdola), výběr uloží nastavení instance (PUT /api/rozlozeni);
//     v úpravách se chip nekreslí; velká karta s vlastní lištou období chip nemá.
//  3) Hledání (Ctrl K / lupa): najde hosta („novák" → Hosté), rezervaci, recepturu i položku menu („latte"),
//     uzávěrku podle dne („včera"); zaměstnanec hosty nevidí; výběr uzávěrky otevře Uzávěrky.
//  4) Nástěnka: přepínač „Vyžadovat potvrzení" při psaní (POST requireAck), „Rozumím" pod oznámením (PUT),
//     chip „Přečteno 1 z 3" → okno Kdo četl se dvěma seznamy a „Připomenout" (PATCH remind).
//  5) Chat: lišta reakcí (najetí / podržení), reakce jako chip „👍 1" (POST reactions), odpověď s citací
//     (POST replyTo), „Viděli: …" u poslední vlastní zprávy.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, roleMine, fixtura, DIR, OUT, BASE } from './k68-spolecne.mjs';
import { dayPlus, pragueToday } from '../../lib/pragueTime.ts';

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PREDVCEREM: praha(-2), ZITRA: praha(1), POZDEJI: praha(20) };
const CASY = { CAS_DNES: new Date(Date.now() - 60000).toISOString(), CAS_PREDVCEREM: new Date(Date.now() - 2 * 86400000).toISOString() };
const nacti = (jmeno) => { let t = readFileSync(DIR + jmeno + '.json', 'utf8'); for (const [k, v] of Object.entries({ ...DNY, ...CASY })) t = t.replaceAll(`"${k}"`, `"${v}"`); return JSON.parse(t); };
const podvrh = (req, json) => {
  const { pathname: path } = new URL(req.url());
  if (path === '/api/tasks' && req.method() === 'GET') return json(nacti('k69-b6a-tasks'));
  if (path === '/api/teams' && req.method() === 'GET') return json(nacti('k69-b6a-teams'));
  return undefined;
};
const q = (p) => new URL(p.url()).search;
/** Jen vybrané části (K84_SEKCE=3,5) — při ladění netřeba čekat na všechno; bez proměnné běží vše. */
const sekce = (n) => !process.env.K84_SEKCE || process.env.K84_SEKCE.split(',').includes(n);
const plochaJe = (p, id) => dokud(async () => await p.locator(`[data-plocha="${id}"] li[data-instance]:not([hidden])`).count() >= 1 && await p.locator('[data-plocha]').first().getAttribute('data-plocha') === id, 8000);

// ---- 1a) Vedení na telefonu: dok, Zpět, Vpřed, okno, rozepsané okno ----
if (sekce('1')) {
  const { ctx, p, chyby } = await kontext({ viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh });
  await otevri(p, '/employer/overview', 'vedeni.prehled');
  tvrdi('1a: Přehled bez parametru v adrese', !/view=/.test(q(p)), q(p));
  await p.getByRole('button', { name: 'Sklad', exact: true }).first().click();
  tvrdi('1a: dok → Sklad: v adrese je ?view=inventory', await dokud(async () => /view=inventory/.test(q(p)), 4000) && await plochaJe(p, 'vedeni.sklad'), q(p));
  await p.goBack();
  tvrdi('1a: Zpět vrátí Přehled (ne přihlášení, ne zavření aplikace)', await plochaJe(p, 'vedeni.prehled') && !/view=inventory/.test(q(p)), q(p));
  await p.goForward();
  tvrdi('1a: Vpřed zase otevře Sklad', await plochaJe(p, 'vedeni.sklad') && /view=inventory/.test(q(p)), q(p));
  await p.screenshot({ path: OUT + 'k84-navigace-390-sklad.png' });

  // Okno: hledání (lupa v hlavičce) → detail úkolu; Zpět zavře okno, další Zpět vrátí pohled.
  await p.getByRole('button', { name: 'Hledat v aplikaci' }).click();
  const okno = p.getByRole('dialog', { name: 'Hledat v aplikaci' });
  await okno.waitFor({ timeout: 5000 });
  tvrdi('1a: otevřené hledání má v adrese &okno=1', await dokud(async () => /okno=1/.test(q(p)), 3000), q(p));
  await p.goBack();
  tvrdi('1a: Zpět zavře hledání a zůstane na Skladu', await dokud(async () => await okno.count() === 0, 4000) && await plochaJe(p, 'vedeni.sklad') && !/okno=1/.test(q(p)), q(p));
  await p.getByRole('button', { name: 'Hledat v aplikaci' }).click();
  await okno.waitFor({ timeout: 5000 });
  await okno.getByRole('combobox').fill('sirupy');
  await okno.getByRole('option', { name: /Doplnit sirupy/ }).first().waitFor({ timeout: 5000 });
  await okno.getByRole('option', { name: /Doplnit sirupy/ }).first().click();
  const detail = p.getByRole('dialog', { name: 'Doplnit sirupy' });
  tvrdi('1a: výběr úkolu otevře Úkoly s detailem a adresu ?view=tasks…&okno=1', await dokud(async () => await detail.count() === 1 && /view=tasks/.test(q(p)) && /okno=1/.test(q(p)), 8000), q(p));
  await p.screenshot({ path: OUT + 'k84-navigace-390-detail.png' });
  await p.goBack();
  tvrdi('1a: Zpět zavře detail úkolu, Úkoly zůstanou', await dokud(async () => await detail.count() === 0, 4000) && await plochaJe(p, 'vedeni.ukoly') && !/okno=1/.test(q(p)), q(p));
  await p.goBack();
  tvrdi('1a: další Zpět vrátí Sklad', await plochaJe(p, 'vedeni.sklad'), q(p));
  tvrdi('1a: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---- 1b) Odkaz s argumentem a rozepsané okno (monitor) ----
if (sekce('1')) {
  const { ctx, p, chyby } = await kontext({ viewport: { width: 1280, height: 900 }, dalsi: podvrh });
  await otevri(p, '/employer/overview?view=tasks&arg=ukol:2', 'vedeni.ukoly');
  const detail = p.getByRole('dialog', { name: 'Doplnit sirupy' });
  tvrdi('1b: odkaz ?view=tasks&arg=ukol:2 otevře Úkoly rovnou s detailem', await dokud(async () => await detail.count() === 1, 8000));
  await p.goBack();
  tvrdi('1b: Zpět z detailu z odkazu zavře detail (Úkoly zůstanou)', await dokud(async () => await detail.count() === 0, 4000) && await plochaJe(p, 'vedeni.ukoly'));
  // Boční pás → Finance → Zpět → Úkoly
  await p.locator('aside').getByRole('button', { name: 'Finance' }).click();
  tvrdi('1b: boční pás zapíše ?view=finance', await dokud(async () => /view=finance/.test(q(p)), 4000) && await plochaJe(p, 'vedeni.finance'), q(p));
  await p.screenshot({ path: OUT + 'k84-navigace-1280-finance.png' });
  await p.goBack();
  tvrdi('1b: Zpět vrátí Úkoly', await plochaJe(p, 'vedeni.ukoly') && /view=tasks/.test(q(p)), q(p));
  // Rozepsané okno: detail úkolu, napsat poznámku, Zpět → otázka; „Zpět k úpravám" okno nechá; Zahodit zavře.
  await p.keyboard.press('Control+k');
  const hledani = p.getByRole('dialog', { name: 'Hledat v aplikaci' });
  await hledani.waitFor({ timeout: 5000 });
  await hledani.getByRole('combobox').fill('sirupy');
  await hledani.getByRole('option', { name: /Doplnit sirupy/ }).first().waitFor({ timeout: 5000 });
  await hledani.getByRole('option', { name: /Doplnit sirupy/ }).first().click();
  await detail.waitFor({ timeout: 8000 });
  const pole = detail.locator('textarea, input[type="text"], input:not([type])').first();
  if (await pole.count()) {
    await pole.click();
    await p.keyboard.type('Objednat i vanilkový', { delay: 10 });
    await p.waitForTimeout(200);
    await p.goBack();
    tvrdi('1b: Zpět nad rozepsaným oknem se zeptá, okno zůstane', await dokud(async () => await p.locator('.discard-guard:visible').count() === 1, 4000) && await detail.count() === 1);
    tvrdi('1b: …a adresa dál nese &okno=1', await dokud(async () => /okno=1/.test(q(p)), 2000), q(p));
    await p.locator('.discard-guard button', { hasText: /Zpět k úpravám/ }).click();
    tvrdi('1b: „Zpět k úpravám" nechá okno i text', await dokud(async () => await p.locator('.discard-guard:visible').count() === 0, 2000) && (await pole.inputValue()).includes('vanilkový'));
    await p.goBack();
    await p.locator('.discard-guard button', { hasText: /^Zahodit$/ }).click({ timeout: 4000 });
    tvrdi('1b: „Zahodit" po Zpět okno zavře a adresa je bez okna', await dokud(async () => await detail.count() === 0 && !/okno=1/.test(q(p)), 4000), q(p));
  } else {
    tvrdi('1b: (detail úkolu nemá psané pole — rozepsané okno se měří jinde)', true);
    await p.keyboard.press('Escape');
  }
  tvrdi('1b: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---- 1c) Zaměstnanec na telefonu ----
if (sekce('1')) {
  const { ctx, p, chyby } = await kontext({ viewport: { width: 390, height: 844 }, mobil: true, role: 'employee', mineData: roleMine('barista'), dalsi: podvrh });
  await otevri(p, '/employee/shifts?view=home', 'zamestnanec.domu');
  await p.getByRole('button', { name: 'Úkoly', exact: true }).first().click();
  tvrdi('1c: dok → Úkoly: ?view=tasks', await dokud(async () => /view=tasks/.test(q(p)), 4000) && await plochaJe(p, 'zamestnanec.ukoly'), q(p));
  await p.getByRole('button', { name: 'Více' }).click();
  const vice = p.getByRole('dialog').first();
  await vice.waitFor({ timeout: 4000 });
  tvrdi('1c: list Více je okno s &okno=1', await dokud(async () => /okno=1/.test(q(p)), 3000), q(p));
  await p.goBack();
  tvrdi('1c: Zpět zavře list Více, Úkoly zůstanou', await dokud(async () => await p.getByRole('dialog').count() === 0, 4000) && await plochaJe(p, 'zamestnanec.ukoly'), q(p));
  await p.goBack();
  tvrdi('1c: další Zpět vrátí Domů', await plochaJe(p, 'zamestnanec.domu') && !/view=tasks/.test(q(p)), q(p));
  await p.screenshot({ path: OUT + 'k84-navigace-390-zam.png' });
  tvrdi('1c: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---- 2) Rychlý filtr v hlavičce widgetu ----
const dnes = pragueToday();
const podvrhFinanci = (req, json) => {
  const u = new URL(req.url()); if (req.method() !== 'GET') return undefined;
  if (u.pathname === '/api/pos/daily') {
    const od = u.searchParams.get('from'), doD = u.searchParams.get('to');
    const days = []; let n = 0;
    for (let d = od; d <= doD && n < 40; d = dayPlus(d, 1), n++) {
      const total = 12000 + ((Number(d.slice(8)) * 1731) % 9000);
      days.push({ day: d, bills: 90, cash: total / 3, card: total * 2 / 3, other: 0, total, tips: 0, tipsCash: 0, tipsCard: 0, discounts: 0, refundCount: 0, refundTotal: 0, persons: 0, closings: 0, declared: null, diff: null });
    }
    const base = JSON.parse(readFileSync(DIR + 'k69-b5b-pos-daily.json', 'utf8').replaceAll('DNES', dnes));
    return json({ ...base, from: od, to: doD, days, totals: { ...base.totals, total: days.reduce((s, x) => s + x.total, 0) } });
  }
  if (u.pathname === '/api/finance') return json({ ...JSON.parse(readFileSync(DIR + 'k69-b5b-finance.json', 'utf8').replaceAll('DNES', dnes)), month: u.searchParams.get('month') });
  return undefined;
};
const FINANCE = { ...fixtura('k69-b5b-rozlozeni-finance'), polozky: [
  { id: 'po-dnech', widget: 'trzby.po_dnech', velikost: 'L', nastaveni: { obdobi: 'mesic_stranky' } },
  { id: 'souhrn', widget: 'finance.souhrn_mesice', velikost: 'L' },
  { id: 'marze', widget: 'finance.marze', velikost: 'M' },
] };
const li = (p, id) => p.locator(`[data-plocha] li[data-instance="${id}"]`);
if (sekce('2')) for (const w of [1280, 390]) {
  const { ctx, p, stav, chyby } = await kontext({ viewport: { width: w, height: 900 }, mobil: w < 600, fix: FINANCE, dalsi: podvrhFinanci });
  await otevri(p, '/employer/overview?view=finance', 'vedeni.finance');
  await p.waitForTimeout(600);
  const souhrn = li(p, 'souhrn');
  const chip = souhrn.locator('[data-rychly-filtr="mesic"] button').first();
  tvrdi(`2 ${w}: Souhrn měsíce má v hlavičce chip „Měsíc: Tento"`, await chip.count() === 1 && /Měsíc: Tento/.test(await chip.innerText()), await souhrn.locator('h2').innerText());
  const sbalit = souhrn.getByRole('button', { name: /^Sbalit/ });
  const [rc, rs] = [await chip.boundingBox(), await sbalit.boundingBox()];
  // v4 (spec V1/V2): na telefonu stojí rychlý filtr v řadě filtrů POD hlavičkou přes celou šířku — Sbalit
  // je v hlavičce nad ním a končí na téže pravé hraně R (nic nestojí vpravo od Sbalit). Na monitoru je
  // filtr dál v hlavičce před Sbalit.
  tvrdi(`2 ${w}: Sbalit zůstává vpravo od chipu`, !!rc && !!rs && (w < 640
    ? rs.y + rs.height <= rc.y && Math.abs((rs.x + rs.width) - (rc.x + rc.width)) <= 1.5
    : rs.x > rc.x + rc.width), JSON.stringify({ rc, rs }));
  tvrdi(`2 ${w}: chip je dotykový cíl ≥ 24 px a nepřetéká kartu`, !!rc && rc.height >= 20 && (await souhrn.evaluate(el => el.scrollWidth <= el.clientWidth + 1)));
  tvrdi(`2 ${w}: velká karta s vlastní lištou období (Tržba po dnech) chip nemá`, await li(p, 'po-dnech').locator('[data-rychly-filtr]').count() === 0);
  tvrdi(`2 ${w}: střední Marže má chip (první pole vyber = Měsíc)`, await li(p, 'marze').locator('[data-rychly-filtr="mesic"]').count() === 1);
  const putuPred = stav.puty.length;
  await chip.click();
  const volba = w < 600 ? p.getByRole('dialog', { name: 'Měsíc' }).getByRole('radio', { name: 'Minulý' }) : souhrn.getByRole('menuitemradio', { name: 'Minulý' });
  tvrdi(`2 ${w}: klepnutí otevře volby (${w < 600 ? 'list zdola' : 'nabídka'}) s „Minulý"`, await dokud(() => volba.isVisible(), 4000));
  if (w < 600) {
    await p.waitForTimeout(400);
    const r = await p.getByRole('dialog', { name: 'Měsíc' }).boundingBox();
    // List dosedá na spodní hranu (pod ní má jen odsazení pro domovský proužek), ne vystředěné okno.
    tvrdi('2 390: list zdola sedí u spodní hrany', !!r && r.y + r.height >= 900 - 4 && r.y > 450, JSON.stringify(r));
    const rv = await volba.boundingBox();
    tvrdi('2 390: volba má 44 px na výšku', !!rv && rv.height >= 44, JSON.stringify(rv));
  }
  await p.screenshot({ path: OUT + `k84-navigace-${w}-filtr.png` });
  await volba.click();
  tvrdi(`2 ${w}: výběr uloží nastavení instance (PUT /api/rozlozeni s mesic=minuly)`, await dokud(() => stav.puty.length > putuPred && (stav.puty.at(-1).polozky.find(x => x.id === 'souhrn')?.nastaveni?.mesic === 'minuly'), 5000), JSON.stringify(stav.puty.at(-1)?.polozky?.find(x => x.id === 'souhrn')));
  tvrdi(`2 ${w}: chip ukazuje novou hodnotu „Měsíc: Minulý" a volby jsou zavřené`, await dokud(async () => /Měsíc: Minulý/.test(await chip.innerText()), 3000) && await volba.count() === 0);
  tvrdi(`2 ${w}: widget si načetl minulý měsíc`, await dokud(() => stav.dotazy.some(d => /\/api\/finance\?month=/.test(d.u) && !d.u.endsWith(`month=${dnes.slice(0, 7)}`)), 5000));
  // Výchozí hodnota se neukládá: zpět na „Tento" → nastaveni bez `mesic`.
  await chip.click();
  const zpet = w < 600 ? p.getByRole('dialog', { name: 'Měsíc' }).getByRole('radio', { name: 'Tento' }) : souhrn.getByRole('menuitemradio', { name: 'Tento' });
  await zpet.waitFor({ timeout: 4000 });
  await zpet.click();
  tvrdi(`2 ${w}: návrat na výchozí hodnotu ji z nastavení smaže`, await dokud(() => stav.puty.at(-1)?.polozky.find(x => x.id === 'souhrn')?.nastaveni?.mesic === undefined && stav.puty.length > putuPred + 1, 5000));
  // V úpravách se chip nekreslí (na telefonu je „Upravit stránku" v „···" hlavičky).
  const upravitTl = p.locator('[data-plocha]').getByRole('button', { name: 'Upravit', exact: true });
  if (await upravitTl.isVisible().catch(() => false)) await upravitTl.click();
  else {
    await p.locator('main').getByRole('button', { name: 'Další akce', exact: true }).first().click();
    await p.getByRole('menuitem', { name: 'Upravit stránku', exact: true }).first().click();
  }
  tvrdi(`2 ${w}: v režimu úprav chip zmizí`, await dokud(async () => await p.locator('[data-plocha][data-upravy]').count() === 1 && await p.locator('[data-rychly-filtr]').count() === 0, 4000));
  tvrdi(`2 ${w}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---- 3) Hledání: hosté, rezervace, receptury, menu, uzávěrky ----
const podvrhHledani = (req, json) => {
  const u = new URL(req.url()); const path = u.pathname;
  if (req.method() !== 'GET') return undefined;
  if (path === '/api/tasks') return json(nacti('k69-b6a-tasks'));
  if (path === '/api/teams') return json(nacti('k69-b6a-teams'));
  if (path === '/api/pos/products') return json(nacti('k69-b4-pos-products'));
  if (path === '/api/menu') return json(nacti('k69-b4-menu'));
  if (path === '/api/closings') { const f = nacti('k69-b5a-closings'); return json(Array.isArray(f) ? { closings: f, meId: 1, payDailyCash: false } : f); }
  return undefined;
};
// Nadpisy skupin jsou t-label (velká písmena přes CSS) — innerText je vrací velké, proto /i.
if (sekce('3')) {
  const { ctx, p, stav, chyby } = await kontext({ viewport: { width: 1280, height: 900 }, dalsi: podvrhHledani });
  await otevri(p, '/employer/overview', 'vedeni.prehled');
  const okno = p.getByRole('dialog', { name: 'Hledat v aplikaci' });
  const hledej = async (q) => { await okno.getByRole('combobox').fill(''); await okno.getByRole('combobox').fill(q); };
  await p.keyboard.press('Control+k');
  await okno.waitFor({ timeout: 5000 });
  await hledej('novák');
  // Hosté přijdou až po odstupu (250 ms) a dotazu na server — čeká se na skupinu, ne na první shodu jména (úkol „… · Petr Novák" je hned).
  tvrdi('3: „novák" najde hosta Petr Novák ve skupině Hosté', await dokud(async () => /hosté/i.test(await okno.innerText()) && await okno.getByRole('option', { name: /^Petr Novák/ }).count() >= 1, 6000), (await okno.innerText()).slice(0, 200));
  tvrdi('3: hosté se hledají na serveru (?q=nov…), ne načtením všech', await dokud(() => stav.dotazy.some(d => /\/api\/client\/admin\/customers\?q=nov/.test(d.u)), 3000), stav.dotazy.filter(d => /customers/.test(d.u)).map(d => d.u).join(' '));
  await hledej('pavel');
  tvrdi('3: „pavel" najde nadcházející rezervaci Pavel Horák', await dokud(async () => await okno.getByRole('option', { name: /Pavel Horák/ }).count() >= 1, 6000) && /rezervace/i.test(await okno.innerText()), await okno.innerText());
  await hledej('latte');
  tvrdi('3: „latte" najde recepturu (produkt z kasy) i položku menu', await dokud(async () => await okno.getByRole('option', { name: /Latte/ }).count() >= 2, 6000) && /receptury/i.test(await okno.innerText()) && /menu/i.test(await okno.innerText()), await okno.innerText());
  await hledej('včera');
  tvrdi('3: „včera" najde uzávěrku ze včerejška', await dokud(async () => await okno.getByRole('option', { name: /^Uzávěrka/ }).count() >= 1, 6000) && /uzávěrky/i.test(await okno.innerText()), await okno.innerText());
  await p.screenshot({ path: OUT + 'k84-navigace-1280-hledani.png' });
  await okno.getByRole('option', { name: /^Uzávěrka/ }).first().click();
  tvrdi('3: výběr uzávěrky otevře Uzávěrky (?view=reports)', await plochaJe(p, 'vedeni.uzaverky') && /view=reports/.test(q(p)), q(p));
  tvrdi('3: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}
if (sekce('3')) {
  const { ctx, p } = await kontext({ viewport: { width: 390, height: 844 }, mobil: true, role: 'employee', mineData: roleMine('barista'), dalsi: podvrhHledani });
  await otevri(p, '/employee/shifts?view=home', 'zamestnanec.domu');
  await p.getByRole('button', { name: 'Hledat v aplikaci' }).click();
  const okno = p.getByRole('dialog', { name: 'Hledat v aplikaci' });
  await okno.waitFor({ timeout: 5000 });
  await okno.getByRole('combobox').fill('latte');
  tvrdi('3 zam 390: „latte" najde recepturu', await dokud(async () => await okno.getByRole('option', { name: /Latte/ }).count() >= 1, 6000));
  await okno.getByRole('combobox').fill('novák');
  await p.waitForTimeout(900);
  tvrdi('3 zam 390: zaměstnanec hosty nevidí', !/hosté/i.test(await okno.innerText()));
  await p.screenshot({ path: OUT + 'k84-navigace-390-hledani.png' });
  await ctx.close();
}

// ---- 4) Nástěnka: potvrzení přečtení ----
const oznameni = () => ({ announcements: [
  { id: 1, content: 'Od pondělí nový postup čištění mlýnku — viz návod.', pinned: true, createdAt: '2026-10-12T09:00:00Z', authorName: 'Martin Nemeškal', authorAvatar: '🧑', requireAck: true, acked: false, ackCount: 1, memberCount: 3 },
  { id: 2, content: 'V pátek zavíráme v 18:00 kvůli soukromé akci.', pinned: true, createdAt: '2026-10-10T08:00:00Z', authorName: 'Martin Nemeškal', authorAvatar: '🧑', requireAck: false, acked: false, ackCount: 0, memberCount: 3 },
] });
const cteni = { id: 1, potvrdili: [{ id: 2, name: 'Eva Testová', avatar: '👩', at: '2026-10-12T10:15:00Z' }], ceka: [{ id: 3, name: 'Jakub Horák', avatar: '🧔' }, { id: 1, name: 'Martin Nemeškal', avatar: '🧑' }] };
const NASTENKA = (zdroj) => ({ ...zdroj, polozky: [{ id: 'nastenka', widget: 'oznameni.nastenka', velikost: 'L' }] });
if (sekce('4')) for (const [w, role, mineData, fix, stranka, cesta] of [
  [390, 'employer', undefined, NASTENKA(fixtura('k68-rozlozeni-vedeni')), 'vedeni.prehled', '/employer/overview'],
  [1280, 'employee', roleMine('barista'), NASTENKA(fixtura('k68-rozlozeni-domu')), 'zamestnanec.domu', '/employee/shifts?view=home'],
]) {
  const zapsano = { post: [], put: [], patch: [] };
  const podvrh = (req, json) => {
    const path = new URL(req.url()).pathname;
    if (path !== '/api/announcements') return undefined;
    const m = req.method();
    if (m === 'GET') return json(new URL(req.url()).searchParams.get('cteni') ? cteni : oznameni());
    const telo = JSON.parse(req.postData() || '{}');
    if (m === 'POST') { zapsano.post.push(telo); return json({ ok: true, announcement: { id: 9, content: telo.content, pinned: true, requireAck: telo.requireAck === true } }); }
    if (m === 'PUT') { zapsano.put.push(telo); return json({ ok: true, id: telo.id, acked: true }); }
    if (m === 'PATCH') { zapsano.patch.push(telo); return json({ id: telo.id, reminded: 2 }); }
    return undefined;
  };
  const { ctx, p, chyby } = await kontext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, mobil: w < 600, role, ...(mineData ? { mineData } : {}), fix, dalsi: podvrh });
  await otevri(p, cesta, stranka);
  const karta = p.locator('[data-plocha] li[data-instance="nastenka"]');
  const rozumim = karta.getByRole('button', { name: 'Rozumím' });
  tvrdi(`4 ${role} ${w}: nepotvrzené oznámení má tlačítko „Rozumím" (jen jedno — druhé potvrzení nechce)`, await dokud(async () => await rozumim.count() === 1, 6000));
  const r = await rozumim.boundingBox();
  tvrdi(`4 ${role} ${w}: „Rozumím" má 44 px na výšku`, !!r && r.height >= 44, JSON.stringify(r));
  tvrdi(`4 ${role} ${w}: hlavička nese počet k potvrzení (chip wait)`, await karta.locator('h2 .chip-wait').count() === 1);
  await p.screenshot({ path: OUT + `k84-navigace-${w}-nastenka.png` });
  await rozumim.click();
  tvrdi(`4 ${role} ${w}: „Rozumím" pošle PUT { id: 1 }`, await dokud(() => zapsano.put.some(b => b.id === 1), 4000), JSON.stringify(zapsano.put));
  if (role === 'employer') {
    const chip = karta.locator('[data-kdo-cetl="1"]');
    tvrdi('4 vedení: u oznámení je chip „Přečteno 1 z 3"', await chip.count() === 1 && /Přečteno 1 z 3/.test(await chip.innerText()));
    await chip.click();
    const okno = p.getByRole('dialog', { name: 'Kdo četl' });
    tvrdi('4 vedení: chip otevře okno Kdo četl s Potvrdili (Eva) a Zatím ne (Jakub)', await dokud(async () => await okno.count() === 1 && /Eva Testová/.test(await okno.innerText()) && /Jakub Horák/.test(await okno.innerText()), 6000), await okno.innerText().catch(() => ''));
    await p.screenshot({ path: OUT + 'k84-navigace-390-kdo-cetl.png' });
    await okno.getByRole('button', { name: 'Připomenout' }).click();
    tvrdi('4 vedení: „Připomenout" pošle PATCH { id: 1, remind: true } a ohlásí počet', await dokud(() => zapsano.patch.some(b => b.id === 1 && b.remind === true), 4000) && await dokud(async () => /Připomenutí odešlo 2 lidem/.test(await okno.innerText()), 3000), await okno.innerText());
    await p.goBack();
    tvrdi('4 vedení: Zpět zavře okno Kdo četl', await dokud(async () => await okno.count() === 0, 4000));
    // Nové oznámení s přepínačem „Vyžadovat potvrzení" (velká nástěnka má formulář v kartě).
    const pole = karta.getByRole('textbox', { name: 'Nové oznámení' });
    await pole.fill('Zítra inventura, přijďte o půl hodiny dřív.');
    await karta.getByRole('switch', { name: 'Vyžadovat potvrzení' }).click();
    await karta.getByRole('button', { name: 'Připnout oznámení' }).click();
    tvrdi('4 vedení: připnutí pošle POST s requireAck: true', await dokud(() => zapsano.post.some(b => b.requireAck === true && /inventura/.test(b.content)), 5000), JSON.stringify(zapsano.post));
  }
  tvrdi(`4 ${role} ${w}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 2).join(' | '));
  await ctx.close();
}

// ---- 5) Chat: reakce, odpověď, Viděli ----
if (sekce('5')) {
  const zpravy = () => ({
    messages: [
      { id: 1, conversationId: 1, senderId: 2, content: 'Zítra zavírám dřív, v 17:00.', attachmentUrl: null, attachmentType: null, attachmentName: null, createdAt: '2026-10-13T08:00:00Z', senderName: 'Eva Testová', senderAvatar: '👩', replyTo: null, reactions: [{ emoji: '👍', pocet: 1, jmena: ['Jakub Horák'], userIds: [3] }] },
      // Vedení v sondě je uživatel 15 (cookie-role.mjs): tahle zpráva je vlastní.
      { id: 2, conversationId: 1, senderId: 15, content: 'Dobře, dám vědět hostům.', attachmentUrl: null, attachmentType: null, attachmentName: null, createdAt: '2026-10-13T08:05:00Z', senderName: 'Martin Nemeškal', senderAvatar: '🧑', replyTo: { id: 1, senderName: 'Eva Testová', content: 'Zítra zavírám dřív, v 17:00.' }, reactions: [] },
    ],
    members: [
      { id: 15, name: 'Martin Nemeškal', lastReadAt: '2026-10-13T08:06:00Z' },
      { id: 2, name: 'Eva Testová', lastReadAt: '2026-10-13T08:10:00Z' },
      { id: 3, name: 'Jakub Horák', lastReadAt: '2026-10-13T08:20:00Z' },
      { id: 4, name: 'Tereza Málková', lastReadAt: '2026-10-12T20:00:00Z' },
    ],
  });
  const zapsano = { reakce: [], zpravy: [] };
  const podvrh = (req, json) => {
    const path = new URL(req.url()).pathname;
    if (path === '/api/conversations/1/messages' && req.method() === 'GET') return json(zpravy());
    if (path === '/api/conversations/1/reactions' && req.method() === 'POST') {
      const telo = JSON.parse(req.postData() || '{}'); zapsano.reakce.push(telo);
      return json({ ok: true, messageId: telo.messageId, reactions: [{ emoji: '👍', pocet: 2, jmena: ['Jakub Horák', 'Ty'], userIds: [3, 15] }], mine: true });
    }
    if (path === '/api/conversations/1/messages' && req.method() === 'POST') {
      const telo = JSON.parse(req.postData() || '{}'); zapsano.zpravy.push(telo);
      return json({ message: { id: 3, conversationId: 1, senderId: 15, content: telo.content, attachmentUrl: null, attachmentType: null, attachmentName: null, createdAt: new Date().toISOString(), senderName: 'Martin Nemeškal', senderAvatar: '🧑', replyTo: telo.replyTo ? { id: telo.replyTo, senderName: 'Eva Testová', content: 'Zítra zavírám dřív, v 17:00.' } : null, reactions: [] } });
    }
    return undefined;
  };
  for (const w of [1280, 390]) {
    const { ctx, p, chyby } = await kontext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, mobil: w < 600, dalsi: podvrh });
    await p.goto(BASE + '/employer/overview?view=chat', { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: /Týmový chat/ }).first().click();
    const bublina1 = p.locator('[data-zprava="1"]');
    await bublina1.waitFor({ timeout: 8000 });
    tvrdi(`5 ${w}: reakce pod bublinou jako chip „👍 1"`, /👍\s*1/.test(await bublina1.locator('[data-reakce="1"]').innerText()));
    tvrdi(`5 ${w}: odpověď cituje původní zprávu (jméno + úryvek)`, /Eva Testová/.test(await p.locator('[data-zprava="2"]').innerText()) && /Zítra zavírám/.test(await p.locator('[data-zprava="2"]').innerText()));
    tvrdi(`5 ${w}: u poslední vlastní zprávy „Viděli: Eva Testová, Jakub Horák" (Tereza nečetla)`, /Viděli: Eva Testová, Jakub Horák/.test(await p.locator('[data-zprava="2"] [data-videli]').innerText().catch(() => '')), await p.locator('[data-zprava="2"]').innerText());
    if (w < 600) {
      // Podržení prstu na bublině ukáže lištu reakcí.
      const r = await bublina1.locator('p').first().boundingBox();
      const cdp = await p.context().newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }] });
      await p.waitForTimeout(650);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      tvrdi('5 390: podržení prstu ukáže lištu reakcí', await dokud(async () => await bublina1.locator('[data-lista-reakci]').count() === 1, 3000));
    } else {
      await bublina1.locator('p').first().hover();
    }
    const palec = bublina1.getByRole('button', { name: 'Reagovat 👍' });
    tvrdi(`5 ${w}: lišta nabízí 👍 ✅ ❤️ 😂 a Odpovědět`, await dokud(() => palec.isVisible(), 3000) && await bublina1.getByRole('toolbar').getByRole('button', { name: 'Odpovědět' }).count() === 1);
    await p.screenshot({ path: OUT + `k84-navigace-${w}-chat.png` });
    await palec.click();
    tvrdi(`5 ${w}: 👍 pošle POST reactions { messageId: 1, emoji: 👍 } a chip ukáže 2`, await dokud(() => zapsano.reakce.some(b => b.messageId === 1 && b.emoji === '👍'), 4000) && await dokud(async () => /👍\s*2/.test(await bublina1.locator('[data-reakce="1"]').innerText()), 3000));
    // Odpovědět z nabídky „···" zprávy → citace nad polem → odeslání nese replyTo.
    await bublina1.getByRole('button', { name: 'Akce se zprávou' }).click();
    await p.getByRole('menuitem', { name: 'Odpovědět' }).click();
    tvrdi(`5 ${w}: „Odpovědět" ukáže citaci nad polem`, await dokud(async () => await p.locator('[data-odpoved-na="1"]').count() === 1, 3000));
    await p.getByRole('textbox', { name: 'Text zprávy' }).fill('Jasně, počítám s tím.');
    await p.getByRole('button', { name: 'Odeslat' }).click();
    tvrdi(`5 ${w}: odeslání nese replyTo: 1 a citace z pole zmizí`, await dokud(() => zapsano.zpravy.some(b => b.replyTo === 1), 4000) && await dokud(async () => await p.locator('[data-odpoved-na]').count() === 0, 3000));
    tvrdi(`5 ${w}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 2).join(' | '));
    await ctx.close();
    zapsano.reakce.length = 0; zapsano.zpravy.length = 0;
  }
}

await konec();
