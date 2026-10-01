'use client';

// Widgety oblasti „Plánování" — komponenty (kolo 69, spec §2.5, §2.6 a §6.3).
//
// Vlastník: balík B6a (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/planovani.ts,
// počty a pořadí karet v lib/ukolyPrehled.ts; tady je jen kreslení. Klíč v KOMPONENTY =
// id widgetu a musí sedět se `stav: 'hotovo'` v katalogu (test AK-20), proto bez spreadu.
//
// Oba widgety čtou /api/planning — tutéž adresu jako tabule v nástroji stránky Plánování
// (sdílená mezipaměť): stránka se ptá jednou a karta schválená ve widgetu se hned přesune
// i na tabuli pod ním. Brána: widget se kreslí a ptá, až když `nacteno && planovani.zobrazit`;
// tlačítka přesunu jen s planovani.upravit (`akce:presunout`), jinak jde fronta jen číst —
// dřív tabule ukazovala ovládání i roli bez práva a klik skončil 403 (audit Plánování).

import { useState } from 'react';
import { Button, Chip, ListRow, Menu, Stat, StatRow } from '../../ui';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { Widget, type StavNacteni } from '../Widget';
import { useDataWidgetu } from '../useDataWidgetu';
import { useSmi } from '../NavigaceKontext';
import { useOpravneni } from '../../role/useOpravneni';
import { apiMessage, okJson } from '@/lib/api';
import { useT } from '@/lib/i18n/client';
import { vyberKarty, souhrnPlanu, kartySloupce, type KartaPlanu } from '@/lib/ukolyPrehled';

/** Tutéž adresu čte tabule Plánování (PlanningBoard) — jeden dotaz na stránku. */
export const URL_PLANOVANI = '/api/planning';

const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };
const cislo = (n: number) => n.toLocaleString('cs-CZ');

/** Brána widgetu po načtení oprávnění (viz oblasti/receptury.tsx — stejný důvod). */
function useBrana(id: string): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  const o = widget(id)?.opravneni ?? { vse: ['planovani.zobrazit'], nektere: [] };
  if (!nacteno) return { ok: chyba, ceka: !chyba };
  const ok = o.vse.every(k => ma(k)) && (o.nektere.length === 0 || o.nektere.some(k => ma(k)));
  return { ok, ceka: false };
}

// ---------------------------------------------------------------------------
// Plánovací nástěnka (souhrn)
// ---------------------------------------------------------------------------

function Souhrn({ velikost }: WidgetProps) {
  const t = useT('widgety');
  const { ok, ceka } = useBrana('planovani.souhrn');
  const data = useDataWidgetu<KartaPlanu[]>(ok ? URL_PLANOVANI : null, vyberKarty);
  const k = data.data ? souhrnPlanu(data.data) : null;
  const S = velikost === 'S';

  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      kostra={S ? 'cislo' : 'text'}
      odkaz={S ? undefined : { popisek: t('Plánování'), pohled: 'planning' }}
      prazdno={data.data && data.data.length === 0 ? <p className="t-meta">{t('Tabule je zatím prázdná.')}</p> : undefined}
    >
      {k && (S ? (
        // Malý: co se hýbe — rozpracované a to, co čeká na rozhodnutí.
        <Stat label={t('Rozpracováno')} value={cislo(k.in_progress)}
          note={k.review > 0 ? <span className="text-wait-ink">{t('{n} ke schválení', { n: cislo(k.review) })}</span> : t('nic ke schválení')} />
      ) : (
        <StatRow>
          <Stat label={t('Nápady')} value={cislo(k.ideas)} />
          <Stat label={t('Rozpracováno')} value={cislo(k.in_progress)} />
          <Stat label={t('Ke schválení')} value={cislo(k.review)} note={k.review > 0 ? <span className="text-wait-ink">{t('čeká')}</span> : undefined} />
          <Stat label={t('Hotovo')} value={cislo(k.done)} />
        </StatRow>
      ))}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Karty ke schválení
// ---------------------------------------------------------------------------

function KeSchvaleni({ nahled }: WidgetProps) {
  const t = useT('widgety');
  const smi = useSmi();
  const def = widget('planovani.ke_schvaleni');
  const { ok, ceka } = useBrana('planovani.ke_schvaleni');
  const data = useDataWidgetu<KartaPlanu[]>(ok ? URL_PLANOVANI : null, vyberKarty);
  const fronta = data.data ? kartySloupce(data.data, 'review') : [];
  const smiPresun = !nahled && smi(def?.opravneni.pole?.['akce:presunout'] ?? 'planovani.upravit');
  const [probiha, setProbiha] = useState<number | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);

  /** Schválit = do Hotovo, Vrátit = zpět do Rozpracováno; karta jde na konec cílového sloupce. */
  const presun = async (c: KartaPlanu, sloupec: 'done' | 'in_progress') => {
    if (probiha != null) return;
    setChyba(null);
    setProbiha(c.id);
    const pozice = kartySloupce(data.data ?? [], sloupec).length;
    data.set(prev => (prev ?? []).map(x => (x.id === c.id ? { ...x, column: sloupec, position: pozice } : x)));
    try {
      await fetch(`${URL_PLANOVANI}/${c.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ column: sloupec, position: pozice }),
      }).then(okJson);
      data.reload();
    } catch (e) {
      data.set(prev => (prev ?? []).map(x => (x.id === c.id ? c : x)));
      setChyba(apiMessage(e, t('Kartu se nepodařilo přesunout.')));
    } finally {
      setProbiha(null);
    }
  };

  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      kostra="seznam"
      doplnek={fronta.length > 0 ? <Chip tone="wait" size="sm">{cislo(fronta.length)}</Chip> : undefined}
      odkaz={{ popisek: t('Plánování'), pohled: 'planning' }}
      prazdno={data.data && fronta.length === 0 ? <p className="t-meta">{t('Nic nečeká na schválení.')}</p> : undefined}
    >
      <ul className="list">
        {fronta.slice(0, 5).map(c => (
          <ListRow key={c.id} title={c.title} meta={c.description ?? undefined}
            actions={smiPresun ? (
              // Jedna tichá akce v řádku a Vrátit v menu (DP §5.1): pět inkoustových pilulek pod sebou
              // tahalo oko víc než limetka v hlavičce a na telefonu byly přes celou šířku řádku.
              // Obal drží obě ovládání u pravého okraje i tam, kde .list-actions natahuje první dítě.
              <span className="flex items-center justify-end gap-1">
                <Button variant="ghost" size="sm" icon="check" loading={probiha === c.id} disabled={probiha != null && probiha !== c.id}
                  onClick={() => presun(c, 'done')} aria-label={t('Schválit kartu {nazev}', { nazev: c.title })}>{t('Schválit')}</Button>
                <Menu size="sm" label={t('Další akce s kartou {nazev}', { nazev: c.title })} items={[
                  { label: t('Vrátit do Rozpracováno'), icon: 'undo', disabled: probiha != null, onClick: () => presun(c, 'in_progress') },
                ]} />
              </span>
            ) : undefined} />
        ))}
      </ul>
      {fronta.length > 5 && <p className="t-meta mt-2">{t('…a {n, plural, one {# další karta} few {# další karty} other {# dalších karet}}', { n: fronta.length - 5 })}</p>}
      {chyba && <p className="note note-danger mt-3" role="alert">{chyba}</p>}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'planovani.souhrn': Souhrn,
  'planovani.ke_schvaleni': KeSchvaleni,
};
