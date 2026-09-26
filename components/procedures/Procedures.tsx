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
import { usePathname } from 'next/navigation';
import { Icon } from '../Icons';
import {
  Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Menu, Modal, PageHeader, Segmented, Skeleton, SwitchRow,
  type MenuItem,
} from '../ui';
import { useProcedures } from './ProcedureProvider';
import StepTimeline from './StepTimeline';
import { parseSteps, totalMinutes, fmtMinutes, STEP_WEIGHTS, weightSpec, type Step } from '@/lib/steps';
import { czCount, type CzNoun } from '@/lib/czech';
import { okJson, apiMessage } from '@/lib/api';
import StepGuidePicker, { type PickableGuide } from '../guides/StepGuidePicker';
import { useOtevreniNavodu } from '@/lib/otevriNavod';
import KopieZPodniku, { useJinePodniky } from '../organizace/KopieZPodniku';
import { PlochaWidgetu, type HlavickaPlochy } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { useOpravneni } from '../role/useOpravneni';
import {
  URL_POSTUPY, URL_PRUBEHY, UDALOST_OTEVRIT_POSTUP, vyberPostupy, vyberPrubehy, posledniDokonceni, popisPripominky,
  type PostupApi,
} from '@/lib/postupyPrehled';
import { kdyPrubehu, useObnovaPoPrubehu } from '../widgety/oblasti/postupy';

interface Props {
  user: { id?: string | number; name?: string | null; role?: string; avatar?: string };
}

interface Procedure extends PostupApi {
  items: any[];
  icon: string;
  color?: string;
}

const WEEKDAYS = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
const KROK: CzNoun = { one: 'krok', few: 'kroky', many: 'kroků' };
const ICON_CHOICES: { id: string; nazev: string }[] = [
  { id: 'check', nazev: 'Fajfka' }, { id: 'clock', nazev: 'Hodiny' }, { id: 'box', nazev: 'Krabice' }, { id: 'book', nazev: 'Kniha' },
  { id: 'leaf', nazev: 'List' }, { id: 'users', nazev: 'Lidé' }, { id: 'calendar', nazev: 'Kalendář' }, { id: 'chat', nazev: 'Bublina' },
  { id: 'trend', nazev: 'Graf' }, { id: 'warning', nazev: 'Výstraha' }, { id: 'settings', nazev: 'Ozubené kolo' }, { id: 'search', nazev: 'Lupa' },
];

const SEEDS = [
  {
    name: 'Otevírání',
    description: 'Ranní příprava provozovny před otevřením.',
    icon: 'clock',
    items: [
      { text: 'Odemknout provozovnu', emoji: '🔑', minutes: 1 },
      { text: 'Zapnout světla a hudbu', emoji: '💡', minutes: 1 },
      { text: 'Spustit kávovar a ohřev vody', emoji: '☕', minutes: 10, note: 'Nechat nahřát před prvním kafem.' },
      { text: 'Zkontrolovat pokladnu', emoji: '💰', minutes: 3, note: 'Ověřit počáteční hotovost.' },
      { text: 'Doplnit vitrínu', emoji: '🧁', minutes: 8 },
      { text: 'Otočit ceduli OTEVŘENO', emoji: '🚪', minutes: 1 },
    ],
  },
  {
    name: 'Zavírání',
    description: 'Večerní uzavření provozovny.',
    icon: 'check',
    items: [
      { text: 'Otočit ceduli ZAVŘENO', emoji: '🚪', minutes: 1 },
      { text: 'Uklidit a vytřít', emoji: '🧹', minutes: 15 },
      { text: 'Vypnout spotřebiče', emoji: '🔌', minutes: 3 },
      { text: 'Spočítat pokladnu', emoji: '💰', minutes: 8, note: 'Provést uzávěrku.' },
      { text: 'Vynést odpadky', emoji: '🗑️', minutes: 3 },
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
      setChyba(apiMessage(e, 'Postup se neschválil.'));
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
    if (selhalo) setChyba('Některé ukázkové postupy se nepodařilo založit. Zkus to znovu.');
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
      setChyba(apiMessage(e, 'Postup se nepodařilo smazat.'));
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
    title: 'Postupy',
    subtitle: 'Krok za krokem — otevírání, zavírání a další rutiny.',
    hintId: 'procedures',
    // Jediná limetka stránky. Bez postupů ji nese prázdný stav (ukázkové postupy), ne hlavička.
    primary: smiZakladat && procedures.length > 0 ? (
      <Button variant="accent" icon="plus" onClick={openNew} title={smiVytvorit ? undefined : 'Návrh schválí vedení'}>
        {smiVytvorit ? 'Nový postup' : 'Navrhnout postup'}
      </Button>
    ) : undefined,
    secondary: smiVytvorit && jinePodniky.length > 0
      ? <Button variant="secondary" icon="copy" onClick={() => setKopieOpen(true)}>Z jiného podniku</Button>
      : undefined,
    menu: smiVytvorit && jinePodniky.length > 0
      ? [{ label: 'Kopírovat z jiného podniku', icon: 'copy', onClick: () => setKopieOpen(true) }]
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
    nastroj = <Card><ErrorState title="Postupy se nenačetly" hint={data.error} onRetry={data.reload} /></Card>;
  } else if (procedures.length === 0) {
    nastroj = (
      <Card>
        <EmptyState illustration="postupy" title="Zatím žádné postupy"
          hint={smiVytvorit
            ? 'Otevírání, zavírání, příjem zboží — krok za krokem, s časy a tím, co je klíčové. Tým je pak odklikne na baru.'
            : 'Až je vedení sepíše, najdeš je tady a projdeš krok po kroku.'}
          action={smiVytvorit ? (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <Button variant="accent" icon="leaf" onClick={seedExamples} loading={seeding}>Vytvořit ukázkové postupy</Button>
              <Button variant="secondary" icon="plus" onClick={openNew}>Vlastní postup</Button>
            </div>
          ) : smiNavrhnout ? <Button variant="secondary" icon="plus" onClick={openNew}>Navrhnout postup</Button> : undefined} />
      </Card>
    );
  } else {
    nastroj = (
      <Card pad="none">
        <ul className="list px-5">
          {procedures.map(p => {
            const running = active?.procedureId === p.id;
            const steps = parseSteps(p.items);
            const mins = totalMinutes(steps);
            const last = posledniDokonceni(behy.data ?? [], p.id);
            const navrh = p.approved === false;
            const meta = [
              czCount(steps.length, KROK),
              mins > 0 ? fmtMinutes(mins) : null,
              popisPripominky(p),
              last ? `naposledy ${kdyPrubehu(last.completed_at || last.started_at)}` : null,
            ].filter(Boolean).join(' · ');
            const polozky: MenuItem[] = [
              { label: 'Zobrazit kroky', icon: 'clipboard', onClick: () => setDetailId(p.id) },
              ...(navrh && smiSchvalovat ? [{ label: 'Schválit návrh', icon: 'check', onClick: () => { void approveProcedure(p.id); } }] : []),
              ...(smiUpravit ? [{ label: 'Upravit', icon: 'pencil', onClick: () => openEdit(p) }] : []),
              ...(smiMazat ? [{ label: 'Smazat', icon: 'trash', danger: true, onClick: () => setConfirmDel(p) }] : []),
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
                right={navrh ? <Chip tone="wait" size="sm">Čeká na schválení</Chip> : running ? <Chip tone="info" size="sm">Probíhá</Chip> : undefined}
                actions={<>
                  {smiSpoustet && !navrh && !running && (
                    <Button variant="secondary" size="sm" icon="play" className="relative" disabled={starting} onClick={() => spust(p)}>Spustit</Button>
                  )}
                  <Menu size="sm" label={`Další akce s postupem ${p.name}`} items={polozky} />
                </>} />
            );
          })}
        </ul>
      </Card>
    );
  }

  const okna = (
    <>
      <Modal open={!!confirmDel} onClose={() => { if (!deleting) setConfirmDel(null); }} size="sm" title="Smazat postup?"
        subtitle={confirmDel ? `„${confirmDel.name}"` : undefined}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirmDel(null)} disabled={deleting}>Zrušit</Button>
          <Button variant="danger-solid" icon="trash" onClick={doConfirmDelete} loading={deleting}>Smazat</Button>
        </>}>
        <p className="text-sm text-black/55 text-pretty">Postup se odstraní i s nastavenou připomínkou. Proběhlé průběhy v historii zůstanou.</p>
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
      {odeslano && <p className="note note-ok text-pretty" role="status">Návrh „{odeslano}" odeslán — schválí ho vedení.</p>}
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
  procedure, smiUpravit, smiSpustit, smiSchvalit, running, starting, onRun, onApprove, onEdit, onClose,
}: {
  procedure: Procedure;
  smiUpravit: boolean;
  smiSpustit: boolean;
  smiSchvalit: boolean;
  running: boolean;
  starting: boolean;
  onRun: () => void;
  onApprove: () => void;
  onEdit: () => void;
  onClose: () => void;
}) {
  const steps = parseSteps(procedure.items);
  const mins = totalMinutes(steps);
  const navodOdkaz = useOtevreniNavodu();
  const navrh = procedure.approved === false;

  return (
    <Modal open onClose={onClose} size="md" title={procedure.name}
      subtitle={[czCount(steps.length, KROK), mins > 0 ? fmtMinutes(mins) : null, popisPripominky(procedure)].filter(Boolean).join(' · ')}
      footer={<>
        {smiUpravit && <Button variant="secondary" icon="pencil" onClick={onEdit}>Upravit</Button>}
        {navrh && smiSchvalit && <Button variant="primary" icon="check" onClick={onApprove}>Schválit</Button>}
        {!navrh && smiSpustit && (
          <Button variant="primary" icon="play" onClick={onRun} loading={starting} disabled={running}>
            {running ? 'Právě probíhá' : 'Spustit postup'}
          </Button>
        )}
      </>}>
      {navrh && <p className="note note-wait text-sm mb-3">Návrh čeká na schválení — spustit půjde až potom.</p>}
      {procedure.description && <p className="text-sm leading-relaxed text-black/60 mb-3 text-pretty">{procedure.description}</p>}
      <StepTimeline steps={steps} {...navodOdkaz} />
    </Modal>
  );
}

function ProcedureEditor({
  initial, smiPovinny, navrh, onClose, onSaved,
}: {
  initial: Procedure | null;
  /** Povinnost před uzávěrkou nastaví jen ten, kdo zakládá nebo upravuje (návrh ji API zahodí). */
  smiPovinny: boolean;
  /** Ukládá se jako návrh ke schválení (postupy.navrhnout bez postupy.vytvorit). */
  navrh: boolean;
  onClose: () => void;
  onSaved: (p: Procedure) => void;
}) {
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
  const blankStep = (): Step => ({ text: '', minutes: null, note: null, emoji: null, weight: 'normal', penalty: null, guideId: null });
  const [steps, setSteps] = useState<Step[]>(() => {
    const parsed = parseSteps(initial?.items);
    return parsed.length ? parsed : [blankStep()];
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
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

  const save = async () => {
    setError('');
    const cleanName = name.trim();
    const items = steps
      .map(s => ({
        text: s.text.trim(), minutes: s.minutes, note: s.note?.trim() || null, emoji: s.emoji?.trim() || null,
        // Scoring config must survive the round-trip — dropping it here would
        // silently reset every "klíčový krok" back to normal on each save.
        weight: s.weight ?? 'normal', penalty: s.penalty ?? null,
        // Totéž platí pro návod: kdyby se tu zahodil, každé uložení postupu
        // by obsluze potichu sebralo odkaz na postup, podle kterého pracuje.
        guideId: s.guideId ?? null,
      }))
      .filter(s => s.text.length > 0);
    if (!cleanName) { setError('Zadej název postupu.'); return; }
    if (items.length === 0) { setError('Přidej aspoň jeden krok.'); return; }
    setSaving(true);
    try {
      const reminderOn = remindAnchor !== 'time' || !!remindAt;
      const payload = {
        name: cleanName,
        description: (description ?? '').trim(),
        icon,
        items,
        remindAnchor,
        remindAt: remindAnchor === 'time' ? (remindAt || null) : null,
        remindDays: reminderOn ? remindDays : [],
        requireBeforeClosing,
      };
      const res = await fetch(initial ? `/api/procedures/${initial.id}` : '/api/procedures', {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await okJson(res);
      onSaved(d.procedure as Procedure);
    } catch (e) {
      setError(apiMessage(e, 'Uložení se nezdařilo.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="lg"
      title={initial ? 'Upravit postup' : navrh ? 'Navrhnout postup' : 'Nový postup'}
      subtitle={navrh ? 'Návrh schválí vedení, pak ho uvidí celý tým.' : undefined}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Zrušit</Button>
        <Button variant="primary" onClick={save} loading={saving}>{initial ? 'Uložit změny' : navrh ? 'Odeslat návrh' : 'Vytvořit postup'}</Button>
      </>}>
      <div className="space-y-4">
        <Field id={`${uid}-nazev`} label="Název">
          <Input id={`${uid}-nazev`} value={name} onChange={e => setName(e.target.value)} placeholder="Např. Otevírání" />
        </Field>
        <Field id={`${uid}-popis`} label="Popis (nepovinné)">
          <Input id={`${uid}-popis`} value={description ?? ''} onChange={e => setDescription(e.target.value)} placeholder="Krátký popis postupu" />
        </Field>

        <div role="group" aria-labelledby={`${uid}-ikona`}>
          <p id={`${uid}-ikona`} className="field-label">Ikona</p>
          <div className="flex flex-wrap gap-2">
            {ICON_CHOICES.map(ic => (
              <button key={ic.id} type="button" onClick={() => setIcon(ic.id)} aria-label={`Ikona ${ic.nazev}`} aria-pressed={icon === ic.id}
                className={`filter-pill tap-target grid h-11 w-11 place-items-center !px-0 ${icon === ic.id ? 'seg-on' : 'seg-off glass'}`}>
                <Icon name={ic.id} size={20} />
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="field-label">Kroky</p>
          <p className="t-meta mb-2 text-pretty">Emoji a čas jsou nepovinné. Důležitost kroku řídí body: hotový krok přičítá, vynechaný odečítá (klíčový +2/−3, běžný +1/−1, drobný 0). Vlastní minus body mají přednost.</p>
          <ol className="space-y-2.5">
            {steps.map((s, i) => (
              <li key={i} className="space-y-2">
                <div className="well p-2.5 space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={s.emoji ?? ''} onChange={e => patchStep(i, { emoji: e.target.value })} placeholder="🙂" maxLength={4}
                      aria-label={`Emoji kroku ${i + 1} (nepovinné)`} className="!w-12 shrink-0 text-center !px-1" />
                    <Input value={s.text} onChange={e => patchStep(i, { text: e.target.value })} placeholder={`Krok ${i + 1}`}
                      aria-label={`Krok ${i + 1}`} className="flex-1 min-w-0" />
                    <Input type="number" min={0} inputMode="numeric" value={s.minutes ?? ''}
                      onChange={e => patchStep(i, { minutes: e.target.value ? Math.max(0, parseInt(e.target.value)) : null })}
                      placeholder="min" aria-label={`Minuty kroku ${i + 1} (nepovinné)`} className="!w-20 shrink-0 tabular-nums" />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Důležitost řídí automatické body: hotovo = +, vynecháno = − */}
                    <Segmented size="sm" ariaLabel={`Důležitost kroku ${i + 1}`} value={s.weight ?? 'normal'}
                      onChange={w => patchStep(i, { weight: w })}
                      options={STEP_WEIGHTS.map(w => ({ id: w.id, label: w.label }))} />
                    <Input type="number" min={0} inputMode="numeric" value={s.penalty ?? ''}
                      onChange={e => patchStep(i, { penalty: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0) })}
                      placeholder={`−${weightSpec(s.weight ?? 'normal').minus}`}
                      aria-label={`Vlastní minus body kroku ${i + 1}, když se neudělá`} className="!w-20 shrink-0 tabular-nums" />
                    <Input value={s.note ?? ''} onChange={e => patchStep(i, { note: e.target.value })}
                      aria-label={`Poznámka ke kroku ${i + 1} (nepovinné)`} placeholder="Poznámka (nepovinné)" className="flex-1 min-w-[10rem]" />
                    {/* Poznámka je na jednu větu. „Vyčistit kávovar" chce celý
                        postup — a ten v Návodech nejspíš už je. */}
                    <StepGuidePicker guides={guideOptions} value={s.guideId ?? null} stepNumber={i + 1}
                      onChange={g => patchStep(i, { guideId: g })} />
                    <div className="flex shrink-0 items-center">
                      <Button variant="ghost" size="sm" iconOnly icon="chevron" className="rotate-180" aria-label={`Posunout krok ${i + 1} výš`}
                        onClick={() => move(i, -1)} disabled={i === 0} />
                      <Button variant="ghost" size="sm" iconOnly icon="chevron" aria-label={`Posunout krok ${i + 1} níž`}
                        onClick={() => move(i, 1)} disabled={i === steps.length - 1} />
                      <Button variant="ghost" size="sm" iconOnly icon="close" aria-label={`Odebrat krok ${i + 1}`} onClick={() => removeStep(i)} />
                    </div>
                  </div>
                </div>
                {i < steps.length - 1 && (
                  <div className="flex justify-center">
                    <Button variant="ghost" size="sm" icon="plus" onClick={() => insertStep(i)} aria-label={`Vložit krok za krok ${i + 1}`}>Vložit</Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
          <Button variant="secondary" size="sm" icon="plus" className="mt-2.5" onClick={addStep}>Přidat krok</Button>
        </div>

        {smiPovinny && !navrh && (
          <ul className="list">
            <SwitchRow title="Vyžadovat před uzávěrkou" hint="Bez dokončení tohoto postupu nepůjde odeslat uzávěrka dne."
              checked={requireBeforeClosing} onChange={setRequireBeforeClosing} />
          </ul>
        )}

        <div>
          <p className="field-label">Připomínka (nepovinné)</p>
          <p className="t-meta mb-2 text-pretty">Postup se v daný čas sám otevře a lidem na směně přijde upozornění.</p>
          <Segmented ariaLabel="Kdy připomenout" value={remindAnchor} onChange={setRemindAnchor}
            options={[{ id: 'time', label: 'V určený čas' }, { id: 'open', label: 'Při otevření' }, { id: 'close', label: 'Při zavření' }]} />
          <div className="mt-2.5">
            {remindAnchor === 'time' ? (
              <div className="flex items-center gap-2">
                <Input type="time" aria-label="Čas připomenutí" value={remindAt ?? ''} onChange={e => setRemindAt(e.target.value)}
                  className="flex-1 min-w-0 tabular-nums" />
                {remindAt && (
                  <Button variant="ghost" iconOnly icon="close" aria-label="Zrušit připomínku" onClick={() => { setRemindAt(''); setRemindDays([]); }} />
                )}
              </div>
            ) : (
              <p className="t-meta text-pretty">
                Připomene se podle otevírací doby daného dne{remindAnchor === 'open' ? ' (při otevření)' : ' (při zavření)'} — když je zavřeno, ten den se nepřipomene.
              </p>
            )}
          </div>
          {(remindAnchor !== 'time' || remindAt) && (
            <div className="mt-2.5" role="group" aria-labelledby={`${uid}-dny`}>
              <p id={`${uid}-dny`} className="t-meta mb-1.5">Ve dnech (nevybráno = každý den)</p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((label, d) => {
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
    </Modal>
  );
}
