'use client';

// Jedno chování pro všechny dialogy v aplikaci.
//
// Modály v appce jsou ručně skládané `fixed inset-0` vrstvy — každá si dřív
// řešila (nebo neřešila) klávesnici po svém. Výsledek: většina oken nešla
// zavřít Escapem, odečítač obrazovky je nehlásil jako dialog, fokus zůstal
// vzadu na stránce a Tab utekl pod překryv. Tenhle hook to sjednocuje:
//
//   • Escape zavře,
//   • fokus skočí dovnitř a po zavření se vrátí na tlačítko, které okno otevřelo,
//   • Tab cykluje uvnitř okna (nevypadne do stránky pod ním),
//   • pozadí se nescrolluje, dokud je okno otevřené,
//   • rozepsaný text nezmizí, když se okno zavře uklepnutím.
//
// To poslední přibylo později. Escape a klik vedle okna zavíraly okamžitě
// a bez ptaní — u okna, kde je napsaná půlstránková směrnice nebo oznámení
// pro celý tým, to znamenalo hodinu práce pryč jedním omylem. Hook si proto
// hlídá, jestli uživatel do okna něco napsal (jen skutečné, uživatelem
// vyvolané události — překreslení Reactu se nepočítá), a když ano, uklepnutí
// okno nezavře: místo toho se zeptá. Pole, kde na obsahu nezáleží — hledání,
// filtr — se označí atributem `data-transient` a do počítání nespadnou.
//
// Použití: hook se volá vždy (i když je okno zavřené — pravidla hooků), stav
// otevření mu předáš prvním parametrem. Vrácené `ref` + `dialogProps` dej na
// panel okna, ne na ztmavené pozadí:
//
//   const m = useModal(addOpen, () => setAddOpen(false), 'Nová položka');
//   {addOpen && (
//     <div className="fixed inset-0 ..." onClick={close}>
//       <div ref={m.ref} {...m.dialogProps} className="modal-sheet …">…</div>
//     </div>
//   )}

import { useCallback, useEffect, useRef, useState } from 'react';
import { jePsanePole, jeRozepsano, reakceNaZavreni, type ZpusobZavreni } from './modalClose';
import { adresaOkna } from './navigace';

// Zámek posuvu se počítá, ne přepisuje. Když se okna překrývají (z okna se
// otevře další) a zavřou se v jiném pořadí, než se otevřela, prosté
// „zapamatuj si předchozí hodnotu a vrať ji" nechá stránku navždy zamčenou:
// vnitřní okno si zapamatuje „hidden" po tom vnějším a při zavření ho vrátí.
// Proto se drží počet otevřených oken a odemyká se až u posledního.
let lockCount = 0;
let lockedFrom = '';

// Zásobník otevřených oken. Když je otevřených víc (hledání Ctrl K nad detailem
// úkolu, otázka „zahodit?" nad formulářem), Escape patří jen tomu vrchnímu —
// každé okno má vlastní posluchač na dokumentu a `stopPropagation` ostatním
// posluchačům na stejném prvku nezabrání. Dřív jeden Escape zavřel všechno.
interface OtevreneOkno {
  id: symbol;
  /** Záznam v historii prohlížeče (`history.state.okno`); null = ještě nezapsaný. */
  token: string | null;
  /** Uživatel šel Zpět a záznam okna je pryč: zavřít, nebo se zeptat. */
  zpet: () => void;
}
const otevrenaOkna: OtevreneOkno[] = [];
const jeVrchni = (id: symbol) => otevrenaOkna[otevrenaOkna.length - 1]?.id === id;

// Historie prohlížeče (kolo 8): otevřené okno přidá záznam (`&okno=1`), takže
// Zpět — gesto na telefonu, tlačítko prohlížeče — nejdřív zavře okno a teprve
// další Zpět opustí obrazovku. Dřív Zpět s otevřeným oknem zavřel celou
// aplikaci. Okno zavřené jinak (křížek, Zrušit, uklepnutí) svůj záznam zase
// odebere (`history.back()`), ať po něm v historii nezůstane prázdný krok;
// ten popstate je náš a nesmí se počítat jako další Zpět.
let citacOken = 0;
/** Časy `history.back()`, které jsme vyvolali sami a jejichž popstate teprve přijde. */
const vlastniZpet: number[] = [];
/** Co udělat, až náš popstate dorazí (otevření dalšího okna v témže tiku). */
const poVlastnimZpet: (() => void)[] = [];
let posluchacHistorie = false;

function zapisOknoDoHistorie(token: string): void {
  try {
    window.history.pushState({ okno: token }, '', `${window.location.pathname}${adresaOkna(window.location.search, true)}`);
  } catch { /* prohlížeč bez historie */ }
}

function zajistiPosluchaceHistorie(): void {
  if (posluchacHistorie || typeof window === 'undefined') return;
  posluchacHistorie = true;
  window.addEventListener('popstate', () => {
    // Starší než 2 s: back() bez popstate (nemělo by nastat) nesmí spolknout skutečné Zpět.
    while (vlastniZpet.length && Date.now() - vlastniZpet[0] > 2000) vlastniZpet.shift();
    if (vlastniZpet.length) {
      vlastniZpet.shift();
      poVlastnimZpet.splice(0).forEach(fn => fn());
      return;
    }
    const vrchni = otevrenaOkna[otevrenaOkna.length - 1];
    if (!vrchni?.token) return;
    // Vpřed na náš vlastní záznam (okno je pořád otevřené) — nic.
    if (window.history.state?.okno === vrchni.token) return;
    vrchni.zpet();
  });
}

function lockScroll() {
  if (lockCount === 0) lockedFrom = document.body.style.overflow;
  lockCount++;
  document.body.style.overflow = 'hidden';
}

function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) document.body.style.overflow = lockedFrom;
}

const FOCUSABLE = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Pojistka proti zahození rozepsaného textu. `asking` je true ve chvíli, kdy
 * uživatel zkusil okno zavřít uklepnutím a něco v něm má rozepsané — okno
 * zůstává otevřené a čeká na rozhodnutí. Vykresluje se komponentou
 * <DiscardGuard> z components/ui.
 */
export interface ModalGuard {
  asking: boolean;
  /** Zahodit rozepsané a zavřít. */
  discard: () => void;
  /** Zpět k úpravám — okno zůstane. */
  keep: () => void;
  /** Pro křížek a „Zrušit": zavře, a když je rozepsáno, nejdřív se zeptá. */
  attemptClose: () => void;
  /** Je v okně něco rozepsaného? */
  dirty: boolean;
}

export function useModal<T extends HTMLElement = HTMLDivElement>(open: boolean, onClose: () => void, label?: string) {
  const ref = useRef<T>(null);
  // Zavírací funkce se u většiny volajících tvoří znovu při každém překreslení.
  // Držíme ji v refu, ať se efekt nepřipojuje a neodpojuje pořád dokola.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Kam vrátit fokus po zavření.
  //
  // Dřív se to četlo až v efektu, tedy po vykreslení okna — jenže pole
  // s `autoFocus` si fokus vezme dřív, takže se jako „místo návratu"
  // uložilo pole uvnitř okna. To se zavřením zmizelo a fokus spadl na
  // <body>: po Escape začínal další Tab od začátku stránky. Čte se proto
  // už během vykreslování, kdy okno v DOM ještě není a fokus drží pořád
  // to tlačítko, kterým se okno otevřelo.
  //
  // Pozor na pořadí: zavření okna nejdřív překreslí komponentu a teprve
  // potom uklidí efekt. Kdyby se uložený prvek mazal při vykreslování,
  // byl by v okamžiku úklidu už pryč — proto se maže až v úklidu samotném,
  // hned po tom, co se fokus vrátí.
  const restoreRef = useRef<HTMLElement | null>(null);
  if (typeof document !== 'undefined' && open && restoreRef.current === null) {
    restoreRef.current = document.activeElement as HTMLElement | null;
  }

  // Rozepsáno? Držíme to v refu i ve stavu: ref potřebují posluchače událostí,
  // stav potřebuje vykreslení otázky.
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [asking, setAsking] = useState(false);
  const askingRef = useRef(false);
  askingRef.current = asking;

  // Pole, do kterých se v okně psalo (plní posluchač níž). Rozepsáno se počítá
  // z jejich ŽIVÝCH hodnot a jen z těch, která v okně pořád jsou.
  const psanoRef = useRef<(HTMLInputElement | HTMLTextAreaElement)[]>([]);
  const prepocitat = useCallback(() => {
    const neco = jeRozepsano(psanoRef.current.filter(el => el.isConnected).map(el => el.value));
    if (neco === dirtyRef.current) return;
    dirtyRef.current = neco;
    setDirty(neco);
  }, []);

  const keep = useCallback(() => setAsking(false), []);
  const zavrit = useCallback(() => { setAsking(false); dirtyRef.current = false; setDirty(false); closeRef.current(); }, []);
  const rozhodnout = useCallback((zpusob: ZpusobZavreni) => {
    // Před rozhodnutím se rozepsáno přepočítá z toho, co v okně opravdu je.
    // Hodnotu, kterou pole vyprázdní React po odeslání (poznámka, zpráva), ani
    // inline editor, který po uložení z okna zmizel, prohlížeč jako `input`
    // nehlásí — bez přepočtu by se okno ptalo na text, který už nikde není.
    prepocitat();
    const r = reakceNaZavreni({ rozepsano: dirtyRef.current, ptameSe: askingRef.current, zpusob });
    if (r === 'zavrit') zavrit();
    else if (r === 'zeptat se') setAsking(true);
    else setAsking(false);
  }, [zavrit, prepocitat]);
  const rozhodnoutRef = useRef(rozhodnout);
  rozhodnoutRef.current = rozhodnout;
  const discard = useCallback(() => rozhodnout('zahodit'), [rozhodnout]);
  const attemptClose = useCallback(() => rozhodnout('zavrit'), [rozhodnout]);
  // Záznam tohoto okna v historii; sdílí se mezi efektem otevření a obsluhou Zpět.
  const oknoRef = useRef<OtevreneOkno | null>(null);

  // Nové otevření začíná s čistým stolem.
  useEffect(() => {
    if (open) return;
    dirtyRef.current = false;
    psanoRef.current = [];
    setDirty(false);
    setAsking(false);
  }, [open]);

  // Co uživatel do okna napsal.
  //
  // Počítá se jen psaný text — textarea a textová pole. Zaškrtávátko,
  // přepínač ani výběr z nabídky se sem nepočítají: v aplikaci se takové
  // ovládání skoro vždy ukládá hned při kliknutí, takže by okno hlásilo
  // rozepsáno tam, kde je dávno uloženo. A kdyby se ukládalo až tlačítkem,
  // jedno kliknutí zpátky není ztráta, kvůli které stojí za to se ptát.
  //
  // Jen `isTrusted` události: hodnotu, kterou do pole vloží React při
  // překreslení, prohlížeč jako `input` nehlásí, ale skript ji vyvolat umí
  // a to už rozepsaný text není.
  //
  // Sleduje se množina polí, do kterých se psalo, a rozepsáno je, jen když
  // v některém něco zůstalo. Kdo text napíše a zase smaže, nic neztrácí.
  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    if (!panel) return;
    const psano = psanoRef.current;
    let cekani: ReturnType<typeof setTimeout> | null = null;
    // Přepočítat se musí až po Reactu, ne během události. Posluchač běží
    // v zachytávací fázi, tedy dřív, než se ke změně dostane komponenta —
    // a `value` v tu chvíli drží, co do pole napsal prohlížeč, ne to, co
    // React přijme. U pole, které si vstup upraví nebo odmítne, by se tak
    // dalo „rozepsáno" zhasnout nad textem, který na obrazovce pořád je.
    const zmena = (e: Event) => {
      if (!e.isTrusted) return;
      const t = e.target as HTMLElement | null;
      if (!t || !panel.contains(t)) return;
      if (t.closest('[data-transient]')) return;
      if (!jePsanePole(t.tagName, (t as HTMLInputElement).type || '')) return;
      const pole = t as HTMLInputElement | HTMLTextAreaElement;
      if (!psano.includes(pole)) psano.push(pole);
      if (cekani) clearTimeout(cekani);
      cekani = setTimeout(prepocitat, 0);
    };
    panel.addEventListener('input', zmena, true);
    return () => {
      if (cekani) clearTimeout(cekani);
      panel.removeEventListener('input', zmena, true);
    };
  }, [open, prepocitat]);

  // Klik vedle okna. Volající má na překryvu `onClick={onClose}`; kdyby se
  // tady jen nastavil stav, okno by se stejně zavřelo. Proto se událost
  // zachytí na dokumentu (dřív, než ji uvidí React) a zastaví se.
  useEffect(() => {
    if (!open) return;
    const stop = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      const panel = ref.current;
      const overlay = panel?.parentElement;
      if (!panel || !overlay) return;
      const t = e.target as Node | null;
      if (!t || !overlay.contains(t) || panel.contains(t)) return;
      e.preventDefault();
      e.stopPropagation();
      rozhodnoutRef.current('uklepnuti');
    };
    document.addEventListener('click', stop, true);
    return () => document.removeEventListener('click', stop, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = ref.current;
    const id = Symbol('okno');
    const okno: OtevreneOkno = {
      id, token: null,
      zpet: () => {
        // Zpět je uklepnutí: nedotčené okno se zavře, rozepsané se zeptá — a svůj záznam
        // si vrátí, ať adresa i další Zpět sedí s tím, co je na obrazovce.
        prepocitat();
        const r = reakceNaZavreni({ rozepsano: dirtyRef.current, ptameSe: askingRef.current, zpusob: 'uklepnuti' });
        if (r === 'zavrit') { okno.token = null; zavrit(); return; }
        if (okno.token) zapisOknoDoHistorie(okno.token);
        setAsking(r === 'zeptat se');
      },
    };
    oknoRef.current = okno;
    otevrenaOkna.push(okno);
    lockScroll();
    zajistiPosluchaceHistorie();
    const token = `o${++citacOken}`;
    const zapisZaznam = () => { if (oknoRef.current === okno) { okno.token = token; zapisOknoDoHistorie(token); } };
    // Okno otevřené v témže tiku, kdy se jiné zavřelo: jeho back() ještě neproběhl, zápis počká.
    if (vlastniZpet.length) poVlastnimZpet.push(zapisZaznam); else zapisZaznam();

    const visible = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      .filter(el => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement);

    // Fokus dovnitř až po vykreslení obsahu.
    const t = setTimeout(() => {
      if (!panel) return;
      const first = visible()[0];
      (first ?? panel).focus({ preventScroll: true });
    }, 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!jeVrchni(id)) return;
        e.preventDefault();
        e.stopPropagation();
        // Escape nad otevřenou otázkou znamená „zpět k úpravám" — druhý
        // Escape nesmí zahodit to, před čím se okno právě ptá.
        rozhodnoutRef.current('uklepnuti');
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = visible();
      if (!items.length) { e.preventDefault(); panel.focus({ preventScroll: true }); return; }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      const outside = !active || !panel.contains(active);
      if (e.shiftKey && (outside || active === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (outside || active === last)) { e.preventDefault(); first.focus(); }
    };

    // Zachytáváme ve fázi capture, ať Escape zabere i když je fokus v poli,
    // které si klávesu jinak nechá pro sebe.
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      const i = otevrenaOkna.indexOf(okno);
      if (i >= 0) otevrenaOkna.splice(i, 1);
      oknoRef.current = null;
      // Zavřeno křížkem, Zrušit nebo uklepnutím: záznam okna je ještě na vrchu historie,
      // tak se odebere. Po Zpět už tam není (token je null); po přechodu jinam ho přepsal
      // záznam pohledu (history.state.okno nesedí) a nic se nevrací.
      if (okno.token && typeof window !== 'undefined' && window.history.state?.okno === okno.token) {
        vlastniZpet.push(Date.now());
        try { window.history.back(); } catch { vlastniZpet.pop(); }
      }
      okno.token = null;
      unlockScroll();
      const back = restoreRef.current;
      restoreRef.current = null;
      // Prvek, který se mezitím odmontoval (řádek smazaný v okně), fokus
      // nepřijme — pak je lepší nedělat nic než skočit na <body>.
      if (back && back.isConnected) back.focus?.({ preventScroll: true });
    };
  }, [open, prepocitat, zavrit]);

  const guard: ModalGuard = { asking, discard, keep, attemptClose, dirty };

  return {
    ref,
    guard,
    dialogProps: {
      role: 'dialog' as const,
      'aria-modal': true,
      ...(label ? { 'aria-label': label } : {}),
      tabIndex: -1,
    },
  };
}
