'use client';

// Peněžní část okna „Dát trest" (kolo 96, sada V): sekce Peníze, Komu přejdou stržené peníze
// a Souhrn před uložením. Kreslí se jen s finance.mzdy (smi.penize) — bez něj okno dá jen body.
//
//  Peníze — přepínač tří legálních cest (docs/TRESTY-PENIZE.md kap. 1) jako díly ⅓ × 52:
//    Krácení nenárokové části (strop pod polem ze serveru), Náhrada škody (výše, druh, zavinění,
//    u schodku a ztráty dohoda o odpovědnosti s datem, kolik chtít, splátky; u nedbalosti strop
//    4,5násobku průměru — tvrdě hlídá server), Srážka z výplaty (částka, splátky). U srážky
//    i náhrady jedna věta, proč se strhne hned / až po souhlasu (smlouva). U víc lidí „každý X"
//    nebo „rozpočítat X".
//  Komu přejdou — Nechat podniku / Kdo to napravil (výběr lidí, rovným dílem nebo vlastní částky) /
//    Celá směna (rovným dílem osádce dne bez potrestaných).
//  Souhrn — „Jana: −300 Kč z prémie · Petr dostane +300 Kč · Podniku zůstane 0 Kč".

import React from 'react';
import { useT } from '@/lib/i18n/client';
import { MAX_SPLATEK, potrebujeSouhlas, vetaSouhlasu, type DruhSkody } from '@/lib/trestyPenize';
import { Field, Input, Segmented, Select, Switch } from '../ui';
import { VolbaDil } from '../ui/Volby';
import type { VyberLidi as DataVyberu } from '../tresty-penize/data';
import { prelozHlaskuTrestu } from './hlasky';
import { castkaPenez, castkyNaOsobu, type FormularPenez, type RezimPenez, type SouhrnPenez } from './penize';
import { VyberLidi } from './VyberLidi';

type Zmena = (z: Partial<FormularPenez>) => void;

/** Pole s měnou vpravo (jako krácení v okně). */
function PoleCastky({ id, value, onChange, symbol, disabled, max, ariaLabel, placeholder }: {
  id: string; value: string; onChange: (v: string) => void; symbol: string; disabled?: boolean; max?: number; ariaLabel?: string; placeholder?: string;
}) {
  return (
    <div className="relative min-w-0">
      <Input id={id} type="number" inputMode="numeric" min={0} max={max} step={1} value={value} disabled={disabled} aria-label={ariaLabel} placeholder={placeholder}
        onChange={e => onChange(e.target.value.replace(/\D/g, ''))} className="tabular-nums pr-12" />
      <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-black/45">{symbol}</span>
    </div>
  );
}

/** Splátky 1–12 (náhrada i srážka). */
function Splatky({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const t = useT('widgety');
  return (
    <Field id={id} label={t('Splátky')}>
      <Select id={id} value={value} onChange={e => onChange(e.target.value)}>
        {Array.from({ length: MAX_SPLATEK }, (_, i) => i + 1).map(n => (
          <option key={n} value={String(n)}>{n === 1 ? t('Najednou') : t('Rozložit do {n} výplat', { n })}</option>
        ))}
      </Select>
    </Field>
  );
}

/**
 * Věta, kdy se srážka / náhrada strhne. Jeden člověk se známou smlouvou = věta jádra (vetaSouhlasu);
 * víc lidí nebo smlouva neznámá (bez výplatní listiny) = obecná věta z briefu.
 */
export function VetaSouhlasu({ smlouvy }: { smlouvy: readonly (string | null | undefined)[] | null }) {
  const t = useT('widgety');
  let veta: string;
  if (smlouvy && smlouvy.length === 1 && smlouvy[0] !== undefined) veta = prelozHlaskuTrestu(t, vetaSouhlasu(smlouvy[0]));
  else if (smlouvy && smlouvy.length > 1 && smlouvy.every(s => s !== undefined)) {
    const ceka = smlouvy.filter(s => potrebujeSouhlas(s)).length;
    veta = ceka === smlouvy.length ? prelozHlaskuTrestu(t, vetaSouhlasu('HPP'))
      : t('{n} z {celkem} lidí má HPP, DPP nebo DPČ — u nich se strhne až po souhlasu v aplikaci, u OSVČ hned.', { n: ceka, celkem: smlouvy.length });
  } else veta = t('U HPP, DPP a DPČ se strhne až po souhlasu zaměstnance v aplikaci; u OSVČ hned.');
  return <p className="t-meta text-pretty" data-trest-souhlas>{veta}</p>;
}

export function SekcePenez({ f, zmen, pocetLidi, symbol, money, hintKraceni, chybaKraceni, kraceniVypnuto, maxKraceni, chybaNahrady, varovaniNahrady, smlouvy, dnes, jenKraceni = false }: {
  /** Úprava trestu: jen krácení (srážky se mění akcemi u řádku). */
  jenKraceni?: boolean;
  f: FormularPenez;
  zmen: Zmena;
  pocetLidi: number;
  symbol: string;
  money: (n: number) => string;
  /** Věta pod krácením (strop ze serveru, nebo proč krátit nejde). */
  hintKraceni: React.ReactNode;
  chybaKraceni: string | null;
  kraceniVypnuto: boolean;
  maxKraceni: number;
  chybaNahrady: string | null;
  /** Varování k náhradě (bez dat o výdělku). */
  varovaniNahrady?: string | null;
  /** Smlouvy vybraných lidí (undefined = neznámo), null = nevíme vůbec. */
  smlouvy: readonly (string | null | undefined)[] | null;
  dnes: string;
}) {
  const t = useT('widgety');
  const rezimy: { id: RezimPenez; text: string }[] = [
    { id: 'kraceni', text: t('Krácení nenárokové části') },
    { id: 'nahrada', text: t('Náhrada škody') },
    { id: 'srazka', text: t('Srážka z výplaty') },
  ];
  const druhy: { id: DruhSkody; text: string }[] = [
    { id: 'zavinena', text: t('Zaviněná škoda') },
    { id: 'schodek', text: t('Schodek') },
    { id: 'ztrata', text: t('Ztráta svěřených věcí') },
  ];
  const castka = castkaPenez(f);
  const naOsobu = castkyNaOsobu(f, pocetLidi);
  const davka = pocetLidi > 1;
  return (
    <section className="sloupec sloupec-4" aria-labelledby="trest-penize-nadpis" data-trest-penize={f.rezim}>
      <div className="min-w-0">
        <h3 id="trest-penize-nadpis" className={jenKraceni ? 'sr-only' : 'field-label'}>{t('Peníze z výplaty')}</h3>
        {!jenKraceni && (
          <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('Jak sáhnout na peníze')}>
            {rezimy.map(r => (
              <VolbaDil key={r.id} vybrano={f.rezim === r.id} onClick={() => zmen({ rezim: r.id })} data-rezim={r.id}>{r.text}</VolbaDil>
            ))}
          </div>
        )}
      </div>

      {f.rezim === 'kraceni' && (
        <Field id="trest-kraceni" label={davka ? (f.rozpocitat ? t('Krácení celkem') : t('Krácení každému')) : t('Krácení prémie')} error={chybaKraceni}
          hint={<><span className="block text-pretty" data-trest-strop>{hintKraceni}</span>
            <span className="block text-pretty mt-1">{t('Krátí se jen nenároková prémie za ten měsíc, ne mzda — peněžní postihy zákoník práce zakazuje (§ 346b).')}</span></>}>
          <PoleCastky id="trest-kraceni" value={f.kraceni} onChange={v => zmen({ kraceni: v })} symbol={symbol} disabled={kraceniVypnuto} max={maxKraceni} />
        </Field>
      )}

      {f.rezim === 'nahrada' && (
        <>
          <div className="min-w-0">
            <p className="field-label">{t('Druh škody')}</p>
            <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('Druh škody')}>
              {druhy.map(d => <VolbaDil key={d.id} vybrano={f.druhSkody === d.id} onClick={() => zmen({ druhSkody: d.id })} data-druh-skody={d.id}>{d.text}</VolbaDil>)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field id="trest-skoda" label={davka && f.rozpocitat ? t('Škoda celkem') : t('Výše škody')}>
              <PoleCastky id="trest-skoda" value={f.skoda} onChange={v => zmen({ skoda: v })} symbol={symbol} />
            </Field>
            <Field id="trest-nahrada" label={t('Chtít po člověku')} error={chybaNahrady}>
              <PoleCastky id="trest-nahrada" value={f.nahrada} onChange={v => zmen({ nahrada: v })} symbol={symbol} placeholder={f.skoda || undefined} />
            </Field>
          </div>
          <p className="t-meta text-pretty -mt-2">{t('Prázdné = celá škoda. Popis a fotka jsou ty z trestu výše.')}</p>
          {f.druhSkody === 'zavinena' ? (
            <div className="min-w-0">
              <p className="field-label">{t('Zavinění')}</p>
              <Segmented ariaLabel={t('Zavinění')} value={f.zavineni} onChange={v => zmen({ zavineni: v })}
                options={[{ id: 'nedbalost', label: t('Nedbalost') }, { id: 'umysl', label: t('Úmysl') }]} />
              <p className="t-meta text-pretty mt-1.5" data-trest-strop-nahrady>
                {f.zavineni === 'nedbalost'
                  ? t('U nedbalosti nejvýš 4,5násobek průměrného měsíčního výdělku — aplikace ho spočítá z výplat za poslední 3 měsíce.')
                  : t('U úmyslu jde chtít celou škodu.')}
              </p>
            </div>
          ) : (
            <div className="sloupec sloupec-3 well px-3 py-3" data-trest-dohoda>
              <label htmlFor="trest-dohoda" className="flex min-h-[var(--h-m)] items-center justify-between gap-3">
                <span className="min-w-0 text-sm font-semibold text-[#16181A] text-pretty" id="trest-dohoda-nazev">{t('Máme podepsanou dohodu o odpovědnosti')}</span>
                <Switch id="trest-dohoda" checked={f.dohoda} onChange={v => zmen({ dohoda: v })} labelledBy="trest-dohoda-nazev" />
              </label>
              {f.dohoda ? (
                <Field id="trest-dohoda-datum" label={t('Podepsaná dne')}>
                  <Input id="trest-dohoda-datum" type="date" max={dnes} value={f.dohodaDatum} className="appearance-none min-w-0" onChange={e => zmen({ dohodaDatum: e.target.value })} />
                </Field>
              ) : (
                <p className="t-meta text-pretty">{prelozHlaskuTrestu(t, 'Schodek a ztrátu svěřených věcí jde vymáhat jen s podepsanou dohodou o odpovědnosti — zaškrtni ji a doplň datum.')}</p>
              )}
            </div>
          )}
          {varovaniNahrady && <p className="note note-wait text-sm text-pretty">{prelozHlaskuTrestu(t, varovaniNahrady)}</p>}
          <Splatky id="trest-splatky" value={f.splatky} onChange={v => zmen({ splatky: v })} />
          <VetaSouhlasu smlouvy={smlouvy} />
        </>
      )}

      {f.rezim === 'srazka' && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field id="trest-srazka" label={davka ? (f.rozpocitat ? t('Srážka celkem') : t('Srážka každému')) : t('Kolik srazit')} error={chybaNahrady}>
              <PoleCastky id="trest-srazka" value={f.srazka} onChange={v => zmen({ srazka: v })} symbol={symbol} />
            </Field>
            <Splatky id="trest-splatky" value={f.splatky} onChange={v => zmen({ splatky: v })} />
          </div>
          <p className="t-meta text-pretty -mt-2">{t('Důvod srážky je „Co se stalo?“ — člověk ho uvidí v dohodě o srážce.')}</p>
          <VetaSouhlasu smlouvy={smlouvy} />
        </>
      )}

      {davka && (
        <div className="min-w-0" data-trest-rozpocitat>
          <Segmented ariaLabel={t('Jak rozdělit částku')} value={f.rozpocitat ? 'rozpocitat' : 'kazdy'} onChange={v => zmen({ rozpocitat: v === 'rozpocitat' })}
            options={[{ id: 'kazdy', label: t('Každý stejně') }, { id: 'rozpocitat', label: t('Rozpočítat') }]} />
          {castka > 0 && (
            <p className="t-meta text-pretty mt-1.5 tabular-nums">
              {f.rozpocitat
                ? t('{celkem} mezi {n} lidi — každý {castka}.', { celkem: money(castka), n: pocetLidi, castka: naOsobu.length && Math.min(...naOsobu) !== Math.max(...naOsobu) ? `${money(Math.min(...naOsobu))}–${money(Math.max(...naOsobu))}` : money(naOsobu[0] ?? 0) })
                : t('Každý z {n} lidí přijde o {castka}, celkem {celkem}.', { n: pocetLidi, castka: money(castka), celkem: money(castka * pocetLidi) })}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

export function SekceZaskoku({ f, zmen, vyber, vyberNacita, potrestani, den, closingId, symbol, ceka }: {
  f: FormularPenez;
  zmen: Zmena;
  vyber: DataVyberu | null;
  vyberNacita: boolean;
  /** Kdo trest dostává (sám sobě nic nepřevádí). */
  potrestani: readonly number[];
  den: string;
  closingId?: number | null;
  symbol: string;
  /** Strhává se srážka / náhrada, která počká na souhlas (peníze přejdou až s ní). */
  ceka: boolean;
}) {
  const t = useT('widgety');
  const volby: { id: FormularPenez['zaskokKomu']; text: string }[] = [
    { id: 'podnik', text: t('Nechat podniku') },
    { id: 'lide', text: t('Kdo to napravil') },
    { id: 'smena', text: t('Celá směna') },
  ];
  const jmeno = (id: number) => vyber?.lide.find(l => l.id === id)?.name ?? '';
  const osadka = [...new Set([...(vyber?.smena ?? []), ...(closingId ? vyber?.uzaverka ?? [] : [])])].filter(id => !potrestani.includes(id));
  const vybrani = f.zaskokLide.map(l => l.userId);
  const nastavLidi = (ids: number[]) => zmen({ zaskokLide: ids.map(id => ({ userId: id, castka: f.zaskokLide.find(l => l.userId === id)?.castka ?? '' })) });
  return (
    <section className="sloupec sloupec-4" aria-labelledby="trest-zaskok-nadpis" data-trest-zaskok={f.zaskokKomu}>
      <div className="min-w-0">
        <h3 id="trest-zaskok-nadpis" className="field-label">{t('Komu přejdou stržené peníze')}</h3>
        <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('Komu přejdou stržené peníze')}>
          {volby.map(v => <VolbaDil key={v.id} vybrano={f.zaskokKomu === v.id} onClick={() => zmen({ zaskokKomu: v.id })} data-zaskok={v.id}>{v.text}</VolbaDil>)}
        </div>
        <p className="t-meta text-pretty mt-1.5">
          {f.zaskokKomu === 'podnik' ? t('Peníze zůstanou podniku — třeba když to napravil vedoucí sám.')
            : f.zaskokKomu === 'lide' ? t('Kolega, který to napravil, dostane stržené peníze jako prémii k výplatě.')
              : osadka.length ? t('Rovným dílem všem, kdo byli ten den na směně: {jmena}.', { jmena: osadka.map(jmeno).filter(Boolean).join(', ') })
                : t('Na směně ten den nikdo další nebyl — vyber lidi, nebo nech částku podniku.')}
        </p>
        {ceka && f.zaskokKomu !== 'podnik' && <p className="t-meta text-pretty mt-1">{t('Ze srážky, která čeká na souhlas, přejdou peníze až s ní.')}</p>}
      </div>
      {f.zaskokKomu === 'lide' && (
        <>
          <VyberLidi id="zaskok" data={vyber} loading={vyberNacita} vybrani={vybrani} onChange={nastavLidi} den={den} closingId={closingId}
            krome={potrestani} ariaLabel={t('Kdo to napravil')} />
          {vybrani.length > 0 && (
            <div className="min-w-0">
              <Segmented ariaLabel={t('Jak rozdělit mezi kolegy')} value={f.zaskokZpusob} onChange={v => zmen({ zaskokZpusob: v })}
                options={[{ id: 'rovne', label: t('Rovným dílem') }, { id: 'castky', label: t('Vlastní částky') }]} />
              {f.zaskokZpusob === 'castky' && (
                <div className="sloupec sloupec-2 mt-3" data-zaskok-castky>
                  {f.zaskokLide.map(l => (
                    <div key={l.userId} className="grid grid-cols-[minmax(0,1fr)_minmax(0,9rem)] items-center gap-3">
                      <label htmlFor={`zaskok-castka-${l.userId}`} className="min-w-0 truncate text-sm font-medium text-[#16181A]">{jmeno(l.userId)}</label>
                      <PoleCastky id={`zaskok-castka-${l.userId}`} value={l.castka} symbol={symbol}
                        onChange={v => zmen({ zaskokLide: f.zaskokLide.map(x => (x.userId === l.userId ? { ...x, castka: v } : x)) })} />
                    </div>
                  ))}
                  <p className="t-meta">{t('Co kolegům nerozdělíš, zůstane podniku.')}</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Souhrn před uložením: kdo o co přijde, komu co přejde, kolik zůstane podniku. */
export function SouhrnPenezBlok({ s, rezim, money }: { s: SouhrnPenez; rezim: RezimPenez; money: (n: number) => string }) {
  const t = useT('widgety');
  if (!s.strhne.length) return null;
  const co = (jmeno: string, castka: number) => (rezim === 'kraceni'
    ? t('{jmeno}: −{castka} z prémie', { jmeno, castka: money(castka) })
    : rezim === 'nahrada' ? t('{jmeno}: −{castka} jako náhrada škody', { jmeno, castka: money(castka) })
      : t('{jmeno}: −{castka} srážkou z výplaty', { jmeno, castka: money(castka) }));
  return (
    <div className="well px-3 py-2.5 text-sm text-[#16181A]" data-trest-souhrn-penez aria-live="polite">
      <p className="t-label mb-1.5">{t('Souhrn')}</p>
      <ul className="sloupec sloupec-1">
        {s.strhne.map(x => (
          <li key={`s${x.userId}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums" data-souhrn-strhne={x.userId}>
            <span className="min-w-0 text-pretty">{co(x.jmeno, x.castka)}</span>
            {x.ceka && <span className="chip chip-wait chip-sm">{t('čeká na souhlas')}</span>}
          </li>
        ))}
        {s.prijme.map(x => (
          <li key={`p${x.userId}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 tabular-nums" data-souhrn-prijme={x.userId}>
            <span className="min-w-0 text-pretty">{t('{jmeno} dostane +{castka}', { jmeno: x.jmeno, castka: money(x.castka) })}</span>
            {x.poSouhlasu && <span className="chip chip-muted chip-sm">{t('až po souhlasu')}</span>}
          </li>
        ))}
        {(s.podniku > 0 || s.prijme.length === 0) && (
          <li className="text-black/60 tabular-nums" data-souhrn-podniku>{t('Podniku zůstane {castka}', { castka: money(s.podniku) })}</li>
        )}
      </ul>
      {s.chyba && <p className="mt-1.5 text-xs text-[var(--bad-ink)]" role="alert">{prelozHlaskuTrestu(t, s.chyba)}</p>}
    </div>
  );
}
