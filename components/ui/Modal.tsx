'use client';

import React, { useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icons';
import { useModal } from '@/lib/useModal';
import { DiscardGuard } from './DiscardGuard';
import { useT } from '@/lib/i18n/client';

// Okno — jedno pro všechny.
//
// V aplikaci bylo 41 ručně psaných oken ve 24 souborech. Každé si samo
// skládalo překryv, panel, nadpis a zavírání, takže se lišila v šířce,
// v rádiusu, v tom, jestli má křížek, i v tom, jestli kliknutí vedle
// okno zavře. Tohle je ta jedna podoba; `useModal` pod ním řeší fokus,
// Escape a zámek posouvání.

export function Modal({ open, onClose, title, subtitle, size = 'md', children, footer, className = '', nadOkny = false }: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /**
   * Tři velikosti a nic mezi tím:
   *   sm — potvrzení a krátký formulář (dvě tři pole)
   *   md — běžné okno (výchozí)
   *   lg — tabulka, náhled nebo editor
   *   xl — widget zvětšený na celou plochu (graf, dlouhý seznam)
   * V aplikaci se dřív vyskytovalo šest různých šířek, protože každé okno
   * si tu svoji odhadlo samo.
   */
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  /** Patička s tlačítky. Hlavní akce vpravo, stejně jako všude jinde. */
  footer?: React.ReactNode;
  className?: string;
  /**
   * Okno nad ostatními okny. Běžná okna sdílejí jednu vrstvu a vrch určuje pořadí v DOM —
   * hledání (Ctrl K) se kreslí z layoutu, tedy dřív než okna stránky, a otevřené nad detailem
   * úkolu nebo čtečkou návodu by skončilo pod nimi: klávesnice v něm, oči ne.
   */
  nadOkny?: boolean;
}) {
  const t = useT();
  const modal = useModal(open, onClose, typeof title === 'string' ? title : undefined);
  // Okno se kreslí do <body>, ne tam, kde je v komponentách napsané. Uvnitř karty widgetu (zkrácené tělo
  // s overflow a maskou, kývající se <li> s transformací) by `position: fixed` okno ořízlo nebo posunulo.
  // Na serveru a při hydrataci false (žádný document), hned potom true.
  const vBody = useSyncExternalStore(() => () => {}, () => true, () => false);
  if (!open || !vBody) return null;
  // Okno jen s titulkem, větou a tlačítky (potvrzení): prázdné tělo by mezi podtitulkem a patičkou
  // složilo 24 px vzduchu navíc. `toArray` zahodí null/false/undefined; prázdný řetězec taky nic není.
  const prazdneTelo = React.Children.toArray(children).every(c => c === '');
  const width = size === 'sm' ? 'max-w-sm' : size === 'xl' ? 'max-w-5xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-md';
  return createPortal(
    <div
      className={`fixed inset-0 ${nadOkny ? 'z-[90]' : 'z-[70]'} flex items-center justify-center p-4 modal-overlay`}
      onClick={onClose}>
      {/* Vyjetí zdola a dosednutí na spodní hranu na telefonu řeší
          `.modal-overlay` / `.modal-sheet` v globals.css — pro všechna okna
          v aplikaci stejně, ať je kreslí tahle komponenta nebo ne. */}
      <div ref={modal.ref} {...modal.dialogProps}
        className={`modal-sheet w-full ${width} flex flex-col rounded-3xl max-h-[calc(100dvh-2rem)] ${className}`}
        onClick={e => e.stopPropagation()}>
        <DiscardGuard guard={modal.guard} />
        {/* v3: velký titulek (22 px), krátká věta pod ním a zavírací kříž v šedém kruhu. */}
        {/* v4 (V6): odsazení okna 20 na telefonu / 24 od sm; titul → 4 → věta → 24 → obsah;
            zavírací kruh 36 končí na R (dřív o 4 px za ním). */}
        <div className={`flex items-start gap-3 p-5 sm:p-6 ${prazdneTelo ? (footer ? 'pb-5' : 'pb-6') : 'pb-6'}`}>
          <div className="min-w-0 flex-1">
            <h3 className="t-section text-[1.375rem] leading-tight font-bold tracking-[-0.02em] text-balance">{title}</h3>
            {subtitle && <p className="mt-1 text-[15px] leading-snug text-black/60 text-pretty">{subtitle}</p>}
          </div>
          <button type="button" onClick={modal.guard.attemptClose} aria-label={t('Zavřít')}
            className="btn-icon tap-target shrink-0 -mt-1"><Icon name="close" size={16} /></button>
        </div>
        {!prazdneTelo && <div className="px-5 sm:px-6 pb-6 overflow-y-auto scrollbar-thin">{children}</div>}
        {/* Tlačítka se zalamují: na 320 px má tělo okna 240 px a „Stornieren" +
            „Eintrag speichern" mají 270 — bez zalomení vyjelo Zrušit za levý okraj. */}
        {/* Na telefonu (spodní okno) jdou tlačítka přes šířku jako v inspiracích: jedno nebo dvě pilulky
            vedle sebe, palec je nemine. Od sm zůstávají vpravo podle obsahu. */}
        {/* v4 (V6, P12): patička = stupeň L (52); na telefonu L→R nebo 2 × ½ (mezera 8). */}
        {footer && <div className="okno-paticka px-5 sm:px-6 pb-5 sm:pb-6 pt-0 flex flex-wrap items-center justify-end gap-2 max-sm:[&>*]:flex-1 max-sm:[&>*]:min-w-[8rem]">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
