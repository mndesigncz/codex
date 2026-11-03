'use client';

import Link from 'next/link';
import { Icon } from '@/components/Icons';
import { useT } from '@/lib/i18n/client';
import { HOSTE, HOSTE_FUNKCE } from '../obsah';

// Hosté: druhá půlka Managera (Managero client, tarif Max).
//
// Samostatná sekce mimo jeviště (.ld-jev), protože to se při scrollu lepí
// a přepíná scény ukázky podniku. Hostovská část má vlastní ukázku na
// /client/demo, sem patří jen vysvětlení a odkaz. Tarif Max je vidět hned
// u nadpisu, aby nikdo nečekal, že hosté jsou v tarifu zdarma.

const RAZITEK = 10;
const HOTOVO = 7;

export default function Hoste() {
  const t = useT('landing');
  return (
    <section id="hoste" className="ld-sekce" aria-labelledby="nadpis-hoste">
      <div className="ld-obsah">
        <div className="ld-hoste">
          <div className="min-w-0">
            <p className="ld-stitek-max">
              <span className="ld-tecka" aria-hidden />{t(HOSTE.max)}
            </p>
            <h2 id="nadpis-hoste" className="ld-h2 mt-5 max-w-[16em]">{t(HOSTE.nadpis)}</h2>
            <p className="ld-perex mt-5 max-w-[40ch]">{t(HOSTE.perex)}</p>
            <div className="ld-hoste-akce">
              <Link href="/client/demo" className="ld-btn ld-btn-svetle">
                {t(HOSTE.ukazka)} <Icon name="chevron" size={14} className="ld-sipka -rotate-90" aria-hidden />
              </Link>
              <a href="#cenik" className="ld-btn ld-btn-obrys">{t(HOSTE.cenik)}</a>
            </div>
            <p className="ld-meta mt-5 max-w-[44ch]">{t(HOSTE.poznamka)}</p>
          </div>

          <div className="ld-karta-host" role="img" aria-label={t(HOSTE.karta.popis)}>
            <div className="ld-karta-host-hlava" aria-hidden>
              <span className="ld-karta-host-titul">{t(HOSTE.karta.nadpis)}</span>
              <span className="ld-karta-host-uroven">{t(HOSTE.karta.uroven)}</span>
            </div>
            <div className="ld-razitka" aria-hidden>
              {Array.from({ length: RAZITEK }, (_, i) => (
                <span key={i} className="ld-razitko" data-ano={i < HOTOVO ? 'true' : 'false'}>
                  {i < HOTOVO && <Icon name="check" size={12} strokeWidth={2.4} />}
                </span>
              ))}
            </div>
            <div className="ld-karta-host-odmena" aria-hidden>
              <span>{t(HOSTE.karta.odmena)}</span>
              <span className="ld-karta-host-pocet">{t(HOSTE.karta.razitka, { hotovo: HOTOVO, celkem: RAZITEK })}</span>
            </div>
            <div className="ld-karta-host-qr" aria-hidden>
              <svg viewBox="0 0 21 21" fill="currentColor" shapeRendering="crispEdges">
                <path d="M0 0h7v7H0zM14 0h7v7h-7zM0 14h7v7H0z" />
                <path fill="#fff" d="M1 1h5v5H1zM15 1h5v5h-5zM1 15h5v5H1z" />
                <path d="M2 2h3v3H2zM16 2h3v3h-3zM2 16h3v3H2zM9 0h2v2H9zM9 4h3v2H9zM8 8h2v2H8zM12 8h3v2h-3zM16 9h2v2h-2zM19 8h2v3h-2zM9 12h3v2H9zM14 12h2v3h-2zM18 13h3v2h-3zM9 16h2v3H9zM12 17h3v2h-3zM17 17h2v2h-2zM19 19h2v2h-2zM12 19h2v2h-2z" />
              </svg>
              <span className="font-semibold">{t(HOSTE.karta.qr)}</span>
            </div>
            <div className="ld-karta-host-wallet" aria-hidden>{t(HOSTE.karta.wallet)}</div>
          </div>
        </div>

        <h3 className="ld-h3 mt-20 text-[color:var(--ld-text-2)]">{t(HOSTE.seznam)}</h3>
        <ul className="ld-hoste-seznam">
          {HOSTE_FUNKCE.map(f => (
            <li key={f.title} className="ld-hoste-polozka">
              <span className="ld-hoste-ikona" aria-hidden><Icon name={f.icon} size={18} /></span>
              <h4 className="mt-4 text-base font-semibold text-[color:var(--ld-papir)]">{t(f.title)}</h4>
              <p className="ld-meta mt-2">{t(f.text)}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
