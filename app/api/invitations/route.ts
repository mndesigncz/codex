// Pozvánky do podniku. Kolo 67: místo „jen vedení" je hlídá oprávnění
// tym.pozvat. Pozvánka jde do výchozí role podniku; pozvat „jako vedení"
// (starý tvar role=employer) je přidělení role — potřebuje navíc
// tym.role_prirazovat a stejná pravidla jako změna role u člena (Vedení
// dává jen vlastník). Při přijetí se to ověřuje znovu (invitations/accept).
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { planInfoOf, PLAN_ENFORCED, canAddMember } from '@/lib/plan';
import { generateInviteToken } from '@/lib/team';
import { sendTeamInvitation } from '@/lib/email';
import { smiPridatClena, pocetClenu } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { smiPriraditRoli } from '@/lib/opravneni';
import { roleVedeni, vychoziRolePodniku, typUctu } from '../teams/_role';

export const dynamic = 'force-dynamic';

export async function GET() {
  const c = await pozaduj('tym.pozvat');
  if (jeOdpoved(c)) return c;
  const sql = neon(process.env.DATABASE_URL!);
  // Aktivní podnik z databáze (pozaduj), stejně jako POST a DELETE.
  // token is included so the employer can copy a working join link and share
  // it directly (email delivery is best-effort and may be unconfigured).
  // Token je klíč do podniku: kdo ho má, pozvánku přijme sám, s heslem,
  // které si zvolí, a dostane roli, kterou pozvánce dal ZVOUCÍ. Proto ho
  // nevidí každý s tym.pozvat — jen ten, kdo pozvánku vytvořil, nebo kdo by
  // stejnou roli smíl dát sám. Jinak by člověk s vlastní rolí „smí zvát"
  // přečetl token vlastníkovy pozvánky do Vedení a přišel si pro ni.
  let rows: any[];
  try {
    rows = await sql`
      SELECT id, email, job_title, status, token, created_at, role, invited_by FROM invitations
      WHERE team_id = ${c.teamId} ORDER BY created_at DESC` as any[];
  } catch {
    // Před sloupcem role: všechny pozvánky jsou do výchozí role.
    rows = await sql`
      SELECT id, email, job_title, status, token, created_at, invited_by FROM invitations
      WHERE team_id = ${c.teamId} ORDER BY created_at DESC` as any[];
  }
  const V = { jeVlastnik: c.role.jeVlastnik, opravneni: c.role.opravneni };
  const bezCile = { jeVlastnik: false, jeTo: false, soucasna: [], soucasnaKlic: null };
  // Pozvánka „jako vedení" = přidělení role Vedení: stejná kontrola jako při
  // jejím vytvoření v POST (tym.role_prirazovat + smiPriraditRoli). Pozvánku
  // do výchozí role smí vytvořit každý s tym.pozvat (POST ji nijak dál
  // neomezuje), takže její token mu nic navíc nedá.
  const smiVedeni = c.role.opravneni.has('tym.role_prirazovat')
    && smiPriraditRoli(V, bezCile, { opravneni: roleVedeni().opravneni, klic: 'vedeni' }).ok;
  const invitations = rows.map(r => {
    const jeho = r.invited_by != null && Number(r.invited_by) === c.meId;
    const smi = jeho || (r.role === 'employer' ? smiVedeni : true);
    const { invited_by: _zvouci, ...zbytek } = r;
    return { ...zbytek, token: smi ? r.token : null };
  });
  return NextResponse.json({ invitations });
}

export async function POST(request: Request) {
  const c = await pozaduj('tym.pozvat');
  if (jeOdpoved(c)) return c;
  const { email, jobTitle, role } = await request.json();
  if (!email) return NextResponse.json({ error: 'Email je povinný' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const [team] = await sql`SELECT id, name FROM teams WHERE id = ${c.teamId}`;
  if (!team) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });
  const [meRow] = await sql`SELECT name FROM users WHERE id = ${c.meId}`;
  const me = { id: c.meId, name: String(meRow?.name ?? '') };

  const invRole = role === 'employer' ? 'employer' : 'employee';
  // Jiná než výchozí role = přidělení role: stejná pravidla jako u člena.
  // Bez nich by pozvánka byla boční dveře, kudy dát Vedení i tomu, komu ho
  // změnou role dát nejde.
  if (invRole === 'employer') {
    if (!c.role.opravneni.has('tym.role_prirazovat')) {
      return NextResponse.json({ error: 'Pozvat jde jen do výchozí role — na přidělování rolí nemáš oprávnění.' }, { status: 403 });
    }
    const vedeni = roleVedeni();
    const v = smiPriraditRoli({ jeVlastnik: c.role.jeVlastnik, opravneni: c.role.opravneni },
      { jeVlastnik: false, jeTo: false, soucasna: [], soucasnaKlic: null }, { opravneni: vedeni.opravneni, klic: vedeni.klic });
    if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 403 });
  }
  // Pro kontrolu sdílení lidí mezi podniky rozhoduje typ účtu, se kterým
  // člověk přijde — u výchozí role ten její.
  const typPrijeti = invRole === 'employer' ? 'employer' : typUctu(await vychoziRolePodniku(Number(team.id)));
  // Existující účet jde pozvat do DALŠÍHO podniku (přijetí mu přidá členství).
  // Nejde pozvat tablet ani hosta, a nejde pozvat někoho, kdo už tu je.
  const [existingUser] = await sql`SELECT id, role, team_id FROM users WHERE email = ${email}`;
  if (existingUser) {
    if (existingUser.role === 'kiosk' || existingUser.role === 'customer') {
      return NextResponse.json({ error: 'Tenhle e-mail patří tabletu nebo hostovi — do týmu ho pozvat nejde.' }, { status: 409 });
    }
    let uzClen = Number(existingUser.team_id) === Number(team.id);
    try {
      const [m] = await sql`SELECT 1 FROM team_members WHERE user_id = ${existingUser.id} AND team_id = ${team.id}`;
      uzClen = uzClen || !!m;
    } catch { /* před migrací */ }
    if (uzClen) return NextResponse.json({ error: 'Tenhle člověk už v týmu je.' }, { status: 409 });
    // „Sdílení lidí mezi podniky" organizace platí i tady, ne jen v nastavení.
    if (!(await smiPridatClena(Number(existingUser.id), Number(team.id), typPrijeti))) {
      return NextResponse.json({ error: 'Tenhle člověk už pracuje v jiném podniku organizace a sdílení lidí mezi podniky je vypnuté. Zapne ho vlastník organizace v Nastavení.' }, { status: 409 });
    }
  }

  const token = generateInviteToken();
  try {

  if (await memberLimitHit(sql, team.id)) {
    return NextResponse.json({ error: 'Tým je na plánu Zdarma plný (3 členové). Vedení může přejít na Pro v Nastavení → Předplatné.' }, { status: 403 });
  }
    await sql`
      INSERT INTO invitations (team_id, email, token, job_title, role, invited_by, status)
      VALUES (${team.id}, ${email}, ${token}, ${jobTitle || 'Barista'}, ${invRole}, ${me.id}, 'pending')`;
  } catch {
    // role column not migrated yet — invite as a regular employee
    await sql`
      INSERT INTO invitations (team_id, email, token, job_title, invited_by, status)
      VALUES (${team.id}, ${email}, ${token}, ${jobTitle || 'Barista'}, ${me.id}, 'pending')`;
  }

  // The join link always works and is returned so the UI can offer it for
  // manual sharing. The email is a best-effort convenience on top.
  // `sendTeamInvitation` nevyhazuje — chybu vrací. Dřív se `emailSent`
  // nastavilo na `true` i tehdy, když Resend pozvánku odmítl.
  const mail = await sendTeamInvitation(email, team.name, me.name, token);

  return NextResponse.json({
    ok: true, token, path: `/join?token=${token}`,
    emailSent: mail.sent, emailError: mail.error,
  });
}

// DELETE ?id= — revoke a pending invitation (typo in the e-mail, wrong person…).
// The token stops working immediately; the row stays for the audit trail.
export async function DELETE(request: Request) {
  const c = await pozaduj('tym.pozvat');
  if (jeOdpoved(c)) return c;
  const sql = neon(process.env.DATABASE_URL!);
  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
  const team = { id: c.teamId };

  const [row] = await sql`
    UPDATE invitations SET status = 'revoked'
    WHERE id = ${id} AND team_id = ${team.id} AND status = 'pending'
    RETURNING id`;
  if (!row) return NextResponse.json({ error: 'Pozvánka nenalezena nebo už není aktivní' }, { status: 404 });
  return NextResponse.json({ ok: true });
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
