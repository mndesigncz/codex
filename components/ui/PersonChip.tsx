import React from 'react';
import { Avatar } from './Avatar';

// Člověk jako pilulka: avatar a jméno, případně krátký údaj („od 8:00").
//
// Stejná věc byla na čtyřech místech čtyřmi způsoby — Právě na směně
// (bílá pilulka s linkou), Ještě nezadali (šedá s emoji v textu), kiosk
// (bílé karty lidí v bílé kartě). Tvar je chip, takže vedle stavových chipů
// sedí se stejným písmem a tóny.

/**
 * Člověk jako pilulka — kdo je na směně, kdo ještě nezadal dostupnost, kdo
 * je na akci. Tón nese stav: `ok` = právě na směně, `muted` = výchozí.
 * Není to tlačítko: odkaz na profil dodá obal (`<PersonLink id>` kolem).
 */
export function PersonChip({ name, avatar, tone = 'muted', meta, size = 'md', className = '' }: {
  name: string;
  /** Emoji avatara; bez něj kreslená silueta. */
  avatar?: string | null;
  tone?: 'muted' | 'ok' | 'wait' | 'bad' | 'info';
  /** Krátký údaj za jménem, např. čas příchodu. */
  meta?: React.ReactNode;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const sm = size === 'sm';
  return (
    // Avatar dosedne do zaoblení pilulky: levý a svislý okraj 2 px, jinak by
    // kolečko plavalo uprostřed prázdného místa a pilulka by byla vyšší než
    // řádek vedle. `!` kvůli `.chip-sm`, která si okraje nastavuje sama
    // a v CSS stojí až za utilitami.
    <span className={`chip chip-${tone} ${sm ? 'chip-sm' : ''} !py-0.5 !pl-0.5 max-w-full min-w-0 ${className}`}>
      <Avatar emoji={avatar} size="xs" ring={false} className={sm ? '!h-5 !w-5' : ''} />
      <span className="min-w-0 truncate">{name}</span>
      {/* Údaj odliší slabší řez, ne průhlednost: 80 % tlumeného textu na
          šedém chipu by kleslo pod 4,5 : 1. */}
      {meta != null && meta !== '' && <span className="shrink-0 tabular-nums font-medium">{meta}</span>}
    </span>
  );
}

export default PersonChip;
