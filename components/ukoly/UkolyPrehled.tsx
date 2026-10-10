'use client';

// Přehled úkolů v čase: kolik se splnilo, založilo a mělo termín za zvolené období (rychlé volby, od–do, dny v týdnu),
// graf s porovnáním s předchozím obdobím, úspěšnost a podíl splněných v termínu, výkon podle lidí. Klepnutí na sloupec
// rozbalí úkoly toho dne / týdne / měsíce — z nich jde otevřít detail. Společné pro Úkoly vedení i zaměstnance.

import { useMemo, useState } from 'react';
import { Card, CasovyGraf, Chip, ListRow, ObdobiLista, Segmented, Stat, StatRow } from '../ui';
import { useT } from '@/lib/i18n/client';
import { aktualniJazyk } from '@/lib/i18n/stav';
import { useObdobi } from '@/lib/useObdobi';
import { useUlozeno } from '@/lib/useUlozeno';
import {
  agreguj, hrubostProRozmezi, jeVybranyDen, obdobiZPresetu, pocetDni, platneRozmezi, predchoziRozmezi, souhrn as souhrnObdobi, zmenaPct, type Slot,
} from '@/lib/obdobi';
import { pragueDaySafe } from '@/lib/pragueTime';
import { jeHotovy, type Ukol } from '@/lib/ukolyPrehled';
import { splneniPodleLidi, statistikaUkolu, ukolyPoDnech, type MetrikaUkolu } from '@/lib/ukolyFiltr';

const METRIKY: MetrikaUkolu[] = ['splneno', 'zalozeno', 'terminy'];

export function UkolyPrehled({ ukoly, dnes, lidi = false, onOtevri }: {
  ukoly: readonly Ukol[];
  dnes: string;
  /** Ukázat výkon podle lidí (jen vedení, které vidí úkoly celého týmu). */
  lidi?: boolean;
  onOtevri: (u: Ukol) => void;
}) {
  const t = useT('widgety');
  const loc = aktualniJazyk();
  const { obdobi, nastav } = useObdobi('ukoly-prehled', obdobiZPresetu('30_dni', dnes));
  const [metrika, setMetrika] = useUlozeno<MetrikaUkolu>('ukoly-metrika', 'splneno', METRIKY);
  const [druh, setDruh] = useUlozeno<'sloupce' | 'cara'>('ukoly-druh', 'sloupce', ['sloupce', 'cara']);
  const [porovnat, setPorovnat] = useUlozeno<boolean>('ukoly-porovnat', false);
  const [vybrany, setVybrany] = useState<Slot | null>(null);

  const r = platneRozmezi(obdobi, dnes);
  const pred = predchoziRozmezi(r.od, r.do);
  const nDni = pocetDni(r.od, r.do);
  const hr = hrubostProRozmezi(obdobi, nDni);

  const hodnoty = useMemo(() => ukolyPoDnech(ukoly, r.od, r.do, metrika), [ukoly, r.od, r.do, metrika]);
  const hodnotyPred = useMemo(() => (porovnat ? ukolyPoDnech(ukoly, pred.od, pred.do, metrika) : null), [porovnat, ukoly, pred.od, pred.do, metrika]);
  const sloty = useMemo(() => agreguj(hodnoty, r.od, r.do, hr, obdobi.dnyTydne), [hodnoty, r.od, r.do, hr, obdobi.dnyTydne]);
  const slotyPred = useMemo(() => (hodnotyPred ? agreguj(hodnotyPred, pred.od, pred.do, hr, obdobi.dnyTydne) : null), [hodnotyPred, pred.od, pred.do, hr, obdobi.dnyTydne]);
  const sum = useMemo(() => souhrnObdobi(hodnoty, r.od, r.do, obdobi.dnyTydne, dnes), [hodnoty, r.od, r.do, obdobi.dnyTydne, dnes]);
  const sumPred = useMemo(() => (hodnotyPred ? souhrnObdobi(hodnotyPred, pred.od, pred.do, obdobi.dnyTydne, dnes) : null), [hodnotyPred, pred.od, pred.do, obdobi.dnyTydne, dnes]);
  const zmena = sumPred ? zmenaPct(sum.soucet, sumPred.soucet) : null;
  const stat = useMemo(() => statistikaUkolu(ukoly, r.od, r.do, dnes), [ukoly, r.od, r.do, dnes]);
  const statPred = useMemo(() => statistikaUkolu(ukoly, pred.od, pred.do, dnes), [ukoly, pred.od, pred.do, dnes]);
  const lidiRadky = useMemo(() => (lidi ? splneniPodleLidi(ukoly, r.od, r.do, dnes) : []), [lidi, ukoly, r.od, r.do, dnes]);

  const kratceDatum = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(loc, { day: 'numeric', month: 'numeric' });
  const dnesKlic = hr === 'den' ? dnes : hr === 'tyden' ? obdobiZPresetu('tyden', dnes).od : dnes.slice(0, 7);
  const pismeno = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(loc, { weekday: 'short' });
  const jmenoSlotu = (sl: Slot) => hr === 'den' ? `${pismeno(sl.klic)} ${kratceDatum(sl.klic)}`
    : hr === 'tyden' ? `${kratceDatum(sl.od)} – ${kratceDatum(sl.do)}`
    : new Date(`${sl.klic}-01T12:00:00`).toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  const popisekOsy = (sl: Slot) => hr === 'den' ? (sloty.length <= 10 ? pismeno(sl.klic) : String(Number(sl.klic.slice(8))))
    : hr === 'tyden' ? kratceDatum(sl.od) : new Date(`${sl.klic}-01T12:00:00`).toLocaleDateString(loc, { month: 'short' });
  const metrikaNazev = metrika === 'splneno' ? t('Splněno') : metrika === 'zalozeno' ? t('Založeno') : t('Termíny');

  // Úkoly vybraného sloupce podle zvolené metriky.
  const ukolyVyberu = useMemo(() => {
    if (!vybrany) return [];
    const den = (u: Ukol) => metrika === 'splneno' ? (jeHotovy(u) && u.completedAt ? pragueDaySafe(u.completedAt) : '')
      : metrika === 'zalozeno' ? (u.createdAt ? pragueDaySafe(u.createdAt) : '') : (u.dueDate ?? '');
    return ukoly.filter(u => { const d = den(u); return d && d >= vybrany.od && d <= vybrany.do && jeVybranyDen(d, obdobi.dnyTydne); })
      .sort((a, b) => den(a).localeCompare(den(b)) || a.id - b.id);
  }, [vybrany, ukoly, metrika, obdobi.dnyTydne]);

  const pct = (v: number | null) => (v == null ? '–' : `${v} %`);

  return (
    <div className="space-y-4">
      <ObdobiLista value={obdobi} onChange={o => { setVybrany(null); nastav(o); }} />

      <Card>
        <StatRow>
          <Stat label={t('Splněno')} value={stat.splneno} note={statPred.splneno > 0 || stat.splneno > 0 ? t('v předchozím období {n}', { n: statPred.splneno }) : undefined} />
          <Stat label={t('Založeno')} value={stat.zalozeno} />
          <Stat label={t('Splněno v termínu')} value={pct(stat.vTerminuPct)} note={t('ze splněných s termínem')} />
          <Stat label={t('Úspěšnost')} value={pct(stat.uspesnostPct)} note={t('hotové z úkolů po termínu')} />
          <Stat label={t('Po termínu teď')} value={stat.poTerminu} tone={stat.poTerminu > 0 ? 'bad' : 'muted'} />
        </StatRow>
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented size="sm" ariaLabel={t('Co ukázat v grafu')} value={metrika} onChange={(m: MetrikaUkolu) => { setVybrany(null); setMetrika(m); }}
            options={[{ id: 'splneno', label: t('Splněno') }, { id: 'zalozeno', label: t('Založeno') }, { id: 'terminy', label: t('Termíny') }]} />
          <Segmented size="sm" ariaLabel={t('Druh grafu')} value={druh} onChange={setDruh}
            options={[{ id: 'sloupce', label: t('Sloupce') }, { id: 'cara', label: t('Čára') }]} />
          <button type="button" aria-pressed={porovnat} onClick={() => setPorovnat(!porovnat)}
            className={`filter-pill tap-target-sm ${porovnat ? 'seg-on' : 'seg-off glass'}`}>{t('Porovnat s předchozím obdobím')}</button>
        </div>
        <p className="t-meta">
          <span className="font-semibold text-[#16181A] tabular-nums">{sum.soucet}</span> {metrikaNazev.toLowerCase()}
          {zmena != null && <> <Chip tone={zmena >= 0 ? 'ok' : 'wait'} size="sm">{zmena > 0 ? '+' : ''}{zmena} %</Chip> {t('proti předchozím {n, plural, one {# dni} other {# dnům}}', { n: nDni })}</>}
        </p>
        <CasovyGraf sloty={sloty} porovnani={porovnat ? slotyPred : null} druh={druh} vyska={190} celaCisla
          format={v => String(Math.round(v))} jmenoSlotu={jmenoSlotu} popisekOsy={popisekOsy} zvyraznit={dnesKlic}
          vybrany={vybrany?.klic ?? null} popisekPorovnani={t('předchozí období')}
          onVyber={sl => setVybrany(v => (v?.klic === sl.klic ? null : sl))}
          label={t('Úkoly: {co}, {od} – {do}', { co: metrikaNazev.toLowerCase(), od: kratceDatum(r.od), do: kratceDatum(r.do) })} />
        <p className="t-meta">{t('Klepnutím na sloupec uvidíš úkoly z toho období.')}</p>
      </Card>

      {vybrany && (
        <section className="space-y-2" aria-label={t('Úkoly: {obdobi}', { obdobi: jmenoSlotu(vybrany) })}>
          <h2 className="t-label">{jmenoSlotu(vybrany)} · {metrikaNazev} ({ukolyVyberu.length})</h2>
          {ukolyVyberu.length === 0 ? <p className="t-meta">{t('V tomto období nic není.')}</p> : (
            <Card pad="none" className="px-5">
              <ul className="list">
                {ukolyVyberu.slice(0, 50).map(u => (
                  <ListRow key={u.id} as="li" onClick={() => onOtevri(u)} title={u.title}
                    meta={[u.assigneeName ?? t('Kdokoli'), u.dueDate ? kratceDatum(u.dueDate) : ''].filter(Boolean).join(' · ')}
                    right={jeHotovy(u) ? <Chip tone="ok" size="sm">{t('Hotovo')}</Chip> : undefined} />
                ))}
              </ul>
              {ukolyVyberu.length > 50 && <p className="t-meta py-2">{t('…a dalších {n}', { n: ukolyVyberu.length - 50 })}</p>}
            </Card>
          )}
        </section>
      )}

      {lidi && lidiRadky.length > 0 && (
        <section className="space-y-2" aria-label={t('Výkon podle lidí')}>
          <h2 className="t-label">{t('Výkon podle lidí')}</h2>
          <Card pad="none" className="px-5">
            <ul className="list">
              {lidiRadky.map(x => (
                <ListRow key={x.id ?? 'volne'} as="li" title={x.jmeno}
                  meta={t('Aktivních: {n}', { n: x.aktivni })}
                  value={<span className="tabular-nums">{t('{n} splněno', { n: x.splneno })}</span>}
                  right={x.poTerminu > 0 ? <Chip tone="bad" size="sm">{t('{n} po termínu', { n: x.poTerminu })}</Chip> : undefined} />
              ))}
            </ul>
          </Card>
        </section>
      )}
    </div>
  );
}
