// Kolo 91 (balík body-R) — způsob počítání bodů, denní strop, ruční přednost, přepočet zpětně.
//
// Martin: „u položek si navolit, jestli body za jednotlivé body v postupu budou vždy přičítány,
// nebo budou body vždy jen za celkový postup … a možnost při změně ‚přepočítat zpětně body‘“
// a „automaticky počítat body jen pokud to neudělá vedení manuálně; do 30 bodů max za den“.
// API podvržené (nic nejde na server). Čas pevný: prohlížeč žije 20. dne měsíce v 16:00 (Praha).
//  R1 Nastavení bodů: karta „Způsob počítání bodů“ s postupy / úkoly / uzávěrkami a větou náhledu;
//     „Za celek“ přepíše větu („Za celý postup 10 b, za nedokončený krok −1 b“).
//  R2 Bez přepočtu a beze změny stropu: Uložit = jen PATCH /api/teams (rezim ve points_config), žádný přepočet.
//  R3 „Přepočítat zpětně body“ + Uložit: okno s náhledem („Změní se 23 záznamů u 6 lidí, celkem −84 b“,
//     kdo by šel do minusu); potvrzení = POST přepočtu (nahled:false) a PATCH s denniStropOd null.
//  R4 Historie přepočtů: „Vrátit přepočet“ u posledního → POST { vratit }.
//  R5 Změna stropu bez přepočtu taky ukáže dopad (strop platí od data).
//  R6 Hodnocení směny: „Automaticky by dostal +30 b — ruční hodnocení ho nahrazuje“, „Dnes 30 b (strop)“,
//     POST nese nahraditAuto.
//  R7 Okno postupu: „Body za postup“, „Za každý krok“ → u kroku plus body; přepočet → náhled →
//     PATCH postupu bez bodyRezim a POST přepočtu { typ: postup }.
//  R8 Telefon 390 × 844 s dotykem: nic nepřetéká (karta, okno náhledu, okno postupu).
//  R10 (kolo 93) Záporné body v hodnocení směny („-15", ±, krokovač, POST points −16) a srážka v Nastavení bodů.
//   SONDY_ZAKLAD=http://localhost:3445 node scripts/sondy/k91-body-rezim.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, dokud, DIR, OUT, BASE } from './k68-spolecne.mjs';

const TEL = { width: 390, height: 844 };
const prahaDen = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(ms));
const prahaISO = (den, hm) => {
  const odhad = new Date(`${den}T${hm}:00Z`);
  const tz = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Prague', timeZoneName: 'longOffset' }).formatToParts(odhad).find(x => x.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  return new Date(`${den}T${hm}:00${tz.replace('GMT', '') || '+00:00'}`).toISOString();
};
const DNES = `${prahaDen(Date.now()).slice(0, 7)}-20`;
const TED = Date.parse(prahaISO(DNES, '16:00'));
const POSUN = TED - Date.now();
// Posunutý čas v prohlížeči (pozdrav „Dobré ráno“ × „Dobrý den“) dává hydrataci jiný text než server — není to chyba kola 91.
const skutecneChyby = (chyby) => chyby.filter(c => !/Minified React error #418|Hydration|hydrat|same key/i.test(c));
const text = async (loc) => ((await loc.count()) ? (await loc.first().innerText()) : '').replace(/ /g, ' ');
const preteceni = (p) => p.evaluate(() => {
  const dokument = document.documentElement.scrollWidth - window.innerWidth;
  const prvky = [...document.querySelectorAll('[data-nastaveni-rezimu], [data-historie-prepoctu], [data-nahled-prepoctu], [data-body-postupu], [role="dialog"]')]
    .filter(s => s.scrollWidth > s.clientWidth + 1).map(s => s.getAttribute('data-nastaveni-rezimu') != null ? 'karta' : (s.getAttribute('aria-label') || s.className.slice(0, 40)));
  return { dokument, prvky };
});

const BODY = { task: 5, procedure: 10, closing: 15, ratingStar: 4, taskMissed: -5, procedureSkipped: -2, procedureMissed: -4, closingMissing: -10, closingBalanced: 3 };
const PRAV = (rezim = 'kombinace') => ({ rezim, bonus: false, zaPolozku: 1, srazka: 1 });
const REZIM = { postupy: PRAV(), ukoly: PRAV(), uzaverky: PRAV(), stropZap: false, denniStrop: 30, stropZdroje: ['postupy', 'ukoly', 'uzaverky', 'hodnoceni'], stropOd: null };
const NAHLED = { zaznamu: 23, lidi: 6, celkem: -84, hodnoceni: 4, doMinusu: [{ uid: 17, jmeno: 'Jakub Horák', pred: 12, po: -4 }], clenove: [{ uid: 16, jmeno: 'Eva Nováková', pred: 240, po: 198 }, { uid: 17, jmeno: 'Jakub Horák', pred: 12, po: -4 }] };
const HISTORIE = [{ id: 7, kdo: 'Martin Novák', kdy: `${DNES} 09:12:00`, rozsah: { typ: 'podnik', druhy: ['postupy'], zpetneStrop: false }, souhrn: { zaznamu: 11, lidi: 3, celkem: -20, doMinusu: 0 }, vraceno: null, lzeVratit: true }];
const FIX = (stranka) => ({ stranka, polozky: [{ id: 'nastroj', widget: 'nastroj', velikost: 'L' }], dostupne: [], tarifem: [], zdroj: 'aplikace', rozsah: 'typ:vedeni', zamceno: false, smiUpravit: true, smiVychozi: true, verze: 0 });

const podvrh = (req, json, stav) => {
  const u = new URL(req.url()); const path = u.pathname; const m = req.method();
  if (m !== 'GET') (stav.zapisy ??= []).push({ m, path, body: req.postData() ?? '' });
  if (path === '/api/rewards' && m === 'GET') return json({ role: 'employer', levels: [{ name: 'Barista', minPoints: 0, perks: '' }], points: BODY, dik: { prispevek: 50, hodnoty: ['ochota'] }, auto: { dochvilnost: { zap: true, body: 10 }, vyroci: { zap: true, body: 50 }, narozeniny: { zap: false, body: 20 } }, rezim: REZIM,
    standings: [{ id: 16, name: 'Eva Nováková', avatar: null, points: 240, breakdown: {}, flagged: 0, flaggedUnseen: 0, pending: 1, oldestPending: DNES, levelName: 'Barista', levelIndex: 0, next: null, pctToNext: 100, pointsIntoLevel: 0, pointsForNext: 0 }] });
  if (path === '/api/body/prepocet') {
    if (m === 'GET') return json({ historie: stav.vraceno ? HISTORIE.map(h => ({ ...h, vraceno: `${DNES} 10:00:00`, lzeVratit: false })) : HISTORIE });
    const b = JSON.parse(req.postData() || '{}');
    if (b.vratit != null) { stav.vraceno = true; return json({ ok: true, historie: HISTORIE.map(h => ({ ...h, vraceno: `${DNES} 10:00:00`, lzeVratit: false })) }); }
    if (b.nahled !== false) return json({ nahled: NAHLED });
    return json({ ok: true, id: 8, nahled: NAHLED, historie: HISTORIE });
  }
  if (path === '/api/body/vychozi') return json({ postupy: { ...PRAV(), zaklad: 10 }, ukoly: { ...PRAV(), zaklad: 5 }, uzaverky: { ...PRAV(), zaklad: 15 }, denniStrop: 30, stropOd: '2026-10-16' });
  if (path === '/api/teams' && m !== 'GET') return json({ ok: true });
  if (path === '/api/shift-reviews' && m === 'GET' && u.searchParams.get('employeeId')) return json({
    employee: { id: 16, name: 'Eva Nováková', avatar: null }, date: DNES, hadShift: true, shift: { startTime: '08:00', endTime: '16:00', label: 'Ranní' }, coworkers: [],
    window: { from: prahaISO(DNES, '08:00'), to: prahaISO(DNES, '16:00'), overnight: false, days: [DNES] },
    tasks: [], procedures: [], closing: null, review: null, autoPoints: { total: 0, lines: [] },
    den: { efektivni: 30, nasbirano: 42, uprava: -12, zastropovano: true, strop: 30, stropPlati: true, nahrazeno: false, automaticky: 30 },
  });
  if (path === '/api/shift-reviews' && m === 'POST') return json({ ok: true, scope: 'individual', employeeIds: [16] });
  if (path === '/api/shifts' && u.searchParams.get('employeeId')) return json({ shifts: [{ id: 1, date: DNES, startTime: '08:00', endTime: '16:00' }] });
  if (path === '/api/procedures' && m === 'GET') return json(JSON.parse(readFileSync(DIR + 'k69-b6b-procedures.json', 'utf8')));
  if (/^\/api\/procedures\/\d+$/.test(path)) return json({ ok: true, procedure: JSON.parse(readFileSync(DIR + 'k69-b6b-procedures.json', 'utf8')).procedures[0] });
  if (m !== 'GET') return json({ ok: true });
  return undefined;
};

/** Připomínky postupů pro posunutý den (DNES) jako už spuštěné — banner by zakryl snímky a klepnutí. */
async function bezPripominek(ctx) {
  await ctx.addInitScript((den) => {
    try { const m = {}; for (let i = 1; i <= 300; i++) m[`${i}-${den}`] = true; localStorage.setItem('managero-proc-fired', JSON.stringify(m)); } catch { /* soukromé okno */ }
    // Proti dev serveru (SONDY_ZAKLAD na `next dev`) by odznak vývojářského překryvu chytal klepnutí u spodní hrany.
    document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = 'nextjs-portal{display:none!important}'; document.head.appendChild(st); });
  }, DNES);
}
async function otevriPlochu(p, cesta, stranka) {
  await bezPripominek(p.context());
  await p.goto(BASE + cesta, { waitUntil: 'networkidle' });
  await p.locator(`[data-plocha="${stranka}"] li[data-instance]:not([hidden])`).first().waitFor({ timeout: 25000 });
  await p.waitForTimeout(1000);
}
async function nastaveni(p) {
  await otevriPlochu(p, '/employer/overview?view=rewards', 'vedeni.odmeny');
  // Audit 2026-10 (V35): na telefonu je Nastavení odměn v „···" hlavičky, od md v segmentu.
  const zalozka = p.getByRole('tablist', { name: 'Část stránky' }).getByRole('tab', { name: 'Nastavení' });
  if (await zalozka.count()) await zalozka.click();
  else { await p.getByRole('button', { name: 'Další akce' }).first().click(); await p.getByRole('menuitem', { name: 'Nastavení odměn' }).click(); }
  const karta = p.locator('[data-nastaveni-rezimu]');
  await karta.waitFor({ timeout: 10000 });
  return karta;
}

// ---------------------------------------------------------------------------
// R1–R5 Nastavení bodů (1280)
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX('vedeni.odmeny'), posunCasu: POSUN, dalsi: podvrh });
  const karta = await nastaveni(p);
  const veta = (d) => text(karta.locator(`[data-volba-rezimu="${d}"] [data-veta-rezimu]`));
  tvrdi('R1: karta má postupy, úkoly a uzávěrky; výchozí věta postupů = dnešní kombinace', (await karta.locator('[data-volba-rezimu]').count()) === 3 && /za úplnost až dalších 10 b/.test(await veta('postupy')), await veta('postupy'));
  tvrdi('R1: denní strop je ve výchozím stavu vypnutý („Bez stropu.“, žádné zdroje)', /Bez stropu\./.test(await text(karta.locator('[data-strop-od]'))) && (await karta.locator('[data-zdroj-stropu]').count()) === 0, await text(karta.locator('[data-strop-od]')));
  await karta.locator('[data-volba-rezimu="postupy"]').getByRole('tab', { name: 'Za celek' }).click();
  tvrdi('R1: „Za celek“ → „Za celý postup 10 b, za nedokončený krok −1 b, klíčový −3 b.“', /Za celý postup 10 b, za nedokončený krok −1 b, klíčový −3 b\./.test(await veta('postupy')), await veta('postupy'));
  await karta.locator('[data-volba-rezimu="ukoly"]').getByRole('tab', { name: 'Za každý krok' }).click();
  tvrdi('R1: úkoly „Za každý krok“ → body za položku checklistu a věta', /Za každou splněnou položku checklistu \+1 b/.test(await veta('ukoly')) && (await karta.locator('[data-volba-rezimu="ukoly"] input').count()) === 1, await veta('ukoly'));
  await karta.screenshot({ path: OUT + 'k91-body-nastaveni-1280.png' });

  // R2: bez přepočtu jen PATCH
  await p.getByRole('button', { name: 'Uložit nastavení' }).click();
  const patch = await dokud(() => (stav.zapisy ?? []).find(z => z.path === '/api/teams' && z.m === 'PATCH'), 4000);
  tvrdi('R2: Uložit bez přepočtu = PATCH /api/teams s rezim (postupy celek, úkoly kroky), strop pořád vypnutý', !!patch && /"rezim":\{"postupy":\{"rezim":"celek"/.test(patch.body) && /"ukoly":\{"rezim":"kroky"/.test(patch.body) && /"denniStropZap":false,"denniStrop":30,"stropZdroje":\["postupy","ukoly","uzaverky","hodnoceni"\],"denniStropOd":null/.test(patch.body), patch?.body?.slice(-300));
  tvrdi('R2: … a žádný přepočet', !(stav.zapisy ?? []).some(z => z.path === '/api/body/prepocet'));

  // R3: přepočet zpětně s náhledem
  stav.zapisy = [];
  await karta.locator('[data-prepocet-zpetne]').first().click();
  // Volba „i starší ruční hodnocení“ se ukáže až se zpětným přepočtem, výchozí vypnutá.
  const starsi = karta.getByRole('checkbox', { name: /I starší ruční hodnocení/ });
  tvrdi('R3: se zpětným přepočtem volba „I starší ruční hodnocení směn považovat za nahrazující“, výchozí vypnutá', (await starsi.count()) === 1 && (await starsi.getAttribute('aria-checked')) === 'false');
  await starsi.click();
  await p.getByRole('button', { name: 'Uložit nastavení' }).click();
  const okno = p.getByRole('dialog', { name: 'Přepočítat zpětně body' });
  await okno.waitFor({ timeout: 6000 });
  await dokud(async () => /Změní se/.test(await text(okno)), 4000);
  const tOkno = await text(okno);
  tvrdi('R3: náhled „Změní se 23 záznamů u 6 lidí, celkem −84 b.“', /Změní se 23 záznamů u 6 lidí, celkem −84 b\./.test(tOkno), tOkno.slice(0, 200));
  tvrdi('R3: náhled ukáže, komu by zůstatek klesl pod nulu (Jakub 12 → −4)', /Zůstatek by klesl pod nulu/.test(tOkno) && /Jakub Horák: 12 → -4 b/.test(tOkno), tOkno);
  const nahledPost = (stav.zapisy ?? []).find(z => z.path === '/api/body/prepocet');
  tvrdi('R3: náhled = POST s nahled:true, všemi druhy, strop zpětně a starsiHodnoceni', !!nahledPost && /"druhy":\["postupy","ukoly","uzaverky"\],"zpetneStrop":true/.test(nahledPost.body) && /"nahled":true/.test(nahledPost.body) && /"starsiHodnoceni":true/.test(nahledPost.body), nahledPost?.body);
  tvrdi('R3: náhled řekne, kolik starších hodnocení začne nahrazovat', /4 starší ruční hodnocení směn začnou nahrazovat automatické body dne/.test(tOkno), tOkno);
  tvrdi('R3: dokud se nepotvrdí, nic se neuloží', !(stav.zapisy ?? []).some(z => z.path === '/api/teams'));
  await okno.screenshot({ path: OUT + 'k91-body-nahled-1280.png' });
  await okno.getByRole('button', { name: 'Přepočítat a uložit' }).click();
  const poradi = await dokud(() => { const z = (stav.zapisy ?? []).filter(x => x.path === '/api/body/prepocet' || x.path === '/api/teams'); return z.length >= 3 ? z : null; }, 5000);
  tvrdi('R3: potvrzení = přepočet (nahled:false) a pak PATCH s denniStropOd null', !!poradi && /"nahled":false/.test(poradi[1].body) && poradi[2].path === '/api/teams' && /"denniStropOd":null/.test(poradi[2].body), JSON.stringify(poradi?.map(z => z.path)));
  await dokud(async () => (await okno.count()) === 0, 3000);
  tvrdi('R3: strop zůstal vypnutý („Bez stropu.“)', /Bez stropu\./.test(await text(karta.locator('[data-strop-od]'))));

  // R4: vrátit přepočet
  const hist = p.locator('[data-historie-prepoctu]');
  await hist.waitFor({ timeout: 5000 });
  tvrdi('R4: historie přepočtů ukazuje poslední s „Vrátit přepočet“', /11 záznamů u 3 lidí, celkem −20 b/.test(await text(hist)) && (await hist.getByRole('button', { name: 'Vrátit přepočet' }).count()) === 1, await text(hist));
  await hist.getByRole('button', { name: 'Vrátit přepočet' }).click();
  const vratit = await dokud(() => (stav.zapisy ?? []).find(z => z.path === '/api/body/prepocet' && /"vratit":7/.test(z.body)), 3000);
  tvrdi('R4: „Vrátit přepočet“ pošle POST { vratit: 7 } a ukáže „vráceno“', !!vratit && await dokud(async () => /vráceno/.test(await text(hist)), 3000));
  await hist.screenshot({ path: OUT + 'k91-body-historie-1280.png' });
  tvrdi('R1–R4: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 3).join(' | '));
  await ctx.close();
}

// R5: zapnutí stropu (hodnota a zdroje) bez přepočtu ukáže dopad a platí ode dne uložení
{
  const { ctx, p, stav } = await kontext({ fix: FIX('vedeni.odmeny'), posunCasu: POSUN, dalsi: podvrh });
  const karta = await nastaveni(p);
  await karta.locator('[data-nastaveni-stropu]').getByRole('switch').click();
  const zdroje = karta.locator('[data-zdroj-stropu]');
  const zaskrtnute = async () => (await zdroje.evaluateAll(els => els.filter(e => e.getAttribute('aria-checked') === 'true').map(e => e.getAttribute('data-zdroj-stropu')))).join(',');
  tvrdi('R5: zapnutý strop nabídne 30 a 10 zdrojů, zaškrtnuté jen automatické', (await zdroje.count()) === 10 && (await zaskrtnute()) === 'postupy,ukoly,uzaverky,hodnoceni', await zaskrtnute());
  await karta.locator('[data-zdroj-stropu="navic"]').click();
  await karta.getByLabel('Strop na člověka a den (b)').fill('40');
  tvrdi('R5: text „Nový strop začne platit dnem uložení“', /Nový strop začne platit dnem uložení/.test(await text(karta.locator('[data-strop-od]'))));
  await karta.screenshot({ path: OUT + 'k91-body-strop-1280.png' });
  await p.getByRole('button', { name: 'Uložit nastavení' }).click();
  const okno = p.getByRole('dialog', { name: 'Přepočítat zpětně body' });
  const je = await dokud(async () => (await okno.count()) > 0, 5000);
  const post = (stav.zapisy ?? []).find(z => z.path === '/api/body/prepocet');
  tvrdi('R5: zapnutý strop 40 s Navíc bez přepočtu → náhled dopadu (druhy [], ne zpětně), ne rovnou uložení', je && !!post && /"druhy":\[\],"zpetneStrop":false/.test(post.body) && /"stropZap":true,"denniStrop":40,"stropZdroje":\["postupy","ukoly","uzaverky","hodnoceni","navic"\]/.test(post.body) && /"starsiHodnoceni":false/.test(post.body), post?.body);
  await dokud(async () => /Změní se/.test(await text(okno)), 4000);
  await okno.getByRole('button', { name: 'Přepočítat a uložit' }).click();
  const patch = await dokud(() => (stav.zapisy ?? []).find(z => z.path === '/api/teams' && z.m === 'PATCH'), 5000);
  tvrdi('R5: uložení zapíše strop s dnešním datem platnosti', !!patch && new RegExp(`"denniStropZap":true,"denniStrop":40,"stropZdroje":\\[[^\\]]*"navic"\\],"denniStropOd":"${DNES}"`).test(patch.body), patch?.body?.slice(-260));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// R6 Hodnocení směny: ruční přednost a strop
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav } = await kontext({ fix: FIX('vedeni.odmeny'), posunCasu: POSUN, dalsi: podvrh });
  await otevriPlochu(p, '/employer/overview?view=rewards', 'vedeni.odmeny');
  await p.getByRole('button', { name: 'Ohodnotit: Eva Nováková' }).first().click();
  const okno = p.getByRole('dialog').filter({ has: p.locator('[data-rucni-prednost]') });
  const je = await dokud(async () => (await okno.count()) > 0, 10000);
  const blok = okno.locator('[data-rucni-prednost]');
  tvrdi('R6: bez ručních bodů: „Automaticky dostane +30 b a ruční body se přičtou“ a „Dnes 30 b (strop) — nasbíral 42.“', je && /Automaticky dostane \+30 b/.test(await text(blok)) && /Dnes 30 b \(strop\) — nasbíral 42\./.test(await text(blok)), await text(blok));
  await okno.getByRole('radio', { name: /4/ }).first().click().catch(async () => { await okno.locator('[aria-label*="4"]').first().click(); });
  tvrdi('R6: s hvězdami: „Automaticky by dostal +30 b — ruční hodnocení ho nahrazuje.“', await dokud(async () => /Automaticky by dostal \+30 b — ruční hodnocení ho nahrazuje\./.test(await text(blok)), 2000), await text(blok));
  await blok.screenshot({ path: OUT + 'k91-body-hodnoceni-1280.png' });
  await okno.getByRole('button', { name: /Uložit/ }).last().click();
  const post = await dokud(() => (stav.zapisy ?? []).find(z => z.path === '/api/shift-reviews' && z.m === 'POST'), 4000);
  tvrdi('R6: uložení pošle nahraditAuto: true', !!post && /"nahraditAuto":true/.test(post.body), post?.body);
  await ctx.close();
}

// ---------------------------------------------------------------------------
// R7 Okno postupu
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav } = await kontext({ fix: FIX('vedeni.postupy'), posunCasu: POSUN, dalsi: podvrh });
  await otevriPlochu(p, '/employer/overview?view=procedures', 'vedeni.postupy');
  await p.getByText('Otevírací rutina').first().click();
  const detail = p.getByRole('dialog', { name: 'Otevírací rutina' });
  await detail.waitFor({ timeout: 8000 });
  await detail.getByRole('button', { name: /Upravit/ }).first().click();
  const editor = p.getByRole('dialog', { name: 'Upravit postup' });
  await editor.waitFor({ timeout: 8000 });
  const sekce = editor.locator('[data-body-postupu]');
  await dokud(async () => /Za dokončený postup 10 b/.test(await text(sekce)), 5000);
  tvrdi('R7: okno postupu má „Body za postup“ s „Podle podniku“ a větou výchozího', /Body za postup/.test(await text(sekce)) && /Za dokončený postup 10 b/.test(await text(sekce)), await text(sekce));
  await sekce.getByRole('tab', { name: 'Za každý krok' }).click();
  tvrdi('R7: „Za každý krok“ → u kroku pole vlastních plus bodů (placeholder +1)', await dokud(async () => (await editor.getByLabel('Vlastní body kroku 1 za splnění').count()) === 1, 2000)
    && (await editor.getByLabel('Vlastní body kroku 1 za splnění').getAttribute('placeholder')) === '+1');
  await editor.getByLabel('Vlastní body kroku 1 za splnění').fill('3');
  await sekce.locator('[data-prepocet-zpetne]').first().click();
  await sekce.screenshot({ path: OUT + 'k91-body-postup-1280.png' });
  await editor.getByRole('button', { name: 'Uložit změny' }).click();
  const okno = p.getByRole('dialog', { name: 'Přepočítat zpětně body' });
  await okno.waitFor({ timeout: 6000 });
  const nahled = (stav.zapisy ?? []).find(z => z.path === '/api/body/prepocet');
  tvrdi('R7: náhled přepočtu postupu nese typ postup, id 1, nový způsob a kroky z editoru (body 3)', !!nahled && /"typ":"postup","id":1/.test(nahled.body) && /"rezim":"kroky"/.test(nahled.body) && /"points":3/.test(nahled.body), nahled?.body?.slice(0, 300));
  await okno.getByRole('button', { name: 'Přepočítat a uložit' }).click();
  const zap = await dokud(() => { const z = (stav.zapisy ?? []).filter(x => x.path === '/api/procedures/1' || (x.path === '/api/body/prepocet' && /"nahled":false/.test(x.body))); return z.length >= 2 ? z : null; }, 5000);
  tvrdi('R7: potvrzení = PATCH postupu bez bodyRezim (kroky s body 3), pak přepočet', !!zap && zap[0].path === '/api/procedures/1' && !/bodyRezim/.test(zap[0].body) && /"points":3/.test(zap[0].body) && zap[1].path === '/api/body/prepocet', JSON.stringify(zap?.map(z => z.path)));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// R9 Okno úkolu: body za úkol (1280 i 390)
// ---------------------------------------------------------------------------
for (const tel of [false, true]) {
  const { ctx, p } = await kontext({ fix: FIX('vedeni.ukoly'), posunCasu: POSUN, dalsi: podvrh, ...(tel ? { viewport: TEL, mobil: true } : {}) });
  await otevriPlochu(p, '/employer/overview?view=tasks', 'vedeni.ukoly');
  await p.getByRole('button', { name: 'Upravit úkol Vyčistit lednici a mrazák u baru' }).first().click();
  const sekce = p.locator('[data-body-ukolu]');
  await sekce.waitFor({ timeout: 8000 });
  await dokud(async () => /Za splněný úkol 5 b/.test(await text(sekce)), 4000);
  await sekce.getByRole('tab', { name: 'Za celek' }).click();
  const t9 = await text(sekce);
  tvrdi(`R9 (${tel ? 390 : 1280}): okno úkolu má „Body za úkol“, „Za celek“ → „Za celý úkol 5 b, za nesplněnou položku checklistu −1 b.“ a přepočet zpětně`,
    /Body za úkol/.test(t9) && /Za celý úkol 5 b, za nesplněnou položku checklistu −1 b\./.test(t9) && (await sekce.locator('[data-prepocet-zpetne]').count()) === 1, t9);
  await sekce.scrollIntoViewIfNeeded();
  const pr = await preteceni(p);
  tvrdi(`R9 (${tel ? 390 : 1280}): nic nepřetéká`, pr.dokument <= 0 && pr.prvky.length === 0, JSON.stringify(pr));
  await sekce.screenshot({ path: OUT + `k91-body-ukol-${tel ? 390 : 1280}.png` });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// R8 Telefon 390 × 844 s dotykem
// ---------------------------------------------------------------------------
{
  const { ctx, p } = await kontext({ fix: FIX('vedeni.odmeny'), posunCasu: POSUN, dalsi: podvrh, viewport: TEL, mobil: true });
  const karta = await nastaveni(p);
  await karta.locator('[data-volba-rezimu="uzaverky"]').getByRole('tab', { name: 'Za celek' }).click();
  await karta.locator('[data-nastaveni-stropu]').getByRole('switch').click();
  await karta.scrollIntoViewIfNeeded();
  let pr = await preteceni(p);
  tvrdi('R8 (390): karta Způsob počítání nepřetéká', pr.dokument <= 0 && pr.prvky.length === 0, JSON.stringify(pr));
  await karta.screenshot({ path: OUT + 'k91-body-nastaveni-390.png' });
  const cil = await karta.locator('[data-prepocet-zpetne]').first().boundingBox();
  const cilZ = await karta.locator('[data-zdroj-stropu="navic"]').boundingBox();
  tvrdi('R8 (390): „Přepočítat zpětně body“ i zdroj stropu mají cíl aspoň 44 px', !!cil && cil.height >= 44 && !!cilZ && cilZ.height >= 44, JSON.stringify([cil, cilZ]));
  await karta.locator('[data-prepocet-zpetne]').first().click();
  await p.getByRole('button', { name: 'Uložit nastavení' }).click();
  const okno = p.getByRole('dialog', { name: 'Přepočítat zpětně body' });
  await okno.waitFor({ timeout: 6000 });
  await dokud(async () => /Změní se/.test(await text(okno)), 4000);
  pr = await preteceni(p);
  tvrdi('R8 (390): okno náhledu nepřetéká', pr.dokument <= 0 && pr.prvky.length === 0, JSON.stringify(pr));
  await p.screenshot({ path: OUT + 'k91-body-nahled-390.png' });
  await ctx.close();
}
// R8: okno postupu a hodnocení směny na telefonu
{
  const { ctx, p } = await kontext({ fix: FIX('vedeni.postupy'), posunCasu: POSUN, dalsi: podvrh, viewport: TEL, mobil: true });
  await otevriPlochu(p, '/employer/overview?view=procedures', 'vedeni.postupy');
  await p.getByText('Otevírací rutina').first().click();
  const detail = p.getByRole('dialog', { name: 'Otevírací rutina' });
  await detail.waitFor({ timeout: 8000 });
  await detail.getByRole('button', { name: /Upravit/ }).first().click();
  const editor = p.getByRole('dialog', { name: 'Upravit postup' });
  await editor.waitFor({ timeout: 8000 });
  const sekce = editor.locator('[data-body-postupu]');
  await dokud(async () => /Za dokončený postup 10 b/.test(await text(sekce)), 5000);
  await sekce.getByRole('tab', { name: 'Za každý krok' }).click();
  await sekce.scrollIntoViewIfNeeded();
  const pr = await preteceni(p);
  tvrdi('R8 (390): okno postupu s body nepřetéká', pr.dokument <= 0 && pr.prvky.length === 0, JSON.stringify(pr));
  await p.screenshot({ path: OUT + 'k91-body-postup-390.png' });
  const krok = editor.getByLabel('Vlastní body kroku 1 za splnění');
  await krok.scrollIntoViewIfNeeded();
  await p.screenshot({ path: OUT + 'k91-body-postup-kroky-390.png' });
  await ctx.close();
}
{
  const { ctx, p } = await kontext({ fix: FIX('vedeni.odmeny'), posunCasu: POSUN, dalsi: podvrh, viewport: TEL, mobil: true });
  await otevriPlochu(p, '/employer/overview?view=rewards', 'vedeni.odmeny');
  await p.getByRole('button', { name: 'Ohodnotit: Eva Nováková' }).first().click();
  const blok = p.locator('[data-rucni-prednost]');
  await blok.waitFor({ timeout: 10000 });
  await blok.scrollIntoViewIfNeeded();
  const pr = await preteceni(p);
  tvrdi('R8 (390): hodnocení směny s ruční předností nepřetéká', pr.dokument <= 0 && pr.prvky.length === 0, JSON.stringify(pr));
  await p.screenshot({ path: OUT + 'k91-body-hodnoceni-390.png' });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// R10 Záporné body v hodnocení (kolo 93, Martin: „V hodnocení nemůžu dávat mínusové body.")
// Dřív type=number + parseInt || 0: rozepsané „-" se přepsalo na 0 a iPhone minus nemá. Teď text, krokovač a ±.
// ---------------------------------------------------------------------------
for (const tel of [false, true]) {
  const sirka = tel ? 390 : 1280;
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX('vedeni.odmeny'), posunCasu: POSUN, dalsi: podvrh, ...(tel ? { viewport: TEL, mobil: true } : {}) });
  await otevriPlochu(p, '/employer/overview?view=rewards', 'vedeni.odmeny');
  await p.getByRole('button', { name: 'Ohodnotit: Eva Nováková' }).first().click();
  const pole = p.locator('#hodnoceni-body');
  await pole.waitFor({ timeout: 10000 });
  await pole.scrollIntoViewIfNeeded();
  const okno = p.getByRole('dialog').filter({ has: pole });
  await pole.click();
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.type('-');
  tvrdi(`R10 (${sirka}): rozepsané „-" v Body za směnu vydrží (dřív se přepsalo na 0)`, (await pole.inputValue()) === '-', await pole.inputValue());
  await p.keyboard.type('15');
  tvrdi(`R10 (${sirka}): „-15" → pole −15 a „· srážka"`, (await pole.inputValue()) === '-15' && /srážka/.test(await text(okno)), await pole.inputValue());
  await okno.getByRole('button', { name: 'Otočit znaménko' }).click();
  tvrdi(`R10 (${sirka}): ± otočí znaménko (iPhone nemá na číselné klávesnici minus): -15 → 15`, (await pole.inputValue()) === '15', await pole.inputValue());
  await okno.getByRole('button', { name: 'Otočit znaménko' }).click();
  await okno.getByRole('button', { name: 'Ubrat bod' }).click();
  tvrdi(`R10 (${sirka}): ± zpět a krokovač „Ubrat bod" → -16`, (await pole.inputValue()) === '-16', await pole.inputValue());
  const cile = await Promise.all(['Ubrat bod', 'Přidat bod', 'Otočit znaménko'].map(async n => (await okno.getByRole('button', { name: n }).boundingBox())?.height ?? 0));
  tvrdi(`R10 (${sirka}): krokovač a ± mají cíle ≥ 44 px`, cile.every(v => v >= 44), JSON.stringify(cile));
  const pr = await preteceni(p);
  tvrdi(`R10 (${sirka}): okno hodnocení s bodovým polem nepřetéká`, pr.dokument <= 0 && pr.prvky.length === 0, JSON.stringify(pr));
  await p.screenshot({ path: OUT + `k93-hodnoceni-minus-${sirka}.png` });
  await okno.getByRole('button', { name: /Uložit/ }).last().click();
  const post = await dokud(() => (stav.zapisy ?? []).find(z => z.path === '/api/shift-reviews' && z.m === 'POST'), 4000);
  tvrdi(`R10 (${sirka}): uložení pošle "points":-16`, !!post && /"points":-16\b/.test(post.body), post?.body);
  tvrdi(`R10 (${sirka}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}
// R10: srážka v Nastavení bodů („Nesplněný úkol") jde napsat se znaménkem a uloží se záporná.
{
  const { ctx, p, stav } = await kontext({ fix: FIX('vedeni.odmeny'), posunCasu: POSUN, dalsi: podvrh });
  await nastaveni(p);
  const pole = p.locator('#body-taskMissed');
  await pole.scrollIntoViewIfNeeded();
  await pole.click();
  await p.keyboard.press('ControlOrMeta+a');
  await p.keyboard.type('-');
  const rozepsano = await pole.inputValue();
  await p.keyboard.type('7');
  tvrdi('R10: srážka „Nesplněný úkol" — rozepsané „-" vydrží a „-7" zůstane', rozepsano === '-' && (await pole.inputValue()) === '-7', `${rozepsano} / ${await pole.inputValue()}`);
  stav.zapisy = [];
  await p.getByRole('button', { name: 'Uložit nastavení' }).click();
  const patch = await dokud(() => (stav.zapisy ?? []).find(z => z.path === '/api/teams' && z.m === 'PATCH'), 4000);
  tvrdi('R10: uložení nese "taskMissed":-7', !!patch && /"taskMissed":-7\b/.test(patch.body), patch?.body?.slice(0, 300));
  await ctx.close();
}

await konec();
