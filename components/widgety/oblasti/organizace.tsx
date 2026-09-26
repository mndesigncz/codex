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
//
// Měsíc: volba „Tento" = měsíc stránky (MesicStrankyOrganizace z OrgOverview),
// jinde dnešní pražský měsíc — mesicZVolby v katalogu finance.

import { createContext, useContext, type ReactNode } from 'react';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { potrebujePozornost, urlPrehledu, vyberPrehled } from '@/lib/financeWidgety';
import { widget } from '@/lib/widgety/katalog';
import { mesicZVolby } from '@/lib/widgety/katalog/finance';
import { czCount, POLOZKA, type CzNoun } from '@/lib/czech';
import { formatMoney } from '@/lib/money';
import { pragueToday } from '@/lib/pragueTime';
import { Chip, ListRow, Stat, StatRow } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { Widget, type StavNacteni } from '../Widget';
import { useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';

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
  if (castka == null) return <span className="t-meta">skryto</span>;
  if (!mena) return <span className="t-meta">různé měny</span>;
  return formatMoney(castka, mena);
}

function useBrana(): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  const vse = widget('organizace.podniky')?.opravneni.vse ?? ['organizace.prehled'];
  return { ok: nacteno ? vse.every(k => ma(k)) : chyba, ceka: !nacteno && !chyba };
}

const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

function Podniky({ velikost, nastaveni }: WidgetProps<{ mesic: string }>) {
  const nav = useNavigace();
  const smi = useSmi();
  const { ok, ceka } = useBrana();
  const zaklad = useContext(MesicStrankyOrganizace) ?? pragueToday().slice(0, 7);
  const mesic = mesicZVolby(nastaveni.mesic, zaklad);
  const data = useDataWidgetu(ok ? urlPrehledu(mesic) : null, vyberPrehled);
  const p = data.data;
  const t = p?.celkem;
  // Pole katalogu: tržby jen s finance.trzby, mzdy s finance.mzdy. API je v podnicích bez
  // oprávnění pošle jako null samo; tady se navíc nekreslí údaj, na který divák nemá ani doma.
  const trzby = smi('finance.trzby');
  const mzdy = smi('finance.mzdy');
  const naStrance = !!useContext(MesicStrankyOrganizace);
  const problemove = (p?.podniky ?? []).filter(potrebujePozornost);

  return (
    <Widget nacteni={ceka ? CEKA : data}
      // Nedostupný přehled (vypnutý, jeden podnik) na Přehledu nic neříká — v klidu se nekreslí.
      prazdno={p && !p.dostupny ? null : undefined}
      doplnek={p?.dostupny ? <Chip tone="muted" size="sm">{czCount(p.podniky.length, PODNIK)}</Chip> : undefined}
      odkaz={naStrance ? undefined : { popisek: 'Všechny podniky', pohled: 'org' }}>
      {p?.dostupny && t && (velikost === 'M' ? (
        <div className="space-y-4">
          <StatRow>
            {trzby && <Stat label="Tržby celkem" value={<Penize castka={t.revenue} mena={t.currency} />} />}
            {mzdy && <Stat label="Mzdy celkem" value={<Penize castka={t.wages} mena={t.currency} />}
              note={t.laborPct != null ? `${t.laborPct.toLocaleString('cs-CZ')} % tržeb` : undefined} />}
            <Stat label="Chybí uzávěrka" value={t.missingClosings.toLocaleString('cs-CZ')}
              note={t.pendingApproval > 0 ? `${t.pendingApproval.toLocaleString('cs-CZ')} ke schválení` : undefined} />
          </StatRow>
          <StatRow className="border-t border-[var(--surface-line)] pt-4">
            <Stat label="Právě na směně" value={t.onShiftNow.toLocaleString('cs-CZ')} />
            <Stat label="Sklad dochází" value={t.stockAlerts.toLocaleString('cs-CZ')} note={t.stockAlerts > 0 ? czCount(t.stockAlerts, POLOZKA) : undefined} />
          </StatRow>
          <p className="t-meta">
            {problemove.length === 0 ? 'Všechny podniky jsou v pořádku.' : `Pozornost potřebuje ${czCount(problemove.length, PODNIK)}: ${problemove.map(r => r.name).join(', ')}.`}
          </p>
        </div>
      ) : (
        <ul className="list">
          {p.podniky.map(r => (
            <ListRow key={r.teamId} title={r.name}
              meta={[czCount(r.members, CLEN), czCount(r.closings, UZAVERKA), `${r.onShiftNow.toLocaleString('cs-CZ')} na směně`].join(' · ')}
              value={trzby ? <span className="tabular-nums"><Penize castka={r.revenue} mena={r.currency} /></span> : undefined}
              valueMeta={mzdy && r.wages != null && r.revenue ? `mzdy ${Math.round((r.wages / r.revenue) * 100)} %` : undefined}
              right={(r.missingClosings > 0 || r.stockAlerts > 0) ? (
                <span className="flex flex-col items-end gap-1">
                  {r.missingClosings > 0 && <Chip tone="bad" size="sm">chybí {czCount(r.missingClosings, UZAVERKA)}</Chip>}
                  {r.stockAlerts > 0 && <Chip tone="wait" size="sm">sklad {r.stockAlerts.toLocaleString('cs-CZ')}</Chip>}
                </span>
              ) : undefined}
              onClick={!naStrance && nav.smiPohled('org') ? () => nav.onNavigate('org') : undefined} />
          ))}
        </ul>
      ))}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'organizace.podniky': Podniky,
};
