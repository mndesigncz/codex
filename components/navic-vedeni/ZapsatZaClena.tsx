'use client';

// Okno „Zapsat za člena" (kolo 9, balík V): vedení zapíše navíc za člověka a rovnou
// ho uzná jedním krokem — POST /api/navic { userId, text, day, offerId?, uznat: { points,
// bonusCzk, note } }. Nahoře chipy z nabídky (předvyplní text a body), členové
// z /api/teams. Den smí vedení zapsat libovolně zpětně, ne do budoucna.

import React, { useState } from 'react';
import { MAX_BODU, MAX_DELKA_POZNAMKY, MAX_DELKA_TEXTU, MAX_PREMIE, URL_NAVIC, validujZapis, type NabidkaNavic, type Navic } from '@/lib/navic';
import { apiMessage, okJson } from '@/lib/api';
import { useT } from '@/lib/i18n/client';
import { pragueToday } from '@/lib/pragueTime';
import { Button, Field, Input, Modal, Select, Textarea } from '../ui';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { obnovNavic } from './data';
import { VolbaRadek, VolbyRadky } from '../ui/Volby';
import { prelozHlaskuNavic } from './hlasky';
import { uznaniVMezich } from './logika';

interface Clen { id: number; jmeno: string }
const vyberCleny = (raw: unknown): Clen[] => (Array.isArray((raw as { members?: unknown } | null)?.members) ? (raw as { members: any[] }).members : [])
  .map(m => ({ id: Number(m?.id), jmeno: String(m?.name ?? '') }))
  .filter(m => Number.isFinite(m.id) && m.jmeno)
  .sort((a, b) => a.jmeno.localeCompare(b.jmeno, 'cs'));

export function ZapsatZaClena({ nabidka, clovek, onClose, onHotovo }: {
  /** Platné položky nabídky (z GET /api/navic) — chipy nahoře. */
  nabidka: readonly NabidkaNavic[];
  /** Předvybraný člen (z profilu); bez něj se vybírá z týmu. */
  clovek?: { id: number; jmeno: string } | null;
  onClose: () => void;
  onHotovo?: (item: Navic) => void;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const symbol = useSymbol();
  const dnes = pragueToday();
  const lide = useDataWidgetu(clovek ? null : '/api/teams', vyberCleny);
  const [kdo, setKdo] = useState<string>(clovek ? String(clovek.id) : '');
  const [text, setText] = useState('');
  const [den, setDen] = useState(dnes);
  const [offerId, setOfferId] = useState<number | null>(null);
  const [body, setBody] = useState('10');
  const [premie, setPremie] = useState('');
  const [poznamka, setPoznamka] = useState('');
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const vMezich = uznaniVMezich(body, premie, MAX_PREMIE);
  const jde = kdo !== '' && text.trim().length >= 2 && vMezich;

  const zNabidky = (n: NabidkaNavic) => {
    if (offerId === n.id) { setOfferId(null); return; }
    setOfferId(n.id);
    setText(n.title);
    setBody(String(n.points));
    setPremie(n.bonusCzk ? String(n.bonusCzk) : '');
  };
  // Neaktivní „Zapsat a uznat" bez vysvětlení (audit 2026-10 V37): tlačítko je aktivní
  // a co chybí, řekne hláška u pole.
  const [zkouseno, setZkouseno] = useState(false);
  const chybiKdo = zkouseno && kdo === '';
  const chybiText = zkouseno && text.trim().length < 2;
  const uloz = async () => {
    if (ukladam) return;
    if (!jde) { setZkouseno(true); return; }
    const v = validujZapis({ text, day: den, offerId }, dnes, true);
    if (!v.ok) { setChyba(prelozHlaskuNavic(t, v.chyba)); return; }
    setUkladam(true); setChyba(null);
    try {
      const d = await fetch(URL_NAVIC, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: Number(kdo), text: v.zapis.text, day: v.zapis.day, offerId: v.zapis.offerId ?? undefined,
          uznat: { points: Number(body) || 0, bonusCzk: Number(premie) > 0 ? Number(premie) : null, note: poznamka.trim() || undefined },
        }),
      }).then(okJson);
      obnovNavic();
      onHotovo?.(d?.item as Navic);
      onClose();
    } catch (e) {
      setChyba(apiMessage(e, t('Zápis se neuložil.')));
    } finally {
      setUkladam(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="md" title={t('Zapsat navíc za člena')} subtitle={clovek?.jmeno ?? t('Zapíše se a rovnou uzná — bez fronty.')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
        <Button type="submit" form="zapsat-za-clena" variant="primary" icon="check" loading={ukladam}>{t('Zapsat a uznat')}</Button>
      </>}>
      <form id="zapsat-za-clena" className="sloupec sloupec-4" data-zapsat-za-clena onSubmit={e => { e.preventDefault(); void uloz(); }}>
        {!clovek && (
          <Field id="navic-kdo" label={t('Komu')} error={chybiKdo ? t('Vyber, komu zápis patří.') : undefined}>
            <Select id="navic-kdo" value={kdo} aria-invalid={chybiKdo || undefined} onChange={e => setKdo(e.target.value)} autoFocus>
              <option value="">{lide.loading ? t('Načítám členy…') : t('Vyber člena…')}</option>
              {(lide.data ?? []).map(m => <option key={m.id} value={m.id}>{m.jmeno}</option>)}
            </Select>
          </Field>
        )}
        {nabidka.length > 0 && (
          // Volby nabídky jako řádky L→R (název vlevo, body vpravo) — dřív zalamované pilulky (audit V03).
          <VolbyRadky label={t('Z nabídky')} ariaLabel={t('Co se dá udělat navíc')}>
            {nabidka.map(n => (
              <VolbaRadek key={n.id} vybrano={offerId === n.id} onClick={() => zNabidky(n)} titul={n.title} hodnota={`${n.points} b`} />
            ))}
          </VolbyRadky>
        )}
        <Field id="navic-text" label={t('Co bylo navíc?')} hint={t('{n} / {max}', { n: text.length, max: MAX_DELKA_TEXTU })}
          error={chybiText ? t('Napiš, co bylo navíc — aspoň pár slov.') : undefined}>
          <Textarea id="navic-text" rows={3} value={text} aria-invalid={chybiText || undefined} onChange={e => setText(e.target.value)} maxLength={MAX_DELKA_TEXTU}
            placeholder={t('Např. zaskočil za nemocného kolegu')} autoFocus={!!clovek} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="navic-den" label={t('Den')}>
            <Input id="navic-den" type="date" value={den} max={dnes} onChange={e => setDen(e.target.value)} className="appearance-none min-w-0" />
          </Field>
          <Field id="navic-body-za" label={t('Body')} hint={t('Nula = uznáno bez bodů.')}>
            <Input id="navic-body-za" type="number" inputMode="numeric" min={0} max={MAX_BODU} step={1} value={body}
              onChange={e => setBody(e.target.value.replace(/\D/g, ''))} className="tabular-nums" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="navic-premie-za" label={t('Prémie')}>
            <div className="relative">
              <Input id="navic-premie-za" type="number" inputMode="numeric" min={0} max={MAX_PREMIE} step={1} value={premie}
                onChange={e => setPremie(e.target.value.replace(/\D/g, ''))} className="tabular-nums pr-10" />
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">{symbol}</span>
            </div>
          </Field>
          <Field id="navic-poznamka-za" label={t('Poznámka')}>
            <Input id="navic-poznamka-za" value={poznamka} onChange={e => setPoznamka(e.target.value)} maxLength={MAX_DELKA_POZNAMKY} />
          </Field>
        </div>
        {!vMezich && <p className="note note-danger text-sm" role="alert">{t('Body 0–{body}, prémie nejvýš {premie}.', { body: MAX_BODU, premie: money(MAX_PREMIE) })}</p>}
        {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
      </form>
    </Modal>
  );
}

export default ZapsatZaClena;
