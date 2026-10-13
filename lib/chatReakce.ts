// Reakce, odpovědi a „Viděli" v týmovém chatu (kolo 8) — čistá logika bez Reactu,
// ať ji sdílí vlákno (ChatView), API reakcí i testy (scripts/testy/k84-navigace.ts).
//
// Proč: na „Zítra zavírám dřív" přišlo deset zpráv „ok" a vedoucí stejně
// nevěděl, kdo to četl. Reakce 👍 ✅ ❤️ 😂 řeknou „beru na vědomí" bez zprávy,
// odpověď cituje, na co se reaguje, a „Viděli: Eva, Petr +3" se počítá
// z conversation_members.last_read_at — bez další tabulky.

/** Čtyři reakce, žádný výběr z tisíce emoji: v provozu stačí „beru / hotovo / díky / haha". */
export const EMOJI_REAKCI = ['👍', '✅', '❤️', '😂'] as const;
export type EmojiReakce = (typeof EMOJI_REAKCI)[number];

export const jeEmojiReakce = (v: unknown): v is EmojiReakce => (EMOJI_REAKCI as readonly string[]).includes(String(v));

export interface ReakceRadek { messageId: number; emoji: string; userId: number; name: string }
export interface Reakce { emoji: string; pocet: number; jmena: string[]; userIds: number[] }

/** Řádky reakcí (po jednom na člověka a emoji) → skupiny v pořadí EMOJI_REAKCI, jen ty, které někdo dal. */
export function seskupReakce(radky: readonly ReakceRadek[]): Reakce[] {
  const mapa = new Map<string, Reakce>();
  for (const r of radky) {
    const g = mapa.get(r.emoji) ?? { emoji: r.emoji, pocet: 0, jmena: [], userIds: [] };
    if (g.userIds.includes(r.userId)) continue;
    g.pocet += 1;
    g.jmena.push(r.name);
    g.userIds.push(r.userId);
    mapa.set(r.emoji, g);
  }
  const poradi = (e: string) => { const i = (EMOJI_REAKCI as readonly string[]).indexOf(e); return i < 0 ? 99 : i; };
  return [...mapa.values()].sort((a, b) => poradi(a.emoji) - poradi(b.emoji));
}

/** Reakce po zprávách: id zprávy → skupiny. */
export function reakcePoZpravach(radky: readonly ReakceRadek[]): Map<number, Reakce[]> {
  const poZprave = new Map<number, ReakceRadek[]>();
  for (const r of radky) { const l = poZprave.get(r.messageId) ?? []; l.push(r); poZprave.set(r.messageId, l); }
  return new Map([...poZprave.entries()].map(([id, l]) => [id, seskupReakce(l)]));
}

/** Přepnutí vlastní reakce v seznamu (optimisticky, než odpoví server). */
export function prepniReakci(reakce: readonly Reakce[], emoji: string, ja: { id: number; name: string }): Reakce[] {
  const radky: ReakceRadek[] = reakce.flatMap(g => g.userIds.map((uid, i) => ({ messageId: 0, emoji: g.emoji, userId: uid, name: g.jmena[i] ?? '' })));
  const mam = radky.some(r => r.emoji === emoji && r.userId === ja.id);
  const nove = mam ? radky.filter(r => !(r.emoji === emoji && r.userId === ja.id)) : [...radky, { messageId: 0, emoji, userId: ja.id, name: ja.name }];
  return seskupReakce(nove);
}

export interface ClenVlakna { id: number; name: string; lastReadAt: string | null }

const cas = (v: string | null | undefined): number => {
  if (!v) return NaN;
  // Postgres posílá TIMESTAMP bez zóny („2026-08-29 22:22:01.77"); bez „Z" by to prohlížeč bral jako místní čas.
  const s = String(v);
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z';
  return new Date(iso).getTime();
};

/** Kdo zprávu viděl: členové (bez autora), jejichž last_read_at není dřív než zpráva. */
export function kdoVidel(clenove: readonly ClenVlakna[], zprava: { senderId: number; createdAt: string }): string[] {
  const t = cas(zprava.createdAt);
  if (!Number.isFinite(t)) return [];
  return clenove.filter(c => c.id !== zprava.senderId && Number.isFinite(cas(c.lastReadAt)) && cas(c.lastReadAt) >= t).map(c => c.name);
}

/** „Eva, Petr +3": nejvýš `max` jmen, zbytek číslem. */
export function shrnJmena(jmena: readonly string[], max = 2): { text: string; dalsich: number } {
  return { text: jmena.slice(0, max).join(', '), dalsich: Math.max(0, jmena.length - max) };
}

/** Id poslední vlastní zprávy — jen u ní se kreslí „Viděli", ne pod každou bublinou. */
export function posledniVlastniId(messages: readonly { id: number; senderId: number }[], meId: number): number | null {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].senderId === meId) return messages[i].id;
  return null;
}

/** Úryvek citované zprávy: jeden řádek, nejvýš `max` znaků; příloha bez textu → null (volající dá „Příloha"). */
export function uryvekZpravy(content: string | null | undefined, max = 90): string | null {
  const s = String(content ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
