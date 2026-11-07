'use client';

// Ťuk na kartu v balíčku (telefon): karta otevřená přes celou obrazovku (předloha 03). Nahoře šipka
// dolů (zpět do balíčku), „Karta 2 z 3“ a ⋯ s nástroji karty (Wallet, obrázek, plocha). Pod tím
// DetailKarty (karta s koly razítek, věta, QR s kódem a trojicí) a dole zasunuté ostatní karty
// „+N karty“ — ťuk přepne na další. Dokud je karta otevřená, běží živá odezva od čtečky u kasy:
// nové razítko docvakne (RazitkaKolecka noveOd) a nad panelem se objeví „+1 · Razítko připsáno“.

import { useT } from '@/lib/i18n/client';
import { KruhoveTlacitko, ZasunuteKarty } from '../../penezenka';
import { NabidkaKarty } from '../../KartaNastroje';
import CelaObrazovka, { ListaOkna } from './CelaObrazovka';
import DetailKarty from './DetailKarty';
import { UkazkaNacteni, popisZasunutych } from './spolecne';
import { useUKasy, useZivaOdezva, RadekOdezvy } from '../UKasy';
import type { KartaHosta } from '../model';

export default function OtevrenaKarta({ karty, index, onIndex, onClose, karta, cesta }: {
  /** Karty v pořadí balíčku (shora dolů, přední poslední). */
  karty: KartaHosta[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  karta: { data: any; chyba: string };
  cesta: (c: string) => string;
}) {
  const t = useT('klient-host');
  const { otevreno: kasaOtevrena } = useUKasy();
  const k = karty[index];
  const { udalosti, vynuluj } = useZivaOdezva(!!k && !kasaOtevrena);
  if (!k) return null;
  const ostatni = [...karty.slice(index + 1), ...karty.slice(0, index)];
  const dalsi = ostatni[0];
  const mojeUdalosti = udalosti?.filter(u => u.slug === k.slug) ?? [];
  return (
    <CelaObrazovka open onClose={onClose} label={t('Karta {podnik}', { podnik: k.nazev })}>
      <ListaOkna
        vlevo={<KruhoveTlacitko ikona="chevron" popis={t('Zavřít kartu')} onClick={onClose} />}
        stred={karty.length > 1 ? <p className="hp-meta hp-num">{t('Karta {i} z {n}', { i: index + 1, n: karty.length })}</p> : null}
        vpravo={<NabidkaKarty karta={karta.data} slug={k.slug} />} />
      <DetailKarty k={k} karta={karta} hrefPodniku={cesta(`/client/${k.slug}`)}
        odezva={mojeUdalosti.length ? <RadekOdezvy udalosti={mojeUdalosti} onSkryt={vynuluj} /> : undefined}
        dole={<UkazkaNacteni slug={k.slug} className="mt-3" />} />
      <div className="flex-1" />
      {dalsi ? (
        <div className="mt-6 pt-2 pb-[env(safe-area-inset-bottom)]">
          <ZasunuteKarty karty={ostatni.map(o => ({ nazev: o.nazev, klic: o.klic, logoUrl: o.logoUrl }))}
            popis={popisZasunutych(ostatni, t)}
            hodnota={t('+{n, plural, one {# karta} few {# karty} other {# karet}}', { n: ostatni.length })}
            ariaLabel={t('Přepnout na kartu {podnik}', { podnik: dalsi.nazev })}
            onClick={() => onIndex(karty.indexOf(dalsi))} />
        </div>
      ) : <div className="h-8" />}
    </CelaObrazovka>
  );
}
