// Které nastavení prostředí chybí — pro /api/health a pro kontrolu před
// spuštěním. Jen názvy proměnných a ano/ne, nikdy jejich hodnoty.

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
  pravniUdaje: ['FIRMA_NAZEV', 'FIRMA_ICO', 'FIRMA_ADRESA', 'FIRMA_EMAIL_PODPORY', 'FIRMA_REGION_DAT'],
  walletApple: ['APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID', 'APPLE_PASS_CERT_P12_BASE64', 'APPLE_WWDR_CERT_PEM'],
  walletGoogle: ['GOOGLE_WALLET_ISSUER_ID', 'GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_WALLET_PRIVATE_KEY'],
};

const ma = (env: Env, k: string) => Boolean(env[k]?.trim());

export function stavNastaveni(env: Env): { povinneChybi: string[]; funkce: Record<string, boolean> } {
  const povinneChybi = POVINNE.filter(k => !ma(env, k));
  const funkce = Object.fromEntries(Object.entries(FUNKCE).map(([f, klice]) => [f, klice.every(k => ma(env, k))]));
  return { povinneChybi, funkce };
}
