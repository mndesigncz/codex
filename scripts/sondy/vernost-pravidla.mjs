// Ruční sonda okruhu B: koncept a verze pravidel bodů a úrovní (Věrnost → Body a úrovně).
// Není v ZELENE ve spust.mjs (je v MIMO): API se podvrhuje, sonda tvrdí, co UI zobrazí a pošle.
// Náhled „kolik host dostane z účtu“, kontrolu před uložením a přehledy hlídá w2-body.
//
// Spuštění proti lokálnímu buildu:
//   SONDY_ZAKLAD=http://localhost:3411 SONDY_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     node scripts/sondy/vernost-pravidla.mjs
//
// Měří na 390 a 1280 px: žádný vodorovný scroll; bez změny jsou tlačítka konceptu zakázaná; uložení konceptu pošle
// PUT action save s čísly a koncept se ukáže s rozdílem; chybná kombinace (strop za den pod stropem na účtenku)
// se neuloží a server řekne proč; „Použít pravidla…“ ukáže změny před → po, pošle publish s poznámkou a v seznamu
// verzí je nová verze se změnami; zahození konceptu pošle discard.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, DIR, OUT } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const CLIENT = (tab) => `/employer/overview?mode=client&tab=${tab}`;
const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/** Rozdíl před → po jen pro dvě pole, která sonda mění (stejné věty jako lib/bodyPravidla.popisZmenyPravidel). */
const rozdil = (platna, koncept) => [
  ...(Number(koncept.points_cap_per_bill) !== Number(platna.points_cap_per_bill ?? 0) ? [`Strop bodů na účtenku: ${Number(platna.points_cap_per_bill) > 0 ? `${platna.points_cap_per_bill} b.` : 'bez stropu'} → ${Number(koncept.points_cap_per_bill) > 0 ? `${Number(koncept.points_cap_per_bill)} b.` : 'bez stropu'}`] : []),
  ...(String(koncept.mult_gold ?? '1').replace(',', '.') !== String(platna.mult_gold ?? '1') ? [`Násobič zlato: ${String(platna.mult_gold ?? '1').replace('.', ',')}× → ${String(koncept.mult_gold).replace('.', ',')}×`] : []),
];

const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  stav.v ??= {
    put: [],
    s: {
      platna: { ...nacti('client_admin_profile').profile, points_cap_per_bill: 0, mult_gold: 1 }, koncept: null, konceptZmeny: [], konceptOd: null, verze: 3,
      verzeSeznam: [{ id: 2, version: 3, created_at: '2026-09-20T08:15:00Z', changed_by_name: 'Marie Nováková', source: 'form', note: null, changes: ['Bodů za 100: 5 → 10', 'Cashback: 0 % → 2 %'] }],
    },
  };
  const s = stav.v.s;
  if (path === '/api/client/admin/loyalty/pravidla') {
    if (m === 'PUT') {
      const b = req.postDataJSON();
      stav.v.put.push(b);
      if (b.action === 'save') {
        if (Number(b.points_cap_per_day) > 0 && Number(b.points_cap_per_day) < Number(b.points_cap_per_bill)) return json({ error: 'Strop za den nesmí být menší než strop na účtenku.' }, 400);
        s.koncept = { ...s.platna, ...b }; delete s.koncept.action; s.konceptZmeny = rozdil(s.platna, s.koncept); s.konceptOd = '2026-10-02T09:00:00Z';
      }
      if (b.action === 'publish') {
        s.verze += 1;
        s.verzeSeznam.unshift({ id: 9, version: s.verze, created_at: '2026-10-02T09:05:00Z', changed_by_name: 'Marie Nováková', source: 'koncept', note: b.note || null, changes: s.konceptZmeny });
        s.platna = s.koncept; s.koncept = null; s.konceptZmeny = []; s.konceptOd = null;
      }
      if (b.action === 'discard') { s.koncept = null; s.konceptZmeny = []; s.konceptOd = null; }
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
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Body a úrovně' }).click();
  await p.getByRole('heading', { name: 'Koncept pravidel' }).waitFor({ timeout: 8000 });
  tvrdi(`${jmeno}: bez změny jsou „Uložit koncept“ i „Použít pravidla…“ zakázané`, await p.getByRole('button', { name: 'Uložit koncept' }).isDisabled() && await p.getByRole('button', { name: 'Použít pravidla…' }).isDisabled());
  const verze = p.locator('[aria-labelledby="pr-verze"]');
  tvrdi(`${jmeno}: seznam verzí ukazuje platnou verzi, kdo a co změnil`, /Platí verze 3/.test(await verze.innerText()) && /Marie Nováková/.test(await verze.innerText()) && /Bodů za 100: 5 → 10/.test(await verze.innerText()));

  // Chybná kombinace: server ji odmítne větou a koncept se neuloží.
  await p.locator('#b-cap').fill('10');
  tvrdi(`${jmeno}: po změně jde uložit koncept`, await p.getByRole('button', { name: 'Uložit koncept' }).isEnabled());
  await p.locator('#b-cap-den').fill('5');
  await p.getByRole('button', { name: 'Uložit koncept' }).click();
  await p.getByRole('alert').filter({ hasText: 'Strop za den nesmí být menší' }).waitFor({ timeout: 4000 });
  tvrdi(`${jmeno}: strop za den pod stropem na účtenku koncept neuloží a řekne proč`, (await p.locator('[aria-labelledby="pr-koncept"]').innerText()).includes('Strop za den nesmí být menší') && !stav.v.s.koncept);
  await p.locator('#b-cap-den').fill('0');

  // Uložení konceptu s čárkou v násobiči.
  await p.locator('#b-m-g').fill('1,5');
  await p.getByRole('button', { name: 'Uložit koncept' }).click();
  await p.getByText('Máš rozpracovaný koncept').waitFor({ timeout: 4000 });
  const save = stav.v.put.filter(b => b.action === 'save').at(-1);
  tvrdi(`${jmeno}: koncept nese strop 10 a násobič 1,5 (PUT save)`, String(save?.points_cap_per_bill) === '10' && String(save?.mult_gold) === '1,5', JSON.stringify(save));
  const panel = p.locator('[aria-labelledby="pr-koncept"]');
  tvrdi(`${jmeno}: koncept ukáže rozdíl před → po a „Zahodit koncept“`, /Strop bodů na účtenku: bez stropu → 10 b\./.test(await panel.innerText()) && await p.getByRole('button', { name: 'Zahodit koncept' }).count() === 1, (await panel.innerText()).replace(/\n/g, ' | '));

  // Použít: okno se změnami před → po a poznámkou.
  await p.getByRole('button', { name: 'Použít pravidla…' }).click();
  const okno = p.getByRole('dialog');
  await okno.waitFor({ timeout: 4000 });
  const textOkna = await okno.innerText();
  tvrdi(`${jmeno}: okno ukazuje rozdíl před → po`, /Strop bodů na účtenku: bez stropu → 10 b\./.test(textOkna) && /Násobič zlato: 1× → 1,5×/.test(textOkna), textOkna.slice(0, 300));
  tvrdi(`${jmeno}: okno říká, že už připsané se nepřepočítává`, /nepřepočítávají/.test(textOkna));
  tvrdi(`${jmeno}: okno bez vodorovného scrollu`, await bezPreteceni(p));
  await okno.getByLabel('Poznámka k verzi').fill('Test poznámka');
  await okno.getByRole('button', { name: 'Použít', exact: true }).click();
  await p.getByText('Platí verze 4').waitFor({ timeout: 5000 });
  const pub = stav.v.put.find(b => b.action === 'publish');
  tvrdi(`${jmeno}: Použít pošle publish s poznámkou`, pub?.note === 'Test poznámka', JSON.stringify(pub));
  tvrdi(`${jmeno}: v seznamu verzí je nová verze se změnou a poznámkou`, /Verze 4/.test(await verze.innerText()) && /Test poznámka/.test(await verze.innerText()) && /Násobič zlato: 1× → 1,5×/.test(await verze.innerText()));
  tvrdi(`${jmeno}: po použití koncept zmizel`, await p.getByText('Máš rozpracovaný koncept').count() === 0);

  // Zahození: nový koncept a discard.
  await p.locator('#b-cap').fill('20');
  await p.getByRole('button', { name: 'Uložit koncept' }).click();
  await p.getByRole('button', { name: 'Zahodit koncept' }).waitFor({ timeout: 4000 });
  await p.getByRole('button', { name: 'Zahodit koncept' }).click();
  await p.getByText('Máš rozpracovaný koncept').waitFor({ state: 'detached', timeout: 4000 });
  tvrdi(`${jmeno}: Zahodit koncept pošle discard`, stav.v.put.some(b => b.action === 'discard'));
  tvrdi(`${jmeno}: bez vodorovného scrollu (pravidla)`, await bezPreteceni(p));
  await p.screenshot({ path: `${OUT}vernost-pravidla-${jmeno}-koncept.png`, fullPage: true });

  tvrdi(`${jmeno}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await behy({ width: 390, height: 844 }, true);
await behy({ width: 1280, height: 900 }, false);
await konec();
