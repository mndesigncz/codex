'use client';

// Postupy: otevírání, zavírání a další rutiny krok za krokem.
//
// Kolo 69 (balík B6b): stránka je plocha s widgety. Hlavička jde do PlochaWidgetu,
// pás „N návrhů ke schválení" je widget postupy.navrhy a „Poslední průběhy" pod
// mřížkou widget postupy.posledni_prubehy (oblasti/postupy.tsx). Tahle komponenta
// kreslí nástroj: seznam postupů se spuštěním, detail, editor a smazání. Data čte
// přes useDataWidgetu ze stejných adres jako widgety — po uložení nebo schválení
// se obnoví seznam i widgety zároveň.
//
// Co se změnilo proti kolu 68 (audit final_sorted.json, obsah-kontrola.txt):
//  - mřížka velkých karet s limetkovým čtvercem a plným inkoustovým „Spustit" v každé
//    (pět tmavých ploch) → seznam v jedné kartě (archetyp A), „Spustit" secondary v řádku;
//  - Upravit/Smazat jen pod myší (na dotyku neviditelné) → „···" vždy vidět;
//  - confirm() a ručně psaná okna (smazání, detail, editor) → Modal;
//  - checkbox „Vyžadovat před uzávěrkou" → SwitchRow, kotva připomínky → Segmented,
//    vybraný den a ikona inkoustem (seg-on), ne limetkou;
//  - co kdo smí, se čte z oprávnění (postupy.vytvorit/upravit/mazat/schvalovat/spoustet),
//    ne z typu účtu — Provozní bez postupy.upravit dřív viděl tužku, která končila 403.
//
// Tablet (KioskApp) plochu nemá — kreslí nástroj s vlastní hlavičkou jako dřív.

import { useCallback, useEffect, useId, useState } from 'react';
import { cerstvePredaniPohledu, stavZPredani, udalostPredani } from '@/lib/predaniPohledu';
import { usePathname } from 'next/navigation';
import { Icon } from '../Icons';
import {
  Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Menu, Modal, PageHeader, Segmented, Skeleton, SwitchRow,
  type MenuItem,
} from '../ui';
import DetailPrubehu from './DetailPrubehu';
import { useProcedures } from './ProcedureProvider';
import StepTimeline from './StepTimeline';
import { parseSteps, totalMinutes, fmtMinutes, STEP_WEIGHTS, weightSpec, cisloZTextu, MAX_JEDNOTKA, type Step } from '@/lib/steps';
import { normalizujPrepis, normalizujPravidlo, ucinnePravidlo, type PrepisRezimu, type PravidloRezimu } from '@/lib/bodyRezim';
import { VolbaRezimuPolozky } from '../body-rezim/VolbaRezimu';
import { OknoNahledu, PrepocetZpetne, nactiNahled, provedPrepocet, type NahledPrepoctu } from '../body-rezim/Prepocet';
import { okJson, apiMessage } from '@/lib/api';
import StepGuidePicker, { type PickableGuide } from '../guides/StepGuidePicker';
import { Poznamky, type AutorNaTabletu } from '../Poznamky';
import { useOtevreniNavodu } from '@/lib/otevriNavod';
import KopieZPodniku, { useJinePodniky } from '../organizace/KopieZPodniku';
import { PlochaWidgetu, type HlavickaPlochy } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { useOpravneni } from '../role/useOpravneni';
import {
  URL_POSTUPY, URL_PRUBEHY, UDALOST_OTEVRIT_POSTUP, vyberPostupy, vyberPrubehy, posledniDokonceni, prubehyPostupu, delka,
  type PostupApi, type PrubehApi,
} from '@/lib/postupyPrehled';
import { useObnovaPoPrubehu } from '../widgety/oblasti/postupy';
import { useT, useJazyk, type PrekladFn } from '@/lib/i18n/client';
import { parseDbTime, dbTimeHM, pragueToday } from '@/lib/pragueTime';
import { fmtDatum } from '@/lib/i18n/format';
import type { Jazyk } from '@/lib/i18n/config';

/** Krátký popis spouštěče připomínky do řádku postupu (přeložený až na obrazovce). */
function popisPripominky(p: PostupApi, t: PrekladFn): string | null {
  if (p.remindAnchor === 'open') return t('Při otevření');
  if (p.remindAnchor === 'close') return t('Při zavření');
  return p.remindAt ? t('V {cas}', { cas: p.remindAt }) : null;
}

/** Kdy průběh skončil: „dnes 7:40“, jinak „12. 3. 7:40“ (pražský den), v jazyce uživatele. */
function kdyPrubehu(iso: string | null | undefined, t: PrekladFn, jazyk: Jazyk): string {
  if (!iso) return '';
  const d = parseDbTime(iso);
  if (!d) return '';
  const den = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
  const cas = dbTimeHM(d);
  if (den(d) === pragueToday()) return t('dnes {cas}', { cas });
  if (den(d) === pragueToday(-1)) return t('včera {cas}', { cas });
  return `${fmtDatum(d, { jazyk, styl: 'kratce' })} ${cas}`;
}

interface Props {
  user: { id?: string | number; name?: string | null; role?: string; avatar?: string };
}

interface Procedure extends PostupApi {
  items: any[];
  icon: string;
  color?: string;
  /** Kolo 91: způsob počítání bodů u postupu (null = podle podniku). */
  bodyRezim?: unknown;
}

const dnyTydne = (t: PrekladFn) => [t('Po', {}, 'den'), t('Út', {}, 'den'), t('St', {}, 'den'), t('Čt', {}, 'den'), t('Pá', {}, 'den'), t('So', {}, 'den'), t('Ne', {}, 'den')];
const ikonyPostupu = (t: PrekladFn): { id: string; nazev: string }[] => [
  { id: 'check', nazev: t('Fajfka') }, { id: 'clock', nazev: t('Hodiny') }, { id: 'box', nazev: t('Krabice') }, { id: 'book', nazev: t('Kniha') },
  { id: 'leaf', nazev: t('List') }, { id: 'users', nazev: t('Lidé') }, { id: 'calendar', nazev: t('Kalendář') }, { id: 'chat', nazev: t('Bublina') },
  { id: 'trend', nazev: t('Graf') }, { id: 'warning', nazev: t('Výstraha') }, { id: 'settings', nazev: t('Ozubené kolo') }, { id: 'search', nazev: t('Lupa') },
];
/** Důležitost kroku v jazyce uživatele (katalog `lib/steps` zůstává česky pro server). */
const vahaKroku = (t: PrekladFn): Record<string, string> => ({ key: t('Klíčový'), normal: t('Běžný'), minor: t('Drobný') });

const SEEDS = [
  {
    name: 'Otevírání', // i18n-ok (ukázkové postupy jsou obsah podniku)
    description: 'Ranní příprava provozovny před otevřením.', // i18n-ok (ukázkové postupy jsou obsah podniku)
    icon: 'clock',
    items: [
      { text: 'Odemknout provozovnu', emoji: '🔑', minutes: 1 },
      { text: 'Zapnout světla a hudbu', emoji: '💡', minutes: 1 }, // i18n-ok (ukázkové postupy jsou obsah podniku)
      { text: 'Spustit kávovar a ohřev vody', emoji: '☕', minutes: 10, note: 'Nechat nahřát před prvním kafem.' }, // i18n-ok (ukázkové postupy jsou obsah podniku)
      { text: 'Zkontrolovat pokladnu', emoji: '💰', minutes: 3, note: 'Ověřit počáteční hotovost.' }, // i18n-ok (ukázkové postupy jsou obsah podniku)
      { text: 'Doplnit vitrínu', emoji: '🧁', minutes: 8 }, // i18n-ok (ukázkové postupy jsou obsah podniku)
      { text: 'Otočit ceduli OTEVŘENO', emoji: '🚪', minutes: 1 }, // i18n-ok (ukázkové postupy jsou obsah podniku)
    ],
  },
  {
    name: 'Zavírání', // i18n-ok (ukázkové postupy jsou obsah podniku)
    description: 'Večerní uzavření provozovny.', // i18n-ok (ukázkové postupy jsou obsah podniku)
    icon: 'check',
    items: [
      { text: 'Otočit ceduli ZAVŘENO', emoji: '🚪', minutes: 1 }, // i18n-ok (ukázkové postupy jsou obsah podniku)
      { text: 'Uklidit a vytřít', emoji: '🧹', minutes: 15 }, // i18n-ok (ukázkové postupy jsou obsah podniku)
      { text: 'Vypnout spotřebiče', emoji: '🔌', minutes: 3 }, // i18n-ok (ukázkové postupy jsou obsah podniku)
      { text: 'Spočítat pokladnu', emoji: '💰', minutes: 8, note: 'Provést uzávěrku.' }, // i18n-ok (ukázkové postupy jsou obsah podniku)
      { text: 'Vynést odpadky', emoji: '🗑️', minutes: 3 }, // i18n-ok (ukázkové postupy jsou obsah podniku)
      { text: 'Zamknout a zapnout alarm', emoji: '🔒', minutes: 2 },
    ],
  },
];

/** Ikona v jamce jako `lead` řádku (DP §3.6) — místo limetkového čtverce 48 px. */
function Jamka({ ikona }: { ikona: string }) {
  return (
    <span aria-hidden className="well grid h-9 w-9 shrink-0 place-items-center">
      <Icon name={ikona || 'check'} size={16} className="text-black/55" />
    </span>
  );
}

export default function Procedures({ user }: Props) {
  const t = useT('postupy');
  const { jazyk } = useJazyk();
  const pathname = usePathname() ?? '';
  // Nástroj stránky (ne widget) bere mírné `ma()`: bez načtených oprávnění ukáže akce
  // a rozhodne server (jako ostatní obrazovky); přísné useSmi je pro widgety (spec §1.5).
  const { role, ma: smi } = useOpravneni();
  // Tablet nemá plochu (kiosk.smena je jiná stránka, balík B9) — nástroj s vlastní hlavičkou.
  const tablet = pathname.startsWith('/kiosk') || role?.typ === 'kiosk';
  const stranka = pathname.startsWith('/employer') ? 'vedeni.postupy' : 'zamestnanec.postupy';
  const smiVytvorit = smi('postupy.vytvorit');
  const smiNavrhnout = smi('postupy.navrhnout');
  const smiUpravit = smi('postupy.upravit');
  const smiMazat = smi('postupy.mazat');
  const smiSchvalovat = smi('postupy.schvalovat');
  const smiSpoustet = smi('postupy.spoustet');
  const { active, startRun, starting } = useProcedures();
  useObnovaPoPrubehu();

  const data = useDataWidgetu(URL_POSTUPY, vyberPostupy);
  // Poslední dokončení do řádku — sdílené s widgetem Poslední průběhy (jeden dotaz).
  const behy = useDataWidgetu(URL_PRUBEHY, vyberPrubehy);
  const procedures = (data.data?.postupy ?? []) as Procedure[];

  // Filtr „Čeká na schválení" — z widgetu Návrhy postupů (stav:navrhy) i ručně; viz lib/predaniPohledu.ts.
  const [jenNavrhy, setJenNavrhy] = useState(() => stavZPredani(cerstvePredaniPohledu('procedures'), ['navrhy']) === 'navrhy');
  useEffect(() => {
    const naPredani = (e: Event) => { if (stavZPredani((e as CustomEvent).detail, ['navrhy'])) setJenNavrhy(true); };
    window.addEventListener(udalostPredani('procedures'), naPredani);
    return () => window.removeEventListener(udalostPredani('procedures'), naPredani);
  }, []);
  const nNavrhu = procedures.filter(p => p.approved === false).length;
  const zobrazene = jenNavrhy ? procedures.filter(p => p.approved === false) : procedures;

  const [seeding, setSeeding] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Procedure | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const detail = detailId != null ? procedures.find(p => p.id === detailId) ?? null : null;
  const [confirmDel, setConfirmDel] = useState<Procedure | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [chyba, setChyba] = useState('');
  // Potvrzení odeslaného návrhu. GET /api/procedures vrací neschválené postupy jen schvalovateli,
  // takže autorovi návrh po obnovení ze seznamu zmizí — bez hlášky nevěděl, jestli odešel,
  // a posílal ho znovu (duplicity).
  const [odeslano, setOdeslano] = useState('');
  // Kopie z jiného podniku organizace — jen s právem zakládat a jen když takový podnik existuje.
  const [kopieOpen, setKopieOpen] = useState(false);
  const { jine: jinePodniky, cil: nazevPodniku } = useJinePodniky(smiVytvorit);

  const reload = useCallback(() => { obnovDataWidgetu(URL_POSTUPY); }, []);

  // Widget (Návrhy postupů) otevírá detail postupu tady — bez přechodu jinam.
  useEffect(() => {
    const f = (e: Event) => {
      const d = (e as CustomEvent<{ id: number; prijato: boolean }>).detail;
      if (!d) return;
      d.prijato = true;
      setDetailId(d.id);
    };
    window.addEventListener(UDALOST_OTEVRIT_POSTUP, f);
    return () => window.removeEventListener(UDALOST_OTEVRIT_POSTUP, f);
  }, []);

  const approveProcedure = async (id: number) => {
    setChyba('');
    try {
      const res = await fetch(`/api/procedures/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approve: true }),
      });
      await okJson(res);
      reload();
    } catch (e) {
      setChyba(apiMessage(e, t('Postup se neschválil.')));
    }
  };

  const seedExamples = async () => {
    setSeeding(true); setChyba('');
    let selhalo = 0;
    for (const s of SEEDS) {
      try {
        const res = await fetch('/api/procedures', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
        if (!res.ok) selhalo += 1;
      } catch { selhalo += 1; }
    }
    if (selhalo) setChyba(t('Některé ukázkové postupy se nepodařilo založit. Zkus to znovu.'));
    reload();
    setSeeding(false);
  };

  const doConfirmDelete = async () => {
    if (!confirmDel) return;
    setDeleting(true); setChyba('');
    try {
      const res = await fetch(`/api/procedures/${confirmDel.id}`, { method: 'DELETE' });
      await okJson(res);
      data.set(prev => (prev ? { ...prev, postupy: prev.postupy.filter(p => p.id !== confirmDel.id) } : prev as any));
      reload();
      setConfirmDel(null);
    } catch (e) {
      // Dřív se postup z obrazovky odebral hned a chyba smazání se zahodila — po obnovení byl zpátky.
      setChyba(apiMessage(e, t('Postup se nepodařilo smazat.')));
      setConfirmDel(null);
    } finally {
      setDeleting(false);
    }
  };

  const openNew = () => { setEditing(null); setOdeslano(''); setEditorOpen(true); };
  const openEdit = (p: Procedure) => { setEditing(p); setEditorOpen(true); };
  const spust = (p: Procedure) => { if (!starting) void startRun(p as any); };

  const smiZakladat = smiVytvorit || smiNavrhnout;
  const hlavicka: HlavickaPlochy = {
    title: t('Postupy'),
    subtitle: t('Krok za krokem — otevírání, zavírání a další rutiny.'),
    hintId: 'procedures',
    // Jediná limetka stránky. Bez postupů ji nese prázdný stav (ukázkové postupy), ne hlavička.
    primary: smiZakladat && procedures.length > 0 ? (
      <Button variant="accent" icon="plus" onClick={openNew} title={smiVytvorit ? undefined : t('Návrh schválí vedení')}>
        {smiVytvorit ? t('Nový postup') : t('Navrhnout postup')}
      </Button>
    ) : undefined,
    secondary: smiVytvorit && jinePodniky.length > 0
      ? <Button variant="secondary" icon="copy" onClick={() => setKopieOpen(true)}>{t('Z jiného podniku')}</Button>
      : undefined,
    menu: smiVytvorit && jinePodniky.length > 0
      ? [{ label: t('Kopírovat z jiného podniku'), icon: 'copy', onClick: () => setKopieOpen(true) }]
      : undefined,
  };

  let nastroj: React.ReactNode;
  if (data.loading) {
    nastroj = (
      <Card pad="none" aria-busy>
        <div className="p-5 space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12" />)}</div>
      </Card>
    );
  } else if (data.error) {
    nastroj = <Card><ErrorState title={t('Postupy se nenačetly')} hint={data.error} onRetry={data.reload} /></Card>;
  } else if (procedures.length === 0) {
    nastroj = (
      <Card>
        <EmptyState illustration="postupy" title={t('Zatím žádné postupy')}
          hint={smiVytvorit
            ? t('Otevírání, zavírání, příjem zboží — krok za krokem, s časy a tím, co je klíčové. Tým je pak odklikne na baru.')
            : t('Až je vedení sepíše, najdeš je tady a projdeš krok po kroku.')}
          action={smiVytvorit ? (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <Button variant="accent" icon="leaf" onClick={seedExamples} loading={seeding}>{t('Vytvořit ukázkové postupy')}</Button>
              <Button variant="secondary" icon="plus" onClick={openNew}>{t('Vlastní postup')}</Button>
            </div>
          ) : smiNavrhnout ? <Button variant="secondary" icon="plus" onClick={openNew}>{t('Navrhnout postup')}</Button> : undefined} />
      </Card>
    );
  } else {
    nastroj = (
      <>
        {/* Co čeká na schválení: pilulka jen když takový postup je (nebo je filtr zapnutý). */}
        {(nNavrhu > 0 || jenNavrhy) && (
          <div className="flex gap-2 mb-3">
            <button type="button" aria-pressed={jenNavrhy} onClick={() => setJenNavrhy(v => !v)}
              className={`filter-pill tap-target whitespace-nowrap shrink-0 ${jenNavrhy ? 'seg-on' : 'seg-off glass'}`}>
              {t('Čeká na schválení')} <span className="tabular-nums opacity-60">{nNavrhu}</span>
            </button>
          </div>
        )}
      <Card pad="none">
        <ul className="list px-5">
          {zobrazene.length === 0 && <li className="py-6 text-center t-meta">{t('Žádný postup nečeká na schválení.')}</li>}
          {zobrazene.map(p => {
            const running = active?.procedureId === p.id;
            const steps = parseSteps(p.items);
            const mins = totalMinutes(steps);
            const last = posledniDokonceni(behy.data ?? [], p.id);
            const navrh = p.approved === false;
            const meta = [
              t('{n, plural, one {# krok} few {# kroky} other {# kroků}}', { n: steps.length }),
              mins > 0 ? fmtMinutes(mins) : null,
              popisPripominky(p, t),
              last ? t('naposledy {kdy}', { kdy: kdyPrubehu(last.completed_at || last.started_at, t, jazyk) }) : null,
            ].filter(Boolean).join(' · ');
            const polozky: MenuItem[] = [
              { label: t('Zobrazit kroky'), icon: 'clipboard', onClick: () => setDetailId(p.id) },
              ...(navrh && smiSchvalovat ? [{ label: t('Schválit návrh'), icon: 'check', onClick: () => { void approveProcedure(p.id); } }] : []),
              ...(smiUpravit ? [{ label: t('Upravit'), icon: 'pencil', onClick: () => openEdit(p) }] : []),
              ...(smiMazat ? [{ label: t('Smazat'), icon: 'trash', danger: true, onClick: () => setConfirmDel(p) }] : []),
            ];
            return (
              <ListRow key={p.id} className="relative"
                lead={<Jamka ikona={p.icon} />}
                // Řádek má vlastní tlačítka (Spustit, „···"), takže celý klikací být nemůže
                // (tlačítko v tlačítku) — detail otevře název.
                // Cíl je celý řádek: ::after tlačítka se roztáhne přes <li className="relative">
                // (samotný text měřil na telefonu ~20 px; tap-target i -my ořízne `truncate` obalu).
                // Akce leží nad ním, protože jsou pozicované a v DOM později (Menu je relative,
                // Spustit dostal `relative`). Fokus = limetkový prstenec řádku jako u Button.
                title={<button type="button" onClick={() => setDetailId(p.id)} className="block max-w-full truncate text-left hover:underline underline-offset-2 focus-visible:outline-none after:absolute after:inset-0 after:rounded-[var(--r-md)] after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[#C8F542]">{p.name}</button>}
                meta={meta}
                right={navrh ? <Chip tone="wait" size="sm">{t('Čeká na schválení')}</Chip> : running ? <Chip tone="info" size="sm">{t('Probíhá')}</Chip> : undefined}
                actions={<>
                  {smiSpoustet && !navrh && !running && (
                    <Button variant="secondary" size="sm" icon="play" className="relative" disabled={starting} onClick={() => spust(p)}>{t('Spustit')}</Button>
                  )}
                  <Menu size="sm" label={t('Další akce s postupem {nazev}', { nazev: p.name })} items={polozky} />
                </>} />
            );
          })}
        </ul>
      </Card>
      </>
    );
  }

  const okna = (
    <>
      <Modal open={!!confirmDel} onClose={() => { if (!deleting) setConfirmDel(null); }} size="sm" title={t('Smazat postup?')}
        subtitle={confirmDel ? `„${confirmDel.name}"` : undefined}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmDel(null)} disabled={deleting}>{t('Zrušit')}</Button>
          <Button variant="danger-solid" icon="trash" onClick={doConfirmDelete} loading={deleting}>{t('Smazat')}</Button>
        </>}>
        <p className="text-sm text-black/55 text-pretty">{t('Postup se odstraní i s nastavenou připomínkou. Proběhlé průběhy v historii zůstanou.')}</p>
      </Modal>

      {kopieOpen && smiVytvorit && (
        <KopieZPodniku entita="postupy" podniky={jinePodniky} cil={nazevPodniku} onClose={() => setKopieOpen(false)} onHotovo={reload} />
      )}

      {detail && (
        <ProcedureDetail
          procedure={detail}
          smiUpravit={smiUpravit}
          smiSpustit={smiSpoustet}
          smiSchvalit={smiSchvalovat}
          running={active?.procedureId === detail.id}
          starting={starting}
          tablet={tablet}
          prubehy={behy.data ?? null}
          prubehyChyba={!!behy.error && !behy.data}
          tym={smi('postupy.prubehy_tymu')}
          // Tablet kreslí nástroj pod vybraným člověkem (actingUser v KioskApp): za něj se píšou poznámky.
          zaKoho={tablet && user.role !== 'kiosk' && Number(user.id) > 0 ? { id: Number(user.id), name: user.name ?? '' } : null}
          onRun={() => { spust(detail); setDetailId(null); }}
          onApprove={() => { void approveProcedure(detail.id); }}
          onEdit={() => { const p = detail; setDetailId(null); openEdit(p); }}
          onClose={() => setDetailId(null)}
        />
      )}

      {editorOpen && (
        <ProcedureEditor
          key={editing?.id ?? 'new'}
          initial={editing}
          smiPovinny={smiVytvorit || smiUpravit}
          smiPrepocet={smi('odmeny.nastaveni')}
          navrh={!smiVytvorit && !editing}
          onClose={() => setEditorOpen(false)}
          onSaved={(saved) => {
            setEditorOpen(false);
            // Návrh, který autor sám neuvidí: do seznamu ho nepřidávat (reload ho hned zase
            // vyhodí, řádek jen blikne) a místo toho potvrdit odeslání.
            if (saved.approved === false && !smiSchvalovat) {
              setOdeslano(saved.name);
              return;
            }
            data.set(prev => {
              if (!prev) return prev as any;
              const exists = prev.postupy.some(p => p.id === saved.id);
              return { ...prev, postupy: exists ? prev.postupy.map(p => (p.id === saved.id ? saved : p)) : [...prev.postupy, saved] };
            });
            reload();
          }}
        />
      )}
    </>
  );

  const telo = (
    <div className="space-y-3">
      {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
      {odeslano && <p className="note note-ok text-pretty" role="status">{t('Návrh „{nazev}" odeslán — schválí ho vedení.', { nazev: odeslano })}</p>}
      {nastroj}
    </div>
  );

  if (tablet) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto w-full space-y-5">
        <PageHeader title={hlavicka.title} subtitle={hlavicka.subtitle} hintId={hlavicka.hintId} primary={hlavicka.primary} />
        {telo}
        {okna}
      </div>
    );
  }
  return (
    <>
      <PlochaWidgetu stranka={stranka} hlavicka={hlavicka} nastroj={telo} />
      {okna}
    </>
  );
}

function ProcedureDetail({
  procedure, smiUpravit, smiSpustit, smiSchvalit, running, starting, tablet, prubehy, prubehyChyba, tym, zaKoho, onRun, onApprove, onEdit, onClose,
}: {
  procedure: Procedure;
  smiUpravit: boolean;
  smiSpustit: boolean;
  smiSchvalit: boolean;
  running: boolean;
  starting: boolean;
  tablet: boolean;
  /** Průběhy z hooku stránky (GET /api/procedures/runs, LIMIT 50) — žádný další dotaz; null = ještě nejsou. */
  prubehy: PrubehApi[] | null;
  prubehyChyba: boolean;
  /** postupy.prubehy_tymu: API vrací průběhy celého týmu, jinak jen moje. */
  tym: boolean;
  /** Tablet: člověk, za kterého se píšou poznámky (vybraný u tabletu). */
  zaKoho: AutorNaTabletu | null;
  onRun: () => void;
  onApprove: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const t = useT('postupy');
  const { jazyk } = useJazyk();
  const steps = parseSteps(procedure.items);
  const mins = totalMinutes(steps);
  const navodOdkaz = useOtevreniNavodu();
  const navrh = procedure.approved === false;
  // Historie tohoto postupu (kolo 7): kdo ho naposledy prošel, kdy, jak dlouho, co zůstalo.
  const radky = prubehy ? prubehyPostupu(prubehy, procedure.id) : [];
  const [prubeh, setPrubeh] = useState<PrubehApi | null>(null);
  const surovy = (id: number) => prubehy?.find(r => Number(r.id) === id) ?? null;

  return (
    <>
    <Modal open onClose={onClose} size="md" title={procedure.name}
      subtitle={[t('{n, plural, one {# krok} few {# kroky} other {# kroků}}', { n: steps.length }), mins > 0 ? fmtMinutes(mins) : null, popisPripominky(procedure, t)].filter(Boolean).join(' · ')}
      footer={<>
        {smiUpravit && <Button variant="secondary" icon="pencil" onClick={onEdit}>{t('Upravit')}</Button>}
        {navrh && smiSchvalit && <Button variant="primary" icon="check" onClick={onApprove}>{t('Schválit')}</Button>}
        {!navrh && smiSpustit && (
          <Button variant="primary" icon="play" onClick={onRun} loading={starting} disabled={running}>
            {running ? t('Právě probíhá') : t('Spustit postup')}
          </Button>
        )}
      </>}>
      {navrh && <p className="note note-wait text-sm mb-3">{t('Návrh čeká na schválení — spustit půjde až potom.')}</p>}
      {procedure.description && <p className="text-sm leading-relaxed text-black/60 mb-3 text-pretty">{procedure.description}</p>}
      <StepTimeline steps={steps} {...navodOdkaz} />
      {!navrh && (
        <section className="mt-6 min-w-0" aria-labelledby={`prubehy-${procedure.id}`}>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 id={`prubehy-${procedure.id}`} className="t-label">{t('Poslední průběhy')}</h3>
            {/* API vrací posledních 50 průběhů za tým — u málo používaného postupu to nemusí být celá historie. */}
            <span className="t-meta">{tym ? t('z posledních průběhů týmu') : t('jen tvoje')}</span>
          </div>
          {prubehyChyba ? (
            <p className="t-meta mt-1 text-pretty">{t('Průběhy se nenačetly.')}</p>
          ) : !prubehy ? (
            <div className="mt-2 space-y-2" aria-busy><Skeleton className="h-11" /><Skeleton className="h-11 w-3/4" /></div>
          ) : radky.length === 0 ? (
            <p className="t-meta mt-1 text-pretty">{tym ? t('Tenhle postup zatím nikdo neprošel.') : t('Tenhle postup jsi zatím neprošel.')}</p>
          ) : (
            <ul className="list mt-1">
              {radky.map(r => (
                <ListRow key={r.id}
                  lead={<Avatar emoji={r.avatar} name={r.kdo} size="sm" />}
                  title={r.kdo || t('Neznámý')}
                  meta={[r.hotovo ? kdyPrubehu(r.kdy, t, jazyk) : t('probíhá'), r.hotovo ? delka(r.sekund) : null].filter(Boolean).join(' · ')}
                  right={!r.hotovo
                    ? <Chip tone="info" size="sm">{r.odskrtano}/{r.celkem}</Chip>
                    : r.nedokonceno > 0 ? <Chip tone="wait" size="sm" icon="warning">{t('{n} nedokončeno', { n: r.nedokonceno })}</Chip> : undefined}
                  onClick={r.hotovo ? () => setPrubeh(surovy(r.id)) : undefined} />
              ))}
            </ul>
          )}
        </section>
      )}
      {/* Postřehy k postupu („krok 3 trvá déle, když je mráz") pod kroky — píše každý, kdo postup vidí. */}
      <Poznamky typ="procedure" id={procedure.id} tablet={tablet} zaKoho={zaKoho} className="mt-6" />
    </Modal>
    {prubeh && (
      <DetailPrubehu prubeh={prubeh} kroky={procedure.items}
        kdy={kdyPrubehu(prubeh.completed_at || prubeh.started_at, t, jazyk)} onClose={() => setPrubeh(null)} />
    )}
    </>
  );
}

function ProcedureEditor({
  initial, smiPovinny, smiPrepocet, navrh, onClose, onSaved,
}: {
  initial: Procedure | null;
  /** Povinnost před uzávěrkou nastaví jen ten, kdo zakládá nebo upravuje (návrh ji API zahodí). */
  smiPovinny: boolean;
  /** Přepočítat body zpětně smí jen ten, kdo smí měnit nastavení bodů (odmeny.nastaveni). */
  smiPrepocet: boolean;
  /** Ukládá se jako návrh ke schválení (postupy.navrhnout bez postupy.vytvorit). */
  navrh: boolean;
  onClose: () => void;
  onSaved: (p: Procedure) => void;
}) {
  const t = useT('postupy');
  const uid = useId();
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? 'check');
  const [remindAt, setRemindAt] = useState(initial?.remindAt ?? '');
  const [remindAnchor, setRemindAnchor] = useState<'time' | 'open' | 'close'>(
    (initial?.remindAnchor as 'time' | 'open' | 'close') ?? 'time'
  );
  const [requireBeforeClosing, setRequireBeforeClosing] = useState<boolean>(initial?.requireBeforeClosing === true);
  const [remindDays, setRemindDays] = useState<number[]>(
    Array.isArray(initial?.remindDays) ? [...(initial!.remindDays as number[])] : []
  );
  const blankStep = (): Step => ({ text: '', minutes: null, note: null, emoji: null, weight: 'normal', penalty: null, guideId: null, valueKind: null, valueUnit: null, valueMin: null, valueMax: null });
  const [steps, setSteps] = useState<Step[]>(() => {
    const parsed = parseSteps(initial?.items);
    return parsed.length ? parsed : [blankStep()];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Kolo 91: způsob počítání bodů u postupu, výchozí podniku a přepočet zpětně.
  const [bodyRezim, setBodyRezim] = useState<PrepisRezimu | null>(() => normalizujPrepis(initial?.bodyRezim));
  const [vychozi, setVychozi] = useState<(PravidloRezimu & { zaklad: number }) | null>(null);
  const [prepocitat, setPrepocitat] = useState(false);
  const [nahled, setNahled] = useState<{ open: boolean; data: NahledPrepoctu | null; chyba: string | null }>({ open: false, data: null, chyba: null });
  useEffect(() => {
    let alive = true;
    fetch('/api/body/vychozi').then(okJson)
      .then(d => { if (alive && d?.postupy) setVychozi({ ...normalizujPravidlo(d.postupy), zaklad: Number(d.postupy.zaklad) || 0 }); })
      .catch(() => { /* bez výchozího se volba ukáže bez věty */ });
    return () => { alive = false; };
  }, []);
  const rezimKroku = vychozi ? ucinnePravidlo(vychozi, bodyRezim, vychozi.zaklad).rezim : (bodyRezim?.rezim ?? 'kombinace');
  // Návody se načtou JEDNOU pro celý editor — kroků bývá dvacet a dvacet
  // stejných požadavků na `/api/guides` je zbytečných. Když se načtení
  // nepovede, výběr se prostě nenabídne; postup se uloží i tak.
  const [guideOptions, setGuideOptions] = useState<PickableGuide[]>([]);
  useEffect(() => {
    let alive = true;
    fetch('/api/guides').then(okJson)
      .then(d => { if (alive && Array.isArray(d.guides)) setGuideOptions(d.guides.map((g: any) => ({ id: Number(g.id), title: String(g.title) }))); })
      .catch(() => { /* bez návodů se krok uloží taky */ });
    return () => { alive = false; };
  }, []);

  const patchStep = (i: number, patch: Partial<Step>) => setSteps(prev => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStep = () => setSteps(prev => [...prev, blankStep()]);
  const insertStep = (i: number) => setSteps(prev => { const n = [...prev]; n.splice(i + 1, 0, blankStep()); return n; });
  const removeStep = (i: number) => setSteps(prev => (prev.length === 1 ? [blankStep()] : prev.filter((_, idx) => idx !== i)));
  const toggleDay = (d: number) =>
    setRemindDays(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b)));
  const move = (i: number, dir: -1 | 1) => setSteps(prev => {
    const j = i + dir;
    if (j < 0 || j >= prev.length) return prev;
    const next = [...prev];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  const sestavKroky = () => steps
      .map(s => ({
        text: s.text.trim(), minutes: s.minutes, note: s.note?.trim() || null, emoji: s.emoji?.trim() || null,
        // Scoring config must survive the round-trip — dropping it here would
        // silently reset every "klíčový krok" back to normal on each save.
        // Vlastní body kroku (kolo 91) taky.
        weight: s.weight ?? 'normal', penalty: s.penalty ?? null, points: s.points ?? null,
        // Totéž platí pro návod: kdyby se tu zahodil, každé uložení postupu
        // by obsluze potichu sebralo odkaz na postup, podle kterého pracuje.
        guideId: s.guideId ?? null,
        // Měřená hodnota (kolo 7) — stejně jako váha a návod musí přežít uložení.
        valueKind: s.valueKind ?? null, valueUnit: s.valueUnit?.trim() || null, valueMin: s.valueMin ?? null, valueMax: s.valueMax ?? null,
      }))
      .filter(s => s.text.length > 0);

  const save = async () => {
    setError('');
    const cleanName = name.trim();
    const items = sestavKroky();
    if (!cleanName) { setError(t('Zadej název postupu.')); return; }
    if (items.length === 0) { setError(t('Přidej aspoň jeden krok.')); return; }
    // Kolo 91: „Přepočítat zpětně“ — nejdřív dopad (s kroky z editoru), uložení až po potvrzení.
    if (initial && prepocitat) {
      setNahled({ open: true, data: null, chyba: null });
      try {
        setNahled({ open: true, data: await nactiNahled({ typ: 'postup', id: initial.id }, { bodyRezim, items }), chyba: null });
      } catch (e) {
        setNahled({ open: true, data: null, chyba: apiMessage(e, t('Dopad se nepodařilo spočítat.')) });
      }
      return;
    }
    await ulozit(items, false);
  };

  const ulozit = async (items: ReturnType<typeof sestavKroky>, sPrepoctem: boolean) => {
    setSaving(true);
    try {
      const reminderOn = remindAnchor !== 'time' || !!remindAt;
      const payload = {
        name: name.trim(),
        description: (description ?? '').trim(),
        icon,
        items,
        remindAnchor,
        remindAt: remindAnchor === 'time' ? (remindAt || null) : null,
        remindDays: reminderOn ? remindDays : [],
        requireBeforeClosing,
        // S přepočtem uloží způsob počítání přepočet (zapíše si předchozí kvůli vrácení), ne tahle úprava.
        ...(smiPovinny && !navrh && !sPrepoctem ? { bodyRezim } : {}),
      };
      const res = await fetch(initial ? `/api/procedures/${initial.id}` : '/api/procedures', {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await okJson(res);
      if (sPrepoctem && initial) await provedPrepocet({ typ: 'postup', id: initial.id }, { bodyRezim, items });
      onSaved({ ...(d.procedure as Procedure), ...(sPrepoctem ? { bodyRezim } : {}) });
    } catch (e) {
      const zprava = apiMessage(e, t('Uložení se nezdařilo.'));
      if (sPrepoctem) setNahled(n => ({ ...n, chyba: zprava })); else setError(zprava);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg"
      title={initial ? t('Upravit postup') : navrh ? t('Navrhnout postup') : t('Nový postup')}
      subtitle={navrh ? t('Návrh schválí vedení, pak ho uvidí celý tým.') : undefined}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t('Zrušit')}</Button>
        <Button variant="primary" onClick={save} loading={saving}>{initial ? t('Uložit změny') : navrh ? t('Odeslat návrh') : t('Vytvořit postup')}</Button>
      </>}>
      <div className="space-y-4">
        <Field id={`${uid}-nazev`} label={t('Název', {}, 'postup')}>
          <Input id={`${uid}-nazev`} value={name} onChange={e => setName(e.target.value)} placeholder={t('Např. Otevírání')} />
        </Field>
        <Field id={`${uid}-popis`} label={t('Popis (nepovinné)')}>
          <Input id={`${uid}-popis`} value={description ?? ''} onChange={e => setDescription(e.target.value)} placeholder={t('Krátký popis postupu')} />
        </Field>

        <div role="group" aria-labelledby={`${uid}-ikona`}>
          <p id={`${uid}-ikona`} className="field-label">{t('Ikona')}</p>
          <div className="flex flex-wrap gap-2">
            {ikonyPostupu(t).map(ic => (
              <button key={ic.id} type="button" onClick={() => setIcon(ic.id)} aria-label={t('Ikona {nazev}', { nazev: ic.nazev })} aria-pressed={icon === ic.id}
                className={`filter-pill tap-target grid h-11 w-11 place-items-center !px-0 ${icon === ic.id ? 'seg-on' : 'seg-off glass'}`}>
                <Icon name={ic.id} size={20} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="field-label">{t('Kroky')}</p>
          <p className="t-meta mb-2 text-pretty">{rezimKroku === 'kroky'
            ? t('Emoji a čas jsou nepovinné. Důležitost kroku řídí body: splněný krok přidá (klíčový +2, běžný +1, drobný 0), nesplněný nic neubere. Vlastní body kroku mají přednost.')
            : rezimKroku === 'celek'
              ? t('Emoji a čas jsou nepovinné. Důležitost kroku řídí srážky: nedokončený krok strhne (klíčový −3, běžný −1, drobný 0). Vlastní minus body mají přednost.')
              : t('Emoji a čas jsou nepovinné. Důležitost kroku řídí body: hotový krok přičítá, vynechaný odečítá (klíčový +2/−3, běžný +1/−1, drobný 0). Vlastní minus body mají přednost.')}</p>
          <ol className="space-y-2.5">
            {steps.map((s, i) => (
              <li key={i} className="space-y-2">
                <div className="well p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={s.emoji ?? ''} onChange={e => patchStep(i, { emoji: e.target.value })} placeholder="🙂" maxLength={4}
                      aria-label={t('Emoji kroku {n} (nepovinné)', { n: i + 1 })} className="!w-12 shrink-0 text-center !px-1" />
                    <Input value={s.text} onChange={e => patchStep(i, { text: e.target.value })} placeholder={t('Krok {n}', { n: i + 1 })}
                      aria-label={t('Krok {n}', { n: i + 1 })} className="flex-1 min-w-0" />
                    <Input type="number" min={0} inputMode="numeric" value={s.minutes ?? ''}
                      onChange={e => patchStep(i, { minutes: e.target.value ? Math.max(0, parseInt(e.target.value)) : null })}
                      placeholder="min" aria-label={t('Minuty kroku {n} (nepovinné)', { n: i + 1 })} className="!w-20 shrink-0 tabular-nums" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Důležitost řídí automatické body: hotovo = +, vynecháno = − */}
                    <Segmented size="sm" ariaLabel={t('Důležitost kroku {n}', { n: i + 1 })} value={s.weight ?? 'normal'}
                      onChange={w => patchStep(i, { weight: w })}
                      options={STEP_WEIGHTS.map(w => ({ id: w.id, label: vahaKroku(t)[w.id] ?? w.label }))} />
                    {rezimKroku === 'kroky' ? (
                      // Kolo 91: „Za každý krok“ — vlastní plus body za splnění místo srážky.
                      <Input type="number" min={0} inputMode="numeric" value={s.points ?? ''}
                        onChange={e => patchStep(i, { points: e.target.value === '' ? null : Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })}
                        placeholder={`+${weightSpec(s.weight ?? 'normal').plus}`}
                        aria-label={t('Vlastní body kroku {n} za splnění', { n: i + 1 })} className="!w-20 shrink-0 tabular-nums" />
                    ) : (
                      <Input type="number" min={0} inputMode="numeric" value={s.penalty ?? ''}
                        onChange={e => patchStep(i, { penalty: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0) })}
                        placeholder={`−${weightSpec(s.weight ?? 'normal').minus}`}
                        aria-label={t('Vlastní minus body kroku {n}, když se neudělá', { n: i + 1 })} className="!w-20 shrink-0 tabular-nums" />
                    )}
                    <Input value={s.note ?? ''} onChange={e => patchStep(i, { note: e.target.value })}
                      aria-label={t('Poznámka ke kroku {n} (nepovinné)', { n: i + 1 })} placeholder={t('Poznámka (nepovinné)')} className="flex-1 min-w-[10rem]" />
                    {/* Poznámka je na jednu větu. „Vyčistit kávovar" chce celý
                        postup — a ten v Návodech nejspíš už je. */}
                    <StepGuidePicker guides={guideOptions} value={s.guideId ?? null} stepNumber={i + 1}
                      onChange={g => patchStep(i, { guideId: g })} />
                    {/* Měřená hodnota (kolo 7, HACCP): v běhu se u kroku zapíše číslo s jednotkou. */}
                    <button type="button" aria-pressed={s.valueKind === 'number'}
                      onClick={() => patchStep(i, s.valueKind === 'number'
                        ? { valueKind: null, valueUnit: null, valueMin: null, valueMax: null }
                        : { valueKind: 'number', valueUnit: s.valueUnit ?? null })}
                      aria-label={t('Krok {n}: měřená hodnota', { n: i + 1 })}
                      className={`filter-pill tap-target shrink-0 whitespace-nowrap ${s.valueKind === 'number' ? 'seg-on' : 'seg-off glass'}`}>
                      {t('Měřená hodnota')}
                    </button>
                    <div className="flex shrink-0 items-center">
                      <Button variant="ghost" size="sm" iconOnly icon="chevron" className="rotate-180" aria-label={t('Posunout krok {n} výš', { n: i + 1 })}
                        onClick={() => move(i, -1)} disabled={i === 0} />
                      <Button variant="ghost" size="sm" iconOnly icon="chevron" aria-label={t('Posunout krok {n} níž', { n: i + 1 })}
                        onClick={() => move(i, 1)} disabled={i === steps.length - 1} />
                      <Button variant="ghost" size="sm" iconOnly icon="close" aria-label={t('Odebrat krok {n}', { n: i + 1 })} onClick={() => removeStep(i)} />
                    </div>
                  </div>
                  {s.valueKind === 'number' && (
                    // Telefon: tři pole vedle sebe přes celou šířku; od sm úzká pole v řádku.
                    <div className="grid grid-cols-3 gap-2 sm:flex sm:items-end" role="group" aria-label={t('Měřená hodnota kroku {n}', { n: i + 1 })}>
                      <Field id={`${uid}-k${i}-jednotka`} label={t('Jednotka')} className="sm:w-24">
                        <Input id={`${uid}-k${i}-jednotka`} value={s.valueUnit ?? ''} onChange={e => patchStep(i, { valueUnit: e.target.value.slice(0, MAX_JEDNOTKA) || null })}
                          maxLength={MAX_JEDNOTKA} placeholder="°C" autoComplete="off"
                          aria-label={t('Jednotka kroku {n}', { n: i + 1 })} />
                      </Field>
                      <Field id={`${uid}-k${i}-od`} label={t('Od')} className="sm:w-24">
                        <MezHodnoty id={`${uid}-k${i}-od`} value={s.valueMin ?? null} onChange={v => patchStep(i, { valueMin: v })}
                          label={t('Nejnižší povolená hodnota kroku {n}', { n: i + 1 })} />
                      </Field>
                      <Field id={`${uid}-k${i}-do`} label={t('Do')} className="sm:w-24">
                        <MezHodnoty id={`${uid}-k${i}-do`} value={s.valueMax ?? null} onChange={v => patchStep(i, { valueMax: v })}
                          label={t('Nejvyšší povolená hodnota kroku {n}', { n: i + 1 })} />
                      </Field>
                      <p className="t-meta col-span-3 sm:col-span-1 sm:self-center text-pretty">{t('Hodnota mimo rozsah se v průběhu jen označí, nic neblokuje.')}</p>
                    </div>
                  )}
                </div>
                {i < steps.length - 1 && (
                  <div className="flex justify-center">
                    <Button variant="ghost" size="sm" icon="plus" onClick={() => insertStep(i)} aria-label={t('Vložit krok za krok {n}', { n: i + 1 })}>{t('Vložit')}</Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <Button variant="secondary" size="sm" icon="plus" className="mt-2.5" onClick={addStep}>{t('Přidat krok')}</Button>
        </div>

        {/* Kolo 91: způsob počítání bodů u postupu (návrh zaměstnance ho nenastavuje). */}
        {smiPovinny && !navrh && (
          <div data-body-postupu>
            <p className="field-label">{t('Body za postup')}</p>
            <VolbaRezimuPolozky druh="postupy" prepis={bodyRezim} vychozi={vychozi} onZmena={setBodyRezim} />
            {initial && smiPrepocet && (
              <div className="mt-2"><PrepocetZpetne checked={prepocitat} onChange={setPrepocitat} /></div>
            )}
          </div>
        )}

        {smiPovinny && !navrh && (
          <ul className="list">
            <SwitchRow title={t('Vyžadovat před uzávěrkou')} hint={t('Dokud nebude dokončený, uzávěrka dne zůstane zamčená. Dokončení po půlnoci (do 6:00) se počítá ke včerejší uzávěrce.')}
              checked={requireBeforeClosing} onChange={setRequireBeforeClosing} />
          </ul>
        )}

        <div>
          <p className="field-label">{t('Připomínka (nepovinné)')}</p>
          <p className="t-meta mb-2 text-pretty">{t('Postup se v daný čas sám otevře a lidem na směně přijde upozornění.')}</p>
          <Segmented ariaLabel={t('Kdy připomenout')} value={remindAnchor} onChange={setRemindAnchor}
            options={[{ id: 'time', label: t('V určený čas') }, { id: 'open', label: t('Při otevření') }, { id: 'close', label: t('Při zavření') }]} />
          <div className="mt-2.5">
            {remindAnchor === 'time' ? (
              <div className="flex items-center gap-2">
                <Input type="time" aria-label={t('Čas připomenutí')} value={remindAt ?? ''} onChange={e => setRemindAt(e.target.value)}
                  className="flex-1 min-w-0 tabular-nums" />
                {remindAt && (
                  <Button variant="ghost" iconOnly icon="close" aria-label={t('Zrušit připomínku')} onClick={() => { setRemindAt(''); setRemindDays([]); }} />
                )}
              </div>
            ) : (
              <p className="t-meta text-pretty">
                {remindAnchor === 'open' ? t('Připomene se podle otevírací doby daného dne (při otevření) — když je zavřeno, ten den se nepřipomene.') : t('Připomene se podle otevírací doby daného dne (při zavření) — když je zavřeno, ten den se nepřipomene.')}
              </p>
            )}
          </div>
          {(remindAnchor !== 'time' || remindAt) && (
            <div className="mt-2.5" role="group" aria-labelledby={`${uid}-dny`}>
              <p id={`${uid}-dny`} className="t-meta mb-1.5">{t('Ve dnech (nevybráno = každý den)')}</p>
              <div className="flex flex-wrap gap-1.5">
                {dnyTydne(t).map((label, d) => {
                  const on = remindDays.includes(d);
                  return (
                    <button key={d} type="button" onClick={() => toggleDay(d)} aria-pressed={on}
                      className={`filter-pill tap-target min-w-[2.75rem] justify-center ${on ? 'seg-on' : 'seg-off glass'}`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {error && <p className="note note-danger text-sm" role="alert">{error}</p>}
      </div>
      <OknoNahledu open={nahled.open} nahled={nahled.data} chyba={nahled.chyba} ukladam={saving}
        onPotvrdit={() => void ulozit(sestavKroky(), true)} onZrusit={() => setNahled({ open: false, data: null, chyba: null })} />
    </Modal>
  );
}

/**
 * Mez měřené hodnoty (Od/Do): textové pole s inputMode decimal — čárka i tečka, „−1,5".
 * Rozepsaný text drží lokálně, ať „4," při psaní nezmizí; ven jde číslo, nebo null.
 */
function MezHodnoty({ id, value, onChange, label }: {
  id: string;
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
}) {
  const { jazyk } = useJazyk();
  const zobraz = (n: number | null) => (n == null ? '' : jazyk === 'en' ? String(n) : String(n).replace('.', ','));
  const [text, setText] = useState(() => zobraz(value));
  // Hodnota se změnila zvenku (přesun kroku, vypnutí měření) — srovnat text, když nesedí.
  useEffect(() => {
    if (cisloZTextu(text) !== value) setText(zobraz(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Input id={id} inputMode="decimal" autoComplete="off" value={text} aria-label={label}
      onChange={e => { setText(e.target.value); onChange(cisloZTextu(e.target.value)); }}
      className="min-w-0 tabular-nums" />
  );
}
