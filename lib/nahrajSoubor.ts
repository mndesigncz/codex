// Nahrání souboru z prohlížeče (spuštění, balík S).
//
// Malý soubor jde jako dřív přes app/api/upload. Velký (od 4 MB — víc
// serverless funkce nepřijme) zkusí nahrát přímo do úložiště přes
// app/api/upload/primo; když přímé nahrávání není zapnuté (bez
// BLOB_READ_WRITE_TOKEN) nebo selže, pošle se klasicky a server řekne proč.
// Vrací Response se stejným tělem jako app/api/upload ({ url, type, name }),
// takže volající dál čtou odpověď, jak byli zvyklí.

import { PRIMO_OD_BYTES } from './nahravaniPravidla';
import { okJson } from './api';

async function nahrajPrimo(soubor: Blob, nazev: string): Promise<Response | null> {
  // Odmítnutí nebo výpadek = přímé nahrávání se nezkouší, jde se klasicky.
  const stav = await fetch('/api/upload/primo').then(okJson).catch(() => null) as { zapnuto?: boolean; predpona?: string; max?: number } | null;
  if (!stav?.zapnuto || !stav.predpona) return null;
  if (stav.max && soubor.size > stav.max) return null;
  const { upload } = await import('@vercel/blob/client');
  const cesta = `${stav.predpona}${nazev.replace(/[\u0000-\u001f\u007f/\\]+/g, '_').slice(0, 150) || 'soubor'}`;
  const blob = await upload(cesta, soubor, {
    access: 'private',
    handleUploadUrl: '/api/upload/primo',
    clientPayload: JSON.stringify({ name: nazev, type: soubor.type, size: soubor.size }),
    contentType: soubor.type || undefined,
    multipart: soubor.size > 20 * 1024 * 1024,
  });
  return fetch('/api/upload/primo', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ akce: 'zapsat', pathname: blob.pathname, name: nazev }),
  });
}

export async function nahrajSoubor(soubor: Blob, nazev?: string): Promise<Response> {
  const jmeno = nazev ?? (soubor as File).name ?? 'soubor';
  if (soubor.size >= PRIMO_OD_BYTES) {
    try {
      const r = await nahrajPrimo(soubor, jmeno);
      if (r) return r;
    } catch { /* přímé nahrání selhalo — zkusí se klasicky, server řekne proč */ }
  }
  const fd = new FormData();
  fd.append('file', soubor, jmeno);
  // Offline vyhodí stejně jako fetch — volající to už ošetřují.
  return fetch('/api/upload', { method: 'POST', body: fd });
}
