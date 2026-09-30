'use client';

// Povinné před uzávěrkou — sdílené kousky pro obrazovky úkolů a návodů.
//
// Štítek „Před uzávěrkou" musí vypadat všude stejně (seznam vedení, můj den,
// tablet, týdenní tabule, návody), jinak si obsluha nespojí zámek ve formuláři
// uzávěrky s věcí, kterou má udělat. A každé místo, kde se úkol odškrtne nebo
// návod potvrdí, musí dát vědět otevřenému formuláři uzávěrky, aby se odemkl
// sám — bez toho by člověk úkol splnil a zámek by svítil dál až do obnovení.

import { Chip } from './ui';
import { useT } from '@/lib/i18n/client';
import { obnovDataWidgetu } from './widgety/useDataWidgetu';

/** Adresa zámku uzávěrky (app/api/closings/povinne/route.ts). */
export const URL_POVINNE_PRED_UZAVERKOU = '/api/closings/povinne';

/**
 * Událost na `window` po každé změně, která může zámek odemknout nebo zamknout.
 * Mezipaměť widgetů je podle přesné adresy — formulář, který se ptá s
 * `?date=&employeeId=…`, by holé obnovDataWidgetu minulo, událost ne.
 */
export const UDALOST_ZMENA_POVINNYCH = 'uzaverka:povinne-zmena';

/** Řekne otevřenému formuláři uzávěrky, ať se zeptá znovu. */
export function oznamZmenuPovinnych(): void {
  obnovDataWidgetu(URL_POVINNE_PRED_UZAVERKOU);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(UDALOST_ZMENA_POVINNYCH));
}

/** Štítek s zámkem u úkolu nebo návodu, bez kterého nejde odeslat uzávěrka. */
export function ChipPredUzaverkou({ className = '' }: { className?: string }) {
  const t = useT('rozvrh');
  return (
    <span title={t('Dokud to nebude hotové, uzávěrka dne zůstane zamčená.')} className={`inline-flex ${className}`}>
      <Chip tone="ink" size="sm" icon="lock">{t('Před uzávěrkou')}</Chip>
    </span>
  );
}
