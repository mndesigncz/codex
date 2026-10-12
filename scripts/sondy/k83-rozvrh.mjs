// Kolo 7, balík R7-1 — Rozvrh a volno očima zaměstnance na telefonu (390×844) a na monitoru (1280).
//
// Dostupnost: klepnutí na hlavičku sloupce „Po" nastaví všechna pondělí měsíce; „Jako minulý
// měsíc" předvyplní pondělky z minulé dostupnosti a ukáže plovoucí lištu „Odeslat dostupnost";
// „Žádost o volno" v hlavičce otevře okno zdola s formulářem a „Moje žádosti" jsou na stránce
// právě jednou, u zamítnuté s „Vedení: …". Moje směny: poznámka vedení u směny a Stat
// „Naplánováno" (ne druhé „Odpracováno"). Na obou šířkách nic nepřetéká.
//
// Fixtury: k69-b1-* (sdílené s k69-b1) a k83-rozvrh-dostupnost-minuly.json (GET ?mine=1 minulého
// měsíce; PO1…PO5 = pondělky toho měsíce, dosadí se podle pražského dne, ať sonda nezestárne).
//   SONDY_ZAKLAD=http://localhost:3421 node scripts/sondy/k83-rozvrh.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, roleMine, DIR, OUT } from './k68-spolecne.mjs';

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PRED3: praha(-3), ZITRA: praha(1), POZITRI: praha(2), ZA3: praha(3), ZA5: praha(5), ZA7: praha(7), ZA10: praha(10) };
const MESIC = DNY.DNES.slice(0, 7);
const posun = (m, o) => { const [y, mm] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mm - 1 + o, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const PRISTI = posun(MESIC, 1);
const nacti = (jmeno, mesic = MESIC) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t.replaceAll('PRISTI', PRISTI).replaceAll('"MESIC"', `"${MESIC}"`).replaceAll('"@-', `"${mesic}-`));
};
/** Pondělky měsíce „RRRR-MM". */
const pondelky = (m) => {
  const [y, mm] = m.split('-').map(Number);
  const out = [];
  for (let d = 1; d <= new Date(Date.UTC(y, mm, 0)).getUTCDate(); d++) if (new Date(Date.UTC(y, mm - 1, d)).getUTCDay() === 1) out.push(`${m}-${String(d).padStart(2, '0')}`);
  return out;
};
// Kalendář se otevírá na příštím měsíci; „minulý" je tedy ten letošní.
const MINULY = MESIC;
const minula = (() => {
  const f = nacti('k83-rozvrh-dostupnost-minuly');
  const po = pondelky(MINULY);
  return { ...f, month: MINULY, unavailableDates: f.unavailableDates.map((x, i) => po[i]).filter(Boolean) };
})();

const podvrh = (stav0) => (req, json, stav) => {
  const u = new URL(req.url()); const path = u.pathname; const q = u.searchParams;
  if (req.method() !== 'GET') {
    (stav.zapisy ??= []).push({ m: req.method(), path, body: req.postData() });
    if (path === '/api/timeoff' || path === '/api/availability') return json({ ok: true, request: {} });
    return undefined;
  }
  if (path === '/api/availability') {
    if (q.get('mine')) { (stav.dostupnostMine ??= []).push(q.get('month')); return json(q.get('month') === MINULY ? minula : null); }
    return json(nacti('k69-b1-availability'));
  }
  if (path === '/api/timeoff') return json(nacti(q.get('mine') === '1' ? 'k69-b1-timeoff-mine' : 'k69-b1-timeoff'));
  if (path === '/api/shifts/offers') return json(nacti('k69-b1-offers'));
  if (path === '/api/shifts' && q.get('team') === '1') return json(nacti('k69-b1-shifts-team'));
  if (path === '/api/shifts' && q.get('employeeId')) return json(nacti('k69-b1-shifts-mine').map(s => ({ ...s, employeeId: 16 })));
  if (path === '/api/schedule') return json(nacti('k69-b1-schedule', q.get('month') ?? MESIC));
  return undefined;
};

const BARISTA = roleMine('barista');
const DOSTUPNOST = '/employee/shifts?view=availability';
const MOJE = '/employee/shifts?view=my-shifts';
const bezPreteceni = (p) => p.evaluate(() => ({
  doc: document.documentElement.scrollWidth - window.innerWidth,
  prvky: [...document.querySelectorAll('[data-plocha] li[data-widget], [role="dialog"]')].map(e => e.scrollWidth - e.clientWidth).filter(x => x > 1).length,
}));
const VELIKOSTI = [
  { jmeno: '390', viewport: { width: 390, height: 844 }, mobil: true },
  { jmeno: '1280', viewport: { width: 1280, height: 900 }, mobil: false },
];

for (const v of VELIKOSTI) {
  // ---- Dostupnost: týdenní vzor a „Jako minulý měsíc" ----
  {
    const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: nacti('k69-b1-rozlozeni-dostupnost'), mineData: BARISTA, viewport: v.viewport, mobil: v.mobil, dalsi: podvrh() });
    await otevri(p, DOSTUPNOST, 'zamestnanec.dostupnost');
    const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
    // Hlavička sloupců je tlačítko s aria-label „Nastavit všechny dny pondělí v měsíci".
    const po = nastroj.getByRole('button', { name: /Nastavit všechny dny pondělí v měsíci/ });
    tvrdi(`V${v.jmeno}-1: hlavičky dnů jsou tlačítka (7) s aria-label`, await nastroj.getByRole('button', { name: /^Nastavit všechny dny / }).count() === 7);
    const box = await po.boundingBox();
    await po.click();
    const dnyPo = pondelky(PRISTI).map(d => Number(d.slice(8)));
    const stavy = await Promise.all(dnyPo.map(d => nastroj.getByRole('button', { name: new RegExp(`^${d}\\. — `) }).getAttribute('aria-label')));
    tvrdi(`V${v.jmeno}-1: klepnutí na „Po" nastaví všechna pondělí měsíce (bez štětce další stav — Nemůžu)`, stavy.length >= 4 && stavy.every(s => /Nemůžu/.test(s ?? '')), JSON.stringify(stavy));
    tvrdi(`V${v.jmeno}-1: …a ukáže plovoucí lištu „Odeslat dostupnost"`, await dokud(() => p.getByRole('region', { name: 'Neodeslaná dostupnost' }).isVisible().catch(() => false), 2000)
      || await dokud(() => p.locator('button').filter({ hasText: 'Odeslat dostupnost' }).first().isVisible(), 1000));
    tvrdi(`V${v.jmeno}-1: hlavička dne je dosažitelná prstem (≥ 28 px vysoká, cíl rozšiřuje tap-target-sm)`, !!box && box.height >= 28, JSON.stringify(box));
    // Vrátit sloupec (druhé klepnutí cyklí dál) — místo toho nová stránka pro „Jako minulý měsíc".
    await ctx.close();
  }
  {
    const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: nacti('k69-b1-rozlozeni-dostupnost'), mineData: BARISTA, viewport: v.viewport, mobil: v.mobil, dalsi: podvrh() });
    await otevri(p, DOSTUPNOST, 'zamestnanec.dostupnost');
    const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
    const jako = nastroj.getByRole('button', { name: 'Jako minulý měsíc' });
    tvrdi(`V${v.jmeno}-2: „Jako minulý měsíc" se ukáže, když minulý měsíc má vzor`, await dokud(() => jako.isVisible(), 4000));
    await jako.click();
    const dnyPo = pondelky(PRISTI).map(d => Number(d.slice(8)));
    const ok = await dokud(async () => {
      const s = await Promise.all(dnyPo.map(d => nastroj.getByRole('button', { name: new RegExp(`^${d}\\. — `) }).getAttribute('aria-label')));
      return s.every(x => /Nemůžu/.test(x ?? ''));
    }, 2000);
    tvrdi(`V${v.jmeno}-2: …předvyplní pondělky „Nemůžu" podle dne v týdnu (ne podle data)`, ok);
    tvrdi(`V${v.jmeno}-2: …Toast s počtem a „Vrátit"`, await dokud(() => p.getByText(/Převzato z minulého měsíce: \d+ dn/).isVisible(), 2000) && await p.getByRole('button', { name: 'Vrátit' }).isVisible());
    tvrdi(`V${v.jmeno}-2: …a plovoucí lišta „Odeslat dostupnost"`, await p.getByRole('region', { name: 'Neodeslaná dostupnost' }).isVisible().catch(() => false));
    const dotazu = (stav.dostupnostMine ?? []).filter(m => m === MINULY).length;
    tvrdi(`V${v.jmeno}-2: minulý měsíc se stáhl jednou (mezipaměť)`, dotazu === 1, `${dotazu}×`);
    tvrdi(`V${v.jmeno}-2: nic nepřetéká`, (await bezPreteceni(p)).doc <= 1 && (await bezPreteceni(p)).prvky === 0, JSON.stringify(await bezPreteceni(p)));
    tvrdi(`V${v.jmeno}-2: bez chyb v konzoli`, chyby.filter(c => !/hydrat/i.test(c)).length === 0, chyby.slice(0, 2).join(' | '));
    await p.screenshot({ path: OUT + `k83-rozvrh-dostupnost-${v.jmeno}.png` });
    await ctx.close();
  }

  // ---- Dostupnost: žádost o volno a Moje žádosti ----
  {
    const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: nacti('k69-b1-rozlozeni-dostupnost'), mineData: BARISTA, viewport: v.viewport, mobil: v.mobil, dalsi: podvrh() });
    await otevri(p, DOSTUPNOST, 'zamestnanec.dostupnost');
    const moje = p.locator('summary').filter({ hasText: /^Moje žádosti/ });
    tvrdi(`V${v.jmeno}-3: „Moje žádosti" je na stránce právě jednou (sbalitelné pod kalendářem)`, await moje.count() === 1 && await p.getByText('Dovolená a volno').count() === 0);
    tvrdi(`V${v.jmeno}-3: …otevřené (něco čeká) a zamítnutá žádost má „Vedení: …"`,
      await p.locator('details[open]').filter({ has: moje }).count() === 1 && await p.getByText('Vedení: Ten den už má volno Petra, zkus prosím jiný termín.').isVisible());
    const tlacitko = p.getByRole('button', { name: 'Žádost o volno' }).first();
    tvrdi(`V${v.jmeno}-3: „Žádost o volno" je v hlavičce vidět bez rolování a není limetková`,
      await tlacitko.isVisible() && (await tlacitko.boundingBox()).y < v.viewport.height && !(await tlacitko.getAttribute('class')).includes('on-accent'));
    await tlacitko.click();
    const okno = p.getByRole('dialog', { name: 'Žádost o volno' });
    tvrdi(`V${v.jmeno}-3: okno se otevře s formulářem (Od, Do, typ, poznámka, Odeslat žádost)`, await dokud(() => okno.isVisible(), 2000)
      && await okno.getByLabel('Od').isVisible() && await okno.getByLabel('Do').isVisible() && await okno.getByRole('button', { name: 'Odeslat žádost' }).isVisible());
    if (v.mobil) {
      const r = await okno.evaluate(el => { const b = el.getBoundingClientRect(); return { dole: Math.round(window.innerHeight - b.bottom), sirka: Math.round(b.width), vw: window.innerWidth }; });
      tvrdi('V390-3: na telefonu okno vyjíždí zdola přes celou šířku', r.dole <= 2 && r.sirka >= r.vw - 2, JSON.stringify(r));
    }
    tvrdi(`V${v.jmeno}-3: okno je jen formulář — seznam žádostí v něm není`, await okno.locator('summary, .list').count() === 0);
    await okno.getByLabel('Od').fill(DNY.ZA10);
    await okno.getByLabel('Do').fill(DNY.ZA10);
    await okno.getByRole('button', { name: 'Odeslat žádost' }).click();
    tvrdi(`V${v.jmeno}-3: odeslání → POST /api/timeoff, okno se zavře a Toast „Žádost odeslána"`,
      await dokud(() => (stav.zapisy ?? []).some(z => z.path === '/api/timeoff' && z.m === 'POST'), 2000)
      && await dokud(async () => !(await okno.isVisible()), 2000) && await dokud(() => p.getByText('Žádost odeslána').isVisible(), 2000));
    tvrdi(`V${v.jmeno}-3: nic nepřetéká`, (await bezPreteceni(p)).doc <= 1, JSON.stringify(await bezPreteceni(p)));
    tvrdi(`V${v.jmeno}-3: bez chyb v konzoli`, chyby.filter(c => !/hydrat/i.test(c)).length === 0, chyby.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ---- Moje směny: poznámka ke směně a „Naplánováno" ----
  {
    const { ctx, p, chyby } = await kontext({ role: 'employee', fix: nacti('k69-b1-rozlozeni-moje-zamestnanec'), mineData: BARISTA, viewport: v.viewport, mobil: v.mobil, dalsi: podvrh() });
    await otevri(p, MOJE, 'zamestnanec.moje_smeny');
    const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
    const pozn = nastroj.locator('[data-poznamka-smeny]');
    tvrdi(`V${v.jmeno}-4: Moje směny ukazují poznámku vedení u směny`, await dokud(() => pozn.first().isVisible(), 3000) && /klíče u Petry/.test(await pozn.first().innerText()));
    const r = await pozn.first().evaluate(el => ({ pres: el.scrollWidth - el.clientWidth, radku: Math.round(el.getBoundingClientRect().height / 18) }));
    tvrdi(`V${v.jmeno}-4: …zalamuje se, nepřetéká`, r.pres <= 1, JSON.stringify(r));
    const cisla = p.locator('[data-plocha] li[data-widget="moje.smeny_prehled"]');
    const text = await cisla.innerText();
    tvrdi(`V${v.jmeno}-4: Moje směny v číslech říkají „Naplánováno … z rozvrhu", ne „Odpracováno"`, /Naplánováno/i.test(text) && /z rozvrhu do včerejška/.test(text) && !/Odpracováno/i.test(text), text.replace(/\s+/g, ' ').slice(0, 160));
    tvrdi(`V${v.jmeno}-4: nic nepřetéká`, (await bezPreteceni(p)).doc <= 1 && (await bezPreteceni(p)).prvky === 0, JSON.stringify(await bezPreteceni(p)));
    tvrdi(`V${v.jmeno}-4: bez chyb v konzoli`, chyby.filter(c => !/hydrat/i.test(c)).length === 0, chyby.slice(0, 2).join(' | '));
    await p.screenshot({ path: OUT + `k83-rozvrh-moje-${v.jmeno}.png` });
    await ctx.close();
  }
}

await konec();
