'use client';

// Razítka s datem návštěvy (koncept B, 10a/6 Stamp Me): mřížka 5 × N koleček v bílé kartě.
// Plné kolečko je inkoustové s datem („2.9.“), prázdné čárkované, poslední je odměna v limetkové
// jamce (plná = limetka). `dnes` zvýrazní právě připsané razítko limetkovým prstencem (okamžitá
// odezva u kasy) a nechá ho docvaknout. Leží uvnitř .h-karta; barva podniku sem nepatří.

import { Icon } from '../../Icons';

export interface RazitkaMrizkaProps {
  pocet: number;
  cil: number;
  /** Data razítek od nejstaršího (ISO den nebo čas); chybějící = kolečko bez data. */
  data?: (string | null)[];
  /** Index razítka připsaného právě teď (živá odezva) — docvakne a má limetkový prstenec. */
  noveOd?: number | null;
  /** Popisek pro odečítač („6 z 8 razítek“). */
  popis: string;
  /** Kolik koleček na řádek (výchozí 5, při cíli do 6 všechna v jedné řadě). */
  sloupcu?: number;
}

/** „2026-09-02“ → „2.9.“ (den a měsíc, pořadí platí pro všechny jazyky stránky). */
export function denMesic(v: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? ''));
  return m ? `${Number(m[3])}.${Number(m[2])}.` : '';
}

export default function RazitkaMrizka({ pocet, cil, data = [], noveOd = null, popis, sloupcu }: RazitkaMrizkaProps) {
  const n = Math.max(1, Math.min(cil, 20));
  const plnych = Math.max(0, Math.min(pocet, n));
  const cols = sloupcu ?? (n <= 6 ? n : n <= 10 ? 5 : 6);
  return (
    <div role="img" aria-label={popis} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: n }).map((_, i) => {
        const plne = i < plnych;
        const odmena = i === n - 1;
        const nove = noveOd != null && plne && i >= noveOd;
        const den = plne ? denMesic(data[i] ?? null) : '';
        return (
          <span key={i} className={`h-raz ${plne ? 'h-raz-plne' : 'h-raz-prazdne'} ${odmena ? 'h-raz-odmena' : ''} ${nove ? 'h-raz-dnes h-pop' : ''}`}>
            {odmena && !plne ? <Icon name="gift" size={15} /> : plne ? (den || <Icon name="check" size={13} strokeWidth={2.2} />) : null}
          </span>
        );
      })}
    </div>
  );
}
