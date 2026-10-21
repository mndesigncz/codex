// Izolace podniků (spuštění, balík S).
//
// Každý dotaz v app/api nad tabulkou se sloupcem team_id, který vybírá,
// mění nebo maže řádek podle `id` z parametru (`WHERE id = ${…}`,
// `x.id = ANY(${…})`), musí ve WHERE mít i team_id — jinak stačí v požadavku
// poslat cizí id a routa sáhne do jiného podniku. Výjimka je možná, ale jen
// na listině VYJIMKY níž s důvodem (id ověřené předchozím dotazem s team_id,
// řádek patří osobě, ne podniku, cron přes všechny podniky…).
//
// Kontrola parsuje SQL stejnou gramatikou jako check-sql (libpg_query) a bere
// schéma z DDL v app/api/init/route.ts. Je schválně shovívavá: team_id kdekoli
// ve WHERE (i v poddotazu nebo u připojené tabulky) stačí. Hledá zapomenuté
// filtry, ne důkaz bezpečnosti.
//
// Výjimka, která už nic nenachází, je chyba taky — listina nesmí zastarat.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'libpg-query';
import { nactiSchema } from './ddl-schema.mjs';

/**
 * Výjimky: `soubor|tabulka` → důvod. Klíč platí pro všechny nálezy té tabulky
 * v souboru; důvod musí říct, proč cizí id neprojde.
 */
export const VYJIMKY = {
  'app/api/billing/webhook/route.ts|billing_events': 'id je id události Stripe z podepsaného webhooku (idempotence), ne řádek podniku z požadavku',
  'app/api/client/b/[slug]/promo/route.ts|client_promos': 'vratPouziti dostává promo.id z dotazu „code AND team_id" o pár řádků výš',
  'lib/klient/promo.ts|client_promos': 'vratPouziti dostává promo.id z dotazu „code AND team_id" o pár řádků výš (logika promo routy, sdílená s „Mám kód“)',
  'app/api/client/staff/scan/route.ts|client_scan_actions': 'akceId je z INSERT … RETURNING téhož požadavku (vrácení akce při kolizi účtenky)',
  'app/api/navic/route.ts|extra_work': 'id je z INSERT … RETURNING téhož požadavku (zápis navíc s team_id)',
};

const schema = nactiSchema();
// users.team_id je jen zrcadlo aktivního podniku: člověk patří do více podniků
// a příslušnost hlídá členství (team_members, jeClenem), ne tenhle sloupec.
const BEZ_PODNIKU = new Set(['users']);
const sTeamId = new Set([...schema].filter(([t, cols]) => cols.has('team_id') && !BEZ_PODNIKU.has(t)).map(([t]) => t));
// Řádek vybraný i podle vlastníka z relace (host, zaměstnanec, autor) je jeho, ne podniku.
const VLASTNIK = new Set(['customer_id', 'user_id', 'employee_id', 'author_id', 'sender_id']);

const soubory = [];
function projdi(p) {
  const st = statSync(p);
  if (st.isDirectory()) { for (const f of readdirSync(p)) projdi(join(p, f)); return; }
  if (/\.(ts|tsx)$/.test(p) && !/\.d\.ts$/.test(p)) soubory.push(p);
}
// TENANT_KOREN: jiná složka (test s ukázkovými routami); výjimky se pak nehlídají.
const KOREN = process.env.TENANT_KOREN || 'app/api';
projdi(KOREN);

/** Tagged templates sql`…` s $n místo ${…} (stejně jako check-sql). */
function dotazy(zdroj) {
  const out = [];
  const re = /(\bsql\w*|\bdb|\bneon\([^)]*\))\s*`/g;
  let m;
  while ((m = re.exec(zdroj))) {
    let i = m.index + m[0].length; let hloubka = 0; let text = ''; let n = 0;
    const radek = zdroj.slice(0, m.index).split('\n').length;
    const vyrazy = [''];
    for (; i < zdroj.length; i++) {
      const ch = zdroj[i];
      if (hloubka === 0) {
        if (ch === '`') break;
        if (ch === '$' && zdroj[i + 1] === '{') { hloubka = 1; i++; text += `$${++n}`; vyrazy[n] = ''; continue; }
        if (ch === '\\') { text += zdroj[i + 1] ?? ''; i++; continue; }
        text += ch;
      } else {
        if (ch === '{') hloubka++;
        else if (ch === '}') { hloubka--; if (hloubka === 0) continue; }
        else if (ch === '`') { i++; while (i < zdroj.length && zdroj[i] !== '`') i++; }
        vyrazy[n] += ch;
      }
    }
    re.lastIndex = i + 1;
    out.push({ text, radek, vyrazy: vyrazy.map(v => v.trim()) });
  }
  return out;
}

function* uzly(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) yield* uzly(x); return; }
  yield node;
  for (const k of Object.keys(node)) yield* uzly(node[k]);
}

const sloupec = (cr) => (cr?.fields ?? []).map(f => f.String?.sval).filter(Boolean);
const jeParam = (n) => !!n && (n.ParamRef || (n.TypeCast && n.TypeCast.arg?.ParamRef));
const jeParamNeboAny = (n) => jeParam(n) || (n?.FuncCall && (n.FuncCall.args ?? []).some(jeParam)) || (n?.SubLink == null && n?.A_ArrayExpr == null && false);

/** Tabulky (alias → tabulka) v FROM/UPDATE/DELETE jednoho příkazu, bez poddotazů. */
function cile(stmt) {
  const out = new Map();
  const rv = (r) => { if (r && !r.schemaname) out.set(r.alias?.aliasname ?? r.relname, r.relname); };
  const fromItem = (it) => {
    if (!it) return;
    if (it.RangeVar) rv(it.RangeVar);
    else if (it.JoinExpr) { fromItem(it.JoinExpr.larg); fromItem(it.JoinExpr.rarg); }
  };
  if (stmt.SelectStmt) for (const f of stmt.SelectStmt.fromClause ?? []) fromItem(f);
  if (stmt.UpdateStmt) { rv(stmt.UpdateStmt.relation); for (const f of stmt.UpdateStmt.fromClause ?? []) fromItem(f); }
  if (stmt.DeleteStmt) { rv(stmt.DeleteStmt.relation); for (const f of stmt.DeleteStmt.usingClause ?? []) fromItem(f); }
  return out;
}

/**
 * Je parametr z požadavku? Holý identifikátor (`id`, `ids`, `entryId`), člen těla
 * nebo adresy (`b.id`, `body.x`, `params.id`) a jejich parseInt/Number. Člen
 * řádku z databáze (`open.id`, `task.series_id`) se bere za ověřený dotazem,
 * který ho vrátil — to je shovívavost, kterou kontrola přiznává.
 */
export function zPozadavku(vyraz) {
  let v = String(vyraz ?? '').trim();
  for (let k = 0; k < 3; k++) {
    const m = v.match(/^(?:parseInt|Number|Math\.round|Math\.trunc|String)\((.*?)(?:,\s*10)?\)$/s);
    if (!m) break;
    v = m[1].trim();
  }
  v = v.replace(/\s+as\s+[\w[\]<>]+$/, '').replace(/!$/, '');
  return /^[A-Za-z_$][\w$]*$/.test(v) || /^(b|body|params|data|input|query|searchParams)\??\.[\w$]+$/.test(v) || /^searchParams\.get\(/.test(v);
}

/** Podmínky `alias.id = $n` / `id = $n` / `id = ANY($n)` přímo ve WHERE (ne v poddotazu). */
function idZParametru(where, aliasy, vyrazy = []) {
  const nalez = [];
  const projdiBool = (n) => {
    if (!n) return;
    if (n.BoolExpr) { for (const a of n.BoolExpr.args ?? []) projdiBool(a); return; }
    const e = n.A_Expr;
    if (!e || !(e.name ?? []).some(x => x.String?.sval === '=')) return;
    for (const [l, r] of [[e.lexpr, e.rexpr], [e.rexpr, e.lexpr]]) {
      const f = l?.ColumnRef ? sloupec(l.ColumnRef) : null;
      if (!f || f[f.length - 1] !== 'id') continue;
      const anyParam = e.kind === 'AEXPR_OP_ANY' && jeParam(r);
      if (!jeParam(r) && !anyParam && !(r?.FuncCall && (r.FuncCall.args ?? []).some(jeParam))) continue;
      const pr = r?.ParamRef ?? r?.TypeCast?.arg?.ParamRef ?? (r?.FuncCall?.args ?? []).map(a => a.ParamRef ?? a.TypeCast?.arg?.ParamRef).find(Boolean);
      if (pr && vyrazy[pr.number] != null && !zPozadavku(vyrazy[pr.number])) continue;
      const alias = f.length > 1 ? f[f.length - 2] : null;
      const tabulka = alias ? aliasy.get(alias) : aliasy.size === 1 ? [...aliasy.values()][0] : null;
      if (tabulka) nalez.push(tabulka);
    }
  };
  projdiBool(where);
  return nalez;
}

const maTeamId = (where) => { for (const n of uzly(where)) if (n.ColumnRef && sloupec(n.ColumnRef).includes('team_id')) return true; return false; };
const maVlastnika = (where) => { for (const n of uzly(where)) if (n.ColumnRef && sloupec(n.ColumnRef).some(c => VLASTNIK.has(c))) return true; return false; };

const nalezy = [];
const pouziteVyjimky = new Set();
let pocet = 0;
for (const f of soubory) {
  const zdroj = readFileSync(f, 'utf8');
  // Dva průchody: tabulky, které funkce někde ověřuje podle id A team_id
  // (typicky „SELECT … WHERE id = $1 AND team_id = $2" a pak UPDATE podle id),
  // se v téže funkci berou za ověřené. Shovívavé, ale bez toho by kontrola
  // křičela u každé routy, která si řádek nejdřív najde a pak mění.
  const kandidati = [];
  // Ověření platí v rámci jedné funkce (handleru nebo pomocné funkce): ověřit
  // řádek v GET a pak ho bez team_id měnit v PATCH by nestačilo.
  const zacatky = [...zdroj.matchAll(/^(?:export )?(?:async )?function |^const \w+ = async /gm)].map(m => zdroj.slice(0, m.index).split('\n').length);
  const oblast = (radek) => { let o = 0; for (const z of zacatky) if (z <= radek) o = z; return o; };
  // oblast|tabulka → první řádek, kde funkce řádek ověřila (ověření platí jen pro dotazy za ním).
  const overene = new Map();
  for (const d of dotazy(zdroj)) {
    let tree;
    try { tree = await parse(d.text); } catch { continue; }
    pocet++;
    for (const n of uzly(tree)) {
      const stmt = n.SelectStmt ? n : n.UpdateStmt ? n : n.DeleteStmt ? n : null;
      if (!stmt) continue;
      const telo = stmt.SelectStmt ?? stmt.UpdateStmt ?? stmt.DeleteStmt;
      const where = telo.whereClause;
      if (!where) continue;
      const aliasy = cile(stmt);
      // SELECT, který s řádkem vrací i team_id (nebo *), slouží k ověření v kódu
      // (`Number(row.team_id) !== teamId` → 404): tabulka se v souboru bere za ověřenou.
      const vraciTeamId = !!stmt.SelectStmt && (stmt.SelectStmt.targetList ?? []).some(rt => {
        const cr = rt.ResTarget?.val?.ColumnRef;
        if (!cr) return false;
        const f = cr.fields ?? [];
        return f.some(x => x.A_Star) || sloupec(cr).at(-1) === 'team_id';
      });
      for (const t of new Set(idZParametru(where, aliasy, d.vyrazy))) {
        if (!sTeamId.has(t)) continue;
        if (maTeamId(where) || vraciTeamId) {
          const k = `${oblast(d.radek)}|${t}`;
          overene.set(k, Math.min(overene.get(k) ?? Infinity, d.radek));
          continue;
        }
        if (maVlastnika(where)) continue;
        kandidati.push({ t, radek: d.radek, oblast: oblast(d.radek) });
      }
    }
  }
  for (const { t, radek, oblast: o } of kandidati) {
    if ((overene.get(`${o}|${t}`) ?? Infinity) < radek) continue;
    const klic = `${f}|${t}`;
    if (VYJIMKY[klic]) { pouziteVyjimky.add(klic); continue; }
    nalezy.push(`${f}:${radek}  ${t}: řádek podle id z požadavku bez team_id`);
  }
}

const zastarale = process.env.TENANT_KOREN ? [] : Object.keys(VYJIMKY).filter(k => !pouziteVyjimky.has(k));
if (nalezy.length || zastarale.length) {
  if (nalezy.length) {
    console.error(`Izolace podniků: ${nalezy.length} dotazů vybírá řádek podle id bez team_id:\n`);
    for (const n of nalezy) console.error('  ' + n);
    console.error('\nPřidej `AND team_id = ${teamId}` (nebo výjimku s důvodem do VYJIMKY ve scripts/check-tenant.mjs).');
  }
  if (zastarale.length) {
    console.error(`\nVýjimky, které už nic nenacházejí (smaž je):`);
    for (const z of zastarale) console.error('  ' + z);
  }
  process.exit(1);
}
console.log(`Izolace podniků: ${pocet} dotazů v app/api, ${sTeamId.size} tabulek s team_id, ${Object.keys(VYJIMKY).length} výjimek s důvodem — žádný řádek podle id bez team_id.`);
