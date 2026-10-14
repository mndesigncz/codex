'use client';

// Nahlášený obsah ze všech podniků: pojistka slibu „vyřídíme do 24 hodin“ (podmínky).
// Vedení podniku nahlášení dostane hned a vyřizuje ho samo; tady ho správce platformy vidí
// se lhůtou a když podnik nereaguje, vyřídí ho za něj. Každý zásah jde do historie zásahů.
// Otevřená a nejstarší nahoře: to jsou ta, která hoří.

import Link from 'next/link';
import { useState } from 'react';
import { useLoad, PageHeader, ListRow, EmptyState, ErrorState, PageSkeleton, Chip, Button, Modal } from '@/components/ui';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { nazevDuvodu, LHUTA_NAHLASENI_HODIN, type StavLhuty } from '@/lib/moderace';
import { okJson } from '@/lib/api';

interface Nahlaseni {
  id: number; teamId: number | null; teamName: string | null; kind: string; reason: string; detail: string | null;
  snapshot: string | null; status: string; createdAt: string | null; resolvedAt: string | null; escalatedAt: string | null;
  reporterName: string | null; reportedName: string | null; lhuta: StavLhuty;
}

const STAV: Record<string, { nazev: string; ton: 'ok' | 'muted' | 'bad' }> = {
  removed: { nazev: 'Obsah odstraněn', ton: 'ok' }, resolved: { nazev: 'Vyřízeno', ton: 'ok' }, dismissed: { nazev: 'Zamítnuto', ton: 'muted' },
};

function ChipLhuty({ l, status }: { l: StavLhuty; status: string }) {
  if (l.stav === 'vyrizeno') { const s = STAV[status] ?? { nazev: status, ton: 'muted' as const }; return <Chip tone={s.ton} size="sm">{s.nazev}</Chip>; }
  if (l.stav === 'po_lhute') return <Chip tone="bad" size="sm">{l.poHodin > 0 ? `Po lhůtě ${l.poHodin} h` : 'Po lhůtě'}</Chip>;
  return <Chip tone="wait" size="sm">{`Zbývá ${l.zbyvaHodin} h`}</Chip>;
}

export default function NahlaseniSprava() {
  const z = useLoad<{ nahlaseni: Nahlaseni[]; otevrenych: number }>('/api/admin/nahlaseni', r => ({ nahlaseni: Array.isArray(r.nahlaseni) ? r.nahlaseni : [], otevrenych: Number(r.otevrenych) || 0 }));
  const [odstranit, setOdstranit] = useState<Nahlaseni | null>(null);
  const [bezi, setBezi] = useState<number | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);

  // Dvě akce na řádku: odstranit, nebo ponechat (zamítnout). „Vyřízeno jinak“ je cesta vedení podniku.
  const vyrid = async (n: Nahlaseni, akce: 'odstranit' | 'zamitnout') => {
    setBezi(n.id); setChyba(null);
    try {
      await okJson(await fetch(`/api/admin/nahlaseni/${n.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ akce }) }));
      setOdstranit(null);
      z.reload();
    } catch (e) { setChyba((e as Error).message || 'Nepovedlo se.'); }
    setBezi(null);
  };

  const otevrena = z.data?.otevrenych ?? 0;
  return (
    <div className="space-y-6">
      <PageHeader title="Nahlášený obsah"
        subtitle={`Ze všech podniků. Slib v podmínkách: vyřízení do ${LHUTA_NAHLASENI_HODIN} hodin. Vedení podniku nahlášení dostane hned; když ho nevyřídí, udělej to tady.`} />
      {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
      {z.error ? (
        <ErrorState title="Nahlášení se nenačetla" detail={z.error} onRetry={z.reload} />
      ) : z.loading ? (
        <PageSkeleton tiles={2} />
      ) : z.data!.nahlaseni.length === 0 ? (
        <EmptyState icon="inbox" title="Nic nahlášeného" hint="Sem přijde každé nahlášení zprávy v chatu nebo nápadu z kteréhokoli podniku." />
      ) : (
        <section className="card p-2 sm:p-3" aria-label={otevrena ? `Nahlášení, ${otevrena} otevřených` : 'Nahlášení'}>
          <ul className="list">
            {z.data!.nahlaseni.map(n => (
              <ListRow key={n.id}
                title={<span className="flex flex-wrap items-center gap-x-2">{nazevDuvodu(n.reason)}
                  {n.teamId != null && <Link href={`/admin/teams/${n.teamId}`} className="font-normal text-black/60 underline-offset-2 hover:underline">{n.teamName ?? `podnik ${n.teamId}`}</Link>}</span>}
                meta={`${n.kind === 'zprava' ? 'Zpráva v chatu' : 'Nápad'} · ${n.reporterName ?? 'neznámý'} nahlásil ${n.reportedName ?? 'smazaný účet'} · ${n.createdAt ? dbTimeDayHM(n.createdAt) : '—'}${n.escalatedAt ? ' · e-mail odešel' : n.status === 'open' ? ' · e-mail neodešel' : ''}`}
                detail={<>{n.snapshot ? <span className="block break-words">„{n.snapshot}“</span> : <span className="block">Obsah se nezachoval.</span>}{n.detail && <span className="block break-words mt-0.5">Poznámka: {n.detail}</span>}</>}
                right={<ChipLhuty l={n.lhuta} status={n.status} />}
                actions={n.status === 'open' ? (
                  <span className="flex flex-wrap gap-2">
                    <Button size="sm" variant="danger" onClick={() => setOdstranit(n)} disabled={bezi != null}>Odstranit obsah</Button>
                    <Button size="sm" variant="secondary" onClick={() => void vyrid(n, 'zamitnout')} loading={bezi === n.id} disabled={bezi != null} title="Obsah pravidla neporušuje, zůstane.">Ponechat</Button>
                  </span>
                ) : undefined} />
            ))}
          </ul>
        </section>
      )}

      <Modal open={!!odstranit} onClose={() => setOdstranit(null)} size="sm" title="Odstranit nahlášený obsah?"
        subtitle={odstranit ? `${odstranit.kind === 'zprava' ? 'Zpráva zmizí z chatu' : 'Nápad zmizí z tabule'} podniku ${odstranit.teamName ?? ''} pro všechny. Vrátit to nejde. Zásah se zapíše do historie zásahů i do historie změn podniku.` : undefined}
        footer={<>
          <Button variant="ghost" onClick={() => setOdstranit(null)} disabled={bezi != null}>Zrušit</Button>
          <Button variant="danger-solid" loading={bezi === odstranit?.id} onClick={() => odstranit && void vyrid(odstranit, 'odstranit')}>Odstranit obsah</Button>
        </>}>
        {odstranit?.snapshot && <p className="well p-3 text-sm break-words">„{odstranit.snapshot}“</p>}
      </Modal>
    </div>
  );
}
