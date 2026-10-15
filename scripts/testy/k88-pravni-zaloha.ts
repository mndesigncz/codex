// Záloha dat (spuštění, balík P): odkaz s podpisem místo přílohy, bez soukromých
// zpráv a bez sazeb a mezd. Čistá logika lib/pravni/zalohaOdkaz.ts a hlídání zdrojů.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  PLATNOST_ODKAZU_DNI, VYRAZENE_SLOUPCE, KONVERZACE_V_ZALOZE, bezVyrazenych, cestaOdkazuZalohy, overOdkazZalohy, podepisOdkazZalohy,
} from '../../lib/pravni/zalohaOdkaz.ts';
import { KATALOG } from '../../lib/opravneniKatalog.ts';
import { AUDIT_POPISKY } from '../../lib/auditPopisky.ts';

const TAJ = 'design-round-secret-0123456789ab';
const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  const ted = new Date('2026-10-14T06:00:00Z');
  const token = podepisOdkazZalohy(12, TAJ, ted)!;
  ok('odkaz: token má tvar podnik.vyprseni.podpis', /^12\.\d+\.[A-Za-z0-9_-]+$/.test(token));
  const o = overOdkazZalohy(token, TAJ, ted);
  ok('odkaz: vlastní token projde a nese podnik', o.ok && o.teamId === 12);
  ok('odkaz: platí 7 dní', o.ok && o.vyprsi.getTime() - ted.getTime() === PLATNOST_ODKAZU_DNI * 86400_000);
  eq('odkaz: po 7 dnech vypršel', overOdkazZalohy(token, TAJ, new Date(ted.getTime() + 7 * 86400_000 + 1000)), { ok: false, duvod: 'vyprsel' });
  ok('odkaz: šest dní a 23 h ještě platí', overOdkazZalohy(token, TAJ, new Date(ted.getTime() + 7 * 86400_000 - 3600_000)).ok);
  const [id, exp, sig] = token.split('.');
  eq('odkaz: cizí podnik se stejným podpisem neprojde', overOdkazZalohy(`13.${exp}.${sig}`, TAJ, ted), { ok: false, duvod: 'neplatny' });
  eq('odkaz: prodloužená platnost neprojde', overOdkazZalohy(`${id}.${Number(exp) + 86400}.${sig}`, TAJ, ted), { ok: false, duvod: 'neplatny' });
  eq('odkaz: jiné tajemství neprojde', overOdkazZalohy(token, TAJ + 'x', ted), { ok: false, duvod: 'neplatny' });
  ok('odkaz: smetí a prázdné neprojdou', [null, '', 'abc', '12.34', '1.2.3', 'x'.repeat(300), 42].every(v => !overOdkazZalohy(v, TAJ, ted).ok));
  ok('odkaz: bez tajemství se nepodepisuje ani neověřuje', podepisOdkazZalohy(12, undefined, ted) === null && podepisOdkazZalohy(12, 'kratke', ted) === null && !overOdkazZalohy(token, undefined, ted).ok);
  ok('odkaz: neplatný podnik se nepodepíše', podepisOdkazZalohy(0, TAJ, ted) === null && podepisOdkazZalohy(-3, TAJ, ted) === null && podepisOdkazZalohy(1.5, TAJ, ted) === null);
  eq('odkaz: cesta na stažení', cestaOdkazuZalohy('1.2.ab-c'), '/api/backup/stahnout?t=1.2.ab-c');

  // ---- co do zálohy nesmí ----
  const radek = { id: 1, user_id: 3, role: 'employee', hourly_rate: 180, contract_type: 'dpp', wage_earned: 1200, self_payout: 900, token: 'abc', password_hash: 'x', admin_note: 'interní', name: 'Eva' };
  eq('sloupce: sazby, mzdy, smlouvy, tokeny a heslo pryč', bezVyrazenych(radek), { id: 1, user_id: 3, role: 'employee', name: 'Eva' });
  ok('sloupce: vstup se nemění', radek.hourly_rate === 180);
  ok('sloupce: DPH sazby podniku nejsou mzda (zůstávají)', !VYRAZENE_SLOUPCE.includes('vat_rates'));
  eq('chat: v záloze jen týmový kanál', [...KONVERZACE_V_ZALOZE], ['team']);

  const data = cti('app/api/backup/_data.ts');
  const cron = cti('app/api/backup/route.ts');
  const email = cti('lib/email.ts');
  ok('záloha: tabulky oznámení a úprav mezd v seznamu nejsou', !/name: 'notifications'/.test(data) && !/name: 'wage_adjustments'/.test(data) && !/name: 'payroll/.test(data));
  ok('záloha: konverzace jen přes bílou listinu druhů', /name: 'conversations', scopedBy: 'team_id = \$1 AND type = ANY\(\$2::text\[\]\)'/.test(data));
  ok('záloha: každý řádek prochází bezVyrazenych', /rows\.map\(r => bezVyrazenych\(r\)\)/.test(data));
  ok('cron: neposílá data ani přílohu, jen podepsaný odkaz', !/dumpTeam/.test(cron) && /podepisOdkazZalohy/.test(cron));
  const fce = email.slice(email.indexOf('export async function sendBackupEmail'), email.indexOf('export async function sendOrderEmail'));
  ok('e-mail zálohy: bez přílohy', fce.length > 0 && !/attachments/.test(fce));
  const stahnout = cti('app/api/backup/stahnout/route.ts');
  ok('stažení: ověří odkaz, přihlášení i data.zaloha v podniku z odkazu', /overOdkazZalohy/.test(stahnout) && /getServerSession/.test(stahnout) && /maOpravneni\(meId, overeni\.teamId, 'data\.zaloha'\)/.test(stahnout));
  ok('stažení: zapisuje se do historie s popiskem', /'data\.zaloha\.stazeni'/.test(stahnout) && !!AUDIT_POPISKY['data.zaloha.stazeni']);
  const popis = KATALOG.find(k => k.id === 'data.zaloha')?.popis ?? '';
  ok('oprávnění data.zaloha: popis mluví o odkazu, ne o kompletních mzdách a chatu', /odkaz/.test(popis) && /bez soukromých zpráv/.test(popis) && !/mzdy, sazby/.test(popis));
}
