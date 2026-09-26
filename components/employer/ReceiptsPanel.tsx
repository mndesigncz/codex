'use client';

// Účtenky z nákupů: nafotit papírovou účtenku, připsat obchod a částku, hotovo.
// Když poznámka zmiňuje něco, co vedeme ve skladu, formulář nabídne rovnou
// naskladnit — účtenka JE dodací list.
//
// Kolo 69 (B5b): z panelu, který si TO GO a okno „Účtenky" v hlavičce kreslily
// po svém (ručně psané tmavé „Uložit účtenku", titulek p.font-bold s limetkovou
// ikonou, „✓" a „＋1" jako znaky, chyba holým textem, každá účtenka vlastní
// karta, křížek na mazání bez popisku s cílem ~28 px, měna natvrdo „Kč", datum
// podle hodin prohlížeče a `confirm()` na smazání), jsou tři kusy:
//  - NovaUctenka: formulář z components/ui (Field, Input, Button primary,
//    chip-tlačítka naskladnění, hlášení přes .note);
//  - SeznamUctenek: jedna `.list` se ListRow, částka přes useMoney, den přes
//    lib/pragueTime, smazání v Modalu s popsaným tlačítkem;
//  - ReceiptsPanel (výchozí export): obojí pod sebou pro okno „Účtenky"
//    v hlavičce administrace. V TO GO a na Financích je z toho widget
//    „Účtenky z nákupů" (components/widgety/oblasti/finance.tsx).
//
// Seznam se čte přes useDataWidgetu — stejná URL jako ve widgetu, takže po
// uložení obnoví jedno `obnovDataWidgetu` seznam všude, kde je vidět.

import { useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { apiMessage, okJson } from '@/lib/api';
import { pragueDaySafe } from '@/lib/pragueTime';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { Button, Field, Input, ListRow, Modal, Skeleton, ErrorState } from '../ui';
import { useDataWidgetu, obnovDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';

export const URL_UCTENEK = '/api/receipts';

export interface Uctenka {
  id: number;
  photoUrl: string | null;
  supplier: string | null;
  amount: number | null;
  note: string | null;
  createdAt: string;
  authorName: string | null;
}

/** Odpověď /api/receipts: `{ receipts, error? }`. Chybějící tabulka (error) je chyba, ne prázdný seznam. */
export function vyberUctenky(raw: any): Uctenka[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.receipts)) throw new Error('Účtenky přišly v nečekaném tvaru.');
  if (typeof raw.error === 'string' && raw.error) throw new Error(raw.error);
  return raw.receipts.map((r: any) => ({
    id: Number(r.id),
    photoUrl: typeof r.photoUrl === 'string' && r.photoUrl ? r.photoUrl : null,
    supplier: typeof r.supplier === 'string' && r.supplier.trim() ? r.supplier.trim() : null,
    amount: r.amount == null || !Number.isFinite(Number(r.amount)) ? null : Number(r.amount),
    note: typeof r.note === 'string' && r.note.trim() ? r.note.trim() : null,
    createdAt: String(r.createdAt ?? ''),
    authorName: typeof r.authorName === 'string' && r.authorName.trim() ? r.authorName.trim() : null,
  }));
}

/** „26. 9." z časové značky — pražský den, ne den prohlížeče. */
export function denUctenky(createdAt: string): string {
  const d = pragueDaySafe(createdAt);
  const [, m, dd] = d.split('-').map(Number);
  return m && dd ? `${dd}. ${m}.` : '';
}

/** Hledání položek skladu ve volném textu bez ohledu na diakritiku. */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

interface PolozkaSkladu { id: number; name: string; quantity: number; unit: string }

function vyberSklad(raw: any): PolozkaSkladu[] {
  // Endpoint vrací holé pole; dřív se četlo `d.items` a „Tohle vedeme ve skladu" se nikdy neukázalo.
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  return list
    .filter((i: any) => i && i.archived !== true)
    .map((i: any) => ({ id: Number(i.id), name: String(i.name ?? ''), quantity: Number(i.quantity) || 0, unit: String(i.unit ?? 'ks') }));
}

/**
 * Formulář nové účtenky. `onUlozeno` dostane uloženou účtenku; seznam se
 * obnoví sám. Fotka se zmenší v prohlížeči a nahraje hned po výběru, aby
 * uložení nečekalo na síť dvakrát.
 */
export function NovaUctenka({ onUlozeno }: { onUlozeno?: () => void }) {
  const symbol = useSymbol();
  const smi = useSmi();
  // Naskladnění z účtenky jen s oprávněním skladu; bez něj se sklad ani nečte.
  const smiNaskladnit = smi('sklad.zobrazit') && smi('sklad.zapsat_stav');
  const sklad = useDataWidgetu(smiNaskladnit ? '/api/inventory' : null, vyberSklad);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [nahravam, setNahravam] = useState(false);
  const [obchod, setObchod] = useState('');
  const [castka, setCastka] = useState('');
  const [poznamka, setPoznamka] = useState('');
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState('');
  const [hotovo, setHotovo] = useState('');
  const [naskladneno, setNaskladneno] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (f: File | null) => {
    if (!f) return;
    setNahravam(true); setChyba('');
    try {
      const { compressImage } = await import('@/lib/clientImage');
      const fd = new FormData();
      fd.append('file', await compressImage(f));
      const d = await fetch('/api/upload', { method: 'POST', body: fd }).then(okJson);
      if (typeof d?.url === 'string' && d.url) setPhotoUrl(d.url);
      else setChyba('Fotku se nepodařilo nahrát.');
    } catch (e) { setChyba(apiMessage(e, 'Fotku se nepodařilo nahrát — zkontroluj připojení.')); }
    setNahravam(false);
  };

  // Položky skladu zmíněné v textu — „tohle vedeme".
  const shody = useMemo(() => {
    const hay = norm(`${obchod} ${poznamka}`);
    if (hay.trim().length < 3) return [];
    return (sklad.data ?? []).filter(i => { const n = norm(i.name); return n.length >= 3 && hay.includes(n); }).slice(0, 6);
  }, [sklad.data, obchod, poznamka]);

  const uloz = async () => {
    setUkladam(true); setChyba(''); setHotovo('');
    try {
      await fetch(URL_UCTENEK, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoUrl,
          supplier: obchod.trim() || null,
          amount: castka === '' ? null : Math.round(Number(castka)),
          note: poznamka.trim() || null,
        }),
      }).then(okJson);
      setPhotoUrl(null); setObchod(''); setCastka(''); setPoznamka(''); setNaskladneno({});
      setHotovo('Účtenka uložena.');
      obnovDataWidgetu(URL_UCTENEK);
      onUlozeno?.();
    } catch (e) { setChyba(apiMessage(e, 'Uložení se nepodařilo.')); }
    setUkladam(false);
  };

  const naskladni = async (i: PolozkaSkladu) => {
    setChyba('');
    try {
      await fetch(`/api/inventory/${i.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: i.quantity + 1, note: `Naskladněno z účtenky${obchod.trim() ? ` (${obchod.trim()})` : ''}` }),
      }).then(okJson);
      setNaskladneno(r => ({ ...r, [i.id]: true }));
      sklad.set(list => (list ?? []).map(x => (x.id === i.id ? { ...x, quantity: x.quantity + 1 } : x)));
    } catch (e) { setChyba(apiMessage(e, `${i.name} se nepodařilo naskladnit.`)); }
  };

  const prazdna = !photoUrl && !obchod.trim() && !castka && !poznamka.trim();
  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" aria-hidden tabIndex={-1}
        onChange={e => onFile(e.target.files?.[0] ?? null)} />
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => fileRef.current?.click()} disabled={nahravam}
          aria-label={photoUrl ? 'Vyfotit účtenku znovu' : 'Vyfotit účtenku'}
          className={`shrink-0 h-20 w-20 rounded-2xl border grid place-items-center overflow-hidden transition-colors ${
            photoUrl ? 'border-[var(--surface-line)]' : 'border-dashed border-black/15 text-black/45 hover:text-[#16181A] hover:bg-black/[0.03]'}`}>
          {nahravam ? <Skeleton className="h-full w-full !rounded-none" />
            : photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Nafocená účtenka" className="h-full w-full object-cover" />
            ) : <Icon name="camera" size={22} />}
        </button>
        <div className="min-w-0 flex-1 space-y-2">
          <Field id="uctenka-obchod" label="Kde nakoupeno">
            <Input id="uctenka-obchod" value={obchod} onChange={e => setObchod(e.target.value)} placeholder="Makro, večerka…" autoComplete="off" />
          </Field>
          <Field id="uctenka-castka" label={`Částka (${symbol})`}>
            <Input id="uctenka-castka" type="number" inputMode="numeric" min={0} value={castka} onChange={e => setCastka(e.target.value)} />
          </Field>
        </div>
      </div>
      <Field id="uctenka-poznamka" label="Co se kupovalo">
        <Input id="uctenka-poznamka" value={poznamka} onChange={e => setPoznamka(e.target.value)} placeholder="Mléko, sirup Mango…" autoComplete="off" />
      </Field>

      {smiNaskladnit && shody.length > 0 && (
        <div>
          <p className="t-label mb-1.5">Tohle vedeme ve skladu</p>
          <div className="flex flex-wrap gap-2">
            {shody.map(i => (
              <Button key={i.id} variant="secondary" size="sm" icon={naskladneno[i.id] ? 'check' : 'plus'}
                disabled={naskladneno[i.id]} onClick={() => naskladni(i)}>
                {naskladneno[i.id] ? `${i.name} naskladněno` : `1× ${i.name} (${i.quantity.toLocaleString('cs-CZ')} ${i.unit})`}
              </Button>
            ))}
          </div>
        </div>
      )}

      {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
      {hotovo && !chyba && <p role="status" className="note note-ok">{hotovo}</p>}
      <Button variant="primary" block loading={ukladam} disabled={nahravam || prazdna} onClick={uloz}>Uložit účtenku</Button>
    </div>
  );
}

/**
 * Seznam účtenek v jedné `.list`. `sFotkou` = náhled fotky vlevo (velký
 * widget a okno), jinak ikona v jamce. Smazání jen s `smiMazat`, potvrzuje
 * se v okně (dřív `confirm()`, na telefonu systémový dialog bez kontextu).
 */
export function SeznamUctenek({ uctenky, limit = Infinity, sFotkou = false, smiMazat = false }: {
  uctenky: Uctenka[]; limit?: number; sFotkou?: boolean; smiMazat?: boolean;
}) {
  const money = useMoney();
  const [mazana, setMazana] = useState<Uctenka | null>(null);
  const [mazu, setMazu] = useState(false);
  const [chyba, setChyba] = useState('');
  const vidim = uctenky.slice(0, limit);

  const smaz = async () => {
    if (!mazana) return;
    setMazu(true); setChyba('');
    try {
      await fetch(`${URL_UCTENEK}?id=${mazana.id}`, { method: 'DELETE' }).then(okJson);
      setMazana(null);
      obnovDataWidgetu(URL_UCTENEK);
    } catch (e) { setChyba(apiMessage(e, 'Účtenku se nepodařilo smazat.')); }
    setMazu(false);
  };

  return (
    <>
      <ul className="list">
        {vidim.map(r => (
          <ListRow key={r.id}
            lead={sFotkou && r.photoUrl ? (
              <a href={r.photoUrl} target="_blank" rel="noreferrer" aria-label={`Fotka účtenky ${r.supplier ?? ''}`.trim()} className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.photoUrl} alt="" className="h-10 w-10 rounded-xl object-cover border border-[var(--surface-line)]" />
              </a>
            ) : (
              <span aria-hidden className="well grid h-10 w-10 shrink-0 place-items-center">
                <Icon name={r.photoUrl ? 'camera' : 'receipt'} size={16} className="text-black/55" />
              </span>
            )}
            title={r.supplier ?? 'Účtenka'}
            meta={[denUctenky(r.createdAt), r.note, r.authorName].filter(Boolean).join(' · ')}
            value={r.amount != null ? <span className="tabular-nums">{money(r.amount)}</span> : undefined}
            actions={smiMazat ? (
              <Button variant="ghost" size="sm" iconOnly icon="trash" aria-label={`Smazat účtenku ${r.supplier ?? ''}`.trim()}
                onClick={() => { setChyba(''); setMazana(r); }} />
            ) : undefined} />
        ))}
      </ul>
      {uctenky.length > vidim.length && <p className="t-meta mt-2">…a dalších {(uctenky.length - vidim.length).toLocaleString('cs-CZ')}</p>}
      <Modal open={!!mazana} onClose={() => setMazana(null)} size="sm" title="Smazat účtenku?"
        subtitle={mazana ? [mazana.supplier ?? 'Účtenka', mazana.amount != null ? money(mazana.amount) : null, denUctenky(mazana.createdAt)].filter(Boolean).join(' · ') : undefined}
        footer={<>
          <Button variant="secondary" onClick={() => setMazana(null)}>Zrušit</Button>
          <Button variant="danger" icon="trash" loading={mazu} onClick={smaz}>Smazat</Button>
        </>}>
        <p className="t-meta">Účtenka zmizí z Financí i z knihy výdajů. Fotka se smaže s ní.</p>
        {chyba && <p role="alert" className="note note-danger mt-3">{chyba}</p>}
      </Modal>
    </>
  );
}

/** Okno „Účtenky" v hlavičce administrace: nová účtenka a pod ní posledních třicet. */
export default function ReceiptsPanel() {
  const smi = useSmi();
  const data = useDataWidgetu(URL_UCTENEK, vyberUctenky);
  const smiPridat = smi('finance.uctenky_pridat');
  return (
    <div className="space-y-5">
      {smiPridat && <NovaUctenka />}
      {data.error ? (
        <ErrorState compact title="Účtenky se nenačetly" detail={data.error} onRetry={data.reload} />
      ) : data.loading ? (
        <div className="space-y-2"><Skeleton className="h-12" /><Skeleton className="h-12 w-2/3" /></div>
      ) : (data.data?.length ?? 0) > 0 && (
        <div>
          <p className="t-label mb-1">Poslední účtenky</p>
          <SeznamUctenek uctenky={data.data!} limit={30} sFotkou smiMazat={smi('finance.uctenky_upravit')} />
        </div>
      )}
    </div>
  );
}
