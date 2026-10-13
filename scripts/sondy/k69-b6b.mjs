// Kolo 69, balík B6b — Postupy a Návody jako plocha s widgety (spec §7.4).
//
// Pro obě stránky vedení: jeden h1 jako první, nástroj v klidu vidět, v úpravách
// sbalený bez „−" a přesunutelný nad widget i pod něj (PUT), galerie nabízí
// widgety balíku v „Doporučené", role bez klíče widget nevidí a jeho endpoint
// se nevolá, 500 na jednom endpointu shodí jen jeden widget, telefon 390 bez
// přetečení s použitelnou hlavní akcí a rozepsané hledání v nástroji přežije
// úpravy. Pro stránky zaměstnance: plocha, widgety a hlavní akce.
// Navíc to, co balík opravoval: widget otevře detail postupu / čtečku návodu
// v nástroji bez přechodu jinam, smazání jde přes okno (ne confirm()), povinné
// postupy dnes párují běh podle ID a „Potvrzuji přečtení" pošle markRead.
//
// Fixtury: scripts/sondy/fixtury/k69-b6b-*.json.
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import {
  kontext, konec, tvrdi, otevri, lista, upravit, hotovo, vUpravach, dokud, poradi, poradiPutu, dotazyNa, roleMine, DIR, OUT, BASE,
} from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const FIX_POSTUPY = nacti('k69-b6b-rozlozeni-postupy');
const FIX_POSTUPY_ZAM = nacti('k69-b6b-rozlozeni-postupy-zam');
const FIX_NAVODY = nacti('k69-b6b-rozlozeni-navody');
const FIX_NAVODY_ZAM = nacti('k69-b6b-rozlozeni-navody-zam');
const dnes = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());
const behy = () => JSON.parse(readFileSync(DIR + 'k69-b6b-runs.json', 'utf8').replaceAll('DNES', dnes));

/** Podvrh API postupů a návodů; `stav.chyby[cesta]` = kód chyby, `stav.chybaDnes` = 500 jen na ?today=team. */
const podvrh = () => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (stav.chyby[path]) return json({ error: 'Server spadl' }, stav.chyby[path]);
  if (path === '/api/procedures/runs') {
    if (m === 'POST') {
      stav.spusteno = req.postDataJSON();
      // Tvar skutečné routy (shapeActive): název a kroky spuštěného postupu, values prázdné.
      const pr = nacti('k69-b6b-procedures').procedures.find(x => x.id === stav.spusteno.procedureId) ?? nacti('k69-b6b-procedures').procedures[0];
      return json({ active: { id: 99, procedureId: pr.id, name: pr.name, icon: pr.icon, color: pr.color, items: pr.items, checkedItems: [], skippedItems: [], totalItems: pr.items.length, startedAt: new Date().toISOString(), status: 'running', skipReasons: {}, values: {} } });
    }
    if (m === 'PATCH') { (stav.persisty ??= []).push(req.postDataJSON()); return json({ ok: true, run: { id: 99, duration_seconds: 75 } }); }
    if (m !== 'GET') return json({ ok: true });
    if (url.searchParams.get('active')) return json({ active: null });
    if (url.searchParams.get('today') === 'team') {
      if (stav.chybaDnes) return json({ error: 'Dnešní postupy se nepodařilo načíst.' }, 500);
      return json({ runs: behy().runs.filter(r => r.procedure_id === 2) });
    }
    return json(behy());
  }
  if (path === '/api/procedures' && m === 'GET') return json(nacti('k69-b6b-procedures'));
  if (path === '/api/procedures' && m === 'POST') {
    const t = req.postDataJSON();
    stav.navrh = t;
    return json({ procedure: { id: 77, name: t.name, description: null, icon: t.icon ?? 'check', color: null, items: t.items ?? [], remindAt: null, remindDays: [], remindAnchor: 'time', requireBeforeClosing: false, approved: false, submittedBy: 5 } });
  }
  if (/^\/api\/procedures\/\d+$/.test(path)) { (stav.zapisyPostupu ??= []).push({ m, path, telo: req.postData() }); return json({ ok: true, procedure: nacti('k69-b6b-procedures').procedures[0] }); }
  if (path === '/api/guides' && m === 'GET') return json(nacti('k69-b6b-guides'));
  if (path === '/api/guides/ctenari') return json(nacti('k69-b6b-ctenari'));
  if (path === '/api/guides/categories') return json(nacti('guides_categories'));
  if (/^\/api\/guides\/\d+$/.test(path)) {
    if (m === 'GET') return json(nacti('k69-b6b-guide-1'));
    (stav.zapisyNavodu ??= []).push({ m, path, telo: req.postData() });
    return json({ ok: true });
  }
  if (/^\/api\/guides\/\d+\/reads$/.test(path)) return json(nacti('guides_1_reads'));
  if (path === '/api/organization/podniky' || path === '/api/organization') return json({ podniky: [] });
  // Kolo 7: fotka do návodu — nahrání vrátí adresu v úložišti podniku (tvar skutečné routy).
  if (path === '/api/upload' && m === 'POST') { stav.nahrano = (stav.nahrano ?? 0) + 1; return json({ url: '/api/upload/77', type: 'image', name: 'latte-art.png' }); }
  return undefined;
};

/** Jednobarevné PNG šířka × výška (fotka v návodu musí být širší než telefon, ať je vidět max-w-full). */
function png(w, h) {
  const crc = (buf) => { let c, r = -1; for (let n = 0; n < buf.length; n++) { c = (r ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; r = (r >>> 8) ^ c; } return (r ^ -1) >>> 0; };
  const kus = (typ, data) => { const d = Buffer.concat([Buffer.from(typ), data]); const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc(d)); return Buffer.concat([len, d, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const radek = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0xc8)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), kus('IHDR', ihdr), kus('IDAT', deflateSync(Buffer.concat(Array(h).fill(radek)))), kus('IEND', Buffer.alloc(0))]);
}
const FOTKA = png(1600, 900);

const POSTUPY = '/employer/overview?view=procedures';
const NAVODY = '/employer/overview?view=guides';
const POSTUPY_ZAM = '/employee/shifts?view=procedures';
const NAVODY_ZAM = '/employee/shifts?view=guides';
const naPlose = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]:not([hidden])`).count();
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]`);
// Linky mezi KLIKACÍMI řádky: každý <li> v .list, který obsahuje button.list-row a není první,
// musí mít border-top (obal <li className="contents"> ji nevykreslí — DP §3.6).
const linkyKlikacich = (loc) => loc.evaluate(el => {
  const li = [...el.querySelectorAll('ul.list > li')].filter(x => x.querySelector(':scope button.list-row') && x.previousElementSibling);
  return { pocet: li.length, bez: li.filter(x => parseFloat(getComputedStyle(x).borderTopWidth) === 0 || getComputedStyle(x).display === 'contents').map(x => x.textContent?.slice(0, 30)) };
});
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const limetek = (p) => p.locator('[data-plocha] button.on-accent:visible, [data-plocha] .btn-accent:visible, [data-plocha] button[class*="bg-[#C8F542]"]:visible').count();
const h1 = (p) => p.evaluate(() => {
  const vid = [...document.querySelectorAll('h1')].filter(h => h.offsetParent !== null);
  const prvni = document.querySelector('[data-plocha]')?.querySelector('h1, h2, h3');
  return { pocet: vid.length, prvniJeH1: prvni?.tagName === 'H1', text: vid[0]?.textContent?.trim() };
});
const doporucene = (galerie) => galerie.evaluate(el => {
  const h = [...el.querySelectorAll('h4')].find(x => x.textContent?.includes('Doporučené'));
  return h?.parentElement?.innerText ?? '';
});
async function galerieDoporucene(p) {
  await upravit(p).click();
  await dokud(() => vUpravach(p), 1500);
  await lista(p).getByRole('button', { name: 'Přidat widget' }).click();
  const galerie = p.getByRole('dialog', { name: 'Přidat widget' });
  await dokud(() => galerie.isVisible(), 3000);
  await p.waitForTimeout(500);
  return doporucene(galerie);
}
/** 2) Nástroj v úpravách sbalený bez „−", přesun nahoru (PUT) a zpátky pod widget. */
async function nastrojVUpravach(p, stav, znacka, vidget) {
  const nastroj = widgetLi(p, 'nastroj');
  await upravit(p).click();
  tvrdi(`${znacka}2: vstup do úprav`, await dokud(() => vUpravach(p), 1500));
  await p.waitForTimeout(400);
  tvrdi(`${znacka}2: nástroj je v úpravách sbalený do zástupce bez „−"`, await nastroj.getByText('Hlavní část stránky — v úpravách je sbalená.').isVisible()
    && await nastroj.locator('[data-odznak]').count() === 0);
  tvrdi(`${znacka}2: widgety „−" mají`, await widgetLi(p, vidget).locator('[data-odznak]').count() === 1);
  await nastroj.focus();
  await p.keyboard.press('Home');
  tvrdi(`${znacka}2: nástroj jde přesunout nad všechny widgety`, await dokud(async () => (await poradi(p))[0] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
  await dokud(() => stav.puty.length > 0, 1500);
  tvrdi(`${znacka}2: …a odejde PUT s nástrojem nahoře`, poradiPutu(stav.puty.at(-1))[0] === 'nastroj', JSON.stringify(poradiPutu(stav.puty.at(-1))));
  await p.keyboard.press('ArrowDown');
  tvrdi(`${znacka}2: …a zpátky pod widget`, await dokud(async () => (await poradi(p))[1] === 'nastroj', 1500), JSON.stringify(await poradi(p)));
}

// ---------------------------------------------------------------------------
// Postupy (vedení)
// ---------------------------------------------------------------------------

{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_POSTUPY, dalsi: podvrh() });
  await otevri(p, POSTUPY, 'vedeni.postupy');
  const h = await h1(p);
  tvrdi('P1: právě jeden viditelný h1 „Postupy" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Postupy', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  const tNastroj = await nastroj.innerText();
  tvrdi('P1: nástroj v klidu vidět — seznam postupů se „Spustit" a návrhem „Čeká na schválení"', tNastroj.includes('Otevírací rutina') && tNastroj.includes('Čeká na schválení')
    && await nastroj.getByRole('button', { name: 'Spustit' }).first().isVisible(), tNastroj.slice(0, 200));
  // Časy v DB jsou UTC (07:40 UTC = 9:40 v Praze), proto jen minuty.
  tvrdi('P1: v řádku je poslední dokončení podle ID postupu („naposledy dnes …:40")', /naposledy dnes \d{1,2}:40/.test(tNastroj), tNastroj.slice(0, 300));
  tvrdi('P1: jediná limetka stránky je „Nový postup"', await limetek(p) === 1 && await p.locator('[data-plocha]').getByRole('button', { name: 'Nový postup' }).isVisible(), `${await limetek(p)}×`);
  const pov = await widgetLi(p, 'postupy.povinne_dnes').innerText();
  tvrdi('P1: Povinné postupy dnes — Kontrola lednic čeká (nahoře), Zavírání hotové (Jana), návrh se nepočítá',
    pov.indexOf('Kontrola lednic') >= 0 && pov.indexOf('Kontrola lednic') < pov.indexOf('Zavírání') && pov.includes('Hotovo') && pov.includes('Jana') && !pov.includes('Příjem zboží'), pov.replace(/\n/g, ' | '));
  const prub = await widgetLi(p, 'postupy.posledni_prubehy').innerText();
  tvrdi('P1: Poslední průběhy — Zavírání s „1 nedokončeno" a délkou 20:00', prub.includes('Zavírání') && prub.includes('1 nedokončeno') && prub.includes('20:00'), prub.replace(/\n/g, ' | '));
  const lPrub = await linkyKlikacich(widgetLi(p, 'postupy.posledni_prubehy'));
  tvrdi('P1: klikací řádky Posledních průběhů mají mezi sebou linku (vlastní <li>, ne display:contents)', lPrub.pocet >= 1 && lPrub.bez.length === 0, JSON.stringify(lPrub));
  // Řádek s akcemi: detail otevře celý řádek (ne jen ~20 px vysoký název), „Spustit" zůstává nad ním.
  const radekOR = nastroj.locator('ul.list > li').filter({ hasText: 'Otevírací rutina' }).first();
  const trefa = await radekOR.evaluate(li => {
    const r = li.getBoundingClientRect();
    const meta = li.querySelector('.text-\\[13px\\]') ?? li;
    const m = meta.getBoundingClientRect();
    const nahore = document.elementFromPoint(m.left + 4, m.top + m.height / 2);
    const sp = [...li.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Spustit');
    const s = sp?.getBoundingClientRect();
    const naSpustit = s ? document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2) : null;
    return { vyska: r.height, meta: !!nahore?.closest('button') && nahore.closest('button')?.textContent?.includes('Otevírací rutina'), spustit: !!naSpustit && !!sp?.contains(naSpustit) };
  });
  tvrdi('P1: klepnutí na meta řádku trefí tlačítko detailu (cíl = řádek ≥ 44 px)', trefa.meta && trefa.vyska >= 44, JSON.stringify(trefa));
  tvrdi('P1: …a „Spustit" v řádku zůstává klikací nad ním', trefa.spustit, JSON.stringify(trefa));
  tvrdi('P1: nad seznamem už není ApproveAllBar ani mřížka karet s inkoustovým „Spustit"', await nastroj.locator('.bg-\\[\\#16181A\\]').count() === 0);
  // Pilulka „Čeká na schválení": jen návrhy, zapne ji i předání z widgetu (stav:navrhy), druhé klepnutí vypne.
  const pilNavrhy = nastroj.getByRole('button', { name: /^Čeká na schválení \d/ });
  tvrdi('P1: vedle seznamu je pilulka „Čeká na schválení" s počtem a ze začátku vypnutá', await pilNavrhy.count() === 1 && await pilNavrhy.getAttribute('aria-pressed') === 'false');
  await pilNavrhy.click();
  const jenNavrhyTxt = await nastroj.innerText();
  tvrdi('P1: filtr nechá jen návrhy (Otevírací rutina pryč, Příjem zboží (návrh) zůstává)', !jenNavrhyTxt.includes('Otevírací rutina') && jenNavrhyTxt.includes('Příjem zboží'), jenNavrhyTxt.slice(0, 200));
  await pilNavrhy.click();
  await p.evaluate(() => window.dispatchEvent(new CustomEvent('managero:predani:procedures', { detail: 'stav:navrhy' })));
  tvrdi('P1: předání stav:navrhy z widgetu zapne filtr', await dokud(async () => await pilNavrhy.getAttribute('aria-pressed') === 'true', 2000));
  await pilNavrhy.click();
  tvrdi('P1: …a jde zase vypnout', await dokud(async () => (await nastroj.innerText()).includes('Otevírací rutina'), 2000));
  await p.screenshot({ path: OUT + 'k69-b6b-postupy-desk.png', fullPage: true });

  // Widget → nástroj: návrh ve widgetu otevře detail postupu (bez přechodu jinam).
  await widgetLi(p, 'postupy.navrhy').locator('button.list-row').first().click();
  const detail = p.getByRole('dialog', { name: 'Příjem zboží (návrh)' });
  tvrdi('P-W: řádek návrhu ve widgetu otevře detail postupu v okně', await dokud(() => detail.isVisible(), 2000));
  tvrdi('P-W: …s „Schválit" (návrh se spustit nedá)', await detail.getByRole('button', { name: 'Schválit' }).isVisible() && await detail.getByRole('button', { name: 'Spustit postup' }).count() === 0);
  await detail.getByRole('button', { name: 'Schválit' }).click();
  tvrdi('P-W: „Schválit" pošle PATCH /api/procedures/4 { approve: true }', await dokud(() => (stav.zapisyPostupu ?? []).some(z => z.m === 'PATCH' && z.path === '/api/procedures/4' && z.telo?.includes('approve')), 2000));
  await p.keyboard.press('Escape');
  await dokud(async () => !(await detail.isVisible()), 1500);

  // Průběh ve widgetu → detail průběhu (okno, ne emoji).
  await widgetLi(p, 'postupy.posledni_prubehy').locator('button.list-row').first().click();
  const dPrub = p.getByRole('dialog', { name: 'Zavírání' });
  tvrdi('P-W: průběh ve widgetu otevře detail s důvodem přeskočení', await dokud(() => dPrub.isVisible(), 2000) && (await dPrub.innerText()).includes('Nestíhal/a jsem'));
  tvrdi('P-W: …bez emoji ✅ ⏭️ ❌', !/[✅⏭❌]/u.test(await dPrub.innerText()));
  await p.keyboard.press('Escape');

  // Kolo 7 (postup-detail-bez-historie): detail postupu ukáže jeho poslední průběhy a klik otevře detail průběhu.
  await dokud(async () => (await dPrub.count()) === 0, 1500);
  await nastroj.getByRole('button', { name: 'Zavírání', exact: true }).click();
  const dZav = p.getByRole('dialog', { name: 'Zavírání' });
  await dokud(() => dZav.isVisible(), 2000);
  const sekce = dZav.locator('section').filter({ has: p.getByRole('heading', { name: 'Poslední průběhy' }) });
  tvrdi('P-H: detail postupu má pod kroky „Poslední průběhy" s popiskem „z posledních průběhů týmu"', await dokud(() => sekce.isVisible(), 2000)
    && (await sekce.innerText()).includes('z posledních průběhů týmu'));
  const radkyH = await sekce.locator('ul.list > li').allInnerTexts();
  tvrdi('P-H: jen průběhy Zavírání (Jana dnes, Petr 3. 10.), nejnovější nahoře', radkyH.length === 2 && radkyH[0].includes('Jana Nováková') && radkyH[1].includes('Petr Malý'), JSON.stringify(radkyH));
  tvrdi('P-H: Jana s „1 nedokončeno" a trváním 20:00, Petr bez chipu', radkyH[0].includes('1 nedokončeno') && radkyH[0].includes('20:00') && !radkyH[1].includes('nedokončeno'), JSON.stringify(radkyH));
  await sekce.locator('button.list-row').filter({ hasText: 'Petr Malý' }).click();
  const dPrubH = p.getByRole('dialog', { name: 'Zavírání' }).last();
  tvrdi('P-H: klik na průběh otevře detail průběhu nad detailem postupu (Petr · 26:00)', await dokud(async () => (await p.getByRole('dialog', { name: 'Zavírání' }).count()) === 2, 2000)
    && (await dPrubH.innerText()).includes('Petr Malý') && (await dPrubH.innerText()).includes('26:00'));
  await p.keyboard.press('Escape');
  tvrdi('P-H: Escape zavře jen detail průběhu, detail postupu zůstane', await dokud(async () => (await p.getByRole('dialog', { name: 'Zavírání' }).count()) === 1, 1500));
  await p.screenshot({ path: OUT + 'k83-postup-detail-desk.png' });
  await p.keyboard.press('Escape');
  await dokud(async () => (await dZav.count()) === 0, 1500);
  await nastroj.getByRole('button', { name: 'Příjem zboží (návrh)', exact: true }).click();
  const dNavrh = p.getByRole('dialog', { name: 'Příjem zboží (návrh)' });
  tvrdi('P-H: návrh (nikdo ho nespustí) sekci Poslední průběhy nemá', await dokud(() => dNavrh.isVisible(), 1500) && await dNavrh.getByRole('heading', { name: 'Poslední průběhy' }).count() === 0);
  await p.keyboard.press('Escape');
  await dokud(async () => (await dNavrh.count()) === 0, 1500);

  // Smazání přes „···" → okno (ne confirm()).
  let dialogConfirm = false;
  p.on('dialog', d => { dialogConfirm = true; d.dismiss().catch(() => {}); });
  await nastroj.getByRole('button', { name: 'Další akce s postupem Otevírací rutina' }).click();
  await p.getByRole('menuitem', { name: 'Smazat' }).click();
  const smazat = p.getByRole('dialog', { name: 'Smazat postup?' });
  tvrdi('P-D: Smazat z „···" otevře okno (ne confirm())', await dokud(() => smazat.isVisible(), 1500) && !dialogConfirm);
  await smazat.getByRole('button', { name: 'Zrušit' }).click();

  await nastrojVUpravach(p, stav, 'P', 'postupy.povinne_dnes');
  await p.screenshot({ path: OUT + 'k69-b6b-postupy-desk-upravy.png', fullPage: true });
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('P: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 3) Galerie Postupů: Přeskočené kroky, Připomínky a Spustit postup v Doporučených.
{
  const { ctx, p } = await kontext({ fix: FIX_POSTUPY, dalsi: podvrh() });
  await otevri(p, POSTUPY, 'vedeni.postupy');
  const dop = await galerieDoporucene(p);
  tvrdi('P3: galerie nabízí Přeskočené kroky, Připomínky dnes a Spustit postup', ['Přeskočené kroky', 'Připomínky dnes', 'Spustit postup'].every(t => dop.includes(t)), dop.slice(0, 300));
  await ctx.close();
}

// 4) Oprávnění: Skladník (bez průběhů týmu, uzávěrky, schvalování a úprav).
{
  const { ctx, p, stav } = await kontext({ fix: FIX_POSTUPY, mineData: roleMine('skladnik'), dalsi: podvrh() });
  await otevri(p, POSTUPY, 'vedeni.postupy');
  await p.waitForTimeout(700);
  tvrdi('P4: Skladník nevidí Povinné dnes a na ?today=team neodešel dotaz', await naPlose(p, 'postupy.povinne_dnes') === 0
    && !stav.dotazy.some(d => d.path === '/api/procedures/runs' && d.u.includes('today=team')));
  tvrdi('P4: …ani Návrhy postupů', await naPlose(p, 'postupy.navrhy') === 0);
  tvrdi('P4: Poslední průběhy vidí jako „Moje průběhy"', await naPlose(p, 'postupy.posledni_prubehy') === 1 && (await widgetLi(p, 'postupy.posledni_prubehy').innerText()).includes('Moje průběhy'));
  tvrdi('P4: bez „Nový postup" a v „···" jen Zobrazit kroky', await p.getByRole('button', { name: 'Nový postup' }).count() === 0 && await dokud(async () => {
    await widgetLi(p, 'nastroj').getByRole('button', { name: /Další akce s postupem/ }).first().click();
    const n = await p.getByRole('menuitem').allInnerTexts();
    await p.keyboard.press('Escape');
    return n.length === 1 && n[0].includes('Zobrazit kroky');
  }, 1500));
  await ctx.close();
}

// 5) 500 na dnešní průběhy → chyba jen v Povinných dnes.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_POSTUPY, dalsi: podvrh() });
  stav.chybaDnes = true;
  await otevri(p, POSTUPY, 'vedeni.postupy');
  await p.waitForTimeout(900);
  const pov = widgetLi(p, 'postupy.povinne_dnes');
  tvrdi('P5: Povinné dnes ukáže „Widget se nenačetl" se „Zkusit znovu"', await pov.getByText('Widget se nenačetl').isVisible() && await pov.getByRole('button', { name: 'Zkusit znovu' }).isVisible());
  tvrdi('P5: jen on — průběhy, návrhy i nástroj žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && (await widgetLi(p, 'postupy.posledni_prubehy').innerText()).includes('Zavírání') && (await widgetLi(p, 'nastroj').innerText()).includes('Otevírací rutina'));
  await ctx.close();
}

// 6) Telefon 390: bez přetečení, „Spustit" vidět a spustí postup.
{
  const { ctx, p, stav } = await kontext({ fix: FIX_POSTUPY, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, POSTUPY, 'vedeni.postupy');
  tvrdi('P6: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const spustit = widgetLi(p, 'nastroj').getByRole('button', { name: 'Spustit' }).first();
  await spustit.scrollIntoViewIfNeeded();
  tvrdi('P6: „Spustit" je vidět a povolené', await spustit.isVisible() && await spustit.isEnabled());
  await p.screenshot({ path: OUT + 'k69-b6b-postupy-tel.png', fullPage: true });
  await spustit.click();
  tvrdi('P6: …pošle POST /api/procedures/runs s postupem 1', await dokud(() => stav.spusteno?.procedureId === 1, 2000), JSON.stringify(stav.spusteno));
  tvrdi('P6: běžec se otevře a nepřetéká', await dokud(() => p.getByRole('button', { name: 'Dokončit' }).isVisible(), 2000) && await bezPreteceni(p));
  await ctx.close();
}

// Zaměstnanec: plocha Postupů (barista).
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: FIX_POSTUPY_ZAM, mineData: roleMine('barista'), dalsi: podvrh() });
  await otevri(p, POSTUPY_ZAM, 'zamestnanec.postupy');
  const h = await h1(p);
  tvrdi('PZ1: zaměstnanec — jeden h1 „Postupy", nástroj se „Spustit"', h.pocet === 1 && h.text === 'Postupy' && await widgetLi(p, 'nastroj').getByRole('button', { name: 'Spustit' }).first().isVisible(), JSON.stringify(h));
  const prip = await widgetLi(p, 'postupy.pripominky').innerText();
  tvrdi('PZ1: Připomínky dnes — při otevření 7:30 a Kontrola lednic ve 14:00', prip.includes('07:30') && prip.includes('Při otevření') && prip.includes('14:00'), prip.replace(/\n/g, ' | '));
  tvrdi('PZ1: barista nevidí návrh postupu (API ho nevrací jen schvalovateli; v UI žádné „Schválit")', await p.getByRole('button', { name: 'Schválit' }).count() === 0);
  tvrdi('PZ1: barista (postupy.navrhnout bez vytvorit) má „Navrhnout postup", ne „Nový postup"', await p.getByRole('button', { name: 'Navrhnout postup' }).isVisible()
    && await p.getByRole('button', { name: 'Nový postup' }).count() === 0);
  await p.screenshot({ path: OUT + 'k69-b6b-postupy-zam-desk.png', fullPage: true });
  // Návrh baristy API autorovi nevrátí — po odeslání musí zůstat potvrzení, jinak ho pošle znovu.
  await p.getByRole('button', { name: 'Navrhnout postup' }).click();
  const ed = p.getByRole('dialog', { name: 'Navrhnout postup' });
  await dokud(() => ed.isVisible(), 2000);
  await ed.getByLabel('Název').fill('Sonda návrh');
  await ed.getByLabel('Krok 1', { exact: true }).fill('Otřít pult');
  await ed.getByRole('button', { name: 'Odeslat návrh' }).click();
  tvrdi('PZ2: „Odeslat návrh" pošle POST /api/procedures', await dokud(() => stav.navrh?.name === 'Sonda návrh', 2000), JSON.stringify(stav.navrh));
  await dokud(async () => !(await ed.isVisible()), 2000);
  await p.waitForTimeout(600);
  tvrdi('PZ2: po zavření okna zůstane potvrzení „Návrh … odeslán — schválí ho vedení"', await widgetLi(p, 'nastroj').getByRole('status').filter({ hasText: 'Sonda návrh' }).isVisible()
    && (await widgetLi(p, 'nastroj').innerText()).includes('schválí ho vedení'));
  tvrdi('PZ: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Návody (vedení)
// ---------------------------------------------------------------------------

{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_NAVODY, dalsi: podvrh() });
  await otevri(p, NAVODY, 'vedeni.navody');
  const h = await h1(p);
  tvrdi('N1: právě jeden viditelný h1 „Návody" a je první nadpis plochy', h.pocet === 1 && h.prvniJeH1 && h.text === 'Návody', JSON.stringify(h));
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('N1: nástroj v klidu vidět — hledání, kategorie a seznam', await nastroj.getByLabel('Hledat návody').isVisible()
    && await nastroj.getByRole('group', { name: 'Kategorie návodů' }).isVisible() && (await nastroj.innerText()).includes('Jak se dělá flat white'));
  tvrdi('N1: jediná limetka stránky je „Nový návod"', await limetek(p) === 1, `${await limetek(p)}×`);
  const kdo = await widgetLi(p, 'navody.kdo_necetl').innerText();
  tvrdi('N1: Kdo nečetl — flat white 4 z 6 nahoře, mlýnek „Všichni"', kdo.indexOf('flat white') >= 0 && kdo.indexOf('flat white') < kdo.indexOf('mlýnku') && kdo.includes('4 z 6') && kdo.includes('Všichni'), kdo.replace(/\n/g, ' | '));
  const lKdo = await linkyKlikacich(widgetLi(p, 'navody.kdo_necetl'));
  tvrdi('N1: klikací řádky „Kdo nečetl" mají mezi sebou linku', lKdo.pocet >= 1 && lKdo.bez.length === 0, JSON.stringify(lKdo));
  tvrdi('N1: Návrhy návodů — matcha tonic a „Schválit"', (await widgetLi(p, 'navody.navrhy').innerText()).includes('matcha') && await widgetLi(p, 'navody.navrhy').getByRole('button', { name: 'Schválit' }).isVisible());
  tvrdi('N1: vybraná kategorie je inkoustová pilulka (seg-on), ne limetka', await nastroj.locator('.filter-pill.seg-on').count() === 1);
  // Stavový filtr vedle kategorií: co čeká na přečtení a na schválení.
  const stavy = nastroj.getByRole('group', { name: 'Stav návodů' });
  const celyTxt = await nastroj.innerText();
  tvrdi('N1: vedle kategorií jsou pilulky „K přečtení" a „Čeká na schválení" s počty', await stavy.isVisible()
    && await stavy.getByRole('button', { name: /^K přečtení \d/ }).count() === 1 && await stavy.getByRole('button', { name: /^Čeká na schválení \d/ }).count() === 1, await stavy.innerText().catch(() => ''));
  await stavy.getByRole('button', { name: /^Čeká na schválení/ }).click();
  const jenNavrhy = await nastroj.innerText();
  tvrdi('N1: „Čeká na schválení" nechá v seznamu jen návrhy (matcha tonic ano, flat white ne)', jenNavrhy.includes('matcha') && !jenNavrhy.includes('Jak se dělá flat white') && jenNavrhy.length < celyTxt.length, jenNavrhy.slice(0, 200));
  await stavy.getByRole('button', { name: /^Čeká na schválení/ }).click();
  tvrdi('N1: druhé klepnutí filtr vypne', await dokud(async () => (await nastroj.innerText()).includes('Jak se dělá flat white'), 1500));
  await p.screenshot({ path: OUT + 'k69-b6b-navody-desk.png', fullPage: true });

  // Widget → nástroj: řádek „Kdo nečetl" otevře čtečku (bez přechodu jinam).
  await widgetLi(p, 'navody.kdo_necetl').locator('button.list-row').first().click();
  const ctecka = p.getByRole('dialog', { name: 'Jak se dělá flat white' });
  tvrdi('N-W: řádek „Kdo nečetl" otevře čtečku návodu v okně', await dokud(() => ctecka.isVisible(), 2500));
  tvrdi('N-W: …s obsahem a checklistem, akce v „···"', await dokud(async () => (await ctecka.innerText()).includes('Namlít kávu'), 2000) && await ctecka.getByRole('button', { name: 'Akce s návodem' }).isVisible());
  await ctecka.getByRole('button', { name: 'Akce s návodem' }).click();
  await p.getByRole('menuitem', { name: 'Připnout k uzávěrce' }).click();
  tvrdi('N-W: „Připnout k uzávěrce" z „···" pošle PATCH { forClosing: true }', await dokud(() => (stav.zapisyNavodu ?? []).some(z => z.m === 'PATCH' && z.telo?.includes('"forClosing":true')), 2000));
  await p.keyboard.press('Escape');
  await dokud(async () => !(await ctecka.isVisible()), 1500);

  // Schválit ve widgetu → PATCH approve.
  await widgetLi(p, 'navody.navrhy').getByRole('button', { name: 'Schválit' }).click();
  tvrdi('N-W: „Schválit" ve widgetu pošle PATCH /api/guides/4 { approve: true }', await dokud(() => (stav.zapisyNavodu ?? []).some(z => z.path === '/api/guides/4' && z.telo?.includes('approve')), 2000));

  // 7) Rozepsané hledání přežije úpravy.
  await nastroj.getByLabel('Hledat návody').fill('mlýn');
  tvrdi('N7: hledání zúží seznam na „Čištění mlýnku"', await dokud(async () => { const t = await nastroj.innerText(); return t.includes('Čištění mlýnku') && !t.includes('flat white'); }, 1500));
  await nastrojVUpravach(p, stav, 'N', 'navody.navrhy');
  await p.screenshot({ path: OUT + 'k69-b6b-navody-desk-upravy.png', fullPage: true });
  await hotovo(p).click().catch(() => {});
  await dokud(async () => !(await vUpravach(p)), 1500);
  tvrdi('N7: rozepsané hledání přežilo úpravy („mlýn")', await nastroj.getByLabel('Hledat návody').inputValue() === 'mlýn');
  tvrdi('N: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// 3) Galerie Návodů: Nově upravené a Návod k uzávěrce v Doporučených.
{
  const { ctx, p } = await kontext({ fix: FIX_NAVODY, dalsi: podvrh() });
  await otevri(p, NAVODY, 'vedeni.navody');
  const dop = await galerieDoporucene(p);
  tvrdi('N3: galerie nabízí Nově upravené návody, Povinné čtení a Návod k uzávěrce', ['Nově upravené návody', 'Povinné čtení', 'Návod k uzávěrce'].every(t => dop.includes(t)), dop.slice(0, 300));
  await ctx.close();
}

// 4) Oprávnění: Skladník (bez povinného čtení a schvalování).
{
  const { ctx, p, stav } = await kontext({ fix: FIX_NAVODY, mineData: roleMine('skladnik'), dalsi: podvrh() });
  await otevri(p, NAVODY, 'vedeni.navody');
  await p.waitForTimeout(700);
  tvrdi('N4: Skladník nevidí Kdo nečetl a na /api/guides/ctenari neodešel dotaz', await naPlose(p, 'navody.kdo_necetl') === 0 && dotazyNa(stav, ['/api/guides/ctenari']).length === 0);
  tvrdi('N4: …ani Návrhy návodů', await naPlose(p, 'navody.navrhy') === 0);
  tvrdi('N4: bez „Nový návod" a bez „···" v řádcích (nesmí upravovat ani mazat)', await p.getByRole('button', { name: 'Nový návod' }).count() === 0
    && await widgetLi(p, 'nastroj').getByRole('button', { name: /Další akce s návodem/ }).count() === 0);
  await ctx.close();
}

// 5) 500 na čtenáře → chyba jen v „Kdo nečetl".
{
  const { ctx, p, stav } = await kontext({ fix: FIX_NAVODY, dalsi: podvrh() });
  stav.chyby['/api/guides/ctenari'] = 500;
  await otevri(p, NAVODY, 'vedeni.navody');
  await p.waitForTimeout(900);
  const kdo = widgetLi(p, 'navody.kdo_necetl');
  tvrdi('N5: Kdo nečetl ukáže „Widget se nenačetl" se „Zkusit znovu"', await kdo.getByText('Widget se nenačetl').isVisible() && await kdo.getByRole('button', { name: 'Zkusit znovu' }).isVisible());
  tvrdi('N5: jen on — návrhy i knihovna žijí', await p.locator('[data-plocha]').getByText('Widget se nenačetl').count() === 1
    && (await widgetLi(p, 'navody.navrhy').innerText()).includes('matcha') && (await widgetLi(p, 'nastroj').innerText()).includes('flat white'));
  await ctx.close();
}

// 6) Telefon 390: bez přetečení, hledání a „Nový návod" použitelné.
{
  const { ctx, p } = await kontext({ fix: FIX_NAVODY, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await otevri(p, NAVODY, 'vedeni.navody');
  tvrdi('N6: telefon 390 — žádné vodorovné přetečení', await bezPreteceni(p));
  const novy = p.locator('[data-plocha]').getByRole('button', { name: 'Nový návod' });
  tvrdi('N6: „Nový návod" vidět a povolené', await novy.isVisible() && await novy.isEnabled());
  const hledat = widgetLi(p, 'nastroj').getByLabel('Hledat návody');
  await hledat.scrollIntoViewIfNeeded();
  await hledat.fill('cisteni');
  tvrdi('N6: hledání bez diakritiky najde „Čištění mlýnku"', await dokud(async () => (await widgetLi(p, 'nastroj').innerText()).includes('Čištění mlýnku'), 1500));
  await p.screenshot({ path: OUT + 'k69-b6b-navody-tel.png', fullPage: true });
  await novy.scrollIntoViewIfNeeded();
  await novy.click();
  const editor = p.getByRole('dialog', { name: 'Nový návod' });
  tvrdi('N6: editor návodu se otevře jako okno a nepřetéká', await dokud(() => editor.isVisible(), 2000) && await bezPreteceni(p));
  await ctx.close();
}

// Zaměstnanec: plocha Návodů (barista) — povinné čtení → čtečka → potvrzení.
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: FIX_NAVODY_ZAM, mineData: roleMine('barista'), dalsi: podvrh() });
  await otevri(p, NAVODY_ZAM, 'zamestnanec.navody');
  const h = await h1(p);
  tvrdi('NZ1: zaměstnanec — jeden h1 „Návody", nástroj s hledáním', h.pocet === 1 && h.text === 'Návody' && await widgetLi(p, 'nastroj').getByLabel('Hledat návody').isVisible(), JSON.stringify(h));
  const lSez = await linkyKlikacich(widgetLi(p, 'nastroj'));
  tvrdi('NZ1: seznam návodů zaměstnance (celé řádky klikací) má linky mezi řádky', lSez.pocet >= 1 && lSez.bez.length === 0, JSON.stringify(lSez));
  const pov = await widgetLi(p, 'navody.povinne_cteni').innerText();
  tvrdi('NZ1: Povinné čtení — flat white (nepřečtený), mlýnek ne (přečtený)', pov.includes('flat white') && !pov.includes('mlýnku'), pov.replace(/\n/g, ' | '));
  await widgetLi(p, 'navody.povinne_cteni').locator('button.list-row').first().click();
  const ctecka = p.getByRole('dialog', { name: 'Jak se dělá flat white' });
  tvrdi('NZ1: řádek otevře čtečku', await dokud(() => ctecka.isVisible(), 2500));
  await dokud(() => ctecka.getByRole('button', { name: 'Potvrzuji přečtení' }).isVisible(), 2000);
  await ctecka.getByRole('button', { name: 'Potvrzuji přečtení' }).click();
  tvrdi('NZ1: „Potvrzuji přečtení" pošle POST { markRead: true }', await dokud(() => (stav.zapisyNavodu ?? []).some(z => z.m === 'POST' && z.telo?.includes('markRead')), 2000));
  await p.screenshot({ path: OUT + 'k69-b6b-navody-zam-desk.png', fullPage: true });
  tvrdi('NZ: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// Kolo 7 (postup-krok-mereni): editor s Měřenou hodnotou, běžící postup s polem a „mimo rozsah", detail průběhu s hodnotou.
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_POSTUPY, dalsi: podvrh() });
  await otevri(p, POSTUPY, 'vedeni.postupy');
  const nastroj = widgetLi(p, 'nastroj');
  // Editor: uložený měřený krok se vrátí s jednotkou a mezemi.
  await nastroj.getByRole('button', { name: 'Další akce s postupem Kontrola lednic' }).click();
  await p.getByRole('menuitem', { name: 'Upravit' }).click();
  const ed = p.getByRole('dialog', { name: 'Upravit postup' });
  await dokud(() => ed.isVisible(), 2000);
  const pilulka = ed.getByRole('button', { name: 'Krok 1: měřená hodnota' });
  tvrdi('PM1: editor — krok „Změřit teplotu" má zapnutou „Měřenou hodnotu" s °C, 2 a 6', await pilulka.getAttribute('aria-pressed') === 'true'
    && await ed.getByLabel('Jednotka kroku 1').inputValue() === '°C' && await ed.getByLabel('Nejnižší povolená hodnota kroku 1').inputValue() === '2'
    && await ed.getByLabel('Nejvyšší povolená hodnota kroku 1').inputValue() === '6');
  tvrdi('PM1: meze mají inputMode decimal (čárka i tečka)', await ed.getByLabel('Nejnižší povolená hodnota kroku 1').getAttribute('inputmode') === 'decimal'
    && await ed.getByLabel('Nejvyšší povolená hodnota kroku 1').getAttribute('type') !== 'number');
  await ed.getByLabel('Nejvyšší povolená hodnota kroku 1').fill('6,5');
  await ed.getByRole('button', { name: 'Uložit změny' }).click();
  tvrdi('PM1: uložení pošle krok s valueKind/valueUnit/valueMin/valueMax (6,5 → 6.5)', await dokud(() => (stav.zapisyPostupu ?? []).some(z => z.m === 'PATCH' && z.path === '/api/procedures/3'), 2000)
    && (() => { const it = JSON.parse(stav.zapisyPostupu.find(z => z.path === '/api/procedures/3').telo).items[0]; return it.valueKind === 'number' && it.valueUnit === '°C' && it.valueMin === 2 && it.valueMax === 6.5; })(),
    JSON.stringify(stav.zapisyPostupu?.map(z => z.telo)));
  await dokud(async () => (await ed.count()) === 0, 2000);
  // Nový postup: zapnutí „Měřené hodnoty" rozbalí tři pole.
  await p.locator('[data-plocha]').getByRole('button', { name: 'Nový postup' }).click();
  const novy = p.getByRole('dialog', { name: 'Nový postup' });
  await dokud(() => novy.isVisible(), 2000);
  tvrdi('PM2: nový krok bez měření — pole jednotky a mezí nejsou', await novy.getByLabel('Jednotka kroku 1').count() === 0);
  await novy.getByRole('button', { name: 'Krok 1: měřená hodnota' }).click();
  tvrdi('PM2: „Měřená hodnota" rozbalí Jednotka / Od / Do', await novy.getByLabel('Jednotka kroku 1').isVisible() && await novy.getByLabel('Nejnižší povolená hodnota kroku 1').isVisible());
  await p.screenshot({ path: OUT + 'k83-postup-editor-desk.png' });
  await p.keyboard.press('Escape');
  await novy.getByRole('button', { name: 'Zrušit' }).click().catch(() => {});
  await dokud(async () => (await novy.count()) === 0, 2000);

  // Běžící postup: odškrtnout až s hodnotou, mimo rozsah = Chip, hodnota jde v persistu i v dokončení.
  const radek = nastroj.locator('ul.list > li').filter({ hasText: 'Kontrola lednic' }).first();
  await radek.getByRole('button', { name: 'Spustit' }).click();
  tvrdi('PM3: Spustit pošle POST s postupem 3', await dokud(() => stav.spusteno?.procedureId === 3, 2000));
  const pole = p.getByLabel(/Změřit teplotu/).and(p.locator('input'));
  tvrdi('PM3: běžec ukáže pole „Naměřené hodnoty" s inputMode decimal a jednotkou °C', await dokud(() => pole.isVisible(), 2000)
    && await pole.getAttribute('inputmode') === 'decimal' && (await p.getByRole('group', { name: 'Naměřené hodnoty' }).innerText()).includes('°C'));
  await p.getByRole('button', { name: 'Označit jako hotové — Změřit teplotu' }).click();
  tvrdi('PM3: krok bez hodnoty se neodškrtne a běžec řekne proč', await dokud(() => p.getByText('Nejdřív zapiš naměřenou hodnotu, pak krok odškrtni.').isVisible(), 1500)
    && await p.getByRole('button', { name: 'Zrušit splnění — Změřit teplotu' }).count() === 0);
  await pole.fill('7,5');
  tvrdi('PM4: 7,5 °C mimo rozsah 2–6 → hned Chip „mimo rozsah" (neblokuje)', await dokud(() => p.getByRole('group', { name: 'Naměřené hodnoty' }).getByText('mimo rozsah').isVisible(), 1500));
  tvrdi('PM4: průběžné uložení pošle values { 0: 7.5 }', await dokud(() => (stav.persisty ?? []).some(b => b.runId === 99 && b.values?.['0'] === 7.5), 2000), JSON.stringify(stav.persisty?.at(-1)));
  await p.getByRole('button', { name: 'Označit jako hotové — Změřit teplotu' }).click();
  tvrdi('PM4: s hodnotou jde krok odškrtnout', await dokud(() => p.getByRole('button', { name: 'Zrušit splnění — Změřit teplotu' }).isVisible(), 1500));
  await p.screenshot({ path: OUT + 'k83-postup-beh-desk.png' });
  await p.getByRole('button', { name: 'Dokončit' }).click();
  tvrdi('PM4: Dokončit pošle complete s values { 0: 7.5 }', await dokud(() => (stav.persisty ?? []).some(b => b.complete === true && b.values?.['0'] === 7.5 && b.checkedItems?.includes(0)), 2000), JSON.stringify(stav.persisty?.at(-1)));

  // Detail průběhu: hodnota podle jazyka a Chip s rozsahem.
  await p.getByRole('button', { name: 'Zavřít', exact: true }).click().catch(() => {});
  await nastroj.getByRole('button', { name: 'Kontrola lednic', exact: true }).click();
  const dK = p.getByRole('dialog', { name: 'Kontrola lednic' });
  await dokud(() => dK.isVisible(), 2000);
  const sekce = dK.locator('section').filter({ has: p.getByRole('heading', { name: 'Poslední průběhy' }) });
  await sekce.locator('button.list-row').filter({ hasText: 'Jana Nováková' }).click();
  const dJ = p.getByRole('dialog', { name: 'Kontrola lednic' }).last();
  tvrdi('PM5: detail průběhu ukáže „7,5 °C" a Chip „mimo rozsah (2–6 °C)"', await dokud(async () => (await p.getByRole('dialog', { name: 'Kontrola lednic' }).count()) === 2, 2000)
    && (await dJ.innerText()).includes('7,5 °C') && (await dJ.innerText()).includes('mimo rozsah (2–6 °C)'), (await dJ.innerText()).replace(/\n/g, ' | '));
  await p.keyboard.press('Escape');
  await dokud(async () => (await p.getByRole('dialog', { name: 'Kontrola lednic' }).count()) === 1, 1500);
  await sekce.locator('button.list-row').filter({ hasText: 'Petr Malý' }).click();
  const dP = p.getByRole('dialog', { name: 'Kontrola lednic' }).last();
  tvrdi('PM5: hodnota v rozsahu („4,2 °C") bez Chipu', await dokud(async () => (await dP.innerText()).includes('4,2 °C'), 2000) && !(await dP.innerText()).includes('mimo rozsah'));
  await p.screenshot({ path: OUT + 'k83-postup-detail-prubehu-desk.png' });
  tvrdi('PM: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// Běžící měřený postup na telefonu 390 a tabletu 768/1024: pole pod textem kroku, nic nepřetéká.
for (const [sirka, vyska] of [[390, 844], [768, 1024], [1024, 768]]) {
  const { ctx, p, stav } = await kontext({ fix: FIX_POSTUPY, viewport: { width: sirka, height: vyska }, mobil: true, dalsi: podvrh() });
  await otevri(p, POSTUPY, 'vedeni.postupy');
  const radek = widgetLi(p, 'nastroj').locator('ul.list > li').filter({ hasText: 'Kontrola lednic' }).first();
  await radek.getByRole('button', { name: 'Spustit' }).scrollIntoViewIfNeeded();
  await radek.getByRole('button', { name: 'Spustit' }).click();
  await dokud(() => stav.spusteno?.procedureId === 3, 2000);
  const pole = p.getByLabel(/Změřit teplotu/).and(p.locator('input'));
  await dokud(() => pole.isVisible(), 2000);
  await pole.fill('1,5');
  await dokud(() => p.getByRole('group', { name: 'Naměřené hodnoty' }).getByText('mimo rozsah').isVisible(), 1500);
  // Panel běžícího postupu přijíždí s `pop-in` (scale): na pomalém stroji CI se pole měřilo
  // uprostřed animace (44 × 0,98 = 43 px). Měří se až po doběhnutí animací panelu.
  await pole.evaluate(el => Promise.all((el.closest('.pop-in') ?? el).getAnimations({ subtree: true }).map(a => a.finished.catch(() => null))));
  const m = await pole.evaluate(el => {
    const r = el.getBoundingClientRect(); const skup = el.closest('[role=group]').getBoundingClientRect();
    const lab = document.querySelector(`label[for="${el.id}"]`).getBoundingClientRect();
    return { pismo: parseFloat(getComputedStyle(el).fontSize), vyska: Math.round(r.height), pod: r.top >= lab.bottom - 1, uvnitr: r.right <= skup.right + 1, labelSirka: Math.round(lab.width) };
  });
  tvrdi(`PM6 ${sirka}: pole hodnoty pod textem kroku, ≥ 16 px a ≥ 44 px, text kroku čitelně široký, nic nepřetéká`,
    m.pismo >= 16 && m.vyska >= 44 && m.pod && m.uvnitr && m.labelSirka >= 200 && await bezPreteceni(p), JSON.stringify(m));
  await p.screenshot({ path: OUT + `k83-postup-beh-${sirka}.png` });
  await ctx.close();
}

// Kolo 7 (navod-bez-fotky): fotka v návodu na telefonu nepřeteče, cizí adresa zůstane textem, editor fotku nahraje a vloží.
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_NAVODY, viewport: { width: 390, height: 844 }, mobil: true, dalsi: podvrh() });
  await p.route('**/api/upload/*', route => route.fulfill({ status: 200, contentType: 'image/png', body: FOTKA }));
  await otevri(p, NAVODY, 'vedeni.navody');
  await widgetLi(p, 'nastroj').getByRole('button', { name: 'Jak se dělá flat white', exact: true }).click();
  const ctecka = p.getByRole('dialog', { name: 'Jak se dělá flat white' });
  await dokud(() => ctecka.isVisible(), 2500);
  const img = ctecka.locator('img[src="/api/upload/41"]');
  tvrdi('NF1: řádek ![…](/api/upload/41) se ve čtečce vykreslí jako fotka s popisem a loading=lazy', await dokud(async () => (await img.count()) === 1, 2000)
    && await img.getAttribute('alt') === 'Pěna na flat white' && await img.getAttribute('loading') === 'lazy');
  await img.scrollIntoViewIfNeeded();
  await dokud(() => img.evaluate(el => el.complete && el.naturalWidth > 0), 3000);
  const m = await img.evaluate(el => { const r = el.getBoundingClientRect(); const rodic = el.parentElement.getBoundingClientRect(); return { w: Math.round(r.width), rodic: Math.round(rodic.width), prirozena: el.naturalWidth, right: Math.round(r.right) }; });
  tvrdi('NF1: fotka 1600 px je zmenšená na šířku obsahu okna (max-w-full), nic nepřetéká', m.prirozena === 1600 && m.w <= m.rodic && m.right <= 390 && await bezPreteceni(p)
    && await ctecka.evaluate(el => el.scrollWidth <= el.clientWidth + 1), JSON.stringify(m));
  tvrdi('NF2: cizí adresa (sledovací pixel) se nevykreslí jako obrázek, zůstane textem', await ctecka.locator('img[src*="sledovani"]').count() === 0
    && (await ctecka.innerText()).includes('![pixel](https://sledovani.example.com/p.gif)'));
  await p.screenshot({ path: OUT + 'k83-navod-fotka-tel.png' });
  await p.keyboard.press('Escape');
  await dokud(async () => (await ctecka.count()) === 0, 1500);
  // Editor: Přidat fotku → POST /api/upload → do obsahu řádek ![latte-art](/api/upload/77).
  await p.locator('[data-plocha]').getByRole('button', { name: 'Nový návod' }).click();
  const editor = p.getByRole('dialog', { name: 'Nový návod' });
  await dokud(() => editor.isVisible(), 2000);
  const obsah = editor.getByLabel('Obsah');
  tvrdi('NF3: editor má u obsahu „Přidat fotku" (≥ 44 px) a nápovědu s fotkami', await editor.getByRole('button', { name: 'Přidat fotku' }).isVisible()
    && (await editor.getByRole('button', { name: 'Přidat fotku' }).evaluate(el => el.getBoundingClientRect().height)) >= 44
    && await editor.getByText('Podporováno: **tučně**, odrážky a fotky.').isVisible());
  await obsah.fill('Nejdřív napěň mléko.\nPak nalij.');
  await obsah.evaluate(el => { el.focus(); el.setSelectionRange(20, 20); });
  // Jako člověk: klepnutí na „Přidat fotku" otevře výběr souboru (pole s obsahem se tím rozostří).
  const [vyber] = await Promise.all([p.waitForEvent('filechooser'), editor.getByRole('button', { name: 'Přidat fotku' }).click()]);
  tvrdi('NF3: výběr nabízí jen obrázky (accept="image/*"), jeden soubor', !vyber.isMultiple() && await vyber.element().getAttribute('accept') === 'image/*');
  await vyber.setFiles({ name: 'latte-art.png', mimeType: 'image/png', buffer: png(40, 30) });
  tvrdi('NF3: fotka se nahraje (POST /api/upload) a vloží jako samostatný řádek na místo kurzoru', await dokud(() => stav.nahrano === 1, 3000)
    && await dokud(async () => (await obsah.inputValue()) === 'Nejdřív napěň mléko.\n![latte-art](/api/upload/77)\nPak nalij.', 2000), JSON.stringify(await obsah.inputValue()));
  await p.screenshot({ path: OUT + 'k83-navod-editor-tel.png' });
  tvrdi('NF: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await konec();
void BASE;
