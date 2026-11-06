// Drobnosti směru A, které sdílí víc obrazovek: prázdný stav s vějířem inkoustových karet
// a čárkovaný slot „Přidat…“ (přidání karty podniku, poukazu). Texty dodává volající přes t().

import { Icon } from '../../Icons';

/** Prázdný stav: vějíř tří prázdných inkoustových karet, nadpis, věta a akce. */
export function PrazdnyStav({ titulek, text, akce, bezIlustrace = false, className = '' }: { titulek: React.ReactNode; text?: React.ReactNode; akce?: React.ReactNode; /** Bez vějíře karet (obrazovka už jeden balíček má). */ bezIlustrace?: boolean; className?: string }) {
  return (
    <div className={`hp-prazdno ${className}`}>
      {!bezIlustrace && (
        <div className="hp-vejir" aria-hidden>
          {(['tecky', 'koleje', 'kruhy'] as const).map(t => <span key={t} className="hp-karta"><span className={`hp-tex hp-tex-${t}`} /></span>)}
        </div>
      )}
      <p className="hp-h2">{titulek}</p>
      {text != null && <p className="hp-meta">{text}</p>}
      {akce != null && <div className="mt-5 flex flex-wrap justify-center gap-2">{akce}</div>}
    </div>
  );
}

/** Čárkovaný slot „+ Přidat kartu podniku · Naskenovat · Najít“. */
export function SlotPridat({ popis, napoveda, onClick, ariaLabel, className = '' }: { popis: React.ReactNode; napoveda?: React.ReactNode; onClick: () => void; ariaLabel?: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={`hp-slot ${className}`}>
      <Icon name="plus" size={18} strokeWidth={1.6} />
      <span className="min-w-0 truncate">{popis}</span>
      {napoveda != null && <span className="hp-meta truncate">{napoveda}</span>}
    </button>
  );
}
