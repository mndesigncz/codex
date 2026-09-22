import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';
import { planInfoOf, PLAN_ENFORCED, canAddMember } from '@/lib/plan';
import { linkNewMember } from '@/lib/chat';
import { notifyUser } from '@/lib/push';
import { pridejClenstvi } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

// GET ?token= → validate invitation and return prefilled email + team name
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return NextResponse.json({ error: 'Chybí token' }, { status: 400 });
  const sql = neon(process.env.DATABASE_URL!);
  const [inv] = await sql`SELECT i.email, i.status, t.name as team_name FROM invitations i JOIN teams t ON t.id = i.team_id WHERE i.token = ${token}`;
  if (!inv) return NextResponse.json({ error: 'Neplatná pozvánka' }, { status: 404 });
  if (inv.status !== 'pending') return NextResponse.json({ error: 'Pozvánka již byla použita' }, { status: 410 });
  return NextResponse.json({ email: inv.email, teamName: inv.team_name });
}

// POST { token, name, password } → create employee account from invitation
export async function POST(request: Request) {
  try {
    const { token, name, password } = await request.json();
    if (!token || !name || !password) return NextResponse.json({ error: 'Všechna pole jsou povinná' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'Heslo musí mít alespoň 8 znaků' }, { status: 400 });

    const sql = neon(process.env.DATABASE_URL!);
    const [inv] = await sql`SELECT * FROM invitations WHERE token = ${token}`;
    if (!inv || inv.status !== 'pending') return NextResponse.json({ error: 'Neplatná nebo použitá pozvánka' }, { status: 410 });

    const [team] = await sql`SELECT id, owner_id FROM teams WHERE id = ${inv.team_id}`;
    if (!team) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });

    // Existující účet se do dalšího podniku PŘIDÁ jako člen — nezakládá se
    // znovu (e-mail je unikátní) a nevrací se 409. Přesně tohle je majitel
    // druhé kavárny nebo barista, který jezdí mezi pobočkami. Heslo se
    // ověřuje, aby pozvánka v cizí schránce nešla přijmout za někoho jiného.
    const [existing] = await sql`SELECT id, name, password_hash FROM users WHERE email = ${inv.email}`;
    if (existing) {
      const ok = await bcrypt.compare(password, String(existing.password_hash ?? ''));
      if (!ok) return NextResponse.json({ error: 'Účet s tímhle e-mailem už existuje — zadej jeho heslo.' }, { status: 409 });
      if (await memberLimitHit(sql, inv.team_id)) {
        return NextResponse.json({ error: 'Tým je na plánu Zdarma plný (3 členové). Vedení může přejít na Pro v Nastavení → Předplatné.' }, { status: 403 });
      }
      await pridejClenstvi(Number(existing.id), Number(team.id), inv.role === 'employer' ? 'employer' : 'employee', { jobTitle: inv.job_title || null });
      await sql`UPDATE invitations SET status = 'accepted' WHERE id = ${inv.id}`;
      try { await linkNewMember(sql, team.id, team.owner_id, Number(existing.id)); } catch { /* chat je volitelný */ }
      notifyUser(team.owner_id, {
        title: 'Pozvánka přijata',
        body: `${existing.name} se připojil/a do týmu — už má účet, přibylo mu členství.`,
        type: 'invite',
        link: '/employer/overview?view=team-settings',
      }).catch(() => {});
      return NextResponse.json({ ok: true, user: { id: existing.id, name: existing.name, email: inv.email }, existingAccount: true });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const newRole = inv.role === 'employer' ? 'employer' : 'employee';

    if (await memberLimitHit(sql, inv.team_id)) {
      return NextResponse.json({ error: 'Tým je na plánu Zdarma plný (3 členové). Vedení může přejít na Pro v Nastavení → Předplatné.' }, { status: 403 });
    }
    const [user] = await sql`
      INSERT INTO users (name, email, password_hash, role, avatar, job_title, team_id, employer_id)
      VALUES (${name}, ${inv.email}, ${passwordHash}, ${newRole}, '👤', ${inv.job_title || 'Barista'}, ${team.id}, ${team.owner_id})
      RETURNING id, name, email, role`;

    await sql`UPDATE invitations SET status = 'accepted' WHERE id = ${inv.id}`;
    await pridejClenstvi(Number(user.id), Number(team.id), newRole, { jobTitle: inv.job_title || null }).catch(() => {});
    await linkNewMember(sql, team.id, team.owner_id, user.id);

    notifyUser(team.owner_id, {
      title: 'Pozvánka přijata',
      body: `${name} přijal/a pozvánku a připojil/a se do týmu.`,
      type: 'invite',
      link: '/employer/overview?view=team-settings',
    }).catch(() => {});

    // Povinné čtení dávalo vědět JEN v okamžiku, kdy ho vedení zapnulo.
    // Kdo přišel do týmu později — tedy každý nový člověk — se o něm
    // nedozvěděl vůbec: pozvánka ho pustila rovnou do plného rozhraní
    // a povinné návody ležely v záložce, kam neměl důvod jít.
    //
    // Nic se nikam neukládá: seznam povinných návodů je stav týmu, ne
    // vlastnost pozvánky. Vázat ho na pozici by nešlo spolehlivě —
    // `job_title` je volný text, který si zaměstnanec sám přepíše.
    try {
      const povinne = await sql`
        SELECT id, title FROM guides
        WHERE team_id = ${team.id} AND require_read = TRUE AND approved IS DISTINCT FROM FALSE
        ORDER BY id`;
      if (povinne.length > 0) {
        // Jeden návod → rovnou do něj. Víc → na seznam, kde jsou vidět všechny.
        const odkaz = povinne.length === 1
          ? `/employee/shifts?view=guides&guide=${povinne[0].id}`
          : '/employee/shifts?view=guides';
        notifyUser(user.id, {
          title: '📖 Přečti si před první směnou',
          body: povinne.length === 1
            ? `Návod „${povinne[0].title}" je povinný — přečti a potvrď.`
            : `${povinne.length} návodů je povinných — přečti je a potvrď.`,
          type: 'info',
          link: odkaz,
        }).catch(() => {});
      }
    } catch { /* před migrací sloupec chybí — pozvánka se tím nesmí zdržet */ }

    return NextResponse.json({ ok: true, user });
  } catch (error) {
    console.error('accept invite error', error);
    return NextResponse.json({ error: 'Chyba serveru' }, { status: 500 });
  }
}

async function memberLimitHit(sql: any, teamId: number): Promise<boolean> {
  if (!PLAN_ENFORCED) return false;
  let plan;
  try {
    const [row] = await sql`SELECT plan, plan_override, trial_ends_at FROM teams WHERE id = ${teamId}`;
    plan = planInfoOf(row);
  } catch { return false; }
  if (plan.effective === 'pro') return false;
  try {
    const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM users WHERE team_id = ${teamId} AND role <> 'kiosk'`;
    return !canAddMember(plan, Number(n) || 0);
  } catch { return false; }
}
