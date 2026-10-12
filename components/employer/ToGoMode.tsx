'use client';

// TO GO — kapesní pohled vedení na telefonu (kolo 69, balík B5b: plocha s widgety).
//
// Dřív byla celá obrazovka natvrdo v kódu a vymykala se zbytku aplikace
// (audit TO GO): tmavý hero s rozmazanými skvrnami, číslem 40 px mimo
// inkoustovou plochu a odstínem #D8FF6B mimo paletu, šipky ↗↘ znaky, devět
// šedých dlaždic (tlačítka se skleněnou kartou bez opravy pozadí), odznaky
// bílým písmem na jantarové (2,15 : 1), vlastní pozadí, h1 15 px uříznuté na
// „Dobré ráno, …", limetková pilulka „Administrace →" a pozdrav podle hodin
// prohlížeče jinými slovy než na Přehledu. Nic nešlo přeskládat ani skrýt.
//
// Teď je TO GO plocha stránky `vedeni.togo` ze stejného registru jako Přehled:
//  - hero je widget Pokladna dnes — jediná inkoustová plocha (DP §2.10) — a týden
//    vedle něj Tržba po dnech (BarSpark na bílé kartě);
//  - dlaždice jsou widgety S (zprávy, sklad, účtenky) a zkratky si člověk přidá
//    widgetem Odkaz; každý widget se kreslí jen s oprávněním a jen s ním se ptá
//    serveru (N2: tržba jen s finance.trzby, dřív stačilo uzaverky.zobrazit_vse);
//  - hlavička je PageHeader s pozdravem z lib/greeting (pražský čas, stejná slova
//    jako Přehled); přepínač podniku a „Administrace" jsou v liště nad ní jako
//    chrom aplikace (na telefonu se vedlejší akce PageHeader schovávají do „···");
//  - pozadí a tmavý režim dává body — vynucený světlý motiv byl jen záplata na
//    natvrdo světlé barvy, které tu už nejsou.
//
// Kolo 6 (B3, mobilní audit V01): na telefonu měl TO GO jen „Administrace" — žádný
// spodní dok, žádné „Více", žádný zvonek; k Rozvrhu dvě klepnutí, k Docházce tři a po
// návratu znovu. TO GO zůstává samostatné prostředí (DESIGN „tři prostředí"), ale kreslí
// sdílený Dock (stejné položky jako administrace + „Více" s listem MobileMoreSheet)
// a zvonek vedle přepínače podniku. Klepnutí na položku doku přepne do administrace
// rovnou na ten pohled. „Administrace" je na telefonu v listu Více (první akce), na
// počítači zůstává v liště — dok je tam skrytý a jiná cesta zpět by nebyla.

import { useState } from 'react';
import { LogoMark } from '../Icons';
import PodnikSwitcher from '../PodnikSwitcher';
import NotificationBell from '../NotificationBell';
import MobileMoreSheet, { type MoreAction, type MoreGroup } from '../MobileMoreSheet';
import { Button } from '../ui';
import { Dock, type DockItem } from '../ui/Dock';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useHlavickaPrehledu } from '../useHlavickaPrehledu';
import { useT } from '@/lib/i18n/client';

export default function ToGoMode({ user, onExit, onOpenView, dok }: {
  user: { name?: string };
  onExit: () => void;
  /** Skok do pohledu plné administrace; `arg` upřesní cíl (id konverzace…). */
  onOpenView: (view: string, arg?: string) => void;
  /**
   * Zůstává kvůli volání z EmployerLayout. Oprávnění k pohledům teď řeší
   * widgety samy přes NavigaceKontext (smiPohled z layoutu).
   */
  smiPohled?: (view: string) => boolean;
  /**
   * Spodní dok na telefonu (V01): položky doku administrace a obsah listu „Více"
   * (skupiny pohledů a akce). Klepnutí na pohled jde přes `onOpenView`.
   */
  dok?: { polozky: DockItem[]; skupiny: MoreGroup[]; akce: MoreAction[] };
}) {
  const t = useT('sprava');
  const { title, subtitle } = useHlavickaPrehledu(user?.name);
  const [viceOtevreno, setViceOtevreno] = useState(false);

  return (
    // Pod dokem zůstává místo (pb-36 jako v administraci), ať dok nepřekryje poslední widget.
    <div className={`min-h-[100dvh] ${dok ? 'pb-36 md:pb-[env(safe-area-inset-bottom)]' : 'pb-[env(safe-area-inset-bottom)]'}`}>
      {/* Chrom aplikace: značka, přepínač podniku (jen s víc podniky), zvonek a cesta do administrace. */}
      <div className="max-w-lg mx-auto w-full px-4 pt-[max(env(safe-area-inset-top),12px)] flex items-center gap-3">
        <LogoMark size={34} />
        <span className="t-card flex-1 min-w-0 truncate">{t('Managero')}</span>
        <PodnikSwitcher compact jenPrepinani onOverview={() => onOpenView('org')} />
        <NotificationBell />
        <Button variant="secondary" size="sm" icon="swap" onClick={onExit} className={dok ? 'hidden md:inline-flex' : ''}>{t('Administrace')}</Button>
      </div>
      <div className="max-w-lg mx-auto w-full">
        <PlochaWidgetu stranka="vedeni.togo" hlavicka={{ title, subtitle: `TO GO · ${subtitle}` }} />
      </div>
      {dok && (
        <>
          <Dock label={t('Spodní navigace')} items={dok.polozky} activeId={null}
            onSelect={id => { setViceOtevreno(false); onOpenView(id); }}
            more={{ onClick: () => setViceOtevreno(v => !v), active: viceOtevreno }} />
          <MobileMoreSheet open={viceOtevreno} onClose={() => setViceOtevreno(false)} groups={dok.skupiny} activeId="togo"
            onSelect={id => onOpenView(id)} actions={dok.akce} />
        </>
      )}
    </div>
  );
}
