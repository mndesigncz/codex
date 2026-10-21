'use client';

// Prázdný stav UVNITŘ karty widgetu (skladba v4, audit V11, P5).
//
// EmptyState je na střed — patří na prázdnou stránku nebo do široké karty s ilustrací. V kartě
// widgetu, kde hlavička (ikona + titul) stojí na levé ose, posunul centrovaný stav obsah o 30–40 px
// od osy a v malé kartě (171 px na telefonu) zalomil titul i větu do úzkého sloupce. Tady stav sedí
// na levé ose karty: titul 15/600 → 4 → věta 13 → 16 → jediná akce přes celou šířku (L→R × 44).

import React from 'react';
import { EmptyState } from '../ui';

/** Tenký obal kolem `EmptyState vlevo` (jedna podoba prázdna v kartě pro widgety i nástroje stránek). */
export function PrazdnoWidgetu({ titul, text, akce }: {
  titul?: React.ReactNode;
  text?: React.ReactNode;
  /** Nejvýš jedna akce (`<Button variant="secondary">`); vyplní šířku karty. */
  akce?: React.ReactNode;
}) {
  if (!titul) return <EmptyState vlevo title={<span className="t-meta font-normal">{text}</span>} action={akce} />;
  return <EmptyState vlevo title={titul} hint={text} action={akce} />;
}

export default PrazdnoWidgetu;
