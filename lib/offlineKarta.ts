'use client';

// Offline kartička hosta: kód a QR se při každém načtení Moje uloží do telefonu (localStorage) a stránka
// bez připojení (public/offline.html) je ukáže, takže host dá razítko i ve sklepě bez signálu.
// Ukládá se jen to, co je na kartičce vidět (kód, jméno, QR jako SVG); po odhlášení se smaže.
// Obsah z úložiště se před zobrazením znovu ověří (tvar kódu, jen bezpečné prvky SVG): offline.html má
// tutéž kontrolu (hlídá ji test w6-host-kasa), ať se do stránky nikdy nedostane cizí značkování.

export const KLIC_KARTY = 'managero-karta-v1';
/** Kód kartičky: písmena, číslice a pomlčky, 8 až 16 znaků (zobrazuje se „ABCD-EFGH“). */
export const KARTA_KOD = /^[A-Z0-9-]{8,16}$/;
/** SVG z knihovny qrcode: jen <svg>, <path>, <rect> a <g> a jen výkresové atributy (žádné skripty, události ani odkazy). */
export const KARTA_SVG = /^<svg(?:\s+(?:xmlns|viewBox|shape-rendering|fill|stroke|d|x|y|width|height|transform|stroke-width|fill-rule|clip-rule|opacity|fill-opacity|stroke-opacity|version)="[^"<>]*")*\s*>(?:<(?:path|rect)(?:\s+(?:xmlns|viewBox|shape-rendering|fill|stroke|d|x|y|width|height|transform|stroke-width|fill-rule|clip-rule|opacity|fill-opacity|stroke-opacity|version)="[^"<>]*")*\s*\/>|<g(?:\s+(?:xmlns|viewBox|shape-rendering|fill|stroke|d|x|y|width|height|transform|stroke-width|fill-rule|clip-rule|opacity|fill-opacity|stroke-opacity|version)="[^"<>]*")*\s*>|<\/g>)+<\/svg>\s*$/;
export const KARTA_SVG_MAX = 120_000;

export interface UlozenaKarta { code: string; name: string; svg: string; at: string }

/** Kartička z odpovědi /api/client/card → text k uložení, nebo null, když to není platná kartička. */
export function zabalKartu(x: any, ted: Date = new Date()): string | null {
  const code = String(x?.code ?? '').toUpperCase();
  const svg = String(x?.svg ?? '').trim();
  if (!KARTA_KOD.test(code) || svg.length > KARTA_SVG_MAX || !KARTA_SVG.test(svg)) return null;
  return JSON.stringify({ code, name: String(x?.name ?? '').slice(0, 80), svg, at: ted.toISOString() } satisfies UlozenaKarta);
}

/** Uložený text → kartička, nebo null (prázdné, poškozené, podvržené). */
export function rozbalKartu(raw: unknown): UlozenaKarta | null {
  if (typeof raw !== 'string' || raw.length > KARTA_SVG_MAX + 2000) return null;
  let o: any;
  try { o = JSON.parse(raw); } catch { return null; }
  const code = String(o?.code ?? '');
  const svg = String(o?.svg ?? '');
  if (!KARTA_KOD.test(code) || svg.length > KARTA_SVG_MAX || !KARTA_SVG.test(svg)) return null;
  return { code, name: String(o?.name ?? '').slice(0, 80), svg, at: String(o?.at ?? '') };
}

/** Uloží kartičku do telefonu. Soukromé okno nebo plné úložiště nic nerozbije: bez uložení se prostě nic neděje. */
export function ulozKartu(x: unknown): boolean {
  try {
    const t = zabalKartu(x);
    if (!t) return false;
    window.localStorage.setItem(KLIC_KARTY, t);
    return true;
  } catch { return false; }
}

/** Smaže uloženou kartičku (odhlášení: další člověk na zařízení nesmí vidět cizí kartičku). */
export function smazUlozenouKartu(): void {
  try { window.localStorage.removeItem(KLIC_KARTY); } catch { /* bez úložiště není co mazat */ }
}
