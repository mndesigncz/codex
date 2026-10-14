'use client';

// Okno „Dát trest" (kolo 10, balík V) — jedno pro všechna místa: widget Tresty
// v týmu (i z návrhu), profil člena, detail uzávěrky (manko), hodnocení směny
// (výtka), Docházka (pozdní příchod) a úprava existujícího trestu.
//
//  - člověk: výběr z týmu (/api/teams), nebo předvyplněný (podtitulek okna);
//  - chipy sazebníku („Pozdní příchod · −10 b"): klepnutí = položka + body, krácení
//    a text; ukáže, kolikátý stejný prohřešek to člověk v měsíci má (poradiOpakovani);
//  - „Co se stalo?" (do 500), den (dnes, nejvýš 31 dní zpět), body dolů s krokovačem ±5,
//    krácení prémie v měně podniku se stropem z GET ?strop=1 (bez prémií pole vypnuté
//    s větou; vždy s větou, že se krátí jen prémie, ne mzda), nepovinná fotka;
//  - 0 bodů a 0 krácení = napomenutí (náhled pod poli, jiné tlačítko);
//  - validace stejná jako na serveru (validujTrest), 409 se stropem → věta pod krácením.
//
// Rozepsaný text okno neztratí: Escape, klik vedle i křížek se zeptají (Modal +
// DiscardGuard), chyba serveru nechá formulář, jak je. Okno se kreslí do <body>
// se značkou pro plochu (klepnutí v okně není gesto nad widgetem); nad profilem
// člena a detailem uzávěrky (vlastní překryv) dostane `nadOkny`. Toast zůstává
// i po zavření — volající má okno držet připojené a řídit ho přes `open`.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DNI_ZPETNE, MAX_BODU, MAX_DELKA_TEXTU, MAX_KRACENI, URL_DRUHY_TRESTU, druhProNavrh, platnaFotka, platnyDen, poradiOpakovani, posunDni, urlTresty,
  validujTrest, vyberTresty, type Trest,
} from '@/lib/tresty';
import { apiMessage, okJson } from '@/lib/api';
import { useT } from '@/lib/i18n/client';
import { pragueToday } from '@/lib/pragueTime';
import { Button, Field, Input, Modal, Select, Textarea, Toast } from '../ui';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { useOpravneni } from '../role/useOpravneni';
import { obnovTresty, urlStropu, useSazebnik, useStropKraceni, useTresty } from './data';
import { prelozHlaskuTrestu } from './hlasky';
import { krokBodu, kraceniVMezich, meniDopad, predvyplnitText, teloTrestu, teloUpravy, type FormularTrestu, type PredvolbyTrestu } from './logika';
import { dopadTrestu } from './TrestRadek';

interface Clen { id: number; jmeno: string }
const vyberCleny = (raw: unknown): Clen[] => (Array.isArray((raw as { members?: unknown } | null)?.members) ? (raw as { members: any[] }).members : [])
  .map(m => ({ id: Number(m?.id), jmeno: String(m?.name ?? '') }))
  .filter(m => Number.isFinite(m.id) && m.jmeno)
  .sort((a, b) => a.jmeno.localeCompare(b.jmeno, 'cs'));

/** Portál do <body> se značkou pro plochu (klepnutí v okně není gesto nad widgetem). */
export function NadPlochou({ children }: { children: React.ReactNode }) {
  const [cil, setCil] = useState<HTMLElement | null>(null);
  useEffect(() => { setCil(document.body); }, []);
  return cil ? createPortal(<div data-plocha-chrom="">{children}</div>, cil) : null;
}

export function DatTrest({ open, onClose, predvolby, upravit, onUlozeno, nadOkny = false }: {
  open: boolean;
  onClose: () => void;
  /** Předvyplnění (člověk, den, vazby na směnu / uzávěrku / úkol, text, položka sazebníku, klíč návrhu, body, krácení). */
  predvolby?: PredvolbyTrestu | null;
  /** Upravovaný trest (PATCH); bez něj se trest uděluje (POST). */
  upravit?: Trest | null;
  /** Po uložení: nový tvar trestu ze serveru. */
  onUlozeno?: (item: Trest) => void;
  nadOkny?: boolean;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const symbol = useSymbol();
  const { nacteno, ma } = useOpravneni();
  const vidiTym = nacteno && ma('tresty.zobrazit_tym');
  const dnes = pragueToday();
  const pevnyId = upravit?.userId ?? predvolby?.userId ?? null;
  const pevneJmeno = upravit?.userName ?? predvolby?.jmeno ?? null;

  const [kdo, setKdo] = useState('');
  const [text, setText] = useState('');
  const [den, setDen] = useState(dnes);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [body, setBody] = useState('0');
  const [kraceni, setKraceni] = useState('');
  const [fotka, setFotka] = useState<string | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [chybaKraceni, setChybaKraceni] = useState<string | null>(null);
  const [stropServeru, setStropServeru] = useState<number | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [nahravam, setNahravam] = useState(false);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const vstup = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Každé otevření začíná od předvoleb (jiný návrh, jiný člověk) — ne od toho, co zbylo minule.
  useEffect(() => {
    if (!open) return;
    const u = upravit;
    const p = predvolby ?? {};
    setKdo(pevnyId ? String(pevnyId) : '');
    setText(u?.text ?? p.text ?? '');
    setDen(u?.day ?? p.day ?? pragueToday());
    setTypeId(u ? u.typeId : p.typeId ?? null);
    setBody(String(u ? u.points : p.points ?? 0));
    setKraceni(u ? (u.bonusCut ? String(u.bonusCut) : '') : p.bonusCut ? String(p.bonusCut) : '');
    setFotka(u?.photoUrl ?? null);
    setChyba(null); setChybaKraceni(null); setStropServeru(null);
    setUkladam(false); setNahravam(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const lide = useDataWidgetu(open && (!pevnyId || !pevneJmeno) ? '/api/teams' : null, vyberCleny);
  const sazebnik = useSazebnik(open ? URL_DRUHY_TRESTU : null);
  const druhy = useMemo(() => (sazebnik.data?.druhy ?? []).filter(d => d.active || d.id === typeId), [sazebnik.data, typeId]);
  // Návrh z jiného místa (manko, výtka, pozdní příchod): položka sazebníku se vybere sama, až je sazebník načtený —
  // jednou za otevření a jen když ji (ani body) nezadal volající.
  const predvybrano = useRef(false);
  useEffect(() => { if (open) predvybrano.current = false; }, [open]);
  const druhNavrhu = !upravit && predvolby?.typeId == null && predvolby?.points == null ? predvolby?.druhNavrhu ?? null : null;
  useEffect(() => {
    if (!open || !druhNavrhu || predvybrano.current || !sazebnik.data) return;
    predvybrano.current = true;
    const d = druhProNavrh(sazebnik.data.druhy, druhNavrhu);
    if (!d) return;
    setTypeId(d.id);
    setBody(String(d.points));
    setKraceni(d.bonusCut ? String(d.bonusCut) : '');
  }, [open, druhNavrhu, sazebnik.data]);
  const userId = Number(kdo) || null;
  const jmeno = pevneJmeno ?? lide.data?.find(m => m.id === userId)?.jmeno ?? '';
  const denOk = !!platnyDen(den, dnes);
  // Kolikátý stejný prohřešek: tresty člověka za měsíc dne (jen s tresty.zobrazit_tym — jinak by server vrátil vlastní).
  const mesicni = useTresty(open && userId && denOk && vidiTym ? urlTresty({ scope: 'team', userId, month: den.slice(0, 7) }) : null);
  const strop = useStropKraceni(open && userId && denOk ? urlStropu(userId, den, upravit?.id) : null);
  // Strop se mění s každým krácením: při otevření ho vždy načíst znovu (mezipaměť widgetů drží 30 s).
  const obnovStrop = strop.reload;
  useEffect(() => { if (open) obnovStrop(); }, [open, obnovStrop]);
  const stropKc = stropServeru ?? strop.data?.strop ?? null;
  const bezPremii = !!strop.data && strop.data.premie === 0 && stropServeru == null && !(upravit && upravit.bonusCut > 0);

  const bodyCislo = Number(body) || 0;
  const kraceniCislo = Number(kraceni) || 0;
  const napomenuti = bodyCislo === 0 && kraceniCislo === 0;
  const nadStrop = !kraceniVMezich(kraceni, stropKc);
  const opakovani = userId && typeId ? poradiOpakovani(mesicni.data?.items ?? [], { userId, typeId, day: den, bezId: upravit?.id }) : null;
  const formular = (): FormularTrestu => ({ userId: kdo, text, day: den, typeId, points: body, bonusCut: kraceni, photoUrl: fotka });
  const zmeny = upravit ? teloUpravy(formular(), upravit) : null;

  const vyberDruh = (id: number) => {
    const d = druhy.find(x => x.id === id);
    if (!d) return;
    if (typeId === id) { setTypeId(null); return; }
    setTypeId(id);
    setBody(String(d.points));
    setKraceni(d.bonusCut ? String(d.bonusCut) : '');
    setChybaKraceni(null);
    if (predvyplnitText(text, druhy)) setText(d.title);
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
      if (platnaFotka(d?.url)) setFotka(d.url);
      else setChyba(t('Fotku se nepodařilo nahrát.'));
    } catch (e) {
      setChyba(apiMessage(e, t('Fotku se nepodařilo nahrát — zkontroluj připojení.')));
    }
    setNahravam(false);
    if (vstup.current) vstup.current.value = '';
  };

  const uloz = async () => {
    if (ukladam || nahravam) return;
    const f = formular();
    const telo = upravit ? teloUpravy(f, upravit) : teloTrestu(f, predvolby ?? {});
    // Stejná pravidla jako na serveru — hláška je vidět dřív, než požadavek odejde.
    const v = validujTrest(upravit ? { ...upravit, ...telo, userId: upravit.userId } : telo, dnes);
    if (!v.ok) { setChyba(prelozHlaskuTrestu(t, v.chyba)); return; }
    if (nadStrop) { setChybaKraceni(stropKc ? t('Krátit jde nejvýš {castka}.', { castka: money(stropKc) }) : t('Tenhle měsíc nemá žádné prémie, krátit není z čeho. Dej body nebo napomenutí.')); return; }
    if (upravit && Object.keys(telo).length === 0) { onClose(); return; }
    setUkladam(true);
    setChyba(null); setChybaKraceni(null);
    try {
      const res = await fetch(upravit ? `/api/tresty/${upravit.id}` : '/api/tresty', {
        method: upravit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telo),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const hlaska = typeof d?.error === 'string' ? prelozHlaskuTrestu(t, d.error) : t('Trest se neuložil.');
        // Krácení nad strop (server ví víc — mezitím mohl přibýt jiný trest): věta pod polem a nový strop.
        if (res.status === 409 && typeof d?.strop === 'number') { setStropServeru(d.strop); setChybaKraceni(hlaska); }
        else setChyba(hlaska);
        setUkladam(false);
        return;
      }
      const item = vyberTresty([d?.item])[0] ?? null;
      const kdoJmeno = item?.userName || jmeno;
      const id = Date.now();
      if (upravit) setToast({ text: meniDopad(telo) ? t('Trest upraven — {jmeno} ho potvrdí znovu.', { jmeno: kdoJmeno }) : t('Trest upraven.'), id });
      else if (item && item.points === 0 && item.bonusCut === 0) setToast({ text: t('Napomenutí uloženo — {jmeno} dostal(a) oznámení.', { jmeno: kdoJmeno }), id });
      else setToast({ text: t('Trest udělen — {jmeno} dostal(a) oznámení.', { jmeno: kdoJmeno }), id });
      obnovTresty();
      setUkladam(false);
      if (item) onUlozeno?.(item);
      onClose();
    } catch (e) {
      setChyba(apiMessage(e, t('Trest se neuložil — zkontroluj připojení.')));
      setUkladam(false);
    }
  };

  const minDen = posunDni(dnes, -DNI_ZPETNE);
  const textTlacitka = upravit ? t('Uložit') : napomenuti ? t('Dát napomenutí') : t('Dát trest');
  const hintKraceni = !userId
    ? t('Vyber člověka — ukáže se, kolik jde krátit.')
    : bezPremii
      ? t('Tenhle měsíc nemá prémie — krátit není z čeho. Dej body nebo napomenutí.')
      : strop.data
        ? t('Prémie za měsíc: {premie} · krátit jde nejvýš {strop}', { premie: money(strop.data.premie), strop: money(stropKc ?? 0) })
        : t('Načítám prémie…');

  return (
    <NadPlochou>
      <Modal open={open} onClose={onClose} size="md" nadOkny={nadOkny}
        title={upravit ? t('Upravit trest') : t('Dát trest')}
        subtitle={pevneJmeno ?? t('Co se stalo a co za to — člověk dostane oznámení a potvrdí, že to viděl.')}
        footer={<>
          <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
          <Button variant="primary" icon="check" loading={ukladam} disabled={nahravam || (!upravit && !userId)} onClick={() => void uloz()}>{textTlacitka}</Button>
        </>}>
        <div className="space-y-4" data-dat-trest={upravit ? 'uprava' : 'novy'}>
          {!pevnyId && (
            <Field id="trest-kdo" label={t('Komu')}>
              <Select id="trest-kdo" value={kdo} onChange={e => { setKdo(e.target.value); setChybaKraceni(null); setStropServeru(null); }} autoFocus>
                <option value="">{lide.loading ? t('Načítám členy…') : t('Vyber člena…')}</option>
                {(lide.data ?? []).map(m => <option key={m.id} value={m.id}>{m.jmeno}</option>)}
              </Select>
            </Field>
          )}
          {druhy.length > 0 && (
            <div className="space-y-1.5">
              <p className="t-label">{t('Sazebník')}</p>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('Sazebník')}>
                {druhy.map(d => (
                  <button key={d.id} type="button" aria-pressed={typeId === d.id} onClick={() => vyberDruh(d.id)}
                    className={`filter-pill tap-target-sm max-w-full ${typeId === d.id ? 'seg-on' : 'seg-off glass'}`}>
                    <span className="truncate">{d.title}</span>
                    <span className="shrink-0 tabular-nums">· {dopadTrestu(t, { points: d.points, bonusCut: d.bonusCut ?? 0 }, money)}</span>
                  </button>
                ))}
              </div>
              {opakovani != null && opakovani >= 2 && (
                <p className="t-meta" data-trest-opakovani>
                  {den.slice(0, 7) === dnes.slice(0, 7) ? t('{n}. tento měsíc', { n: opakovani }) : t('{n}. v tom měsíci', { n: opakovani })}
                </p>
              )}
            </div>
          )}
          <Field id="trest-text" label={t('Co se stalo?')} error={chyba}
            hint={<span className="flex justify-between gap-2"><span>{t('Věcně, jednou dvěma větami — člověk to uvidí.')}</span><span className="tabular-nums shrink-0" aria-live="polite">{text.length}/{MAX_DELKA_TEXTU}</span></span>}>
            <Textarea id="trest-text" ref={textRef} value={text} rows={3} maxLength={MAX_DELKA_TEXTU} autoFocus={!!pevnyId}
              onChange={e => { setText(e.target.value); if (chyba) setChyba(null); }}
              placeholder={t('Např. příchod o 20 minut později bez omluvy')} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field id="trest-den" label={t('Den')} hint={t('Nejvýš {n} dní zpětně.', { n: DNI_ZPETNE })}>
              <Input id="trest-den" type="date" value={den} min={minDen} max={dnes} className="appearance-none min-w-0"
                onChange={e => { setDen(e.target.value); setChybaKraceni(null); setStropServeru(null); if (chyba) setChyba(null); }} />
            </Field>
            <Field id="trest-body" label={t('Body dolů')} hint={t('0–{max}; nula = bez bodů.', { max: MAX_BODU })}>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" iconOnly icon="minus" aria-label={t('Méně bodů')} disabled={bodyCislo <= 0} className="tap-target"
                  onClick={() => setBody(String(krokBodu(body, -1)))} />
                <Input id="trest-body" type="number" inputMode="numeric" min={0} max={MAX_BODU} step={1} value={body}
                  onChange={e => setBody(e.target.value.replace(/\D/g, ''))} className="!w-20 text-center tabular-nums" />
                <Button variant="secondary" size="sm" iconOnly icon="plus" aria-label={t('Víc bodů')} disabled={bodyCislo >= MAX_BODU} className="tap-target"
                  onClick={() => setBody(String(krokBodu(body, 1)))} />
              </div>
            </Field>
          </div>
          <Field id="trest-kraceni" label={t('Krácení prémie')} error={chybaKraceni ?? (nadStrop && kraceniCislo > 0 ? (stropKc ? t('Krátit jde nejvýš {castka}.', { castka: money(stropKc) }) : null) : null)}
            hint={<span className="block text-pretty" data-trest-strop>{hintKraceni}</span>}>
            <div className="relative">
              <Input id="trest-kraceni" type="number" inputMode="numeric" min={0} max={Math.min(MAX_KRACENI, stropKc ?? MAX_KRACENI)} step={1} value={kraceni}
                disabled={bezPremii && kraceniCislo === 0}
                onChange={e => { setKraceni(e.target.value.replace(/\D/g, '')); setChybaKraceni(null); }} className="tabular-nums pr-12" />
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">{symbol}</span>
            </div>
          </Field>
          <p className="t-meta -mt-2 text-pretty">{t('Krátí se jen prémie za ten měsíc, ne mzda — peněžní pokuty zákon nedovoluje.')}</p>
          <div className="min-w-0">
            <p className="field-label">{t('Fotka (nepovinná)')}</p>
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
              <Button variant="secondary" icon="camera" loading={nahravam} onClick={() => vstup.current?.click()} className="w-full sm:w-auto">
                {t('Vyfotit / nahrát')}
              </Button>
            )}
          </div>
          {napomenuti ? (
            <p className="note note-info text-sm text-pretty" data-trest-nahled="napomenuti">
              {t('Napomenutí — bez bodů a bez krácení. Člověk ho uvidí v Odměnách a potvrdí, že ho bere na vědomí.')}
            </p>
          ) : (
            <p className="well px-3 py-2 text-sm text-[#16181A] text-pretty" data-trest-nahled="trest">
              {t('Dopad: {dopad}', { dopad: dopadTrestu(t, { points: bodyCislo, bonusCut: kraceniCislo }, money) })}
            </p>
          )}
          {upravit && zmeny && meniDopad(zmeny) && (
            <p className="t-meta text-pretty">{t('Změnou výše nebo dne se trest vrátí k potvrzení — člověk dostane nové oznámení.')}</p>
          )}
        </div>
      </Modal>
      <Toast message={toast?.text ?? null} id={toast?.id} onClose={() => setToast(null)} />
    </NadPlochou>
  );
}

export default DatTrest;
