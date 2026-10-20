'use client';

// Widgety oblasti „Moje směny" — komponenty (kolo 68, spec §2.5, §6.1).
//
// Vlastník v kole 69: balík B1 (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/moje-smeny.ts;
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — hlídá to test AK-20 v scripts/testy/k68-widgety.ts.
//
// Kontrakt (spec §2.6): komponenta dostane WidgetProps (instance, velikost, nastaveni,
// nahled), kreslí se vždy v obalu <Widget> z ../Widget, data bere jen přes useDataWidgetu
// (URL null, dokud neplatí brána z registru a useSmi pro pole), navigaci přes useNavigace.
// Soubor se stahuje líně, až když je widget oblasti na ploše (registr.ts).
//
// Co tu je (kolo 68):
//  - moje.nejblizsi_smena — nástupce dlaždice z Domů zaměstnance, která byla
//    <button glass-card> (průhledná, šedá), s ikonou v limetkovém kolečku, datem
//    30 px a prázdnem jen textem. Teď bílá karta widgetu, čas jako Stat (28 px)
//    a den větou; malá velikost je celá proklik do Mých směn.
//
// Kolo 69 (balík B1) — bloky, které Moje směny kreslily natvrdo:
//  - moje.smeny_prehled — dřív tři karty-dlaždice (šablona „hero metrik", DP §3.5)
//    s číslem 30 px, limetkovým proužkem a hover, který kartu zašedil. Teď jedna
//    karta se StatRow (M) nebo jedno číslo (S). Odpracované hodiny z časů směny,
//    noční směna přes půlnoc už nevychází záporně (lib/rozvrhPrehled);
//  - moje.minule_smeny — řádky s ručními chipy a „★ 4/5" znakem místo ikony. Teď
//    `.list` a hodnocení chipem s ikonou `star`; hodnocení nese /api/shifts
//    (dřív /api/rewards, které člověku s odmeny.zebricek reviews nevracelo);
//  - moje.schvalene_volno — dřív ručně modré pilulky jen se schváleným volnem.
//    Teď i čekající žádosti (čekání je taky informace) a rozsah s typem.
//
// Kolo 9 (N1, balík Z) — „Navíc":
//  - moje-smeny.navic — vlastní zápisy toho, co bylo nad rámec směny, body a nabídka
//    vedení (komponenta components/navic/NavicWidget, okno components/navic/ZapsatNavic);
//  - Nejbližší směna (když už běží) a Minulé směny mají akci „Navíc" → okno se směnou
//    a jejím dnem; u směny chip „navíc: 2", když k ní zápisy jsou. GET ?shiftId= po jedné
//    směně by byl drahý — bere se jedna odpověď vlastních zápisů za 60 dní a počítá se tady.
//
// Kolo 10 (balík Z) — „Tresty":
//  - moje-smeny.tresty — vlastní tresty, potvrzení „Beru na vědomí" a vyjádření
//    (komponenta components/tresty/TrestyWidget, okno components/tresty/DetailTrestu).

import { useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button, Chip, ListRow, Sloupec, Stat, StatRow } from '../../ui';
import { Icon } from '../../Icons';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { Widget, type StavNacteni } from '../Widget';
import { useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';
import { useTymSmeny } from '../useTymSmeny';
import { KolegoveSmeny } from '../KolegoveSmeny';
import { pragueHM, pragueToday } from '@/lib/pragueTime';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { tg, aktualniJazyk } from '@/lib/i18n/stav';
import { fmtDatum, fmtHM } from '@/lib/i18n/format';
import {
  den as denZ, denKratce as denKratceCs, dnuVolna, hodinyText, kategorieBarvy, kolegoveKeSmene, minuleSmeny, mojeCisla, popisekTypu,
  TYP_VOLNA, zadostiVolna, type ZadostVolna,
} from '@/lib/rozvrhPrehled';
import { NavicWidget } from '../../navic/NavicWidget';
import { pocetNavicKeSmene } from '../../navic/logika';
import { ZapsatNavic, type PredvolbyNavic } from '../../navic/ZapsatNavic';
import { urlNavicMine, useDataNavic } from '../../navic/data';
import { TrestyWidget } from '../../tresty/TrestyWidget';

// ---------------------------------------------------------------------------
// Pomocníci (záměrně v souboru — oblast je samostatný líný kus s jedním vlastníkem)
// ---------------------------------------------------------------------------

const RELACE_NACITA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

/**
 * Id přihlášeného. Kontrakt widgetu uživatele nenese a vlastní směny se
 * berou přes `?employeeId=` — jen tahle větev /api/shifts filtruje podnik
 * (bez parametru by zaměstnanec dostal směny ze všech podniků a vedení celý tým).
 */
function useJa(t: PrekladFn): { id: number | null; stav: StavNacteni | null } {
  const { data, status, update } = useSession();
  if (status === 'loading') return { id: null, stav: RELACE_NACITA };
  const id = Number((data?.user as { id?: unknown } | undefined)?.id);
  if (Number.isFinite(id) && id > 0) return { id, stav: null };
  return { id: null, stav: { data: null, error: t('Nevím, kdo je přihlášený — obnov stránku.'), loading: false, reload: () => { void update(); } } };
}

const den = (v: unknown): string => (/^\d{4}-\d{2}-\d{2}/.test(String(v ?? '')) ? String(v).slice(0, 10) : '');
const hm = (t: unknown) => String(t ?? '').slice(0, 5);

/** „2026-09-28" → „pondělí 28. září" v jazyce uživatele. */
const denVetou = (d: string) => fmtDatum(d, { jazyk: aktualniJazyk(), styl: 'denDlouze' });
/** Krátce do štítku: „Dnes", „Zítra", jinak „po 28. 9." — v jazyce uživatele. */
function denKratce(d: string, t: PrekladFn): string {
  if (d === pragueToday()) return t('Dnes');
  if (d === pragueToday(1)) return t('Zítra');
  return fmtDatum(d, { jazyk: aktualniJazyk(), styl: 'denKratce' });
}
/** Totéž pro řádky, kde „dnes" určuje volající (kvůli posunu pásma). */
function denKratceRadek(d: string, dnes: string, t: PrekladFn): string {
  const k = denKratceCs(d, dnes);
  return k === 'Dnes' || k === 'Zítra' ? t(k) : fmtDatum(d, { jazyk: aktualniJazyk(), styl: 'denKratce' });
}
/** Rozsah volna: „3. 10. 2026", „3. 10. – 7. 10. 2026", přes rok celé obě. */
function rozsahVolna(od: string, doDne: string): string {
  const jazyk = aktualniJazyk();
  const f = (d: string, rok: boolean) => fmtDatum(d, { jazyk, styl: rok ? 'cislo' : 'kratce' });
  if (!doDne || od === doDne) return f(od, true);
  if (od.slice(0, 4) === doDne.slice(0, 4)) return `${f(od, false)} – ${f(doDne, true)}`;
  return `${f(od, true)} – ${f(doDne, true)}`;
}

/**
 * Zápisy „navíc" ke směnám (kolo 9): jedna odpověď vlastních zápisů za 60 dní a počet
 * ke směně podle shiftId, nebo podle dne, když zápis směnu nenese (zapsaný z Domů).
 * Bez navic.zapsat se dotaz neposílá a akce „Navíc" se nekreslí.
 */
function useNavicKeSmenam(zapnuto: boolean): { pocet: (s: { id?: number; date: string }) => number; smi: boolean; nacteno: boolean } {
  const smi = useSmi();
  const smiZapsat = zapnuto && smi('navic.zapsat');
  const data = useDataNavic(smiZapsat ? urlNavicMine() : null);
  const items = data.data?.items ?? [];
  const pocet = (s: { id?: number; date: string }) => pocetNavicKeSmene(items, s);
  return { pocet, smi: smiZapsat && data.data?.smi.zapsat !== false, nacteno: !!data.data };
}

// Typ směny nese kategorie, ne stavová barva (ScheduleBuilder, COLORS → cat-dot).
const KATEGORIE_BARVY: Record<string, number> = {
  '#c8f542': 1, '#3b82f6': 2, '#0a84ff': 2, '#8b5cf6': 3, '#f59e0b': 4, '#14b8a6': 5, '#ec4899': 6, '#f43f5e': 6,
};
// API vrací u směny bez typu jeho surovou hodnotu; tyhle dvě do věty nepatří.
const POPISEK_TYPU: Record<string, string> = { auto: 'Mimo rozvrh', custom: 'Směna' };

interface MojeSmena { id?: number; date: string; startTime?: string; endTime?: string; start_time?: string; end_time?: string; type?: string; typeLabel?: string; typeColor?: string; rating?: number | null; note?: string | null }

function vyberSmeny(raw: any): MojeSmena[] {
  if (!Array.isArray(raw)) throw new Error(tg('Směny přišly v nečekaném tvaru.'));
  return raw;
}

// ---------------------------------------------------------------------------
// Nejbližší směna
// ---------------------------------------------------------------------------

function NejblizsiSmena({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const ja = useJa(t);
  const nav = useNavigace();
  const data = useDataWidgetu(ja.id != null ? `/api/shifts?employeeId=${ja.id}` : null, vyberSmeny);

  const { prvni, dalsi, probiha } = useMemo(() => {
    const dnes = pragueToday();
    const ted = pragueHM();
    const nadchazejici = (data.data ?? [])
      .map(s => ({ den: den(s.date), od: hm(s.startTime ?? s.start_time), do: hm(s.endTime ?? s.end_time), s }))
      .filter(x => {
        if (!x.den || x.den < dnes) return false;
        if (x.den > dnes) return true;
        // Dnešní směna, která už skončila, „nejbližší" není; přes půlnoc (konec < začátek) ještě běží.
        return !x.do || x.do > ted || x.do < x.od;
      })
      .sort((a, b) => a.den.localeCompare(b.den) || a.od.localeCompare(b.od));
    const p = nadchazejici[0] ?? null;
    return {
      prvni: p,
      dalsi: nadchazejici[1] ?? null,
      probiha: !!p && p.den === dnes && !!p.od && p.od <= ted,
    };
  }, [data.data]);

  const S = velikost === 'S';
  const muze = !nahled && nav.smiPohled('my-shifts');
  // S kým mám tu směnu: malá karta na to nemá místo a náhled v galerii se na tým neptá.
  const smi = useSmi();
  const tym = useTymSmeny(!S && !nahled && smi('rozvrh.nahled'), [prvni?.den.slice(0, 7) ?? '']);
  const kolegove = useMemo(
    () => (prvni ? kolegoveKeSmene({ date: prvni.den, startTime: prvni.od, endTime: prvni.do }, tym.smeny) : []),
    [prvni, tym.smeny],
  );
  const typ = prvni ? (POPISEK_TYPU[String(prvni.s.typeLabel ?? '')] ? t(POPISEK_TYPU[String(prvni.s.typeLabel ?? '')]) : prvni.s.typeLabel ?? null) : null;
  const kat = prvni ? KATEGORIE_BARVY[String(prvni.s.typeColor ?? '').toLowerCase()] ?? null : null;
  const cas = prvni ? (prvni.do ? `${prvni.od}–${prvni.do}` : prvni.od) : '';
  // Kolo 9: běžící směna nabídne „Navíc" — co bylo nad rámec, se zapisuje ještě na směně, ne večer z paměti.
  const navic = useNavicKeSmenam(!S && !nahled && probiha);
  const [oknoNavic, setOknoNavic] = useState<PredvolbyNavic | null>(null);
  const pocetNavic = prvni ? navic.pocet({ id: prvni.s.id, date: prvni.den }) : 0;

  return (
    <Widget
      nacteni={ja.stav ?? data}
      odkaz={S ? undefined : { popisek: t('Moje směny'), pohled: 'my-shifts' }}
      otevrit={S && muze ? () => nav.onNavigate('my-shifts') : undefined}
      prazdno={prvni ? undefined : <p className="t-meta">{t('Další směnu v rozvrhu zatím nemáš.')}</p>}
      // v4 (V16): „Navíc" k běžící směně je akce widgetu — patka L→R × 44 na konci karty, ne pilulka pod textem.
      patka={!S && prvni && probiha && navic.smi ? (
        <span className="flex" data-navic-smeny>
          <Button variant="secondary" icon="sparkle" onClick={() => setOknoNavic({ day: prvni.den, shiftId: prvni.s.id ?? null })}>{t('Navíc')}</Button>
        </span>
      ) : undefined}
    >
      {prvni && (S ? (
        // Malá karta má na telefonu ~140 px: celé „08:00–16:00" v 28 px by přeteklo,
        // proto velký jen začátek a konec v poznámce.
        <Stat label={probiha ? t('Právě probíhá') : denKratce(prvni.den, t)} value={prvni.od || '—'}
          note={[prvni.do && t('do {cas}', { cas: prvni.do }), typ].filter(Boolean).join(' · ') || undefined} />
      ) : (
        <Sloupec mezera={2}>
          <Stat label={probiha ? t('Právě probíhá') : denKratce(prvni.den, t)} value={cas || '—'}
            // ::first-letter (cz-sentence) funguje jen na blokovém prvku — řádek bez typu začíná dnem.
            note={<span className="block truncate cz-sentence">
              {typ && <><span aria-hidden className={`inline-block h-2 w-2 rounded-full align-middle mr-1.5 ${kat ? `cat-dot-${kat}` : 'bg-black/15'}`} />{typ} · </>}
              {denVetou(prvni.den)}
            </span>} />
          {/* Instrukce vedení ke směně (kolo 7) — ráno je tohle první, co člověk potřebuje vědět. */}
          {prvni.s.note && (
            <p className="t-meta text-pretty flex items-start gap-1.5" data-poznamka-smeny>
              <Icon name="chat" size={13} className="shrink-0 mt-0.5 text-black/45" />
              <span className="min-w-0">{prvni.s.note}</span>
            </p>
          )}
          {tym.zapnuto && <p className="t-meta text-pretty"><KolegoveSmeny kolegove={kolegove} hotovo={tym.hotovo} /></p>}
          {dalsi && (
            <p className="t-meta">
              {t('Potom')} <span className="tabular-nums">{denVetou(dalsi.den)}{dalsi.od ? `, ${dalsi.od}${dalsi.do ? `–${dalsi.do}` : ''}` : ''}</span>
            </p>
          )}
          {probiha && navic.smi && pocetNavic > 0 && (
            <span className="flex"><Chip tone="muted" size="sm" icon="sparkle">{t('navíc: {n}', { n: pocetNavic })}</Chip></span>
          )}
        </Sloupec>
      ))}
      <ZapsatNavic open={oknoNavic != null} onClose={() => setOknoNavic(null)} predvolby={oknoNavic} />
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Moje směny v číslech
// ---------------------------------------------------------------------------

function SmenyPrehled({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const ja = useJa(t);
  const nav = useNavigace();
  const data = useDataWidgetu(ja.id != null ? `/api/shifts?employeeId=${ja.id}` : null, vyberSmeny);
  const c = useMemo(() => mojeCisla((data.data ?? []).map((s, i) => ({ id: i, ...s })), pragueToday()), [data.data]);
  const S = velikost === 'S';
  const muze = !nahled && nav.smiPohled('my-shifts');

  return (
    <Widget
      nacteni={ja.stav ?? data}
      kostra="cislo"
      otevrit={S && muze ? () => nav.onNavigate('my-shifts') : undefined}
      prazdno={c.celkem === 0 ? <p className="t-meta text-pretty">{t('Zatím nemáš v rozvrhu žádnou směnu.')}</p> : undefined}
    >
      {S ? (
        <Stat label={t('Nadcházející')} value={c.nadchazejici.toLocaleString('cs-CZ')} note={t('{n, plural, one {směna} few {směny} other {směn}}', { n: c.nadchazejici })} />
      ) : (
        <StatRow>
          <Stat label={t('Nadcházející')} value={c.nadchazejici.toLocaleString('cs-CZ')} note={t('{n, plural, one {směna} few {směny} other {směn}}', { n: c.nadchazejici })} />
          {/* Součet délek směn z rozvrhu, ne z píchaček — „Odpracováno" podle docházky ukazuje dochazka.moje_odpracovano. */}
          {/* Poznámka se smí zalomit: „z rozvrhu do včerejška" je to, čím se číslo liší od píchaček,
              a ve dvou sloupcích na telefonu by se useklo na „z rozvrhu do…". */}
          <Stat label={t('Naplánováno')} value={hodinyText(c.odpracovanoH)} unit={t('h')}
            note={<span className="block whitespace-normal text-pretty">{t('{n, plural, one {# směna} few {# směny} other {# směn}} z rozvrhu do včerejška', { n: c.minulych })}</span>} />
          <Stat label={t('Celkem')} value={c.celkem.toLocaleString('cs-CZ')} note={t('{n, plural, one {směna} few {směny} other {směn}}', { n: c.celkem })} />
        </StatRow>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Minulé směny
// ---------------------------------------------------------------------------

function MinuleSmeny({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const ja = useJa(t);
  const data = useDataWidgetu(ja.id != null ? `/api/shifts?employeeId=${ja.id}` : null, vyberSmeny);
  const dnes = pragueToday();
  const minule = useMemo(() => minuleSmeny((data.data ?? []).map((s, i) => ({ id: s.id ?? i, ...s })), dnes), [data.data, dnes]);
  const limit = velikost === 'L' ? 20 : 5;
  // Kolo 9: „Navíc" u minulé směny — zaměstnanec smí zapsat nejvýš 14 dní zpětně (hlídá okno i server).
  const navic = useNavicKeSmenam(!nahled);
  const [oknoNavic, setOknoNavic] = useState<PredvolbyNavic | null>(null);

  return (
    <Widget
      nacteni={ja.stav ?? data}
      doplnek={minule.length > 0 ? <Chip tone="muted" size="sm">{minule.length.toLocaleString('cs-CZ')}</Chip> : undefined}
      prazdno={minule.length === 0 ? <p className="t-meta">{t('Zatím žádná odpracovaná směna.')}</p> : undefined}
    >
      <ul className="list">
        {minule.slice(0, limit).map(s => {
          const kat = kategorieBarvy(s.typeColor);
          const pocetNavic = navic.smi ? navic.pocet(s) : 0;
          return (
            <ListRow key={s.id} akceVRadku
              title={<span className="cz-sentence">{denKratceRadek(denZ(s.date), dnes, t)}</span>}
              meta={<><span aria-hidden className={`inline-block h-2 w-2 rounded-full align-middle mr-1.5 ${kat ? `cat-dot-${kat}` : 'bg-black/15'}`} />{t(popisekTypu(s))} · <span className="tabular-nums">{fmtHM(s.startTime ?? s.start_time)}–{fmtHM(s.endTime ?? s.end_time)}</span></>}
              right={<>
                {pocetNavic > 0 && <Chip tone="muted" size="sm" icon="sparkle" className="mr-1">{t('navíc: {n}', { n: pocetNavic })}</Chip>}
                {s.rating ? <Chip tone="ok" size="sm" icon="star">{s.rating}/5</Chip> : <Chip tone="muted" size="sm">{t('Bez hodnocení')}</Chip>}
              </>}
              actions={navic.smi ? (
                <Button variant="ghost" size="sm" iconOnly icon="sparkle" aria-label={t('Zapsat navíc ke směně {den}', { den: denKratceRadek(denZ(s.date), dnes, t) })}
                  title={t('Zapsat navíc')} onClick={() => setOknoNavic({ day: denZ(s.date), shiftId: typeof s.id === 'number' && s.id > 0 ? s.id : null })} />
              ) : undefined}
            />
          );
        })}
      </ul>
      {minule.length > limit && <p className="t-meta mt-2">{t('…a dalších {n}', { n: (minule.length - limit).toLocaleString('cs-CZ') })}</p>}
      <ZapsatNavic open={oknoNavic != null} onClose={() => setOknoNavic(null)} predvolby={oknoNavic} />
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Moje volno
// ---------------------------------------------------------------------------

function vyberMojeZadosti(raw: any): ZadostVolna[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.requests)) throw new Error(tg('Žádosti o volno přišly v nečekaném tvaru.'));
  return raw.requests;
}

/** Nárok na dovolenou z téže odpovědi (kolo 8): „Dovolená: zbývá 6 z 20 dní"; bez nároku null. */
function vyberNarokDovolene(raw: any): { dni: number; zbyva: number } | null {
  const n = raw && typeof raw === 'object' ? raw.narok : null;
  if (!n || typeof n !== 'object' || n.dni == null || !Number.isFinite(Number(n.zbyva))) return null;
  return { dni: Number(n.dni), zbyva: Number(n.zbyva) };
}

function SchvaleneVolno({ velikost }: WidgetProps) {
  const t = useT('widgety');
  // `?mine=1`: jen vlastní žádosti i pro vedení, kterému by jinak přišel celý tým.
  const data = useDataWidgetu('/api/timeoff?mine=1', vyberMojeZadosti);
  const narok = useDataWidgetu('/api/timeoff?mine=1', vyberNarokDovolene).data ?? null;
  const dnes = pragueToday();
  const { cekajici, schvalene } = useMemo(() => zadostiVolna(data.data ?? [], dnes), [data.data, dnes]);
  const vse = [...schvalene, ...cekajici].sort((a, b) => denZ(a.fromDate).localeCompare(denZ(b.fromDate)));
  const S = velikost === 'S';
  const prvni = schvalene[0] ?? null;
  // Zůstatek dovolené (kolo 8) — totéž číslo jako v žádosti; bez nároku se nekreslí.
  const zustatek = narok ? (
    <p className="t-meta flex items-center gap-1.5" data-narok-dovolene={narok.zbyva}>
      <Chip tone={narok.zbyva > 0 ? 'ok' : narok.zbyva === 0 ? 'wait' : 'bad'} size="sm" icon="sun">{t('Dovolená: zbývá {n} z {celkem} dní', { n: narok.zbyva, celkem: narok.dni })}</Chip>
    </p>
  ) : null;

  return (
    <Widget
      nacteni={data}
      prazdno={vse.length === 0 ? <Sloupec mezera={2}><p className="t-meta text-pretty">{t('Žádné volno před sebou nemáš.')}</p>{zustatek}</Sloupec> : undefined}
    >
      {S ? (
        prvni ? (
          <Stat label={denZ(prvni.fromDate) <= dnes ? t('Právě máš volno') : t('Nejbližší volno')}
            value={fmtDatum(denZ(prvni.fromDate), { jazyk: aktualniJazyk(), styl: 'kratce' })}
            note={`${t('{n, plural, one {# den} few {# dny} other {# dní}}', { n: dnuVolna(denZ(prvni.fromDate), denZ(prvni.toDate)) })} · ${t(TYP_VOLNA[prvni.type] ?? 'Jiné')}`} />
        ) : (
          <Stat label={t('Čeká na schválení')} value={cekajici.length.toLocaleString('cs-CZ')} note={t('{n, plural, one {žádost} few {žádosti} other {žádostí}}', { n: cekajici.length })} />
        )
      ) : (
        <Sloupec mezera={2}>
          <ul className="list">
            {vse.slice(0, 5).map(z => (
              <ListRow key={z.id}
                title={<span className="tabular-nums">{rozsahVolna(denZ(z.fromDate), denZ(z.toDate))}</span>}
                meta={t(TYP_VOLNA[z.type] ?? 'Jiné')}
                right={z.status === 'approved' ? <Chip tone="ok" size="sm">{t('Schváleno')}</Chip> : <Chip tone="wait" size="sm">{t('Čeká')}</Chip>}
              />
            ))}
          </ul>
          {vse.length > 5 && <p className="t-meta">{t('…a dalších {n}', { n: (vse.length - 5).toLocaleString('cs-CZ') })}</p>}
          {zustatek}
        </Sloupec>
      )}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'moje.nejblizsi_smena': NejblizsiSmena,
  'moje.smeny_prehled': SmenyPrehled,
  'moje.minule_smeny': MinuleSmeny,
  'moje.schvalene_volno': SchvaleneVolno,
  'moje-smeny.navic': NavicWidget,
  'moje-smeny.tresty': TrestyWidget,
};
