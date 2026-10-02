// Ručně spouštěná sonda kola 74: úrovně podle útraty a slevové skupiny (Věrnost → Body a úrovně, Zákazníci).
// Není v ZELENE ve spust.mjs (je v MIMO): API se podvrhuje, sonda tvrdí, co UI zobrazí a pošle.
//
// Spuštění proti lokálnímu buildu:
//   SONDY_ZAKLAD=http://localhost:3411 SONDY_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node scripts/sondy/urovne.mjs
//
// Měří na 390 a 1280 px: žádný vodorovný scroll stránky; přepínač „Úrovně podle" přepíná jednotku prahů
// (měna z useSymbol, ne pevné Kč); uložení pošle tier_by a prahy; pole „Sleva v %" u skupiny pošle PATCH;
// seznam členů ukazuje slevu a u slevy ze skupiny i její název.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, DIR, OUT } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const CLIENT = (tab) => `/employer/overview?mode=client&tab=${tab}`;

const PROFIL = {
  ...nacti('client_admin_profile').profile,
  tier_by: 'visits', silver_spend: 5000, gold_spend: 15000, platinum_spend: 0,
};
const SKUPINY = [
  { id: 5, name: 'Štamgasti', members: 3, discount_pct: 15 },
  { id: 6, name: 'Firemní večery', members: 2, discount_pct: 0 },
];
const CLENOVE = [
  { id: 1, name: 'Anna Nováková', email: 'anna@example.cz', points: 120, stamps: 3, visits: 4, spend: 18000, joined_at: '2026-01-10T10:00:00Z', last_visit_at: '2026-09-28T10:00:00Z', reservations: 1, open_coupons: 0,
    level: 'gold', level_label: 'Zlatý host', discount: 10, discount_source: 'uroven', discount_name: 'Zlatý host' },
  { id: 2, name: 'Jan Svoboda s velmi dlouhým jménem pro kontrolu zalamování', email: 'jan@example.cz', points: 40, stamps: 1, visits: 2, spend: 900, joined_at: '2026-03-10T10:00:00Z', last_visit_at: null, reservations: 0, open_coupons: 1,
    level: 'bronze', level_label: 'Člen', discount: 15, discount_source: 'skupina', discount_name: 'Štamgasti' },
];

const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  stav.u ??= { puty: [], patche: [], loyalty: [] };
  if (path === '/api/client/admin/profile') {
    if (m === 'PUT') { const b = req.postDataJSON(); stav.u.puty.push(b); return json({ ok: true, profile: { ...PROFIL, ...b } }); }
    return json({ profile: PROFIL, boards: [], url: '' });
  }
  if (path === '/api/client/admin/groups') {
    if (m === 'PATCH') { stav.u.patche.push(req.postDataJSON()); return json({ ok: true }); }
    if (m === 'GET' && !url.searchParams.has('customerId')) return json({ groups: SKUPINY });
    if (m === 'GET') return json({ groups: SKUPINY, customerGroupIds: [] });
  }
  if (path === '/api/client/admin/loyalty' && m === 'POST') { const b = req.postDataJSON(); stav.u.loyalty.push(b); return json(b.what === 'spend_backfill' ? { ok: true, updated: 7 } : { ok: true, spend: 1000 }); }
  if (path === '/api/client/admin/customers') return json({ customers: CLENOVE, total: CLENOVE.length });
  return undefined;
};

const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function behy(viewport, mobil) {
  const jmeno = `${viewport.width}px`;
  const { ctx, p, stav, chyby } = await kontext({ viewport, mobil, fix: nacti('k69-b8-rozlozeni-vernost'), dalsi: podvrh });
  await otevri(p, CLIENT('loyalty'), 'vedeni.klient_vernost');
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Body a úrovně' }).click();
  await p.getByText('Úrovně hostů a jejich sleva').waitFor({ timeout: 8000 });

  // Výchozí režim: návštěvy, jako dřív.
  const rezim = p.getByRole('tablist', { name: 'Úrovně podle' });
  tvrdi(`${jmeno}: výchozí režim je „Návštěv“`, await rezim.getByRole('tab', { name: 'Návštěv' }).getAttribute('aria-selected') === 'true');
  tvrdi(`${jmeno}: v režimu návštěv je pole „Návštěv“`, await p.getByText('Návštěv', { exact: true }).count() >= 1);
  tvrdi(`${jmeno}: bez vodorovného scrollu (návštěvy)`, await bezPreteceni(p));

  // Přepnutí na útratu: pole prahů dostanou měnu, vysvětlení se změní, hodnoty prahů se zobrazí.
  await rezim.getByRole('tab', { name: 'Útraty' }).click();
  await p.getByText('Dopočítat útratu z historie').waitFor({ timeout: 4000 });
  const text = await p.locator('main, [data-plocha]').first().innerText();
  tvrdi(`${jmeno}: pole prahů ukazují měnu (Kč) místo návštěv`, /Útrata \(Kč\)/.test(text), text.slice(0, 200));
  tvrdi(`${jmeno}: prahy v režimu útraty nesou uložené hodnoty`, await p.locator('#t-silver').inputValue() === '5000' && await p.locator('#t-gold').inputValue() === '15000');
  tvrdi(`${jmeno}: vysvětlení říká, že přepnutí nic nemaže`, /nic nemaže/.test(text));
  tvrdi(`${jmeno}: bez vodorovného scrollu (útrata)`, await bezPreteceni(p));
  await p.screenshot({ path: `${OUT}urovne-${jmeno}-utrata.png`, fullPage: true });

  // Uložení pošle režim a prahy útraty (a prahy návštěv zůstávají v těle).
  await p.locator('#t-silver').fill('3000');
  await p.locator('form#vernost-body').evaluate(f => f.requestSubmit());
  await p.waitForTimeout(500);
  const put = stav.u.puty.at(-1);
  tvrdi(`${jmeno}: PUT nese tier_by = spend a silver_spend = 3000`, put?.tier_by === 'spend' && String(put?.silver_spend) === '3000', JSON.stringify(put));
  tvrdi(`${jmeno}: PUT nese i prahy návštěv (přepnutí nic nemaže)`, put?.silver_at !== undefined && put?.gold_at !== undefined, JSON.stringify(put));

  // Dopočtení.
  await p.getByRole('button', { name: 'Dopočítat útratu z historie' }).click();
  await p.waitForTimeout(400);
  tvrdi(`${jmeno}: dopočtení pošle spend_backfill`, stav.u.loyalty.some(b => b.what === 'spend_backfill'));

  // Skupiny: pole Sleva v %.
  const sleva = p.getByLabel('Sleva v % pro skupinu Firemní večery');
  await sleva.scrollIntoViewIfNeeded();
  tvrdi(`${jmeno}: u skupiny je pole „Sleva v %“ s uloženou hodnotou`, await p.getByLabel('Sleva v % pro skupinu Štamgasti').inputValue() === '15');
  await sleva.fill('20');
  await sleva.blur();
  await p.waitForTimeout(500);
  tvrdi(`${jmeno}: po opuštění pole jde PATCH se slevou 20`, stav.u.patche.some(b => b.id === 6 && b.discount_pct === 20), JSON.stringify(stav.u.patche));
  tvrdi(`${jmeno}: bez vodorovného scrollu (skupiny)`, await bezPreteceni(p));
  await p.screenshot({ path: `${OUT}urovne-${jmeno}-skupiny.png`, fullPage: true });

  // Zákazníci: sleva a její zdroj.
  await otevri(p, CLIENT('customers'), 'vedeni.klient_zakaznici');
  await p.getByText('Anna Nováková').waitFor({ timeout: 8000 });
  const clenove = await p.locator('main, [data-plocha]').first().innerText();
  tvrdi(`${jmeno}: člen se slevou z úrovně — „Sleva 10 %“ bez názvu skupiny`, /Sleva 10 %(?! \()/.test(clenove), clenove.slice(0, 300));
  tvrdi(`${jmeno}: člen se slevou ze skupiny — „Sleva 15 % (Štamgasti)“`, /Sleva 15 % \(Štamgasti\)/.test(clenove));
  tvrdi(`${jmeno}: seznam členů ukazuje útratu v měně (ne pevné Kč)`, /18\s?000/.test(clenove));
  tvrdi(`${jmeno}: seznam členů bez vodorovného scrollu`, await bezPreteceni(p));
  await p.screenshot({ path: `${OUT}urovne-${jmeno}-clenove.png`, fullPage: true });

  tvrdi(`${jmeno}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await behy({ width: 390, height: 844 }, true);
await behy({ width: 1280, height: 900 }, false);
await konec();
