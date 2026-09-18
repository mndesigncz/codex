// Papír, který si někdo vezme s sebou.
//
// V kavárně se tiskne. Rozvrh visí na zdi u baru, nákupní seznam jde
// s sebou do velkoobchodu a odškrtává se tužkou. Aplikace uměla vytisknout
// jedinou věc — uzávěrku — a skládala si k tomu HTML ručně na místě.
//
// Tisk má pár vlastností, které se na obrazovce neřeší a snadno se zapomenou:
//
//   Barva neplatí.      Tiskárna v kavárně je černobílá. Stav, který se pozná
//                       jen barvou, je na papíře neviditelný — musí u něj být
//                       slovo nebo značka.
//   Stránka se láme.    Tabulka přes dvě strany musí zopakovat hlavičku,
//                       a řádek se nesmí rozseknout vejpůl.
//   Papír nemá stav.    Na výtisku musí být vidět, k čemu a ke kdy patří,
//                       jinak za dva dny nikdo neví, jestli je aktuální.
//   Okno může zůstat    Blokovač vyskakovacích oken tiskové okno zavře.
//   zavřené.            Dřív se v takovém případě nestalo vůbec nic: člověk
//                       klikl na „Vytisknout" a koukal na obrazovku.

/** Text do HTML. Escapuje se i `&`, jinak se „R&D" rozpadne na entitu. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Společný vzhled výtisku. Černobílý, A4, s opakovanou hlavičkou tabulky
 * a bez lámání řádků uprostřed.
 */
const STYLE = `
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #000; background: #fff; margin: 0;
    font-size: 11pt; line-height: 1.4;
  }
  h1 { font-size: 16pt; margin: 0 0 2mm; letter-spacing: -0.01em; }
  .meta { color: #555; font-size: 9pt; margin: 0 0 6mm; }
  h2 { font-size: 12pt; margin: 6mm 0 2mm; padding-bottom: 1mm; border-bottom: 1px solid #000; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  th { text-align: left; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em;
       color: #555; border-bottom: 1px solid #999; padding: 2mm 2mm 1.5mm 0; }
  td { padding: 1.8mm 2mm 1.8mm 0; border-bottom: 1px solid #ddd; vertical-align: top; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  /* Odškrtávací čtvereček — nákupní seznam se v obchodě odškrtává tužkou. */
  .tick { display: inline-block; width: 4.5mm; height: 4.5mm; border: 1px solid #000; }
  .foot { margin-top: 8mm; padding-top: 2mm; border-top: 1px solid #ddd; color: #777; font-size: 8.5pt; }
  .note { font-size: 10pt; color: #333; margin: 3mm 0 0; }
  @media print { .noprint { display: none !important; } }
`;

export interface PrintDoc {
  /** Do záhlaví okna i na první řádek papíru. */
  title: string;
  /** Druhý řádek: čeho se výtisk týká a k jakému období. */
  subtitle?: string;
  /** Tělo jako HTML — skládá se z `esc()`ovaných kusů. */
  body: string;
  /** Jméno podniku do patičky, ať je poznat, odkud papír je. */
  business?: string | null;
}

/** Celý dokument jako řetězec. Oddělené od okna, ať jde otestovat. */
export function printHtml({ title, subtitle, body, business }: PrintDoc, now: Date = new Date()): string {
  const stamp = now.toLocaleString('cs-CZ', { timeZone: 'Europe/Prague' });
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8">
<title>${esc(title)}</title><style>${STYLE}</style></head>
<body>
<h1>${esc(title)}</h1>
${subtitle ? `<p class="meta">${esc(subtitle)}</p>` : ''}
${body}
<p class="foot">${business ? esc(business) + ' · ' : ''}vytištěno ${esc(stamp)} z aplikace Managero</p>
</body></html>`;
}

/**
 * Otevře tiskové okno. Vrací `false`, když ho prohlížeč nepustil — volající
 * to **musí** člověku říct, jinak klikne a nestane se nic.
 */
export function openPrint(doc: PrintDoc): boolean {
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) return false;
  w.document.write(printHtml(doc));
  w.document.close();
  // `onload` uvnitř dokumentu se při `document.write` nemusí spustit;
  // tisk si tedy zavoláme sami, až se okno usadí.
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* okno mezitím zavřeli */ } }, 250);
  return true;
}
