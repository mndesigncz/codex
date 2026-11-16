'use client';

// Akce nad trestem pro všechny seznamy vedení (kolo 10, balík V): „Trest platí dál"
// (PATCH { disputeHandled: true } — nesouhlas vyřízený, trest zůstává), „Zrušit trest"
// (okno s nepovinným důvodem → PATCH { status: 'zruseno', note }; body i krácení se
// vrátí, záznam zůstane) a „Upravit" (okno Dát trest v režimu úprav). Jeden háček,
// ať widget, profil člena i detail uzávěrky dělají totéž stejně.

import React, { useCallback, useState } from 'react';
import { MAX_DELKA_POZNAMKY, type Trest } from '@/lib/tresty';
import { apiMessage, okJson } from '@/lib/api';
import { useT } from '@/lib/i18n/client';
import { Button, Field, Input, Modal, Toast } from '../ui';
import { useMoney } from '../CurrencyProvider';
import type { SrazkaTrestu } from '@/lib/trestyPenize';
import { useOpravneni } from '../role/useOpravneni';
import { obnovPenize } from '../tresty-penize/data';
import { obnovTresty } from './data';
import { DatTrest, NadPlochou } from './DatTrest';
import { pozadejZnovu, UpravaSrazky, ZmenitZaskok } from './PenizeRadku';
import { dopadTrestu, type AkceSrazky } from './TrestRadek';

/** Okno zrušení trestu: co se ruší a nepovinný důvod (člověk ho uvidí v oznámení i u trestu). */
export function ZrusitTrest({ x, onClose, onHotovo, nadOkny = false }: {
  x: Trest;
  onClose: () => void;
  onHotovo?: (item: Trest) => void;
  nadOkny?: boolean;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const [duvod, setDuvod] = useState('');
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const uloz = async () => {
    if (ukladam) return;
    setUkladam(true); setChyba(null);
    try {
      const d = await fetch(`/api/tresty/${x.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'zruseno', ...(duvod.trim() ? { note: duvod.trim() } : {}) }),
      }).then(okJson);
      obnovTresty();
      obnovPenize();
      onHotovo?.((d?.item ?? { ...x, status: 'zruseno' }) as Trest);
      onClose();
    } catch (e) {
      setChyba(apiMessage(e, t('Zrušení se neuložilo.')));
    } finally {
      setUkladam(false);
    }
  };
  return (
    <NadPlochou>
    <Modal open onClose={onClose} size="sm" title={t('Zrušit trest')} subtitle={x.userName} nadOkny={nadOkny}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Nechat platit')}</Button>
        <Button variant="danger-solid" onClick={() => { void uloz(); }} loading={ukladam}>{t('Zrušit trest')}</Button>
      </>}>
      <div className="space-y-4" data-zrusit-trest>
        <p className="well px-3 py-2 text-sm text-[#16181A] text-pretty">{x.text}</p>
        <p className="text-sm text-black/70 text-pretty">
          {t('Vrátí se {dopad}. Záznam zůstane jako zrušený a {jmeno} dostane oznámení.', { dopad: dopadTrestu(t, x, money), jmeno: x.userName })}
        </p>
        <Field id="trest-duvod-zruseni" label={t('Důvod (nepovinný)')} hint={t('Člověk ho uvidí u trestu i v oznámení.')}>
          <Input id="trest-duvod-zruseni" value={duvod} onChange={e => setDuvod(e.target.value)} maxLength={MAX_DELKA_POZNAMKY}
            placeholder={t('Např. lednice má vadné těsnění')} autoFocus />
        </Field>
        {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
      </div>
    </Modal>
    </NadPlochou>
  );
}

/** Háček: obsluha akcí řádku a okna, která k nim patří (vykreslit `okna` jednou pod seznamem). */
export function useAkceTrestu({ nadOkny = false, onZmena }: { nadOkny?: boolean; onZmena?: () => void } = {}) {
  const t = useT('widgety');
  const { nacteno, ma } = useOpravneni();
  const smiPenize = nacteno && ma('finance.mzdy');
  const [pracuji, setPracuji] = useState<number | null>(null);
  const [rusim, setRusim] = useState<Trest | null>(null);
  const [upravuji, setUpravuji] = useState<Trest | null>(null);
  const [srazka, setSrazka] = useState<{ x: Trest; s: SrazkaTrestu; akce: 'snizit' | 'zrusit' } | null>(null);
  const [zaskok, setZaskok] = useState<Trest | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad'; id: number } | null>(null);

  // Kolo 96: peníze u trestu (finance.mzdy) — srážka (snížit / zrušit / znovu o souhlas) a záskok.
  const onSrazka = useCallback((x: Trest, s: SrazkaTrestu, akce: AkceSrazky) => {
    if (akce !== 'znovu') { setSrazka({ x, s, akce }); return; }
    setPracuji(x.id);
    void pozadejZnovu(t, s, x.userName).then(r => {
      setToast({ ...r, id: Date.now() });
      setPracuji(null);
      if (r.tone === 'ok') onZmena?.();
    });
  }, [t, onZmena]);

  const platiDal = useCallback(async (x: Trest) => {
    setPracuji(x.id);
    try {
      await fetch(`/api/tresty/${x.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disputeHandled: true }),
      }).then(okJson);
      obnovTresty();
      setToast({ text: t('Trest platí dál — nesouhlas je vyřízený.'), tone: 'ok', id: Date.now() });
      onZmena?.();
    } catch (e) {
      setToast({ text: apiMessage(e, t('Nepodařilo se uložit.')), tone: 'bad', id: Date.now() });
    } finally {
      setPracuji(null);
    }
  }, [t, onZmena]);

  const okna = (
    <>
      {rusim && (
        <ZrusitTrest x={rusim} nadOkny={nadOkny} onClose={() => setRusim(null)}
          onHotovo={() => { setToast({ text: t('Trest zrušen — body i krácení se vrátily.'), tone: 'ok', id: Date.now() }); onZmena?.(); }} />
      )}
      <DatTrest open={!!upravuji} upravit={upravuji} nadOkny={nadOkny} onClose={() => setUpravuji(null)} onUlozeno={() => onZmena?.()} />
      {srazka && (
        <UpravaSrazky x={srazka.x} s={srazka.s} akce={srazka.akce} nadOkny={nadOkny} onClose={() => setSrazka(null)}
          onHotovo={text => { setToast({ text, tone: 'ok', id: Date.now() }); onZmena?.(); }} />
      )}
      {zaskok && (
        <ZmenitZaskok x={zaskok} nadOkny={nadOkny} onClose={() => setZaskok(null)}
          onHotovo={text => { setToast({ text, tone: 'ok', id: Date.now() }); onZmena?.(); }} />
      )}
      <Toast message={toast?.text ?? null} tone={toast?.tone} id={toast?.id} onClose={() => setToast(null)} />
    </>
  );

  return {
    pracuji,
    platiDal: (x: Trest) => { void platiDal(x); },
    zrusit: (x: Trest) => setRusim(x),
    upravit: (x: Trest) => setUpravuji(x),
    /** Props pro TrestRadek: akce nad penězi (jen s finance.mzdy). */
    penize: { smiPenize, onSrazka, onZaskok: (x: Trest) => setZaskok(x) },
    okna,
  };
}
