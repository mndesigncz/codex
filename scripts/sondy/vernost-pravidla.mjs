// Ručně spouštěná sonda kola 80 (okruh B): rozšířená pravidla bodů, náhled, koncept, verze a přehledy.
// Není v ZELENE ve spust.mjs (je v MIMO): API se podvrhuje, sonda tvrdí, co UI zobrazí a pošle.
//
// Spuštění proti lokálnímu buildu:
//   SONDY_ZAKLAD=http://localhost:3411 SONDY_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node scripts/sondy/vernost-pravidla.mjs
//
// Měří na 390 a 1280 px: žádný vodorovný scroll; uložení konceptu pošle action save s čísly;
// náhled ukáže stropy a zaokrouhlení hned (platná pravidla vedle konceptu); „Použít" ukáže
// změny před → po a pošle publish; chybná hodnota (strop za den pod stropem na účtenku) ukáže
// větu a zablokuje uložení; přehledy mají top hosty, zdroje bodů a export CSV.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, DIR, OUT } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const CLIENT = (tab) => `/employer/overview?mode=client&tab=${tab}`;

const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  stav.v ??= { stav: structuredClone(nacti('client_admin_loyalty_pravidla')), put: [] };
  const s = stav.v.stav;
  if (path === '/api/client/admin/loyalty/pravidla') {
    if (m === 'PUT') {
      const b = req.postDataJSON();
      stav.v.put.push(b);
      // Server vrací čísla jako čísla (formulář posílá texty s čárkou).
      const cisla = Object.fromEntries(Object.entries(b).filter(([k]) => /^(points_(min|cap)|mult_|tier_|credit_|welcome_)/.test(k)).map(([k, v]) => [k, Number(String(v).replace(',', '.'))]));
      if (b.action === 'save') s.koncept = { ...s.platna, ...b, ...cisla };
      if (b.action === 'publish') {
        const novy = { ...s.platna, ...(s.koncept ?? {}), ...b, ...cisla };
        delete novy.action; delete novy.note;
        s.verzeSeznam.unshift({ id: 9, version: s.verze, created_at: '2026-10-02T09:00:00Z', changed_by: 1, changed_by_name: 'Marie Nováková', source: 'koncept', note: b.note || null,
          changes: [{ key: 'points_cap_bill', label: 'Strop bodů na účtenku', before: 'vypnuto', after: String(novy.points_cap_bill) }] });
        s.platna = novy; s.koncept = null; s.verze += 1;
      }
      if (b.action === 'discard') s.koncept = null;
      return json({ ok: true, ...s });
    }
    return json(s);
  }
  return undefined;
};

async function behy(viewport, mobil) {
  const jmeno = `${viewport.width}px`;
  const { ctx, p, stav, chyby } = await kontext({ viewport, mobil, fix: nacti('k69-b8-rozlozeni-vernost'), dalsi: podvrh });
  await otevri(p, CLIENT('loyalty'), 'vedeni.klient_vernost');

  // Přehledy v záložce Přehled.
  await p.getByText('Odkud se berou body').waitFor({ timeout: 8000 });
  const prehled = await p.locator('main, [data-plocha]').first().innerText();
  tvrdi(`${jmeno}: přehled ukazuje top hosty a zdroje bodů`, /Anna Nováková/.test(prehled) && /Z účtenky z pokladny/.test(prehled), prehled.slice(0, 200));
  tvrdi(`${jmeno}: přehled ukazuje závazek a výnosnost`, /kredit hostů/i.test(prehled) && /útrata členů/i.test(prehled));
  tvrdi(`${jmeno}: export deníku má pole od a do`, await p.locator('#pv-od').count() === 1 && await p.locator('#pv-do').count() === 1);
  tvrdi(`${jmeno}: bez vodorovného scrollu (přehledy)`, await bezPreteceni(p));
  await p.screenshot({ path: `${OUT}vernost-pravidla-${jmeno}-prehledy.png`, fullPage: true });

  // Pravidla.
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Body a úrovně' }).click();
  await p.getByText('Z jaké částky se body počítají').waitFor({ timeout: 8000 });
  tvrdi(`${jmeno}: výchozí zaokrouhlení je „Celé stovky“`, await p.getByRole('tablist', { name: 'Zaokrouhlení bodů' }).getByRole('tab', { name: 'Celé stovky', exact: true }).getAttribute('aria-selected') === 'true');
  tvrdi(`${jmeno}: tlačítka konceptu jsou bez změn zakázaná`, await p.getByRole('button', { name: 'Uložit koncept' }).isDisabled());

  // Náhled: 450 Kč při 5 bodech za 100 = 20 bodů; po stropu 10 bodů v konceptu.
  const nahled = () => p.locator('#pr-nahled').locator('xpath=ancestor::section[1]').innerText();
  tvrdi(`${jmeno}: náhled počítá 450 Kč při 10 bodech za 100 jako 40 bodů`, /40 bodů/.test(await nahled()), (await nahled()).slice(150, 700));
  await p.locator('#pr-cap-bill').fill('10');
  await p.waitForTimeout(150);
  const po = await nahled();
  tvrdi(`${jmeno}: s tím, jak zadáš strop 10, náhled ukáže koncept s 10 body a zmínkou stropu`, /koncept/i.test(po) && /10 bodů/.test(po) && /strop 10 bodů na účtenku/.test(po), po.slice(150, 800));
  tvrdi(`${jmeno}: tlačítka konceptu se odemkla`, await p.getByRole('button', { name: 'Uložit koncept' }).isEnabled());

  // Chybná kombinace: strop za den pod stropem na účtenku.
  await p.locator('#pr-cap-day').fill('5');
  await p.waitForTimeout(150);
  tvrdi(`${jmeno}: strop za den pod stropem na účtenku ukáže chybu`, await p.getByRole('alert').filter({ hasText: 'Strop za den nesmí být menší' }).count() === 1);
  tvrdi(`${jmeno}: s chybou nejde uložit ani použít`, await p.getByRole('button', { name: 'Uložit koncept' }).isDisabled() && await p.getByRole('button', { name: 'Použít pravidla…' }).isDisabled());
  await p.locator('#pr-cap-day').fill('0');

  // Násobič s čárkou a uložení konceptu klávesou Enter.
  await p.locator('#pr-mult_gold').fill('1,5');
  await p.locator('#pr-mult_silver').fill('1,2');
  await p.locator('#pr-cap-bill').press('Enter');
  await p.waitForTimeout(500);
  const save = stav.v.put.find(b => b.action === 'save');
  tvrdi(`${jmeno}: Enter v poli uloží koncept (PUT save)`, !!save, JSON.stringify(stav.v.put));
  tvrdi(`${jmeno}: koncept nese strop 10 a násobič 1,5`, String(save?.points_cap_bill) === '10' && String(save?.mult_gold) === '1,5', JSON.stringify(save));
  await p.getByText('Máš rozpracovaný koncept').waitFor({ timeout: 4000 });
  tvrdi(`${jmeno}: po uložení je vidět rozpracovaný koncept a „Zahodit koncept“`, await p.getByRole('button', { name: 'Zahodit koncept' }).count() === 1);

  // Použít: okno se změnami před → po.
  await p.getByRole('button', { name: 'Použít pravidla…' }).click();
  const okno = p.getByRole('dialog');
  await okno.waitFor({ timeout: 4000 });
  const textOkna = await okno.innerText();
  tvrdi(`${jmeno}: okno ukazuje rozdíl před → po`, /Strop bodů na účtenku: vypnuto → 10/.test(textOkna) && /Násobič Zlato: 1× → 1,5×/.test(textOkna), textOkna.slice(0, 300));
  tvrdi(`${jmeno}: okno říká, že už připsané se nepřepočítává`, /nepřepočítávají/.test(textOkna));
  tvrdi(`${jmeno}: okno bez vodorovného scrollu`, await bezPreteceni(p));
  await okno.getByLabel('Poznámka k verzi').fill('Test poznámka');
  await okno.getByRole('button', { name: 'Použít', exact: true }).click();
  await p.waitForTimeout(600);
  const pub = stav.v.put.find(b => b.action === 'publish');
  tvrdi(`${jmeno}: Použít pošle publish s poznámkou`, pub?.note === 'Test poznámka', JSON.stringify(pub));
  await p.getByText('Verze 3').waitFor({ timeout: 4000 });
  tvrdi(`${jmeno}: v seznamu verzí je nová verze se změnou`, /Strop bodů na účtenku: vypnuto → 10/.test(await p.locator('#pr-verze').locator('xpath=ancestor::section[1]').innerText()));
  tvrdi(`${jmeno}: bez vodorovného scrollu (pravidla)`, await bezPreteceni(p));
  await p.screenshot({ path: `${OUT}vernost-pravidla-${jmeno}-pravidla.png`, fullPage: true });

  tvrdi(`${jmeno}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await behy({ width: 390, height: 844 }, true);
await behy({ width: 1280, height: 900 }, false);
await konec();
