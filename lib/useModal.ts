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

// Zámek posuvu se počítá, ne přepisuje. Když se okna překrývají (z okna se
// otevře další) a zavřou se v jiném pořadí, než se otevřela, prosté
// „zapamatuj si předchozí hodnotu a vrať ji" nechá stránku navždy zamčenou:
// vnitřní okno si zapamatuje „hidden" po tom vnějším a při zavření ho vrátí.
// Proto se drží počet otevřených oken a odemyká se až u posledního.
let lockCount = 0;
let lockedFrom = '';

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

  const keep = useCallback(() => setAsking(false), []);
  const zavrit = useCallback(() => { setAsking(false); dirtyRef.current = false; setDirty(false); closeRef.current(); }, []);
  const rozhodnout = useCallback((zpusob: ZpusobZavreni) => {
    const r = reakceNaZavreni({ rozepsano: dirtyRef.current, ptameSe: askingRef.current, zpusob });
    if (r === 'zavrit') zavrit();
    else if (r === 'zeptat se') setAsking(true);
    else setAsking(false);
  }, [zavrit]);
  const rozhodnoutRef = useRef(rozhodnout);
  rozhodnoutRef.current = rozhodnout;
  const discard = useCallback(() => rozhodnout('zahodit'), [rozhodnout]);
  const attemptClose = useCallback(() => rozhodnout('zavrit'), [rozhodnout]);

  // Nové otevření začíná s čistým stolem.
  useEffect(() => {
    if (open) return;
    dirtyRef.current = false;
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
    const psano: (HTMLInputElement | HTMLTextAreaElement)[] = [];
    let cekani: ReturnType<typeof setTimeout> | null = null;
    // Přepočítat se musí až po Reactu, ne během události. Posluchač běží
    // v zachytávací fázi, tedy dřív, než se ke změně dostane komponenta —
    // a `value` v tu chvíli drží, co do pole napsal prohlížeč, ne to, co
    // React přijme. U pole, které si vstup upraví nebo odmítne, by se tak
    // dalo „rozepsáno" zhasnout nad textem, který na obrazovce pořád je.
    const prepocitat = () => {
      const neco = jeRozepsano(psano.filter(el => el.isConnected).map(el => el.value));
      if (neco === dirtyRef.current) return;
      dirtyRef.current = neco;
      setDirty(neco);
    };
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
  }, [open]);

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
    lockScroll();

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
      unlockScroll();
      const back = restoreRef.current;
      restoreRef.current = null;
      // Prvek, který se mezitím odmontoval (řádek smazaný v okně), fokus
      // nepřijme — pak je lepší nedělat nic než skočit na <body>.
      if (back && back.isConnected) back.focus?.({ preventScroll: true });
    };
  }, [open]);

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
