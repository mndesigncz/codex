'use client';

// Kousky razítek pro čtečky u kasy (Kartička hosta a Čtečka): idempotenční klíč
// akce, rozdělané karty s oknem platnosti a vypršením, ruční položky a storno
// poslední akce. Obě čtečky berou odsud totéž, ať se nerozejdou.

import { useRef, useState } from 'react';
import { Button, Modal, Well } from '../../ui';
import { czCount, type CzNoun } from '@/lib/czech';
import { czDatum } from '@/lib/razitkaPravidla';
import { novyKlic } from '@/lib/idempotenceKlic';

const RAZITKO: CzNoun = { one: 'razítko', few: 'razítka', many: 'razítek' };
const KUS: CzNoun = { one: 'kus', few: 'kusy', many: 'kusů' };

/**
 * Klíč akce u kasy. Stejná akce (stejný otisk: host, druh, částka, účtenka, položky)
 * dostane při opakování po výpadku sítě STEJNÝ klíč, takže ji server připíše jednou.
 * Po úspěchu nebo odmítnutí (4xx) se klíč zahodí, další klepnutí je nová akce.
 */
export function useKlicAkce() {
  const ref = useRef<{ otisk: string; klic: string } | null>(null);
  return {
    klic(otisk: string): string {
      if (ref.current?.otisk !== otisk) ref.current = { otisk, klic: novyKlic() };
      return ref.current.klic;
    },
    hotovo() { ref.current = null; },
    /** Po chybě: klíč zůstane jen při výpadku sítě nebo chybě serveru (5xx), ne po odmítnutí. */
    pochybe(status: number | null) { if (status != null && status < 500) ref.current = null; },
  };
}

/** Hlavičky POST akce u kasy: JSON a Idempotency-Key. */
export const hlavickyAkce = (klic: string): Record<string, string> => ({ 'Content-Type': 'application/json', 'Idempotency-Key': klic });

/** Upozornění po akci: vypršelá karta (expiredCount) a razítka, která se nevešla (lost). */
export function UpozorneniRazitek({ expiredCount, lost }: { expiredCount?: number; lost?: number }) {
  const e = Number(expiredCount) || 0; const l = Number(lost) || 0;
  if (!e && !l) return null;
  return (
    <div role="status" className="note note-wait space-y-0.5" data-testid="razitka-upozorneni">
      {e > 0 && <p>Rozdělaná karta hosta vypršela, propadlo {czCount(e, RAZITKO)}. Další razítko začíná novou kartu.</p>}
      {l > 0 && <p>{czCount(l, RAZITKO)} se na kartu nevešlo a nepřipsalo se (limit kartičky).</p>}
    </div>
  );
}

/** Rozdělané karty hosta: průběh, okno platnosti, vypršení, cooldown. */
export function RazitkoKarty({ campaigns }: { campaigns: any[] }) {
  if (!campaigns?.length) return null;
  return (
    <div>
      <p className="t-label mb-1">Razítkové karty</p>
      <ul className="list">
        {campaigns.map((c: any) => (
          <li key={c.id} className="list-row flex-col items-stretch gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold min-w-0 truncate">{c.name}</p>
              <p className="text-[13px] font-semibold tabular-nums text-black/60 shrink-0">{c.stamps}/{c.required}</p>
            </div>
            <div className="flex gap-1" aria-hidden>
              {Array.from({ length: Math.min(c.required, 12) }).map((_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < c.stamps ? 'bg-[#C8F542]' : 'bg-black/[0.08]'}`} />
              ))}
            </div>
            <p className="t-meta">Do odměny{c.reward ? ` „${c.reward}"` : ''} ještě {czCount(Math.max(0, c.required - c.stamps), RAZITKO)}.{c.completed > 0 ? ` Dokončeno ${c.completed}×.` : ''}</p>
            {c.vyprsela && <p className="text-[13px] text-wait-ink">Rozdělaná karta vypršela ({czCount(c.vyprselaRazitek, RAZITKO)} propadne při dalším razítku).</p>}
            {!c.vyprsela && c.dosbiratDo && c.stamps > 0 && <p className="t-meta">Dosbírat do {czDatum(c.dosbiratDo)}{c.zbyvaDni === 0 ? ' (dnes naposledy)' : ''}.</p>}
            {!c.platiTed && c.okno && <p className="text-[13px] text-wait-ink">Razítko teď nedává — platí jen {c.okno}.</p>}
            {c.dalsiKartaOd && <p className="t-meta">Další kartu jde sbírat od {czDatum(c.dalsiKartaOd)}.</p>}
            {c.hotovoNavzdy && <p className="t-meta">Host dosáhl limitu dokončených karet, další razítka se nepřipisují.</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Ruční položky, když účtenka není v pokladně: obsluha klepne na položky, které host
 * koupil, a server z nich vyhodnotí kampaně jako z účtenky.
 */
export function RucniPolozky({ polozky, busy, onPripsat }: {
  polozky: { id: number; name: string }[]; busy: boolean; onPripsat: (items: { itemId: number; qty: number }[]) => void;
}) {
  const [otevreno, setOtevreno] = useState(false);
  const [mnozstvi, setMnozstvi] = useState<Record<number, number>>({});
  if (!polozky?.length) return null;
  const vybrane = Object.entries(mnozstvi).filter(([, q]) => q > 0).map(([id, qty]) => ({ itemId: Number(id), qty }));
  const celkem = vybrane.reduce((s, x) => s + x.qty, 0);
  const zmen = (id: number, d: number) => setMnozstvi(m => ({ ...m, [id]: Math.max(0, Math.min(99, (m[id] ?? 0) + d)) }));
  if (!otevreno) return <Button type="button" size="sm" variant="ghost" icon="plus" onClick={() => setOtevreno(true)}>Razítka z ručně zadaných položek</Button>;
  return (
    <Well pad="md" className="space-y-2" data-testid="rucni-polozky">
      <div className="flex items-center justify-between gap-2">
        <p className="t-label">Položky, které host koupil</p>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setOtevreno(false); setMnozstvi({}); }}>Zavřít</Button>
      </div>
      <ul className="list">
        {polozky.map(p => (
          <li key={p.id} className="list-row flex items-center justify-between gap-3">
            <span className="text-sm min-w-0 truncate">{p.name}</span>
            <span className="flex items-center gap-1.5 shrink-0">
              <button type="button" className="btn-icon" aria-label={`Ubrat ${p.name}`} disabled={!(mnozstvi[p.id] > 0)} onClick={() => zmen(p.id, -1)}>−</button>
              <span className="w-6 text-center text-sm font-semibold tabular-nums" aria-live="polite">{mnozstvi[p.id] ?? 0}</span>
              <button type="button" className="btn-icon" aria-label={`Přidat ${p.name}`} onClick={() => zmen(p.id, 1)}>+</button>
            </span>
          </li>
        ))}
      </ul>
      <Button type="button" variant="primary" icon="check" loading={busy} disabled={celkem === 0} onClick={() => onPripsat(vybrane)}>
        Připsat razítka ({czCount(celkem, KUS)})
      </Button>
      <p className="t-meta">Stejné pravidlo jako u účtenky z pokladny. Razítka se připíší jednou.</p>
    </Well>
  );
}

/** Storno poslední akce s razítky (s potvrzením). */
export function StornoRazitek({ posledni, busy, onStorno }: { posledni: { note: string; at: string } | null; busy: boolean; onStorno: () => void }) {
  const [ptam, setPtam] = useState(false);
  if (!posledni) return null;
  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="t-meta min-w-0 break-words">Poslední akce: {posledni.note}</p>
        <Button type="button" size="sm" variant="ghost" icon="undo" loading={busy} onClick={() => setPtam(true)}>Storno poslední akce</Button>
      </div>
      <Modal open={ptam} onClose={() => setPtam(false)} size="sm" title="Stornovat poslední akci s razítky?"
        footer={<>
          <Button variant="secondary" onClick={() => setPtam(false)}>Ne, nechat</Button>
          <Button variant="danger-solid" onClick={() => { setPtam(false); onStorno(); }}>Stornovat</Button>
        </>}>
        <p className="text-sm text-black/70 text-pretty">{posledni.note}</p>
        <p className="t-meta mt-2">Razítka se vrátí a neuplatněná odměna z té akce zmizí. Body a kredit z účtenky storno nemění.</p>
      </Modal>
    </>
  );
}
