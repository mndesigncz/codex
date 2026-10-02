// Tvar formuláře kuponu a pomocné funkce pro Kupony (katalog, editor, náhled).
// Pravidla kontroly jsou ve sdílené lib/kuponyPole — editor volá tutéž kontrolu jako server.

import { apiMessage } from '@/lib/api';

export type FormKupon = {
  id: number | null; title: string; description: string; costPoints: number; active: boolean; draft: boolean;
  benefitKind: string; percentOff: string; amountOff: string; xyBuy: string; xyFree: string;
  minOrderValue: string; maxTotal: string; dailyLimit: string; targetTiers: string[]; targetGroups: number[];
  perCustomer: number; cooldownDays: number; daysOfWeek: number[]; hourFrom: string; hourTill: string;
  adultOnly: boolean; welcome: boolean; validSince: string; validUntil: string;
  /** Kupon vázaný na položku nabídky (id, nebo prázdné) a vyloučené položky a kategorie (připomínka pro hosta i obsluhu). */
  menuItemId: string;
  excludedItems: { itemId: number; name: string }[]; excludedSections: { sectionId: number; name: string }[];
  /** Kolik kusů je už vydáno (jen u existujícího kuponu; ukazuje se u limitu). */
  issued: number;
};

export const prazdnyKupon = (): FormKupon => ({
  id: null, title: '', description: '', costPoints: 100, active: true, draft: false,
  benefitKind: 'percent', percentOff: '', amountOff: '', xyBuy: '', xyFree: '1',
  minOrderValue: '', maxTotal: '', dailyLimit: '', targetTiers: [], targetGroups: [],
  perCustomer: 0, cooldownDays: 0, daysOfWeek: [], hourFrom: '', hourTill: '',
  adultOnly: false, welcome: false, validSince: '', validUntil: '', menuItemId: '', excludedItems: [], excludedSections: [], issued: 0,
});

export function kuponNaForm(c: any): FormKupon {
  return {
    id: c.id, title: c.title ?? '', description: c.description ?? '',
    costPoints: Number(c.costPoints) || 0, active: c.active !== false, draft: c.draft === true,
    benefitKind: c.benefitKind ?? 'text',
    percentOff: c.percentOff == null ? '' : String(c.percentOff),
    amountOff: c.amountOff == null ? '' : String(c.amountOff),
    xyBuy: c.xyBuy == null ? '' : String(c.xyBuy), xyFree: c.xyFree == null ? '1' : String(c.xyFree),
    minOrderValue: c.minOrderValue == null ? '' : String(c.minOrderValue),
    maxTotal: c.maxTotal == null ? '' : String(c.maxTotal), dailyLimit: c.dailyLimit == null ? '' : String(c.dailyLimit),
    targetTiers: c.targetTiers ?? [], targetGroups: c.targetGroups ?? [],
    perCustomer: Number(c.perCustomer) || 0, cooldownDays: Number(c.cooldownDays) || 0,
    daysOfWeek: c.daysOfWeek ?? [], hourFrom: c.hourFrom ?? '', hourTill: c.hourTill ?? '',
    adultOnly: c.adultOnly === true, welcome: c.welcome === true,
    validSince: c.validSince ? String(c.validSince).slice(0, 10) : '',
    validUntil: c.validUntil ? String(c.validUntil).slice(0, 10) : '',
    menuItemId: c.menuItemId == null ? '' : String(c.menuItemId),
    excludedItems: c.excludedItems ?? [], excludedSections: c.excludedSections ?? [],
    issued: Number(c.issued) || 0,
  };
}

/** Kopie kuponu: nový koncept bez uvítací role a bez vydaných kusů; kopii hosté neuvidí, dokud ji správce nezveřejní. */
export function duplikujKupon(c: any): FormKupon {
  return { ...kuponNaForm(c), id: null, title: `${String(c.title ?? '')} (kopie)`.slice(0, 80), draft: true, active: true, welcome: false, issued: 0 };
}

/** JSON požadavek; chybu serveru vyhodí jako Error s jeho větou. */
export async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, init ? { headers: { 'Content-Type': 'application/json' }, ...init } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Nepovedlo se.'), { data: d, status: r.status });
  return d;
}

export { apiMessage };

export const TIER_VOLBY: { id: string; label: string }[] = [
  { id: 'bronze', label: 'Člen' }, { id: 'silver', label: 'Stříbrný' },
  { id: 'gold', label: 'Zlatý' }, { id: 'platinum', label: 'Platinový' },
];
export const DNY_TYDNE = [{ d: 1, l: 'Po' }, { d: 2, l: 'Út' }, { d: 3, l: 'St' }, { d: 4, l: 'Čt' }, { d: 5, l: 'Pá' }, { d: 6, l: 'So' }, { d: 7, l: 'Ne' }];

/** Stažení souboru ze serveru (CSV): odkaz s `download`, ať se neotevírá nová karta. */
export function stahni(url: string) {
  const a = document.createElement('a');
  a.href = url; a.download = ''; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}
