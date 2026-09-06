// Pokrytí otevírací doby lidmi.
//
// Rozvrh může vypadat plný a přesto mít díru. Stalo se to takhle: podnik měl
// otevřeno 14:00–22:00 a dva typy směn — otvíračku 14:00–22:00 a odpolední
// 17:00–22:00. Generátor bral každý typ zvlášť, na otvíračku nikoho volného
// nenašel, odpolední obsadil — a od dvou do pěti bylo otevřeno a nikdo tam
// nebyl. Žádná kontrola to nezachytila, protože každá směna sama o sobě byla
// v pořádku.
//
// Tady je ta chybějící otázka: je v každé minutě otevírací doby aspoň jeden
// člověk? Počítá se to na jednom místě, aby generátor, přeplánování i kalendář
// odpovídaly stejně.

/** Čas "HH:MM" na minuty od půlnoci. Vrací null pro nečitelný vstup. */
export function toMinutes(hm: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm ?? '').trim());
  if (!m) return null;
  const h = parseInt(m[1], 10), mi = parseInt(m[2], 10);
  if (h > 24 || mi > 59) return null;
  return h * 60 + mi;
}

/** Minuty od půlnoci zpět na "HH:MM"; přes půlnoc se vrací do rozsahu dne. */
export function toHM(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

export interface Interval { start: number; end: number }

/**
 * Úsek jako minuty od půlnoci. Konec menší nebo rovný začátku znamená přes
 * půlnoc — 22:00–02:00 je 1320–1560, ne prázdno.
 */
export function span(start: string | null | undefined, end: string | null | undefined): Interval | null {
  const s = toMinutes(start), e0 = toMinutes(end);
  if (s == null || e0 == null) return null;
  const e = e0 <= s ? e0 + 1440 : e0;
  return { start: s, end: e };
}

export interface OpeningDay { open?: string | null; close?: string | null; closed?: boolean }

/** Otevírací doba dne jako úsek. Zavřeno nebo nečitelné → null. */
export function openSpan(oh: OpeningDay | null | undefined): Interval | null {
  if (!oh || oh.closed) return null;
  return span(oh.open, oh.close);
}

/**
 * Části otevírací doby, kde není nikdo.
 *
 * Směny se sloučí do souvislých úseků a odečtou od otevírací doby. Co zbude,
 * je díra. Kratší mezery než `toleranceMin` se ignorují — pár minut mezi
 * dvěma směnami je zaokrouhlení, ne prázdný podnik.
 */
export function uncovered(
  open: Interval | null,
  shifts: { start: string | null | undefined; end: string | null | undefined }[],
  toleranceMin = 5,
): Interval[] {
  if (!open) return [];
  const covers = shifts
    .map(s => span(s.start, s.end))
    .filter((x): x is Interval => x != null)
    // Směna, která začala včera večer, může krýt dnešní ráno — proto se
    // zkouší i posun o den zpět.
    .flatMap(x => [x, { start: x.start - 1440, end: x.end - 1440 }])
    .map(x => ({ start: Math.max(x.start, open.start), end: Math.min(x.end, open.end) }))
    .filter(x => x.end > x.start)
    .sort((a, b) => a.start - b.start);

  const gaps: Interval[] = [];
  let cursor = open.start;
  for (const c of covers) {
    if (c.start > cursor) gaps.push({ start: cursor, end: c.start });
    cursor = Math.max(cursor, c.end);
    if (cursor >= open.end) break;
  }
  if (cursor < open.end) gaps.push({ start: cursor, end: open.end });
  return gaps.filter(g => g.end - g.start > toleranceMin);
}

/** „14:00–17:00" pro člověka. */
export function gapText(g: Interval): string {
  return `${toHM(g.start)}–${toHM(g.end)}`;
}

/** Klíč dne v týdnu tak, jak ho drží teams.opening_hours: pondělí = 0. */
export function weekdayKey(date: string): string {
  return String((new Date(date + 'T12:00:00Z').getUTCDay() + 6) % 7);
}

export interface DayGap { date: string; from: string; to: string; minutes: number }

/**
 * Díry v pokrytí pro zadané dny.
 *
 * @param openingHours mapa z teams.opening_hours (klíč = den v týdnu od pondělí)
 * @param shiftsByDate směny seskupené podle data
 */
export function coverageGaps(
  openingHours: Record<string, OpeningDay> | null | undefined,
  shiftsByDate: Map<string, { start: string | null | undefined; end: string | null | undefined }[]>,
  dates: string[],
): DayGap[] {
  if (!openingHours) return [];
  const out: DayGap[] = [];
  for (const date of dates) {
    const oh = openingHours[weekdayKey(date)];
    const open = openSpan(oh);
    if (!open) continue;                       // zavřeno — pokrývat není co
    const shifts = shiftsByDate.get(date) ?? [];
    for (const g of uncovered(open, shifts)) {
      out.push({ date, from: toHM(g.start), to: toHM(g.end), minutes: g.end - g.start });
    }
  }
  return out;
}

// ---- Neobsazená místa ------------------------------------------------------
//
// Pokrytí odpoví na „je tu vůbec někdo". Tohle odpoví na druhou půlku:
// „je tu tolik lidí, kolik jsme chtěli". Jeden typ směny = jedno místo na den,
// takže když se na den vejdou dva typy a obsazený je jen jeden, chybí člověk —
// i když je otevírací doba celá pokrytá tím druhým.

export interface ShiftTypeLike {
  name: string;
  start_time?: string | null;
  end_time?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  starts_at_open?: boolean | null;
  ends_at_close?: boolean | null;
  startsAtOpen?: boolean | null;
  endsAtClose?: boolean | null;
}

/** Konkrétní časy typu směny pro daný den — typ vázaný na otvíračku je bere z ní. */
export function resolveTypeTimes(st: ShiftTypeLike, oh: OpeningDay): { start: string; end: string } {
  const s = st.start_time ?? st.startTime ?? '';
  const e = st.end_time ?? st.endTime ?? '';
  const atOpen = st.starts_at_open ?? st.startsAtOpen ?? false;
  const atClose = st.ends_at_close ?? st.endsAtClose ?? false;
  return {
    start: atOpen && oh.open ? String(oh.open) : String(s),
    end: atClose && oh.close ? String(oh.close) : String(e),
  };
}

/** Vejde se typ směny do otevírací doby toho dne? */
export function typeFitsDay(st: ShiftTypeLike, oh: OpeningDay): boolean {
  const open = openSpan(oh);
  if (!open) return false;
  const rt = resolveTypeTimes(st, oh);
  const sp = span(rt.start, rt.end);
  if (!sp) return false;
  // Noční směna se posuzuje jen podle začátku — konec padá do dalšího dne.
  if (sp.end > 1440) return sp.start >= open.start;
  return sp.start >= open.start && sp.end <= open.end;
}

export interface MissingSlot { date: string; shiftTypeName: string }

/**
 * Typy směn, které se na den vejdou, ale nikdo na nich není.
 *
 * Porovnává se podle názvu typu — to je jediné, co se u směny ukládá. Právě
 * název odlišuje dvě situace, které mají stejné časy: „otvíračka 14–22 nikoho
 * nemá, kryje ji jen odpolední 17–22" (díra) od „na odpolední mají být dva a
 * je tam jeden" (podstav). Obojí je nález, ale poznají se jen podle typu.
 *
 * Den, kde nikdo nepoužil nastavený typ směny, se neřeší — ručně napsané časy
 * jsou vědomé rozhodnutí, ne chybějící člověk. Prázdný den se neřeší taky;
 * prázdný měsíc není podstav, jen prázdný měsíc.
 */
export function missingSlots(
  openingHours: Record<string, OpeningDay> | null | undefined,
  shiftTypes: ShiftTypeLike[],
  shiftsByDate: Map<string, { type?: string | null }[]>,
  dates: string[],
): MissingSlot[] {
  if (!openingHours || shiftTypes.length === 0) return [];
  const out: MissingSlot[] = [];
  for (const date of dates) {
    const oh = openingHours[weekdayKey(date)];
    if (!oh || oh.closed) continue;
    const dayShifts = shiftsByDate.get(date) ?? [];
    if (dayShifts.length === 0) continue;
    const covered = new Set(dayShifts.map(s => String(s.type ?? '').trim().toLowerCase()));
    const known = new Set(shiftTypes.map(t => String(t.name).trim().toLowerCase()));
    if (!Array.from(covered).some(c => known.has(c))) continue;   // den psaný ručně
    for (const st of shiftTypes) {
      if (!typeFitsDay(st, oh)) continue;
      if (covered.has(String(st.name).trim().toLowerCase())) continue;
      out.push({ date, shiftTypeName: st.name });
    }
  }
  return out;
}
