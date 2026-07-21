import webpush from 'web-push';
import { neon } from '@neondatabase/serverless';

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:info@cajovna.cz',
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

// User-toggleable notification categories (Settings → Notifikace). Anything not
// in one of these categories is 'general' and always delivered.
export type NotifCategory = 'message' | 'stock' | 'shift' | 'general';

const CATEGORY_PREF: Record<Exclude<NotifCategory, 'general'>, string> = {
  message: 'messages',
  stock: 'lowStock',
  shift: 'shifts',
};

// Has this user opted OUT of a given category? Missing prefs ⇒ everything on.
async function categoryMuted(sql: any, userId: number, category?: NotifCategory): Promise<boolean> {
  if (!category || category === 'general') return false;
  try {
    const [row] = await sql`SELECT notif_prefs FROM users WHERE id = ${userId}`;
    const prefs = row?.notif_prefs ?? {};
    return prefs[CATEGORY_PREF[category]] === false;
  } catch {
    return false; // column not migrated yet — deliver as before
  }
}

// Persist an in-app notification AND fire a web push to all the user's devices.
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

export async function notifyUsers(userIds: number[], payload: PushPayload & { type?: string; category?: NotifCategory }) {
  await Promise.all(userIds.map((id) => notifyUser(id, payload)));
}
