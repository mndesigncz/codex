// Kolo 8, balík R8-2 — Záznamy docházky a tablet. Vedení na 390 × 844 (dotyk) i 1280: pásy lidí a pozic
// s počty, „Jen k ověření", souhrn vybraného člověka, řádek se spojenou pauzou, chipy polohy a offline,
// uzavřený měsíc (zámek místo tužky + hláška), „Pravidla píchání" (PUT), CSV s pauzou a polohou jen za
// vybraného člověka; němčina a polština na 320/390 bez přetečení. Tablet 768 × 1024: pauza přes výběr
// člověka a PIN (break_start / break_end), řádek a dlaždice „na pauze", píchání bez internetu (fronta,
// PIN proti otisku, pás nahoře) a odeslání fronty po připojení (POST /api/attendance/sync).
//
// Čas je pevný: prohlížeč žije 20. dne aktuálního měsíce v 16:00 (Praha), ať zámek minulého měsíce
// a fixtury s tokeny "@D-<n>T<HH:MM>", "D-<n>", "@MINULY-<dd>T<HH:MM>", "MINULY-01", "MINULY-KONEC"
// nezávisí na tom, kdy sonda běží. Zápisy se tvrdí proti tomu, co UI pošle na API (podvrh si těla zapíše).
//   SONDY_ZAKLAD=http://localhost:3432 node scripts/sondy/k84-dochazka.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { kontext, konec, tvrdi, otevri, dokud, roleMine, jdi, DIR, OUT, BASE } from './k68-spolecne.mjs';

const TEL = { width: 390, height: 844 };
const PC = { width: 1280, height: 900 };
const TABLET = { width: 768, height: 1024 };
const KIOSK = roleMine('kiosk');
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
  t = t.replace(/"@MINULY-(\d\d)T(\d\d:\d\d)"/g, (_, dd, hm) => `"${prahaISO(`${MINULY}-${dd}`, hm)}"`);
  t = t.replace(/"@D-(\d+)T(\d\d:\d\d)"/g, (_, n, hm) => `"${prahaISO(den(Number(n)), hm)}"`);
  t = t.replace(/"D-(\d+)"/g, (_, n) => `"${den(Number(n))}"`);
  for (const [k, v] of Object.entries({ DNES: den(0), 'MESIC-01': `${MESIC}-01`, 'MINULY-01': `${MINULY}-01`, 'MINULY-KONEC': MINULY_KONEC })) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t);
};
const ATT = nacti('k84-dochazka-attendance');
const FIX_DOCHAZKA = nacti('k69-b2-rozlozeni-dochazka');
const FIX_SMENA = nacti('k69-b9-rozlozeni-smena');

/** Podvrh API vedení: docházka (s pauzou, polohou, offline, zámkem), zápisy do `stav.zapisy`. */
const podvrhVedeni = (att = ATT) => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  if (req.method() !== 'GET' && /^\/api\/attendance/.test(path)) {
    (stav.zapisy ??= []).push({ m: req.method(), path, telo: req.postData() ? JSON.parse(req.postData()) : null, q: url.search });
    if (req.method() === 'PUT') return json({ ok: true, pravidlaPichani: JSON.parse(req.postData()).pravidlaPichani });
    return json({ ok: true });
  }
  if (req.method() !== 'GET') return undefined;
  if (path === '/api/attendance') return json(att);
  if (path === '/api/closings') return json(nacti('k69-b2-closings'));
  if (path === '/api/teams') return json(nacti('k69-b2-teams'));
  return undefined;
};

const nastroj = (p) => p.locator('[data-plocha="vedeni.dochazka"] li[data-widget="nastroj"]');
const text = async (loc) => ((await loc.count()) ? (await loc.first().innerText()) : '').replace(/\u00a0/g, ' ');
const preteceni = (p) => p.evaluate(() => {
  const okno = window.innerWidth;
  const sirkaDok = document.documentElement.scrollWidth - okno;
  const widgety = [...document.querySelectorAll('[data-plocha] li[data-widget]:not([hidden]) section, [data-plocha] li[data-widget="nastroj"] .card')]
    .filter(s => s.scrollWidth > s.clientWidth + 1).map(s => s.closest('li')?.getAttribute('data-widget'));
  return { dokument: sirkaDok, widgety };
});

/** Vedení: období 3 měsíce (ať je vidět i zamčený minulý měsíc), jazyk podle volby. */
async function vedeni({ viewport = TEL, mobil = true, jazyk = null, att = ATT } = {}) {
  const k = await kontext({ viewport, mobil, fix: FIX_DOCHAZKA, posunCasu: POSUN, dalsi: podvrhVedeni(att) });
  await k.ctx.addInitScript(([od, doD]) => {
    try {
      localStorage.setItem('managero-obdobi-dochazka-stranka', JSON.stringify({ preset: '90_dni', od, do: doD, dnyTydne: [], hrubost: 'auto' }));
      localStorage.removeItem('managero-volba-dochazka-filtr-clovek');
      localStorage.removeItem('managero-volba-dochazka-filtr-pozice');
      localStorage.removeItem('managero-volba-dochazka-filtr-overeni');
    } catch { /* soukromé okno */ }
  }, [den(89), den(0)]);
  if (jazyk) await k.ctx.addCookies([{ name: 'managero-lang', value: jazyk, domain: 'localhost', path: '/' }]);
  await otevri(k.p, '/employer/overview?view=attendance', 'vedeni.dochazka');
  await dokud(async () => (await nastroj(k.p).locator('li.list-row').count()) > 0, 8000);
  return k;
}

// ---------------------------------------------------------------------------
// Vedení (390): pásy, souhrn, pauza, poloha, offline, zámek
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await vedeni();
  const n = nastroj(p);
  const lide = n.locator('[data-pas="lide"]');
  tvrdi('V1 (390): pás lidí s počty — Všichni 9, Eva 3, Petra 3, Honza 2, Martin 1', await dokud(async () => /Všichni\s*9/.test((await text(lide)).replace(/\n/g, ' ')), 4000)
    && (await lide.locator('button[data-clovek]').evaluateAll(b => b.map(x => x.getAttribute('data-clovek')))).join(',') === ',16,17,18,15', (await text(lide)).replace(/\n/g, ' '));
  const pozice = n.locator('[data-pas="pozice"]');
  const tp = (await text(pozice)).replace(/\n/g, ' ');
  tvrdi('V1 (390): pás pozic Barista 6, Kuchař 2, Bez pozice 1 a „Jen k ověření 4"', /Barista\s*6/.test(tp) && /Kuchař\s*2/.test(tp) && /Bez pozice\s*1/.test(tp) && /Jen k ověření\s*4/.test(tp), tp);
  tvrdi('V1 (390): pilulky jsou dotykové cíle ≥ 44 px', await lide.locator('button').first().evaluate(b => { const s = getComputedStyle(b, '::before'); const r = b.getBoundingClientRect(); return r.height >= 32 && (parseFloat(s.height) >= 44 || r.height >= 44); }));
  const radky = () => n.locator('li.list-row');
  tvrdi('V1 (390): 9 řádků (dva záznamy Evy kolem pauzy jsou jeden)', (await radky().count()) === 9, String(await radky().count()));
  const eva = n.locator('li.list-row', { hasText: '09:02 – 17:31' });
  const te = (await text(eva)).replace(/\n/g, ' | ');
  tvrdi('V1 (390): řádek Evy „09:02 – 17:31 · pauza 30 min" s chipem pauza a 7 h 59 min', /09:02 – 17:31 · pauza 30 min/.test(te) && /\| pauza$/.test(te) && /7 h 59 min/.test(te), te);
  const honza = n.locator('li.list-row', { hasText: '10:00 – 18:00' });
  tvrdi('V1 (390): příchod z telefonu mimo okruh má chip „mimo podnik 1,2 km"', /mimo podnik 1,2 km/.test(await text(honza)), await text(honza));
  tvrdi('V1 (390): příchod u podniku „z telefonu · 40 m", bez polohy „bez polohy"', /z telefonu · 40 m/.test(await text(n.locator('li.list-row', { hasText: '08:12 – 16:05' }))) && /bez polohy/.test(await text(n.locator('li.list-row', { hasText: '11:00 – 19:00' }))));
  tvrdi('V1 (390): píchnutí doručené po výpadku má chip „offline" a nahoře počet', /offline/.test(await text(n.locator('li.list-row', { hasText: '09:00 – 17:00' }).first())) && /1 píchnutí doručeno po výpadku/.test(await text(n)));
  // Zámek: minulý měsíc má u dne „uzavřeno", místo tužky zámek, hláška po klepnutí.
  const zamek = n.locator('button[data-zamek]');
  tvrdi('V1 (390): v uzavřeném měsíci je místo tužky zámek a u dne chip „uzavřeno"', (await zamek.count()) === 1 && /uzavřeno/i.test(await text(n)), String(await zamek.count()));
  await zamek.scrollIntoViewIfNeeded();
  await zamek.click();
  const hlaska = p.locator('[role="status"]', { hasText: 'je uzavřené — otevři ho ve Výplatní listině' });
  tvrdi('V1 (390): klepnutí na zámek řekne „<Měsíc> je uzavřené — otevři ho ve Výplatní listině."', await dokud(() => hlaska.isVisible(), 3000), await text(p.locator('[role="status"]')));
  tvrdi('V1 (390): zamčený den nemá tužku ani koš', (await n.locator('li.list-row', { hasText: '09:00 – 17:00' }).last().getByRole('button', { name: /Upravit čas|Smazat záznam|Upravit nebo smazat/ }).count()) === 0);
  // Filtr na Evu: souhrn nahoře, řádky jen její, druhý klik ruší.
  await p.evaluate(() => window.scrollTo(0, 0));
  await lide.locator('button[data-clovek="16"]').click();
  tvrdi('V1 (390): klik na Evu zúží seznam na 3 řádky a ukáže souhrn (Odpracováno, Směny 3, Pauzy 30 min)', await dokud(async () => (await radky().count()) === 3, 3000)
    && /Odpracováno/i.test(await text(n.locator('[data-statrow]'))) && /Pauzy/i.test(await text(n.locator('[data-statrow]'))) && /30 min/.test(await text(n.locator('[data-statrow]'))), (await text(n.locator('[data-statrow]'))).replace(/\n/g, ' | '));
  tvrdi('V1 (390): chip v nadpisu „3 z 9"', /3 z 9/.test(await text(n.locator('h2'))), await text(n.locator('h2')));
  await p.screenshot({ path: SNIMKY + 'k84-dochazka-zaznamy-eva-tel.png' });
  await lide.locator('button[data-clovek="16"]').click();
  tvrdi('V1 (390): druhý klik filtr zruší (9 řádků)', await dokud(async () => (await radky().count()) === 9, 3000));
  // Jen k ověření: pozdě, mimo podnik, poznámka, zapomenutý odchod.
  await pozice.locator('button[data-jen-overeni]').click();
  tvrdi('V1 (390): „Jen k ověření" nechá 4 řádky (pozdě, mimo podnik, poznámka, zapomenutý odchod)', await dokud(async () => (await radky().count()) === 4, 3000), String(await radky().count()));
  const to = (await text(n)).replace(/\n/g, ' ');
  tvrdi('V1 (390): …a jsou to ty správné', /\+12 min pozdě/.test(to) && /mimo podnik/.test(to) && /Zkontrolovat/.test(to) && /Zapomenutý odchod\?/.test(to), to.slice(0, 600));
  await pozice.locator('button[data-jen-overeni]').click();
  await dokud(async () => (await radky().count()) === 9, 3000);
  await pozice.locator('button[data-pozice="Kuchař"]').click();
  tvrdi('V1 (390): pozice Kuchař = 2 řádky Honzy', await dokud(async () => (await radky().count()) === 2, 3000));
  await pozice.locator('button[data-pozice="Kuchař"]').click();
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: SNIMKY + 'k84-dochazka-zaznamy-tel.png' });
  const pr = await preteceni(p);
  tvrdi('V1 (390): bez přetečení', pr.dokument <= 1 && pr.widgety.length === 0, JSON.stringify(pr));
  tvrdi('V1: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  tvrdi('V1: nic se nezapsalo (jen čtení)', !(stav.zapisy ?? []).length);
  await ctx.close();
}

// Úprava řádku s pauzou: příchod na první část, odchod na poslední (dva PATCHe), pauza zůstává.
{
  const { ctx, p, stav } = await vedeni();
  const n = nastroj(p);
  const eva = n.locator('li.list-row', { hasText: '09:02 – 17:31' });
  // v4 (V4): úprava a smazání řádku jsou v jednom „···".
  await eva.getByRole('button', { name: 'Upravit nebo smazat záznam: Eva Testová' }).click();
  await p.getByRole('menuitem', { name: 'Upravit čas…' }).click();
  const okno = p.getByRole('dialog', { name: 'Upravit čas na směně' });
  tvrdi('V2 (390): okno úpravy říká, že pauza 12:00–12:30 (30 min) zůstane', await dokud(() => okno.getByText(/Pauza 12:00–12:30 \(30 min\) zůstane/).isVisible(), 3000));
  const doPole = okno.locator('#dochazka-uprava-do');
  const hodnota = await doPole.inputValue();
  await doPole.fill(hodnota.replace(/T\d\d:\d\d$/, 'T17:45'));
  await okno.getByRole('button', { name: 'Uložit' }).click();
  tvrdi('V2 (390): uložení pošle PATCH první části (příchod + důvod) a PATCH poslední části (odchod 17:45)', await dokud(() => (stav.zapisy ?? []).filter(z => z.m === 'PATCH').length === 2, 4000)
    && stav.zapisy.some(z => z.m === 'PATCH' && z.telo.id === 901 && z.telo.clockIn && z.telo.clockOut === undefined)
    && stav.zapisy.some(z => z.m === 'PATCH' && z.telo.id === 902 && /T1[5-7]:45:00\.000Z$/.test(z.telo.clockOut)), JSON.stringify(stav.zapisy));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Vedení (1280): Pravidla píchání a CSV za vybraného člověka
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await vedeni({ viewport: PC, mobil: false });
  const n = nastroj(p);
  await p.screenshot({ path: SNIMKY + 'k84-dochazka-zaznamy-desk.png' });
  await n.locator('.card').first().screenshot({ path: SNIMKY + 'k84-dochazka-zaznamy-nastroj-desk.png' });
  const pr = await preteceni(p);
  tvrdi('V3 (1280): bez přetečení', pr.dokument <= 1 && pr.widgety.length === 0, JSON.stringify(pr));
  await p.getByRole('button', { name: 'Další akce' }).first().click();
  const polozka = p.getByRole('menuitem', { name: /Pravidla píchání/ });
  tvrdi('V3 (1280): „···" nabízí Pravidla píchání', await dokud(() => polozka.isVisible(), 3000));
  await polozka.click();
  const okno = p.getByRole('dialog', { name: 'Pravidla píchání' });
  tvrdi('V3 (1280): okno s přepínačem (zapnuto), poloměrem 200 m a polohou podniku', await dokud(() => okno.isVisible(), 3000)
    && (await okno.getByRole('switch').getAttribute('aria-checked')) === 'true'
    && /50\.0875, 14\.4213/.test(await text(okno.locator('[data-poloha-podniku]'))), await text(okno));
  await okno.getByRole('tab', { name: '500 m' }).click();
  await okno.getByRole('button', { name: 'Uložit' }).click();
  tvrdi('V3 (1280): Uložit pošle PUT /api/attendance s pravidlaPichani (zapnuto, 500 m, poloha)', await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'PUT'), 4000)
    && (() => { const z = stav.zapisy.find(x => x.m === 'PUT'); return z.telo.pravidlaPichani.zapnuto === true && z.telo.pravidlaPichani.polomerM === 500 && z.telo.pravidlaPichani.lat === 50.0875; })(), JSON.stringify(stav.zapisy));
  tvrdi('V3 (1280): po uložení hláška „Uloženo. … dál než 500 m …"', await dokud(() => p.locator('[role="status"]', { hasText: 'dál než 500 m' }).isVisible(), 3000));
  // CSV jen za Evu, s Pauza (min) a Poloha.
  await n.locator('[data-pas="lide"] button[data-clovek="16"]').click();
  await dokud(async () => (await n.locator('li.list-row').count()) === 3, 3000);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.getByRole('button', { name: 'Export CSV' }).first().click()]);
  const csv = readFileSync(await dl.path(), 'utf8').replace(/^\uFEFF/, '');
  const radkyCsv = csv.split('\n');
  tvrdi('V3 (1280): CSV má sloupce Pauza (min) a Poloha za Upravil', /"Upravil";"Pauza \(min\)";"Poloha"/.test(radkyCsv[0]), radkyCsv[0]);
  tvrdi('V3 (1280): CSV s filtrem na Evu nese jen Evu (4 záznamy) a pauzu 30 u záznamu po pauze', radkyCsv.length === 5 && radkyCsv.slice(1).every(r => r.includes('"Eva Testová"')) && radkyCsv.some(r => /"12:30";"17:31";"5:01";"po pauze";.*;"30";""/.test(r)), radkyCsv.join(' / '));
  tvrdi('V3 (1280): název souboru nese jméno', /dochazka-.*-eva-testova\.csv$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  tvrdi('V3: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Vedení: němčina a polština na 320 a 390 bez přetečení; okno pravidel na telefonu
// ---------------------------------------------------------------------------
for (const jazyk of ['de', 'pl']) {
  for (const sirka of [320, 390]) {
    const { ctx, p } = await vedeni({ viewport: { width: sirka, height: 844 }, jazyk });
    const n = nastroj(p);
    tvrdi(`V4 (${sirka}, ${jazyk}): pásy jsou vidět a řádků je 9`, (await n.locator('[data-pas="lide"]').count()) === 1 && (await n.locator('li.list-row').count()) === 9);
    const pr = await preteceni(p);
    tvrdi(`V4 (${sirka}, ${jazyk}): bez přetečení dokumentu i karet`, pr.dokument <= 1 && pr.widgety.length === 0, JSON.stringify(pr));
    if (sirka === 390 && jazyk === 'de') await p.screenshot({ path: SNIMKY + 'k84-dochazka-zaznamy-de-tel.png' });
    await ctx.close();
  }
}
{
  const { ctx, p } = await vedeni();
  await p.getByRole('button', { name: 'Další akce' }).first().click();
  await p.getByRole('menuitem', { name: /Pravidla píchání/ }).click();
  const okno = p.getByRole('dialog', { name: 'Pravidla píchání' });
  // Okno vyjíždí zdola — měřit až po doběhnutí animace (v CI pod zátěží se jednou měřilo uprostřed).
  const vyjelo = await dokud(() => okno.isVisible(), 3000);
  await p.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => null))));
  const poloha = okno.getByRole('button', { name: 'Použít moji polohu' });
  tvrdi('V5 (390): okno Pravidla píchání vyjede zdola a má „Použít moji polohu" ≥ 44 px', vyjelo
    && await okno.evaluate(d => !!d.closest('.modal-sheet') || getComputedStyle(d).position !== 'static')
    && await dokud(async () => ((await poloha.boundingBox())?.height ?? 0) >= 44, 3000), String((await poloha.boundingBox())?.height));
  const pr = await preteceni(p);
  tvrdi('V5 (390): okno bez přetečení', pr.dokument <= 1 && await okno.evaluate(d => d.scrollWidth <= d.clientWidth + 1));
  await p.screenshot({ path: SNIMKY + 'k84-dochazka-pravidla-tel.png' });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Tablet (768 × 1024): pauza přes výběr člověka, offline fronta
// ---------------------------------------------------------------------------
const prahaHMS = (posunMin) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(TED + posunMin * 60000));
const isoPred = (min) => new Date(TED - min * 60000).toISOString();
const OTISK = bcrypt.hashSync('1234', 4);
/** Martin (PIN) na směně, Jakub (bez PINu) na pauze 8 minut, Lucie (PIN) a Petr (bez PINu) mimo směnu. */
const rosterTabletu = () => ({
  roster: [
    { id: 1, name: 'Martin Nemeškal', avatar: '🧑', hasPin: true, openSince: isoPred(180), openEntryId: 501, breakSince: null, shiftStart: prahaHMS(-180), shiftEnd: prahaHMS(300), offlinePin: OTISK },
    { id: 3, name: 'Jakub Horák', avatar: '🧔', hasPin: false, openSince: null, openEntryId: null, breakSince: isoPred(8), shiftStart: null, shiftEnd: null },
    { id: 8, name: 'Lucie Černá', avatar: '👩‍🦰', hasPin: true, openSince: null, openEntryId: null, breakSince: null, shiftStart: prahaHMS(-30), shiftEnd: prahaHMS(450), offlinePin: OTISK },
    { id: 7, name: 'Petr Novák', avatar: '🧑‍🍳', hasPin: false, openSince: null, openEntryId: null, breakSince: null, shiftStart: prahaHMS(45), shiftEnd: prahaHMS(500) },
  ],
  entries: [],
});
const podvrhTabletu = (req, json, stav) => {
  const path = new URL(req.url()).pathname;
  const m = req.method();
  if (path === '/api/attendance' && m === 'GET') return json(rosterTabletu());
  if (path === '/api/attendance' && m === 'POST') { (stav.dochazka ??= []).push(req.postDataJSON()); return json({ ok: true, action: req.postDataJSON().action, closingDone: true }); }
  if (path === '/api/attendance/sync' && m === 'POST') {
    const telo = req.postDataJSON();
    (stav.sync ??= []).push(telo);
    return json({ ok: true, doruceno: telo.pichnuti.length, vysledky: telo.pichnuti.map(x => ({ klic: x.klic, ok: true, action: x.action })) });
  }
  if (path === '/api/closings/handover' && m === 'GET') return json(nacti('k69-b9-handover'));
  if (path === '/api/procedures/runs' && m === 'GET') return json({ runs: [] });
  return undefined;
};
const nastrojTabletu = (p) => p.locator('[data-plocha="kiosk.smena"] li[data-widget="nastroj"]');
const otevriTablet = async (p) => {
  // `jdi`, ne `goto`: okno zavřené o řádek výš (Konec pauzy) odebírá svůj záznam historie v dalším
  // tiku a ten průchod by rozjeté načtení zrušil (net::ERR_ABORTED v CI).
  await jdi(p, BASE + '/kiosk');
  await p.locator('[data-plocha="kiosk.smena"] li[data-instance]:not([hidden])').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(900);
};
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'kiosk', viewport: TABLET, mobil: true, fix: FIX_SMENA, mineData: KIOSK, posunCasu: POSUN, dalsi: podvrhTabletu });
  await ctx.addInitScript(() => { try { localStorage.removeItem('managero-kiosk-fronta'); localStorage.removeItem('managero-kiosk-active'); } catch { /* */ } });
  await otevriTablet(p);
  const n = nastrojTabletu(p);
  const radekJakub = n.locator('ul.list > li', { hasText: 'Jakub Horák' });
  const tj = (await text(radekJakub)).replace(/\n/g, ' | ');
  tvrdi('K1 (768): člověk na pauze je v „Kdo teď pracuje" s „na pauze od HH:MM" a chipem „pauza 8 min"', /na pauze od \d{1,2}:\d{2}/.test(tj) && /pauza (7|8|9) min/.test(tj), tj);
  tvrdi('K1 (768): řádek na směně má vedle odchodu i tlačítko Pauza', (await n.getByRole('button', { name: 'Pauza – Martin Nemeškal' }).count()) === 1 && (await n.getByRole('button', { name: 'Odchod – Martin Nemeškal' }).count()) === 1);
  // Pauza Martina s PINem: tři velká tlačítka, PIN v těle, action break_start.
  await n.getByRole('button', { name: 'Pauza – Martin Nemeškal' }).click();
  const okno = p.getByRole('dialog', { name: 'Martin Nemeškal' });
  await dokud(() => okno.isVisible(), 3000);
  const pauza = okno.getByRole('button', { name: 'Pauza', exact: true });
  const odchod = okno.getByRole('button', { name: 'Odpíchnout odchod' });
  const zpet = okno.getByRole('button', { name: 'Zpět' });
  const vysky = await Promise.all([pauza, odchod, zpet].map(async b => (await b.boundingBox())?.height ?? 0));
  tvrdi('K1 (768): okno má Pauza / Odpíchnout odchod / Zpět, všechna ≥ 48 px', vysky.every(v => v >= 48), JSON.stringify(vysky));
  tvrdi('K1 (768): bez PINu je Pauza i odchod zamčené', await pauza.isDisabled() && await odchod.isDisabled());
  for (const k of ['1', '2', '3', '4']) await okno.getByRole('button', { name: k, exact: true }).click();
  await p.screenshot({ path: SNIMKY + 'k84-dochazka-tablet-pauza.png' });
  await pauza.click();
  tvrdi('K1 (768): Pauza pošle POST /api/attendance s action=break_start a PINem', await dokud(() => (stav.dochazka ?? []).some(b => b.employeeId === 1 && b.action === 'break_start' && b.pin === '1234'), 3000), JSON.stringify(stav.dochazka));
  tvrdi('K1 (768): okno se zavřelo', await dokud(async () => (await okno.count()) === 0, 3000));
  // Konec pauzy Jakuba (bez PINu).
  await n.getByRole('button', { name: 'Konec pauzy – Jakub Horák' }).click();
  const oknoJ = p.getByRole('dialog', { name: 'Jakub Horák' });
  tvrdi('K2 (768): okno na pauze říká „Na pauze od" a nabízí Konec pauzy (hlavní) i odchod', await dokud(() => oknoJ.getByText(/Na pauze od \d{1,2}:\d{2}/).isVisible(), 3000)
    && await oknoJ.getByRole('button', { name: 'Konec pauzy' }).isEnabled() && (await oknoJ.getByRole('button', { name: 'Odpíchnout odchod' }).count()) === 1);
  await oknoJ.getByRole('button', { name: 'Konec pauzy' }).click();
  tvrdi('K2 (768): Konec pauzy pošle action=break_end', await dokud(() => (stav.dochazka ?? []).some(b => b.employeeId === 3 && b.action === 'break_end'), 3000), JSON.stringify(stav.dochazka));
  // Dlaždice ve výběru osoby: Jakub na pauze šedý s „pauza N min". Dva lidé na směně a nikdo vybraný →
  // tablet se ptá „Kdo jsi?" a nabídne mřížku všech na směně.
  await p.evaluate(() => { try { localStorage.removeItem('managero-kiosk-active'); } catch { /* */ } });
  await otevriTablet(p);
  const kdo = p.getByRole('button', { name: /Kdo jsi\?/ });
  tvrdi('K2 (768): dva na směně, nikdo vybraný → „Kdo jsi?"', await dokud(() => kdo.isVisible(), 3000));
  await kdo.click();
  const dlazdice = p.getByRole('dialog').locator('button[data-na-pauze]');
  tvrdi('K2 (768): dlaždice člověka na pauze je šedá s „pauza N min"', await dokud(async () => (await dlazdice.count()) === 1 && /pauza \d+ min/.test(await text(dlazdice)), 3000), await text(p.getByRole('dialog')));
  await p.screenshot({ path: SNIMKY + 'k84-dochazka-tablet-kdo.png' });
  await p.keyboard.press('Escape');
  tvrdi('K1–K2: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  tvrdi('K1–K2: rozložení tabletu bez přetečení', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await ctx.close();
}

// Kolo 93 (Martin: „Když si někdo zapne pauzu a pak ji ukončí, tak se mu to zapne jako nová směna"): Petr přišel
// před 5 h, 30 min měl pauzu a od její konce (před hodinou) běží záznam po pauze. Tablet ukazuje směnu od
// příchodu (shiftSince), dobu bez pauzy (4 h 30 min) a souhrn odchodu za celou směnu s pauzou.
{
  const roster = rosterTabletu();
  roster.roster = roster.roster.map(m => m.id === 7 ? { ...m, openSince: isoPred(60), openEntryId: 777, shiftSince: isoPred(300), breakMs: 30 * 60_000, shiftStart: prahaHMS(-300), shiftEnd: prahaHMS(200) } : m);
  const podvrh = (req, json, stav) => {
    const path = new URL(req.url()).pathname;
    if (path === '/api/attendance' && req.method() === 'GET') return json(roster);
    if (path === '/api/attendance' && req.method() === 'POST') {
      (stav.dochazka ??= []).push(req.postDataJSON());
      return json({ ok: true, action: 'out', closingDone: true, entry: { id: 777, clockIn: isoPred(60), clockOut: new Date(TED).toISOString(), shiftStart: isoPred(300), breakMs: 30 * 60_000 } });
    }
    return podvrhTabletu(req, json, stav);
  };
  const { ctx, p, stav, chyby } = await kontext({ role: 'kiosk', viewport: TABLET, mobil: true, fix: FIX_SMENA, mineData: KIOSK, posunCasu: POSUN, dalsi: podvrh });
  await ctx.addInitScript(() => { try { localStorage.removeItem('managero-kiosk-fronta'); localStorage.setItem('managero-kiosk-active', '7'); } catch { /* */ } });
  await otevriTablet(p);
  const n = nastrojTabletu(p);
  const hm = (min) => new Intl.DateTimeFormat('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(TED - min * 60000));
  const radek = (await text(n.locator('ul.list > li', { hasText: 'Petr Novák' }))).replace(/\n/g, ' | ');
  tvrdi(`K5 (768): po konci pauzy „od ${hm(300)} · 4 h 30 min" (začátek směny, bez pauzy), ne od konce pauzy`, radek.includes(`od ${hm(300)}`) && /4 h 30 min/.test(radek) && !radek.includes(`od ${hm(60)}`), radek);
  await n.getByRole('button', { name: 'Odchod – Petr Novák' }).click();
  const okno = p.getByRole('dialog', { name: 'Petr Novák' });
  tvrdi(`K5 (768): okno „Na směně od ${hm(300)} · 4:30:xx"`, await dokud(() => okno.getByText(new RegExp(`Na směně od ${hm(300)} · 4:3\\d:\\d\\d`)).isVisible(), 3000), await text(okno));
  await okno.getByRole('button', { name: 'Odpíchnout odchod' }).click();
  const souhrn = p.locator('[data-souhrn-odchodu]');
  await dokud(() => souhrn.isVisible(), 4000);
  const ts = (await text(souhrn)).replace(/\n/g, ' | ');
  tvrdi(`K5 (768): souhrn odchodu za celou směnu — příchod ${hm(300)}, odpracováno 4 h 30 min, pauza 30 min`, ts.includes(hm(300)) && /4 h 30 min/.test(ts) && /pauza 30 min/.test(ts), ts);
  await p.screenshot({ path: SNIMKY + 'k93-tablet-souhrn-po-pauze.png' });
  tvrdi('K5: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// Offline: pás nahoře, příchod Lucie (PIN proti otisku) do fronty, špatný PIN, po připojení sync.
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'kiosk', viewport: TABLET, mobil: true, fix: FIX_SMENA, mineData: KIOSK, posunCasu: POSUN, dalsi: podvrhTabletu });
  await ctx.addInitScript(() => { try { localStorage.removeItem('managero-kiosk-fronta'); localStorage.removeItem('managero-kiosk-active'); } catch { /* */ } });
  await otevriTablet(p);
  const n = nastrojTabletu(p);
  // Otisky dorazily s rozpisem (jen účet tabletu) — bez nich by se bez internetu nedal PIN ověřit.
  tvrdi('K3 (768): tablet si z rozpisu uložil otisky PINů (ne PINy) a poslední rozpis', await p.evaluate(() => {
    const o = JSON.parse(localStorage.getItem('managero-kiosk-otisky') || '{}');
    return typeof o['8'] === 'string' && o['8'].startsWith('$2') && !/1234/.test(JSON.stringify(o)) && JSON.parse(localStorage.getItem('managero-kiosk-rozpis') || '[]').length === 4;
  }));
  await ctx.setOffline(true);
  await p.evaluate(() => window.dispatchEvent(new Event('offline')));
  const pas = p.locator('[data-offline-pas]');
  tvrdi('K3 (768): bez internetu je nahoře pás „Bez internetu — píchnutí se uloží a odešlou samy."', await dokud(() => pas.isVisible(), 3000) && /Bez internetu — píchnutí se uloží a odešlou samy\./.test(await text(pas)), await text(pas));
  await n.getByRole('button', { name: 'Další příchod' }).click();
  await n.getByRole('button', { name: /Lucie Černá/ }).click();
  const okno = p.getByRole('dialog', { name: 'Lucie Černá' });
  tvrdi('K3 (768): okno říká, že tablet je bez internetu', await dokud(() => okno.getByText('Tablet je bez internetu.').isVisible(), 3000));
  for (const k of ['9', '9', '9', '9']) await okno.getByRole('button', { name: k, exact: true }).click();
  await okno.getByRole('button', { name: 'Odpíchnout příchod' }).click();
  tvrdi('K3 (768): špatný PIN proti otisku → „Nesprávný PIN", nic ve frontě', await dokud(() => okno.getByText('Nesprávný PIN').isVisible(), 4000)
    && await p.evaluate(() => JSON.parse(localStorage.getItem('managero-kiosk-fronta') || '[]').length === 0));
  for (const k of ['1', '2', '3', '4']) await okno.getByRole('button', { name: k, exact: true }).click();
  await p.screenshot({ path: SNIMKY + 'k84-dochazka-tablet-offline.png' });
  await okno.getByRole('button', { name: 'Odpíchnout příchod' }).click();
  tvrdi('K3 (768): správný PIN → příchod ve frontě (employeeId 8, in, pinOvereno, klíč), žádný POST', await dokud(() => p.evaluate(() => {
    const f = JSON.parse(localStorage.getItem('managero-kiosk-fronta') || '[]');
    return f.length === 1 && f[0].employeeId === 8 && f[0].action === 'in' && f[0].pinOvereno === true && f[0].klic.length >= 8;
  }), 4000) && !(stav.dochazka ?? []).length);
  tvrdi('K3 (768): Lucie je hned v „Kdo teď pracuje" a pás píše „(1 čeká)"', await dokud(async () => (await n.locator('ul.list > li', { hasText: 'Lucie Černá' }).count()) === 1, 3000) && /\(1 čeká\)/.test(await text(pas)), await text(pas));
  tvrdi('K3 (768): hlášení „příchod uložený v tabletu — odešle se sám"', await dokud(() => p.locator('[role="status"]', { hasText: 'uložený v tabletu' }).isVisible(), 3000));
  // Zpět online: fronta odejde na /api/attendance/sync a vyprázdní se.
  await ctx.setOffline(false);
  await p.evaluate(() => window.dispatchEvent(new Event('online')));
  tvrdi('K3 (768): po připojení POST /api/attendance/sync s jedním píchnutím Lucie', await dokud(() => (stav.sync ?? []).some(s => s.pichnuti.length === 1 && s.pichnuti[0].employeeId === 8 && s.pichnuti[0].action === 'in'), 6000), JSON.stringify(stav.sync));
  tvrdi('K3 (768): fronta je prázdná a hlášení „1 píchnutí odesláno po výpadku."', await dokud(() => p.evaluate(() => JSON.parse(localStorage.getItem('managero-kiosk-fronta') || '[]').length === 0), 4000)
    && await dokud(() => p.locator('[role="status"]', { hasText: '1 píchnutí odesláno po výpadku.' }).isVisible(), 4000));
  tvrdi('K3 (768): pás zmizel', await dokud(async () => (await pas.count()) === 0, 4000));
  tvrdi('K3: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

await konec();
