// Pozdrav podle pražské hodiny — stejný pro vedení i zaměstnance.
//
// getHours() dává hodinu serveru (UTC), takže by ráno server napsal
// „Dobré ráno" a prohlížeč „Dobrý den" a React překreslil celou stránku.
// Proto se hodina bere z pražského času, ne z Date.
import { pragueHM } from './pragueTime';

export function greeting(now: string = pragueHM()): string {
  const h = parseInt(now.slice(0, 2), 10);
  if (h < 10) return 'Dobré ráno';
  if (h < 18) return 'Dobrý den';
  return 'Dobrý večer';
}

/** Křestní jméno z celého jména — „Martin Nemeškal" → „Martine" se skloňovat nebude, stačí „Martin". */
export function firstName(full?: string | null): string {
  return String(full ?? '').trim().split(/\s+/)[0] || '';
}
