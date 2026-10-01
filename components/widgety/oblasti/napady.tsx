'use client';

// Widgety oblasti „Nápady" — komponenty (kolo 69, spec §2.5, §2.6 a §6.3).
//
// Vlastník: balík B6a (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/napady.ts,
// výběr a řazení v lib/ukolyPrehled.ts; tady je jen kreslení. Klíč v KOMPONENTY = id
// widgetu a musí sedět se `stav: 'hotovo'` v katalogu (test AK-20), proto bez spreadu.
//
// Oba widgety čtou /api/suggestions — tutéž adresu jako seznam podnětů v nástroji
// stránky Nápady, takže hlas daný ve widgetu se hned ukáže i v seznamu pod ním.
//  - napady.nejzadanejsi — pět podnětů s nejvíc hlasy a hlasování přímo z karty
//    (napady.pridat; server bez něj vrací prázdný seznam, tablet tak nic nevidí).
//  - napady.nove — co čeká na posouzení (napady.spravovat). „Do plánování" založí kartu
//    na tabuli jen s planovani.upravit (tak to pustí PATCH), jinak „Naplánovat" jen změní stav.

import { useState } from 'react';
import { Avatar, Button, Chip, ListRow, Stat } from '../../ui';
import { Icon } from '../../Icons';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { Widget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu, type StavDat } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';
import { useOpravneni } from '../../role/useOpravneni';
import { apiMessage, okJson } from '@/lib/api';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { vyberPodnety, nejzadanejsi, novePodnety, prepniHlas, type DataPodnetu, type Podnet, type StavPodnetu } from '@/lib/ukolyPrehled';

/** Tutéž adresu čte seznam podnětů (SuggestionsBoard) — jeden dotaz na stránku. */
export const URL_NAPADY = '/api/suggestions';
/** Tabule Plánování (oblasti/planovani.tsx) — tady jen adresa, ať se oblast nestahuje s touhle. */
const URL_PLANOVANI = '/api/planning';

const hlasy = (t: PrekladFn, n: number) => t('{n, plural, one {# hlas} few {# hlasy} other {# hlasů}}', { n });
const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };
const cislo = (n: number) => n.toLocaleString('cs-CZ');
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };

/** Brána widgetu po načtení oprávnění (viz oblasti/receptury.tsx — stejný důvod). */
function useBrana(id: string): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  const o = widget(id)?.opravneni ?? { vse: ['napady.pridat'], nektere: [] };
  if (!nacteno) return { ok: chyba, ceka: !chyba };
  const ok = o.vse.every(k => ma(k)) && (o.nektere.length === 0 || o.nektere.some(k => ma(k)));
  return { ok, ceka: false };
}

/**
 * Hlasovací tlačítko: šipka nahoru a počet. Dané hlasy nese inkoustová
 * pilulka (vybráno = inkoust, DP §0 tah 1), ne limetka — limetka je akce.
 */
export function Hlas({ podnet, onClick, zamceno }: { podnet: Podnet; onClick: () => void; zamceno?: boolean }) {
  const t = useT('widgety');
  return (
    <button type="button" onClick={onClick} disabled={zamceno} aria-pressed={podnet.hasVoted}
      aria-label={t('{akce}: {nazev} ({hlasy})', { akce: podnet.hasVoted ? t('Zrušit podporu') : t('Podpořit'), nazev: podnet.title, hlasy: hlasy(t, podnet.votes) })}
      className={`tap-target shrink-0 flex flex-col items-center justify-center w-11 h-11 rounded-2xl border transition-colors disabled:cursor-default ${
        podnet.hasVoted ? 'bg-[#16181A] border-[#16181A] text-white' : 'bg-white border-black/[0.08] text-black/55 hover:border-black/20'}`}>
      <Icon name="chevron" size={14} strokeWidth={2.4} className="rotate-180" />
      <span className="text-xs font-bold tabular-nums leading-none">{cislo(podnet.votes)}</span>
    </button>
  );
}

/** Hlasování z widgetu: hned v UI, se srovnáním po odpovědi a vrácením při chybě. */
function useHlasovani(data: StavDat<DataPodnetu>) {
  const t = useT('widgety');
  const [chyba, setChyba] = useState<string | null>(null);
  const hlasuj = async (s: Podnet) => {
    setChyba(null);
    data.set(prev => (prev ? { ...prev, podnety: prepniHlas(prev.podnety, s.id) } : prev!));
    try {
      await fetch(`${URL_NAPADY}/${s.id}`, { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ toggleVote: true }) }).then(okJson);
      data.reload();
    } catch (e) {
      data.set(prev => (prev ? { ...prev, podnety: prepniHlas(prev.podnety, s.id) } : prev!));
      setChyba(apiMessage(e, t('Hlas se nepodařilo uložit.')));
    }
  };
  return { chyba, hlasuj };
}

// ---------------------------------------------------------------------------
// Nejžádanější nápady
// ---------------------------------------------------------------------------

function Nejzadanejsi({ nastaveni, nahled }: WidgetProps<{ stav?: string }>) {
  const t = useT('widgety');
  const { ok, ceka } = useBrana('napady.nejzadanejsi');
  const data = useDataWidgetu<DataPodnetu>(ok ? URL_NAPADY : null, vyberPodnety);
  const stav: StavPodnetu = (['nove', 'naplanovane', 'vse'] as const).includes(nastaveni.stav as StavPodnetu) ? nastaveni.stav as StavPodnetu : 'nove';
  const top = data.data ? nejzadanejsi(data.data.podnety, stav) : [];
  const h = useHlasovani(data);
  const prazdnaVeta = stav === 'naplanovane' ? t('Nic není naplánované.') : t('Zatím žádný nápad — přidej ho v Nápadech.');

  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      kostra="seznam"
      odkaz={{ popisek: t('Nápady'), pohled: 'suggestions' }}
      prazdno={data.data && top.length === 0 ? <p className="t-meta">{prazdnaVeta}</p> : undefined}
    >
      <ul className="list">
        {top.map(s => (
          <ListRow key={s.id}
            lead={<Hlas podnet={s} zamceno={nahled} onClick={() => void h.hlasuj(s)} />}
            title={s.title}
            meta={s.authorName ?? undefined}
            right={stav === 'vse' && s.status === 'planned' ? <Chip tone="info" size="sm">{t('Naplánováno')}</Chip> : undefined} />
        ))}
      </ul>
      {h.chyba && <p className="note note-danger mt-3" role="alert">{h.chyba}</p>}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Nové podněty
// ---------------------------------------------------------------------------

function Nove({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const smi = useSmi();
  const nav = useNavigace();
  const { ok, ceka } = useBrana('napady.nove');
  const data = useDataWidgetu<DataPodnetu>(ok ? URL_NAPADY : null, vyberPodnety);
  const nove = data.data ? novePodnety(data.data.podnety) : [];
  const doPlanovani = smi('planovani.upravit');
  const [probiha, setProbiha] = useState<number | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const S = velikost === 'S';

  const naplanuj = async (s: Podnet) => {
    if (probiha != null) return;
    setChyba(null);
    setProbiha(s.id);
    try {
      await fetch(`${URL_NAPADY}/${s.id}`, {
        method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify(doPlanovani ? { toPlanning: true } : { status: 'planned' }),
      }).then(okJson);
      data.reload();
      // Nová karta na tabuli: srovná widgety Plánování i tabuli, jsou-li na obrazovce.
      if (doPlanovani) obnovDataWidgetu(URL_PLANOVANI);
    } catch (e) {
      setChyba(apiMessage(e, t('Podnět se nepodařilo naplánovat.')));
    } finally {
      setProbiha(null);
    }
  };

  return (
    <Widget
      nacteni={ceka ? CEKA : data}
      doplnek={!S && nove.length > 0 ? <Chip tone="wait" size="sm">{cislo(nove.length)}</Chip> : undefined}
      odkaz={S ? undefined : { popisek: t('Nápady'), pohled: 'suggestions' }}
      otevrit={S && !nahled && nav.smiPohled('suggestions') ? () => nav.onNavigate('suggestions') : undefined}
      prazdno={data.data && nove.length === 0 ? <p className="t-meta">{t('Nic nečeká na posouzení.')}</p> : undefined}
    >
      {S ? (
        <Stat label={t('Čeká na posouzení')} value={cislo(nove.length)}
          note={nove[0] ? t('nejstarší od {kdo}', { kdo: nove[0].authorName ?? t('někoho z týmu') }) : undefined} />
      ) : (
        <>
          <ul className="list">
            {nove.slice(0, 5).map(s => (
              <ListRow key={s.id}
                lead={<Avatar emoji={s.authorAvatar ?? undefined} size="sm" />}
                title={s.title}
                meta={[s.authorName, s.votes > 0 ? hlasy(t, s.votes) : null].filter(Boolean).join(' · ') || undefined}
                actions={nahled ? undefined : (
                  <Button variant="secondary" size="sm" icon={doPlanovani ? 'kanban' : 'calendar'} loading={probiha === s.id}
                    disabled={probiha != null && probiha !== s.id} onClick={() => naplanuj(s)}
                    aria-label={t('{akce}: {nazev}', { akce: doPlanovani ? t('Do plánování') : t('Naplánovat'), nazev: s.title })}>
                    {doPlanovani ? t('Do plánování') : t('Naplánovat')}
                  </Button>
                )} />
            ))}
          </ul>
          {nove.length > 5 && <p className="t-meta mt-2">{t('…a {n, plural, one {# další podnět} few {# další podněty} other {# dalších podnětů}}', { n: nove.length - 5 })}</p>}
          {chyba && <p className="note note-danger mt-3" role="alert">{chyba}</p>}
        </>
      )}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'napady.nejzadanejsi': Nejzadanejsi,
  'napady.nove': Nove,
};
