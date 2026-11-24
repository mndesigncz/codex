// Photos straight from a phone camera are 3–12 MB — over Vercel's 4.5 MB
// request-body limit, so the upload dies before our code ever runs. Shrinking
// on the client fixes that AND makes uploads instant on shop wifi: a receipt
// or chat photo does not need 48 megapixels.

const MAX_EDGE = 1800;
const QUALITY = 0.82;
/** Anything already smaller than this passes through untouched. */
const SKIP_BELOW = 900 * 1024;

type Dekodovano = { zdroj: CanvasImageSource; w: number; h: number; zavri: () => void };

/**
 * Přečte obrázek: napřed createImageBitmap, když ho prohlížeč nemá nebo selže
 * (starší Safari, velká fotka), tak přes <img>. null = tenhle prohlížeč obrázek
 * neumí otevřít (HEIC v Chromu, poškozený soubor).
 */
async function dekoduj(file: Blob): Promise<Dekodovano | null> {
  try {
    const b = await createImageBitmap(file);
    if (b.width > 0 && b.height > 0) return { zdroj: b, w: b.width, h: b.height, zavri: () => b.close?.() };
    b.close?.();
  } catch { /* zkusí se <img> */ }
  const adresa = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = adresa;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) { URL.revokeObjectURL(adresa); return null; }
    return { zdroj: img, w: img.naturalWidth, h: img.naturalHeight, zavri: () => URL.revokeObjectURL(adresa) };
  } catch {
    URL.revokeObjectURL(adresa);
    return null;
  }
}

/** Zmenšený JPEG (nejdelší strana MAX_EDGE), nebo null, když obrázek nejde přečíst. */
export async function prevedNaJpeg(file: File): Promise<File | null> {
  const d = await dekoduj(file);
  if (!d) return null;
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(d.w, d.h));
    const w = Math.max(1, Math.round(d.w * scale));
    const h = Math.max(1, Math.round(d.h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(d.zdroj, 0, 0, w, h);
    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob) return null;
    const name = (file.name || 'foto').replace(/\.[a-z0-9]+$/i, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    return null;
  } finally {
    d.zavri();
  }
}

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.size <= SKIP_BELOW) return file;
  // GIFs would lose animation; let small ones through, refuse to mangle big ones.
  if (file.type === 'image/gif') return file;

  const jpeg = await prevedNaJpeg(file);
  // Decoding failed (odd format) — send the original and let the server judge.
  if (!jpeg || jpeg.size >= file.size) return file;
  return jpeg;
}
