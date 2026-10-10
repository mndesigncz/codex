'use client';

// Měsíční kalendář úkolů: každý den ukazuje, kolik úkolů má termín a kolik z nich je hotových (po termínu červeně).
// Klepnutí na den ukáže jeho úkoly pod kalendářem; vedení odtud může na ten den zadat nový úkol.

import { useMemo, useState, type ReactNode } from 'react';
import { Button, Card, EmptyState, MonthNav } from '../ui';
import { useT } from '@/lib/i18n/client';
import { aktualniJazyk } from '@/lib/i18n/stav';
import { useUlozeno } from '@/lib/useUlozeno';
import { kalendarUkolu, ukolyDne } from '@/lib/ukolyFiltr';
import type { Ukol } from '@/lib/ukolyPrehled';

export function UkolyMesic({ ukoly, dnes, zacatekTydne = 1, radek, onNovy }: {
  ukoly: readonly Ukol[];
  dnes: string;
  zacatekTydne?: 0 | 1;
  /** Jak se kreslí úkol dne (stejný řádek jako v seznamu). */
  radek: (u: Ukol) => ReactNode;
  /** Zadat nový úkol na vybraný den (jen kdo smí zadávat). */
  onNovy?: (den: string) => void;
}) {
  const t = useT('widgety');
  const loc = aktualniJazyk();
  const [mesic, setMesic] = useState(dnes.slice(0, 7));
  const [den, setDen] = useUlozeno<string>('ukoly-mesic-den', '');
  const vybrany = den && den.slice(0, 7) === mesic ? den : (mesic === dnes.slice(0, 7) ? dnes : `${mesic}-01`);
  const kal = useMemo(() => kalendarUkolu(ukoly, mesic, dnes, zacatekTydne), [ukoly, mesic, dnes, zacatekTydne]);
  const dneskaUkoly = useMemo(() => ukolyDne(ukoly, vybrany), [ukoly, vybrany]);
  const jmenoDne = (i: number) => new Date(`2024-01-0${((i + (zacatekTydne === 1 ? 0 : 6)) % 7) + 1}T12:00:00`).toLocaleDateString(loc, { weekday: 'short' });
  const denDlouze = new Date(`${vybrany}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' });
  const celkemMesic = kal.flat().reduce((s, b) => s + b.celkem, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <MonthNav value={mesic} onChange={setMesic} />
        <p className="t-meta">{t('S termínem v tomto měsíci: {n}', { n: celkemMesic })}</p>
      </div>
      <Card>
        <div role="group" aria-label={t('Kalendář úkolů')}>
          <div aria-hidden className="grid grid-cols-7 gap-1 mb-1 text-center text-[11px] text-black/45">
            {Array.from({ length: 7 }, (_, i) => <span key={i}>{jmenoDne(i)}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {kal.flat().map((b, i) => b.den == null ? <span key={i} aria-hidden /> : (
              <button key={b.den} type="button" aria-pressed={b.den === vybrany} onClick={() => setDen(b.den!)}
                aria-label={`${new Date(`${b.den}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'numeric' })}: ${b.celkem === 0 ? t('žádný úkol') : t('Úkolů: {n}, hotových: {h}', { n: b.celkem, h: b.hotovo })}`}
                className={`flex flex-col items-center justify-center rounded-xl py-1.5 min-h-[3.4rem] border text-[11px] leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] ${b.den === vybrany ? 'border-[#16181A] bg-black/[0.05]' : b.dnes ? 'border-[#16181A]/40' : 'border-transparent bg-black/[0.03]'}`}>
                <span className="text-black/55 tabular-nums">{Number(b.den.slice(8))}</span>
                {b.celkem > 0 ? (
                  <span className={`font-semibold tabular-nums ${b.poTerminu > 0 ? 'text-bad-ink' : b.hotovo === b.celkem ? 'text-black/40' : 'text-[#16181A]'}`}>
                    {b.hotovo}/{b.celkem}
                  </span>
                ) : <span className="text-black/25">·</span>}
              </button>
            ))}
          </div>
        </div>
      </Card>
      <section className="space-y-2" aria-label={t('Úkoly: {obdobi}', { obdobi: denDlouze })}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="t-label"><span className="cz-sentence">{denDlouze}</span> ({dneskaUkoly.length})</h2>
          {onNovy && vybrany >= dnes && <Button variant="secondary" size="sm" icon="plus" onClick={() => onNovy(vybrany)}>{t('Nový úkol')}</Button>}
        </div>
        {dneskaUkoly.length === 0
          ? <Card><EmptyState compact icon="calendar" title={t('Na tento den nic není')} hint={t('Úkoly s tímto termínem se ukážou tady.')} /></Card>
          : <Card pad="none" className="px-5"><ul className="list">{dneskaUkoly.map(radek)}</ul></Card>}
      </section>
    </div>
  );
}
