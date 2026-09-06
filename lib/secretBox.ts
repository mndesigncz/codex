// Šifrování citlivých údajů uložených v databázi.
//
// Přístupové údaje k pokladně ležely v tabulce čitelně. Neon sice šifruje
// disk, ale to nepomůže proti komukoli, kdo se dostane k výpisu dat —
// k záloze, k jednomu SELECTu přes chybu v aplikaci, k dumpu od poskytovatele.
// Cizí klíč k pokladně je přitom přístup k tržbám celého podniku.
//
// Klíč se bere z APP_SECRET_KEY, a když chybí, z NEXTAUTH_SECRET (ten aplikace
// musí mít vždycky). Používá se AES-256-GCM, takže se pozná i to, když někdo
// se zašifrovanou hodnotou v databázi zamíchá.

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';

const PREFIX = 'enc:v1:';

function key(): Buffer | null {
  const raw = process.env.APP_SECRET_KEY || process.env.NEXTAUTH_SECRET;
  if (!raw) return null;
  // Z libovolně dlouhého tajemství udělá 32 bajtů, které AES potřebuje.
  return createHash('sha256').update(raw).digest();
}

/** Zašifruje hodnotu. Bez klíče vrátí text beze změny — funkčnost přednost. */
export function seal(plain: string | null | undefined): string | null {
  if (plain == null || plain === '') return plain ?? null;
  if (plain.startsWith(PREFIX)) return plain;      // už zašifrováno
  const k = key();
  if (!k) return plain;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', k, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64');
}

/** Rozšifruje hodnotu. Co není zašifrované, vrátí beze změny — kvůli starým řádkům. */
export function open(stored: string | null | undefined): string | null {
  if (stored == null || stored === '') return stored ?? null;
  if (!stored.startsWith(PREFIX)) return stored;   // starý čitelný záznam
  const k = key();
  if (!k) return null;
  try {
    const buf = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const iv = buf.subarray(0, 12), tag = buf.subarray(12, 28), enc = buf.subarray(28);
    const d = createDecipheriv('aes-256-gcm', k, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch {
    // Špatný klíč nebo poškozený záznam. Radši nic než nesmysl.
    return null;
  }
}
