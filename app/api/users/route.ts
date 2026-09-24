import { NextRequest, NextResponse } from 'next/server';
import { pridejClenstvi, pocetClenu } from '@/lib/tenant';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { sendInvitationEmail } from '@/lib/email';
import { planInfoOf, canAddMember, MEMBER_LIMIT_MSG } from '@/lib/plan';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { smiPriraditRoli } from '@/lib/opravneni';
import { audit } from '@/lib/audit';
import { vychoziRolePodniku, typUctu, zapisRoliClenstvi } from '../teams/_role';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// GET — members of MY team only (no cross-team listing, no password hashes).
// Jména týmu vidí každý člen (výběr lidí v chatu, rozvrhu, docházce).
// E-maily a telefony jen s tym.kontakty — dřív je dostal každý, i tablet,
// přestože je UI zaměstnance ani tabletu nikdy neukazovalo (kolo 67).
export async function GET() {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const kontakty = c.role.opravneni.has('tym.kontakty');

  // Členství NEBO zrcadlo (kolo 62): výběry lidí (rozvrh, docházka) dřív
  // neviděly člena přepnutého do jiného podniku. Vlastní JOIN kvůli
  // createdAt, které helper nevrací; tablet tu záměrně zůstává (jde přes
  // zrcadlo). Role a pozice jsou z členství v TOMHLE podniku.
  const rows = await sql`
    SELECT u.id, u.name, u.email, COALESCE(m.role, u.role) AS role, u.avatar, u.phone,
           COALESCE(m.job_title, u.job_title) AS "jobTitle", u.shift_preference AS "shiftPreference", u.created_at AS "createdAt"
    FROM users u LEFT JOIN team_members m ON m.user_id = u.id AND m.team_id = ${c.teamId}
    WHERE (m.user_id IS NOT NULL OR u.team_id = ${c.teamId})
      AND COALESCE(m.role, u.role) IN ('employer', 'employee', 'kiosk')
    ORDER BY COALESCE(m.role, u.role) DESC, u.name ASC`;
  return NextResponse.json(kontakty ? rows : (rows as any[]).map(r => ({ ...r, email: null, phone: null })));
}

// POST — create an employee account inside MY team.
// Kolo 67: vlastní klíč tym.zalozit_ucet, ne jen tym.pozvat. Kdo účet
// zakládá, zná jeho první heslo — umí se za toho člověka přihlásit a audit
// by jeho kroky připsal jemu. Nový účet dostane výchozí roli podniku a
// zakládající ji musí smět přidělit (stejná pravidla jako u pozvánky).
export async function POST(req: NextRequest) {
  const c = await pozaduj('tym.zalozit_ucet');
  if (jeOdpoved(c)) return c;
  const role = await vychoziRolePodniku(c.teamId);
  const v = smiPriraditRoli({ jeVlastnik: c.role.jeVlastnik, opravneni: c.role.opravneni },
    { jeVlastnik: false, jeTo: false, soucasna: [], soucasnaKlic: null }, { opravneni: role.opravneni, klic: role.klic });
  if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 403 });
  const ucet = typUctu(role);

  // Same limit the invitation flows enforce — this direct form must not be a
  // side door around the Free plan's team size.
  try {
    const [row] = await sql`SELECT plan, plan_override, trial_ends_at FROM teams WHERE id = ${c.teamId}`;
    // Stejné počítání jako u pozvánek: členství NEBO zrcadlo (kolo 62).
    if (!canAddMember(planInfoOf(row), await pocetClenu(c.teamId))) {
      return NextResponse.json({ error: MEMBER_LIMIT_MSG }, { status: 403 });
    }
  } catch { /* plan columns not migrated — no limit */ }

  const body = await req.json().catch(() => ({}));
  const { name, email, password, avatar, phone, jobTitle, sendInvite } = body;
  if (!name || !email || !password) {
    return NextResponse.json({ error: 'Chybí jméno, e-mail nebo heslo' }, { status: 400 });
  }

  const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing) return NextResponse.json({ error: 'Účet s tímto e-mailem už existuje' }, { status: 409 });

  const passwordHash = await bcrypt.hash(String(password), 10);
  // Role je vždy výchozí role podniku (bez nastavení Barista) — Vedení tudy
  // vzniknout nemůže, výchozí role nesmí nést nic citlivého (smiBytVychozi).
  const [newUser] = await sql`
    INSERT INTO users (name, email, password_hash, role, avatar, phone, job_title, employer_id, team_id)
    VALUES (${name}, ${email}, ${passwordHash}, ${ucet}, ${avatar ?? '👤'}, ${phone ?? null},
            ${jobTitle ?? 'Barista'}, ${c.meId}, ${c.teamId})
    RETURNING id, name, email`;
  // Členství hned při založení — ne až při prvním přihlášení (kolo 62):
  // sazbu, kterou vedení nastaví ještě před ním, má členství nést.
  try {
    await pridejClenstvi(Number(newUser.id), Number(c.teamId), ucet, { jobTitle: jobTitle ?? 'Barista' });
    await zapisRoliClenstvi(Number(newUser.id), Number(c.teamId), role);
  } catch { /* před migrací */ }
  // Kdo účet založil (a zná jeho první heslo), musí jít dohledat.
  audit(c.teamId, c.meId, 'team.create_account', 'user', Number(newUser.id), `Založen účet ${email} (${role.nazev})`);

  // Účet vznikl, ať e-mail dopadne jakkoli — ale jestli přístupové údaje
  // odešly, se nesmí jen předpokládat. Bez nich se člověk nepřihlásí.
  let emailSent = false;
  let emailError: string | null = null;
  if (sendInvite) {
    const mail = await sendInvitationEmail(email, name, password);
    emailSent = mail.sent;
    emailError = mail.error;
  }

  return NextResponse.json({
    id: newUser.id, name: newUser.name, email: newUser.email,
    emailSent, emailError,
  });
}
