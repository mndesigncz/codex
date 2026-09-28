// Rozvrh — generátor: povinná otevírací směna, žádoucí druhá a volitelné
// doporučení počtu lidí podle tržeb.
//
// Martin: „hlavní je, aby byla pokrytá směna, která otvírá — bez ní se
// prostor neotevře. Druhá je, když je kdo. Doporučení podle tržby chci, ale
// ne defaultně: ať si to člověk zapne v nastavení generování, a když to
// nechce, ať to tam zbytečně není."
//
// Sonda hlídá:
//  G1 Pravidla: přepínač „Počet lidí podle tržeb" je ve výchozím stavu
//     vypnutý a práh schovaný; zapnutí ukáže práh předvyplněný návrhem
//     z dat a průměry dnů; uložení pošle trzby { podleTrzeb, prah } v PUT.
//  G2 Náhled: povinná díra (nikdo neotevře) výrazně — blok nahoře, den
//     plně červený; žádoucí (chybí druhý) mírně; okno dne to rozliší.
//  G3 Doporučení jen se zapnutou funkcí: souhrn v náhledu a řádek v okně dne;
//     bez `trzby` v odpovědi se o tržbách neukáže nic.
//
// Fixtury: rozvrh-generator-generate (návrh s dírami a doporučením),
// rozvrh-generator-rules (pravidla s průměry tržeb), zbytek z k69-b1.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, mine, ROLE, DIR, OUT } from './k68-spolecne.mjs';

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const MESIC = praha(0).slice(0, 7);
const PRISTI = (() => { const [y, m] = MESIC.split('-').map(Number); const d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
const nacti = (jmeno, mesic = PRISTI) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8')
  .replaceAll('PRISTI', PRISTI).replaceAll('"@-', `"${mesic}-`));

// Otevřeno každý den 08–22, ať okno dne počítá pokrytí stejně jako generátor.
const OTEVRENO = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [String(d), { open: '08:00', close: '22:00', closed: false }]));

const podvrh = ({ bezTrzeb = false, pravidla = null } = {}) => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const q = url.searchParams;
  if (req.method() !== 'GET') {
    const body = req.postData() || '';
    if (path.startsWith('/api/schedule')) (stav.zapisy ??= []).push({ m: req.method(), path, body });
    if (path === '/api/schedule/generate') {
      if (JSON.parse(body || '{}').commit) return json({ ok: true, inserted: 2 });
      const g = nacti('rozvrh-generator-generate');
      // Funkce vypnutá = server o tržbách mlčí úplně (žádné doporuceni ani trzby).
      if (bezTrzeb) { delete g.doporuceni; delete g.trzby; }
      return json(g);
    }
    if (path === '/api/schedule/rules') return json({ ok: true });
    return undefined;
  }
  if (path === '/api/schedule') return json({ ...nacti('k69-b1-schedule', q.get('month') ?? PRISTI), shifts: [], gaps: [], understaffed: [] });
  if (path === '/api/schedule/rules') return json(pravidla ?? nacti('rozvrh-generator-rules'));
  if (path === '/api/opening-hours') return json({ openingHours: OTEVRENO });
  if (path === '/api/availability') return json(q.get('mine') ? null : { submissions: [] });
  if (path === '/api/timeoff') return json({ requests: [] });
  if (path === '/api/shifts/offers') return json([]);
  if (path === '/api/fixed-assignments') return json({ assignments: [] });
  if (path === '/api/events') return json({ events: [] });
  return undefined;
};

const FIX = { ...nacti('k69-b1-rozlozeni-rozvrh'), polozky: [{ id: 'nastroj', widget: 'nastroj', velikost: 'L' }] };
const ROZVRH = '/employer/overview?view=shifts';
const nazevDne = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' }); };
const bunka = (p, d) => p.locator(`[data-plocha] button[aria-label^="${nazevDne(d)}:"]`);
const okno = (p) => p.getByRole('dialog');

async function vygeneruj(p) {
  await p.getByRole('button', { name: 'Vygenerovat rozvrh' }).click();
  return dokud(() => p.getByText('Navržený rozvrh').isVisible(), 4000);
}
async function otevriDen(p, d) {
  await bunka(p, d).click();
  return dokud(() => okno(p).getByText('Přiřazené směny').isVisible(), 3000);
}
async function zavriOkno(p) {
  await okno(p).getByRole('button', { name: 'Zavřít' }).first().click();
  await dokud(async () => !(await okno(p).isVisible()), 2000);
}

// G1) Pravidla: výchozí vypnuto, zapnutí ukáže práh z dat, uložení ho pošle.
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await p.getByRole('tab', { name: 'Pravidla' }).click();
  const prepinac = p.getByRole('switch', { name: 'Počet lidí podle tržeb' });
  tvrdi('G1: přepínač „Počet lidí podle tržeb" v Pravidlech je', await dokud(() => prepinac.isVisible(), 4000));
  tvrdi('G1: ve výchozím stavu vypnutý', (await prepinac.getAttribute('aria-checked')) === 'false');
  tvrdi('G1: vypnutý = práh ani průměry tržeb nejsou vidět', await p.locator('[data-trzby-nastaveni]').count() === 0
    && await p.getByText('Průměrná tržba podle dne v týdnu').count() === 0);
  await prepinac.click();
  const pole = p.locator('#pravidla-prah');
  tvrdi('G1: zapnutí ukáže práh', await dokud(() => pole.isVisible(), 1500));
  tvrdi('G1: práh předvyplněný návrhem z dat (14000)', (await pole.inputValue()) === '14000', await pole.inputValue());
  tvrdi('G1: průměry dnů s 1 vs 2 lidmi (pondělí 1, sobota 2)',
    (await p.locator('[data-trzby-nastaveni] li.list-row').filter({ hasText: 'Pondělí' }).innerText()).includes('1 člověk')
    && (await p.locator('[data-trzby-nastaveni] li.list-row').filter({ hasText: 'Sobota' }).innerText()).includes('2 lidé'));
  tvrdi('G1: zapnutí bez psaní neukáže chybu prahu (chyba až po pokusu/opuštění pole)', await p.getByText('Zadej kladné číslo.').count() === 0);
  tvrdi('G1: neuložená změna rozsvítí „Uložit pravidla" limetkou a řekne to', await p.locator('[data-neulozeno]').isVisible()
    && await p.getByRole('button', { name: 'Uložit pravidla' }).evaluate(el => el.classList.contains('on-accent')));
  await pole.fill('12500');
  await p.screenshot({ path: OUT + 'rozvrh-generator-pravidla.png', fullPage: true });
  await p.getByRole('button', { name: 'Uložit pravidla' }).click();
  const put = await dokud(() => (stav.zapisy ?? []).find(z => z.path === '/api/schedule/rules' && z.m === 'PUT'), 3000);
  const telo = put ? JSON.parse(put.body) : {};
  tvrdi('G1: PUT pravidel nese trzby { podleTrzeb: true, prah: 12500 }', telo.trzby?.podleTrzeb === true && telo.trzby?.prah === 12500, put?.body);
  tvrdi('G1: po uložení „Uložit pravidla" už limetkou nesvítí', await dokud(async () => await p.locator('[data-neulozeno]').count() === 0, 2000));
  tvrdi('G1: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// G4) Role bez finance.trzby: práh ani jeho hodnota se neukážou, přepínač je
// vidět, ale nejde přepnout, a uložení jiného pravidla tržby nepošle.
{
  const opravneni = ROLE.ja.opravneni.filter(k => k !== 'finance.trzby');
  const pravidla = { ...nacti('rozvrh-generator-rules'), trzby: { podleTrzeb: true, prah: null, prahNastaven: true, smiTrzby: false } };
  const { ctx, p, stav } = await kontext({ fix: FIX, dalsi: podvrh({ pravidla }),
    mineData: mine(opravneni, { klic: 'vedeni', roleId: null, nazev: 'Vedoucí směny', typ: 'vedeni', jeVlastnik: false }) });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await p.getByRole('tab', { name: 'Pravidla' }).click();
  const prepinac = p.getByRole('switch', { name: 'Počet lidí podle tržeb' });
  await dokud(() => prepinac.isVisible(), 4000);
  tvrdi('G4: bez finance.trzby je přepínač vidět zapnutý, ale zakázaný (aria-disabled)', (await prepinac.getAttribute('aria-checked')) === 'true' && (await prepinac.getAttribute('aria-disabled')) === 'true');
  tvrdi('G4: …pole prahu ani jeho hodnota nejsou, jen „Práh tržby je nastavený"', await p.locator('#pravidla-prah').count() === 0
    && await p.getByText('Práh tržby je nastavený.').isVisible());
  await p.locator('#pravidla-tym-dny').selectOption('4');
  await p.getByRole('button', { name: 'Uložit pravidla' }).click();
  const put = await dokud(() => (stav.zapisy ?? []).find(z => z.path === '/api/schedule/rules' && z.m === 'PUT'), 3000);
  tvrdi('G4: uložení jiného pravidla tržby nepošle (práh se nepřepíše)', !!put && !('trzby' in JSON.parse(put.body)), put?.body);
  await ctx.close();
}

// G2 + G3) Náhled s dírami obou úrovní a s doporučením podle tržeb.
{
  const { ctx, p, chyby } = await kontext({ fix: FIX, dalsi: podvrh() });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  tvrdi('G2: Vygenerovat ukáže návrh', await vygeneruj(p));
  const blok = p.locator('[data-povinne-diry]');
  tvrdi('G2: povinná díra má výrazný blok „Nikdo neotevře" nahoře v náhledu', await blok.isVisible() && (await blok.innerText()).includes('Nikdo neotevře'));
  tvrdi('G2: …v tónu nebezpečí (note-danger)', await blok.evaluate(el => el.classList.contains('note-danger')));
  tvrdi('G2: žádoucí díra jen mírným řádkem', await p.locator('[data-zadouci-diry]').isVisible()
    && await p.locator('[data-zadouci-diry]').evaluate(el => !el.classList.contains('note-danger')));
  tvrdi('G2: den bez otevírací směny v mřížce jako povinná díra', (await bunka(p, `${PRISTI}-06`).getAttribute('data-dira')) === 'povinna');
  tvrdi('G2: den bez druhého člověka jako žádoucí', (await bunka(p, `${PRISTI}-07`).getAttribute('data-dira')) === 'zadouci');
  const tony = await Promise.all([6, 7].map(d => bunka(p, `${PRISTI}-0${d}`).evaluate(el => getComputedStyle(el).backgroundColor)));
  tvrdi('G2: povinná buňka je výraznější než žádoucí (jiné pozadí)', tony[0] !== tony[1], JSON.stringify(tony));
  tvrdi('G3: souhrn tržeb v náhledu „Stačí jeden"', (await p.locator('[data-souhrn-trzeb="ok"]').innerText()).includes('Stačí jeden'));

  await otevriDen(p, `${PRISTI}-06`);
  tvrdi('G2: okno dne bez otevírací směny: „Nikdo neotevře" výrazně', (await okno(p).locator('[data-dira]').getAttribute('data-dira')) === 'povinna'
    && (await okno(p).locator('[data-dira]').innerText()).includes('Nikdo neotevře'));
  await zavriOkno(p);
  await otevriDen(p, `${PRISTI}-07`);
  tvrdi('G2: okno dne s jedním člověkem: „Druhá směna neobsazená — otevře se s jedním člověkem" mírně',
    (await okno(p).locator('[data-dira]').getAttribute('data-dira')) === 'zadouci'
    && (await okno(p).locator('[data-dira]').innerText()).includes('otevře se s jedním člověkem')
    && await okno(p).locator('[data-dira]').evaluate(el => el.classList.contains('note-wait')));
  tvrdi('G3: doporučení „2 lidé" v okně dne', (await okno(p).locator('[data-doporuceni]').innerText()).includes('Doporučení: 2 lidé'));
  await zavriOkno(p);
  await otevriDen(p, `${PRISTI}-08`);
  const dop = await okno(p).locator('[data-doporuceni]').innerText();
  tvrdi('G3: okno dne „Doporučení: 1 člověk · průměrná tržba v tento den v týdnu ~8 000 Kč · ušetří 8 hodin"', dop.includes('Doporučení: 1 člověk') && /8\s000/.test(dop) && dop.includes('8 hodin'), dop);
  await p.screenshot({ path: OUT + 'rozvrh-generator-den.png' });
  tvrdi('G2/G3: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// G3) Funkce vypnutá: server tržby neposlal → v náhledu ani v okně dne o nich nic.
{
  const { ctx, p } = await kontext({ fix: FIX, dalsi: podvrh({ bezTrzeb: true }) });
  await otevri(p, ROZVRH, 'vedeni.rozvrh');
  await vygeneruj(p);
  tvrdi('G3: vypnuto = v náhledu žádný souhrn tržeb', await p.locator('[data-souhrn-trzeb]').count() === 0);
  tvrdi('G3: vypnuto = povinná díra se pořád ukáže', await p.locator('[data-povinne-diry]').isVisible());
  await otevriDen(p, `${PRISTI}-08`);
  tvrdi('G3: vypnuto = okno dne bez řádku doporučení a bez slova tržba', await okno(p).locator('[data-doporuceni]').count() === 0
    && !(await okno(p).innerText()).toLowerCase().includes('tržb'));
  await ctx.close();
}

await konec();
