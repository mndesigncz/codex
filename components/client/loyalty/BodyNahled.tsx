'use client';

// Náhled ve formuláři pravidel: „kolik by host dostal z účtu X". Počítá se z hodnot, které
// jsou ve formuláři právě teď (i neuložených), a stejnou funkcí jako u kasy
// (lib/bodyPravidla.ts → spoctiOdmenu), takže to, co vedení vidí, host opravdu dostane.

import { useState } from 'react';
import { Card, Field, Input } from '../../ui';
import { useMoney, useSymbol } from '../../CurrencyProvider';
import { cisloCs, spoctiOdmenu, pravidlaBoduZProfilu, vetyOOmezeni, vylouceneZProfilu, MAX_CASTKA_U_KASY } from '@/lib/bodyPravidla';

export function BodyNahled({ p }: { p: any }) {
  const money = useMoney();
  const symbol = useSymbol();
  const [castka, setCastka] = useState('250');
  const [predplaceno, setPredplaceno] = useState('0');
  const pravidla = pravidlaBoduZProfilu(p);
  const c = Number(castka.replace(',', '.'));
  const platna = Number.isFinite(c) && c >= 0 && c <= MAX_CASTKA_U_KASY;
  const o = spoctiOdmenu(platna ? c : 0, pravidla, { predplaceno: Number(predplaceno.replace(',', '.')) || 0 });
  const veta = vetyOOmezeni(o, pravidla, money);
  const vNebodech = p.cashback_mode === 'points';
  const nicNeni = pravidla.pointsPer100 <= 0 && pravidla.cashbackPct <= 0;
  const chyba = !platna ? `Zadej částku od 0 do ${cisloCs(MAX_CASTKA_U_KASY)}.` : undefined;
  return (
    <Card className="space-y-4" aria-labelledby="b-nahled">
      <div>
        <h2 id="b-nahled" className="t-card">Náhled: kolik host dostane z účtu</h2>
        <p className="t-meta mt-0.5 max-w-[70ch]">Počítá se z hodnot ve formuláři, i když je ještě neuložíš. Ukládá se až tlačítkem Uložit nahoře.</p>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <Field id="n-castka" label={`Částka účtu (${symbol})`} error={chyba}>
          <Input id="n-castka" inputMode="decimal" className="!w-32" value={castka} onChange={e => setCastka(e.target.value)} />
        </Field>
        <Field id="n-pred" label="Z toho kreditem nebo poukazem">
          <Input id="n-pred" inputMode="decimal" className="!w-32" value={predplaceno} onChange={e => setPredplaceno(e.target.value)} />
        </Field>
      </div>
      {nicNeni ? (
        <p className="note note-wait">Body za útratu ani cashback teď nejsou zapnuté, host z účtu nedostane nic. Nastav „Bodů za 100“ nebo cashback výš.</p>
      ) : platna && (
        <div role="status" aria-live="polite" className="space-y-1.5">
          <p className="text-[15px]">
            Z účtu <b className="tabular-nums">{money(o.castka)}</b> host dostane{' '}
            <b className="tabular-nums">{cisloCs(o.points)} b.</b>
            {pravidla.cashbackPct > 0 && <> a cashback <b className="tabular-nums">{vNebodech ? `${cisloCs(o.cashback)} b.` : money(o.cashback)}</b>{vNebodech ? '' : ' kreditu'}</>}
          </p>
          {o.zaklad !== o.castka && <p className="t-meta">Body se počítají z {money(o.zaklad)}.</p>}
          {veta.length > 0 && <ul className="t-meta list-disc pl-5">{veta.map(v => <li key={v}>{v}</li>)}</ul>}
          {vylouceneZProfilu(p.points_exclude_items).length > 0 && <p className="t-meta">Vyloučené položky se odečtou až z konkrétní účtenky z pokladny, tady se neprojeví.</p>}
        </div>
      )}
    </Card>
  );
}
