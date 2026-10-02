// Google Wallet: věrnostní karta (Loyalty class + object) a odkaz „Uložit do Google Wallet“.
//
// Odkaz je JWT podepsané RS256 privátním klíčem servisního účtu; objekt a třída
// v něm cestují celé ("skinny" JWT by vyžadoval předem vytvořené objekty přes API),
// takže se při prvním uložení vytvoří samy. Bez konfigurace (lib/walletKonfig) se nic
// nevolá. Aktualizace bodů je PATCH přes Wallet Objects API a taky jen s konfigurací;
// jinak se tiše přeskočí. Bez účtu Google se to nedá ověřit: struktura je podle
// dokumentace Google Wallet (Loyalty), ale proti živému API tu neběžela.

import { SignJWT, importPKCS8 } from 'jose';
import { bezpecnaBarva, POPISKY_KARTY, razitkaText, seriove, urovenVJazyce, zkrat, type DataKarty } from './walletKarta.ts';
import type { GoogleKonfig } from './walletKonfig.ts';

const ODKAZ_ULOZIT = 'https://pay.google.com/gp/v/save/';
const API = 'https://walletobjects.googleapis.com/walletobjects/v1';

/** Id třídy: jedna třída na podnik. Google chce `issuerId.identifikátor` se znaky [A-Za-z0-9._-]. */
export function idTridy(cfg: Pick<GoogleKonfig, 'issuerId'>, teamId: number): string {
  return `${cfg.issuerId}.managero_podnik_${teamId}`;
}

/** Id objektu: jedna karta v jednom podniku (stabilní, takže druhé uložení je jen „už máš“). */
export function idObjektu(cfg: Pick<GoogleKonfig, 'issuerId'>, d: Pick<DataKarty, 'kod' | 'teamId'>): string {
  return `${cfg.issuerId}.${seriove(d).replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

const text = (en: string) => ({ defaultValue: { language: 'en', value: en } });

export function loyaltyTrida(cfg: Pick<GoogleKonfig, 'issuerId'>, d: DataKarty) {
  const p = POPISKY_KARTY[d.jazyk];
  return {
    id: idTridy(cfg, d.teamId),
    issuerName: zkrat(d.podnik, 40),
    programName: zkrat(d.podnik, 40),
    reviewStatus: 'UNDER_REVIEW',
    hexBackgroundColor: bezpecnaBarva(d.barva),
    ...(d.logoUrl.startsWith('https://') ? { programLogo: { sourceUri: { uri: d.logoUrl }, contentDescription: text(d.podnik) } } : {}),
    // Logo Google u věrnostní třídy vyžaduje; endpoint proto bez loga podniku dosadí ikonu aplikace.
    ...(d.odkaz.startsWith('https://') ? { homepageUri: { uri: d.odkaz, description: p.odkaz } } : {}),
  };
}

/** Objekt karty: jméno hosta, body, razítka, úroveň a QR s kódem karty. */
export function loyaltyObjekt(cfg: Pick<GoogleKonfig, 'issuerId'>, d: DataKarty) {
  const p = POPISKY_KARTY[d.jazyk];
  const uroven = d.uroven ? urovenVJazyce(d.uroven, d.jazyk) : '';
  const textModules = [
    { id: 'razitka', header: p.razitka, body: razitkaText(d) },
    ...(uroven ? [{ id: 'uroven', header: p.uroven, body: uroven }] : []),
    { id: 'kod', header: p.kod, body: d.kod },
  ];
  return {
    id: idObjektu(cfg, d),
    classId: idTridy(cfg, d.teamId),
    state: 'ACTIVE',
    accountId: d.kod,
    accountName: zkrat(d.host, 60),
    loyaltyPoints: { label: p.body, balance: { int: Math.max(0, Math.round(d.body)) } },
    barcode: { type: 'QR_CODE', value: d.kod, alternateText: d.kod },
    textModulesData: textModules,
    hexBackgroundColor: bezpecnaBarva(d.barva),
  };
}

/** Odkaz „Uložit do Google Wallet“: https://pay.google.com/gp/v/save/<JWT>. */
export async function odkazUlozitDoGoogle(cfg: GoogleKonfig, d: DataKarty, origin: string, nyni = Math.floor(Date.now() / 1000)): Promise<string> {
  const klic = await importPKCS8(cfg.privateKeyPem, 'RS256');
  const jwt = await new SignJWT({
    iss: cfg.email,
    aud: 'google',
    typ: 'savetowallet',
    origins: origin ? [origin] : [],
    payload: { loyaltyClasses: [loyaltyTrida(cfg, d)], loyaltyObjects: [loyaltyObjekt(cfg, d)] },
  }).setProtectedHeader({ alg: 'RS256', typ: 'JWT' }).setIssuedAt(nyni).sign(klic);
  return ODKAZ_ULOZIT + jwt;
}

/** Přístupový token servisního účtu pro Wallet Objects API (OAuth, JWT bearer). */
async function tokenServisnihoUctu(cfg: GoogleKonfig): Promise<string | null> {
  const klic = await importPKCS8(cfg.privateKeyPem, 'RS256');
  const nyni = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: 'https://www.googleapis.com/auth/wallet_object.issuer' })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuer(cfg.email).setAudience('https://oauth2.googleapis.com/token').setIssuedAt(nyni).setExpirationTime(nyni + 3600).sign(klic);
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!r.ok) return null;
  const j: any = await r.json().catch(() => null);
  return typeof j?.access_token === 'string' ? j.access_token : null;
}

/**
 * Přepíše body, razítka a úroveň u už uložené karty (PATCH). Bez konfigurace se nic
 * neděje. Objekt, který host neuložil (404), je v pořádku, a každá jiná chyba se tiše
 * spolkne: změna bodů se kvůli peněžence nesmí nikdy nepovést. Vrací, zda se PATCH povedl.
 */
export async function aktualizujGoogleObjekt(cfg: GoogleKonfig | null, d: DataKarty): Promise<boolean> {
  if (!cfg) return false;
  try {
    const token = await tokenServisnihoUctu(cfg);
    if (!token) return false;
    const o = loyaltyObjekt(cfg, d);
    const r = await fetch(`${API}/loyaltyObject/${encodeURIComponent(o.id)}`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ loyaltyPoints: o.loyaltyPoints, textModulesData: o.textModulesData }),
    });
    return r.ok;
  } catch {
    return false;
  }
}
