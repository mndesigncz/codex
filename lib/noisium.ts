// Server-side client for the user's Noisium (Plan app) account.
// The API token is a secret — it lives only in the DB (teams.noisium_token)
// and is used exclusively here, never returned to the browser.

const DEFAULT_BASE = 'https://noisium.app/api';

function normalizeBase(baseUrl?: string | null): string {
  const b = (baseUrl && baseUrl.trim()) || DEFAULT_BASE;
  return b.replace(/\/+$/, '');
}

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
    const msg = data?.message || data?.error || `Noisium API vrátilo ${res.status}`;
    throw new Error(msg);
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
