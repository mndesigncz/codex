'use client';

// Widgety oblasti „Organizace" — komponenty (kolo 69, balík B5b; spec §2.5, §6.3).
//
// Vlastník v kole 69: balík B5b (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/organizace.ts;
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — hlídá to test AK-20 v scripts/testy/k68-widgety.ts.
//
// organizace.podniky — konsolidovaný přehled poboček:
//  - M: součty celé organizace (tržby, mzdy, chybějící uzávěrky, lidé na směně, sklad)
//    a počet podniků, které něco potřebují. Na stránce Všechny podniky je to hlavička
//    čísel nad seznamem podniků (nástroj), na Přehledu rychlý pohled na celý řetězec.
//  - L: řádek na podnik. Proklik vede na Všechny podniky, kde jde podnik otevřít
//    („Otevřít" přepíná podnik na serveru — to umí jen stránka, widget ne).
//
// Co opravuje proti dřívějšímu OrgOverview (audit „Všechny podniky"):
//  - tržby a mzdy podniku, které role nesmí vidět, posílá API jako null — UI je dřív
//    formátovalo přes formatMoney(null) na „0 Kč" a tvrdilo nulové tržby. Teď „skryto";
//  - ruční dlaždice (glass-card, text-2xl, přebarvené štítky) → Stat/StatRow;
//  - „3 položky docházejí" pod počtem lidí na směně → vlastní údaj Sklad dochází;
//  - ruční tvary po číslovce („0 členové") → czCount;
//  - sčítá se jen stejná měna: s korunami a eury vedle sebe widget řekne „různé měny".
//  - N9: „Chybí uzávěrka" jen do včerejška (jako Uzávěrky); dnešek bez uzávěrky
//    je zvlášť jako „dnes ještě chybí" a jen u podniku, který už zavřel.
//
// Měsíc: volba „Tento" = měsíc stránky (MesicStrankyOrganizace z OrgOverview),
// jinde dnešní pražský měsíc — mesicZVolby v katalogu finance.

import { createContext, useContext, type ReactNode } from 'react';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { potrebujePozornost, urlPrehledu, vyberPrehled } from '@/lib/financeWidgety';
import { widget } from '@/lib/widgety/katalog';
import { mesicZVolby } from '@/lib/widgety/katalog/finance';
import type { CzNoun } from '@/lib/czech';
import { useT } from '@/lib/i18n/client';
import { formatMoney } from '@/lib/money';
import { pragueToday } from '@/lib/pragueTime';
import { dnesJesteChybi } from '@/lib/uzaverkyOrganizace';
import { Chip, ListRow, Stat, StatRow } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { Widget, type StavNacteni } from '../Widget';
import { useDataWidgetu } from '../useDataWidgetu';
import { useSmi } from '../NavigaceKontext';

/** Měsíc z přepínače v hlavičce Všech podniků („RRRR-MM"); jinde null = dnešní měsíc. */
export const MesicStrankyOrganizace = createContext<string | null>(null);

// Výběr dat z /api/organization/overview je čistá logika v lib/financeWidgety (testuje se v Node).
export { urlPrehledu, vyberPrehled, potrebujePozornost, type PrehledOrganizace, type RadekPodnikuApi } from '@/lib/financeWidgety';

export const UZAVERKA: CzNoun = { one: 'uzávěrka', few: 'uzávěrky', many: 'uzávěrek' };
export const CLEN: CzNoun = { one: 'člen', few: 'členové', many: 'členů' };
export const PODNIK: CzNoun = { one: 'podnik', few: 'podniky', many: 'podniků' };

/**
 * Peníze, nebo proč nejsou: null = role v podniku nesmí (API posílá null,
 * ne nulu — nula by tvrdila, že podnik nic neutržil), celek s různými
 * měnami se nesčítá.
 */
export function Penize({ castka, mena }: { castka: number | null; mena: string | null }): ReactNode {
  const t = useT('widgety');
  if (castka == null) return <span className="t-meta">{t('skryto')}</span>;
  if (!mena) return <span className="t-meta">{t('různé měny')}</span>;
  return formatMoney(castka, mena);
}

function useBrana(): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  const vse = widget('organizace.podniky')?.opravneni.vse ?? ['organizace.prehled'];
  return { ok: nacteno ? vse.every(k => ma(k)) : chyba, ceka: !nacteno && !chyba };
}

const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

function Podniky({ velikost, nastaveni }: WidgetProps<{ mesic: string }>) {
  const t = useT('widgety');
  const smi = useSmi();
  const { ok, ceka } = useBrana();
  const zaklad = useContext(MesicStrankyOrganizace) ?? pragueToday().slice(0, 7);
  const mesic = mesicZVolby(nastaveni.mesic, zaklad);
  const data = useDataWidgetu(ok ? urlPrehledu(mesic) : null, vyberPrehled);
  const p = data.data;
  const c = p?.celkem;
  // Pole katalogu: tržby jen s finance.trzby, mzdy s finance.mzdy. API je v podnicích bez
  // oprávnění pošle jako null samo; údaj se kreslí, když ho divák smí doma, nebo když mu
  // server aspoň v jednom podniku poslal číslo — stejné pravidlo jako nástroj stránky.
  const trzby = smi('finance.trzby') || (p?.podniky ?? []).some(r => r.revenue != null);
  const mzdy = smi('finance.mzdy') || (p?.podniky ?? []).some(r => r.wages != null);
  const naStrance = !!useContext(MesicStrankyOrganizace);
  const problemove = (p?.podniky ?? []).filter(potrebujePozornost);

  return (
    <Widget nacteni={ceka ? CEKA : data}
      // Nedostupný přehled (vypnutý, jeden podnik) na Přehledu nic neříká — v klidu se nekreslí.
      prazdno={p && !p.dostupny ? null : undefined}
      doplnek={p?.dostupny ? <Chip tone="muted" size="sm">{t('{n, plural, one {# podnik} few {# podniky} other {# podniků}}', { n: p.podniky.length })}</Chip> : undefined}
      odkaz={naStrance ? undefined : { popisek: t('Všechny podniky'), pohled: 'org' }}>
      {p?.dostupny && c && (velikost === 'M' ? (
        <div className="space-y-4">
          <StatRow>
            {trzby && <Stat label={t('Tržby celkem')} value={<Penize castka={c.revenue} mena={c.currency} />} />}
            {mzdy && <Stat label={t('Mzdy celkem')} value={<Penize castka={c.wages} mena={c.currency} />}
              note={c.laborPct != null ? t('{pct} % tržeb', { pct: c.laborPct.toLocaleString('cs-CZ') }) : undefined} />}
            <Stat label={t('Chybí uzávěrka')} value={c.missingClosings.toLocaleString('cs-CZ')}
              note={[
                // Dnešek do čísla nepatří (N9) — jen poznámkou, a až po zavírací době.
                c.missingTodayAfterClose > 0 ? t('dnes ještě chybí ({podniky})', { podniky: t('{n, plural, one {# podnik} few {# podniky} other {# podniků}}', { n: c.missingTodayAfterClose }) }) : null,
                c.pendingApproval > 0 ? t('{n} ke schválení', { n: c.pendingApproval.toLocaleString('cs-CZ') }) : null,
              ].filter(Boolean).join(' · ') || undefined} />
          </StatRow>
          <StatRow className="border-t border-[var(--surface-line)] pt-4">
            <Stat label={t('Právě na směně')} value={c.onShiftNow.toLocaleString('cs-CZ')} />
            <Stat label={t('Sklad dochází')} value={c.stockAlerts.toLocaleString('cs-CZ')} note={c.stockAlerts > 0 ? t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: c.stockAlerts }) : undefined} />
          </StatRow>
          <p className="t-meta">
            {problemove.length === 0 ? t('Všechny podniky jsou v pořádku.') : t('Pozornost potřebuje {podniky}: {jmena}.', { podniky: t('{n, plural, one {# podnik} few {# podniky} other {# podniků}}', { n: problemove.length }), jmena: problemove.map(r => r.name).join(', ') })}
          </p>
        </div>
      ) : (
        // Řádky se neproklikávají: všechny by vedly na tutéž stránku (ne na podnik) a
        // klikací ListRow se kreslí jako <li class="contents">, na kterém `.list`
        // nenakreslí linky mezi podniky. Cestu na stránku nese odkaz v hlavičce widgetu.
        <ul className="list">
          {p.podniky.map(r => (
            <li key={r.teamId}>
              <ListRow as="div" title={r.name}
                meta={[t('{n, plural, one {# člen} few {# členové} other {# členů}}', { n: r.members }), t('{n, plural, one {# uzávěrka} few {# uzávěrky} other {# uzávěrek}}', { n: r.closings }), t('{n} na směně', { n: r.onShiftNow.toLocaleString('cs-CZ') })].join(' · ')}
                value={trzby ? <span className="tabular-nums"><Penize castka={r.revenue} mena={r.currency} /></span> : undefined}
                valueMeta={mzdy && r.wages != null && r.revenue ? t('mzdy {pct} %', { pct: Math.round((r.wages / r.revenue) * 100) }) : undefined}
                right={(r.missingClosings > 0 || r.stockAlerts > 0 || dnesJesteChybi(r)) ? (
                  <span className="flex flex-col items-end gap-1">
                    {r.missingClosings > 0 && <Chip tone="bad" size="sm">{t('chybí {n, plural, one {# uzávěrka} few {# uzávěrky} other {# uzávěrek}}', { n: r.missingClosings })}</Chip>}
                    {dnesJesteChybi(r) && <Chip tone="wait" size="sm">{t('dnes ještě chybí')}</Chip>}
                    {r.stockAlerts > 0 && <Chip tone="wait" size="sm">{t('sklad {n}', { n: r.stockAlerts.toLocaleString('cs-CZ') })}</Chip>}
                  </span>
                ) : undefined} />
            </li>
          ))}
        </ul>
      ))}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'organizace.podniky': Podniky,
};
