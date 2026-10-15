'use client';

// „Přepočítat zpětně body“ (kolo 91): zaškrtávátko při uložení změny, okno s náhledem
// dopadu („Změní se 23 záznamů u 6 lidí, celkem −84 b“, kdo by šel do minusu) a historie
// přepočtů s „Vrátit přepočet“ u posledního. API: /api/body/prepocet.

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Modal, Skeleton, ErrorState, Toast } from '../ui';
import { Icon } from '../Icons';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { parseDbTime } from '@/lib/pragueTime';
import { apiMessage, okJson } from '@/lib/api';
import type { DruhBodu } from '@/lib/bodyRezim';
import { nazevDruhu } from './veta';

export const URL_PREPOCET = '/api/body/prepocet';
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

export type RozsahPrepoctu =
  | { typ: 'podnik'; druhy: DruhBodu[]; zpetneStrop: boolean }
  | { typ: 'postup' | 'ukol'; id: number };

export interface NahledPrepoctu {
  zaznamu: number; lidi: number; celkem: number;
  doMinusu: { uid: number; jmeno: string | null; pred: number; po: number }[];
  clenove: { uid: number; jmeno: string | null; pred: number; po: number }[];
}

export async function nactiNahled(rozsah: RozsahPrepoctu, pravidla: Record<string, unknown>): Promise<NahledPrepoctu> {
  const d = await fetch(URL_PREPOCET, { method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify({ rozsah, pravidla, nahled: true }) }).then(okJson);
  return d.nahled as NahledPrepoctu;
}

export async function provedPrepocet(rozsah: RozsahPrepoctu, pravidla: Record<string, unknown>): Promise<NahledPrepoctu> {
  const d = await fetch(URL_PREPOCET, { method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify({ rozsah, pravidla, nahled: false }) }).then(okJson);
  return d.nahled as NahledPrepoctu;
}

const znam = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** Zaškrtávátko „Přepočítat zpětně body“ pod formulářem (celý řádek je jedno zaškrtávací tlačítko). */
export function PrepocetZpetne({ checked, onChange, hint }: { checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const t = useT('sprava');
  return (
    <button type="button" role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)} data-prepocet-zpetne
      className="flex w-full min-h-[44px] items-start gap-3 py-1.5 text-left">
      <span aria-hidden className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg border transition-colors ${
        checked ? 'bg-[#16181A] border-[#16181A] text-[#C8F542]' : 'border-black/20 bg-white/60 text-transparent'}`}>
        <Icon name="check" size={14} strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[#16181A]">{t('Přepočítat zpětně body')}</span>
        <span className="block text-xs text-black/50 mt-0.5 text-pretty">
          {hint ?? t('Automatické body se nastaví podle téhle změny, jako by platila odjakživa. Ruční úpravy vedení zůstanou. Před uložením uvidíš dopad.')}
        </span>
      </span>
    </button>
  );
}

/** Věta souhrnu: „Změní se 23 záznamů u 6 lidí, celkem −84 b“ (v historii bez „změní se“). */
export function vetaDopadu(t: ReturnType<typeof useT>, n: Pick<NahledPrepoctu, 'zaznamu' | 'lidi' | 'celkem'>, probehlo = false): string {
  if (probehlo) {
    if (n.zaznamu === 0 && n.celkem === 0) return t('Body se nezměnily.');
    return t('{z, plural, one {# záznam} few {# záznamy} other {# záznamů}} u {l, plural, one {# člověka} few {# lidí} other {# lidí}}, celkem {c} b', { z: n.zaznamu, l: n.lidi, c: znam(n.celkem) });
  }
  if (n.zaznamu === 0 && n.celkem === 0) return t('Body se nezmění nikomu.');
  return t('Změní se {z, plural, one {# záznam} few {# záznamy} other {# záznamů}} u {l, plural, one {# člověka} few {# lidí} other {# lidí}}, celkem {c} b.', { z: n.zaznamu, l: n.lidi, c: znam(n.celkem) });
}

/** Okno s náhledem dopadu. `nahled` null = načítá se. */
export function OknoNahledu({ open, nahled, chyba, ukladam, onPotvrdit, onZrusit }: {
  open: boolean; nahled: NahledPrepoctu | null; chyba: string | null; ukladam: boolean;
  onPotvrdit: () => void; onZrusit: () => void;
}) {
  const t = useT('sprava');
  return (
    <Modal open={open} onClose={onZrusit} size="sm" nadOkny title={t('Přepočítat zpětně body')}
      subtitle={t('Takhle by se změnily zůstatky lidí.')}
      footer={<>
        <Button variant="secondary" onClick={onZrusit}>{t('Zrušit')}</Button>
        <Button variant="primary" onClick={onPotvrdit} loading={ukladam} disabled={!nahled}>{t('Přepočítat a uložit')}</Button>
      </>}>
      <div className="space-y-3" data-nahled-prepoctu>
        {chyba ? <p className="note note-danger text-sm" role="alert">{chyba}</p>
          : !nahled ? <div aria-busy className="space-y-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-16" /></div>
          : <>
            <p className="text-[15px] font-semibold text-[#16181A] text-pretty">{vetaDopadu(t, nahled)}</p>
            {nahled.doMinusu.length > 0 && (
              <div className="note note-danger text-sm" role="alert">
                <p className="font-semibold">{t('Zůstatek by klesl pod nulu:')}</p>
                <ul className="mt-1 space-y-0.5">
                  {nahled.doMinusu.map(d => <li key={d.uid} className="tabular-nums">{d.jmeno ?? `#${d.uid}`}: {d.pred} → {d.po} b</li>)}
                </ul>
              </div>
            )}
            {nahled.clenove.length > 0 && (
              <ul className="list" aria-label={t('Největší změny')}>
                {nahled.clenove.map(d => (
                  <li key={d.uid} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-[#16181A]">{d.jmeno ?? `#${d.uid}`}</span>
                    <span className="shrink-0 tabular-nums text-black/55">{d.pred} → <strong className={d.po < d.pred ? 'text-bad-ink' : 'text-ok-ink'}>{d.po}</strong> b</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="t-meta text-pretty">{t('Ruční úpravy vedení a body z hodnocení směny se nemění. Poslední přepočet jde vrátit v Nastavení bodů.')}</p>
          </>}
      </div>
    </Modal>
  );
}

interface ZaznamHistorie {
  id: number; kdo: string | null; kdy: string; rozsah: RozsahPrepoctu | null;
  souhrn: { zaznamu: number; lidi: number; celkem: number; doMinusu: number }; vraceno: string | null; lzeVratit: boolean;
}

/** Historie přepočtů podniku s „Vrátit přepočet“ u posledního. `obnov` se změní po novém přepočtu. */
export function HistoriePrepoctu({ obnov, onVraceno }: { obnov: number; onVraceno?: () => void }) {
  const t = useT('sprava');
  const { jazyk } = useJazyk();
  const [data, setData] = useState<ZaznamHistorie[] | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [vracim, setVracim] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const nacti = useCallback(() => {
    setChyba(null);
    fetch(URL_PREPOCET).then(okJson).then(d => setData(Array.isArray(d.historie) ? d.historie : []))
      .catch(e => setChyba(apiMessage(e, t('Historie přepočtů se nenačetla.'))));
  }, [t]);
  useEffect(() => { nacti(); }, [nacti, obnov]);
  const vratit = async (id: number) => {
    setVracim(id); setChyba(null);
    try {
      const d = await fetch(URL_PREPOCET, { method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify({ vratit: id }) }).then(okJson);
      setData(Array.isArray(d.historie) ? d.historie : []);
      setToast(t('Přepočet je vrácený.'));
      onVraceno?.();
    } catch (e) {
      setChyba(apiMessage(e, t('Přepočet se nepodařilo vrátit.')));
    } finally { setVracim(null); }
  };
  const coPrepocet = (r: RozsahPrepoctu | null): string => {
    if (!r) return '';
    if (r.typ !== 'podnik') return r.typ === 'postup' ? t('Postup') : t('Úkol');
    const casti = r.druhy.map(d => nazevDruhu(t, d));
    if (r.zpetneStrop || casti.length === 0) casti.push(t('denní strop'));
    return casti.join(', ');
  };
  if (data && data.length === 0 && !chyba) return null;
  return (
    <Card aria-labelledby="prepocty-titulek" data-historie-prepoctu>
      <h2 id="prepocty-titulek" className="t-card">{t('Přepočty bodů')}</h2>
      <p className="t-meta mt-1 text-pretty">{t('Každý přepočet zpětně se zapíše sem i do historie změn. Poslední jde vrátit — body i pravidlo se vrátí, jak byly.')}</p>
      {chyba && <div className="mt-3"><ErrorState compact title={chyba} onRetry={nacti} /></div>}
      {!data && !chyba && <div className="mt-3 space-y-2" aria-busy><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
      {data && data.length > 0 && (
        <ul className="list mt-2">
          {data.map(z => {
            const kdy = parseDbTime(z.kdy);
            return (
              <li key={z.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
                <span className="min-w-0 flex-1 basis-56">
                  <span className="block text-sm font-semibold text-[#16181A]">
                    {coPrepocet(z.rozsah)}{z.vraceno ? <span className="ml-2 chip chip-sm chip-muted">{t('vráceno')}</span> : null}
                  </span>
                  <span className="block text-xs text-black/50 mt-0.5 text-pretty">
                    {kdy ? fmtDatum(kdy, { jazyk, styl: 'kratce' }) : ''}{z.kdo ? ` · ${z.kdo}` : ''} · {vetaDopadu(t, z.souhrn, true)}
                  </span>
                </span>
                {z.lzeVratit && (
                  <Button variant="secondary" size="sm" icon="undo" loading={vracim === z.id} onClick={() => vratit(z.id)}>{t('Vrátit přepočet')}</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Card>
  );
}
