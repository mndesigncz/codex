// Společné pro přihlášení správy platformy (admin.managero.app): odpovědi a hlášky.
//
// Hlášky jsou schválně obecné. Kdo zkouší cizí účet, nemá se dozvědět, jestli
// e-mail existuje, jestli heslo sedělo, ani jestli je účet správce.
import { NextResponse } from 'next/server';
import { jeAdminHost } from '@/lib/spravaHost';
import { hostPozadavku } from '@/lib/spravaServer';

export const HLASKA_NEPOVEDLO = 'Přihlášení se nepovedlo.';
export const HLASKA_LIMIT = 'Příliš mnoho pokusů. Zkus to znovu za čtvrt hodiny.';
export const HLASKA_VYPRSELO = 'Přihlášení vypršelo. Začni znovu e-mailem a heslem.';

export const chyba = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

/** Jen na hostu správy (middleware to hlídá taky; tohle je druhá vrstva). */
export function naHostuSpravy(request: Request): boolean {
  return jeAdminHost(hostPozadavku(request.headers));
}

export async function teloJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const b = await request.json();
    return b && typeof b === 'object' ? b as Record<string, unknown> : {};
  } catch {
    return {};
  }
}
