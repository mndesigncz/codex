'use client';

// Statistiky jedné razítkové kampaně: kolik karet je dokončeno, kolik odměn
// se uplatnilo a kolik propadlo, jak dlouho host kartu sbírá, kdo je nejvěrnější,
// kolik útraty prošlo přes účtenky s razítkem a rozpad po dnech za 30 dní.

import { useEffect, useState } from 'react';
import { BarSpark, Button, EmptyState, ErrorState, Modal, Skeleton, Stat, StatRow } from '../../ui';
import { useMoney } from '../../CurrencyProvider';
import { czCount, czForm, type CzNoun } from '@/lib/czech';
import { czDatum } from '@/lib/razitkaPravidla';
import { apiMessage, okJson } from '@/lib/api';

const HOST: CzNoun = { one: 'host', few: 'hosté', many: 'hostů' };
const KARTA: CzNoun = { one: 'karta', few: 'karty', many: 'karet' };
const DEN: CzNoun = { one: 'den', few: 'dny', many: 'dní' };
const RAZITKO: CzNoun = { one: 'razítko', few: 'razítka', many: 'razítek' };
const UCET: CzNoun = { one: 'účtenka', few: 'účtenky', many: 'účtenek' };

export default function KampanStatistiky({ kampan, onZavrit }: { kampan: { id: number; name: string }; onZavrit: () => void }) {
  const money = useMoney();
  const [d, setD] = useState<any | null>(null);
  const [chyba, setChyba] = useState('');
  const nacti = () => {
    setD(null); setChyba('');
    fetch(`/api/client/admin/stamps?stats=${kampan.id}`).then(okJson).then(setD).catch(e => setChyba(apiMessage(e, 'Statistiky se nepodařilo načíst.')));
  };
  useEffect(nacti, [kampan.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal open onClose={onZavrit} size="lg" title={`Statistiky: ${kampan.name}`} footer={<Button variant="secondary" onClick={onZavrit}>Zavřít</Button>}>
      {chyba ? <ErrorState compact title="Statistiky se nenačetly" hint={chyba} onRetry={nacti} />
        : !d ? <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-32" /></div>
        : (
          <div className="space-y-5">
            <StatRow>
              <Stat label="Dokončené karty" value={d.dokonceno} note={czCount(d.hostu, HOST) + ' sbírá'} />
              <Stat label="Odměny uplatněné" value={`${d.odmenyUplatnene} / ${d.odmenyVydane}`} note={d.odmenyPropadle > 0 ? `${d.odmenyPropadle} propadlo neuplatněných` : 'uplatněné z vydaných'} />
              <Stat label="Doba sbírání" value={d.prumernaDobaDni == null ? '—' : `${String(d.prumernaDobaDni).replace('.', ',')} ${czForm(Math.round(d.prumernaDobaDni), DEN)}`} note="průměr od prvního razítka do plné karty" />
            </StatRow>
            <StatRow>
              <Stat label="Rozdělaná razítka" value={d.otevrenaRazitka} note="na kartách, které se právě sbírají" />
              <Stat label="Propadlá razítka" value={d.propadlaRazitka} note="z karet, které host nedosbíral včas" />
              <Stat label="Útrata z účtenek" value={money(d.utrataZUctu)} note={d.uctu > 0 ? `${czCount(d.uctu, UCET)}${d.dokonceno > 0 ? ` · ${money(Math.round(d.utrataZUctu / d.dokonceno))} na dokončenou kartu` : ''}` : 'zatím žádná účtenka s razítkem'} />
            </StatRow>
            <div>
              <h3 className="t-label mb-2">Razítka po dnech (posledních 30 dní)</h3>
              {d.poDnech.length === 0 ? <p className="t-meta">Za posledních 30 dní nepřibylo žádné razítko.</p> : (
                <BarSpark label="Razítka po dnech za posledních 30 dní" height={64} data={d.poDnech.map((x: any) => ({ value: x.razitka, tip: `${czDatum(x.den)}: ${czCount(x.razitka, RAZITKO)}, ${czCount(x.hostu, HOST)}${x.dokonceno ? `, ${czCount(x.dokonceno, KARTA)} dokončeno` : ''}` }))} />
              )}
            </div>
            <div>
              <h3 className="t-label mb-2">Nejvěrnější hosté</h3>
              {d.topHoste.length === 0 ? <EmptyState compact icon="users" title="Zatím nikdo nesbírá" hint="Jakmile obsluha dá první razítko, uvidíš tu nejvěrnější hosty." /> : (
                <ul className="list">
                  {d.topHoste.map((h: any, i: number) => (
                    <li key={i} className="list-row flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold min-w-0 truncate">{i + 1}. {h.jmeno}</span>
                      <span className="text-[13px] text-black/60 tabular-nums shrink-0">{czCount(h.dokonceno, KARTA)} · {czCount(h.razitka, RAZITKO)} rozdělaných</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
    </Modal>
  );
}
