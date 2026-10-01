// Web push v prohlížeči tohohle zařízení: zapnutí, vypnutí a poznání vlastního odběru.
//
// Jen prohlížeč (service worker, PushManager, localStorage). Čistá logika pro testy je v lib/pushKlient.ts.
//
// Odběr zakládá <PushManager/> sám po přihlášení, takže „odebrat zařízení" v Nastavení by
// se bez výslovné značky při dalším otevření aplikace vrátilo. Značka `managero-push-off`
// říká „na tomhle zařízení upozornění nechci": PushManager pak odběr nezakládá a existující ruší.
// Zapnutí v Nastavení značku smaže. Značka je jen na zařízení, ne na účtu (jiné zařízení
// člověka má upozornění dál).

export const KLIC_PUSH_VYPNUTO = 'managero-push-off';

export function pushVypnutoNaZarizeni(): boolean {
  try { return localStorage.getItem(KLIC_PUSH_VYPNUTO) === '1'; } catch { return false; }
}

export function nastavPushVypnuto(vypnuto: boolean): void {
  try {
    if (vypnuto) localStorage.setItem(KLIC_PUSH_VYPNUTO, '1'); else localStorage.removeItem(KLIC_PUSH_VYPNUTO);
  } catch { /* soukromé okno: platí do zavření */ }
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function registrace(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  // Registraci zakládá <ServiceWorker/>; tady se na ni jen počká, ale ne donekonečna
  // (když neprojde, `ready` se nesplní nikdy).
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>(res => setTimeout(() => res(null), 10000)),
  ]);
}

/**
 * Založí (nebo obnoví) odběr tohoto prohlížeče a pošle ho na server. Vrací true, když odběr existuje.
 * Chybějící klíč, odepřené oprávnění nebo nepodporující prohlížeč nejsou chyba, jen `false`.
 */
export async function zapniPushProhlizece(vapid: string | undefined = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY): Promise<boolean> {
  if (!vapid) return false;
  try {
    const reg = await registrace();
    if (!reg) return false;
    if (Notification.permission === 'denied') return false;
    if (Notification.permission === 'default') {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return false;
    }
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) });
    }
    const r = await fetch('/api/push/subscribe', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub),
    });
    return r.ok;
  } catch {
    return false; // push jen nebude aktivní
  }
}

/** Zruší odběr tohoto prohlížeče v prohlížeči i na serveru. Nikdy nevyhazuje. */
export async function vypniPushProhlizece(): Promise<void> {
  try {
    const reg = await registrace();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await fetch('/api/push/subscribe', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => {});
    await sub.unsubscribe();
  } catch { /* nic k rušení */ }
}

/**
 * Otisk odběru tohoto prohlížeče: prvních 16 hex znaků SHA-256 z adresy odběru. Server vrací
 * stejný otisk u každého zařízení, takže se pozná „toto zařízení" bez toho, aby se adresa
 * (přístupový údaj) posílala v odpovědi. null = tenhle prohlížeč odběr nemá.
 */
export async function otiskTohotoZarizeni(): Promise<string | null> {
  try {
    const reg = await registrace();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return null;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub.endpoint));
    return Array.from(new Uint8Array(hash)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch { return null; }
}
