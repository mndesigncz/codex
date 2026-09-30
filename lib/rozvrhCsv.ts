// CSV rozvrhu — export i import na jednom místě, aby spolu šly zpátky.
//
// Dřív měl export (ScheduleBuilder.exportCsv) jeden tvar a import (handleFile)
// druhý: export psal skutečné názvy typů („Ranní“) a směny vedení, import typ
// mimo morning/afternoon/flexible tiše přepsal na „flexible“ a vedení hledal
// jen mezi zaměstnanci. Vlastní soubor se tak nedal bez ztráty načíst zpět.
// Čistá logika je tady (bez Reactu), ať ji pokryje test round-tripu.

export interface CsvClen { id: number; name: string; email?: string | null }
export interface CsvSmena { date: string; employeeName: string; startTime: string; endTime: string; type?: string | null }
export interface CsvRadek { employeeId: number; employeeName: string; date: string; startTime: string; endTime: string; type: string }

export const CSV_HLAVICKA = 'datum;zaměstnanec;od;do;typ';

/** `8:00`, `08:00`, `08:00:00` → `08:00`; cokoli jiného (25:99, „ráno“) → null. */
export function platnyCas(v: unknown): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

/** `RRRR-MM-DD` a opravdu existující den (30. 2. neprojde). */
export function platneDatum(v: unknown): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? '').trim());
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** Pole do CSV: uvozovky jen tam, kde by bez nich soubor rozbil oddělovač nebo řádek. */
function pole(v: string): string {
  return /[";,\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Středník, ne čárka: český Excel čte čárku jako desetinnou a soubor oddělený
 * čárkami naveze celý měsíc do jednoho sloupce. Import si poradí s obojím.
 * Typ se píše tak, jak je uložený (název typu nebo morning/afternoon/flexible),
 * aby ho import vrátil beze změny.
 */
export function sestavCsv(shifts: CsvSmena[]): string {
  const lines = shifts
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
    .map((s) => [s.date, pole(s.employeeName), s.startTime, s.endTime, pole(s.type ?? '')].join(';'));
  return [CSV_HLAVICKA, ...lines].join('\n');
}

/** Rozdělí řádek podle `,` nebo `;` a respektuje uvozovky. */
export function rozdelRadek(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',' || ch === ';') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Soubor → řádky k uložení + chyby (nevalidní řádek se přeskočí a vypíše).
 * `lide` jsou všichni, komu jde dát směnu (zaměstnanci i vedení — export
 * zapisuje směny obou, takže import je musí umět najít oba).
 */
export function rozeberCsv(text: string, lide: CsvClen[]): { rows: CsvRadek[]; errors: string[] } {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length === 0) return { rows: [], errors: ['Soubor je prázdný.'] };
  const startIdx = /datum/i.test(lines[0]) ? 1 : 0;
  const rows: CsvRadek[] = [];
  const errors: string[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const [date, who, start, end, type] = rozdelRadek(lines[i]);
    const r = `Řádek ${i + 1}`;
    if (!date || !who || !start || !end) { errors.push(`${r}: neúplný (${lines[i]})`); continue; }
    if (!platneDatum(date)) { errors.push(`${r}: neplatné datum „${date}" (očekává RRRR-MM-DD)`); continue; }
    const od = platnyCas(start), doCasu = platnyCas(end);
    if (!od || !doCasu) { errors.push(`${r}: neplatný čas „${!od ? start : end}" (očekává HH:MM)`); continue; }
    const key = who.toLowerCase();
    const shoda = lide.filter((e) => (e.email ?? '').toLowerCase() === key || e.name.toLowerCase() === key);
    if (shoda.length === 0) { errors.push(`${r}: zaměstnanec „${who}" není v týmu`); continue; }
    // Dva lidé se stejným jménem: hádat by znamenalo dát směnu tomu druhému.
    const emp = shoda.length === 1 ? shoda[0] : shoda.find((e) => (e.email ?? '').toLowerCase() === key);
    if (!emp) { errors.push(`${r}: jméno „${who}" má v týmu víc lidí — napiš místo něj e-mail`); continue; }
    // Typ se zachová, jak je (název typu i morning/afternoon/flexible); prázdný = vlastní.
    const typ = (type ?? '').trim().slice(0, 60) || 'flexible';
    rows.push({ employeeId: emp.id, employeeName: emp.name, date, startTime: od, endTime: doCasu, type: typ });
  }
  return { rows, errors };
}
