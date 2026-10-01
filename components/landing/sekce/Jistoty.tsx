'use client';

import { Icon } from '@/components/Icons';
import { formatMoney } from '@/lib/money';
import VObraze from '../VObraze';
import { useT } from '@/lib/i18n/client';
import { JISTOTY, JISTOTY_NADPIS, MINI_JISTOTY as M } from '../obsah';

// Jistoty: poslední, co člověk vidí, než uvidí cenu. Šest slibů, a u každého
// kousek aplikace, který ho dokazuje: export souboru, role se zamčenými mzdami,
// tablet se jmény, hláška bez připojení, přepínač měny, zamčená uzávěrka.
// Text pod tím jen pojmenuje, co je vidět. Mozaika má tři řádky v poměrech
// 3:3, 4:2 a 2:4, ať to není šest stejných karet. Lidé a částky jsou z ukázkových
// dat; žádná z obrazovek netvrdí nic, co aplikace neumí.

function Export() {
  const t = useT('landing');
  return (
    <div className="ld-mini ld-mini-nizka">
      {M.soubory.map((s, i) => (
        <div key={s} className="ld-soubor" style={{ ['--i' as string]: i }}>
          <Icon name="archive" size={13} aria-hidden />
          <span className="min-w-0 flex-1 truncate">{s}</span>
          <span className="ld-mini-chip">{t(M.stahnout)}</span>
        </div>
      ))}
    </div>
  );
}

function Role() {
  const t = useT('landing');
  const r = [
    { kdo: M.vlastnik, mzdy: true, finance: true },
    { kdo: M.manazer, mzdy: true, finance: true },
    { kdo: M.brigadnik, mzdy: false, finance: false },
  ];
  return (
    <div className="ld-mini ld-mini-nizka">
      <div className="ld-role ld-role-hlava"><span /><span>{t(M.mzdy)}</span><span>{t(M.finance)}</span></div>
      {r.map((x, i) => (
        <div key={x.kdo} className="ld-role" style={{ ['--i' as string]: i }}>
          <span className="font-semibold">{t(x.kdo)}</span>
          {[x.mzdy, x.finance].map((v, j) => (
            <span key={j} className={v ? 'ld-role-ano' : 'ld-role-ne'} aria-label={t(v ? M.vidi : M.nevidi)}>
              <Icon name={v ? 'check' : 'lock'} size={11} aria-hidden />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Tablet() {
  const t = useT('landing');
  const lide = [
    { jmeno: 'Eliška', emoji: '👩' }, { jmeno: 'Petra', emoji: '🧑‍🍳' }, { jmeno: 'Tomáš', emoji: '🧔' }, { jmeno: 'Jakub', emoji: '🧑' },
  ];
  return (
    <div className="ld-mini ld-mini-nizka">
      <p className="ld-mini-titul">{t(M.kdoJsi)}</p>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        {lide.map((l, i) => (
          <div key={l.jmeno} className={`ld-jmeno ${i === 1 ? 'ld-jmeno-tuk' : ''}`}>
            <span className="text-lg leading-none" aria-hidden>{l.emoji}</span>
            <span className="mt-1 truncate">{l.jmeno}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Wifi() {
  const t = useT('landing');
  return (
    <div className="ld-mini ld-mini-nizka">
      <div className="ld-offline">
        <span className="ld-offline-tecka" aria-hidden />
        <span className="min-w-0">
          <span className="block font-semibold">{t(M.bezPripojeni)}</span>
          <span className="block text-black/60">{t(M.pockaji, { n: 2 })}</span>
        </span>
      </div>
    </div>
  );
}

function Mena() {
  const t = useT('landing');
  return (
    <div className="ld-mini ld-mini-nizka">
      <div className="ld-mena" role="img" aria-label={t(M.mena)}>
        <span className="ld-mena-on">CZK</span><span>EUR</span><span>PLN</span>
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[11px]">
        <span className="font-semibold">{t(M.trzba)}</span>
        <span className="ld-cislo font-bold">{formatMoney(16480, 'CZK')}</span>
      </div>
    </div>
  );
}

function Uzaverka() {
  const t = useT('landing');
  const ukoly = M.ukoly;
  return (
    <div className="ld-mini ld-mini-nizka">
      <div className="flex items-center justify-between gap-2">
        <p className="ld-mini-titul">{t(M.predUzaverkou, { hotovo: 2, celkem: ukoly.length })}</p>
        <span className="ld-zamek"><Icon name="lock" size={11} aria-hidden /> {t(M.zamcena)}</span>
      </div>
      <ul className="mt-2.5 space-y-1 list-none">
        {ukoly.map((u, i) => (
          <li key={u} className={`ld-ukol ${i < 2 ? 'ld-ukol-hotovo' : ''}`}>
            <span className="ld-ukol-box" aria-hidden>{i < 2 && <Icon name="check" size={10} />}</span>{t(u)}
          </li>
        ))}
      </ul>
    </div>
  );
}

const VIZUAL = [Export, Role, Tablet, Wifi, Mena, Uzaverka];
// Šířka dlaždice v šestisloupcové mozaice (od 1024 px).
const SIRKA = ['lg:col-span-3', 'lg:col-span-3', 'lg:col-span-4', 'lg:col-span-2', 'lg:col-span-2', 'lg:col-span-4'];

export default function Jistoty() {
  const t = useT('landing');
  return (
    <section id="jistoty" className="ld-sekce" aria-labelledby="nadpis-jistoty">
      <div className="ld-obsah">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-x-16 gap-y-6 items-end">
          <h2 id="nadpis-jistoty" className="ld-h2">{t(JISTOTY_NADPIS.nadpis)}</h2>
          <p className="ld-perex max-w-[40ch]">{t(JISTOTY_NADPIS.perex)}</p>
        </div>
        <VObraze as="ul" className="ld-jistoty mt-14 sm:mt-20 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 list-none">
          {JISTOTY.map((j, i) => {
            const Vizual = VIZUAL[i];
            return (
              <li key={j.title} className={`ld-jistota ${SIRKA[i]}`} style={{ ['--k' as string]: i }}>
                <Vizual />
                <h3 className="mt-6 text-xl font-semibold tracking-tight">{t(j.title)}</h3>
                <p className="ld-text mt-2 max-w-[44ch]">{t(j.text)}</p>
              </li>
            );
          })}
        </VObraze>
      </div>
    </section>
  );
}
