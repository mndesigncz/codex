// Day-level availability choices. Historically binary ('morning'/'afternoon'
// with a hard-coded noon boundary) — which breaks for a tea room whose
// "Otvíračka" starts after noon. Choices now reference the team's OWN shift
// types ('type:<id>'); the legacy binary values keep working through a
// rank-based mapping (earliest types count as "ranní", latest as "odpolední").

export interface PrefType {
  id: number;
  name: string;
  /** "HH:MM" start used only for ranking legacy binary values. */
  start: string;
}

/** 'type:12' → 12; anything else → null. */
export function parseTypePref(pref: string | null | undefined): number | null {
  const m = /^type:(\d+)$/.exec(String(pref ?? ''));
  return m ? parseInt(m[1]) : null;
}

/**
 * Legacy category of each shift type by RANK among the team's types, not by
 * the clock: with two types the earlier one is "ranní" and the later one
 * "odpolední" even when both start after noon. A single type matches both.
 */
export function legacyCatOf(types: PrefType[], typeId: number): 'morning' | 'afternoon' | 'both' {
  if (types.length <= 1) return 'both';
  const sorted = [...types].sort((a, b) => String(a.start).localeCompare(String(b.start)) || a.id - b.id);
  const idx = sorted.findIndex((t) => t.id === typeId);
  if (idx < 0) return 'both';
  return idx < sorted.length / 2 ? 'morning' : 'afternoon';
}

/**
 * Does a day choice allow a concrete slot? 'off' days never reach here
 * (handled by availability); '' / 'flexible' allow everything.
 */
export function prefAllowsSlot(
  pref: string | null | undefined,
  slot: { typeId: number | null; start: string },
  types: PrefType[],
): boolean {
  const p = String(pref ?? '');
  if (!p || p === 'flexible' || p === 'off' || p === 'available') return true;
  const wantId = parseTypePref(p);
  if (wantId != null) return slot.typeId === wantId;
  if (p !== 'morning' && p !== 'afternoon') return true; // unknown value: don't block
  // Legacy binary: rank-based when the slot maps to a known type, clock-based otherwise.
  if (slot.typeId != null && types.some((t) => t.id === slot.typeId)) {
    const cat = legacyCatOf(types, slot.typeId);
    return cat === 'both' || cat === p;
  }
  return (String(slot.start).slice(0, 5) < '12:00' ? 'morning' : 'afternoon') === p;
}

/** Human label of a day choice: „jen Otvíračka" / „jen ranní" / null for none. */
export function dayPrefLabel(pref: string | null | undefined, types: PrefType[]): string | null {
  const p = String(pref ?? '');
  const wantId = parseTypePref(p);
  if (wantId != null) {
    const t = types.find((x) => x.id === wantId);
    return `jen ${t?.name ?? 'vybraný typ směny'}`;
  }
  if (p === 'morning') return 'jen ranní';
  if (p === 'afternoon') return 'jen odpolední';
  return null;
}

/** True when the value is a restricting day choice (not off/flexible/empty). */
export function isRestrictingPref(pref: string | null | undefined): boolean {
  const p = String(pref ?? '');
  return p === 'morning' || p === 'afternoon' || parseTypePref(p) != null;
}
