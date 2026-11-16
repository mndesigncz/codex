'use client';

// Hromadný výběr lidí (kolo 96, sada V) — jeden pro okno „Dát trest" (kdo), pro záskok („kdo to
// napravil") i pro hromadnou odměnu v penězích. Data z GET /api/tresty/vyber (useVyberLidi):
// lidé podniku s rolí a pozicí, kdo byl ten den na směně a na uzávěrce.
//
// Skladba (DESIGN v4): rychlé volby jako díly v řadě („Celá směna 12. 11." / „Všichni na uzávěrce")
// a filtr role ½ + ½, pod nimi seznam lidí jako řádky voleb 44 (vybraný inkoustový, VolbaRadek),
// v posuvném boxu, ať dlouhý tým nevytlačí zbytek okna; dole „Vybráno: 3 · Zrušit výběr".
// Rychlá volba přidá celou skupinu, druhé klepnutí ji zase odebere (rychlaVolba).

import React, { useMemo, useState } from 'react';
import { useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { Avatar, Button, Select, Skeleton } from '../ui';
import { VolbaDil, VolbaRadek } from '../ui/Volby';
import type { VyberLidi as DataVyberu } from '../tresty-penize/data';
import { lideVyberu, prepniVyber, roleVyberu, rychlaVolba, stitekRole } from './penize';

export function VyberLidi({ data, loading, vybrani, onChange, den, closingId, krome = [], label, ariaLabel, id, bezRychlych = false }: {
  data: DataVyberu | null;
  loading?: boolean;
  vybrani: readonly number[];
  onChange: (ids: number[]) => void;
  /** Den směny (rychlá volba „Celá směna {den}"). */
  den: string;
  /** Uzávěrka (rychlá volba „Všichni na uzávěrce"). */
  closingId?: number | null;
  /** Koho nenabízet (u záskoku potrestaní — sám sobě nic nepřevádí). */
  krome?: readonly number[];
  label?: React.ReactNode;
  ariaLabel: string;
  /** Předpona id prvků (dva výběry v jednom okně). */
  id: string;
  /** Bez rychlých voleb směny a uzávěrky (hromadná odměna mimo den). */
  bezRychlych?: boolean;
}) {
  const t = useT('widgety');
  const [role, setRole] = useState('');
  const lide = useMemo(() => (data?.lide ?? []).filter(l => !krome.includes(l.id)), [data, krome]);
  const role_ = useMemo(() => roleVyberu(lide), [lide]);
  const videt = lideVyberu(lide, role);
  const platne = (ids: readonly number[]) => ids.filter(x => lide.some(l => l.id === x));
  const smena = platne(data?.smena ?? []);
  const uzaverka = platne(data?.uzaverka ?? []);
  const sRoli = role ? videt.map(l => l.id) : [];
  const vsichni = (skupina: readonly number[]) => skupina.length > 0 && skupina.every(x => vybrani.includes(x));
  const rychle = [
    !bezRychlych && smena.length > 0 ? { klic: 'smena', text: t('Celá směna {den}', { den: fmtDatum(den, { jazyk: t.jazyk, styl: 'denKratce' }) }), skupina: smena } : null,
    !bezRychlych && closingId && uzaverka.length > 0 ? { klic: 'uzaverka', text: t('Všichni na uzávěrce'), skupina: uzaverka } : null,
  ].filter((x): x is { klic: string; text: string; skupina: number[] } => !!x);

  return (
    <div className="min-w-0" data-vyber-lidi={id}>
      {label && <p className="field-label" id={`${id}-nadpis`}>{label}</p>}
      {loading && !data ? (
        <Skeleton className="h-24" />
      ) : (
        <div className="sloupec sloupec-2">
          {(rychle.length > 0 || role_.length > 1) && (
            <div className="grid grid-cols-2 gap-2" data-vyber-rychle>
              {rychle.map(r => (
                <VolbaDil key={r.klic} vybrano={vsichni(r.skupina)} onClick={() => onChange(rychlaVolba(vybrani, r.skupina))} data-rychla-volba={r.klic}>
                  {`${r.text} · ${r.skupina.length}`}
                </VolbaDil>
              ))}
              {role_.length > 1 && (
                <Select id={`${id}-role`} aria-label={t('Role nebo pozice')} value={role} onChange={e => setRole(e.target.value)}
                  className={`min-w-0 ${rychle.length % 2 === 0 ? 'col-span-2' : ''}`} data-transient="">
                  <option value="">{t('Všechny role')}</option>
                  {role_.map(r => <option key={r} value={r}>{r}</option>)}
                </Select>
              )}
            </div>
          )}
          {role && sRoli.length > 0 && (
            <Button variant="ghost" size="sm" className="tap-target self-start" onClick={() => onChange(rychlaVolba(vybrani, sRoli))}>
              {vsichni(sRoli) ? t('Odebrat všechny: {role}', { role }) : t('Vybrat všechny: {role}', { role })}
            </Button>
          )}
          {videt.length === 0 ? (
            <p className="t-meta">{t('Nikdo k výběru.')}</p>
          ) : (
            <div className="max-h-[18.5rem] overflow-y-auto overscroll-contain -mx-1 px-1 py-0.5 rounded-[var(--r-md)]">
              <div className="sloupec sloupec-2" role="group" aria-label={ariaLabel}>
                {videt.map(l => (
                  <VolbaRadek key={l.id} vyska="m" vybrano={vybrani.includes(l.id)} onClick={() => onChange(prepniVyber(vybrani, l.id))}
                    ikona={vybrani.includes(l.id) ? 'check' : undefined} data-clovek={l.id}
                    titul={<span className="flex min-w-0 items-center gap-2"><Avatar emoji={l.avatar} name={l.name} size="xs" /><span className="min-w-0 truncate">{l.name}</span></span>}
                    hodnota={stitekRole(l) ? <span className="text-xs font-normal opacity-70">{stitekRole(l)}</span> : undefined} />
                ))}
              </div>
            </div>
          )}
          <div className="flex min-h-[var(--h-s)] items-center justify-between gap-2">
            <span className="t-meta tabular-nums" aria-live="polite" data-vybrano={vybrani.length}>{t('Vybráno: {n}', { n: vybrani.length })}</span>
            {vybrani.length > 0 && (
              <Button variant="ghost" size="sm" className="tap-target" onClick={() => onChange([])}>{t('Zrušit výběr')}</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default VyberLidi;
