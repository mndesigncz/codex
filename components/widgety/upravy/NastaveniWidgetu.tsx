'use client';

// Nastavení widgetu (kolo 68, spec §3.7, DP §5.7).
//
// Okno s živým náhledem nahoře: každá změna velikosti nebo volby se v něm
// hned překreslí, ještě bez uložení — člověk vidí, co vybírá, a nemusí
// ukládat naslepo. „Zrušit" nic nemění; rozepsaný text hlídá DiscardGuard,
// který má Modal sám. Na telefonu je to list zdola.

import { useMemo, useState } from 'react';
import { Button, Field, Modal, Segmented, Well } from '../../ui';
import type { DefiniceWidgetu, PolozkaRozlozeni, Smi, Tarif, Velikost } from '@/lib/widgety/typy';
import { sNastavenimVychozimi, vycistiNastaveni } from '@/lib/widgety/rozlozeni';
import { Nahled } from '../Nahled';
import { viditelnaPole } from '../registr';
import { PoleNastaveni } from './PoleNastaveni';

export const VELIKOST_SLOVNE: Record<Velikost, string> = { S: 'Malý', M: 'Střední', L: 'Velký' };

export default function NastaveniWidgetu({ polozka, definice, schematicky, smi, tarif, onUlozit, onZavrit }: {
  polozka: PolozkaRozlozeni;
  definice: DefiniceWidgetu;
  /** Výchozí rozložení (Nastavení → Stránky): náhled bez dat. */
  schematicky: boolean;
  smi: Smi;
  tarif: Tarif;
  /** Uložit velikost a vyčištěné nastavení (hodnoty rovné výchozím se neukládají). */
  onUlozit: (velikost: Velikost, nastaveni: Record<string, unknown>) => void;
  onZavrit: () => void;
}) {
  const [velikost, setVelikost] = useState<Velikost>(polozka.velikost);
  const [hodnoty, setHodnoty] = useState<Record<string, unknown>>(() => sNastavenimVychozimi(definice.nastaveni, polozka.nastaveni));
  const pole = useMemo(() => viditelnaPole(definice, smi, tarif), [definice, smi, tarif]);
  // Náhled dostává rozepsané hodnoty vyčištěné stejně jako při uložení, takže ukazuje přesně to, co se uloží.
  const nahledHodnot = useMemo(() => vycistiNastaveni(definice.nastaveni, hodnoty), [definice, hodnoty]);

  const ulozit = () => onUlozit(velikost, vycistiNastaveni(definice.nastaveni, hodnoty));

  return (
    <Modal open onClose={onZavrit} size="md" title={definice.nazev} subtitle="Nastavení widgetu"
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button variant="primary" onClick={ulozit}>Uložit</Button>
      </>}>
      <div className="space-y-5">
        <Well pad="sm">
          <Nahled widget={definice.id} velikost={velikost} nastaveni={nahledHodnot} schematicky={schematicky} className="max-h-72" />
        </Well>
        {definice.velikosti.length > 1 && (
          <Field label="Velikost">
            <Segmented size="sm" ariaLabel="Velikost" value={velikost} onChange={setVelikost}
              options={definice.velikosti.map(v => ({ id: v, label: VELIKOST_SLOVNE[v] }))} />
          </Field>
        )}
        {pole.map(p => (
          <PoleNastaveni key={p.klic} pole={p} hodnoty={hodnoty} smi={smi}
            onZmena={zmena => setHodnoty(h => ({ ...h, ...zmena }))} />
        ))}
      </div>
    </Modal>
  );
}
