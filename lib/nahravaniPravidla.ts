// Co se smí nahrát a kam (spuštění, balík S). Společné pro klasické nahrávání
// přes server (app/api/upload, do 4,5 MB — víc serverless funkce nepřijme)
// i pro přímé nahrávání do Vercel Blob (app/api/upload/primo). Čisté.

/** Klasické nahrávání přes server (a záloha do Postgresu do 4 MB). */
export const MAX_BYTES = 10 * 1024 * 1024;
/** Přímo do úložiště: video do chatu, delší hlasovka, sken PDF. */
export const MAX_PRIMO_BYTES = 50 * 1024 * 1024;
/** Od jaké velikosti klient zkusí nahrát přímo (pod limitem serverless funkce 4,5 MB s rezervou). */
export const PRIMO_OD_BYTES = 4 * 1024 * 1024;

// Co se do chatu, účtenek a návodů nahrává: fotky, PDF, kancelářské
// dokumenty a text. Spustitelné soubory, archivy, HTML a SVG ne. Servírování
// je i tak zamčené (typ se nebere od nahrávajícího, sandbox CSP), ale co sem
// nepatří, nemá se ani uložit — ani do úložiště, ani do zálohy.
export const POVOLENE = new Set([
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/heic', 'image/heif',
  'application/pdf', 'text/plain', 'text/csv',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
  // Z telefonu do chatu: krátké video a hlasová zpráva.
  'video/mp4', 'video/quicktime', 'video/webm', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav',
]);
// Některé prohlížeče u dokumentů typ nepošlou vůbec. Pak rozhodne přípona.
const PODLE_PRIPONY: Record<string, string> = {
  pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  heic: 'image/heic', heif: 'image/heif', mov: 'video/quicktime', m4a: 'audio/mp4', mp3: 'audio/mpeg',
};
const ZAKAZANE_PRIPONY = /\.(exe|msi|bat|cmd|com|scr|ps1|sh|js|mjs|jar|apk|dmg|html?|svg|xml|php|zip|rar|7z)$/i;

export const HLASKA_TYP = 'Tenhle typ souboru nejde nahrát. Vezmu fotky, PDF, text a dokumenty Word nebo Excel.';

/** Typ souboru, jak ho uložíme; null = tohle se nahrát nesmí. */
export function povolenyTyp(nazev: string | null | undefined, typ: string | null | undefined): string | null {
  const jmeno = String(nazev ?? '');
  const pripona = jmeno.toLowerCase().split('.').pop() ?? '';
  let mime = String(typ ?? '').toLowerCase().split(';')[0].trim().slice(0, 100);
  if (!mime || mime === 'application/octet-stream') mime = PODLE_PRIPONY[pripona] ?? 'application/octet-stream';
  if (!POVOLENE.has(mime) || ZAKAZANE_PRIPONY.test(jmeno)) return null;
  return mime;
}

/** Název do chatu i do cesty v úložišti: bez lomítek, bez „..", bez řídicích znaků. */
export function cistyNazev(nazev: string | null | undefined): string {
  return (String(nazev || 'soubor')).replace(/[\u0000-\u001f\u007f/\\]+/g, '_').replace(/\.\.+/g, '.').slice(0, 200) || 'soubor';
}

/**
 * Přímé nahrávání: každý smí psát jen pod svou předponu (podnik a člověk).
 * Token pro jinou cestu server nevydá a zapsat do evidence jde jen soubor
 * pod vlastní předponou — cizí soubor si tak nikdo „nepřivlastní".
 */
export function predponaNahravani(teamId: number, userId: number): string {
  return `podniky/${Math.trunc(teamId)}/${Math.trunc(userId)}/`;
}

export function patriPodPredponu(pathname: unknown, teamId: number, userId: number): boolean {
  const p = String(pathname ?? '');
  const pre = predponaNahravani(teamId, userId);
  return p.startsWith(pre) && p.length > pre.length && p.length <= 400 && !p.includes('..') && !/[\u0000-\u001f\\]/.test(p) && !p.slice(pre.length).includes('/');
}
