'use client';

// Odměna v penězích (kolo 96, sada V) — přidat peníze je stejně snadné jako je strhnout: jednomu
// i víc lidem najednou, se stejným výběrem lidí jako okno „Dát trest" (zaškrtávání, celá směna dne,
// filtr role). Otvírá se z widgetů, kde se dnes dávají odměny (Pochvaly, Navíc v týmu) a z widgetu
// Tresty v týmu. POST /api/wage-adjustments/davka (finance.mzdy): „každý X" nebo „rozpočítat X",
// den (ne do budoucna; v uzavřeném období server posune na první otevřený), za co, a jestli je to
// nenároková prémie (výchozí — dá se z ní krátit trestem), nebo mzda / ostatní. Po uložení toast
// s „Vzít zpět" (DELETE ?batchId=).

import React, { useEffect, useState } from 'react';
import { MAX_ODMENA, castkyDavky, validujOdmenu } from '@/lib/trestyPenize';
import { apiMessage } from '@/lib/api';
import { useT } from '@/lib/i18n/client';
import { pragueToday } from '@/lib/pragueTime';
import { Button, Field, Input, Modal, Segmented, Toast } from '../ui';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { useOpravneni } from '../role/useOpravneni';
import { hromadnaOdmena, urlVyberu, useVyberLidi, vezmiOdmenuZpet } from '../tresty-penize/data';
import { NadPlochou } from './DatTrest';
import { prelozHlaskuTrestu } from './hlasky';
import { VyberLidi } from './VyberLidi';

export function OdmenaVKc({ open, onClose, predvybrani, nadOkny = false }: {
  open: boolean;
  onClose: () => void;
  /** Lidé vybraní předem (profil, řádek). */
  predvybrani?: number[];
  nadOkny?: boolean;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const symbol = useSymbol();
  const dnes = pragueToday();
  const [ids, setIds] = useState<number[]>([]);
  const [castka, setCastka] = useState('');
  const [rozpocitat, setRozpocitat] = useState(false);
  const [text, setText] = useState('');
  const [den, setDen] = useState(dnes);
  const [nenarokova, setNenarokova] = useState(true);
  const [chyba, setChyba] = useState<string | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad'; id: number; batchId?: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    setIds(predvybrani ?? []); setCastka(''); setRozpocitat(false); setText(''); setDen(pragueToday()); setNenarokova(true);
    setChyba(null); setUkladam(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const vyber = useVyberLidi(open && den <= dnes ? urlVyberu(den) : null);
  const n = Number(castka) || 0;
  const castky = ids.length ? castkyDavky(n, ids.length, ids.length > 1 && rozpocitat) : [];
  const celkem = castky.reduce((a, x) => a + x, 0);

  const uloz = async () => {
    if (ukladam) return;
    const telo = { userIds: ids, castka: n, rozpocitat: ids.length > 1 && rozpocitat, day: den, text, nenarokova };
    const v = validujOdmenu(telo, dnes);
    if (!v.ok) { setChyba(prelozHlaskuTrestu(t, v.chyba)); return; }
    setUkladam(true); setChyba(null);
    try {
      const d = await hromadnaOdmena(telo);
      const batchId = Number(d?.batchId) || undefined;
      setToast({ text: ids.length > 1 ? t('Odměna připsána {n} lidem — celkem {castka}.', { n: ids.length, castka: money(celkem) }) : t('Odměna {castka} připsána.', { castka: money(celkem) }), tone: 'ok', id: Date.now(), batchId });
      onClose();
    } catch (e) {
      setChyba(prelozHlaskuTrestu(t, apiMessage(e, t('Odměna se neuložila.'))));
    } finally {
      setUkladam(false);
    }
  };
  const zpet = async (batchId: number) => {
    try {
      await vezmiOdmenuZpet(batchId);
      setToast({ text: t('Odměna vzatá zpět.'), tone: 'ok', id: Date.now() });
    } catch (e) {
      setToast({ text: prelozHlaskuTrestu(t, apiMessage(e, t('Nepodařilo se uložit.'))), tone: 'bad', id: Date.now() });
    }
  };
  const jmeno = (id: number) => vyber.data?.lide.find(l => l.id === id)?.name ?? '';

  return (
    <NadPlochou>
      <Modal open={open} onClose={onClose} size="md" nadOkny={nadOkny} title={t('Odměna v penězích')}
        subtitle={t('Prémie k výplatě jednomu i víc lidem najednou — každý dostane oznámení.')}
        footer={<>
          <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
          <Button variant="primary" icon="check" loading={ukladam} disabled={!ids.length} onClick={() => { void uloz(); }}>
            {ids.length > 1 ? t('Připsat {n} lidem', { n: ids.length }) : t('Připsat odměnu')}
          </Button>
        </>}>
        <div className="sloupec sloupec-4" data-odmena-kc>
          <VyberLidi id="odmena-lide" data={vyber.data} loading={vyber.loading} vybrani={ids} onChange={x => { setIds(x); setChyba(null); }}
            den={den} label={t('Komu')} ariaLabel={t('Komu odměna patří')} />
          <div className="grid grid-cols-2 gap-3">
            <Field id="odmena-castka" label={ids.length > 1 ? (rozpocitat ? t('Celkem') : t('Každému')) : t('Částka')}>
              <div className="relative">
                <Input id="odmena-castka" type="number" inputMode="numeric" min={1} max={MAX_ODMENA} step={1} value={castka}
                  onChange={e => { setCastka(e.target.value.replace(/\D/g, '')); setChyba(null); }} className="tabular-nums pr-12" />
                <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">{symbol}</span>
              </div>
            </Field>
            <Field id="odmena-den" label={t('Den')}>
              <Input id="odmena-den" type="date" value={den} max={dnes} className="appearance-none min-w-0" onChange={e => setDen(e.target.value)} />
            </Field>
          </div>
          {ids.length > 1 && (
            <Segmented ariaLabel={t('Jak rozdělit částku')} value={rozpocitat ? 'rozpocitat' : 'kazdy'} onChange={v => setRozpocitat(v === 'rozpocitat')}
              options={[{ id: 'kazdy', label: t('Každý stejně') }, { id: 'rozpocitat', label: t('Rozpočítat') }]} />
          )}
          <Field id="odmena-text" label={t('Za co')} hint={t('Uvidí to v oznámení i u výplaty.')}>
            <Input id="odmena-text" value={text} maxLength={200} onChange={e => { setText(e.target.value); setChyba(null); }}
              placeholder={t('Např. inventura v neděli navíc')} />
          </Field>
          <div className="min-w-0">
            <Segmented ariaLabel={t('Druh odměny')} value={nenarokova ? 'premie' : 'mzda'} onChange={v => setNenarokova(v === 'premie')}
              options={[{ id: 'premie', label: t('Nenároková prémie') }, { id: 'mzda', label: t('Mzda / ostatní') }]} />
            <p className="t-meta text-pretty mt-1.5">
              {nenarokova ? t('Z nenárokové prémie jde v tom měsíci krátit trestem.') : t('Mzda a ostatní příplatky se trestem krátit nedají.')}
            </p>
          </div>
          {celkem > 0 && (
            <div className="well px-3 py-2.5 text-sm text-[#16181A] tabular-nums" data-odmena-souhrn aria-live="polite">
              <p className="t-label mb-1.5">{t('Souhrn')}</p>
              <ul className="sloupec sloupec-1">
                {ids.slice(0, 8).map((id, i) => <li key={id}>{t('{jmeno} dostane +{castka}', { jmeno: jmeno(id), castka: money(castky[i] ?? 0) })}</li>)}
                {ids.length > 8 && <li className="text-black/60">{t('…a dalších {n}', { n: ids.length - 8 })}</li>}
                {ids.length > 1 && <li className="text-black/60">{t('Celkem {castka}', { castka: money(celkem) })}</li>}
              </ul>
            </div>
          )}
          {chyba && <p className="note note-danger text-sm text-pretty" role="alert">{chyba}</p>}
        </div>
      </Modal>
      <Toast message={toast?.text ?? null} tone={toast?.tone} id={toast?.id} onClose={() => setToast(null)}
        action={toast?.batchId ? { label: t('Vzít zpět'), onClick: () => { const b = toast.batchId!; setToast(null); void zpet(b); } } : undefined} />
    </NadPlochou>
  );
}

/** Tlačítko „Odměna v Kč" s oknem — jen s finance.mzdy (jinak se nekreslí). */
export function OdmenaVKcTlacitko({ variant = 'ghost', className = '' }: { variant?: 'ghost' | 'secondary'; className?: string }) {
  const t = useT('widgety');
  const { nacteno, ma } = useOpravneni();
  const [open, setOpen] = useState(false);
  if (!(nacteno && ma('finance.mzdy'))) return null;
  return (
    <>
      <Button variant={variant} icon="coins" className={className} onClick={() => setOpen(true)} data-odmena-kc-otevrit="">{t('Odměna v Kč')}</Button>
      <OdmenaVKc open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export default OdmenaVKc;
