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
import { useJazyk, useT, type PrekladFn } from '@/lib/i18n/client';
import { LOCALE_PRO_JAZYK, type Jazyk } from '@/lib/i18n/config';
import { fmtDatum } from '@/lib/i18n/format';
import { nactiTeamsMine } from './role/useOpravneni';

/** „Sobota 26. září" / „Tuesday 27 October" — pražský den v jazyce uživatele, ne den prohlížeče ani serveru. */
function dnesVetou(jazyk: Jazyk): string {
  // Den „RRRR-MM-DD" fmtDatum formátuje bez posunu pásma, takže se nikdy nepřehoupne na vedlejší.
  const s = fmtDatum(pragueToday(), { jazyk, styl: 'denDlouze' });
  // Začátek věty velkým písmenem (jako třída cz-sentence) — podtitulek
  // PageHeader bere text, ne prvek, a hlavička je věta, ne tvar data.
  return s.charAt(0).toLocaleUpperCase(LOCALE_PRO_JAZYK[jazyk]) + s.slice(1);
}

/** Pozdrav podle pražské hodiny (lib/greeting) v jazyce uživatele. */
function pozdrav(t: PrekladFn): string {
  const g = greeting();
  if (g === 'Dobré ráno') return t('Dobré ráno');
  if (g === 'Dobrý večer') return t('Dobrý večer');
  return t('Dobrý den');
}

export function useHlavickaPrehledu(jmeno?: string | null): { title: string; subtitle: string } {
  const t = useT();
  const { jazyk } = useJazyk();
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
    title: krestni ? `${pozdrav(t)}, ${krestni}` : pozdrav(t),
    subtitle: podnik ? `${dnesVetou(jazyk)} · ${podnik}` : dnesVetou(jazyk),
  };
}
