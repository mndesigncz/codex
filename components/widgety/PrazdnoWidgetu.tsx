'use client';

// Prázdný stav UVNITŘ karty widgetu (skladba v4, audit V11, P5).
//
// EmptyState je na střed — patří na prázdnou stránku nebo do široké karty s ilustrací. V kartě
// widgetu, kde hlavička (ikona + titul) stojí na levé ose, posunul centrovaný stav obsah o 30–40 px
// od osy a v malé kartě (171 px na telefonu) zalomil titul i větu do úzkého sloupce. Tady stav sedí
// na levé ose karty: titul 15/600 → 4 → věta 13 → 16 → jediná akce přes celou šířku (L→R × 44).

import React from 'react';
import { Sloupec } from '../ui';

export function PrazdnoWidgetu({ titul, text, akce }: {
  titul?: React.ReactNode;
  text?: React.ReactNode;
  /** Nejvýš jedna akce (`<Button variant="secondary">`); vyplní šířku karty. */
  akce?: React.ReactNode;
}) {
  return (
    <Sloupec mezera={4}>
      <Sloupec mezera={1}>
        {titul && <p className="stav-titul text-balance">{titul}</p>}
        {text && <p className="t-meta text-pretty">{text}</p>}
      </Sloupec>
      {akce && <div className="rada rada-rovne rada-m">{akce}</div>}
    </Sloupec>
  );
}

export default PrazdnoWidgetu;
