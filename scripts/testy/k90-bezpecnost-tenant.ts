// Izolace podniků (spuštění, balík S): scripts/check-tenant.mjs najde dotaz,
// který vybírá řádek podle id z požadavku bez team_id, a pustí ověřené tvary.
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Testy } from './_testy.ts';

const SKRIPT = new URL('../check-tenant.mjs', import.meta.url).pathname;
const KOREN = new URL('../../', import.meta.url).pathname;

function spust(routy: Record<string, string>): { kod: number | null; vystup: string } {
  const dir = mkdtempSync(join(tmpdir(), 'tenant-'));
  for (const [nazev, kod] of Object.entries(routy)) {
    mkdirSync(join(dir, nazev), { recursive: true });
    writeFileSync(join(dir, nazev, 'route.ts'), kod);
  }
  const r = spawnSync(process.execPath, [SKRIPT], { cwd: KOREN, env: { ...process.env, TENANT_KOREN: dir }, encoding: 'utf8' });
  return { kod: r.status, vystup: `${r.stdout}${r.stderr}` };
}

export default function ({ eq, ok }: Testy) {
  const spatne = spust({ a: 'export async function PATCH(req) { const b = await req.json(); await sql`UPDATE tasks SET title = ${b.title} WHERE id = ${b.id}`; }' });
  ok('najde: UPDATE podle id z těla bez team_id', spatne.kod === 1 && /tasks: řádek podle id z požadavku bez team_id/.test(spatne.vystup));
  eq('pustí: s team_id', spust({ a: 'export async function PATCH(req) { const b = await req.json(); await sql`UPDATE tasks SET title = ${b.title} WHERE id = ${b.id} AND team_id = ${c.teamId}`; }' }).kod, 0);
  eq('pustí: ověřeno dřív v téže funkci (SELECT s team_id)', spust({ a: 'export async function DELETE(req) { const [t] = await sql`SELECT id, team_id FROM tasks WHERE id = ${id}`;\n  if (t.team_id !== c.teamId) return;\n  await sql`DELETE FROM tasks WHERE id = ${id}`; }' }).kod, 0);
  ok('najde: ověření v JINÉ funkci nestačí', spust({ a: 'export async function GET() { await sql`SELECT * FROM tasks WHERE id = ${id} AND team_id = ${t}`; }\nexport async function DELETE() { await sql`DELETE FROM tasks WHERE id = ${id}`; }' }).kod === 1);
  ok('najde: ověření AŽ po změně nestačí', spust({ a: 'export async function PATCH() { await sql`UPDATE tasks SET x = 1 WHERE id = ${id}`;\n  const [r] = await sql`SELECT * FROM tasks WHERE id = ${id}`; }' }).kod === 1);
  eq('pustí: id z řádku databáze (open.id)', spust({ a: 'export async function POST() { await sql`UPDATE time_entries SET clock_out = NOW() WHERE id = ${open.id}`; }' }).kod, 0);
  eq('pustí: řádek vlastníka z relace (customer_id)', spust({ a: 'export async function GET() { await sql`SELECT * FROM client_orders WHERE id = ${id} AND customer_id = ${me.id}`; }' }).kod, 0);
  eq('pustí: users (osoba ve více podnicích, hlídá členství)', spust({ a: 'export async function GET() { await sql`SELECT name FROM users WHERE id = ${id}`; }' }).kod, 0);
  ok('najde: id = ANY(pole z požadavku)', spust({ a: 'export async function POST() { await sql`DELETE FROM tasks WHERE id = ANY(${ids})`; }' }).kod === 1);

  const ostre = spawnSync(process.execPath, [SKRIPT], { cwd: KOREN, encoding: 'utf8' });
  ok('celé app/api: žádný nález, výjimky mají důvod a nejsou zastaralé', ostre.status === 0);
  ok('opraveno: plánování, poznámky a položka skladu čtou/mění s team_id', /WHERE id = \$\{id\} AND team_id = \$\{me\.teamId\}/.test(readFileSync(join(KOREN, 'app/api/planning/[id]/route.ts'), 'utf8'))
    && /WHERE n\.id = \$\{id\} AND n\.team_id = \$\{teamId\}/.test(readFileSync(join(KOREN, 'app/api/notes/route.ts'), 'utf8'))
    && /WHERE i\.id = \$\{id\} AND i\.team_id = \$\{teamId\}/.test(readFileSync(join(KOREN, 'app/api/inventory/[id]/route.ts'), 'utf8')));
}
