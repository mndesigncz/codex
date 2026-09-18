'use client';

import React from 'react';
import { Icon } from '../Icons';
import { useModal } from '@/lib/useModal';
import { DiscardGuard } from './DiscardGuard';

// Okno — jedno pro všechny.
//
// V aplikaci bylo 41 ručně psaných oken ve 24 souborech. Každé si samo
// skládalo překryv, panel, nadpis a zavírání, takže se lišila v šířce,
// v rádiusu, v tom, jestli má křížek, i v tom, jestli kliknutí vedle
// okno zavře. Tohle je ta jedna podoba; `useModal` pod ním řeší fokus,
// Escape a zámek posouvání.

export function Modal({ open, onClose, title, subtitle, size = 'md', sheet = false, children, footer, className = '' }: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /**
   * Tři velikosti a nic mezi tím:
   *   sm — potvrzení a krátký formulář (dvě tři pole)
   *   md — běžné okno (výchozí)
   *   lg — tabulka, náhled nebo editor
   * V aplikaci se dřív vyskytovalo šest různých šířek, protože každé okno
   * si tu svoji odhadlo samo.
   */
  size?: 'sm' | 'md' | 'lg';
  /**
   * Na telefonu vyjede zdola a drží se spodní hrany (jako list), na
   * monitoru zůstává vystředěné okno. Pro dlouhý obsah, kde je palec
   * u spodního kraje — třeba detail uzávěrky nebo výběr z dlouhého seznamu.
   */
  sheet?: boolean;
  children: React.ReactNode;
  /** Patička s tlačítky. Hlavní akce vpravo, stejně jako všude jinde. */
  footer?: React.ReactNode;
  className?: string;
}) {
  const modal = useModal(open, onClose, typeof title === 'string' ? title : undefined);
  if (!open) return null;
  const width = size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';
  return (
    <div
      className={`fixed inset-0 z-[70] flex justify-center modal-overlay ${sheet ? 'items-end sm:items-center p-0 sm:p-4' : 'items-center p-4'}`}
      onClick={onClose}>
      <div ref={modal.ref} {...modal.dialogProps}
        className={`modal-sheet w-full ${width} flex flex-col ${className} ${
          sheet
            ? 'rounded-t-3xl sm:rounded-3xl max-h-[calc(100dvh-3rem)] sm:max-h-[calc(100dvh-2rem)]'
            : 'rounded-3xl max-h-[calc(100dvh-2rem)]'
        }`}
        onClick={e => e.stopPropagation()}>
        <DiscardGuard guard={modal.guard} />
        <div className="flex items-start gap-3 p-6 pb-3">
          <div className="min-w-0 flex-1">
            <h3 className="t-section text-balance">{title}</h3>
            {subtitle && <p className="t-meta mt-1 text-pretty">{subtitle}</p>}
          </div>
          <button type="button" onClick={modal.guard.attemptClose} aria-label="Zavřít"
            className="btn-icon shrink-0 -mt-1 -mr-1"><Icon name="close" size={16} /></button>
        </div>
        <div className="px-6 pb-6 overflow-y-auto scrollbar-thin">{children}</div>
        {footer && <div className="px-6 pb-6 pt-0 flex items-center justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export default Modal;
