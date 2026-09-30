'use client';

// Detail proběhlého postupu — co bylo hotové, co přeskočené a proč, co zůstalo (kolo 69, B6b).
//
// Dřív ručně psané okno v Procedures.tsx: stav kroku jako emoji ✅ ⏭️ ❌, kroky
// v limetkově a červeně tónovaných boxech, „KLÍČOVÝ" ruční inkoustová pilulka
// verzálkami a 👤 místo avataru. Seznam průběhů je teď widget (postupy.posledni_prubehy),
// tak detail bydlí zvlášť: `.list` s ikonou v tónu stavu, Chip „klíčový", Modal.

import { Icon } from '../Icons';
import { Avatar, Chip, Modal } from '../ui';
import { isExcused } from '@/lib/procedureScoring';
import { parseSteps, stepPenalty, stepPlus } from '@/lib/steps';
import { delka, type PrubehApi } from '@/lib/postupyPrehled';
import { useT, type PrekladFn } from '@/lib/i18n/client';

/** Důvod přeskočení kroku podle id (id se ukládá, text se překládá až na obrazovce). */
export function duvodPreskoceni(id: string | null | undefined, t: PrekladFn): string {
  switch (id) {
    case 'not_needed': return t('Nebylo potřeba');
    case 'missing': return t('Chybělo zboží / vybavení');
    case 'no_time': return t('Nestíhal/a jsem');
    case 'other': return t('Jiný důvod');
    default: return id || t('Bez důvodu');
  }
}

/** Kroky postupu, ke kterému průběh patří (průběh si ukládá jen indexy). */
export default function DetailPrubehu({ prubeh, kroky, kdy, onClose }: {
  prubeh: PrubehApi;
  kroky: unknown;
  /** Kdy průběh skončil — už naformátované volajícím (dnes 7:40). */
  kdy: string;
  onClose: () => void;
}) {
  const t = useT('postupy');
  const steps = parseSteps(kroky);
  const hotove: number[] = Array.isArray(prubeh.checked_items) ? prubeh.checked_items as number[] : [];
  const preskocene: number[] = Array.isArray(prubeh.skipped_items) ? prubeh.skipped_items as number[] : [];
  const duvody = prubeh.skip_reasons && typeof prubeh.skip_reasons === 'object' ? prubeh.skip_reasons as Record<string, { reason?: string; note?: string }> : {};
  const trvani = delka(prubeh.duration_seconds ?? null);

  return (
    <Modal open onClose={onClose} title={String(prubeh.procedure_name ?? t('Postup'))}
      subtitle={<span className="inline-flex items-center gap-1.5 min-w-0">
        <Avatar emoji={prubeh.user_avatar} size="xs" />
        <span className="truncate">{[prubeh.user_name, kdy, trvani].filter(Boolean).join(' · ')}</span>
      </span>}>
      {steps.length === 0 ? (
        <p className="t-meta text-pretty">{t('Kroky tohoto postupu už nejsou k dispozici (postup se změnil nebo smazal).')}</p>
      ) : (
        <ul className="list">
          {steps.map((st, i) => {
            const hotovo = hotove.includes(i);
            const preskoceno = preskocene.includes(i);
            const d = duvody[String(i)];
            const omluveno = preskoceno && isExcused(d?.reason);
            const ikona = hotovo ? 'check' : preskoceno ? 'play' : 'close';
            const ton = hotovo ? 'text-ok-ink' : omluveno ? 'text-black/40' : 'text-bad-ink';
            const meta = hotovo
              ? undefined
              : preskoceno
                ? `${duvodPreskoceni(d?.reason, t)}${d?.note ? ` — „${d.note}"` : ''}${omluveno ? ` · ${t('omluveno, bez bodové ztráty')}` : ` · ${t('−{n} b.', { n: stepPenalty(st) })}`}`
                : t('Nedokončeno · −{n} b.', { n: stepPenalty(st) });
            return (
              <li key={i} className="flex items-start gap-3 py-2.5">
                {/* Přeskočený krok: šipka „dál" místo ⏭️ — stav nese tón, ne emoji. */}
                <Icon name={ikona} size={15} className={`mt-0.5 shrink-0 ${ton}`} />
                <div className="min-w-0 flex-1">
                  <p className={`text-sm text-pretty ${hotovo ? 'text-[#16181A]' : 'text-black/70'}`}>
                    {st.emoji ? `${st.emoji} ` : ''}{st.text}
                    {st.weight === 'key' && <Chip tone="ink" size="sm" className="ml-1.5 align-middle">{t('klíčový')}</Chip>}
                  </p>
                  {meta && <p className={`t-meta mt-0.5 ${omluveno ? '' : '!text-bad-ink'}`}>{meta}</p>}
                </div>
                {hotovo && stepPlus(st) > 0 && <span className="shrink-0 text-xs font-semibold text-ok-ink tabular-nums">+{stepPlus(st)}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
