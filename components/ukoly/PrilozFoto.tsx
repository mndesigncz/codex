'use client';

// Okno „Přilož fotku" — kolo 7 (R7-4, nález ukol-foto-dukaz).
//
// Úkol s „Vyžadovat fotku při splnění" (tasks.require_photo) se nesplní bez fotky.
// Vymáhá to server (PATCH /api/tasks vrátí 400), tohle okno je jediná cesta, jak
// fotku přiložit — jedno pro všechna místa odškrtnutí: Úkoly vedení i zaměstnance,
// widget Úkoly na dnes / na týden a tablet (tam za vybraného člověka, `zaKoho`).
// Vzor: Jolt „Photo required" u položky checklistu, Connecteam podúkol typu Image.
//
// Obsluha fotí telefonem: skrytý input s `capture="environment"` otevře rovnou zadní
// fotoaparát (na počítači výběr souboru), fotka se zmenší v prohlížeči
// (lib/clientImage — 12 MB z fotoaparátu by přes limit těla požadavku neprošlo)
// a nahraje přes existující POST /api/upload. „Označit jako hotový" je aktivní až
// s nahranou fotkou; chyba nahrání i uložení zůstane v okně, nic se tiše nezahodí.
// Jen jedna fotka, ne galerie. Na telefonu okno vyjede zdola (to dělá Modal sám).

import { useRef, useState } from 'react';
import { Button, Modal } from '../ui';
import { useT } from '@/lib/i18n/client';
import { apiMessage, okJson } from '@/lib/api';
import { platnaFotka } from '@/lib/ukolyPrehled';

export function PrilozFoto({ nazev, zaKoho, onClose, onHotovo }: {
  /** Název úkolu (podtitulek okna). */
  nazev: string;
  /** Na tabletu: za koho se úkol splní (vybraný člověk u tabletu). */
  zaKoho?: string | null;
  onClose: () => void;
  /** Uloží splnění s fotkou; vrátí hlášku chyby, nebo null (volající pak okno zavře). */
  onHotovo: (url: string) => Promise<string | null>;
}) {
  const t = useT('widgety');
  const vstup = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [nahravam, setNahravam] = useState(false);
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const nahraj = async (soubor: File | null) => {
    if (!soubor) return;
    setNahravam(true);
    setChyba(null);
    try {
      const { compressImage } = await import('@/lib/clientImage');
      const fd = new FormData();
      fd.append('file', await compressImage(soubor));
      const d = await fetch('/api/upload', { method: 'POST', body: fd }).then(okJson);
      if (platnaFotka(d?.url)) setUrl(d.url);
      else setChyba(t('Fotku se nepodařilo nahrát.'));
    } catch (e) {
      setChyba(apiMessage(e, t('Fotku se nepodařilo nahrát — zkontroluj připojení.')));
    }
    setNahravam(false);
    // Stejnou fotku jde vybrat znovu (change by se jinak nespustil).
    if (vstup.current) vstup.current.value = '';
  };

  const potvrd = async () => {
    if (!url || ukladam) return;
    setUkladam(true);
    setChyba(null);
    const hlaska = await onHotovo(url);
    if (hlaska) { setChyba(hlaska); setUkladam(false); }
  };

  return (
    <Modal open onClose={onClose} size="sm" title={t('Přilož fotku')} subtitle={nazev}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
        <Button variant="primary" icon="check" loading={ukladam} disabled={!url || nahravam} onClick={() => void potvrd()}>{t('Označit jako hotový')}</Button>
      </>}>
      <div className="space-y-3">
        <p className="text-sm text-black/70 text-pretty">{t('U tohoto úkolu chce vedení fotku jako důkaz, že je hotovo.')}</p>
        {zaKoho && <p className="t-meta">{t('Splní se za: {jmeno}', { jmeno: zaKoho })}</p>}
        <input ref={vstup} type="file" accept="image/*" capture="environment" className="hidden" aria-hidden tabIndex={-1}
          onChange={e => void nahraj(e.target.files?.[0] ?? null)} />
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={t('Náhled fotky')} className="block rounded-2xl max-h-48 w-auto max-w-full" />
        )}
        <Button variant="secondary" size="lg" block icon="camera" loading={nahravam} onClick={() => vstup.current?.click()}>
          {url ? t('Vyfotit znovu') : t('Vyfotit / nahrát')}
        </Button>
        {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
      </div>
    </Modal>
  );
}

export default PrilozFoto;
