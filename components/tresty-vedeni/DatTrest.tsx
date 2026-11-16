'use client';

// Okno „Dát trest" (kolo 10, balík V; kolo 96 peníze a hromadně) — jedno pro všechna místa: widget
// Tresty v týmu (i z návrhu), profil člena, detail uzávěrky (manko → náhrada škody), hodnocení směny
// (výtka), Docházka (pozdní příchod) a úprava existujícího trestu.
//
// Skladba shora dolů (docs/TRESTY-PENIZE.md kap. 5):
//  1. KDO — jeden člověk (výběr, nebo předvyplněný v podtitulku), nebo „Víc lidí": zaškrtávání
//     z GET /api/tresty/vyber, rychlé volby „Celá směna {den}" a „Všichni na uzávěrce", filtr role.
//     Každý dostane vlastní trest (dávka, společné batchId).
//  2. CO SE STALO — chipy sazebníku, text (do 500), den (nejvýš 31 dní zpět), fotka, vazba na směnu /
//     uzávěrku / úkol z předvoleb.
//  3. BODY dolů s krokovačem ±5.
//  4. PENÍZE (jen finance.mzdy): Krácení nenárokové části / Náhrada škody / Srážka z výplaty;
//     u víc lidí „každý X" / „rozpočítat X" (PenizeVOkne).
//  5. KOMU PŘEJDOU stržené peníze (jen když se něco strhává): podniku / kdo to napravil / celá směna.
//  6. SOUHRN před uložením („Jana: −300 Kč z prémie · Petr dostane +300 Kč").
//  Věta, že napomenutí v aplikaci není výtka podle § 52 písm. g) ZP; 0 bodů a 0 Kč = napomenutí.
//
// Validace stejná jako na serveru (validujTrest, chybaPenez); 409 se stropem → věta pod polem krácení
// nebo náhrady (u dávky se jménem). Rozepsaný text okno neztratí (Modal + DiscardGuard). Okno se kreslí
// do <body> se značkou pro plochu; nad profilem člena a detailem uzávěrky dostane `nadOkny`. Toast
// zůstává i po zavření — volající má okno držet připojené a řídit ho přes `open`.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DNI_ZPETNE, MAX_BODU, MAX_DELKA_TEXTU, MAX_KRACENI, URL_DRUHY_TRESTU, druhProNavrh, platnaFotka, platnyDen, poradiOpakovani, posunDni, urlTresty,
  validujTrest, vyberTresty, type Trest,
} from '@/lib/tresty';
import { apiMessage, okJson } from '@/lib/api';
import { useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { pragueToday } from '@/lib/pragueTime';
import { Button, Chip, Field, Input, Modal, Rada, Segmented, Select, Textarea, Toast } from '../ui';
import { VolbaRadek, VolbyRadky } from '../ui/Volby';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { useOpravneni } from '../role/useOpravneni';
import { obnovPenize, urlVyberu, useVyberLidi } from '../tresty-penize/data';
import { obnovTresty, urlStropu, useSazebnik, useStropKraceni, useTresty } from './data';
import { prelozHlaskuTrestu } from './hlasky';
import { krokBodu, kraceniVMezich, meniDopad, predvyplnitText, teloTrestu, teloUpravy, type FormularTrestu, type PredvolbyTrestu } from './logika';
import { castkaPenez, chybaPenez, kraceniZPenez, prazdnePenize, souhrnPenez, strhavaSe, teloPenez, type FormularPenez } from './penize';
import { SekcePenez, SekceZaskoku, SouhrnPenezBlok } from './PenizeVOkne';
import { dopadTrestu } from './TrestRadek';
import { VyberLidi } from './VyberLidi';

/** Portál do <body> se značkou pro plochu (klepnutí v okně není gesto nad widgetem). */
export function NadPlochou({ children }: { children: React.ReactNode }) {
  const [cil, setCil] = useState<HTMLElement | null>(null);
  useEffect(() => { setCil(document.body); }, []);
  return cil ? createPortal(<div data-plocha-chrom="">{children}</div>, cil) : null;
}

/** Peníze z předvoleb (návrh, sazebník, manko z uzávěrky). */
function penizeZPredvoleb(p: PredvolbyTrestu, u: Trest | null | undefined): FormularPenez {
  if (u) return prazdnePenize({ kraceni: u.bonusCut ? String(u.bonusCut) : '' });
  const pz = p.penize ?? {};
  return prazdnePenize({
    rezim: pz.rezim ?? 'kraceni',
    kraceni: p.bonusCut ? String(p.bonusCut) : '',
    skoda: pz.skoda ? String(pz.skoda) : '',
    druhSkody: pz.druhSkody ?? 'zavinena',
    srazka: pz.srazka ? String(pz.srazka) : '',
  });
}

export function DatTrest({ open, onClose, predvolby, upravit, onUlozeno, nadOkny = false }: {
  open: boolean;
  onClose: () => void;
  /** Předvyplnění (člověk / lidé, den, vazby na směnu / uzávěrku / úkol, text, položka sazebníku, klíč návrhu, body, peníze). */
  predvolby?: PredvolbyTrestu | null;
  /** Upravovaný trest (PATCH); bez něj se trest uděluje (POST). */
  upravit?: Trest | null;
  /** Po uložení: nový tvar trestu ze serveru (u dávky první). */
  onUlozeno?: (item: Trest) => void;
  nadOkny?: boolean;
}) {
  const t = useT('widgety');
  const money = useMoney();
  const symbol = useSymbol();
  const { nacteno, ma } = useOpravneni();
  const vidiTym = nacteno && ma('tresty.zobrazit_tym');
  // Peníze z výplaty jen s finance.mzdy (kontrakt kap. 3) — bez něj okno sekce Peníze a Záskok nekreslí.
  const smiPenize = nacteno && ma('finance.mzdy');
  const dnes = pragueToday();
  const pevnyId = upravit?.userId ?? predvolby?.userId ?? null;
  const pevneJmeno = upravit?.userName ?? predvolby?.jmeno ?? null;

  const [kdo, setKdo] = useState('');
  const [vic, setVic] = useState(false);
  const [lideIds, setLideIds] = useState<number[]>([]);
  const [text, setText] = useState('');
  const [den, setDen] = useState(dnes);
  const [typeId, setTypeId] = useState<number | null>(null);
  const [body, setBody] = useState('0');
  const [penize, setPenize] = useState<FormularPenez>(() => prazdnePenize());
  const [fotka, setFotka] = useState<string | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [chybaKraceni, setChybaKraceni] = useState<string | null>(null);
  const [chybaNahrady, setChybaNahrady] = useState<string | null>(null);
  const [chybaPenezOkna, setChybaPenezOkna] = useState<string | null>(null);
  const [stropServeru, setStropServeru] = useState<number | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [nahravam, setNahravam] = useState(false);
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null);
  const vstup = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const zmenPenize = (z: Partial<FormularPenez>) => {
    setPenize(p => ({ ...p, ...z }));
    setChybaKraceni(null); setChybaNahrady(null); setChybaPenezOkna(null);
    if ('rezim' in z) setStropServeru(null);
  };

  // Každé otevření začíná od předvoleb (jiný návrh, jiný člověk) — ne od toho, co zbylo minule.
  useEffect(() => {
    if (!open) return;
    const u = upravit;
    const p = predvolby ?? {};
    const ids = !u && p.userIds && p.userIds.length > 1 ? [...new Set(p.userIds)] : null;
    setKdo(pevnyId ? String(pevnyId) : '');
    setVic(!!ids);
    setLideIds(ids ?? (pevnyId ? [pevnyId] : []));
    setText(u?.text ?? p.text ?? '');
    setDen(u?.day ?? p.day ?? pragueToday());
    setTypeId(u ? u.typeId : p.typeId ?? null);
    setBody(String(u ? u.points : p.points ?? 0));
    setPenize(penizeZPredvoleb(p, u));
    setFotka(u?.photoUrl ?? null);
    setChyba(null); setChybaKraceni(null); setChybaNahrady(null); setChybaPenezOkna(null); setStropServeru(null);
    setUkladam(false); setNahravam(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const closingId = upravit?.closingId ?? predvolby?.closingId ?? null;
  const strhava = smiPenize && !upravit && strhavaSe(penize);
  // Lidé k výběru (jeden, víc, záskok): GET /api/tresty/vyber pro den trestu (osádka směny, uzávěrka).
  // Se srážkou / náhradou i kvůli smlouvě (vyber ji nese s finance.mzdy): věta „počká na souhlas" a souhrn = server.
  const potrebaVyberu = open && !upravit && (!pevnyId || !pevneJmeno || vic || (strhava && (penize.zaskokKomu !== 'podnik' || penize.rezim !== 'kraceni')));
  const denOk = !!platnyDen(den, dnes);
  const vyber = useVyberLidi(potrebaVyberu && denOk ? urlVyberu(den, closingId) : null);
  const sazebnik = useSazebnik(open ? URL_DRUHY_TRESTU : null);
  const druhy = useMemo(() => (sazebnik.data?.druhy ?? []).filter(d => d.active || d.id === typeId), [sazebnik.data, typeId]);
  // Návrh z jiného místa (výtka, pozdní příchod): položka sazebníku se vybere sama, až je sazebník načtený —
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
    if (d.bonusCut) setPenize(p => ({ ...p, rezim: 'kraceni', kraceni: String(d.bonusCut) }));
  }, [open, druhNavrhu, sazebnik.data]);

  const userId = Number(kdo) || null;
  const ids = vic ? lideIds : userId ? [userId] : [];
  const jmenoId = (id: number) => vyber.data?.lide.find(l => l.id === id)?.name ?? (id === pevnyId ? pevneJmeno ?? '' : '');
  const jmeno = pevneJmeno ?? (userId ? jmenoId(userId) : '');
  const jeden = !vic && !!userId;
  // Kolikátý stejný prohřešek: tresty člověka za měsíc dne (jen s tresty.zobrazit_tym — jinak by server vrátil vlastní).
  const mesicni = useTresty(open && jeden && denOk && vidiTym ? urlTresty({ scope: 'team', userId: userId!, month: den.slice(0, 7) }) : null);
  const strop = useStropKraceni(open && jeden && denOk && smiPenize ? urlStropu(userId!, den, upravit?.id) : null);
  // Strop se mění s každým krácením: při otevření ho vždy načíst znovu (mezipaměť widgetů drží 30 s).
  const obnovStrop = strop.reload;
  useEffect(() => { if (open) obnovStrop(); }, [open, obnovStrop]);

  const stropKc = jeden ? stropServeru ?? strop.data?.strop ?? null : null;
  const nenarokova = strop.data ? strop.data.premie + strop.data.slozka + strop.data.zaskok : null;
  const bezPremii = jeden && nenarokova === 0 && stropServeru == null && !(upravit && upravit.bonusCut > 0);

  const bodyCislo = Number(body) || 0;
  const kraceni = smiPenize ? kraceniZPenez(penize) : '';
  const kraceniCislo = Number(kraceni) || 0;
  const castka = smiPenize ? (upravit ? kraceniCislo : castkaPenez(penize)) : 0;
  const napomenuti = bodyCislo === 0 && castka === 0;
  const nadStrop = jeden && !kraceniVMezich(kraceni, stropKc);
  const opakovani = jeden && typeId ? poradiOpakovani(mesicni.data?.items ?? [], { userId: userId!, typeId, day: den, bezId: upravit?.id }) : null;
  const formular = (): FormularTrestu => ({ userId: kdo, text, day: den, typeId, points: body, bonusCut: kraceni, photoUrl: fotka });
  const zmeny = upravit ? teloUpravy(formular(), upravit) : null;
  const osadka = useMemo(() => [...new Set([...(vyber.data?.smena ?? []), ...(closingId ? vyber.data?.uzaverka ?? [] : [])])]
    .map(id => ({ id, jmeno: vyber.data?.lide.find(l => l.id === id)?.name ?? '' })), [vyber.data, closingId]);
  // Smlouva z GET /api/tresty/vyber (s finance.mzdy); undefined = zatím nenačteno → obecná věta, souhrn počítá se souhlasem.
  const smlouvaId = (id: number): string | null | undefined => {
    const l = vyber.data?.lide.find(x => x.id === id);
    return l && 'smlouva' in l ? l.smlouva ?? null : undefined;
  };
  const souhrn = strhava ? souhrnPenez({
    f: penize, lide: ids.map(id => ({ id, jmeno: jmenoId(id) || (id === userId ? jmeno : ''), smlouva: penize.rezim === 'kraceni' ? null : smlouvaId(id) })),
    osadka, jmena: new Map((vyber.data?.lide ?? []).map(l => [l.id, l.name])),
  }) : null;

  const vyberDruh = (id: number) => {
    const d = druhy.find(x => x.id === id);
    if (!d) return;
    if (typeId === id) { setTypeId(null); return; }
    setTypeId(id);
    setBody(String(d.points));
    if (penize.rezim === 'kraceni' || d.bonusCut) setPenize(p => ({ ...p, rezim: 'kraceni', kraceni: d.bonusCut ? String(d.bonusCut) : '' }));
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

  const vetaStropu = (s: number) => (s ? t('Krátit jde nejvýš {castka}.', { castka: money(s) })
    : t('Krátit jde jen nenárokovou prémii a tenhle měsíc žádná není. Založ ji v Docházce → Prémie a srážky jako „Nenároková prémie“. Starší prémie bez typu se nepočítají.'));

  const uloz = async () => {
    if (ukladam || nahravam) return;
    if (!upravit && !ids.length) { setChyba(prelozHlaskuTrestu(t, 'Vyber, koho se trest týká.')); return; }
    const f = formular();
    const zaklad = upravit ? teloUpravy(f, upravit) : teloTrestu({ ...f, userId: String(ids[0]) }, predvolby ?? {});
    // Stejná pravidla jako na serveru — hláška je vidět dřív, než požadavek odejde.
    // Úprava staršího trestu z manka nesmí spadnout na pravidle „manko trestem není" — klíč návrhu se při úpravě neposílá.
    // „Rozpočítat" u dávky: strop krácení 5 000 platí na člověka (stejně jako server).
    const v = validujTrest(upravit ? { ...upravit, ...zaklad, userId: upravit.userId, sourceKey: null } : zaklad, dnes,
      { rozpocitatMezi: !upravit && smiPenize && ids.length > 1 && penize.rozpocitat ? ids.length : 1 });
    if (!v.ok) { setChyba(prelozHlaskuTrestu(t, v.chyba)); return; }
    if (nadStrop) { setChybaKraceni(vetaStropu(stropKc ?? 0)); return; }
    if (smiPenize && !upravit) {
      const cp = chybaPenez(penize, ids.length, dnes);
      if (cp) {
        if (penize.rezim === 'nahrada' && !/kolegovi|kolegům|napravil|komu má/.test(cp)) setChybaNahrady(prelozHlaskuTrestu(t, cp));
        else if (penize.rezim === 'kraceni' && /Krácení/.test(cp)) setChybaKraceni(prelozHlaskuTrestu(t, cp));
        else setChybaPenezOkna(prelozHlaskuTrestu(t, cp));
        return;
      }
      if (souhrn?.chyba) { setChybaPenezOkna(prelozHlaskuTrestu(t, souhrn.chyba)); return; }
    }
    if (upravit && Object.keys(zaklad).length === 0) { onClose(); return; }
    // Dávka: userIds místo userId, klíč návrhu jde jen s jedním člověkem (server by ho odmítl).
    const telo: Record<string, unknown> = upravit ? zaklad : {
      ...zaklad,
      ...(ids.length > 1 ? { userId: undefined, userIds: ids, sourceKey: undefined } : {}),
      ...(smiPenize ? teloPenez(penize, ids.length) : {}),
    };
    setUkladam(true);
    setChyba(null); setChybaKraceni(null); setChybaNahrady(null); setChybaPenezOkna(null);
    try {
      const res = await fetch(upravit ? `/api/tresty/${upravit.id}` : '/api/tresty', {
        method: upravit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telo),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const hlaska = typeof d?.error === 'string' ? prelozHlaskuTrestu(t, d.error) : t('Trest se neuložil.');
        // U dávky se jménem toho, na kom to stojí (server vrací userId).
        const kdoChyba = ids.length > 1 && Number(d?.userId) > 0 ? jmenoId(Number(d.userId)) : '';
        const veta = kdoChyba ? `${kdoChyba}: ${hlaska}` : hlaska;
        // Strop (server ví víc — mezitím mohl přibýt jiný trest): krácení → věta pod polem a nový strop; náhrada → pod náhradou.
        if (res.status === 409 && typeof d?.strop === 'number') {
          if (/^Náhrada/.test(String(d.error))) setChybaNahrady(veta);
          else { if (ids.length === 1) setStropServeru(d.strop); setChybaKraceni(veta); }
        } else if (smiPenize && /kolegovi|kolegům|Kolega|napravil|směně ten den|nic nestrhne|převést/.test(String(d?.error ?? ''))) setChybaPenezOkna(veta);
        else setChyba(veta);
        setUkladam(false);
        return;
      }
      const items = vyberTresty(Array.isArray(d?.items) ? d.items : [d?.item]);
      const item = items[0] ?? null;
      const kdoJmeno = item?.userName || jmeno;
      const ceka = items.some(x => x.penize?.srazky.some(s => s.stav === 'ceka'));
      const id = Date.now();
      const dodatek = ceka ? ` ${t('Srážka čeká na souhlas zaměstnance.')}` : '';
      if (upravit) setToast({ text: meniDopad(telo) ? t('Trest upraven — {jmeno} ho potvrdí znovu.', { jmeno: kdoJmeno }) : t('Trest upraven.'), id });
      else if (items.length > 1) setToast({ text: t('Trest udělen {n} lidem — každý dostal oznámení.', { n: items.length }) + dodatek, id });
      else if (item && item.points === 0 && item.bonusCut === 0 && !(item.penize?.srazky.length)) setToast({ text: t('Napomenutí uloženo — {jmeno} dostal(a) oznámení.', { jmeno: kdoJmeno }), id });
      else setToast({ text: t('Trest udělen — {jmeno} dostal(a) oznámení.', { jmeno: kdoJmeno }) + dodatek, id });
      obnovTresty();
      if (smiPenize) obnovPenize();
      setUkladam(false);
      if (item) onUlozeno?.(item);
      onClose();
    } catch (e) {
      setChyba(apiMessage(e, t('Trest se neuložil — zkontroluj připojení.')));
      setUkladam(false);
    }
  };

  const minDen = posunDni(dnes, -DNI_ZPETNE);
  const textTlacitka = upravit ? t('Uložit') : napomenuti ? t('Dát napomenutí') : ids.length > 1 ? t('Dát trest ({n})', { n: ids.length }) : t('Dát trest');
  const hintKraceni = vic
    ? t('Strop hlídá aplikace u každého zvlášť — kdo nemá dost nenárokové části, okno řekne.')
    : !userId
      ? t('Vyber člověka — ukáže se, kolik jde krátit.')
      : bezPremii
        ? `${t('Krátit jde jen nenárokovou prémii a tenhle měsíc žádná není. Založ ji v Docházce → Prémie a srážky jako „Nenároková prémie“. Starší prémie bez typu se nepočítají.')} ${t('Stálou nenárokovou složku výplaty nastavíš v profilu člena v sekci Tresty.')}`
        : strop.data
          ? strop.data.slozka > 0
            ? t('Nenároková složka {slozka} + prémie {premie} · krátit jde nejvýš {strop}', { slozka: money(strop.data.slozka), premie: money(strop.data.premie + strop.data.zaskok), strop: money(stropKc ?? 0) })
            : t('Nenárokové prémie za měsíc: {premie} · krátit jde nejvýš {strop}', { premie: money(strop.data.premie + strop.data.zaskok), strop: money(stropKc ?? 0) })
          : t('Načítám prémie…');
  const dopadPenez = !smiPenize || upravit || penize.rezim === 'kraceni' || castka === 0 ? null
    : penize.rezim === 'nahrada' ? t('náhrada škody {castka}', { castka: money(castka) }) : t('srážka {castka}', { castka: money(castka) });
  const dopad = [bodyCislo || kraceniCislo ? dopadTrestu(t, { points: bodyCislo, bonusCut: kraceniCislo }, money) : null, dopadPenez].filter(Boolean).join(' · ');
  const vazby = [
    predvolby?.shiftId || upravit?.shiftId ? t('Ke směně {den}', { den: fmtDatum(den, { jazyk: t.jazyk, styl: 'denKratce' }) }) : null,
    closingId ? t('K uzávěrce') : null,
    predvolby?.taskId || upravit?.taskId ? t('K úkolu') : null,
  ].filter((x): x is string => !!x);

  return (
    <NadPlochou>
      <Modal open={open} onClose={onClose} size="md" nadOkny={nadOkny}
        title={upravit ? t('Upravit trest') : t('Dát trest')}
        subtitle={(!vic && pevneJmeno) || t('Co se stalo a co za to — člověk dostane oznámení a potvrdí, že to viděl.')}
        footer={<>
          <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
          <Button variant="primary" icon="check" loading={ukladam} disabled={nahravam || (!upravit && !ids.length)} onClick={() => void uloz()}>{textTlacitka}</Button>
        </>}>
        {/* Formulář okna podle V6: pole ↔ pole 16 (Sloupec), pole i krokovač 52, dvojice polí ½ + ½,
            volby sazebníku jako řádky L→R (dřív zalamované pilulky různé šířky — audit V03/V04). */}
        <div className="sloupec sloupec-4" data-dat-trest={upravit ? 'uprava' : 'novy'}>
          {/* 1. Kdo */}
          {!upravit && (
            <section className="sloupec sloupec-3" aria-label={t('Komu')} data-trest-kdo={vic ? 'vic' : 'jeden'}>
              <Segmented ariaLabel={t('Komu')} value={vic ? 'vic' : 'jeden'}
                onChange={v => {
                  const doVic = v === 'vic';
                  setVic(doVic);
                  if (doVic && userId && !lideIds.length) setLideIds([userId]);
                  if (!doVic && lideIds.length === 1 && !pevnyId) setKdo(String(lideIds[0]));
                  setChybaKraceni(null); setStropServeru(null);
                }}
                options={[{ id: 'jeden', label: t('Jeden člověk') }, { id: 'vic', label: t('Víc lidí') }]} />
              {vic ? (
                <VyberLidi id="trest-lide" data={vyber.data} loading={vyber.loading} vybrani={lideIds} onChange={x => { setLideIds(x); setChybaPenezOkna(null); }}
                  den={den} closingId={closingId} ariaLabel={t('Koho se trest týká')} />
              ) : !pevnyId && (
                <Field id="trest-kdo" label={t('Komu')}>
                  <Select id="trest-kdo" value={kdo} onChange={e => { setKdo(e.target.value); setChybaKraceni(null); setStropServeru(null); }} autoFocus>
                    <option value="">{vyber.loading ? t('Načítám členy…') : t('Vyber člena…')}</option>
                    {[...(vyber.data?.lide ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'cs')).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </Select>
                </Field>
              )}
            </section>
          )}

          {/* 2. Co se stalo */}
          {druhy.length > 0 && (
            <div className="min-w-0">
              <VolbyRadky label={t('Sazebník')} ariaLabel={t('Sazebník')}>
                {druhy.map(d => (
                  <VolbaRadek key={d.id} vybrano={typeId === d.id} onClick={() => vyberDruh(d.id)}
                    titul={d.title} hodnota={dopadTrestu(t, { points: d.points, bonusCut: smiPenize ? d.bonusCut ?? 0 : 0 }, money)} />
                ))}
              </VolbyRadky>
              {opakovani != null && opakovani >= 2 && (
                <p className="t-meta mt-1.5" data-trest-opakovani>
                  {den.slice(0, 7) === dnes.slice(0, 7) ? t('{n}. tento měsíc', { n: opakovani }) : t('{n}. v tom měsíci', { n: opakovani })}
                </p>
              )}
            </div>
          )}
          <Field id="trest-text" label={t('Co se stalo?')} error={chyba}
            hint={<span className="flex justify-between gap-2"><span>{t('Věcně, jednou dvěma větami — člověk to uvidí.')}</span><span className="tabular-nums shrink-0" aria-live="polite">{text.length}/{MAX_DELKA_TEXTU}</span></span>}>
            <Textarea id="trest-text" ref={textRef} value={text} rows={3} maxLength={MAX_DELKA_TEXTU} autoFocus={!!pevnyId && !vic}
              onChange={e => { setText(e.target.value); if (chyba) setChyba(null); }}
              placeholder={t('Např. příchod o 20 minut později bez omluvy')} />
          </Field>
          {vazby.length > 0 && (
            <div className="flex flex-wrap gap-1.5" data-trest-vazby>{vazby.map(v => <Chip key={v} tone="muted" size="sm">{v}</Chip>)}</div>
          )}
          {/* 3. Den a body */}
          <div className="grid grid-cols-2 gap-3">
            <Field id="trest-den" label={t('Den')} hint={t('Nejvýš {n} dní zpětně.', { n: DNI_ZPETNE })}>
              <Input id="trest-den" type="date" value={den} min={minDen} max={dnes} className="appearance-none min-w-0"
                onChange={e => { setDen(e.target.value); setChybaKraceni(null); setStropServeru(null); if (chyba) setChyba(null); }} />
            </Field>
            <Field id="trest-body" label={t('Body dolů')} hint={t('0–{max}; nula = bez bodů.', { max: MAX_BODU })}>
              {/* Krokovač = řada 52 jako pole vedle (V6): − | číslo | + rovným dílem. */}
              <Rada vyska="l" className="[&>input]:!px-1">
                <Button variant="secondary" size="lg" iconOnly icon="minus" aria-label={t('Méně bodů')} disabled={bodyCislo <= 0} className="tap-target !w-auto"
                  onClick={() => setBody(String(krokBodu(body, -1)))} />
                <Input id="trest-body" type="number" inputMode="numeric" min={0} max={MAX_BODU} step={1} value={body}
                  onChange={e => setBody(e.target.value.replace(/\D/g, ''))} className="text-center tabular-nums" />
                <Button variant="secondary" size="lg" iconOnly icon="plus" aria-label={t('Víc bodů')} disabled={bodyCislo >= MAX_BODU} className="tap-target !w-auto"
                  onClick={() => setBody(String(krokBodu(body, 1)))} />
              </Rada>
            </Field>
          </div>
          <div className="min-w-0">
            <p className="field-label">{t('Fotka (nepovinná)')}</p>
            <input ref={vstup} type="file" accept="image/*" capture="environment" className="hidden" aria-hidden tabIndex={-1}
              onChange={e => void nahraj(e.target.files?.[0] ?? null)} />
            {fotka ? (
              <div className="flex items-center gap-2 min-w-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={fotka} alt={t('Náhled fotky')} className="block h-[3.25rem] w-[3.25rem] shrink-0 rounded-[var(--r-md)] object-cover" />
                <Button variant="secondary" size="lg" icon="camera" loading={nahravam} onClick={() => vstup.current?.click()} className="flex-1 min-w-0 !px-4">{t('Jinou')}</Button>
                <Button variant="secondary" size="lg" iconOnly icon="close" aria-label={t('Odebrat fotku')} onClick={() => setFotka(null)} />
              </div>
            ) : (
              <Button variant="secondary" size="lg" icon="camera" loading={nahravam} onClick={() => vstup.current?.click()} className="w-full">
                {t('Vyfotit / nahrát')}
              </Button>
            )}
          </div>

          {/* 4.–6. Peníze, komu přejdou, souhrn (jen finance.mzdy). */}
          {smiPenize && (
            <SekcePenez f={upravit ? { ...penize, rezim: 'kraceni' } : penize} zmen={zmenPenize} pocetLidi={Math.max(1, ids.length)} symbol={symbol} money={money}
              jenKraceni={!!upravit} hintKraceni={hintKraceni} kraceniVypnuto={bezPremii && kraceniCislo === 0}
              maxKraceni={Math.min(MAX_KRACENI * (!upravit && ids.length > 1 && penize.rozpocitat ? ids.length : 1), stropKc ?? Infinity)}
              chybaKraceni={chybaKraceni ?? (nadStrop && kraceniCislo > 0 && stropKc ? t('Krátit jde nejvýš {castka}.', { castka: money(stropKc) }) : null)}
              chybaNahrady={chybaNahrady} smlouvy={ids.length ? ids.map(id => smlouvaId(id)) : null} dnes={dnes} />
          )}
          {strhava && (
            <SekceZaskoku f={penize} zmen={zmenPenize} vyber={vyber.data} vyberNacita={vyber.loading} potrestani={ids} den={den} closingId={closingId} symbol={symbol}
              ceka={penize.rezim !== 'kraceni'} />
          )}
          {chybaPenezOkna && <p className="note note-danger text-sm text-pretty" role="alert" data-trest-chyba-penez>{chybaPenezOkna}</p>}
          {souhrn && <SouhrnPenezBlok s={souhrn} rezim={penize.rezim} money={money} />}

          {napomenuti ? (
            <p className="note note-info text-sm text-pretty" data-trest-nahled="napomenuti">
              {t('Napomenutí — bez bodů a bez krácení. Člověk ho uvidí v Odměnách a potvrdí, že ho bere na vědomí.')}
            </p>
          ) : (
            <p className="well px-3 py-2 text-sm text-[#16181A] text-pretty" data-trest-nahled="trest">
              {t('Dopad: {dopad}', { dopad })}
            </p>
          )}
          <p className="t-meta text-pretty" data-trest-vytka>{t('Napomenutí v aplikaci není výtka podle § 52 písm. g) zákoníku práce.')}</p>
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
