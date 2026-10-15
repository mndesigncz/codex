'use client';

// Zaškrtávátko souhlasu s podmínkami (click-wrap, spuštění, balík P) — jedno pro registraci
// podniku, připojení zaměstnance (kód i pozvánka), registraci hosta a bránu nové verze.
//
// Dřív stála pod tlačítkem pasivní věta „Založením účtu souhlasíš…" a server souhlas
// nevyžadoval. Teď je souhlas výslovný: bez zaškrtnutí formulář neodejde (volající ukáže
// `chyba`) a server bez `terms: true` účet nezaloží. Host navíc potvrzuje věk (`vek`).
//
// Odkazy se otevírají v nové záložce: rozepsaný formulář (heslo, jméno) se tím neztratí.
// Řádek s textem je celý klikací a vysoký aspoň 44 px (cíl na telefonu).

import Link from 'next/link';
import { useJazyk, useT } from '@/lib/i18n/client';
import { MIN_VEK_HOSTA, odkazyPravni } from '@/lib/pravni/verze';

export default function SouhlasPodminek({ id, checked, onChange, chyba, vek, className = '' }: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Hláška pod zaškrtávátkem (např. po pokusu odeslat bez souhlasu). */
  chyba?: string | null;
  /** Host: druhé zaškrtávátko „Je mi aspoň 15 let". */
  vek?: { checked: boolean; onChange: (v: boolean) => void };
  className?: string;
}) {
  const t = useT('spolecne');
  const { jazyk } = useJazyk();
  const odkazy = odkazyPravni(jazyk);
  const idChyby = `${id}-chyba`;
  return (
    <div className={`grid gap-1 ${className}`} data-souhlas-podminek>
      <label htmlFor={id} className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5 text-sm text-black/75">
        <input id={id} type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
          aria-invalid={chyba ? true : undefined} aria-describedby={chyba ? idChyby : undefined}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[#16181A]" />
        <span className="text-pretty">{t('Souhlasím s podmínkami užívání a beru na vědomí zásady ochrany osobních údajů.')}</span>
      </label>
      {/* Bez oddělovače: v úzké kartě se odkazy zalomí pod sebe a tečka by visela na konci řádku. */}
      <p className="flex flex-wrap items-center gap-x-4 pl-8 text-xs text-black/55">
        <Link href={odkazy.podminky} target="_blank" rel="noopener noreferrer" className="tap-target-sm inline-flex items-center font-medium underline underline-offset-2">{t('Podmínky užívání')}</Link>
        <Link href={odkazy.soukromi} target="_blank" rel="noopener noreferrer" className="tap-target-sm inline-flex items-center font-medium underline underline-offset-2">{t('Zásady ochrany osobních údajů')}</Link>
      </p>
      {vek && (
        <label htmlFor={`${id}-vek`} className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5 text-sm text-black/75">
          <input id={`${id}-vek`} type="checkbox" checked={vek.checked} onChange={e => vek.onChange(e.target.checked)}
            aria-invalid={chyba ? true : undefined} aria-describedby={chyba ? idChyby : undefined}
            className="mt-0.5 h-5 w-5 shrink-0 accent-[#16181A]" />
          <span>{t('Je mi aspoň {n} let.', { n: MIN_VEK_HOSTA })}</span>
        </label>
      )}
      {chyba && <p id={idChyby} role="alert" className="note note-danger px-3 py-2 text-sm">{chyba}</p>}
    </div>
  );
}
