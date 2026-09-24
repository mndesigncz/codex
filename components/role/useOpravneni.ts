'use client';

// Oprávnění přihlášeného v AKTIVNÍM podniku (kolo 67) — pro klienta.
//
// Rozhoduje vždycky server (lib/opravneniDb → pozaduj). Tohle je jen
// nápověda rozhraní: navigace nekreslí obrazovky, které by skončily 403,
// a tlačítka, na která člověk nemá, se schovají nebo zamknou.
//
// Proč sdílený stav v modulu: /api/teams/mine chce navigace, přepínač
// podniků, Nastavení i správa týmu. Každá obrazovka by se jinak ptala
// zvlášť a u vedení s pěti otevřenými pohledy to bylo pět stejných
// dotazů do databáze. Přepínač podniků (PodnikSwitcher) bere stejnou
// odpověď, takže po načtení stránky jde na server jediný požadavek.
//
// Dokud odpověď nedorazí (nebo když selže), `ma()` vrací ANO. Schválně:
// výpadek téhle jedné odpovědi nesmí vedení schovat půlku aplikace —
// dnešní chování je „vidíš všechno, server případně odmítne", a to
// zůstává jako bezpečný záchyt. Kdo potřebuje přísnou odpověď (editor
// rolí), čte `nacteno`.

import { useSyncExternalStore } from 'react';
import { okJson } from '@/lib/api';

export interface MojeRole {
  klic: string | null;
  roleId: number | null;
  nazev: string;
  typ: 'vedeni' | 'zamestnanec' | 'kiosk';
  jeVlastnik: boolean;
}

interface Stav {
  /** Odpověď dorazila a nesla seznam oprávnění. */
  nacteno: boolean;
  /** Načtení selhalo (síť, 5xx) — UI se chová jako dřív a rozhodne server. */
  chyba: boolean;
  opravneni: ReadonlySet<string>;
  role: MojeRole | null;
}

const PRAZDNY: Stav = { nacteno: false, chyba: false, opravneni: new Set(), role: null };
let stav: Stav = PRAZDNY;
let slib: Promise<any> | null = null;
const posluchaci = new Set<() => void>();
const oznam = () => posluchaci.forEach(f => f());

function prevezmi(d: any) {
  // Starší server (nebo podvržená odpověď bez pole) oprávnění nezná —
  // pak nevíme nic a platí záchyt „ukázat vše", ne „schovat vše".
  if (!d || !Array.isArray(d.opravneni)) { stav = { ...PRAZDNY }; oznam(); return; }
  stav = {
    nacteno: true, chyba: false,
    opravneni: new Set(d.opravneni.filter((x: unknown) => typeof x === 'string')),
    role: d.role && typeof d.role === 'object' ? d.role as MojeRole : null,
  };
  oznam();
}

/**
 * Jedno sdílené načtení /api/teams/mine. `znovu` = zahodit, co už je
 * (po přepnutí podniku, po změně vlastní role). Chyba se propisuje
 * volajícímu — přepínač podniků podle ní ukáže „zkusit znovu".
 */
export function nactiTeamsMine(znovu = false): Promise<any> {
  if (znovu || !slib) {
    slib = fetch('/api/teams/mine').then(okJson)
      .then(d => { prevezmi(d); return d; })
      .catch(e => { slib = null; stav = { ...PRAZDNY, chyba: true }; oznam(); throw e; });
  }
  return slib;
}

/** Po změně role nebo podniku: načíst oprávnění znovu. */
export function obnovOpravneni(): void { nactiTeamsMine(true).catch(() => { /* záchyt výš */ }); }

function odebirej(f: () => void) {
  posluchaci.add(f);
  if (!slib) nactiTeamsMine().catch(() => { /* chyba je ve stavu */ });
  return () => { posluchaci.delete(f); };
}
const snimek = () => stav;
const snimekServer = () => PRAZDNY;

export function useOpravneni() {
  const s = useSyncExternalStore(odebirej, snimek, snimekServer);
  /** Má aspoň jedno z oprávnění? Před načtením / po chybě ANO (viz nahoře). */
  const ma = (klic: string | readonly string[]): boolean => {
    if (!s.nacteno) return true;
    const k = typeof klic === 'string' ? [klic] : klic;
    return k.length === 0 || k.some(x => s.opravneni.has(x));
  };
  return { nacteno: s.nacteno, chyba: s.chyba, ma, opravneni: s.opravneni, role: s.role };
}
