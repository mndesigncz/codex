'use client';

import { useEffect, useRef, useState } from 'react';
import { Chip, ListRow } from '@/components/ui';
import { Icon } from '@/components/Icons';
import { TRIAL_DAYS } from '@/lib/plan';
import { useT } from '@/lib/i18n/client';
import { doporucenyTarif } from '@/lib/pruvodce/plan';
import { widget as najdiWidget } from '@/lib/widgety/katalog';
import type { Odpovedi } from '@/lib/pruvodce/typy';
import type { PrekladFn } from '@/lib/i18n/client';
import type { VysledekOperace } from '@/lib/pruvodce/typy';
import type { VysledekSestaveni } from './spolecne';

// Finále. Je POCTIVÉ: přehrává seznam výsledků, který vrátil server
// (hotovo / přeskočeno / nepovedlo se), ne vymyšlený postup. Řádky se po
// jednom (160 ms) přepnou z prázdného kolečka na výsledek, pak na miniaturu
// Přehledu přiletí dílky přesně podle výsledného rozložení (60 ms po sobě).
// Teprve potom se odemkne „Otevřít Přehled" — dřív by se dalo odejít
// uprostřed. Při omezeném pohybu se všechno ukáže hotové najednou.
// Bez konfet a bez zvuku: klidný papírový tón aplikace to nesnese.

const KROK_RADKU_MS = 160;
const KROK_DILU_MS = 60;

export type FazeSestaveni = 'bezi' | 'hotovo' | 'chyba';

const ODKAZY = (t: PrekladFn): Record<string, { titul: string; meta: string; href: string }> => ({
  rozvrh: { titul: t('Naplánuj první směny'), meta: t('Rozvrh podle dostupnosti týmu.'), href: '/employer/overview?view=shifts' },
  sklad: { titul: t('Přidej první věci do skladu'), meta: t('Uvidíš, co dochází a co dokoupit.'), href: '/employer/overview?view=inventory' },
  uzaverky: { titul: t('Zapiš první uzávěrku'), meta: t('Kasa se spočítá po bankovkách.'), href: '/employer/overview?view=reports' },
  provoz: { titul: t('Projdi první postup'), meta: t('Otevírání a zavírání s odškrtáváním.'), href: '/employer/overview?view=procedures' },
});

/** Poznámka k výsledku ze serveru: počty a pevné věty se překládají, ostatní zůstane, jak přišla. */
function poznamkaVysledku(p: VysledekOperace, t: PrekladFn): string | undefined {
  const n = p.pocet ?? 0;
  if (p.poznamka && /^\d+ /.test(p.poznamka)) {
    switch (p.klic) {
      case 'smeny': return t('{n, plural, one {# typ směny} few {# typy směn} other {# typů směn}}', { n });
      case 'sklad': return t('{n, plural, one {# kategorie} few {# kategorie} other {# kategorií}}', { n });
      case 'postupy': return t('{n, plural, one {# postup} few {# postupy} other {# postupů}}', { n });
      case 'prehled': return t('{n, plural, one {# widget} few {# widgety} other {# widgetů}}', { n });
    }
  }
  switch (p.poznamka) {
    case 'Už je nastavené.': return t('Už je nastavené.');
    case 'Přehled už máte upravený, nechali jsme ho.': return t('Přehled už máte upravený, nechali jsme ho.');
    case 'Adresu a zemi se zatím uložit nepodařilo, doplníš je v Nastavení.': return t('Adresu a zemi se zatím uložit nepodařilo, doplníš je v Nastavení.');
    default: return p.poznamka;
  }
}

export default function Hotovo({ faze, vysledek, chyba, odp, naHotovo }: {
  faze: FazeSestaveni;
  vysledek: VysledekSestaveni | null;
  chyba: string;
  odp: Odpovedi;
  /** Animace doběhla: odemkne „Otevřít Přehled". */
  naHotovo: () => void;
}) {
  const t = useT('pruvodce');
  const odkazy = ODKAZY(t);
  const [radku, setRadku] = useState(0);
  const [dilu, setDilu] = useState(0);
  const dobehlo = useRef(false);
  const polozky = vysledek?.polozky ?? [];
  const dily = vysledek?.prehled.polozky ?? [];

  useEffect(() => {
    if (faze !== 'hotovo' || !vysledek) return;
    const omezeno = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hotovo = () => { if (!dobehlo.current) { dobehlo.current = true; naHotovo(); } };
    if (omezeno) { setRadku(polozky.length); setDilu(dily.length); hotovo(); return; }
    // Řetěz časovačů: nejdřív řádky po 160 ms, pak dílky po 60 ms, nakonec odemknutí.
    let casovac: ReturnType<typeof setTimeout>;
    const krok = (r: number, d: number) => {
      if (r < polozky.length) { setRadku(r + 1); casovac = setTimeout(() => krok(r + 1, d), KROK_RADKU_MS); return; }
      if (d < dily.length) { setDilu(d + 1); casovac = setTimeout(() => krok(r, d + 1), KROK_DILU_MS); return; }
      hotovo();
    };
    casovac = setTimeout(() => krok(0, 0), KROK_RADKU_MS);
    return () => clearTimeout(casovac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [faze, vysledek]);

  const tarif = doporucenyTarif(odp);
  const dalsi = (odp.cile?.length ? odp.cile : ['rozvrh', 'sklad', 'uzaverky']).filter(c => odkazy[c]).slice(0, 3);

  if (faze === 'chyba') {
    return <p role="alert" className="note note-danger text-[13px]" data-sestaveni-chyba>{chyba || t('Podnik se nepodařilo sestavit.')} {t('Nic se nezahodilo, stačí to zkusit znovu.')}</p>;
  }

  return (
    <div>
      <p className="sr-only" aria-live="polite">{faze === 'hotovo' && radku >= polozky.length ? t('Podnik je připravený.') : t('Sestavuji tvůj podnik.')}</p>
      <h2 className="t-section">{faze === 'bezi' || radku < polozky.length ? t('Sestavuji tvůj podnik…') : t('Hotovo, tohle se povedlo')}</h2>
      <ul className="list mt-2" aria-label={t('Výsledky sestavení')} aria-busy={faze === 'bezi'} data-vysledky>
        {faze === 'bezi' && <li className="list-row"><span aria-hidden className="h-5 w-5 shrink-0 rounded-full border-2 border-black/15" /><span className="t-meta">{t('Zakládám, co sis vybral…')}</span></li>}
        {polozky.map((p, i) => {
          const ukazano = i < radku;
          return (
            <li key={p.klic} className="list-row" data-vysledek={p.klic} data-stav={ukazano ? p.stav : 'ceka'}>
              {p.stav === 'chyba' && ukazano ? (
                <div className="note note-wait w-full text-[13px]">
                  <strong>{t(p.nazev)}</strong>{': '}{t('tohle jsme nestihli.')} {p.poznamka}
                </div>
              ) : (
                <>
                  <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                    !ukazano ? 'border-2 border-black/15' : p.stav === 'ok' ? 'bg-[#C8F542] on-accent' : 'bg-black/[0.08] text-black/55'}`}>
                    {ukazano && (p.stav === 'ok' ? <Icon name="check" size={12} strokeWidth={2.6} motion="draw" /> : <Icon name="minus" size={12} strokeWidth={2.6} />)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[15px] font-medium leading-snug ${ukazano ? 'text-[#16181A]' : 'text-black/45'}`}>
                      {ukazano && <span className="sr-only">{p.stav === 'ok' ? t('Hotovo') : t('Přeskočeno')}{': '}</span>}{t(p.nazev)}
                    </span>
                    {ukazano && p.poznamka && <span className="mt-0.5 block text-[13px] leading-snug text-black/55 text-pretty">{poznamkaVysledku(p, t)}</span>}
                  </span>
                </>
              )}
            </li>
          );
        })}
        {faze === 'hotovo' && polozky.length === 0 && <li className="list-row"><span className="t-meta">{t('Nebylo co zakládat, podnik zůstal, jak byl.')}</span></li>}
      </ul>

      {dily.length > 0 && (
        <div className="mt-5">
          <p className="t-label mb-2">{t('Tvůj Přehled · {n, plural, one {# widget} few {# widgety} other {# widgetů}}', { n: dily.length })}</p>
          <div className="pv-mini" data-mini-prehled aria-hidden>
            {dily.map((d, i) => {
              const def = najdiWidget(d.w);
              const vidno = i < dilu;
              return (
                <span key={`${d.w}-${i}`} className="pv-dil" data-v={d.s} data-w={d.w}
                  data-skryto={vidno ? undefined : ''} data-pristi={vidno ? '' : undefined}>
                  {def?.nazev ?? d.w}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {faze === 'hotovo' && radku >= polozky.length && (
        <div className="mt-6 rise-in">
          <h2 className="t-section">{t('Co dál')}</h2>
          <ul className="list mt-1" aria-label={t('Co dál')}>
            {dalsi.map(c => (
              <ListRow key={c} title={odkazy[c].titul} meta={odkazy[c].meta} href={odkazy[c].href} lead={<Icon name="chevronRight" size={16} className="text-black/40" />} />
            ))}
            <ListRow title={tarif === 'zdarma' ? t('Zdarma ti zatím stačí') : t('Vyzkoušet {tarif} {n} dní zdarma', { tarif: tarif === 'max' ? 'Max' : 'Pro', n: TRIAL_DAYS })}
              meta={tarif === 'max' ? t('Hosté a napojení pokladny.') : tarif === 'pro' ? t('Tablet u baru, větší tým a přehledy.') : t('Tarif můžeš změnit kdykoli v Nastavení.')}
              href={tarif === 'zdarma' ? undefined : '/employer/overview?view=settings'}
              right={<Chip tone={tarif === 'zdarma' ? 'ok' : 'muted'} size="sm">{tarif === 'zdarma' ? t('Zdarma') : tarif === 'max' ? 'Max' : 'Pro'}</Chip>} />
          </ul>
        </div>
      )}
    </div>
  );
}
