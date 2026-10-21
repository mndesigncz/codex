// Retence zrušených podniků: dvě upozornění (30 a 7 dní předem), širší aktivita, idempotence.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { RETENCE, hraniceRetence, rozhodniPodnik, emailUpozorneniPodniku, rozhodniHosta } from '../../lib/retence.ts';
import { maSeZapsat, ZAPIS_KAZDYCH_MS } from '../../lib/naposledy.ts';
import { RETENCE_TEXT } from '../../lib/pravni/lhuty.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const DEN = 86400000;

export default function ({ eq, ok }: Testy) {
  eq('lhůty upozornění podniku', [RETENCE.zrusenyPodnikDni, RETENCE.podnikUpozorneniDni, RETENCE.podnikDruheUpozorneniDni], [90, 30, 7]);
  eq('texty dokumentů = lib/retence.ts', [RETENCE_TEXT.podnikUpozorneniDni, RETENCE_TEXT.podnikDruheUpozorneniDni], [RETENCE.podnikUpozorneniDni, RETENCE.podnikDruheUpozorneniDni]);

  const ted = new Date('2026-10-21T03:35:00Z');
  const pred = (dni: number) => new Date(ted.getTime() - dni * DEN);
  const den = (d: Date | null) => d ? d.toISOString().slice(0, 10) : null;
  eq('hranice prvního upozornění = 60 dní', den(hraniceRetence(ted).podnikUpozornitPred), den(pred(60)));

  const r = (v: Partial<Parameters<typeof rozhodniPodnik>[0]>) =>
    rozhodniPodnik({ konec: null, posledniAktivita: null, upozorneno30At: null, upozorneno7At: null, ted, ...v });

  eq('bez konce předplatného: nic (nemazat naslepo)', r({}).krok, 'nic');
  eq('konec před 50 dny: nic', r({ konec: pred(50) }).krok, 'nic');
  const a = r({ konec: pred(61) });
  eq('konec před 61 dny: první upozornění, smazání za 30 dní', [a.krok, den(a.smazatOd)], ['upozornit30', den(new Date(ted.getTime() + 30 * DEN))]);
  eq('konec před 200 dny (retence zapnutá pozdě): upozornit, smazat nejdřív za 30 dní', [r({ konec: pred(200) }).krok, den(r({ konec: pred(200) }).smazatOd)], ['upozornit30', den(new Date(ted.getTime() + 30 * DEN))]);
  eq('aktivita před 40 dny drží podnik i po starém konci', r({ konec: pred(300), posledniAktivita: pred(40) }).krok, 'nic');
  eq('po prvním upozornění (před 10 dny): čekat', r({ konec: pred(80), upozorneno30At: pred(10) }).krok, 'cekat');
  const b = r({ konec: pred(85), upozorneno30At: pred(24) });
  eq('7 dní před smazáním: druhé upozornění', [b.krok, den(b.smazatOd)], ['upozornit7', den(new Date(ted.getTime() + 7 * DEN))]);
  eq('druhé upozornění před 3 dny: čekat', r({ konec: pred(95), upozorneno30At: pred(33), upozorneno7At: pred(3) }).krok, 'cekat');
  eq('obě upozornění včas a lhůta uplynula: smazat', r({ konec: pred(95), upozorneno30At: pred(35), upozorneno7At: pred(8) }).krok, 'smazat');
  eq('bez druhého upozornění se nesmaže ani po lhůtě', r({ konec: pred(120), upozorneno30At: pred(40) }).krok, 'upozornit7');
  eq('aktivita po upozornění: upozornění propadají', r({ konec: pred(120), posledniAktivita: pred(5), upozorneno30At: pred(40), upozorneno7At: pred(10) }).krok, 'nic');
  eq('staré upozornění z dřívějška (před aktivitou) se nepočítá', r({ konec: pred(200), posledniAktivita: pred(70), upozorneno30At: pred(100), upozorneno7At: pred(90) }).krok, 'upozornit30');
  eq('druhé upozornění starší než první se nepočítá', r({ konec: pred(100), upozorneno30At: pred(35), upozorneno7At: pred(36) }).krok, 'upozornit7');
  eq('upozornění 30 dní předem musí uplynout celé (pozdní první e-mail)', r({ konec: pred(150), upozorneno30At: pred(29), upozorneno7At: pred(8) }).krok, 'cekat');

  const m = emailUpozorneniPodniku({ podnik: 'Kavárna <U Lípy>', jmeno: 'Eva', datum: '20. 11. 2026', druhe: false, odkazPrihlaseni: 'https://x.cz/login', odkazData: 'https://x.cz/employer/overview?view=settings&tab=privacy' });
  ok('e-mail: datum, přihlášení, export a escapovaný název', /20\. 11\. 2026/.test(m.html) && /Přihlásit se/.test(m.html) && /tab=privacy/.test(m.html) && /Kavárna &lt;U Lípy&gt;/.test(m.html) && /čl\. 19/.test(m.html));
  ok('e-mail: druhé upozornění má jiný předmět', /Za 7 dní/.test(emailUpozorneniPodniku({ podnik: 'A', jmeno: '', datum: 'x', druhe: true, odkazPrihlaseni: '', odkazData: '' }).subject));

  // Hosté: 24 měsíců + upozornění 30 dní předem (balík G) — beze změny.
  eq('host: bez upozornění se neanonymizuje ani po lhůtě', rozhodniHosta({ posledniAktivita: pred(1000), upozornenoAt: null, ted }), 'upozornit');

  // „Naposledy v aplikaci“
  ok('naposledy: první zápis ano, do 6 h ne, potom znovu', maSeZapsat(undefined, 1) && !maSeZapsat(1000, 1000 + ZAPIS_KAZDYCH_MS - 1) && maSeZapsat(1000, 1000 + ZAPIS_KAZDYCH_MS));
  ok('relace zapisuje naposledy (lib/auth.ts)', /await zaznamenejNavstevu\(id\)/.test(cti('lib/auth.ts')));

  // Napojení
  const db = cti('lib/retenceDb.ts');
  ok('aktivita podniku: přihlášení členů, zprávy, úkoly, směny, uzávěrky, docházka', ['u.naposledy_at', 'device_tokens', 'audit_log', 'time_entries', 'chat_messages', 'FROM messages', 'FROM tasks', 'FROM shifts', 'cash_closings'].every(x => db.includes(x)));
  ok('host: i otevření aplikace na webu', /u\.retence_ponechat_at, u\.naposledy_at/.test(db));
  ok('rozhoduje čistá funkce rozhodniPodnik', /rozhodniPodnik\(\{ konec: p\.konec/.test(db));
  ok('upozornění: zabrání zápisem, vrácení při neodeslání (žádné dvojí e-maily)', /UPDATE teams SET retence_upozorneno30_at = NOW\(\) WHERE id = \$\{p\.id\} AND subscription_status = 'canceled'/.test(db) && /if \(!zabrano\.length\) return 'obsazeno'/.test(db) && /return 'neodeslano'/.test(db));
  ok('příjemci: vlastník a předplatne.spravovat', /clenoveSOpravnenim\(teamId, 'predplatne\.spravovat'\)/.test(db));
  ok('mazání jen po druhém upozornění a se zrušeným předplatným', /subscription_status = 'canceled' AND retence_upozorneno7_at IS NOT NULL/.test(db));
  const init = cti('app/api/init/route.ts');
  ok('init: sloupce naposledy a upozornění podniku', /users ADD COLUMN IF NOT EXISTS naposledy_at/.test(init) && /retence_upozorneno30_at/.test(init) && /retence_upozorneno7_at/.test(init));
  ok('/api/health dál hlásí retenceOstra', /retenceOstra/.test(cti('lib/zdravi.ts')));
}
