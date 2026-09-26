'use client';

// Kalendář hodnocení směn (část „Kalendář" nástroje stránky Odměny).
//
// Kolo 69 (balík B7): dřív tónované buňky přes celý měsíc (limetka, jantar,
// červená), emoji avatary s náhradou 👤, vlastní šipky měsíce, spinner
// uprostřed obsahu, detail dne jako šedý box s tlačítky-kartami na lidi,
// „★" místo ikony a štítek „NEBO JEDNOTLIVĚ" psaný rukou. Teď neutrální buňky
// s tečkou stavu (jako kalendář uzávěrek), MonthNav, kostra, detail dne jako
// `.list` s Avatarem a stav Chipem. Měsíc čte přes useDataWidgetu ze stejné
// adresy jako widget Nehodnocené směny — po uložení hodnocení se obnoví oběma.
//
// Den jde otevřít zvenku (`den`): widget Nehodnocené směny pošle událost
// a stránka ji sem předá — kalendář skočí na měsíc a rozbalí ten den.

import { useEffect, useState } from 'react';
import { zkratkyDnu, zacatekTydne } from '@/lib/week';
import { Icon } from '../Icons';
import { useCurrency } from '../CurrencyProvider';
import ShiftReviewModal from './ShiftReviewModal';
import { pragueToday } from '@/lib/pragueTime';
import { bunkyMesice } from '@/lib/uzaverkyPrehled';
import { czCount, czForm } from '@/lib/czech';
import { NEHODNOCENA_SMENA } from '@/lib/odmenyPrehled';
import { Avatar, Button, Card, Chip, ErrorState, ListRow, MonthNav, Skeleton } from '../ui';
import { useDataWidgetu } from '../widgety/useDataWidgetu';

interface Clovek { id: number; name: string; avatar: string | null; reviewed: boolean; rating: number; flagged: boolean }
interface Den { date: string; staff: Clovek[]; pending: number }

function vyberDny(raw: any): Record<string, Den> {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.days)) throw new Error('Kalendář hodnocení přišel v nečekaném tvaru.');
  const mapa: Record<string, Den> = {};
  for (const d of raw.days) {
    if (!d?.date) continue;
    mapa[String(d.date).slice(0, 10)] = {
      date: String(d.date).slice(0, 10),
      staff: Array.isArray(d.staff) ? d.staff : [],
      pending: Number(d.pending) || 0,
    };
  }
  return mapa;
}

type Stav = 'vytka' | 'ceka' | 'hotovo' | 'nic';
const stavDne = (d: Den | undefined): Stav => !d ? 'nic' : d.staff.some(s => s.flagged) ? 'vytka' : d.pending > 0 ? 'ceka' : 'hotovo';
// Tečka nese stav, buňka zůstává neutrální (DP §2.1: tóny nad ~6 % obsahu se nesmí).
const TECKA: Record<Stav, string> = { hotovo: 'bg-[#8FB811]', ceka: 'bg-wait', vytka: 'bg-bad', nic: 'bg-transparent' };
const POPIS: Record<Stav, string> = { hotovo: 'vše ohodnoceno', ceka: 'čeká na hodnocení', vytka: 'něco je špatně', nic: 'bez směny' };
const LIDE = { one: 'člověk', few: 'lidé', many: 'lidí' };
const denVetou = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });

export default function ShiftReviewCalendar({ onSaved, den, smiHodnotit = true }: {
  onSaved?: () => void;
  /** Den, který se má otevřít (z widgetu Nehodnocené směny). */
  den?: string | null;
  /** Bez hodnoceni.hodnotit se kalendář jen prohlíží — okno hodnocení se neotevře. */
  smiHodnotit?: boolean;
}) {
  const { weekStart } = useCurrency();
  const dnes = pragueToday();
  const tento = dnes.slice(0, 7);
  const [mesic, setMesic] = useState(den ? den.slice(0, 7) : tento);
  const [vybrany, setVybrany] = useState<string | null>(den ?? null);
  const [hodnotim, setHodnotim] = useState<{ clovek: Clovek; den: string; cela: boolean } | null>(null);
  // Nový den zvenku (další klepnutí ve widgetu) přepne měsíc i výběr.
  useEffect(() => {
    if (!den) return;
    setMesic(den.slice(0, 7));
    setVybrany(den);
  }, [den]);

  const data = useDataWidgetu(`/api/shift-reviews?month=${mesic}`, vyberDny);
  const dny = data.data ?? {};
  const bunky = bunkyMesice(mesic, zacatekTydne(weekStart));
  const zkratky = zkratkyDnu(zacatekTydne(weekStart));
  const detail = vybrany ? dny[vybrany] : undefined;
  const cekaCelkem = Object.values(dny).filter(d => d.date <= dnes).reduce((s, d) => s + d.pending, 0);

  const zmenMesic = (m: string) => { setVybrany(null); setMesic(m); };

  return (
    <Card aria-labelledby="kalendar-hodnoceni">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="kalendar-hodnoceni" className="t-card flex items-center gap-2">
          <Icon name="calendar" size={17} className="shrink-0 text-black/40" />
          Kalendář hodnocení
          {cekaCelkem > 0 && <Chip tone="wait" size="sm">{czCount(cekaCelkem, NEHODNOCENA_SMENA)}</Chip>}
        </h2>
        <MonthNav value={mesic} onChange={zmenMesic} max={tento} />
      </div>

      {data.error ? (
        <ErrorState compact title="Kalendář se nenačetl" onRetry={data.reload} detail={data.error} className="mt-3" />
      ) : data.loading ? (
        <div className="mt-4 space-y-2" aria-busy>
          <Skeleton className="h-6" />
          <Skeleton className="h-56" />
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-1.5" role="group" aria-label="Hodnocení po dnech">
            {zkratky.map(z => <div key={z} aria-hidden className="text-center text-[11px] font-semibold text-black/45 pb-1">{z}</div>)}
            {bunky.map((d, i) => {
              if (!d) return <div key={`p${i}`} aria-hidden />;
              const x = dny[d];
              const stav = stavDne(x);
              const cislo = Number(d.slice(8, 10));
              const vybranyDen = vybrany === d;
              const popis = `${cislo}. ${Number(d.slice(5, 7))}. — ${POPIS[stav]}${x ? `, na směně ${czCount(x.staff.length, LIDE)}` : ''}`;
              const obsah = (
                <>
                  <span className={`text-[11px] font-semibold leading-none mt-0.5 tabular-nums ${vybranyDen ? 'chip-ink rounded-full px-1.5 py-0.5 -mt-0.5' : d === dnes ? 'text-[#16181A] underline underline-offset-2' : 'text-black/55'}`}>{cislo}</span>
                  {x && <span className="text-[11px] leading-none text-black/45 tabular-nums">{x.staff.length}×</span>}
                  <span aria-hidden className={`mt-auto h-1.5 w-1.5 rounded-full ${TECKA[stav]}`} />
                </>
              );
              const tvar = `h-14 sm:h-16 min-w-0 rounded-xl p-1 flex flex-col items-center justify-start gap-0.5 ${x ? 'bg-black/[0.03]' : ''}`;
              return x ? (
                <button key={d} type="button" title={popis} aria-label={popis} aria-pressed={vybranyDen}
                  onClick={() => setVybrany(vybranyDen ? null : d)}
                  className={`${tvar} tap-target transition-colors hover:bg-black/[0.06]`}>
                  {obsah}
                </button>
              ) : (
                <div key={d} title={popis} className={tvar}>
                  <span className="sr-only">{popis}</span>
                  <span aria-hidden className="contents">{obsah}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 t-meta">
            <span className="flex items-center gap-1.5"><span aria-hidden className={`h-2 w-2 rounded-full ${TECKA.hotovo}`} /> Ohodnoceno</span>
            <span className="flex items-center gap-1.5"><span aria-hidden className={`h-2 w-2 rounded-full ${TECKA.ceka}`} /> Čeká na hodnocení</span>
            <span className="flex items-center gap-1.5"><span aria-hidden className={`h-2 w-2 rounded-full ${TECKA.vytka}`} /> Něco je špatně</span>
          </div>

          {Object.keys(dny).length === 0 && <p className="t-meta mt-4">V tomhle měsíci zatím nikdo neměl směnu.</p>}

          {/* Detail dne: kdo pracoval a jestli je ohodnocený; klepnutí otevře hodnocení. */}
          {detail && vybrany && (
            <section aria-labelledby="den-hodnoceni" className="mt-5 border-t border-[var(--surface-line)] pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 id="den-hodnoceni" className="t-card cz-sentence">{denVetou(vybrany)}</h3>
                {detail.pending > 0
                  ? <Chip tone="wait" size="sm">{czCount(detail.pending, NEHODNOCENA_SMENA)}</Chip>
                  : <Chip tone="ok" size="sm" icon="check">Vše ohodnoceno</Chip>}
              </div>
              {smiHodnotit && detail.staff.length > 1 && (
                <Button variant="secondary" size="sm" icon="users" className="mt-3"
                  onClick={() => setHodnotim({ clovek: detail.staff[0], den: vybrany, cela: true })}>
                  Ohodnotit celou směnu ({detail.staff.length} {czForm(detail.staff.length, LIDE)})
                </Button>
              )}
              <ul className="list mt-2">
                {detail.staff.map(p => {
                  const stav = !p.reviewed ? <Chip tone="wait" size="sm">Čeká</Chip>
                    : p.flagged ? <Chip tone="bad" size="sm" icon="warning">Výtka</Chip>
                    : <Chip tone="ok" size="sm" icon="star">{p.rating > 0 ? `${p.rating}/5` : 'Hodnoceno'}</Chip>;
                  return smiHodnotit ? (
                    <li key={p.id}>
                      <ListRow as="div" lead={<Avatar emoji={p.avatar} size="sm" />} title={p.name}
                        meta={p.reviewed ? 'Ohodnoceno' : 'Čeká na hodnocení'} right={stav}
                        onClick={() => setHodnotim({ clovek: p, den: vybrany, cela: false })} />
                    </li>
                  ) : (
                    <ListRow key={p.id} lead={<Avatar emoji={p.avatar} size="sm" />} title={p.name}
                      meta={p.reviewed ? 'Ohodnoceno' : 'Čeká na hodnocení'} right={stav} />
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}

      {hodnotim && (
        <ShiftReviewModal
          employee={{ id: hodnotim.clovek.id, name: hodnotim.clovek.name, avatar: hodnotim.clovek.avatar ?? undefined }}
          initialDate={hodnotim.den}
          initialWholeShift={hodnotim.cela}
          onClose={() => setHodnotim(null)}
          onSaved={() => { setHodnotim(null); data.reload(); onSaved?.(); }}
        />
      )}
    </Card>
  );
}
