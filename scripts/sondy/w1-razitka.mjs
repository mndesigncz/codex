// Ručně spouštěná sonda W1: razítkové kartičky ve Věrnosti (editor, filtr stavů, statistika)
// a ruční úprava razítek v okně člena. API se podvrhuje; sonda tvrdí, co je vidět a co UI posílá.
//
//   SONDY_ZAKLAD=http://localhost:3400 SONDY_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node scripts/sondy/w1-razitka.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, DIR, OUT } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const CLIENT = (tab) => `/employer/overview?mode=client&tab=${tab}`;
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

const KAMPANE = [
  { id: 1, team_id: 1, name: 'Desátá dýmka zdarma', description: '', conditions: '', active: true, status: 'active', valid_since: null, valid_till: null,
    required_stamps: 10, rule_type: 'visit', stamp_items: [], excluded_items: [], min_value: null, min_value_multiple: false, one_per_order: false,
    reward_title: 'Dýmka zdarma', reward_items: [], days_to_finish: 60, days_to_redeem: 0, repeat_mode: 'immediately', stack_cards: true, position: 1,
    max_completions: 0, daily_cap: 1, days_of_week: [1, 2, 3, 4, 5], hour_from: '08:00', hour_till: '11:00',
    stampItems: [], rewardItems: [], excludedItems: [], collectors: 12, openStamps: 40, completions: 5, rewardsIssued: 5, rewardsRedeemed: 3 },
  { id: 2, team_id: 1, name: 'Sezónní čaj', description: '', conditions: '', active: false, status: 'draft', valid_since: null, valid_till: null,
    required_stamps: 5, rule_type: 'min_value', stamp_items: [], excluded_items: [], min_value: 300, min_value_multiple: true, one_per_order: false,
    reward_title: 'Čaj', reward_items: [], days_to_finish: 0, days_to_redeem: 0, repeat_mode: 'immediately', stack_cards: true, position: 2,
    max_completions: 2, daily_cap: 0, days_of_week: [], hour_from: null, hour_till: null,
    stampItems: [], rewardItems: [], excludedItems: [], collectors: 0, openStamps: 0, completions: 0, rewardsIssued: 0, rewardsRedeemed: 0 },
  { id: 3, team_id: 1, name: 'Loňská akce', description: '', conditions: '', active: false, status: 'archived', valid_since: null, valid_till: null,
    required_stamps: 8, rule_type: 'visit', stamp_items: [], excluded_items: [], min_value: null, min_value_multiple: false, one_per_order: false,
    reward_title: 'Káva', reward_items: [], days_to_finish: 0, days_to_redeem: 0, repeat_mode: 'immediately', stack_cards: true, position: 3,
    max_completions: 0, daily_cap: 0, days_of_week: [], hour_from: null, hour_till: null,
    stampItems: [], rewardItems: [], excludedItems: [], collectors: 3, openStamps: 4, completions: 1, rewardsIssued: 1, rewardsRedeemed: 1 },
];

const STATISTIKA = {
  nazev: 'Desátá dýmka zdarma', potrebnych: 10, sbirajici: 12, otevrenaRazitka: 40, dokonceno: 5, razitekCelkem: 90,
  odmenVydano: 5, odmenUplatneno: 3, odmenCeka: 2, prumernaDobaDni: 21.5, dobaZVzorku: 5,
  top: [{ customerId: 101, jmeno: 'Jana Dvořáková', dokonceno: 2, razitek: 4 }],
  poDnech: Array.from({ length: 30 }, (_, i) => ({ den: `2026-09-${String(i + 1).padStart(2, '0')}`, razitek: i % 5, karet: i === 20 ? 1 : 0 })),
};

const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  stav.w1 ??= { stamps: [], akce: [], member: [] };
  const s = stav.w1;
  if (path === '/api/client/admin/stamps') {
    if (m === 'GET') return json({ campaigns: KAMPANE });
    s.stamps.push({ m, body: req.postDataJSON() }); return json({ ok: true, id: 9 });
  }
  if (path === '/api/client/admin/stamps/akce') { s.akce.push(req.postDataJSON()); return json({ ok: true, id: 10 }); }
  if (path === '/api/client/admin/stamps/stats') return json(STATISTIKA);
  // Přehled hosta v detailu člena (časová osa, úroveň, razítka) — bez něj by jamka pod řádkem neměla co ukázat.
  if (path === '/api/client/admin/loyalty' && m === 'GET') return json({ ledger: [], claims: [], vouchers: [], orders: [], kampane: [], uroven: { id: 'bronze', label: 'Člen', unit: 'visits', nextAt: 10, nextLabel: 'Stříbrný host' }, clen: { points: 100, stamps: 0, visits: 3, spend: 0, credit: 0, joined_at: '2026-01-10T10:00:00Z', last_visit_at: null } });
  if (path === '/api/client/admin/stamps/member') {
    if (m === 'GET') return json({
      karty: [{ campaignId: 1, nazev: 'Desátá dýmka zdarma', potrebnych: 10, razitek: 4, dokonceno: 1, stav: 'active',
        posledniUdalost: { id: 77, kind: 'earn', delta: 1, completions: 0, kdy: '2026-09-15T10:00:00Z', duvod: null } }],
      udalosti: [{ id: 77, campaign_id: 1, kampan: 'Desátá dýmka zdarma', kind: 'earn', delta: 1, completions: 0, reason: null, created_at: '2026-09-15T10:00:00Z', undone_at: null, obsluha: 'Eva' }],
    });
    s.member.push(req.postDataJSON()); return json({ ok: true, message: 'Desátá dýmka zdarma: +2 (6/10)' });
  }
  if (path === '/api/client/admin/profile' && m === 'GET') return json({ profile: { loyalty_on: true, points_per_100: 5, stamp_target: 0 }, boards: [], url: '' });
  if (path === '/api/client/admin/groups') return json({ groups: [], customerGroupIds: [] });
  if (path === '/api/menu' && m === 'GET') return json({ boards: [] });
  return undefined;
};

for (const [sirka, mobil] of [[1280, false], [390, true]]) {
  const jmeno = `${sirka}px`;
  const { ctx, p, stav, chyby } = await kontext({ viewport: { width: sirka, height: 900 }, mobil, fix: nacti('k69-b8-rozlozeni-vernost'), dalsi: (req, json, st) => {
    const r = podvrh(req, json, st);
    if (r !== undefined) return r;
    if (new URL(req.url()).pathname === '/api/rozlozeni') return undefined;
    return undefined;
  } });
  await otevri(p, CLIENT('loyalty'), 'vedeni.klient_vernost');
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Razítka' }).click();
  await p.getByText('Desátá dýmka zdarma').first().waitFor({ timeout: 8000 });

  // Seznam: filtr stavů, archiv skrytý, statistika odměn v řádku
  const text = await p.locator('[data-plocha]').innerText();
  tvrdi(`${jmeno} seznam: běžící a koncept jsou vidět, archiv ne`, text.includes('Desátá dýmka zdarma') && text.includes('Sezónní čaj') && !text.includes('Loňská akce'));
  tvrdi(`${jmeno} seznam: u konceptu je štítek „Koncept“`, text.includes('Koncept'));
  tvrdi(`${jmeno} seznam: uplatněné odměny „uplatněno 3 z 5“`, text.includes('uplatněno 3 z 5'));
  await p.getByRole('tab', { name: /^Archiv/ }).click();
  tvrdi(`${jmeno} filtr: Archiv ukáže archivovanou kartičku`, (await p.locator('[data-plocha]').innerText()).includes('Loňská akce'));
  await p.getByRole('tab', { name: /^Všechny/ }).click();
  tvrdi(`${jmeno} seznam: bez vodorovného přetečení`, await bezPreteceni(p));

  // Statistika v okně
  await p.getByRole('button', { name: 'Další akce s kartičkou Desátá dýmka zdarma' }).click();
  await p.getByRole('menuitem', { name: /Statistika/ }).click();
  await p.getByRole('dialog').getByText('Odměn uplatněno').waitFor({ timeout: 5000 });
  const okno = await p.getByRole('dialog').innerText();
  tvrdi(`${jmeno} statistika: uplatněno 3 z 5, doba 21,5 dní, top host`, okno.includes('3 z 5') && /21[,.]5/.test(okno) && okno.includes('Jana Dvořáková'), okno.slice(0, 300));
  tvrdi(`${jmeno} statistika: bez vodorovného přetečení`, await bezPreteceni(p));
  await p.screenshot({ path: `${OUT}w1-statistika-${jmeno}.png` });
  await p.getByRole('dialog').getByRole('button', { name: 'Zavřít' }).first().click();

  // Duplikace jde přes server
  await p.getByRole('button', { name: 'Další akce s kartičkou Desátá dýmka zdarma' }).click();
  await p.getByRole('menuitem', { name: /Duplikovat/ }).click();
  await p.waitForTimeout(300);
  tvrdi(`${jmeno} duplikace: POST akce duplicate`, stav.w1.akce.some(a => a.action === 'duplicate' && a.id === 1), JSON.stringify(stav.w1.akce));

  // Editor (jeden sjednocený KampanEditor): nová pole, validace, náhled
  await p.getByRole('button', { name: 'Nová kartička' }).click();
  await p.getByText('Kdy platí', { exact: true }).waitFor();
  const ed = await p.locator('[data-plocha]').innerText();
  tvrdi(`${jmeno} editor: dny, hodiny, limity a náhled pro hosta`, ['Kdy platí', 'Karet na hosta', 'Razítek za den', 'Uložit jako koncept', 'Náhled pohledem hosta'].every(t => ed.toLowerCase().includes(t.toLowerCase())));
  const uloz = p.getByRole('button', { name: 'Založit a spustit' });
  tvrdi(`${jmeno} editor: bez názvu je vidět důvod a tlačítko je zakázané`, await uloz.isDisabled() && ed.includes('Zadej název kampaně.'));
  await p.getByLabel('Název', { exact: true }).fill('Test kartička');
  await p.getByLabel('Hodiny od').fill('08:00');
  tvrdi(`${jmeno} editor: jen jedna hodina → varování a zakázané ukládání`, await uloz.isDisabled() && (await p.locator('[data-plocha]').innerText()).includes('obě'));
  await p.getByLabel('Hodiny do').fill('11:00');
  await p.getByRole('button', { name: 'Pá', exact: true }).click();
  tvrdi(`${jmeno} editor: po opravě jde uložit`, await uloz.isEnabled());
  tvrdi(`${jmeno} editor: náhled ukazuje okno „pá, 08:00–11:00“`, (await p.locator('[data-plocha]').innerText()).includes('pá, 08:00–11:00'));
  tvrdi(`${jmeno} editor: bez vodorovného přetečení`, await bezPreteceni(p));
  await p.screenshot({ path: `${OUT}w1-editor-${jmeno}.png`, fullPage: true });
  await p.getByLabel('Razítek za den').fill('2');
  await uloz.click();
  await p.waitForTimeout(400);
  const post = stav.w1.stamps.at(-1);
  tvrdi(`${jmeno} editor: POST nese nová pole`, post?.m === 'POST' && post.body.dailyCap === 2 && post.body.hourFrom === '08:00' && post.body.hourTill === '11:00' && post.body.daysOfWeek?.join() === '5' && post.body.status === 'active', JSON.stringify(post));
  tvrdi(`${jmeno}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// Okno člena: ruční úprava s povinným důvodem a storno
{
  const { ctx, p, stav, chyby } = await kontext({ fix: nacti('k69-b8-rozlozeni-zakaznici'), dalsi: podvrh });
  await otevri(p, CLIENT('customers'), 'vedeni.klient_zakaznici');
  await p.getByRole('button', { name: 'Deník' }).first().click();
  await p.getByRole('button', { name: 'Upravit razítka: Desátá dýmka zdarma' }).waitFor({ timeout: 8000 });
  tvrdi('člen: vidět rozdělanou kartu 4 / 10', (await p.locator('[data-plocha]').innerText()).includes('Desátá dýmka zdarma'));
  await p.getByRole('button', { name: 'Upravit razítka: Desátá dýmka zdarma' }).click();
  const dlg = p.getByRole('dialog');
  const pridat = dlg.getByRole('button', { name: 'Připsat', exact: true }).last();
  tvrdi('člen: bez důvodu je tlačítko zakázané', await pridat.isDisabled());
  await dlg.getByLabel('Kolik razítek').fill('2');
  await dlg.getByLabel('Proč').fill('Chybělo na účtence');
  tvrdi('člen: s důvodem jde připsat', await pridat.isEnabled());
  await pridat.click();
  await p.waitForTimeout(400);
  const b = stav.w1.member.at(-1);
  tvrdi('člen: POST delta +2, důvod a kartička', b && b.delta === 2 && b.reason === 'Chybělo na účtence' && b.campaignId === 1, JSON.stringify(b));
  await p.getByRole('button', { name: 'Stornovat poslední akci: Desátá dýmka zdarma' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Stornovat', exact: true }).click();
  await p.waitForTimeout(400);
  const u = stav.w1.member.at(-1);
  tvrdi('člen: storno posílá action undo a očekávanou událost', u && u.action === 'undo' && u.eventId === 77, JSON.stringify(u));
  tvrdi('člen: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await konec();
