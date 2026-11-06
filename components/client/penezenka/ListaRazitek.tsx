// Pokrok na inkoustové kartě: dílky razítek (přední karta), kolečka razítek (otevřená karta)
// a souvislá lišta bodů. Limetka = získané (jediné místo, kde karta nese akcent). Pro odečítač
// je celek jeden obrázek s větou (`popis`), jednotlivé dílky jsou dekorace.

import { Icon } from '../../Icons';

export interface RazitkaProps {
  pocet: number;
  cil: number;
  /** Věta pro odečítač („7 z 10 razítek“). */
  popis: string;
  /** Hotová odměna čeká na uplatnění: dárek svítí limetkou, i když se sbírá další karta. */
  ceka?: boolean;
}

const omez = (pocet: number, cil: number) => {
  const n = Math.max(1, Math.min(Math.round(cil) || 1, 20));
  return { n, plnych: Math.max(0, Math.min(Math.round(pocet) || 0, n)) };
};

/** Dílky v jedné řadě + dárek na konci (přední karta v balíčku). Nad 20 razítek souvislá lišta. */
export function ListaRazitek({ pocet, cil, popis, ceka = false }: RazitkaProps) {
  if (cil > 20) return <ListaPostupu podil={pocet / Math.max(1, cil)} popis={popis} darek ceka={ceka} />;
  const { n, plnych } = omez(pocet, cil);
  const hotovo = plnych >= n || ceka;
  return (
    <div className="hp-karta-pata" role="img" aria-label={popis}>
      <span className="hp-dilky" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }} aria-hidden>
        {Array.from({ length: n }, (_, i) => <i key={i} className={i < plnych ? 'hp-on' : ''} />)}
      </span>
      <span className={`hp-darek ${hotovo ? 'hp-on' : ''}`} aria-hidden><Icon name="gift" size={15} strokeWidth={1.6} /></span>
    </div>
  );
}

/** Kolečka razítek (otevřená karta): max 10 v řadě, poslední je odměna; `noveOd` docvakne. */
export function RazitkaKolecka({ pocet, cil, popis, noveOd = null, ceka = false }: RazitkaProps & { noveOd?: number | null }) {
  const { n, plnych } = omez(pocet, cil);
  const sloupcu = n <= 10 ? n : Math.ceil(n / 2);
  return (
    <div className="hp-karta-pata" role="img" aria-label={popis}>
      <span className="hp-kolecka" style={{ gridTemplateColumns: `repeat(${sloupcu}, minmax(0, 26px))`, justifyContent: 'space-between' }} aria-hidden>
        {Array.from({ length: n }, (_, i) => {
          const odmena = i === n - 1;
          // Čekající odměna rozsvítí dárkové kolečko, i když se razítka sbírají už na další.
          const plne = i < plnych || (odmena && ceka);
          const nove = noveOd != null && i < plnych && i >= noveOd;
          return (
            <i key={i} className={`${plne ? 'hp-on' : ''} ${odmena ? 'hp-odmena' : ''} ${nove ? 'hp-nove' : ''}`}>
              {odmena ? <Icon name="gift" size={13} strokeWidth={1.7} /> : null}
            </i>
          );
        })}
      </span>
    </div>
  );
}

/** Souvislá lišta (body k další odměně, velké razítkové karty). `podil` 0–1. */
export function ListaPostupu({ podil, popis, darek = false, ceka = false }: { podil: number; popis: string; darek?: boolean; ceka?: boolean }) {
  const p = Math.max(0, Math.min(1, Number.isFinite(podil) ? podil : 0));
  return (
    <div className="hp-karta-pata" role="img" aria-label={popis}>
      <span className="hp-postup" aria-hidden><i style={{ width: `${p * 100}%` }} /></span>
      {(darek || ceka) && <span className={`hp-darek ${p >= 1 || ceka ? 'hp-on' : ''}`} aria-hidden><Icon name="gift" size={15} strokeWidth={1.6} /></span>}
    </div>
  );
}
