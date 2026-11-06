'use client';

// Karty (domov hosta, směr A „Peněženka“, předloha 01/02/03): pozdrav s křestním jménem a titul
// „Karty“, pod tím karty podniků jako balíček v peněžence — zadní zasunuté (kouká jen hlavička
// s hodnotou), přední vysunutá s velkým tenkým číslem a lištou razítek; dopředu jde karta
// s připravenou odměnou, jinak ta nejblíž odměně. Ťuk na kartu ji otevře přes celou obrazovku
// (OtevrenaKarta: koly razítek, QR, kód, trojice čísel); na počítači je otevřená karta s QR vpravo
// vedle balíčku a ťuk ji jen vymění. Pod balíčkem „Co tě čeká“ (rezervace v nejbližších dnech,
// odměna, které končí platnost, rozpracovaná objednávka, odměny k uplatnění) a slot „Přidat kartu
// podniku“ (sken stojánku nebo kód podniku). Barva podniku se nikde nevykresluje.

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useHostMe, useKartaHosta, useTed } from './data';
import { kartaZClenstvi, pripraveneOdmeny, pozdrav, krestni, dniDo, indexPredni, type KartaHosta } from './model';
import { useCesta } from './cesty';
import { useUKasy, useZivaOdezva, RadekOdezvy } from './UKasy';
import { AvatarHosta, useHostShell } from '../ClientShell';
import { BalicekKaret, HlavickaObrazovky, NadpisSekce, Seznam, Radek, PrazdnyStav, SlotPridat } from '../penezenka';
import OtevrenaKarta from './domov/OtevrenaKarta';
import DetailKarty from './domov/DetailKarty';
import { NabidkaKarty } from '../KartaNastroje';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { RES_STATUS } from '@/lib/clientSlots';
import { pragueHM } from '@/lib/pragueTime';

/** Počítač (≥ 1024 px): otevřená karta vpravo vedle balíčku místo okna přes celou obrazovku. */
function useJePocitac(): boolean {
  const [ano, setAno] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const zmena = () => setAno(mq.matches);
    zmena();
    mq.addEventListener('change', zmena);
    return () => mq.removeEventListener('change', zmena);
  }, []);
  return ano;
}

export default function Domov() {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const cesta = useCesta();
  const me = useHostMe();
  const karta = useKartaHosta();
  const { otevriNajit } = useHostShell();
  const ted = useTed();
  const pocitac = useJePocitac();
  const d = me.data;
  const odmeny = useMemo(() => pripraveneOdmeny(d), [d]);
  const hodina = Number(pragueHM(ted).slice(0, 2));
  const jmeno = krestni(d?.me?.name);

  // Karty v pořadí balíčku: zadní v pořadí z API (naposledy navštívené první), přední poslední.
  const { karty, predni } = useMemo(() => {
    const vse: KartaHosta[] = (d?.memberships ?? []).map((m: any) => kartaZClenstvi(m, odmeny, t));
    if (!vse.length) return { karty: vse, predni: -1 };
    const ip = indexPredni(vse);
    return { karty: [...vse.filter((_, i) => i !== ip), vse[ip]], predni: vse.length - 1 };
  }, [d, odmeny, t]);
  const [otevrena, setOtevrena] = useState<number | null>(null);
  const [vybrana, setVybrana] = useState<string | null>(null);
  const iHledana = karty.findIndex(k => k.slug === vybrana);
  const iVybrane = iHledana >= 0 ? iHledana : Math.max(0, predni);
  const naPocitaci = pocitac && karty.length > 0;
  useEffect(() => { if (pocitac) setOtevrena(null); }, [pocitac]);

  const hlavicka = (
    <HlavickaObrazovky nadtitulek={d ? (jmeno ? `${pozdrav(hodina, t)}, ${jmeno}` : pozdrav(hodina, t)) : ' '} titulek={t('Karty')}
      vpravo={<Link href={cesta('/client/me/profil')} className="md:hidden tap-target block rounded-full" aria-label={t('Moje')}>
        <AvatarHosta name={d?.me?.name ?? ''} size={42} />
      </Link>} />
  );

  if (me.chyba && !d) {
    return (
      <div className="mx-auto w-full max-w-[28rem]">
        {hlavicka}
        <PrazdnyStav titulek={t('Karty se nenačetly')} text={t('Zkontroluj připojení a zkus to znovu. Kód karty máš i bez signálu na offline stránce.')}
          akce={<button type="button" onClick={() => { void me.obnov(); }} className="hp-btn hp-btn-inkoust">{t('Zkusit znovu')}</button>} />
      </div>
    );
  }

  const dnes: string = d?.today ?? '';
  const rez = (d?.reservations ?? []).filter((r: any) => r.date >= dnes && ['requested', 'confirmed'].includes(r.status))
    .sort((a: any, b: any) => (a.date + a.time).localeCompare(b.date + b.time));
  const nejblizsi = rez.find((r: any) => (dniDo(r.date, dnes) ?? 99) <= 7) ?? null;
  const konci = odmeny.filter(o => { const n = dniDo(o.validUntil, dnes); return n != null && n >= 0 && n <= 7; }).sort((a, b) => String(a.validUntil).localeCompare(String(b.validUntil)))[0] ?? null;
  const objednavka = (d?.orders ?? []).find((o: any) => ['new', 'confirmed'].includes(o.status) && String(o.created_at ?? '').slice(0, 10) === dnes) ?? null;
  const ostatniOdmeny = odmeny.filter(o => o.id !== konci?.id);
  const kdy = (den: string) => (den === dnes ? t('Dnes') : dniDo(den, dnes) === 1 ? t('Zítra') : fmtDatum(den, { jazyk, styl: 'denKratce' }));
  const maCoCeka = !!(nejblizsi || konci || objednavka || ostatniOdmeny.length);

  return (
    <div className="mx-auto w-full max-w-[28rem] md:mx-0 lg:max-w-none">
      {hlavicka}
      <div className="lg:grid lg:grid-cols-[400px_minmax(0,1fr)] lg:items-start lg:gap-16">
        <div className="min-w-0">
          {/* Počítač: stejný řádek nad balíčkem jako „Karta 2 z 3 ⋯“ nad otevřenou kartou — horní hrany karet lícují. */}
          {naPocitaci && karty.length > 0 && <p className="hp-meta mb-3.5 hidden h-11 items-center lg:flex">{t('Moje karty')}</p>}
          {!d ? (
            <div role="status">
              <span className="sr-only">{t('Načítám karty')}</span>
              <ul className="hp-balicek" aria-hidden>
                {[0, 1].map(i => <li key={i} className="hp-zadni"><div className="hp-karta animate-pulse" /></li>)}
                <li className="hp-predni"><div className="hp-karta hp-karta-predni animate-pulse" /></li>
              </ul>
            </div>
          ) : karty.length ? (
            <BalicekKaret popis={t('Moje karty')} predni={naPocitaci ? iVybrane : predni}
              onOtevri={i => {
                // BalicekKaret dává dopředu `predni` a ostatní nechá v pořadí: index je index v `karty`.
                if (naPocitaci) setVybrana(karty[i].slug); else setOtevrena(i);
              }}
              karty={karty.map((k, i) => ({
                // Hodnotu vpravo v hlavičce mají jen zasunuté karty; přední ukazuje velké číslo.
                id: k.slug, nazev: k.nazev, klic: k.klic, logoUrl: k.logoUrl, popis: k.popis, hodnota: i === (naPocitaci ? iVybrane : predni) ? undefined : k.hodnota,
                cislo: k.cislo, z: k.z, stitek: k.stitek, razitka: k.razitka, postup: k.postup,
                ariaLabel: naPocitaci ? t('{karta}. Ukázat kartu s QR kódem', { karta: k.aria }) : t('{karta}. Otevřít kartu', { karta: k.aria }),
              }))} />
          ) : (
            <PrazdnyStav titulek={t('Přidej první podnik')} text={t('Naskenuj QR kód na stojánku nebo podnik najdi. Uvítací body dostaneš hned.')}
              akce={<>
                <button type="button" onClick={otevriNajit} className="hp-btn hp-btn-limetka">{t('Naskenovat')}</button>
                <Link href={cesta('/client')} className="hp-btn lgx hp-btn-sklo">{t('Najít podnik')}</Link>
              </>} />
          )}

          {d && maCoCeka && (
            <section aria-labelledby="h-ceka">
              <NadpisSekce id="h-ceka" titulek={t('Co tě čeká')} />
              <Seznam>
                {nejblizsi && (() => {
                  const st = RES_STATUS[nejblizsi.status] ?? RES_STATUS.requested;
                  return (
                    <Radek ikona="calendar" href={cesta(`/client/${nejblizsi.slug}?tab=reserve&rezervace=${nejblizsi.id}`)}
                      titulek={<span className="hp-num cz-sentence">{kdy(nejblizsi.date)} {nejblizsi.time} · {t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n: nejblizsi.party })}</span>}
                      popis={[nejblizsi.business, nejblizsi.note, t(st.label).toLowerCase()].filter(Boolean).join(' · ')} />
                  );
                })()}
                {konci && (
                  <Radek ikona="tag" href={cesta('/client/me/odmeny')} titulek={konci.title}
                    popis={`${konci.business} · ${(() => { const n = dniDo(konci.validUntil, dnes) ?? 0; return n === 0 ? t('platí jen dnes') : t('platí ještě {n, plural, one {# den} few {# dny} other {# dní}}', { n }); })()}`} />
                )}
                {objednavka && (
                  <Radek ikona="cup" href={cesta(`/client/${objednavka.slug}?tab=order`)}
                    titulek={objednavka.status === 'new' ? t('Objednávka čeká na obsluhu') : t('Objednávka se připravuje')} popis={objednavka.business} />
                )}
                {ostatniOdmeny.length > 0 && (
                  <Radek ikona="gift" href={cesta('/client/me/odmeny')}
                    titulek={t('{n, plural, one {# odměna čeká} few {# odměny čekají} other {# odměn čeká}} na uplatnění', { n: ostatniOdmeny.length })}
                    popis={[[...new Set(ostatniOdmeny.map(o => o.business))].join(', '), t('U kasy si ji přibalíš jedním přepínačem')].filter(Boolean).join(' · ')} />
                )}
              </Seznam>
            </section>
          )}

          {d && karty.length > 0 && (
            <SlotPridat className="mt-3 max-[359.98px]:[&>.hp-meta]:hidden" popis={t('Přidat kartu podniku')} napoveda={t('Naskenovat · Najít')} onClick={otevriNajit}
              ariaLabel={t('Přidat kartu podniku: naskenovat QR kód nebo zadat kód podniku')} />
          )}
        </div>

        {naPocitaci && karty[iVybrane] && (
          <KartaVedle k={karty[iVybrane]} index={iVybrane} pocet={karty.length} karta={karta} cesta={cesta} />
        )}
      </div>

      {!pocitac && otevrena != null && karty[otevrena] && (
        <OtevrenaKarta karty={karty} index={otevrena} onIndex={setOtevrena} onClose={() => setOtevrena(null)} karta={karta} cesta={cesta} />
      )}
    </div>
  );
}

/** Počítač: otevřená karta s QR vpravo vedle balíčku (bez okna). Živá odezva běží, dokud není otevřené U kasy. */
function KartaVedle({ k, index, pocet, karta, cesta }: { k: KartaHosta; index: number; pocet: number; karta: { data: any; chyba: string }; cesta: (c: string) => string }) {
  const t = useT('klient-host');
  const { otevreno: kasaOtevrena } = useUKasy();
  const { udalosti, vynuluj } = useZivaOdezva(!kasaOtevrena);
  const moje = udalosti?.filter(u => u.slug === k.slug) ?? [];
  return (
    <section aria-labelledby="h-otevrena" className="mt-8 min-w-0 max-w-[26rem] lg:sticky lg:top-24 lg:mt-0">
      {/* Řádek nástrojů má šířku karty: ⋯ patří ke kartě, ne k okraji stránky. */}
      <div className="mb-3.5 flex h-11 items-center justify-between gap-3">
        <p className="hp-meta hp-num">{pocet > 1 ? t('Karta {i} z {n}', { i: index + 1, n: pocet }) : t('Moje karta')}</p>
        <NabidkaKarty karta={karta.data} slug={k.slug} />
      </div>
      <div>
        <DetailKarty k={k} karta={karta} hrefPodniku={cesta(`/client/${k.slug}`)} idNadpisu="h-otevrena"
          odezva={moje.length ? <RadekOdezvy udalosti={moje} onSkryt={vynuluj} /> : undefined} />
      </div>
    </section>
  );
}
