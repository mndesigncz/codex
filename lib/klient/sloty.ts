// Volné časy rezervace ze skutečné dostupnosti (koncept B 7, audit C §10): otevírací doba
// a předstih pro dnešek (lib/clientSlots) + kapacita stolů podniku (client_tables) a rezervace,
// které už v tom čase sedí. Stůl je obsazený DOBA_SEZENI_MIN minut od začátku rezervace.
// Bez stolů v aplikaci kapacitu neznáme: `kapacita: false` a všechny časy otevírací doby jsou
// nabídnuté (stránka pak neříká „volné“, jen „časy“). Žádný odhad.

import { sql } from '../client';
import { slotsFor, nejdriveDnes } from '../clientSlots';
import { dayPlus, pragueHM, pragueToday } from '../pragueTime';

export const DOBA_SEZENI_MIN = 120;
const naMin = (hm: string) => { const [h, m] = String(hm).slice(0, 5).split(':').map(Number); return h * 60 + (m || 0); };

export interface SlotyDne { den: string; osob: number; kapacita: boolean; sloty: { cas: string; volno: boolean }[]; dny: { den: string; otevreno: boolean }[] }

interface Profil { team_id: number | string; opening_hours: any; slot_minutes?: number | string | null; lead_days?: number | string | null }

/** Kapacita podniku a obsazenost dne (jedním dotazem na stoly a jedním na rezervace). */
async function obsazenost(teamId: number, den: string): Promise<{ stolu: number; mist: number; maxStul: number; rez: { start: number; osob: number }[] }> {
  let stoly: any[] = [];
  try { stoly = await sql`SELECT seats FROM client_tables WHERE team_id = ${teamId} AND active = TRUE` as any[]; } catch { stoly = []; }
  let rez: any[] = [];
  try {
    rez = await sql`
      SELECT time, party FROM client_reservations
      WHERE team_id = ${teamId} AND date = ${den} AND status IN ('requested', 'confirmed', 'seated')` as any[];
  } catch { rez = []; }
  const mista = stoly.map(s => Math.max(1, Number(s.seats) || 2));
  return { stolu: mista.length, mist: mista.reduce((a, b) => a + b, 0), maxStul: Math.max(0, ...mista), rez: rez.map(r => ({ start: naMin(String(r.time)), osob: Number(r.party) || 1 })) };
}

/** Je čas `cas` pro `osob` volný? (Bez stolů vždy ano.) */
export function jeVolno(o: { stolu: number; mist: number; rez: { start: number; osob: number }[] }, cas: string, osob: number): boolean {
  if (!o.stolu) return true;
  const t = naMin(cas);
  const prekryv = o.rez.filter(r => r.start < t + DOBA_SEZENI_MIN && t < r.start + DOBA_SEZENI_MIN);
  const obsazeneStoly = prekryv.length;
  const obsazenaMista = prekryv.reduce((a, r) => a + r.osob, 0);
  return obsazeneStoly < o.stolu && obsazenaMista + osob <= o.mist;
}

export async function slotyPodniku(p: Profil, den: string, osob: number): Promise<SlotyDne> {
  const teamId = Number(p.team_id);
  const dnes = pragueToday();
  const krok = Number(p.slot_minutes) || 30;
  const dopredu = Math.max(0, Math.min(60, Number(p.lead_days) || 30));
  const dny = Array.from({ length: Math.min(dopredu, 13) + 1 }, (_, i) => dayPlus(dnes, i))
    .map(d => ({ den: d, otevreno: slotsFor(p.opening_hours, d, krok, d === dnes ? nejdriveDnes(pragueHM()) : undefined).length > 0 }));
  const casy = slotsFor(p.opening_hours, den, krok, den === dnes ? nejdriveDnes(pragueHM()) : undefined);
  const o = await obsazenost(teamId, den);
  return { den, osob, kapacita: o.stolu > 0, sloty: casy.map(cas => ({ cas, volno: jeVolno(o, cas, osob) })), dny };
}

/** Kontrola při odeslání rezervace: null = v pořádku, jinak věta pro hosta. */
export async function overVolno(teamId: number, den: string, cas: string, osob: number): Promise<string | null> {
  const o = await obsazenost(teamId, den);
  if (o.stolu && o.maxStul && osob > o.mist) return 'Tolik lidí se k nám najednou nevejde. Zavolej nám, domluvíme se.';
  return jeVolno(o, cas, osob) ? null : 'Tenhle čas je už obsazený. Vyber jiný.';
}
