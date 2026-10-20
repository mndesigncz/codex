'use client';

// „Úkoly za body" (kolo 11, balík Z): dnešní volitelné úkoly z GET /api/navic/ukoly — co si
// člověk může vzít navíc za extra body. Jeden seznam pro widget ukoly.za_body (Domů, Úkoly,
// tablet), sekci „Za body navíc" v Úkolech a souhrn po odchodu na tabletu.
//
// Řádek: název, „+20 b" (prémie přes useMoney), opakování („Každý den", „Po, St, Pá"),
// obsazenost („1 z 2 volné", „Bere Eva"), popis, chip „s fotkou" a chip stavu. Akce podle
// stavu (components/navic/logika.akceUkolu): s kapacitou „Beru si" → „Hotovo" / „Vrátit",
// bez kapacity rovnou „Hotovo". „Hotovo" otevře ZapsatNavic s offerId a názvem — fotka je
// povinná podle requirePhoto a hlídá se před odesláním. Po každé změně obnovNavic() srovná
// všechna data /api/navic i /api/navic/ukoly (widgety, odznak v navigaci, okno).
//
// Žádná limetka: „Hotovo" je tmavé (primary), „Beru si" tónované, „Vrátit" tiché — jediná
// limetka obrazovky patří stránce. Ve widgetu (`tiche`, v3) je i „Hotovo" šedá pilulka: na
// Přehledu stojí vedle Píchaček a inkoustové tlačítko smí být v zorném poli jen jedno. Cíle ≥ 44 px (Button md), na tabletu lg.

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Chip, Toast } from '../ui';
import { useMoney } from '../CurrencyProvider';
import { useJazyk, useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDenVTydnu } from '@/lib/i18n/format';
import { pragueToday } from '@/lib/pragueTime';
import { apiMessage, okJson } from '@/lib/api';
import type { Jazyk } from '@/lib/i18n/config';
import { URL_UKOLY_NAVIC, popisOpakovani, type NabidkaNavic, type Navic, type StavUkoluNavic, type UkolNavic } from '@/lib/navic';
import { akceUkolu, krestni, odmenaKratce, ostatni, volnaMista, type AkceUkolu } from './logika';
import { obnovNavic } from './data';
import { ZapsatNavic } from './ZapsatNavic';

const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

/** Chip stavu úkolu za body — tón a věta (klíče přeložené výslovně, check-i18n čte jen t('…')). */
export function stavUkoluChip(t: PrekladFn, s: StavUkoluNavic): { tone: 'muted' | 'info' | 'wait' | 'ok' | 'bad'; text: string; icon?: string } {
  switch (s) {
    case 'vzato': return { tone: 'info', text: t('Mám vzaté'), icon: 'user' };
    case 'ceka': return { tone: 'wait', text: t('Čeká na uznání'), icon: 'clock' };
    case 'uznano': return { tone: 'ok', text: t('Uznáno'), icon: 'check' };
    case 'odmitnuto': return { tone: 'bad', text: t('Neprošlo — zkus znovu'), icon: 'refresh' };
    case 'plno': return { tone: 'muted', text: t('Obsazeno') };
    default: return { tone: 'muted', text: t('Volné') };
  }
}

/** Opakování česky a přeloženě: „Kdykoli", „Každý den", „Po, St, Pá", „Každé 3 dny". */
export function textOpakovani(t: PrekladFn, n: Pick<NabidkaNavic, 'recurrence' | 'recDays' | 'recInterval'>, jazyk: Jazyk): string {
  const p = popisOpakovani(n);
  switch (p.klic) {
    case 'Jednorázově': return t('Jednorázově');
    case 'Každý den': return t('Každý den');
    case 'Jednou týdně': return t('Jednou týdně');
    case 'Jednou měsíčně': return t('Jednou měsíčně');
    case 'Každých {n} dní': return t('{n, plural, one {Každý # den} few {Každé # dny} other {Každých # dní}}', { n: p.n ?? 0 });
    case 'Vybrané dny': {
      const dny = (p.dny ?? []).map(d => { const s = fmtDenVTydnu(d - 1, { jazyk, styl: 'kratky' }).replace(/\.$/, ''); return s.charAt(0).toUpperCase() + s.slice(1); });
      return dny.length ? dny.join(', ') : t('Vybrané dny');
    }
    default: return t('Kdykoli');
  }
}

export function UkolyZaBody({ ukoly, actingAs = null, jmeno = null, poOdchodu = false, velke = false, nahled = false, max, jenAkce = false, popisy = true, tiche = false, onZapsano }: {
  ukoly: readonly UkolNavic[];
  /** Tablet: za koho (vybraný člověk) — jde do „Beru si" i do zápisu. */
  actingAs?: number | null;
  /** Tablet: jméno do podtitulku okna („Za: Eva"). */
  jmeno?: string | null;
  /** Tablet po odchodu: už se nic nebere, jen „Hotovo" (zapsat, co člověk udělal). */
  poOdchodu?: boolean;
  /** Tablet: velká tlačítka (lg). */
  velke?: boolean;
  /** Náhled v galerii: bez akcí. */
  nahled?: boolean;
  /** Kolik řádků ukázat (zbytek „…a 2 další"). */
  max?: number;
  /** Malá karta widgetu: jen tlačítka akcí (název a body nese karta sama). */
  jenAkce?: boolean;
  /** Popis úkolu pod meta řádkem (střední karta widgetu ho vynechá — vejdou se tři úkoly bez „Zobrazit vše"). */
  popisy?: boolean;
  /** Widget mezi jinými kartami: „Hotovo" šedé, ne inkoustové (inkoust nese hlavní akce stránky). */
  tiche?: boolean;
  onZapsano?: (item: Navic) => void;
}) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const money = useMoney();
  const { data: relace } = useSession();
  const ja = actingAs ?? (Number((relace?.user as { id?: unknown } | undefined)?.id) || null);
  const [probiha, setProbiha] = useState<number | null>(null);
  const [hotovo, setHotovo] = useState<UkolNavic | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad'; id: number } | null>(null);
  const videt = useMemo(() => (max != null ? ukoly.slice(0, max) : ukoly), [ukoly, max]);

  const zmen = async (u: UkolNavic, akce: 'vzit' | 'vratit') => {
    if (nahled || probiha != null) return;
    setProbiha(u.nabidka.id);
    try {
      await fetch(URL_UKOLY_NAVIC, {
        method: 'POST', headers: JSON_HLAVICKA,
        body: JSON.stringify({ offerId: u.nabidka.id, akce, ...(actingAs ? { actingAs } : {}) }),
      }).then(okJson);
      setToast({ text: akce === 'vzit' ? t('Máš to vzaté — až bude hotovo, klepni na Hotovo.') : t('Úkol je zase volný.'), tone: 'ok', id: Date.now() });
      obnovNavic();
    } catch (e) {
      setToast({ text: apiMessage(e, akce === 'vzit' ? t('Úkol se nepodařilo vzít.') : t('Úkol se nepodařilo vrátit.')), tone: 'bad', id: Date.now() });
      // 409 (někdo byl rychlejší): srovnat obsazenost na obrazovce.
      obnovNavic();
    }
    setProbiha(null);
  };

  const tlacitko = (u: UkolNavic, a: AkceUkolu) => {
    const size = velke ? 'lg' : 'md';
    const nazev = u.nabidka.title;
    if (a === 'vzit') return (
      <Button key={a} variant="secondary" size={size} icon="plus" loading={probiha === u.nabidka.id} disabled={probiha != null && probiha !== u.nabidka.id}
        aria-label={t('Beru si: {nazev}', { nazev })} onClick={() => void zmen(u, 'vzit')} data-akce="vzit">{t('Beru si')}</Button>
    );
    if (a === 'vratit') return (
      <Button key={a} variant="ghost" size={size} disabled={probiha != null}
        aria-label={t('Vrátit: {nazev}', { nazev })} onClick={() => void zmen(u, 'vratit')} data-akce="vratit">{t('Vrátit')}</Button>
    );
    return (
      <Button key={a} variant={tiche ? 'secondary' : 'primary'} size={size} icon={u.nabidka.requirePhoto ? 'camera' : 'check'} disabled={probiha != null}
        aria-label={t('Hotovo: {nazev}', { nazev })} onClick={() => setHotovo(u)} data-akce="hotovo">{t('Hotovo')}</Button>
    );
  };

  const radek = (u: UkolNavic) => {
    const n = u.nabidka;
    const chip = stavUkoluChip(t, u.stav);
    const mista = volnaMista(u);
    const kdo = ostatni(u, ja);
    const odmena = odmenaKratce(n, money);
    const akce = nahled ? [] : akceUkolu(u, poOdchodu);
    const meta = [textOpakovani(t, n, jazyk)];
    if (kdo.berou.length) meta.push(t('Bere {jmena}', { jmena: kdo.berou.map(krestni).join(', ') }));
    if (kdo.hotovo.length) meta.push(t('Udělal(a) {jmena}', { jmena: kdo.hotovo.map(krestni).join(', ') }));
    if (mista && u.stav !== 'plno' && u.stav !== 'vzato') meta.push(t('{volno} z {z} volné', mista));
    return (
      <li key={n.id} className="list-row items-start" data-ukol-za-body={n.id} data-stav={u.stav}>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <p className={`min-w-0 flex-1 font-medium leading-snug text-pretty ${velke ? 'text-[17px]' : 'text-[15px]'} ${u.stav === 'uznano' || u.stav === 'plno' ? 'text-black/55' : 'text-[#16181A]'}`}>{n.title}</p>
            {odmena && <span className="shrink-0 font-bold tabular-nums leading-snug text-[15px] text-[#16181A]" data-body>{odmena}</span>}
          </div>
          <p className="t-meta mt-0.5 text-pretty" data-meta>{meta.join(' · ')}</p>
          {popisy && n.description && <p className="text-[13px] text-black/55 leading-snug mt-1 text-pretty">{n.description}</p>}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Chip tone={chip.tone} size="sm" icon={chip.icon}>{chip.text}</Chip>
            {n.requirePhoto && <Chip tone="muted" size="sm" icon="camera">{t('s fotkou')}</Chip>}
            {n.autoApprove && u.stav !== 'uznano' && <Chip tone="muted" size="sm" icon="check">{t('uzná se samo')}</Chip>}
            {akce.length > 0 && <span className="ml-auto flex flex-wrap justify-end gap-2" data-akce-ukolu>{akce.map(a => tlacitko(u, a))}</span>}
          </div>
        </div>
      </li>
    );
  };

  return (
    <>
      {jenAkce
        ? <div className="flex flex-wrap gap-2" data-ukoly-za-body data-jen-akce>{videt.flatMap(u => (nahled ? [] : akceUkolu(u, poOdchodu)).map(a => tlacitko(u, a)))}</div>
        : <ul className="list" data-ukoly-za-body>{videt.map(radek)}</ul>}
      {max != null && ukoly.length > videt.length && (
        <p className="t-meta mt-2">{t('…a {n, plural, one {# další} few {# další} other {# dalších}}', { n: ukoly.length - videt.length })}</p>
      )}
      {!nahled && (
        <ZapsatNavic open={hotovo != null} onClose={() => setHotovo(null)} actingAs={actingAs} jmeno={jmeno}
          predvolby={hotovo ? { offerId: hotovo.nabidka.id, text: hotovo.nabidka.title, day: pragueToday(), nabidka: hotovo.nabidka } : null}
          onUlozeno={item => onZapsano?.(item)} />
      )}
      <Toast message={toast?.text ?? null} tone={toast?.tone} id={toast?.id} onClose={() => setToast(null)} />
    </>
  );
}

export default UkolyZaBody;
