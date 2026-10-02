'use client';

// Historie změn kuponu: kdo a kdy ho založil, upravil (co přepsal, před → po), zapnul,
// archivoval nebo rozeslal. Čte se z auditního deníku (/api/client/admin/coupons/historie).

import { Button, EmptyState, ErrorState, ListRow, Modal, Skeleton, useLoad } from '../../ui';
import { dbTimeDayHM } from '@/lib/pragueTime';

export default function KuponyHistorie({ kupon, onZavrit }: { kupon: { id: number; title: string }; onZavrit: () => void }) {
  const { data: h, error, reload } = useLoad<any>(`/api/client/admin/coupons/historie?id=${kupon.id}`);
  return (
    <Modal open onClose={onZavrit} size="md" title={`Historie změn: ${kupon.title}`} footer={<Button variant="primary" onClick={onZavrit}>Zavřít</Button>}>
      {error ? <ErrorState title="Historie se nenačetla" onRetry={reload} detail={error} />
        : !h ? <Skeleton className="h-40" />
        : h.historie.length === 0 ? <EmptyState icon="clock" compact title="Zatím bez záznamu" hint="Změny kuponu se zapisují od teď: kdo, kdy a co přepsal." />
        : (
          <ul className="list" aria-label="Historie změn kuponu">
            {h.historie.map((r: any) => (
              <ListRow key={r.id} as="li" title={r.co} meta={`${r.kdo} · ${r.kdy ? dbTimeDayHM(r.kdy) : ''}${r.detail ? ` — ${r.detail}` : ''}`} />
            ))}
          </ul>
        )}
    </Modal>
  );
}
