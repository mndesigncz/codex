'use client';

// Odměny (vedení): žebříček, kalendář hodnocení a nastavení odměn.
//
// Kolo 69 (balík B7): stránka je plocha s widgety. Hlavička jde do PlochaWidgetu
// (přepínač Žebříček / Kalendář / Nastavení do `aside` — dřív seděl ve slotu pro
// limetkovou akci a na telefonu z něj byla lišta přes celou šířku), tahle komponenta
// kreslí nástroj. Fronta „Žádosti o odměny" nad žebříčkem je teď widget
// (odmeny.zadosti), stejně jako nová čísla Nehodnocené směny a Výtky v týmu.
// Data čte přes useDataWidgetu z týchž adres jako widgety — stránka se ptá jednou
// a po zápisu ve widgetu (schválená žádost odečte body) se obnoví i žebříček.
//
// Z auditu: žebříček byl karta na člověka se šedým hoverem, medailemi 🥇🥈🥉,
// ruční inkoustovou pilulkou úrovně a mřížkou šesti čísel (na telefonu ~650 px na
// člověka) — teď jeden seznam s pořadím číslem, rozpad bodů je v profilu. Katalog:
// ručně psaná limetka „Přidat", pole s vlastním vzhledem, ruční „Vypnout/Zapnout",
// confirm() při mazání — teď Field, Switch „Nabízet" a potvrzení v Modal. Nastavení:
// dvě podoby nadpisu karty, dvousloupcová pole i na telefonu, odebrání úrovně inline
// SVG bez popisku, ruční limetka „Uložit" a „Uloženo ✓" — teď t-card, jeden sloupec
// na telefonu, Button a Toast.
//
// Oprávnění: žebříček s odmeny.zebricek, kalendář s hodnoceni.zobrazit (hodnotit jen
// s hodnoceni.hodnotit), úrovně a bodování s odmeny.nastaveni, katalog s odmeny.katalog,
// profil člověka s tym.profil, Navíc (nabídka) s navic.zobrazit_tym (správa jen s navic.nabidka),
// Tresty (sazebník) s tresty.udelit nebo tresty.sazebnik (správa jen s tresty.sazebnik).
// Část, na kterou role nemá, se v přepínači nenabízí.

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../Icons';
import {
  Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Menu, Modal, Segmented, Select, Skeleton, Switch, Textarea, Toast,
} from '../ui';
import { MAX_NAZEV_ODMENY, validujOdmenu, type ChybaOdmeny } from '@/lib/odmenyKatalog';
import { DEFAULT_POINTS, normalizeLevels, normalizePoints, type RewardLevel, type PointsConfig } from '@/lib/rewardLevels';
import { MAX_HODNOT, MAX_PRISPEVEK, VYCHOZI_HODNOTY, VYCHOZI_PRISPEVEK, nastaveniDiku, type NastaveniDiku } from '@/lib/podekovani';
import { DRUHY_AUTO, MAX_BODU_AUTO, MIN_SMEN_TYDNE, nastaveniAuto, type DruhAuto, type NastaveniAuto } from '@/lib/automatickeBody';
import { KLIC_KALENDAR, UDALOST_KALENDAR, urlZebricku, vyberKatalog, vyberPoradi, type ObdobiZebricku, type Odmena, type Poradi } from '@/lib/odmenyPrehled';
import { apiMessage, okJson } from '@/lib/api';
import { doPointsConfig, nastaveniRezimu, stropSeZmenil, MAX_STROP, type DruhBodu, type NastaveniRezimu, type PravidloRezimu, type ZdrojStropu } from '@/lib/bodyRezim';
import { NastaveniStropu } from '../body-rezim/Strop';
import { VolbaRezimu } from '../body-rezim/VolbaRezimu';
import { HistoriePrepoctu, OknoNahledu, PrepocetZpetne, nactiNahled, provedPrepocet, type NahledPrepoctu, type RozsahPrepoctu } from '../body-rezim/Prepocet';
import { nazevDruhu } from '../body-rezim/veta';
import ShiftReviewModal from './ShiftReviewModal';
import { BodyVstup } from './BodyVstup';
import ShiftReviewCalendar from './ShiftReviewCalendar';
import EmployeeProfile from './EmployeeProfile';
import { ProGate } from '../Pro';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';
import { NaStranceOdmen, PochvalaOkno, URL_VYZVY, VyzvaRadek, textMetriky } from '../widgety/oblasti/odmeny';
import { SpravaNabidky } from '../navic-vedeni/SpravaNabidky';
import { useCastNavic } from '../navic-vedeni/cast';
import { SazebnikTrestu } from '../tresty-vedeni/SazebnikTrestu';
import { useCastTresty } from '../tresty-vedeni/cast';
import { METRIKY, MAX_NAZEV_VYZVY, MAX_ODMENA_BODY, MAX_ODMENA_TEXT, vyberVyzvy, vycistiVyzvu, type MetrikaVyzvy } from '@/lib/vyzvy';
import { dayPlus } from '@/lib/pragueTime';
import { pragueToday } from '@/lib/pragueTime';
import { useT } from '@/lib/i18n/client';
import { useJeTelefon } from '@/lib/useJeTelefon';
import { useLocale } from './jazyk';
import { useMoney, useSymbol } from '../CurrencyProvider';

const URL_ODMENY = '/api/rewards';
const URL_KATALOG = '/api/rewards/catalog';
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

type Cast = 'board' | 'calendar' | 'navic' | 'tresty' | 'settings';

export default function RewardsView({ user }: { user: { id?: string } }) {
  const t = useT('sprava');
  void user;
  // Odměny a úrovně jsou funkce Pro — brána ji nabídne, místo aby ji schovala.
  return (
    <ProGate feature={t('Odměny a hodnocení')} benefit={t('Body za směny, úrovně a žebříček motivace týmu — automaticky z hodnocení.')}>
      <RewardsViewInner />
    </ProGate>
  );
}

function RewardsViewInner() {
  const t = useT('sprava');
  const smi = useSmi();
  const vidiZebricek = smi('odmeny.zebricek');
  const vidiKalendar = smi('hodnoceni.zobrazit');
  const hodnoti = smi('hodnoceni.hodnotit');
  const nastavuje = smi('odmeny.nastaveni');
  const spravujeKatalog = smi('odmeny.katalog');
  // Kolo 9 (N1): část Navíc = nabídka „Co se dá udělat navíc" (fronta a historie jsou widget Navíc v týmu na ploše).
  // Kolo 11: nabídka je teď „Úkoly za body" (volitelné úkoly s opakováním) — stejná správa je i v Úkolech › Za body.
  const vidiNavic = smi('navic.zobrazit_tym');
  // Kolo 10: část Tresty = sazebník (nesouhlasy, návrhy a historie jsou widget Tresty v týmu na ploše).
  const vidiTresty = smi(['tresty.udelit', 'tresty.sazebnik']);
  const casti = [
    ...(vidiZebricek ? [{ id: 'board' as const, label: t('Žebříček') }] : []),
    ...(vidiKalendar ? [{ id: 'calendar' as const, label: t('Kalendář') }] : []),
    ...(vidiNavic ? [{ id: 'navic' as const, label: t('Navíc') }] : []),
    ...(vidiTresty ? [{ id: 'tresty' as const, label: t('Tresty') }] : []),
    ...(nastavuje || spravujeKatalog ? [{ id: 'settings' as const, label: t('Nastavení') }] : []),
  ];
  const [volba, setVolba] = useState<Cast>('board');
  // Oznámení, hledání a „Čeká na tebe" otevírají rovnou část Navíc (?view=rewards&arg=navic, událost, sessionStorage).
  useCastNavic(useCallback(() => setVolba('navic'), []));
  // Totéž pro Tresty (?view=rewards&arg=tresty — oznámení o nesouhlasu, fronta, hledání).
  useCastTresty(useCallback(() => setVolba('tresty'), []));
  const cast: Cast | null = casti.some(c => c.id === volba) ? volba : casti[0]?.id ?? null;
  // Telefon (audit 2026-10 V35): pět částí v pásu se na 390 px uřízlo. Nastavení (body, výzvy,
  // katalog) je v „···" hlavičky; otevřené se do segmentu přidá, ať je vidět, kde jsem.
  const telefon = useJeTelefon();
  const castiSegmentu = telefon ? casti.filter(c => c.id !== 'settings' || c.id === cast) : casti;
  const menuCastiTel = telefon ? casti.filter(c => c.id === 'settings' && c.id !== cast).map(c => ({ label: t('Nastavení odměn'), icon: 'settings', onClick: () => setVolba(c.id) })) : [];
  const [denKalendare, setDenKalendare] = useState<string | null>(null);
  const [hodnotim, setHodnotim] = useState<Poradi | null>(null);
  const [chvalim, setChvalim] = useState<Poradi | null>(null);
  const [profil, setProfil] = useState<number | null>(null);

  // Widget Nehodnocené směny otevírá kalendář na dni: na téhle stránce událostí,
  // odjinud přes sessionStorage po přechodu sem.
  useEffect(() => {
    const otevri = (den: string) => { setDenKalendare(den); setVolba('calendar'); };
    try {
      const den = sessionStorage.getItem(KLIC_KALENDAR);
      if (den) { sessionStorage.removeItem(KLIC_KALENDAR); otevri(den); }
    } catch { /* soukromé okno */ }
    const prijmi = (e: Event) => {
      const d = (e as CustomEvent<{ hodnota: string; prijato: boolean }>).detail;
      if (!d?.hodnota) return;
      d.prijato = true;
      otevri(d.hodnota);
    };
    window.addEventListener(UDALOST_KALENDAR, prijmi);
    return () => window.removeEventListener(UDALOST_KALENDAR, prijmi);
  }, []);

  const obnov = useCallback(() => obnovDataWidgetu(URL_ODMENY), []);

  const nastroj = cast === 'calendar' ? (
    <ShiftReviewCalendar den={denKalendare} smiHodnotit={hodnoti} onSaved={obnov} />
  ) : cast === 'board' ? (
    <Zebricek smiHodnotit={hodnoti} smiProfil={smi('tym.profil')} vidiHodnoceni={vidiKalendar}
      onHodnotit={setHodnotim} onPochvalit={setChvalim} onProfil={setProfil} />
  ) : cast === 'navic' ? (
    // Kolo 11: správa nabídky navíc = správa Úkolů za body (karta má odkaz „Otevřít v Úkolech ›" — tam je vedení hledá).
    <SpravaNabidky />
  ) : cast === 'tresty' ? (
    <SazebnikTrestu />
  ) : cast === 'settings' ? (
    <div className="space-y-4">
      {nastavuje && <NastaveniBodu onUlozeno={obnov} />}
      {nastavuje && <SpravaVyzev />}
      {spravujeKatalog && <SpravaKatalogu />}
    </div>
  ) : null;

  return (
    <>
      {/* Widgety na téhle ploše nekreslí odkaz „Odměny ›" — vedl by sem. */}
      <NaStranceOdmen.Provider value>
      <PlochaWidgetu
        stranka="vedeni.odmeny"
        hlavicka={{
          title: t('Odměny'),
          subtitle: t('Úrovně, body a hodnocení směn týmu.'),
          hintId: 'rewardsview',
          aside: casti.length > 1 && castiSegmentu.length > 1 && cast
            ? <Segmented ariaLabel={t('Část stránky')} value={cast} onChange={setVolba} options={castiSegmentu} />
            : undefined,
          menuTelefon: menuCastiTel.length ? menuCastiTel : undefined,
        }}
        nastroj={nastroj}
      />
      </NaStranceOdmen.Provider>
      {hodnotim && (
        <ShiftReviewModal
          employee={{ id: hodnotim.id, name: hodnotim.jmeno, avatar: hodnotim.avatar ?? undefined }}
          initialDate={hodnotim.nejstarsiKHodnoceni ?? undefined}
          onClose={() => setHodnotim(null)}
          onSaved={() => { setHodnotim(null); obnov(); }}
        />
      )}
      {chvalim && <PochvalaOkno clovek={{ id: chvalim.id, jmeno: chvalim.jmeno }} onClose={() => setChvalim(null)} />}
      {profil != null && <EmployeeProfile employeeId={profil} onClose={() => { setProfil(null); obnov(); }} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Žebříček
// ---------------------------------------------------------------------------

function Zebricek({ smiHodnotit, smiProfil, vidiHodnoceni, onHodnotit, onPochvalit, onProfil }: {
  smiHodnotit: boolean; smiProfil: boolean; vidiHodnoceni: boolean;
  onHodnotit: (s: Poradi) => void; onPochvalit: (s: Poradi) => void; onProfil: (id: number) => void;
}) {
  const t = useT('sprava');
  const loc = useLocale();
  // Období (kolo 5): celkový zůstatek, nebo body získané tento měsíc (bez odečtů za odměny).
  const [obdobi, setObdobi] = useState<ObdobiZebricku>('celkem');
  const data = useDataWidgetu(urlZebricku(obdobi, pragueToday()), vyberPoradi);
  const poradi = data.data ?? [];
  return (
    <Card aria-labelledby="zebricek-titulek">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="zebricek-titulek" className="t-card flex items-center gap-2">
          <Icon name="award" size={17} className="shrink-0 text-black/40" />
          {t('Žebříček')}
        </h2>
        <Segmented size="sm" ariaLabel={t('Období žebříčku')} value={obdobi} onChange={setObdobi}
          options={[{ id: 'celkem', label: t('Celkem') }, { id: 'mesic', label: t('Tento měsíc') }]} />
      </div>
      {obdobi === 'mesic' && <p className="t-meta mt-1">{t('Body získané od 1. dne měsíce, bez odečtů za vyměněné odměny.')}</p>}
      {data.error ? (
        <ErrorState compact title={t('Žebříček se nenačetl')} onRetry={data.reload} detail={data.error} className="mt-3" />
      ) : data.loading ? (
        <div className="mt-3 space-y-2" aria-busy>{[0, 1, 2].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : poradi.length === 0 ? (
        <EmptyState compact illustration="tym" title={t('Zatím tu nikdo není')}
          hint={t('Až přidáš zaměstnance v Nastavení týmu, uvidíš tady jejich body, úroveň a hodnocení směn.')} />
      ) : (
        <ul className="list mt-1">
          {poradi.map((s, i) => {
            const uroven = `${s.uroven}${s.dalsi ? ` · ${t('do {dalsi} zbývá {n}', { dalsi: s.dalsi, n: s.zbyva.toLocaleString(loc) })}` : ''}`;
            // Stavové chipy jdou pod úroveň, ne do ocasu řádku: tam by stály před body a různě
            // široké („2 výtky" + „1 k hodnocení") by body každého člověka posunuly jinam —
            // čísla musí ležet v jednom sloupci (DP §0 tah 8, §3.6).
            const stav = vidiHodnoceni && (s.vytek > 0 || s.kHodnoceni > 0) ? (
              <span className="mt-1.5 flex flex-wrap gap-1.5">
                {s.vytek > 0 && <Chip tone="bad" size="sm" icon="warning">{t('{n, plural, one {# výtka} few {# výtky} other {# výtek}}', { n: s.vytek })}</Chip>}
                {s.kHodnoceni > 0 && <Chip tone="wait" size="sm">{t('{n} k hodnocení', { n: s.kHodnoceni.toLocaleString(loc) })}</Chip>}
              </span>
            ) : null;
            const meta = stav ? <><span className="block truncate">{uroven}</span>{stav}</> : uroven;
            const lead = (
              <span className="flex items-center gap-2">
                {/* Pořadí začíná na L karty (P5) — dřív zarovnané doprava v boxu 24, číslice o 13 px dovnitř. */}
                <span className="t-label w-6 text-left tabular-nums">{i + 1}.</span>
                <Avatar emoji={s.avatar} size="sm" />
              </span>
            );
            // Řádek s akcí nesmí být sám tlačítkem (tlačítko v tlačítku) — profil je pak
            // tichá druhá akce; bez hodnocení se na profil klepne celým řádkem.
            if (!smiHodnotit && smiProfil) {
              return (
                <li key={s.id}>
                  <ListRow as="div" lead={lead} title={s.jmeno} meta={meta} value={s.body.toLocaleString(loc)} valueMeta={t('{n, plural, one {bod} few {body} other {bodů}}', { n: s.body })}
                    onClick={() => onProfil(s.id)} />
                </li>
              );
            }
            return (
              <ListRow key={s.id} lead={lead} title={s.jmeno} meta={meta} value={s.body.toLocaleString(loc)} valueMeta={t('{n, plural, one {bod} few {body} other {bodů}}', { n: s.body })}
                actions={smiHodnotit ? (
                  <>
                    {/* Akce řádku není limetka ani inkoust: tři lidé = tři „hlavní" akce (DP §3.1). */}
                    <Button variant="secondary" size="sm" onClick={() => onHodnotit(s)} aria-label={`Ohodnotit: ${s.jmeno}`}>{t('Ohodnotit')}</Button>
                    <Button variant="ghost" size="sm" iconOnly icon="award" aria-label={t('Pochválit: {jmeno}', { jmeno: s.jmeno })} title={t('Pochválit')} onClick={() => onPochvalit(s)} />
                    {smiProfil && (
                      <Button variant="ghost" size="sm" iconOnly icon="user" aria-label={`Profil: ${s.jmeno}`} onClick={() => onProfil(s.id)} />
                    )}
                  </>
                ) : undefined} />
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Nastavení: úrovně a bodování (odmeny.nastaveni)
// ---------------------------------------------------------------------------

function NastaveniBodu({ onUlozeno }: { onUlozeno: () => void }) {
  const t = useT('sprava');
  // `dik` (kolo 8): příspěvek a hodnoty poděkování — server je posílá vedle normalizovaného sazebníku.
  // `auto` = pravidla automatických bodů; server je posílá už vyčištěná, nastaveniAuto({ auto }) je jen přečte.
  const data = useDataWidgetu(URL_ODMENY, raw => ({ levels: normalizeLevels(raw?.levels), points: normalizePoints(raw?.points), dik: nastaveniDiku(raw?.dik), auto: nastaveniAuto({ auto: raw?.auto }), rezim: rezimZOdpovedi(raw?.rezim) }));
  if (data.error) return <Card><ErrorState compact title={t('Nastavení se nenačetlo')} onRetry={data.reload} detail={data.error} /></Card>;
  if (!data.data) return <Card aria-busy><Skeleton className="h-6 w-40" /><Skeleton className="mt-4 h-40" /></Card>;
  return <FormularBodu levels={data.data.levels} points={data.data.points} dik={data.data.dik} auto={data.data.auto} rezim={data.data.rezim} onUlozeno={onUlozeno} />;
}

/** Způsob počítání a strop z GET /api/rewards (server posílá tvar NastaveniRezimu). */
function rezimZOdpovedi(r: any): NastaveniRezimu {
  if (!r || typeof r !== 'object') return nastaveniRezimu(null);
  return nastaveniRezimu({ rezim: { postupy: r.postupy, ukoly: r.ukoly, uzaverky: r.uzaverky }, denniStropZap: r.stropZap === true, denniStrop: r.denniStrop, stropZdroje: r.stropZdroje, denniStropOd: r.stropOd ?? null });
}

const DRUHY: DruhBodu[] = ['postupy', 'ukoly', 'uzaverky'];

function FormularBodu({ levels: vychoziUrovne, points: vychoziBody, dik: vychoziDik, auto: vychoziAuto, rezim: vychoziRezim, onUlozeno }: {
  levels: RewardLevel[]; points: PointsConfig | null; dik?: NastaveniDiku; auto?: NastaveniAuto; rezim?: NastaveniRezimu; onUlozeno: () => void;
}) {
  const t = useT('sprava');
  // Kolo 91: způsob počítání bodů podle druhu, denní strop (výchozí vypnutý, plně volitelný) a „Přepočítat zpětně“.
  const [rezim, setRezim] = useState<NastaveniRezimu>(vychoziRezim ?? nastaveniRezimu(null));
  const [puvodniStrop, setPuvodniStrop] = useState<NastaveniRezimu>(vychoziRezim ?? nastaveniRezimu(null));
  const [stropZap, setStropZap] = useState<boolean>((vychoziRezim ?? nastaveniRezimu(null)).stropZap);
  const [stropText, setStropText] = useState<string>(String((vychoziRezim ?? nastaveniRezimu(null)).denniStrop));
  const [zdroje, setZdroje] = useState<ZdrojStropu[]>((vychoziRezim ?? nastaveniRezimu(null)).stropZdroje);
  const [zpetne, setZpetne] = useState(false);
  const [starsi, setStarsi] = useState(false);
  const [nahled, setNahled] = useState<{ open: boolean; data: NahledPrepoctu | null; chyba: string | null }>({ open: false, data: null, chyba: null });
  const [obnovHistorii, setObnovHistorii] = useState(0);
  const [urovne, setUrovne] = useState<RewardLevel[]>(vychoziUrovne);
  const [body, setBody] = useState<PointsConfig>(vychoziBody ?? DEFAULT_POINTS);
  // Poděkování mezi kolegy (kolo 8): měsíční příspěvek (0 = vypnuto) a hodnoty podniku (#ochota, #tým…).
  const [prispevek, setPrispevek] = useState<string>(String(vychoziDik?.prispevek ?? VYCHOZI_PRISPEVEK));
  const [hodnoty, setHodnoty] = useState<string>((vychoziDik?.hodnoty ?? VYCHOZI_HODNOTY).join(', '));
  // Automatické body (kolo 8): přepínač a body za týden bez pozdního příchodu, výročí nástupu, narozeniny.
  const [auto, setAuto] = useState<NastaveniAuto>(vychoziAuto ?? nastaveniAuto(null));
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const zmenUroven = (i: number, patch: Partial<RewardLevel>) => setUrovne(ls => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const pridatUroven = () => setUrovne(ls => [...ls, { name: 'Nová úroveň' /* i18n-ok (obsah podniku, ukládá se na server) */, minPoints: (ls[ls.length - 1]?.minPoints ?? 0) + 300, perks: '' }]);
  const odebratUroven = (i: number) => setUrovne(ls => ls.filter((_, idx) => idx !== i));

  const strop = Math.max(0, Math.min(MAX_STROP, Number.parseInt(stropText, 10) || 0));
  const stropTed = { stropZap, denniStrop: strop, stropZdroje: zdroje };
  const stropZmenen = stropSeZmenil(puvodniStrop, stropTed);
  // Přepočet (náhled i provedení): se „zpětně“ všechny druhy a strop odjakživa, jinak jen nový strop od dne uložení.
  const rozsahPrepoctu: RozsahPrepoctu = { typ: 'podnik', druhy: zpetne ? DRUHY : [], zpetneStrop: zpetne };
  const pravidlaPrepoctu = { rezim: { postupy: rezim.postupy, ukoly: rezim.ukoly, uzaverky: rezim.uzaverky }, ...stropTed, starsiHodnoceni: zpetne && starsi };

  const ulozitNastaveni = async (stropOd: string | null) => {
    // Způsob počítání a strop (kolo 91) jedou v points_config vedle sazebníku — PATCH přepisuje
    // celý JSON, bez nich by se ztratily.
    await odeslatNastaveni({ ...body, ...doPointsConfig({ ...rezim, ...stropTed, stropOd }) });
  };
  // Výsledek čte volající (ulozitNastaveni → ulozit / potvrditPrepocet, obojí v try s hláškou).
  const odeslatNastaveni = (body: PointsConfig & Record<string, unknown>) =>
    fetch('/api/teams', {
      method: 'PATCH', headers: JSON_HLAVICKA,
      body: JSON.stringify({
        levelsConfig: urovne.map(l => ({ name: l.name.trim() || 'Úroveň' /* i18n-ok (obsah podniku) */, minPoints: Math.max(0, Math.round(l.minPoints) || 0), perks: l.perks.trim() })),
        // Příspěvek a hodnoty jedou v points_config vedle sazebníku pod klíči, které čte nastaveniDiku.
        pointsConfig: { ...body, mesicniPrispevek: nastaveniDiku({ mesicniPrispevek: prispevek, hodnoty }).prispevek, hodnoty: nastaveniDiku({ mesicniPrispevek: prispevek, hodnoty }).hodnoty, auto },
      }),
    }).then(okJson);

  const ulozit = async () => {
    setChyba(null);
    // Zpětný přepočet nebo nový strop mění body i za minulé dny — nejdřív ukázat dopad.
    if (zpetne || stropZmenen) {
      setNahled({ open: true, data: null, chyba: null });
      try {
        setNahled({ open: true, data: await nactiNahled(rozsahPrepoctu, pravidlaPrepoctu), chyba: null });
      } catch (e) {
        setNahled({ open: true, data: null, chyba: apiMessage(e, t('Dopad se nepodařilo spočítat.')) });
      }
      return;
    }
    setUkladam(true);
    try {
      await ulozitNastaveni(rezim.stropOd);
      setToast(t('Nastavení odměn uloženo.'));
      obnovDataWidgetu('/api/rewards/awards?zed=1&limit=30');
      onUlozeno();
    } catch (e) {
      setChyba(apiMessage(e, t('Nastavení se nepodařilo uložit.')));
    } finally {
      setUkladam(false);
    }
  };

  const potvrditPrepocet = async () => {
    setUkladam(true);
    try {
      // Přepočet první: uloží si předchozí pravidlo (kvůli vrácení) a teprve pak se uloží zbytek formuláře.
      await provedPrepocet(rozsahPrepoctu, pravidlaPrepoctu);
      // Stejně jako server (lib/bodyPrepocetDb): zpětně = odjakživa, nový strop ode dneška, jinak beze změny.
      const stropOd = zpetne ? null : stropZmenen ? pragueToday() : rezim.stropOd;
      await ulozitNastaveni(stropOd);
      setRezim(r => ({ ...r, ...stropTed, stropOd }));
      setPuvodniStrop(p => ({ ...p, ...stropTed, stropOd }));
      setZpetne(false); setStarsi(false);
      setNahled({ open: false, data: null, chyba: null });
      setObnovHistorii(n => n + 1);
      setToast(t('Body jsou přepočítané a nastavení uložené.'));
      obnovDataWidgetu('/api/rewards/awards?zed=1&limit=30');
      onUlozeno();
    } catch (e) {
      setNahled(n => ({ ...n, chyba: apiMessage(e, t('Přepočet se nepodařilo uložit.')) }));
    } finally {
      setUkladam(false);
    }
  };

  const zmenRezim = (d: DruhBodu, p: PravidloRezimu) => setRezim(r => ({ ...r, [d]: p }));

  // Odměny zůstávají nezáporné, srážky musí přijmout i minus.
  const pole = (label: string, klic: keyof PointsConfig, hint: string, zaporne = false) => {
    const id = `body-${klic}`;
    return (
      <Field id={id} label={label} hint={hint}>
        {zaporne ? (
          // Srážky: type=number + parseInt přepsalo rozepsané „-" na 0 a iPhone minus nemá — BodyVstup (krokovač, ±).
          <BodyVstup id={id} value={body[klic]} min={zaporne ? -100 : 0} max={100}
            onChange={n => setBody(p => ({ ...p, [klic]: n }))} />
        ) : (
          <Input id={id} type="number" inputMode="numeric" min={0} max={100} value={body[klic]}
            onChange={e => {
              const n = Number.parseInt(e.target.value, 10);
              setBody(p => ({ ...p, [klic]: Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0)) }));
            }}
            className="tabular-nums" />
        )}
      </Field>
    );
  };

  return (
    <>
      <Card aria-labelledby="body-cinnost">
        <h2 id="body-cinnost" className="t-card">{t('Body za činnost')}</h2>
        <p className="t-meta mt-1">{t('Kolik bodů zaměstnanec získá za každou akci.')}</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pole(t('Za úkol'), 'task', t('Za každý splněný úkol'))}
          {pole(t('Za postup'), 'procedure', t('Za každý dokončený postup'))}
          {pole(t('Za uzávěrku'), 'closing', t('Za vyplněnou uzávěrku'))}
          {pole(t('Za hvězdu'), 'ratingStar', t('Návrh bodů = hvězdy × tohle'))}
        </div>
      </Card>

      <Card aria-labelledby="body-automaticke">
        <h2 id="body-automaticke" className="t-card">{t('Automatické body za směnu')}</h2>
        <p className="t-meta mt-1 text-pretty">{t('Systém je spočítá sám z toho, co se za směnu udělalo (a co ne). Záporné číslo body strhne.')}</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {pole(t('Nesplněný úkol'), 'taskMissed', t('Za úkol, který měl ten den termín a zůstal nesplněný'), true)}
          {pole(t('Přeskočený krok'), 'procedureSkipped', t('Za krok postupu, který zaměstnanec vědomě přeskočil'), true)}
          {pole(t('Neudělaný krok'), 'procedureMissed', t('Za krok, kterého se vůbec nedotkl'), true)}
          {pole(t('Chybí uzávěrka'), 'closingMissing', t('Když měl směnu, ale uzávěrku nevyplnil'), true)}
          {pole(t('Kasa sedí'), 'closingBalanced', t('Bonus, když rozdíl v kase vyjde přesně na nulu'))}
        </div>
      </Card>

      {/* Kolo 91: způsob počítání bodů u věcí s kroky, denní strop a přepočet zpětně. */}
      <Card aria-labelledby="body-zpusob" data-nastaveni-rezimu>
        <h2 id="body-zpusob" className="t-card">{t('Způsob počítání bodů')}</h2>
        <p className="t-meta mt-1 text-pretty">{t('Za každý krok: každý splněný krok body přidá. Za celek: body jen za celou věc, nesplněné kroky body strhnou. Kombinace: dnešní pravidlo. U postupu a úkolu jde způsob změnit zvlášť v jeho okně.')}</p>
        <div className="mt-2 divide-y divide-black/[0.06]">
          {DRUHY.map(d => (
            <VolbaRezimu key={d} druh={d} nazev={nazevDruhu(t, d)} pravidlo={rezim[d]}
              zaklad={d === 'postupy' ? body.procedure : d === 'ukoly' ? body.task : body.closing}
              onZmena={p => zmenRezim(d, p)} />
          ))}
        </div>
        <div className="mt-3 border-t border-black/[0.06] pt-4 space-y-3">
          <NastaveniStropu zap={stropZap} onZap={setStropZap} hodnota={stropText} onHodnota={setStropText}
            zdroje={zdroje} onZdroje={setZdroje} stropOd={rezim.stropOd} zmenen={stropZmenen} />
          <PrepocetZpetne checked={zpetne} onChange={setZpetne}
            hint={t('Automatické body postupů, úkolů a uzávěrek se nastaví podle způsobu výš a strop (když je zapnutý) začne platit i pro minulé dny — jako by to tak bylo odjakživa. Ruční úpravy vedení zůstanou. Před uložením uvidíš dopad.')} />
          {zpetne && (
            <PrepocetZpetne checked={starsi} onChange={setStarsi} nazev={t('I starší ruční hodnocení směn považovat za nahrazující')}
              hint={t('Hodnocení směn uložená před touhle verzí se k automatickým bodům přičítala. Zaškrtnuté = i ona nahradí automatické body svého dne (jde vrátit).')} />
          )}
        </div>
      </Card>
      <HistoriePrepoctu obnov={obnovHistorii} onVraceno={onUlozeno} />
      <OknoNahledu open={nahled.open} nahled={nahled.data} chyba={nahled.chyba} ukladam={ukladam}
        onPotvrdit={potvrditPrepocet} onZrusit={() => setNahled({ open: false, data: null, chyba: null })} />

      {/* Automatické body (kolo 8, vzor Kudos / Bonusly „automated awards"): připisuje denní cron, každé pravidlo s přepínačem. */}
      <Card aria-labelledby="auto-titulek" data-nastaveni-auto>
        <h2 id="auto-titulek" className="t-card">{t('Automaticky')}</h2>
        <p className="t-meta mt-1 text-pretty">{t('Body, které aplikace připíše sama: ráno po skončení týdne za dochvilnost, v den výročí nástupu a narozenin. Narozeniny se berou z profilu člověka.')}</p>
        <ul className="list mt-2">
          {DRUHY_AUTO.map((d: DruhAuto) => {
            const popis = d === 'dochvilnost' ? t('Týden bez pozdního příchodu') : d === 'vyroci' ? t('Výročí nástupu') : t('Narozeniny');
            const hint = d === 'dochvilnost' ? t('Aspoň {n} plánované směny v týdnu a žádný příchod nad 10 minut po začátku.', { n: MIN_SMEN_TYDNE })
              : d === 'vyroci' ? t('Každý rok v den, kdy člověk do podniku nastoupil.') : t('Jednou za rok v den narozenin.');
            // Přepínač a body vedle sebe; na telefonu se dvojice zalomí pod název (flex-wrap), ne do půlky řádku.
            return (
              <li key={d} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3" data-auto-pravidlo={d}>
                <span className="min-w-0 flex-1 basis-56">
                  <span id={`auto-${d}-n`} className="block text-sm font-semibold text-[#16181A]">{popis}</span>
                  <span className="block text-xs text-black/45 mt-0.5 text-pretty">{hint}</span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <Input id={`auto-${d}`} type="number" inputMode="numeric" min={0} max={MAX_BODU_AUTO} value={auto[d].body} aria-label={t('Body: {co}', { co: popis })} disabled={!auto[d].zap}
                      onChange={e => setAuto(a => ({ ...a, [d]: { ...a[d], body: Math.max(0, Math.min(MAX_BODU_AUTO, Number.parseInt(e.target.value, 10) || 0)) } }))} className="!w-20 tabular-nums" />
                    <span className="t-meta">b</span>
                  </span>
                  <Switch checked={auto[d].zap} onChange={v => setAuto(a => ({ ...a, [d]: { ...a[d], zap: v } }))} labelledBy={`auto-${d}-n`} />
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Poděkování mezi kolegy (kolo 8, vzor Bonusly): každý má měsíční příspěvek, nevyužitý propadne 1. dne. */}
      <Card aria-labelledby="dik-titulek" data-nastaveni-diku>
        <h2 id="dik-titulek" className="t-card">{t('Poděkování mezi kolegy')}</h2>
        <p className="t-meta mt-1 text-pretty">{t('Každý může kolegovi poslat 5, 10 nebo 20 bodů z měsíčního příspěvku, s hodnotou podniku a větou. Nevyužité body 1. dne propadnou. Nula poděkování vypne.')}</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="dik-prispevek" label={t('Měsíční příspěvek na poděkování (b)')} hint={t('Kolik bodů smí každý za měsíc rozdat kolegům.')}>
            <Input id="dik-prispevek" type="number" inputMode="numeric" min={0} max={MAX_PRISPEVEK} value={prispevek}
              onChange={e => setPrispevek(e.target.value.replace(/\D/g, ''))} className="tabular-nums" />
          </Field>
          <Field id="dik-hodnoty" label={t('Hodnoty podniku')} hint={t('Oddělené čárkou, nejvýš {n}. V poděkování jako #ochota, #tým.', { n: MAX_HODNOT })}>
            <Input id="dik-hodnoty" value={hodnoty} onChange={e => setHodnoty(e.target.value)} placeholder={VYCHOZI_HODNOTY.join(', ')} />
          </Field>
        </div>
      </Card>

      <Card aria-labelledby="urovne-titulek">
        <div className="flex items-center justify-between gap-3">
          <h2 id="urovne-titulek" className="t-card">{t('Úrovně a výhody')}</h2>
          <Button variant="secondary" size="sm" icon="plus" onClick={pridatUroven}>{t('Přidat úroveň')}</Button>
        </div>
        <p className="t-meta mt-1">{t('Od kolika bodů úroveň platí a co za ni zaměstnanec dostane.')}</p>
        <ul className="list mt-2">
          {urovne.map((l, i) => (
            <li key={i} className="py-4 space-y-3">
              <div className="flex items-end gap-2">
                <span aria-hidden className="well grid h-11 w-11 shrink-0 place-items-center text-sm font-semibold tabular-nums text-black/55">{i + 1}</span>
                <Field id={`uroven-${i}-nazev`} label={t('Název úrovně')} className="flex-1">
                  <Input id={`uroven-${i}-nazev`} value={l.name} onChange={e => zmenUroven(i, { name: e.target.value })} maxLength={60} />
                </Field>
                <Button variant="ghost" iconOnly icon="minus" disabled={urovne.length <= 1}
                  aria-label={t('Odebrat úroveň {nazev}', { nazev: l.name || i + 1 })} onClick={() => odebratUroven(i)} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[10rem_minmax(0,1fr)] gap-3">
                <Field id={`uroven-${i}-od`} label={t('Od bodů')} hint={i === 0 ? t('Základní úroveň platí vždy od 0.') : undefined}>
                  <Input id={`uroven-${i}-od`} type="number" inputMode="numeric" min={0} value={l.minPoints} disabled={i === 0}
                    onChange={e => zmenUroven(i, { minPoints: Math.max(0, Number.parseInt(e.target.value, 10) || 0) })} className="tabular-nums" />
                </Field>
                <Field id={`uroven-${i}-vyhody`} label={t('Výhody')}>
                  <Textarea id={`uroven-${i}-vyhody`} rows={2} value={l.perks} onChange={e => zmenUroven(i, { perks: e.target.value })}
                    placeholder={t('Např. sleva 10 %, bonus k výplatě')} />
                </Field>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
      <div className="flex justify-end">
        {/* Jediná limetka části Nastavení (hlavička žádnou nemá, DP §3.1). */}
        <Button variant="accent" icon="check" onClick={ulozit} loading={ukladam} block>{t('Uložit nastavení')}</Button>
      </div>
      <Toast message={toast} onClose={() => setToast(null)} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Nastavení: týmové výzvy (odmeny.nastaveni) — kolo 8, R8-3
// ---------------------------------------------------------------------------
//
// „Tento týden 5 uzávěrek bez manka → pizza pro tým": název, měřítko z hotových čísel, cíl,
// od–do, odměna (text, body každému). Postup ukazuje widget Výzva týdne; tady seznam a Nová výzva.

function SpravaVyzev() {
  const t = useT('sprava');
  const data = useDataWidgetu(URL_VYZVY, vyberVyzvy);
  const dnes = pragueToday();
  const vyzvy = data.data ?? [];
  const [okno, setOkno] = useState(false);
  const [mazu, setMazu] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const smazat = async (id: number) => {
    setMazu(id); setChyba(null);
    try {
      await fetch(`${URL_VYZVY}?id=${id}`, { method: 'DELETE' }).then(okJson);
      obnovDataWidgetu(URL_VYZVY);
      setToast(t('Výzva je zrušená.'));
    } catch (e) {
      setChyba(apiMessage(e, t('Výzvu se nepodařilo zrušit.')));
    } finally { setMazu(null); }
  };
  return (
    <Card aria-labelledby="vyzvy-titulek" data-sprava-vyzev>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="vyzvy-titulek" className="t-card">{t('Týmové výzvy')}</h2>
        <Button variant="secondary" size="sm" icon="plus" onClick={() => setOkno(true)}>{t('Nová výzva')}</Button>
      </div>
      <p className="t-meta mt-1 text-pretty">{t('Společný cíl pro celý tým s ukazatelem postupu na Přehledu, Domů i tabletu. Po splnění přijde všem oznámení a body.')}</p>
      {data.error ? (
        <ErrorState compact title={t('Výzvy se nenačetly')} onRetry={data.reload} detail={data.error} className="mt-3" />
      ) : data.loading && !data.data ? (
        <Skeleton className="mt-3 h-16" />
      ) : vyzvy.length === 0 ? (
        <p className="t-meta mt-3 text-pretty">{t('Zatím žádná výzva. Zkus „5 uzávěrek bez manka do neděle → pizza pro tým“.')}</p>
      ) : (
        <ul className="list mt-2">
          {vyzvy.map(v => (
            <li key={v.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1"><VyzvaRadek v={v} dnes={dnes} /></div>
              <Button variant="ghost" size="sm" iconOnly icon="trash" loading={mazu === v.id} aria-label={t('Zrušit výzvu {nazev}', { nazev: v.nazev })} onClick={() => { void smazat(v.id); }} />
            </li>
          ))}
        </ul>
      )}
      {chyba && <p className="note note-danger text-sm mt-2" role="alert">{chyba}</p>}
      {okno && <NovaVyzvaOkno onClose={() => setOkno(false)} onHotovo={() => { setOkno(false); setToast(t('Výzva je vyhlášená — tým dostal oznámení.')); }} />}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Card>
  );
}

function NovaVyzvaOkno({ onClose, onHotovo }: { onClose: () => void; onHotovo: () => void }) {
  const t = useT('sprava');
  const tw = useT('widgety');
  const dnes = pragueToday();
  const [nazev, setNazev] = useState('');
  const [metrika, setMetrika] = useState<MetrikaVyzvy>('uzaverky_bez_manka');
  const [cil, setCil] = useState('5');
  const [od, setOd] = useState(dnes);
  const [doDne, setDoDne] = useState(dayPlus(dnes, 6));
  const [odmenaText, setOdmenaText] = useState('');
  const [odmenaBody, setOdmenaBody] = useState('');
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const uloz = async () => {
    const v = vycistiVyzvu({ nazev, metrika, cil, od, do: doDne, odmenaText, odmenaBody });
    if (!v.ok) { setChyba(v.chyba); return; }
    setUkladam(true); setChyba(null);
    try {
      await fetch(URL_VYZVY, { method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify(v.vyzva) }).then(okJson);
      obnovDataWidgetu(URL_VYZVY);
      onHotovo();
    } catch (e) {
      setChyba(apiMessage(e, t('Výzvu se nepodařilo uložit.')));
    } finally { setUkladam(false); }
  };
  return (
    <Modal open onClose={onClose} size="md" title={t('Nová výzva')} subtitle={t('Společný cíl, který tým uvidí na Přehledu, Domů i tabletu.')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
        <Button variant="primary" icon="check" loading={ukladam} onClick={() => { void uloz(); }}>{t('Vyhlásit výzvu')}</Button>
      </>}>
      <div className="space-y-3" data-nova-vyzva>
        <Field id="vyzva-nazev" label={t('Název')}>
          <Input id="vyzva-nazev" value={nazev} onChange={e => setNazev(e.target.value)} maxLength={MAX_NAZEV_VYZVY} placeholder={t('Týden bez manka')} autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field id="vyzva-metrika" label={t('Co se počítá')}>
            <Select id="vyzva-metrika" value={metrika} onChange={e => setMetrika(e.target.value as MetrikaVyzvy)}>
              {METRIKY.map(m => <option key={m} value={m}>{textMetriky(tw, m)}</option>)}
            </Select>
          </Field>
          <Field id="vyzva-cil" label={t('Cíl')} hint={metrika === 'hodnoceni_hostu' ? t('Průměr hvězd, nejvýš 5.') : metrika === 'trzba' ? t('Částka v měně podniku.') : undefined}>
            {/* Textové pole s decimal klávesnicí (check-decimal-inputs): „4,8" hvězdy i s čárkou; vycistiVyzvu čárku převede. */}
            <Input id="vyzva-cil" inputMode="decimal" value={cil} onChange={e => setCil(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))} className="tabular-nums" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field id="vyzva-od" label={t('Od')}>
            <Input id="vyzva-od" type="date" value={od} onChange={e => { setOd(e.target.value); if (doDne < e.target.value) setDoDne(e.target.value); }} className="appearance-none min-w-0" />
          </Field>
          <Field id="vyzva-do" label={t('Do')}>
            <Input id="vyzva-do" type="date" value={doDne} min={od} onChange={e => setDoDne(e.target.value)} className="appearance-none min-w-0" />
          </Field>
        </div>
        <Field id="vyzva-odmena" label={t('Odměna pro tým')} hint={t('Třeba pizza, volný pátek, společný večer.')}>
          <Input id="vyzva-odmena" value={odmenaText} onChange={e => setOdmenaText(e.target.value)} maxLength={MAX_ODMENA_TEXT} placeholder={t('Pizza pro tým')} />
        </Field>
        <Field id="vyzva-body" label={t('Body každému (nepovinné)')} hint={t('Připíšou se všem lidem podniku po splnění.')}>
          <Input id="vyzva-body" type="number" inputMode="numeric" min={0} max={MAX_ODMENA_BODY} value={odmenaBody} onChange={e => setOdmenaBody(e.target.value)} className="!w-full sm:!w-32 tabular-nums" />
        </Field>
        {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Nastavení: katalog odměn (odmeny.katalog)
// ---------------------------------------------------------------------------

function SpravaKatalogu() {
  const t = useT('sprava');
  const data = useDataWidgetu(URL_KATALOG, vyberKatalog);
  const odmeny = data.data?.odmeny ?? [];
  const money = useMoney();
  const symbol = useSymbol();
  const [nazev, setNazev] = useState('');
  const [cena, setCena] = useState('');
  const [ikona, setIkona] = useState('');
  // Bonus v měně podniku (volitelný): schválená výměna ho zapíše jako prémii k výplatě — „lepší odměny" než jen volno.
  const [bonus, setBonus] = useState('');
  const [pridavam, setPridavam] = useState(false);
  const [pracuji, setPracuji] = useState<number | null>(null);
  const [mazani, setMazani] = useState<Odmena | null>(null);
  const [uprava, setUprava] = useState<Odmena | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const cenaCislo = Math.round(Number(cena));
  const jde = nazev.trim().length > 0 && Number.isFinite(cenaCislo) && cenaCislo >= 1;

  const obnov = () => obnovDataWidgetu(URL_KATALOG);
  const pridat = async () => {
    if (!jde || pridavam) return;
    setPridavam(true);
    setChyba(null);
    try {
      await fetch(URL_KATALOG, { method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify({ manage: true, title: nazev.trim(), cost: cenaCislo, icon: ikona.trim() || null, bonusAmount: Math.round(Number(bonus)) > 0 ? Math.round(Number(bonus)) : null }) }).then(okJson);
      setNazev(''); setCena(''); setIkona(''); setBonus('');
      setToast(t('Odměna přidána do katalogu.'));
      obnov();
    } catch (e) {
      setChyba(apiMessage(e, t('Odměnu se nepodařilo přidat.')));
    } finally {
      setPridavam(false);
    }
  };
  const prepnout = async (o: Odmena, aktivni: boolean) => {
    if (pracuji != null) return;
    setPracuji(o.id);
    setChyba(null);
    data.set(prev => ({ odmeny: (prev?.odmeny ?? []).map(x => (x.id === o.id ? { ...x, aktivni } : x)), zadosti: prev?.zadosti ?? [] }));
    try {
      await fetch(URL_KATALOG, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ manage: true, id: o.id, active: aktivni }) }).then(okJson);
      obnov();
    } catch (e) {
      data.set(prev => ({ odmeny: (prev?.odmeny ?? []).map(x => (x.id === o.id ? { ...x, aktivni: !aktivni } : x)), zadosti: prev?.zadosti ?? [] }));
      setChyba(apiMessage(e, t('Změnu se nepodařilo uložit.')));
    } finally {
      setPracuji(null);
    }
  };
  const smazat = async () => {
    if (!mazani) return;
    const o = mazani;
    setPracuji(o.id);
    setChyba(null);
    try {
      await fetch(`${URL_KATALOG}?id=${o.id}`, { method: 'DELETE' }).then(okJson);
      setMazani(null);
      setToast(t('Odměna „{nazev}" smazána.', { nazev: o.nazev }));
      obnov();
    } catch (e) {
      setChyba(apiMessage(e, t('Odměnu se nepodařilo smazat.')));
      setMazani(null);
    } finally {
      setPracuji(null);
    }
  };

  return (
    <Card aria-labelledby="katalog-titulek">
      <h2 id="katalog-titulek" className="t-card flex items-center gap-2">
        <Icon name="gift" size={17} className="shrink-0 text-black/40" />
        
        {t('Katalog odměn')}
      </h2>
      <p className="t-meta mt-1 text-pretty">{t('Za co si tým může vyměnit body. Schválená výměna body odečte automaticky.')}</p>
      {/* Na telefonu dva sloupce: Název přes celou šířku, pod ním Emoji | Cena, pak Bonus
          a Přidat přes celou šířku (pořadí přes max-sm:order-*). Dřív pět polí ve dvou
          sloupcích [4.5rem, 1fr] posadilo Cenu do 72px sloupce. Od sm beze změny. */}
      <form className="mt-4 grid grid-cols-2 sm:grid-cols-[4.5rem_minmax(0,1fr)_7rem_8rem_auto] items-end gap-3"
        onSubmit={e => { e.preventDefault(); void pridat(); }}>
        <Field id="nova-odmena-ikona" label={t('Emoji')} className="max-sm:order-2">
          <Input id="nova-odmena-ikona" value={ikona} onChange={e => setIkona(e.target.value)} maxLength={4} className="text-center" />
        </Field>
        <Field id="nova-odmena-nazev" label={t('Název odměny')} className="col-span-2 sm:col-span-1 max-sm:order-1">
          <Input id="nova-odmena-nazev" value={nazev} onChange={e => setNazev(e.target.value)} maxLength={MAX_NAZEV_ODMENY} placeholder={t('Např. Směna končí o hodinu dřív')} />
        </Field>
        <Field id="nova-odmena-cena" label={t('Cena v bodech')} className="max-sm:order-3">
          <Input id="nova-odmena-cena" type="number" inputMode="numeric" min={1} value={cena} onChange={e => setCena(e.target.value)} className="tabular-nums" />
        </Field>
        <Field id="nova-odmena-bonus" label={t('Bonus k výplatě')} hint={t('Volitelné; schválení ho zapíše jako prémii.')} className="col-span-2 sm:col-span-1 max-sm:order-4">
          <div className="relative">
            <Input id="nova-odmena-bonus" type="number" inputMode="numeric" min={0} value={bonus} onChange={e => setBonus(e.target.value)} className="tabular-nums pr-9" />
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">{symbol}</span>
          </div>
        </Field>
        <Button type="submit" variant="primary" icon="plus" loading={pridavam} disabled={!jde} className="col-span-2 w-full sm:col-span-1 sm:w-auto max-sm:order-5">{t('Přidat')}</Button>
      </form>
      {chyba && <p className="note note-danger mt-3" role="alert">{chyba}</p>}
      {data.error ? (
        <ErrorState compact title={t('Katalog se nenačetl')} onRetry={data.reload} detail={data.error} className="mt-3" />
      ) : data.loading ? (
        <div className="mt-4 space-y-2" aria-busy>{[0, 1].map(i => <Skeleton key={i} className="h-12" />)}</div>
      ) : odmeny.length === 0 ? (
        <EmptyState compact icon="gift" title={t('Zatím žádné odměny')} hint={t('Přidej první, ať mají body smysl.')} className="mt-2" />
      ) : (
        <ul className="list mt-3">
          {odmeny.map(o => (
            <ListRow key={o.id}
              lead={<span aria-hidden className="well grid h-9 w-9 shrink-0 place-items-center text-lg leading-none text-black/55">{o.ikona ?? <Icon name="gift" size={16} />}</span>}
              title={o.nazev}
              meta={[
                t('{n, plural, one {# bod} few {# body} other {# bodů}}', { n: o.cena }),
                o.bonusKc ? t('+{castka} k výplatě', { castka: money(o.bonusKc) }) : null,
                o.zOrganizace && o.spravuje ? t('spravuje {kdo}', { kdo: o.spravuje }) : !o.aktivni ? t('nenabízí se') : null,
              ].filter(Boolean).join(' · ')}
              right={o.zOrganizace ? <Chip tone="muted" size="sm">{t('Z organizace')}</Chip> : o.sdileno ? <Chip tone="info" size="sm">{t('Sdíleno')}</Chip> : undefined}
              // Odměnu ze zdrojového podniku organizace (kolo 60) upraví jen jeho vedení —
              // přepínač i menu by tu vracely 404, tak se neukazují. Kolo 7: místo koše
              // menu „Upravit… / Smazat…" (dřív šlo jen vypnout nebo smazat a založit znovu).
              actions={o.zOrganizace ? undefined : (
                <>
                  {/* !flex-none: na telefonu `.list-actions:only-child > :first-child` natáhne první
                      prvek ocasu přes řádek — přepínač by byl limetkový pruh s knoflíkem vlevo. */}
                  <Switch checked={o.aktivni} disabled={pracuji === o.id} label={t('Nabízet: {nazev}', { nazev: o.nazev })} onChange={v => { void prepnout(o, v); }} className="!flex-none" />
                  <Menu size="sm" label={t('Upravit nebo smazat odměnu {nazev}', { nazev: o.nazev })} items={[
                    { label: t('Upravit…'), icon: 'pencil', onClick: () => setUprava(o), disabled: pracuji != null },
                    { label: t('Smazat…'), icon: 'trash', danger: true, onClick: () => setMazani(o), disabled: pracuji != null },
                  ]} />
                </>
              )} />
          ))}
        </ul>
      )}
      {mazani && (
        <Modal open onClose={() => setMazani(null)} size="sm" title={t('Smazat odměnu „{nazev}"?', { nazev: mazani.nazev })}
          footer={<>
            <Button variant="secondary" onClick={() => setMazani(null)}>{t('Zrušit')}</Button>
            <Button variant="danger-solid" onClick={smazat} loading={pracuji === mazani.id}>{t('Smazat')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{t('Z katalogu zmizí. Žádosti, které už o ni někdo poslal, zůstanou v historii. Chceš ji jen dočasně skrýt? Vypni „Nabízet".')}</p>
        </Modal>
      )}
      {uprava && (
        <UpravaOdmeny odmena={uprava} onClose={() => setUprava(null)}
          onUlozeno={() => { setUprava(null); setToast(t('Odměna upravena.')); obnov(); }} />
      )}
      <Toast message={toast} onClose={() => setToast(null)} />
    </Card>
  );
}

/** Okno úpravy odměny: emoji, název, cena v bodech a bonus k výplatě (PATCH manage). */
function UpravaOdmeny({ odmena, onClose, onUlozeno }: { odmena: Odmena; onClose: () => void; onUlozeno: () => void }) {
  const t = useT('sprava');
  const symbol = useSymbol();
  const [ikona, setIkona] = useState(odmena.ikona ?? '');
  const [nazev, setNazev] = useState(odmena.nazev);
  const [cena, setCena] = useState(String(odmena.cena));
  const [bonus, setBonus] = useState(odmena.bonusKc ? String(odmena.bonusKc) : '');
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const bonusCislo = bonus.trim() === '' ? 0 : Number(bonus.trim().replace(/\s/g, '').replace(',', '.'));
  const bonusOk = Number.isFinite(bonusCislo) && bonusCislo >= 0;
  const v = validujOdmenu({ title: nazev, cost: cena, icon: ikona }, true);
  const hlaska = (c: ChybaOdmeny) => c === 'nazev-chybi' ? t('Název je povinný.')
    : c === 'nazev-dlouhy' ? t('Název může mít nejvýš 80 znaků.')
    : c === 'cena' ? t('Cena musí být celé číslo od 1 do 100 000 bodů.')
    : t('Ikona musí být jedno nebo dvě emoji.');
  const chybaPole = (pole: ChybaOdmeny[]) => (!v.ok && pole.includes(v.chyba) ? hlaska(v.chyba) : undefined);

  const ulozit = async () => {
    if (!v.ok || !bonusOk || ukladam) return;
    setUkladam(true);
    setChyba(null);
    try {
      await fetch(URL_KATALOG, {
        method: 'PATCH', headers: JSON_HLAVICKA,
        body: JSON.stringify({ manage: true, id: odmena.id, title: v.hodnoty.title, cost: v.hodnoty.cost, icon: v.hodnoty.icon ?? null, bonusAmount: Math.round(bonusCislo) > 0 ? Math.round(bonusCislo) : null }),
      }).then(okJson);
      onUlozeno();
    } catch (e) {
      setChyba(apiMessage(e, t('Změnu se nepodařilo uložit.')));
    } finally {
      setUkladam(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="sm" title={t('Upravit odměnu')}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
        <Button type="submit" form="uprava-odmeny" variant="primary" loading={ukladam} disabled={!v.ok || !bonusOk}>{t('Uložit')}</Button>
      </>}>
      <form id="uprava-odmeny" className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3" onSubmit={e => { e.preventDefault(); void ulozit(); }}>
        <Field id="uprava-odmeny-ikona" label={t('Emoji')}>
          <Input id="uprava-odmeny-ikona" value={ikona} onChange={e => setIkona(e.target.value)} maxLength={16} className="text-center" aria-invalid={!!chybaPole(['ikona'])} />
        </Field>
        <Field id="uprava-odmeny-nazev" label={t('Název odměny')} error={chybaPole(['nazev-chybi', 'nazev-dlouhy'])}>
          <Input id="uprava-odmeny-nazev" value={nazev} onChange={e => setNazev(e.target.value)} maxLength={MAX_NAZEV_ODMENY} />
        </Field>
        {chybaPole(['ikona']) && <p role="alert" className="col-span-2 -mt-1 text-xs text-[var(--bad-ink)]">{chybaPole(['ikona'])}</p>}
        <Field id="uprava-odmeny-cena" label={t('Cena v bodech')} error={chybaPole(['cena'])} className="col-span-2">
          <Input id="uprava-odmeny-cena" inputMode="numeric" autoComplete="off" value={cena} onChange={e => setCena(e.target.value)} className="tabular-nums" />
        </Field>
        <Field id="uprava-odmeny-bonus" label={t('Bonus k výplatě')} hint={t('Volitelné; schválení ho zapíše jako prémii.')}
          error={bonusOk ? undefined : t('Zadej částku, nebo pole nech prázdné.')} className="col-span-2">
          <div className="relative">
            <Input id="uprava-odmeny-bonus" inputMode="decimal" autoComplete="off" value={bonus} onChange={e => setBonus(e.target.value)} className="tabular-nums pr-9" />
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">{symbol}</span>
          </div>
        </Field>
      </form>
      {chyba && <p className="note note-danger mt-3" role="alert">{chyba}</p>}
    </Modal>
  );
}
