// Kolo 69, integrace (spec §6.4 bod 4) — měření všech aktivních stránek.
//
// Projde každou stránku z lib/widgety/stranky/*.ts s `aktivni: true` na počítači (1280 × 950)
// a na telefonu (390 × 844), v klidu i v režimu úprav, uloží snímek okna do
// shots/k69-mereni-<stranka>-<desk|tel>-<klid|upravy>.png a tvrdí to, co jde tvrdit z DOM:
// právě jeden h1, žádné vodorovné přetečení na telefonu a nejvýš jednu plnou limetku
// (`button.on-accent`, `a.on-accent`). Snímky pak projdou ručně ds/limetky.py a ds/pokryti.py
// (tónované plochy pod ~6 %, inkoust do 10 %) — pixelové měření do sondy nepatří, v CI není Python
// s PIL a hranice tónů je „řád", ne přesné číslo (DP §9).
//
// Proč výchozí rozložení z kódu (vychoziZKodu), a ne fixtury balíků: měří se to, co uvidí nový
// podnik. Fixtury rozložení balíků slouží jen jako šablona pro zbytek odpovědi (dostupne, zdroj,
// smiUpravit…), položky se berou z katalogu stránky. Když někdo změní výchozí rozložení tak, že
// přinese druhou limetku, sonda to chytí hned.
//
// Data widgetů: fixtury balíků k69-b*-*.json podle cesty API. Kde dvě sondy balíků podvrhují
// stejnou cestu různě (/api/inventory, /api/closings, /api/teams), vyhraje fixtura balíku, kterému
// stránka patří — jinak by widget ukázal chybu tvaru a snímek by měřil ErrorState místo obsahu.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import {
  kontext, konec, tvrdi, otevri, upravit, vUpravach, dokud, dotyk, podrzPrstem, mistoPodPlochou, roleMine, VLASTNIK, DIR, OUT, BASE,
} from './k68-spolecne.mjs';

const KOREN = new URL('../../', import.meta.url).pathname;
const { vychoziZKodu, filtrujViditelne } = await import(KOREN + 'lib/widgety/rozlozeni.ts');

// ---------------------------------------------------------------------------
// Stránky a jejich adresy
// ---------------------------------------------------------------------------

const stranky = [];
for (const f of readdirSync(KOREN + 'lib/widgety/stranky').filter(f => f.endsWith('.ts')).sort()) {
  const { STRANKA } = await import(KOREN + 'lib/widgety/stranky/' + f);
  if (STRANKA?.aktivni) stranky.push(STRANKA);
}
// Třicet šest stránek × čtyři snímky trvá v jednom procesu přes 4 minuty, víc
// než strop jedné sondy (SONDY_LIMIT_MS). Spouští se proto po třetinách
// (k69-mereni-1/2/3.mjs nastaví MERENI_DIL="k/n"), které běží souběžně.
{
  const m = /^(\d+)\/(\d+)$/.exec(process.env.MERENI_DIL ?? '');
  if (m) {
    const [k, n] = [Number(m[1]), Number(m[2])];
    const vse = stranky.splice(0);
    vse.forEach((s, i) => { if (i % n === k - 1) stranky.push(s); });
  }
}

// Adresa podle pohledu. Výjimky jsou stránky s vlastní routou (Receptury, Sklad vedení) a Client,
// který přepíná záložky parametrem `tab`; Menu vedení se otevírá přes view=menu jako v sondě B4.
const CESTA_VEDENI = { overview: '/employer/overview', recipes: '/employer/recipes', inventory: '/employer/inventory', togo: '/employer/overview' };
function cesta(s) {
  if (s.rozhrani === 'kiosk') return '/kiosk';
  if (s.rozhrani === 'zamestnanec') return s.pohled === 'home' ? '/employee/shifts' : `/employee/shifts?view=${s.pohled}`;
  if (s.id === 'vedeni.menu') return '/employer/overview?view=menu';
  if (CESTA_VEDENI[s.pohled]) return CESTA_VEDENI[s.pohled];
  if (s.pohled.startsWith('klient:')) return `/employer/overview?mode=client&tab=${s.pohled.slice(7)}`;
  return `/employer/overview?view=${s.pohled}`;
}

// ---------------------------------------------------------------------------
// Rozložení: šablona z fixtury balíku, položky z výchozího rozložení v kódu
// ---------------------------------------------------------------------------

const nactiJson = (jmeno) => JSON.parse(readFileSync(DIR + jmeno + '.json', 'utf8'));
const SABLONY = {};
for (const f of readdirSync(DIR).filter(f => /^k6[89]-.*rozlozeni-.*\.json$/.test(f))) {
  const j = nactiJson(f.replace(/\.json$/, ''));
  if (j?.stranka && !SABLONY[j.stranka]) SABLONY[j.stranka] = { jmeno: f, json: j };
}

const BARISTA = roleMine('barista');
const KIOSK = roleMine('kiosk');
/** Kdo se na stránku dívá: vlastník u vedení, barista u zaměstnance, tablet u Směny. */
function divak(s) {
  if (s.rozhrani === 'kiosk') return { role: 'kiosk', mineData: KIOSK, klic: 'kiosk' };
  if (s.rozhrani === 'zamestnanec') return { role: 'employee', mineData: BARISTA, klic: 'barista' };
  return { role: 'employer', mineData: VLASTNIK, klic: 'vedeni' };
}

function rozlozeni(s, d) {
  const sablona = SABLONY[s.id]?.json ?? { stranka: s.id, dostupne: [], tarifem: [], zdroj: 'aplikace', rozsah: null, zamceno: false, smiUpravit: true, smiVychozi: true };
  const v = { typ: s.rozhrani, klic: d.klic, zdrojRole: null, opravneni: new Set(d.mineData.opravneni), tarif: 'max' };
  const polozky = filtrujViditelne(vychoziZKodu(s, v), v);
  return { ...sablona, stranka: s.id, polozky, zdroj: 'aplikace', verze: 0 };
}

// ---------------------------------------------------------------------------
// Data widgetů
// ---------------------------------------------------------------------------

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const MESIC = praha(0).slice(0, 7);
const PRISTI = (() => { const [y, m] = MESIC.split('-').map(Number); const d = new Date(Date.UTC(y, m, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`; })();
// Zástupné dny ze všech fixtur balíků (každá sonda si je doplňovala sama, tady naráz).
const POSUN = { DNES: 0, VCERA: -1, PREDVCEREM: -2, PREDEVCIREM: -2, ZITRA: 1, POZITRI: 2, POZDEJI: 20 };
const posunDne = (t) => (t in POSUN ? POSUN[t] : t.startsWith('PRED') ? -Number(t.slice(4)) : Number(t.slice(2)));
function nacti(jmeno) {
  const t = readFileSync(DIR + jmeno + '.json', 'utf8')
    .replaceAll('"CAS_DNES"', `"${new Date(Date.now() - 60000).toISOString()}"`)
    .replaceAll('"CAS_PREDVCEREM"', `"${new Date(Date.now() - 2 * 86400000).toISOString()}"`)
    .replace(/\b(DNES|VCERA|PREDVCEREM|PREDEVCIREM|PRED\d+|ZITRA|POZITRI|ZA\d+|POZDEJI)\b/g, (m) => praha(posunDne(m)))
    .replaceAll('PRISTI', PRISTI).replaceAll('"MESIC"', `"${MESIC}"`).replaceAll('"@-', `"${MESIC}-`);
  return JSON.parse(t);
}

// Cesta → fixtury podle balíku (první je výchozí). Balík stránky = z názvu její fixtury rozložení.
const DATA = {
  '/api/schedule/rules': [['b1', 'k69-b1-rules']],
  '/api/timeoff': [['b1', 'k69-b1-timeoff']],
  '/api/shifts/offers': [['b1', 'k69-b1-offers']],
  '/api/attendance': [['b2', 'k69-b2-attendance']],
  '/api/closings': [['b5a', 'k69-b5a-closings'], ['b2', 'k69-b2-closings']],
  '/api/closings/calendar': [['b5a', 'k69-b5a-calendar']],
  '/api/closings/handover': [['b5a', 'k69-b5a-handover'], ['b9', 'k69-b9-handover']],
  '/api/teams': [['b2', 'k69-b2-teams'], ['b6a', 'k69-b6a-teams']],
  '/api/invitations': [['b2', 'k69-b2-invitations']],
  '/api/inventory': [['b3', 'k69-b3-inventory'], ['b4', 'k69-b4-inventory']],
  '/api/inventory/categories': [['b3', 'k69-b3-categories']],
  '/api/inventory/reports': [['b3', 'k69-b3-reports']],
  '/api/inventory/log': [['b3', 'k69-b3-log']],
  '/api/inventory/shrinkage': [['b5b', 'k69-b5b-shrinkage']],
  '/api/pos/usage': [['b3', 'k69-b3-pos-usage']],
  '/api/orders': [['b3', 'k69-b3-orders']],
  '/api/stocktake': [['b3', 'k69-b3-stocktake']],
  '/api/production': [['b3', 'k69-b3-production']],
  '/api/pos/products': [['b4', 'k69-b4-pos-products']],
  '/api/menu': [['b4', 'k69-b4-menu']],
  '/api/finance/advice': [['b5b', 'k69-b5b-finance-advice']],
  '/api/pos/daily': [['b5b', 'k69-b5b-pos-daily']],
  '/api/pos/margins': [['b5b', 'k69-b5b-pos-margins']],
  '/api/pos/status': [['b5b', 'k69-b5b-pos-status']],
  '/api/receipts': [['b5b', 'k69-b5b-receipts']],
  '/api/tasks': [['b6a', 'k69-b6a-tasks']],
  '/api/planning': [['b6a', 'k69-b6a-planning']],
  '/api/procedures': [['b6b', 'k69-b6b-procedures']],
  '/api/procedures/runs': [['b6b', 'k69-b6b-runs']],
  '/api/guides': [['b6b', 'k69-b6b-guides']],
  '/api/guides/ctenari': [['b6b', 'k69-b6b-ctenari']],
  '/api/client/admin/reviews': [['b8', 'k69-b8-reviews']],
  '/api/client/staff/inbox': [['b8', 'k69-b8-inbox']],
};

const podvrh = (balik, d) => (req, json) => {
  if (req.method() !== 'GET') return undefined;
  const url = new URL(req.url());
  const path = url.pathname;
  const q = url.searchParams;
  const zam = d.role === 'employee';
  // Rozložení podle stránky: Client i ostatní pohledy vedení se ptají i na Přehled (předtažení),
  // a kdyby dostaly rozložení měřené stránky, plocha by čekala na widgety, které tam nepatří.
  if (path === '/api/rozlozeni') {
    const def = stranky.find(x => x.id === q.get('stranka'));
    return def ? json(rozlozeni(def, d)) : undefined;
  }
  // Cesty, které se liší dotazem nebo divákem (stejně jako v sondách balíků).
  if (path === '/api/schedule') return json(nacti('k69-b1-schedule'));
  if (path === '/api/availability') return json(q.get('mine') ? null : nacti('k69-b1-availability'));
  if (path === '/api/timeoff' && q.get('mine') === '1') return json(nacti('k69-b1-timeoff-mine'));
  if (path === '/api/shifts' && q.get('team') === '1') return json(nacti('k69-b1-shifts-team'));
  if (path === '/api/shifts' && q.get('employeeId')) return json(nacti('k69-b1-shifts-mine'));
  if (path === '/api/closings' && zam) return json(nacti('k69-b5a-closings-zamestnanec'));
  if (path === '/api/finance') return json({ ...nacti('k69-b5b-finance'), month: q.get('month') ?? MESIC });
  if (path === '/api/organization/overview') return json({ ...nactiJson('organization_overview'), month: q.get('month') ?? MESIC });
  if (path === '/api/rewards/catalog') return json(nacti(zam ? 'k69-b7-catalog-zam' : 'k69-b7-catalog'));
  if (path === '/api/rewards') return json(nacti(zam ? 'k69-b7-rewards-zam' : 'k69-b7-rewards'));
  if (path === '/api/suggestions') return json({ ...nacti('k69-b6a-suggestions'), isEmployer: !zam });
  if (path === '/api/fixed-assignments') return json({ assignments: [] });
  if (path === '/api/noisium') return json({ connected: false });
  if (path === '/api/suppliers') return json({ suppliers: [{ id: 1, name: 'Makro', email: 'objednavky@makro.cz' }] });
  if (path === '/api/client/admin/profile') return json({ profile: { ordering_on: false } });
  if (path === '/api/pos/places') return json({ places: [] });
  if (/^\/api\/employees\/\d+$/.test(path)) return json(nacti('k69-b2-employee'));
  if (/^\/api\/closings\/\d+$/.test(path)) return json(nacti('k69-b5a-closing-detail'));
  const kandidati = DATA[path];
  if (kandidati) {
    const vlastni = kandidati.find(([b]) => b === balik);
    if (vlastni) return json(nacti(vlastni[1]));
    // Cizí balík: když má cesta obecnou fixturu, přednost má ta. Třeba /api/teams z B2 nenese
    // tarif Max a Client nebo Akce by místo plochy ukázaly „Odemknout Max".
    if (!existsSync(DIR + path.replace(/^\/api\//, '').replaceAll('/', '_') + '.json')) return json(nacti(kandidati[0][1]));
  }
  // Ostatní cesty jdou na obecné fixtury (k68-spolecne).
  return undefined;
};

// ---------------------------------------------------------------------------
// Měření v prohlížeči
// ---------------------------------------------------------------------------

/** Viditelné h1: s rozměrem, nebo schované jen pro odečítač (sr-only nadpis tabletu). */
const pocetH1 = (p) => p.evaluate(() => [...document.querySelectorAll('h1')]
  .filter(h => h.offsetParent !== null || h.getClientRects().length > 0 || h.classList.contains('sr-only')).length);
const preteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
/**
 * Plné limetky: tlačítka a odkazy s .on-accent (a „Hotovo" lišty úprav, které je `btn btn-accent`
 * bez .on-accent) velikosti tlačítka (aspoň 40 × 26 px, práh jako
 * v k68-design). Hotová fajfka úkolu nebo zaškrtnutý krok checklistu je taky .on-accent, ale je to
 * stav bez záře, ne akce (DP T3) — ds/limetky.py je nepočítá taky. Počítá se celá stránka, ne jen
 * okno: druhá limetka pod ohybem je pořád druhá.
 */
const limetky = (p) => p.evaluate(() => [...document.querySelectorAll('button.on-accent, a.on-accent, .btn-accent')]
  .filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width >= 40 && r.height >= 26 && cs.visibility !== 'hidden' && cs.display !== 'none'; })
  .map(e => (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)));

/**
 * Známé nálezy mimo plochu, které sonda toleruje v úpravách (stránka → texty tlačítek). Teď
 * prázdné: formulář dostupnosti pod Mými směnami vedení má od integrace kola 69 tmavé
 * „Odeslat dostupnost" (AvailabilitySubmit s headingLevel h2). Nová výjimka je dluh s vlastníkem,
 * ne pravidlo — sonda ji vypisuje při každém běhu.
 */
const ZNAME_V_UPRAVACH = {};

/** Tónované karty (DP T4: nejvýš jedna na obrazovce). */
const tonovane = (p) => p.evaluate(() => [...document.querySelectorAll('.card-wait, .card-danger, .card-info, .card-accent')]
  .filter(e => e.getBoundingClientRect().height > 0)
  .map(e => (e.closest('li[data-widget]')?.getAttribute('data-widget') ?? e.className.match(/card-\w+/)?.[0]) || '?'));

const ROZMERY = [
  { klic: 'desk', viewport: { width: 1280, height: 950 }, mobil: false },
  { klic: 'tel', viewport: { width: 390, height: 844 }, mobil: true },
];

const souhrn = [];
for (const s of stranky) {
  const d = divak(s);
  const balik = /^k69-(b\w+?)-rozlozeni/.exec(SABLONY[s.id]?.jmeno ?? '')?.[1] ?? null;
  const fix = rozlozeni(s, d);
  for (const r of ROZMERY) {
    const jmeno = `${s.id}-${r.klic}`;
    const { ctx, p, chyby } = await kontext({ viewport: r.viewport, mobil: r.mobil, role: d.role, mineData: d.mineData, fix, dalsi: podvrh(balik, d) });
    // TO GO je samostatný režim aplikace; bez něj by /employer/overview ukázal Přehled.
    if (s.pohled === 'togo') await ctx.addInitScript(() => { try { localStorage.setItem('managero-app-mode', 'togo'); } catch { /* soukromé okno */ } });
    try {
      if (s.rozhrani === 'kiosk') {
        await p.goto(BASE + cesta(s), { waitUntil: 'networkidle' });
        await p.locator(`[data-plocha="${s.id}"] li[data-instance]:not([hidden])`).first().waitFor({ timeout: 15000 });
        await p.waitForTimeout(900);
      } else await otevri(p, cesta(s), s.id);
    } catch (e) {
      // Snímek toho, co místo plochy je, ať jde chyba dohledat bez druhého běhu.
      const plochy = await p.evaluate(() => [...document.querySelectorAll('[data-plocha]')].map(x => `${x.getAttribute('data-plocha')}: ${x.querySelectorAll('li[data-instance]:not([hidden])').length} li`)).catch(() => []);
      await p.screenshot({ path: `${OUT}k69-mereni-${jmeno}-chyba.png` }).catch(() => {});
      tvrdi(`${jmeno}: plocha se otevřela`, false, `${String(e).split('\n')[0]} · ${JSON.stringify(plochy)} · ${chyby.slice(0, 2).join(' | ')}`);
      await ctx.close();
      continue;
    }
    // Klid
    const h1 = await pocetH1(p);
    tvrdi(`${jmeno} klid: právě jeden h1`, h1 === 1, `${h1}×`);
    if (r.mobil) { const x = await preteceni(p); tvrdi(`${jmeno} klid: bez vodorovného přetečení`, x <= 1, `o ${x} px`); }
    const limK = await limetky(p);
    tvrdi(`${jmeno} klid: nejvýš jedna plná limetka`, limK.length <= 1, JSON.stringify(limK));
    const ton = await tonovane(p);
    tvrdi(`${jmeno} klid: nejvýš jedna tónovaná karta`, ton.length <= 1, JSON.stringify(ton));
    await p.screenshot({ path: `${OUT}k69-mereni-${jmeno}-klid.png` });
    const radek = { stranka: s.id, rozmer: r.klic, limKlid: limK.length, limUpravy: null };
    // Úpravy — tablet si rozložení neupravuje (rezim jen-cteni), takže u Směny se měří jen klid.
    if (s.rozhrani !== 'kiosk') {
      // Počítač: „Upravit" v hlavičce. Telefon: vedlejší akce hlavičky jsou v „···", takže se do
      // úprav vstupuje podržením prázdného místa pod mřížkou — stejně jako to dělá člověk.
      const tl = upravit(p);
      if (await tl.count()) await tl.click();
      else if (r.mobil) {
        const cdp = await dotyk(p);
        const pod = await mistoPodPlochou(p);
        await p.waitForTimeout(200);
        await podrzPrstem(cdp, p, pod.x, pod.y);
      }
      const vstup = await dokud(() => vUpravach(p), 3000);
      tvrdi(`${jmeno}: vstup do úprav`, vstup);
      if (vstup) {
        // Po vstupu nahoru: snímek úprav má ukázat lištu a začátek plochy, ne místo pod mřížkou.
        await p.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('main').forEach(m => { m.scrollTop = 0; }); });
        await p.waitForTimeout(500);
        if (r.mobil) { const x = await preteceni(p); tvrdi(`${jmeno} úpravy: bez vodorovného přetečení`, x <= 1, `o ${x} px`); }
        const vse = await limetky(p);
        const zname = ZNAME_V_UPRAVACH[s.id] ?? [];
        const limU = vse.filter(t => !zname.includes(t));
        if (limU.length < vse.length) console.log(`  (známý nález mimo plochu: ${JSON.stringify(vse.filter(t => zname.includes(t)))})`);
        tvrdi(`${jmeno} úpravy: nejvýš jedna plná limetka`, limU.length <= 1, JSON.stringify(limU));
        radek.limUpravy = limU.length;
        await p.screenshot({ path: `${OUT}k69-mereni-${jmeno}-upravy.png` });
      }
    }
    tvrdi(`${jmeno}: bez chyb v konzoli`, chyby.length === 0, chyby.slice(0, 2).join(' | '));
    souhrn.push(radek);
    await ctx.close();
  }
}

console.log('\nstránka × rozměr: limetky klid / úpravy');
for (const r of souhrn) console.log(`  ${r.stranka.padEnd(28)} ${r.rozmer.padEnd(5)} ${r.limKlid} / ${r.limUpravy ?? '–'}`);
tvrdi(`změřeno všech ${stranky.length} aktivních stránek na obou rozměrech`, souhrn.length === stranky.length * 2, `${souhrn.length} z ${stranky.length * 2}`);
await konec();
