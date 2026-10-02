'use client';

// Poslat kupon hostům: jednomu, skupině, nebo všem členům (i „uvítací kupon pro stávající členy").
// Před odesláním se ukáže, kolik hostů kupon dostane a koho se přeskočí a proč (zkouška bez zápisu).
// Každý příjemce dostane vlastní kód a oznámení v aplikaci.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Field, Input, Modal, Segmented, Select } from '../../ui';
import { czCount, czVerb, type CzNoun } from '@/lib/czech';
import { apiMessage, j } from './kuponyForm';

const HOST: CzNoun = { one: 'host', few: 'hosté', many: 'hostů' };
const HOSTA: CzNoun = { one: 'hosta', few: 'hosty', many: 'hostů' };

type Vysledek = { poslano: number; celkem: number; preskoceno: { drzi: number; limit: number; neplnolety: number; kusy: number } };

/** Věta o tom, koho se přeskočí; prázdná, když nikoho. */
function preskoceniVeta(p: Vysledek['preskoceno']): string {
  const casti: string[] = [];
  if (p.drzi) casti.push(`${czCount(p.drzi, HOST)} ho už drží`);
  if (p.limit) casti.push(`${czCount(p.limit, HOST)} vyčerpali limit na hosta`);
  if (p.neplnolety) casti.push(`${czCount(p.neplnolety, HOST)} není plnoletých`);
  if (p.kusy) casti.push(`${czCount(p.kusy, HOSTA)} už nezbyl kus`);
  return casti.length ? `Přeskočí se: ${casti.join(', ')}.` : '';
}

export default function KuponyOdeslat({ kupon, groups, onZavrit, oznam, onHotovo }: {
  kupon: any; groups: any[]; onZavrit: () => void; oznam: (m: string) => void; onHotovo: () => void;
}) {
  const [druh, setDruh] = useState<'vsichni' | 'skupina' | 'hoste'>('vsichni');
  const [skupinaId, setSkupinaId] = useState<string>(groups[0] ? String(groups[0].id) : '');
  const [vybrani, setVybrani] = useState<{ id: number; name: string }[]>([]);
  const [hledej, setHledej] = useState('');
  const [nalezeni, setNalezeni] = useState<{ id: number; name: string }[]>([]);
  const [zprava, setZprava] = useState('');
  const [nahled, setNahled] = useState<Vysledek | null>(null);
  const [chyba, setChyba] = useState('');
  const [busy, setBusy] = useState(false);
  const pozNahled = useRef(0);
  const pozHledani = useRef(0);

  const publikum = useCallback(() => (
    druh === 'vsichni' ? { druh } : druh === 'skupina' ? { druh, skupinaId: Number(skupinaId) } : { druh, hostIds: vybrani.map(v => v.id) }
  ), [druh, skupinaId, vybrani]);
  const pripraven = druh === 'vsichni' || (druh === 'skupina' && !!skupinaId) || (druh === 'hoste' && vybrani.length > 0);

  // Zkouška při každé změně publika: správce vidí číslo dřív, než klikne.
  useEffect(() => {
    setNahled(null); setChyba('');
    if (!pripraven) return;
    const n = ++pozNahled.current;
    j('/api/client/admin/coupons/send', { method: 'POST', body: JSON.stringify({ id: kupon.id, publikum: publikum(), zkouska: true }) })
      .then(d => { if (n === pozNahled.current) setNahled(d); })
      .catch(e => { if (n === pozNahled.current) setChyba(apiMessage(e, 'Počet příjemců se nepodařilo zjistit.')); });
  }, [kupon.id, publikum, pripraven]);

  // Hledání hosta podle jména (krátká prodleva, ať se nevolá na každé písmeno).
  useEffect(() => {
    if (druh !== 'hoste') return;
    const n = ++pozHledani.current;
    const t = setTimeout(() => {
      j(`/api/client/admin/coupons/send?q=${encodeURIComponent(hledej)}`)
        .then(d => { if (n === pozHledani.current) setNalezeni(Array.isArray(d.hoste) ? d.hoste : []); })
        .catch(e => setChyba(apiMessage(e, 'Hosty se nepodařilo načíst.')));
    }, 250);
    return () => clearTimeout(t);
  }, [hledej, druh]);

  const posli = async () => {
    setBusy(true); setChyba('');
    try {
      const d: Vysledek = await j('/api/client/admin/coupons/send', { method: 'POST', body: JSON.stringify({ id: kupon.id, publikum: publikum(), zprava }) });
      oznam(d.poslano > 0 ? `Kupon „${kupon.title}" dostalo ${czCount(d.poslano, HOST)}.` : 'Nikdo kupon nedostal: všichni měli, co potřebovali.');
      onHotovo(); onZavrit();
    } catch (e) { setChyba(apiMessage(e, 'Kupon se nepodařilo poslat.')); }
    setBusy(false);
  };

  return (
    <Modal open onClose={onZavrit} size="md" title={`Poslat „${kupon.title}"`}
      subtitle="Každý host dostane vlastní kód a oznámení v aplikaci."
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button variant="primary" icon="send" loading={busy} disabled={!pripraven || !nahled || nahled.poslano === 0} onClick={posli}>
          {nahled && nahled.poslano > 0 ? `Poslat ${czCount(nahled.poslano, HOSTA)}` : 'Poslat'}
        </Button>
      </>}>
      <div className="space-y-4">
        <Segmented options={[{ id: 'vsichni', label: 'Všem členům' }, { id: 'skupina', label: 'Skupině' }, { id: 'hoste', label: 'Vybraným hostům' }]}
          value={druh} onChange={setDruh} size="sm" ariaLabel="Komu kupon poslat" />
        {druh === 'skupina' && (groups.length === 0
          ? <p className="t-meta">Zatím nemáš žádnou skupinu hostů. Založíš ji v Body a úrovně, hosty do ní přidáš v Zákaznících.</p>
          : <Field id="od-sk" label="Skupina"><Select id="od-sk" value={skupinaId} onChange={e => setSkupinaId(e.target.value)}>
              {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name} ({g.members})</option>)}
            </Select></Field>)}
        {druh === 'hoste' && (
          <div className="space-y-2">
            {vybrani.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {vybrani.map(v => (
                  <button key={v.id} type="button" className="filter-pill tap-target-sm seg-on" aria-label={`Odebrat ${v.name}`} onClick={() => setVybrani(vybrani.filter(x => x.id !== v.id))}>{v.name} ×</button>
                ))}
              </div>
            )}
            <Field id="od-hled" label="Najdi hosta podle jména"><Input id="od-hled" value={hledej} onChange={e => setHledej(e.target.value)} placeholder="Jméno hosta" autoComplete="off" /></Field>
            <ul className="list max-h-48 overflow-y-auto">
              {nalezeni.filter(h => !vybrani.some(v => v.id === h.id)).map(h => (
                <li key={h.id} className="list-row">
                  <span className="flex-1 min-w-0 truncate text-[15px]">{h.name || `Host #${h.id}`}</span>
                  <Button size="sm" variant="secondary" icon="plus" onClick={() => setVybrani([...vybrani, h])}>Přidat</Button>
                </li>
              ))}
              {nalezeni.length === 0 && <li className="py-3 t-meta">Nikdo takový mezi členy není.</li>}
            </ul>
          </div>
        )}
        <Field id="od-zpr" label="Zpráva k oznámení (nepovinné)" hint="Ukáže se pod názvem kuponu v oznámení, nejvýš 140 znaků.">
          <Input id="od-zpr" value={zprava} onChange={e => setZprava(e.target.value)} maxLength={140} placeholder="Dárek za to, že chodíš." />
        </Field>
        <div aria-live="polite" className="min-h-[2.5rem]">
          {chyba ? <p role="alert" className="note note-danger text-sm px-3 py-2">{chyba}</p>
            : nahled ? (
              <p className="text-sm text-pretty">
                Kupon {czVerb(nahled.poslano, 'dostane', 'dostanou')} <strong>{czCount(nahled.poslano, HOST)}</strong> z {nahled.celkem}. {preskoceniVeta(nahled.preskoceno)}
                {nahled.celkem === 0 && ' Do tohoto výběru zatím nikdo nepatří.'}
              </p>
            ) : pripraven ? <p className="t-meta">Počítám příjemce…</p> : <p className="t-meta">Vyber, komu kupon pošleš.</p>}
        </div>
      </div>
    </Modal>
  );
}
