// Kolo 9, N1 — „Navíc", balík V (vedení): fronta, nabídka, profil, uzávěrka, hledání.
//
//  O — Odměny (1280): widget Navíc v týmu — souhrn měsíce, chip „3 čeká", čekající první, filtry
//      Čeká / Uznané / Odmítnuté / Vše a člověk; Uznat (okno: body z nabídky, krokovač ±5, prémie,
//      poznámka → PATCH), Odmítnout (důvod → PATCH), Zapsat za člena (chip nabídky předvyplní,
//      POST s userId a uznat); část Navíc = nabídka (od kola 11 Úkoly za body): Nový úkol za body (POST), Upravit (PATCH), Smazat
//      s potvrzením (DELETE); v klidu žádná limetka; fotka zápisu je odkaz.
//  T — Odměny na telefonu (390×844, dotyk; světle i tmavě): nic nepřetéká, dotykové cíle, okno Uznat zdola,
//      profil člena se sekcí Navíc.
//  P — Přehled: Čeká na tebe má „3 zápisy navíc k uznání" (jen s navic.uznat; bez něj se /api/navic nevolá)
//      a proklik otevře Odměny › Navíc; široký widget na Přehledu má odkaz „Odměny ›".
//  D — Hluboký odkaz ?view=rewards&arg=navic (oznámení) otevře část Navíc; hledání „navíc" najde akci.
//  U — Detail uzávěrky: sekce „Navíc na směně" (osádka + svázaný zápis), Uznat odsud (okno nad detailem).
//      Profil člena (ze žebříčku na telefonu, T4): sekce Navíc s čekajícím k uznání, okno nad profilem.
//  L — Polsky na 320 px: widget i okno Uznat bez přetečení.
//   SONDY_ZAKLAD=http://localhost:3442 node scripts/sondy/k85-navic-ved.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, dotazyNa, roleMine, VLASTNIK, DIR, OUT, BASE } from './k68-spolecne.mjs';

const PC = { width: 1280, height: 900 };
const TEL = { width: 390, height: 844 };
const SNIMKY = process.env.SONDY_SNIMKY ? process.env.SONDY_SNIMKY.replace(/\/?$/, '/') : OUT;
const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PRED3: praha(-3), PRED4: praha(-4), PRED5: praha(-5), PRED6: praha(-6) };
const MESIC = DNY.DNES.slice(0, 7);
const iso = (den, hm) => new Date(`${den}T${hm}:00+02:00`).toISOString();
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  t = t.replace(/"@([A-Z0-9]+)-(\d\d:\d\d)"/g, (_, k, hm) => `"${iso(DNY[k] ?? DNY.DNES, hm)}"`);
  for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`).replaceAll(`"${k}T`, `"${v}T`);
  return JSON.parse(t.replaceAll('"MESIC"', `"${MESIC}"`));
};
const KLICE_NAVIC = ['navic.zapsat', 'navic.zobrazit_tym', 'navic.uznat', 'navic.nabidka'];
/** Vlastník s klíči navic.* (fixtura roles.json je z doby před kolem 9). */
const VEDENI = { ...VLASTNIK, opravneni: [...new Set([...VLASTNIK.opravneni, ...KLICE_NAVIC])] };
const skutecneChyby = (chyby) => chyby.filter(c => !/Minified React error #418|Hydration|hydrat|Failed to load resource|same key/i.test(c));
const text = async (loc) => ((await loc.count()) ? await loc.first().innerText() : '').replace(/\u00a0/g, ' ');
const preteceni = (p) => p.evaluate(() => {
  const okno = window.innerWidth;
  const dokument = document.documentElement.scrollWidth - okno;
  const karty = [...document.querySelectorAll('[data-plocha] li[data-widget]:not([hidden]) section, [data-plocha] li[data-widget="nastroj"] > *, [role="dialog"], .modal-sheet')]
    .filter(s => s.scrollWidth > s.clientWidth + 1).length;
  return { dokument, karty };
});
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]:not([hidden])`);
// Limetka = Button accent (`on-accent`) nebo `btn-accent`.
const limetek = (p) => p.locator('[data-plocha] button.on-accent:visible, [data-plocha] .btn-accent:visible').count();

/** Podvrh /api/navic a /api/navic/offers se stavem v paměti; zápisy do `stav.zapisy`. */
const podvrh = () => {
  const data = nacti('k85-navic-ved-navic');
  const nabidka = nacti('k85-navic-ved-offers');
  let dalsiId = 100;
  return (req, json, stav) => {
    const url = new URL(req.url());
    const path = url.pathname;
    const m = req.method();
    const q = url.searchParams;
    if (m !== 'GET' && (path.startsWith('/api/navic') || path === '/api/notes')) {
      const telo = (() => { try { return req.postData() ? JSON.parse(req.postData()) : null; } catch { return null; } })();
      (stav.zapisy ??= []).push({ m, path, telo, q: url.search });
      if (path === '/api/navic/offers') {
        if (m === 'POST') { const o = { id: ++dalsiId, bonusCzk: null, description: null, validFrom: null, validTo: null, maxPerDay: null, ...telo, createdAt: new Date().toISOString() }; nabidka.offers.push(o); return json({ ok: true, offer: o }, 201); }
        if (m === 'PATCH') { const o = nabidka.offers.find(x => x.id === Number(telo?.id)); if (o) Object.assign(o, telo); return json({ ok: true, offer: o }); }
        if (m === 'DELETE') { const i = nabidka.offers.findIndex(x => x.id === Number(q.get('id'))); if (i >= 0) nabidka.offers.splice(i, 1); return json({ ok: true }); }
      }
      const mm = /^\/api\/navic\/(\d+)$/.exec(path);
      if (mm && m === 'PATCH') {
        const z = data.items.find(x => x.id === Number(mm[1]));
        if (!z) return json({ error: 'Zápis nenalezen.' }, 404);
        if (telo?.status === 'uznano') { z.status = 'uznano'; z.points = Number(telo.points) || 0; z.bonusCzk = telo.bonusCzk ?? null; }
        else { z.status = 'odmitnuto'; z.points = null; z.bonusCzk = null; }
        z.decidedBy = 15; z.decidedByName = 'Martin Nemeškal'; z.decidedAt = new Date().toISOString(); z.decisionNote = telo?.note ?? null;
        return json({ ok: true, item: z });
      }
      if (path === '/api/navic' && m === 'POST') {
        const n = telo?.offerId ? data.nabidka.find(x => x.id === Number(telo.offerId)) ?? null : null;
        const jmena = { 16: ['Eva Testová', '🙂'], 17: ['Jakub Horák', '🧔'], 18: ['Tereza Malá', null] };
        const z = {
          id: ++dalsiId, userId: Number(telo?.userId) || 15, userName: jmena[telo?.userId]?.[0] ?? 'Martin Nemeškal', userAvatar: jmena[telo?.userId]?.[1] ?? '🧑',
          reportedBy: 15, reportedByName: 'Martin Nemeškal', day: telo?.day ?? DNY.DNES, shiftId: null, closingId: null, taskId: null,
          offerId: n?.id ?? null, offerTitle: n?.title ?? null, text: telo?.text ?? '', photoUrl: null, pointsProposed: n?.points ?? null,
          status: telo?.uznat ? 'uznano' : 'ceka', points: telo?.uznat ? Number(telo.uznat.points) || 0 : null, bonusCzk: telo?.uznat?.bonusCzk ?? null,
          decidedBy: telo?.uznat ? 15 : null, decidedByName: telo?.uznat ? 'Martin Nemeškal' : null, decidedAt: telo?.uznat ? new Date().toISOString() : null,
          decisionNote: telo?.uznat?.note ?? null, createdAt: new Date().toISOString(),
        };
        data.items.unshift(z);
        return json({ ok: true, item: z }, 201);
      }
      return json({ ok: true });
    }
    if (path === '/api/navic/offers') return json(nabidka);
    if (path === '/api/navic') {
      (stav.ctiNavic ??= []).push(url.search);
      const stavF = q.get('status'); const mesic = q.get('month'); const den = q.get('day'); const userId = Number(q.get('userId')) || null;
      const items = data.items.filter(z => (!stavF || z.status === stavF) && (!mesic || z.day.startsWith(mesic)) && (!den || z.day === den) && (!userId || z.userId === userId));
      return json({ items, nabidka: data.nabidka, smi: data.smi });
    }
    if (path === '/api/rewards' && m === 'GET') return json(nacti('k69-b7-rewards'));
    if (path === '/api/rewards/catalog') return json(nacti('k69-b7-catalog'));
    if (path === '/api/rewards/awards') return json({ awards: [] });
    if (path === '/api/shift-reviews') return json(q.get('month') ? { month: MESIC, days: [] } : { list: [] });
    if (path === '/api/closings') return json({ ...nacti('k69-b5a-closings'), payDailyCash: true });
    if (path === '/api/closings/calendar') return json({ ...nacti('k69-b5a-calendar'), month: q.get('month') ?? MESIC });
    if (path === '/api/closings/handover') return json(nacti('k69-b5a-handover'));
    if (path === '/api/closings/coworkers') return json(nacti('k84-uzaverky-coworkers'));
    if (path === '/api/closings/wage') return json({ available: false });
    const det = /^\/api\/closings\/(\d+)$/.exec(path);
    if (det) {
      // Terezin zápis je svázaný s otevřenou uzávěrkou (číslo řádku ze seznamu, ne z fixtury detailu).
      const z6 = data.items.find(x => x.id === 6);
      if (z6) z6.closingId = Number(det[1]);
      return json(nacti('k84-uzaverky-closing-detail'));
    }
    if (path === '/api/notes') return json([]);
    if (/^\/api\/employees\/\d+$/.test(path)) return json(nacti('k69-b2-employee'));
    if (path === '/api/attendance') return json({ roster: [], entries: [], adjustments: [] });
    if (path === '/api/payroll') return json({ lide: [], payDailyCash: false, pravidla: {} });
    return undefined;
  };
};

const FIX_ODMENY = nacti('k85-navic-ved-rozlozeni-odmeny');
const FIX_PREHLED = nacti('k85-navic-ved-rozlozeni-prehled');
const FIX_UZAVERKY = { stranka: 'vedeni.uzaverky', polozky: [{ id: 'nastroj', widget: 'nastroj', velikost: 'L' }], dostupne: [], tarifem: [], zdroj: 'aplikace', rozsah: 'typ:vedeni', zamceno: false, smiUpravit: true, smiVychozi: true, verze: 0 };
const ODMENY = '/employer/overview?view=rewards';

// ---------------------------------------------------------------------------
// O — Odměny 1280: widget, rozhodnutí, zápis za člena, nabídka
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ viewport: PC, fix: FIX_ODMENY, mineData: VEDENI, dalsi: podvrh() });
  await otevri(p, ODMENY, 'vedeni.odmeny');
  const w = widgetLi(p, 'odmeny.navic_tymu');
  await dokud(async () => (await w.locator('[data-navic-souhrn]').count()) > 0, 10000);
  const souhrn = await text(w.locator('[data-navic-souhrn]'));
  tvrdi('O1: souhrn „Tento měsíc · N uznáno · N b · … · 3 čekají"', /Tento měsíc/.test(souhrn) && /uznáno/.test(souhrn) && /\d+ b/.test(souhrn) && /3 čekají/.test(souhrn), souhrn);
  tvrdi('O1: v hlavičce chip „3 čeká" a rychlý filtr Měsíc', /3 čeká/.test(await text(w)) && (await w.locator('[data-rychly-filtr="obdobi"]').count()) === 1);
  tvrdi('O1: Sbalit je v hlavičce a žádný odkaz „Odměny" (jsme na Odměnách)', (await w.getByRole('button', { name: /^Sbalit/ }).count()) === 1 && (await w.getByRole('button', { name: 'Odměny', exact: true }).count()) === 0);
  tvrdi('O1: dotaz na měsíc týmu i na všechny čekající (stejná adresa jako fronta)', (stav.ctiNavic ?? []).includes(`?scope=team&month=${MESIC}`) && (stav.ctiNavic ?? []).includes('?scope=team&status=ceka'), JSON.stringify(stav.ctiNavic));
  const radky = w.locator('.list-row');
  const prvni = await text(radky.first());
  const jakub = radky.filter({ hasText: 'Jakub Horák' }).first();
  tvrdi('O1: čekající první (nejstarší nahoře): Tereza, pak Jakub s textem, chipem „Čeká na uznání" a odkazem Fotka', /Tereza Malá/.test(prvni) && /Přeskládala jsem sklad/.test(prvni) && /Čeká na uznání/.test(prvni)
    && /Zaskočil jsem za Terezu/.test(await text(jakub)) && (await jakub.getByRole('link', { name: 'Fotka' }).count()) === 1, prvni.replace(/\n/g, ' | '));
  tvrdi('O1: Eva má „z nabídky: Vytřít sklad a chodbu" a „návrh +20 b"', /z nabídky: Vytřít sklad a chodbu/.test(await text(w)) && /návrh \+20 b/.test(await text(w)));
  tvrdi('O1: uznaný zápis nese odměnu „+30 b · 200 Kč", odmítnutý důvod', /\+30 b · 200 Kč/.test(await text(w)) && /Důvod: Patří k běžným úkolům směny\./.test(await text(w)));
  tvrdi('O1: v klidu žádná limetka na ploše', (await limetek(p)) === 0, `${await limetek(p)}×`);
  await p.screenshot({ path: SNIMKY + 'k85-navic-ved-odmeny-1280.png', fullPage: true });

  // Filtry: stav a člověk.
  const stavy = w.getByRole('tablist', { name: 'Stav zápisů' });
  await stavy.getByRole('tab', { name: /Uznané/ }).click();
  tvrdi('O2: filtr Uznané → dva řádky (Tereza, Eva)', await dokud(async () => (await radky.count()) === 2, 2000) && /Tereza Malá/.test(await text(w)) && /Umytá výloha/.test(await text(w)), String(await radky.count()));
  await stavy.getByRole('tab', { name: /Vše/ }).click();
  await dokud(async () => (await radky.count()) === 6, 2000);
  await w.getByLabel('Člověk').selectOption('16');
  tvrdi('O2: člověk Eva → dva řádky, Jakub pryč', await dokud(async () => (await radky.count()) === 2, 2000) && (await radky.filter({ hasText: 'Jakub Horák' }).count()) === 0, String(await radky.count()));
  await w.getByLabel('Člověk').selectOption('');
  await dokud(async () => (await radky.count()) === 6, 2000);

  // Uznat Evu: okno, body z nabídky 20, krokovač +5, prémie, poznámka → PATCH.
  await w.getByRole('button', { name: 'Uznat: Eva Testová' }).click();
  const okno = p.getByRole('dialog', { name: 'Uznat navíc' });
  tvrdi('O3: „Uznat" otevře okno Uznat navíc s textem zápisu a body z nabídky 20', await okno.waitFor({ timeout: 4000 }).then(() => true, () => false)
    && /Vytřela jsem sklad/.test(await text(okno)) && (await okno.locator('#navic-body').inputValue()) === '20');
  await okno.getByRole('button', { name: 'Víc bodů' }).click();
  tvrdi('O3: krokovač +5 → 25', (await okno.locator('#navic-body').inputValue()) === '25');
  await okno.locator('#navic-premie').fill('100');
  await okno.locator('#navic-poznamka').fill('Díky za rohy.');
  await okno.screenshot({ path: SNIMKY + 'k85-navic-ved-uznat-1280.png' });
  await okno.getByRole('button', { name: 'Uznat', exact: true }).click();
  const patch = await dokud(() => (stav.zapisy ?? []).find(z => z.m === 'PATCH' && z.path === '/api/navic/1'), 4000);
  tvrdi('O3: PATCH /api/navic/1 { status: uznano, points: 25, bonusCzk: 100, note }', !!patch && patch.telo?.status === 'uznano' && patch.telo?.points === 25 && patch.telo?.bonusCzk === 100 && patch.telo?.note === 'Díky za rohy.', JSON.stringify(patch?.telo));
  tvrdi('O3: okno se zavře, toast „Uznáno: +25 b · 100 Kč" a řádek Evy je Uznáno', await dokud(async () => (await okno.count()) === 0, 3000)
    && await dokud(() => p.getByText('Uznáno: +25 b · 100 Kč').isVisible().catch(() => false), 3000)
    && await dokud(async () => (await w.getByRole('button', { name: 'Uznat: Eva Testová' }).count()) === 0, 3000));
  // Odmítnout Jakuba s důvodem.
  await w.getByRole('button', { name: 'Odmítnout: Jakub Horák' }).click();
  const oknoO = p.getByRole('dialog', { name: 'Odmítnout navíc' });
  await oknoO.waitFor({ timeout: 4000 });
  await oknoO.locator('#navic-duvod').fill('Záskok se platí jako směna.');
  await oknoO.getByRole('button', { name: 'Odmítnout', exact: true }).click();
  const patch2 = await dokud(() => (stav.zapisy ?? []).find(z => z.m === 'PATCH' && z.path === '/api/navic/2'), 4000);
  tvrdi('O4: Odmítnout → PATCH /api/navic/2 { status: odmitnuto, note }', !!patch2 && patch2.telo?.status === 'odmitnuto' && patch2.telo?.note === 'Záskok se platí jako směna.', JSON.stringify(patch2?.telo));
  tvrdi('O4: chip „2 čeká" v hlavičce', await dokud(async () => /2 čeká/.test(await text(w)), 8000), (await text(w)).slice(0, 120));

  // Zapsat za člena: chip nabídky předvyplní text a body, POST s userId a uznat.
  await w.getByRole('button', { name: 'Zapsat za člena' }).click();
  const oknoZ = p.getByRole('dialog', { name: 'Zapsat navíc za člena' });
  tvrdi('O5: okno Zapsat navíc za člena s výběrem člena a chipy nabídky', await oknoZ.waitFor({ timeout: 4000 }).then(() => true, () => false)
    && (await oknoZ.getByRole('button', { name: /Vytřít sklad a chodbu/ }).count()) === 1);
  await oknoZ.locator('#navic-kdo').selectOption('18');
  await oknoZ.getByRole('button', { name: /Vytřít sklad a chodbu/ }).click();
  tvrdi('O5: chip předvyplní text a 20 b', (await oknoZ.locator('#navic-text').inputValue()) === 'Vytřít sklad a chodbu' && (await oknoZ.locator('#navic-body-za').inputValue()) === '20');
  await oknoZ.locator('#navic-premie-za').fill('150');
  await oknoZ.getByRole('button', { name: 'Zapsat a uznat' }).click();
  const post = await dokud(() => (stav.zapisy ?? []).find(z => z.m === 'POST' && z.path === '/api/navic'), 4000);
  tvrdi('O5: POST /api/navic { userId: 18, text, day: dnes, offerId: 1, uznat: { points: 20, bonusCzk: 150 } }', !!post && post.telo?.userId === 18 && post.telo?.offerId === 1 && post.telo?.day === DNY.DNES
    && post.telo?.uznat?.points === 20 && post.telo?.uznat?.bonusCzk === 150, JSON.stringify(post?.telo));
  tvrdi('O5: toast „Zapsáno a uznáno: +20 b · 150 Kč" a Tereza přibyla jako Uznáno', await dokud(() => p.getByText('Zapsáno a uznáno: +20 b · 150 Kč').isVisible().catch(() => false), 3000)
    && await dokud(async () => (await radky.count()) === 7, 3000));

  // Část Navíc: správa nabídky.
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Navíc' }).click();
  const sprava = p.locator('[data-sprava-nabidky]');
  tvrdi('O6: část Navíc ukáže Úkoly za body s pěti položkami, chipem Vypnuto a Prošlá', await dokud(async () => (await sprava.locator('.list-row').count()) === 5, 6000)
    && /Vypnuto/.test(await text(sprava)) && /Prošlá/.test(await text(sprava)), (await text(sprava)).slice(0, 300).replace(/\n/g, ' | '));
  // Kolo 11: nabídka = Úkoly za body (opakování · body · prémie; kolik lidí a „uzná se samo" v podrobnostech).
  tvrdi('O6: meta úkolu „Kdykoli · +50 b · 300 Kč" a „uzná se samo"', /Kdykoli · \+50 b · 300 Kč/.test(await text(sprava)) && /uzná se samo/.test(await text(sprava)));
  tvrdi('O6: v části Navíc žádná limetka', (await limetek(p)) === 0);
  await sprava.getByRole('button', { name: 'Nový úkol za body' }).click();
  const oknoN = p.getByRole('dialog', { name: 'Nový úkol za body' });
  await oknoN.waitFor({ timeout: 4000 });
  await oknoN.locator('#nabidka-nazev').fill('Rozvézt catering');
  await oknoN.locator('#nabidka-body').fill('25');
  await oknoN.locator('#nabidka-premie').fill('200');
  await oknoN.getByRole('switch', { name: 'Uznat automaticky' }).click();
  await oknoN.locator('#nabidka-limit').fill('2');
  await oknoN.screenshot({ path: SNIMKY + 'k85-navic-ved-nabidka-okno-1280.png' });
  await oknoN.getByRole('button', { name: 'Vypsat úkol' }).click();
  const postN = await dokud(() => (stav.zapisy ?? []).find(z => z.m === 'POST' && z.path === '/api/navic/offers'), 4000);
  tvrdi('O7: Vypsat úkol → POST /api/navic/offers { title, points: 25, bonusCzk: 200, autoApprove: true, active: true, maxPerDay: 2 }', !!postN && postN.telo?.title === 'Rozvézt catering' && postN.telo?.points === 25 && postN.telo?.bonusCzk === 200
    && postN.telo?.autoApprove === true && postN.telo?.active === true && postN.telo?.maxPerDay === 2, JSON.stringify(postN?.telo));
  tvrdi('O7: okno se zavře, toast a šestá položka v seznamu', await dokud(async () => (await oknoN.count()) === 0, 3000) && await dokud(() => p.getByText('Úkol za body je vypsaný.').isVisible().catch(() => false), 3000)
    && await dokud(async () => (await sprava.locator('.list-row').count()) === 6, 3000));
  // Upravit přes menu → PATCH s id.
  await sprava.getByRole('button', { name: 'Upravit nebo smazat úkol Vytřít sklad a chodbu' }).click();
  await p.getByRole('menuitem', { name: 'Upravit…' }).click();
  const oknoU = p.getByRole('dialog', { name: 'Upravit úkol za body' });
  tvrdi('O8: Upravit… otevře okno s vyplněným názvem, body 20 a limitem 1', await oknoU.waitFor({ timeout: 4000 }).then(() => true, () => false)
    && (await oknoU.locator('#nabidka-nazev').inputValue()) === 'Vytřít sklad a chodbu' && (await oknoU.locator('#nabidka-body').inputValue()) === '20' && (await oknoU.locator('#nabidka-limit').inputValue()) === '1');
  await oknoU.locator('#nabidka-body').fill('30');
  await oknoU.getByRole('button', { name: 'Uložit' }).click();
  const patchN = await dokud(() => (stav.zapisy ?? []).find(z => z.m === 'PATCH' && z.path === '/api/navic/offers'), 4000);
  tvrdi('O8: Uložit → PATCH { id: 1, points: 30 }', !!patchN && patchN.telo?.id === 1 && patchN.telo?.points === 30, JSON.stringify(patchN?.telo));
  // Smazat s potvrzením → DELETE ?id=.
  let dialogProhlizece = false;
  p.on('dialog', d => { dialogProhlizece = true; void d.dismiss(); });
  await sprava.getByRole('button', { name: 'Upravit nebo smazat úkol Odvézt sklo do sběru' }).click();
  await p.getByRole('menuitem', { name: 'Smazat…' }).click();
  const potvrd = p.getByRole('dialog', { name: /Smazat úkol „Odvézt sklo do sběru"/ });
  tvrdi('O9: Smazat… se ptá oknem, ne confirm()', await dokud(() => potvrd.isVisible().catch(() => false), 2000) && !dialogProhlizece);
  await potvrd.getByRole('button', { name: 'Smazat' }).click();
  tvrdi('O9: potvrzení pošle DELETE /api/navic/offers?id=4 a položka zmizí', await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'DELETE' && z.path === '/api/navic/offers' && z.q === '?id=4'), 4000)
    && await dokud(async () => (await sprava.locator('.list-row').count()) === 5, 3000));
  await p.screenshot({ path: SNIMKY + 'k85-navic-ved-nabidka-1280.png', fullPage: true });
  tvrdi('O: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// T — Odměny na telefonu (390×844, dotyk), světle i tmavě
// ---------------------------------------------------------------------------
for (const tmavy of [false, true]) {
  const { ctx, p, stav, chyby } = await kontext({ viewport: TEL, mobil: true, tmavy, fix: FIX_ODMENY, mineData: VEDENI, dalsi: podvrh() });
  await otevri(p, ODMENY, 'vedeni.odmeny');
  const w = widgetLi(p, 'odmeny.navic_tymu');
  await dokud(async () => (await w.locator('[data-navic-souhrn]').count()) > 0, 10000);
  await p.waitForTimeout(500);
  const pr = await preteceni(p);
  tvrdi(`T1 (390${tmavy ? ' tmavě' : ''}): bez přetečení dokumentu i karet`, pr.dokument <= 1 && pr.karty === 0, JSON.stringify(pr));
  const uznat = w.getByRole('button', { name: 'Uznat: Eva Testová' });
  await uznat.scrollIntoViewIfNeeded();
  const box = await uznat.boundingBox();
  // Malé tlačítko 36 px s `tap-target` (dotyková plocha 44 px přes pseudo-prvek, jako ObdobiLista v Docházce).
  tvrdi(`T1 (390${tmavy ? ' tmavě' : ''}): tlačítko Uznat je dotykový cíl (tap-target, ≥ 36 px) a celé v šířce obrazovky`, !!box && box.height >= 36 && /\btap-target\b/.test(await uznat.getAttribute('class') ?? '') && box.x + box.width <= TEL.width, JSON.stringify(box));
  if (!tmavy) await p.screenshot({ path: SNIMKY + 'k85-navic-ved-odmeny-390.png', fullPage: false });
  await uznat.click();
  const okno = p.getByRole('dialog', { name: 'Uznat navíc' });
  await okno.waitFor({ timeout: 4000 });
  await p.waitForTimeout(400);
  const pr2 = await preteceni(p);
  tvrdi(`T2 (390${tmavy ? ' tmavě' : ''}): okno Uznat bez přetečení, krokovač a pole bodů s číselnou klávesnicí`, pr2.karty === 0 && (await okno.locator('#navic-body').getAttribute('inputmode')) === 'numeric', JSON.stringify(pr2));
  await p.screenshot({ path: SNIMKY + `k85-navic-ved-uznat-390${tmavy ? '-tmave' : ''}.png`, fullPage: false });
  await p.keyboard.press('Escape');
  await dokud(async () => (await okno.count()) === 0, 2000);
  // Profil člena ze žebříčku: sekce Navíc (tento měsíc, poslední zápisy) a Uznat odsud nad profilem.
  const nastroj = widgetLi(p, 'nastroj');
  await nastroj.getByRole('button', { name: 'Profil: Eva Testová' }).click();
  const profil = p.getByRole('dialog', { name: 'Eva Testová' });
  const navicP = profil.locator('[data-navic-clena]');
  tvrdi(`T4 (390${tmavy ? ' tmavě' : ''}): profil má sekci Navíc s „Tento měsíc: N uznáno", chipy a Zapsat navíc`, await dokud(async () => /Tento měsíc: \d+ uznáno/.test(await text(navicP)), 8000)
    && /Čeká na uznání/.test(await text(navicP)) && (await navicP.getByRole('button', { name: 'Zapsat navíc' }).count()) === 1, (await text(navicP)).replace(/\n/g, ' | ').slice(0, 300));
  tvrdi(`T4 (390${tmavy ? ' tmavě' : ''}): profil se ptá na zápisy člověka 16`, (stav.ctiNavic ?? []).includes('?scope=team&userId=16'), JSON.stringify(stav.ctiNavic));
  await navicP.scrollIntoViewIfNeeded();
  if (!tmavy) await p.screenshot({ path: SNIMKY + 'k85-navic-ved-profil-390.png', fullPage: false });
  await navicP.getByRole('button', { name: 'Uznat: Eva Testová' }).click();
  const oknoP = p.getByRole('dialog', { name: 'Uznat navíc' });
  const otevrenoP = await oknoP.waitFor({ timeout: 4000 }).then(() => true, () => false);
  if (otevrenoP) await oknoP.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)).then(() => undefined, () => undefined));
  tvrdi(`T4 (390${tmavy ? ' tmavě' : ''}): Uznat z profilu otevře okno nad profilem (jde na něj klepnout)`, otevrenoP
    && await oknoP.locator('#navic-body').evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && (hit === el || el.contains(hit)); }));
  await oknoP.getByRole('button', { name: 'Uznat', exact: true }).click();
  tvrdi(`T4 (390${tmavy ? ' tmavě' : ''}): PATCH /api/navic/1 a řádek v profilu je Uznáno`, await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'PATCH' && z.path === '/api/navic/1'), 4000)
    && await dokud(async () => (await navicP.getByRole('button', { name: 'Uznat: Eva Testová' }).count()) === 0 && /\+20 b/.test(await text(navicP)), 4000));
  await profil.getByRole('button', { name: 'Zavřít' }).first().click().catch(() => {});
  await p.keyboard.press('Escape');
  await dokud(async () => (await profil.count()) === 0, 3000);
  // Část Navíc na telefonu: nabídka bez přetečení.
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Navíc' }).click();
  const sprava = p.locator('[data-sprava-nabidky]');
  await dokud(() => sprava.isVisible().catch(() => false), 4000);
  await p.waitForTimeout(400);
  const pr3 = await preteceni(p);
  tvrdi(`T3 (390${tmavy ? ' tmavě' : ''}): nabídka bez přetečení`, pr3.dokument <= 1 && pr3.karty === 0, JSON.stringify(pr3));
  if (!tmavy) { await sprava.scrollIntoViewIfNeeded(); await p.screenshot({ path: SNIMKY + 'k85-navic-ved-nabidka-390.png', fullPage: false }); }
  tvrdi(`T (390${tmavy ? ' tmavě' : ''}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// P — Přehled: fronta v „Čeká na tebe" a proklik na Odměny › Navíc; bez navic.uznat nic
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ viewport: PC, fix: FIX_PREHLED, mineData: VEDENI, dalsi: podvrh() });
  await otevri(p, '/employer/overview', 'vedeni.prehled');
  const ceka = widgetLi(p, 'prehled.ceka_na_tebe');
  const tl = ceka.getByRole('button', { name: '3 zápisy navíc k uznání' });
  tvrdi('P1: Čeká na tebe má „3 zápisy navíc k uznání"', await dokud(async () => (await tl.count()) === 1, 8000), (await text(ceka)).replace(/\n/g, ' | '));
  tvrdi('P1: fronta čte jen /api/navic?scope=team&status=ceka', (stav.ctiNavic ?? []).includes('?scope=team&status=ceka'), JSON.stringify(stav.ctiNavic));
  const w = widgetLi(p, 'odmeny.navic_tymu');
  tvrdi('P2: střední widget na Přehledu má odkaz „Odměny" a nejvýš pět řádků', (await w.getByRole('button', { name: 'Odměny', exact: true }).count()) === 1 && (await w.locator('.list-row').count()) <= 5 && /…a 1 další/.test(await text(w)), (await text(w)).slice(-80));
  await p.screenshot({ path: SNIMKY + 'k85-navic-ved-prehled-1280.png', fullPage: false });
  await tl.click();
  tvrdi('P3: proklik otevře Odměny s částí Navíc (nabídka)', await dokud(async () => (await p.locator('[data-plocha="vedeni.odmeny"]').count()) === 1 && (await p.locator('[data-sprava-nabidky]').count()) === 1, 8000)
    && (await p.locator('[data-plocha]').getByRole('tab', { name: 'Navíc' }).getAttribute('aria-selected')) === 'true', p.url());
  tvrdi('P: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}
{
  // Účetní: navic.zobrazit_tym ano (ve skutečné roli), ale v podvrhu role bez navic.* → fronta není a nic se neptá.
  const { ctx, p, stav } = await kontext({ viewport: PC, fix: FIX_PREHLED, mineData: roleMine('ucetni', ['navic.zapsat', 'navic.zobrazit_tym', 'navic.uznat', 'navic.nabidka']), dalsi: podvrh() });
  await p.goto(BASE + '/employer/overview', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1500);
  tvrdi('P4: bez navic.uznat se fronta nekreslí a /api/navic se nevolá', (await p.getByRole('button', { name: /zápis.* navíc k uznání/ }).count()) === 0 && dotazyNa(stav, ['/api/navic']).length === 0, JSON.stringify(dotazyNa(stav, ['/api/navic']).map(d => d.u)));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// D — hluboký odkaz z oznámení a hledání
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await kontext({ viewport: PC, fix: FIX_ODMENY, mineData: VEDENI, dalsi: podvrh() });
  await otevri(p, `${ODMENY}&arg=navic`, 'vedeni.odmeny');
  tvrdi('D1: ?view=rewards&arg=navic otevře část Navíc', await dokud(async () => (await p.locator('[data-sprava-nabidky]').count()) === 1, 6000)
    && (await p.locator('[data-plocha]').getByRole('tab', { name: 'Navíc' }).getAttribute('aria-selected')) === 'true');
  // Hledání: „navíc" najde akci Navíc k uznání; z žebříčku zpět do části Navíc.
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Žebříček' }).click();
  await p.keyboard.press('Control+k');
  const hledani = p.getByRole('dialog', { name: 'Hledat v aplikaci' });
  await hledani.waitFor({ timeout: 5000 });
  await hledani.getByRole('combobox').fill('navíc');
  tvrdi('D2: „navíc" najde akce Navíc k uznání a Zapsat navíc', await dokud(async () => (await hledani.getByRole('option', { name: /Navíc k uznání/ }).count()) === 1 && (await hledani.getByRole('option', { name: /Zapsat navíc/ }).count()) === 1, 4000), (await text(hledani)).slice(0, 300));
  await hledani.getByRole('option', { name: /Navíc k uznání/ }).click();
  tvrdi('D2: výběr otevře Odměny › Navíc', await dokud(async () => (await p.locator('[data-sprava-nabidky]').count()) === 1, 6000));
  tvrdi('D: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// U — detail uzávěrky (1280 a 390)
// ---------------------------------------------------------------------------
for (const [nazev, volby] of [['1280', { viewport: PC, mobil: false }], ['390', { viewport: TEL, mobil: true }]]) {
  const { ctx, p, stav, chyby } = await kontext({ ...volby, fix: FIX_UZAVERKY, mineData: VEDENI, dalsi: podvrh() });
  await otevri(p, '/employer/overview?view=reports', 'vedeni.uzaverky');
  const nastroj = widgetLi(p, 'nastroj');
  await nastroj.locator('.list-row').first().scrollIntoViewIfNeeded();
  await nastroj.locator('.list-row').first().click();
  const d = p.getByRole('dialog').last();
  tvrdi(`U1 (${nazev}): detail uzávěrky se otevře`, await dokud(() => d.getByText('Vyplněná čísla').isVisible().catch(() => false), 6000));
  const sekce = d.locator('[data-navic-uzaverky]');
  await sekce.scrollIntoViewIfNeeded();
  tvrdi(`U1 (${nazev}): sekce „Navíc na směně" má Terezin zápis svázaný s otevřenou uzávěrkou a Jakubův z osádky ze dne, ne Evin z jiného dne`, await dokud(async () => (await sekce.locator('.list-row').count()) === 2, 6000)
    && /Přeskládala jsem sklad/.test(await text(sekce)) && /Zaskočil jsem za Terezu/.test(await text(sekce)) && !/Vytřela jsem sklad/.test(await text(sekce)), (await text(sekce)).replace(/\n/g, ' | ').slice(0, 300));
  tvrdi(`U1 (${nazev}): dotaz jen na den uzávěrky`, (stav.ctiNavic ?? []).includes(`?scope=team&day=${DNY.PRED3}`), JSON.stringify(stav.ctiNavic));
  await sekce.getByRole('button', { name: 'Uznat: Tereza Malá' }).click();
  const okno = p.getByRole('dialog', { name: 'Uznat navíc' });
  const otevreno = await okno.waitFor({ timeout: 4000 }).then(() => true, () => false);
  // Na telefonu okno vyjíždí zdola — měřit až po doběhnutí animace.
  if (otevreno) await okno.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)).then(() => undefined, () => undefined));
  tvrdi(`U2 (${nazev}): Uznat z detailu otevře okno nad detailem (jde na něj klepnout)`, otevreno
    && await okno.locator('#navic-body').evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && (hit === el || el.contains(hit)); }));
  await okno.locator('#navic-body').fill('40');
  if (nazev === '390') await p.screenshot({ path: SNIMKY + 'k85-navic-ved-uzaverka-uznat-390.png', fullPage: false });
  await okno.getByRole('button', { name: 'Uznat', exact: true }).click();
  tvrdi(`U2 (${nazev}): PATCH /api/navic/6 { points: 40 } a řádek je Uznáno`, await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'PATCH' && z.path === '/api/navic/6' && z.telo?.points === 40), 4000)
    && await dokud(async () => (await sekce.getByRole('button', { name: 'Uznat: Tereza Malá' }).count()) === 0 && /\+40 b/.test(await text(sekce)), 4000));
  tvrdi(`U2 (${nazev}): detail nepřetéká`, await d.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  if (nazev === '1280') await p.screenshot({ path: SNIMKY + 'k85-navic-ved-uzaverka-1280.png', fullPage: false });
  tvrdi(`U (${nazev}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// L — polsky na 320 px: widget, okno Uznat a nabídka bez přetečení
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await kontext({ viewport: { width: 320, height: 700 }, mobil: true, fix: FIX_ODMENY, mineData: VEDENI, dalsi: podvrh() });
  await ctx.addCookies([{ name: 'managero-lang', value: 'pl', domain: 'localhost', path: '/', sameSite: 'Lax' }]);
  await otevri(p, ODMENY, 'vedeni.odmeny');
  const w = widgetLi(p, 'odmeny.navic_tymu');
  await dokud(async () => (await w.locator('[data-navic-souhrn]').count()) > 0, 10000);
  await p.waitForTimeout(500);
  const pr = await preteceni(p);
  tvrdi('L1 (320 pl): widget bez přetečení', pr.dokument <= 1 && pr.karty === 0, JSON.stringify(pr));
  tvrdi('L1 (320 pl): texty polsky („Czeka na uznanie")', /Czeka na uznanie/.test(await text(w)), (await text(w)).slice(0, 200));
  await p.screenshot({ path: SNIMKY + 'k85-navic-ved-odmeny-320-pl.png', fullPage: false });
  await w.getByRole('button', { name: /Uznaj: Eva Testová/ }).click();
  const okno = p.getByRole('dialog');
  await okno.last().waitFor({ timeout: 4000 });
  await p.waitForTimeout(400);
  const pr2 = await preteceni(p);
  tvrdi('L2 (320 pl): okno Uznat bez přetečení', pr2.karty === 0, JSON.stringify(pr2));
  await p.screenshot({ path: SNIMKY + 'k85-navic-ved-uznat-320-pl.png', fullPage: false });
  await p.keyboard.press('Escape');
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Dodatkowo' }).click();
  await dokud(async () => (await p.locator('[data-sprava-nabidky]').count()) === 1, 4000);
  await p.waitForTimeout(400);
  const pr3 = await preteceni(p);
  tvrdi('L3 (320 pl): nabídka bez přetečení', pr3.dokument <= 1 && pr3.karty === 0, JSON.stringify(pr3));
  tvrdi('L: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

await konec();
