'use client';

// Jedna věta o dni místo čtyř statistických karet: „Dnes 1 z 4 hotovo" s tenkým pruhem a (když něco leží po termínu)
// červený štítek, který rovnou zapne filtr Po termínu. Stejné číslo, které by člověk jinak skládal z karet.

import { Icon } from '../Icons';
import { useT } from '@/lib/i18n/client';

export function UkolySouhrn({ hotovo, celkem, poTerminu, onPoTerminu }: {
  hotovo: number;
  celkem: number;
  poTerminu: number;
  onPoTerminu: () => void;
}) {
  const t = useT('widgety');
  if (celkem === 0 && poTerminu === 0) return null;
  const pct = celkem > 0 ? Math.round((hotovo / celkem) * 100) : 0;
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="t-label">{t('Dnes')}</span>
          {celkem === 0 && <span className="text-[15px] text-black/55">{t('na dnes nic není')}</span>}
          {celkem > 0 && (
            <span className="text-[15px] text-black/60">
              <span className="text-xl font-bold tabular-nums text-[#16181A]">{hotovo}</span> {t('z {n} hotovo', { n: celkem })}
            </span>
          )}
        </p>
        {celkem > 0 && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-black/[0.07]" role="progressbar" aria-valuemin={0} aria-valuemax={celkem} aria-valuenow={hotovo} aria-label={t('Dnes hotovo')}>
            <div className="h-full rounded-full bg-[#C8F542] transition-[width]" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
      {poTerminu > 0 && (
        <button type="button" onClick={onPoTerminu}
          className="chip chip-bad inline-flex shrink-0 items-center gap-1.5 !px-3 !py-2 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542]">
          <Icon name="clock" size={14} />{t('{n} po termínu', { n: poTerminu })}
        </button>
      )}
    </div>
  );
}
