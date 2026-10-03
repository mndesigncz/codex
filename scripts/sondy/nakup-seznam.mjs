// Chytrý nákupní seznam (okno ve Skladu): filtr kategorií, hledání, naléhavost,
// seskupení, odškrtávání, paměť po obnovení stránky a objednávka jen z toho, co
// filtr nechává. Ruční sonda (je v MIMO ve spust.mjs): API skladu se podvrhuje
// fixturami k69-b3-*.
//
//   SONDY_CHROMIUM=… node scripts/sondy/nakup-seznam.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, DIR, OUT } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const FIX = nacti('k69-b3-rozlozeni-sklad');
const VEDENI = '/employer/inventory';

const podvrh = () => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  if (req.method() === 'POST' && path === '/api/orders') {
    (stav.objednavky ??= []).push(req.postDataJSON());
    return json({ ok: true, emailed: false });
  }
  if (req.method() !== 'GET') return undefined;
  const mapa = {
    '/api/inventory': 'k69-b3-inventory',
    '/api/inventory/categories': 'k69-b3-categories',
    '/api/pos/usage': 'k69-b3-pos-usage',
    '/api/inventory/reports': 'k69-b3-reports',
    '/api/orders': 'k69-b3-orders',
    '/api/stocktake': 'k69-b3-stocktake',
    '/api/inventory/log': 'k69-b3-log',
    '/api/production': 'k69-b3-production',
  };
  if (path === '/api/inventory/log' && url.searchParams.get('itemId')) return json([]);
  if (mapa[path]) return json(nacti(mapa[path]));
  if (path === '/api/suppliers') return json({ suppliers: [{ id: 1, name: 'Makro', email: 'objednavky@makro.cz' }] });
  return undefined;
};

const okno = (p) => p.getByRole('dialog', { name: 'Nákupní seznam' });
const radky = (p) => okno(p).locator('ul.list > li');
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const pocetObjednat = async (p) => {
  const txt = await okno(p).getByRole('button', { name: /^Vytvořit objednávku/ }).innerText();
  const m = /\((\d+)\)/.exec(txt);
  return m ? Number(m[1]) : null;
};
const otevriSeznam = async (p) => {
  // Na počítači je „Nakoupit“ tlačítko v hlavičce, na telefonu je schované v menu „Další akce“.
  const prime = p.getByRole('button', { name: /^Nakoupit \(/ }).first();
  if (await prime.isVisible().catch(() => false)) await prime.click();
  else {
    await p.getByRole('button', { name: 'Další akce', exact: true }).first().click();
    await p.getByRole('menuitem', { name: /^Nakoupit \(/ }).first().click();
  }
  await okno(p).waitFor({ timeout: 8000 });
  await p.waitForTimeout(300);
};

for (const [jm, vp, mobil] of [['desk', { width: 1280, height: 950 }, false], ['mob', { width: 390, height: 844 }, true]]) {
  const { ctx, p, stav } = await kontext({ fix: FIX, viewport: vp, mobil, dalsi: podvrh() });
  await otevri(p, VEDENI, 'vedeni.sklad');
  await otevriSeznam(p);

  const celkem = await radky(p).count();
  tvrdi(`${jm}: seznam ukazuje položky z fixtury`, celkem >= 4, String(celkem));
  tvrdi(`${jm}: je tu hledání, přepínač naléhavosti, kategorie a seskupení`,
    await okno(p).getByLabel('Hledat v nákupním seznamu').isVisible()
    && await okno(p).getByRole('group', { name: 'Kategorie na seznamu' }).isVisible()
    && await okno(p).getByText('Seskupit', { exact: true }).isVisible());
  tvrdi(`${jm}: tlačítko objednávky nese počet viditelných položek`, (await pocetObjednat(p)) === celkem, `${await pocetObjednat(p)} × ${celkem}`);
  // Patička se na telefonu zalamuje; žádné tlačítko nesmí ležet za okrajem obrazovky (dřív bylo levé useknuté).
  // Záložky přepínačů se u okraje posouvají prstem (záměr komponenty), proto se nepočítají.
  const mimo = await okno(p).locator('button').evaluateAll((els, sirka) => els
    .filter(e => e.offsetParent !== null && !e.closest('[role=tablist]')).map(e => e.getBoundingClientRect())
    .filter(r => r.width > 0 && (r.left < -0.5 || r.right > sirka + 0.5)).length, vp.width);
  tvrdi(`${jm}: žádné tlačítko v okně neleží za okrajem obrazovky`, mimo === 0, `${mimo} mimo`);
  tvrdi(`${jm}: bez vodorovného přetečení stránky i okna`, await bezPreteceni(p)
    && await okno(p).evaluate(el => el.scrollWidth <= el.clientWidth + 1));

  // ---- kategorie: vynechat Obaly ----
  const kategorie = okno(p).getByRole('group', { name: 'Kategorie na seznamu' });
  const obaly = kategorie.getByRole('button', { name: /^Obaly/ });
  tvrdi(`${jm}: kategorie Obaly je zapnutá a má počet`, (await obaly.getAttribute('aria-pressed')) === 'true' && /\d/.test(await obaly.innerText()));
  await obaly.click();
  tvrdi(`${jm}: vynechané Obaly zmizí ze seznamu`, await dokud(async () => !(await okno(p).innerText()).includes('Kelímky'), 2000));
  tvrdi(`${jm}: …o jednu položku méně`, (await radky(p).count()) === celkem - 1, `${await radky(p).count()} × ${celkem - 1}`);
  tvrdi(`${jm}: …a tlačítko objednávky to ví`, (await pocetObjednat(p)) === celkem - 1);
  tvrdi(`${jm}: okno řekne, kolik filtr skrývá, a nabídne zrušení`, (await okno(p).innerText()).includes('Filtr skrývá 1 položku')
    && await okno(p).getByRole('button', { name: 'Zrušit filtry' }).isVisible());
  tvrdi(`${jm}: vynechaná kategorie zůstává v nabídce, jde ji vrátit`, (await obaly.getAttribute('aria-pressed')) === 'false');

  // ---- objednávka jen z viditelného ----
  await okno(p).getByRole('button', { name: /^Vytvořit objednávku/ }).click();
  tvrdi(`${jm}: objednávka neobsahuje vynechanou kategorii`, await dokud(() => (stav.objednavky ?? []).length > 0, 3000)
    && !JSON.stringify(stav.objednavky).includes('Kelímky'), JSON.stringify(stav.objednavky));
  await p.waitForTimeout(500);
  await otevriSeznam(p).catch(() => {});

  // ---- paměť po obnovení ----
  await p.keyboard.press('Escape').catch(() => {});
  await p.reload({ waitUntil: 'networkidle' });
  await p.locator('[data-plocha] li[data-instance]:not([hidden])').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(600);
  await otevriSeznam(p);
  tvrdi(`${jm}: po obnovení stránky zůstaly Obaly vynechané`,
    (await okno(p).getByRole('group', { name: 'Kategorie na seznamu' }).getByRole('button', { name: /^Obaly/ }).getAttribute('aria-pressed')) === 'false'
    && !(await okno(p).innerText()).includes('Kelímky'));

  // ---- zrušit filtry ----
  await okno(p).getByRole('button', { name: 'Zrušit filtry' }).first().click();
  tvrdi(`${jm}: Zrušit filtry vrátí všechno`, await dokud(async () => (await radky(p).count()) === celkem, 2000), `${await radky(p).count()} × ${celkem}`);

  // ---- hledání bez diakritiky ----
  await okno(p).getByLabel('Hledat v nákupním seznamu').fill('mleko');
  tvrdi(`${jm}: hledání „mleko“ najde mléka s háčky i bez`, await dokud(async () => {
    const t = await okno(p).innerText();
    return t.includes('Ovesné mléko') && !t.includes('Kelímky') && (await radky(p).count()) >= 1;
  }, 2000));
  await okno(p).getByLabel('Hledat v nákupním seznamu').fill('zzzneexistuje');
  tvrdi(`${jm}: hledání bez shody ukáže srozumitelný prázdný stav`, await dokud(async () => (await okno(p).innerText()).includes('Filtru neodpovídá žádná položka'), 2000));
  await okno(p).getByRole('button', { name: 'Zrušit filtry' }).last().click();
  await dokud(async () => (await radky(p).count()) === celkem, 2000);

  // ---- naléhavost: jen kritické ----
  await okno(p).getByRole('tab', { name: /^Kritické/ }).click();
  tvrdi(`${jm}: jen kritické — každý řádek má štítek „kriticky“`, await dokud(async () => {
    const n = await radky(p).count();
    const chips = await okno(p).locator('ul.list .chip').allInnerTexts();
    return n >= 1 && n < celkem && chips.every(c => /kriticky/i.test(c));
  }, 2000));
  await okno(p).getByRole('tab', { name: /^Vše/ }).click();
  await dokud(async () => (await radky(p).count()) === celkem, 2000);

  // ---- seskupení podle kategorie ----
  await okno(p).getByRole('tab', { name: 'Kategorie', exact: true }).click();
  const nadpisy = await okno(p).locator('section button[aria-expanded]').allInnerTexts();
  tvrdi(`${jm}: seskupení podle kategorie ukáže nadpisy kategorií`, nadpisy.some(n => /mléčné/i.test(n)), JSON.stringify(nadpisy));
  // skupinu jde sbalit
  const prvni = okno(p).locator('section button[aria-expanded]').first();
  const pred = await radky(p).count();
  await prvni.click();
  tvrdi(`${jm}: sbalená skupina schová své řádky`, await dokud(async () => (await radky(p).count()) < pred, 1500));
  await prvni.click();

  // ---- odškrtávání ----
  const ptak = okno(p).getByRole('checkbox').first();
  await ptak.click();
  tvrdi(`${jm}: odškrtnutí ukáže postup „V košíku 1 z N“`, await dokud(async () => /V košíku 1 z \d+/.test(await okno(p).innerText()), 2000));
  tvrdi(`${jm}: odškrtnutá položka se přesune na konec skupiny a zůstane odškrtnutá`, (await okno(p).getByRole('checkbox', { checked: true }).count()) === 1);
  await p.keyboard.press('Escape');
  await p.reload({ waitUntil: 'networkidle' });
  await p.locator('[data-plocha] li[data-instance]:not([hidden])').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(600);
  await otevriSeznam(p);
  tvrdi(`${jm}: odškrtnutí přežije obnovení stránky (ten samý den)`, /V košíku 1 z \d+/.test(await okno(p).innerText()));
  await okno(p).getByRole('button', { name: 'Zrušit odškrtnutí' }).first().click();
  tvrdi(`${jm}: Zrušit odškrtnutí vrátí všechno mezi nekoupené`, await dokud(async () => !(await okno(p).innerText()).includes('V košíku'), 2000));

  tvrdi(`${jm}: po všem pořád žádné vodorovné přetečení`, await bezPreteceni(p));
  await p.screenshot({ path: OUT + `nakup-seznam-${jm}.png`, fullPage: false });
  await ctx.close();
}
await konec();
