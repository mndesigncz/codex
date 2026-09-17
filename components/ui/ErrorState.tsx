'use client';

import React from 'react';
import { Icon } from '../Icons';
import { Button } from './Button';

// Třetí poctivý stav obrazovky — vedle „mám data" a „nic tu není".
//
// Dřív se nepovedené načtení projevilo dvěma způsoby, oba špatně: buď
// věčným skeletonem (catch, který nic neudělal), nebo bílou stránkou
// s anglickou hláškou Next.js. Obojí vypadá jako rozbitá aplikace i když
// jde o vteřinový výpadek sítě. Tohle řekne česky, co se stalo, a dá
// jedno tlačítko, kterým se to zkusí znovu.

export function ErrorState({ title = 'Tohle se nepodařilo načíst', hint, onRetry, detail, compact = false, className = '' }: {
  title?: React.ReactNode;
  /** Co s tím může člověk udělat. Když nic, napíšeme obecnou větu. */
  hint?: React.ReactNode;
  onRetry?: () => void;
  /** Technický detail — schovaný, ať běžný člověk nevidí stack trace. */
  detail?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'py-6 px-4' : 'py-12 px-6'} ${className}`}>
      <div className={`${compact ? 'h-12 w-12' : 'h-16 w-16'} rounded-2xl bg-[#E4572E]/10 text-[#B23A15] flex items-center justify-center mb-4`}>
        <Icon name="warning" size={compact ? 22 : 28} />
      </div>
      <p className={`font-bold tracking-tight text-[#16181A] text-balance ${compact ? 'text-base' : 'text-lg'}`}>{title}</p>
      <p className="text-black/55 mt-1.5 max-w-sm text-sm text-pretty">
        {hint ?? 'Nejspíš vypadlo připojení. Data jsou v pořádku — zkus to načíst znovu.'}
      </p>
      {onRetry && (
        <div className="mt-5">
          <Button variant="secondary" icon="refresh" onClick={onRetry}>Zkusit znovu</Button>
        </div>
      )}
      {detail && (
        <details className="mt-4 max-w-full">
          <summary className="text-[11px] uppercase tracking-wider text-black/35 cursor-pointer select-none">Technický detail</summary>
          <p className="mt-2 text-[11px] text-black/45 font-mono break-all max-w-sm">{detail}</p>
        </details>
      )}
    </div>
  );
}

export default ErrorState;
