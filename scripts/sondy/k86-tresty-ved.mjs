// Kolo 10 — „Tresty", balík V (vedení): widget, okno Dát trest, sazebník, fronta, profil, uzávěrka, docházka, hledání.
//
//  O — Odměny (1280): widget Tresty v týmu — souhrn měsíce, chip „2 nesouhlasí", sporné nahoře s vyjádřením
//      (Trest platí dál → PATCH disputeHandled, Zrušit trest s důvodem → PATCH zruseno), Návrhy (Dát trest
//      předvyplněně z pozdního příchodu → POST se sourceKey, Zahodit → POST navrhy; manko jen větou „Manko řeš
//      dohodou o odpovědnosti, ne trestem." — spuštění, balík P), „···" Upravit (+5 b → PATCH points),
//      Dát trest z hlavičky (člověk bez prémií = krácení vypnuté, napomenutí, 409 se stropem pod krácením),
//      filtry Platné / Nesouhlasí / Zrušené / Vše; část Tresty = sazebník (Nová položka / Upravit / Smazat);
//      v klidu žádná limetka.
//  T — Odměny na telefonu (390×844, dotyk; světle i tmavě): nic nepřetéká, dotykové cíle, okno Dát trest
//      zdola s číselnou klávesnicí, profil člena se sekcí Tresty a oknem nad profilem.
//  P — Přehled: Čeká na tebe má „2 nesouhlasy s trestem" (jen s tresty.udelit; bez něj se na návrhy neptá
//      a Dát trest chybí) a proklik otevře Odměny › Tresty; střední widget má odkaz „Odměny".
//  D — Hluboký odkaz ?view=rewards&arg=tresty otevře část Tresty; hledání „potrestat" najde Dát trest.
//  U — Detail uzávěrky (1280 a 390): u manka věta o dohodě o odpovědnosti místo „Dát trest za manko"
//      (spuštění, balík P: § 346b ZP) a sekce „Tresty na směně".
//  H — Docházka: Souhrn hodin — „Dát trest za pozdní příchod" u Jakuba (nevyřízený příchod z návrhů), ne u Evy
//      (její příchod už trest má); POST s pozde:<id záznamu>.
//  L — Polsky na 320 px: widget a okno Dát trest bez přetečení.
//   SONDY_ZAKLAD=http://localhost:3444 node scripts/sondy/k86-tresty-ved.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, dotazyNa, roleMine, VLASTNIK, DIR, OUT, BASE } from './k68-spolecne.mjs';

const PC = { width: 1280, height: 900 };
const TEL = { width: 390, height: 844 };
const SNIMKY = process.env.SONDY_SNIMKY ? process.env.SONDY_SNIMKY.replace(/\/?$/, '/') : OUT;
const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PRED3: praha(-3), PRED4: praha(-4), PRED5: praha(-5), PRED6: praha(-6), STARY: praha(-40) };
const MESIC = DNY.DNES.slice(0, 7);
const iso = (den, hm) => new Date(`${den}T${hm}:00+02:00`).toISOString();
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  t = t.replace(/"@([A-Z0-9]+)-(\d\d:\d\d)"/g, (_, k, hm) => `"${iso(DNY[k] ?? DNY.DNES, hm)}"`);
  for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t);
};
const KLICE_TRESTY = ['tresty.zobrazit_tym', 'tresty.udelit', 'tresty.sazebnik'];
const VEDENI = { ...VLASTNIK, opravneni: [...new Set([...VLASTNIK.opravneni, ...KLICE_TRESTY])] };
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
const limetek = (p) => p.locator('[data-plocha] button.on-accent:visible, [data-plocha] .btn-accent:visible').count();
const doberAnimace = (loc) => loc.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)).then(() => undefined, () => undefined)).catch(() => {});
const naKlepnuti = (loc) => loc.evaluate(el => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && (hit === el || el.contains(hit)); });

/** Podvrh /api/tresty* se stavem v paměti; zápisy do `stav.zapisy`, čtení do `stav.cti`. */
const podvrh = ({ att = null } = {}) => {
  const data = nacti('k86-tresty-ved-tresty');
  const druhy = nacti('k86-tresty-ved-types');
  const navrhy = nacti('k86-tresty-ved-navrhy');
  let dalsiId = 100;
  const jmena = { 16: ['Eva Testová', '👩'], 17: ['Jakub Horák', '🧔'], 18: ['Tereza Malá', null] };
  return (req, json, stav) => {
    const url = new URL(req.url());
    const path = url.pathname;
    const m = req.method();
    const q = url.searchParams;
    const telo = (() => { try { return req.postData() ? JSON.parse(req.postData()) : null; } catch { return null; } })();
    if (path.startsWith('/api/tresty')) {
      (stav.cti ??= []).push(`${m} ${path}${url.search}`);
      if (m !== 'GET') (stav.zapisy ??= []).push({ m, path, telo, q: url.search });
      if (path === '/api/tresty/types') {
        if (m === 'GET') return json(druhy);
        if (m === 'POST') { const d = { id: ++dalsiId, description: null, bonusCut: null, active: true, ...telo, createdAt: '' }; druhy.types.push(d); return json({ ok: true, type: d }, 201); }
        if (m === 'PATCH') { const d = druhy.types.find(x => x.id === Number(telo?.id)); if (d) Object.assign(d, telo); return json({ ok: true, type: d }); }
        if (m === 'DELETE') { const i = druhy.types.findIndex(x => x.id === Number(q.get('id'))); if (i >= 0) druhy.types.splice(i, 1); return json({ ok: true }); }
      }
      if (path === '/api/tresty/navrhy') {
        const vyrizene = new Set(data.items.map(x => x.sourceKey).filter(Boolean));
        if (m === 'POST') { navrhy.navrhy = navrhy.navrhy.filter(n => n.klic !== telo?.klic); return json({ ok: true }); }
        return json({ navrhy: navrhy.navrhy.filter(n => !vyrizene.has(n.klic)), manka: navrhy.manka ?? 0 });
      }
      const mm = /^\/api\/tresty\/(\d+)$/.exec(path);
      if (mm && m === 'PATCH') {
        const x = data.items.find(i => i.id === Number(mm[1]));
        if (!x) return json({ error: 'Trest nenalezen.' }, 404);
        if (telo?.status === 'zruseno') Object.assign(x, { status: 'zruseno', cancelNote: telo.note ?? null, cancelledBy: 15, cancelledByName: 'Martin Nemeškal', cancelledAt: new Date().toISOString(), disputeHandledAt: x.disputed ? new Date().toISOString() : x.disputeHandledAt });
        else if (telo?.disputeHandled) x.disputeHandledAt = new Date().toISOString();
        else { Object.assign(x, telo); if ('points' in telo || 'bonusCut' in telo) x.seenAt = null; }
        return json({ ok: true, item: x });
      }
      if (path === '/api/tresty' && m === 'POST') {
        // Server ví víc než okno: krácení nad 1 000 odmítne se stropem 1 000 (mezitím přibyl jiný trest).
        if (Number(telo?.bonusCut) > 1000) return json({ error: 'Krátit jde nejvýš 1 000 Kč — víc prémií ten měsíc nemá.', strop: 1000 }, 409);
        const d = druhy.types.find(x => x.id === telo?.typeId);
        const x = {
          id: ++dalsiId, userId: Number(telo.userId), userName: jmena[telo.userId]?.[0] ?? 'Někdo', userAvatar: jmena[telo.userId]?.[1] ?? null,
          givenBy: 15, givenByName: 'Martin Nemeškal', day: telo.day ?? DNY.DNES, shiftId: telo.shiftId ?? null, closingId: telo.closingId ?? null, taskId: null,
          typeId: telo.typeId ?? null, typeTitle: d?.title ?? null, text: telo.text, photoUrl: telo.photoUrl ?? null, points: Number(telo.points) || 0, bonusCut: Number(telo.bonusCut) || 0,
          status: 'plati', source: telo.sourceKey ? telo.sourceKey.split(':')[0] : 'rucne', sourceKey: telo.sourceKey ?? null, seenAt: null, response: null, responseAt: null,
          disputed: false, disputeHandledAt: null, cancelledBy: null, cancelledByName: null, cancelledAt: null, cancelNote: null, createdAt: new Date().toISOString(),
        };
        data.items.unshift(x);
        return json({ ok: true, item: x }, 201);
      }
      if (path === '/api/tresty' && m === 'GET') {
        if (q.get('strop') === '1') {
          // Tereza ten měsíc prémie nemá — krácení musí být vypnuté.
          return json(q.get('userId') === '18' ? { strop: 0, premie: 0, uzKraceno: 0 } : { strop: 1500, premie: 1500, uzKraceno: 0 });
        }
        const stavF = q.get('status'); const mesic = q.get('month'); const den = q.get('day'); const userId = Number(q.get('userId')) || null;
        const items = data.items.filter(x => (!stavF || x.status === stavF) && (!mesic || x.day.startsWith(mesic)) && (!den || x.day === den) && (!userId || x.userId === userId));
        return json({ items, druhy: druhy.types.filter(x => x.active), smi: data.smi });
      }
      return json({ ok: true });
    }
    if (path === '/api/teams' && m === 'GET') return json({ members: [{ id: 15, name: 'Martin Nemeškal' }, { id: 16, name: 'Eva Testová' }, { id: 17, name: 'Jakub Horák' }, { id: 18, name: 'Tereza Malá' }] });
    if (path === '/api/navic' || path === '/api/navic/offers') return json({ items: [], nabidka: [], smi: { uznat: false } });
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
      // Manko 340: v kase o 340 méně, než se čekalo (fixtura detailu sama manko nemá).
      const d = nacti('k84-uzaverky-closing-detail');
      d.closing = { ...d.closing, id: Number(det[1]), closing_cash: Number(d.closing.closing_cash ?? 0) - 340 };
      stav.detailId = Number(det[1]);
      return json(d);
    }
    if (path === '/api/notes') return json([]);
    if (/^\/api\/employees\/\d+$/.test(path)) return json(nacti('k69-b2-employee'));
    if (path === '/api/attendance') return json(att ?? { roster: [], entries: [], adjustments: [] });
    if (path === '/api/payroll') return json({ lide: [], payDailyCash: false, pravidla: {} });
    return undefined;
  };
};

const FIX_ODMENY = nacti('k86-tresty-ved-rozlozeni-odmeny');
const FIX_PREHLED = nacti('k86-tresty-ved-rozlozeni-prehled');
const FIX_DOCHAZKA = nacti('k86-tresty-ved-rozlozeni-dochazka');
const FIX_UZAVERKY = { stranka: 'vedeni.uzaverky', polozky: [{ id: 'nastroj', widget: 'nastroj', velikost: 'L' }], dostupne: [], tarifem: [], zdroj: 'aplikace', rozsah: 'typ:vedeni', zamceno: false, smiUpravit: true, smiVychozi: true, verze: 0 };
const ODMENY = '/employer/overview?view=rewards';
const FIX_TRESTY = nacti('k86-tresty-ved-tresty');
const vMesici = FIX_TRESTY.items.filter(x => x.day.startsWith(MESIC));
const platneVMesici = vMesici.filter(x => x.status === 'plati');

// ---------------------------------------------------------------------------
// O — Odměny 1280
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ viewport: PC, fix: FIX_ODMENY, mineData: VEDENI, dalsi: podvrh() });
  await otevri(p, ODMENY, 'vedeni.odmeny');
  const w = widgetLi(p, 'odmeny.tresty_tymu');
  await dokud(async () => (await w.locator('[data-tresty-souhrn]').count()) > 0, 10000);
  const souhrn = await text(w.locator('[data-tresty-souhrn]'));
  const body = platneVMesici.reduce((a, x) => a + x.points, 0);
  tvrdi(`O1: souhrn „Tento měsíc · ${platneVMesici.length} … · −${body} b · … · 2 nesouhlasí"`, /Tento měsíc/.test(souhrn) && souhrn.includes(`−${body} b`) && /2 nesouhlasí/.test(souhrn), souhrn);
  tvrdi('O1: v hlavičce chip „2 nesouhlasí", rychlý filtr Měsíc, Sbalit a žádný odkaz „Odměny"', (await w.locator('.chip-wait', { hasText: '2 nesouhlasí' }).count()) >= 1
    && (await w.locator('[data-rychly-filtr="obdobi"]').count()) === 1 && (await w.getByRole('button', { name: /^Sbalit/ }).count()) === 1 && (await w.getByRole('button', { name: 'Odměny', exact: true }).count()) === 0);
  tvrdi('O1: dotaz na měsíc týmu, na platné (sporné, stejná adresa jako fronta) a na návrhy', (stav.cti ?? []).includes(`GET /api/tresty?scope=team&month=${MESIC}`) && (stav.cti ?? []).includes('GET /api/tresty?scope=team&status=plati') && (stav.cti ?? []).includes('GET /api/tresty/navrhy'), JSON.stringify(stav.cti));
  const seznam = w.locator('[data-tresty-seznam]');
  const radky = seznam.locator('.list-row');
  const prvni = await text(radky.first());
  tvrdi('O1: sporné nahoře — Tereza s vyjádřením „Nesouhlasí: …" a akcemi Trest platí dál / Zrušit trest', /Tereza Malá/.test(prvni) && /Nesouhlasí: /.test(prvni)
    && (await radky.first().getByRole('button', { name: 'Trest platí dál: Tereza Malá' }).count()) === 1, prvni.replace(/\n/g, ' | '));
  tvrdi('O1: starší sporný trest (minulý měsíc) se ukáže taky', /Ujel mi autobus/.test(await text(seznam)));
  tvrdi('O1: Eva „Nepotvrzeno", Jakub „Vzato na vědomí" s „−20 b · krácení 200 Kč" a odkazem Fotka, napomenutí a zrušený přeškrtnutý',
    /Nepotvrzeno/.test(await text(radky.filter({ hasText: 'Pozdní příchod o 25 min.' })))
    && /Vzato na vědomí/.test(await text(radky.filter({ hasText: 'Manko v uzávěrce 340 Kč.' }))) && /−20 b · krácení 200 Kč/.test(await text(radky.filter({ hasText: 'Manko v uzávěrce 340 Kč.' })))
    && (await radky.filter({ hasText: 'Manko v uzávěrce 340 Kč.' }).getByRole('link', { name: 'Fotka' }).count()) === 1
    && /Napomenutí/.test(await text(radky.filter({ hasText: 'Nevynesený koš' })))
    && /Zrušeno: Nehoda, ne nedbalost\./.test(await text(radky.filter({ hasText: 'Rozbitá sklenice' })))
    && /line-through/.test(await radky.filter({ hasText: 'Rozbitá sklenice' }).locator('[data-trest-stav] span').last().getAttribute('class') ?? ''));
  tvrdi('O1: chip „Nepotvrzeno" je jediný červený (bad), ostatní tlumené', (await w.locator('.chip-bad').count()) === (await w.getByText('Nepotvrzeno', { exact: true }).count()));
  const navrhyW = w.locator('[data-navrhy-trestu]');
  tvrdi('O1: Návrhy — dva (pozdní příchod 18 min, výtka s poznámkou), manko mezi nimi není', (await navrhyW.locator('.list-row').count()) === 2 && /Pozdní příchod o 18 min/.test(await text(navrhyW))
    && !/Manko/.test(await text(navrhyW)) && /Výtka z hodnocení: Špinavá parní tryska/.test(await text(navrhyW)));
  tvrdi('O1: manko jen větou bez akce „1 uzávěrka s mankem. Manko řeš dohodou o odpovědnosti, ne trestem."',
    /1 uzávěrka s mankem\. Manko řeš dohodou o odpovědnosti, ne trestem\./.test(await text(w.locator('[data-tresty-manko]'))) && (await w.locator('[data-tresty-manko] button').count()) === 0);
  tvrdi('O1: v klidu žádná limetka na ploše', (await limetek(p)) === 0, `${await limetek(p)}×`);
  await p.screenshot({ path: SNIMKY + 'k86-tresty-ved-odmeny-1280.png', fullPage: true });

  // Dát trest z návrhu pozdního příchodu: předvyplněné okno, POST se sourceKey.
  await navrhyW.getByRole('button', { name: 'Dát trest: Jakub Horák' }).click();
  const okno = p.getByRole('dialog', { name: 'Dát trest' });
  await okno.waitFor({ timeout: 4000 });
  await dokud(async () => /krátit jde nejvýš/.test(await text(okno.locator('[data-trest-strop]'))), 4000);
  tvrdi('O2: okno z návrhu — Jakub v podtitulku, text „Pozdní příchod o 18 min.", chip Pozdní příchod vybraný, 10 b, bez krácení',
    await dokud(async () => /Jakub Horák/.test(await text(okno)), 2000) && (await okno.locator('#trest-text').inputValue()).replace(/\u00a0/g, ' ') === 'Pozdní příchod o 18 min.'
    && await dokud(async () => (await okno.getByRole('button', { name: /Pozdní příchod/ }).getAttribute('aria-pressed')) === 'true', 3000)
    && (await okno.locator('#trest-body').inputValue()) === '10' && (await okno.locator('#trest-kraceni').inputValue()) === '',
    JSON.stringify([await okno.locator('#trest-text').inputValue(), await okno.getByRole('button', { name: /Pozdní příchod/ }).getAttribute('aria-pressed'), await okno.locator('#trest-body').inputValue(), await okno.locator('#trest-kraceni').inputValue(), (await text(okno)).slice(0, 120)]));
  tvrdi('O2: pod krácením „Nenárokové prémie za měsíc: 1 500 Kč · krátit jde nejvýš 1 500 Kč", věta o § 346b a o výtce podle § 52', /Nenárokové prémie za měsíc: 1 500 Kč · krátit jde nejvýš 1 500 Kč/.test(await text(okno))
    && /Krátí se jen nenároková prémie za ten měsíc, ne mzda — peněžní postihy zákoník práce zakazuje \(§ 346b\)/.test(await text(okno))
    && /Napomenutí v aplikaci není výtka podle § 52 písm\. g\) zákoníku práce\./.test(await text(okno)) && /Dopad: −10 b/.test(await text(okno)));
  await okno.screenshot({ path: SNIMKY + 'k86-tresty-ved-dat-trest-1280.png' });
  await okno.getByRole('button', { name: 'Dát trest', exact: true }).click();
  const post = await dokud(() => (stav.zapisy ?? []).find(z => z.m === 'POST' && z.path === '/api/tresty'), 4000);
  tvrdi('O2: POST /api/tresty { userId: 17, shiftId: 701, sourceKey: pozde:9002, typeId: 1, points: 10, day: včera }', !!post && post.telo?.userId === 17 && post.telo?.shiftId === 701
    && post.telo?.sourceKey === 'pozde:9002' && post.telo?.typeId === 1 && post.telo?.points === 10 && !post.telo?.bonusCut && post.telo?.day === DNY.VCERA, JSON.stringify(post?.telo));
  tvrdi('O2: toast „Trest udělen — Jakub Horák dostal(a) oznámení." a návrh pozdního příchodu zmizel', await dokud(() => p.getByText('Trest udělen — Jakub Horák dostal(a) oznámení.').isVisible().catch(() => false), 3000)
    && await dokud(async () => (await navrhyW.locator('.list-row').count()) === 1, 3000));

  // Zahodit návrh výtky.
  await navrhyW.getByRole('button', { name: 'Zahodit návrh: Tereza Malá' }).click();
  tvrdi('O3: Zahodit → POST /api/tresty/navrhy { klic: vytka:77 } a návrh zmizí', await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'POST' && z.path === '/api/tresty/navrhy' && z.telo?.klic === 'vytka:77'), 4000)
    && await dokud(async () => (await navrhyW.locator('.list-row').count()) === 0, 3000));

  // Spor: Trest platí dál.
  await w.getByRole('button', { name: 'Trest platí dál: Tereza Malá' }).first().click();
  tvrdi('O4: Trest platí dál → PATCH /api/tresty/1 { disputeHandled: true }, toast a chip „1 nesouhlasí"', await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'PATCH' && z.path === '/api/tresty/1' && z.telo?.disputeHandled === true), 4000)
    && await dokud(() => p.getByText('Trest platí dál — nesouhlas je vyřízený.').isVisible().catch(() => false), 3000)
    && await dokud(async () => /1 nesouhlasí/.test(await text(w.locator('[data-tresty-souhrn]'))), 3000));
  // Spor: Zrušit trest s důvodem.
  await w.getByRole('button', { name: 'Zrušit trest: Tereza Malá', exact: true }).click();
  const zrus = p.getByRole('dialog', { name: 'Zrušit trest' });
  tvrdi('O5: Zrušit trest otevře okno s textem trestu a tím, co se vrátí', await zrus.waitFor({ timeout: 4000 }).then(() => true, () => false)
    && /Pozdní příchod o 30 min\./.test(await text(zrus)) && /Vrátí se −10 b/.test(await text(zrus)));
  await zrus.locator('#trest-duvod-zruseni').fill('Autobus opravdu nejel.');
  await zrus.getByRole('button', { name: 'Zrušit trest', exact: true }).click();
  tvrdi('O5: PATCH /api/tresty/6 { status: zruseno, note } a nesouhlas zmizí z hlavičky', await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'PATCH' && z.path === '/api/tresty/6' && z.telo?.status === 'zruseno' && z.telo?.note === 'Autobus opravdu nejel.'), 4000)
    && await dokud(async () => !/nesouhlasí/.test(await text(w.locator('[data-tresty-souhrn]'))), 3000));

  // „···" Upravit: +5 b → PATCH jen points.
  // Starší trest za manko (záznam z doby před balíkem P) jde upravit dál — řádek podle textu, ne první Jakubův
  // (nahoře je teď čerstvý trest za pozdní příchod z O2).
  await w.locator('.list-row', { hasText: 'Manko v uzávěrce 340 Kč.' }).getByRole('button', { name: 'Upravit nebo zrušit trest: Jakub Horák' }).first().click();
  await p.getByRole('menuitem', { name: 'Upravit…' }).click();
  const uprava = p.getByRole('dialog', { name: 'Upravit trest' });
  tvrdi('O6: Upravit… otevře okno úprav s textem a body 20', await uprava.waitFor({ timeout: 4000 }).then(() => true, () => false)
    && (await uprava.locator('#trest-text').inputValue()) === 'Manko v uzávěrce 340 Kč.' && (await uprava.locator('#trest-body').inputValue()) === '20');
  await uprava.getByRole('button', { name: 'Víc bodů' }).click();
  tvrdi('O6: krokovač +5 → 25 a věta, že se trest vrátí k potvrzení', (await uprava.locator('#trest-body').inputValue()) === '25' && /vrátí k potvrzení/.test(await text(uprava)));
  await uprava.getByRole('button', { name: 'Uložit' }).click();
  const patchU = await dokud(() => (stav.zapisy ?? []).find(z => z.m === 'PATCH' && z.path === '/api/tresty/3'), 4000);
  tvrdi('O6: PATCH /api/tresty/3 { points: 25 } (nic jiného) a toast „… ho potvrdí znovu"', !!patchU && JSON.stringify(patchU.telo) === '{"points":25}'
    && await dokud(() => p.getByText('Trest upraven — Jakub Horák ho potvrdí znovu.').isVisible().catch(() => false), 3000), JSON.stringify(patchU?.telo));

  // Dát trest z hlavičky: člověk bez prémií → krácení vypnuté; napomenutí; 409 se stropem.
  await w.getByRole('button', { name: 'Dát trest', exact: true }).first().click();
  const nove = p.getByRole('dialog', { name: 'Dát trest' });
  await nove.waitFor({ timeout: 4000 });
  tvrdi('O7: bez člověka a bez bodů tlačítko „Dát napomenutí" zakázané, pod krácením „Vyber člověka…"', await nove.getByRole('button', { name: 'Dát napomenutí', exact: true }).isDisabled() && /Vyber člověka/.test(await text(nove)));
  await nove.locator('#trest-kdo').selectOption('18');
  await dokud(async () => /žádná není/.test(await text(nove.locator('[data-trest-strop]'))), 4000);
  tvrdi('O7: Tereza bez nenárokové prémie → krácení vypnuté s větou proč a jak prémii založit', await nove.locator('#trest-kraceni').isDisabled()
    && /Krátit jde jen nenárokovou prémii a tenhle měsíc žádná není\. Založ ji v Docházce → Prémie a srážky/.test(await text(nove)));
  await nove.getByRole('button', { name: /Pozdní příchod/ }).click();
  tvrdi('O7: chip Pozdní příchod předvyplní text a 10 b', (await nove.locator('#trest-text').inputValue()) === 'Pozdní příchod' && (await nove.locator('#trest-body').inputValue()) === '10');
  await nove.getByRole('button', { name: 'Méně bodů' }).click();
  await nove.getByRole('button', { name: 'Méně bodů' }).click();
  tvrdi('O7: 0 bodů a 0 krácení = náhled Napomenutí a tlačítko „Dát napomenutí"', await nove.locator('[data-trest-nahled="napomenuti"]').isVisible() && (await nove.getByRole('button', { name: 'Dát napomenutí' }).count()) === 1);
  await nove.locator('#trest-text').fill('Mobil za barem při obsluze.');
  await nove.getByRole('button', { name: 'Dát napomenutí' }).click();
  const postN = await dokud(() => (stav.zapisy ?? []).filter(z => z.m === 'POST' && z.path === '/api/tresty').find(z => z.telo?.userId === 18), 4000);
  tvrdi('O7: POST napomenutí { userId: 18, points: 0, bonusCut: 0, typeId: 1 } a toast „Napomenutí uloženo"', !!postN && postN.telo.points === 0 && postN.telo.bonusCut === 0 && postN.telo.typeId === 1
    && await dokud(() => p.getByText('Napomenutí uloženo — Tereza Malá dostal(a) oznámení.').isVisible().catch(() => false), 3000), JSON.stringify(postN?.telo));
  // 409 se stropem: krácení 1 200 (okno ví o 1 500), server řekne 1 000 → věta pod krácením, text zůstane.
  await w.getByRole('button', { name: 'Dát trest', exact: true }).first().click();
  await nove.waitFor({ timeout: 4000 });
  await nove.locator('#trest-kdo').selectOption('17');
  await nove.locator('#trest-text').fill('Nedodaný Z-report z pokladny.');
  await dokud(async () => /krátit jde nejvýš 1 500/.test(await text(nove.locator('[data-trest-strop]'))), 4000);
  await nove.locator('#trest-kraceni').fill('2000');
  tvrdi('O8: krácení nad strop (2 000 > 1 500) hlásí okno samo: „Krátit jde nejvýš 1 500 Kč."', await dokud(async () => /Krátit jde nejvýš 1 500 Kč\./.test(await text(nove)), 2000));
  await nove.locator('#trest-kraceni').fill('1200');
  await nove.getByRole('button', { name: 'Dát trest', exact: true }).click();
  tvrdi('O8: 409 se stropem → věta serveru pod krácením, okno zůstane otevřené s textem', await dokud(async () => /Krátit jde nejvýš 1 000 Kč — víc prémií ten měsíc nemá\./.test(await text(nove)), 4000)
    && (await nove.locator('#trest-text').inputValue()) === 'Nedodaný Z-report z pokladny.');
  await nove.screenshot({ path: SNIMKY + 'k86-tresty-ved-strop-409-1280.png' });
  // Escape s rozepsaným textem se zeptá (neztratit text).
  await p.keyboard.press('Escape');
  tvrdi('O8: Escape nad rozepsaným oknem se zeptá („Zahodit rozepsané?") a text neztratí', await dokud(async () => (await p.getByRole('alertdialog', { name: 'Zahodit rozepsané?' }).count()) === 1, 2000)
    && (await nove.count()) === 1 && (await nove.locator('#trest-text').inputValue()) === 'Nedodaný Z-report z pokladny.');
  await p.getByRole('button', { name: 'Zpět k úpravám' }).click();
  await nove.getByRole('button', { name: 'Zrušit', exact: true }).click();
  await dokud(async () => (await nove.count()) === 0, 3000);

  // Filtry v široké kartě.
  const stavy = w.getByRole('tablist', { name: 'Stav trestů' });
  await stavy.getByRole('tab', { name: /Zrušené/ }).click();
  // Zrušený starý trest (minulý měsíc) už sporný není, takže z měsíčního seznamu odešel — zůstane sklenice.
  tvrdi('O9: filtr Zrušené → jen sklenice z tohoto měsíce', await dokud(async () => (await radky.count()) === 1, 2000) && /Rozbitá sklenice/.test(await text(radky.first())), String(await radky.count()));
  await stavy.getByRole('tab', { name: /Vše/ }).click();

  // Část Tresty: sazebník.
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Tresty' }).click();
  const saz = p.locator('[data-sazebnik-trestu]');
  tvrdi('O10: část Tresty = Sazebník trestů se čtyřmi položkami, „−20 b · krácení 200 Kč" a Vypnuto', await dokud(async () => (await saz.locator('.list-row').count()) === 4, 6000)
    && /−20 b · krácení 200 Kč/.test(await text(saz)) && /Vypnuto/.test(await text(saz)));
  tvrdi('O10: v části Tresty žádná limetka', (await limetek(p)) === 0);
  await saz.getByRole('button', { name: 'Nová položka' }).click();
  const oknoS = p.getByRole('dialog', { name: 'Nová položka sazebníku' });
  await oknoS.waitFor({ timeout: 4000 });
  await oknoS.locator('#druh-nazev').fill('Neohlášená absence');
  await oknoS.locator('#druh-body').fill('50');
  await oknoS.locator('#druh-kraceni').fill('500');
  await oknoS.screenshot({ path: SNIMKY + 'k86-tresty-ved-sazebnik-okno-1280.png' });
  await oknoS.getByRole('button', { name: 'Přidat do sazebníku' }).click();
  const postS = await dokud(() => (stav.zapisy ?? []).find(z => z.m === 'POST' && z.path === '/api/tresty/types'), 4000);
  tvrdi('O11: Přidat → POST /api/tresty/types { title, points: 50, bonusCut: 500, active: true }', !!postS && postS.telo?.title === 'Neohlášená absence' && postS.telo?.points === 50 && postS.telo?.bonusCut === 500 && postS.telo?.active === true, JSON.stringify(postS?.telo));
  tvrdi('O11: toast a pátá položka', await dokud(() => p.getByText('Položka přidána do sazebníku.').isVisible().catch(() => false), 3000) && await dokud(async () => (await saz.locator('.list-row').count()) === 5, 3000));
  await saz.getByRole('button', { name: 'Upravit nebo smazat položku Pozdní příchod' }).click();
  await p.getByRole('menuitem', { name: 'Upravit…' }).click();
  const oknoU = p.getByRole('dialog', { name: 'Upravit položku sazebníku' });
  await oknoU.waitFor({ timeout: 4000 });
  await oknoU.locator('#druh-body').fill('15');
  await oknoU.getByRole('button', { name: 'Uložit' }).click();
  const patchS = await dokud(() => (stav.zapisy ?? []).find(z => z.m === 'PATCH' && z.path === '/api/tresty/types'), 4000);
  tvrdi('O12: Upravit → PATCH { id: 1, points: 15 }', !!patchS && patchS.telo?.id === 1 && patchS.telo?.points === 15, JSON.stringify(patchS?.telo));
  let dialogProhlizece = false;
  p.on('dialog', d => { dialogProhlizece = true; void d.dismiss(); });
  await saz.getByRole('button', { name: 'Upravit nebo smazat položku Mobil za barem' }).click();
  await p.getByRole('menuitem', { name: 'Smazat…' }).click();
  const potvrd = p.getByRole('dialog', { name: /Smazat položku „Mobil za barem"/ });
  tvrdi('O13: Smazat… se ptá oknem, ne confirm()', await dokud(() => potvrd.isVisible().catch(() => false), 2000) && !dialogProhlizece);
  await potvrd.getByRole('button', { name: 'Smazat' }).click();
  tvrdi('O13: DELETE /api/tresty/types?id=4 a položka zmizí', await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'DELETE' && z.q === '?id=4'), 4000)
    && await dokud(async () => (await saz.locator('.list-row').count()) === 4, 3000));
  await p.screenshot({ path: SNIMKY + 'k86-tresty-ved-sazebnik-1280.png', fullPage: true });
  tvrdi('O: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// T — telefon 390×844, světle i tmavě
// ---------------------------------------------------------------------------
for (const tmavy of [false, true]) {
  const sfx = tmavy ? ' tmavě' : '';
  const { ctx, p, stav, chyby } = await kontext({ viewport: TEL, mobil: true, tmavy, fix: FIX_ODMENY, mineData: VEDENI, dalsi: podvrh() });
  await otevri(p, ODMENY, 'vedeni.odmeny');
  const w = widgetLi(p, 'odmeny.tresty_tymu');
  await dokud(async () => (await w.locator('[data-tresty-souhrn]').count()) > 0, 10000);
  await p.waitForTimeout(500);
  const pr = await preteceni(p);
  tvrdi(`T1 (390${sfx}): bez přetečení dokumentu i karet`, pr.dokument <= 1 && pr.karty === 0, JSON.stringify(pr));
  const plati = w.getByRole('button', { name: 'Trest platí dál: Tereza Malá' }).first();
  await plati.scrollIntoViewIfNeeded();
  const box = await plati.boundingBox();
  tvrdi(`T1 (390${sfx}): Trest platí dál je dotykový cíl (tap-target) a celé v šířce`, !!box && box.height >= 36 && /\btap-target\b/.test(await plati.getAttribute('class') ?? '') && box.x + box.width <= TEL.width, JSON.stringify(box));
  if (!tmavy) await p.screenshot({ path: SNIMKY + 'k86-tresty-ved-odmeny-390.png', fullPage: false });
  if (!tmavy) await p.screenshot({ path: SNIMKY + 'k86-tresty-ved-odmeny-390-cela.png', fullPage: true });
  else await p.screenshot({ path: SNIMKY + 'k86-tresty-ved-odmeny-390-tmave.png', fullPage: false });
  await w.locator('[data-navrhy-trestu]').getByRole('button', { name: 'Dát trest: Jakub Horák' }).click();
  const okno = p.getByRole('dialog', { name: 'Dát trest' });
  await okno.waitFor({ timeout: 4000 });
  await doberAnimace(okno);
  await p.waitForTimeout(300);
  const pr2 = await preteceni(p);
  const sheet = await okno.boundingBox();
  tvrdi(`T2 (390${sfx}): okno Dát trest zdola, bez přetečení, body a krácení s číselnou klávesnicí`, pr2.karty === 0 && !!sheet && Math.abs(sheet.y + sheet.height - TEL.height) <= 2
    && (await okno.locator('#trest-body').getAttribute('inputmode')) === 'numeric' && (await okno.locator('#trest-kraceni').getAttribute('inputmode')) === 'numeric', JSON.stringify({ pr2, sheet }));
  const minus = await okno.getByRole('button', { name: 'Méně bodů' }).boundingBox();
  tvrdi(`T2 (390${sfx}): krokovač bodů má dotykovou plochu (tap-target)`, !!minus && /\btap-target\b/.test(await okno.getByRole('button', { name: 'Méně bodů' }).getAttribute('class') ?? ''));
  await p.screenshot({ path: SNIMKY + `k86-tresty-ved-dat-trest-390${tmavy ? '-tmave' : ''}.png`, fullPage: false });
  await okno.locator('.overflow-y-auto').first().evaluate(el => { el.scrollTop = el.scrollHeight; });
  await p.waitForTimeout(200);
  if (!tmavy) await p.screenshot({ path: SNIMKY + 'k86-tresty-ved-dat-trest-390-dole.png', fullPage: false });
  await okno.getByRole('button', { name: 'Zrušit', exact: true }).click();
  await dokud(async () => (await okno.count()) === 0, 3000);
  // Profil člena ze žebříčku: sekce Tresty a Dát trest nad profilem.
  const nastroj = widgetLi(p, 'nastroj');
  await nastroj.getByRole('button', { name: 'Profil: Eva Testová' }).click();
  const profil = p.getByRole('dialog', { name: 'Eva Testová' });
  const sekce = profil.locator('[data-tresty-clena]');
  const evy = FIX_TRESTY.items.filter(x => x.userId === 16 && x.status === 'plati' && x.day.startsWith(MESIC));
  tvrdi(`T3 (390${sfx}): profil má sekci Tresty „Tento měsíc: ${evy.length}" s řádky a Dát trest`, await dokud(async () => (await text(sekce.locator('[data-tresty-clena-souhrn]'))).includes(`Tento měsíc: ${evy.length}`), 8000)
    && /Pozdní příchod o 25 min\./.test(await text(sekce)) && (await sekce.getByRole('button', { name: 'Dát trest' }).count()) === 1, (await text(sekce)).replace(/\n/g, ' | ').slice(0, 300));
  tvrdi(`T3 (390${sfx}): profil se ptá na tresty člověka 16`, (stav.cti ?? []).includes('GET /api/tresty?scope=team&userId=16'), JSON.stringify(stav.cti));
  await sekce.scrollIntoViewIfNeeded();
  if (!tmavy) await p.screenshot({ path: SNIMKY + 'k86-tresty-ved-profil-390.png', fullPage: false });
  await sekce.getByRole('button', { name: 'Dát trest' }).click();
  const oknoP = p.getByRole('dialog', { name: 'Dát trest' });
  const otevreno = await oknoP.waitFor({ timeout: 4000 }).then(() => true, () => false);
  if (otevreno) await doberAnimace(oknoP);
  tvrdi(`T3 (390${sfx}): Dát trest z profilu — okno nad profilem, Eva předvyplněná (bez výběru člověka)`, otevreno && await naKlepnuti(oknoP.locator('#trest-text'))
    && (await oknoP.locator('#trest-kdo').count()) === 0 && /Eva Testová/.test(await text(oknoP)));
  await oknoP.getByRole('button', { name: 'Zrušit', exact: true }).click();
  tvrdi(`T (390${sfx}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// P — Přehled: fronta nesouhlasů a proklik; účetní bez udělování
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ viewport: PC, fix: FIX_PREHLED, mineData: VEDENI, dalsi: podvrh() });
  await otevri(p, '/employer/overview', 'vedeni.prehled');
  const ceka = widgetLi(p, 'prehled.ceka_na_tebe');
  const tl = ceka.getByRole('button', { name: '2 nesouhlasy s trestem' });
  tvrdi('P1: Čeká na tebe má „2 nesouhlasy s trestem"', await dokud(async () => (await tl.count()) === 1, 8000), (await text(ceka)).replace(/\n/g, ' | '));
  const w = widgetLi(p, 'odmeny.tresty_tymu');
  tvrdi('P2: střední widget na Přehledu má odkaz „Odměny", nejvýš pět trestů a dva návrhy (manko jen větou)', (await w.getByRole('button', { name: 'Odměny', exact: true }).count()) === 1
    && (await w.locator('[data-tresty-seznam] .list-row').count()) <= 5 && (await w.locator('[data-navrhy-trestu] .list-row').count()) === 2 && (await w.locator('[data-tresty-manko]').count()) === 1);
  await p.screenshot({ path: SNIMKY + 'k86-tresty-ved-prehled-1280.png', fullPage: true });
  await tl.click();
  tvrdi('P3: proklik otevře Odměny s částí Tresty (sazebník)', await dokud(async () => (await p.locator('[data-plocha="vedeni.odmeny"]').count()) === 1 && (await p.locator('[data-sazebnik-trestu]').count()) === 1, 8000)
    && (await p.locator('[data-plocha]').getByRole('tab', { name: 'Tresty' }).getAttribute('aria-selected')) === 'true', p.url());
  tvrdi('P: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  void stav;
  await ctx.close();
}
{
  // Účetní: tresty.zobrazit_tym ano, udělovat ne → fronta není, návrhy se nečtou, Dát trest chybí, řádky bez akcí.
  const { ctx, p, stav } = await kontext({ viewport: PC, fix: FIX_PREHLED, mineData: roleMine('ucetni'), dalsi: podvrh() });
  await otevri(p, '/employer/overview', 'vedeni.prehled');
  const w = widgetLi(p, 'odmeny.tresty_tymu');
  await dokud(async () => (await w.locator('[data-tresty-souhrn]').count()) > 0, 8000);
  tvrdi('P4: účetní vidí Tresty v týmu bez Dát trest a bez akcí sporu', (await w.locator('[data-tresty-souhrn]').count()) === 1 && (await w.getByRole('button', { name: 'Dát trest' }).count()) === 0
    && (await w.getByRole('button', { name: /Trest platí dál/ }).count()) === 0);
  tvrdi('P4: fronta nesouhlasů se nekreslí a /api/tresty/navrhy se nevolá', (await p.getByRole('button', { name: /nesouhlas.* s trestem/ }).count()) === 0 && dotazyNa(stav, ['/api/tresty/navrhy']).length === 0, JSON.stringify(dotazyNa(stav, ['/api/tresty/navrhy']).map(d => d.u)));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// D — hluboký odkaz z oznámení a hledání
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await kontext({ viewport: PC, fix: FIX_ODMENY, mineData: VEDENI, dalsi: podvrh() });
  await otevri(p, `${ODMENY}&arg=tresty`, 'vedeni.odmeny');
  tvrdi('D1: ?view=rewards&arg=tresty otevře část Tresty', await dokud(async () => (await p.locator('[data-sazebnik-trestu]').count()) === 1, 6000)
    && (await p.locator('[data-plocha]').getByRole('tab', { name: 'Tresty' }).getAttribute('aria-selected')) === 'true');
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Žebříček' }).click();
  await p.keyboard.press('Control+k');
  const hledani = p.getByRole('dialog', { name: 'Hledat v aplikaci' });
  await hledani.waitFor({ timeout: 5000 });
  await hledani.getByRole('combobox').fill('potrestat');
  tvrdi('D2: „potrestat" najde akci Dát trest', await dokud(async () => (await hledani.getByRole('option', { name: /Dát trest/ }).count()) === 1, 4000), (await text(hledani)).slice(0, 300));
  await hledani.getByRole('option', { name: /Dát trest/ }).click();
  tvrdi('D2: výběr otevře Odměny › Tresty', await dokud(async () => (await p.locator('[data-sazebnik-trestu]').count()) === 1, 6000));
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
  // Spuštění (balík P): manko trestem není (§ 346b ZP) — místo „Dát trest za manko" věta bez akce.
  const manko = d.locator('[data-trest-za-manko]');
  const maManko = await dokud(async () => (await manko.locator('[data-manko-veta]').count()) === 1, 3000);
  tvrdi(`U1 (${nazev}): u manka věta „Manko řeš dohodou o odpovědnosti, ne trestem." a žádné tlačítko trestu`, maManko
    && /Manko řeš dohodou o odpovědnosti, ne trestem\./.test(await text(manko)) && (await manko.getByRole('button').count()) === 0, (await text(d)).slice(0, 200));
  if (maManko) {
    await manko.scrollIntoViewIfNeeded();
    if (nazev === '390') await p.screenshot({ path: SNIMKY + 'k86-tresty-ved-uzaverka-manko-390.png', fullPage: false });
    tvrdi(`U2 (${nazev}): bez okna Dát trest a bez POST`, (await p.getByRole('dialog', { name: 'Dát trest' }).count()) === 0 && !(stav.zapisy ?? []).some(z => z.m === 'POST' && z.path === '/api/tresty'));
  }
  const sekce = d.locator('[data-tresty-uzaverky]');
  await sekce.scrollIntoViewIfNeeded();
  tvrdi(`U3 (${nazev}): sekce „Tresty na směně" ukazuje Jakubův trest ze dne uzávěrky (osádka)`, await dokud(async () => /Manko v uzávěrce 340 Kč\./.test(await text(sekce)), 6000), (await text(sekce)).replace(/\n/g, ' | ').slice(0, 300));
  tvrdi(`U3 (${nazev}): detail nepřetéká`, await d.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  if (nazev === '1280') await p.screenshot({ path: SNIMKY + 'k86-tresty-ved-uzaverka-1280.png', fullPage: false });
  tvrdi(`U (${nazev}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// H — Docházka: trest za pozdní příchod v Souhrnu hodin
// ---------------------------------------------------------------------------
for (const [nazev, volby] of [['1280', { viewport: PC, mobil: false }], ['390', { viewport: TEL, mobil: true }]]) {
  const { ctx, p, stav, chyby } = await kontext({ ...volby, fix: FIX_DOCHAZKA, mineData: VEDENI, dalsi: podvrh({ att: nacti('k86-tresty-ved-attendance') }) });
  await otevri(p, '/employer/overview?view=attendance', 'vedeni.dochazka');
  const w = widgetLi(p, 'dochazka.souhrn_hodin');
  await dokud(async () => /Jakub Horák/.test(await text(w)), 8000);
  await dokud(() => (stav.cti ?? []).includes('GET /api/tresty/navrhy'), 4000);
  await p.waitForTimeout(400);
  const akceJ = w.getByRole('button', { name: /^(Prémie a srážky|Akce): Jakub Horák$/ });
  tvrdi(`H1 (${nazev}): u Jakuba (nevyřízený pozdní příchod) je „···" s trestem, u Evy (příchod už má trest) bez trestu`, (await akceJ.count()) === 1, (await text(w)).replace(/\n/g, ' | ').slice(0, 300));
  await akceJ.click();
  const polozka = p.getByRole('menuitem', { name: /Dát trest za pozdní příchod/ });
  tvrdi(`H1 (${nazev}): v nabídce „Dát trest za pozdní příchod" s „Pozdní příchod o 18 min."`, await dokud(() => polozka.isVisible().catch(() => false), 2000) && /Pozdní příchod o 18 min\./.test(await text(polozka)));
  const evaMenu = w.getByRole('button', { name: /^(Prémie a srážky|Akce): Eva Testová$/ });
  if (await evaMenu.count()) {
    await p.keyboard.press('Escape');
    await evaMenu.click();
    tvrdi(`H1 (${nazev}): Eva nabídku trestu nemá`, (await p.getByRole('menuitem', { name: /Dát trest za pozdní příchod/ }).count()) === 0);
    await p.keyboard.press('Escape');
    await akceJ.click();
  } else tvrdi(`H1 (${nazev}): Eva nabídku trestu nemá`, true);
  if (nazev === '390') await p.screenshot({ path: SNIMKY + 'k86-tresty-ved-dochazka-menu-390.png', fullPage: false });
  await p.getByRole('menuitem', { name: /Dát trest za pozdní příchod/ }).click();
  const okno = p.getByRole('dialog', { name: 'Dát trest' });
  await okno.waitFor({ timeout: 4000 });
  await dokud(async () => (await okno.getByRole('button', { name: /Pozdní příchod/ }).getAttribute('aria-pressed')) === 'true', 3000);
  tvrdi(`H2 (${nazev}): okno s Jakubem, textem „Pozdní příchod o 18 min." a vybranou položkou Pozdní příchod`, /Jakub Horák/.test(await text(okno))
    && (await okno.locator('#trest-text').inputValue()) === 'Pozdní příchod o 18 min.' && (await okno.getByRole('button', { name: /Pozdní příchod/ }).getAttribute('aria-pressed')) === 'true');
  await okno.getByRole('button', { name: 'Dát trest', exact: true }).click();
  const post = await dokud(() => (stav.zapisy ?? []).find(z => z.m === 'POST' && z.path === '/api/tresty'), 4000);
  tvrdi(`H2 (${nazev}): POST { userId: 17, day: včera, sourceKey: pozde:9002, typeId: 1 }`, !!post && post.telo?.userId === 17 && post.telo?.day === DNY.VCERA && post.telo?.sourceKey === 'pozde:9002' && post.telo?.typeId === 1, JSON.stringify(post?.telo));
  if (nazev === '1280') await p.screenshot({ path: SNIMKY + 'k86-tresty-ved-dochazka-1280.png', fullPage: false });
  const pr = await preteceni(p);
  tvrdi(`H (${nazev}): bez přetečení`, pr.dokument <= 1, JSON.stringify(pr));
  tvrdi(`H (${nazev}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// L — polsky na 320 px: widget a okno Dát trest bez přetečení
// ---------------------------------------------------------------------------
for (const jazyk of ['pl', 'de']) {
  const { ctx, p, chyby } = await kontext({ viewport: { width: 320, height: 700 }, mobil: true, fix: FIX_ODMENY, mineData: VEDENI, dalsi: podvrh() });
  await ctx.addCookies([{ name: 'managero-lang', value: jazyk, domain: 'localhost', path: '/', sameSite: 'Lax' }]);
  await otevri(p, ODMENY, 'vedeni.odmeny');
  const w = widgetLi(p, 'odmeny.tresty_tymu');
  await dokud(async () => (await w.locator('[data-tresty-souhrn]').count()) > 0, 10000);
  await p.waitForTimeout(500);
  const pr = await preteceni(p);
  tvrdi(`L1 (320 ${jazyk}): widget bez přetečení`, pr.dokument <= 1 && pr.karty === 0, JSON.stringify(pr));
  // Chip „Niepotwierdzone" může ležet pod zkrácením „Zobrazit vše" (innerText ho pak nevrátí) — počítá se prvek.
  if (jazyk === 'pl') tvrdi('L1 (320 pl): texty polsky („Niepotwierdzone", „Propozycje")', (await w.getByText('Niepotwierdzone', { exact: true }).count()) >= 1 && /Propozycje/i.test(await text(w)), (await text(w)).slice(0, 200));
  await p.screenshot({ path: SNIMKY + `k86-tresty-ved-odmeny-320-${jazyk}.png`, fullPage: true });
  await w.locator('[data-navrhy-trestu] .list-row').nth(1).getByRole('button').first().click();
  const okno = p.getByRole('dialog').last();
  await okno.waitFor({ timeout: 4000 });
  await doberAnimace(okno);
  await p.waitForTimeout(300);
  const pr2 = await preteceni(p);
  tvrdi(`L2 (320 ${jazyk}): okno Dát trest bez přetečení`, pr2.karty === 0, JSON.stringify(pr2));
  await p.screenshot({ path: SNIMKY + `k86-tresty-ved-dat-trest-320-${jazyk}.png`, fullPage: false });
  tvrdi(`L (${jazyk}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

await konec();
