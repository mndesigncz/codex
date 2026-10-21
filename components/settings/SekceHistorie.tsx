'use client';

// Nastavení › Historie změn (kolo 7, R7-7). Dřív sto posledních záznamů jako jeden
// proud — nešlo zjistit, co dělal konkrétní člověk, ani načíst nic staršího.
//
// Vzor Shopify Store activity log a Slack audit logs: hledání (popis, detail, jméno —
// bez diakritiky), pilulky lidí s počtem (až když jsou v datech aspoň dva; druhý klik
// filtr zruší; pás jede do strany uvnitř sebe), Segmented oblastí (až od dvou oblastí)
// a dole „Načíst starší" po stránkách (GET /api/audit?before=). Filtry běží nad
// načtenými záznamy — nadpis proto říká, kolik jich je načteno, a „Načíst starší"
// přidá další stránku do téhož filtru. Logika je čistá v lib/auditPopisky.ts (testy
// scripts/testy/k83-nastaveni.ts), tady se jen kreslí.

import { useEffect, useMemo, useState } from 'react';
import { Avatar, Button, EmptyState, ErrorState, ListRow, SearchField, Segmented, Skeleton } from '../ui';
import { okJson } from '@/lib/api';
import { useJazyk, useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { dbTimeHM, parseDbTime } from '@/lib/pragueTime';
import {
  filtrujHistorii, lideHistorie, oblastiHistorie, type OblastAuditu, type ZaznamHistorie,
} from '@/lib/auditPopisky';

type Clovek = number | 'system' | null;

const nazevOblasti = (o: OblastAuditu, t: PrekladFn): string => {
  switch (o) {
    case 'lide': return t('Lidé a role');
    case 'sklad': return t('Sklad');
    case 'kasa': return t('Kasa a menu');
    case 'uzaverky': return t('Uzávěrky');
    case 'odmeny': return t('Odměny');
    case 'klient': return t('Hosté');
    case 'nastaveni': return t('Nastavení');
    default: return t('Ostatní', undefined, 'druh');
  }
};

export default function SekceHistorie() {
  const t = useT();
  const { jazyk } = useJazyk();
  const [zaznamy, setZaznamy] = useState<ZaznamHistorie[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  // Chyba načtení je chyba, ne prázdný seznam („Zatím žádný záznam" by lhalo).
  const [chyba, setChyba] = useState(false);
  const [nacitamStarsi, setNacitamStarsi] = useState(false);
  const [chybaStarsich, setChybaStarsich] = useState('');
  const [hledani, setHledani] = useState('');
  const [clovek, setClovek] = useState<Clovek>(null);
  const [oblast, setOblast] = useState<OblastAuditu | 'vse'>('vse');

  const nacti = () => {
    setChyba(false);
    fetch('/api/audit').then(okJson)
      .then(d => { setZaznamy(Array.isArray(d.entries) ? d.entries : []); setNextBefore(typeof d.nextBefore === 'number' ? d.nextBefore : null); })
      .catch(() => setChyba(true));
  };
  useEffect(nacti, []);

  const nactiStarsi = () => {
    if (nextBefore == null) return;
    setNacitamStarsi(true); setChybaStarsich('');
    fetch(`/api/audit?before=${nextBefore}`).then(okJson)
      .then(d => {
        const dalsi: ZaznamHistorie[] = Array.isArray(d.entries) ? d.entries : [];
        setZaznamy(prev => [...(prev ?? []), ...dalsi.filter(z => !(prev ?? []).some(p => p.id === z.id))]);
        setNextBefore(typeof d.nextBefore === 'number' && d.nextBefore !== nextBefore ? d.nextBefore : null);
      })
      .catch(() => setChybaStarsich(t('Starší záznamy se nepodařilo načíst. Zkus to znovu.')))
      .finally(() => setNacitamStarsi(false));
  };

  const vse = zaznamy ?? [];
  const lide = useMemo(() => lideHistorie(vse), [vse]);
  const oblasti = useMemo(() => oblastiHistorie(vse), [vse]);
  const vybranaOblast = oblast === 'vse' ? null : oblast;
  const vysledek = useMemo(() => filtrujHistorii(vse, { clovek, oblast: vybranaOblast, hledani }), [vse, clovek, vybranaOblast, hledani]);
  const filtruje = clovek != null || vybranaOblast != null || hledani.trim() !== '';
  const zrusFiltry = () => { setClovek(null); setOblast('vse'); setHledani(''); };
  // Druhý klik na tutéž pilulku filtr zruší (DESIGN „Filtrovací pás").
  const prepniCloveka = (k: Exclude<Clovek, null>) => setClovek(c => (c === k ? null : k));

  const kdy = (iso: string) => {
    const d = parseDbTime(iso);
    return d ? `${fmtDatum(d, { jazyk, styl: 'kratce' })} ${dbTimeHM(d)}` : '';
  };
  // Ořezaný seznam to musí říct (DESIGN „Ořezané seznamy"): kolik je načteno a jestli je i starší.
  const popisRozsahu = nextBefore != null
    ? t('{n, plural, one {Načten # nejnovější záznam} few {Načteny # nejnovější záznamy} other {Načteno # nejnovějších záznamů}}, starší jsou dole.', { n: vse.length })
    : t('{n, plural, one {Celkem # záznam} few {Celkem # záznamy} other {Celkem # záznamů}}.', { n: vse.length });

  return (
    <section className="card p-5" aria-labelledby="nast-historie-t" data-historie>
      <h2 id="nast-historie-t" className="t-card">{t('Historie změn')}</h2>
      <p className="t-meta mt-1 text-pretty">
        {t('Důležité zásahy v týmu — mazání, nastavení, odměny.')}
        {zaznamy && zaznamy.length > 0 && <> {popisRozsahu}</>}
      </p>
      {chyba ? (
        <div className="mt-4"><ErrorState title={t('Historii změn se nepodařilo načíst')} onRetry={nacti} compact /></div>
      ) : zaznamy === null ? (
        <div className="space-y-2 mt-4" aria-busy="true" aria-label={t('Načítám historii')}>
          {[0, 1, 2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : zaznamy.length === 0 ? (
        <div className="mt-4"><EmptyState icon="clock" title={t('Zatím žádný záznam')} hint={t('Kdo co změnil, se sem zapisuje samo — smazání, schválení, úpravy cen.')} compact /></div>
      ) : (
        <div className="mt-4 space-y-3">
          <SearchField value={hledani} onChange={setHledani} placeholder={t('Hledat v historii…')} ariaLabel={t('Hledat v historii')} storageKey="historie-zmen" />
          {lide.length >= 2 && (
            // Filtrovací pás: na úzké obrazovce jede do strany uvnitř sebe, nezalamuje se.
            <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain scrollbar-none scroll-fade-x -mx-1 px-1 py-0.5" role="group" aria-label={t('Kdo změnu udělal')}>
              {lide.map(l => (
                <button key={String(l.klic)} type="button" aria-pressed={clovek === l.klic} onClick={() => prepniCloveka(l.klic)}
                  className={`filter-pill tap-target-sm shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 ${clovek === l.klic ? 'seg-on' : 'seg-off glass'}`}>
                  <span>{l.klic === 'system' ? t('Systém') : l.jmeno} · <span className="tabular-nums">{l.pocet}</span></span>
                </button>
              ))}
            </div>
          )}
          {oblasti.length >= 2 && (
            <Segmented size="sm" ariaLabel={t('Oblast změn')} value={oblast} onChange={v => setOblast(v)}
              options={[{ id: 'vse' as const, label: t('Vše') }, ...oblasti.map(o => ({ id: o.oblast, label: nazevOblasti(o.oblast, t), count: o.pocet }))]} />
          )}
          {vysledek.length === 0 ? (
            <EmptyState icon="search" compact title={t('Nic neodpovídá filtru')}
              hint={nextBefore != null ? t('Hledá se jen v načtených záznamech — zkus načíst starší.') : undefined}
              action={<Button variant="secondary" onClick={zrusFiltry}>{t('Zrušit filtry')}</Button>} />
          ) : (
            <ul className="list" aria-label={t('Historie změn')}>
              {vysledek.map(z => (
                <ListRow key={z.id}
                  lead={<Avatar emoji={z.userAvatar ?? undefined} name={z.userName} size="sm" ring={false} />}
                  title={z.label}
                  meta={<span className="tabular-nums">{z.userId == null ? t('Systém') : z.userName} · {kdy(z.createdAt)}</span>}
                  detail={z.detail ? <span className="break-words">{z.detail}</span> : undefined} />
              ))}
            </ul>
          )}
          {chybaStarsich && <p role="alert" className="note note-danger text-sm">{chybaStarsich}</p>}
          {nextBefore != null && (
            <Button variant="secondary" icon="refresh" className="w-full" loading={nacitamStarsi} onClick={nactiStarsi}>{t('Načíst starší')}</Button>
          )}
          {filtruje && vysledek.length > 0 && (
            <p className="t-meta tabular-nums">{t('{n} z {celkem} načtených záznamů odpovídá filtru.', { n: vysledek.length, celkem: vse.length })}</p>
          )}
        </div>
      )}
    </section>
  );
}
