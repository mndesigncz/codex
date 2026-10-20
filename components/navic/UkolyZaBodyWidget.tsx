'use client';

// Widget „Úkoly za body" (ukoly.za_body, kolo 11 — balík Z): volitelné úkoly, které si člověk
// může dnes vzít za extra body. Na Domů u Nejbližší směny (pod Navíc), na tabletu (Směna) pro toho,
// kdo u tabletu stojí; vedení vidí své vlastní.
//
//  - S: „3 úkoly za body · až +60 b" a první volný s „Beru si" (bez kapacity „Hotovo");
//  - M: seznam (nejvýš 3, bez popisů — bez „Zobrazit vše", akce jsou vidět) — UkolyZaBody;
//  - L: všechny + „Zapsat navíc" (vlastní věc mimo nabídku).
// Data: GET /api/navic/ukoly (useUkolyZaBody — tatáž adresa jako sekce v Úkolech a odznak
// v navigaci). Metadata v lib/widgety/katalog/ukoly.ts, registrace v
// components/widgety/oblasti/ukoly.tsx (KOMPONENTY).

import { useMemo, useState } from 'react';
import { Button, Chip, EmptyState } from '../ui';
import { Widget } from '../widgety/Widget';
import { useSmi } from '../widgety/NavigaceKontext';
import { useOpravneni } from '../role/useOpravneni';
import { useMoney } from '../CurrencyProvider';
import type { WidgetProps } from '@/lib/widgety/typy';
import { useT } from '@/lib/i18n/client';
import { useUkolyZaBody } from './data';
import { ARG_ZA_BODY, akceUkolu, odmenaKratce, souhrnZaBody, urlUkolyZaBody } from './logika';
import { useOsobaTabletu } from './osobaTabletu';
import { UkolyZaBody } from './UkolyZaBody';
import { ZapsatNavic } from './ZapsatNavic';

export function UkolyZaBodyWidget({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const smi = useSmi();
  const money = useMoney();
  const { role } = useOpravneni();
  const naTabletu = role?.typ === 'kiosk';
  const { osoba, vyzadej } = useOsobaTabletu();
  // Tablet: úkoly toho, kdo u tabletu stojí — bez vybraného člověka se neptá (zapsalo by se to tabletu).
  const actingAs = naTabletu ? osoba?.id ?? null : null;
  const smiZapsat = smi('navic.zapsat');
  const url = smiZapsat && (!naTabletu || actingAs != null) ? urlUkolyZaBody(actingAs) : null;
  const data = useUkolyZaBody(url);
  const ukoly = useMemo(() => data.data ?? [], [data.data]);
  const souhrn = useMemo(() => souhrnZaBody(ukoly), [ukoly]);
  const [zapsat, setZapsat] = useState(false);
  const S = velikost === 'S';
  const L = velikost === 'L';
  const odkaz = !naTabletu && !S ? { popisek: t('Úkoly'), pohled: 'tasks', arg: ARG_ZA_BODY } : undefined;

  const tlacitkoZapsat = (size: 'sm' | 'md' = 'md') => !nahled && smiZapsat ? (
    <Button variant="secondary" size={size} icon="plus" onClick={() => setZapsat(true)} data-zapsat-navic-tlacitko>{t('Zapsat navíc')}</Button>
  ) : null;
  const okno = !nahled ? (
    <ZapsatNavic open={zapsat} onClose={() => setZapsat(false)} actingAs={actingAs} jmeno={naTabletu ? osoba?.jmeno ?? null : null} />
  ) : null;

  // Tablet bez vybraného člověka: zeptat se, kdo jsi — ne ukázat úkoly „nikoho" (DESIGN: Prázdný odznak je horší než otázka).
  if (naTabletu && actingAs == null) {
    return (
      <Widget nacteni={undefined}>
        <div className="space-y-3" data-za-body-kdo>
          <p className="t-meta text-pretty">{t('Kdo u tabletu stojí? Vyber se a uvidíš své úkoly za body.')}</p>
          {!nahled && vyzadej && <Button variant="secondary" size="lg" icon="user" onClick={() => void vyzadej()}>{t('Kdo jsi?')}</Button>}
        </div>
      </Widget>
    );
  }

  const prazdnoText = t('Dnes tu nic za body není — zapsat můžeš i vlastní věc navíc.');

  if (S) {
    const prvni = souhrn.prvni;
    const akce = prvni && !nahled ? akceUkolu(prvni)[0] : undefined;
    return (
      <>
        <Widget nacteni={data} kostra="cislo"
          prazdno={data.data && souhrn.kVzeti === 0 ? <p className="t-meta text-pretty">{t('Dnes tu nic za body není.')}</p> : undefined}>
          <div className="space-y-2" data-za-body-s>
            <p className="t-card text-pretty">
              {t('{n, plural, one {# úkol za body} few {# úkoly za body} other {# úkolů za body}}', { n: souhrn.kVzeti })}
              {souhrn.body > 0 && <> · <span className="tabular-nums">{t('až +{n} b', { n: souhrn.body })}</span></>}
            </p>
            {prvni && (
              <p className="t-meta truncate" title={prvni.nabidka.title}>{prvni.nabidka.title}{odmenaKratce(prvni.nabidka, money) ? ` · ${odmenaKratce(prvni.nabidka, money)}` : ''}</p>
            )}
            {prvni && akce && (
              // Malá karta má jen akci prvního volného úkolu — název a body nese nahoře, celý seznam je v Úkolech.
              <UkolyZaBody ukoly={[prvni]} actingAs={actingAs} jmeno={osoba?.jmeno ?? null} velke={naTabletu} jenAkce tiche />
            )}
          </div>
        </Widget>
        {okno}
      </>
    );
  }

  return (
    <>
      {/* Seznam je omezený (M tři úkoly bez popisu), takže se nezkracuje pod „Zobrazit vše" — akce zůstanou vidět. */}
      <Widget nacteni={data} odkaz={odkaz} bezZkraceni={!L}
        doplnek={souhrn.kVzeti > 0 ? <Chip tone="muted" size="sm">{souhrn.kVzeti}</Chip> : undefined}
        prazdno={data.data && ukoly.length === 0 ? (
          <EmptyState compact illustration="odmeny" title={t('Dnes nic za body')} hint={prazdnoText} action={tlacitkoZapsat('md')} />
        ) : undefined}>
        <div className="space-y-3" data-za-body-widget={velikost}>
          {naTabletu && osoba && <p className="t-meta">{t('Pro: {jmeno}', { jmeno: osoba.jmeno })}</p>}
          <UkolyZaBody ukoly={ukoly} actingAs={actingAs} jmeno={naTabletu ? osoba?.jmeno ?? null : null} velke={naTabletu} nahled={nahled} max={L ? undefined : 3} popisy={L || naTabletu} tiche />
          {L && tlacitkoZapsat('md')}
        </div>
      </Widget>
      {okno}
    </>
  );
}

export default UkolyZaBodyWidget;
