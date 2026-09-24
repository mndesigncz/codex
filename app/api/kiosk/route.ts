import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { teamIsPro, PRO_ONLY_MSG } from '@/lib/planServer';
import { jeClenem } from '@/lib/tenant';
import { pozaduj, jeOdpoved, roleClena, type Kontext } from '@/lib/opravneniDb';
import { navic, systemovaRole } from '@/lib/opravneni';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Kolo 67: přihlášení tabletu spravuje kiosk.spravovat. Kdo tabletu nastaví
// e-mail a heslo, umí se za tablet přihlásit — a získat tím všechno, co má
// role Kiosk (píchání za kohokoli, uzávěrky za jiného, plnění úkolů). Proto
// musí volající sám mít všechna oprávnění té role; jinak by si přes tablet
// přidal, co mu role nedala.
async function smiSpravovatTablet(c: Kontext, kioskId: number | null): Promise<string | null> {
  if (c.role.jeVlastnik) return null;
  // Role, kterou tablet v podniku skutečně má; bez členství (tablet jde přes
  // zrcadlo users.team_id) systémová role Kiosk.
  const r = kioskId != null ? await roleClena(kioskId, c.teamId, { cerstve: true }) : null;
  const sada = r ? [...r.opravneni] : systemovaRole('kiosk')!.opravneni;
  return navic(sada, c.role.opravneni).length
    ? 'Tablet má oprávnění, která ty nemáš — jeho přihlášení spravuje jen někdo, kdo je má všechna.'
    : null;
}

// GET — the team's kiosk account (if any).
export async function GET() {
  const c = await pozaduj('kiosk.spravovat');
  if (jeOdpoved(c)) return c;
  const [k] = await sql`SELECT id, email, name FROM users WHERE team_id = ${c.teamId} AND role = 'kiosk' LIMIT 1`;
  return NextResponse.json({ kiosk: k ?? null });
}

// POST — create or update the team's kiosk login.
export async function POST(req: NextRequest) {
  const c = await pozaduj('kiosk.spravovat');
  if (jeOdpoved(c)) return c;

  if (!(await teamIsPro(c.teamId))) {
    return NextResponse.json({ error: PRO_ONLY_MSG }, { status: 403 });
  }

  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  if (!email || password.length < 4) {
    return NextResponse.json({ error: 'Zadejte e-mail a heslo (min. 4 znaky).' }, { status: 400 });
  }

  const [existing] = await sql`SELECT id FROM users WHERE team_id = ${c.teamId} AND role = 'kiosk' LIMIT 1`;
  const nesmi = await smiSpravovatTablet(c, existing ? Number(existing.id) : null);
  if (nesmi) return NextResponse.json({ error: nesmi }, { status: 403 });
  const hash = await bcrypt.hash(password, 10);

  if (existing) {
    // Make sure the new e-mail isn't taken by someone else.
    const [clash] = await sql`SELECT id FROM users WHERE email = ${email} AND id <> ${existing.id}`;
    if (clash) return NextResponse.json({ error: 'Tento e-mail už používá jiný účet.' }, { status: 409 });
    await sql`UPDATE users SET email = ${email}, password_hash = ${hash} WHERE id = ${existing.id}`;
    audit(c.teamId, c.meId, 'kiosk.login', 'user', Number(existing.id), `Změněno přihlášení tabletu (${email})`);
    return NextResponse.json({ ok: true, kiosk: { id: existing.id, email } });
  }

  const [clash] = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (clash) return NextResponse.json({ error: 'Tento e-mail už používá jiný účet.' }, { status: 409 });

  const [k] = await sql`
    INSERT INTO users (name, email, password_hash, role, avatar, team_id)
    VALUES ('Tablet', ${email}, ${hash}, 'kiosk', '📟', ${c.teamId})
    RETURNING id, email`;
  audit(c.teamId, c.meId, 'kiosk.login', 'user', Number(k.id), `Založen tablet (${email})`);
  return NextResponse.json({ ok: true, kiosk: k });
}

// PATCH — set or clear an employee's kiosk PIN.
// Kolo 67: dochazka.piny. Kdo zná PIN, píchne za člověka na tabletu a tablet
// pak jedná jeho jménem (lib/kioskActing.ts) — nastavit PIN je tedy totéž
// jako půjčit si jeho oprávnění. Cizí PIN proto nastaví jen ten, kdo má
// aspoň všechna oprávnění cíle (vlastník vždy). Vedení má celý katalog,
// takže PIN komukoli nastaví dál jako dosud.
// Každé nastavení jde do auditu.
export async function PATCH(req: NextRequest) {
  const c = await pozaduj('dochazka.piny');
  if (jeOdpoved(c)) return c;

  const b = await req.json().catch(() => ({}));
  const userId = parseInt(b.userId);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: 'Neplatný uživatel' }, { status: 400 });
  const pin = b.pin === null || b.pin === '' ? null : String(b.pin).replace(/\D/g, '').slice(0, 6);
  if (pin !== null && pin.length < 4) return NextResponse.json({ error: 'PIN musí mít 4–6 číslic.' }, { status: 400 });

  // Kolo 62: členství nebo zrcadlo (tablet helper vyloučí sám). PIN leží na
  // osobě, takže platí ve všech jejích podnicích — to je záměr, ne chyba.
  if (!(await jeClenem(userId, c.teamId))) return NextResponse.json({ error: 'Zaměstnanec nenalezen' }, { status: 404 });
  if (userId !== c.meId && !c.role.jeVlastnik) {
    const cil = await roleClena(userId, c.teamId, { cerstve: true });
    if (cil && navic(cil.opravneni, c.role.opravneni).length) {
      return NextResponse.json({ error: 'Tenhle člověk má oprávnění, která ty nemáš — jeho PIN nastaví jen někdo nad ním.' }, { status: 403 });
    }
  }

  // PIN se ukládá zahašovaný. Dřív ležel v databázi čitelný, takže kdo se
  // dostal k výpisu, mohl se odpíchnout za kohokoli z týmu.
  const pinHash = pin === null ? null : await bcrypt.hash(pin, 10);
  try {
    await sql`UPDATE users SET pin_hash = ${pinHash}, pin = NULL WHERE id = ${userId}`;
  } catch {
    // Sloupec pin_hash ještě nemusí existovat (chybí migrace) — ať zápis PINu
    // neselže, uloží se postaru a při první migraci se převede.
    await sql`UPDATE users SET pin = ${pin} WHERE id = ${userId}`;
  }
  audit(c.teamId, c.meId, 'kiosk.pin', 'user', userId, pin === null ? 'PIN smazán' : 'PIN nastaven');
  return NextResponse.json({ ok: true });
}
