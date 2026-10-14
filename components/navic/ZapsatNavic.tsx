'use client';

// Okno „Zapsat navíc" (kolo 9, N1 — balík Z): co člověk na směně udělal nad rámec
// povinností. Jedno okno pro všechna místa — Domů (widget Navíc), Moje směny (u směny),
// uzávěrka (po uložení), tablet (souhrn po odchodu, za vybraného člověka), detail úkolu.
//
// Nahoře pilulky z nabídky vedení („Vytřít sklad · 20 b" — klepnutí předvyplní text a
// připne offerId; u položky „uzná se samo" to člověk vidí hned), textarea s počítadlem
// do 500 znaků, den (výchozí dnes nebo den směny; zaměstnanec nejvýš 14 dní zpětně,
// vedení libovolně), nepovinná fotka stejnou cestou jako u úkolů (lib/clientImage →
// POST /api/upload, náhled). Hlášky validace jsou tytéž, co vrací server (lib/navic),
// chyba serveru se ukáže větou pod polem (409 limitu srozumitelně, jak ho server napsal).
// Rozepsaný text se neztratí: Modal se při uklepnutí ptá (DiscardGuard přes useModal).
// Po uložení Toast „Zapsáno — čeká na uznání" / „Zapsáno a uznáno: +15 b" (toast žije
// mimo okno, ať přežije jeho zavření) a obnoví se všechna data /api/navic (obnovNavic).
//
// `upravit`: úprava vlastního čekajícího zápisu (PATCH /api/navic/[id]) ve stejném okně.
// `actingAs`: tablet nikdy neposílá zápis bez vybraného člověka.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Field, Input, Modal, Textarea, Toast } from '../ui';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';
import { useT } from '@/lib/i18n/client';
import { apiMessage, okJson } from '@/lib/api';
import { pragueToday } from '@/lib/pragueTime';
import {
  DNI_ZPETNE, MAX_DELKA_TEXTU, URL_NAVIC, platnaFotkaNavic, posunDni, validujZapis, vyberNavic, zapisyDne,
  type NabidkaNavic, type Navic,
} from '@/lib/navic';
import { NabidkaChipy, prelozChybu } from './NabidkaChipy';
import { chybiPovinnaFotka, obsazeneNabidky, odmenaKratce, predvyplnitText, urlUkolyZaBody } from './logika';
import { obnovNavic, urlNavicMine, useDataNavic, useUkolyZaBody } from './data';

export interface PredvolbyNavic {
  /** RRRR-MM-DD; výchozí dnes. */
  day?: string | null;
  shiftId?: number | null;
  closingId?: number | null;
  taskId?: number | null;
  text?: string | null;
  offerId?: number | null;
  /**
   * Úkol za body, ze kterého se zapisuje („Hotovo" v UkolyZaBody, kolo 11): kdyby v nabídce
   * z /api/navic chyběl, okno z něj pořád ví body a jestli je fotka povinná.
   */
  nabidka?: NabidkaNavic | null;
}

export function ZapsatNavic({ open, onClose, predvolby, actingAs = null, userId, jmeno, upravit = null, onUlozeno }: {
  open: boolean;
  onClose: () => void;
  predvolby?: PredvolbyNavic | null;
  /** Tablet: za koho se zapisuje (vybraný člověk u tabletu). */
  actingAs?: number | null;
  /** Vedení: zápis za člena (jen s navic.uznat). */
  userId?: number | null;
  /** Jméno člověka, za kterého se zapisuje (tablet) — do podtitulku. */
  jmeno?: string | null;
  /** Úprava vlastního čekajícího zápisu místo nového. */
  upravit?: Navic | null;
  onUlozeno?: (item: Navic) => void;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const dnes = pragueToday();
  // Nabídka a dnešní zápisy (limit za den) z téže odpovědi, kterou drží widgety; dotaz až s otevřeným oknem.
  const data = useDataNavic(open ? urlNavicMine(actingAs) : null);
  const nabidka = data.data?.nabidka ?? [];
  const vedeni = data.data?.smi.uznat === true;
  // Kolo 11: úkoly za body dnes — plné (kapacita) se v pilulkách vypnou s „Obsazeno". Sdílená adresa s widgetem.
  const ukoly = useUkolyZaBody(open ? urlUkolyZaBody(actingAs) : null);
  const obsazene = useMemo(() => obsazeneNabidky(ukoly.data ?? []), [ukoly.data]);
  const dnesni = useMemo(() => zapisyDne(data.data?.items ?? [], dnes).filter(z => !upravit || z.id !== upravit.id), [data.data, dnes, upravit]);

  const [text, setText] = useState('');
  const [den, setDen] = useState(dnes);
  const [offerId, setOfferId] = useState<number | null>(null);
  const [fotka, setFotka] = useState<string | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [chybaFotky, setChybaFotky] = useState<string | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [nahravam, setNahravam] = useState(false);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const vstup = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Každé otevření začíná od předvoleb (jiná směna, jiný úkol) — ne od toho, co zbylo minule.
  useEffect(() => {
    if (!open) return;
    const z = upravit;
    setText(z?.text ?? predvolby?.text ?? '');
    setDen(z?.day ?? predvolby?.day ?? pragueToday());
    setOfferId(z?.offerId ?? predvolby?.offerId ?? null);
    setFotka(z?.photoUrl ?? null);
    setChyba(null);
    setChybaFotky(null);
    setUkladam(false);
    setNahravam(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const vybrana: NabidkaNavic | null = offerId != null
    ? nabidka.find(n => n.id === offerId) ?? (predvolby?.nabidka?.id === offerId ? predvolby.nabidka : null)
    : null;
  // Úkol „jen s fotkou": bez fotky by server vrátil 400 — řekne se to dřív, u tlačítka fotky.
  const fotkaPovinna = vybrana?.requirePhoto === true;
  const vyberNabidku = (n: NabidkaNavic) => {
    if (offerId === n.id) { setOfferId(null); return; }
    setOfferId(n.id);
    // Předvyplní text názvem položky, když člověk ještě nic nenapsal (nebo tam je jen název jiné položky).
    if (predvyplnitText(text, nabidka)) setText(n.title);
    setChyba(null);
    textRef.current?.focus({ preventScroll: true });
  };

  const nahraj = async (soubor: File | null) => {
    if (!soubor) return;
    setNahravam(true);
    setChyba(null);
    try {
      const { compressImage } = await import('@/lib/clientImage');
      const fd = new FormData();
      fd.append('file', await compressImage(soubor));
      const d = await fetch('/api/upload', { method: 'POST', body: fd }).then(okJson);
      if (platnaFotkaNavic(d?.url)) { setFotka(d.url); setChybaFotky(null); }
      else setChyba(t('Fotku se nepodařilo nahrát.'));
    } catch (e) {
      setChyba(apiMessage(e, t('Fotku se nepodařilo nahrát — zkontroluj připojení.')));
    }
    setNahravam(false);
    if (vstup.current) vstup.current.value = '';
  };

  const uloz = async () => {
    if (ukladam || nahravam) return;
    const telo = {
      text, day: den,
      shiftId: upravit?.shiftId ?? predvolby?.shiftId ?? null,
      closingId: upravit?.closingId ?? predvolby?.closingId ?? null,
      taskId: upravit?.taskId ?? predvolby?.taskId ?? null,
      offerId, photoUrl: fotka,
    };
    // Stejná pravidla jako na serveru — hláška je vidět dřív, než požadavek odejde.
    const v = validujZapis(telo, dnes, vedeni);
    if (!v.ok) { setChyba(prelozChybu(t, v.chyba)); return; }
    if (chybiPovinnaFotka(vybrana, fotka)) { setChybaFotky(t('Tenhle úkol chce fotku — vyfoť, co je hotové, jinak ho zapsat nejde.')); return; }
    setUkladam(true);
    setChyba(null);
    try {
      const res = await fetch(upravit ? `${URL_NAVIC}/${upravit.id}` : URL_NAVIC, {
        method: upravit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...v.zapis, ...(actingAs ? { actingAs } : {}), ...(userId ? { userId } : {}) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setChyba(typeof d?.error === 'string' ? d.error : t('Zápis se neuložil.'));
        setUkladam(false);
        return;
      }
      const item = vyberNavic({ items: [d?.item] })[0] ?? null;
      const id = Date.now();
      if (upravit) setToast({ text: t('Zápis je upravený.'), id });
      else if (item?.status === 'uznano') setToast({ text: t('Zapsáno a uznáno: {odmena}', { odmena: odmenaKratce(item, money) || t('bez odměny') }), id });
      else setToast({ text: t('Zapsáno — čeká na uznání.'), id });
      obnovNavic();
      setUkladam(false);
      if (item) onUlozeno?.(item);
      onClose();
    } catch (e) {
      setChyba(apiMessage(e, t('Zápis se neuložil — zkontroluj připojení.')));
      setUkladam(false);
    }
  };

  const min = vedeni ? undefined : posunDni(dnes, -DNI_ZPETNE);
  const delka = text.length;

  return (
    <>
      <Modal open={open} onClose={onClose} size="md"
        title={upravit ? t('Upravit zápis navíc') : t('Zapsat navíc')}
        subtitle={jmeno ? t('Za: {jmeno}', { jmeno }) : t('Co jsi udělal(a) nad rámec směny — vedení to uvidí a může to ocenit.')}
        footer={<>
          <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
          <Button variant="primary" icon="check" loading={ukladam} disabled={nahravam} onClick={() => void uloz()}>{upravit ? t('Uložit') : t('Zapsat')}</Button>
        </>}>
        <div className="space-y-4" data-zapsat-navic>
          {nabidka.length > 0 && (
            <div>
              <NabidkaChipy nabidka={nabidka} dnesniZapisy={dnesni} vybrane={offerId} onVyber={vyberNabidku} money={money}
                obsazene={obsazene} label={t('Co se dá udělat navíc')} />
              {vybrana && (
                <p className="t-meta mt-2 text-pretty" data-vybrana-nabidka={vybrana.id}>
                  {vybrana.autoApprove
                    ? t('{odmena} — uzná se samo hned po zapsání.', { odmena: odmenaKratce(vybrana, money) || t('bez odměny') })
                    : t('{odmena} po uznání vedením.', { odmena: odmenaKratce(vybrana, money) || t('bez odměny') })}
                  {vybrana.description ? ` ${vybrana.description}` : ''}
                  {vybrana.requirePhoto ? ` ${t('Bez fotky to zapsat nejde.')}` : ''}
                </p>
              )}
            </div>
          )}
          <Field id="navic-text" label={t('Co bylo navíc?')} error={chyba}
            hint={<span className="flex justify-between gap-2"><span>{t('Jedna dvě věty — co, případně pro koho.')}</span><span className="tabular-nums shrink-0" aria-live="polite" data-pocitadlo>{delka}/{MAX_DELKA_TEXTU}</span></span>}>
            <Textarea id="navic-text" ref={textRef} value={text} rows={3} maxLength={MAX_DELKA_TEXTU} autoFocus={!nabidka.length}
              onChange={e => { setText(e.target.value); if (chyba) setChyba(null); }}
              placeholder={t('Např. vytřel(a) jsem sklad, zaskočil(a) za kolegu, vyřešil(a) reklamaci…')} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field id="navic-den" label={t('Den')} hint={vedeni ? undefined : t('Nejvýš {n} dní zpětně.', { n: DNI_ZPETNE })}>
              <Input id="navic-den" type="date" value={den} min={min} max={dnes} onChange={e => { setDen(e.target.value); if (chyba) setChyba(null); }} />
            </Field>
            <div className="min-w-0">
              <p className="field-label">{fotkaPovinna ? t('Fotka (povinná)') : t('Fotka (nepovinná)')}</p>
              <input ref={vstup} type="file" accept="image/*" capture="environment" className="hidden" aria-hidden tabIndex={-1}
                onChange={e => void nahraj(e.target.files?.[0] ?? null)} />
              {fotka ? (
                <div className="flex items-center gap-2 min-w-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fotka} alt={t('Náhled fotky')} className="block h-11 w-11 shrink-0 rounded-xl object-cover" />
                  <Button variant="ghost" size="sm" icon="camera" loading={nahravam} onClick={() => vstup.current?.click()}>{t('Jinou')}</Button>
                  <Button variant="ghost" size="sm" iconOnly icon="close" aria-label={t('Odebrat fotku')} onClick={() => setFotka(null)} />
                </div>
              ) : (
                <Button variant="secondary" block icon="camera" loading={nahravam} onClick={() => vstup.current?.click()} className="w-full"
                  aria-describedby={chybaFotky ? 'navic-fotka-chyba' : undefined}>
                  {t('Vyfotit / nahrát')}
                </Button>
              )}
              {chybaFotky && <p id="navic-fotka-chyba" role="alert" className="text-[13px] text-bad-ink mt-1.5 text-pretty" data-chyba-fotky>{chybaFotky}</p>}
            </div>
          </div>
          {upravit && (
            <p className="t-meta flex items-start gap-1.5 text-pretty">
              <Icon name="info" size={13} className="shrink-0 mt-0.5" />
              <span>{t('Upravit jde jen zápis, který ještě čeká na uznání.')}</span>
            </p>
          )}
        </div>
      </Modal>
      <Toast message={toast?.text ?? null} id={toast?.id} onClose={() => setToast(null)} />
    </>
  );
}

export default ZapsatNavic;
