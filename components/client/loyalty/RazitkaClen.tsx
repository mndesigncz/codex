'use client';

// Razítka člena v administraci (jamka pod řádkem v Členech): rozdělané karty,
// ruční připsání / odebrání s důvodem a storno poslední akce. Mimo CardScan —
// u kasy se razítka dávají jen běžnou cestou. Připisovat smí jen
// vernost.razitka_upravit; vidět je může každý s vernost.zobrazit.

import { useCallback, useEffect, useState } from 'react';
import { Button, Field, Input, ListRow, Modal, Segmented, Select, Skeleton, Textarea } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { apiMessage, okJson } from '@/lib/api';
import { czCount, type CzNoun } from '@/lib/czech';
import { dbTimeDayHM } from '@/lib/pragueTime';

const RAZITKO: CzNoun = { one: 'razítko', few: 'razítka', many: 'razítek' };

type Hlaska = (m: string, tone?: 'ok' | 'bad') => void;
interface Karta {
  campaignId: number; nazev: string; potrebnych: number; razitek: number; dokonceno: number; stav: string;
  posledniUdalost: { id: number; kind: string; delta: number; completions: number; kdy: string; duvod: string | null } | null;
}

const DRUH: Record<string, string> = { earn: 'Razítko', manual: 'Ručně', expire: 'Vypršela karta' };

async function posli(body: unknown) {
  const r = await fetch('/api/client/admin/stamps/member', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Nepovedlo se.');
  return d;
}

export default function RazitkaClen({ customerId, oznam, onZmena }: { customerId: number; oznam: Hlaska; onZmena?: () => void }) {
  const smi = useOpravneni().ma('vernost.razitka_upravit');
  const [d, setD] = useState<{ karty: Karta[]; udalosti: any[] } | null>(null);
  const [chyba, setChyba] = useState(false);
  const [upravuji, setUpravuji] = useState<{ campaignId: number; smer: 'plus' | 'minus'; pocet: string; duvod: string } | null>(null);
  const [storno, setStorno] = useState<Karta | null>(null);
  const [busy, setBusy] = useState(false);
  const [chybaForm, setChybaForm] = useState('');

  const nacti = useCallback(() => {
    setChyba(false);
    fetch(`/api/client/admin/stamps/member?customerId=${customerId}`).then(okJson).then(setD).catch(() => setChyba(true));
  }, [customerId]);
  useEffect(() => { nacti(); }, [nacti]);

  if (chyba) return <div className="flex items-center gap-2"><p className="t-meta">Razítka se nenačetla.</p><Button size="sm" variant="ghost" onClick={nacti}>Zkusit znovu</Button></div>;
  if (!d) return <Skeleton className="h-10" />;
  if (d.karty.length === 0) return <p className="t-meta">Podnik zatím nemá razítkové kartičky. Založíš je ve Věrnosti.</p>;

  const delta = upravuji ? (upravuji.smer === 'minus' ? -1 : 1) * (Math.round(Number(upravuji.pocet)) || 0) : 0;
  const ulozit = async () => {
    if (!upravuji) return;
    setBusy(true); setChybaForm('');
    try {
      const r = await posli({ customerId, campaignId: upravuji.campaignId, delta, reason: upravuji.duvod });
      oznam(r.message); setUpravuji(null); nacti(); onZmena?.();
    } catch (e) { setChybaForm(apiMessage(e, 'Razítka se nepodařilo upravit.')); }
    setBusy(false);
  };
  const stornovat = async () => {
    if (!storno?.posledniUdalost) return;
    setBusy(true);
    try {
      const r = await posli({ action: 'undo', customerId, campaignId: storno.campaignId, eventId: storno.posledniUdalost.id });
      oznam(r.message); setStorno(null); nacti(); onZmena?.();
    } catch (e) { oznam(apiMessage(e, 'Storno se nepovedlo.'), 'bad'); setStorno(null); nacti(); }
    setBusy(false);
  };
  const lzeStornovat = (k: Karta) => !!k.posledniUdalost && ['earn', 'manual'].includes(k.posledniUdalost.kind);
  const kartaUpravy = upravuji ? d.karty.find(k => k.campaignId === upravuji.campaignId) : null;
  const pocetOk = Number.isInteger(Math.round(Number(upravuji?.pocet))) && Math.round(Number(upravuji?.pocet)) >= 1 && Math.round(Number(upravuji?.pocet)) <= 50;
  const duvodOk = (upravuji?.duvod.trim().length ?? 0) >= 3;

  return (
    <div>
      <p className="t-label mb-1.5">Razítka</p>
      <ul className="list">
        {d.karty.map(k => (
          <ListRow key={k.campaignId} as="div" title={k.nazev}
            meta={`${k.dokonceno}× dokončeno${k.stav !== 'active' ? ` · ${k.stav === 'draft' ? 'koncept' : k.stav === 'paused' ? 'pozastavená' : 'archiv'}` : ''}`}
            value={<>{k.razitek}<span className="text-xs font-medium text-black/50"> / {k.potrebnych}</span></>}
            actions={smi ? (
              <>
                <Button size="sm" variant="secondary" aria-label={`Upravit razítka: ${k.nazev}`} onClick={() => { setChybaForm(''); setUpravuji({ campaignId: k.campaignId, smer: 'plus', pocet: '1', duvod: '' }); }}>Razítka ±</Button>
                {lzeStornovat(k) && <Button size="sm" variant="ghost" aria-label={`Stornovat poslední akci: ${k.nazev}`} onClick={() => setStorno(k)}>Storno</Button>}
              </>
            ) : undefined} />
        ))}
      </ul>
      {d.udalosti.length > 0 && (
        <details className="mt-2">
          <summary className="t-meta cursor-pointer select-none">Poslední změny razítek</summary>
          <ul className="list mt-1">
            {d.udalosti.map((e: any) => (
              <ListRow key={e.id} as="div" className={e.undone_at ? 'opacity-50' : ''}
                title={`${e.kampan}: ${DRUH[e.kind] ?? e.kind}${e.undone_at ? ' (stornováno)' : ''}`}
                meta={[dbTimeDayHM(e.created_at), e.obsluha ? `zapsal(a) ${e.obsluha}` : null, e.reason].filter(Boolean).join(' · ')}
                value={<span className={Number(e.delta) > 0 ? 'text-ok-ink' : Number(e.delta) < 0 ? 'text-bad-ink' : 'text-black/45'}>{Number(e.delta) > 0 ? '+' : ''}{e.delta}{Number(e.completions) > 0 ? ' ✓' : ''}</span>} />
            ))}
          </ul>
        </details>
      )}
      {upravuji && kartaUpravy && (
        <Modal open onClose={() => setUpravuji(null)} size="sm" title="Upravit razítka" subtitle={`${kartaUpravy.nazev} · teď ${kartaUpravy.razitek} z ${kartaUpravy.potrebnych}`}
          footer={<>
            <Button variant="secondary" onClick={() => setUpravuji(null)}>Zrušit</Button>
            <Button type="submit" form="razitka-okno" variant="primary" loading={busy} disabled={!pocetOk || !duvodOk}>{upravuji.smer === 'plus' ? 'Připsat' : 'Odebrat'}</Button>
          </>}>
          <form id="razitka-okno" onSubmit={e => { e.preventDefault(); if (pocetOk && duvodOk) void ulozit(); }} className="space-y-4">
            <Field id="raz-kampan" label="Kartička">
              <Select id="raz-kampan" value={upravuji.campaignId} onChange={e => setUpravuji({ ...upravuji, campaignId: Number(e.target.value) })}>
                {d.karty.map(k => <option key={k.campaignId} value={k.campaignId}>{k.nazev}</option>)}
              </Select>
            </Field>
            <Segmented options={[{ id: 'plus', label: 'Připsat' }, { id: 'minus', label: 'Odebrat' }]} value={upravuji.smer} onChange={v => setUpravuji({ ...upravuji, smer: v as 'plus' | 'minus' })} size="sm" ariaLabel="Připsat nebo odebrat" />
            <Field id="raz-pocet" label="Kolik razítek" hint={upravuji.smer === 'plus' ? 'Obejde denní limit i omezení na dny a hodiny. Plná karta dá odměnu.' : 'Níž než na nulu to nejde; dokončené karty se nevracejí.'}>
              <Input id="raz-pocet" type="number" inputMode="numeric" min={1} max={50} className="!w-28" value={upravuji.pocet} onChange={e => setUpravuji({ ...upravuji, pocet: e.target.value })} autoFocus />
            </Field>
            <Field id="raz-duvod" label="Proč" hint="Povinné. Uvidíš to v deníku člena a v historii změn.">
              <Textarea id="raz-duvod" rows={2} maxLength={200} value={upravuji.duvod} onChange={e => setUpravuji({ ...upravuji, duvod: e.target.value })} placeholder="Třeba: razítko chybělo na účtence" />
            </Field>
            {upravuji.smer === 'minus' && Number(upravuji.pocet) > kartaUpravy.razitek && <p className="t-meta">Host má jen {czCount(kartaUpravy.razitek, RAZITKO)} — odebere se tolik.</p>}
            {chybaForm && <p role="alert" className="text-sm text-bad-ink">{chybaForm}</p>}
          </form>
        </Modal>
      )}
      {storno?.posledniUdalost && (
        <Modal open onClose={() => setStorno(null)} size="sm" title="Stornovat poslední akci?"
          footer={<>
            <Button variant="secondary" onClick={() => setStorno(null)}>Ponechat</Button>
            <Button variant="danger-solid" loading={busy} onClick={() => { void stornovat(); }}>Stornovat</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">
            {storno.nazev}: {DRUH[storno.posledniUdalost.kind] ?? 'akce'} {storno.posledniUdalost.delta > 0 ? '+' : ''}{storno.posledniUdalost.delta} z {dbTimeDayHM(storno.posledniUdalost.kdy)}.
            Karta se vrátí do stavu před touto akcí.{storno.posledniUdalost.completions > 0 ? ' Odměna za dokončenou kartu se hostovi odebere, pokud ji ještě neuplatnil.' : ''}
          </p>
        </Modal>
      )}
    </div>
  );
}
