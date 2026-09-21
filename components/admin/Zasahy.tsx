'use client';

// Historie zásahů správců: kdo, kdy, co, u kterého podniku. Aktér
// „api-token" znamená Claude přes MCP nebo skript — bez téhle stopy by
// se nedalo poznat, jestli podnik pozastavil člověk nebo automat.

import Link from 'next/link';
import { useLoad, PageHeader, ListRow, EmptyState, ErrorState, PageSkeleton, Chip } from '@/components/ui';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { ZASAH_NAZEV, type Zasah } from './spolecne';

export default function Zasahy() {
  const z = useLoad<Zasah[]>('/api/admin/audit?limit=200', r => (Array.isArray(r.zasahy) ? r.zasahy : []));
  return (
    <div className="space-y-6">
      <PageHeader title="Historie zásahů" subtitle="Každé pozastavení, tarif, zkušební doba a poznámka — s tím, kdo to udělal." />
      {z.error ? (
        <ErrorState title="Historie se nenačetla" detail={z.error} onRetry={z.reload} />
      ) : z.loading ? (
        <PageSkeleton tiles={2} />
      ) : z.data!.length === 0 ? (
        <EmptyState icon="archive" title="Zatím žádný zásah" hint="Sem se zapíše první pozastavení nebo změna tarifu." />
      ) : (
        <section className="card p-2 sm:p-3" aria-label="Zásahy správců">
          {z.data!.map(x => (
            <ListRow
              key={x.id}
              title={<span className="flex flex-wrap items-center gap-2">{ZASAH_NAZEV[x.action] ?? x.action}{x.teamId != null && <Link href={`/admin/teams/${x.teamId}`} className="font-medium underline-offset-2 hover:underline">{x.teamName ?? `podnik ${x.teamId}`}</Link>}</span>}
              meta={x.detail ?? undefined}
              right={<span className="flex items-center gap-2"><Chip tone={x.actor === 'api-token' ? 'info' : 'muted'} size="sm">{x.actor === 'api-token' ? 'MCP / skript' : x.actor}</Chip><span className="t-meta whitespace-nowrap">{x.createdAt ? dbTimeDayHM(x.createdAt) : '—'}</span></span>}
            />
          ))}
        </section>
      )}
    </div>
  );
}
