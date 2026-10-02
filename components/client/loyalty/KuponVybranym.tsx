'use client';

// Kupon vybraným členům: akce v liště výběru v seznamu členů. Nejdřív se vybere kupon, pak se otevře
// stejné okno jako „Poslat hostům…“ u kuponu (zkouška, přeskočení, vlastní kód každému) s hosty, které
// správce v seznamu zaškrtl, nebo se všemi podle filtru.

import { useEffect, useState } from 'react';
import { Button, Field, Modal, Select, Skeleton } from '../../ui';
import { czCount, type CzNoun } from '@/lib/czech';
import { apiMessage, okJson } from '@/lib/api';
import { filtrNaParametry } from '@/lib/clenoveFiltr';
import { MAX_HOSTU_RUCNE } from '@/lib/kuponyPublikum';
import type { Hlaska } from '../import/typy';
import type { VyberHostu } from './ClenoveHromadne';
import KuponyOdeslat from './KuponyOdeslat';

const HOST: CzNoun = { one: 'hosta', few: 'hosty', many: 'hostů' };

/** Id hostů z filtru: seznam se čte po stránkách, protože GET vrací jen výřez. */
async function idsZFiltru(filtr: NonNullable<VyberHostu['filter']>): Promise<number[]> {
  const ids: number[] = [];
  let offset: number | null = 0;
  while (offset !== null && ids.length <= MAX_HOSTU_RUCNE) {
    const p = filtrNaParametry(filtr);
    const r: any = await fetch(`/api/client/admin/customers?${p.toString()}&limit=200&offset=${offset}`).then(okJson);
    for (const c of Array.isArray(r?.customers) ? r.customers : []) ids.push(Number(c.id));
    offset = r?.nextOffset ?? null;
  }
  return ids;
}

export default function KuponVybranym({ vyber, oznam, onZavrit, onHotovo }: { vyber: VyberHostu; oznam: Hlaska; onZavrit: () => void; onHotovo: () => void }) {
  const [kupony, setKupony] = useState<any[] | null>(null);
  const [skupiny, setSkupiny] = useState<any[]>([]);
  const [ids, setIds] = useState<number[] | null>(vyber.ids ?? null);
  const [volba, setVolba] = useState('');
  const [chyba, setChyba] = useState('');
  const [dal, setDal] = useState(false);

  useEffect(() => {
    let zije = true;
    fetch('/api/client/admin/coupons').then(okJson).then(r => {
      if (!zije) return;
      const k = (Array.isArray(r?.coupons) ? r.coupons : []).filter((c: any) => !c.draft && !c.archived && c.stav !== 'vyprselo' && c.active);
      setKupony(k); setSkupiny(Array.isArray(r?.groups) ? r.groups : []);
      if (k.length) setVolba(String(k[0].id));
    }).catch(e => { if (zije) setChyba(apiMessage(e, 'Kupony se nepodařilo načíst.')); });
    return () => { zije = false; };
  }, []);
  useEffect(() => {
    if (vyber.ids || !vyber.filter) return;
    let zije = true;
    idsZFiltru(vyber.filter).then(x => { if (zije) setIds(x); }).catch(e => { if (zije) setChyba(apiMessage(e, 'Hosty z filtru se nepodařilo načíst.')); });
    return () => { zije = false; };
  }, [vyber]);

  const kupon = kupony?.find(c => String(c.id) === volba);
  const prilis = ids !== null && ids.length > MAX_HOSTU_RUCNE;
  if (dal && kupon && ids) {
    return <KuponyOdeslat kupon={kupon} groups={skupiny} hostIds={ids} onZavrit={onZavrit} oznam={m => oznam(m)} onHotovo={onHotovo} />;
  }
  return (
    <Modal open onClose={onZavrit} size="sm" title="Poslat kupon vybraným"
      subtitle={`${czCount(vyber.pocet, HOST)} ve výběru`}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button variant="primary" icon="send" disabled={!kupon || !ids || ids.length === 0 || prilis} onClick={() => setDal(true)}>Pokračovat</Button>
      </>}>
      <div className="space-y-3">
        {kupony === null && !chyba ? <Skeleton className="h-12" />
          : kupony && kupony.length === 0 ? <p className="note note-wait">Nemáš žádný zveřejněný kupon, který jde poslat. Založ ho nebo zveřejni v části Kupony.</p>
          : kupony && (
            <Field id="kv-kupon" label="Který kupon">
              <Select id="kv-kupon" value={volba} onChange={e => setVolba(e.target.value)}>
                {kupony.map(c => <option key={c.id} value={String(c.id)}>{c.title}</option>)}
              </Select>
            </Field>
          )}
        {prilis && <p className="note note-wait">Ručně jde kupon poslat nejvýš {MAX_HOSTU_RUCNE} hostům najednou. Zúži výběr, nebo kupon pošli skupině.</p>}
        {chyba && <p role="alert" className="note note-wait">{chyba}</p>}
      </div>
    </Modal>
  );
}
