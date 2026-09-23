// Kontrola SQL bez databáze.
//
// Aplikace nemá lokální Postgres a testy ho nepouští, takže překlep
// v dotazu se dřív ukázal až v produkci jako pětistovka. Tady projde každý
// dotaz v `sql\`…\`` (Neon tagged template) parserem Postgresu (libpg_query
// ve WASM — stejná gramatika jako server; `${…}` je parametr $n jako u Neonu)
// a navíc SCHÉMATEM: tabulky a sloupce se vezmou z DDL v app/api/init/route.ts
// (CREATE TABLE, ALTER TABLE … ADD COLUMN), takže `te.tema_id` nebo
// `FROM shift_reveiws` spadne tady, ne u tabletu za barem.
//
// Co se ověřuje: každý `alias.sloupec`, jehož alias patří skutečné tabulce;
// nekvalifikovaný sloupec, když jsou v dosahu jen známé tabulky; sloupce
// v INSERT (…), UPDATE SET, ON CONFLICT (…) a RETURNING. Poddotazy s aliasem,
// CTE a funkce jsou neprůhledné — jejich sloupce se nekontrolují (a ani
// odkazy přes jejich alias), ať kontrola nelže. Korelované poddotazy vidí
// aliasy nadřazeného dotazu.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'libpg-query';

const KORENY = ['app', 'lib', 'middleware.ts'];
const SCHEMA_ZDROJE = ['app/api/init/route.ts'];
const soubory = [];
function projdi(p) {
  const st = statSync(p);
  if (st.isDirectory()) { for (const f of readdirSync(p)) projdi(join(p, f)); return; }
  if (/\.(ts|tsx)$/.test(p) && !/\.d\.ts$/.test(p)) soubory.push(p);
}
for (const k of KORENY) projdi(k);

/** Najde tagged templates `sql\`…\`` (i `neon(…)\`…\``) a vrátí text s $n místo ${…}. */
function dotazy(zdroj) {
  const out = [];
  const re = /(\bsql|\bneon\([^)]*\))\s*`/g;
  let m;
  while ((m = re.exec(zdroj))) {
    let i = m.index + m[0].length; let hloubka = 0; let text = ''; let n = 0;
    const radek = zdroj.slice(0, m.index).split('\n').length;
    for (; i < zdroj.length; i++) {
      const ch = zdroj[i];
      if (hloubka === 0) {
        if (ch === '`') break;
        if (ch === '$' && zdroj[i + 1] === '{') { hloubka = 1; i++; text += `$${++n}`; continue; }
        if (ch === '\\') { text += zdroj[i + 1] ?? ''; i++; continue; }
        text += ch;
      } else {
        if (ch === '{') hloubka++;
        else if (ch === '}') hloubka--;
        else if (ch === '`') { i++; while (i < zdroj.length && zdroj[i] !== '`') i++; }
      }
    }
    re.lastIndex = i + 1;
    out.push({ text, radek });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Schéma z DDL
// ---------------------------------------------------------------------------
const schema = new Map(); // tabulka → Set sloupců
const jmeno = (names) => names.map(x => x.String?.sval).filter(Boolean).pop();
async function nactiSchema() {
  for (const f of SCHEMA_ZDROJE) {
    const zdroj = readFileSync(f, 'utf8');
    for (const d of dotazy(zdroj)) {
      let tree;
      try { tree = await parse(d.text); } catch { continue; }
      for (const { stmt } of tree.stmts ?? []) {
        if (stmt.CreateStmt) {
          const t = stmt.CreateStmt.relation.relname;
          const cols = schema.get(t) ?? new Set();
          for (const e of stmt.CreateStmt.tableElts ?? []) if (e.ColumnDef) cols.add(e.ColumnDef.colname);
          schema.set(t, cols);
        } else if (stmt.AlterTableStmt) {
          const t = stmt.AlterTableStmt.relation.relname;
          const cols = schema.get(t) ?? new Set();
          for (const c of stmt.AlterTableStmt.cmds ?? []) {
            const cmd = c.AlterTableCmd;
            if (cmd?.subtype === 'AT_AddColumn' && cmd.def?.ColumnDef) cols.add(cmd.def.ColumnDef.colname);
            if (cmd?.subtype === 'AT_DropColumn' && cmd.name) cols.delete(cmd.name);
          }
          schema.set(t, cols);
        } else if (stmt.RenameStmt?.renameType === 'OBJECT_COLUMN') {
          const cols = schema.get(stmt.RenameStmt.relation.relname);
          if (cols) { cols.delete(stmt.RenameStmt.subname); cols.add(stmt.RenameStmt.newname); }
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Kontrola jednoho dotazu proti schématu
// ---------------------------------------------------------------------------
function* projdiUzly(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const x of node) yield* projdiUzly(x); return; }
  yield node;
  for (const k of Object.keys(node)) yield* projdiUzly(node[k]);
}

/** Rozsah: alias → tabulka (známá) nebo null (neprůhledné: poddotaz, CTE, funkce). */
function rozsahZ(node, cte) {
  const scope = new Map();
  const pridej = (alias, tabulka) => { if (alias) scope.set(alias, tabulka); };
  const rv = (r) => {
    if (r.schemaname || cte.has(r.relname)) { pridej(r.alias?.aliasname ?? r.relname, null); return; }
    // S aliasem platí jen alias: `users.name FROM users u` Postgres odmítne.
    pridej(r.alias?.aliasname ?? r.relname, r.relname);
  };
  const fromItem = (it) => {
    if (!it) return;
    if (it.RangeVar) rv(it.RangeVar);
    else if (it.JoinExpr) { fromItem(it.JoinExpr.larg); fromItem(it.JoinExpr.rarg); if (it.JoinExpr.alias) pridej(it.JoinExpr.alias.aliasname, null); }
    else if (it.RangeSubselect) pridej(it.RangeSubselect.alias?.aliasname, null);
    else if (it.RangeFunction) pridej(it.RangeFunction.alias?.aliasname, null);
  };
  if (node.SelectStmt) {
    for (const f of node.SelectStmt.fromClause ?? []) fromItem(f);
  } else if (node.UpdateStmt) {
    rv(node.UpdateStmt.relation); for (const f of node.UpdateStmt.fromClause ?? []) fromItem(f);
  } else if (node.DeleteStmt) {
    rv(node.DeleteStmt.relation); for (const f of node.DeleteStmt.usingClause ?? []) fromItem(f);
  } else if (node.InsertStmt) {
    rv(node.InsertStmt.relation); pridej('excluded', node.InsertStmt.relation.relname);
  }
  return scope;
}

function zkontroluj(tree) {
  const chyby = [];
  const cte = new Set();
  for (const n of projdiUzly(tree)) if (n.CommonTableExpr) cte.add(n.CommonTableExpr.ctename);

  const stmtKlice = ['SelectStmt', 'UpdateStmt', 'DeleteStmt', 'InsertStmt'];
  const jeStmt = (n) => stmtKlice.some(k => n[k]);
  // Systémové sloupce Postgresu (xmax = 0 říká, zda UPSERT vložil, nebo přepsal).
  const SYSTEMOVE = new Set(['xmin', 'xmax', 'ctid', 'tableoid', 'cmin', 'cmax']);
  // Výstupní jména SELECTu — u UNION/EXCEPT/INTERSECT je určuje nejlevější větev.
  const vystupniJmena = (sel) => {
    if (sel.op && sel.op !== 'SETOP_NONE' && sel.larg) return vystupniJmena(sel.larg);
    return new Set((sel.targetList ?? []).map(t => t.ResTarget?.name).filter(Boolean));
  };

  function overSloupec(scope, vystupniAliasy, fields, kde) {
    const parts = fields.map(f => f.String?.sval);
    if (parts.some(p => p == null)) return; // A_Star apod.
    if (parts.length >= 3) return; // schema.tabulka.sloupec — vzácné, neověřuje se
    if (SYSTEMOVE.has(parts[parts.length - 1])) return;
    if (parts.length === 2) {
      const [alias, col] = parts;
      if (!scope.has(alias)) { chyby.push(`${kde}: neznámý alias „${alias}" (${alias}.${col})`); return; }
      const t = scope.get(alias);
      if (t == null || !schema.has(t)) return; // neprůhledné
      if (!schema.get(t).has(col)) chyby.push(`${kde}: tabulka „${t}" (${alias}) nemá sloupec „${col}"`);
      return;
    }
    const col = parts[0];
    if (vystupniAliasy.has(col)) return;
    if (scope.has(col)) return; // odkaz na celý řádek: to_jsonb(u), count(u)
    const tabulky = [...scope.values()];
    if (!tabulky.length || tabulky.some(t => t == null || !schema.has(t))) return;
    if (!tabulky.some(t => schema.get(t).has(col))) chyby.push(`${kde}: sloupec „${col}" není v žádné z tabulek ${[...new Set(tabulky)].join(', ')}`);
  }

  function projdiStmt(node, vnejsi) {
    const stmt = node.SelectStmt ?? node.UpdateStmt ?? node.DeleteStmt ?? node.InsertStmt;
    const kde = node.SelectStmt ? 'SELECT' : node.UpdateStmt ? 'UPDATE' : node.DeleteStmt ? 'DELETE' : 'INSERT';

    // UNION / EXCEPT / INTERSECT: větve jsou v parse tree holé SelectStmt bez
    // obalu — každá má vlastní FROM a rozsah; ORDER BY nad nimi zná jen
    // výstupní jména nejlevější větve.
    if (node.SelectStmt && stmt.op && stmt.op !== 'SETOP_NONE') {
      for (const rameno of [stmt.larg, stmt.rarg]) if (rameno) projdiStmt({ SelectStmt: rameno }, vnejsi);
      const jmena = vystupniJmena(stmt);
      for (const n of projdiUzly(stmt.sortClause ?? [])) if (n.ColumnRef) overSloupec(new Map(), jmena, n.ColumnRef.fields ?? [], kde + ' ORDER BY');
      return;
    }

    const vlastni = rozsahZ(node, cte);
    const scope = new Map([...vnejsi, ...vlastni]);
    const vystupniAliasy = vystupniJmena(stmt);

    // Cílová tabulka INSERT/UPDATE/DELETE je holý RangeVar — překlep v ní se
    // hlásí tady (generický průchod dole ho nevidí).
    const cil = node.InsertStmt?.relation ?? node.UpdateStmt?.relation ?? node.DeleteStmt?.relation;
    if (cil && !cil.schemaname && !cte.has(cil.relname) && !schema.has(cil.relname)) chyby.push(`${kde}: neznámá tabulka „${cil.relname}"`);

    // INSERT (…) / UPDATE SET … / ON CONFLICT (…) — sloupce cílové tabulky
    if (cil && schema.has(cil.relname)) {
      const cols = schema.get(cil.relname);
      const hlidej = (name, co) => { if (name && !cols.has(name)) chyby.push(`${kde} ${co}: tabulka „${cil.relname}" nemá sloupec „${name}"`); };
      if (node.InsertStmt) {
        for (const c of node.InsertStmt.cols ?? []) hlidej(c.ResTarget?.name, 'sloupce');
        for (const ix of node.InsertStmt.onConflictClause?.infer?.indexElems ?? []) hlidej(ix.IndexElem?.name, 'ON CONFLICT');
        for (const t of node.InsertStmt.onConflictClause?.targetList ?? []) hlidej(t.ResTarget?.name, 'DO UPDATE SET');
      }
      if (node.UpdateStmt) for (const t of node.UpdateStmt.targetList ?? []) hlidej(t.ResTarget?.name, 'SET');
    }

    // Rekurze: vnořené příkazy dostanou tenhle rozsah; poddotaz ve FROM nevidí
    // vlastní alias; SELECT uvnitř INSERT nevidí cílovou tabulku ani excluded.
    const navstiv = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(navstiv); return; }
      if (n.RangeSubselect) {
        const s2 = new Map(scope); s2.delete(n.RangeSubselect.alias?.aliasname);
        if (n.RangeSubselect.subquery) projdiStmt(n.RangeSubselect.subquery, s2);
        return;
      }
      if (node.InsertStmt && n === node.InsertStmt.selectStmt) { projdiStmt(n, vnejsi); return; }
      if (n !== node && jeStmt(n)) { projdiStmt(n, scope); return; }
      if (n.ColumnRef) overSloupec(scope, vystupniAliasy, n.ColumnRef.fields ?? [], kde);
      for (const k of Object.keys(n)) navstiv(n[k]);
    };
    navstiv(stmt);
  }

  for (const { stmt } of tree.stmts ?? []) {
    if (jeStmt(stmt)) projdiStmt(stmt, new Map());
  }
  // Neznámé tabulky ve FROM/JOIN (překlep v názvu) — mimo systémové schéma.
  for (const n of projdiUzly(tree)) {
    if (n.RangeVar && !n.RangeVar.schemaname && !cte.has(n.RangeVar.relname) && !schema.has(n.RangeVar.relname)) {
      chyby.push(`neznámá tabulka „${n.RangeVar.relname}"`);
    }
  }
  return chyby;
}

await nactiSchema();
let chyb = 0, dotazu = 0, schemaChyb = 0;
for (const f of soubory) {
  const zdroj = readFileSync(f, 'utf8');
  const jeInit = SCHEMA_ZDROJE.includes(f);
  for (const d of dotazy(zdroj)) {
    const t = d.text.trim();
    if (!t) continue;
    dotazu++;
    let tree;
    try { tree = await parse(t); }
    catch (e) {
      chyb++;
      console.log(`${f}:${d.radek}: ${String(e.message ?? e).split('\n')[0]}`);
      console.log('   ' + t.replace(/\s+/g, ' ').slice(0, 160));
      continue;
    }
    if (jeInit) continue; // DDL a backfilly definují schéma, nekontrolují se proti němu
    for (const ch of [...new Set(zkontroluj(tree))]) {
      schemaChyb++;
      console.log(`${f}:${d.radek}: ${ch}`);
      console.log('   ' + t.replace(/\s+/g, ' ').slice(0, 160));
    }
  }
}
console.log(`SQL: ${dotazu} dotazů v ${soubory.length} souborech, ${chyb} chyb gramatiky, ${schemaChyb} chyb proti schématu (${schema.size} tabulek)`);
process.exit(chyb || schemaChyb ? 1 : 0);
