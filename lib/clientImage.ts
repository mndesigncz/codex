// Photos straight from a phone camera are 3–12 MB — over Vercel's 4.5 MB
// request-body limit, so the upload dies before our code ever runs. Shrinking
// on the client fixes that AND makes uploads instant on shop wifi: a receipt
// or chat photo does not need 48 megapixels.

const MAX_EDGE = 1800;
const QUALITY = 0.82;
/** Anything already smaller than this passes through untouched. */
const SKIP_BELOW = 900 * 1024;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  if (file.size <= SKIP_BELOW) return file;
  // GIFs would lose animation; let small ones through, refuse to mangle big ones.
  if (file.type === 'image/gif') return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[a-z0-9]+$/i, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } catch {
    // Decoding failed (odd format) — send the original and let the server judge.
    return file;
  }
}
