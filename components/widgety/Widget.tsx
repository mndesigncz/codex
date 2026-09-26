'use client';

// Obal widgetu (kolo 68, spec §3.3, DP §5.1).
//
// Každý widget se kreslí v tomhle obalu a jinak ne. Obal drží všechno, co
// si dřív každý blok Přehledu psal po svém a co se proto rozjelo: titulek
// z registru (nemůže ujet od názvu v galerii), jednu podobu hlavičky
// (ikona 17 tlumeně, t-card, doplněk, odkaz dál jako ghost s chevronem),
// všechny čtyři poctivé stavy (kostra, chyba se „Zkusit znovu", prázdno,
// skrytí) a chování v režimu úprav (karta `inert`, jméno nese <li>).
//
// Co obal potřebuje vědět o instanci (id, velikost, definice, jestli je
// náhled nebo režim úprav, jestli smí nést inkoust), mu dává plocha přes
// kontext — autor widgetu to nemusí protahovat props.

import React, { createContext, useContext, useEffect } from 'react';
import { Icon } from '../Icons';
import { Button, Card, ErrorState, Menu, Skeleton, type MenuItem } from '../ui';
import type { LoadState } from '../ui/useLoad';
import type { DefiniceWidgetu, Kostra, Velikost } from '@/lib/widgety/typy';
import { kostraWidgetu } from '@/lib/widgety/rozlozeni';
import { useNavigace } from './NavigaceKontext';

export type { WidgetProps } from '@/lib/widgety/typy';

// ---------------------------------------------------------------------------
// Kontext instance
// ---------------------------------------------------------------------------

export interface KontextWidgetu {
  /** Id položky rozložení (v náhledu uměle složené, ať se neopakují id v DOM). */
  instance: string;
  velikost: Velikost;
  definice: DefiniceWidgetu | undefined;
  /** Galerie a nastavení: bez akcí, navigace a zápisů (obal náhledu je `inert`). */
  nahled: boolean;
  /** Plocha je v režimu úprav: karta `inert`, prázdný widget se ukáže. */
  upravy: boolean;
  /** Widget peněz, který na téhle ploše nese jedinou inkoustovou plochu (DP §2.10). */
  inkoust: boolean;
  /** Prázdný widget s `prazdno={null}` se v klidu nekreslí — plocha pak jeho buňku schová. */
  nahlasSkryti: (skryto: boolean) => void;
}

const MIMO_PLOCHU: KontextWidgetu = {
  instance: 'widget', velikost: 'M', definice: undefined, nahled: false, upravy: false, inkoust: false, nahlasSkryti: () => {},
};

export const KontextWidgetuCtx = createContext<KontextWidgetu>(MIMO_PLOCHU);

/**
 * Stav instance pro autora widgetu: velikost, jestli je náhled nebo režim
 * úprav a hlavně `inkoust` — widget peněz se na inkoustové ploše kreslí
 * bíle (čísla 28–40 px, poznámka `text-white/60`).
 */
export function useWidget(): KontextWidgetu {
  return useContext(KontextWidgetuCtx);
}

// ---------------------------------------------------------------------------
// Obal
// ---------------------------------------------------------------------------

/**
 * Co obal potřebuje ze stavu dat — výsledek useDataWidgetu (nebo useLoad)
 * jakéhokoli typu. Bez `set`, ať jde předat `StavDat<Polozka[]>` bez přetypování.
 */
export type StavNacteni = Pick<LoadState<unknown>, 'data' | 'error' | 'loading' | 'reload'> & { vypnuto?: boolean };

export interface ObalWidgetuProps {
  /** Jen odkaz a výjimky; jinak název z registru, ať titulek nemůže ujet od galerie. */
  titulek?: string;
  /** Ikona místo ikony z registru — jen widget Odkaz (ikona podle cíle). */
  ikona?: string;
  /** Chip sm vedle titulku (počet). */
  doplnek?: React.ReactNode;
  /** Odkaz dál vpravo v hlavičce; na pohled, kam divák nesmí, se nekreslí. */
  odkaz?: { popisek: string; pohled: string; arg?: string };
  /** Místo odkazu nabídka „···" (nikdy obojí). */
  akce?: MenuItem[];
  /** Jen S bez jiných ovládacích prvků: celá karta je proklik. */
  otevrit?: () => void;
  /** Jediný tónovaný widget na ploše: „Čeká na tebe". */
  ton?: 'wait';
  /** Stav dat (jeden nebo víc dotazů); vypnuté dotazy (url null) se nepočítají. */
  nacteni?: StavNacteni | readonly StavNacteni[];
  /** Tvar kostry při načítání; výchozí z registru (S = číslo, M a L = seznam). */
  kostra?: Kostra;
  /**
   * undefined = data jsou a kreslí se obsah; ReactNode = prázdno k ukázání
   * (věta t-meta nebo EmptyState compact); null = v klidu se widget nekreslí
   * (v úpravách ukáže „Teď tu nic není.").
   */
  prazdno?: React.ReactNode | null;
  children?: React.ReactNode;
}

/** Vypnutý dotaz (useDataWidgetu s url null) nesmí držet widget na kostře. */
const jeVypnuto = (s: StavNacteni) => s.vypnuto === true;

/** Kostra ve tvaru obsahu, uvnitř karty — titulek zůstává, protože titulek nejsou data. */
function KostraTela({ tvar, velikost }: { tvar: Kostra; velikost: Velikost }) {
  if (tvar === 'cislo') {
    return (
      <div className="space-y-2">
        <Skeleton className="h-3 w-16 rounded-full" />
        <Skeleton className="h-8 w-24 rounded-xl" />
      </div>
    );
  }
  if (tvar === 'graf') return <Skeleton className={velikost === 'L' ? 'h-40' : 'h-24'} />;
  if (tvar === 'text') {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-4/5 rounded-full" />
        <Skeleton className="h-4 w-3/5 rounded-full" />
      </div>
    );
  }
  const radku = velikost === 'L' ? 5 : velikost === 'M' ? 3 : 2;
  return (
    <div className="space-y-2">
      {Array.from({ length: radku }, (_, i) => (
        <Skeleton key={i} className={`h-10 ${i === radku - 1 ? 'w-2/3' : ''}`} />
      ))}
    </div>
  );
}

/**
 * Obal widgetu: `<Card as="section">` s jednou podobou hlavičky a čtyřmi
 * poctivými stavy (DP §5.3). Autor widgetu dodá data (`nacteni`), obsah
 * (children) a případně prázdno — o kostru, chybu a skrytí se postará obal.
 */
export function Widget({ titulek, ikona, doplnek, odkaz, akce, otevrit, ton, nacteni, kostra, prazdno, children }: ObalWidgetuProps) {
  const k = useWidget();
  const nav = useNavigace();
  const nazev = titulek ?? k.definice?.nazev ?? '';
  const S = k.velikost === 'S';
  const inkoust = k.inkoust && !S;

  const stavy = (nacteni === undefined ? [] : Array.isArray(nacteni) ? nacteni : [nacteni]) as readonly StavNacteni[];
  const aktivni = stavy.filter(s => !jeVypnuto(s));
  const chyba = aktivni.find(s => s.error)?.error ?? null;
  const nacitam = !chyba && aktivni.some(s => s.loading);
  // Prázdný widget s `prazdno={null}` („Čeká na tebe", když nic nečeká) se
  // v klidu nekreslí vůbec — plocha jeho buňku vyřadí z mřížky, ať po něm
  // nezůstane díra. V úpravách a v náhledu zůstane vidět, jinak by nešel
  // přesunout, odebrat ani vybrat v galerii.
  const prazdny = !nacitam && !chyba && prazdno === null;
  const { nahlasSkryti } = k;
  useEffect(() => { nahlasSkryti(prazdny); }, [prazdny, nahlasSkryti]);
  useEffect(() => () => nahlasSkryti(false), [nahlasSkryti]);
  if (prazdny && !k.upravy && !k.nahled) return null;

  const idTitulku = `w-${k.instance}-t`;
  const zkusitZnovu = () => aktivni.forEach(s => { if (s.error) s.reload(); });

  let obsah: React.ReactNode;
  if (nacitam) obsah = <KostraTela tvar={kostra ?? kostraWidgetu(k.definice, k.velikost)} velikost={k.velikost} />;
  else if (chyba) obsah = <ErrorState compact title="Widget se nenačetl" onRetry={zkusitZnovu} detail={chyba} className="!py-3" />;
  else if (prazdno === null) obsah = <p className="t-meta">Teď tu nic není.</p>;
  else if (prazdno !== undefined) obsah = prazdno;
  else obsah = children;

  const vidiOdkaz = !!odkaz && nav.smiPohled(odkaz.pohled);
  return (
    <Card
      as="section"
      tone={ton === 'wait' && !inkoust ? 'wait' : 'default'}
      pad={S ? 'sm' : 'md'}
      aria-labelledby={idTitulku}
      aria-busy={nacitam || undefined}
      // V režimu úprav je karta jen „dlaždice ke skládání": nic uvnitř se
      // nesmí stisknout ani dostat do Tabu, jinak by tah myší spustil tlačítko
      // pod kurzorem. Jméno widgetu pro odečítač nese <li> (spec §4.10).
      inert={k.upravy || undefined}
      className={[
        'min-w-0 h-full flex flex-col',
        S ? 'sm:p-5 min-h-[8.5rem]' : '',
        otevrit ? 'relative transition-shadow hover:shadow-[shadow:var(--shadow-float)]' : '',
        // Jediná tmavá plocha v obsahu: hlavní číslo peněz se září v rohu (DP §2.10).
        inkoust ? 'relative overflow-hidden bg-[#16181A] text-white border-transparent' : '',
      ].join(' ')}
    >
      {inkoust && (
        <span aria-hidden className="pointer-events-none absolute -top-14 -right-10 h-32 w-32 rounded-full bg-[#C8F542]/25 blur-2xl" />
      )}
      <div className="relative flex items-start justify-between gap-3">
        <h2 id={idTitulku} className={`t-card flex items-center gap-2 min-w-0 ${inkoust ? '!text-white' : ''}`}>
          <Icon name={ikona ?? k.definice?.ikona ?? 'overview'} size={17} className={`shrink-0 ${inkoust ? 'text-white/60' : 'text-black/40'}`} />
          <span className="truncate">{nazev}</span>
          {doplnek}
        </h2>
        {vidiOdkaz && (
          <Button variant="ghost" size="sm" iconAfter="chevronRight"
            className={`shrink-0 -my-1.5 -mr-2 ${inkoust ? '!text-white/70 hover:!text-white hover:!bg-white/10' : ''}`}
            onClick={() => nav.onNavigate(odkaz!.pohled, odkaz!.arg)}>
            {odkaz!.popisek}
          </Button>
        )}
        {!odkaz && akce && akce.length > 0 && (
          <Menu size="sm" label={`Další akce: ${nazev}`} items={akce} className="-my-1.5 -mr-2" />
        )}
      </div>
      <div className={`relative mt-3 flex-1 min-h-0 ${S ? 'flex flex-col justify-end' : ''}`}>{obsah}</div>
      {otevrit && (
        <button type="button" onClick={otevrit} aria-label={`Otevřít ${nazev}`}
          className="absolute inset-0 rounded-3xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface)]" />
      )}
    </Card>
  );
}

export default Widget;

// ---------------------------------------------------------------------------
// Pomocné podoby, které kreslí plocha (ne autor widgetu)
// ---------------------------------------------------------------------------

const NACITA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

/** Widget v kostře: fallback líné komponenty a buňka před načtením oprávnění (spec §3.1). */
export function KostraWidgetu() {
  const k = useWidget();
  return <Widget nacteni={NACITA} kostra={kostraWidgetu(k.definice, k.velikost)} />;
}

/**
 * Schematický widget (výchozí rozložení v Nastavení → Stránky a náhled
 * widgetu s tarifem): ikona, název a popis z registru a pár statických
 * pruhů. Neposílá žádný dotaz — správce vidí, co kde bude, a data jiných
 * lidí mu neprotečou (spec §3.8).
 */
export function SchematickyWidget() {
  const k = useWidget();
  const pruhu = k.velikost === 'S' ? 1 : k.velikost === 'M' ? 2 : 3;
  return (
    <Widget>
      <p className="t-meta line-clamp-2">{k.definice?.popis}</p>
      <div className="mt-3 space-y-2" aria-hidden>
        {Array.from({ length: pruhu }, (_, i) => (
          <div key={i} className={`h-8 rounded-xl bg-black/[0.05] ${pruhu > 1 && i === pruhu - 1 ? 'w-2/3' : ''}`} />
        ))}
      </div>
    </Widget>
  );
}

/**
 * Komponenta, kterou oblast pro hotový widget nemá. V `next dev` na nesoulad
 * upozorní přímo na ploše; v produkci se widget v klidu nekreslí (a v úpravách
 * jde aspoň odebrat). Nesoulad hlídá test AK-20.
 */
export function Chybi() {
  const k = useWidget();
  const vyvoj = process.env.NODE_ENV === 'development';
  const { nahlasSkryti } = k;
  useEffect(() => {
    if (vyvoj) return;
    nahlasSkryti(true);
    return () => nahlasSkryti(false);
  }, [vyvoj, nahlasSkryti]);
  if (vyvoj) {
    return (
      <Widget>
        <ErrorState compact title="Widget chybí" hint={`Oblast nemá komponentu pro ${k.definice?.id ?? 'tenhle widget'}.`} className="!py-3" />
      </Widget>
    );
  }
  if (!k.upravy && !k.nahled) return null;
  return <Widget prazdno={<p className="t-meta">Tenhle widget se teď nedá zobrazit.</p>} />;
}

/**
 * Pojistka kolem jednoho widgetu: pád jeho kódu (nebo nestažená část
 * aplikace) neshodí plochu. Záloha je tentýž obal s chybou a „Zkusit znovu"
 * zvedne pokus — plocha pak založí novou línou komponentu, takže se znovu
 * stáhne i část aplikace s oblastí (React.lazy si pamatuje i nepovedený import).
 */
export class PojistkaWidgetu extends React.Component<
  { resetKey: string; onZnovu: () => void; children: React.ReactNode },
  { chyba: Error | null }
> {
  state: { chyba: Error | null } = { chyba: null };

  static getDerivedStateFromError(chyba: Error) {
    return { chyba };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.chyba) this.setState({ chyba: null });
  }

  componentDidCatch(chyba: Error) {
    console.error('[Managero] widget spadl:', chyba);
  }

  render() {
    if (!this.state.chyba) return this.props.children;
    return (
      <Widget>
        <ErrorState compact title="Widget se nenačetl" onRetry={this.props.onZnovu} detail={this.state.chyba.message} className="!py-3" />
      </Widget>
    );
  }
}
