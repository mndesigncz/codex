import Link from 'next/link';
import { Icon } from '@/components/Icons';
import VObraze from '../VObraze';
import { KROKY, TYPY_PODNIKU } from '../obsah';

// Jak začít: tři kroky, a u každého malá obrazovka, ve které se ten krok
// opravdu stane. Na jevišti svítí jen aplikace, takže i tady nese sdělení
// světlá obrazovka, ne odstavec: typ podniku se vybere, kód se naťuká a tým
// se připojí, rozvrh se vyplní a zveřejní. Přehraje se jednou, když sekce
// přijede do obrazu, a zůstane v koncovém stavu (bez skriptu a s vypnutým
// pohybem je vidět rovnou konec). Lidé a kód jsou z ukázkových dat.
//
// Čas se tu záměrně neslibuje číslem: „za 5 minut" tvrdit, dokud průvodce není
// změřený, by bylo vymyšlené.

const KOD = ['K', '7', 'M', '2', 'Q', 'X'];
const PRIPOJENI = [{ jmeno: 'Petra Marešová', emoji: '🧑‍🍳' }, { jmeno: 'Tomáš Dvořák', emoji: '🧔' }, { jmeno: 'Eliška Nováková', emoji: '👩' }];
const DNY = ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'];
// Směny v týdnu: [den od, den do) a barva typu směny (barvy směn z aplikace).
const RADKY: { jmeno: string; smeny: { od: number; do: number; barva: string }[] }[] = [
  { jmeno: 'Eliška', smeny: [{ od: 0, do: 2, barva: '#C8F542' }, { od: 4, do: 6, barva: '#FCD34D' }] },
  { jmeno: 'Petra', smeny: [{ od: 1, do: 4, barva: '#7DD3FC' }, { od: 5, do: 7, barva: '#C8F542' }] },
  { jmeno: 'Tomáš', smeny: [{ od: 2, do: 5, barva: '#FCD34D' }] },
];

function ObrazovkaTyp() {
  return (
    <div className="ld-mini">
      <p className="ld-mini-titul">Jaký podnik vedeš?</p>
      <ul className="mt-3 grid grid-cols-2 gap-1.5 list-none">
        {TYPY_PODNIKU.map((t, i) => (
          <li key={t} className={`ld-mini-dlazdice ${i === 0 ? 'ld-vyber' : ''}`}>
            <span className="truncate">{t}</span>
            {i === 0 && <span className="ld-vyber-fajfka" aria-hidden><Icon name="check" size={11} /></span>}
          </li>
        ))}
      </ul>
      <div className="ld-mini-tlacitko mt-3">Pokračovat</div>
    </div>
  );
}

function ObrazovkaKod() {
  return (
    <div className="ld-mini">
      <p className="ld-mini-titul">Kód pro připojení</p>
      <p className="mt-2 flex gap-1" aria-label="Kód K7M2QX">
        {KOD.map((z, i) => (
          <span key={i} className="ld-kod-znak" style={{ ['--i' as string]: i }}>{z}</span>
        ))}
      </p>
      <ul className="mt-4 space-y-1.5 list-none">
        {PRIPOJENI.map((p, i) => (
          <li key={p.jmeno} className="ld-pripojeni" style={{ ['--i' as string]: i }}>
            <span className="ld-mini-avatar" aria-hidden>{p.emoji}</span>
            <span className="min-w-0 flex-1 truncate">{p.jmeno}</span>
            <span className="ld-mini-chip">připojen{p.jmeno.startsWith('Tomáš') ? '' : 'a'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ObrazovkaRozvrh() {
  return (
    <div className="ld-mini">
      <div className="flex items-center justify-between gap-2">
        <p className="ld-mini-titul">Rozvrh, příští týden</p>
        <span className="ld-zverejneno"><Icon name="check" size={11} aria-hidden /> Zveřejněno</span>
      </div>
      <div className="ld-tyden mt-3" role="img" aria-label="Rozvrh na týden se směnami tří lidí">
        <span />
        {DNY.map(d => <span key={d} className="ld-tyden-den">{d}</span>)}
        {RADKY.map((r, ri) => (
          <div key={r.jmeno} className="contents">
            <span className="ld-tyden-jmeno">{r.jmeno}</span>
            <div className="ld-tyden-radek">
              {r.smeny.map((s, si) => (
                <span key={si} className="ld-smena"
                  style={{ gridColumn: `${s.od + 1} / ${s.do + 1}`, background: s.barva, ['--i' as string]: ri * 2 + si }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const OBRAZOVKY = [ObrazovkaTyp, ObrazovkaKod, ObrazovkaRozvrh];

export default function JakZacit() {
  return (
    <section id="zacatek" className="ld-sekce" aria-labelledby="nadpis-zacatek">
      <div className="ld-obsah">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-x-16 gap-y-6 items-end">
          <h2 id="nadpis-zacatek" className="ld-h2">Jak se začíná</h2>
          <p className="ld-perex max-w-[40ch]">Tři kroky. Bez schůzky, bez implementace a bez toho, aby se celý tým musel něco učit.</p>
        </div>

        <VObraze as="ol" className="ld-kroky mt-14 sm:mt-20 grid grid-cols-1 md:grid-cols-3 gap-x-6 lg:gap-x-8 gap-y-14 list-none">
          {KROKY.map((k, i) => {
            const Obrazovka = OBRAZOVKY[i];
            return (
              <li key={k.n} className="ld-krok relative" style={{ ['--k' as string]: i }}>
                <Obrazovka />
                <div className="mt-8 flex items-baseline gap-4">
                  <span className="ld-krok-cislo ld-cislo" aria-hidden>{k.n}</span>
                  <h3 className="ld-h3">{k.title}</h3>
                </div>
                <p className="ld-text mt-3 max-w-[36ch]">{k.text}</p>
              </li>
            );
          })}
        </VObraze>

        <div className="mt-14 flex flex-col sm:flex-row sm:items-center gap-4">
          <Link href="/register" className="ld-btn ld-btn-svetle w-full sm:w-auto">
            Založit podnik <Icon name="chevron" size={15} className="ld-sipka -rotate-90" aria-hidden />
          </Link>
          <p className="ld-meta">Kartu chceme až na konci, a jen když si vybereš placený tarif.</p>
        </div>
      </div>
    </section>
  );
}
