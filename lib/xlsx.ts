// Minimální zapisovač XLSX (Office Open XML) — bez knihovny, jen fflate.
//
// Pro účetní stačí obyčejný sešit: víc listů, tučná hlavička, čísla jako
// čísla (Excel je sečte), data jako text ISO (RRRR-MM-DD — žádné převody
// časových pásem ani sériových čísel), šířky sloupců. Texty jdou jako
// inline řetězce (bez sdílené tabulky), styly jsou tři pevné.
//
// Čistý modul (testy: scripts/testy/ucetni-export.ts rozbalí výsledek fflate).

import { zipSync, strToU8 } from 'fflate';

export type BunkaXlsx = string | number | null | undefined;
export type TypSloupce = 'text' | 'castka' | 'cislo';

export interface SloupecXlsx { nazev: string; typ?: TypSloupce; sirka?: number }
export interface ListXlsx { nazev: string; sloupce: SloupecXlsx[]; radky: BunkaXlsx[][] }

/** Zakázané znaky v názvu listu a nejvýš 31 znaků; prázdný název = „List N". */
export function nazevListu(nazev: string, poradi: number, pouzite: Set<string>): string {
  let n = nazev.replace(/[\\/?*[\]:]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || `List ${poradi}`;
  let k = 2;
  while (pouzite.has(n.toLowerCase())) { const pripona = ` ${k++}`; n = n.slice(0, 31 - pripona.length) + pripona; }
  pouzite.add(n.toLowerCase());
  return n;
}

const escXml = (s: string) => s
  // Řídicí znaky XML 1.0 nepovoluje — Excel by sešit odmítl otevřít.
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Písmeno sloupce: 0 → A, 25 → Z, 26 → AA. */
export function pismenoSloupce(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Styly: 0 = běžný, 1 = tučná hlavička, 2 = částka s haléři a mezerou tisíců.
const STYLY = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

function bunka(ref: string, v: BunkaXlsx, typ: TypSloupce, hlavicka: boolean): string {
  if (v == null || v === '') return '';
  if (!hlavicka && typeof v === 'number' && Number.isFinite(v)) {
    return `<c r="${ref}"${typ === 'castka' ? ' s="2"' : ''}><v>${v}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${hlavicka ? ' s="1"' : ''}><is><t xml:space="preserve">${escXml(String(v))}</t></is></c>`;
}

function sirkaSloupce(s: SloupecXlsx, radky: BunkaXlsx[][], i: number): number {
  if (s.sirka) return s.sirka;
  let max = s.nazev.length;
  for (const r of radky.slice(0, 500)) {
    const v = r[i];
    // Částka má haléře a mezery tisíců (#,##0.00) — o pár znaků širší než holé číslo.
    const delka = v == null ? 0 : typeof v === 'number' && s.typ === 'castka' ? v.toFixed(2).length + 2 : String(v).length;
    if (delka > max) max = delka;
  }
  return Math.min(60, Math.max(8, Math.ceil(max + 2)));
}

function listXml(l: ListXlsx): string {
  const cols = l.sloupce.map((s, i) => `<col min="${i + 1}" max="${i + 1}" width="${sirkaSloupce(s, l.radky, i)}" customWidth="1"/>`).join('');
  const radky: string[] = [];
  radky.push(`<row r="1">${l.sloupce.map((s, i) => bunka(`${pismenoSloupce(i)}1`, s.nazev, 'text', true)).join('')}</row>`);
  l.radky.forEach((r, k) => {
    const n = k + 2;
    radky.push(`<row r="${n}">${l.sloupce.map((s, i) => bunka(`${pismenoSloupce(i)}${n}`, r[i], s.typ ?? 'text', false)).join('')}</row>`);
  });
  // Hlavička zamrzlá nahoře — při posouvání dlouhého listu je pořád vidět, co je který sloupec.
  const zamrznout = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${zamrznout}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${radky.join('')}</sheetData></worksheet>`;
}

/** Celý sešit jako bajty .xlsx. Aspoň jeden list (prázdný vstup dostane prázdný „List 1"). */
export function zapisXlsx(listyVstup: ListXlsx[]): Uint8Array {
  const listy = listyVstup.length ? listyVstup : [{ nazev: 'List 1', sloupce: [], radky: [] }];
  const pouzite = new Set<string>();
  const nazvy = listy.map((l, i) => nazevListu(l.nazev, i + 1, pouzite));
  const soubory: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${listy.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
    '_rels/.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nazvy.map((n, i) => `<sheet name="${escXml(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${listy.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${listy.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
    'xl/styles.xml': strToU8(STYLY),
  };
  listy.forEach((l, i) => { soubory[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(listXml(l)); });
  return zipSync(soubory, { level: 6 });
}
