'use client';

// Všechny podniky na platformě. Hledání a filtr stavu nahoře, čísla
// v přehledu, seznam pod tím. Klik na řádek vede do detailu, kde jsou
// zásahy — tady se nic nemění, jen vybírá.

import { useEffect, useState } from 'react';
import { useLoad, PageHeader, Stat, StatRow, SearchField, Segmented, ListRow, Chip, EmptyState, ErrorState, PageSkeleton, type SegmentedOption } from '@/components/ui';
import { czCount } from '@/lib/czech';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { STAV_NAZEV, STAV_TON, iniciala, type PodnikRadek, type StavPodniku } from './spolecne';

type Filtr = StavPodniku | 'vse';
const FILTRY: SegmentedOption<Filtr>[] = [
  { id: 'vse', label: 'Vše' }, { id: 'placeny', label: 'Placené' }, { id: 'zkusebni', label: 'Zkušební' },
  { id: 'zdarma', label: 'Zdarma' }, { id: 'po_splatnosti', label: 'Po splatnosti' }, { id: 'pozastaveny', label: 'Pozastavené' },
];
interface Prehled { celkem: number; aktivniTyden: number; placeny: number; zkusebni: number; zdarma: number; pozastaveny: number; poSplatnosti: number }

export default function Podniky() {
  const [q, setQ] = useState('');
  const [hledani, setHledani] = useState('');
  const [filtr, setFiltr] = useState<Filtr>('vse');
  // Hledá se až po chvíli ticha — dotaz na každé písmeno by dělal ze
  // serveru našeptávač.
  useEffect(() => { const t = setTimeout(() => setHledani(q.trim()), 250); return () => clearTimeout(t); }, [q]);

  const prehled = useLoad<Prehled>('/api/admin/overview', r => r as Prehled);
  const seznam = useLoad<{ total: number; teams: PodnikRadek[] }>(
    `/api/admin/teams?q=${encodeURIComponent(hledani)}&stav=${filtr}&limit=200`,
    r => ({ total: Number(r.total ?? 0), teams: Array.isArray(r.teams) ? r.teams : [] }),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Podniky" subtitle="Každý podnik na platformě — kdo ho vede, na jakém je tarifu a jestli běží." />

      {prehled.data && (
        <StatRow>
          <Stat label="Podniků" value={prehled.data.celkem} icon="users" />
          <Stat label="Aktivních za 7 dní" value={prehled.data.aktivniTyden} icon="trend" tone="ok" />
          <Stat label="Placených" value={prehled.data.placeny} icon="coins" tone="ok" />
          <Stat label="Zkušebních" value={prehled.data.zkusebni} icon="clock" tone="info" />
          <Stat label="Po splatnosti" value={prehled.data.poSplatnosti} icon="warning" tone={prehled.data.poSplatnosti ? 'wait' : 'muted'} />
          <Stat label="Pozastavených" value={prehled.data.pozastaveny} icon="lock" tone={prehled.data.pozastaveny ? 'bad' : 'muted'} />
        </StatRow>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <SearchField value={q} onChange={setQ} placeholder="Název podniku, e-mail nebo jméno majitele, id…" ariaLabel="Hledat podnik" className="sm:flex-1" />
        <Segmented options={FILTRY} value={filtr} onChange={setFiltr} size="sm" ariaLabel="Stav podniku" wrap />
      </div>

      {seznam.error ? (
        <ErrorState title="Seznam podniků se nenačetl" detail={seznam.error} onRetry={seznam.reload} />
      ) : seznam.loading ? (
        <PageSkeleton tiles={3} />
      ) : seznam.data!.teams.length === 0 ? (
        <EmptyState icon="search" title={hledani ? `Nic pro „${hledani}"` : 'Zatím žádný podnik'}
          hint={hledani ? 'Zkus část názvu nebo e-mail majitele.' : 'Jakmile se někdo zaregistruje, objeví se tady.'} />
      ) : (
        <section className="card p-2 sm:p-3" aria-label="Seznam podniků">
          <p className="t-meta px-3 pt-1 pb-2">{czCount(seznam.data!.total, { one: 'podnik', few: 'podniky', many: 'podniků' })}</p>
          {seznam.data!.teams.map(t => (
            <ListRow
              key={t.id}
              href={`/admin/teams/${t.id}`}
              chevron
              lead={<span className="h-9 w-9 rounded-full bg-black/[0.06] grid place-items-center text-xs font-bold" aria-hidden>{iniciala(t.name)}</span>}
              title={t.name}
              meta={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Chip tone={STAV_TON[t.stav]} size="sm">{STAV_NAZEV[t.stav]}</Chip>
                  <span>{t.owner?.email ?? 'bez majitele'}</span>
                  <span aria-hidden>·</span>
                  <span>{czCount(t.members, { one: 'člen', few: 'členové', many: 'členů' })}</span>
                </span>
              }
              value={t.planLabel}
              valueMeta={t.subscriptionStatus ?? 'bez Stripe'}
              aside={t.lastActivity ? `aktivní ${dbTimeDayHM(t.lastActivity)}` : 'bez aktivity'}
            />
          ))}
        </section>
      )}
    </div>
  );
}
