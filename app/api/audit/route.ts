// The employer's answer to "kdo to změnil?" — audit entries, newest first.
//
// GET parametry (Nastavení › Historie změn, kolo 7):
//   before=  id — starší než tenhle záznam („Načíst starší")
//   limit=   kolik záznamů (výchozí 100, nejvýš 200)
//   user=    jen jeden člověk (id)
//   oblast=  jen jedna oblast (lide, sklad, kasa, uzaverky, odmeny, klient, nastaveni, ostatni)
// Odpověď { entries, nextBefore }: nextBefore = id posledního záznamu, když jsou ještě starší; jinak null.
// Každý záznam nese userId a action (filtr podle člověka a oblasti v UI).
import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { popisAkce, detailAkce, parametryHistorie, podminkaOblasti, dalsiKurzor } from '@/lib/auditPopisky';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: Request) {
  // Historie změn prozrazuje, kdo co mazal a měnil — jen s oprávněním,
  // podnik z databáze (ne z role v tokenu).
  const c = await pozaduj('audit.zobrazit');
  if (jeOdpoved(c)) return c;
  const { before, limit, user, oblast } = parametryHistorie(new URL(request.url).searchParams);
  // Oblast se skládá z předpon akcí a výjimek (lib/auditPopisky) — bez oblasti podmínka nic nefiltruje.
  const o = oblast ? podminkaOblasti(oblast) : null;
  try {
    // O jeden víc než limit: tak se pozná, jestli jsou ještě starší (nextBefore).
    const rows = await sql`
      SELECT a.id, a.action, a.detail, a.user_id, a.created_at, us.name AS user_name, us.avatar AS user_avatar
      FROM audit_log a LEFT JOIN users us ON us.id = a.user_id
      WHERE a.team_id = ${c.teamId}
        AND (${before}::int IS NULL OR a.id < ${before})
        AND (${user}::int IS NULL OR a.user_id = ${user})
        AND (${o === null}::boolean
          OR (split_part(a.action, '.', 1) = ANY(${o?.predpony ?? []}::text[]) AND NOT (a.action = ANY(${o?.krome ?? []}::text[])))
          OR a.action = ANY(${o?.vcetne ?? []}::text[])
          OR (${o?.nezname ?? false}::boolean AND NOT (split_part(a.action, '.', 1) = ANY(${o?.znamePredpony ?? []}::text[]))))
      ORDER BY a.created_at DESC, a.id DESC LIMIT ${limit + 1}`;
    const { strana, nextBefore } = dalsiKurzor((rows as any[]).map(r => ({ ...r, id: Number(r.id) })), limit);
    return NextResponse.json({
      entries: strana.map(r => ({
        id: r.id,
        action: String(r.action ?? ''),
        label: popisAkce(r.action),
        detail: detailAkce(r.action, r.detail),
        userId: r.user_id != null ? Number(r.user_id) : null,
        userName: r.user_name ?? 'Systém',
        userAvatar: r.user_avatar ?? '⚙️',
        createdAt: r.created_at,
      })),
      nextBefore,
    });
  } catch {
    // Dřív { entries: [] }: výpadek databáze vypadal jako „zatím nic nezměněno“
    // a klient ukázal prázdný stav, který není pravda. Chyba musí být chyba.
    return NextResponse.json({ error: 'Historii změn se nepodařilo načíst.' }, { status: 500 });
  }
}
