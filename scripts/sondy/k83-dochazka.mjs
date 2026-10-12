// Kolo 7, balík R7-2 — Docházka: Píchačky s dnešní směnou, „Moje docházka" po dnech a export CSV.
//
// Zaměstnanec (telefon 390 × 844, dotyk):
//  • Domů: Píchačky ukážou „Dnes podle rozvrhu 14:00–22:00" a po příchodu ve 14:12 chip
//    „+12 min po začátku"; před příchodem „Směna začíná za 45 min"; bez směny „Dnes nemáš
//    směnu v rozvrhu". Nic nepřetéká.
//  • Moje směny: widget Moje docházka (M) je hned pod Můj výdělek nad ohybem, ukáže pět
//    nejnovějších dní a „…a dalších N dní", zapomenutý odchod, „ručně" a součet měsíce;
//    velký (L) celý měsíc; bez přetečení i německy a polsky; prázdný měsíc větou.
// Vedení (1280): Export CSV má sloupce Plán od, Plán do, Odchylka (min), Poznámka, Upravil.
//
// Čas je pevný: prohlížeč žije 20. dne aktuálního měsíce v 16:00 (Praha), ať měsíc nese
// dost dní a fixtury s tokeny "@D-<n>T<HH:MM>" (pražský čas před n dny jako ISO) a
// "D-<n>" (pražský den) nezávisí na tom, kdy sonda běží.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, roleMine, DIR, OUT, BASE, FIX_DOMU } from './k68-spolecne.mjs';

const TEL = { width: 390, height: 844 };
const BARISTA = roleMine('barista');

const prahaDen = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(ms));
const prahaISO = (den, hm) => {
  const odhad = new Date(`${den}T${hm}:00Z`);
  const tz = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Prague', timeZoneName: 'longOffset' }).formatToParts(odhad).find(x => x.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  return new Date(`${den}T${hm}:00${tz.replace('GMT', '') || '+00:00'}`).toISOString();
};
const DNES = `${prahaDen(Date.now()).slice(0, 7)}-20`;
const TED = Date.parse(prahaISO(DNES, '16:00'));
const POSUN = TED - Date.now();
/** Pražský den „RRRR-MM-DD" n dní před pevným dneškem. */
const den = (n) => { const d = new Date(`${DNES}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const skutecneChyby = (chyby) => chyby.filter(c => !/Minified React error #418|Hydration|hydrat/i.test(c));

const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  t = t.replace(/"@D-(\d+)T(\d\d:\d\d)"/g, (_, n, hm) => `"${prahaISO(den(Number(n)), hm)}"`);
  t = t.replace(/"D-(\d+)"/g, (_, n) => `"${den(Number(n))}"`);
  // Tokeny fixtur k69-b2 (vedení): minuty před „teď" a pražské dny.
  t = t.replace(/"@HM([+-]\d+)"/g, (_, m) => `"${new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(TED + Number(m) * 60000))}"`);
  t = t.replace(/"@(\d+)"/g, (_, m) => `"${new Date(TED - Number(m) * 60000).toISOString()}"`);
  for (const [k, v] of Object.entries({ DNES: den(0), VCERA: den(1), PREDEVCIREM: den(2), PRED5: den(5) })) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t);
};
const ZAM = nacti('k83-dochazka-zamestnanec');
const FIX_MOJE = nacti('k83-dochazka-rozlozeni-moje');

/** Podvrh API zaměstnance: docházka podle scénáře, ostatní z obecných fixtur (k68-spolecne). */
const podvrhZam = (dochazka) => (req, json) => {
  const path = new URL(req.url()).pathname;
  if (path === '/api/attendance' && req.method() === 'GET') return json(dochazka);
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

async function zam({ dochazka, url, plocha, fix, jazyk, viewport = TEL, mobil = true }) {
  const k = await kontext({ role: 'employee', viewport, mobil, mineData: BARISTA, fix, posunCasu: POSUN, dalsi: podvrhZam(dochazka) });
  if (jazyk) await k.ctx.addCookies([{ name: 'managero-lang', value: jazyk, domain: 'localhost', path: '/' }]);
  await k.p.goto(BASE + url, { waitUntil: 'networkidle' });
  await k.p.locator(`[data-plocha="${plocha}"] li[data-instance]:not([hidden])`).first().waitFor({ timeout: 20000 });
  await k.p.waitForTimeout(1200);
  return k;
}

// Domů: na směně od 14:12 (rozvrh 14:00–22:00) — zapomenutý včerejšek uzavřený.
const naSmene = {
  ...ZAM,
  roster: [{ ...ZAM.roster[0], openSince: prahaISO(DNES, '14:12') }],
  entries: [{ id: 720, employeeId: 16, clockIn: prahaISO(DNES, '14:12'), clockOut: null, source: 'self', note: null, updatedBy: null },
    ...ZAM.entries.map(e => (e.id === 701 ? { ...e, clockOut: prahaISO(den(1), '16:00') } : e))],
};

// ---------------------------------------------------------------------------
// Domů — Píchačky
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await zam({ dochazka: naSmene, url: '/employee/shifts?view=home', plocha: 'zamestnanec.domu', fix: FIX_DOMU });
  const w = widget(p, 'dochazka.moje_pichacky');
  await dokud(async () => /rozvrhu/.test(await text(w)), 6000);
  const t1 = await text(w);
  tvrdi('P1 (390): Píchačky ukážou „Dnes podle rozvrhu 14:00–22:00"', /Dnes podle rozvrhu 14:00–22:00/.test(t1), t1);
  tvrdi('P1 (390): …a po příchodu ve 14:12 chip „+12 min po začátku"', /\+12 min po začátku/.test(t1), t1);
  tvrdi('P1 (390): hlavní akce „Odpíchnout odchod" je nad ohybem', await dokud(async () => { const b = await w.getByRole('button', { name: 'Odpíchnout odchod' }).boundingBox(); return !!b && b.y + b.height <= TEL.height; }, 2000));
  const pr = await preteceni(p);
  tvrdi('P1 (390): bez přetečení dokumentu i widgetů', pr.dokument <= 1 && pr.widgety.length === 0, JSON.stringify(pr));
  tvrdi('P1: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await p.screenshot({ path: OUT + 'k83-dochazka-domu-tel.png' });
  await ctx.close();
}
{
  const pred = { ...ZAM, roster: [{ ...ZAM.roster[0], openSince: null, shiftStart: '16:45', shiftEnd: '23:00' }], entries: ZAM.entries.filter(e => e.id !== 701) };
  const { ctx, p } = await zam({ dochazka: pred, url: '/employee/shifts?view=home', plocha: 'zamestnanec.domu', fix: FIX_DOMU });
  await dokud(async () => /rozvrhu/.test(await text(widget(p, 'dochazka.moje_pichacky'))), 6000);
  const t2 = await text(widget(p, 'dochazka.moje_pichacky'));
  tvrdi('P2 (390): před příchodem „Dnes podle rozvrhu 16:45–23:00" a „Směna začíná za 45 min"', /Dnes podle rozvrhu 16:45–23:00/.test(t2) && /Směna začíná za 45 min/.test(t2), t2);
  await ctx.close();
}
{
  const bez = { ...ZAM, roster: [{ ...ZAM.roster[0], openSince: null, shiftStart: null, shiftEnd: null, shiftDate: null }], entries: ZAM.entries.filter(e => e.id !== 701) };
  const { ctx, p } = await zam({ dochazka: bez, url: '/employee/shifts?view=home', plocha: 'zamestnanec.domu', fix: FIX_DOMU, jazyk: 'de' });
  await dokud(async () => /Dienstplan/.test(await text(widget(p, 'dochazka.moje_pichacky'))), 6000);
  const t3 = await text(widget(p, 'dochazka.moje_pichacky'));
  tvrdi('P3 (390, de): bez směny „Heute keine Schicht im Dienstplan"', /Heute keine Schicht im Dienstplan/.test(t3), t3);
  const pr = await preteceni(p);
  tvrdi('P3 (390, de): bez přetečení', pr.dokument <= 1 && pr.widgety.length === 0, JSON.stringify(pr));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Moje směny — Moje docházka
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await zam({ dochazka: ZAM, url: '/employee/shifts?view=my-shifts', plocha: 'zamestnanec.moje_smeny', fix: FIX_MOJE });
  const w = widget(p, 'dochazka.moje_zaznamy');
  await dokud(async () => (await w.locator('li.list-row').count()) > 0, 4000);
  const t1 = await text(w);
  const radky = await w.locator('li.list-row').count();
  tvrdi('M1 (390): Moje docházka (M) ukáže pět nejnovějších dní', radky === 5, `${radky} řádků`);
  // 12 dní v měsíci (D-1…D-13 bez D-11), M ukáže 5 → „…a dalších 7 dní".
  tvrdi('M1 (390): …a řekne „…a 7 dalších dní"', /…a 7 dalších dní/.test(t1), t1.slice(-200));
  tvrdi('M1 (390): včerejšek bez odchodu má „Zapomenutý odchod?"', /08:03 – …/.test(t1) && /Zapomenutý odchod\?/.test(t1), t1.slice(0, 300));
  tvrdi('M1 (390): ručně zapsaný i vedením opravený den má „ručně" a důvod pod časem', (t1.match(/ručně/g) ?? []).length >= 2 && /Tablet nešel, zapsala vedoucí\./.test(t1), t1);
  tvrdi('M1 (390): přestávka = jeden den se dvěma úseky', /08:00 – 12:00, 12:30 – 16:05/.test(t1), t1);
  tvrdi('M1 (390): v hlavičce chip se součtem měsíce (hodiny)', /\d+ h \d\d min/.test(await text(w.locator('h2').locator('..'))) || /· \d+ h/.test(t1), t1.slice(0, 120));
  const box = await w.boundingBox();
  const vydelek = await widget(p, 'moje.vydelek').boundingBox();
  tvrdi('M1 (390): Moje docházka začíná nad ohybem a pod Můj výdělek', !!box && !!vydelek && box.y < TEL.height && box.y > vydelek.y, JSON.stringify({ box, vydelek }));
  const pr = await preteceni(p);
  tvrdi('M1 (390): bez přetečení dokumentu i widgetů', pr.dokument <= 1 && pr.widgety.length === 0, JSON.stringify(pr));
  tvrdi('M1: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await p.screenshot({ path: OUT + 'k83-dochazka-moje-smeny-tel.png' });
  await w.screenshot({ path: OUT + 'k83-dochazka-moje-zaznamy-m-tel.png' });
  await ctx.close();
}
for (const jazyk of [null, 'de', 'pl']) {
  for (const sirka of [320, 390]) {
    const fix = { ...FIX_MOJE, polozky: FIX_MOJE.polozky.map(x => (x.widget === 'dochazka.moje_zaznamy' ? { ...x, velikost: 'L' } : x)) };
    const { ctx, p } = await zam({ dochazka: ZAM, url: '/employee/shifts?view=my-shifts', plocha: 'zamestnanec.moje_smeny', fix, jazyk, viewport: { width: sirka, height: 844 } });
    const w = widget(p, 'dochazka.moje_zaznamy');
    await dokud(async () => (await w.locator('li.list-row').count()) > 0, 4000);
    const radky = await w.locator('li.list-row').count();
    const pr = await preteceni(p);
    tvrdi(`M2 (${sirka}, ${jazyk ?? 'cs'}): Moje docházka L ukáže celý měsíc (12 dní) bez „…a dalších"`, radky === 12, `${radky} řádků`);
    tvrdi(`M2 (${sirka}, ${jazyk ?? 'cs'}): bez přetečení dokumentu i widgetů`, pr.dokument <= 1 && pr.widgety.length === 0, JSON.stringify(pr));
    if (sirka === 390) await w.screenshot({ path: OUT + `k83-dochazka-moje-zaznamy-l-${jazyk ?? 'cs'}-tel.png` });
    await ctx.close();
  }
}
{
  const prazdno = { ...ZAM, roster: [{ ...ZAM.roster[0], openSince: null }], entries: [] };
  const { ctx, p } = await zam({ dochazka: prazdno, url: '/employee/shifts?view=my-shifts', plocha: 'zamestnanec.moje_smeny', fix: FIX_MOJE });
  const w = widget(p, 'dochazka.moje_zaznamy');
  tvrdi('M3 (390): prázdný měsíc řekne „Tento měsíc zatím nic neodpíchnuto."', await dokud(async () => /Tento měsíc zatím nic neodpíchnuto\./.test(await text(w)), 4000), await text(w));
  await ctx.close();
}
{
  const k = await kontext({ role: 'employee', viewport: { width: 1280, height: 900 }, mineData: BARISTA, fix: FIX_MOJE, posunCasu: POSUN, dalsi: podvrhZam(ZAM) });
  await k.p.goto(BASE + '/employee/shifts?view=my-shifts', { waitUntil: 'networkidle' });
  await k.p.locator('[data-plocha="zamestnanec.moje_smeny"] li[data-instance]:not([hidden])').first().waitFor({ timeout: 20000 });
  await k.p.waitForTimeout(1200);
  const w = widget(k.p, 'dochazka.moje_zaznamy');
  tvrdi('M4 (1280): Moje docházka na počítači s pěti dny', (await w.locator('li.list-row').count()) === 5);
  await k.p.screenshot({ path: OUT + 'k83-dochazka-moje-smeny-desk.png' });
  await k.ctx.close();
}
{
  // Chyba serveru: jen widget, s „Zkusit znovu".
  const k = await kontext({ role: 'employee', viewport: TEL, mobil: true, mineData: BARISTA, fix: FIX_MOJE, posunCasu: POSUN,
    dalsi: (req, json) => (new URL(req.url()).pathname === '/api/attendance' && req.method() === 'GET' ? json({ error: 'Server spadl' }, 500) : undefined) });
  await k.p.goto(BASE + '/employee/shifts?view=my-shifts', { waitUntil: 'networkidle' });
  await k.p.locator('[data-plocha="zamestnanec.moje_smeny"] li[data-instance]:not([hidden])').first().waitFor({ timeout: 20000 });
  await k.p.waitForTimeout(1200);
  const w = widget(k.p, 'dochazka.moje_zaznamy');
  tvrdi('M5 (390): výpadek API = „Widget se nenačetl" se „Zkusit znovu" jen v Moje docházka', await dokud(() => w.getByText('Widget se nenačetl').isVisible(), 4000)
    && await w.getByRole('button', { name: 'Zkusit znovu' }).isVisible());
  await k.ctx.close();
}

// ---------------------------------------------------------------------------
// Vedení — export CSV
// ---------------------------------------------------------------------------
{
  const FIX_DOCHAZKA = nacti('k69-b2-rozlozeni-dochazka');
  const k = await kontext({ viewport: { width: 1280, height: 900 }, fix: FIX_DOCHAZKA, posunCasu: POSUN,
    dalsi: (req, json) => (new URL(req.url()).pathname === '/api/attendance' && req.method() === 'GET' ? json(nacti('k69-b2-attendance')) : undefined) });
  await otevri(k.p, '/employer/overview?view=attendance', 'vedeni.dochazka');
  const [dl] = await Promise.all([k.p.waitForEvent('download', { timeout: 10000 }), k.p.getByRole('button', { name: 'Export CSV' }).click()]);
  const csv = readFileSync(await dl.path(), 'utf8').replace(/^\uFEFF/, '');
  const hlava = csv.split('\n')[0];
  tvrdi('C1 (1280): CSV má sloupce Plán od, Plán do, Odchylka (min), Poznámka, Upravil', ['Plán od', 'Plán do', 'Odchylka (min)', 'Poznámka', 'Upravil'].every(s => hlava.includes(`"${s}"`)), hlava);
  tvrdi('C1: řádek Petry s plánem 08:00–16:00 a odchylkou −7 min', /"Petra Malá";"08:12";"16:05";"7:53";"tablet";"08:00";"16:00";"-7"/.test(csv), csv.split('\n').find(r => r.includes('08:12')) ?? '');
  tvrdi('C1: ručně upravený záznam nese důvod a kdo upravil', /"Zapomněla se odpíchnout, doplněno podle kamery\.";"Martin Nemeškal"/.test(csv), csv.split('\n').find(r => r.includes('kamery')) ?? '');
  await k.ctx.close();
}

await konec();
