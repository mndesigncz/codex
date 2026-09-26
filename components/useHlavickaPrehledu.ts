'use client';

// Hlavička Přehledu vedení a Domů zaměstnance (kolo 68, spec §5.4):
// „Dobrý den, Martin" / „Sobota 26. září · Kavárna Vinohrady".
//
// Proč společný háček: obě plochy mají hlavičku stejnou a dřív se každá
// skládala jinak (vedení s avatarem lg a pozdravem nad h1, zaměstnanec
// s pozdravem spočítaným při každém vykreslení). Avatar v hlavičce není —
// patří do bočního pásu (DP §3.4).
//
// Název podniku se bere z /api/teams/mine přes sdílené `nactiTeamsMine()`:
// tentýž slib už čeká navigace a oprávnění, takže hlavička nepošle žádný
// požadavek navíc. Dokud nedorazí (nebo když selže), podtitulek je jen datum
// — raději kratší věta než „· undefined".

import { useEffect, useState } from 'react';
import { greeting, firstName } from '@/lib/greeting';
import { pragueToday } from '@/lib/pragueTime';
import { nactiTeamsMine } from './role/useOpravneni';

/** „Sobota 26. září" — pražský den, ne den prohlížeče ani serveru. */
function dnesVetou(): string {
  // Poledne UTC a formát v UTC: den z pragueToday() se tak při převodu
  // nikdy nepřehoupne na vedlejší (hodina zařízení nehraje roli).
  const s = new Date(`${pragueToday()}T12:00:00Z`)
    .toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  // Začátek věty velkým písmenem (jako třída cz-sentence) — podtitulek
  // PageHeader bere text, ne prvek, a hlavička je věta, ne tvar data.
  return s.charAt(0).toLocaleUpperCase('cs-CZ') + s.slice(1);
}

export function useHlavickaPrehledu(jmeno?: string | null): { title: string; subtitle: string } {
  const [podnik, setPodnik] = useState('');
  useEffect(() => {
    let zije = true;
    nactiTeamsMine()
      .then((d: any) => {
        const t = Array.isArray(d?.teams) ? d.teams.find((x: any) => Number(x?.teamId) === Number(d?.activeTeamId)) : null;
        if (zije) setPodnik(typeof t?.teamName === 'string' ? t.teamName.trim() : '');
      })
      .catch(() => { /* bez názvu podniku; oprávnění hlásí chybu samo */ });
    return () => { zije = false; };
  }, []);

  const krestni = firstName(jmeno);
  return {
    title: krestni ? `${greeting()}, ${krestni}` : greeting(),
    subtitle: podnik ? `${dnesVetou()} · ${podnik}` : dnesVetou(),
  };
}
