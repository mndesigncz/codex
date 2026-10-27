// E-mailový kanál zpráv členům: komu se smí poslat, jak vypadá e-mail a jak
// funguje odhlášení. Čistá logika bez databáze (testy: scripts/testy/k81-zpravy.ts).
//
// Zásady:
//  * E-mail dostane jen člen, který souhlasil s novinkami (users.notif_prefs.novinky),
//    nevypnul e-maily (novinkyEmail !== false), má platný e-mail a není blokovaný.
//    Importovaný kontakt souhlas nemá (zákon 480/2004).
//  * Odhlášení z e-mailů je odkaz s podpisem (HMAC): nepotřebuje přihlášení ani tabulku
//    tokenů. Podpis váže na uživatele, takže cizí id nejde odhlásit hádáním.
//  * Text zprávy píše provozovatel, patička je v jazyce člena (lib/i18n/email.ts).

import { createHmac, timingSafeEqual } from 'node:crypto';
import { escHtml } from './emailAdresa.ts';
import { emailText } from './i18n/email.ts';
import type { Jazyk } from './i18n/config.ts';

import { podpisoveTajemstvi } from './tajemstvi.ts';
import { odesilatelSdeleni } from './consents.ts';

export * from './zpravyKanaly.ts';

// ---- Odhlášení z e-mailů -----------------------------------------------------------------

const tajemstvi = () => podpisoveTajemstvi();

/**
 * Podpis pro odkaz „Odhlásit se z e-mailů“. S podnikem (`<id>-<podnik>.<24 znaků HMAC>`) odhlásí jen
 * e-maily toho podniku (souhlasy jsou po podnicích, spuštění balík G); bez podniku (`<id>.<HMAC>`,
 * odkazy z dřívějších e-mailů) odhlásí e-maily všech podniků.
 */
export function tokenOdhlaseni(userId: number, teamId?: number | null): string {
  const id = String(Math.trunc(userId));
  const tym = teamId != null && Number.isInteger(teamId) && teamId > 0 ? String(teamId) : null;
  const sig = createHmac('sha256', tajemstvi()).update(tym ? `odhlasit-novinky:${id}:${tym}` : `odhlasit-novinky:${id}`).digest('hex').slice(0, 24);
  return tym ? `${id}-${tym}.${sig}` : `${id}.${sig}`;
}

/** Ověří token z odkazu; vrací uživatele a podnik (null = všechny podniky), nebo null (nepodepsaný, upravený, nesmysl). */
export function overTokenOdhlaseniPodniku(token: unknown): { userId: number; teamId: number | null } | null {
  const m = /^(\d{1,9})(?:-(\d{1,9}))?\.([0-9a-f]{24})$/.exec(String(token ?? ''));
  if (!m) return null;
  const userId = Number(m[1]); const teamId = m[2] ? Number(m[2]) : null;
  const ocekavany = tokenOdhlaseni(userId, teamId).split('.')[1];
  const a = Buffer.from(ocekavany), b = Buffer.from(m[3]);
  return a.length === b.length && timingSafeEqual(a, b) ? { userId, teamId } : null;
}

/** Ověří token z odkazu; vrací id uživatele, nebo null (nepodepsaný, upravený, nesmysl). */
export function overTokenOdhlaseni(token: unknown): number | null {
  return overTokenOdhlaseniPodniku(token)?.userId ?? null;
}

export function odkazOdhlaseni(zaklad: string, userId: number, teamId?: number | null): { stranka: string; api: string } {
  const z = zaklad.replace(/\/+$/, '');
  const t = encodeURIComponent(tokenOdhlaseni(userId, teamId));
  return { stranka: `${z}/client/odhlasit?t=${t}`, api: `${z}/api/client/odhlasit?t=${t}` };
}

// ---- Skládání e-mailu --------------------------------------------------------------------

export interface VstupEmailu {
  podnik: string;
  /** IČO podniku (jen když ho podnik vyplnil): patří k odesílateli obchodního sdělení. */
  ico?: string | null;
  title: string;
  body?: string | null;
  /** Kam tlačítko vede; bez něj se tlačítko nekreslí. */
  odkaz?: string | null;
  kuponNazev?: string | null;
  promoKod?: string | null;
  odhlasitStranka: string;
  jazyk?: Jazyk;
  /** U zkušebního odeslání: předmět dostane značku, ať se nepletl s ostrou zprávou. */
  zkusebni?: boolean;
}

export function predmetZpravy(title: string, zkusebni = false): string {
  const t = title.trim().slice(0, 80) || 'Zpráva od podniku';
  return zkusebni ? `[Zkouška] ${t}` : t;
}

/** Předmět a HTML e-mailu. Všechny hodnoty se escapují; odřádkování v textu zůstává. */
export function sestavEmailZpravy(v: VstupEmailu): { subject: string; html: string } {
  const jazyk: Jazyk = v.jazyk ?? 'cs';
  const telo = (v.body ?? '').trim();
  const radky = telo ? escHtml(telo).replace(/\r?\n/g, '<br>') : '';
  const kod = [
    v.kuponNazev ? `<p style="margin:16px 0 0;padding:12px 14px;background:#F1F4EC;border-radius:12px;font-size:14px;"><strong>${escHtml(v.kuponNazev)}</strong><br><span style="color:#5c6353;">${escHtml(emailText('novinkyKupon', jazyk))}</span></p>` : '',
    v.promoKod ? `<p style="margin:16px 0 0;padding:12px 14px;background:#F1F4EC;border-radius:12px;font-size:15px;">${escHtml(emailText('novinkyPromo', jazyk, { kod: v.promoKod }))}</p>` : '',
  ].join('');
  const tlacitko = v.odkaz ? `<p style="margin:22px 0 0;"><a href="${escHtml(v.odkaz)}" style="display:inline-block;background:#C8F542;color:#16181A;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:bold;">${escHtml(emailText('novinkyOtevrit', jazyk))} →</a></p>` : '';
  // Obchodní sdělení (§ 7 zák. 480/2004): označené už nahoře a s odesílatelem = podnik (jméno, IČO).
  const odesilatel = odesilatelSdeleni(v.podnik, v.ico);
  const html = `
    <div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;padding:28px;color:#16181A;">
      <p style="margin:0 0 6px;color:#5c6353;font-size:13px;"><span style="display:inline-block;padding:2px 8px;border:1px solid #c9cfc0;border-radius:999px;font-size:11px;letter-spacing:.04em;text-transform:uppercase;">${escHtml(emailText('novinkyOznaceni', jazyk))}</span> ${escHtml(v.podnik)}</p>
      <h1 style="font-size:22px;margin:0 0 14px;">${escHtml(v.title)}</h1>
      ${radky ? `<p style="margin:0;font-size:15px;line-height:1.55;">${radky}</p>` : ''}
      ${kod}
      ${tlacitko}
      <hr style="border:none;border-top:1px solid #e3e6dc;margin:28px 0 14px;">
      <p style="margin:0 0 6px;color:#8a917f;font-size:12px;line-height:1.5;">${escHtml(emailText('novinkyOdesilatel', jazyk, { odesilatel }))}</p>
      <p style="margin:0;color:#8a917f;font-size:12px;line-height:1.5;">${escHtml(emailText('novinkyPaticka', jazyk, { podnik: v.podnik }))}
        <a href="${escHtml(v.odhlasitStranka)}" style="color:#5c6353;">${escHtml(emailText('novinkyOdhlasit', jazyk))}</a></p>
    </div>`;
  return { subject: predmetZpravy(v.title, v.zkusebni), html };
}
