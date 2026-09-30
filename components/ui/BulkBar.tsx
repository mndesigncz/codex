'use client';

// Lišta hromadných akcí.
//
// Tmavá pilulka, která se přilepí nad dolní okraj, jakmile je něco vybráno.
// Vzor vznikl ve Skladu a byl použitý jen tam; tohle je on, vytažený ven,
// aby vypadal a choval se stejně u zásob i u žádostí o volno. Samotnou
// plovoucí lištu (polohu nad dokem, stín, poznámku pod ní) teď kreslí
// `PlovouciLista` — stejnou má i lišta úprav stránky.

import React from 'react';
import { Icon } from '../Icons';
import { czCount, czVerb, type CzNoun } from '@/lib/czech';
import { PlovouciLista } from './PlovouciLista';
import { useJazyk, useT } from '@/lib/i18n/client';

export interface BulkAction {
  label: string;
  onClick: () => void;
  /** Hlavní akce fronty — limetková, nejvýš jedna na liště. */
  primary?: boolean;
  /** Mazání a zamítání — červeně, vždy až za ostatními. */
  danger?: boolean;
  disabled?: boolean;
  icon?: string;
}

export function BulkBar({ count, totalLabel, onSelectAll, onExit, actions, note }: {
  count: number;
  /** Text tlačítka „vybrat vše" i s počtem, např. „Vybrat vše (12)". */
  totalLabel?: string;
  onSelectAll?: () => void;
  onExit: () => void;
  actions: BulkAction[];
  /** Krátká věta pod lištou — třeba co se nepovedlo. */
  note?: React.ReactNode;
}) {
  const t = useT('spolecne');
  if (count === 0) return null;
  return (
    <PlovouciLista label={t('Vybráno {n}', { n: count })} note={note}>
      <span className="text-sm font-semibold whitespace-nowrap px-1 tabular-nums">
        {t('{n} vybráno', { n: count })}
      </span>
      {onSelectAll && totalLabel && (
        <button type="button" onClick={onSelectAll}
          className="tap-target-sm rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20 transition whitespace-nowrap">
          {totalLabel}
        </button>
      )}
      {actions.filter(a => !a.danger).map(a => (
        <button key={a.label} type="button" onClick={a.onClick} disabled={a.disabled}
          className={`tap-target-sm whitespace-nowrap transition disabled:opacity-40 ${
            a.primary
              ? 'btn btn-accent btn-sm'
              : 'rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20'
          }`}>
          {a.icon && <Icon name={a.icon} size={14} className="inline -mt-0.5 mr-1" />}{a.label}
        </button>
      ))}
      {actions.filter(a => a.danger).map(a => (
        <button key={a.label} type="button" onClick={a.onClick} disabled={a.disabled}
          className="tap-target-sm rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-bad-lift hover:bg-bad/25 transition whitespace-nowrap disabled:opacity-40">
          {a.icon && <Icon name={a.icon} size={14} className="inline -mt-0.5 mr-1" />}{a.label}
        </button>
      ))}
      <button type="button" onClick={onExit} aria-label={t('Zrušit výběr')} title={t('Zrušit výběr')}
        className="rounded-full w-7 h-7 flex items-center justify-center text-white/60 hover:text-white transition">
        <Icon name="close" size={15} />
      </button>
    </PlovouciLista>
  );
}

/**
 * Pruh nad mřížkou karet: „N čeká na schválení · Schválit vše".
 *
 * Kde je fronta seznamem řádků, dává smysl výběr (`BulkBar`). Kde je to
 * mřížka karet — návody, postupy, uzávěrky — je zaškrtávátko na kartě
 * nemotorné a ve skutečnosti se stejně schvaluje všechno naráz. Tohle je
 * to jedno kliknutí, s potvrzením, protože zpět už to nejde.
 */
export function ApproveAllBar({ count, noun, onApproveAll, busy, note }: {
  count: number;
  /**
   * Skloňování po číslovce — čeština má tři tvary. „3 návody čekají",
   * ale „5 návodů čeká"; jediný pevný tvar by jednu z těch vět zkazil.
   */
  noun: CzNoun;
  onApproveAll: () => void;
  busy?: boolean;
  note?: React.ReactNode;
}) {
  const t = useT('spolecne');
  const { jazyk } = useJazyk();
  if (count < 2) return null;
  return (
    <div className="note note-wait flex flex-wrap items-center gap-3">
      <Icon name="inbox" size={17} className="shrink-0" />
      <span className="min-w-0 flex-1 text-sm font-medium">
        {jazyk === 'cs'
          ? <>{czCount(count, noun)} {czVerb(count, 'čeká', 'čekají')} na schválení.</>
          : t('{n, plural, one {# položka čeká na schválení.} few {# položky čekají na schválení.} other {# položek čeká na schválení.}}', { n: count })}
      </span>
      {note && <span className="text-xs font-medium text-bad-ink">{note}</span>}
      <button type="button" onClick={onApproveAll} disabled={busy}
        className="tap-target-sm btn btn-primary btn-sm disabled:opacity-50 whitespace-nowrap">
        {busy ? t('Schvaluji…') : t('Schválit vše ({n})', { n: count })}
      </button>
    </div>
  );
}

/** Zaškrtávátko do řádku — jedna podoba pro všechny seznamy s výběrem. */
export function SelectBox({ checked, onChange, label }: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button type="button" onClick={onChange} role="checkbox" aria-checked={checked} aria-label={label}
      className={`tap-target-sm shrink-0 h-6 w-6 rounded-lg border grid place-items-center transition ${
        checked ? 'bg-[#16181A] border-[#16181A] text-[#C8F542]' : 'border-black/20 bg-white/60 text-transparent'
      }`}>
      <Icon name="check" size={14} strokeWidth={3} />
    </button>
  );
}

export default BulkBar;
