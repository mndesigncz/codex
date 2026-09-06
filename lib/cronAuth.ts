// Kdo smí spustit úlohu, která běží bez přihlášeného člověka.
//
// Původní podmínka zněla `!secret || auth === Bearer ${secret}`. To znamená:
// když se zapomene nastavit CRON_SECRET, pustí se kdokoli. A tyhle úlohy
// nejsou nevinné — /api/backup vydá kompletní data týmu, digest rozešle
// e-maily, hlídač docházky uzavírá směny. Chybějící tajemství proto nesmí
// znamenat „vpusť všechny", ale „nepouštěj nikoho".
//
// Vercel posílá u svých cronů hlavičku `Authorization: Bearer $CRON_SECRET`.
// Parametr v URL zůstává kvůli ručnímu spuštění, ale porovnává se časově
// konstantně, aby se tajemství nedalo uhodnout po znacích.

import { timingSafeEqual } from 'crypto';

/** Porovná dva řetězce bez ohledu na to, kde se rozejdou. */
function sameSecret(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    // Délku nelze porovnat konstantně; aspoň ať se neodhalí porovnáním obsahu.
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

export type CronCheck = { ok: true } | { ok: false; status: number; error: string };

export function checkCron(request: Request): CronCheck {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // Raději hlasitě nefungující úloha než tiše otevřená data.
    console.error('CRON_SECRET není nastavený — úloha odmítnuta.');
    return { ok: false, status: 503, error: 'Úloha není nakonfigurovaná (chybí CRON_SECRET).' };
  }
  const auth = request.headers.get('authorization') ?? '';
  if (auth.startsWith('Bearer ') && sameSecret(auth.slice(7), secret)) return { ok: true };

  const key = new URL(request.url).searchParams.get('key');
  if (key && sameSecret(key, secret)) return { ok: true };

  return { ok: false, status: 401, error: 'Neautorizováno' };
}
