'use client';

// Sazebník trestů (kolo 10, balík V) — část Tresty nástroje stránky Odměny. Typické
// prohřešky s body a krácením, ze kterých se v okně Dát trest vybírá jedním klepnutím.
// Seznam položek (název, −body, krácení, vypnuto), Nová položka / Upravit (okno
// DruhTrestuOkno), Smazat = archivace s potvrzením v okně (tresty, které na položku
// ukazují, si nesou její název). Bez tresty.sazebnik jen ke čtení (server položky
// pošle i tomu, kdo smí tresty udělovat). Vzor: components/navic-vedeni/SpravaNabidky.tsx.

import React, { useState } from 'react';
import { Icon } from '../Icons';
import {
  MAX_BODU, MAX_DELKA_NAZVU, MAX_DELKA_POZNAMKY, MAX_KRACENI, URL_DRUHY_TRESTU, validujDruh, type DruhTrestu,
} from '@/lib/tresty';
import { apiMessage, okJson } from '@/lib/api';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Menu, Modal, Skeleton, Switch, Textarea, Toast } from '../ui';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { obnovTresty, useSazebnik } from './data';
import { prelozHlaskuTrestu } from './hlasky';

/** „−10 b · krácení 200 Kč", nebo „napomenutí" — meta řádku položky. */
export function metaDruhu(t: PrekladFn, d: Pick<DruhTrestu, 'points' | 'bonusCut'>, money: (x: number) => string): string {
  const casti = [
    d.points ? t('−{n} b', { n: d.points }) : null,
    d.bonusCut ? t('krácení {castka}', { castka: money(d.bonusCut) }) : null,
  ].filter(Boolean);
  return casti.length ? casti.join(' · ') : t('napomenutí');
}

/** Okno položky sazebníku: Nová / Upravit. Validace stejná jako na serveru (validujDruh). */
export function DruhTrestuOkno({ polozka, onClose, onHotovo }: {
  polozka?: DruhTrestu | null;
  onClose: () => void;
  onHotovo?: (druh: DruhTrestu, nova: boolean) => void;
}) {
  const t = useT('widgety');
  const symbol = useSymbol();
  const nova = !polozka;
  const [nazev, setNazev] = useState(polozka?.title ?? '');
  const [popis, setPopis] = useState(polozka?.description ?? '');
  const [body, setBody] = useState(String(polozka?.points ?? 10));
  const [kraceni, setKraceni] = useState(polozka?.bonusCut ? String(polozka.bonusCut) : '');
  const [aktivni, setAktivni] = useState(polozka?.active ?? true);
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const uloz = async () => {
    if (ukladam) return;
    const telo = { title: nazev, description: popis.trim() || null, points: body === '' ? 0 : Number(body), bonusCut: kraceni === '' ? null : Number(kraceni), active: aktivni };
    const v = validujDruh(telo);
    if (!v.ok) { setChyba(prelozHlaskuTrestu(t, v.chyba)); return; }
    setUkladam(true); setChyba(null);
    try {
      const d = await fetch(URL_DRUHY_TRESTU, {
        method: nova ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(nova ? v.druh : { id: polozka!.id, ...v.druh }),
      }).then(okJson);
      obnovTresty();
      onHotovo?.((d?.type ?? { id: polozka?.id ?? 0, ...v.druh, createdAt: '' }) as DruhTrestu, nova);
      onClose();
    } catch (e) {
      setChyba(apiMessage(e, t('Položku se nepodařilo uložit.')));
    } finally {
      setUkladam(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="md" title={nova ? t('Nová položka sazebníku') : t('Upravit položku sazebníku')}
      subtitle={t('Typický prohřešek a co za něj — v okně Dát trest se vybere jedním klepnutím.')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
        <Button type="submit" form="druh-trestu" variant="primary" icon="check" loading={ukladam} disabled={!nazev.trim()}>{nova ? t('Přidat do sazebníku') : t('Uložit')}</Button>
      </>}>
      <form id="druh-trestu" className="space-y-3" data-druh-trestu-okno onSubmit={e => { e.preventDefault(); void uloz(); }}>
        <Field id="druh-nazev" label={t('Prohřešek')}>
          <Input id="druh-nazev" value={nazev} onChange={e => setNazev(e.target.value)} maxLength={MAX_DELKA_NAZVU} placeholder={t('Např. pozdní příchod')} autoFocus />
        </Field>
        <Field id="druh-popis" label={t('Popis (nepovinný)')} hint={t('Kdy se položka použije — třeba „víc než 10 minut po začátku směny".')}>
          <Textarea id="druh-popis" rows={2} value={popis} onChange={e => setPopis(e.target.value)} maxLength={MAX_DELKA_POZNAMKY} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="druh-body" label={t('Body dolů')} hint={t('0–{max}', { max: MAX_BODU })}>
            <Input id="druh-body" type="number" inputMode="numeric" min={0} max={MAX_BODU} step={1} value={body}
              onChange={e => setBody(e.target.value.replace(/\D/g, ''))} className="tabular-nums" />
          </Field>
          <Field id="druh-kraceni" label={t('Krácení prémie')} hint={t('Nepovinné; jen z prémie.')}>
            <div className="relative">
              <Input id="druh-kraceni" type="number" inputMode="numeric" min={0} max={MAX_KRACENI} step={1} value={kraceni}
                onChange={e => setKraceni(e.target.value.replace(/\D/g, ''))} className="tabular-nums pr-10" />
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">{symbol}</span>
            </div>
          </Field>
        </div>
        <ul className="list">
          <li className="flex items-center justify-between gap-3 py-3">
            <span className="min-w-0">
              <span id="druh-aktivni-n" className="block text-sm font-semibold text-[#16181A]">{t('Nabízet')}</span>
              <span className="block text-xs text-black/45 mt-0.5 text-pretty">{t('Vypnutá položka se v okně Dát trest nenabízí; tresty k ní zůstávají.')}</span>
            </span>
            <Switch checked={aktivni} onChange={setAktivni} labelledBy="druh-aktivni-n" />
          </li>
        </ul>
        {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
      </form>
    </Modal>
  );
}

export function SazebnikTrestu() {
  const t = useT('widgety');
  const money = useMoney();
  const data = useSazebnik(URL_DRUHY_TRESTU);
  const polozky = data.data?.druhy ?? [];
  const smi = data.data?.smiSpravovat === true;
  const [okno, setOkno] = useState<{ polozka: DruhTrestu | null } | null>(null);
  const [mazani, setMazani] = useState<DruhTrestu | null>(null);
  const [mazu, setMazu] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const smazat = async () => {
    if (!mazani || mazu) return;
    setMazu(true); setChyba(null);
    try {
      await fetch(`${URL_DRUHY_TRESTU}?id=${mazani.id}`, { method: 'DELETE' }).then(okJson);
      setToast(t('Položka „{nazev}" je ze sazebníku pryč.', { nazev: mazani.title }));
      setMazani(null);
      obnovTresty();
    } catch (e) {
      setChyba(apiMessage(e, t('Položku se nepodařilo smazat.')));
      setMazani(null);
    } finally {
      setMazu(false);
    }
  };

  return (
    <Card aria-labelledby="sazebnik-trestu-titulek" data-sazebnik-trestu>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="sazebnik-trestu-titulek" className="t-card flex items-center gap-2">
          <Icon name="clipboard" size={17} className="shrink-0 text-black/40" />
          {t('Sazebník trestů')}
        </h2>
        {smi && <Button variant="secondary" size="sm" icon="plus" onClick={() => setOkno({ polozka: null })}>{t('Nová položka')}</Button>}
      </div>
      <p className="t-meta mt-1 text-pretty">{t('Typické prohřešky s body a krácením prémie — v okně Dát trest se vyberou jedním klepnutím. Krátí se jen prémie, nikdy mzda.')}</p>
      {data.error ? (
        <ErrorState compact title={t('Sazebník se nenačetl')} onRetry={data.reload} detail={data.error} className="mt-3" />
      ) : data.loading ? (
        <div className="mt-4 space-y-2" aria-busy>{[0, 1].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : polozky.length === 0 ? (
        <EmptyState compact icon="clipboard" title={t('Sazebník je prázdný')}
          hint={smi ? t('Přidej první — třeba „Pozdní příchod · −10 b".') : t('Vedení zatím nic nevypsalo.')} className="mt-2" />
      ) : (
        <ul className="list mt-3">
          {polozky.map(d => (
            <ListRow key={d.id}
              lead={<span aria-hidden className="well grid h-9 w-9 shrink-0 place-items-center text-black/55"><Icon name="clipboard" size={16} /></span>}
              title={d.title}
              meta={metaDruhu(t, d, money)}
              detail={d.description ?? undefined}
              right={d.active ? undefined : <Chip tone="muted" size="sm">{t('Vypnuto')}</Chip>}
              akceVRadku
              actions={smi ? (
                <span className="!flex-none">
                  <Menu size="sm" label={t('Upravit nebo smazat položku {nazev}', { nazev: d.title })} items={[
                    { label: t('Upravit…'), icon: 'pencil', onClick: () => setOkno({ polozka: d }) },
                    { label: t('Smazat…'), icon: 'trash', danger: true, onClick: () => setMazani(d) },
                  ]} />
                </span>
              ) : undefined} />
          ))}
        </ul>
      )}
      {chyba && <p className="note note-danger mt-3" role="alert">{chyba}</p>}
      {okno && (
        <DruhTrestuOkno polozka={okno.polozka} onClose={() => setOkno(null)}
          onHotovo={(_d, nova) => setToast(nova ? t('Položka přidána do sazebníku.') : t('Položka upravena.'))} />
      )}
      {mazani && (
        <Modal open onClose={() => setMazani(null)} size="sm" title={t('Smazat položku „{nazev}"?', { nazev: mazani.title })}
          footer={<>
            <Button variant="secondary" onClick={() => setMazani(null)}>{t('Zrušit')}</Button>
            <Button variant="danger-solid" onClick={() => { void smazat(); }} loading={mazu}>{t('Smazat')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{t('Ze sazebníku zmizí; tresty, které na ni ukazují, zůstanou i s jejím názvem. Chceš ji jen dočasně schovat? Vypni „Nabízet".')}</p>
        </Modal>
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Card>
  );
}

export default SazebnikTrestu;
