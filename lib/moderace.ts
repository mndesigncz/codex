// Moderace uživatelského obsahu (Apple 1.2, Google Play UGC): nahlášení,
// blokace uživatele, skrytí blokovaných. Čisté, bez databáze a bez importů
// (testy: scripts/testy/k77-ucet.ts).
//
// Kde uživatelský obsah vzniká: chat (zprávy, přílohy) a nápady týmu. Je to
// uzavřená pracovní skupina jednoho podniku (členy přidává vedení), ne veřejná
// síť, takže stačí: podmínky se zákazem nevhodného obsahu, nahlášení, blokace,
// smazání zprávy a pohled vedení na nahlášené. Hostovský obsah (poznámka
// k rezervaci, hodnocení) vidí jen podnik, žádný host-host obsah není.

export type DruhObsahu = 'zprava' | 'napad';

export const DUVODY: { id: string; nazev: string }[] = [
  { id: 'urazlive', nazev: 'Urážlivé nebo nenávistné' },
  { id: 'obtezujici', nazev: 'Obtěžování' },
  { id: 'spam', nazev: 'Spam nebo reklama' },
  { id: 'nevhodne', nazev: 'Nevhodný obsah' },
  { id: 'jine', nazev: 'Jiný důvod' },
];

export const nazevDuvodu = (id: string): string => DUVODY.find(d => d.id === id)?.nazev ?? 'Jiný důvod';

export type VstupNahlaseni =
  | { ok: true; kind: DruhObsahu; refId: number; reason: string; detail: string | null }
  | { ok: false; error: string };

/** Zkontroluje tělo požadavku na nahlášení; co nesedí, vrátí česky. */
export function platneNahlaseni(b: unknown): VstupNahlaseni {
  const x = (b ?? {}) as Record<string, unknown>;
  const kind = x.kind === 'zprava' || x.kind === 'napad' ? x.kind : null;
  if (!kind) return { ok: false, error: 'Neznámý druh obsahu.' };
  const refId = Number(x.refId);
  if (!Number.isInteger(refId) || refId <= 0) return { ok: false, error: 'Neplatný obsah.' };
  const reason = String(x.reason ?? '');
  if (!DUVODY.some(d => d.id === reason)) return { ok: false, error: 'Vyberte důvod nahlášení.' };
  const detail = typeof x.detail === 'string' && x.detail.trim() ? x.detail.trim().slice(0, 500) : null;
  return { ok: true, kind, refId, reason, detail };
}

/** Zpráva nebo nápad tak, jak se uloží do nahlášení: zkrácený opis, ať vedení vidí, co se hlásí, i po smazání. */
export function opisObsahu(text: string | null | undefined, priloha?: string | null): string {
  const t = String(text ?? '').trim().replace(/\s+/g, ' ');
  if (t) return t.length > 300 ? `${t.slice(0, 297)}…` : t;
  return priloha ? '[příloha]' : '';
}

export type AkceNahlaseni = 'odstranit' | 'vyreseno' | 'zamitnout';
export type StavNahlaseni = 'open' | 'removed' | 'resolved' | 'dismissed';

export function stavPoAkci(akce: unknown): StavNahlaseni | null {
  if (akce === 'odstranit') return 'removed';
  if (akce === 'vyreseno') return 'resolved';
  if (akce === 'zamitnout') return 'dismissed';
  return null;
}

/** Zprávy zablokovaných autorů se nezobrazí; vlastní zprávy se nikdy neskrývají. */
export function vyfiltrujZablokovane<T extends { senderId: number }>(zpravy: readonly T[], zablokovani: ReadonlySet<number>, ja?: number): T[] {
  if (zablokovani.size === 0) return [...zpravy];
  return zpravy.filter(z => z.senderId === ja || !zablokovani.has(z.senderId));
}

/** Kdo smí smazat zprávu: autor, nebo ten, kdo smí odebírat členy (moderace). */
export function smiSmazatZpravu(v: { meId: number; autorId: number; moderator: boolean }): boolean {
  return v.meId === v.autorId || v.moderator;
}

/** Blokovat jde jiného člověka, ne sebe. */
export function smiZablokovat(meId: number, cilId: number): boolean {
  return Number.isInteger(cilId) && cilId > 0 && cilId !== meId;
}
