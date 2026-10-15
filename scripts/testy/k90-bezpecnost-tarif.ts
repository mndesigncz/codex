// Tarif vynucený na serveru (spuštění, balík S): každá routa placené funkce
// v ROUTY_TARIFU opravdu volá pozadujTarif se správným tarifem.
import { readFileSync, existsSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { ROUTY_TARIFU, staciTarifu, hlaskaTarifu } from '../../lib/tarifPravidla.ts';
import { planInfoOf } from '../../lib/plan.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

/** Tělo handleru `export async function METODA(` až po další export. */
function telo(zdroj: string, metoda: string): string | null {
  const i = zdroj.indexOf(`export async function ${metoda}(`);
  if (i < 0) return null;
  const j = zdroj.indexOf('\nexport async function', i + 10);
  return zdroj.slice(i, j < 0 ? undefined : j);
}

export default function ({ eq, ok }: Testy) {
  ok('pravidla: Zdarma nestačí na Pro ani Max', !staciTarifu('free', 'pro') && !staciTarifu('free', 'max'));
  ok('pravidla: Pro stačí na Pro, ne na Max', staciTarifu('pro', 'pro') && !staciTarifu('pro', 'max'));
  ok('pravidla: Max stačí na všechno', staciTarifu('max', 'pro') && staciTarifu('max', 'max'));
  ok('hláška: „Tahle funkce je v tarifu Pro“ / Max', hlaskaTarifu('pro').startsWith('Tahle funkce je v tarifu Pro') && hlaskaTarifu('max').startsWith('Tahle funkce je v tarifu Max'));

  // Zkušební doba a ruční tarif = jako dnes (planInfoOf).
  const ted = Date.parse('2026-10-15T10:00:00Z');
  const zitra = '2026-10-16T10:00:00Z';
  eq('zkušební Pro (Stripe trialing) = Pro', planInfoOf({ plan: 'pro', subscription_status: 'trialing', trial_end: zitra }, ted).effective, 'pro');
  eq('zkušební Max = Max', planInfoOf({ plan: 'max', subscription_status: 'trialing', trial_end: zitra }, ted).effective, 'max');
  eq('starý trial bez karty = Pro', planInfoOf({ plan: 'free', trial_ends_at: zitra }, ted).effective, 'pro');
  eq('ruční Max od správce přebije Zdarma', planInfoOf({ plan: 'free', plan_override: 'max' }, ted).effective, 'max');
  eq('podnik z doby před tarify (NULL) = Pro, nikdo se nezamkne', planInfoOf({ plan: null }, ted).effective, 'pro');

  ok('seznam rout není prázdný a nemá duplicity', ROUTY_TARIFU.length >= 25 && new Set(ROUTY_TARIFU.map(r => r.soubor)).size === ROUTY_TARIFU.length);
  for (const r of ROUTY_TARIFU) {
    if (!existsSync(new URL(`../../${r.soubor}`, import.meta.url))) { ok(`${r.soubor}: soubor existuje`, false); continue; }
    const zdroj = cti(r.soubor);
    for (const m of r.metody) {
      const t = telo(zdroj, m);
      ok(`${r.funkce} (${m} ${r.soubor.replace(/^app\/api\//, '/api/').replace(/\/route\.ts$/, '')}): pozadujTarif '${r.tarif}' + return`,
        !!t && new RegExp(`const tarif = await pozadujTarif\\([\\w.]+, '${r.tarif}'\\);\\s*if \\(tarif\\) return tarif;`).test(t));
    }
    ok(`${r.soubor}: žádná stará brána 403 / MAX_ONLY_MSG`, !/teamIsPro|teamIsMax|PRO_ONLY_MSG|MAX_ONLY_MSG/.test(zdroj));
  }
  const att = telo(cti('app/api/attendance/route.ts'), 'POST')!;
  ok('kiosk: tarif jen pro účet tabletu, vlastní píchnutí zůstává ve Zdarma', /if \(c\.role\.typ === 'kiosk'\) \{\s*const tarif = await pozadujTarif\(c\.teamId, 'pro'\);/.test(att));
  ok('kiosk: offline fronta (sync) se neodmítá — píchnutí se neztratí', !/pozadujTarif/.test(cti('app/api/attendance/sync/route.ts')));
  const srv = cti('lib/tarifServer.ts');
  ok('brána: 402 se srozumitelnou hláškou', /status: 402/.test(srv) && /hlaskaTarifu\(potreba\)/.test(srv));
  ok('brána: výpadek databáze nikoho nezamkne', /if \(effective == null \|\| staciTarifu\(effective, potreba\)\) return null;/.test(srv));
  ok('brána: mezipaměť 10 s a zapomenTarif po webhooku', /TTL_MS = 10_000/.test(srv) && /zapomenTarif\(id\)/.test(cti('lib/billing.ts')));
  ok('obsluha hostů se nezamyká (uplatnění poukazu a kuponu, razítko, rezervace)', ['app/api/client/admin/redeem/route.ts', 'app/api/client/admin/vouchers/redeem/route.ts', 'app/api/client/admin/stamps/member/route.ts', 'app/api/client/admin/reservations/route.ts', 'app/api/client/admin/customers/route.ts']
    .every(f => !/pozadujTarif/.test(cti(f))));
  ok('mazání se nezamyká (DELETE bez tarifu)', ROUTY_TARIFU.every(r => !r.metody.includes('DELETE')));
}
