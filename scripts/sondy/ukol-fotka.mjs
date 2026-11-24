// Úkol „jen s fotkou": vybrat fotku → nahrát → dokončit (hlášení z produkce: „U úkolů,
// kde je potřeba fotka pro dokončení, fotka nejde nahrát.").
//
// Na rozdíl od k83-ukoly se fotka vybírá skutečným klepnutím na „Vyfotit / nahrát"
// (událost filechooser — tlačítko opravdu otevře výběr) a podvržené POST /api/upload se
// chová jako Vercel: tělo přes 4,5 MB odmítne holým textem 413, dřív než by doběhl náš kód.
// Sonda proto hlídá i to, CO se nahrává:
//  A) telefon 390 (isMobile, hasTouch) i počítač: velká fotka (9 MB) odejde jako JPEG pod
//     limitem, náhled se opravdu načte, „Označit jako hotový" pošle PATCH s completionPhotoUrl
//     a okno se zavře.
//  B) HEIC, který Chromium neumí přečíst (jako Chrome, Edge a Firefox s fotkou z iPhonu):
//     dřív odešel nezmenšený → 413 → „Server odpověděl 413."; teď se nic nepošle a okno
//     řekne srozumitelně proč. Úkol zůstane nesplněný.
//  C) selhání: holé 413 od Vercelu, výpadek sítě, náhled, který se nenačte — vždy věta
//     v okně (role=alert) a „Označit jako hotový" zůstane neaktivní; nic se tiše nezahodí.
//   SONDY_ZAKLAD=http://localhost:3000 node scripts/sondy/ukol-fotka.mjs
import { readFileSync } from 'node:fs';
import { deflateSync, crc32 } from 'node:zlib';
import { randomBytes } from 'node:crypto';
import { kontext, konec, tvrdi, otevri, dokud, roleMine, DIR } from './k68-spolecne.mjs';

const praha = (o = 0) => ((d) => { d.setUTCDate(d.getUTCDate() + o); return d.toISOString().slice(0, 10); })(new Date(`${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now()))}T12:00:00Z`));
const NAHRADY = {
  DNES: praha(0), VCERA: praha(-1), PREDVCEREM: praha(-2), ZITRA: praha(1), POZDEJI: praha(20),
  CAS_DNES: new Date(Date.now() - 60000).toISOString(), CAS_PREDVCEREM: new Date(Date.now() - 2 * 86400000).toISOString(), CAS_PRED: '00:00',
};
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  for (const [k, v] of Object.entries(NAHRADY)) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t);
};

/** PNG w × h; `sum` = náhodné pixely (nekomprimovatelné, „fotka" z fotoaparátu ~ w·h·3 bajtů). */
function png(w, h, sum = false) {
  const radky = Buffer.alloc((w * 3 + 1) * h);
  if (sum) { randomBytes(radky.length).copy(radky); for (let y = 0; y < h; y++) radky[y * (w * 3 + 1)] = 0; }
  else for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * (w * 3 + 1) + 1 + x * 3;
    radky[i] = 120 + Math.round(100 * x / w); radky[i + 1] = 170 + Math.round(60 * y / h); radky[i + 2] = (x + y) % 60 < 30 ? 170 : 90;
  }
  const kus = (typ, data) => { const d = Buffer.concat([Buffer.from(typ), data]); const b = Buffer.alloc(4); b.writeUInt32BE(data.length); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(d) >>> 0); return Buffer.concat([b, d, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), kus('IHDR', ihdr), kus('IDAT', deflateSync(radky, { level: 1 })), kus('IEND', Buffer.alloc(0))]);
}
const MALA = png(480, 360);
const VELKA = png(2000, 1500, true);
// HEIC z iPhonu: hlavička ftyp heic, obsah, který Chromium nedekóduje (stejně jako Chrome/Edge/Firefox).
const HEIC = Buffer.concat([Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63]), randomBytes(5 * 1024 * 1024)]);
const LIMIT_VERCEL = 4.5 * 1024 * 1024;

const podvrh = (req, json, stav) => {
  const path = new URL(req.url()).pathname;
  const m = req.method();
  if (path === '/api/tasks') {
    if (m === 'GET') return json(nacti('k69-b6a-tasks'));
    if (m === 'PATCH') { const t = req.postDataJSON(); (stav.patche ??= []).push(t); return json({ id: t.id, ...t, pointsEarned: t.status === 'done' ? 5 : null }); }
  }
  return undefined;
};

/** POST /api/upload jako na Vercelu + GET /api/upload/<id> (obrázek, nebo 404 při `stav.nahledChybi`). */
async function nahravani(ctx, stav) {
  await ctx.route('**/api/upload', async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fallback();
    const telo = req.postDataBuffer() ?? Buffer.alloc(0);
    const hlava = /filename="([^"]*)"\r\nContent-Type: ([^\r]*)/.exec(telo.toString('latin1'));
    (stav.nahrani ??= []).push({ bajty: telo.length, nazev: hlava?.[1], typ: hlava?.[2] });
    if (stav.sit) { stav.sit = false; return route.abort('internetdisconnected'); }
    if (stav.vynutit413 || telo.length > LIMIT_VERCEL) {
      stav.vynutit413 = false;
      return route.fulfill({ status: 413, contentType: 'text/plain', body: 'Request Entity Too Large\n\nFUNCTION_PAYLOAD_TOO_LARGE\n' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: `/api/upload/${50 + stav.nahrani.length}`, type: 'image', name: hlava?.[1] ?? 'foto.jpg' }) });
  });
  await ctx.route('**/api/upload/*', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    if (stav.nahledChybi) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Soubor nenalezen"}' });
    return route.fulfill({ status: 200, contentType: 'image/png', body: MALA });
  });
}

const nastroj = (p) => p.locator('[data-plocha] li[data-widget="nastroj"]');

/** Klepne na „Vyfotit / nahrát" a vybere soubor ve skutečném výběru (filechooser). */
async function vyber(p, okno, soubor) {
  const vyberSouboru = p.waitForEvent('filechooser', { timeout: 4000 }).catch(() => null);
  await okno.getByRole('button', { name: /^(Vyfotit \/ nahrát|Vyfotit znovu)$/ }).click();
  const chooser = await vyberSouboru;
  if (chooser) await chooser.setFiles(soubor);
  return !!chooser;
}

for (const [zarizeni, nastaveni] of [
  ['telefon', { viewport: { width: 390, height: 844 }, mobil: true }],
  ['počítač', { viewport: { width: 1280, height: 900 } }],
]) {
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: nacti('k69-b6a-rozlozeni-ukoly-zam'), mineData: roleMine('barista'), ...nastaveni, dalsi: podvrh });
  await nahravani(ctx, stav);
  await otevri(p, '/employee/shifts?view=tasks', 'zamestnanec.ukoly');
  await nastroj(p).getByRole('checkbox', { name: 'Zavřít bar' }).click();
  const okno = p.getByRole('dialog', { name: 'Přilož fotku' });
  tvrdi(`${zarizeni} A0: odškrtnutí úkolu s fotkou otevře okno „Přilož fotku"`, await dokud(() => okno.isVisible(), 3000));
  const oznacit = okno.getByRole('button', { name: 'Označit jako hotový' });
  const hlaska = okno.locator('[role=alert]');

  // B) HEIC, který prohlížeč nepřečte: nic se nepošle, srozumitelná věta.
  const otevrel = await vyber(p, okno, { name: 'IMG_4821.HEIC', mimeType: 'image/heic', buffer: HEIC });
  tvrdi(`${zarizeni} A0: „Vyfotit / nahrát" opravdu otevře výběr fotky`, otevrel);
  tvrdi(`${zarizeni} B1: nečitelná fotka (HEIC) ukáže v okně srozumitelnou větu`, await dokud(async () => /HEIC z iPhonu/.test((await hlaska.allInnerTexts()).join(' ')), 6000),
    (await hlaska.allInnerTexts()).join(' | '));
  tvrdi(`${zarizeni} B1: …a nic se neposlalo (dřív nezmenšený soubor → 413)`, (stav.nahrani ?? []).length === 0, JSON.stringify(stav.nahrani));
  tvrdi(`${zarizeni} B1: „Označit jako hotový" zůstane neaktivní`, await oznacit.isDisabled());

  // C) holé 413 od Vercelu a výpadek sítě: věta v okně.
  stav.vynutit413 = true;
  await vyber(p, okno, { name: 'bar.png', mimeType: 'image/png', buffer: MALA });
  tvrdi(`${zarizeni} C1: holé 413 od Vercelu → „Soubor je na nahrání moc velký." (dřív „Server odpověděl 413.")`,
    await dokud(() => hlaska.getByText('Soubor je na nahrání moc velký.').isVisible(), 4000) && await oznacit.isDisabled(), (await hlaska.allInnerTexts()).join(' | '));
  stav.sit = true;
  await vyber(p, okno, { name: 'bar.png', mimeType: 'image/png', buffer: MALA });
  tvrdi(`${zarizeni} C2: výpadek sítě → věta o připojení v okně`,
    await dokud(async () => /připojení/.test((await hlaska.allInnerTexts()).join(' ')), 4000) && await oznacit.isDisabled(), (await hlaska.allInnerTexts()).join(' | '));
  stav.nahledChybi = true;
  await vyber(p, okno, { name: 'bar.png', mimeType: 'image/png', buffer: MALA });
  tvrdi(`${zarizeni} C3: nahraná fotka, jejíž náhled se nenačte, se zahodí s hláškou (ne rozbitý obrázek)`,
    await dokud(() => hlaska.getByText('Fotku se nepodařilo nahrát.').isVisible(), 4000)
    && await okno.getByRole('img', { name: 'Náhled fotky' }).count() === 0 && await oznacit.isDisabled());
  stav.nahledChybi = false;

  // A) velká fotka z fotoaparátu: JPEG pod limitem, náhled, splnění.
  const pred = (stav.nahrani ?? []).length;
  await vyber(p, okno, { name: 'IMG_4822.png', mimeType: 'image/png', buffer: VELKA });
  const nahled = okno.getByRole('img', { name: 'Náhled fotky' });
  tvrdi(`${zarizeni} A1: velká fotka (${(VELKA.length / 1024 / 1024).toFixed(1)} MB) se nahraje a náhled se opravdu načte`,
    await dokud(() => nahled.evaluate(i => i.complete && i.naturalWidth > 0).catch(() => false), 15000), (await hlaska.allInnerTexts()).join(' | '));
  const posledni = (stav.nahrani ?? [])[pred];
  tvrdi(`${zarizeni} A1: …odešla jedna fotka, zmenšená na JPEG pod limitem Vercelu (4,5 MB)`,
    (stav.nahrani ?? []).length === pred + 1 && posledni?.typ === 'image/jpeg' && /\.jpg$/.test(posledni?.nazev ?? '') && posledni.bajty < LIMIT_VERCEL, JSON.stringify(posledni));
  tvrdi(`${zarizeni} A1: žádná hláška a „Označit jako hotový" je aktivní`, await hlaska.count() === 0 && await oznacit.isEnabled());
  await oznacit.click();
  const url = `/api/upload/${50 + pred + 1}`;
  tvrdi(`${zarizeni} A2: „Označit jako hotový" pošle PATCH done s completionPhotoUrl ${url}`,
    await dokud(() => (stav.patche ?? []).some(t => t.id === 9 && t.status === 'done' && t.completionPhotoUrl === url), 3000), JSON.stringify(stav.patche));
  tvrdi(`${zarizeni} A2: …a okno se zavře`, await dokud(async () => (await okno.count()) === 0, 3000));
  tvrdi(`${zarizeni}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await konec();
