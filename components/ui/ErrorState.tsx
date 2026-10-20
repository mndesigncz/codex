'use client';

import React from 'react';
import { Icon } from '../Icons';
import { Button } from './Button';
import { useT } from '@/lib/i18n/client';

// Třetí poctivý stav obrazovky — vedle „mám data" a „nic tu není".
//
// Dřív se nepovedené načtení projevilo dvěma způsoby, oba špatně: buď
// věčným skeletonem (catch, který nic neudělal), nebo bílou stránkou
// s anglickou hláškou Next.js. Obojí vypadá jako rozbitá aplikace i když
// jde o vteřinový výpadek sítě. Tohle řekne česky, co se stalo, a dá
// jedno tlačítko, kterým se to zkusí znovu.

export function ErrorState({ title, hint, onRetry, detail, compact = false, vlevo = false, className = '' }: {
  title?: React.ReactNode;
  /** Co s tím může člověk udělat. Když nic, napíšeme obecnou větu. */
  hint?: React.ReactNode;
  onRetry?: () => void;
  /** Technický detail — schovaný, ať běžný člověk nevidí stack trace. */
  detail?: string;
  compact?: boolean;
  /**
   * v4 (audit V11): chyba UVNITŘ karty zarovnané vlevo (widget, sekce) — kruh na L karty,
   * věta vedle něj, „Zkusit znovu" přes celou šířku L→R × 44 pod tím. Na střed jen na celé stránce;
   * dřív byl obsah karty s titulkem vlevo posunutý o 30–280 px a dvě tlačítka různé šířky na středu.
   */
  vlevo?: boolean;
  className?: string;
}) {
  const t = useT('spolecne');
  if (vlevo) {
    return (
      <div className={`sloupec sloupec-4 ${className}`}>
        <div className="flex items-start gap-3 min-w-0">
          <span aria-hidden className="stav-kruh bg-[var(--bad-bg)] text-[var(--bad-ink)]"><Icon name="warning" size={20} /></span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="stav-titul text-balance">{title ?? t('Tohle se nepodařilo načíst')}</p>
            <p className="t-meta mt-1 text-pretty">{hint ?? t('Nejspíš vypadlo připojení. Data jsou v pořádku — zkus to načíst znovu.')}</p>
          </div>
        </div>
        {onRetry && <Button variant="secondary" icon="refresh" onClick={onRetry} className="w-full">{t('Zkusit znovu')}</Button>}
        {detail && (
          <details className="max-w-full -mt-1">
            <summary className="text-xs font-medium text-black/55 cursor-pointer select-none py-2">{t('Technický detail')}</summary>
            <p className="mt-1 text-[11px] text-black/45 font-mono break-all">{detail}</p>
          </details>
        )}
      </div>
    );
  }
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'py-6 px-4' : 'py-12 px-6'} ${className}`}>
      <div className={`${compact ? 'h-12 w-12' : 'h-16 w-16'} rounded-2xl bg-[#DC2626]/10 text-[#991B1B] flex items-center justify-center mb-4`}>
        <Icon name="warning" size={compact ? 22 : 28} />
      </div>
      <p className={`font-bold tracking-tight text-[#16181A] text-balance ${compact ? 'text-base' : 'text-lg'}`}>{title ?? t('Tohle se nepodařilo načíst')}</p>
      <p className="text-black/55 mt-1.5 max-w-sm text-sm text-pretty">
        {hint ?? t('Nejspíš vypadlo připojení. Data jsou v pořádku — zkus to načíst znovu.')}
      </p>
      {onRetry && (
        <div className="mt-5">
          <Button variant="secondary" icon="refresh" onClick={onRetry}>{t('Zkusit znovu')}</Button>
        </div>
      )}
      {detail && (
        <details className="mt-4 max-w-full">
          <summary className="text-xs font-medium text-black/55 cursor-pointer select-none py-3.5 -my-2.5">{t('Technický detail')}</summary>
          <p className="mt-2 text-[11px] text-black/45 font-mono break-all max-w-sm">{detail}</p>
        </details>
      )}
    </div>
  );
}

export default ErrorState;
