// Kolo 78 — vícejazyčnost: správa podniku (vedení), tým, návody, postupy.
//
// Tvrdí (na telefonu 390 × 844, v němčině a angličtině, ve světlém i tmavém režimu):
//  • obrazovky vedení ukážou nadpis v jazyce z cookie managero-lang (ne česky) a hlavní
//    akce Týmu a Postupů jsou přeložené (slovníky sprava / tym / postupy se načtou s layoutem);
//  • německé věty (nejdelší) nepřetékají: dokument ani hlavička nejsou širší než okno;
//  • v tmavém režimu nadpis a text zůstanou čitelné (kontrast proti pozadí).
// Obsah podniku (jména lidí, názvy postupů z fixtur) se nepřekládá, proto se tvrdí jen
// texty aplikace.
import { kontext, konec, tvrdi, OUT } from './k68-spolecne.mjs';

const BASE = process.env.SONDY_ZAKLAD ?? process.env.SONDY_BASE ?? 'http://localhost:3000';
const TEL = { width: 390, height: 844 };

// pohled → nadpis v němčině a v angličtině (malými písmeny; nadpisy jsou kapitálkami)
const POHLEDY = [
  ['attendance', 'zeiterfassung', 'attendance'],
  ['tasks', 'aufgaben', 'tasks'],
  ['planning', 'planung', 'planning'],
  ['events', 'veranstaltungen', 'events'],
  ['guides', 'anleitungen', 'guides'],
  ['procedures', 'abläufe', 'procedures'],
  ['suggestions', 'ideen', 'ideas'],
  ['rewards', 'belohnungen', 'rewards'],
  ['reports', 'kassenabschlüsse', 'closings'],
  ['finance', 'finanzen', 'finance'],
  ['inventory', 'lager', 'stock'],
  ['menu', 'karte', 'menu'],
  ['team-settings', 'team', 'team'],
];

async function otevri(jazyk, pohled, { tmavy = false } = {}) {
  const { ctx, p, chyby } = await kontext({ viewport: TEL, mobil: true, tmavy });
  await ctx.addCookies([{ name: 'managero-lang', value: jazyk, domain: 'localhost', path: '/' }]);
  await p.goto(`${BASE}/employer/overview?view=${pohled}`, { waitUntil: 'networkidle' });
  await p.locator('h1').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(900);
  return { ctx, p, chyby };
}

const preteka = (p) => p.evaluate(() => ({ doc: document.documentElement.scrollWidth, okno: window.innerWidth }));
/** Kontrast (přibližně, WCAG) první hlavičky proti nejbližšímu neprůhlednému pozadí. */
const kontrastH1 = (p) => p.evaluate(() => {
  const lum = (c) => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const rgb = (s) => (s.match(/[\d.]+/g) ?? []).map(Number);
  const el = document.querySelector('h1');
  if (!el) return 0;
  const fg = rgb(getComputedStyle(el).color);
  let n = el, bg = [255, 255, 255];
  while (n) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c[3] ?? 1) > 0.9) { bg = c; break; } n = n.parentElement; }
  const a = lum(fg), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
});

for (const [jazyk, sloupec] of [['de', 1], ['en', 2]]) {
  for (const pohled of POHLEDY) {
    const ocekavany = pohled[sloupec];
    const { ctx, p, chyby } = await otevri(jazyk, pohled[0]);
    const h1 = (await p.locator('h1').first().innerText()).toLowerCase();
    tvrdi(`${jazyk} ${pohled[0]}: nadpis je v jazyce (${ocekavany})`, h1.includes(ocekavany), h1);
    const pt = await preteka(p);
    tvrdi(`${jazyk} ${pohled[0]}: na 390 px bez vodorovného přetečení`, pt.doc <= pt.okno, JSON.stringify(pt));
    tvrdi(`${jazyk} ${pohled[0]}: bez chyby ve skriptu`, chyby.filter(x => !/Failed to load|net::ERR|TypeError: Failed to fetch/.test(x)).length === 0, chyby[0]);
    if (jazyk === 'de' && (pohled[0] === 'team-settings' || pohled[0] === 'procedures')) await p.screenshot({ path: `${OUT}k78-${pohled[0]}-de-390.png`, fullPage: false });
    await ctx.close();
  }
}

// hlavní akce Týmu a Postupů v němčině (překlad, ne čeština)
{
  const { ctx, p } = await otevri('de', 'team-settings');
  const t = (await p.locator('main').first().innerText()).replace(/\s+/g, ' ');
  tvrdi('de Tým: nabídka „Mitglied einladen“ a žádné „Pozvat člena“', /Mitglied einladen/.test(t) && !/Pozvat člena/.test(t), t.slice(0, 200));
  await ctx.close();
}
{
  const { ctx, p } = await otevri('de', 'procedures');
  const t = (await p.locator('main').first().innerText()).replace(/\s+/g, ' ');
  tvrdi('de Postupy: bez českých slov obalu (Nový postup, Navrhnout postup, Z jiného podniku)', !/Nový postup|Navrhnout postup|Z jiného podniku|Krok za krokem/.test(t), t.slice(0, 240));
  await ctx.close();
}
{
  const { ctx, p } = await otevri('en', 'guides');
  const t = (await p.locator('main').first().innerText()).replace(/\s+/g, ' ');
  tvrdi('en Návody: bez českých slov obalu (Nový návod, Hledat návody, Jak se co dělá)', !/Nový návod|Hledat návody|Jak se co dělá|Navrhnout návod/.test(t), t.slice(0, 240));
  await ctx.close();
}

// tmavý režim: nadpis čitelný i v němčině
for (const pohled of ['team-settings', 'attendance', 'inventory']) {
  const { ctx, p } = await otevri('de', pohled, { tmavy: true });
  const k = await kontrastH1(p);
  tvrdi(`de ${pohled}, tmavý režim: nadpis má kontrast ≥ 3`, k >= 3, String(k));
  const pt = await preteka(p);
  tvrdi(`de ${pohled}, tmavý režim: bez vodorovného přetečení`, pt.doc <= pt.okno, JSON.stringify(pt));
  await ctx.close();
}

await konec();
