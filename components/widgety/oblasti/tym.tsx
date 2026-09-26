'use client';

// Widgety oblasti „Tým" — komponenty (kolo 68, spec §2.5, §2.6 a §6.1).
//
// Vlastník v kole 69: balík B2 (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/tym.ts,
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — test AK-20 (scripts/testy/k68-widgety.ts) klíče čte z textu, proto bez spreadu.
//
// Tým nahrazuje dlaždici „Zaměstnanci" z řady čísel na Přehledu (audit Přehledu
// vedení): tlačítko s třídou glass-card bylo průhledné a šedé vedle bílých
// karet, číslo mělo 30 px bez tabulkových číslic a ikonu v tónovaném kolečku.
// Teď je to malý widget se Stat (28 px, tabular) a u střední velikosti seznam
// lidí s rolí. Data jen s tym.zobrazit — GET /api/teams členy vrátí každému
// členovi podniku, takže bránu drží registr, ne API (spec §1.5). Profil
// otevře klepnutí jen s tym.profil, telefon je vidět jen s tym.kontakty
// (server ho bez klíče ani nepošle).

import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { czForm } from '@/lib/czech';
import { Avatar, Chip, ListRow, Stat } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { usePersonProfile } from '../../employer/ProfileLinkProvider';
import { Widget, type StavNacteni } from '../Widget';
import { useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';

type Klic = string | readonly string[];

const seznam = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const cislo = (n: number) => n.toLocaleString('cs-CZ');
const aDalsich = (n: number) => `…a ${czForm(n, { one: 'další', few: 'další', many: 'dalších' })} ${cislo(n)}`;

/** Klíč části widgetu z katalogu (`opravneni.pole`) — jeden zdroj pravdy s galerií a serverem. */
function klicCasti(idWidgetu: string, cast: string): Klic | null {
  return widget(idWidgetu)?.opravneni.pole?.[cast] ?? null;
}

/**
 * Brána widgetu (spec §1.5): přísně `nacteno && ma()` — `ma()` před načtením
 * oprávnění vrací ANO a dotaz by odešel dřív, než víme, jestli na tým divák
 * má. Když /api/teams/mine selže, rozhodl už server seznamem v rozložení.
 */
function useBrana(klic: Klic): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  return { ok: nacteno ? ma(klic) : chyba, ceka: !nacteno && !chyba };
}

/** „Ještě nevíme, jestli smí": kostra a žádný dotaz. */
const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

// ---------------------------------------------------------------------------
// Tým
// ---------------------------------------------------------------------------

const ID_TYM = 'tym.clenove';

interface Clen {
  id: number;
  jmeno: string;
  avatar: string | null;
  vedeni: boolean;
  role: string;
  pozice: string | null;
  telefon: string | null;
  jinde: boolean;
}

function vyberCleny(raw: any): Clen[] {
  return seznam(raw?.members).map((m: any) => ({
    id: Number(m.id),
    jmeno: String(m.name ?? ''),
    avatar: typeof m.avatar === 'string' ? m.avatar : null,
    vedeni: m.role === 'employer',
    role: String(m.role_nazev ?? (m.role === 'employer' ? 'Vedení' : 'Zaměstnanec')),
    pozice: typeof m.job_title === 'string' && m.job_title.trim() ? m.job_title.trim() : null,
    telefon: typeof m.phone === 'string' && m.phone.trim() ? m.phone.trim() : null,
    // Člen je právě přepnutý v jiném podniku organizace (kolo 62) — tady je dál členem.
    jinde: m.aktivni_jinde === true,
  }));
}

function Tym({ velikost }: WidgetProps) {
  const smi = useSmi();
  const nav = useNavigace();
  const otevriProfil = usePersonProfile();
  const { ok, ceka } = useBrana(widget(ID_TYM)?.opravneni.vse ?? ['tym.zobrazit']);
  const data = useDataWidgetu(ok ? '/api/teams' : null, vyberCleny);
  const clenove = data.data ?? [];
  const veVedeni = clenove.filter(c => c.vedeni).length;
  const smiCast = (cast: string) => { const k = klicCasti(ID_TYM, cast); return !!k && smi(k); };
  // Profil otevírá layout vedení (ProfileLinkProvider); mimo něj ani bez klíče se řádek neklikne.
  const profil = smiCast('profil') && !!otevriProfil;
  const kontakty = smiCast('kontakty');

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data}
        otevrit={nav.smiPohled('team-settings') ? () => nav.onNavigate('team-settings') : undefined}>
        <Stat label="Lidí v týmu" value={cislo(clenove.length)} note={veVedeni > 0 ? `${cislo(veVedeni)} ve vedení` : undefined} />
      </Widget>
    );
  }
  return (
    <Widget nacteni={ceka ? CEKA : data} odkaz={{ popisek: 'Lidé', pohled: 'team-settings' }}
      doplnek={clenove.length > 0 ? <Chip tone="muted" size="sm">{cislo(clenove.length)}</Chip> : undefined}
      prazdno={clenove.length === 0 ? <p className="t-meta">V týmu zatím nikdo není.</p> : undefined}>
      <ul className="list">
        {clenove.slice(0, 5).map(c => {
          const meta = [c.role, c.pozice && c.pozice !== c.role ? c.pozice : null, kontakty ? c.telefon : null].filter(Boolean).join(' · ');
          const jinde = c.jinde ? <Chip tone="muted" size="sm">V jiném podniku</Chip> : undefined;
          return profil && otevriProfil ? (
            // Klikací řádek ve vlastním <li>, jinak by .list nad ním nekreslil linku (DP §3.6).
            <li key={c.id}>
              <ListRow as="div" lead={<Avatar emoji={c.avatar} size="sm" />} title={c.jmeno} meta={meta} right={jinde}
                onClick={() => otevriProfil(c.id)} />
            </li>
          ) : (
            <ListRow key={c.id} lead={<Avatar emoji={c.avatar} size="sm" />} title={c.jmeno} meta={meta} right={jinde} />
          );
        })}
      </ul>
      {clenove.length > 5 && <p className="t-meta mt-2">{aDalsich(clenove.length - 5)}</p>}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'tym.clenove': Tym,
};
