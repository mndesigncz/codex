'use client';

// Všechny podniky na jedné obrazovce — pro vedení řetězce (kolo 69, balík B5b:
// stránka → plocha s widgety).
//
// Stejná čísla, jaká má každý podnik sám v Uzávěrkách, Financích a Skladu,
// jen vedle sebe a sečtená. Sčítá se jen stejná měna; s korunami a eury
// vedle sebe přehled řekne, že celek nedává smysl, místo aby ho vymyslel.
//
// Co se změnilo (audit „Všechny podniky"):
//  - součty jsou widget Všechny podniky (organizace.podniky, střední) na ploše;
//    nástrojem stránky je seznam podniků s „Otevřít" — jde přeskládat i skrýt;
//  - hlavička: PageHeader, v nadpisu jen „Všechny podniky" (dřív „… · Moje
//    kavárny" opakoval horní lištu a na telefonu se lámal), organizace
//    v podtitulku a sdílený MonthNav místo ručních šipek;
//  - mezi měsícem, součty a kartami podniků bylo 0 px — plocha má space-y-6;
//  - tržby a mzdy bez oprávnění v podniku (API null) už nejsou „0 Kč", ale „skryto";
//  - tvary po číslovce přes czCount („0 členů", ne „0 členové"), chipy přes Chip;
//  - vypnutý přehled je EmptyState s cestou do nastavení, ne holá věta;
//  - načítání je kostra, ne kolečko uprostřed.
//  - N9: „chybí" jen do včerejška jako v Uzávěrkách; dnešek bez uzávěrky je
//    zvlášť — „dnes ještě chybí" (čekací tón, ne chyba) až po zavírací době.

import { useState } from 'react';
import { czCount, POLOZKA } from '@/lib/czech';
import { pragueToday } from '@/lib/pragueTime';
import { dnesJesteChybi } from '@/lib/uzaverkyOrganizace';
import { Button, Card, Chip, EmptyState, ErrorState, MonthNav, Skeleton, Stat, StatRow } from '../ui';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { useNavigace, useSmi } from '../widgety/NavigaceKontext';
import {
  CLEN, MesicStrankyOrganizace, Penize, UZAVERKA, urlPrehledu, vyberPrehled, type PrehledOrganizace,
} from '../widgety/oblasti/organizace';
import { useT } from '@/lib/i18n/client';
import { useLocale } from './jazyk';

/** Nástroj stránky: karta na podnik s čísly a „Otevřít" (přepnutí podniku přes server). */
function SeznamPodniku({ mesic, onOpenTeam }: { mesic: string; onOpenTeam?: (teamId: number) => Promise<string | null> }) {
  const t = useT('sprava');
  const loc = useLocale();
  const nav = useNavigace();
  const smi = useSmi();
  const data = useDataWidgetu<PrehledOrganizace>(urlPrehledu(mesic), vyberPrehled);
  const p = data.data;
  // „Otevřít" přepíná podnik na serveru; když to nevyjde (třeba vlastník
  // organizace není členem toho podniku), řekne se to u seznamu — ne jako
  // „Přehled se nenačetl", který by načtená čísla schoval.
  const [chybaPrepnuti, setChybaPrepnuti] = useState('');
  const [otevira, setOtevira] = useState<number | null>(null);
  const otevri = async (teamId: number) => {
    setChybaPrepnuti(''); setOtevira(teamId);
    const chyba = await onOpenTeam?.(teamId);
    setOtevira(null);
    if (chyba) setChybaPrepnuti(chyba);
  };

  if (data.error) return <ErrorState title={t('Přehled se nenačetl')} detail={data.error} onRetry={data.reload} />;
  if (!p) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy>
        {[0, 1].map(i => <Card key={i}><Skeleton className="h-4 w-40 rounded-full" /><Skeleton className="mt-4 h-16" /></Card>)}
      </div>
    );
  }
  if (!p.dostupny) {
    const vNastaveni = p.duvod === 'vypnuto' && nav.smiPohled('team-settings');
    return (
      <Card>
        <EmptyState compact icon="overview" title={p.zprava ?? t('Přehled organizace teď nejde ukázat.')}
          hint={p.duvod === 'vypnuto' ? t('Zapíná se v Nastavení týmu, v části Organizace.') : undefined}
          action={vNastaveni ? <Button variant="secondary" icon="settings" onClick={() => nav.onNavigate('team-settings')}>{t('Otevřít nastavení')}</Button> : undefined} />
      </Card>
    );
  }

  // Řada Tržby / Mzdy se kreslí, když ji divák smí v aktivním podniku, nebo když mu
  // server aspoň v jednom podniku poslal číslo (klíč má jen jinde). „Skryto" tak zůstane
  // jen pro smíšený případ; role, která klíč nemá nikde, řadu nevidí vůbec — zamčený
  // náhled se nekreslí (DP §5.3) a stejně se chová widget nad seznamem.
  const trzby = smi('finance.trzby') || p.podniky.some(t => t.revenue != null);
  const mzdy = smi('finance.mzdy') || p.podniky.some(t => t.wages != null);
  return (
    <div className="space-y-4">
      {chybaPrepnuti && <p role="alert" className="note note-danger">{chybaPrepnuti}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {p.podniky.map(pod => (
          <Card key={pod.teamId} as="article" aria-labelledby={`podnik-${pod.teamId}`} data-podnik={pod.teamId} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id={`podnik-${pod.teamId}`} className="t-card truncate">{pod.name}</h3>
                <p className="t-meta">{t('{n, plural, one {# člen} few {# členové} other {# členů}}', { n: pod.members })} · {t('{n, plural, one {# uzávěrka} few {# uzávěrky} other {# uzávěrek}}', { n: pod.closings })}</p>
              </div>
              {onOpenTeam && (
                <Button variant="secondary" size="sm" loading={otevira === pod.teamId} onClick={() => otevri(pod.teamId)}>{t('Otevřít')}</Button>
              )}
            </div>
            {/* Dvě řady po dvou: čtyři částky vedle sebe se do půlky monitoru nevejdou.
                Tržby a mzdy podniku, kam role nesmí, posílá API jako null a ukáže se „skryto";
                rozhoduje server v každém podniku zvlášť. */}
            {(trzby || mzdy) && (
              <StatRow>
                {trzby && <Stat label={t('Tržby')} value={<Penize castka={pod.revenue} mena={pod.currency} />} />}
                {mzdy && <Stat label={t('Mzdy')} value={<Penize castka={pod.wages} mena={pod.currency} />}
                  note={pod.wages != null && pod.revenue ? t('{p} % tržeb', { p: Math.round((pod.wages / pod.revenue) * 100) }) : undefined} />}
              </StatRow>
            )}
            <StatRow className={trzby || mzdy ? 'border-t border-[var(--surface-line)] pt-4' : ''}>
              <Stat label={t('Na směně')} value={pod.onShiftNow.toLocaleString(loc)} />
              <Stat label={t('Sklad dochází')} value={pod.stockAlerts.toLocaleString(loc)} note={pod.stockAlerts > 0 ? t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: pod.stockAlerts }) : undefined} />
            </StatRow>
            {(pod.missingClosings > 0 || pod.pendingApproval > 0 || dnesJesteChybi(pod)) && (
              <div className="flex flex-wrap gap-2">
                {pod.missingClosings > 0 && <Chip tone="bad" size="sm">{t('chybí {n, plural, one {# uzávěrka} few {# uzávěrky} other {# uzávěrek}}', { n: pod.missingClosings })}</Chip>}
                {/* Dnešek je připomínka, ne chyba: podnik zavřel, uzávěrka se ještě může dodělat. */}
                {dnesJesteChybi(pod) && <Chip tone="wait" size="sm">{t('dnes ještě chybí')}</Chip>}
                {pod.pendingApproval > 0 && <Chip tone="wait" size="sm">{t('{n} ke schválení', { n: pod.pendingApproval.toLocaleString(loc) })}</Chip>}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function OrgOverview({ onOpenTeam }: { onOpenTeam?: (teamId: number) => Promise<string | null> }) {
  const t = useT('sprava');
  const dnes = pragueToday().slice(0, 7);
  const [mesic, setMesic] = useState(dnes);
  // Název organizace do podtitulku — stejná URL jako seznam, takže žádný dotaz navíc.
  const data = useDataWidgetu<PrehledOrganizace>(urlPrehledu(mesic), vyberPrehled);
  const org = data.data?.organizace;

  return (
    <MesicStrankyOrganizace.Provider value={mesic}>
      <PlochaWidgetu
        stranka="vedeni.vsechny_podniky"
        hlavicka={{
          title: t('Všechny podniky'),
          subtitle: org ? t('{org} · tržby, mzdy, uzávěrky a sklad za každý podnik i celkem.', { org }) : t('Tržby, mzdy, uzávěrky a sklad za každý podnik i celkem.'),
          hintId: 'orgoverview',
          aside: <MonthNav value={mesic} onChange={setMesic} max={dnes} />,
        }}
        nastroj={<SeznamPodniku mesic={mesic} onOpenTeam={onOpenTeam} />}
      />
    </MesicStrankyOrganizace.Provider>
  );
}
