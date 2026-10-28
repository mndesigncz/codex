// Které nastavení prostředí chybí — pro /api/health a pro kontrolu před
// spuštěním. Jen názvy proměnných a ano/ne, nikdy jejich hodnoty.

import { chybejiciUdaje, firma } from './firma.ts';

type Env = Record<string, string | undefined>;

/** Bez těchhle aplikace na ostrém nasazení nefunguje (přihlášení, odkazy, crony). */
export const POVINNE = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL', 'NEXT_PUBLIC_APP_URL', 'CRON_SECRET'] as const;

/** Funkce, které se bez svých proměnných jen nenabízejí. */
export const FUNKCE: Record<string, readonly string[]> = {
  email: ['RESEND_API_KEY', 'EMAIL_FROM'],
  platby: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'],
  soubory: ['BLOB_READ_WRITE_TOKEN'],
  pushWeb: ['NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT'],
  pushIos: ['APNS_KEY_P8', 'APNS_KEY_ID', 'APNS_TEAM_ID'],
  pushAndroid: ['FCM_PROJECT_ID', 'FCM_SERVICE_ACCOUNT'],
  // Údaje provozovatele mají od 2026-10-21 výchozí hodnoty v lib/firma.ts (Martin, IČO 17944953);
  // proměnné FIRMA_* je jen přebíjejí. Stav se proto počítá z firma(), ne z prostředí (viz stavNastaveni).
  pravniUdaje: [],
  // Retence osobních údajů (lib/retence.ts): zásady a zpracovatelská smlouva popisují lhůty jako platné,
  // cron je ale bez RETENCE_ZAPNUTA=1 jen náhled. Ano jen s přesně „1“ (stejně jako retenceZapnuta()).
  retenceOstra: [],
  walletApple: ['APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID', 'APPLE_PASS_CERT_P12_BASE64', 'APPLE_WWDR_CERT_PEM'],
  walletGoogle: ['GOOGLE_WALLET_ISSUER_ID', 'GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_WALLET_PRIVATE_KEY'],
};

const ma = (env: Env, k: string) => Boolean(env[k]?.trim());

/** Náhled na Vercelu: NextAuth bez NEXTAUTH_URL vezme adresu nasazení z x-forwarded-host
 *  (next-auth/utils/detect-origin, větev VERCEL). Produkční adresa tam naopak nepatří. */
const NEPOVINNE_V_NAHLEDU: readonly string[] = ['NEXTAUTH_URL'];

export function stavNastaveni(env: Env): { povinneChybi: string[]; funkce: Record<string, boolean> } {
  const nahled = env.VERCEL_ENV === 'preview';
  const povinneChybi = POVINNE.filter(k => !ma(env, k) && !(nahled && NEPOVINNE_V_NAHLEDU.includes(k)));
  const funkce = Object.fromEntries(Object.entries(FUNKCE).map(([f, klice]) => [f, klice.every(k => ma(env, k))]));
  // Právní údaje: vyplněné, když lib/firma.ts (výchozí hodnoty + FIRMA_*) nemá žádný chybějící povinný údaj.
  funkce.pravniUdaje = chybejiciUdaje(firma(env)).length === 0;
  funkce.retenceOstra = String(env.RETENCE_ZAPNUTA ?? '').trim() === '1';
  return { povinneChybi, funkce };
}
