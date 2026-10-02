import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { hit, clear } from '@/lib/rateLimit';
import { smazUcet, hesloSedi } from '@/lib/smazaniUctuDb';
import { cistyJazyk } from '@/lib/i18n/config';
import { cistePrefsUctu } from '@/lib/nastaveniUcet';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function meId() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return parseInt((session.user as any).id);
}

const DEFAULT_NOTIF_PREFS = { messages: true, lowStock: true, shifts: true };

function serialize(u: any) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatar: u.avatar,
    phone: u.phone,
    jobTitle: u.job_title,
    shiftPreference: u.shift_preference,
    theme: u.theme ?? 'light',
    notifPrefs: { ...DEFAULT_NOTIF_PREFS, ...(u.notif_prefs ?? {}) },
    role: u.role,
    // Jazyk aplikace; null = podle podniku (sloupec před migrací se tváří jako null).
    lang: cistyJazyk(u.lang) ?? null,
  };
}

export async function GET() {
  const id = await meId();
  if (!id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  // notif_prefs fetched defensively so a pending migration can't 500 the account.
  let user: any;
  try {
    [user] = await sql`
      SELECT id, name, email, avatar, phone, job_title, shift_preference, theme, notif_prefs, role
      FROM users WHERE id = ${id}`;
  } catch {
    [user] = await sql`
      SELECT id, name, email, avatar, phone, job_title, shift_preference, theme, role
      FROM users WHERE id = ${id}`;
  }
  if (!user) return NextResponse.json({ error: 'Uživatel nenalezen' }, { status: 404 });
  try { const [l] = await sql`SELECT lang FROM users WHERE id = ${id}`; user.lang = l?.lang ?? null; } catch { /* sloupec ještě není */ }

  return NextResponse.json({ user: serialize(user) });
}

export async function PATCH(request: Request) {
  const id = await meId();
  if (!id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { name, avatar, phone, jobTitle, shiftPreference, theme, notifPrefs, currentPassword, newPassword, lang } = body;

  // Password change flow
  if (currentPassword !== undefined || newPassword !== undefined) {
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Zadejte současné i nové heslo.' }, { status: 400 });
    }
    if (String(newPassword).length < 8) {
      return NextResponse.json({ error: 'Nové heslo musí mít alespoň 8 znaků.' }, { status: 400 });
    }
    const [user] = await sql`SELECT password_hash FROM users WHERE id = ${id}`;
    if (!user) return NextResponse.json({ error: 'Uživatel nenalezen' }, { status: 404 });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Současné heslo není správné.' }, { status: 400 });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${id}`;
    return NextResponse.json({ ok: true, message: 'Heslo bylo změněno.' });
  }

  // Validation for provided fields
  if (name !== undefined && String(name).trim() === '') {
    return NextResponse.json({ error: 'Jméno nesmí být prázdné.' }, { status: 400 });
  }
  if (theme !== undefined && theme !== 'light' && theme !== 'dark' && theme !== 'system') {
    return NextResponse.json({ error: 'Neplatný motiv vzhledu.' }, { status: 400 });
  }

  // Jazyk aplikace (kolo 76): osobní věc účtu jako motiv, žádná brána oprávněním.
  // Neplatná hodnota se ignoruje; `null` vrací jazyk podniku. Bez sloupce
  // (před /api/init) se nic neuloží a jazyk zůstane v cookie zařízení.
  if (lang !== undefined) {
    try {
      if (lang === null) await sql`UPDATE users SET lang = NULL WHERE id = ${id}`;
      else if (cistyJazyk(lang)) await sql`UPDATE users SET lang = ${cistyJazyk(lang)!} WHERE id = ${id}`;
    } catch { /* column not migrated yet — ignore until /api/init runs */ }
  }

  // Notification preferences — merged onto whatever is stored (partial updates ok).
  if (notifPrefs && typeof notifPrefs === 'object') {
    try {
      const [cur] = await sql`SELECT notif_prefs FROM users WHERE id = ${id}`;
      const merged = { ...DEFAULT_NOTIF_PREFS, ...(cur?.notif_prefs ?? {}), ...cistePrefsUctu(notifPrefs) };
      await sql`UPDATE users SET notif_prefs = ${JSON.stringify(merged)}::jsonb WHERE id = ${id}`;
    } catch { /* column not migrated yet — ignore until /api/init runs */ }
  }

  // Profile update flow (only provided fields)
  // Kolo 67: vlastní profil je osobní věc účtu, ne podniku — žádná brána
  // oprávněním (kiosk, host i člověk bez podniku si mění jméno a motiv).
  // Pozici si tu člověk přepisuje sám odjakživa (Nastavení → Profil, i
  // barista); tym.upravit hlídá pozici CIZÍHO člena v teams/members.
  await sql`
    UPDATE users SET
      name = COALESCE(${name ?? null}, name),
      avatar = COALESCE(${avatar ?? null}, avatar),
      phone = COALESCE(${phone ?? null}, phone),
      job_title = COALESCE(${jobTitle ?? null}, job_title),
      shift_preference = COALESCE(${shiftPreference ?? null}, shift_preference),
      theme = COALESCE(${theme ?? null}, theme)
    WHERE id = ${id}`;

  let updated: any;
  try {
    [updated] = await sql`
      SELECT id, name, email, avatar, phone, job_title, shift_preference, theme, notif_prefs, role
      FROM users WHERE id = ${id}`;
  } catch {
    [updated] = await sql`
      SELECT id, name, email, avatar, phone, job_title, shift_preference, theme, role
      FROM users WHERE id = ${id}`;
  }

  try { const [l] = await sql`SELECT lang FROM users WHERE id = ${id}`; updated.lang = l?.lang ?? null; } catch { /* sloupec ještě není */ }
  return NextResponse.json({ ok: true, user: serialize(updated) });
}

// Smazání vlastního účtu (Apple 5.1.1(v), Google Play). Tělo: { password, smazatPodnik?, potvrzeni? }.
// Pravidla (host, zaměstnanec, vlastník podniku) jsou v lib/smazaniUctu.ts.
// Heslo se vyžaduje vždy: kdo najde odemčený telefon, účet smazat nesmí.
export async function DELETE(request: Request) {
  const id = await meId();
  if (!id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const heslo = String(body?.password ?? '');
  if (!heslo) return NextResponse.json({ error: 'Zadejte heslo.' }, { status: 400 });
  // Pokusy o hádání hesla přes tenhle endpoint se počítají jako u přihlášení.
  const gate = await hit(`smazani:${id}`, 5, 60 * 60, { failClosed: true });
  if (!gate.ok) return NextResponse.json({ error: 'Příliš mnoho pokusů. Zkuste to později.' }, { status: 429 });
  if (!(await hesloSedi(id, heslo))) return NextResponse.json({ error: 'Heslo není správné.' }, { status: 400 });
  try {
    const r = await smazUcet(id, { smazatPodnik: body?.smazatPodnik === true, potvrzeni: body?.potvrzeni ?? null, zDuvodu: 'aplikace' });
    if (!r.ok) return NextResponse.json({ error: r.zprava, kod: r.kod, vlastnene: r.vlastnene }, { status: r.status });
    await clear(`smazani:${id}`);
    return NextResponse.json({ ok: true, smazanePodniky: r.smazanePodniky, varovani: r.varovani });
  } catch (e) {
    console.error('smazání účtu selhalo', e);
    // Kroky jsou opakovatelné; člověk to může zkusit znovu.
    return NextResponse.json({ error: 'Účet se nepodařilo smazat. Zkuste to znovu, nebo napište podpoře.' }, { status: 500 });
  }
}
