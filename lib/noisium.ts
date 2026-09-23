// Server-side client for the user's Noisium (Plan app) account.
// The API token is a secret — it lives only in the DB (teams.noisium_token)
// and is used exclusively here, never returned to the browser.

const DEFAULT_BASE = 'https://noisium.app/api';

// Adresu API si vedení zadává samo a server na ni volá s tokenem. Bez
// kontroly šlo zadat http://169.254.169.254/… nebo localhost a nechat server
// sáhnout do vlastní sítě (SSRF) — a text odpovědi se vracel do prohlížeče.
// Jen https, žádná holá IP adresa, žádný localhost ani interní doména.
export function bezpecnaZakladna(baseUrl?: string | null): string {
  const b = ((baseUrl && baseUrl.trim()) || DEFAULT_BASE).replace(/\/+$/, '');
  let u: URL;
  try { u = new URL(b); } catch { throw new Error('Adresa Noisium API není platná.'); }
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const ip = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
  const interni = host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || !host.includes('.');
  if (u.protocol !== 'https:' || ip || interni || u.username || u.password) {
    throw new Error('Adresa Noisium API musí být veřejná https adresa.');
  }
  return b;
}
const normalizeBase = bezpecnaZakladna;

async function call(base: string | null, token: string, path: string, body: any) {
  const res = await fetch(`${normalizeBase(base)}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    // never cache credentialed calls
    cache: 'no-store',
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!res.ok) {
    // Text odpovědi cizího serveru do prohlížeče nejde — jen stav, a do logu víc.
    console.error('noisium', res.status, String(data?.message || data?.error || '').slice(0, 200));
    throw new Error(res.status === 401 || res.status === 403
      ? 'Noisium token neprošel. Zkontroluj ho v Noisium → Nastavení → API.'
      : `Noisium API odpovědělo chybou ${res.status}.`);
  }
  return data;
}

export async function createNoisiumProject(baseUrl: string | null, token: string, name: string, description?: string) {
  return call(baseUrl, token, '/projects', { name, description, status: 'active' });
}

// Map our planning columns → Noisium task statuses.
const STATUS_MAP: Record<string, string> = {
  ideas: 'todo',
  in_progress: 'in_progress',
  review: 'review',
  done: 'done',
};

export async function createNoisiumTask(
  baseUrl: string | null,
  token: string,
  projectId: string,
  input: { title: string; description?: string; column?: string },
) {
  return call(baseUrl, token, '/tasks', {
    title: input.title,
    description: input.description || undefined,
    status: STATUS_MAP[input.column ?? 'ideas'] ?? 'todo',
    projectId,
  });
}
