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

import { useState } from 'react';
import { czCount, POLOZKA } from '@/lib/czech';
import { pragueToday } from '@/lib/pragueTime';
import { Button, Card, Chip, EmptyState, ErrorState, MonthNav, Skeleton, Stat, StatRow } from '../ui';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { useNavigace, useSmi } from '../widgety/NavigaceKontext';
import {
  CLEN, MesicStrankyOrganizace, Penize, UZAVERKA, urlPrehledu, vyberPrehled, type PrehledOrganizace,
} from '../widgety/oblasti/organizace';

/** Nástroj stránky: karta na podnik s čísly a „Otevřít" (přepnutí podniku přes server). */
function SeznamPodniku({ mesic, onOpenTeam }: { mesic: string; onOpenTeam?: (teamId: number) => Promise<string | null> }) {
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

  if (data.error) return <ErrorState title="Přehled se nenačetl" detail={data.error} onRetry={data.reload} />;
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
        <EmptyState compact icon="overview" title={p.zprava ?? 'Přehled organizace teď nejde ukázat.'}
          hint={p.duvod === 'vypnuto' ? 'Zapíná se v Nastavení týmu, v části Organizace.' : undefined}
          action={vNastaveni ? <Button variant="secondary" icon="settings" onClick={() => nav.onNavigate('team-settings')}>Otevřít nastavení</Button> : undefined} />
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
        {p.podniky.map(t => (
          <Card key={t.teamId} as="article" aria-labelledby={`podnik-${t.teamId}`} data-podnik={t.teamId} className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id={`podnik-${t.teamId}`} className="t-card truncate">{t.name}</h3>
                <p className="t-meta">{czCount(t.members, CLEN)} · {czCount(t.closings, UZAVERKA)}</p>
              </div>
              {onOpenTeam && (
                <Button variant="secondary" size="sm" loading={otevira === t.teamId} onClick={() => otevri(t.teamId)}>Otevřít</Button>
              )}
            </div>
            {/* Dvě řady po dvou: čtyři částky vedle sebe se do půlky monitoru nevejdou.
                Tržby a mzdy podniku, kam role nesmí, posílá API jako null a ukáže se „skryto";
                rozhoduje server v každém podniku zvlášť. */}
            {(trzby || mzdy) && (
              <StatRow>
                {trzby && <Stat label="Tržby" value={<Penize castka={t.revenue} mena={t.currency} />} />}
                {mzdy && <Stat label="Mzdy" value={<Penize castka={t.wages} mena={t.currency} />}
                  note={t.wages != null && t.revenue ? `${Math.round((t.wages / t.revenue) * 100)} % tržeb` : undefined} />}
              </StatRow>
            )}
            <StatRow className={trzby || mzdy ? 'border-t border-[var(--surface-line)] pt-4' : ''}>
              <Stat label="Na směně" value={t.onShiftNow.toLocaleString('cs-CZ')} />
              <Stat label="Sklad dochází" value={t.stockAlerts.toLocaleString('cs-CZ')} note={t.stockAlerts > 0 ? czCount(t.stockAlerts, POLOZKA) : undefined} />
            </StatRow>
            {(t.missingClosings > 0 || t.pendingApproval > 0) && (
              <div className="flex flex-wrap gap-2">
                {t.missingClosings > 0 && <Chip tone="bad" size="sm">chybí {czCount(t.missingClosings, UZAVERKA)}</Chip>}
                {t.pendingApproval > 0 && <Chip tone="wait" size="sm">{t.pendingApproval.toLocaleString('cs-CZ')} ke schválení</Chip>}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function OrgOverview({ onOpenTeam }: { onOpenTeam?: (teamId: number) => Promise<string | null> }) {
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
          title: 'Všechny podniky',
          subtitle: org ? `${org} · tržby, mzdy, uzávěrky a sklad za každý podnik i celkem.` : 'Tržby, mzdy, uzávěrky a sklad za každý podnik i celkem.',
          hintId: 'orgoverview',
          aside: <MonthNav value={mesic} onChange={setMesic} max={dnes} />,
        }}
        nastroj={<SeznamPodniku mesic={mesic} onOpenTeam={onOpenTeam} />}
      />
    </MesicStrankyOrganizace.Provider>
  );
}
