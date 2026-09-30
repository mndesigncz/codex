// Nativní push (APNs pro iPhone, FCM pro Android) za jedním rozhraním.
//
// Webový push (lib/push.ts, knihovna web-push) zůstává beze změny; tohle je
// jen druhá větev pro zařízení v nativním obalu, kde Web Push neexistuje.
// Bez klíčů v prostředí se nic neodesílá (no-op) a nic se nerozbije: kód je
// fail-open, klíče se doplní až po založení účtů u Applu a Googlu.
//
// Prostředí:
//   APNs:  APNS_KEY_ID, APNS_TEAM_ID, APNS_KEY_P8 (obsah .p8, řádky klidně s \n),
//          volitelně APNS_TOPIC_MANAGERO (výchozí app.managero.app),
//          APNS_TOPIC_CLIENT (výchozí app.managero.client)
//   FCM:   FCM_PROJECT_ID, FCM_SERVICE_ACCOUNT (JSON servisního účtu)
// Přímé APNs (bez Firebase) jsme zvolili pro iOS; Android jde přes FCM HTTP v1.
// Čisté části (sestavení zpráv, JWT) mají testy v scripts/testy/k77-obal.ts.

import { createSign, createPrivateKey, sign as cryptoSign } from 'node:crypto';
import http2 from 'node:http2';

export interface NativniZprava { title: string; body?: string; link?: string; tag?: string; badge?: number }
export interface NativniZarizeni { token: string; app: string; env: string }
export interface VysledekPosilani { neplatne: string[]; odeslano: number }

/** Bundle ID aplikací — rozhodnutí: provozní `app.managero.app`, hostovská `app.managero.client`. */
export const BUNDLE_ID = { managero: 'app.managero.app', client: 'app.managero.client' } as const;

export function topicPro(app: string, env: Record<string, string | undefined> = process.env): string {
  if (app === 'client') return (env.APNS_TOPIC_CLIENT ?? '').trim() || BUNDLE_ID.client;
  return (env.APNS_TOPIC_MANAGERO ?? '').trim() || BUNDLE_ID.managero;
}

// ---- APNs ------------------------------------------------------------------------

export function sestavApnsPayload(z: NativniZprava): Record<string, unknown> {
  const aps: Record<string, unknown> = {
    alert: { title: z.title.slice(0, 120), ...(z.body ? { body: z.body.slice(0, 240) } : {}) },
    sound: 'default',
  };
  if (typeof z.badge === 'number' && z.badge >= 0) aps.badge = Math.floor(z.badge);
  if (z.tag) aps['thread-id'] = z.tag.slice(0, 64);
  // `link` jde mimo `aps`: klient ho po klepnutí na oznámení otevře (pushNotificationActionPerformed).
  return { aps, link: z.link ?? '/' };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** Přihlašovací JWT pro APNs (ES256, platí hodinu; Apple chce nový nejdřív za 20 minut). */
export function apnsJwt(keyId: string, teamId: string, p8: string, nyni = Math.floor(Date.now() / 1000)): string {
  const hlava = b64url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const telo = b64url(JSON.stringify({ iss: teamId, iat: nyni }));
  const data = `${hlava}.${telo}`;
  const podpis = cryptoSign('sha256', Buffer.from(data), { key: createPrivateKey(normalizujPem(p8)), dsaEncoding: 'ieee-p1363' });
  return `${data}.${b64url(podpis)}`;
}

/** Klíč z prostředí často přijde s doslovnými `\n` místo nových řádků. */
export function normalizujPem(s: string): string {
  return s.includes('\\n') ? s.replace(/\\n/g, '\n') : s;
}

let jwtCache: { at: number; jwt: string } | null = null;

export interface ApnsKonfigurace { keyId: string; teamId: string; p8: string; env: Record<string, string | undefined> }
export function apnsKonfigurace(env: Record<string, string | undefined> = process.env): ApnsKonfigurace | null {
  const keyId = (env.APNS_KEY_ID ?? '').trim();
  const teamId = (env.APNS_TEAM_ID ?? '').trim();
  const p8 = (env.APNS_KEY_P8 ?? '').trim();
  if (!keyId || !teamId || !p8) return null;
  return { keyId, teamId, p8, env };
}

/** Jedna odpověď APNs: je token trvale neplatný (smazat), nebo jde o přechodnou chybu? */
export function apnsTokenNeplatny(status: number, duvod: string | undefined): boolean {
  if (status === 410) return true;
  return status === 400 && (duvod === 'BadDeviceToken' || duvod === 'DeviceTokenNotForTopic' || duvod === 'Unregistered');
}

export type Doprava = (z: { host: string; hlavicky: Record<string, string>; telo: string }) => Promise<{ status: number; telo: string }>;

const http2Doprava: Doprava = ({ host, hlavicky, telo }) => new Promise((resolve, reject) => {
  const klient = http2.connect(`https://${host}`);
  const konec = (fn: () => void) => { try { klient.close(); } catch { /* už zavřeno */ } fn(); };
  klient.on('error', e => konec(() => reject(e)));
  const req = klient.request({ ':method': 'POST', ...hlavicky });
  let status = 0; let data = '';
  req.setEncoding('utf8');
  req.on('response', h => { status = Number(h[':status'] ?? 0); });
  req.on('data', d => { data += d; });
  req.on('end', () => konec(() => resolve({ status, telo: data })));
  req.on('error', e => konec(() => reject(e)));
  req.setTimeout(8000, () => { req.close(); });
  req.end(telo);
});

export async function poslatApns(cfg: ApnsKonfigurace, zarizeni: NativniZarizeni[], z: NativniZprava, doprava: Doprava = http2Doprava): Promise<VysledekPosilani> {
  const out: VysledekPosilani = { neplatne: [], odeslano: 0 };
  if (!zarizeni.length) return out;
  const nyni = Math.floor(Date.now() / 1000);
  if (!jwtCache || nyni - jwtCache.at > 40 * 60) jwtCache = { at: nyni, jwt: apnsJwt(cfg.keyId, cfg.teamId, cfg.p8, nyni) };
  const jwt = jwtCache.jwt;
  const telo = JSON.stringify(sestavApnsPayload(z));
  // Dávky po deseti: broadcast podniku jde na stovky zařízení a serverless funkce má omezený čas.
  for (let i = 0; i < zarizeni.length; i += 10) {
    await Promise.all(zarizeni.slice(i, i + 10).map(async (d) => {
      try {
        const host = d.env === 'sandbox' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
        const hlavicky: Record<string, string> = {
          ':path': `/3/device/${d.token}`, ':scheme': 'https', ':authority': host,
          authorization: `bearer ${jwt}`, 'apns-topic': topicPro(d.app, cfg.env), 'apns-push-type': 'alert',
          'apns-priority': '10', 'content-type': 'application/json',
        };
        if (z.tag) hlavicky['apns-collapse-id'] = z.tag.slice(0, 64);
        const r = await doprava({ host, hlavicky, telo });
        if (r.status === 200) { out.odeslano++; return; }
        let duvod: string | undefined;
        try { duvod = JSON.parse(r.telo)?.reason; } catch { /* prázdné tělo */ }
        if (apnsTokenNeplatny(r.status, duvod)) out.neplatne.push(d.token);
        else console.error('APNs odmítl zprávu', r.status, duvod);
      } catch (e) {
        console.error('APNs: odeslání selhalo', e);
      }
    }));
  }
  return out;
}

// ---- FCM (HTTP v1) ---------------------------------------------------------------

/** Kanál, který NativeBridge na Androidu 8+ vytváří (components/NativeBridge); FCM zpráva do něj musí mířit. */
export const ANDROID_KANAL = 'default';

export function sestavFcmZpravu(token: string, z: NativniZprava): Record<string, unknown> {
  return {
    message: {
      token,
      notification: { title: z.title.slice(0, 120), ...(z.body ? { body: z.body.slice(0, 240) } : {}) },
      data: { link: z.link ?? '/', ...(z.tag ? { tag: z.tag } : {}) },
      android: { priority: 'HIGH', notification: { channel_id: ANDROID_KANAL, ...(z.tag ? { tag: z.tag } : {}), sound: 'default' } },
    },
  };
}

export interface FcmKonfigurace { projectId: string; email: string; klic: string }
export function fcmKonfigurace(env: Record<string, string | undefined> = process.env): FcmKonfigurace | null {
  const projectId = (env.FCM_PROJECT_ID ?? '').trim();
  const raw = (env.FCM_SERVICE_ACCOUNT ?? '').trim();
  if (!projectId || !raw) return null;
  try {
    const j = JSON.parse(raw);
    if (!j.client_email || !j.private_key) return null;
    return { projectId, email: String(j.client_email), klic: normalizujPem(String(j.private_key)) };
  } catch { return null; }
}

/** JWT pro výměnu za přístupový token Googlu (RS256). */
export function fcmJwt(cfg: FcmKonfigurace, nyni = Math.floor(Date.now() / 1000)): string {
  const hlava = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const telo = b64url(JSON.stringify({
    iss: cfg.email, scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token', iat: nyni, exp: nyni + 3600,
  }));
  const data = `${hlava}.${telo}`;
  const podpis = createSign('RSA-SHA256').update(data).sign(cfg.klic);
  return `${data}.${b64url(podpis)}`;
}

let fcmToken: { do: number; token: string } | null = null;

export function fcmTokenNeplatny(status: number, telo: string): boolean {
  if (status === 404) return true;
  return status === 400 && /UNREGISTERED|INVALID_ARGUMENT/.test(telo) && /token/i.test(telo);
}

export async function poslatFcm(cfg: FcmKonfigurace, zarizeni: NativniZarizeni[], z: NativniZprava, fetchFn: typeof fetch = fetch): Promise<VysledekPosilani> {
  const out: VysledekPosilani = { neplatne: [], odeslano: 0 };
  if (!zarizeni.length) return out;
  try {
    const nyni = Math.floor(Date.now() / 1000);
    if (!fcmToken || fcmToken.do < nyni + 60) {
      const r = await fetchFn('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: fcmJwt(cfg, nyni) }),
      });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok || !j.access_token) { console.error('FCM: přístupový token se nezískal', r.status); return out; }
      fcmToken = { token: String(j.access_token), do: nyni + Number(j.expires_in ?? 3000) };
    }
    const hlavicka = { authorization: `Bearer ${fcmToken.token}`, 'content-type': 'application/json' };
    for (let i = 0; i < zarizeni.length; i += 10) {
      await Promise.all(zarizeni.slice(i, i + 10).map(async (d) => {
        try {
          const r = await fetchFn(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/messages:send`, {
            method: 'POST', headers: hlavicka, body: JSON.stringify(sestavFcmZpravu(d.token, z)),
          });
          if (r.ok) { out.odeslano++; return; }
          const telo = await r.text().catch(() => '');
          if (fcmTokenNeplatny(r.status, telo)) out.neplatne.push(d.token);
          else console.error('FCM odmítl zprávu', r.status);
        } catch (e) { console.error('FCM: odeslání selhalo', e); }
      }));
    }
  } catch (e) {
    console.error('FCM: chyba', e);
  }
  return out;
}

// ---- Rozhraní navenek ------------------------------------------------------------

/**
 * Pošle zprávu na nativní zařízení uživatele. Bez nakonfigurovaného klíče pro
 * danou platformu se zařízení přeskočí (no-op), nikdy nevyhodí výjimku.
 * Vrací tokeny, které poskytovatel označil za trvale neplatné (volající je smaže).
 */
export async function poslatNativne(
  zarizeni: (NativniZarizeni & { platform: string })[],
  z: NativniZprava,
  env: Record<string, string | undefined> = process.env,
): Promise<VysledekPosilani> {
  const out: VysledekPosilani = { neplatne: [], odeslano: 0 };
  try {
    const ios = zarizeni.filter(d => d.platform === 'ios');
    const android = zarizeni.filter(d => d.platform === 'android');
    const apns = ios.length ? apnsKonfigurace(env) : null;
    const fcm = android.length ? fcmKonfigurace(env) : null;
    const [a, f] = await Promise.all([
      apns ? poslatApns(apns, ios, z) : Promise.resolve<VysledekPosilani>({ neplatne: [], odeslano: 0 }),
      fcm ? poslatFcm(fcm, android, z) : Promise.resolve<VysledekPosilani>({ neplatne: [], odeslano: 0 }),
    ]);
    out.neplatne.push(...a.neplatne, ...f.neplatne);
    out.odeslano = a.odeslano + f.odeslano;
  } catch (e) {
    console.error('nativní push selhal', e);
  }
  return out;
}

/** Je nativní push vůbec nastavený (aspoň jedna platforma)? Pro diagnostiku a testy. */
export function nativniPushNastaven(env: Record<string, string | undefined> = process.env): { ios: boolean; android: boolean } {
  return { ios: apnsKonfigurace(env) !== null, android: fcmKonfigurace(env) !== null };
}
