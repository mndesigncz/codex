// Karta hosta v Apple Wallet a Google Wallet: co je nakonfigurované.
//
// Stejný princip jako web push (lib/push.ts, lib/pushKlient.ts): bez přihlašovacích
// údajů se tlačítka vůbec nenabízejí a endpointy odpoví 404. Nic se nepředstírá.
//
// Apple (všechno povinné dohromady):
//   APPLE_PASS_TYPE_ID          např. pass.app.managero.karta (Apple Developer, Identifiers → Pass Type IDs)
//   APPLE_TEAM_ID               10znakové Team ID
//   APPLE_PASS_CERT_P12_BASE64  certifikát Pass Type ID i s privátním klíčem (.p12) zakódovaný v base64
//   APPLE_PASS_CERT_PASSWORD    heslo k .p12 (smí být prázdné, nebo chybět)
//   APPLE_WWDR_CERT_PEM         zprostředkující certifikát Apple WWDR (PEM; zalomení smí být psané jako \n)
// Google (všechno povinné dohromady):
//   GOOGLE_WALLET_ISSUER_ID                číslo vydavatele z Google Pay & Wallet Console
//   GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL    e-mail servisního účtu s přístupem k Wallet API
//   GOOGLE_WALLET_PRIVATE_KEY              jeho privátní klíč (PEM; zalomení smí být psané jako \n)

export type WalletEnv = Record<string, string | undefined>;

export interface WalletKonfigurace {
  apple: boolean;
  google: boolean;
  /** Které proměnné u dané strany chybí (jen když je nastavená aspoň jedna z nich, tedy překlep nebo půlka). */
  appleChybi: string[];
  googleChybi: string[];
}

export const APPLE_PROMENNE = ['APPLE_PASS_TYPE_ID', 'APPLE_TEAM_ID', 'APPLE_PASS_CERT_P12_BASE64', 'APPLE_WWDR_CERT_PEM'] as const;
export const GOOGLE_PROMENNE = ['GOOGLE_WALLET_ISSUER_ID', 'GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL', 'GOOGLE_WALLET_PRIVATE_KEY'] as const;

const maHodnotu = (env: WalletEnv, k: string) => String(env[k] ?? '').trim() !== '';

/** Čistá funkce: z proměnných prostředí zjistí, co je nakonfigurované. */
export function walletKonfigurace(env: WalletEnv = process.env): WalletKonfigurace {
  const appleChybi = APPLE_PROMENNE.filter(k => !maHodnotu(env, k));
  const googleChybi = GOOGLE_PROMENNE.filter(k => !maHodnotu(env, k));
  return {
    apple: appleChybi.length === 0,
    google: googleChybi.length === 0,
    appleChybi: appleChybi.length === APPLE_PROMENNE.length ? [] : [...appleChybi],
    googleChybi: googleChybi.length === GOOGLE_PROMENNE.length ? [] : [...googleChybi],
  };
}

/** PEM z proměnné prostředí: hostingy často ukládají zalomení řádků jako dvojznak \n. */
export function pemZEnv(raw: string | undefined): string {
  return String(raw ?? '').trim().replace(/\\n/g, '\n');
}

export interface AppleKonfig { passTypeId: string; teamId: string; p12Base64: string; heslo: string; wwdrPem: string }
export interface GoogleKonfig { issuerId: string; email: string; privateKeyPem: string }

export function appleKonfig(env: WalletEnv = process.env): AppleKonfig | null {
  if (!walletKonfigurace(env).apple) return null;
  return {
    passTypeId: String(env.APPLE_PASS_TYPE_ID).trim(), teamId: String(env.APPLE_TEAM_ID).trim(),
    p12Base64: String(env.APPLE_PASS_CERT_P12_BASE64).replace(/\s+/g, ''), heslo: String(env.APPLE_PASS_CERT_PASSWORD ?? ''),
    wwdrPem: pemZEnv(env.APPLE_WWDR_CERT_PEM),
  };
}

export function googleKonfig(env: WalletEnv = process.env): GoogleKonfig | null {
  if (!walletKonfigurace(env).google) return null;
  return {
    issuerId: String(env.GOOGLE_WALLET_ISSUER_ID).trim(), email: String(env.GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL).trim(),
    privateKeyPem: pemZEnv(env.GOOGLE_WALLET_PRIVATE_KEY),
  };
}
