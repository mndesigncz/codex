// Events (akce): concerts, lectures, workshops and the offsite trips where
// the whole tea house packs up and moves. Shared model for API and UI.

export type EventKind = 'concert' | 'lecture' | 'workshop' | 'outdoor' | 'private' | 'other';
export type EventStatus = 'planned' | 'confirmed' | 'done' | 'cancelled';

// `icon` je název kreslené ikony pro rozhraní, `emoji` zůstává pro text
// (e-mail, notifikace), kde se ikona nakreslit nedá.
export const EVENT_KINDS: { id: EventKind; label: string; icon: string; emoji: string }[] = [
  { id: 'concert', label: 'Koncert', icon: 'music', emoji: '🎵' },
  { id: 'lecture', label: 'Přednáška', icon: 'mic', emoji: '🎤' },
  { id: 'workshop', label: 'Workshop', icon: 'cup', emoji: '🫖' },
  { id: 'outdoor', label: 'Venkovní akce', icon: 'tent', emoji: '⛺' },
  { id: 'private', label: 'Soukromá akce', icon: 'lock', emoji: '🔒' },
  { id: 'other', label: 'Jiná akce', icon: 'calendarCheck', emoji: '📅' },
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

/** Menu akce = odkazy do nabídky podniku. Jméno a cena se dočítají z Menu
    při čtení, takže když se cena změní v Menu, akce ji ukáže taky. Starší
    volné řádky (bez itemId) se dál zobrazí, nové se zakládají jen odkazem. */
export interface EventMenuLine { itemId: number | null; name: string; price: number | null; }

export function normalizeEventMenu(raw: any): EventMenuLine[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((l: any) => {
      const itemId = Number(l?.itemId);
      const price = l?.price == null || l?.price === '' ? null : Math.max(0, Math.round(Number(l.price) || 0));
      return {
        itemId: Number.isFinite(itemId) && itemId > 0 ? itemId : null,
        name: String(l?.name ?? '').trim().slice(0, 120),
        price,
      };
    })
    .filter(l => l.itemId != null || l.name)
    .slice(0, 30);
}

/** Doplní odkazovaným řádkům menu akce aktuální jméno a cenu z nabídky.
    `byId` je mapa menu_items id → {name, price}; smazané položky vypadnou. */
export function resolveEventMenu(lines: EventMenuLine[], byId: Map<number, { name: string; price: number | null }>): EventMenuLine[] {
  return lines
    .map(l => {
      if (l.itemId == null) return l;
      const hit = byId.get(l.itemId);
      return hit ? { itemId: l.itemId, name: hit.name, price: hit.price } : null;
    })
    .filter((l): l is EventMenuLine => l != null);
}

/** Fotky akce — jen adresy z vlastního veřejného výdeje obrázků. */
export function normalizePhotos(raw: any): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((x: any) => String(x || '')).filter(x => /^\/api\/client\/img\/\d+$/.test(x)).slice(0, 8);
}
