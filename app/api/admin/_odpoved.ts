// Jedna cesta, jak admin routa odpoví: chyba správce → její kód, jiná
// chyba → 500 bez detailu (stack nepatří ven).
import { NextResponse } from 'next/server';
import { AdminError } from '@/lib/admin';
import type { Gate } from '@/lib/superadminGate';

export function odmitnuto(g: Extract<Gate, { ok: false }>) {
  return NextResponse.json({ error: g.error }, { status: g.status });
}

export async function odpoved(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn());
  } catch (e) {
    if (e instanceof AdminError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error('admin:', e);
    return NextResponse.json({ error: 'Zásah se nepovedl. Zkus to znovu; když to trvá, je to v logu serveru.' }, { status: 500 });
  }
}

export function idZ(params: { id: string }): number {
  const id = parseInt(params.id, 10);
  if (!Number.isFinite(id)) throw new AdminError(400, 'Neplatné id podniku.');
  return id;
}
