// Spuštění, balík G — retence osobních údajů a e-maily k platbám.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  RETENCE, retenceZapnuta, hraniceRetence, rozhodniHosta, minusMesice, denAnonymizace, tokenPonechani, overTokenPonechani,
  emailUpozorneni, prazdnySouhrn,
} from '../../lib/retence.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const DEN = 86400000;

export default function ({ eq, ok }: Testy) {
  // ---- přepínač ----
  ok('výchozí stav je náhled', !retenceZapnuta({}) && !retenceZapnuta({ RETENCE_ZAPNUTA: 'true' }) && !retenceZapnuta({ RETENCE_ZAPNUTA: '0' }));
  ok('ostře jen s RETENCE_ZAPNUTA=1', retenceZapnuta({ RETENCE_ZAPNUTA: '1' }) && retenceZapnuta({ RETENCE_ZAPNUTA: ' 1 ' }));
  eq('lhůty podle zadání', [RETENCE.neaktivniHostMesicu, RETENCE.upozorneniPredemDni, RETENCE.auditLogLet, RETENCE.oznameniDni, RETENCE.zrusenyPodnikDni], [24, 30, 3, 365, 90]);

  // ---- hranice ----
  eq('minus měsíce: konec měsíce', [minusMesice(new Date('2026-03-31T12:00:00Z'), 1).toISOString().slice(0, 10), minusMesice(new Date('2026-10-15T00:00:00Z'), 24).toISOString().slice(0, 10)], ['2026-02-28', '2024-10-15']);
  const ted = new Date('2026-10-15T03:35:00Z');
  const h = hraniceRetence(ted);
  eq('hranice', [h.neaktivniPred.toISOString().slice(0, 10), h.upozornitPred.toISOString().slice(0, 10), h.auditPred.toISOString().slice(0, 10), h.oznameniPred.toISOString().slice(0, 10), h.podnikKonecPred.toISOString().slice(0, 10)],
    ['2024-10-15', '2024-11-14', '2023-10-15', '2025-10-15', '2026-07-17']);

  // ---- rozhodnutí o hostovi ----
  const pred = (dni: number) => new Date(ted.getTime() - dni * DEN);
  eq('aktivní host: nic', rozhodniHosta({ posledniAktivita: pred(100), upozornenoAt: null, ted }), 'nic');
  eq('23 měsíců a kousek (méně než 30 dní do lhůty): upozornit', rozhodniHosta({ posledniAktivita: new Date(h.upozornitPred.getTime() - DEN), upozornenoAt: null, ted }), 'upozornit');
  eq('upozorněný před 10 dny: čekat', rozhodniHosta({ posledniAktivita: pred(800), upozornenoAt: pred(10), ted }), 'cekat');
  eq('upozorněný před 30 dny a neaktivní 24 měsíců: anonymizovat', rozhodniHosta({ posledniAktivita: pred(800), upozornenoAt: pred(30), ted }), 'anonymizovat');
  eq('aktivita po upozornění: upozornění propadá (a host už není neaktivní)', rozhodniHosta({ posledniAktivita: pred(5), upozornenoAt: pred(40), ted }), 'nic');
  eq('staré upozornění před poslední aktivitou se nepočítá: upozornit znovu', rozhodniHosta({ posledniAktivita: pred(720), upozornenoAt: pred(900), ted }), 'upozornit');
  eq('bez jakékoli aktivity v datech: nic (nemazat naslepo)', rozhodniHosta({ posledniAktivita: null, upozornenoAt: null, ted }), 'nic');
  eq('den anonymizace = upozornění + 30 dní', denAnonymizace(ted).toISOString().slice(0, 10), '2026-11-14');

  // ---- Ponechat účet ----
  const env = { NEXTAUTH_SECRET: 'test-tajemstvi' };
  const t = tokenPonechani(18, env);
  ok('token: tvar a ověření', /^18\.[0-9a-f]{24}$/.test(t) && overTokenPonechani(t, env) === 18);
  ok('token: cizí id ani jiné tajemství neprojde', overTokenPonechani(t.replace(/^18/, '19'), env) === null && overTokenPonechani(t, { NEXTAUTH_SECRET: 'jine' }) === null && overTokenPonechani('x', env) === null);
  const m = emailUpozorneni({ jmeno: 'Klára <K>', datum: '14. 11. 2026', odkaz: 'https://x.cz/api/retence/ponechat?t=1' });
  ok('upozornění: datum, tlačítko a escapované jméno', /14\. 11\. 2026/.test(m.html) && /Ponechat účet/.test(m.html) && /Klára &lt;K&gt;/.test(m.html));

  // ---- souhrn bez osobních údajů ----
  const s = prazdnySouhrn('nahled', h);
  ok('souhrn: režim, hranice jako text, jen počty a id', s.rezim === 'nahled' && typeof s.hranice.neaktivniPred === 'string' && Array.isArray(s.hoste.ukazkaId) && !('email' in s.hoste));

  // ---- napojení ----
  const db = cti('lib/retenceDb.ts');
  ok('náhled nic nemaže ani neposílá: každá akce za podmínkou ostry', /if \(!v\.ostry \|\| udelano >= RETENCE\.davkaHostu/.test(db) && /if \(v\.ostry && s\.auditLog\.kSmazani\)/.test(db) && /if \(v\.ostry && s\.oznameni\.kSmazani\)/.test(db) && /if \(!v\.ostry \|\| Date\.now\(\) > konec\) continue;\s*try \{\s*if \(krok === 'smazat'\)/.test(db));
  ok('anonymizace přes smazaniUctu (stejná cesta jako Smazat účet)', /smazUcet\(x\.id, \{ zDuvodu: 'retence' \}\)/.test(db));
  ok('každý běh se zapíše do retence_behy', /INSERT INTO retence_behy/.test(db) && /await zapisBeh\(s\)/.test(db));
  const cron = cti('app/api/retence/route.ts');
  ok('cron: brána CRON_SECRET a ostrý režim jen podle proměnné', /checkCron\(request\)/.test(cron) && /ostry: retenceZapnuta\(\)/.test(cron));
  ok('správa platformy smí jen náhled', /spustRetenci\(\{ ostry: false/.test(cti('app/api/admin/retence/route.ts')) && /requireSuperadmin/.test(cti('app/api/admin/retence/route.ts')));
  ok('cron je ve vercel.json', JSON.parse(cti('vercel.json')).crons.some((c: { path: string }) => c.path === '/api/retence'));
  ok('init: sloupce retence a tabulka běhů', /retence_upozorneno_at/.test(cti('app/api/init/route.ts')) && /CREATE TABLE IF NOT EXISTS retence_behy/.test(cti('app/api/init/route.ts')));

  // ---- e-maily k platbám ----
  const billing = cti('lib/billing.ts');
  ok('payment_failed i trial_will_end posílají e-mail vlastníkovi', /emailVlastnikoviOPlatbe\(Number\(t\.id\), 'platba_selhala'/.test(billing) && /emailVlastnikoviOPlatbe\(teamId, 'konec_zkousky'/.test(billing));
  const email = cti('lib/email.ts');
  ok('šablona: odkaz na Předplatné a escapování', /sendPlatbaEmail/.test(email) && /tab=billing/.test(email) && /escHtml\(text\)/.test(email));
  ok('e-mail jde vlastníkovi podniku', /JOIN users u ON u\.id = t\.owner_id/.test(cti('lib/platbyEmailDb.ts')));

  // ---- úklid ----
  ok('uzávěrka: nevyužitý popisek „Dát trest za manko“ je pryč', !/Dát trest za manko/.test(cti('components/employer/ClosingDetail.tsx')));
}
