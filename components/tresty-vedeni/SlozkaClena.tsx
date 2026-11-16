'use client';

// Nenároková složka výplaty člena (kolo 96, sada V) — v profilu člena uvnitř sekce Tresty
// (TrestyClena). Řádek „Nenároková složka: 10 % ze mzdy (součást sazby)" (čte finance.mzdy) a okno
// k nastavení (finance.sazby_upravit, jako sazba a smlouva): typ (žádná / % ze mzdy / Kč za hodinu /
// Kč za měsíc), hodnota a jestli je součástí dnešní sazby, nebo se platí navíc.
// Data: GET|PUT /api/payroll/slozka (useSlozka, ulozSlozku z components/tresty-penize/data.ts).

import React, { useEffect, useState } from 'react';
import { MAX_SLOZKA, type NastaveniSlozky, type TypSlozky } from '@/lib/trestyPenize';
import { apiMessage } from '@/lib/api';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { Button, Field, Input, Modal, Segmented, Skeleton, Toast } from '../ui';
import { VolbaDil } from '../ui/Volby';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { useOpravneni } from '../role/useOpravneni';
import { ulozSlozku, urlSlozky, useSlozka } from '../tresty-penize/data';
import { NadPlochou } from './DatTrest';
import { prelozHlaskuTrestu } from './hlasky';

/** „10 % ze mzdy (součást sazby)" / „30 Kč/h (navíc ke mzdě)" / „Bez nenárokové složky" — přeložené. */
export function popisSlozkyT(t: PrekladFn, n: NastaveniSlozky | null, money: (x: number) => string): string {
  if (!n) return t('Bez nenárokové složky');
  const co = n.typ === 'pct' ? t('{n} % ze mzdy', { n: String(n.hodnota).replace('.', ',') })
    : n.typ === 'kc_hod' ? t('{castka} za hodinu', { castka: money(n.hodnota) }) : t('{castka} za měsíc', { castka: money(n.hodnota) });
  return n.vSazbe ? t('{co} (součást sazby)', { co }) : t('{co} (navíc ke mzdě)', { co });
}

type Volba = TypSlozky | 'zadna';

function OknoSlozky({ clovek, slozka, onClose, onHotovo }: {
  clovek: { id: number; jmeno: string };
  slozka: NastaveniSlozky | null;
  onClose: () => void;
  onHotovo: (text: string) => void;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const symbol = useSymbol();
  const [typ, setTyp] = useState<Volba>(slozka?.typ ?? 'zadna');
  const [hodnota, setHodnota] = useState(slozka ? String(slozka.hodnota).replace('.', ',') : '');
  const [vSazbe, setVSazbe] = useState(slozka?.vSazbe ?? true);
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const volby: { id: Volba; text: string }[] = [
    { id: 'zadna', text: t('Žádná') },
    { id: 'pct', text: t('% ze mzdy') },
    { id: 'kc_hod', text: t('Za hodinu') },
    { id: 'kc_mesic', text: t('Za měsíc') },
  ];
  const uloz = async () => {
    if (ukladam) return;
    const n = Number(hodnota.replace(',', '.'));
    let nova: NastaveniSlozky | null = null;
    if (typ !== 'zadna') {
      if (!Number.isFinite(n) || n <= 0 || n > MAX_SLOZKA[typ]) {
        setChyba(prelozHlaskuTrestu(t, typ === 'pct' ? 'Procento musí být větší než 0 a nejvýš 100.' : 'Částka nenárokové složky musí být kladná.'));
        return;
      }
      nova = { typ, hodnota: n, vSazbe };
    }
    setUkladam(true); setChyba(null);
    try {
      await ulozSlozku(clovek.id, nova);
      onHotovo(nova ? t('Nenároková složka uložena: {popis}.', { popis: popisSlozkyT(t, nova, money) }) : t('Nenároková složka zrušena.'));
      onClose();
    } catch (e) {
      setChyba(prelozHlaskuTrestu(t, apiMessage(e, t('Nepodařilo se uložit.'))));
    } finally {
      setUkladam(false);
    }
  };
  const jednotka = typ === 'pct' ? '%' : typ === 'kc_hod' ? `${symbol}/h` : symbol;
  return (
    <NadPlochou>
      <Modal open onClose={onClose} size="sm" nadOkny title={t('Nenároková složka')} subtitle={clovek.jmeno}
        footer={<>
          <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
          <Button variant="primary" icon="check" loading={ukladam} onClick={() => { void uloz(); }}>{t('Uložit')}</Button>
        </>}>
        <div className="sloupec sloupec-4" data-slozka-okno>
          <p className="text-sm text-black/70 text-pretty">
            {t('Nenároková složka je část výplaty, kterou jde krátit trestem — nároková mzda zůstane vždy celá.')}
          </p>
          <div className="min-w-0">
            <p className="field-label">{t('Jak se počítá')}</p>
            <div className="grid grid-cols-2 gap-2" role="group" aria-label={t('Jak se počítá')}>
              {volby.map(v => <VolbaDil key={v.id} vybrano={typ === v.id} onClick={() => { setTyp(v.id); setChyba(null); }} data-slozka-typ={v.id}>{v.text}</VolbaDil>)}
            </div>
          </div>
          {typ !== 'zadna' && (
            <>
              <Field id="slozka-hodnota" label={typ === 'pct' ? t('Kolik procent mzdy') : typ === 'kc_hod' ? t('Kolik za hodinu') : t('Kolik za měsíc')} error={chyba}>
                <div className="relative">
                  <Input id="slozka-hodnota" inputMode="decimal" value={hodnota} autoFocus
                    onChange={e => { setHodnota(e.target.value.replace(/[^\d,.]/g, '')); setChyba(null); }} className="tabular-nums pr-16" />
                  <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">{jednotka}</span>
                </div>
              </Field>
              <div className="min-w-0">
                <Segmented ariaLabel={t('Vůči sazbě')} value={vSazbe ? 'sazba' : 'navic'} onChange={v => setVSazbe(v === 'sazba')}
                  options={[{ id: 'sazba', label: t('Součást sazby') }, { id: 'navic', label: t('Navíc ke mzdě') }]} />
                <p className="t-meta text-pretty mt-1.5">
                  {vSazbe ? t('Výplata se nezmění — jen se z ní tahle část označí jako nenároková.') : t('Platí se navíc ke mzdě z hodin.')}
                </p>
                {/* Část dnešní mzdy nejde prohlásit za nenárokovou jednostranně — musí to tak stát ve smlouvě / mzdovém výměru. */}
                {vSazbe && (
                  <p className="note note-wait text-sm text-pretty mt-2" data-slozka-smlouva>
                    {t('Platí jen tehdy, když ji tak má člověk ve smlouvě nebo mzdovém výměru. Jinak je to nároková mzda a krátit ji nejde.')}
                  </p>
                )}
              </div>
            </>
          )}
          {typ === 'zadna' && chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
        </div>
      </Modal>
    </NadPlochou>
  );
}

/** Řádek a tlačítko „Nenároková složka" v sekci Tresty profilu člena. Bez finance.mzdy se nekreslí. */
export function SlozkaClena({ clovek, onZmena }: { clovek: { id: number; jmeno: string }; onZmena?: () => void }) {
  const t = useT('widgety');
  const money = useMoney();
  const { nacteno, ma } = useOpravneni();
  const smiCist = nacteno && ma('finance.mzdy');
  const smiUpravit = nacteno && ma('finance.sazby_upravit');
  const data = useSlozka(smiCist ? urlSlozky(clovek.id) : null);
  const [okno, setOkno] = useState(false);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => { setOkno(false); }, [clovek.id]);
  if (!smiCist) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5" data-slozka-clena>
      {data.loading && data.data === undefined ? <Skeleton className="h-5 w-48" /> : (
        <p className="min-w-0 text-sm text-black/70 text-pretty">
          <span className="font-semibold text-[#16181A]">{t('Nenároková složka')}:</span>{' '}
          {data.error ? t('nenačetla se') : popisSlozkyT(t, data.data ?? null, money)}
        </p>
      )}
      {smiUpravit && (
        <Button variant="ghost" size="sm" icon="pencil" className="tap-target" onClick={() => setOkno(true)}
          aria-label={t('Nastavit nenárokovou složku: {jmeno}', { jmeno: clovek.jmeno })}>{t('Nastavit')}</Button>
      )}
      {okno && <OknoSlozky clovek={clovek} slozka={data.data ?? null} onClose={() => setOkno(false)}
        onHotovo={text => { setToast({ text, id: Date.now() }); data.reload(); onZmena?.(); }} />}
      <Toast message={toast?.text ?? null} id={toast?.id} onClose={() => setToast(null)} />
    </div>
  );
}

export default SlozkaClena;
