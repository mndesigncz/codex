'use client';

// Párování kartičky s účtem z pokladny (spuštění, balík Q) — dva kusy pro čtečku u kasy
// (CteckaKasa) i pro Kartičku hosta v Příjmu (CardScan):
//
//  * ParovaniHosta: hned po skenu „Body se připíšou samy po zaplacení účtu" a volitelný stůl
//    (se stolem se účet najde jistěji); vybrat účet ručně jde dál tlačítky účtů pod tím.
//  * CekaNaZaplaceni: seznam „Čeká na zaplacení" (host, čas skenu, stůl, zrušit, vybrat účet,
//    když se samo nepovedlo) a „Spárováno" za poslední tři hodiny. Dokud něco čeká, obnovuje
//    se každých 20 s (server při čtení zkusí párovat a vynutí synchronizaci Storyous).
//    Bez pokladny se nekreslí nic — čtečka se chová jako dřív.
//
// Server: GET/PATCH /api/client/staff/claims, jádro lib/vernostZUctu.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Chip, ListRow } from '../ui';
import { useMoney } from '../CurrencyProvider';
import { czCount, type CzNoun } from '@/lib/czech';
import { dbTimeHM } from '@/lib/pragueTime';
import { okJson, apiMessage, ApiError } from '@/lib/api';

const OBNOVA_MS = 20_000;
const HOST: CzNoun = { one: 'host čeká', few: 'hosté čekají', many: 'hostů čeká' };

interface Kandidat { billId: string; finalPrice: number; paidAt: string | null }
interface Cekajici { id: number; customerName: string; staffName: string | null; deskId: string | null; stul: string | null; scannedAt: string; kandidati: Kandidat[] }
interface Hotovo { id: number; customer_name: string; total: number; points: number; credit: number; matched_by: string | null; matched_at: string }
interface Stul { deskId: string; name: string }

/** Výsledek párování jednou větou: „Spárováno s účtem 412 Kč · +41 b". */
function useVeta() {
  const money = useMoney();
  return (total: number, body: number, kredit: number) =>
    [`Spárováno s účtem ${money(Math.round(Number(total) || 0))}`, body > 0 ? `+${body} b` : '', kredit > 0 ? `+${money(kredit)} kreditu` : ''].filter(Boolean).join(' · ');
}

/** Stav po skenu u hosta: body se připíšou samy, volitelně stůl. */
export function ParovaniHosta({ parovani, velke = false, onZmena }: {
  parovani: { id: number; deskId: string | null; stoly: Stul[] };
  velke?: boolean;
  onZmena?: () => void;
}) {
  const [stul, setStul] = useState<string | null>(parovani.deskId);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { setStul(parovani.deskId); setErr(''); }, [parovani.id, parovani.deskId]);
  const vyber = async (deskId: string | null) => {
    setBusy(deskId ?? '-'); setErr('');
    try {
      await fetch('/api/client/staff/claims', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: parovani.id, action: 'stul', deskId }) }).then(okJson);
      setStul(deskId); onZmena?.();
    } catch (e) { setErr(apiMessage(e, 'Stůl se nepodařilo uložit.')); }
    setBusy('');
  };
  return (
    <div className="note note-info space-y-2" data-testid="parovani-hosta">
      <p className="font-semibold">Body se připíšou samy po zaplacení účtu.</p>
      <p className="text-[13px]">Účet v pokladně se najde podle {stul ? 'stolu' : 'tebe jako obsluhy'} a času. {parovani.stoly.length > 0 && !stul ? 'Vyber stůl a bude to jisté.' : ''}</p>
      {parovani.stoly.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Stůl hosta">
          {parovani.stoly.map(t => (
            <button key={t.deskId} type="button" aria-pressed={stul === t.deskId} disabled={!!busy}
              onClick={() => vyber(stul === t.deskId ? null : t.deskId)}
              className={`filter-pill ${velke ? 'min-h-[48px] px-4' : 'min-h-[44px] px-3.5'} ${stul === t.deskId ? 'seg-on' : 'seg-off glass'}`}>
              {t.name}
            </button>
          ))}
        </div>
      )}
      {err && <p role="alert" className="text-[13px] font-semibold">{err}</p>}
    </div>
  );
}

/** Seznam čekajících a spárovaných; `obnovit` = změň číslo, když se má načíst hned (po skenu, po akci). */
export default function CekaNaZaplaceni({ obnovit = 0, velke = false, onToast }: { obnovit?: number; velke?: boolean; onToast?: (m: string) => void }) {
  const veta = useVeta();
  const money = useMoney();
  const [d, setD] = useState<{ pos: boolean; ceka: Cekajici[]; hotovo: Hotovo[] } | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [otevreny, setOtevreny] = useState<number | null>(null);
  const videne = useRef<Set<number> | null>(null);
  const toastRef = useRef(onToast);
  toastRef.current = onToast;

  const nacti = useCallback(async () => {
    try {
      const x = await fetch('/api/client/staff/claims').then(okJson);
      // Nově spárované od minula se ohlásí (výsledek „Spárováno s účtem … · +41 b").
      const hotovo: Hotovo[] = x.hotovo ?? [];
      if (videne.current) for (const h of hotovo) if (!videne.current.has(h.id) && h.matched_by === 'auto') toastRef.current?.(`${h.customer_name}: ${veta(h.total, h.points, h.credit)}`);
      videne.current = new Set(hotovo.map(h => h.id));
      setD({ pos: !!x.pos, ceka: x.ceka ?? [], hotovo }); setErr('');
    } catch (e) {
      // Bez oprávnění ke kartičce (403) se seznam prostě nekreslí.
      if (e instanceof ApiError && e.status === 403) { setD(null); setErr(''); return; }
      setErr(apiMessage(e, 'Čekající účty se nenačetly.'));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void nacti(); }, [nacti, obnovit]);
  const nekdoCeka = (d?.ceka.length ?? 0) > 0;
  useEffect(() => {
    if (!nekdoCeka) return;
    const t = setInterval(() => { if (document.visibilityState === 'visible') void nacti(); }, OBNOVA_MS);
    return () => clearInterval(t);
  }, [nekdoCeka, nacti]);

  const akce = async (id: number, action: 'zrusit' | 'vybrat', billId?: string) => {
    setBusy(`${action}:${id}:${billId ?? ''}`);
    try {
      const x = await fetch('/api/client/staff/claims', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action, billId }) }).then(okJson);
      if (x.message) onToast?.(x.message);
      setOtevreny(null);
      await nacti();
    } catch (e) { setErr(apiMessage(e, 'Nepovedlo se.')); }
    setBusy('');
  };

  if (!d?.pos) return err ? <p role="alert" className="note note-danger">{err}</p> : null;
  if (!d.ceka.length && !d.hotovo.length) return null;
  // Cíle aspoň 44 px (obsluha na telefonu), u čtečky na terminálu 48 px.
  const vel = velke ? 'lg' as const : 'md' as const;
  return (
    <div className="space-y-3 min-w-0" data-testid="ceka-na-zaplaceni">
      {d.ceka.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="t-label">Čeká na zaplacení</p>
            <Chip tone="wait" size="sm"><span aria-hidden>{d.ceka.length}</span><span className="sr-only">{czCount(d.ceka.length, HOST)}</span></Chip>
          </div>
          <ul className="list">
            {d.ceka.map(c => (
              <li key={c.id} className="list-row flex-col !items-stretch gap-2" data-testid="ceka-radek">
                <div className="flex items-start gap-2 flex-wrap">
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="font-semibold text-[15px] leading-tight break-words">{c.customerName}</p>
                    <p className="t-meta tabular-nums">sken v {dbTimeHM(c.scannedAt)}{c.stul ? ` · stůl ${c.stul}` : ''}{c.staffName ? ` · ${c.staffName}` : ''}</p>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {c.kandidati.length > 0 && (
                      <Button size={vel} variant="secondary" aria-expanded={otevreny === c.id} onClick={() => setOtevreny(o => (o === c.id ? null : c.id))}>
                        {c.kandidati.length > 1 ? 'Vybrat účet' : 'Účet je tu'}
                      </Button>
                    )}
                    <Button size={vel} variant="ghost" loading={busy === `zrusit:${c.id}:`} onClick={() => akce(c.id, 'zrusit')}>Zrušit</Button>
                  </div>
                </div>
                {otevreny === c.id && (
                  <div className="space-y-1.5">
                    <p className="t-meta">{c.kandidati.length > 1 ? 'Víc účtů sedí, samo to nepáruje. Který je hostův?' : 'Účet sedí, ale jistota není: potvrď ho.'}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {c.kandidati.map(k => (
                        <Button key={k.billId} size={vel} variant="secondary" icon="receipt" loading={busy === `vybrat:${c.id}:${k.billId}`} onClick={() => akce(c.id, 'vybrat', k.billId)}>
                          {money(Math.round(Number(k.finalPrice)))}{k.paidAt ? ` · ${dbTimeHM(k.paidAt)}` : ''}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {d.hotovo.length > 0 && (
        <div>
          <p className="t-label mb-1">Spárováno</p>
          <ul className="list" data-testid="sparovano">
            {d.hotovo.slice(0, 5).map(h => (
              <ListRow key={h.id} title={<span className="break-words">{h.customer_name}</span>}
                meta={<span className="tabular-nums">{veta(h.total, h.points, h.credit)} · {dbTimeHM(h.matched_at)}</span>}
                right={<Chip tone={h.matched_by === 'auto' ? 'ok' : 'muted'} size="sm">{h.matched_by === 'auto' ? 'samo' : 'obsluha'}</Chip>} />
            ))}
          </ul>
        </div>
      )}
      {err && <p role="alert" className="note note-danger">{err}</p>}
    </div>
  );
}
