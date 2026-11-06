// Obálka podniku (směr A): inkoustová plocha s krémovými letokruhy a velkým lehkým názvem
// (display 80/250), nahoře kulatá tlačítka na skle (zpět · sdílet · uložit). Pod ní `ListObalky`
// vyjede o 28 px přes spodní hranu obálky a nese obsah stránky. Tvář podniku bez cizí barvy:
// textura podle slugu, na obálce vždy letokruhy (klid, ať název vynikne).
// Na telefonu jde obálka přes celou šířku až pod stavový řádek (`prosah`), od md je to karta.

import Link from 'next/link';
import { Icon } from '../../Icons';

export function ObalkaPodniku({ nazev, nadpis, vlevo, vpravo, prosah = true, children, className = '' }: {
  /** Velký lehký název (krátká podoba jména, „U Lípy“). */
  nazev: React.ReactNode;
  /** Malý řádek nad názvem („Kavárna a pražírna · od 2014“). */
  nadpis?: React.ReactNode;
  /** Vlevo nahoře (zpět). */
  vlevo?: React.ReactNode;
  /** Vpravo nahoře (sdílet, uložit). */
  vpravo?: React.ReactNode;
  prosah?: boolean;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`hp-obalka ${prosah ? 'hp-obalka-prosah' : ''} ${className}`}>
      <span className="hp-tex" aria-hidden />
      {(vlevo || vpravo) && (
        <div className="hp-obalka-lista">
          <div className="flex gap-2">{vlevo}</div>
          <div className="flex gap-2">{vpravo}</div>
        </div>
      )}
      <div className="hp-obalka-nazev">
        {nadpis != null && <p className="hp-obalka-nadpis">{nadpis}</p>}
        <p className="hp-display" aria-hidden>{nazev}</p>
      </div>
      {children}
    </section>
  );
}

/** List přes obálku (vyjede o 28 px přes její spodní hranu). */
export function ListObalky({ children, prosah = true, className = '' }: { children: React.ReactNode; prosah?: boolean; className?: string }) {
  return <div className={`hp-list ${prosah ? 'hp-list-prosah' : ''} ${className}`}>{children}</div>;
}

/** Kulaté tlačítko 40 px (cíl 44): `obalka` = sklo na inkoustu, `sklo` = světlé sklo na plátně (s .lgx). */
export function KruhoveTlacitko({ ikona, popis, onClick, href, varianta = 'sklo', pressed, className = '' }: {
  ikona: string;
  /** Jméno pro odečítač (povinné, tlačítko nemá text). */
  popis: string;
  onClick?: () => void;
  href?: string;
  varianta?: 'obalka' | 'sklo';
  /** Přepínač (uložit podnik): aria-pressed. */
  pressed?: boolean;
  className?: string;
}) {
  const cls = `hp-kruh tap-target ${varianta === 'obalka' ? 'hp-kruh-obalka' : 'lgx hp-btn-sklo'} ${className}`;
  const ik = <Icon name={ikona} size={18} strokeWidth={1.6} />;
  if (href) return <Link href={href} className={cls} aria-label={popis} title={popis}>{ik}</Link>;
  return <button type="button" onClick={onClick} className={cls} aria-label={popis} title={popis} aria-pressed={pressed}>{ik}</button>;
}
