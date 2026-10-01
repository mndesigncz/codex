// Co sklad unese v databázi: desetinná množství a prahy (2,5 kg)?
//
// Množství a prahy hlídání zásob jsou v DDL INTEGER, dokud někdo sloupce
// nepřevede na NUMERIC (migrace v lib/cenaSloupce.ts). Formulář položky podle
// toho nabídne desetiny, nebo drží celá čísla — místo aby se uložení rozbilo
// chybou databáze.

import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { skladDesetinny } from '@/lib/cenaSloupce';

export const dynamic = 'force-dynamic';

export async function GET() {
  const c = await pozaduj('sklad.zobrazit');
  if (jeOdpoved(c)) return c;
  return NextResponse.json(await skladDesetinny());
}
