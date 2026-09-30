// Registrace tokenu zařízení pro nativní push (APNs / FCM). Volá ji obal po
// udělení povolení a při odhlášení. Web push má vlastní /api/push/subscribe.
//
// Stejně jako odběr webového pushe je to věc účtu, ne podniku (mají ji i hosté
// a lidé bez podniku): brána je jen přihlášení a vazba na vlastní user_id.
// Aplikaci (`managero` nebo `client`) určuje ROLE účtu, ne tělo požadavku:
// host patří do Managero client, ostatní do Managero (lib/obal.ts rolePatriDoObalu).

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { neon } from '@neondatabase/serverless';
import { authOptions } from '@/lib/auth';
import { hit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

const TOKEN = /^[A-Za-z0-9:_.\-]{32,4096}$/;

function platformaZTela(v: unknown): 'ios' | 'android' | null {
  return v === 'ios' || v === 'android' ? v : null;
}

async function me() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.id || !u.role) return null;
  return { id: parseInt(String(u.id)), role: String(u.role) };
}

export async function POST(request: Request) {
  const u = await me();
  if (!u) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const token = typeof b?.token === 'string' ? b.token.trim() : '';
  const platform = platformaZTela(b?.platform);
  if (!TOKEN.test(token) || !platform) return NextResponse.json({ error: 'Neplatný token zařízení.' }, { status: 400 });
  const gate = await hit(`native-push:${u.id}`, 30, 60 * 60);
  if (!gate.ok) return NextResponse.json({ error: 'Příliš mnoho požadavků.' }, { status: 429 });
  const app = u.role === 'customer' ? 'client' : 'managero';
  const env = b?.env === 'sandbox' ? 'sandbox' : 'production';
  const verze = typeof b?.version === 'string' ? b.version.slice(0, 32) : null;
  try {
    const sql = neon(process.env.DATABASE_URL!);
    // Přepnutí účtu na jednom zařízení: token přejde na nového uživatele, starý ho ztratí.
    await sql`
      INSERT INTO device_tokens (user_id, app, platform, token, env, app_version)
      VALUES (${u.id}, ${app}, ${platform}, ${token}, ${env}, ${verze})
      ON CONFLICT (token) DO UPDATE SET user_id = ${u.id}, app = ${app}, platform = ${platform}, env = ${env},
        app_version = ${verze}, last_seen_at = NOW()`;
  } catch (e) {
    // Před migrací tabulka neexistuje: obal to zkusí příště, aplikace nespadne.
    console.error('device_tokens: zápis selhal', e);
    return NextResponse.json({ ok: false, error: 'Oznámení se zatím nepodařilo zapnout.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const u = await me();
  if (!u) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const b = await request.json().catch(() => ({}));
  const token = typeof b?.token === 'string' ? b.token.trim() : '';
  if (!TOKEN.test(token)) return NextResponse.json({ error: 'Neplatný token zařízení.' }, { status: 400 });
  try {
    const sql = neon(process.env.DATABASE_URL!);
    // Jen vlastní token: znalost cizího tokenu nestačí k odhlášení cizích oznámení.
    await sql`DELETE FROM device_tokens WHERE token = ${token} AND user_id = ${u.id}`;
  } catch { /* tabulka ještě není, nic k odhlášení */ }
  return NextResponse.json({ ok: true });
}
