// Text právního dokumentu s odkazy: `[[cesta|text]]` → odkaz na jinou právní stránku
// (u anglické verze na /en/…), e-mail a telefon provozovatele → mailto: a tel:.
// Server i klient; bez stavu.

import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { jeEmail, telOdkaz, type Firma } from '@/lib/firma';
import { cestaDokumentu } from '@/lib/pravni/odkazy';

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Cíl odkazu `[[cesta|…]]`: klíč dokumentu nebo `nahlasit` → právní stránka, `/…` → beze změny. */
export function cilOdkazu(cesta: string, jazyk: 'cs' | 'en'): string {
  return cesta.startsWith('/') ? cesta : cestaDokumentu(cesta, jazyk);
}

export function TextSOdkazy({ text, jazyk, f }: { text: string; jazyk: 'cs' | 'en'; f: Firma }): ReactNode {
  const casti: string[] = ['\\[\\[([^|\\]]+)\\|([^\\]]+)\\]\\]'];
  if (jeEmail(f.emailPodpory)) casti.push(esc(f.emailPodpory));
  if (f.telefon.trim()) casti.push(esc(f.telefon));
  const re = new RegExp(casti.join('|'), 'g');
  const out: ReactNode[] = [];
  let posledni = 0;
  let m: RegExpExecArray | null;
  const tridy = 'underline underline-offset-2 hover:text-black';
  while ((m = re.exec(text))) {
    if (m.index > posledni) out.push(text.slice(posledni, m.index));
    if (m[1]) {
      out.push(<Link key={m.index} href={cilOdkazu(m[1], jazyk)} className={tridy}>{m[2]}</Link>);
    } else if (m[0] === f.emailPodpory) {
      out.push(<a key={m.index} href={`mailto:${f.emailPodpory}`} className={tridy}>{m[0]}</a>);
    } else {
      out.push(<a key={m.index} href={telOdkaz(f.telefon)} className={`${tridy} whitespace-nowrap`}>{m[0]}</a>);
    }
    posledni = m.index + m[0].length;
  }
  if (posledni < text.length) out.push(text.slice(posledni));
  return <>{out.map((x, i) => <Fragment key={i}>{x}</Fragment>)}</>;
}

/** Čistý text bez značek odkazů (pro metadata, e-maily, testy). */
export const bezZnacek = (text: string): string => text.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2');
