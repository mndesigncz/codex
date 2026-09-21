// Přístup bez prohlížeče: MCP pro Clauda a skripty.
//
// Hlavička `Authorization: Bearer <ADMIN_API_TOKEN>`. Chybějící tajemství
// znamená „nikoho", ne „kohokoliv" — stejné pravidlo jako u CRON_SECRET.
// Krátký token se odmítá taky: 32 znaků je podlaha, pod kterou nemá cenu
// dělat porovnání v konstantním čase.

import { sameSecret } from './cronAuth.ts';

export const MIN_TOKEN_LENGTH = 32;

export function adminTokenOk(authHeader: string | null | undefined, token: string | undefined = process.env.ADMIN_API_TOKEN): boolean {
  if (!token || token.length < MIN_TOKEN_LENGTH) return false;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const dany = authHeader.slice(7).trim();
  if (!dany) return false;
  return sameSecret(dany, token);
}
