// Jedno místo, kde se pozná, že server odpověděl špatně.
//
// Po aplikaci byl rozsypaný tenhle řádek, sto šedesát pětkrát:
//
//   fetch('/api/tasks').then(r => r.json()).then(setTasks).catch(() => {});
//
// Vypadá nevinně, ale má dvě díry a obě vedou k tomu, že obrazovka lže.
//
// Ta první: `fetch` **nepadá** na chybové odpovědi. HTTP 500 je pro něj
// úspěch — `r.ok` je `false`, ale slib se splní. `r.json()` pak většinou
// projde taky, protože server vrátí `{"error":"..."}`, a do stavu se uloží
// objekt, který komponenta čte jako „pole je prázdné". Člověku se ukáže
// „Žádné úkoly 🎉" místo „nepodařilo se načíst". Prázdný `catch` tu vůbec
// neproběhne — chytá jen výpadek sítě, ne odmítnutí serveru.
//
// Ta druhá: i když `catch` proběhne, tiše zahodí, co server napsal. Když
// řekne „účet nemá oprávnění", zůstane po tom jen prázdno.
//
// `okJson` obojí zavírá: chybový stav vyhodí jako chybu a jako zprávu si
// vezme `error` z těla odpovědi, když tam je. `apiMessage` pak z čehokoli
// chyceného udělá českou větu, kterou jde ukázat člověku.

/** Chyba s HTTP stavem — obrazovka podle něj může rozlišit 403 od výpadku. */
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Co říct o stavu, když server sám nic nenapsal. */
export function statusMessage(status: number): string {
  if (status === 401 || status === 403) return 'Na tohle nemáš oprávnění.';
  if (status === 404) return 'Tohle už neexistuje.';
  if (status === 429) return 'Moc rychle po sobě. Zkus to za chvíli.';
  if (status >= 500) return 'Server právě nestíhá.';
  return `Server odpověděl ${status}.`;
}

/**
 * Tělo odpovědi jako JSON — ale jen když odpověď dopadla dobře.
 *
 * Používá se místo `r => r.json()`:
 *
 *   fetch('/api/tasks').then(okJson).then(setTasks).catch(e => setErr(apiMessage(e)))
 */
export async function okJson(r: Response): Promise<any> {
  if (r.ok) return r.json();
  let written = '';
  try {
    const body = await r.json();
    if (body && typeof body.error === 'string') written = body.error;
  } catch {
    // Chybová odpověď nemusí být JSON (třeba HTML stránka od proxy).
  }
  throw new ApiError(r.status, written || statusMessage(r.status));
}

/** Totéž pro odpovědi, které nejsou JSON — třeba SVG náhled. */
export async function okText(r: Response): Promise<string> {
  if (r.ok) return r.text();
  throw new ApiError(r.status, statusMessage(r.status));
}

/** Česká věta z čehokoli, co spadlo — ať už ze serveru, nebo ze sítě. */
export function apiMessage(e: unknown, fallback = 'Načtení se nepovedlo.'): string {
  if (e instanceof ApiError) return e.message;
  const m = (e as any)?.message;
  // `TypeError: Failed to fetch` je výpadek spojení, ne odpověď serveru;
  // anglická hláška z prohlížeče člověku nic neřekne.
  if (typeof m === 'string' && m && !/fetch|network|load failed/i.test(m)) return m;
  return fallback;
}

/** Vypadlo spojení (na rozdíl od odpovědi, kterou server poslal)? */
export function isOffline(e: unknown): boolean {
  return !(e instanceof ApiError);
}
