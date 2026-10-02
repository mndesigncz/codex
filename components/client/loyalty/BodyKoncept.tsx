'use client';

// Koncept a verze pravidel bodů a úrovní. Změny jde uložit jako koncept (hosté o něm nevědí, platí dosavadní
// pravidla), pak je „Použít pravidla…“ ukáže jako rozdíl před → po s poznámkou k verzi a zapíše novou verzi.
// Přímé „Uložit“ v hlavičce stránky dál funguje a zapíše verzi taky. Server: /api/client/admin/loyalty/pravidla.

import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Chip, EmptyState, Field, Modal, Textarea } from '../../ui';
import { useMoney } from '../../CurrencyProvider';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { apiMessage, okJson } from '@/lib/api';
import { popisZmenyPravidel } from '@/lib/bodyPravidla';
import type { StavPravidel } from '@/lib/pravidlaVerze';
import { j } from '../import/typy';

/** Koncept a verze pravidel ze serveru; `null`, dokud se nenačtou (nebo když se nepovede, pak panel zmizí). */
export function useKoncept() {
  const [stav, setStav] = useState<StavPravidel | null>(null);
  const reload = useCallback(() => fetch('/api/client/admin/loyalty/pravidla').then(okJson).then(d => {
    if (!d?.platna || !Array.isArray(d?.verzeSeznam)) throw new Error('nečekaný tvar');
    setStav(d as StavPravidel);
  }).catch(() => setStav(null)), []);
  useEffect(() => { void reload(); }, [reload]);
  return { stav, setStav, reload };
}

export function KonceptPanel({ stav, telo, meni, maMax, toast, onZmena }: {
  stav: StavPravidel; telo: Record<string, unknown>; meni: boolean; maMax: boolean;
  toast: (m: string) => void; onZmena: () => void;
}) {
  const money = useMoney();
  const [busy, setBusy] = useState<'' | 'koncept' | 'pouzit' | 'zahodit'>('');
  const [okno, setOkno] = useState(false);
  const [poznamka, setPoznamka] = useState('');
  const [chyba, setChyba] = useState('');
  const zaklad = stav.koncept ?? stav.platna;
  // Co se změnilo ve formuláři oproti uloženému konceptu (nebo platným pravidlům) a co oproti platným pravidlům.
  const oprotiKonceptu = popisZmenyPravidel(zaklad, telo, money);
  const oprotiPlatnym = popisZmenyPravidel(stav.platna, telo, money);
  const muze = meni && maMax;

  const ulozKoncept = async (): Promise<boolean> => {
    try { await j('/api/client/admin/loyalty/pravidla', { method: 'PUT', body: JSON.stringify({ action: 'save', ...telo }) }); return true; }
    catch (e) { setChyba(apiMessage(e, 'Koncept se nepodařilo uložit.')); return false; }
  };
  const koncept = async () => {
    setBusy('koncept'); setChyba('');
    if (await ulozKoncept()) { toast('Koncept je uložený. Hosté zatím vidí platná pravidla.'); onZmena(); }
    setBusy('');
  };
  const pouzit = async () => {
    setBusy('pouzit'); setChyba('');
    try {
      if (oprotiKonceptu.length > 0 && !(await ulozKoncept())) { setBusy(''); return; }
      await j('/api/client/admin/loyalty/pravidla', { method: 'PUT', body: JSON.stringify({ action: 'publish', note: poznamka }) });
      toast('Nová pravidla platí. Už připsané body se nepřepočítávají.');
      setOkno(false); setPoznamka(''); onZmena();
    } catch (e) { setChyba(apiMessage(e, 'Pravidla se nepodařilo použít.')); }
    setBusy('');
  };
  const zahodit = async () => {
    setBusy('zahodit'); setChyba('');
    try { await j('/api/client/admin/loyalty/pravidla', { method: 'PUT', body: JSON.stringify({ action: 'discard' }) }); toast('Koncept je zahozený.'); onZmena(); }
    catch (e) { setChyba(apiMessage(e, 'Koncept se nepodařilo zahodit.')); }
    setBusy('');
  };

  return (
    <Card className="space-y-3" aria-labelledby="pr-koncept">
      <div>
        <h2 id="pr-koncept" className="t-card">Koncept pravidel</h2>
        <p className="t-meta mt-0.5 max-w-[70ch]">Změny můžeš nejdřív uložit jako koncept: hosté o něm nevědí a platí dosavadní pravidla. „Použít pravidla…“ ukáže, co se změní, a zapíše novou verzi. Už připsané body se nepřepočítávají.</p>
      </div>
      {stav.koncept && (
        <div className="well space-y-1" role="status">
          <p className="text-sm font-medium">Máš rozpracovaný koncept{stav.konceptOd ? ` z ${dbTimeDayHM(stav.konceptOd)}` : ''}.</p>
          {stav.konceptZmeny.length > 0
            ? <ul className="text-sm text-black/70 list-disc pl-5">{stav.konceptZmeny.map(z => <li key={z}>{z}</li>)}</ul>
            : <p className="t-meta">Je stejný jako platná pravidla.</p>}
        </div>
      )}
      {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" loading={busy === 'koncept'} disabled={!muze || oprotiKonceptu.length === 0} onClick={() => { void koncept(); }}>Uložit koncept</Button>
        <Button type="button" variant="primary" loading={busy === 'pouzit'} disabled={!muze || (oprotiPlatnym.length === 0)} onClick={() => { setChyba(''); setOkno(true); }}>Použít pravidla…</Button>
        {stav.koncept && <Button type="button" variant="ghost" loading={busy === 'zahodit'} disabled={!muze} onClick={() => { void zahodit(); }}>Zahodit koncept</Button>}
      </div>
      {okno && (
        <Modal open onClose={() => setOkno(false)} size="md" title="Použít pravidla?"
          footer={<>
            <Button variant="secondary" onClick={() => setOkno(false)}>Zrušit</Button>
            <Button variant="primary" loading={busy === 'pouzit'} onClick={() => { void pouzit(); }}>Použít</Button>
          </>}>
          <div className="space-y-3">
            <p className="text-sm text-black/70">Od teď platí tyhle změny (před → po):</p>
            <ul className="text-sm list-disc pl-5 space-y-0.5">{oprotiPlatnym.map(z => <li key={z}>{z}</li>)}</ul>
            <p className="t-meta">Už připsané body, kredit a odměny se nepřepočítávají, nová pravidla platí pro další připsání.</p>
            <Field id="pr-poznamka" label="Poznámka k verzi" hint="Nepovinné. Uvidíš ji v seznamu verzí.">
              <Textarea id="pr-poznamka" rows={2} maxLength={200} value={poznamka} onChange={e => setPoznamka(e.target.value)} />
            </Field>
            {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
          </div>
        </Modal>
      )}
    </Card>
  );
}

export function VerzePravidel({ stav }: { stav: StavPravidel }) {
  return (
    <Card pad="none" aria-labelledby="pr-verze">
      <div className="px-5 pt-4">
        <h2 id="pr-verze" className="t-card">Verze pravidel</h2>
        <p className="t-meta mt-0.5">Platí verze {stav.verze}. Každá změna pravidel zapíše novou verzi s tím, co se změnilo.</p>
      </div>
      {stav.verzeSeznam.length === 0 ? (
        <div className="px-5 pb-5"><EmptyState icon="clock" compact title="Zatím žádná změna" hint="První změna pravidel se tu objeví jako verze 2." /></div>
      ) : (
        <ul className="list px-5 pb-2">
          {stav.verzeSeznam.map(v => (
            <li key={v.id} className="py-3 space-y-0.5">
              <p className="flex items-center gap-2 text-[15px] font-medium"><span>Verze {v.version}</span>{v.source === 'koncept' && <Chip tone="muted" size="sm">z konceptu</Chip>}</p>
              <p className="t-meta">{[dbTimeDayHM(v.created_at), v.changed_by_name, v.note].filter(Boolean).join(' · ')}</p>
              {v.changes.length > 0 && <ul className="text-[13px] text-black/70 list-disc pl-5 break-words">{v.changes.map(z => <li key={z}>{z}</li>)}</ul>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
