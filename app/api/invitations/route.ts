// Pozvánky do podniku. Kolo 67: místo „jen vedení" je hlídá oprávnění
// tym.pozvat. Pozvánka jde do výchozí role podniku; jiná role (kolo 6, B3:
// `roleId` vlastní, `roleKlic` přednastavená, starý tvar role=employer =
// Vedení) je přidělení role — potřebuje navíc tym.role_prirazovat a stejná
// pravidla jako změna role u člena (Vedení dává jen vlastník). Při přijetí
// se to ověřuje znovu (invitations/accept, lib/pozvanky.ts). Znovu poslat:
// invitations/[id]/resend.
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { planInfoOf, PLAN_ENFORCED, canAddMember } from '@/lib/plan';
import { generateInviteToken } from '@/lib/team';
import { sendTeamInvitation } from '@/lib/email';
import { jazykPodniku } from '@/lib/i18n/jazykPozadavku';
import { normalizujEmail } from '@/lib/emailAdresa';
import { smiPridatClena, pocetClenu } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { cilPozvanky, cilZVyberu, sloupcePozvanky, smiZvouciDatRoli, type CilPozvanky, type RolePozvanky } from '@/lib/pozvanky';
import { vychoziRolePodniku, typUctu } from '../teams/_role';
import { nactiRoliPozvanky } from './_role';

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
      SELECT id, email, job_title, status, token, created_at, role, role_id, sent_at, invited_by FROM invitations
      WHERE team_id = ${c.teamId} ORDER BY created_at DESC` as any[];
  } catch {
    try {
      // Před sloupci role_id a sent_at (kolo 6): role jen jako klíč.
      rows = await sql`
        SELECT id, email, job_title, status, token, created_at, role, invited_by FROM invitations
        WHERE team_id = ${c.teamId} ORDER BY created_at DESC` as any[];
    } catch {
      // Před sloupcem role: všechny pozvánky jsou do výchozí role.
      rows = await sql`
        SELECT id, email, job_title, status, token, created_at, invited_by FROM invitations
        WHERE team_id = ${c.teamId} ORDER BY created_at DESC` as any[];
    }
  }
  const V = { jeVlastnik: c.role.jeVlastnik, opravneni: c.role.opravneni };
  // Slíbené role čekajících pozvánek, jak dnes platí — jednou za klíč / id.
  const role = new Map<string, RolePozvanky | null>();
  const klicRole = (cil: CilPozvanky) => (cil.druh === 'vlastni' ? `id:${cil.id}` : cil.druh === 'system' ? `k:${cil.klic}` : 'vychozi');
  let vychozi: RolePozvanky | null = null;
  try { vychozi = await vychoziRolePodniku(c.teamId); } catch { /* název výchozí role se jen nezobrazí */ }
  for (const r of rows) {
    const cil = cilPozvanky(r);
    if (cil.druh === 'vychozi' || role.has(klicRole(cil))) continue;
    role.set(klicRole(cil), await nactiRoliPozvanky(c.teamId, cil).catch(() => null));
  }
  const invitations = rows.map(r => {
    const cil = cilPozvanky(r);
    const slibena = cil.druh === 'vychozi' ? null : role.get(klicRole(cil)) ?? null;
    const jeho = r.invited_by != null && Number(r.invited_by) === c.meId;
    // Pozvánku do výchozí role smí vytvořit každý s tym.pozvat (POST ji nijak
    // dál neomezuje), takže její token mu nic navíc nedá. Jinou roli jen ten,
    // kdo by ji směl dát sám — stejná kontrola jako při vytvoření v POST.
    // Role, která už neexistuje, při přijetí spadne na výchozí — token nic nedá.
    const smi = jeho || cil.druh === 'vychozi' || !slibena || smiZvouciDatRoli(V, slibena, ['tym.role_prirazovat']);
    const { invited_by: _zvouci, role_id: _roleId, ...zbytek } = r;
    return {
      ...zbytek, token: smi ? r.token : null,
      role_id: cil.druh === 'vlastni' ? cil.id : null,
      role_klic: cil.druh === 'system' ? cil.klic : null,
      // Název role pro chip u pozvánky; u výchozí role ten dnešní (rozhodne se při přijetí).
      role_nazev: slibena?.nazev ?? (cil.druh === 'vychozi' ? vychozi?.nazev ?? null : null),
    };
  });
  return NextResponse.json({ invitations });
}

export async function POST(request: Request) {
  const c = await pozaduj('tym.pozvat');
  if (jeOdpoved(c)) return c;
  const telo = await request.json();
  const { jobTitle, role } = telo;
  // Pozvánka nese e-mail v normalizovaném tvaru, ať se s účtem najde bez ohledu na velikost písmen.
  const email = normalizujEmail(telo.email);
  if (!email) return NextResponse.json({ error: 'Email je povinný' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const [team] = await sql`SELECT id, name FROM teams WHERE id = ${c.teamId}`;
  if (!team) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });
  const [meRow] = await sql`SELECT name FROM users WHERE id = ${c.meId}`;
  const me = { id: c.meId, name: String(meRow?.name ?? '') };

  // Role pozvánky: vlastní (roleId), přednastavená (roleKlic), starý tvar role=employer
  // (Vedení), nebo nic = výchozí role podniku. Jiná než výchozí role = přidělení role:
  // stejná pravidla jako u člena. Bez nich by pozvánka byla boční dveře, kudy dát
  // Vedení i tomu, komu ho změnou role dát nejde.
  let cil = cilZVyberu({ roleId: telo.roleId, roleKlic: telo.roleKlic, role });
  const vychozi = await vychoziRolePodniku(Number(team.id));
  let slibena: RolePozvanky | null = null;
  if (cil.druh !== 'vychozi') {
    try { slibena = await nactiRoliPozvanky(Number(team.id), cil); }
    catch { return NextResponse.json({ error: 'Roli se teď nepodařilo načíst. Zkus to za chvíli znovu.' }, { status: 503 }); }
    if (!slibena) return NextResponse.json({ error: 'Tuhle roli novému členovi dát nejde — vyber jinou.' }, { status: 400 });
    // Výchozí role podniku vybraná ze seznamu není přidělení — smí ji každý s tym.pozvat.
    const jeVychozi = (slibena.roleId != null && slibena.roleId === vychozi.roleId) || (slibena.klic != null && slibena.klic === vychozi.klic);
    if (jeVychozi) { cil = { druh: 'vychozi' }; slibena = null; }
    else {
      if (!c.role.opravneni.has('tym.role_prirazovat')) {
        return NextResponse.json({ error: 'Pozvat jde jen do výchozí role — na přidělování rolí nemáš oprávnění.' }, { status: 403 });
      }
      if (!smiZvouciDatRoli({ jeVlastnik: c.role.jeVlastnik, opravneni: c.role.opravneni }, slibena, ['tym.role_prirazovat'])) {
        return NextResponse.json({ error: 'Nemůžeš pozvat do role s oprávněními, která sám nemáš.' }, { status: 403 });
      }
    }
  }
  const sloupce = sloupcePozvanky(cil);
  // Pro kontrolu sdílení lidí mezi podniky rozhoduje typ účtu, se kterým
  // člověk přijde — u výchozí role ten její.
  const typPrijeti = typUctu(slibena ?? vychozi);
  // Existující účet jde pozvat do DALŠÍHO podniku (přijetí mu přidá členství).
  // Nejde pozvat tablet ani hosta, a nejde pozvat někoho, kdo už tu je.
  const [existingUser] = await sql`SELECT id, role, team_id FROM users WHERE lower(email) = ${email} ORDER BY id LIMIT 1`;
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
    try {
      await sql`
        INSERT INTO invitations (team_id, email, token, job_title, role, role_id, invited_by, status, sent_at)
        VALUES (${team.id}, ${email}, ${token}, ${jobTitle || 'Barista'}, ${sloupce.role}, ${sloupce.role_id}, ${me.id}, 'pending', NOW())`;
    } catch {
      // Před sloupci role_id a sent_at (kolo 6): vlastní role se nezapíše a člověk
      // přijde s výchozí rolí — radši méně, než víc.
      await sql`
        INSERT INTO invitations (team_id, email, token, job_title, role, invited_by, status)
        VALUES (${team.id}, ${email}, ${token}, ${jobTitle || 'Barista'}, ${sloupce.role_id != null ? 'employee' : sloupce.role}, ${me.id}, 'pending')`;
    }
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
  const mail = await sendTeamInvitation(email, team.name, me.name, token, await jazykPodniku(team.id));

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
