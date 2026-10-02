'use client';

// Sloučení duplicitních členů: seznam podezřelých dvojic (stejný telefon, e-mail nebo jméno), výběr hlavního člena
// a potvrzení s přesným popisem, co se sečte a co zůstane.

import { useEffect, useState } from 'react';
import { Button, EmptyState, ErrorState, ListRow, Modal, Skeleton, Chip } from '../../ui';
import { czCount } from '@/lib/czech';
import { telefonCitelne, popisSlouceni } from '@/lib/clenoveSeznam';
import { apiMessage, okJson } from '@/lib/api';
import { cislo, NAVSTEVA, denCesky, j, type Hlaska } from './spolecne';
import Potvrdit from './Potvrdit';

interface ClenDup { id: number; name: string; email: string | null; phone: string | null; points: number; visits: number; joined_at: string; last_visit_at: string | null }
interface SkupinaDup { duvod: 'telefon' | 'email' | 'jmeno'; clenove: ClenDup[] }
const DUVOD: Record<string, string> = { telefon: 'Stejný telefon', email: 'Stejná e-mailová schránka', jmeno: 'Stejné jméno (nemusí to být on)' };

export default function Duplicity({ oznam, onZavrit, onSlouceno }: { oznam: Hlaska; onZavrit: () => void; onSlouceno: () => void }) {
  const [d, setD] = useState<{ skupiny: SkupinaDup[]; celkem: number } | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [verze, setVerze] = useState(0);
  const [hlavni, setHlavni] = useState<Record<number, number>>({});
  const [potvrdit, setPotvrdit] = useState<{ hlavni: ClenDup; duplicita: ClenDup } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let zije = true;
    setChyba(null);
    fetch('/api/client/admin/customers?duplicity=1').then(okJson)
      .then(r => { if (zije) setD({ skupiny: Array.isArray(r.skupiny) ? r.skupiny : [], celkem: Number(r.celkem) || 0 }); })
      .catch(e => { if (zije) setChyba(apiMessage(e, 'Duplicity se nepodařilo najít.')); });
    return () => { zije = false; };
  }, [verze]);
  const slouc = async () => {
    if (!potvrdit) return;
    setBusy(true);
    try {
      const r = await j('/api/client/admin/customers/sloucit', { method: 'POST', body: JSON.stringify({ hlavniId: potvrdit.hlavni.id, duplicitaId: potvrdit.duplicita.id }) });
      oznam(`Sloučeno do ${potvrdit.hlavni.name}: teď ${cislo(r.body)} b. a ${czCount(r.navstev, NAVSTEVA)}.`);
      setPotvrdit(null); setVerze(v => v + 1); onSlouceno();
    } catch (err) { oznam(apiMessage(err, 'Členy se nepodařilo sloučit.'), 'bad'); setPotvrdit(null); }
    setBusy(false);
  };
  return (
    <Modal open onClose={onZavrit} size="lg" title="Duplicitní členové"
      subtitle="Lidé, kteří se do klubu přidali dvakrát (jiný e-mail, překlep, import). Sloučením se body, razítka, návštěvy, kupony a historie spojí do jednoho člena."
      footer={<Button variant="primary" onClick={onZavrit}>Hotovo</Button>}>
      {chyba ? <ErrorState title="Duplicity se nenačetly" detail={chyba} onRetry={() => setVerze(v => v + 1)} />
        : !d ? <Skeleton className="h-24" />
        : d.skupiny.length === 0 ? <EmptyState icon="users" compact title="Žádné duplicity" hint="Nikdo nemá stejný telefon, e-mail ani jméno jako jiný člen. Hledá se při každém otevření tohoto okna." />
        : (
          <div className="grid gap-4">
            {d.celkem > d.skupiny.length && <p className="note note-wait">Ukazuje se prvních {d.skupiny.length} z {d.celkem}. Po sloučení se načtou další.</p>}
            {d.skupiny.map((s, i) => {
              const hlId = hlavni[i] ?? s.clenove[0].id;
              const hl = s.clenove.find(c => c.id === hlId) ?? s.clenove[0];
              return (
                <section key={s.clenove.map(c => c.id).join('-')} className="well grid gap-2" aria-label={`Skupina duplicit ${i + 1}`}>
                  <div className="flex items-center gap-2 flex-wrap"><Chip tone={s.duvod === 'jmeno' ? 'wait' : 'info'} size="sm">{DUVOD[s.duvod]}</Chip><span className="t-meta">Vyber, kdo zůstane. Ostatní se do něj sloučí.</span></div>
                  <ul className="list" role="radiogroup" aria-label="Hlavní člen">
                    {s.clenove.map(c => (
                      <ListRow key={c.id}
                        lead={<input type="radio" name={`dup-${i}`} className="h-5 w-5 accent-[#16181A]" checked={hlId === c.id} onChange={() => setHlavni({ ...hlavni, [i]: c.id })} aria-label={`Hlavní člen: ${c.name}`} />}
                        title={c.name}
                        meta={[c.email, c.phone ? telefonCitelne(c.phone) : null, `člen od ${denCesky(c.joined_at)}`, c.last_visit_at ? `naposledy ${denCesky(c.last_visit_at)}` : 'nebyl u kasy'].filter(Boolean).join(' · ')}
                        value={<>{cislo(c.points)} <span className="text-xs font-medium text-black/50">b.</span></>}
                        valueMeta={czCount(c.visits, NAVSTEVA)}
                        actions={c.id !== hl.id ? <Button size="sm" variant="secondary" onClick={() => setPotvrdit({ hlavni: hl, duplicita: c })} aria-label={`Sloučit ${c.name} do ${hl.name}`}>Sloučit do hlavního</Button> : <Chip tone="ok" size="sm">Zůstane</Chip>} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      {potvrdit && (
        <Potvrdit title="Sloučit členy?" akce="Sloučit" busy={busy} onZavrit={() => setPotvrdit(null)} onPotvrdit={() => { void slouc(); }}
          text={`${potvrdit.duplicita.name} se sloučí do ${potvrdit.hlavni.name}. ${popisSlouceni(
            { points: potvrdit.hlavni.points, stamps: 0, visits: potvrdit.hlavni.visits, spend: 0, credit: 0, joined_at: null, last_visit_at: null, note: null },
            { points: potvrdit.duplicita.points, stamps: 0, visits: potvrdit.duplicita.visits, spend: 0, credit: 0, joined_at: null, last_visit_at: null, note: null })}. Deník, kupony, rezervace, objednávky a skupiny přejdou na ${potvrdit.hlavni.name}. Člen ${potvrdit.duplicita.name} přijde o členství v klubu (jeho účet hosta zůstane). Zpět to nejde.`} />
      )}
    </Modal>
  );
}
