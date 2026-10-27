'use client';

// Členové klubu: hledání, filtry (úroveň, skupina, neaktivní N dní, narozeniny tento
// měsíc, otevřený kupon, útrata), řazení, stránkování („Načíst další"), export do CSV,
// výběr hostů a hromadné akce (skupina, bonus bodů, zpráva), úprava bodů, kreditu a útraty
// jednoho hosta, detail s poznámkami, blokací, odebráním z klubu a celou historií a sloučení duplicit. Dřív funkce Clenove v ClientAdmin.tsx se stropem
// 500 řádků a bez filtrů.
//
// Oprávnění: seznam zakaznici.zobrazit, e-mail zakaznici.kontakty, export zakaznici.export,
// skupiny zakaznici.skupiny, body vernost.upravit_body, kredit vernost.kredit_upravit,
// zprávy zakaznici.zpravy, poznámky zakaznici.poznamky.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BulkBar, Button, Card, Chip, EmptyState, ErrorBoundary, ErrorState, Field, Input, ListRow, Modal, SearchField, SelectBox, Select, Skeleton,
  useLoad, useSelection, type BulkAction,
} from '../../ui';
import { cislo } from '@/lib/klientSprava/format';
import { SEGMENTY_HOSTU, prumernyUcet, predKolika, stitkyHosta, type SegmentHostu } from '@/lib/klientSprava/segmentyHostu';
import { useOpravneni } from '../../role/useOpravneni';
import { useMoney, useSymbol } from '../../CurrencyProvider';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { dnuOd } from '@/lib/segmenty';
import { apiMessage, okJson, okText } from '@/lib/api';
import { ulozSoubor } from '@/lib/stahni';
import {
  PRAZDNY_FILTR, RAZENI, UROVNE_ID, HROMADNA_MAX, filtrNaParametry, pocetFiltru, tonBarvy, type FiltrClenu, type RazeniClenu,
} from '@/lib/clenoveFiltr';
import { PRECHOD_TLACITKO, useImportKarticky } from '../PrechodZKarticky';
import type { Hlaska } from '../import/typy';
import { ProfilHosta, denCesky } from './ClenoveDetail';
import { UpravaClenaOkno } from './BodyUpravaClena';
import Duplicity from './Duplicity';
import { HromadnaSkupina, HromadnyBonus, HromadnaZprava, type VyberHostu } from './ClenoveHromadne';

const clenu = (t: PrekladFn, n: number) => t('{n, plural, one {# člen} few {# členové} other {# členů}}', { n });
const STRANKA = 50;
const urovenPopisek = (t: PrekladFn, u: string) => (u === 'silver' ? t('Stříbrný host') : u === 'gold' ? t('Zlatý host') : u === 'platinum' ? t('Platinový host') : t('Člen'));

/** „dnes", „včera", „před 6 dny"… v jazyce uživatele (jako predKolika z lib/klientSprava/segmentyHostu). */
export function predKolikaT(v: Date | string | null | undefined, now: Date, t: PrekladFn): string {
  const d = dnuOd(v ?? null, now);
  if (d == null) return t('zatím nebyl');
  if (d === 0) return t('dnes');
  if (d === 1) return t('včera');
  if (d < 14) return t('{n, plural, one {před # dnem} few {před # dny} other {před # dny}}', { n: d });
  if (d < 60) return t('{n, plural, one {před # týdnem} few {před # týdny} other {před # týdny}}', { n: Math.round(d / 7) });
  if (d < 730) return t('{n, plural, one {před # měsícem} few {před # měsíci} other {před # měsíci}}', { n: Math.round(d / 30) });
  return t('{n, plural, one {před # rokem} few {před # lety} other {před # lety}}', { n: Math.round(d / 365) });
}

interface ClenRadek {
  id: number; name: string; email?: string; points: number; stamps: number; visits: number;
  joined_at: string; last_visit_at: string | null; reservations: number; open_coupons: number;
  // Úroveň podle režimu podniku a efektivní sleva (nejvyšší z úrovně a slev skupin) — počítá server.
  spend?: number; credit?: number; level_reduced?: boolean; level?: string; level_label?: string; discount?: number; discount_source?: 'uroven' | 'skupina' | null; discount_name?: string | null;
  skupiny?: { id: number; name: string; color: string | null }[]; has_birthday_month?: boolean; blocked?: boolean;
}

interface Stranka { rows: ClenRadek[]; total: number; all: number; hasMore: boolean; nextOffset: number | null; segmenty: Partial<Record<SegmentHostu, number>> | null }

/**
 * Je okno aspoň `px` široké? Profil hosta stojí od `lg` (1024) jako panel vedle seznamu, jinak v okně
 * zdola; tabulka hodnoty hosta od `md` (768), pod ní řádky seznamu. Kreslí se vždy jen jedna podoba
 * (jméno hosta je v DOM jednou — odečítač i sondy ho nečtou dvakrát).
 */
function useSiroke(px = 1024): boolean {
  const [siroke, setSiroke] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const zmer = () => setSiroke(mq.matches);
    zmer();
    mq.addEventListener('change', zmer);
    return () => mq.removeEventListener('change', zmer);
  }, [px]);
  return siroke;
}

type Okno = 'skupina' | 'bonus' | 'zprava' | null;

/**
 * Seznam členů s filtry a hromadnými akcemi. `dalsiAkce` je místo pro akce, které
 * dodá jiný okruh (poslat kupon vybraným): přidají se do lišty výběru za ty vlastní.
 */
export default function ClenoveSprava({ oznam, hledat = '', dalsiAkce, otevritProfil = null }: {
  oznam: Hlaska; hledat?: string;
  dalsiAkce?: (vyber: VyberHostu) => BulkAction[];
  /** Zvenku (globální hledání „clen:<id>") otevře profil hosta; `n` roste s každým požadavkem. */
  otevritProfil?: { id: number; n: number } | null;
}) {
  const money = useMoney();
  const symbol = useSymbol();
  const { ma: smi } = useOpravneni();
  const t = useT('sprava');
  const upravujeBody = smi('vernost.upravit_body');
  const upravujeKredit = smi('vernost.kredit_upravit');
  const vidiDenik = smi('vernost.zobrazit');
  // Skupiny člena bydlí ve stejné jamce jako deník, ale nesmí na věrnosti záviset:
  // role se zakaznici.skupiny bez vernost.zobrazit jinde hosta do skupiny nepřidá.
  const meniSkupiny = smi('zakaznici.skupiny');
  const piseZpravy = smi('zakaznici.zpravy');
  const smiExport = smi('zakaznici.export');
  const maPoznamky = smi('zakaznici.poznamky');
  const smiSpravu = smi('zakaznici.sprava_clenu');
  const rozbali = vidiDenik || meniSkupiny || maPoznamky || smiSpravu;

  // Hledání a čísla ve filtrech se ptají serveru s krátkou prodlevou, ať se neptá na každé písmeno.
  const [q, setQ] = useState(hledat);
  useEffect(() => { setQ(hledat); }, [hledat]);
  const [navrh, setNavrh] = useState<FiltrClenu>({ ...PRAZDNY_FILTR, q: hledat });
  const [filtr, setFiltr] = useState<FiltrClenu>({ ...PRAZDNY_FILTR, q: hledat });
  const [razeni, setRazeni] = useState<RazeniClenu>('posledni');
  const [filtryOtevrene, setFiltryOtevrene] = useState(false);
  useEffect(() => {
    const c = setTimeout(() => setFiltr({ ...navrh, q }), 300);
    return () => clearTimeout(c);
  }, [navrh, q]);

  const dotaz = useMemo(() => {
    const p = filtrNaParametry(filtr);
    p.set('sort', razeni);
    return p.toString();
  }, [filtr, razeni]);

  // ---- seznam se stránkováním ----
  const [d, setD] = useState<Stranka | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [dalsi, setDalsi] = useState(false);
  const [verze, setVerze] = useState(0);
  const pozadavek = useRef(0);
  const reload = useCallback(() => setVerze(v => v + 1), []);
  useEffect(() => {
    const id = ++pozadavek.current;
    setChyba(null);
    fetch(`/api/client/admin/customers?${dotaz}&limit=${STRANKA}`).then(okJson).then(raw => {
      if (id !== pozadavek.current) return;
      setD({ rows: Array.isArray(raw?.customers) ? raw.customers : [], total: Number(raw?.total) || 0, all: Number(raw?.all) || 0, hasMore: !!raw?.hasMore, nextOffset: raw?.nextOffset ?? null,
        segmenty: raw?.segmenty && typeof raw.segmenty === 'object' ? raw.segmenty : null });
    }).catch(e => { if (id === pozadavek.current) { setD(null); setChyba(apiMessage(e, t('Členové se nenačetli.'))); } });
  }, [dotaz, verze]);
  const nactiDalsi = async () => {
    if (!d || d.nextOffset == null) return;
    const id = pozadavek.current;
    setDalsi(true);
    try {
      const raw = await fetch(`/api/client/admin/customers?${dotaz}&limit=${STRANKA}&offset=${d.nextOffset}`).then(okJson);
      if (id !== pozadavek.current) return;
      setD(p => p && ({ ...p, rows: [...p.rows, ...(Array.isArray(raw?.customers) ? raw.customers : [])], total: Number(raw?.total) || p.total, hasMore: !!raw?.hasMore, nextOffset: raw?.nextOffset ?? null }));
    } catch (e) { oznam(apiMessage(e, t('Další členy se nepodařilo načíst.')), 'bad'); }
    setDalsi(false);
  };

  // Skupiny pro filtr a hromadné přidání.
  const { data: sk, reload: reloadSkupin } = useLoad<{ groups: { id: number; name: string; color: string | null; dynamic: boolean; archived?: boolean; members: number }[] }>(
    '/api/client/admin/groups', raw => ({ groups: Array.isArray(raw?.groups) ? raw.groups : [] }));

  const imp = useImportKarticky(oznam, reload);
  const smiImport = imp.smi;
  // Profil hosta: id otevřeného; řádek si drží data, ať se panel otevře hned (bez dalšího dotazu na seznam).
  const [profil, setProfil] = useState<ClenRadek | null>(null);
  const siroke = useSiroke();
  const tabulka = useSiroke(768);
  // Okno akce pro jednoho hosta z profilu (Napsat, Kupon) — jinak se bere výběr v seznamu.
  const [jednomu, setJednomu] = useState<VyberHostu | null>(null);
  useEffect(() => {
    if (!otevritProfil?.id) return;
    fetch(`/api/client/admin/customers?limit=200`).then(okJson)
      .then(raw => { const c = (Array.isArray(raw?.customers) ? raw.customers : []).find((x: ClenRadek) => x.id === otevritProfil.id); if (c) setProfil(c); })
      .catch(() => {});
  }, [otevritProfil]);
  const [upravuji, setUpravuji] = useState<ClenRadek | null>(null);
  const [verzeDeniku, setVerzeDeniku] = useState(0);
  const [exportuji, setExportuji] = useState(false);
  const [okno, setOkno] = useState<Okno>(null);
  const [duplicity, setDuplicity] = useState(false);

  // ---- výběr ----
  const sel = useSelection<number>();
  const [vsechny, setVsechny] = useState(false);
  useEffect(() => { sel.exit(); setVsechny(false); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [dotaz]);
  const pocetVyberu = vsechny ? (d?.total ?? 0) : sel.count;
  const vyberSeznamu: VyberHostu = vsechny ? { filter: filtr, pocet: d?.total ?? 0 } : { ids: [...sel.selected], pocet: sel.count };
  const vyber: VyberHostu = jednomu ?? vyberSeznamu;
  const prepniRadek = (id: number) => {
    if (vsechny && d) { setVsechny(false); sel.selectAll(d.rows.map(r => r.id).filter(x => x !== id)); return; }
    sel.toggle(id);
  };
  const vybratVse = () => {
    if (!d) return;
    if (!d.hasMore) { setVsechny(false); sel.selectAll(d.rows.map(r => r.id)); return; }
    if (d.total > HROMADNA_MAX) { oznam(t('Filtr odpovídá {n, plural, one {# hostovi} few {# hostům} other {# hostům}}, najednou jde vybrat nejvýš {max}. Zúži filtr.', { n: d.total, max: HROMADNA_MAX }), 'bad'); return; }
    setVsechny(true);
  };
  const hotovoHromadne = () => { setOkno(null); setJednomu(null); sel.exit(); setVsechny(false); reload(); reloadSkupin(); };
  const zavriOkno = () => { setOkno(null); setJednomu(null); };

  const akceVyberu: BulkAction[] = [
    ...(meniSkupiny ? [{ label: t('Do skupiny'), icon: 'users', primary: true, onClick: () => setOkno('skupina') }] : []),
    ...(upravujeBody ? [{ label: t('Bonus bodů'), icon: 'gift', onClick: () => setOkno('bonus') }] : []),
    ...(piseZpravy ? [{ label: t('Zpráva'), icon: 'send', onClick: () => setOkno('zprava') }] : []),
    ...(dalsiAkce ? dalsiAkce(vyberSeznamu) : []),
  ];

  const exportuj = async () => {
    setExportuji(true);
    try {
      const text = await fetch(`/api/client/admin/customers?${dotaz}&format=csv`).then(okText);
      const r = await ulozSoubor('clenove.csv', text, 'text/csv;charset=utf-8');
      if (r !== 'nejde') oznam(t('Export členů je uložený.'));
    } catch (err) { oznam(apiMessage(err, t('Export se nepodařil.')), 'bad'); }
    setExportuji(false);
  };

  const nastavFiltr = (zmena: Partial<FiltrClenu>) => setNavrh(p => ({ ...p, ...zmena }));
  const zrusFiltry = () => { setQ(''); setNavrh({ ...PRAZDNY_FILTR }); setFiltr({ ...PRAZDNY_FILTR }); };
  const pocetPodminek = pocetFiltru(navrh);
  const jeFiltrovano = pocetPodminek > 0 || !!filtr.q || !!filtr.segment;
  const skupiny = sk?.groups ?? [];
  const rucniSkupiny = skupiny.filter(g => !g.dynamic && !g.archived);
  const prazdnaCelkem = d && d.all === 0;
  const ted = new Date();
  const vybiraSe = meniSkupiny || upravujeBody || piseZpravy;
  /** Akce v profilu hosta: jen ty, na které má divák oprávnění. */
  const akceProfilu = (c: ClenRadek) => {
    const jen: VyberHostu = { ids: [c.id], pocet: 1 };
    return [
      ...(piseZpravy ? [{ label: t('Napsat'), icon: 'send', onClick: () => { setJednomu(jen); setOkno('zprava'); }, aria: t('Napsat zprávu: {jmeno}', { jmeno: c.name }) }] : []),
      ...((upravujeBody || upravujeKredit) ? [{ label: upravujeBody ? t('Body ±') : t('Kredit ±'), icon: 'gift', onClick: () => setUpravuji(c), aria: t('Upravit body a kredit: {jmeno}', { jmeno: c.name }) }] : []),
      ...(dalsiAkce ? dalsiAkce(jen).slice(0, 1).map(a => ({ label: a.label, icon: a.icon ?? 'tag', onClick: a.onClick })) : []),
    ];
  };
  const segment = navrh.segment;
  const pocetVsech = d?.all ?? null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <SearchField className="w-full max-w-sm" value={q} onChange={setQ} storageKey="hoste" placeholder={smi('zakaznici.kontakty') ? t('Jméno nebo e-mail') : t('Jméno')} ariaLabel={t('Hledat zákazníka')} />
        {d && <p className="t-meta tabular-nums" aria-live="polite">{jeFiltrovano ? t('{kolik} z {celkem}', { kolik: clenu(t, d.total), celkem: d.all }) : clenu(t, d.total)}</p>}
        {/* v4 (P2 výjimka a): počet vlevo, akce u pravé hrany i na telefonu — dřív „148 členů · Filtry ·
            Duplicity" vlevo a řada končila v půlce. */}
        <div className="flex items-center justify-end gap-2 flex-wrap ml-auto">
          <Button size="sm" variant={filtryOtevrene || pocetPodminek ? 'primary' : 'secondary'} icon="grid" aria-expanded={filtryOtevrene} onClick={() => setFiltryOtevrene(v => !v)}>
            {pocetPodminek ? t('Filtry ({n})', { n: pocetPodminek }) : t('Filtry')}
          </Button>
          {smiExport && <Button size="sm" variant="secondary" icon="download" loading={exportuji} disabled={!d || d.total === 0} onClick={() => { void exportuj(); }}>{t('Export CSV')}</Button>}
          {smiImport && <Button size="sm" variant="secondary" icon="upload" onClick={imp.otevri}>{PRECHOD_TLACITKO}</Button>}
          {smiSpravu && <Button size="sm" variant="secondary" icon="users" onClick={() => setDuplicity(true)}>{t('Duplicity')}</Button>}
        </div>
      </div>

      {/* Segmenty jako čipy s počty (koncept B, audit C §7): klepnutí filtruje seznam, druhé klepnutí zruší.
          Počty jsou ze serveru ze stejných dat jako seznam (lib/klientSprava/segmentyHostu.ts). */}
      {d?.segmenty && (pocetVsech ?? 0) > 0 && (
        <div className="flex gap-1.5 overflow-x-auto scroll-fade-x" role="group" aria-label={t('Segmenty hostů')}>
          <button type="button" aria-pressed={!segment} onClick={() => { setNavrh(p => ({ ...p, segment: '' })); setFiltr(p => ({ ...p, segment: '' })); }}
            className={`filter-pill tap-target-sm tabular-nums whitespace-nowrap ${!segment ? 'seg-on' : 'seg-off glass'}`}>{t('Všichni')} · {pocetVsech}</button>
          {SEGMENTY_HOSTU.map(sg => {
            const n = d.segmenty?.[sg.id] ?? 0;
            const on = segment === sg.id;
            return (
              <button key={sg.id} type="button" aria-pressed={on} title={t(sg.popis)}
                onClick={() => { const v = on ? '' : sg.id; setNavrh(p => ({ ...p, segment: v })); setFiltr(p => ({ ...p, segment: v })); }}
                className={`filter-pill tap-target-sm tabular-nums whitespace-nowrap ${on ? 'seg-on' : 'seg-off glass'}`}>{t(sg.label)} · {n}</button>
            );
          })}
        </div>
      )}

      {filtryOtevrene && (
        <Card className="space-y-4" aria-label={t('Filtry členů')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field id="cf-razeni" label={t('Řazení')}>
              <Select id="cf-razeni" value={razeni} onChange={e => setRazeni(e.target.value as RazeniClenu)}>
                {RAZENI.map(r => <option key={r.id} value={r.id}>{t(r.label)}</option>)}
              </Select>
            </Field>
            <Field id="cf-uroven" label={t('Úroveň')}>
              <Select id="cf-uroven" value={navrh.level} onChange={e => nastavFiltr({ level: e.target.value })}>
                <option value="">{t('Všechny úrovně')}</option>
                {UROVNE_ID.map(u => <option key={u} value={u}>{urovenPopisek(t, u)}</option>)}
              </Select>
            </Field>
            <Field id="cf-skupina" label={t('Skupina')}>
              <Select id="cf-skupina" value={String(navrh.group || '')} onChange={e => nastavFiltr({ group: Number(e.target.value) || 0 })}>
                <option value="">{t('Všechny skupiny')}</option>
                {skupiny.map(g => <option key={g.id} value={g.id}>{g.name} ({g.members})</option>)}
              </Select>
            </Field>
            <Field id="cf-quiet" label={t('Nepřišli aspoň (dní)')} hint={t('Bez návštěvy se počítá od přidání do klubu.')}>
              <Input id="cf-quiet" type="number" inputMode="numeric" min={1} max={3650} placeholder={t('třeba {n}', { n: 60 })} value={navrh.quietDays || ''}
                onChange={e => nastavFiltr({ quietDays: Math.max(0, Math.min(3650, Math.floor(Number(e.target.value)) || 0)) })} />
            </Field>
            <Field id="cf-spend" label={t('Útrata od ({mena})', { mena: symbol })} hint={t('Celková útrata za celou dobu.')}>
              <Input id="cf-spend" type="number" inputMode="numeric" min={1} placeholder={t('třeba {n}', { n: 2000 })} value={navrh.spendOver || ''}
                onChange={e => nastavFiltr({ spendOver: Math.max(0, Math.floor(Number(e.target.value)) || 0) })} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={navrh.birthdayMonth} onClick={() => nastavFiltr({ birthdayMonth: !navrh.birthdayMonth })}
              className={`filter-pill tap-target-sm ${navrh.birthdayMonth ? 'seg-on' : 'seg-off glass'}`}>{t('Narozeniny tento měsíc')}</button>
            <button type="button" aria-pressed={navrh.openCoupon} onClick={() => nastavFiltr({ openCoupon: !navrh.openCoupon })}
              className={`filter-pill tap-target-sm ${navrh.openCoupon ? 'seg-on' : 'seg-off glass'}`}>{t('Má otevřený kupon')}</button>
            {jeFiltrovano && <Button size="sm" variant="ghost" onClick={zrusFiltry}>{t('Zrušit filtry')}</Button>}
          </div>
        </Card>
      )}

      {chyba ? <ErrorState title={t('Členové se nenačetli')} onRetry={reload} detail={chyba} />
        : d === null ? <div className="space-y-2"><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></div>
        : d.rows.length === 0 ? (
          <Card>
            {prazdnaCelkem ? (
              <EmptyState icon="users" compact title={t('Zatím žádní členové')}
                hint={smiImport ? t('Přidají se sami na tvé stránce pro hosty. Máš členy v Kartičce? Přeneseš je i s body a razítky.') : t('Přidají se sami na tvé stránce pro hosty.')}
                action={smiImport ? <Button size="sm" variant="secondary" icon="upload" onClick={imp.otevri}>{PRECHOD_TLACITKO}</Button> : undefined} />
            ) : (
              <EmptyState icon="users" compact title={t('Nikdo takový')} hint={t('Zkus uvolnit filtry nebo hledat jinak.')}
                action={jeFiltrovano ? <Button size="sm" variant="secondary" onClick={zrusFiltry}>{t('Zrušit filtry')}</Button> : undefined} />
            )}
          </Card>
        ) : (
          <div className={profil && siroke ? 'grid grid-cols-[minmax(0,1fr)_22.5rem] gap-4 items-start' : ''}>
          <Card pad="none" className="min-w-0">
            {/* Monitor: tabulka s hodnotou hosta (čísla na pravé hraně, tabular-nums). Ø účet a body se při
                otevřeném profilu schovají, ať jméno nepřeteče. Telefon: řádky seznamu (V4). */}
            {tabulka ? <div className="px-5 pt-1">
              <table className="w-full text-sm tabular-nums" aria-label={t('Hosté')}>
                <thead>
                  <tr className="t-label text-left">
                    {vybiraSe && <th className="w-10 py-3"><span className="sr-only">{t('Výběr')}</span></th>}
                    <th className="font-medium py-3 pr-3">{t('Host')}</th>
                    <th className="font-medium py-3 pr-3 text-right">{t('Návštěvy')}</th>
                    <th className="font-medium py-3 pr-3 text-right">{t('Útrata')}</th>
                    {!profil && <th className="font-medium py-3 pr-3 text-right">{t('Ø účet')}</th>}
                    <th className="font-medium py-3 pr-3">{t('Naposledy')}</th>
                    {!profil && <th className="font-medium py-3 text-right">{t('Body')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {d.rows.map(c => {
                    const prumer = prumernyUcet(c.spend, c.visits);
                    const otevren = profil?.id === c.id;
                    return (
                      // `list-row` (s `table-row`): řádek seznamu hostů — výběr a jméno jsou ovládání řádku (V4), ne řada ovládání karty.
                      <tr key={c.id} className={`list-row table-row border-t border-black/[0.06] align-top ${otevren ? 'bg-black/[0.035]' : 'hover:bg-black/[0.02]'}`}>
                        {vybiraSe && <td className="py-3"><SelectBox checked={vsechny || sel.has(c.id)} onChange={() => prepniRadek(c.id)} label={t('Vybrat: {jmeno}', { jmeno: c.name })} /></td>}
                        <td className="py-2.5 pr-3 min-w-0">
                          <button type="button" onClick={() => setProfil(otevren ? null : c)} aria-expanded={otevren}
                            aria-label={t('Profil hosta {jmeno}', { jmeno: c.name })} className="tap-target-sm block w-full min-w-0 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542]">
                            <span className="block text-[15px] font-medium leading-snug text-[#16181A] break-words">{c.name}</span>
                            <StitkyRadku c={c} />
                          </button>
                        </td>
                        <td className="py-3 pr-3 text-right">{c.visits}</td>
                        <td className="py-3 pr-3 text-right font-semibold">{Number(c.spend) > 0 ? money(Number(c.spend)) : '–'}</td>
                        {!profil && <td className="py-3 pr-3 text-right text-black/70">{prumer != null ? money(prumer) : '–'}</td>}
                        <td className="py-3 pr-3 text-black/70 whitespace-nowrap">{predKolikaT(c.last_visit_at, ted, t)}</td>
                        {!profil && <td className="py-3 text-right">{cislo(c.points)}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div> : (
            <ul className="list px-4">
              {d.rows.map(c => {
                const prumer = prumernyUcet(c.spend, c.visits);
                return (
                  <ListRow key={c.id}
                    lead={vybiraSe ? <SelectBox checked={vsechny || sel.has(c.id)} onChange={() => prepniRadek(c.id)} label={t('Vybrat: {jmeno}', { jmeno: c.name })} /> : undefined}
                    title={<button type="button" onClick={() => setProfil(c)} aria-label={t('Profil hosta {jmeno}', { jmeno: c.name })} className="block w-full min-w-0 text-left">
                      <span className="block truncate">{c.name}</span>
                    </button>}
                    detail={<StitkyRadku c={c} />}
                    meta={`${t('{n} návšt.', { n: c.visits })} · ${t('naposledy {kdy}', { kdy: predKolikaT(c.last_visit_at, ted, t) })}`}
                    value={Number(c.spend) > 0 ? money(Number(c.spend)) : <>{cislo(c.points)} <span className="text-xs font-medium text-black/50">{t('b.')}</span></>}
                    valueMeta={Number(c.spend) > 0 ? (prumer != null ? `Ø ${money(prumer)}` : undefined) : t('{n} raz.', { n: c.stamps })} />
                );
              })}
            </ul>)}
            <div className="px-4 sm:px-5 py-3 flex items-center gap-3 flex-wrap border-t border-black/5">
              <p className="t-meta tabular-nums">{t('Zobrazeno {n} z {celkem}', { n: d.rows.length, celkem: d.total })}</p>
              {d.hasMore && <Button size="sm" variant="secondary" loading={dalsi} onClick={() => { void nactiDalsi(); }}>{t('Načíst další')}</Button>}
            </div>
          </Card>
          {profil && siroke && (
            <Card className="sticky top-4 max-h-[calc(100dvh-6rem)] overflow-y-auto scrollbar-thin" aria-label={t('Profil hosta {jmeno}', { jmeno: profil.name })}>
              <ErrorBoundary resetKey={profil.id} zalozka={t('Profil hosta')}>
                <ProfilHosta key={`${profil.id}-${verzeDeniku}`} host={profil} oznam={oznam} vidiDenik={vidiDenik} akce={akceProfilu(profil)}
                  onZavrit={() => setProfil(null)} onZmena={() => { setProfil(null); reload(); }} />
              </ErrorBoundary>
            </Card>
          )}
          </div>
        )}
      {profil && !siroke && (
        <Modal open onClose={() => setProfil(null)} size="lg" title={profil.name}>
          <ErrorBoundary resetKey={profil.id} zalozka={t('Profil hosta')}>
            <ProfilHosta key={`${profil.id}-${verzeDeniku}`} vOkne host={profil} oznam={oznam} vidiDenik={vidiDenik} akce={akceProfilu(profil)}
              onZmena={() => { setProfil(null); reload(); }} />
          </ErrorBoundary>
        </Modal>
      )}
      {imp.okno}
      {duplicity && <Duplicity oznam={oznam} onZavrit={() => setDuplicity(false)} onSlouceno={() => { setProfil(null); reload(); }} />}

      <BulkBar count={pocetVyberu}
        totalLabel={d && pocetVyberu < d.total ? t('Vybrat vše ({n})', { n: d.total }) : undefined}
        onSelectAll={vybratVse}
        onExit={() => { sel.exit(); setVsechny(false); }}
        actions={akceVyberu}
        note={vsechny ? t('Vybráni jsou všichni, kdo splňují filtr, i ti, které ještě nevidíš.') : undefined} />

      {okno === 'skupina' && <HromadnaSkupina vyber={vyber} skupiny={rucniSkupiny} oznam={oznam} onZavrit={zavriOkno} onHotovo={hotovoHromadne} />}
      {okno === 'bonus' && <HromadnyBonus vyber={vyber} oznam={oznam} onZavrit={zavriOkno} onHotovo={hotovoHromadne} />}
      {okno === 'zprava' && <HromadnaZprava vyber={vyber} nazevPodniku={null} oznam={oznam} onZavrit={zavriOkno} onHotovo={hotovoHromadne} />}

      {upravuji && (
        <UpravaClenaOkno clen={upravuji} smiBody={upravujeBody} smiKredit={upravujeKredit} oznam={oznam}
          onHotovo={() => { reload(); setVerzeDeniku(v => v + 1); }} onZavrit={() => setUpravuji(null)} />
      )}
    </div>
  );
}

/** Štítky v řádku hosta: automatické (Štamgast, Nový, Chybí N dní), úroveň, narozeniny a dvě skupiny. */
function StitkyRadku({ c }: { c: ClenRadek }) {
  const t = useT('sprava');
  const ted = new Date();
  const auto = stitkyHosta(c, ted).map(a => ({ ...a, text: a.ton === 'ok' ? t('Štamgast') : a.ton === 'info' ? t('Nový') : a.ton === 'wait' ? t('Chybí {n} dní', { n: dnuOd(c.last_visit_at, ted) ?? 0 }) : a.text }));
  const sg = c.skupiny ?? [];
  const uroven = c.level ?? 'bronze';
  if (!auto.length && uroven === 'bronze' && !c.has_birthday_month && !sg.length && !c.blocked && !c.level_reduced && !(Number(c.discount) > 0)) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1 min-w-0">
      {c.blocked && <Chip tone="bad" size="sm">{t('Zablokovaný')}</Chip>}
      {auto.map(a => <Chip key={a.text} tone={a.ton} size="sm">{a.text}</Chip>)}
      {uroven !== 'bronze' && <Chip tone={uroven === 'silver' ? 'muted' : 'ink'} size="sm">{urovenPopisek(t, uroven)}</Chip>}
      {c.level_reduced && <Chip tone="wait" size="sm">{t('snížená po pauze')}</Chip>}
      {Number(c.discount) > 0 && <Chip tone="ok" size="sm">{`${t('Sleva {n} %', { n: c.discount ?? 0 })}${c.discount_source === 'skupina' && c.discount_name ? ` (${c.discount_name})` : ''}`}</Chip>}
      {c.has_birthday_month && <Chip tone="info" size="sm" icon="gift">{t('Narozeniny')}</Chip>}
      {sg.slice(0, 2).map(g => <Chip key={g.id} tone={tonBarvy(g.color)} size="sm">{g.name}</Chip>)}
      {sg.length > 2 && <Chip tone="muted" size="sm">{`+${sg.length - 2}`}</Chip>}
    </span>
  );
}
