import webpush from 'web-push';
import { neon } from '@neondatabase/serverless';
import { jeZtlumeno, jeVTichychHodinach, neutralniProNativni, type NotifCategory } from './pushPravidla';
import { pragueHM } from './pragueTime';
import { poslatNativne } from './nativniPush';

export type { NotifCategory };

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    // Kontakt, který se posílá s každou push notifikací. Byla tu adresa
    // jednoho konkrétního podniku; produkt prodávaný dál musí mít svou.
    process.env.VAPID_SUBJECT || 'mailto:podpora@managero.app',
    pub,
    priv,
  );
  configured = true;
  return true;
}

interface PushPayload {
  title: string;
  body?: string;
  link?: string;
  tag?: string;
}

// Preference oznámení člověka (users.notif_prefs). null = sloupec ještě není (před migrací)
// nebo dotaz selhal: běžné kategorie se pak doručí jako dřív, opt-in (novinky) ne.
async function nactiPrefs(sql: any, userId: number): Promise<Record<string, unknown> | null> {
  try {
    const [row] = await sql`SELECT notif_prefs FROM users WHERE id = ${userId}`;
    return (row?.notif_prefs ?? {}) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Web push (VAPID) na všechna prohlížečová zařízení uživatele. Bez klíčů se nic neděje. */
async function poslatWebPush(sql: any, userId: number, payload: PushPayload) {
  // Chybějící VAPID klíče smí vypnout JEN webovou větev. Dřív tu stál `return`
  // z celé funkce a nativní zařízení (APNs/FCM) se bez klíčů pro web nedočkala ničeho.
  if (!ensureConfigured()) return;

  let subs: any[] = [];
  try {
    subs = await sql`SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}`;
  } catch (e) {
    return;
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body ?? '',
    link: payload.link ?? '/',
    tag: payload.tag,
  });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err: any) {
        // Subscription expired / invalid — clean it up
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          try { await sql`DELETE FROM push_subscriptions WHERE id = ${s.id}`; } catch {}
        }
      }
    }),
  );
}

/** Nativní push (APNs / FCM) na zařízení v obalu. Bez klíčů nebo před migrací je to no-op. */
async function poslatNativniPush(sql: any, userId: number, zdroj: PushPayload, typ?: string) {
  // Oznámení o platbě se do obalu posílá neutrálně (bez výzvy, bez odkazu do pokladny).
  const payload = neutralniProNativni(zdroj, typ);
  let zarizeni: any[] = [];
  try {
    zarizeni = await sql`SELECT token, app, platform, env FROM device_tokens WHERE user_id = ${userId}`;
  } catch {
    return; // tabulka ještě není (migrace neproběhla)
  }
  if (!zarizeni.length) return;
  let badge: number | undefined;
  try {
    const [n] = await sql`SELECT COUNT(*)::int AS n FROM notifications WHERE user_id = ${userId} AND is_read = FALSE`;
    badge = Number(n?.n ?? 0);
  } catch { /* bez odznaku */ }
  const r = await poslatNativne(
    zarizeni.map(z => ({ token: String(z.token), app: String(z.app), platform: String(z.platform), env: String(z.env) })),
    { title: payload.title, body: payload.body, link: payload.link, tag: payload.tag, badge },
  );
  // Token, který poskytovatel označil za trvale neplatný (odinstalováno), se smaže.
  if (r.neplatne.length) {
    try { await sql`DELETE FROM device_tokens WHERE token = ANY(${r.neplatne})`; } catch { /* nevadí */ }
  }
}

// Persist an in-app notification AND fire a push to all the user's devices
// (web push i nativní APNs/FCM; větve jsou nezávislé, jedna nesmí zablokovat druhou).
// Vrací false, když host kategorii vypnul (oznámení se nevytvořilo ani neodeslalo), jinak true.
export async function notifyUser(userId: number, payload: PushPayload & { type?: string; category?: NotifCategory }): Promise<boolean> {
  const sql = neon(process.env.DATABASE_URL!);

  // Respect the user's category preferences — a muted category is fully skipped.
  const prefs = await nactiPrefs(sql, userId);
  if (jeZtlumeno(prefs ?? {}, payload.category)) return false;

  try {
    await sql`
      INSERT INTO notifications (user_id, title, body, type, link)
      VALUES (${userId}, ${payload.title}, ${payload.body ?? null}, ${payload.type ?? 'info'}, ${payload.link ?? null})`;
  } catch (e) {
    console.error('notification insert failed', e);
  }

  // Tiché hodiny (Nastavení → Notifikace): oznámení zůstalo v centru oznámení, ale telefon
  // ani prohlížeč se neozve. Hodiny se berou na pražské zdi, jako všude v aplikaci.
  if (prefs && jeVTichychHodinach(prefs, pragueHM())) return true;

  await Promise.all([
    poslatWebPush(sql, userId, payload).catch(e => console.error('web push selhal', e)),
    poslatNativniPush(sql, userId, payload, payload.type).catch(e => console.error('nativní push selhal', e)),
  ]);
  return true;
}

/** Kolik oznámení se posílá souběžně: stovky členů naráz by zahltily spojení k databázi i k push službám. */
export const PUSH_SOUBEZNE = 20;

/** Pošle oznámení všem; vrací, kolika se dostalo a kolik hostů si kategorii vypnulo. Chyba jednoho nezastaví ostatní. */
export async function notifyUsers(userIds: number[], payload: PushPayload & { type?: string; category?: NotifCategory }): Promise<{ doruceno: number; ztlumeno: number }> {
  let doruceno = 0;
  let ztlumeno = 0;
  for (let i = 0; i < userIds.length; i += PUSH_SOUBEZNE) {
    const davka = await Promise.all(userIds.slice(i, i + PUSH_SOUBEZNE).map(id => notifyUser(id, payload).catch(e => { console.error('notifyUser selhal', id, e); return null; })));
    for (const r of davka) { if (r === true) doruceno += 1; else if (r === false) ztlumeno += 1; }
  }
  return { doruceno, ztlumeno };
}
