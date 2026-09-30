'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { FOTKY, type IdFotky } from './foto';

// Fotka kroku v rámu. Při změně `id` se nová fotka prolne přes starou
// (crossfade opacity, třída .pv-foto-vrstva): dvě vrstvy nad sebou, jedna
// svítí. Pod nimi pomalý ken-burns (scale), jen při povoleném pohybu.
//
// Rozměr (width/height), rozmazaný náhled a popis nese tabulka FOTKY —
// bez rozměru by stránka při načtení poskočila, bez popisu by odečítač
// nevěděl, co na fotce je.

export default function FotoKroku({ id, pomer = 'aspect-[16/9] lg:aspect-[4/3]', priority = false, className = '' }: {
  id: IdFotky;
  /** Poměr stran rámu; na telefonu pruh, na počítači 4:3. */
  pomer?: string;
  priority?: boolean;
  className?: string;
}) {
  // Dvě vrstvy: `a` a `b`; svítí ta, na kterou ukazuje `zap`. Přepnutí jen
  // prohodí, která svítí, takže se mění výhradně opacity.
  const [vrstvy, setVrstvy] = useState<{ a: IdFotky; b: IdFotky; zap: 'a' | 'b' }>({ a: id, b: id, zap: 'a' });
  const minule = useRef(id);
  useEffect(() => {
    if (minule.current === id) return;
    minule.current = id;
    setVrstvy(v => (v.zap === 'a' ? { ...v, b: id, zap: 'b' } : { ...v, a: id, zap: 'a' }));
  }, [id]);

  return (
    <div className={`foto-ramec ${pomer} ${className}`} data-foto={id}>
      {(['a', 'b'] as const).map(k => {
        const fk = FOTKY[vrstvy[k]];
        const zap = vrstvy.zap === k;
        return (
          <div key={k} className="pv-foto-vrstva" data-zap={zap ? '' : undefined} aria-hidden={zap ? undefined : true}>
            <Image
              src={fk.src}
              alt={zap ? fk.alt : ''}
              width={fk.w}
              height={fk.h}
              sizes="(min-width: 1024px) 480px, 100vw"
              placeholder="blur"
              blurDataURL={fk.blur}
              priority={priority && k === 'a'}
              className="ken-burns"
            />
          </div>
        );
      })}
    </div>
  );
}
