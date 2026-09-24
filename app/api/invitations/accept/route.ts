import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { neon } from '@neondatabase/serverless';
import { planInfoOf, PLAN_ENFORCED, canAddMember } from '@/lib/plan';
import { linkNewMember } from '@/lib/chat';
import { notifyUser, notifyUsers } from '@/lib/push';
import { pridejClenstvi, smiPridatClena, pocetClenu } from '@/lib/tenant';
import { clenoveSOpravnenim } from '@/lib/opravneniDb';
import { roleVedeni, vychoziRolePodniku, smiDatRoli, typUctu, zapisRoliClenstvi, type RoleNoveho } from '../../teams/_role';

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

/**
 * Jakou roli pozvaný dostane (kolo 67). Pozvánka nese jen typ z doby před
 * rolemi: „vedení", nebo nic (= výchozí role podniku). Mezi odesláním a
 * přijetím mohl zvoucí přijít o právo zvát nebo přidělovat role, odejít
 * z podniku, nebo mohla změnit výchozí role — proto se tu všechno ověřuje
 * ZNOVU podle dnešního stavu. Když zvoucí Vedení dát už nesmí, pozvánka
 * nepropadne: člověk přijde s výchozí rolí a vedení mu roli upraví.
 */
async function roleZPozvanky(inv: any, teamId: number): Promise<RoleNoveho> {
  if (inv.role === 'employer') {
    const vedeni = roleVedeni();
    if (await smiDatRoli(Number(inv.invited_by), teamId, vedeni, ['tym.pozvat', 'tym.role_prirazovat'])) return vedeni;
  }
  return vychoziRolePodniku(teamId);
}

/** O přijaté pozvánce ví, kdo tým zve (tym.pozvat) — dřív jen vlastník. */
function oznamPrijeti(teamId: number, body: string) {
  clenoveSOpravnenim(teamId, 'tym.pozvat').then(ids => notifyUsers(ids, {
    title: 'Pozvánka přijata', body, type: 'invite', link: '/employer/overview?view=team-settings',
  })).catch(() => {});
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
      const nova = await roleZPozvanky(inv, Number(team.id));
      const role = typUctu(nova);
      // Přepínač organizace „Sdílení lidí" platí i při přijetí — pozvánka
      // mohla vzniknout dřív, než ho vlastník vypnul.
      if (!(await smiPridatClena(Number(existing.id), Number(team.id), role))) {
        return NextResponse.json({ error: 'Už pracuješ v jiném podniku téhle organizace a sdílení lidí mezi podniky je vypnuté. Zapne ho vlastník organizace.' }, { status: 409 });
      }
      try {
        await pridejClenstvi(Number(existing.id), Number(team.id), role, { jobTitle: inv.job_title || null });
        await zapisRoliClenstvi(Number(existing.id), Number(team.id), nova);
      } catch {
        // team_members ještě není (init po nasazení neproběhl): říct to,
        // ne padnout na obecnou pětistovku. Pozvánka zůstává platná.
        return NextResponse.json({ error: 'Přidání do dalšího podniku bude dostupné po dokončení aktualizace — zkus to za chvíli.' }, { status: 503 });
      }
      // Kdo právě žádný aktivní podnik nemá (odebraný z toho jediného), se do
      // nového rovnou přepne — jinak by se přihlásil do prázdna.
      try {
        await sql`UPDATE users SET team_id = ${team.id}, role = ${role}, employer_id = ${team.owner_id}
                  WHERE id = ${existing.id} AND team_id IS NULL`;
      } catch { /* zrcadlo se doplní při přihlášení */ }
      await sql`UPDATE invitations SET status = 'accepted' WHERE id = ${inv.id}`;
      try { await linkNewMember(sql, team.id, team.owner_id, Number(existing.id)); } catch { /* chat je volitelný */ }
      oznamPrijeti(Number(team.id), `${existing.name} se připojil/a do týmu — už má účet, přibylo mu členství.`);
      return NextResponse.json({ ok: true, user: { id: existing.id, name: existing.name, email: inv.email }, existingAccount: true });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const nova = await roleZPozvanky(inv, Number(team.id));
    const newRole = typUctu(nova);

    if (await memberLimitHit(sql, inv.team_id)) {
      return NextResponse.json({ error: 'Tým je na plánu Zdarma plný (3 členové). Vedení může přejít na Pro v Nastavení → Předplatné.' }, { status: 403 });
    }
    const [user] = await sql`
      INSERT INTO users (name, email, password_hash, role, avatar, job_title, team_id, employer_id)
      VALUES (${name}, ${inv.email}, ${passwordHash}, ${newRole}, '👤', ${inv.job_title || 'Barista'}, ${team.id}, ${team.owner_id})
      RETURNING id, name, email, role`;

    await sql`UPDATE invitations SET status = 'accepted' WHERE id = ${inv.id}`;
    await pridejClenstvi(Number(user.id), Number(team.id), newRole, { jobTitle: inv.job_title || null })
      .then(() => zapisRoliClenstvi(Number(user.id), Number(team.id), nova)).catch(() => {});
    await linkNewMember(sql, team.id, team.owner_id, user.id);

    oznamPrijeti(Number(team.id), `${name} přijal/a pozvánku a připojil/a se do týmu.`);

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
  // Počítají se členové (členství NEBO zrcadlo) — i ti právě přepnutí do
  // jiného podniku, jinak se limit obešel přepnutím (kolo 62).
  try { return !canAddMember(plan, await pocetClenu(teamId)); } catch { return false; }
}
