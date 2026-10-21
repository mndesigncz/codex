'use client';

// Okno rozhodnutí o zápisu „navíc" (kolo 9, balík V): Uznat (body s krokovačem ±5,
// prémie v měně podniku, poznámka; 0 bodů = uznáno bez odměny) a Odmítnout
// (důvod, nepovinný). PATCH /api/navic/[id]; po uložení se obnoví všechna data
// navíc i body (obnovNavic). Hlášky serveru se ukážou pod poli (apiMessage).
//
// Kreslí se do <body> (NadPlochou): z widgetu by pod transformovanou buňkou
// mřížky `fixed` počítalo od karty; nad profilem člena a detailem uzávěrky
// (vlastní překryv z-80) dostane `nadOkny`.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { MAX_BODU, MAX_DELKA_POZNAMKY, MAX_PREMIE, type Navic } from '@/lib/navic';
import { apiMessage, okJson } from '@/lib/api';
import { useT } from '@/lib/i18n/client';
import { Button, Field, Input, Modal, Rada } from '../ui';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { obnovNavic } from './data';
import { krokBodu, teloOdmitnuti, teloUznani, uznaniVMezich } from './logika';

export type AkceNavic = 'uznat' | 'odmitnout';

/** Portál do <body> se značkou pro plochu (klepnutí v okně není gesto nad widgetem). */
export function NadPlochou({ children }: { children: React.ReactNode }) {
  const [cil, setCil] = useState<HTMLElement | null>(null);
  useEffect(() => { setCil(document.body); }, []);
  return cil ? createPortal(<div data-plocha-chrom="">{children}</div>, cil) : null;
}

export function UznatNavic({ zapis, akce, onClose, onHotovo, nadOkny = false }: {
  zapis: Navic;
  akce: AkceNavic;
  onClose: () => void;
  /** Po uložení: nový tvar zápisu ze serveru. */
  onHotovo?: (item: Navic, akce: AkceNavic) => void;
  nadOkny?: boolean;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const symbol = useSymbol();
  const [body, setBody] = useState<string>(String(zapis.pointsProposed ?? 0));
  const [premie, setPremie] = useState<string>('');
  const [poznamka, setPoznamka] = useState('');
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const uznavam = akce === 'uznat';
  const vMezich = !uznavam || uznaniVMezich(body, premie, MAX_PREMIE);
  const bodyCislo = Number(body) || 0;
  const premieCislo = Number(premie) || 0;
  const bezOdmeny = uznavam && bodyCislo === 0 && premieCislo === 0;

  const uloz = async () => {
    if (ukladam || !vMezich) return;
    setUkladam(true); setChyba(null);
    try {
      const d = await fetch(`/api/navic/${zapis.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(uznavam ? teloUznani(body, premie, poznamka) : teloOdmitnuti(poznamka)),
      }).then(okJson);
      obnovNavic();
      onHotovo?.((d?.item ?? zapis) as Navic, akce);
      onClose();
    } catch (e) {
      setChyba(apiMessage(e, uznavam ? t('Uznání se neuložilo.') : t('Odmítnutí se neuložilo.')));
    } finally {
      setUkladam(false);
    }
  };

  const titulek = uznavam ? t('Uznat navíc') : t('Odmítnout navíc');
  return (
    <NadPlochou>
      <Modal open onClose={onClose} size="sm" title={titulek} subtitle={zapis.userName} nadOkny={nadOkny}
        footer={<>
          <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
          {uznavam
            ? <Button variant="primary" icon="check" onClick={() => { void uloz(); }} loading={ukladam} disabled={!vMezich}>{bezOdmeny ? t('Uznat bez odměny') : t('Uznat')}</Button>
            : <Button variant="danger-solid" onClick={() => { void uloz(); }} loading={ukladam}>{t('Odmítnout')}</Button>}
        </>}>
        <div className="sloupec sloupec-4" data-uznat-navic={akce}>
          {/* Co se rozhoduje — text zápisu, ať člověk nemusí hádat, ke kterému řádku okno patří. */}
          <p className="well px-3 py-2 text-sm text-[#16181A] text-pretty">{zapis.text}</p>
          {uznavam ? (
            <>
              {/* Body a prémie jako dvojice polí ½ + ½ (V6); krokovač řada 52 jako pole vedle. */}
              <div className="grid grid-cols-2 gap-3">
                <Field id="navic-body" label={t('Body')}
                  hint={zapis.pointsProposed != null && zapis.pointsProposed > 0 ? t('Z nabídky: {n} b. Nula = uznáno bez bodů.', { n: zapis.pointsProposed }) : t('0–{max}; nula = uznáno bez bodů.', { max: MAX_BODU })}>
                  <Rada vyska="l" className="[&>input]:!px-1">
                    <Button variant="secondary" size="lg" iconOnly icon="minus" aria-label={t('Méně bodů')} disabled={bodyCislo <= 0} className="tap-target !w-auto"
                      onClick={() => setBody(String(krokBodu(body, -1)))} />
                    <Input id="navic-body" type="number" inputMode="numeric" min={0} max={MAX_BODU} step={1} value={body}
                      onChange={e => setBody(e.target.value.replace(/\D/g, ''))} className="text-center tabular-nums" autoFocus />
                    <Button variant="secondary" size="lg" iconOnly icon="plus" aria-label={t('Víc bodů')} disabled={bodyCislo >= MAX_BODU} className="tap-target !w-auto"
                      onClick={() => setBody(String(krokBodu(body, 1)))} />
                  </Rada>
                </Field>
                <Field id="navic-premie" label={t('Prémie k výplatě')} hint={t('Nepovinné; zapíše se jako prémie ve výplatě.')}>
                  <div className="relative">
                    <Input id="navic-premie" type="number" inputMode="numeric" min={0} max={MAX_PREMIE} step={1} value={premie}
                      onChange={e => setPremie(e.target.value.replace(/\D/g, ''))} className="tabular-nums pr-12" />
                    <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">{symbol}</span>
                  </div>
                </Field>
              </div>
              <Field id="navic-poznamka" label={t('Poznámka pro člověka')} hint={t('Uvidí ji v oznámení a u zápisu.')}>
                <Input id="navic-poznamka" value={poznamka} onChange={e => setPoznamka(e.target.value)} maxLength={MAX_DELKA_POZNAMKY}
                  placeholder={t('Např. díky, přesně takhle')} />
              </Field>
              {!vMezich && <p className="note note-danger text-sm" role="alert">{t('Body 0–{body}, prémie nejvýš {premie}.', { body: MAX_BODU, premie: money(MAX_PREMIE) })}</p>}
            </>
          ) : (
            <Field id="navic-duvod" label={t('Důvod')} hint={t('Nepovinný; člověk ho uvidí u zápisu i v oznámení.')}>
              <Input id="navic-duvod" value={poznamka} onChange={e => setPoznamka(e.target.value)} maxLength={MAX_DELKA_POZNAMKY}
                placeholder={t('Např. patří k běžným úkolům směny')} autoFocus />
            </Field>
          )}
          {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
        </div>
      </Modal>
    </NadPlochou>
  );
}

export default UznatNavic;
