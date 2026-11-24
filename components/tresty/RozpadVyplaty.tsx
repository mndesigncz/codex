'use client';

// Rozpad výplaty po penězích z trestů (kolo 96, docs/TRESTY-PENIZE.md 4.10): jedny řádky pro Můj výdělek,
// detail výplatní listiny a profil člena „Výplata · tento měsíc". Čísla počítá lib (rozpadVyplaty /
// vyplatniListina s obdobím) — tady se jen pojmenují:
//   nároková mzda · nenároková složka (s popisem nastavení) · nenárokové prémie · záskok · ostatní ·
//   krácení (jen z nenárokové části; nad strop se nestrhne) · náhrada škody · srážky ze mzdy.
// Srážky čekající na souhlas jsou ZVLÁŠŤ (`RadekCekaNaSouhlas`) — ve výplatě se nestrhávají.
// Volající si kolem přidá své řádky (příplatky, dýško, z kasy, vyplaceno, k výplatě) a obal `ul.list`.

import type { ReactNode } from 'react';
import { ListRow } from '../ui';
import { useMoney } from '../CurrencyProvider';
import { useJazyk, useT, type PrekladFn } from '@/lib/i18n/client';
import type { NastaveniSlozky, RozpadVyplaty } from '@/lib/trestyPenize';

/** „+500 Kč" / „−200 Kč" (mínus typograficky). */
export const sZnamenkem = (castka: number, money: (n: number) => string): string => (castka >= 0 ? `+${money(castka)}` : `−${money(Math.abs(castka))}`);

/** Popis nastavení nenárokové složky přeložený (lib popisSlozky je česká věta pro server a CSV). */
export function popisSlozkyT(t: PrekladFn, n: NastaveniSlozky | null, money: (n: number) => string, jazyk: string): string {
  if (!n) return t('bez nenárokové složky');
  const co = n.typ === 'pct' ? t('{pct} % ze mzdy', { pct: n.hodnota.toLocaleString(jazyk) })
    : n.typ === 'kc_hod' ? t('{castka} za hodinu', { castka: money(n.hodnota) })
    : t('{castka} za měsíc', { castka: money(n.hodnota) });
  return `${co} · ${n.vSazbe ? t('součást sazby') : t('navíc ke mzdě')}`;
}

/** Je v rozpadu něco víc než holá mzda (jinak stačí dlaždice a seznam by jen opakoval číslo)? */
export const maPenize = (r: RozpadVyplaty | null | undefined, slozka?: NastaveniSlozky | null): boolean =>
  !!r && (!!slozka || r.slozka > 0 || r.premie !== 0 || r.zaskok !== 0 || r.kraceni !== 0 || r.nahrada !== 0 || r.srazky !== 0 || r.cekaNaSouhlas > 0);

/**
 * Řádky rozpadu (bez obalu `ul`). `kdo` mění jen slova: „ja" = Můj výdělek (ty), „clovek" = vedení o členovi.
 * `ostatniBez` = část ostatních úprav, kterou volající ukazuje vlastním řádkem (Navíc), ať se nesčítá dvakrát.
 */
export function RadkyRozpadu({ r, slozka = null, kdo, mzdaMeta, ostatniBez = 0, bezMzdy = false }: {
  r: RozpadVyplaty;
  slozka?: NastaveniSlozky | null;
  kdo: 'ja' | 'clovek';
  mzdaMeta?: ReactNode;
  ostatniBez?: number;
  /** Mzdu ukazuje volající jinde (dlaždice) — řádek mzdy vynechat. */
  bezMzdy?: boolean;
}) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const money = useMoney();
  const ostatni = r.ostatni - ostatniBez;
  const sNenarokovou = !!slozka || r.slozka > 0;
  const tonCislo = (n: number) => (n > 0 ? 'text-ok-ink' : n < 0 ? 'text-bad-ink' : undefined);
  return (
    <>
      {!bezMzdy && r.mzda != null && (
        <ListRow title={sNenarokovou ? t('Nároková mzda') : t('Mzda')} meta={mzdaMeta ?? t('hodiny × sazba')} value={<span data-rozpad="mzda">{money(r.zakladni ?? r.mzda)}</span>} />
      )}
      {sNenarokovou && (
        <ListRow key="slozka" title={t('Nenároková složka')} meta={popisSlozkyT(t, slozka, money, jazyk)}
          value={<span data-rozpad="slozka">{r.slozkaNavic > 0 ? `+${money(r.slozkaNavic)}` : money(r.slozka)}</span>} valueMeta={r.slozkaNavic > 0 ? undefined : r.slozka > 0 ? t('v mzdě') : undefined} />
      )}
      {r.premie !== 0 && <ListRow title={t('Nenárokové prémie')} value={<span className={tonCislo(r.premie)} data-rozpad="premie">{sZnamenkem(r.premie, money)}</span>} />}
      {r.zaskok !== 0 && (
        <ListRow key="zaskok" title={t('Záskok za kolegy')} meta={kdo === 'ja' ? t('stržená částka z trestu, který jsi napravil(a)') : t('stržená částka z trestu kolegy')}
          value={<span className={tonCislo(r.zaskok)} data-rozpad="zaskok">{sZnamenkem(r.zaskok, money)}</span>} />
      )}
      {ostatni !== 0 && <ListRow title={t('Ostatní prémie a srážky')} value={<span className={tonCislo(ostatni)} data-rozpad="ostatni">{sZnamenkem(ostatni, money)}</span>} />}
      {r.kraceni !== 0 && (
        <ListRow key="kraceni" title={t('Krácení (trest)')}
          meta={r.kraceniNadStrop > 0 ? t('{castka} nad strop se nestrhne — nároková mzda zůstává celá', { castka: money(r.kraceniNadStrop) }) : t('jen z nenárokové části')}
          value={<span className="text-bad-ink" data-rozpad="kraceni">{sZnamenkem(-r.kraceniUplatneno, money)}</span>} />
      )}
      {r.nahrada !== 0 && (
        <ListRow key="nahrada" title={t('Náhrada škody')} meta={kdo === 'ja' ? t('s tvým souhlasem') : t('se souhlasem zaměstnance')}
          value={<span className="text-bad-ink" data-rozpad="nahrada">{sZnamenkem(-r.nahrada, money)}</span>} />
      )}
      {r.srazky !== 0 && (
        <ListRow key="srazky" title={t('Srážky ze mzdy')} meta={kdo === 'ja' ? t('s tvým souhlasem') : t('se souhlasem zaměstnance')}
          value={<span className="text-bad-ink" data-rozpad="srazky">{sZnamenkem(-r.srazky, money)}</span>} />
      )}
    </>
  );
}

/**
 * Profil člena „Výplata · tento měsíc" (components/employer/EmployeeProfile, sekce správy): rozpad peněz z trestů
 * a nenárokové složky jen ke čtení — složku nastavuje vedení v části Tresty téhož profilu. Bez peněz nic.
 */
export function RozpadVyplatyClena({ r, slozka }: { r: RozpadVyplaty | null; slozka: NastaveniSlozky | null }) {
  if (!r || !maPenize(r, slozka)) return null;
  return (
    <div className="mt-2 space-y-2" data-rozpad-clena>
      <ul className="list"><RadkyRozpadu r={r} slozka={slozka} kdo="clovek" /></ul>
      <RadekCekaNaSouhlas castka={r.cekaNaSouhlas} kdo="clovek" />
    </div>
  );
}

/** Srážky čekající na souhlas — zvlášť, tlumeně, NEodečtené. U zaměstnance klepnutí vede do Moje tresty. */
export function RadekCekaNaSouhlas({ castka, kdo, detail, onOtevrit }: { castka: number; kdo: 'ja' | 'clovek'; detail?: ReactNode; onOtevrit?: () => void }) {
  const t = useT('widgety');
  const money = useMoney();
  if (!(castka > 0)) return null;
  const radek = {
    title: kdo === 'ja' ? t('Čeká na tvůj souhlas') : t('Čeká na souhlas'),
    meta: kdo === 'ja' ? t('Ve výplatě se nestrhává, dokud nesouhlasíš.') : t('Ve výplatě se nestrhává, dokud člověk nesouhlasí.'),
    detail,
    value: <span className="text-black/55">{money(castka)}</span>,
    valueMeta: t('neodečteno'),
  };
  return (
    <ul className="list" data-ceka-na-souhlas={castka}>
      {onOtevrit ? <li><ListRow as="div" {...radek} onClick={onOtevrit} /></li> : <ListRow {...radek} />}
    </ul>
  );
}
