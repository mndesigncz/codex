// Hlavička obrazovky (malý nadtitulek 13 + velký titulek 32/620, vpravo avatar nebo akce)
// a nadpis sekce (17/600 + odkaz vpravo) ve směru A. Jeden h1 na obrazovku.

export function HlavickaObrazovky({ nadtitulek, titulek, vpravo, id, className = '' }: {
  nadtitulek?: React.ReactNode;
  titulek: React.ReactNode;
  vpravo?: React.ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <header className={`hp-hlavicka ${className}`}>
      <div>
        {nadtitulek != null && nadtitulek !== '' && <p className="hp-meta">{nadtitulek}</p>}
        <h1 id={id} className="hp-titulek">{titulek}</h1>
      </div>
      {vpravo != null && <div className="shrink-0">{vpravo}</div>}
    </header>
  );
}

export function NadpisSekce({ titulek, vpravo, id, as = 'h2', className = '' }: {
  titulek: React.ReactNode;
  vpravo?: React.ReactNode;
  id?: string;
  as?: 'h2' | 'h3';
  className?: string;
}) {
  const H = as;
  return (
    <div className={`hp-sekce ${className}`}>
      <H id={id} className="hp-h2">{titulek}</H>
      {vpravo != null && <div className="shrink-0">{vpravo}</div>}
    </div>
  );
}
