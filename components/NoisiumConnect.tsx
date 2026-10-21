'use client';

// Propojení s Noisium (Tým › Integrace).
//
// Audit 2026-10 (V48): sekce byla jediná v Týmu ještě ve starém kabátě — glass-card,
// ručně psané pilulky a tlačítka, `confirm()` při odpojení, čeština natvrdo bez
// překladu a hlavně bez vysvětlení: „Noisium" člověk, který ho nezná, nezařadí.
// Teď: jedna věta, co propojení dělá a k čemu je, stav jako Chip, formulář z Field,
// odpojení přes okno s důsledkem a chyba načtení s „Zkusit znovu" (dřív výpadek
// vypadal jako „nepřipojeno" a nabízel nové připojení).

import { useEffect, useState } from 'react';
import { Button, Card, Chip, ErrorState, Field, Input, Modal, Skeleton } from './ui';
import { apiMessage, okJson } from '@/lib/api';
import { useT } from '@/lib/i18n/client';

type Stav = { connected: boolean; projectId: string | null };

export default function NoisiumConnect() {
  const t = useT('tym');
  const [stav, setStav] = useState<Stav | null>(null);
  const [chybaNacteni, setChybaNacteni] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [chybiToken, setChybiToken] = useState(false);
  const [odpojit, setOdpojit] = useState(false);

  const load = async () => {
    setChybaNacteni(null);
    try {
      const d = await fetch('/api/noisium').then(okJson);
      setStav({ connected: !!d?.connected, projectId: d?.projectId ?? null });
    } catch (e) {
      setChybaNacteni(apiMessage(e, t('Stav propojení se nenačetl.')));
    }
  };
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!token.trim()) { setChybiToken(true); return; }
    setChybiToken(false); setErr(''); setMsg(''); setBusy(true);
    try {
      const d = await fetch('/api/noisium', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim(), baseUrl: baseUrl.trim() || undefined }),
      }).then(okJson);
      setMsg(t('Připojeno — v Noisium vznikl projekt „{nazev}“.', { nazev: d?.projectName ?? '' }));
      setToken('');
      await load();
    } catch (e2) {
      setErr(apiMessage(e2, t('Připojení se nepovedlo. Zkontroluj token a zkus to znovu.')));
    }
    setBusy(false);
  };

  const disconnect = async () => {
    setBusy(true); setErr('');
    try {
      await fetch('/api/noisium', { method: 'DELETE' }).then(okJson);
      setMsg('');
      setOdpojit(false);
      await load();
    } catch (e) {
      setErr(apiMessage(e, t('Odpojení se nepovedlo. Zkus to znovu.')));
      setOdpojit(false);
    }
    setBusy(false);
  };

  return (
    <Card className="space-y-4" data-noisium="">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="t-card">{t('Propojení s Noisium')}</h3>
          <p className="t-meta mt-1 text-pretty">
            {t('Noisium je samostatná aplikace na plánování projektů. Po propojení má každá karta v Plánování tlačítko Publikovat a pošle se do Noisium jako úkol — bez přepisování.')}
          </p>
        </div>
        {stav?.connected && <Chip tone="ok" size="sm" icon="check">{t('Připojeno')}</Chip>}
      </div>

      {msg && <p className="note note-ok" role="status">{msg}</p>}
      {err && <p className="note note-danger" role="alert">{err}</p>}

      {chybaNacteni ? (
        <ErrorState compact vlevo title={t('Stav propojení se nenačetl')} detail={chybaNacteni} onRetry={() => { void load(); }} />
      ) : !stav ? (
        <Skeleton className="h-24" />
      ) : stav.connected ? (
        <div className="space-y-3">
          <p className="text-sm text-black/70 text-pretty">
            {stav.projectId
              ? t('Projekt v Noisium je propojený (ID {id}). V Plánování teď máš u karet tlačítko Publikovat.', { id: stav.projectId })
              : t('Projekt v Noisium je propojený. V Plánování teď máš u karet tlačítko Publikovat.')}
          </p>
          <Button variant="secondary" className="w-full sm:w-auto" disabled={busy} onClick={() => setOdpojit(true)}>{t('Odpojit Noisium')}</Button>
        </div>
      ) : (
        <form onSubmit={connect} className="sloupec sloupec-4">
          <Field id="noisium-token" label={t('API token')} hint={t('Vytvoříš ho v Noisium: Nastavení → API tokeny. Ukáže se jen jednou.')}
            error={chybiToken ? t('Vlož API token z Noisium.') : undefined}>
            <Input id="noisium-token" value={token} onChange={e => { setToken(e.target.value); if (e.target.value.trim()) setChybiToken(false); }}
              placeholder="tymbr_xxxxxxxxxxxxx" autoComplete="off" aria-invalid={chybiToken || undefined} />
          </Field>
          <Field id="noisium-url" label={t('Adresa API (nepovinné)')} hint={t('Jen když máš Noisium na vlastní adrese.')}>
            <Input id="noisium-url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://noisium.app/api" inputMode="url" />
          </Field>
          <Button type="submit" variant="primary" className="w-full sm:w-auto" loading={busy}>{t('Připojit Noisium')}</Button>
        </form>
      )}

      {odpojit && (
        <Modal open onClose={() => setOdpojit(false)} size="sm" title={t('Odpojit Noisium?')}
          subtitle={t('Token se smaže a tlačítko Publikovat z Plánování zmizí. Co už v Noisium je, tam zůstane.')}
          footer={<>
            <Button variant="secondary" onClick={() => setOdpojit(false)} disabled={busy}>{t('Zpět')}</Button>
            <Button variant="danger-solid" loading={busy} onClick={() => { void disconnect(); }}>{t('Odpojit')}</Button>
          </>}>
          <p className="t-meta">{t('Propojit znovu jde kdykoli novým tokenem.')}</p>
        </Modal>
      )}
    </Card>
  );
}
