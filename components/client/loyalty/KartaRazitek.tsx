'use client';

// Razítková karta tak, jak ji vidí host: barva, ikona nebo obrázek, popis,
// průběh, odměna (i s položkami), okno platnosti, vypršení a sdílený popis
// podmínek. Používá ji stránka podniku, Moje i náhled v editoru kampaně
// (správce tak vidí přesně to, co uvidí host).
//
// Komponenta dostává jen data (viz kartaProHosta v lib/razitkaPravidla.ts),
// věty skládá přes t(), takže jde do jazyka hosta.

import { Icon, type IconName } from '../../Icons';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum, fmtDenVTydnu, fmtHM } from '@/lib/i18n/format';
import { onAccent } from '@/lib/floorplan';
import type { KartaHosta } from '@/lib/razitkaPravidla';

/** Dny v týdnu 1–7 jako text: souvislý úsek „Po–Pá“, jinak výčet. */
function dnyText(dny: number[], jazyk: any): string {
  const jmeno = (d: number) => fmtDenVTydnu(d - 1, { jazyk });
  const out: string[] = [];
  let i = 0;
  while (i < dny.length) {
    let j = i;
    while (j + 1 < dny.length && dny[j + 1] === dny[j] + 1) j++;
    out.push(j - i >= 2 ? `${jmeno(dny[i])}–${jmeno(dny[j])}` : dny.slice(i, j + 1).map(jmeno).join(', '));
    i = j + 1;
  }
  return out.join(', ');
}

export default function KartaRazitek({ karta, clen = true, nahled = false }: { karta: KartaHosta; clen?: boolean; nahled?: boolean }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const k = karta;
  const maVzhled = !!(k.color || k.image);
  const text = k.image ? '#FFFFFF' : onAccent(k.color);
  const pozadi = k.image
    ? { backgroundImage: `linear-gradient(rgba(0,0,0,.48), rgba(0,0,0,.48)), url("${k.image}")`, backgroundSize: 'cover', backgroundPosition: 'center', color: text }
    : k.color ? { backgroundColor: k.color, color: text } : undefined;
  const slotu = Math.min(k.required, 20);
  const dnu = k.okno?.days?.length ? dnyText(k.okno.days, jazyk) : '';
  const hodiny = k.okno?.from && k.okno?.till ? `${fmtHM(k.okno.from)}–${fmtHM(k.okno.till)}` : '';
  const kdy = [dnu, hodiny].filter(Boolean).join(', ');
  const datum = (d: string) => fmtDatum(d, { jazyk, styl: 'kratce' });
  const ikona = (k.icon as IconName | null) ?? 'check';
  const slabsi = maVzhled ? 'opacity-80' : 'text-black/55';
  return (
    <div className={`rounded-2xl ${maVzhled ? 'p-4' : ''}`} style={pozadi} data-testid={nahled ? 'karta-nahled' : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold min-w-0 truncate flex items-center gap-1.5">
          {k.icon && <Icon name={k.icon as IconName} size={15} className="shrink-0" />}
          <span className="truncate">{k.name || t('Nová kartička')}</span>
        </p>
        <p className="text-sm font-semibold tabular-nums shrink-0">{clen ? `${k.stamps} / ${k.required}` : t('{n} razítek', { n: k.required })}</p>
      </div>
      {k.description && <p className={`text-xs mt-0.5 ${slabsi}`}>{k.description}</p>}
      {clen && (
        <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(k.required, 10)}, minmax(0, 1fr))` }} role="img"
          aria-label={t('{name}: {stamps} z {required} razítek', { name: k.name, stamps: k.stamps, required: k.required })}>
          {Array.from({ length: slotu }).map((_, i) => {
            const plny = i < k.stamps;
            return (
              <span key={i} aria-hidden className={`h-8 rounded-lg border flex items-center justify-center ${plny ? 'bg-[#C8F542] border-[#C8F542] text-[#16181A]' : maVzhled ? 'border-current/30 bg-white/10' : 'bg-white/60 border-black/[0.08]'}`}>
                {plny && <Icon name={ikona} size={14} />}
              </span>
            );
          })}
        </div>
      )}
      {k.reward && (
        <p className={`mt-2 text-xs ${slabsi}`}>{t('Za plnou kartu:')} <strong className={maVzhled ? '' : 'text-black/80'}>{k.reward}</strong>
          {k.rewardItems?.length > 0 ? ` (${k.rewardItems.join(', ')})` : ''}
          {k.completed > 0 ? ` · ${t('dokončeno {n}×', { n: k.completed })}` : ''}</p>
      )}
      {!k.reward && k.rewardItems?.length > 0 && <p className={`mt-2 text-xs ${slabsi}`}>{t('Odměna: {polozky}', { polozky: k.rewardItems.join(', ') })}</p>}
      {kdy && <p className={`mt-1.5 text-xs ${slabsi}`}>{t('Razítko dává jen {kdy}.', { kdy })}</p>}
      {clen && k.expired && <p role="status" className={`mt-1.5 text-xs font-semibold ${maVzhled ? '' : 'text-wait-ink'}`}>{t('Rozdělaná karta vypršela, {n, plural, one {# razítko propadlo} few {# razítka propadla} other {# razítek propadlo}}. Další razítko začne novou kartu.', { n: k.expiredStamps })}</p>}
      {clen && !k.expired && k.finishBy && k.stamps > 0 && <p className={`mt-1.5 text-xs ${maVzhled ? '' : 'text-wait-ink'}`}>{k.daysLeft === 0 ? t('Dosbírej kartu dnes, jinak razítka propadnou.') : t('Dosbírej kartu do {datum}, jinak razítka propadnou.', { datum: datum(k.finishBy) })}</p>}
      {clen && k.nextCardFrom && <p className={`mt-1.5 text-xs ${slabsi}`}>{t('Další kartu jde sbírat od {datum}.', { datum: datum(k.nextCardFrom) })}</p>}
      {clen && k.finishedForever && <p className={`mt-1.5 text-xs ${slabsi}`}>{t('Tuhle kartu už máš dokončenou, další se nesbírá.')}</p>}
      {k.validTill && <p className={`mt-1.5 text-xs ${slabsi}`}>{t('Kartička platí do {datum}.', { datum: datum(k.validTill) })}</p>}
      {k.conditions && (
        <details className="mt-2 text-xs">
          <summary className={`cursor-pointer font-semibold ${maVzhled ? '' : 'text-black/65'}`}>{t('Podmínky')}</summary>
          <p className={`mt-1 whitespace-pre-line text-pretty ${slabsi}`}>{k.conditions}</p>
        </details>
      )}
    </div>
  );
}

/** Skončené kartičky, na kterých host něco měl: vysvětlení, proč z přehledu zmizely. */
export function SkonceneKarticky({ list }: { list: { id: number; name: string; validTill: string | null; stamps: number; completed: number; duvod: 'ended' | 'archived' | 'paused' }[] }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  if (!list?.length) return null;
  return (
    <div className="mt-4 border-t border-black/[0.06] pt-3">
      <p className="text-xs font-semibold text-black/65">{t('Skončené kartičky')}</p>
      <ul className="mt-1.5 space-y-1">
        {list.map(c => (
          <li key={c.id} className="text-xs text-black/55 text-pretty">
            <strong className="text-black/75">{c.name}</strong>{' — '}
            {c.duvod === 'ended' && c.validTill
              ? t('skončila {datum}, razítka už nejdou doplnit.', { datum: fmtDatum(c.validTill, { jazyk, styl: 'kratce' }) })
              : c.duvod === 'paused' ? t('podnik ji dočasně pozastavil, razítka ti zůstávají.')
              : t('podnik ji ukončil, razítka už nejdou doplnit.')}
            {c.completed > 0 ? ` ${t('Dokončeno {n}×.', { n: c.completed })}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
