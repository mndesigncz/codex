// QR kód kuponu: co se do něj píše a jak ho obsluha čte.
// Host má u kuponu QR s textem „managero:coupon:ABC-DEF“. Obsluha může kód
// naskenovat, nebo opsat; ve všech případech projde kód stejnou normalizací,
// takže se uplatňuje jednou cestou (app/api/client/admin/redeem).
// Karta hosta nese jen osm znaků — kdo omylem skenuje kartu místo kuponu,
// dostane to řečeno, ne „takový kupon tu není“.

export const KUPON_PREFIX = 'managero:coupon:';

/** Obsah QR kódu kuponu pro daný kód (ABC-DEF nebo ABCDEF). */
export function kuponPayload(kod: string): string {
  const c = String(kod ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  return KUPON_PREFIX + c.slice(0, 3) + '-' + c.slice(3);
}

export type RozpoznanyQr =
  | { typ: 'kupon'; kod: string }   // ABC-DEF
  | { typ: 'karta'; kod: string }   // ABCD1234, karta hosta
  | { typ: 'prazdny' }
  | { typ: 'cizi' };

const bezZnaku = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
const sestZnaku = (c: string) => c.slice(0, 3) + '-' + c.slice(3);
const JEN_KOD = /^[A-Za-z0-9 -]+$/;

/**
 * Rozpozná text z QR nebo z pole: payload kuponu, holý kód kuponu (šest znaků),
 * kód karty hosta (osm znaků), jinak „cizí“ (URL, wifi, jiný QR, poškozený payload).
 */
export function rozpoznejQr(text: unknown): RozpoznanyQr {
  const s = String(text ?? '').trim().slice(0, 200);
  if (!s) return { typ: 'prazdny' };
  if (s.toLowerCase().startsWith(KUPON_PREFIX)) {
    const rest = s.slice(KUPON_PREFIX.length);
    if (!JEN_KOD.test(rest)) return { typ: 'cizi' };
    const c = bezZnaku(rest);
    return c.length === 6 ? { typ: 'kupon', kod: sestZnaku(c) } : { typ: 'cizi' };
  }
  // Holý kód: jen písmena, číslice, mezera a pomlčka (opsaný ručně, s pomlčkou nebo bez).
  if (!JEN_KOD.test(s)) return { typ: 'cizi' };
  const c = bezZnaku(s);
  if (c.length === 6) return { typ: 'kupon', kod: sestZnaku(c) };
  if (c.length === 8) return { typ: 'karta', kod: c };
  return { typ: 'cizi' };
}

/** Normalizovaný kód kuponu (ABC-DEF) z QR payloadu nebo ručního zadání; jinak null. */
export function kodKuponu(text: unknown): string | null {
  const r = rozpoznejQr(text);
  return r.typ === 'kupon' ? r.kod : null;
}

/** Věta pro obsluhu, když text není použitelný kód kuponu. */
export function duvodNeKupon(text: unknown): string {
  const r = rozpoznejQr(text);
  if (r.typ === 'karta') return 'To je kartička hosta, ne kupon. Načti ji v Kartičce hosta.';
  if (r.typ === 'prazdny') return 'Zadej kód kuponu, nebo naskenuj jeho QR.';
  if (r.typ === 'cizi') {
    const jenZnaky = JEN_KOD.test(String(text ?? '').trim()) && !String(text ?? '').toLowerCase().startsWith(KUPON_PREFIX);
    return jenZnaky ? 'Kód kuponu má šest znaků.' : 'Tohle není QR kupon z Managera.';
  }
  return '';
}
