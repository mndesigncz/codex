'use client';

// Okno přes celou obrazovku pro otevřenou kartu a „U kasy“ (směr A „Peněženka“): vlastní plátno se
// skvrnami (PozadiHosta) místo ztmaveného překryvu, obsah ve sloupci telefonu (max 28 rem), nahoře
// lišta s kulatými tlačítky. Chování okna (role dialog, aria-modal, past fokusu, Escape, návrat
// fokusu na tlačítko, které okno otevřelo, zámek posuvu, Zpět zavře okno) dodává lib/useModal —
// stejné jako u všech oken v aplikaci. Kreslí se do <body> (portál).
// check-sheet: cela-obrazovka — není to list zdola, okno zakryje celou obrazovku.

import { useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useModal } from '@/lib/useModal';
import PozadiHosta from '../PozadiHosta';

export default function CelaObrazovka({ open, onClose, label, children, className = '' }: {
  open: boolean;
  onClose: () => void;
  /** Jméno okna pro odečítač („Karta Kavárna U Lípy“, „U kasy“). */
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const modal = useModal(open, onClose, label);
  // useModal zamyká <body>; když dokument posouvá <html> (overflow na kořeni), stránka pod oknem by
  // se dál posouvala. Zámek i na <html>, po zavření se vrátí původní hodnota.
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const pred = html.style.overflow;
    html.style.overflow = 'hidden';
    return () => { html.style.overflow = pred; };
  }, [open]);
  const vBody = useSyncExternalStore(() => () => {}, () => true, () => false);
  if (!open || !vBody) return null;
  return createPortal(
    <div className="h-plocha !fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-[#F6F7F3] dark:bg-[#0C0D0F] text-[color:var(--hp-fg)]">
      <PozadiHosta />
      <div ref={modal.ref} {...modal.dialogProps}
        className={`h-vyjed relative mx-auto flex min-h-full w-full max-w-[28rem] flex-col px-[var(--hp-okraj)] pt-[max(env(safe-area-inset-top),10px)] outline-none ${className}`}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Horní lišta okna: vlevo zavřít, uprostřed popisek („Karta 2 z 3“), vpravo akce nebo místo. */
export function ListaOkna({ vlevo, stred, vpravo }: { vlevo: React.ReactNode; stred?: React.ReactNode; vpravo?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 pt-1.5 pb-3.5">
      <div className="flex w-11 shrink-0 justify-start">{vlevo}</div>
      <div className="min-w-0 flex-1 text-center">{stred}</div>
      <div className="flex w-11 shrink-0 justify-end">{vpravo}</div>
    </div>
  );
}
