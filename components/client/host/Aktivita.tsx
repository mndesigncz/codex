'use client';

// Aktivita ve směru A „Peněženka“: jedno místo pro to, co podniky hostovi poslaly a co se mu stalo —
// +razítko a body u kasy, připravená a uplatněná odměna, potvrzení a změny rezervací, stav
// objednávky, novinky (jen od podniků se souhlasem), odpovědi na hodnocení a „Jak to bylo?“.
// Hlavička „3 nové · Aktivita“, filtr podle podniku čipy, skupiny po dnech (Dnes · Tento týden · Dřív)
// jako seznamy na skle: ikona v jamce (kalendář = rezervace, dárek = odměna, hvězda = body a razítka,
// zvonek = zpráva podniku), titulek, popis s podnikem a časem, nepřečtené s inkoustovou tečkou.
// Otevření schránky vynuluje odznak v doku.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../Icons';
import { Skeleton, ErrorState } from '../../ui';
import { HlavickaObrazovky, Monogram, NadpisSekce, PrazdnyStav, Radek, Seznam } from '../penezenka';
import { useCesta } from './cesty';
import { useHostShell } from '../ClientShell';
import { obnovHosta } from './data';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { okJson } from '@/lib/api';
import { RES_STATUS } from '@/lib/clientSlots';
import { pragueToday, pragueDaySafe, pragueHM, dayPlus } from '@/lib/pragueTime';

interface Polozka {
  id: string; typ: string; at: string; slug: string; podnik: string; accent?: string | null;
  delta?: number; zustatek?: number; karta?: { nazev: string; razitka?: number; cil: number }; nazev?: string;
  stav?: string; date?: string; time?: string; party?: number; odkaz?: { rezervace?: number };
  titul?: string; text?: string | null; hodnoceni?: number; poznamka?: string | null; ref?: string; kind?: string;
}

export default function Aktivita() {
  const t = useT('klient-host');
  const { setNeprecteno } = useHostShell();
  const [d, setD] = useState<{ polozky: Polozka[]; videno: string | null } | null>(null);
  const [chyba, setChyba] = useState('');
  const [filtr, setFiltr] = useState<string>('');
  const nacti = () => {
    setChyba('');
    fetch('/api/client/me/aktivita', { cache: 'no-store' }).then(okJson).then(x => {
      setD({ polozky: Array.isArray(x?.polozky) ? x.polozky : [], videno: x?.videno ?? null });
      // Schránka je otevřená: odznak pryč (zvýraznění nových zůstane, dokud host neodejde).
      fetch('/api/client/me/aktivita', { method: 'POST' }).then(() => setNeprecteno(0)).catch(() => {});
    }).catch(() => setChyba(t('Aktivita se nenačetla. Zkontroluj připojení.')));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(nacti, []);
  const podniky = useMemo(() => {
    const m = new Map<string, Polozka>();
    for (const p of d?.polozky ?? []) if (!m.has(p.slug)) m.set(p.slug, p);
    return Array.from(m.values());
  }, [d]);
  const jeNova = (p: Polozka) => !!d?.videno && p.at > d.videno && p.typ !== 'hodnotit';
  const novych = (d?.polozky ?? []).filter(jeNova).length;
  const vybrane = (d?.polozky ?? []).filter(p => !filtr || p.slug === filtr);
  const dnes = pragueToday();
  const skupiny: { klic: string; nazev: string; polozky: Polozka[] }[] = [
    { klic: 'dnes', nazev: t('Dnes'), polozky: vybrane.filter(p => pragueDaySafe(p.at) === dnes) },
    { klic: 'tyden', nazev: t('Tento týden'), polozky: vybrane.filter(p => { const den = pragueDaySafe(p.at) ?? ''; return den < dnes && den > dayPlus(dnes, -7); }) },
    { klic: 'driv', nazev: t('Dřív'), polozky: vybrane.filter(p => (pragueDaySafe(p.at) ?? '') <= dayPlus(dnes, -7)) },
  ].filter(s => s.polozky.length);

  return (
    <div>
      <HlavickaObrazovky
        nadtitulek={novych > 0 ? t('{n, plural, one {# nová} few {# nové} other {# nových}}', { n: novych }) : undefined}
        titulek={t('Aktivita')} />
      {/* Počítač: filtry podniků jako sloupec vlevo (sticky), časová osa vpravo. Telefon: čipy v řadě nad osou. */}
      <div className={podniky.length > 1 ? 'lg:grid lg:grid-cols-[13rem_minmax(0,42rem)] lg:items-start lg:gap-16' : 'max-w-2xl'}>
      {podniky.length > 1 && (
        <div className="-mx-[var(--hp-okraj)] md:mx-0 px-[var(--hp-okraj)] md:px-0 flex gap-2 overflow-x-auto scroll-fade-x pb-1 lg:sticky lg:top-24 lg:flex-col lg:items-start lg:overflow-visible lg:[mask-image:none] lg:[-webkit-mask-image:none] lg:pt-5" role="radiogroup" aria-label={t('Podnik')}>
          <button type="button" role="radio" aria-checked={!filtr} onClick={() => setFiltr('')} className="hp-cip shrink-0 tap-target">{t('Všechno')}</button>
          {podniky.map(p => (
            <button key={p.slug} type="button" role="radio" aria-checked={filtr === p.slug} onClick={() => setFiltr(p.slug)} className="hp-cip shrink-0 tap-target">{p.podnik}</button>
          ))}
        </div>
      )}
      <div className={podniky.length > 1 ? 'mt-2 lg:mt-0 min-w-0' : ''}>
        {chyba && !d ? <ErrorState title={t('Aktivita se nenačetla')} hint={chyba} onRetry={nacti} />
          : !d ? <div className="mt-6 space-y-3"><Skeleton className="h-16 rounded-[22px]" /><Skeleton className="h-16 rounded-[22px]" /><Skeleton className="h-16 rounded-[22px]" /></div>
          : !skupiny.length ? (
            <div className="mt-4 lgx hp-sklo">
              <PrazdnyStav titulek={t('Zatím klid')} text={t('Razítka, potvrzení rezervací a novinky od podniků se ukážou tady.')} />
            </div>
          ) : (
            <div>
              {skupiny.map((s, i) => (
                <section key={s.klic} aria-labelledby={`akt-${s.klic}`}>
                  <NadpisSekce id={`akt-${s.klic}`} titulek={s.nazev} className={i === 0 ? '!mt-5' : ''} />
                  <Seznam>
                    {s.polozky.map(p => p.typ === 'hodnotit'
                      ? <Hodnotit key={p.id} p={p} onHotovo={() => setD(x => x ? { ...x, polozky: x.polozky.filter(y => y.id !== p.id) } : x)} />
                      : <RadekAktivity key={p.id} p={p} nove={jeNova(p)} />)}
                  </Seznam>
                </section>
              ))}
            </div>
          )}
      </div>
      </div>
    </div>
  );
}

function RadekAktivity({ p, nove }: { p: Polozka; nove: boolean }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const cesta = useCesta();
  const den = pragueDaySafe(p.at);
  const kdy = den === pragueToday() ? pragueHM(new Date(p.at)) : den ? fmtDatum(den, { jazyk, styl: 'kratce' }) : '';
  let ikona = 'bell'; let titul = ''; let text: React.ReactNode = null; let href: string | undefined;
  switch (p.typ) {
    case 'razitko':
      ikona = 'star';
      titul = p.karta?.razitka != null && p.karta.cil ? t('+{n, plural, one {# razítko} few {# razítka} other {# razítek}} · {stav}', { n: p.delta ?? 1, stav: `${p.karta.razitka}/${p.karta.cil}` }) : t('+{n, plural, one {# razítko} few {# razítka} other {# razítek}}', { n: p.delta ?? 1 });
      href = cesta(`/client/${p.slug}`); break;
    case 'body':
      ikona = 'star';
      titul = (p.delta ?? 0) > 0 ? t('+{n} bodů', { n: p.delta ?? 0 }) : t('{n} b. za odměnu', { n: p.delta ?? 0 });
      break;
    case 'kredit': ikona = 'coins'; titul = (p.delta ?? 0) > 0 ? t('Kredit připsán') : t('Kredit uplatněn'); break;
    case 'odmena': ikona = 'gift'; titul = t('Odměna připravena: {odmena}', { odmena: p.nazev ?? '' }); href = cesta('/client/me/odmeny'); break;
    case 'uplatneno': ikona = 'gift'; titul = t('Uplatněno: {odmena}', { odmena: p.nazev ?? '' }); break;
    case 'rezervace': {
      ikona = 'calendar';
      const st = RES_STATUS[p.stav ?? ''] ?? RES_STATUS.requested;
      titul = p.stav === 'confirmed' ? t('Rezervace potvrzena') : p.stav === 'declined' ? t('Rezervaci podnik nepřijal') : p.stav === 'cancelled' ? t('Rezervace zrušena') : t(st.label);
      text = p.date ? <span className="hp-num">{fmtDatum(p.date, { jazyk, styl: 'denKratce' })} · {p.time} · {t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n: p.party ?? 1 })}</span> : null;
      href = cesta(`/client/${p.slug}?tab=reserve${p.odkaz?.rezervace ? `&rezervace=${p.odkaz.rezervace}` : ''}`); break;
    }
    case 'objednavka':
      ikona = 'cup';
      titul = p.stav === 'confirmed' ? t('Objednávka se připravuje') : p.stav === 'done' ? t('Objednávka hotová') : p.stav === 'declined' ? t('Objednávku podnik nepřijal') : t('Objednávka čeká na obsluhu');
      href = cesta(`/client/${p.slug}?tab=order`); break;
    case 'novinka': ikona = 'bell'; titul = p.titul ?? t('Novinka'); text = p.text; href = cesta(`/client/${p.slug}`); break;
    case 'odpoved':
      ikona = 'bell'; titul = t('Odpověď na tvoje hodnocení');
      text = <><span className="block">„{p.text}“</span>{p.poznamka ? <span className="block mt-1">{t('Tvoje hodnocení: {n} z 5 · {pozn}', { n: p.hodnoceni ?? 0, pozn: p.poznamka })}</span> : null}</>;
      break;
  }
  return (
    <Radek ikona={ikona} href={href} nahoru={!!text}
      titulek={titul}
      popis={
        <>
          {text && <span className="block text-[color:var(--hp-fg)] text-pretty">{text}</span>}
          <span className={`block truncate hp-num ${text ? 'mt-1' : ''}`}>{p.podnik}{kdy ? ` · ${kdy}` : ''}</span>
        </>
      }
      vpravo={nove ? <span className="flex h-5 items-center"><span className="block h-2 w-2 rounded-full bg-[var(--hp-fg)]" aria-hidden /><span className="sr-only">{t('Nové')}</span></span> : undefined}
    />
  );
}

/** „Jak to bylo v …?“ — hvězdy rovnou v řádku, nepovinná poznámka, nic víc. */
function Hodnotit({ p, onHotovo }: { p: Polozka; onHotovo: () => void }) {
  const t = useT('klient-host');
  const [hvezdy, setHvezdy] = useState(0);
  const [pozn, setPozn] = useState('');
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  const odeslat = async () => {
    if (!hvezdy) { setChyba(t('Vyber hvězdičky.')); return; }
    setBusy(true); setChyba('');
    try {
      const r = await fetch('/api/client/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: p.ref, rating: hvezdy, note: pozn }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setChyba(x.error ? t(x.error) : t('Nepovedlo se.')); return; }
      onHotovo(); void obnovHosta();
    } catch { setChyba(t('Nepovedlo se — vypadlo připojení.')); }
    finally { setBusy(false); }
  };
  return (
    <li className="px-4 py-3.5">
      <div className="flex items-center gap-3.5">
        <Monogram nazev={p.podnik} klic={p.slug} velikost={36} />
        <div className="min-w-0 flex-1">
          <p className="hp-silny">{t('Jak to bylo?')}</p>
          <p className="hp-meta mt-0.5">{p.podnik} · {p.kind === 'order' ? t('objednávka od stolu') : t('rezervace')}</p>
        </div>
      </div>
      {/* Hvězdy přes celou šířku řádku: pět cílů 44 px se vejde i na 320. */}
      <div className="mt-1.5 -ml-1.5 flex items-center" role="radiogroup" aria-label={t('Hodnocení')}>
        {[1, 2, 3, 4, 5].map(n => (
          <button key={n} type="button" role="radio" aria-checked={hvezdy === n} aria-label={t('{n} z 5', { n })} onClick={() => setHvezdy(n)}
            className={`h-11 w-11 shrink-0 rounded-full grid place-items-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--hp-fg)] ${n <= hvezdy ? 'text-[color:var(--hp-fg)]' : 'text-[color:var(--hp-faint)] hover:text-[color:var(--hp-muted)]'}`}>
            <Icon name="star" size={24} strokeWidth={1.6} className={n <= hvezdy ? 'fill-current' : ''} />
          </button>
        ))}
      </div>
      {hvezdy > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          <div className="hp-pole flex-1 min-w-[10rem] !min-h-[44px] !pr-4">
            <input value={pozn} onChange={e => setPozn(e.target.value)} placeholder={t('Pár slov, když chceš')} aria-label={t('Poznámka k hodnocení')} maxLength={500} className="!h-[42px]" />
          </div>
          <button type="button" onClick={() => void odeslat()} disabled={busy} className="hp-btn hp-btn-inkoust hp-btn-stredni shrink-0">{busy ? '…' : t('Odeslat')}</button>
        </div>
      )}
      {chyba && <p role="alert" className="mt-2 text-sm text-bad-ink">{chyba}</p>}
    </li>
  );
}
