// Pole formuláře hosta ve směru A: popisek .hp-pole-popis nad polem (nebo jen pro odečítač),
// samotné pole .hp-pole s ikonou vlevo a pod ním nápověda nebo chyba. Vstup (`<input>`) dodává
// volající, ať si drží id, typ, autocomplete a inputMode; nápovědu a chybu spojí přes `aria-describedby`
// sám (id `${id}-napoveda` / `${id}-chyba`).

import { Icon } from '../../../Icons';

export function popisPole(id: string, chyba?: string | null, napoveda?: React.ReactNode): string | undefined {
  if (chyba) return `${id}-chyba`;
  return napoveda ? `${id}-napoveda` : undefined;
}

export default function Pole({ id, popis, skrytyPopis, ikona, napoveda, chyba, vpravo, className = '', children }: {
  id: string;
  popis: React.ReactNode;
  /** Popisek jen pro odečítač (pole s ikonou na přihlášení podle předlohy). */
  skrytyPopis?: boolean;
  ikona?: string;
  napoveda?: React.ReactNode;
  chyba?: string | null;
  /** Prvek na pravém konci pole (tlačítko „Použít“). */
  vpravo?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className={skrytyPopis ? 'sr-only' : 'hp-pole-popis'}>{popis}</label>
      <div className={`hp-pole ${vpravo ? '' : '!pr-4'}`}>
        {ikona && <Icon name={ikona} size={18} strokeWidth={1.6} className="shrink-0 text-[color:var(--hp-muted)]" />}
        {children}
        {vpravo}
      </div>
      {chyba
        ? <p id={`${id}-chyba`} className="hp-meta mt-1.5 ml-0.5 !text-bad-ink text-pretty">{chyba}</p>
        : napoveda ? <p id={`${id}-napoveda`} className="hp-meta mt-1.5 ml-0.5 text-pretty">{napoveda}</p> : null}
    </div>
  );
}
