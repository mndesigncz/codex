'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';

// Jeden toast pro celou aplikaci: tmavý lístek dole uprostřed, přijede
// zdola, zmizí sám. Obrazovky mu jen podají text — dřív každá kreslila
// vlastní zelený proužek na jiném místě.
//
// Stojí nad plovoucí lištou, když nějaká je (`.toast-misto` čte
// `--lista-vyska`, kterou zapisuje PlovouciLista).

/** Fokus z klávesnice? Starší Safari `:focus-visible` v `matches` nezná a hodí chybu. */
function zKlavesnice(el: Element): boolean {
  try { return el.matches(':focus-visible'); } catch { return false; }
}

/**
 * Pomíjivé potvrzení dokončené akce („Uloženo", „Widget odebrán"); chyba
 * akce má `tone="bad"`. Chyba NAČTENÍ sem nepatří — to je `ErrorState`.
 * `action` přidá tlačítko („Vrátit"): bílé a podtržené, ne limetkové, a toast
 * pak drží 6 s místo 3,6 s, aby se na něj dalo dosáhnout. Pod ukazatelem,
 * s fokusem uvnitř a na skryté kartě prohlížeče se odpočet zastaví.
 *
 * Za nový toast (s plnou dobou) se počítá nový text, nebo nové `id`. Kdo
 * může ukázat stejný text dvakrát po sobě („Widget odebrán" u dvou widgetů),
 * dá každému zobrazení nové `id` (počítadlo, `Date.now()`) — jinak by druhý
 * toast dostal jen zbytek času prvního a „Vrátit" by zmizelo dřív. Na objekt
 * `action` se Toast neptá: nový objekt při každém vykreslení rodiče by
 * odpočet pouštěl pořád od začátku.
 */
export function Toast({ message, onClose, tone = 'ok', ms, action, id }: {
  message: string | null;
  onClose: () => void;
  tone?: 'ok' | 'bad';
  /** Jak dlouho toast drží. Výchozí 3,6 s, s akcí 6 s. */
  ms?: number;
  action?: { label: string; onClick: () => void };
  /** Identita zobrazení: nové `id` = nový toast i se stejným textem. */
  id?: string | number;
}) {
  const doba = ms ?? (action ? 6000 : 3600);
  const pilulka = useRef<HTMLDivElement>(null);
  const [podUkazatelem, setPodUkazatelem] = useState(false);
  const [sFokusem, setSFokusem] = useState(false);
  const [skryto, setSkryto] = useState(false);
  const pozastaveno = podUkazatelem || sFokusem || skryto;
  /** Kde byl fokus, než vešel do toastu — tam se vrátí, až tlačítko akce zmizí. */
  const odkud = useRef<HTMLElement | null>(null);

  // Zavírá se přes ref: rodič dává šipkovou funkci, nová při každém vykreslení.
  // Kdyby byla v závislostech odpočtu, obrazovka, která se často překresluje,
  // by toast nenechala zmizet vůbec.
  const zavrit = useRef(onClose);
  useEffect(() => { zavrit.current = onClose; }, [onClose]);

  const identita = message === null ? null : `${id ?? ''}\u0000${message}`;
  // Zbývající čas se nese přes pozastavení a nový toast začíná od plné doby.
  const zbyva = useRef(doba);
  useEffect(() => {
    zbyva.current = doba;
    // Pozastavení se u nového toastu počítá znovu, ne ze stavu minulého.
    // Po „Vrátit" zmizí tlačítko akce i s fokusem a pod ukazatelem, a prohlížeč
    // pak nepošle ani `blur`, ani pilulce `pointerleave` (změřeno v Chromiu).
    // Stav by zůstal „fokus uvnitř" / „pod ukazatelem", odpočet by stál navždy
    // — a každý další toast taky. Fokus se proto čte z DOM a ukazatel se
    // počítá, až se nad pilulkou znovu pohne.
    if (!pilulka.current?.contains(document.activeElement)) setSFokusem(false);
    setPodUkazatelem(false);
  }, [identita, doba]);

  // Dokud je ukazatel „nad toastem", hlídá se i pohyb po stránce: kdyby
  // `pointerleave` nepřišel (prvek pod ukazatelem zmizel), první pohyb mimo
  // pilulku pozastavení zruší.
  useEffect(() => {
    if (!podUkazatelem) return;
    const pohyb = (e: PointerEvent) => { if (!pilulka.current?.contains(e.target as Node)) setPodUkazatelem(false); };
    document.addEventListener('pointermove', pohyb);
    return () => document.removeEventListener('pointermove', pohyb);
  }, [podUkazatelem]);

  useEffect(() => {
    const zmena = () => setSkryto(document.visibilityState === 'hidden');
    zmena();
    document.addEventListener('visibilitychange', zmena);
    return () => document.removeEventListener('visibilitychange', zmena);
  }, []);

  useEffect(() => {
    if (identita === null || pozastaveno) return;
    const start = Date.now();
    const t = setTimeout(() => zavrit.current(), zbyva.current);
    return () => { clearTimeout(t); zbyva.current = Math.max(0, zbyva.current - (Date.now() - start)); };
  }, [identita, doba, pozastaveno]);

  // Zmizelý toast nesmí nechat viset „pod ukazatelem": další by pak stál.
  useEffect(() => { if (identita === null) { setPodUkazatelem(false); setSFokusem(false); odkud.current = null; } }, [identita]);

  // Fokus z tlačítka akce, které se kliknutím rozplyne. Klávesnice se vrátí
  // tam, odkud do toastu přišla — jinak by spadla na <body> a Tab by začínal
  // znovu od začátku stránky. Myš a prst fokus nepotřebují (návrat do pole
  // by na telefonu znovu vytáhl klávesnici), tam se tlačítko jen odfokusuje.
  const pustitFokus = () => {
    const el = pilulka.current;
    const aktivni = document.activeElement as HTMLElement | null;
    if (!el || !aktivni || !el.contains(aktivni)) return;
    const cil = odkud.current;
    if (zKlavesnice(aktivni) && cil?.isConnected && !el.contains(cil)) cil.focus({ preventScroll: true });
    else aktivni.blur();
  };

  // Bez zprávy se nekreslí nic, ani prázdný obal: toast stojí v obrazovkách
  // i jako první dítě `space-y-*` (Úkoly na tabletu) a prázdný prvek by
  // posunul všechno pod ním o mezeru.
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 toast-misto z-[80] flex justify-center px-4">
      <div
        ref={pilulka}
        role="status"
        onPointerEnter={() => setPodUkazatelem(true)}
        onPointerMove={() => { if (!podUkazatelem) setPodUkazatelem(true); }}
        onPointerLeave={() => setPodUkazatelem(false)}
        onFocus={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) odkud.current = e.relatedTarget as HTMLElement | null;
          setSFokusem(true);
        }}
        onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSFokusem(false); }}
        // Plocha a stín z `.chrom-inkoust` (globals.css): pevná i v tmavém
        // režimu a se skutečným stínem — utilita stínu s holou proměnnou
        // v Tailwindu 3.4 žádný stín nedá (scripts/check-shadow-var).
        className="toast-in pointer-events-auto max-w-md rounded-full chrom-inkoust text-sm font-medium px-4 py-2.5 flex items-center gap-2"
      >
        <Icon name={tone === 'bad' ? 'warning' : 'check'} size={15} className={`shrink-0 ${tone === 'bad' ? 'text-[#FF8A80]' : 'text-[#C8F542]'}`} />
        <span className="min-w-0">{message}</span>
        {action && (
          <button type="button"
            // Nejdřív pustit fokus a zavřít, pak akce: když akce ukáže vlastní
            // toast („Vráceno"), zavření by ho jinak hned smazalo — a akce
            // může fokus poslat jinam (třeba na vrácený widget).
            onClick={() => { pustitFokus(); onClose(); action.onClick(); }}
            className="tap-target-sm shrink-0 ml-1 font-semibold text-white underline underline-offset-2 hover:no-underline">
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

export default Toast;
