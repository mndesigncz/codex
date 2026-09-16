'use client';

import React, { useEffect } from 'react';
import { Icon } from '../Icons';

// Jeden toast pro celou aplikaci: tmavý lístek dole uprostřed, přijede
// zdola, zmizí sám. Obrazovky mu jen podají text — dřív každá kreslila
// vlastní zelený proužek na jiném místě.

export function Toast({ message, onClose, tone = 'ok', ms = 3600 }: {
  message: string | null; onClose: () => void; tone?: 'ok' | 'bad'; ms?: number;
}) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onClose, ms);
    return () => clearTimeout(t);
  }, [message, ms, onClose]);
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),16px)] z-[80] flex justify-center px-4 md:bottom-6">
      <p role="status" className="toast-in pointer-events-auto max-w-md rounded-full bg-[#16181A] text-white text-sm font-medium px-4 py-2.5 shadow-[var(--shadow-float)] flex items-center gap-2">
        <Icon name={tone === 'bad' ? 'warning' : 'check'} size={15} className={tone === 'bad' ? 'text-[#FF8A80]' : 'text-[#C8F542]'} />
        <span className="min-w-0">{message}</span>
      </p>
    </div>
  );
}

export default Toast;
