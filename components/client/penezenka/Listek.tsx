// Lístek s perforací (odměna, kupon, poukaz) ve směru A: bílý (tmavě grafitový) lístek, nahoře
// podnik s monogramem 28 a poznámkou vpravo, velký název odměny 24/620 a platnost; pod
// perforací (výseče po stranách + čárkovaná linka) kód prostrkaně a akce. Perforace sedí na švu
// dvou polovin, takže horní část může mít libovolnou výšku. Žádné karty v kartách.

import Monogram from './Monogram';

export interface ListekProps {
  /** Podnik v hlavičce lístku (monogram 28 + jméno). */
  podnik?: { nazev: string; klic?: string | null; logoUrl?: string | null } | null;
  /** Vpravo v hlavičce („za plnou kartu“, „k narozeninám“). */
  poznamka?: React.ReactNode;
  titulek: React.ReactNode;
  /** Pod titulkem (platnost, „Končí za 3 dny · do 9. 11.“). */
  podtitulek?: React.ReactNode;
  /** Další obsah horní poloviny (podmínky, zůstatek…). */
  children?: React.ReactNode;
  /** Popisek nad kódem („Kód“). */
  kodPopisek?: React.ReactNode;
  /** Kód prostrkaně („KV4 821“). */
  kod?: React.ReactNode;
  /** Akce vpravo dole (tlačítko „Uplatnit“). */
  akce?: React.ReactNode;
  /** Vlastní spodní polovina místo kódu a akce. */
  dole?: React.ReactNode;
  /** Vyčerpaný, propadlý nebo použitý lístek: tlumeně. */
  vypnuty?: boolean;
  /** Prvek obalu (v seznamu lístků `li`). */
  as?: 'div' | 'li' | 'article';
  ariaLabel?: string;
  id?: string;
  className?: string;
}

export default function Listek({ podnik, poznamka, titulek, podtitulek, children, kodPopisek, kod, akce, dole, vypnuty, as = 'div', ariaLabel, id, className = '' }: ListekProps) {
  const Obal = as;
  const maDole = dole != null || kod != null || akce != null;
  return (
    <Obal id={id} aria-label={ariaLabel} className={`hp-listek ${vypnuty ? 'hp-listek-vypnuty' : ''} ${className}`}>
      <div className={maDole ? 'hp-listek-horni' : 'hp-listek-horni hp-listek-sam'}>
        {(podnik || poznamka) && (
          <div className="flex items-center gap-2.5 min-w-0">
            {podnik && <Monogram nazev={podnik.nazev} klic={podnik.klic} logoUrl={podnik.logoUrl} velikost={28} />}
            {podnik && <span className="hp-meta !text-[color:var(--hp-fg)] font-medium truncate min-w-0">{podnik.nazev}</span>}
            {poznamka != null && <span className="hp-meta ml-auto shrink-0 text-right">{poznamka}</span>}
          </div>
        )}
        <p className="hp-listek-titulek">{titulek}</p>
        {podtitulek != null && <div className="hp-meta hp-num mt-[3px]">{podtitulek}</div>}
        {children}
      </div>
      {maDole && (
        <div className="hp-listek-dolni">
          {dole ?? (
            <>
              <div className="flex-1 min-w-0">
                {kodPopisek != null && <div className="hp-mikro text-[color:var(--hp-muted)] mb-1">{kodPopisek}</div>}
                {kod != null && <div className="hp-kod text-[18px] leading-tight break-all">{kod}</div>}
              </div>
              {akce}
            </>
          )}
        </div>
      )}
    </Obal>
  );
}
