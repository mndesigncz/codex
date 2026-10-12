// Kolo 7, balík R7-4 — Úkoly z telefonu a z tabletu (fotka jako důkaz, Probíhá a čas termínu).
//
// Obsluha odškrtává z telefonu a důkaz fotí telefonem, takže tahle sonda jede na 390 × 844
// s dotykem (a tablet na 768 × 1024):
//  F) Zaměstnanec › Úkoly: úkol „jen s fotkou" (Zavřít bar) má Chip „chce fotku"; odškrtnutí
//     otevře okno Přilož fotku ZDOLA, „Označit jako hotový" je bez fotky neaktivní a nic se
//     nepošle; input je image/* s capture (zadní fotoaparát); po nahrání (POST /api/upload
//     v podvrhu vrátí /api/upload/abc) náhled max-w-full a PATCH nese completionPhotoUrl.
//     Chyba uložení zůstane v okně. Detail hotového úkolu ukáže fotku (max-w-full) s odkazem.
//  W) Widget Úkoly na dnes (Domů zaměstnance): „10:00" v meta a Chip Probíhá; odškrtnutí
//     úkolu s fotkou z widgetu jde taky přes okno (widget ho neobejde).
//  T) Tablet /kiosk › Úkoly: fotka za vybraného člověka — okno řekne „Splní se za: Eva
//     Testová" a PATCH nese actingAs i completionPhotoUrl.
// Fixtury: k69-b6a-tasks.json (s dueTime, in_progress, requirePhoto, completionPhoto) —
// tady „Doplnit sirupy" probíhá a má čas 10:00.
//   SONDY_ZAKLAD=http://localhost:3424 node scripts/sondy/k83-ukoly.mjs
import { readFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { kontext, konec, tvrdi, otevri, dokud, roleMine, DIR, OUT, BASE, FIX_DOMU } from './k68-spolecne.mjs';

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const NAHRADY = {
  DNES: praha(0), VCERA: praha(-1), PREDVCEREM: praha(-2), ZITRA: praha(1), POZDEJI: praha(20),
  CAS_DNES: new Date(Date.now() - 60000).toISOString(), CAS_PREDVCEREM: new Date(Date.now() - 2 * 86400000).toISOString(), CAS_PRED: '00:00',
};
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  for (const [k, v] of Object.entries(NAHRADY)) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t);
};
/** Úkoly: „Doplnit sirupy" probíhá a má být hotové do 10:00 (widget ukáže „10:00" a Probíhá). */
const ukoly = () => nacti('k69-b6a-tasks').map(u => (u.id === 2 ? { ...u, status: 'in_progress', dueTime: '10:00' } : u));

/** Skutečný PNG (přechod barev) — „fotka" z fotoaparátu i obsah /api/upload/<id>. */
function png(w = 480, h = 360) {
  const radky = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * (w * 3 + 1) + 1 + x * 3;
    radky[i] = 120 + Math.round(100 * x / w); radky[i + 1] = 170 + Math.round(60 * y / h); radky[i + 2] = (x + y) % 60 < 30 ? 170 : 90;
  }
  const kus = (typ, data) => { const d = Buffer.concat([Buffer.from(typ), data]); const b = Buffer.alloc(4); b.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(d) >>> 0); return Buffer.concat([b, d, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), kus('IHDR', ihdr), kus('IDAT', deflateSync(radky)), kus('IEND', Buffer.alloc(0))]);
}
const FOTKA = png();

const isoPred = (min) => new Date(Date.now() - min * 60000).toISOString();
/** Tablet: na směně je jen Eva → tablet ji vybere sám (jeden člověk na směně není odhad). */
const roster = () => ({
  roster: [
    { id: 16, name: 'Eva Testová', avatar: '🙂', hasPin: false, openSince: isoPred(60), openEntryId: 701, shiftStart: null, shiftEnd: null },
    { id: 21, name: 'Petr Novák', avatar: null, hasPin: false, openSince: null, openEntryId: null, shiftStart: null, shiftEnd: null },
  ],
  entries: [],
});

const podvrh = (req, json, stav) => {
  const path = new URL(req.url()).pathname;
  const m = req.method();
  if (path === '/api/tasks') {
    if (m === 'GET') return json(ukoly());
    if (m === 'PATCH') {
      const t = req.postDataJSON(); (stav.patche ??= []).push(t);
      if (stav.chybaPatch) { const e = stav.chybaPatch; stav.chybaPatch = null; return json({ error: e }, 400); }
      return json({ id: t.id, ...t, pointsEarned: t.status === 'done' ? 5 : null });
    }
  }
  if (path === '/api/upload' && m === 'POST') { stav.nahrani = (stav.nahrani ?? 0) + 1; return json({ url: '/api/upload/abc', type: 'image', name: 'foto.jpg' }); }
  if (path === '/api/teams' && m === 'GET') return json(nacti('k69-b6a-teams'));
  if (path === '/api/attendance' && m === 'GET') return json(roster());
  if (path === '/api/closings/handover' && m === 'GET') return json(nacti('k69-b9-handover'));
  if (path === '/api/procedures/runs' && m === 'GET') return json({ runs: [] });
  return undefined;
};
/** GET /api/upload/<id> vrátí obrázek (podvrh k68 by vrátil JSON a náhled by byl rozbitý). */
const obrazky = (ctx) => ctx.route('**/api/upload/*', r => (r.request().method() === 'GET' ? r.fulfill({ status: 200, contentType: 'image/png', body: FOTKA }) : r.fallback()));

const TELEFON = { viewport: { width: 390, height: 844 }, mobil: true };
const nastroj = (p) => p.locator('[data-plocha] li[data-widget="nastroj"]');
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ---------------------------------------------------------------------------
// F) Zaměstnanec na telefonu: fotka jako důkaz
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: nacti('k69-b6a-rozlozeni-ukoly-zam'), mineData: roleMine('barista'), ...TELEFON, dalsi: podvrh });
  await obrazky(ctx);
  await otevri(p, '/employee/shifts?view=tasks', 'zamestnanec.ukoly');
  const radek = (nazev) => nastroj(p).locator('li.list-row', { has: p.getByRole('button', { name: nazev, exact: true }) });
  tvrdi('F0: úkol „jen s fotkou" (Zavřít bar) má v řádku Chip „chce fotku"', await radek('Zavřít bar').locator('.chip', { hasText: /^chce fotku$/ }).count() === 1);
  const sirupy = await radek('Doplnit sirupy').innerText();
  tvrdi('F0: rozpracovaný úkol s časem ukazuje „· 10:00" a Chip Probíhá', sirupy.includes('· 10:00') && /Probíhá/.test(sirupy), sirupy.replace(/\n/g, ' | '));

  await nastroj(p).getByRole('checkbox', { name: 'Zavřít bar' }).click();
  const okno = p.getByRole('dialog', { name: 'Přilož fotku' });
  tvrdi('F1: odškrtnutí úkolu s fotkou otevře okno „Přilož fotku"', await dokud(() => okno.isVisible(), 2000));
  await p.waitForTimeout(500); // dojezd listu zdola
  const box = await okno.boundingBox();
  tvrdi('F1: okno na telefonu vyjede zdola přes celou šířku (dosedne na spodní hranu)', !!box && Math.abs(box.y + box.height - 844) <= 2 && Math.round(box.width) === 390, JSON.stringify(box));
  const oznacit = okno.getByRole('button', { name: 'Označit jako hotový' });
  tvrdi('F1: bez fotky je „Označit jako hotový" neaktivní a nic se neposlalo', await oznacit.isDisabled() && !(stav.patche ?? []).some(t => t.id === 9));
  const kamera = await okno.getByRole('button', { name: 'Vyfotit / nahrát' }).boundingBox();
  tvrdi('F1: tlačítko kamery má aspoň 48 px', !!kamera && kamera.height >= 47.5, JSON.stringify(kamera));
  const vstup = okno.locator('input[type=file]');
  tvrdi('F1: skrytý input bere obrázky a otevře zadní fotoaparát (accept image/*, capture environment)',
    await vstup.getAttribute('accept') === 'image/*' && await vstup.getAttribute('capture') === 'environment');
  await p.screenshot({ path: OUT + 'k83-ukoly-foto-okno-tel.png' });

  await vstup.setInputFiles({ name: 'lednice.png', mimeType: 'image/png', buffer: FOTKA });
  const nahled = okno.getByRole('img', { name: 'Náhled fotky' });
  tvrdi('F2: po výběru se fotka nahraje (POST /api/upload) a ukáže náhled', await dokud(() => nahled.isVisible(), 3000) && stav.nahrani === 1);
  await p.waitForTimeout(300);
  const nb = await nahled.boundingBox(); const ob = await okno.boundingBox();
  tvrdi('F2: náhled se vejde do okna (max-w-full) a je nejvýš 192 px vysoký (max-h-48)', !!nb && !!ob && nb.width <= ob.width - 40 && nb.height <= 192.5, JSON.stringify({ nb, ob }));
  tvrdi('F2: „Označit jako hotový" je teď aktivní', await oznacit.isEnabled());
  await p.screenshot({ path: OUT + 'k83-ukoly-foto-nahrano-tel.png' });

  // Server odmítne (např. fotka z cizího podniku) — chyba zůstane v okně, okno nezmizí.
  stav.chybaPatch = 'Fotka není platná — nahraj ji prosím znovu.';
  await oznacit.click();
  tvrdi('F3: chyba uložení se ukáže v okně (note-danger) a okno zůstane otevřené', await dokud(() => okno.getByText('Fotka není platná — nahraj ji prosím znovu.').isVisible(), 2000)
    && await okno.isVisible());
  await oznacit.click();
  tvrdi('F3: znovu „Označit jako hotový" pošle PATCH s completionPhotoUrl /api/upload/abc', await dokud(() => (stav.patche ?? []).filter(t => t.id === 9 && t.status === 'done' && t.completionPhotoUrl === '/api/upload/abc').length === 2, 2000),
    JSON.stringify(stav.patche));
  tvrdi('F3: …a okno se zavřelo', await dokud(async () => (await okno.count()) === 0, 2000));
  tvrdi('F: stránka nepřetéká', await bezPreteceni(p));

  // Detail hotového úkolu s fotkou.
  await nastroj(p).getByRole('button', { name: 'Ranní káva pro tým', exact: true }).click();
  const detail = p.getByRole('dialog', { name: 'Ranní káva pro tým' });
  await dokud(() => detail.isVisible(), 2000);
  const foto = detail.getByRole('img', { name: 'Fotka ze splnění úkolu Ranní káva pro tým' });
  tvrdi('F4: detail hotového úkolu ukáže fotku ze splnění', await dokud(() => foto.isVisible(), 3000));
  await p.waitForTimeout(400);
  const fb = await foto.boundingBox(); const db = await detail.boundingBox();
  tvrdi('F4: fotka v detailu nepřetéká okno (max-w-full) a je nejvýš 256 px (max-h-64)', !!fb && !!db && fb.x >= db.x && fb.x + fb.width <= db.x + db.width && fb.height <= 256.5, JSON.stringify({ fb, db }));
  tvrdi('F4: klepnutí na fotku otevře plnou velikost (odkaz na /api/upload/77 do nového okna)',
    await detail.locator('a[href="/api/upload/77"][target="_blank"]').count() === 1);
  await p.screenshot({ path: OUT + 'k83-ukoly-detail-foto-tel.png' });
  tvrdi('F: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// W) Widget Úkoly na dnes (Domů zaměstnance, telefon)
// ---------------------------------------------------------------------------
{
  const fix = { ...FIX_DOMU, polozky: [{ id: 'ukoly-dnes', widget: 'ukoly.dnes', velikost: 'M' }] };
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix, mineData: roleMine('barista'), ...TELEFON, dalsi: podvrh });
  await obrazky(ctx);
  await otevri(p, '/employee/shifts', 'zamestnanec.domu');
  const w = p.locator('[data-plocha] li[data-widget="ukoly.dnes"]');
  await dokud(async () => (await w.innerText()).includes('Doplnit sirupy'), 4000);
  const rS = w.locator('li.list-row', { hasText: 'Doplnit sirupy' });
  const tS = (await rS.innerText()).replace(/\n/g, ' | ');
  tvrdi('W1: widget Úkoly na dnes — čas termínu jen v meta („10:00") a Chip Probíhá vpravo', /10:00/.test(tS) && await rS.locator('.chip', { hasText: /^Probíhá$/ }).count() === 1
    && await rS.locator('.chip', { hasText: /po čase/ }).count() === 0, tS);
  tvrdi('W1: widget nepřetéká', await w.evaluate(el => el.scrollWidth <= el.clientWidth + 1) && await bezPreteceni(p));
  await p.screenshot({ path: OUT + 'k83-ukoly-widget-tel.png' });
  await w.getByRole('checkbox', { name: 'Zavřít bar' }).click();
  const okno = p.getByRole('dialog', { name: 'Přilož fotku' });
  tvrdi('W2: odškrtnutí úkolu s fotkou z widgetu taky otevře okno Přilož fotku (widget server neobejde)', await dokud(() => okno.isVisible(), 2000)
    && !(stav.patche ?? []).some(t => t.id === 9));
  await okno.locator('input[type=file]').setInputFiles({ name: 'bar.png', mimeType: 'image/png', buffer: FOTKA });
  await dokud(() => okno.getByRole('button', { name: 'Označit jako hotový' }).isEnabled(), 3000);
  await okno.getByRole('button', { name: 'Označit jako hotový' }).click();
  tvrdi('W2: …PATCH z widgetu nese completionPhotoUrl', await dokud(() => (stav.patche ?? []).some(t => t.id === 9 && t.status === 'done' && t.completionPhotoUrl === '/api/upload/abc'), 2000), JSON.stringify(stav.patche));
  tvrdi('W: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// T) Tablet za barem: fotka za vybraného člověka
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'kiosk', viewport: { width: 768, height: 1024 }, mobil: true, fix: nacti('k69-b9-rozlozeni-smena'), mineData: roleMine('kiosk'), dalsi: podvrh });
  await obrazky(ctx);
  await p.goto(BASE + '/kiosk', { waitUntil: 'networkidle' });
  await p.locator('[data-plocha="kiosk.smena"] li[data-instance]:not([hidden])').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(900);
  await p.locator('nav').getByRole('button', { name: /^Úkoly/ }).click();
  const zaskrt = p.getByRole('checkbox', { name: 'Zavřít bar' });
  tvrdi('T0: záložka Úkoly na tabletu ukáže úkol s Chipem „chce fotku"', await dokud(() => zaskrt.isVisible(), 4000)
    && await p.locator('li.list-row', { hasText: 'Zavřít bar' }).locator('.chip', { hasText: /^chce fotku$/ }).count() === 1);
  await zaskrt.click();
  const okno = p.getByRole('dialog', { name: 'Přilož fotku' });
  tvrdi('T1: odškrtnutí otevře okno Přilož fotku a řekne, za koho se úkol splní', await dokud(() => okno.isVisible(), 2000)
    && await okno.getByText('Splní se za: Eva Testová').isVisible());
  await okno.locator('input[type=file]').setInputFiles({ name: 'bar.png', mimeType: 'image/png', buffer: FOTKA });
  await dokud(() => okno.getByRole('button', { name: 'Označit jako hotový' }).isEnabled(), 3000);
  await p.screenshot({ path: OUT + 'k83-ukoly-foto-tablet.png' });
  await okno.getByRole('button', { name: 'Označit jako hotový' }).click();
  tvrdi('T2: PATCH z tabletu nese actingAs vybraného člověka (Eva, 16) i completionPhotoUrl', await dokud(() => (stav.patche ?? []).some(t => t.id === 9 && t.status === 'done' && t.actingAs === 16 && t.completionPhotoUrl === '/api/upload/abc'), 2000),
    JSON.stringify(stav.patche));
  tvrdi('T2: …okno se zavřelo a tablet nepřetéká', await dokud(async () => (await okno.count()) === 0, 2000) && await bezPreteceni(p));
  tvrdi('T: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await konec();
