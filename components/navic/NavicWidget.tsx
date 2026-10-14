'use client';

// Widget „Navíc" (moje-smeny.navic, kolo 9 N1 — balík Z): vlastní zápisy toho, co člověk
// udělal nad rámec směny, uznané body a nabídka vedení „Co se dá udělat navíc".
//
//  - S: uznané body za měsíc, chip „2 čekají", akce „Zapsat navíc";
//  - M: poslední zápisy (text, den, chip stavu, odměna), pilulky nabídky (klepnutí
//    otevře okno s předvolbou) a tlačítko;
//  - L: celý seznam s filtrem Vše / Čeká / Uznané; měsíc přepíná rychlý filtr v hlavičce
//    (`obdobi` z katalogu). Odmítnuté nesou důvod, vlastní čekající zápis jde upravit
//    a smazat (menu „···").
// Data: GET /api/navic (vlastní, 60 dní) nebo ?month= pro minulý měsíc; jedna odpověď
// pro widget i okno (useDataNavic). Metadata v lib/widgety/katalog/moje-smeny.ts,
// registrace v components/widgety/oblasti/moje-smeny.tsx (KOMPONENTY).

import { useMemo, useState } from 'react';
import { Button, Chip, EmptyState, ListRow, Menu, Modal, Segmented, Stat, Toast } from '../ui';
import { Widget } from '../widgety/Widget';
import { useNavigace, useSmi } from '../widgety/NavigaceKontext';
import { useMoney } from '../CurrencyProvider';
import type { WidgetProps } from '@/lib/widgety/typy';
import { useJazyk, useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum, fmtMesic } from '@/lib/i18n/format';
import { pragueToday } from '@/lib/pragueTime';
import { apiMessage, okJson } from '@/lib/api';
import { minulyMesic } from '@/lib/odmenyPrehled';
import { URL_NAVIC, seradNavic, souhrnNavic, zapisyDne, type NabidkaNavic, type Navic, type StavNavic } from '@/lib/navic';
import { NabidkaChipy, StavChip, odmena } from './NabidkaChipy';
import { obnovNavic, urlNavicMine, useDataNavic, useUkolyZaBody } from './data';
import { ARG_ZA_BODY, obsazeneNabidky, urlUkolyZaBody } from './logika';
import { ZapsatNavic, type PredvolbyNavic } from './ZapsatNavic';

type Filtr = StavNavic | 'vse';

export function NavicWidget({ velikost, nastaveni, nahled, instance }: WidgetProps<{ obdobi?: 'tento' | 'minuly' }>) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const money = useMoney();
  const smi = useSmi();
  const dnes = pragueToday();
  const vcera = pragueToday(-1);
  const tentoMesic = dnes.slice(0, 7);
  const minuly = nastaveni.obdobi === 'minuly';
  const mesic = minuly ? minulyMesic(tentoMesic) : tentoMesic;
  // Tento měsíc z výchozí odpovědi (60 dní — nese i dnešní zápisy kvůli limitu nabídky), minulý vlastní adresou.
  const data = useDataNavic(minuly ? urlNavicMine(null, mesic) : urlNavicMine());
  const vse = data.data?.items ?? [];
  const items = useMemo(() => seradNavic(vse.filter(z => z.day.startsWith(mesic))), [vse, mesic]);
  const souhrn = useMemo(() => souhrnNavic(items), [items]);
  const ceka = useMemo(() => souhrnNavic(vse).ceka, [vse]);
  const nabidka = data.data?.nabidka ?? [];
  const dnesni = useMemo(() => zapisyDne(vse, dnes), [vse, dnes]);
  const smiZapsat = !nahled && smi('navic.zapsat') && data.data?.smi.zapsat !== false;
  const nav = useNavigace();
  // Kolo 11: plné úkoly za body (kapacita) se v pilulkách vypnou s „Obsazeno"; adresa sdílená s widgetem Úkoly za body.
  const ukoly = useUkolyZaBody(smiZapsat && velikost !== 'S' ? urlUkolyZaBody() : null);
  const obsazene = useMemo(() => obsazeneNabidky(ukoly.data ?? []), [ukoly.data]);
  // „Úkoly za body ›" vede do Úkolů na sekci Za body navíc (arg za-body) — tam se úkoly berou a plní.
  const kUkolum = smiZapsat && nav.smiPohled('tasks');
  const [okno, setOkno] = useState<{ predvolby?: PredvolbyNavic; upravit?: Navic } | null>(null);
  const [mazani, setMazani] = useState<Navic | null>(null);
  const [mazu, setMazu] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad'; id: number } | null>(null);
  const [filtr, setFiltr] = useState<Filtr>('vse');
  const nazevMesice = fmtMesic(mesic, { jazyk });

  const denKratce = (d: string) => (d === dnes ? t('Dnes') : d === vcera ? t('Včera') : fmtDatum(d, { jazyk, styl: 'denKratce' }));
  const otevri = (predvolby?: PredvolbyNavic) => setOkno({ predvolby });
  const zNabidky = (n: NabidkaNavic) => otevri({ offerId: n.id, text: n.title });

  const smazat = async () => {
    if (!mazani || mazu) return;
    setMazu(true);
    try {
      await fetch(`${URL_NAVIC}/${mazani.id}`, { method: 'DELETE' }).then(okJson);
      setToast({ text: t('Zápis smazaný.'), tone: 'ok', id: Date.now() });
      obnovNavic();
      setMazani(null);
    } catch (e) {
      setToast({ text: apiMessage(e, t('Zápis se nepodařilo smazat.')), tone: 'bad', id: Date.now() });
    }
    setMazu(false);
  };

  const tlacitko = (size: 'sm' | 'md' = 'sm') => smiZapsat ? (
    <Button variant="secondary" size={size} icon="plus" onClick={() => otevri()} data-zapsat-navic-tlacitko>{t('Zapsat navíc')}</Button>
  ) : null;

  const radek = (z: Navic) => (
    <ListRow key={z.id} akceVRadku
      title={<span className="block whitespace-normal text-pretty">{z.text}</span>}
      meta={<>
        <span className="cz-sentence">{denKratce(z.day)}</span>
        {z.offerTitle && <> · {t('z nabídky: {nazev}', { nazev: z.offerTitle })}</>}
        {z.reportedByName && <> · {t('zapsal(a) {jmeno}', { jmeno: z.reportedByName })}</>}
      </>}
      detail={z.status === 'odmitnuto' ? (z.decisionNote ? t('Důvod: {duvod}', { duvod: z.decisionNote }) : t('Bez udaného důvodu.'))
        : z.status === 'uznano' && z.decisionNote ? z.decisionNote : undefined}
      right={<StavChip stav={z.status} />}
      value={z.status === 'uznano' ? <span className={z.points || z.bonusCzk ? 'text-ok-ink' : undefined}>{odmena(t, z, money)}</span> : undefined}
      actions={smiZapsat && z.status === 'ceka' ? (
        <Menu size="sm" label={t('Další akce: {text}', { text: z.text.slice(0, 40) })} items={[
          { label: t('Upravit'), icon: 'pencil', onClick: () => setOkno({ upravit: z }) },
          { label: t('Smazat'), icon: 'trash', danger: true, onClick: () => setMazani(z) },
        ]} />
      ) : undefined} />
  );

  const prazdnoText = minuly ? t('V tomhle měsíci nic navíc zapsané nemáš.') : t('Zatím nic navíc. Co uděláš nad rámec směny, zapiš — vedení to uvidí a může to ocenit.');
  const okna = (
    <>
      <ZapsatNavic open={okno != null} onClose={() => setOkno(null)} predvolby={okno?.predvolby} upravit={okno?.upravit ?? null} />
      {mazani && (
        <Modal open onClose={() => setMazani(null)} size="sm" title={t('Smazat zápis?')} subtitle={mazani.text}
          footer={<>
            <Button variant="secondary" onClick={() => setMazani(null)}>{t('Zrušit')}</Button>
            <Button variant="danger-solid" icon="trash" loading={mazu} onClick={() => void smazat()}>{t('Smazat')}</Button>
          </>}>
          <p className="t-meta text-pretty">{t('Zápis, který ještě nikdo neuznal, zmizí bez náhrady.')}</p>
        </Modal>
      )}
      <Toast message={toast?.text ?? null} tone={toast?.tone} id={toast?.id} onClose={() => setToast(null)} />
    </>
  );

  if (velikost === 'S') {
    return (
      <>
        <Widget nacteni={data} kostra="cislo">
          <Stat label={<span className="cz-sentence">{nazevMesice}</span>} value={String(souhrn.body)} unit={t('b')}
            note={ceka > 0 ? <Chip tone="wait" size="sm">{t('{n, plural, one {# čeká} few {# čekají} other {# čeká}}', { n: ceka })}</Chip>
              : souhrn.uznano > 0 ? t('{n, plural, one {# uznaný zápis} few {# uznané zápisy} other {# uznaných zápisů}}', { n: souhrn.uznano }) : t('zatím nic navíc')} />
          {smiZapsat && <div className="mt-2">{tlacitko('sm')}</div>}
        </Widget>
        {okna}
      </>
    );
  }

  const L = velikost === 'L';
  const videt = L ? items.filter(z => filtr === 'vse' || z.status === filtr) : items.slice(0, 3);
  const pocty = { ceka: items.filter(z => z.status === 'ceka').length, uznano: items.filter(z => z.status === 'uznano').length };
  // Pilulky a „Zapsat navíc" NAD seznamem: střední karta se nad 300 px zkracuje pod „Zobrazit vše"
  // a akce dole by zmizela pod odleskem — hlavní věc widgetu je zapsat, starší zápisy se smí schovat.
  const akce = smiZapsat ? (
    <div className="space-y-2" data-navic-akce>
      {nabidka.length > 0 && <NabidkaChipy nabidka={nabidka} dnesniZapisy={dnesni} onVyber={zNabidky} money={money} obsazene={obsazene} label={t('Co se dá udělat navíc')} pas={!L} />}
      <div className="flex flex-wrap items-center gap-2">
        {tlacitko('sm')}
        {kUkolum && (
          <Button variant="ghost" size="sm" iconAfter="chevronRight" onClick={() => nav.onNavigate('tasks', ARG_ZA_BODY)} data-navic-za-body>{t('Úkoly za body')}</Button>
        )}
      </div>
    </div>
  ) : null;

  return (
    <>
      <Widget nacteni={data}
        // Chip „2 čekají" jen ve velké kartě: střední má v hlavičce i šipku, Zvětšit a Sbalit a na 320 px v polštině
        // se vedle chipu lámal i šestipísmenný název („Ek / s…"); řádky v těle stav nesou samy.
        doplnek={L && ceka > 0 ? <Chip tone="wait" size="sm">{t('{n, plural, one {# čeká} few {# čekají} other {# čeká}}', { n: ceka })}</Chip> : undefined}
        prazdno={data.data && items.length === 0 && nabidka.length === 0 ? (
          <EmptyState compact illustration="odmeny" title={minuly ? t('Nic navíc') : t('Zatím nic navíc')} hint={prazdnoText} action={tlacitko('md')} />
        ) : undefined}>
        <div className="space-y-3" data-navic-widget={velikost}>
          {L && <StatRadek t={t} body={souhrn.body} premie={souhrn.premie} money={money} uznano={souhrn.uznano} mesic={nazevMesice} />}
          {akce}
          {L && items.length > 0 && (
            <Segmented size="sm" ariaLabel={t('Stav')} value={filtr} onChange={setFiltr}
              options={[{ id: 'vse', label: t('Vše') }, { id: 'ceka', label: t('Čeká'), count: pocty.ceka }, { id: 'uznano', label: t('Uznané'), count: pocty.uznano }]} />
          )}
          {videt.length > 0 ? (
            <ul className="list" data-navic-seznam>{videt.map(radek)}</ul>
          ) : items.length > 0 ? (
            <p className="t-meta">{t('Žádný zápis v tomhle stavu.')}</p>
          ) : (
            <p className="t-meta text-pretty">{prazdnoText}</p>
          )}
          {!L && items.length > videt.length && <p className="t-meta">{t('…a {n, plural, one {# další} few {# další} other {# dalších}}', { n: items.length - videt.length })}</p>}
        </div>
      </Widget>
      {okna}
    </>
  );
}

/** Souhrn měsíce ve velké kartě: „Říjen: 3 uznáno · 60 b · 300 Kč". */
function StatRadek({ t, body, premie, money, uznano, mesic }: { t: PrekladFn; body: number; premie: number; money: (n: number) => string; uznano: number; mesic: string }) {
  const casti = [t('{n} uznáno', { n: uznano }), `${body} b`];
  if (premie > 0) casti.push(money(premie));
  return <p className="t-meta tabular-nums" data-navic-souhrn><span className="cz-sentence">{mesic}</span>: {casti.join(' · ')}</p>;
}

export default NavicWidget;
