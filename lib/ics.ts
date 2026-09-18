// Soubor pro kalendář, který kalendář opravdu přijme.
//
// Dvě místa v aplikaci si `.ics` skládala sama a každé jinak. Obě vyráběla
// soubor, který Apple a Google spolknou, ale který podle RFC 5545 platný není:
//
//   Chybí `DTSTAMP`.     Povinná vlastnost každé události. Apple ji doplní,
//                        Outlook a Exchange soubor rovnou odmítnou — člověk
//                        klikne na „Do kalendáře" a nestane se nic.
//
//   Chybí `VTIMEZONE`.   `DTSTART;TZID=Europe/Prague` odkazuje na pásmo, které
//                        v souboru není popsané. Klient, co ho nezná, vezme
//                        čas jako místní nebo jako UTC — a směna od osmi se
//                        v kalendáři objeví v deset. Směna ve špatnou hodinu
//                        je zmeškaná směna.
//
//   Nezalamuje se.       Řádek delší než 75 oktetů se musí zalomit. Popis akce
//                        od zákazníka ho přeleze snadno a některé čtečky pak
//                        zahodí celou událost.
//
//   Neuniká se.          Jedno z těch dvou míst text neošetřovalo vůbec:
//                        čárka v názvu akce („Degustace, ročník 2019") rozdělí
//                        vlastnost na dvě a událost se rozsype.
//
// Tady je to jednou a pořádně.

/** Text do vlastnosti: zpětné lomítko, středník, čárka a nový řádek. */
export function escapeText(value: unknown): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Zalomení na 75 oktetů podle RFC 5545. Počítá se v bajtech UTF-8, ne ve
 * znacích — „ě" jsou dva bajty a limit je oktetový. Pokračovací řádek začíná
 * mezerou.
 */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;

  const out: string[] = [];
  let cur = '';
  let curBytes = 0;
  // První řádek má 75 oktetů, každý další 74 (jeden ujde úvodní mezeře).
  let limit = 75;
  for (const ch of line) {
    const size = enc.encode(ch).length;
    // Znak se nesmí rozseknout mezi dva řádky, proto se měří celý.
    if (curBytes + size > limit) {
      out.push(cur);
      cur = '';
      curBytes = 0;
      limit = 74;
    }
    cur += ch;
    curBytes += size;
  }
  if (cur) out.push(cur);
  return out[0] + out.slice(1).map(l => '\r\n ' + l).join('');
}

/** Pásmo, na které se v událostech odkazuje. Bez toho je TZID jen nápis. */
const VTIMEZONE_PRAGUE = [
  'BEGIN:VTIMEZONE',
  'TZID:Europe/Prague',
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** `2026-09-18` → `20260918`; prázdné nebo nesmysl → prázdný řetězec. */
function date8(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? '').trim());
  return m ? m[1] + m[2] + m[3] : '';
}

/** `08:00` i `08:00:00` → `080000`. */
function time6(time: string): string {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(time ?? '').trim());
  return m ? m[1] + m[2] + (m[3] ?? '00') : '';
}

/** `DTSTAMP` musí být v UTC a se `Z` na konci. */
export function stamp(at: Date = new Date()): string {
  return at.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export interface IcsEvent {
  /** Stabilní klíč události — kalendář podle něj pozná opakované stažení. */
  uid: string;
  /** `YYYY-MM-DD`. */
  date: string;
  /** `HH:MM`; bez něj je to celodenní událost. */
  startTime?: string | null;
  endTime?: string | null;
  summary: string;
  description?: string | null;
  location?: string | null;
}

/** Celý soubor. `now` je kvůli testům — jinak se bere aktuální čas. */
export function buildIcs(events: IcsEvent[], prodId = '-//Managero//CS', now: Date = new Date()): string {
  const dtstamp = stamp(now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...VTIMEZONE_PRAGUE,
  ];

  for (const e of events) {
    const d = date8(e.date);
    if (!d) continue; // Událost bez použitelného data by soubor jen rozbila.
    lines.push('BEGIN:VEVENT', `UID:${escapeText(e.uid)}`, `DTSTAMP:${dtstamp}`);

    const st = time6(e.startTime ?? '');
    if (st) {
      lines.push(`DTSTART;TZID=Europe/Prague:${d}T${st}`);
      const en = time6(e.endTime ?? '');
      // Konec před začátkem by kalendář nakreslil pozpátku; radši ho vynecháme
      // a necháme událost jen se začátkem.
      if (en && en > st) lines.push(`DTEND;TZID=Europe/Prague:${d}T${en}`);
    } else {
      // Celodenní: `DTEND` je den následující, protože konec je nevýlučný.
      const next = new Date(Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8) + 1));
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${stamp(next).slice(0, 8)}`);
    }

    lines.push(`SUMMARY:${escapeText(e.summary)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Stažení souboru v prohlížeči. */
export function downloadIcs(filename: string, ics: string) {
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  // Safari stahuje jen z odkazu, který je v dokumentu.
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Okamžité uvolnění stažení v některých prohlížečích utne.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
