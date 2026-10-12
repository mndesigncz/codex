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
// profil člověka s tym.profil. Část, na kterou role nemá, se v přepínači nenabízí.

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../Icons';
import {
  Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Modal, Segmented, Skeleton, Switch, Textarea, Toast,
} from '../ui';
import { DEFAULT_POINTS, normalizeLevels, normalizePoints, type RewardLevel, type PointsConfig } from '@/lib/rewardLevels';
import { KLIC_KALENDAR, UDALOST_KALENDAR, urlZebricku, vyberKatalog, vyberPoradi, type ObdobiZebricku, type Odmena, type Poradi } from '@/lib/odmenyPrehled';
import { apiMessage, okJson } from '@/lib/api';
import ShiftReviewModal from './ShiftReviewModal';
import ShiftReviewCalendar from './ShiftReviewCalendar';
import EmployeeProfile from './EmployeeProfile';
import { ProGate } from '../Pro';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from '../widgety/useDataWidgetu';
import { useSmi } from '../widgety/NavigaceKontext';
import { NaStranceOdmen, PochvalaOkno } from '../widgety/oblasti/odmeny';
import { pragueToday } from '@/lib/pragueTime';
import { useT } from '@/lib/i18n/client';
import { useLocale } from './jazyk';
import { useMoney, useSymbol } from '../CurrencyProvider';

const URL_ODMENY = '/api/rewards';
const URL_KATALOG = '/api/rewards/catalog';
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

type Cast = 'board' | 'calendar' | 'settings';

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
  const casti = [
    ...(vidiZebricek ? [{ id: 'board' as const, label: t('Žebříček') }] : []),
    ...(vidiKalendar ? [{ id: 'calendar' as const, label: t('Kalendář') }] : []),
    ...(nastavuje || spravujeKatalog ? [{ id: 'settings' as const, label: t('Nastavení') }] : []),
  ];
  const [volba, setVolba] = useState<Cast>('board');
  const cast: Cast | null = casti.some(c => c.id === volba) ? volba : casti[0]?.id ?? null;
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
  ) : cast === 'settings' ? (
    <div className="space-y-4">
      {nastavuje && <NastaveniBodu onUlozeno={obnov} />}
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
          aside: casti.length > 1 && cast
            ? <Segmented size="sm" ariaLabel={t('Část stránky')} value={cast} onChange={setVolba} options={casti} />
            : undefined,
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
                <span className="t-label w-6 text-right tabular-nums">{i + 1}.</span>
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
  const data = useDataWidgetu(URL_ODMENY, raw => ({ levels: normalizeLevels(raw?.levels), points: normalizePoints(raw?.points) }));
  if (data.error) return <Card><ErrorState compact title={t('Nastavení se nenačetlo')} onRetry={data.reload} detail={data.error} /></Card>;
  if (!data.data) return <Card aria-busy><Skeleton className="h-6 w-40" /><Skeleton className="mt-4 h-40" /></Card>;
  return <FormularBodu levels={data.data.levels} points={data.data.points} onUlozeno={onUlozeno} />;
}

function FormularBodu({ levels: vychoziUrovne, points: vychoziBody, onUlozeno }: {
  levels: RewardLevel[]; points: PointsConfig | null; onUlozeno: () => void;
}) {
  const t = useT('sprava');
  const [urovne, setUrovne] = useState<RewardLevel[]>(vychoziUrovne);
  const [body, setBody] = useState<PointsConfig>(vychoziBody ?? DEFAULT_POINTS);
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const zmenUroven = (i: number, patch: Partial<RewardLevel>) => setUrovne(ls => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const pridatUroven = () => setUrovne(ls => [...ls, { name: 'Nová úroveň' /* i18n-ok (obsah podniku, ukládá se na server) */, minPoints: (ls[ls.length - 1]?.minPoints ?? 0) + 300, perks: '' }]);
  const odebratUroven = (i: number) => setUrovne(ls => ls.filter((_, idx) => idx !== i));

  const ulozit = async () => {
    setUkladam(true);
    setChyba(null);
    try {
      await fetch('/api/teams', {
        method: 'PATCH', headers: JSON_HLAVICKA,
        body: JSON.stringify({
          levelsConfig: urovne.map(l => ({ name: l.name.trim() || 'Úroveň' /* i18n-ok (obsah podniku) */, minPoints: Math.max(0, Math.round(l.minPoints) || 0), perks: l.perks.trim() })),
          pointsConfig: body,
        }),
      }).then(okJson);
      setToast(t('Nastavení odměn uloženo.'));
      onUlozeno();
    } catch (e) {
      setChyba(apiMessage(e, t('Nastavení se nepodařilo uložit.')));
    } finally {
      setUkladam(false);
    }
  };

  // Odměny zůstávají nezáporné, srážky musí přijmout i minus.
  const pole = (label: string, klic: keyof PointsConfig, hint: string, zaporne = false) => {
    const id = `body-${klic}`;
    return (
      <Field id={id} label={label} hint={hint}>
        <Input id={id} type="number" inputMode="numeric" min={zaporne ? -100 : 0} max={100} value={body[klic]}
          onChange={e => {
            const n = Number.parseInt(e.target.value, 10);
            setBody(p => ({ ...p, [klic]: Math.max(zaporne ? -100 : 0, Math.min(100, Number.isFinite(n) ? n : 0)) }));
          }}
          className={`tabular-nums ${zaporne && body[klic] < 0 ? 'text-bad-ink' : ''}`} />
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
          <Input id="nova-odmena-nazev" value={nazev} onChange={e => setNazev(e.target.value)} maxLength={120} placeholder={t('Např. Směna končí o hodinu dřív')} />
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
              // přepínač i koš by tu vracely 404, tak se neukazují.
              actions={o.zOrganizace ? undefined : (
                <>
                  <Switch checked={o.aktivni} disabled={pracuji === o.id} label={t('Nabízet: {nazev}', { nazev: o.nazev })} onChange={v => { void prepnout(o, v); }} />
                  <Button variant="ghost" size="sm" iconOnly icon="trash" aria-label={t('Smazat odměnu {nazev}', { nazev: o.nazev })} disabled={pracuji != null}
                    onClick={() => setMazani(o)} />
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
      <Toast message={toast} onClose={() => setToast(null)} />
    </Card>
  );
}
