// Events (akce): concerts, lectures, workshops and the offsite trips where
// the whole tea house packs up and moves. Shared model for API and UI.

export type EventKind = 'concert' | 'lecture' | 'workshop' | 'outdoor' | 'private' | 'other';
export type EventStatus = 'planned' | 'confirmed' | 'done' | 'cancelled';

export const EVENT_KINDS: { id: EventKind; label: string; icon: string }[] = [
  { id: 'concert', label: 'Koncert', icon: '🎵' },
  { id: 'lecture', label: 'Přednáška', icon: '🎤' },
  { id: 'workshop', label: 'Workshop', icon: '🫖' },
  { id: 'outdoor', label: 'Venkovní akce', icon: '⛺' },
  { id: 'private', label: 'Soukromá akce', icon: '🔒' },
  { id: 'other', label: 'Jiná akce', icon: '📅' },
];

export const EVENT_STATUSES: { id: EventStatus; label: string }[] = [
  { id: 'planned', label: 'V plánu' },
  { id: 'confirmed', label: 'Potvrzeno' },
  { id: 'done', label: 'Proběhlo' },
  { id: 'cancelled', label: 'Zrušeno' },
];

export function kindSpec(kind?: string | null) {
  return EVENT_KINDS.find(k => k.id === kind) ?? EVENT_KINDS[EVENT_KINDS.length - 1];
}

export function statusLabel(status?: string | null): string {
  return EVENT_STATUSES.find(s => s.id === status)?.label ?? 'V plánu';
}

export interface EventChecklistItem { text: string; done: boolean; }
export interface EventPackingItem {
  itemId: number | null;
  name: string;
  qty: number;
  /** Stock already decremented for this line. */
  packed: boolean;
  /** How much came back (stock re-incremented). */
  returned: number | null;
}

export function normalizeChecklist(raw: any): EventChecklistItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c: any) => ({ text: String(c?.text ?? '').trim().slice(0, 200), done: c?.done === true }))
    .filter(c => c.text)
    .slice(0, 60);
}

export function normalizePacking(raw: any): EventPackingItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((p: any) => {
      const itemId = Number(p?.itemId);
      const qty = Math.max(0, Math.round(Number(p?.qty) || 0));
      const ret = p?.returned == null ? null : Math.max(0, Math.round(Number(p.returned) || 0));
      return {
        itemId: Number.isFinite(itemId) && itemId > 0 ? itemId : null,
        name: String(p?.name ?? '').trim().slice(0, 160),
        qty,
        packed: p?.packed === true,
        returned: ret,
      };
    })
    .filter(p => p.name)
    .slice(0, 120);
}

export function normalizeCrew(raw: any): number[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(new Set(raw.map((v: any) => Number(v)).filter(n => Number.isFinite(n) && n > 0))).slice(0, 50);
}
