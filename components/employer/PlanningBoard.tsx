'use client';

// Plánování: tabule, na které karta putuje zleva doprava — Nápady → Rozpracováno
// → Ke schválení → Hotovo.
//
// Kolo 69 (balík B6a): stránka je plocha s widgety. Hlavička jde do PlochaWidgetu
// (a konečně má hlavní akci „Nová karta" — dřív šla karta přidat jen tichým „+"
// v každém sloupci), tahle komponenta kreslí nástroj: tabuli. Karty čte přes
// useDataWidgetu z téže adresy jako widgety Plánovací nástěnka a Karty ke schválení,
// takže karta schválená ve widgetu se hned přesune i tady.
//
// Z auditu (pruzkum68 Plánování): menu karty bylo ručně psané „···" bez klávesnice
// a Escape → Menu z ui; výpadek načtení vypadal jako prázdná tabule → ErrorState;
// neúspěšné přidání nic neřeklo → hláška; publikace do Noisium ruční limetková jamka
// s „✓" → Toast; formulář nové karty s ruční limetkou v každém otevřeném sloupci →
// Input/Textarea a Button; na telefonu čtyři sloupce pod sebou, i prázdné → vodorovný
// pás sloupců se scroll-snap. Přidat, přesunout, upravit a smazat jde jen
// s planovani.upravit — role jen se zobrazením dřív viděla ovládání, které skončilo 403.
//
// Kolo 6 (V13): vodorovný pás byl jediný vodorovný posun obsahu v administraci — vidět byl jen
// první sloupec a kousek druhého, zjistit, co je „Ke schválení", chtělo tři tahy do strany. Na
// telefonu jsou teď sloupce záložky (Segmented s počty) nad svislým seznamem karet zvoleného
// sloupce; přesun mezi sloupci je v „···" karty (Přesunout do: …). Od `sm` mřížka jako dřív.

import { useEffect, useId, useState } from 'react';
import { Icon } from '../Icons';
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, Menu, Modal, Segmented, Skeleton, Textarea, Toast, type MenuItem } from '../ui';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { useNavigace, useSmi } from '../widgety/NavigaceKontext';
import { URL_PLANOVANI } from '../widgety/oblasti/planovani';
import { apiMessage, okJson } from '@/lib/api';
import { vyberKarty, kartySloupce, sloupecKarty, stariKarty, krestniJmeno, konceptUkoluZKarty, type KartaPlanu } from '@/lib/ukolyPrehled';
import { zapisKoncept } from '@/lib/useDraft';
import { parseDbTime } from '@/lib/pragueTime';
import { fmtDatum } from '@/lib/i18n/format';
import { useJazyk, useT } from '@/lib/i18n/client';
import { useLocale } from './jazyk';

// Sloupce tabule jsou kategorie, ne stavy — každý potřebuje vlastní
// rozlišitelnou barvu, a stavové tóny na to nestačí. Proto kategoriální
// řada z globals.css. (Dokud tu „Ke schválení" bylo žluté a
// „Rozpracováno" oranžové, vypadalo to jako dva odstíny téhož; po
// sjednocení oranžové na amber z nich byla dokonce jedna barva.)
const COLUMNS = [
  { id: 'ideas', label: 'Nápady', dot: 'cat-dot-2' }, // i18n-ok (popisky překládá nazevSloupce)
  { id: 'in_progress', label: 'Rozpracováno', dot: 'cat-dot-4' }, // i18n-ok
  { id: 'review', label: 'Ke schválení', dot: 'cat-dot-5' }, // i18n-ok
  { id: 'done', label: 'Hotovo', dot: 'cat-dot-1' }, // i18n-ok
] as const;

const JSON_HLAVICKA = { 'Content-Type': 'application/json' };
type IdSloupce = (typeof COLUMNS)[number]['id'];

export default function PlanningBoard() {
  const loc = useLocale();
  const t = useT('sprava');
  const { jazyk } = useJazyk();
  const nazvySloupcu: Record<IdSloupce, string> = { ideas: t('Nápady'), in_progress: t('Rozpracováno'), review: t('Ke schválení'), done: t('Hotovo') };
  const smi = useSmi();
  const nav = useNavigace();
  const upravuje = smi('planovani.upravit');
  // Kolo 7: z karty jde založit úkol — jen kdo smí úkoly zadávat (a vidí stránku Úkolů).
  const zakladaUkoly = smi('ukoly.zadavat') && nav.smiPohled('tasks');
  const data = useDataWidgetu<KartaPlanu[]>(URL_PLANOVANI, vyberKarty);
  const cards = data.data ?? [];
  const [newCard, setNewCard] = useState<{ column: string; title: string; description: string } | null>(null);
  // Úprava existující karty — překlep nemá znamenat smazat a napsat znovu.
  const [editCard, setEditCard] = useState<{ id: number; title: string; description: string } | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [noisium, setNoisium] = useState(false);
  const [publishing, setPublishing] = useState<number | null>(null);
  const [mazani, setMazani] = useState<KartaPlanu | null>(null);
  const [mazu, setMazu] = useState(false);
  const [zprava, setZprava] = useState<{ text: string; ton?: 'bad' } | null>(null);
  const [chybaFormulare, setChybaFormulare] = useState<string | null>(null);
  /** Sloupec zobrazený na telefonu (pod `sm` je vidět jen jeden, přepíná se záložkami). */
  const [sloupecTelefon, setSloupecTelefon] = useState<IdSloupce>(COLUMNS[0].id);
  const idForm = useId();

  useEffect(() => {
    if (!upravuje) return;
    fetch('/api/noisium').then(okJson).then(d => setNoisium(!!d.connected)).catch(() => { /* bez Noisium se jen nenabídne publikace */ });
  }, [upravuje]);

  const getColumnCards = (colId: string) =>
    colId === 'ideas' ? cards.filter(c => sloupecKarty(c) === 'ideas').sort((a, b) => a.position - b.position) : kartySloupce(cards, colId);

  const publishToNoisium = async (card: KartaPlanu) => {
    setPublishing(card.id);
    try {
      await fetch('/api/noisium/publish', { method: 'POST', headers: JSON_HLAVICKA, body: JSON.stringify({ cardId: card.id }) }).then(okJson);
      setZprava({ text: t('„{nazev}" je publikované do Noisium.', { nazev: card.title }) });
    } catch (e) { setZprava({ text: apiMessage(e, t('Publikování se nepodařilo.')), ton: 'bad' }); }
    setPublishing(null);
  };

  const handleAddCard = async () => {
    if (!newCard || !newCard.title.trim() || adding) return;
    setAdding(true);
    setChybaFormulare(null);
    try {
      const card = await fetch(URL_PLANOVANI, {
        method: 'POST', headers: JSON_HLAVICKA,
        body: JSON.stringify({ ...newCard, title: newCard.title.trim(), description: newCard.description.trim() || null, position: getColumnCards(newCard.column).length }),
      }).then(okJson);
      data.set(prev => [...(prev ?? []), ...vyberKarty([card])]);
      data.reload();
      setNewCard(null);
    } catch (e) {
      // Dřív jen console.error — karta nevznikla a nikdo se to nedozvěděl.
      setChybaFormulare(apiMessage(e, t('Kartu se nepodařilo přidat.')));
    } finally {
      setAdding(false);
    }
  };

  const moveCard = async (card: KartaPlanu, targetCol: string) => {
    if (sloupecKarty(card) === targetCol || !upravuje) return;
    const newPosition = getColumnCards(targetCol).length;
    data.set(prev => (prev ?? []).map(c => (c.id === card.id ? { ...c, column: targetCol, position: newPosition } : c)));
    try {
      await fetch(`${URL_PLANOVANI}/${card.id}`, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ column: targetCol, position: newPosition }) }).then(okJson);
      data.reload();
    } catch (e) {
      data.set(prev => (prev ?? []).map(c => (c.id === card.id ? card : c)));
      setZprava({ text: apiMessage(e, t('Kartu se nepodařilo přesunout.')), ton: 'bad' });
    }
  };

  const saveEdit = async () => {
    if (!editCard || !editCard.title.trim()) return;
    setSavingEdit(true);
    try {
      await fetch(`${URL_PLANOVANI}/${editCard.id}`, {
        method: 'PATCH', headers: JSON_HLAVICKA,
        body: JSON.stringify({ title: editCard.title.trim(), description: editCard.description.trim() }),
      }).then(okJson);
      data.set(prev => (prev ?? []).map(c => (c.id === editCard.id ? { ...c, title: editCard.title.trim(), description: editCard.description.trim() || null } : c)));
      data.reload();
      setEditCard(null);
    } catch (e) { setZprava({ text: apiMessage(e, t('Kartu se nepodařilo uložit.')), ton: 'bad' }); }
    setSavingEdit(false);
  };

  // Mazání přes okno (dřív confirm()).
  const deleteCard = async () => {
    const card = mazani;
    if (!card) return;
    setMazu(true);
    try {
      await fetch(`${URL_PLANOVANI}/${card.id}`, { method: 'DELETE' }).then(okJson);
      data.set(prev => (prev ?? []).filter(c => c.id !== card.id));
      data.reload();
      setZprava({ text: t('Karta je smazaná.') });
    } catch (e) { setZprava({ text: apiMessage(e, t('Kartu se nepodařilo smazat.')), ton: 'bad' }); }
    setMazani(null);
    setMazu(false);
  };

  const handleDrop = (colId: string) => {
    setDragOverCol(null);
    if (dragId === null) return;
    const card = cards.find(c => c.id === dragId);
    setDragId(null);
    if (card) void moveCard(card, colId);
  };

  /**
   * Kolo 7: karta → rozepsaný úkol. Název a popis karty se zapíšou jako koncept formuláře
   * Úkolů (tvar konceptUkoluZKarty = prázdný formulář TaskManageru) a Úkoly ho po přechodu
   * otevřou samy s „Vrátili jsme ti rozepsaný úkol" — termín a komu doplní člověk.
   */
  const zalozUkol = (card: KartaPlanu) => {
    if (!zapisKoncept('ukoly', konceptUkoluZKarty(card))) {
      setZprava({ text: t('Úkol z karty se nepodařilo připravit — prohlížeč nedovolil uložit rozepsaný úkol.'), ton: 'bad' });
      return;
    }
    nav.onNavigate('tasks', 'pohled:list');
  };

  const polozkyMenu = (card: KartaPlanu): MenuItem[] => [
    ...(zakladaUkoly ? [{ label: t('Založit úkol z karty'), icon: 'check', onClick: () => zalozUkol(card) }] : []),
    ...(upravuje ? [
      ...COLUMNS.filter(c => c.id !== sloupecKarty(card)).map(c => ({ label: t('Přesunout do: {sloupec}', { sloupec: nazvySloupcu[c.id] }), icon: 'swap', onClick: () => void moveCard(card, c.id) })),
      ...(noisium ? [{ label: publishing === card.id ? t('Publikuji…') : t('Publikovat do Noisium'), icon: 'upload', onClick: () => void publishToNoisium(card) }] : []),
      { label: t('Upravit kartu'), icon: 'pencil', onClick: () => setEditCard({ id: card.id, title: card.title, description: card.description ?? '' }) },
      { label: t('Smazat kartu…'), icon: 'trash', danger: true, onClick: () => setMazani(card) },
    ] : []),
  ];

  /** Kolo 7: „před 3 dny" — jak dlouho karta leží (stariKarty v lib/ukolyPrehled). */
  const stariText = (card: KartaPlanu): string | null => {
    const s = stariKarty(card.vytvoreno);
    switch (s.druh) {
      case 'ted': return t('právě teď');
      case 'min': return t('před {n} min', { n: s.n });
      case 'h': return t('před {n} h', { n: s.n });
      case 'den': return t('před {n, plural, one {# dnem} few {# dny} other {# dny}}', { n: s.n });
      case 'tyden': return t('před {n, plural, one {# týdnem} few {# týdny} other {# týdny}}', { n: s.n });
      case 'mesic': return t('před {n, plural, one {# měsícem} few {# měsíci} other {# měsíci}}', { n: s.n });
      case 'rok': return t('před {n, plural, one {# rokem} few {# lety} other {# lety}}', { n: s.n });
      case 'nevim': return null;
    }
  };
  /** Patka karty: kdo ji založil a jak dlouho leží (Trello). Celé jméno a přesné datum v `title`. */
  const patka = (card: KartaPlanu) => {
    const kdy = stariText(card);
    if (!card.autor && !kdy) return null;
    const datum = parseDbTime(card.vytvoreno);
    const presne = [card.autor, datum ? fmtDatum(datum, { jazyk, styl: 'dlouze' }) : null].filter(Boolean).join(' · ');
    return (
      <p className="t-meta mt-2.5 flex items-center gap-1.5 min-w-0" title={presne || undefined}>
        {card.autor && <Avatar emoji={card.autorAvatar} name={card.autor} size="xs" ring={false} />}
        <span className="truncate">{[card.autor ? krestniJmeno(card.autor) : null, kdy].filter(Boolean).join(' · ')}</span>
      </p>
    );
  };

  const otevriNovou = (column: IdSloupce = COLUMNS[0].id) => {
    setChybaFormulare(null);
    setNewCard({ column, title: '', description: '' });
    // Na telefonu je vidět jen jeden sloupec — formulář nové karty musí být v tom zobrazeném.
    setSloupecTelefon(column);
  };

  const nastroj = data.error && !data.data ? (
    <Card><ErrorState title={t('Plánování se nenačetlo')} onRetry={data.reload} detail={data.error} /></Card>
  ) : data.loading ? (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-busy>
      {COLUMNS.map(c => <div key={c.id} className="well p-3 space-y-2"><Skeleton className="h-5 w-24" /><Skeleton className="h-16" /></div>)}
    </div>
  ) : (
    <div className="space-y-4">
      {cards.length === 0 && !newCard && (
        /* Prázdná tabule sama o sobě neřekne, k čemu je. Než čtyři prázdné
           sloupce ve výšce obrazovky, radši jedna věta a první karta. */
        <Card>
          <EmptyState illustration="postupy" title={t('Tabule je zatím prázdná')}
            hint={t('Sem patří všechno, co chcete v podniku posunout — nová položka do nabídky, oprava kávovaru, nápad od někoho z týmu. Karta putuje zleva doprava, jak se na ní pracuje.')}
            action={upravuje ? <Button variant="secondary" icon="plus" onClick={() => otevriNovou()}>{t('Přidat první kartu')}</Button> : undefined} />
        </Card>
      )}
      {/* Na telefonu záložky sloupců s počty a pod nimi jeden sloupec svisle; od sm mřížka všech čtyř. */}
      {(cards.length > 0 || newCard) && (
        <div className="sm:hidden">
          <Segmented size="sm" ariaLabel={t('Sloupec tabule')} value={sloupecTelefon} onChange={setSloupecTelefon}
            options={COLUMNS.map(c => ({ id: c.id, label: nazvySloupcu[c.id], count: getColumnCards(c.id).length }))} />
        </div>
      )}
      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4 ${cards.length === 0 && !newCard ? 'hidden' : ''}`}>
        {COLUMNS.map(col => {
          const karty = getColumnCards(col.id);
          return (
            <section
              key={col.id}
              aria-labelledby={`${idForm}-${col.id}`}
              onDragOver={upravuje ? (e => { e.preventDefault(); setDragOverCol(col.id); }) : undefined}
              onDragLeave={upravuje ? (() => setDragOverCol(c => (c === col.id ? null : c))) : undefined}
              onDrop={upravuje ? (() => handleDrop(col.id)) : undefined}
              className={`well min-w-0 p-3 flex flex-col gap-3 transition-shadow ${col.id === sloupecTelefon ? '' : 'max-sm:hidden'} ${dragOverCol === col.id ? 'ring-2 ring-black/15' : ''}`}
            >
              {/* Na telefonu název i počet nesou záložky nad sloupcem — nadpis zůstává jen pro odečítač. */}
              <div className="flex items-center justify-between gap-2 px-1 max-sm:sr-only">
                <h3 id={`${idForm}-${col.id}`} className="t-card flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${col.dot}`} aria-hidden />
                  <span className="truncate">{nazvySloupcu[col.id]}</span>
                </h3>
                <Chip tone="muted" size="sm">{karty.length.toLocaleString(loc)}<span className="sr-only"> {t('{n, plural, one {karta} few {karty} other {karet}}', { n: karty.length })}</span></Chip>
              </div>

              <ul className="space-y-2 min-h-[3rem]">
                {karty.map(card => (
                  <li
                    key={card.id}
                    draggable={upravuje}
                    onDragStart={upravuje ? () => setDragId(card.id) : undefined}
                    onDragEnd={() => { setDragId(null); setDragOverCol(null); }}
                    className={`card p-4 transition-shadow hover:shadow-[shadow:var(--shadow-float)] ${upravuje ? 'cursor-grab active:cursor-grabbing' : ''} ${dragId === card.id ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      {upravuje ? (
                        // Klepnutí na kartu ji otevře k úpravě (jako v Trellu); „···" zůstává pro přesun a smazání.
                        <button type="button" aria-haspopup="dialog" title={t('Upravit kartu')}
                          onClick={() => setEditCard({ id: card.id, title: card.title, description: card.description ?? '' })}
                          className="min-w-0 flex-1 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542]">
                          <span className="block font-medium text-[15px] leading-snug text-[#16181A] break-words">{card.title}</span>
                          {card.description && <span className="block text-[13px] text-black/55 mt-1 break-words text-pretty">{card.description}</span>}
                        </button>
                      ) : (
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-[15px] leading-snug text-[#16181A] break-words">{card.title}</p>
                          {card.description && <p className="text-[13px] text-black/55 mt-1 break-words text-pretty">{card.description}</p>}
                        </div>
                      )}
                      {(upravuje || zakladaUkoly) && <Menu size="sm" label={t('Možnosti karty {nazev}', { nazev: card.title })} items={polozkyMenu(card)} className="-mr-1.5 -mt-1" />}
                    </div>
                    {patka(card)}
                  </li>
                ))}
                {karty.length === 0 && newCard?.column !== col.id && <li className="t-meta text-center py-3">{t('Žádná karta')}</li>}
              </ul>

              {upravuje && (newCard?.column === col.id ? (
                <form onSubmit={e => { e.preventDefault(); void handleAddCard(); }} className="card p-3 space-y-2" aria-label={t('Nová karta do sloupce {sloupec}', { sloupec: nazvySloupcu[col.id] })}>
                  <Input autoFocus value={newCard.title} aria-label={t('Název karty')} placeholder={t('Název karty')} maxLength={200}
                    onChange={e => setNewCard(prev => (prev ? { ...prev, title: e.target.value } : null))} />
                  <Textarea value={newCard.description} aria-label={t('Popis karty')} placeholder={t('Popis (nepovinný)')} rows={2} maxLength={2000}
                    onChange={e => setNewCard(prev => (prev ? { ...prev, description: e.target.value } : null))} />
                  {chybaFormulare && <p className="note note-danger text-sm" role="alert">{chybaFormulare}</p>}
                  <div className="flex gap-2">
                    <Button type="submit" variant="primary" size="sm" loading={adding} disabled={!newCard.title.trim()}>{t('Přidat')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setNewCard(null)}>{t('Zrušit')}</Button>
                  </div>
                </form>
              ) : (
                <button type="button" onClick={() => otevriNovou(col.id)}
                  className="tap-target-sm w-full py-2 rounded-2xl border border-dashed border-black/15 text-sm text-black/45 inline-flex items-center justify-center gap-1.5 hover:text-[#16181A] hover:bg-black/[0.03] transition-colors">
                  <Icon name="plus" size={15} />  {t('Přidat kartu')}
                </button>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );

  const vPraci = cards.filter(c => c.column === 'in_progress' || c.column === 'review').length;
  return (
    <>
      <PlochaWidgetu
        stranka="vedeni.planovani"
        hlavicka={{
          title: t('Plánování'),
          subtitle: data.data && cards.length > 0
            ? t('{n, plural, one {# karta} few {# karty} other {# karet}} na tabuli, v práci {praci}.', { n: cards.length, praci: vPraci.toLocaleString(loc) })
            : t('Nápady a úkoly, které čekají na svůj čas.'),
          hintId: 'planningboard',
          primary: upravuje ? <Button variant="accent" icon="plus" onClick={() => otevriNovou()}>{t('Nová karta')}</Button> : undefined,
        }}
        nastroj={nastroj}
      />
      {editCard && (
        <Modal open onClose={() => setEditCard(null)} title={t('Upravit kartu')} size="sm"
          footer={<>
            <Button variant="secondary" onClick={() => setEditCard(null)}>{t('Zrušit')}</Button>
            <Button variant="primary" icon="check" loading={savingEdit} disabled={!editCard.title.trim()} onClick={saveEdit}>{t('Uložit')}</Button>
          </>}>
          <div className="space-y-3">
            <Field id={`${idForm}-e-nazev`} label={t('Název')}>
              <Input id={`${idForm}-e-nazev`} value={editCard.title} onChange={e => setEditCard(c => c && { ...c, title: e.target.value })} maxLength={200} />
            </Field>
            <Field id={`${idForm}-e-popis`} label={t('Popis')} hint={t('Nepovinné.')}>
              <Textarea id={`${idForm}-e-popis`} value={editCard.description} onChange={e => setEditCard(c => c && { ...c, description: e.target.value })} rows={3} maxLength={2000} />
            </Field>
          </div>
        </Modal>
      )}
      {mazani && (
        <Modal open onClose={() => setMazani(null)} title={t('Smazat kartu?')} size="sm"
          footer={<>
            <Button variant="secondary" onClick={() => setMazani(null)}>{t('Zrušit')}</Button>
            <Button variant="danger-solid" loading={mazu} onClick={deleteCard}>{t('Smazat')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{t('„{nazev}" zmizí z tabule. Vrátit to nepůjde.', { nazev: mazani.title })}</p>
        </Modal>
      )}
      <Toast message={zprava?.text ?? null} tone={zprava?.ton} onClose={() => setZprava(null)} />
    </>
  );
}
