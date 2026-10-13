'use client';

// Správa nabídky „Co se dá udělat navíc" (kolo 9, balík V) — část Navíc nástroje
// stránky Odměny. Seznam položek (body, prémie, uznává se samo, platnost, limit,
// vypnuto), Nová položka / Upravit (NabidkaNavicOkno), Smazat = archivace
// s potvrzením v okně. Bez navic.nabidka jen ke čtení (server položky pošle
// i tomu, kdo smí navíc zapisovat nebo vidět tým).

import React, { useState } from 'react';
import { Icon } from '../Icons';
import { URL_NABIDKA_NAVIC, type NabidkaNavic } from '@/lib/navic';
import { apiMessage, okJson } from '@/lib/api';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { pragueToday } from '@/lib/pragueTime';
import { Button, Card, Chip, EmptyState, ErrorState, ListRow, Menu, Modal, Skeleton, Toast } from '../ui';
import { useMoney } from '../CurrencyProvider';
import { obnovNavic, useNabidkaNavic } from './data';
import { stavNabidky } from './logika';
import { NabidkaNavicOkno } from './NabidkaNavicOkno';

/** „20 b · 300 Kč · uznává se samo · nejvýš 1× za den" — meta řádku položky. */
export function metaNabidky(t: PrekladFn, n: NabidkaNavic, money: (x: number) => string): string {
  return [
    t('{n, plural, one {# bod} few {# body} other {# bodů}}', { n: n.points }),
    n.bonusCzk ? money(n.bonusCzk) : null,
    n.autoApprove ? t('uznává se samo') : null,
    n.maxPerDay ? t('nejvýš {n}× za den', { n: n.maxPerDay }) : null,
  ].filter(Boolean).join(' · ');
}

export function SpravaNabidky() {
  const t = useT('widgety');
  const money = useMoney();
  const data = useNabidkaNavic(URL_NABIDKA_NAVIC);
  const dnes = pragueToday();
  const polozky = data.data?.nabidka ?? [];
  const smi = data.data?.smiSpravovat === true;
  const [okno, setOkno] = useState<{ polozka: NabidkaNavic | null } | null>(null);
  const [mazani, setMazani] = useState<NabidkaNavic | null>(null);
  const [mazu, setMazu] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const smazat = async () => {
    if (!mazani || mazu) return;
    setMazu(true); setChyba(null);
    try {
      await fetch(`${URL_NABIDKA_NAVIC}?id=${mazani.id}`, { method: 'DELETE' }).then(okJson);
      setToast(t('Položka „{nazev}" je z nabídky pryč.', { nazev: mazani.title }));
      setMazani(null);
      obnovNavic();
    } catch (e) {
      setChyba(apiMessage(e, t('Položku se nepodařilo smazat.')));
      setMazani(null);
    } finally {
      setMazu(false);
    }
  };
  const platnost = (n: NabidkaNavic) => {
    const od = n.validFrom ? fmtDatum(n.validFrom, { jazyk: t.jazyk, styl: 'kratce' }) : null;
    const doD = n.validTo ? fmtDatum(n.validTo, { jazyk: t.jazyk, styl: 'kratce' }) : null;
    if (od && doD) return t('{od}–{do}', { od, do: doD });
    if (od) return t('od {od}', { od });
    if (doD) return t('do {do}', { do: doD });
    return null;
  };
  const chipStavu = (n: NabidkaNavic) => {
    const s = stavNabidky(n, dnes);
    if (s === 'vypnuta') return <Chip tone="muted" size="sm">{t('Vypnuto')}</Chip>;
    if (s === 'prosla') return <Chip tone="bad" size="sm">{t('Prošlá')}</Chip>;
    if (s === 'zacne') return <Chip tone="wait" size="sm">{t('Začne {den}', { den: fmtDatum(n.validFrom!, { jazyk: t.jazyk, styl: 'kratce' }) })}</Chip>;
    return null;
  };

  return (
    <Card aria-labelledby="nabidka-navic-titulek" data-sprava-nabidky>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="nabidka-navic-titulek" className="t-card flex items-center gap-2">
          <Icon name="star" size={17} className="shrink-0 text-black/40" />
          {t('Co se dá udělat navíc')}
        </h2>
        {smi && <Button variant="secondary" size="sm" icon="plus" onClick={() => setOkno({ polozka: null })}>{t('Nová položka')}</Button>}
      </div>
      <p className="t-meta mt-1 text-pretty">{t('Nabídka s body, kterou lidé vidí při zápisu navíc — vyberou si jedním klepnutím. Položka s „uznat automaticky" body připíše hned.')}</p>
      {data.error ? (
        <ErrorState compact title={t('Nabídka se nenačetla')} onRetry={data.reload} detail={data.error} className="mt-3" />
      ) : data.loading ? (
        <div className="mt-4 space-y-2" aria-busy>{[0, 1].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : polozky.length === 0 ? (
        <EmptyState compact icon="star" title={t('Zatím žádná položka')}
          hint={smi ? t('Přidej první — třeba „Vytřít sklad · 20 b".') : t('Vedení zatím nic nevypsalo.')} className="mt-2" />
      ) : (
        <ul className="list mt-3">
          {polozky.map(n => (
            <ListRow key={n.id}
              lead={<span aria-hidden className="well grid h-9 w-9 shrink-0 place-items-center text-black/55"><Icon name="star" size={16} /></span>}
              title={n.title}
              meta={[metaNabidky(t, n, money), platnost(n)].filter(Boolean).join(' · ')}
              detail={n.description ?? undefined}
              right={chipStavu(n) ?? undefined}
              // `!flex-none`: na telefonu `.list-actions:only-child > :first-child` natáhne první prvek ocasu přes
              // řádek a „···" by stálo vlevo pod textem; takhle drží vpravo (jako Switch v Katalogu odměn).
              actions={smi ? (
                <span className="!flex-none">
                  <Menu size="sm" label={t('Upravit nebo smazat položku {nazev}', { nazev: n.title })} items={[
                    { label: t('Upravit…'), icon: 'pencil', onClick: () => setOkno({ polozka: n }) },
                    { label: t('Smazat…'), icon: 'trash', danger: true, onClick: () => setMazani(n) },
                  ]} />
                </span>
              ) : undefined} />
          ))}
        </ul>
      )}
      {chyba && <p className="note note-danger mt-3" role="alert">{chyba}</p>}
      {okno && (
        <NabidkaNavicOkno polozka={okno.polozka} onClose={() => setOkno(null)}
          onHotovo={(_o, nova) => setToast(nova ? t('Položka přidána do nabídky.') : t('Položka upravena.'))} />
      )}
      {mazani && (
        <Modal open onClose={() => setMazani(null)} size="sm" title={t('Smazat položku „{nazev}"?', { nazev: mazani.title })}
          footer={<>
            <Button variant="secondary" onClick={() => setMazani(null)}>{t('Zrušit')}</Button>
            <Button variant="danger-solid" onClick={() => { void smazat(); }} loading={mazu}>{t('Smazat')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{t('Z nabídky zmizí; zápisy, které na ni ukazují, zůstanou i s jejím názvem. Chceš ji jen dočasně schovat? Vypni „Nabízet".')}</p>
        </Modal>
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Card>
  );
}

export default SpravaNabidky;
