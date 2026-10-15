// Krátkodobý podepsaný odkaz na kartu do peněženky (Apple Wallet .pkpass, Google Wallet).
//
// V aplikaci z obchodu (obal) se Wallet otevírá v prohlížeči systému (SFSafariViewController,
// Chrome Custom Tabs; lib/stahni.ts otevriVeSystemu) — jen ten umí .pkpass nabídnout do Wallet
// a odkaz Googlu otevřít mimo WebView. Prohlížeč systému ale nemá přihlášení z aplikace, takže
// běžná adresa /api/client/card/wallet/… by skončila na 401. Aplikace si proto s přihlášením
// řekne o odkaz s podpisem (HMAC, platí 10 minut, jen pro ten účet, podnik a peněženku).
//
// Čisté (jen node:crypto), testuje scripts/testy/k90-karty-host.ts.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const PLATNOST_ODKAZU_S = 600;
export type Penezenka = 'apple' | 'google';

export interface ObsahOdkazu { u: number; s: string; d: Penezenka; e: number }

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const zB64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');
const podpis = (data: string, tajemstvi: string) => createHmac('sha256', `wallet-odkaz:${tajemstvi}`).update(data).digest('base64url');

export function podepisOdkaz(o: { customerId: number; slug: string; druh: Penezenka }, tajemstvi: string, nyni = Math.floor(Date.now() / 1000)): string {
  const data = b64(JSON.stringify({ u: o.customerId, s: o.slug.slice(0, 80), d: o.druh, e: nyni + PLATNOST_ODKAZU_S } satisfies ObsahOdkazu));
  return `${data}.${podpis(data, tajemstvi)}`;
}

export function overOdkaz(token: unknown, tajemstvi: string, nyni = Math.floor(Date.now() / 1000)): ObsahOdkazu | null {
  const t = String(token ?? '');
  const [data, sig, navic] = t.split('.');
  if (!data || !sig || navic !== undefined || !tajemstvi) return null;
  const cekany = Buffer.from(podpis(data, tajemstvi));
  const dostal = Buffer.from(sig);
  if (cekany.length !== dostal.length || !timingSafeEqual(cekany, dostal)) return null;
  try {
    const o = JSON.parse(zB64(data)) as ObsahOdkazu;
    if (!Number.isInteger(o.u) || o.u <= 0 || typeof o.s !== 'string' || (o.d !== 'apple' && o.d !== 'google') || !Number.isFinite(o.e)) return null;
    return o.e >= nyni ? o : null;
  } catch { return null; }
}
