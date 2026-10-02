'use client';

// Historie importů a vrácení jednoho z nich.

import { useCallback, useState } from 'react';
import { Button, Chip, EmptyState, ErrorState, ListRow, Modal, Skeleton } from '../../ui';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { ChybaApi, cislo, j, zprava, type Hlaska, type StavNacteni, type ZaznamImportu } from './typy';

const URL_IMPORT = '/api/client/admin/import';

export interface StavHistorie {
  stav: StavNacteni<ZaznamImportu[]>;
  /** Server hlásí, že tabulky importu zatím nejsou k dispozici. */
  nemigrovano: boolean;
  nacti: () => void;
}

export function useHistorie(): StavHistorie {
  const [stav, setStav] = useState<StavNacteni<ZaznamImportu[]>>({ stav: 'nic' });
  const [nemigrovano, setNemigrovano] = useState(false);
  const nacti = useCallback(() => {
    setStav(s => (s.stav === 'ok' ? s : { stav: 'nacita' }));
    j<{ importy?: ZaznamImportu[]; notMigrated?: boolean }>(URL_IMPORT)
      .then(d => {
        setNemigrovano(d.notMigrated === true);
        setStav({ stav: 'ok', data: Array.isArray(d.importy) ? d.importy : [] });
      })
      .catch(e => setStav({ stav: 'chyba', zprava: zprava(e, 'Historii se nepodařilo načíst.'), status: e instanceof ChybaApi ? e.status : undefined }));
  }, []);
  return { stav, nemigrovano, nacti };
}

/** Vrácení importu přes DELETE; vrací výsledek, nebo vyhodí chybu s českou větou. */
export async function vratImportApi(id: number): Promise<{ vraceno: number; smazanoUctu: number }> {
  const d = await j<{ vraceno?: number; smazanoUctu?: number }>(`${URL_IMPORT}?id=${id}`, { method: 'DELETE' });
  return { vraceno: Number(d.vraceno) || 0, smazanoUctu: Number(d.smazanoUctu) || 0 };
}

export const TEXT_VRACENI = 'Smaže nové účty a členství z tohoto importu a upravené zůstatky vrátí zpět. Účty, do kterých se člen mezitím přihlásil, nechá.';

/** Potvrzení nevratného kroku v okně (stejný vzor jako Potvrzeni v ClientAdmin). */
export function PotvrzeniVraceni({ onPotvrdit, onZavrit, pracuji }: { onPotvrdit: () => void; onZavrit: () => void; pracuji?: boolean }) {
  return (
    <Modal open onClose={onZavrit} size="sm" title="Vrátit import?"
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button variant="danger-solid" loading={pracuji} onClick={onPotvrdit}>Vrátit import</Button>
      </>}>
      <p className="text-sm text-black/70 text-pretty">{TEXT_VRACENI}</p>
    </Modal>
  );
}

export default function Historie({ h, oznam, onVraceno }: { h: StavHistorie; oznam: Hlaska; onVraceno: () => void }) {
  const [vracim, setVracim] = useState<ZaznamImportu | null>(null);
  const [pracuji, setPracuji] = useState(false);
  const [hotovo, setHotovo] = useState<string | null>(null);

  const vrat = async () => {
    if (!vracim) return;
    setPracuji(true);
    try {
      const r = await vratImportApi(vracim.id);
      // Výsledek ukážeme v okně, ne toastem: ten by na telefonu překryl tlačítka ve spodní liště okna.
      setHotovo(`Import vrácen. Smazáno nových účtů: ${cislo(r.smazanoUctu)}.`);
      setVracim(null);
      h.nacti();
      onVraceno();
    } catch (e) {
      oznam(zprava(e, 'Vrácení se nepovedlo.'), 'bad');
      setVracim(null);
    }
    setPracuji(false);
  };

  const s = h.stav;
  if (s.stav === 'nic' || s.stav === 'nacita') return <div className="space-y-3" aria-busy><Skeleton className="h-16" /><Skeleton className="h-16" /></div>;
  if (s.stav === 'chyba') {
    return (
      <ErrorState
        title={s.status === 403 ? 'K importu chybí oprávnění' : 'Historii se nepodařilo načíst'}
        hint={s.status === 403 ? 'K importu chybí oprávnění „Import členů“. Požádej vedení, ať ti ho přidá v nastavení rolí.' : s.zprava}
        onRetry={s.status === 403 ? undefined : h.nacti} />
    );
  }
  if (h.nemigrovano) {
    return <EmptyState icon="warning" title="Import zatím není připravený" hint="Databáze se ještě neaktualizovala pro import členů. Zkus to za chvíli, případně dej vědět podpoře." />;
  }
  if (s.data.length === 0) {
    return <EmptyState icon="inbox" title="Zatím žádný import" hint="Až nějaké členy do podniku přeneseš, uvidíš to tady a půjde to vrátit." />;
  }

  return (
    <>
      <p role="status" aria-live="polite" className={hotovo ? 'mb-3 rounded-2xl bg-[var(--ok-bg)] text-[var(--ok-ink)] p-3 text-sm' : 'sr-only'}>{hotovo ?? ''}</p>
      <ul className="list" aria-label="Historie importů">
        {s.data.map(z => {
          const p = z.pocty ?? {};
          const clenu = (p.novaClenstvi ?? 0) + (p.aktualizovano ?? 0);
          return (
            <ListRow key={z.id}
              title={z.soubor || 'Vložená tabulka'}
              meta={`${dbTimeDayHM(z.created_at)} · ${cislo(clenu)} členů, nových účtů ${cislo(p.noveUcty ?? 0)}, přeskočeno ${cislo(p.preskoceno ?? 0)}`}
              right={z.vraceno_at ? <Chip tone="muted" size="sm">vráceno</Chip> : undefined}
              actions={!z.vraceno_at ? <Button size="sm" variant="danger" onClick={() => setVracim(z)}>Vrátit import</Button> : undefined} />
          );
        })}
      </ul>
      {vracim && <PotvrzeniVraceni pracuji={pracuji} onPotvrdit={() => { void vrat(); }} onZavrit={() => { if (!pracuji) setVracim(null); }} />}
    </>
  );
}
