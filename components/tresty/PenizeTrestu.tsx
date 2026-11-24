'use client';

// Peníze trestu v detailu (kolo 96, docs/TRESTY-PENIZE.md): řádky do bloku „Dopad" okna DetailTrestu —
// srážka z výplaty / náhrada škody (kolik, proč, stav, splátky a rozvrh, u náhrady škoda a její druh)
// a záskok BEZ jmen kolegů („přejde kolegům, kteří to napravili"). Krácení prémie kreslí DetailTrestu
// jako dřív (věta „Krátí se jen prémie …, ne mzda."). Čte jen item.penize vlastního trestu.

import { useJazyk, useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { useMoney } from '../CurrencyProvider';
import type { Trest } from '@/lib/tresty';
import type { DruhSkody, SrazkaTrestu } from '@/lib/trestyPenize';
import { StavSrazkyChip } from './kusy';
import { penizeProZamestnance } from './logika';

/** Druh škody slovy (náhrada škody, § 250 a násl. ZP). */
export function druhSkody(t: PrekladFn, d: DruhSkody): string {
  if (d === 'schodek') return t('schodek na svěřených hodnotách');
  if (d === 'ztrata') return t('ztráta svěřených věcí');
  return t('zaviněná škoda');
}

function RadekSrazky({ s, zrusenyTrest }: { s: SrazkaTrestu; zrusenyTrest: boolean }) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const money = useMoney();
  const den = (d: string) => fmtDatum(d, { jazyk, styl: 'kratce' });
  const neplati = zrusenyTrest || s.stav === 'zruseno' || s.stav === 'nesouhlas';
  return (
    <li data-srazka={s.id} data-stav-srazky={s.stav}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm text-black/70">{s.druh === 'nahrada' ? t('Náhrada škody') : t('Srážka z výplaty')}</span>
          <StavSrazkyChip stav={s.stav} />
        </span>
        <span className={`shrink-0 text-[15px] font-semibold tabular-nums ${neplati ? 'line-through text-black/45' : ''}`}>−{money(s.castka)}</span>
      </div>
      <div className="t-meta mt-0.5 space-y-0.5 text-pretty">
        {s.skoda && (
          <p data-skoda>
            {t('Škoda {castka} · {druh}', { castka: money(s.skoda.castka), druh: druhSkody(t, s.skoda.druh) })}
            {s.skoda.zavineni === 'umysl' ? ` · ${t('úmyslně')}` : ''}
          </p>
        )}
        {s.stav === 'ceka' && (
          <p>{s.splatky > 1 ? t('Ve {n} splátkách — nestrhává se, dokud nesouhlasíš.', { n: s.splatky }) : t('Nestrhává se, dokud nesouhlasíš.')}</p>
        )}
        {s.stav === 'uplatneno' && !zrusenyTrest && (
          s.rozvrh.length > 1 ? (
            <p data-rozvrh>{t('Splátky: {splatky}', { splatky: s.rozvrh.map(x => `${den(x.den)} −${money(x.castka)}`).join(' · ') })}</p>
          ) : (
            <p data-rozvrh>{s.odDne ? t('Strhne se z výplaty od {den}', { den: den(s.odDne) }) : t('Strhne se z nejbližší výplaty.')}</p>
          )
        )}
        {s.stav === 'uplatneno' && s.souhlasAt && <p>{t('Souhlasil(a) jsi {den}', { den: den(s.souhlasAt.slice(0, 10)) })}</p>}
        {s.stav === 'nesouhlas' && (
          <p data-nesouhlas>
            {t('Nesouhlasíš — nic se nestrhne. Vedení se ti ozve.')}
            {s.nesouhlasDuvod && <span className="block break-words">{t('Tvůj důvod: {text}', { text: s.nesouhlasDuvod })}</span>}
          </p>
        )}
        {(s.stav === 'zruseno' || (zrusenyTrest && s.stav !== 'nesouhlas')) && <p>{t('Zrušeno — nic se nestrhne.')}</p>}
      </div>
    </li>
  );
}

/** Řádky peněz pod body a krácením: srážky / náhrady a záskok (bez jmen). Nic peněžního = nic. */
export function RadkyPenezTrestu({ trest }: { trest: Trest }) {
  const t = useT('widgety');
  const money = useMoney();
  const p = penizeProZamestnance(trest);
  if (!p) return null;
  const zruseny = trest.status === 'zruseno';
  return (
    <>
      {p.srazky.map(s => <RadekSrazky key={s.id} s={s} zrusenyTrest={zruseny} />)}
      {p.kolegum != null && !zruseny && (
        <li data-zaskok-trestu>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-black/70 text-pretty">{t('Z toho přejde kolegům, kteří to napravili')}</span>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums">{money(p.kolegum)}</span>
          </div>
          {p.preslo < p.kolegum && <p className="t-meta mt-0.5 text-pretty">{t('Přejde, až se částka opravdu strhne.')}</p>}
        </li>
      )}
    </>
  );
}

export default RadkyPenezTrestu;
