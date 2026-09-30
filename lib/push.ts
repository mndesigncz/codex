import webpush from 'web-push';
import { neon } from '@neondatabase/serverless';
import { jeZtlumeno, neutralniProNativni, type NotifCategory } from './pushPravidla';
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

// Has this user opted OUT of a given category (or, u opt-in kategorií, NOT opted in)?
async function categoryMuted(sql: any, userId: number, category?: NotifCategory): Promise<boolean> {
  if (!category || category === 'general') return false;
  try {
    const [row] = await sql`SELECT notif_prefs FROM users WHERE id = ${userId}`;
    return jeZtlumeno(row?.notif_prefs ?? {}, category);
  } catch {
    // Před migrací sloupec není: běžné kategorie se doručí jako dřív, opt-in (novinky) ne.
    return jeZtlumeno({}, category);
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
export async function notifyUser(userId: number, payload: PushPayload & { type?: string; category?: NotifCategory }) {
  const sql = neon(process.env.DATABASE_URL!);

  // Respect the user's category preferences — a muted category is fully skipped.
  if (await categoryMuted(sql, userId, payload.category)) return;

  try {
    await sql`
      INSERT INTO notifications (user_id, title, body, type, link)
      VALUES (${userId}, ${payload.title}, ${payload.body ?? null}, ${payload.type ?? 'info'}, ${payload.link ?? null})`;
  } catch (e) {
    console.error('notification insert failed', e);
  }

  await Promise.all([
    poslatWebPush(sql, userId, payload).catch(e => console.error('web push selhal', e)),
    poslatNativniPush(sql, userId, payload, payload.type).catch(e => console.error('nativní push selhal', e)),
  ]);
}

export async function notifyUsers(userIds: number[], payload: PushPayload & { type?: string; category?: NotifCategory }) {
  await Promise.all(userIds.map((id) => notifyUser(id, payload)));
}
