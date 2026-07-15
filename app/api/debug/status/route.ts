import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

// Read-only diagnostics: how many rows exist in key tables. No sensitive data.
export async function GET() {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const tables = ['users', 'teams', 'inventory_items', 'shifts', 'chat_messages', 'procedures', 'guides'];
    const counts: Record<string, number | string> = {};
    for (const t of tables) {
      try {
        const rows = await sql(`SELECT COUNT(*)::int AS c FROM ${t}`);
        counts[t] = (rows as any)[0]?.c ?? 0;
      } catch (e: any) {
        counts[t] = 'tabulka neexistuje';
      }
    }
    // list of registered emails' domains only (privacy-safe hint of whether accounts exist)
    let sampleEmails: string[] = [];
    try {
      const rows = await sql(`SELECT email FROM users ORDER BY id ASC LIMIT 5`);
      sampleEmails = (rows as any).map((r: any) => {
        const [name, domain] = String(r.email).split('@');
        return `${name.slice(0, 2)}***@${domain ?? ''}`;
      });
    } catch {}
    return NextResponse.json({ ok: true, counts, sampleEmails, dbHost: (process.env.DATABASE_URL || '').split('@')[1]?.split('/')[0] ?? 'unknown' });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
