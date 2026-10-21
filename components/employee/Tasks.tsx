'use client';

// Úkoly (zaměstnanec): co je dnes na mně a co je pro kohokoli.
//
// Kolo 69 (balík B6a): stránka je plocha s widgety. Hlavička jde do PlochaWidgetu
// (přepínač Seznam/Týden do `aside` — dřív seděl ve slotu pro limetkovou akci
// a na telefonu se roztáhl přes celou šířku), tahle komponenta kreslí nástroj.
// Data čte přes useDataWidgetu z téže adresy jako widgety (Po termínu, Úkoly na
// týden), takže stránka se ptá jednou.
//
// Z auditu: každý úkol byl vlastní karta a vedení mělo tentýž seznam v jedné kartě
// s linkami — teď je skupina jedna karta s `.list` jako u vedení. Stav byl nativní
// <select> převlečený za barevný štítek (s ručními hex barvami): stav nese Chip a mění
// se přes Menu. „Tohle není dnešní úkol" už není confirm(), ale okno; prázdno „Vše
// hotovo. 🎉" je EmptyState bez emoji; štítky (výroba, pro kohokoli, opakování) jsou
// Chip a odkaz na návod ghost tlačítko.

import { useState, useMemo, useEffect, useRef } from 'react';
import { TaskChecklist, recurrenceLabel, type ChecklistItem } from '../TaskChecklist';
import { useCurrency } from '../CurrencyProvider';
import TaskWeekBoard from '../TaskWeekBoard';
import { pragueToday } from '@/lib/pragueTime';
import { useJeTelefon } from '@/lib/useJeTelefon';
import { Button, Card, Chip, EmptyState, ErrorState, Menu, Modal, Segmented, Skeleton, Toast } from '../ui';
import { Icon } from '../Icons';
import { apiMessage, okJson } from '@/lib/api';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum, fmtHM } from '@/lib/i18n/format';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';
import { URL_UKOLY, Zaskrtnuti, useTedHM } from '../widgety/oblasti/ukoly';
import { vyberUkoly, vRozsahu, rozdelPoDnech, jeCiziUkol, splnenoDnes, chceFotku, type Ukol } from '@/lib/ukolyPrehled';
import { VYCHOZI_FILTR, filtrujBezStavu, filtrujUkoly, poctyStavu, seradUkoly, statistikaUkolu, rozborPredani, cerstvePredani, poCase, UDALOST_PREDANI_UKOLU, type FiltrUkolu } from '@/lib/ukolyFiltr';
import { UkolDetail } from '../ukoly/UkolDetail';
import { PrilozFoto } from '../ukoly/PrilozFoto';
import { UkolyFiltry } from '../ukoly/UkolyFiltry';
import { UkolySouhrn } from '../ukoly/UkolySouhrn';
import { UkolyMesic } from '../ukoly/UkolyMesic';
import { oznamZmenuPovinnych, ChipPredUzaverkou } from '../PredUzaverkou';
import { useUkolyZaBody } from '../navic/data';
import { ARG_ZA_BODY, pocetKVzeti, urlUkolyZaBody } from '../navic/logika';
import { UkolyZaBody } from '../navic/UkolyZaBody';
import { ZapsatNavic } from '../navic/ZapsatNavic';

/** Sbalená sekce „Za body navíc" (per zařízení — volba toho, kdo se dívá; arg za-body ji vždy rozbalí). */
const KLIC_ZA_BODY_SBALENO = 'managero-ukoly-za-body-sbaleno';

interface Props {
  user: { id?: string };
}

const STAVY: Record<string, { tone: 'muted' | 'info' | 'ok' }> = {
  pending: { tone: 'muted' },
  in_progress: { tone: 'info' },
  done: { tone: 'ok' },
};
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

export default function Tasks({ user }: Props) {
  const t = useT('zamestnanec');
  const { jazyk } = useJazyk();
  const denDlouze = (d: string) => fmtDatum(d, { jazyk, styl: 'denDlouze' });
  const denKratce = (d: string) => fmtDatum(d, { jazyk, styl: 'denKratce' });
  const ja = parseInt(user.id ?? '0') || null;
  const smi = useSmi();
  const naTelefonu = useJeTelefon();
  const data = useDataWidgetu<Ukol[]>(ja ? URL_UKOLY : null, vyberUkoly);
  // Server vrací moje a pro kohokoli; kdo má ukoly.zobrazit_tym, dostane celý tým —
  // tahle stránka je ale „moje úkoly", tak cizí nechává seznamu vedení.
  const tasks = useMemo(() => vRozsahu(data.data ?? [], 'moje_a_volne', ja), [data.data, ja]);
  const [view, setView] = useState<'list' | 'week' | 'month' | 'prehled'>('list');
  const [filtr, setFiltr] = useState<FiltrUkolu>(VYCHOZI_FILTR);
  const [detailId, setDetailId] = useState<number | null>(null);
  // Kolo 11 (balík Z): „Za body navíc" — volitelné úkoly za extra body nahoře nad seznamem. Tady je lidé hledají
  // (Martin: „vůbec netuším, kde to najít"); oznámení o novém úkolu vede sem (arg za-body: posune a zvýrazní).
  const smiNavic = smi('navic.zapsat');
  const zaBody = useUkolyZaBody(smiNavic ? urlUkolyZaBody() : null);
  const ukolyZaBody = zaBody.data ?? [];
  const kVzeti = pocetKVzeti(ukolyZaBody);
  const zaBodyNacteno = zaBody.data != null || !!zaBody.error;
  const [zaBodySbaleno, setZaBodySbaleno] = useState(false);
  // Volba sbalení až po připojení (ne v prvním vykreslení — server localStorage nezná a hydratace by nesouhlasila).
  useEffect(() => { try { if (localStorage.getItem(KLIC_ZA_BODY_SBALENO) === '1' && cerstvePredani() !== ARG_ZA_BODY) setZaBodySbaleno(true); } catch { /* soukromé okno */ } }, []);
  const prepniZaBody = () => setZaBodySbaleno(v => { try { localStorage.setItem(KLIC_ZA_BODY_SBALENO, v ? '0' : '1'); } catch { /* soukromé okno */ } return !v; });
  const [zvyraznitZaBody, setZvyraznitZaBody] = useState(0);
  const [zapsatNavic, setZapsatNavic] = useState(false);
  const sekceZaBody = useRef<HTMLElement>(null);
  // Předání z widgetu (Po termínu → rovnou záložka Po termínu): po přechodu z uloženého, na otevřené stránce z události.
  useEffect(() => {
    const pouzij = (arg: string | null) => {
      if (arg === ARG_ZA_BODY) { setView('list'); setZaBodySbaleno(false); setZvyraznitZaBody(n => n + 1); return; }
      const r = rozborPredani(arg);
      if (r.stav) { setFiltr(f => ({ ...f, stav: r.stav! })); setView('list'); }
      if (r.ukolId != null) { setView('list'); setFiltr(VYCHOZI_FILTR); setDetailId(r.ukolId); }
      if (r.pohled && r.pohled !== 'prehled') setView(r.pohled);
    };
    const a = cerstvePredani();
    if (a) pouzij(a);
    const naUdalost = (e: Event) => pouzij((e as CustomEvent<string>).detail);
    window.addEventListener(UDALOST_PREDANI_UKOLU, naUdalost);
    return () => window.removeEventListener(UDALOST_PREDANI_UKOLU, naUdalost);
  }, []);

  // Příchod s arg za-body: jakmile je sekce na obrazovce, posunout na ni a na chvíli ji zvýraznit (fokus na nadpis).
  useEffect(() => {
    if (!zvyraznitZaBody) return;
    const el = sekceZaBody.current;
    if (!el) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    el.querySelector<HTMLElement>('[data-za-body-nadpis]')?.focus({ preventScroll: true });
    const k = setTimeout(() => setZvyraznitZaBody(0), 2600);
    return () => clearTimeout(k);
  }, [zvyraznitZaBody, zaBodyNacteno, naTelefonu]);

  const [showLater, setShowLater] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [bodyToast, setBodyToast] = useState<string | null>(null);
  // Splněný úkol jde jedním klepnutím vrátit (omylem odškrtnuté je na telefonu časté); `idToastu` dá každému toastu novou dobu.
  const [zpetUkol, setZpetUkol] = useState<Ukol | null>(null);
  const [idToastu, setIdToastu] = useState(0);
  const [mimoDen, setMimoDen] = useState<Ukol | null>(null);
  // Kolo 7: úkol „jen s fotkou" — okno Přilož fotku (fotí se telefonem) před splněním.
  const [fotoUkol, setFotoUkol] = useState<Ukol | null>(null);
  const { weekStart } = useCurrency();

  const today = pragueToday();
  const weekAhead = pragueToday(7);
  const ted = useTedHM();
  const smiSplnit = (t: Ukol) => !jeCiziUkol(t, ja) || smi('ukoly.plnit');

  /** Zápis stavu; s fotkou (okno Přilož fotku) vrátí hlášku chyby místo pruhu nad seznamem. */
  const zmenStav = async (task: Ukol, newStatus: string, foto?: string): Promise<string | null> => {
    setSaveErr(null);
    const puvodni = task.status;
    data.set(prev => (prev ?? []).map(t => (t.id === task.id ? { ...t, status: newStatus, ...(foto ? { completionPhoto: foto } : {}) } : t)));
    try {
      const d = await fetch(URL_UKOLY, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ id: task.id, status: newStatus, ...(foto ? { completionPhotoUrl: foto } : {}) }) }).then(okJson);
      // Body se přičítaly potichu. Když je člověk uvidí hned, ví, že
      // odškrtnutí něco znamená — a „vyrob limonádu" přestane být otrava.
      const pts = Number(d?.pointsEarned);
      if (newStatus === 'done') {
        setBodyToast(Number.isFinite(pts) && pts > 0 ? t('+{n, plural, one {# bod} few {# body} other {# bodů}} za splněný úkol', { n: pts }) : t('Úkol je hotový.'));
        // Výrobní úkol už dávku naskladnil — „Vrátit" by jen lhalo, že se to vrátilo.
        setZpetUkol(task.source === 'production' ? null : task);
        setIdToastu(n => n + 1);
      }
      data.reload();
      // Hotový povinný úkol odemyká uzávěrku — otevřený formulář uzávěrky se přepočítá sám.
      oznamZmenuPovinnych();
      if (foto) setFotoUkol(null);
      return null;
    } catch (e) {
      data.set(prev => (prev ?? []).map(t => (t.id === task.id ? { ...t, status: puvodni, completionPhoto: task.completionPhoto } : t)));
      const hlaska = apiMessage(e, t('Změnu stavu se nepodařilo uložit.'));
      if (!foto) setSaveErr(hlaska);
      return hlaska;
    }
  };

  /** Splnit úkol, který není na dnešek, se napřed zeptá oknem (dřív confirm()). */
  const updateStatus = (task: Ukol, newStatus: string) => {
    if (!smiSplnit(task)) return;
    if (newStatus === 'done' && task.dueDate && task.dueDate !== today) { setMimoDen(task); return; }
    // Kolo 7: „jen s fotkou" — bez fotky by server odmítl; okno ji nafotí a pak teprve splní.
    if (newStatus === 'done' && chceFotku(task)) { setFotoUkol(task); return; }
    void zmenStav(task, newStatus);
  };

  const saveChecklist = async (task: Ukol, next: ChecklistItem[]) => {
    setSaveErr(null);
    const puvodni = task.checklist;
    data.set(prev => (prev ?? []).map(x => (x.id === task.id ? { ...x, checklist: next } : x)));
    try {
      await fetch(URL_UKOLY, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ id: task.id, checklist: next }) }).then(okJson);
    } catch (e) {
      data.set(prev => (prev ?? []).map(x => (x.id === task.id ? { ...x, checklist: puvodni } : x)));
      setSaveErr(apiMessage(e, t('Kontrolní seznam se nepodařilo uložit.')));
    }
  };
  const toggleChecklistItem = (task: Ukol, index: number) =>
    saveChecklist(task, task.checklist.map((it, i) => (i === index ? { ...it, done: !it.done } : it)));
  /** Odškrtnout nebo odškrtnutí zrušit u celého seznamu jedním požadavkem. */
  const toggleChecklistAll = (task: Ukol, done: boolean) => saveChecklist(task, task.checklist.map(it => ({ ...it, done })));

  // Filtry kromě stavu platí pro všechny pohledy; záložka stavu jen pro seznam.
  const bezStavu = useMemo(() => seradUkoly(filtrujBezStavu(tasks, filtr), filtr.razeni), [tasks, filtr]);
  const pocty = useMemo(() => poctyStavu(tasks, filtr, today, weekAhead), [tasks, filtr, today, weekAhead]);
  const plochySeznam = filtr.stav !== 'vse' || filtr.razeni !== 'termin';
  const vSeznamu = useMemo(() => filtrujUkoly(tasks, filtr, today, weekAhead), [tasks, filtr, today, weekAhead]);
  const detail = detailId != null ? tasks.find(x => x.id === detailId) ?? null : null;
  const karty = useMemo(() => {
    return { otevrene: tasks.filter(x => x.status !== 'done').length, poTerminu: poctyStavu(tasks, VYCHOZI_FILTR, today, weekAhead).po_terminu,
      dnesHotovo: tasks.filter(x => x.dueDate === today && x.status === 'done').length, dnesCelkem: tasks.filter(x => x.dueDate === today).length };
  }, [tasks, today, weekAhead]);
  const skupiny = rozdelPoDnech(bezStavu, today, weekAhead, 20);

  const row = (task: Ukol) => {
    const hotovo = task.status === 'done';
    // Budoucí výskyty ještě neplatí → tlumeně, dokud nepřijde jejich den.
    const inactive = !hotovo && !!task.dueDate && task.dueDate > today;
    const pozde = !hotovo && !!task.dueDate && task.dueDate < today;
    const opakovani = recurrenceLabel(task.recurrence);
    const stav = STAVY[task.status] ?? STAVY.pending;
    return (
      // Celý řádek otevírá detail (audit kola 6, Z4): dřív jen 21 px vysoký text titulku a klepnutí
      // na popis, datum nebo chipy nedělalo nic. Tlačítko titulku se roztáhne přes řádek (::after).
      // Nad ním leží zaškrtávátko (je v DOM před tlačítkem, proto z-[1]) a „···", návod a kontrolní
      // seznam (jsou za ním, stačí `relative`; bez z-indexu, ať panel „···" překryje další řádek).
      // `!transform-none`: globální `button:active { scale }` by z tlačítka udělal obal pro ::after,
      // překryv by se při stisku smrštil na titulek a puštění prstu by skončilo mimo tlačítko.
      <li key={task.id} className="list-row items-start relative">
        <span className="relative z-[1] shrink-0 pt-0.5">
          <Zaskrtnuti hotovo={hotovo} nazev={task.title} zamceno={!smiSplnit(task)} ceka={false}
            onClick={() => updateStatus(task, hotovo ? 'pending' : 'done')} />
        </span>
        <div className={`min-w-0 flex-1 ${inactive ? 'opacity-60' : ''}`}>
          <p className="flex">
            <button type="button" onClick={() => setDetailId(task.id)} aria-haspopup="dialog" title={t('Otevřít detail úkolu')}
              className={`min-w-0 text-left font-medium text-[15px] leading-snug hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] rounded !transform-none after:absolute after:inset-0 after:content-[''] after:rounded-[var(--r-md)] active:after:bg-black/[0.03] ${hotovo ? 'text-black/45' : 'text-[#16181A]'}`}>{task.title}</button>
          </p>
          {task.description && <p className="text-sm text-black/55 mt-1 whitespace-pre-wrap text-pretty">{task.description}</p>}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[13px] text-black/55">
            {task.dueDate && <span className={pozde ? 'text-bad-ink font-medium' : undefined}><span className="cz-sentence">{denKratce(task.dueDate)}</span>{task.dueTime && ` · ${fmtHM(task.dueTime)}`}{pozde && ` · ${t('po termínu')}`}</span>}
            {task.status === 'in_progress' && <Chip tone={stav.tone} size="sm">{t('Probíhá')}</Chip>}
            {/* Kolo 7: dnešní úkol „do 10:00" po desáté zčervená. */}
            {poCase(task, today, ted) && <Chip tone="bad" size="sm">{t('po čase')}</Chip>}
            {task.source === 'production' && <Chip tone="info" size="sm" icon="leaf">{t('Výroba')}</Chip>}
            {task.teamTask && <Chip tone="info" size="sm" icon="users">{t('Pro kohokoli')}</Chip>}
            {opakovani && <Chip tone="muted" size="sm" icon="refresh">{opakovani}</Chip>}
            {task.requireBeforeClosing && !hotovo && <ChipPredUzaverkou />}
            {task.requirePhoto && !hotovo && !task.completionPhoto && <Chip tone="muted" size="sm" icon="camera">{t('chce fotku')}</Chip>}
            {hotovo && task.completionPhoto && <Chip tone="muted" size="sm" icon="camera">{t('s fotkou')}</Chip>}
            {hotovo && task.completedByName && <span>{t('splnil {jmeno}', { jmeno: task.completedByName })}</span>}
            {/* Postup bydlí v návodu — odsud se na něj dá dostat jedním ťuknutím místo hledání v seznamu návodů. */}
            {task.sourceMeta?.guideId && (
              <a href={`/employee/shifts?view=guides&guide=${task.sourceMeta.guideId}`} className="btn btn-ghost btn-sm -my-1 relative"
                title={task.sourceMeta.guideTitle ?? t('Otevřít návod')}>
                <Icon name="book" size={15} className="shrink-0" />
                <span className="truncate max-w-[12rem]">{task.sourceMeta.guideTitle ?? t('Návod')}</span>
              </a>
            )}
          </div>
          {task.checklist.length > 0 && (
            <div className="relative">
              <TaskChecklist items={task.checklist} onToggle={smiSplnit(task) ? i => toggleChecklistItem(task, i) : undefined}
                onToggleAll={smiSplnit(task) ? d => toggleChecklistAll(task, d) : undefined} />
            </div>
          )}
        </div>
        {!hotovo && smiSplnit(task) && (
          <Menu size="sm" label={t('Stav úkolu {nazev}', { nazev: task.title })} className="shrink-0 -my-1" items={
            task.status === 'in_progress'
              ? [{ label: t('Vrátit na Čeká'), icon: 'undo', onClick: () => updateStatus(task, 'pending') }, { label: t('Hotovo'), icon: 'check', onClick: () => updateStatus(task, 'done') }]
              : [{ label: t('Začít — probíhá'), icon: 'play', onClick: () => updateStatus(task, 'in_progress') }, { label: t('Hotovo'), icon: 'check', onClick: () => updateStatus(task, 'done') }]
          } />
        )}
      </li>
    );
  };

  const section = (title: string, list: Ukol[], tone = '') =>
    list.length > 0 && (
      <section className="space-y-2" aria-label={title}>
        <h2 className={`t-label ${tone}`}>{title} ({list.length})</h2>
        <Card pad="none" className="px-5"><ul className="list">{list.map(row)}</ul></Card>
      </section>
    );

  const zbyva = skupiny.poTerminu.length + skupiny.dnes.length;
  // Segment stránky = 44 (md), stojí nad toolbarem přes celou šířku (P10, P11).
  const prepinac = <Segmented ariaLabel={t('Zobrazení')} value={view} onChange={setView}
    options={[{ id: 'list', label: t('Seznam') }, { id: 'week', label: t('Týden') }, { id: 'month', label: t('Měsíc') }]} />;
  const sFiltry = tasks.length > 0 && view !== 'prehled';
  // Sekce „Za body navíc": se seznamem jen když dnes něco je; jinak tichý řádek se „Zapsat navíc".
  const sekceZaBodyEl = smiNavic && zaBodyNacteno ? (
    <section ref={sekceZaBody} aria-labelledby="za-body-nadpis" data-za-body-sekce data-zvyrazneno={zvyraznitZaBody ? '' : undefined}
      className={`scroll-mt-4 rounded-3xl transition-shadow duration-200 ${zvyraznitZaBody ? 'ring-2 ring-[#C8F542] ring-offset-2 ring-offset-[var(--bg)]' : ''}`}>
      {ukolyZaBody.length > 0 ? (
        <Card pad="none" className="px-5">
          <div className="flex items-center py-2">
            <button type="button" onClick={prepniZaBody} aria-expanded={!zaBodySbaleno} aria-controls="za-body-seznam"
              className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2 text-left rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] !transform-none">
              <Icon name="gift" size={18} className="shrink-0 text-black/55" />
              <h2 id="za-body-nadpis" tabIndex={-1} data-za-body-nadpis className="t-card min-w-0 text-pretty outline-none">
                {t('Za body navíc')}{kVzeti > 0 && <span className="tabular-nums"> ({kVzeti})</span>}
              </h2>
              <Icon name="chevron" size={16} className={`shrink-0 text-black/40 transition-transform duration-200 ${zaBodySbaleno ? '' : 'rotate-180'}`} />
            </button>
          </div>
          {!zaBodySbaleno && (
            <div id="za-body-seznam" className="border-t border-[var(--surface-line)] pb-1">
              <p className="t-meta pt-3 text-pretty">{t('Volitelné — kdo chce, vezme si. Body dostaneš po uznání.')}</p>
              <UkolyZaBody ukoly={ukolyZaBody} />
            </div>
          )}
          {/* „Zapsat navíc" (vlastní věc mimo nabídku) pod seznamem — v hlavičce by na 390 px zalomil nadpis. */}
          <div className="border-t border-[var(--surface-line)] py-3">
            {/* v4 (P17, V2): akce sekce na konci karty přes celou šířku (patka), ne osamělá vlevo. */}
            <Button variant="secondary" icon="plus" className="w-full" onClick={() => setZapsatNavic(true)} data-zapsat-navic-tlacitko>{t('Zapsat navíc')}</Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-za-body-prazdno>
          <h2 id="za-body-nadpis" tabIndex={-1} data-za-body-nadpis className="sr-only">{t('Za body navíc')}</h2>
          <p className="t-meta min-w-0 flex-1 text-pretty">{t('Dnes tu nic za body není — zapsat můžeš i vlastní věc navíc.')}</p>
          <Button variant="ghost" icon="plus" onClick={() => setZapsatNavic(true)} data-zapsat-navic-tlacitko>{t('Zapsat navíc')}</Button>
        </div>
      )}
    </section>
  ) : null;

  const nastroj = (
    <div className="space-y-6">
      {!naTelefonu && sekceZaBodyEl}
      {/* Telefon začíná úkolem, ne ovládáním (audit kola 6, Z3): dřív Segmented, souhrn dne,
          hledání s Filtry a pás záložek — první úkol na y=427 z 844. Teď jeden řádek
          Seznam/Týden/Měsíc · lupa · Filtry · n; souhrn dne je až od md (po termínu je hned
          první sekce seznamu, červeně), záložky stavu od devíti úkolů nebo se zapnutým stavem. */}
      {/* Na telefonu se souhrn nekreslí vůbec (ne jen `hidden`): skrytý prvek pořád dostával mezeru space-y
          a ovládání pod hlavičkou začínalo o 24 px níž než na ostatních obrazovkách. */}
      {tasks.length > 0 && !naTelefonu && (
        <div className="hidden md:block">
          <UkolySouhrn hotovo={karty.dnesHotovo} celkem={karty.dnesCelkem} poTerminu={karty.poTerminu}
            onPoTerminu={() => { setView('list'); setFiltr(f => ({ ...f, stav: 'po_terminu' })); }} />
        </div>
      )}
      {sFiltry
        ? <UkolyFiltry filtr={filtr} onChange={setFiltr} pocty={pocty} skrytStav={view !== 'list'}
            kompaktniNaTelefonu pilulkyNaTelefonu={tasks.length > 8} vlevoNaTelefonu={prepinac} />
        : <div className="md:hidden">{prepinac}</div>}
      {saveErr && <p className="note note-danger text-sm" role="alert">{saveErr}</p>}
      {/* Telefon (v3): „Za body navíc" až pod jedinou řadou ovládání — přepínač pohledu
          s lupou a Filtry stojí hned pod nadpisem, ne v půlce obrazovky pod kartou nabídky,
          kde působil jako druhá lišta. Od md je přepínač pohledu v hlavičce a řádek nad
          seznamem jsou jen jeho filtry — tam nabídka zůstává nad nimi, filtry u seznamu. */}
      {naTelefonu && sekceZaBodyEl}
      {data.error && !data.data ? (
        <Card><ErrorState title={t('Úkoly se nenačetly')} onRetry={data.reload} detail={data.error} /></Card>
      ) : data.loading ? (
        <Card aria-busy className="space-y-2">
          <Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10 w-2/3" />
        </Card>
      ) : view === 'month' ? (
        <UkolyMesic ukoly={bezStavu} dnes={today} zacatekTydne={weekStart === 0 ? 0 : 1} radek={row} />
      ) : view === 'week' ? (
        <TaskWeekBoard tasks={bezStavu} weekStart={weekStart}
          onComplete={(t, done) => { const u = tasks.find(x => x.id === t.id); if (u) updateStatus(u, done ? 'done' : 'pending'); }}
          canComplete={t => { const u = tasks.find(x => x.id === t.id); return !!u && smiSplnit(u); }}
          labelFor={x => (x.teamTask ? t('Pro kohokoli') : '')} />
      ) : tasks.length === 0 ? (
        <Card><EmptyState illustration="ukoly" title={t('Žádné úkoly')} hint={t('Až ti vedení něco zadá, objeví se to tady i v přehledu.')} compact /></Card>
      ) : plochySeznam ? (
        vSeznamu.length === 0
          ? <Card><EmptyState compact icon="search" title={t('Nic nevyhovuje filtrům')} hint={t('Zkus jiný stav, hledání nebo zruš filtry.')}
              action={<Button variant="secondary" size="sm" onClick={() => setFiltr(VYCHOZI_FILTR)}>{t('Zrušit filtry')}</Button>} /></Card>
          : <Card pad="none" className="px-5"><ul className="list" aria-label={t('Úkoly')}>{vSeznamu.map(row)}</ul></Card>
      ) : (
        <>
          {section(t('Po termínu'), skupiny.poTerminu, 'text-bad-ink')}
          {section(t('Dnes'), skupiny.dnes)}
          {zbyva === 0 && (
            <Card><EmptyState compact illustration="ukoly" title={t('Na dnešek máš hotovo')} hint={t('Nic po termínu ani na dnes — další úkoly jsou níž.')} /></Card>
          )}
          {section(t('Tento týden'), skupiny.tentoTyden)}
          {skupiny.pozdeji.length > 0 && (
            showLater ? section(t('Později'), skupiny.pozdeji) : (
              <Button variant="ghost" size="sm" iconAfter="chevron" onClick={() => setShowLater(true)}>
                {t('Zobrazit další úkoly ({n})', { n: skupiny.pozdeji.length })}
              </Button>
            )
          )}
          {section(t('Hotové — posledních 20'), skupiny.hotove)}
        </>
      )}
    </div>
  );

  return (
    <>
      <PlochaWidgetu
        stranka="zamestnanec.ukoly"
        hlavicka={{
          title: t('Úkoly'),
          subtitle: data.data && zbyva > 0 ? t('Na dnešek a po termínu: {n, plural, one {# úkol} few {# úkoly} other {# úkolů}}.', { n: zbyva }) : t('Co je dnes na tobě — a co je pro kohokoli.'),
          hintId: 'tasks',
          // Na telefonu je přepínač v řádku s Filtry (nástroj), tady až od md.
          aside: <div className="hidden md:block">{prepinac}</div>,
        }}
        nastroj={nastroj}
      />
      {detail && (
        <UkolDetail ukol={detail} dnes={today} onClose={() => setDetailId(null)}
          kdo={detail.assigneeName ?? t('Já')} zamceno={!smiSplnit(detail)}
          navodHref={detail.sourceMeta?.guideId ? `/employee/shifts?view=guides&guide=${detail.sourceMeta.guideId}` : undefined}
          onSplnit={done => { if (done && ((detail.dueDate && detail.dueDate !== today) || chceFotku(detail))) setDetailId(null); updateStatus(detail, done ? 'done' : 'pending'); }}
          onStav={smiSplnit(detail) ? s => updateStatus(detail, s) : undefined}
          onChecklist={smiSplnit(detail) ? i => toggleChecklistItem(detail, i) : undefined}
          onChecklistVse={smiSplnit(detail) ? d => toggleChecklistAll(detail, d) : undefined} />
      )}
      {mimoDen && (
        <Modal open onClose={() => setMimoDen(null)} size="sm" title={t('Tohle není dnešní úkol')}
          footer={<>
            <Button variant="secondary" onClick={() => setMimoDen(null)}>{t('Zrušit')}</Button>
            <Button variant="primary" icon="check" onClick={() => { const u = mimoDen; setMimoDen(null); if (chceFotku(u)) setFotoUkol(u); else void zmenStav(u, 'done'); }}>{t('Splnit teď')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty"><span className="cz-sentence">{t('„{nazev}" má termín {den}.', { nazev: mimoDen.title, den: denDlouze(mimoDen.dueDate!) })}</span> {t('Opravdu ho chceš splnit už teď?')}</p>
        </Modal>
      )}
      {smiNavic && <ZapsatNavic open={zapsatNavic} onClose={() => setZapsatNavic(false)} />}
      {fotoUkol && <PrilozFoto nazev={fotoUkol.title} onClose={() => setFotoUkol(null)} onHotovo={url => zmenStav(fotoUkol, 'done', url)} />}
      <Toast message={bodyToast} id={idToastu} onClose={() => { setBodyToast(null); setZpetUkol(null); }}
        action={zpetUkol ? { label: t('Vrátit'), onClick: () => { const u = zpetUkol; setBodyToast(null); setZpetUkol(null); void zmenStav(u, 'pending'); } } : undefined} />
    </>
  );
}
