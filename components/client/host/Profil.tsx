'use client';

// Moje (profil hosta, z avataru) ve směru A „Peněženka“: hlavička (e-mail, jméno, avatar 56), karta hosta
// jako inkoustový předmět (MC, kód prostrkaně, ťuk = U kasy), tři skutečná čísla tenkými display číslicemi
// (karty, body, návštěvy — žádné „ušetřeno“ odhadem) a akce karty jako pilulky; pak sekce přes
// NadpisSekce a Seznam s Radkem: moje karta (Wallet, obrázek, plocha), plastové karty, návštěvy
// (rezervace a objednávky), osobní údaje, jazyk a vzhled, pozvi kamaráda, „Oznámení a soukromí“
// (souhlasy po podnicích, stažení dat, provozovatel, smazání účtu — na konci) a odhlášení.
// Názvy sekcí drží cesty z právních dokumentů („Moje → Oznámení a soukromí“, „Moje → Smazat účet“).

import { useEffect, useState } from 'react';
import { Skeleton, ErrorState } from '../../ui';
import UcetHosta from '../UcetHosta';
import KartaNastroje from '../KartaNastroje';
import KartickyHosta from '../KartickyHosta';
import { AvatarHosta } from '../ClientShell';
import { HlavickaObrazovky, NadpisSekce, InkoustovaKarta } from '../penezenka';
import { useUKasy } from './UKasy';
import { kartaZClenstvi } from './model';
import { Shrnuti, JazykAVzhled, Navstevy, PozviKamarada, OsobniUdaje, PrepnoutNaPodnik, ZpetNaKartu } from './ucet/CastiProfilu';
import { useHostMe, useKartaHosta } from './data';
import { useJeDemo } from './cesty';
import { useT } from '@/lib/i18n/client';
import { odhlasit } from '@/lib/odhlaseni';
import { Icon } from '../../Icons';

export default function Profil() {
  const t = useT('klient-host');
  const demo = useJeDemo();
  const me = useHostMe();
  const karta = useKartaHosta();
  const { otevri } = useUKasy();
  const d = me.data;
  const [flash, setFlash] = useState('');
  useEffect(() => { if (flash) { const i = setTimeout(() => setFlash(''), 4000); return () => clearTimeout(i); } }, [flash]);
  if (me.chyba && !d) return <ErrorState title={t('Profil se nenačetl')} hint={t('Zkontroluj připojení a zkus to znovu.')} onRetry={() => { void me.obnov(); }} />;
  if (!d) return <div className="max-w-2xl space-y-4"><Skeleton className="h-16 rounded-[22px]" /><Skeleton className="h-24 rounded-[22px]" /><Skeleton className="h-60 rounded-[22px]" /></div>;
  const clenstvi: any[] = d.memberships ?? [];
  const navstev = clenstvi.reduce((a, m) => a + (Number(m.visits) || 0), 0);
  const body = clenstvi.reduce((a, m) => a + (Number(m.points) || 0), 0);

  // Nejvyšší úroveň napříč podniky (podle slevy) do popisu karty hosta.
  const urovne = clenstvi.map(m => kartaZClenstvi(m, [], t).uroven).filter(u => u.id !== 'bronze');
  const nejUroven = urovne.sort((a, b) => b.sleva - a.sleva)[0] ?? null;

  return (
    <div className="pb-4">
      <HlavickaObrazovky nadtitulek={d.me?.email} titulek={<span className="block truncate">{d.me?.name}</span>}
        vpravo={<AvatarHosta name={d.me?.name ?? ''} size={56} />} />
      {flash && <p role="status" className="mb-4 toast-in note note-ok">{flash}</p>}

      {/* Počítač: vlevo karta hosta a to, co s ní souvisí; vpravo údaje a nastavení. Telefon: pod sebou. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
        <div className="min-w-0">
          {/* Moje karta: inkoustový předmět Managero client (MC), prostrkaný kód, ťuk = U kasy. */}
          <section id="karta" aria-labelledby="h-karta" className="scroll-mt-24">
            <h2 id="h-karta" className="sr-only">{t('Moje karta')}</h2>
            {karta.data?.code ? (
              <InkoustovaKarta varianta="predni" nazev="Managero client" klic="managero-client"
                popis={[d.me?.name, nejUroven?.nazev].filter(Boolean).join(' · ')}
                hodnota={t('{n, plural, one {# karta} few {# karty} other {# karet}}', { n: clenstvi.length })}
                onClick={() => otevri()} ariaLabel={t('Moje karta {kod}. Ukázat u kasy', { kod: karta.data.code })}>
                <span className="mt-auto flex items-end justify-between gap-3 pt-5">
                  <span className="min-w-0">
                    <span className="block text-[12px] text-[color:var(--hp-karta-tlume)]">{t('Platí ve všech podnicích')}</span>
                    <span className="hp-kod mt-1 block truncate text-[24px] font-[350] text-[color:var(--hp-paper)]">{karta.data.code}</span>
                  </span>
                  <span className="hp-darek hp-on !h-9 !w-9" aria-hidden><Icon name="qr" size={17} strokeWidth={1.7} /></span>
                </span>
              </InkoustovaKarta>
            ) : <p className="hp-meta px-1">{t('Karta se nenačetla.')}</p>}
            <div className="mt-5"><Shrnuti karty={clenstvi.length} body={body} navstevy={navstev} /></div>
            {karta.data?.code && (
              <div className="mt-5">
                <KartaNastroje karta={karta.data} podniky={clenstvi.map(m => ({ slug: m.slug, name: m.name }))} />
              </div>
            )}
          </section>

          <KartickyHosta />

          <Navstevy d={d} />

          {karta.data?.code && <PozviKamarada code={karta.data.code} onFlash={setFlash} />}
        </div>

        <div className="min-w-0 hp-sloupec">
          <OsobniUdaje me={d.me} onSaved={() => { setFlash(t('Uloženo.')); void me.obnov(); }} />

          <JazykAVzhled />

          <UcetHosta novinky={d.me?.novinky === true} novinkyEmail={d.me?.novinkyEmail !== false} onFlash={setFlash} />

          <div className="mt-8 grid gap-3">
            {!demo && <PrepnoutNaPodnik onFlash={setFlash} />}
            {!demo && (
              <button type="button" onClick={() => odhlasit({ callbackUrl: '/client' })} className="hp-btn lgx hp-btn-sklo hp-btn-blok"><Icon name="logout" size={17} />{t('Odhlásit se')}</button>
            )}
            {demo && <ZpetNaKartu />}
          </div>
        </div>
      </div>
    </div>
  );
}
