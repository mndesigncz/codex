// Kolo 8, balík R8-1 — Výplaty: Výplatní listina (vedení), Můj výdělek s dýškem a „z kasy" (zaměstnanec),
// Píchačky s pauzou. Vedení na 1280 i 390 (karty), zaměstnanec na telefonu 390 × 844 s dotykem; němčina a polština
// na 320/390 bez přetečení. Zápisy se tvrdí proti tomu, co UI pošle na API (podvrh si těla zapíše).
//
// Čas je pevný: prohlížeč žije 20. dne aktuálního měsíce v 16:00 (Praha), ať měsíc nese dost dní a fixtury s tokeny
// "@D-<n>T<HH:MM>" (pražský čas před n dny jako ISO), "D-<n>" (pražský den), "MESIC-01" (1. tohoto měsíce),
// "MINULY-01" / "MINULY-12" / "MINULY-KONEC" (minulý měsíc) nezávisí na tom, kdy sonda běží.
//   SONDY_ZAKLAD=http://localhost:3431 node scripts/sondy/k84-vyplaty.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, roleMine, DIR, OUT, BASE, FIX_DOMU } from './k68-spolecne.mjs';
import { nastavJazyk } from './preteceni-jadro.mjs';

const TEL = { width: 390, height: 844 };
const PC = { width: 1280, height: 900 };
const BARISTA = roleMine('barista');
/** Kam dát snímky: OUT (scripts/sondy/shots), nebo adresář z prostředí (snímky k hlášení mimo repo). */
const SNIMKY = process.env.K84_SNIMKY ? process.env.K84_SNIMKY.replace(/\/?$/, '/') : OUT;
mkdirSync(SNIMKY, { recursive: true });

const prahaDen = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(ms));
const prahaISO = (den, hm) => {
  const odhad = new Date(`${den}T${hm}:00Z`);
  const tz = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Prague', timeZoneName: 'longOffset' }).formatToParts(odhad).find(x => x.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  return new Date(`${den}T${hm}:00${tz.replace('GMT', '') || '+00:00'}`).toISOString();
};
const DNES = `${prahaDen(Date.now()).slice(0, 7)}-20`;
const TED = Date.parse(prahaISO(DNES, '16:00'));
const POSUN = TED - Date.now();
const den = (n) => { const d = new Date(`${DNES}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const MESIC = DNES.slice(0, 7);
const [rok, mes] = [Number(MESIC.slice(0, 4)), Number(MESIC.slice(5, 7))];
const MINULY = `${mes === 1 ? rok - 1 : rok}-${String(mes === 1 ? 12 : mes - 1).padStart(2, '0')}`;
const MINULY_KONEC = (() => { const d = new Date(`${MESIC}-01T12:00:00Z`); d.setUTCDate(0); return d.toISOString().slice(0, 10); })();
const skutecneChyby = (chyby) => chyby.filter(c => !/Minified React error #418|Hydration|hydrat/i.test(c));

const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  t = t.replace(/"@D-(\d+)T(\d\d:\d\d)"/g, (_, n, hm) => `"${prahaISO(den(Number(n)), hm)}"`);
  t = t.replace(/"D-(\d+)"/g, (_, n) => `"${den(Number(n))}"`);
  t = t.replace(/"@HM([+-]\d+)"/g, (_, m) => `"${new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(TED + Number(m) * 60000))}"`);
  t = t.replace(/"@(\d+)"/g, (_, m) => `"${new Date(TED - Number(m) * 60000).toISOString()}"`);
  for (const [k, v] of Object.entries({ DNES: den(0), VCERA: den(1), PREDEVCIREM: den(2), PRED5: den(5), 'MESIC-01': `${MESIC}-01`, 'MINULY-01': `${MINULY}-01`, 'MINULY-12': `${MINULY}-12`, 'MINULY-KONEC': MINULY_KONEC })) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t);
};
const FIX_DOCHAZKA = nacti('k84-vyplaty-rozlozeni-dochazka');
const FIX_MOJE = nacti('k84-vyplaty-rozlozeni-moje');
const PAYROLL = nacti('k84-vyplaty-payroll');
const PAYROLL_JA = nacti('k84-vyplaty-payroll-ja');
const ZAM = nacti('k83-dochazka-zamestnanec');

/** Podvrh API vedení: docházka, uzávěrky, tým, výplaty; zápisy do `stav.zapisy`. */
const podvrhVedeni = () => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  if (req.method() !== 'GET' && /^\/api\/(payroll|attendance|wage-adjustments)/.test(path)) {
    (stav.zapisy ??= []).push({ m: req.method(), path, telo: req.postData() ? JSON.parse(req.postData()) : null, q: url.search });
    if (path === '/api/payroll/payments') return json({ ok: true, payment: { id: 77, ...JSON.parse(req.postData() || '{}') } });
    if (path === '/api/payroll/rules') return json({ ok: true, ...PAYROLL.pravidla });
    if (path === '/api/payroll/locks') return json({ ok: true, lock: { id: 9, od: `${MESIC}-01`, do: den(0) } });
    return json({ ok: true });
  }
  if (req.method() !== 'GET') return undefined;
  if (path === '/api/attendance') return json(nacti('k69-b2-attendance'));
  if (path === '/api/closings') return json(nacti('k69-b2-closings'));
  if (path === '/api/teams') return json(nacti('k69-b2-teams'));
  if (path === '/api/payroll') return json({ ...PAYROLL, od: url.searchParams.get('od'), do: url.searchParams.get('do') });
  if (/^\/api\/employees\/\d+$/.test(path)) return json(nacti('k69-b2-employee'));
  return undefined;
};
/** Podvrh API zaměstnance: docházka podle scénáře, výplaty (ja=1), zápisy pauzy. */
const podvrhZam = (dochazka, payrollJa = PAYROLL_JA) => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  if (req.method() === 'POST' && path === '/api/attendance/pauza') { (stav.zapisy ??= []).push({ path, telo: JSON.parse(req.postData() || '{}') }); return json({ ok: true, action: 'start', closingDone: true }); }
  if (req.method() === 'POST' && path === '/api/attendance') { (stav.zapisy ??= []).push({ path, telo: JSON.parse(req.postData() || '{}') }); return json({ ok: true, action: 'out', closingDone: true }); }
  if (req.method() !== 'GET') return undefined;
  if (path === '/api/attendance') return json(dochazka);
  if (path === '/api/payroll') return json({ ...payrollJa, od: url.searchParams.get('od'), do: url.searchParams.get('do') });
  return undefined;
};

const preteceni = (p) => p.evaluate(() => {
  const okno = window.innerWidth;
  const sirkaDok = document.documentElement.scrollWidth - okno;
  const widgety = [...document.querySelectorAll('[data-plocha] li[data-widget]:not([hidden]) section')]
    .filter(s => s.scrollWidth > s.clientWidth + 1).map(s => s.closest('li')?.getAttribute('data-widget'));
  return { dokument: sirkaDok, widgety };
});
const widget = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]:not([hidden])`);
const text = async (loc) => ((await loc.count()) ? (await loc.first().innerText()) : '').replace(/\u00a0/g, ' ');
const dialog = (p) => p.getByRole('dialog').last();

async function vedeni({ viewport = PC, mobil = false, jazyk = null } = {}) {
  const k = await kontext({ viewport, mobil, fix: FIX_DOCHAZKA, posunCasu: POSUN, dalsi: podvrhVedeni() });
  await nastavJazyk(k.ctx, jazyk);
  await otevri(k.p, '/employer/overview?view=attendance', 'vedeni.dochazka');
  await dokud(async () => (await widget(k.p, 'dochazka.vyplatni_listina').locator('.list-row, table tbody tr').count()) > 0, 20000);
  await k.p.waitForTimeout(600);
  return k;
}
async function zam({ dochazka, url, plocha, fix, jazyk, viewport = TEL, mobil = true, payrollJa }) {
  const k = await kontext({ role: 'employee', viewport, mobil, mineData: BARISTA, fix, posunCasu: POSUN, dalsi: podvrhZam(dochazka, payrollJa) });
  await nastavJazyk(k.ctx, jazyk);
  await k.p.goto(BASE + url, { waitUntil: 'networkidle' });
  await k.p.locator(`[data-plocha="${plocha}"] li[data-instance]:not([hidden])`).first().waitFor({ timeout: 20000 });
  await k.p.waitForTimeout(1200);
  return k;
}

// ---------------------------------------------------------------------------
// Vedení 1280 — tabulka, řazení, Vyplaceno, Pravidla, CSV
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await vedeni();
  const w = widget(p, 'dochazka.vyplatni_listina');
  tvrdi('L1 (1280): Výplatní listina je na Docházce pod Souhrnem hodin', (await w.count()) === 1);
  const hlava = await w.locator('table thead').innerText();
  tvrdi('L1 (1280): tabulka má sloupce Člověk · Směny · Hodiny · Mzda · Příplatky · Dýško · Prémie · Z kasy · Doplatit · Stav', ['Člověk', 'Směny', 'Hodiny', 'Mzda', 'Příplatky', 'Dýško', 'Prémie', 'Z kasy', 'Doplatit', 'Stav'].every(s => hlava.includes(s)), hlava.replace(/\s+/g, ' '));
  tvrdi('L1 (1280): sloupce Plán, Sazba a Smlouva jsou ve výchozím stavu schované (tlačítko Sloupce)', !/Plán|Sazba|Smlouva/.test(hlava) && await w.getByRole('button', { name: 'Sloupce' }).isVisible());
  // Čísla se nesmí zkracovat: žádná buňka tabulky nesmí mít text širší než buňku.
  const orezane = await w.locator('table tbody td, table tfoot td').evaluateAll(els => els.filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
  tvrdi('L1 (1280): žádné číslo v tabulce není oříznuté „…"', orezane.length === 0, JSON.stringify(orezane));
  const eva = w.locator('tr[data-radek-listiny="16"]');
  const evaText = (await eva.innerText()).replace(/\u00a0/g, ' ');
  tvrdi('L1 (1280): řádek Evy ukazuje „−2 400 Kč" z kasy a stav Čeká', /−2 400 Kč/.test(evaText) && /Čeká/.test(evaText), evaText.replace(/\s+/g, ' '));
  const souhrnText = await text(w);
  tvrdi('L1 (1280): nahoře Z kasy −2 400 Kč (už vyplaceno · 6×) a Doplatit', /Z kasy/i.test(souhrnText) && /−2 400 Kč/.test(souhrnText) && /už vyplaceno · 6× v uzávěrkách/.test(souhrnText) && /Doplatit/i.test(souhrnText), souhrnText.slice(0, 400));
  tvrdi('L1 (1280): řádek Celkem dole', (await w.locator('table tfoot').innerText()).includes('Celkem'));
  // Řazení klikem na hlavičku: Hodiny → první řádek je ten s nejvíc hodinami (Petra), druhý klik obrátí.
  const prvni = async () => (await w.locator('table tbody tr').first().getAttribute('data-radek-listiny'));
  await w.locator('table thead').getByRole('button', { name: /^Hodiny/ }).click();
  await p.waitForTimeout(200);
  const poHodinach = await prvni();
  await w.locator('table thead').getByRole('button', { name: /^Hodiny/ }).click();
  await p.waitForTimeout(200);
  tvrdi('L1 (1280): řazení klikem na Hodiny (sestupně, pak vzestupně) mění pořadí', poHodinach !== await prvni(), `${poHodinach} → ${await prvni()}`);
  tvrdi('L1 (1280): hlavička nese aria-sort', (await w.locator('table thead th[aria-sort="ascending"], table thead th[aria-sort="descending"]').count()) === 1);
  // Vyplaceno… u Evy → okno s předvyplněnou částkou → POST /api/payroll/payments
  await w.getByRole('button', { name: 'Vyplaceno: Eva Testová' }).click();
  tvrdi('L2 (1280): „Vyplaceno…" otevře okno Označit jako vyplacené', await dokud(() => dialog(p).getByText('Označit jako vyplacené').isVisible().catch(() => false), 4000));
  const castka = await dialog(p).locator('#vyplaceno-castka').inputValue();
  tvrdi('L2 (1280): částka je předvyplněná z Doplatit (kladné číslo)', Number(castka) > 0, castka);
  await dialog(p).getByRole('tab', { name: 'Na účet' }).click();
  await dialog(p).getByRole('button', { name: 'Vyplaceno', exact: true }).click();
  await dokud(() => (stav.zapisy ?? []).some(z => z.path === '/api/payroll/payments'), 4000);
  const zapis = (stav.zapisy ?? []).find(z => z.path === '/api/payroll/payments');
  tvrdi('L2: POST /api/payroll/payments nese userId 16, období měsíce, částku, na účet a den', !!zapis && zapis.telo.userId === 16 && zapis.telo.od === `${MESIC}-01` && zapis.telo.do === den(0) && zapis.telo.amount === Number(castka) && zapis.telo.method === 'ucet' && zapis.telo.paidAt === den(0), JSON.stringify(zapis?.telo));
  await dokud(() => dialog(p).isHidden().catch(() => true), 3000);
  // Pravidla výplat z nabídky widgetu
  const nabidka = w.getByRole('button', { name: 'Další akce: Výplatní listina' });
  await nabidka.click();
  const polozkaPravidla = p.getByRole('menuitem', { name: /Pravidla výplat/ }).or(p.getByRole('button', { name: /Pravidla výplat/ }));
  tvrdi('L3 (1280): nabídka widgetu nabízí Pravidla výplat, Uzavřít období, Vybrat víc a CSV pro účetní', await dokud(() => polozkaPravidla.first().isVisible().catch(() => false), 3000)
    && await p.getByText('Uzavřít období…').isVisible() && await p.getByText('CSV pro účetní').isVisible() && await p.getByText('Vybrat víc').isVisible());
  await polozkaPravidla.first().click();
  tvrdi('L3 (1280): okno Pravidla výplat má Dýško, Příplatky a Smlouvy', await dokud(() => dialog(p).getByText('Pravidla výplat').first().isVisible().catch(() => false), 4000)
    && await dialog(p).getByText('Sobota a neděle').isVisible() && await dialog(p).getByText('Hranice výdělku z DPP pro odvody').isVisible());
  const nahled = await dialog(p).innerText();
  tvrdi('L3 (1280): náhled dělení na poslední uzávěrce (bez vedení) je vidět', /Na uzávěrce z .* by dostali/.test(nahled), nahled.slice(0, 300));
  await dialog(p).getByRole('tab', { name: 'Rovným dílem' }).click();
  await dialog(p).getByRole('button', { name: 'Uložit pravidla' }).click();
  await dokud(() => (stav.zapisy ?? []).some(z => z.path === '/api/payroll/rules'), 4000);
  const pravidla = (stav.zapisy ?? []).find(z => z.path === '/api/payroll/rules');
  tvrdi('L3: PUT /api/payroll/rules nese metodu rovne, platiOd dnes, příplatky a hranici odvodů', !!pravidla && pravidla.m === 'PUT' && pravidla.telo.dysko.metoda === 'rovne' && pravidla.telo.dysko.platiOd === den(0) && pravidla.telo.priplatky.vikendPct === 10 && pravidla.telo.hraniceOdvodu === 11500 && pravidla.telo.showTipsToStaff === true, JSON.stringify(pravidla?.telo));
  await dokud(() => dialog(p).isHidden().catch(() => true), 3000);
  // CSV pro účetní
  await nabidka.click();
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.getByText('CSV pro účetní').click()]);
  const csv = readFileSync(await dl.path(), 'utf8').replace(/^\uFEFF/, '');
  const radky = csv.split('\n');
  tvrdi('L4 (1280): CSV má jeden řádek na člověka, sloupce Jméno … Z kasy (Kč) … Doplatit (Kč) a Celkem', radky[0].includes('"Jméno";"Pozice"') && radky[0].includes('"Z kasy (Kč)"') && radky[0].includes('"Doplatit (Kč)"') && radky[radky.length - 1].startsWith('"Celkem"') && radky.some(r => r.startsWith('"Eva Testová";"Barista";"DPP"')), radky.slice(0, 2).join(' | '));
  const souhrn = await text(widget(p, 'dochazka.souhrn_hodin'));
  tvrdi('L5 (1280): Souhrn hodin ukazuje Z kasy (už vyplaceno) a Doplatit', /už vyplaceno · 6× v uzávěrkách/.test(souhrn) && /Doplatit/i.test(souhrn), souhrn.slice(0, 300));
  // Přetečení dokumentu a widgetů (Souhrn hodin má známý 8px přesah StatRow pod zkráceným tělem už na main — měří se tu sekce a dokument jako v k83).
  const prL = await preteceni(p);
  tvrdi('L1 (1280): bez přetečení dokumentu i widgetů', prL.dokument <= 1 && prL.widgety.length === 0, JSON.stringify(prL));
  tvrdi('L1: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await w.scrollIntoViewIfNeeded();
  await p.screenshot({ path: SNIMKY + 'k84-vyplaty-listina-1280.png' });
  await w.screenshot({ path: SNIMKY + 'k84-vyplaty-listina-widget-1280.png' });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Vedení 390 — karty, okno zdola, bez přetečení; 320 de/pl
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await vedeni({ viewport: TEL, mobil: true });
  const w = widget(p, 'dochazka.vyplatni_listina');
  tvrdi('K1 (390): na telefonu karty, ne tabulka', (await w.locator('table').evaluateAll(els => els.filter(e => getComputedStyle(e.closest('div')).display !== 'none').length)) === 0 && (await w.locator('.list-row').count()) >= 4);
  const t1 = await text(w);
  tvrdi('K1 (390): karta nese jméno, velké Doplatit a −2 400 Kč z kasy', /Eva Testová/.test(t1) && /doplatit/.test(t1) && /z kasy −2 400 Kč/.test(t1), t1.slice(0, 400));
  tvrdi('K1 (390): přepínač řazení Doplatit / Hodiny / Jméno', await w.getByRole('tab', { name: 'Doplatit' }).isVisible() && await w.getByRole('tab', { name: 'Jméno' }).isVisible());
  const pr = await preteceni(p);
  tvrdi('K1 (390): bez přetečení dokumentu i widgetů', pr.dokument <= 1 && pr.widgety.length === 0, JSON.stringify(pr));
  await w.scrollIntoViewIfNeeded();
  await p.screenshot({ path: SNIMKY + 'k84-vyplaty-listina-390.png' });
  await w.screenshot({ path: SNIMKY + 'k84-vyplaty-listina-widget-390.png' });
  await w.locator('.list-row').filter({ hasText: 'Eva Testová' }).first().click();
  tvrdi('K2 (390): klepnutí na kartu otevře rozpad zdola s „Už vyplaceno z kasy" a Vyplaceno…', await dokud(() => dialog(p).getByText('Už vyplaceno z kasy').isVisible().catch(() => false), 4000) && await dialog(p).getByRole('button', { name: 'Vyplaceno…' }).isVisible());
  await p.waitForTimeout(900); // list dojede zdola
  const box = await dialog(p).boundingBox();
  tvrdi('K2 (390): okno dosedá na spodní hranu (list zdola)', !!box && Math.abs(box.y + box.height - TEL.height) < 2, JSON.stringify(box));
  const okno = await dialog(p).evaluate(e => ({ s: e.scrollWidth, c: e.clientWidth }));
  tvrdi('K2 (390): nic v okně nepřetéká', okno.s <= okno.c + 1, JSON.stringify(okno));
  await p.screenshot({ path: SNIMKY + 'k84-vyplaty-rozpad-390.png' });
  await p.keyboard.press('Escape');
  tvrdi('K1: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}
for (const [w, jazyk] of [[320, 'de'], [320, 'pl'], [390, 'de']]) {
  const { ctx, p } = await vedeni({ viewport: { width: w, height: 844 }, mobil: true, jazyk });
  const pr = await preteceni(p);
  tvrdi(`K3 (${w}, ${jazyk}): Docházka s listinou bez přetečení`, pr.dokument <= 1 && pr.widgety.length === 0, JSON.stringify(pr));
  await ctx.close();
}
{
  const { ctx, p } = await vedeni({ viewport: { width: 1024, height: 900 } });
  const pr = await preteceni(p);
  tvrdi('K4 (1024): tabulka listiny bez přetečení', pr.dokument <= 1 && pr.widgety.length === 0, JSON.stringify(pr));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Zaměstnanec 390 — Můj výdělek: dýško, z kasy, měsíce
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await zam({ dochazka: ZAM, url: '/employee/shifts?view=my-shifts', plocha: 'zamestnanec.moje_smeny', fix: FIX_MOJE });
  const w = widget(p, 'moje.vydelek');
  await dokud(async () => /Spropitné/i.test(await text(w)), 20000);
  const t1 = await text(w);
  tvrdi('Z1 (390): Můj výdělek (M) má dlaždici Spropitné 1 860 Kč', /Spropitné/i.test(t1) && /1 860 Kč/.test(t1), t1.slice(0, 400));
  tvrdi('Z1 (390): „Z kasy jsi dostal/a 2 400 Kč" a kolik zbývá', /Z kasy jsi dostal\/a 2 400 Kč/.test(t1) && /zbývá/.test(t1), t1.slice(0, 400));
  const box = await w.boundingBox();
  tvrdi('Z1 (390): widget začíná nad ohybem', !!box && box.y < TEL.height, JSON.stringify(box));
  await w.getByRole('button', { name: 'Spropitné po dnech' }).click();
  tvrdi('Z2 (390): klepnutí na Spropitné otevře rozpad po dnech (6 h 15 min z 18 h · 312 Kč)', await dokud(async () => /6 h 15 min z 18 h/.test(await text(dialog(p))) && /312 Kč/.test(await text(dialog(p))), 4000), await text(dialog(p)));
  await p.screenshot({ path: SNIMKY + 'k84-vyplaty-dysko-390.png' });
  await p.keyboard.press('Escape');
  const pr = await preteceni(p);
  tvrdi('Z1 (390): bez přetečení', pr.dokument <= 1 && pr.widgety.length === 0, JSON.stringify(pr));
  await p.screenshot({ path: SNIMKY + 'k84-vyplaty-vydelek-390.png' });
  tvrdi('Z1: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}
{
  // Bez zapnutého „Ukázat lidem jejich dýško" dlaždice není.
  const bez = { ...PAYROLL_JA, ja: { ...PAYROLL_JA.ja, spropitne: null, spropitnePoDnech: [] }, pravidla: { ...PAYROLL_JA.pravidla, showTipsToStaff: false } };
  const { ctx, p } = await zam({ dochazka: ZAM, url: '/employee/shifts?view=my-shifts', plocha: 'zamestnanec.moje_smeny', fix: FIX_MOJE, payrollJa: bez });
  const w = widget(p, 'moje.vydelek');
  await dokud(async () => /Z kasy/.test(await text(w)), 20000);
  tvrdi('Z3 (390): bez přepínače podniku dlaždice Spropitné není', !/Spropitné/i.test(await text(w)));
  await ctx.close();
}
for (const [sirka, jazyk] of [[390, null], [320, 'de'], [320, 'pl']]) {
  const fix = { ...FIX_MOJE, polozky: FIX_MOJE.polozky.map(x => (x.widget === 'moje.vydelek' ? { ...x, velikost: 'L' } : x)) };
  const { ctx, p } = await zam({ dochazka: ZAM, url: '/employee/shifts?view=my-shifts', plocha: 'zamestnanec.moje_smeny', fix, jazyk, viewport: { width: sirka, height: 844 } });
  const w = widget(p, 'moje.vydelek');
  await dokud(async () => (await w.locator('[data-mesice-vyplat] li').count()) > 0, 20000);
  const mesice = await w.locator('[data-mesice-vyplat] li').count();
  const t1 = await text(w);
  if (!jazyk) tvrdi('Z4 (390): velký Můj výdělek má pás čtyř měsíců, minulý Vyplaceno 12 450 Kč a Uzavřeno', mesice === 4 && /12 450 Kč/.test(t1) && /Uzavřeno/.test(t1), t1.slice(-400));
  const pr = await preteceni(p);
  tvrdi(`Z4 (${sirka}, ${jazyk ?? 'cs'}): bez přetečení`, pr.dokument <= 1 && pr.widgety.length === 0, JSON.stringify(pr));
  if (!jazyk) { await w.locator('[data-mesice-vyplat]').scrollIntoViewIfNeeded(); await p.waitForTimeout(300); await p.screenshot({ path: SNIMKY + 'k84-vyplaty-vydelek-l-390.png' }); }
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Zaměstnanec 390 — Píchačky: Pauza, Konec pauzy, otázka po 6 h
// ---------------------------------------------------------------------------
{
  const naSmene = { ...ZAM, roster: [{ ...ZAM.roster[0], openSince: prahaISO(DNES, '14:12') }],
    entries: [{ id: 720, employeeId: 16, clockIn: prahaISO(DNES, '14:12'), clockOut: null, source: 'self', note: null, updatedBy: null }, ...ZAM.entries.map(e => (e.id === 701 ? { ...e, clockOut: prahaISO(den(1), '16:00') } : e))] };
  const { ctx, p, stav } = await zam({ dochazka: naSmene, url: '/employee/shifts?view=home', plocha: 'zamestnanec.domu', fix: FIX_DOMU });
  const w = widget(p, 'dochazka.moje_pichacky');
  await dokud(() => w.getByRole('button', { name: 'Začít pauzu' }).isVisible().catch(() => false), 20000);
  const pauza = w.getByRole('button', { name: 'Začít pauzu' });
  const odchod = w.getByRole('button', { name: 'Odpíchnout odchod' });
  tvrdi('P1 (390): na směně jsou vedle sebe Odchod (primary) a Pauza (secondary)', await pauza.isVisible() && await odchod.isVisible());
  const bb = await pauza.boundingBox();
  tvrdi('P1 (390): tlačítko Pauza má dotykový cíl ≥ 44 px a je nad ohybem', !!bb && bb.height >= 44 && bb.y + bb.height <= TEL.height, JSON.stringify(bb));
  await pauza.click();
  await dokud(() => (stav.zapisy ?? []).some(z => z.path === '/api/attendance/pauza'), 4000);
  tvrdi('P1: klepnutí pošle POST /api/attendance/pauza {action: start}', (stav.zapisy ?? []).some(z => z.path === '/api/attendance/pauza' && z.telo.action === 'start'), JSON.stringify(stav.zapisy));
  await w.screenshot({ path: SNIMKY + 'k84-vyplaty-pichacky-390.png' });
  await ctx.close();
}
// Odchod (ověření kola 92, B7): jediný vzor pojistky — 5 s odpočet s „Vrátit odchod",
// žádné potvrzovací okno. Vrátit nic nezapíše, „Zapsat hned" pošle POST action out.
{
  const naSmene = { ...ZAM, roster: [{ ...ZAM.roster[0], openSince: prahaISO(DNES, '14:12') }],
    entries: [{ id: 720, employeeId: 16, clockIn: prahaISO(DNES, '14:12'), clockOut: null, source: 'self', note: null, updatedBy: null }, ...ZAM.entries.map(e => (e.id === 701 ? { ...e, clockOut: prahaISO(den(1), '16:00') } : e))] };
  const { ctx, p, stav } = await zam({ dochazka: naSmene, url: '/employee/shifts?view=home', plocha: 'zamestnanec.domu', fix: FIX_DOMU });
  const w = widget(p, 'dochazka.moje_pichacky');
  const odchod = w.getByRole('button', { name: 'Odpíchnout odchod' });
  await dokud(() => odchod.isVisible().catch(() => false), 20000);
  const postOut = () => (stav.zapisy ?? []).filter(z => z.path === '/api/attendance' && z.telo?.action === 'out');
  await odchod.click();
  tvrdi('P4 (390): Odchod rozběhne odpočet s „Vrátit odchod" a „Zapsat hned"', await dokud(() => w.getByRole('button', { name: 'Vrátit odchod' }).isVisible().catch(() => false), 3000)
    && await w.getByRole('button', { name: 'Zapsat hned' }).isVisible() && await w.locator('[data-odpocet-odchodu]').isVisible());
  tvrdi('P4: žádné potvrzovací okno „Odpíchnout odchod?" (jediný vzor = odpočet)', (await p.getByRole('dialog').count()) === 0);
  tvrdi('P4: během odpočtu nic neodešlo', postOut().length === 0, JSON.stringify(stav.zapisy));
  await w.screenshot({ path: SNIMKY + 'k84-vyplaty-odpocet-odchodu-390.png' });
  await w.getByRole('button', { name: 'Vrátit odchod' }).click();
  await p.waitForTimeout(5600);
  tvrdi('P4: Vrátit odchod → zpátky Odchod + Pauza a po 5 s pořád žádný zápis', await odchod.isVisible() && await w.getByRole('button', { name: 'Začít pauzu' }).isVisible() && postOut().length === 0, JSON.stringify(stav.zapisy));
  await odchod.click();
  await w.getByRole('button', { name: 'Zapsat hned' }).click();
  tvrdi('P4: „Zapsat hned" pošle právě jeden POST /api/attendance {action: out}', await dokud(() => postOut().length === 1, 4000) && (await p.waitForTimeout(400), postOut().length === 1), JSON.stringify(stav.zapisy));
  await ctx.close();
}
{
  const naPauze = { ...ZAM, roster: [{ ...ZAM.roster[0], openSince: null }],
    entries: [
      { id: 721, employeeId: 16, clockIn: prahaISO(DNES, '12:40'), clockOut: prahaISO(DNES, '12:40'), source: 'break', note: null, updatedBy: null },
      { id: 720, employeeId: 16, clockIn: prahaISO(DNES, '08:00'), clockOut: prahaISO(DNES, '12:40'), source: 'self', note: null, updatedBy: null },
      ...ZAM.entries.map(e => (e.id === 701 ? { ...e, clockOut: prahaISO(den(1), '16:00') } : e)),
    ] };
  const { ctx, p, stav } = await zam({ dochazka: naPauze, url: '/employee/shifts?view=home', plocha: 'zamestnanec.domu', fix: FIX_DOMU });
  const w = widget(p, 'dochazka.moje_pichacky');
  await dokud(() => w.getByRole('button', { name: 'Konec pauzy' }).isVisible().catch(() => false), 20000);
  const t1 = await text(w);
  tvrdi('P2 (390): na pauze: chip Na pauze, „Pauza od 12:40" se stopkami a tlačítka Konec pauzy + Odchod', /Na pauze/.test(t1) && /Pauza od 12:40/i.test(t1) && await w.getByRole('button', { name: 'Konec pauzy' }).isVisible() && await w.getByRole('button', { name: 'Odpíchnout odchod' }).isVisible(), t1);
  await w.getByRole('button', { name: 'Konec pauzy' }).click();
  await dokud(() => (stav.zapisy ?? []).some(z => z.path === '/api/attendance/pauza'), 4000);
  tvrdi('P2: Konec pauzy pošle {action: end}', (stav.zapisy ?? []).some(z => z.telo.action === 'end'), JSON.stringify(stav.zapisy));
  await w.screenshot({ path: SNIMKY + 'k84-vyplaty-pauza-390.png' });
  await ctx.close();
}
// Kolo 93 (Martin: „Když si někdo zapne pauzu a pak ji ukončí, tak se mu to zapne jako nová směna"): po Konci
// pauzy běží záznam od 12:30, ale Píchačky pokračují ve směně od 08:00 — „Příchod 08:00", stopky 7:30 bez pauzy
// (16:00 − 08:00 − 30 min), ne „Příchod 12:30" od nuly ani „+270 min po začátku" proti plánu 08:00.
{
  const poPauze = { ...ZAM, roster: [{ ...ZAM.roster[0], openSince: prahaISO(DNES, '12:30'), shiftSince: prahaISO(DNES, '08:00'), breakMs: 30 * 60_000, breakSince: null, shiftStart: '08:00:00', shiftEnd: '16:30:00', shiftDate: DNES }],
    entries: [
      { id: 722, employeeId: 16, clockIn: prahaISO(DNES, '12:30'), clockOut: null, source: 'break', breakAfter: 720, note: null, updatedBy: null },
      { id: 720, employeeId: 16, clockIn: prahaISO(DNES, '08:00'), clockOut: prahaISO(DNES, '12:00'), source: 'self', note: null, updatedBy: null },
      ...ZAM.entries.map(e => (e.id === 701 ? { ...e, clockOut: prahaISO(den(1), '16:00') } : e)),
    ] };
  const { ctx, p } = await zam({ dochazka: poPauze, url: '/employee/shifts?view=home', plocha: 'zamestnanec.domu', fix: FIX_DOMU });
  const w = widget(p, 'dochazka.moje_pichacky');
  await dokud(() => w.getByRole('button', { name: 'Začít pauzu' }).isVisible().catch(() => false), 20000);
  const t5 = await text(w);
  tvrdi('P5 (390): po konci pauzy pokračuje směna — „Příchod 08:00", ne „Příchod 12:30"', /Příchod 08:00/.test(t5) && !/Příchod 12:30/.test(t5), t5);
  tvrdi('P5: stopky ukazují odpracovanou směnu bez pauzy (7:30:xx), ne čas od konce pauzy (3:30:xx)', /\b7:3\d:\d\d\b/.test(t5) && !/\b3:3\d:\d\d\b/.test(t5), t5);
  tvrdi('P5: poznámka „bez pauzy 30 min" a žádné „+… min po začátku" proti plánu 08:00', /bez pauzy 30 min/.test(t5) && !/min po začátku/.test(t5), t5);
  await w.screenshot({ path: SNIMKY + 'k93-pichacky-po-pauze-390.png' });
  await ctx.close();
}
// Pauza z rosteru (breakSince) bez záznamů dne — pauza začatá před půlnocí nebo vedení bez dochazka.zobrazit:
// Píchačky musí nabídnout Konec pauzy, ne „Odpíchnout příchod" (nová směna).
{
  const naPauzeRoster = { ...ZAM, roster: [{ ...ZAM.roster[0], openSince: null, breakSince: prahaISO(DNES, '15:50'), shiftSince: prahaISO(DNES, '08:00'), breakMs: 0 }], entries: [] };
  const { ctx, p, stav } = await zam({ dochazka: naPauzeRoster, url: '/employee/shifts?view=home', plocha: 'zamestnanec.domu', fix: FIX_DOMU });
  const w = widget(p, 'dochazka.moje_pichacky');
  const je = await dokud(() => w.getByRole('button', { name: 'Konec pauzy' }).isVisible().catch(() => false), 20000);
  const t6 = await text(w);
  tvrdi('P6 (390): pauza jen z rosteru → Konec pauzy, ne Odpíchnout příchod; „dnes odpracováno 7 h 50 min"', je && !(await w.getByRole('button', { name: 'Odpíchnout příchod' }).count()) && /Pauza od 15:50/.test(t6) && /7 h 50 min/.test(t6), t6);
  await w.getByRole('button', { name: 'Konec pauzy' }).click();
  tvrdi('P6: Konec pauzy pošle {action: end} (pokračování směny), žádný příchod', await dokud(() => (stav.zapisy ?? []).some(z => z.path === '/api/attendance/pauza' && z.telo.action === 'end'), 4000)
    && !(stav.zapisy ?? []).some(z => z.path === '/api/attendance' && z.telo?.action === 'in'), JSON.stringify(stav.zapisy));
  await ctx.close();
}
{
  const dlouha = { ...ZAM, roster: [{ ...ZAM.roster[0], openSince: prahaISO(DNES, '08:30') }],
    entries: [{ id: 720, employeeId: 16, clockIn: prahaISO(DNES, '08:30'), clockOut: null, source: 'self', note: null, updatedBy: null }, ...ZAM.entries.map(e => (e.id === 701 ? { ...e, clockOut: prahaISO(den(1), '16:00') } : e))] };
  const { ctx, p, stav } = await zam({ dochazka: dlouha, url: '/employee/shifts?view=home', plocha: 'zamestnanec.domu', fix: FIX_DOMU });
  const w = widget(p, 'dochazka.moje_pichacky');
  await dokud(() => w.getByRole('button', { name: 'Odpíchnout odchod' }).isVisible().catch(() => false), 20000);
  await w.getByRole('button', { name: 'Odpíchnout odchod' }).click();
  tvrdi('P3 (390): odchod po 7,5 h bez pauzy se zeptá „Měl/a jsi pauzu?"', await dokud(() => dialog(p).getByText('Měl/a jsi pauzu?').isVisible().catch(() => false), 4000));
  tvrdi('P3: žádný POST /api/attendance neodešel před odpovědí', !(stav.zapisy ?? []).some(z => z.path === '/api/attendance'));
  await p.waitForTimeout(900); // list dojede zdola
  const bbOtazka = await dialog(p).boundingBox();
  tvrdi('P3 (390): otázka je list zdola, celý na obrazovce', !!bbOtazka && bbOtazka.y >= 0 && Math.abs(bbOtazka.y + bbOtazka.height - TEL.height) < 2, JSON.stringify(bbOtazka));
  await p.screenshot({ path: SNIMKY + 'k84-vyplaty-otazka-pauzy-390.png' });
  await dialog(p).getByRole('button', { name: 'Ano, 30 min (doplnit)' }).click();
  await dokud(() => (stav.zapisy ?? []).some(z => z.path === '/api/attendance/pauza'), 4000);
  tvrdi('P3: „Ano" pošle {action: doplnit, minuty: 30}', (stav.zapisy ?? []).some(z => z.telo.action === 'doplnit' && z.telo.minuty === 30), JSON.stringify(stav.zapisy));
  await ctx.close();
}

await konec();
