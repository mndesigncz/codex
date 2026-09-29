// Co ještě chybí, než půjde uzávěrka odeslat — pro zámek ve formuláři.
//
// Formulář se dřív dozvěděl o povinných postupech až z 400 po odeslání, a to
// jen o postupech. Tady se ptá předem, se STEJNÝM kontextem jako POST
// /api/closings (urciKontextUzaverky: kdo, obchodní den, směna, akce,
// osádka), takže zámek ve formuláři a brána na serveru nemůžou vidět jiný den.
//
// GET ?date=&employeeId=&shiftId=&eventId=
// Při chybě 503 — nikdy 200 s prázdným seznamem, to by formulář četl jako
// „nic nechybí" a zámek by zmizel kvůli výpadku.
import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { urciKontextUzaverky, chybejiciPredUzaverkou, smiObejitPovinne } from '@/lib/povinnePredUzaverkouDb';
import { duvodVolna, jeZamceno, pocty } from '@/lib/povinnePredUzaverkou';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const c = await pozaduj('uzaverky.vytvorit');
  if (jeOdpoved(c)) return c;

  const q = new URL(request.url).searchParams;
  try {
    const kontext = await urciKontextUzaverky(c, {
      date: q.get('date') ?? undefined,
      employeeId: q.get('employeeId') ?? undefined,
      shiftId: q.get('shiftId') ?? undefined,
      eventId: q.get('eventId') ?? undefined,
    });
    if (kontext instanceof NextResponse) return kontext;

    const volno = duvodVolna({ eventId: kontext.eventId, maSmenu: !!kontext.shift });
    const stav = await chybejiciPredUzaverkou({
      teamId: c.teamId, den: kontext.shiftDate, actorId: kontext.actorId, posadka: kontext.posadka,
      // Stejné druhy jako brána v POST, jinak by se zámek a odeslání rozešly.
      typy: kontext.typy,
    });
    const { celkem, hotovo } = pocty(stav);
    return NextResponse.json({
      den: kontext.shiftDate,
      // Za akci a bez směny se nic neblokuje (stejně jako POST) — seznam se
      // pošle i tak, aby formulář mohl ukázat, co by jinak chybělo.
      zamceno: volno == null && jeZamceno(stav),
      polozky: stav.polozky,
      vsechny: stav.vsechny,
      neznamo: stav.neznamo,
      // Stejná funkce jako brána v POST: tablet podle člověka, za kterého
      // zavírá (Provozní u baru), jinak podle volajícího.
      smiObejit: await smiObejitPovinne(c, kontext.actorId),
      duvodVolna: volno,
      celkem,
      hotovo,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Povinné věci se nepodařilo načíst.' }, { status: 503 });
  }
}
