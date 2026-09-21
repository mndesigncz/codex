// MCP pro Clauda: totéž, co umí obrazovka správce platformy, jako nástroje.
//
// Streamable HTTP bez stavu, odpověď jako JSON (žádný SSE stream, žádná
// session) — nejjednodušší tvar, který se dá škálovat a který Claude Code,
// Claude Desktop i claude.ai umí. Ověření je hlavička Bearer s
// ADMIN_API_TOKEN; bez ní se neodpoví ani `initialize`.
//
// Nástroje volají `lib/admin.ts` — přesně ty funkce, které volá REST pro
// obrazovku. Není tu žádná logika navíc, takže Claude nikdy neumí nic, co
// by správce neuměl kliknout, a každý zásah se loguje s aktérem „api-token".
//
// Napojení: docs/ADMIN.md → „Napojení Clauda".

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { requireSuperadmin, type AdminActor } from '@/lib/superadminGate';
import {
  AdminError, listTeams, getTeam, blockTeam, unblockTeam, setPlanOverride, extendTrial, setNote, adminAudit, overview,
  type StavPodniku,
} from '@/lib/admin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** Výsledek nástroje: čitelný JSON. Chyba správce jde zpátky jako text s `isError`. */
function vysledek(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] };
}
function chyba(e: unknown) {
  const text = e instanceof AdminError ? e.message : 'Zásah se nepovedl na straně serveru.';
  return { content: [{ type: 'text' as const, text }], isError: true };
}
async function bezpecne(fn: () => Promise<unknown>) {
  try { return vysledek(await fn()); } catch (e) { if (!(e instanceof AdminError)) console.error('mcp:', e); return chyba(e); }
}

const STAVY = ['vse', 'aktivni', 'zkusebni', 'placeny', 'zdarma', 'pozastaveny', 'po_splatnosti'] as const;

function server(actor: AdminActor): McpServer {
  const s = new McpServer({ name: 'managero-admin', version: '1.0.0' });

  s.registerTool('managero_overview', {
    title: 'Přehled platformy',
    description: 'Počty podniků podle stavu: celkem, aktivní za 7 dní, placené, zkušební, zdarma, pozastavené, po splatnosti.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => bezpecne(() => overview()));

  s.registerTool('managero_list_teams', {
    title: 'Seznam podniků',
    description: 'Všechny podniky (kavárny, restaurace, bary) na platformě s majitelem, počtem lidí, tarifem, stavem předplatného, poslední aktivitou a případným pozastavením. Hledá podle názvu, e-mailu nebo jména majitele, nebo přesného id.',
    inputSchema: {
      q: z.string().optional().describe('Hledaný text: název podniku, e-mail nebo jméno majitele, nebo id. Prázdné = všechny.'),
      stav: z.enum(STAVY).optional().describe('Filtr stavu. Výchozí „vse".'),
      limit: z.number().int().min(1).max(200).optional().describe('Kolik vrátit (výchozí 50).'),
      offset: z.number().int().min(0).optional().describe('Kolik přeskočit — stránkování.'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (a) => bezpecne(() => listTeams({ q: a.q, stav: a.stav as StavPodniku | 'vse' | undefined, limit: a.limit, offset: a.offset })));

  s.registerTool('managero_get_team', {
    title: 'Detail podniku',
    description: 'Detail jednoho podniku: tarif (uložený, ruční, skutečný), předplatné, členové týmu s rolemi, poznámka správce a posledních 30 zásahů správce nad tímhle podnikem.',
    inputSchema: { id: z.number().int().describe('Id podniku (z managero_list_teams).') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (a) => bezpecne(() => getTeam(a.id)));

  s.registerTool('managero_block_team', {
    title: 'Pozastavit podnik',
    description: 'Pozastaví podnik: všichni jeho lidé dostanou na API 423 a na stránkách vysvětlení s důvodem; hostovská stránka podniku zmizí. Projeví se do 30 sekund. Důvod uvidí podnik — piš ho pro majitele, ne pro sebe. Vratné přes managero_unblock_team.',
    inputSchema: {
      id: z.number().int().describe('Id podniku.'),
      reason: z.string().min(3).max(300).describe('Důvod, který uvidí majitel podniku (např. „Neuhrazená faktura za srpen; ozvěte se na fakturace@…").'),
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async (a) => bezpecne(() => blockTeam(a.id, a.reason, actor)));

  s.registerTool('managero_unblock_team', {
    title: 'Obnovit podnik',
    description: 'Zruší pozastavení podniku. Lidé se dostanou zpět do aplikace do 30 sekund.',
    inputSchema: { id: z.number().int().describe('Id podniku.') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (a) => bezpecne(() => unblockTeam(a.id, actor)));

  s.registerTool('managero_set_plan', {
    title: 'Nastavit tarif ručně',
    description: 'Ruční tarif od správce: „free", „pro" nebo „max" přebije Stripe i zkušební dobu (podpora, partner, náhrada za výpadek). null vrátí tarif podle Stripe. Uložený tarif ze Stripe se nemění, jen se překryje.',
    inputSchema: {
      id: z.number().int().describe('Id podniku.'),
      plan: z.enum(['free', 'pro', 'max']).nullable().describe('Tarif, nebo null = zpět podle Stripe.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (a) => bezpecne(() => setPlanOverride(a.id, a.plan, actor)));

  s.registerTool('managero_extend_trial', {
    title: 'Prodloužit zkušební dobu',
    description: 'Prodlouží zkušební dobu o N dní (1–365). Platí pro podniky na tarifu Zdarma bez zadané karty; zkušební dobu se zadanou kartou vede Stripe a tady se nemění.',
    inputSchema: {
      id: z.number().int().describe('Id podniku.'),
      days: z.number().int().min(1).max(365).describe('O kolik dní.'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, async (a) => bezpecne(() => extendTrial(a.id, a.days, actor)));

  s.registerTool('managero_set_note', {
    title: 'Poznámka správce k podniku',
    description: 'Interní poznámka správce (do 2000 znaků), podnik ji nevidí. Prázdný text poznámku smaže.',
    inputSchema: { id: z.number().int().describe('Id podniku.'), note: z.string().max(2000).describe('Text poznámky; prázdné = smazat.') },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (a) => bezpecne(() => setNote(a.id, a.note, actor)));

  s.registerTool('managero_admin_audit', {
    title: 'Historie zásahů správce',
    description: 'Poslední zásahy správců platformy (pozastavení, tarify, zkušební doby, poznámky): kdo, kdy, co, u kterého podniku. Volitelně jen pro jeden podnik.',
    inputSchema: {
      team_id: z.number().int().optional().describe('Jen zásahy u tohohle podniku.'),
      limit: z.number().int().min(1).max(500).optional().describe('Kolik záznamů (výchozí 100).'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (a) => bezpecne(() => adminAudit({ teamId: a.team_id, limit: a.limit })));

  return s;
}

async function obsluz(request: Request) {
  const g = await requireSuperadmin(request);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const s = server(g.actor);
  await s.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    // Bez stavu: každý požadavek má vlastní server i transport.
    await transport.close().catch(() => { /* už zavřeno */ });
  }
}

export const POST = obsluz;
export const GET = obsluz;
export const DELETE = obsluz;
