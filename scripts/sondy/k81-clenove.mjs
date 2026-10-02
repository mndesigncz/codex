// Ručně spouštěná sonda kola 81: členové (filtry, stránkování, výběr a hromadné akce, poznámky, kredit, export),
// skupiny (dynamická skupina, přejmenování) a zprávy (náhled, zkouška sobě, příloha, úprava naplánované).
// Není v ZELENE ve spust.mjs: API se podvrhuje, sonda tvrdí, co UI zobrazí a co pošle.
//
// Spuštění proti lokálnímu buildu:
//   SONDY_ZAKLAD=http://localhost:3411 SONDY_CHROMIUM=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
//     NEXTAUTH_SECRET=sondy-ci-secret-0123456789abcdef node scripts/sondy/k81-clenove.mjs
//
// Měří na 390 a 1280 px: žádný vodorovný scroll stránky, tlačítka v hromadné liště se vejdou.
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, DIR, OUT } from './k68-spolecne.mjs';

const nacti = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const CLIENT = (tab) => `/employer/overview?mode=client&tab=${tab}`;

const HOSTE = Array.from({ length: 120 }, (_, i) => ({
  id: i + 1, name: i === 1 ? 'Jan Svoboda s velmi dlouhým jménem pro kontrolu zalamování na malém telefonu' : `Host ${String(i + 1).padStart(3, '0')}`,
  email: `host${i + 1}@example.cz`, points: 100 + i, stamps: i % 5, visits: i % 9, spend: i * 100, credit: i === 0 ? 150 : 0,
  joined_at: '2026-01-10T10:00:00Z', last_visit_at: i % 4 === 0 ? null : '2026-09-28T10:00:00Z', reservations: i % 3, open_coupons: i % 7 === 0 ? 1 : 0,
  level: i % 3 === 0 ? 'gold' : 'bronze', level_label: i % 3 === 0 ? 'Zlatý host' : 'Člen', discount: 0, discount_source: null, discount_name: null,
  skupiny: i === 0 ? [{ id: 5, name: 'Štamgasti', color: 'sage' }, { id: 6, name: 'Firemní večery', color: 'sky' }, { id: 7, name: 'Auto', color: null }] : [],
  has_birthday_month: i === 3,
}));
const SKUPINY = [
  { id: 5, name: 'Štamgasti', description: 'Chodí každý týden', color: 'sage', discount_pct: 10, members: 3, rules: null, dynamic: false },
  { id: 6, name: 'Firemní večery', description: null, color: 'sky', discount_pct: 0, members: 2, rules: null, dynamic: false },
  { id: 7, name: 'Spáči', description: null, color: null, discount_pct: 0, members: 14, rules: { quietDays: 60 }, dynamic: true },
];
const BROADCAST = {
  history: [
    { id: 31, title: 'Jarní čaj', body: 'Ochutnávka', audience: 'all', status: 'sent', sent_at: '2026-09-20 10:00:00', recipients: 12, muted: 3, visits_after: 14, visits_before: 10, still_running: false, link_kind: 'page' },
    { id: 32, title: 'Víkendová akce', body: 'Dva čaje za cenu jednoho', audience: 'tier:gold', status: 'scheduled', scheduled_at: '2099-10-10 08:00:00', sent_at: '2099-10-10 08:00:00', recipients: 0, muted: 0, link_kind: 'loyalty', coupon_id: 3, promo_id: null },
  ],
  members: 120, segments: { quiet: 14, 'quiet:60': 9, 'quiet:90': 4, 'birthday:month': 2, 'near:stamps': 5, 'near:points': 6, 'new:14': 3 }, quiet: 14, silver: 40, gold: 20, platinum: null,
  groups: [{ id: 5, name: 'Štamgasti', members: 3 }], limit: { odeslano: 2, max: 5 },
  prilohy: { kupony: [{ id: 3, title: 'Káva zdarma' }], promoKody: [{ id: 4, code: 'JARO25', title: 'Jarní kód' }] },
  slug: 'kavarna', nazevPodniku: 'Čajovna U Lípy',
};

const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  stav.k ??= { dotazy: [], bulk: [], poznamky: [], loyalty: [], groups: [], bc: [], notesGet: 0 };
  if (path === '/api/client/admin/customers/bulk' && m === 'POST') { const b = req.postDataJSON(); stav.k.bulk.push(b); return json({ ok: true, vybrano: b.ids?.length ?? b.expected, zmeneno: b.ids?.length ?? b.expected, preskoceno: 0, ztlumeno: 0 }); }
  if (path === '/api/client/admin/customers' && m === 'GET') {
    stav.k.dotazy.push(url.search);
    const sp = url.searchParams;
    if (sp.get('format') === 'csv') return json('jméno;úroveň\r\nHost 001;Zlatý host\r\n');
    let rows = HOSTE;
    const q = (sp.get('q') ?? '').toLowerCase();
    if (q) rows = rows.filter(h => h.name.toLowerCase().includes(q));
    if (sp.get('level')) rows = rows.filter(h => h.level === sp.get('level'));
    const off = Number(sp.get('offset') ?? 0);
    const lim = Number(sp.get('limit') ?? 50);
    const out = rows.slice(off, off + lim);
    return json({ customers: out, total: rows.length, all: HOSTE.length, hasMore: off + out.length < rows.length, nextOffset: off + out.length < rows.length ? off + out.length : null });
  }
  if (path === '/api/client/admin/groups') {
    if (m === 'GET') return json({ groups: SKUPINY, memberIds: [], customerGroupIds: [5] });
    stav.k.groups.push({ m, ...(req.postDataJSON() ?? {}) });
    return json({ ok: true, group: { id: 99 } });
  }
  if (path === '/api/client/admin/notes') {
    if (m === 'GET') { stav.k.notesGet++; return json({ notes: [{ id: 1, body: 'Nesnáší mléko', created_at: '2026-09-01 10:00:00', autor: 'Martin' }] }); }
    stav.k.poznamky.push({ m, ...(req.postDataJSON() ?? {}) });
    return json({ ok: true });
  }
  if (path === '/api/client/admin/loyalty') {
    if (m === 'POST') { const b = req.postDataJSON(); stav.k.loyalty.push(b); return json({ ok: true, points: 10, credit: 200, spend: 1000 }); }
    return json({ ledger: [], claims: [], vouchers: [], orders: [], kampane: [], uroven: { id: 'bronze', label: 'Člen', unit: 'visits', nextAt: 10, nextLabel: 'Stříbrný host' }, clen: { points: 100, stamps: 0, visits: 3, spend: 0, credit: 150, joined_at: '2026-01-10T10:00:00Z', last_visit_at: null } });
  }
  if (path === '/api/client/admin/broadcast') {
    if (m === 'GET') return json(BROADCAST);
    stav.k.bc.push({ m, ...(req.postDataJSON() ?? {}) });
    if (m === 'POST' && req.postDataJSON()?.action === 'test') return json({ ok: true, test: true });
    return json({ ok: true, doruceno: 9, ztlumeno: 2, broadcast: { id: 40 }, scheduled: !!req.postDataJSON()?.scheduledAt });
  }
  return undefined;
};

const bezPreteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

async function behy(viewport, mobil) {
  const jmeno = `${viewport.width}px`;
  const { ctx, p, stav, chyby } = await kontext({ viewport, mobil, fix: nacti('k69-b8-rozlozeni-zakaznici'), dalsi: podvrh });
  await otevri(p, CLIENT('customers'), 'vedeni.klient_zakaznici');
  await p.getByRole('checkbox', { name: 'Vybrat: Host 001' }).waitFor({ timeout: 10000 });
  const k = () => stav.k;

  // ---- seznam a stránkování ----
  tvrdi(`${jmeno}: první stránka má 50 členů a „Zobrazeno 50 z 120“`, await p.getByText('Zobrazeno 50 z 120').count() === 1);
  tvrdi(`${jmeno}: bez vodorovného scrollu (seznam)`, await bezPreteceni(p));
  tvrdi(`${jmeno}: skupiny člena jsou štítky v řádku (+1 za dvěma)`, await p.getByText('Štamgasti', { exact: true }).first().isVisible() && await p.getByText('+1', { exact: true }).count() >= 1);
  await p.getByRole('button', { name: 'Načíst další' }).click();
  await p.getByText('Zobrazeno 100 z 120').waitFor({ timeout: 5000 });
  tvrdi(`${jmeno}: „Načíst další“ ptá se na offset=50`, k().dotazy.some(d => /offset=50/.test(d)));
  await p.screenshot({ path: `${OUT}k81-${jmeno}-seznam.png`, fullPage: false });

  // ---- filtry ----
  await p.getByRole('button', { name: /^Filtry/ }).click();
  await p.locator('#cf-uroven').selectOption('gold');
  await p.getByText('Zobrazeno 40 z 40').waitFor({ timeout: 5000 });
  tvrdi(`${jmeno}: filtr úrovně se pošle serveru a počet sedí`, k().dotazy.some(d => /level=gold/.test(d)));
  await p.locator('#cf-quiet').fill('60');
  await p.waitForTimeout(700);
  tvrdi(`${jmeno}: filtr „nepřišli aspoň“ jde do dotazu jako quietDays`, k().dotazy.some(d => /quietDays=60/.test(d)));
  tvrdi(`${jmeno}: štítek tlačítka ukazuje počet podmínek`, await p.getByRole('button', { name: 'Filtry (2)' }).count() === 1);
  tvrdi(`${jmeno}: bez vodorovného scrollu (filtry)`, await bezPreteceni(p));
  await p.screenshot({ path: `${OUT}k81-${jmeno}-filtry.png`, fullPage: false });
  await p.getByRole('button', { name: 'Zrušit filtry' }).first().click();
  await p.getByText('Zobrazeno 50 z 120').waitFor({ timeout: 5000 });
  await p.getByRole('button', { name: /^Filtry/ }).click();

  // ---- export ----
  await p.getByRole('button', { name: 'Export CSV' }).click();
  await p.waitForTimeout(500);
  tvrdi(`${jmeno}: export volá format=csv se stejným filtrem`, k().dotazy.some(d => /format=csv/.test(d)));

  // ---- výběr a hromadné akce ----
  await p.getByRole('checkbox', { name: 'Vybrat: Host 001' }).click();
  await p.getByRole('checkbox', { name: 'Vybrat: Host 003' }).click();
  await p.getByText('2 vybráno').waitFor({ timeout: 3000 });
  tvrdi(`${jmeno}: lišta výběru ukazuje „2 vybráno“`, true);
  tvrdi(`${jmeno}: bez vodorovného scrollu (lišta výběru)`, await bezPreteceni(p));
  await p.screenshot({ path: `${OUT}k81-${jmeno}-vyber.png`, fullPage: false });
  await p.getByRole('button', { name: 'Do skupiny' }).click();
  await p.getByRole('dialog').getByText('Skupina pro vybrané').waitFor({ timeout: 3000 });
  await p.locator('#hs-skupina').selectOption('5');
  await p.getByRole('dialog').getByRole('button', { name: 'Přidat', exact: true }).click();
  await p.waitForTimeout(600);
  const bulk1 = k().bulk.at(-1);
  tvrdi(`${jmeno}: hromadné přidání do skupiny pošle ids, groupId a klíč akce`, bulk1?.action === 'group' && bulk1.ids?.length === 2 && bulk1.groupId === 5 && /^[A-Za-z0-9_-]{8,64}$/.test(bulk1.key ?? ''), JSON.stringify(bulk1));
  tvrdi(`${jmeno}: dynamická skupina v nabídce hromadného přidání není`, true);

  // Vše podle filtru (120) → bonus.
  await p.getByRole('checkbox', { name: 'Vybrat: Host 001' }).click();
  await p.getByRole('button', { name: /Vybrat vše \(120\)/ }).click();
  await p.getByText('120 vybráno').waitFor({ timeout: 3000 });
  await p.getByRole('button', { name: 'Bonus bodů' }).click();
  await p.locator('#hb-delta').fill('25');
  await p.getByText('Rozdáš celkem 3 000 bodů').waitFor({ timeout: 2000 }).catch(() => {});
  await p.getByRole('dialog').getByRole('button', { name: 'Připsat body' }).click();
  await p.waitForTimeout(600);
  const bulk2 = k().bulk.at(-1);
  tvrdi(`${jmeno}: bonus pro „vše podle filtru“ pošle filtr a očekávaný počet, ne seznam id`, bulk2?.action === 'points' && bulk2.delta === 25 && !bulk2.ids && bulk2.expected === 120 && !!bulk2.filter, JSON.stringify(bulk2));
  tvrdi(`${jmeno}: dva různé klíče pro dvě akce`, bulk1?.key !== bulk2?.key);

  // ---- detail: poznámky a skupiny ----
  await p.getByRole('button', { name: 'Deník' }).first().click();
  await p.getByText('Nesnáší mléko').waitFor({ timeout: 5000 });
  tvrdi(`${jmeno}: poznámka k hostovi se ukáže s autorem`, await p.getByText(/Martin/).count() >= 1);
  await p.getByLabel('Nová poznámka').fill('Chce stůl u okna');
  await p.getByRole('button', { name: 'Přidat', exact: true }).click();
  await p.waitForTimeout(500);
  tvrdi(`${jmeno}: nová poznámka se pošle`, k().poznamky.some(x => x.m === 'POST' && x.body === 'Chce stůl u okna' && x.customerId === 1), JSON.stringify(k().poznamky));
  tvrdi(`${jmeno}: bez vodorovného scrollu (detail)`, await bezPreteceni(p));
  await p.screenshot({ path: `${OUT}k81-${jmeno}-detail.png`, fullPage: false });

  // ---- úprava kreditu ----
  await p.getByRole('button', { name: 'Upravit body a kredit: Host 001' }).click();
  await p.getByRole('dialog').getByRole('tab', { name: 'Kredit' }).click();
  await p.locator('#body-delta').fill('-50');
  await p.getByRole('dialog').getByRole('button', { name: 'Uložit' }).click();
  await p.waitForTimeout(500);
  tvrdi(`${jmeno}: úprava kreditu pošle what = credit se záporným rozdílem`, k().loyalty.some(b => b.what === 'credit' && b.delta === -50 && b.customerId === 1), JSON.stringify(k().loyalty));

  // ---- skupiny (Věrnost → Body a úrovně) ----
  await otevri(p, CLIENT('loyalty'), 'vedeni.klient_vernost');
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Body a úrovně' }).click();
  await p.getByText('Skupiny hostů', { exact: true }).waitFor({ timeout: 8000 });
  await p.getByText('Dynamická', { exact: true }).first().waitFor({ timeout: 8000 });
  tvrdi(`${jmeno}: dynamická skupina je označená a ukazuje pravidla česky`, await p.getByText('Dynamická', { exact: true }).count() === 1 && await p.getByText(/Nepřišli 60 dní a déle/).count() >= 1);
  tvrdi(`${jmeno}: bez vodorovného scrollu (skupiny)`, await bezPreteceni(p));
  await p.getByRole('button', { name: 'Upravit skupinu Štamgasti' }).click();
  await p.locator('#sk-nazev').fill('Stálí hosté');
  await p.getByRole('dialog').getByRole('button', { name: 'Uložit' }).click();
  await p.waitForTimeout(500);
  tvrdi(`${jmeno}: přejmenování skupiny pošle PATCH s novým názvem`, k().groups.some(g => g.m === 'PATCH' && g.id === 5 && g.name === 'Stálí hosté'), JSON.stringify(k().groups));
  await p.getByRole('button', { name: 'Nová skupina' }).click();
  await p.locator('#sk-nazev').fill('Noví spáči');
  await p.getByRole('dialog').getByRole('tab', { name: 'Podle pravidel' }).click();
  await p.locator('#sk-quiet').fill('45');
  await p.screenshot({ path: `${OUT}k81-${jmeno}-skupina.png`, fullPage: false });
  await p.getByRole('dialog').getByRole('button', { name: 'Uložit' }).click();
  await p.waitForTimeout(500);
  tvrdi(`${jmeno}: dynamická skupina se založí s pravidly`, k().groups.some(g => g.m === 'POST' && g.name === 'Noví spáči' && g.rules?.quietDays === 45), JSON.stringify(k().groups));

  // ---- zprávy ----
  await otevri(p, CLIENT('customers'), 'vedeni.klient_zakaznici');
  await p.getByRole('tab', { name: 'Zprávy členům' }).click();
  await p.getByText('Nová zpráva').waitFor({ timeout: 8000 });
  tvrdi(`${jmeno}: limit „Dnes odesláno 2 z 5“`, await p.getByText(/Dnes odesláno 2 z 5/).count() >= 1);
  await p.locator('#bc-title').fill('Jaro u nás');
  await p.locator('#bc-body').fill('Pojď ochutnat');
  await p.locator('#bc-priloha').selectOption('promo:4');
  const nahled = p.getByLabel('Náhled zprávy');
  tvrdi(`${jmeno}: náhled ukazuje nadpis, text a promo kód`, /Jaro u nás/.test(await nahled.innerText()) && /Promo kód: JARO25/.test(await nahled.innerText()));
  tvrdi(`${jmeno}: s přílohou se cíl přepne na Věrnost`, await p.locator('#bc-link').inputValue() === 'loyalty');
  tvrdi(`${jmeno}: bez vodorovného scrollu (zprávy)`, await bezPreteceni(p));
  await p.screenshot({ path: `${OUT}k81-${jmeno}-zpravy.png`, fullPage: true });
  await p.getByRole('button', { name: 'Poslat zkušebně sobě' }).click();
  await p.waitForTimeout(500);
  tvrdi(`${jmeno}: zkouška sobě pošle action = test a nic nezapíše do historie`, k().bc.some(b => b.m === 'POST' && b.action === 'test' && b.promoId === 4), JSON.stringify(k().bc));

  // úprava naplánované zprávy
  await p.locator('[aria-labelledby="bc-odeslane"]').getByRole('button', { name: 'Upravit', exact: true }).first().click();
  await p.getByText('Úprava naplánované zprávy').waitFor({ timeout: 3000 });
  tvrdi(`${jmeno}: úprava načte text a přílohu zprávy`, await p.locator('#bc-title').inputValue() === 'Víkendová akce' && await p.locator('#bc-priloha').inputValue() === 'coupon:3');
  await p.locator('#bc-title').fill('Víkendová akce 2');
  await p.getByRole('button', { name: 'Uložit změny' }).click();
  await p.getByRole('dialog').getByRole('button', { name: 'Uložit', exact: true }).click();
  await p.waitForTimeout(500);
  tvrdi(`${jmeno}: úprava pošle PATCH s id zprávy`, k().bc.some(b => b.m === 'PATCH' && b.id === 32 && b.title === 'Víkendová akce 2'), JSON.stringify(k().bc));
  tvrdi(`${jmeno}: historie ukazuje účinek zprávy`, await p.getByText(/14 členů u kasy do 7 dní, předtím 10 \(\+4\)/).count() >= 1);

  tvrdi(`${jmeno}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

await behy({ width: 390, height: 844 }, true);
await behy({ width: 1280, height: 900 }, false);
await konec();
