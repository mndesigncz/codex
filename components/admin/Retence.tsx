'use client';

// Retence osobních údajů (spuštění, balík G): co by denní úklid smazal a kdy. Dokud není
// RETENCE_ZAPNUTA=1, cron jen počítá — tahle obrazovka je jediné místo, kde je náhled vidět.
// Odtud se nic nemaže; tlačítko jen spočítá náhled teď. Lhůty jsou v lib/retence.ts.

import { useState } from 'react';
import { useLoad, PageHeader, ListRow, EmptyState, ErrorState, PageSkeleton, Chip, Button, Stat, StatRow } from '@/components/ui';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { okJson, apiMessage } from '@/lib/api';

interface Souhrn {
  rezim: 'nahled' | 'ostry';
  hoste: { poLhute?: number; upozornit: number; anonymizovat: number; cekat: number; upozorneno: number; anonymizovano: number; chyb: number; ukazkaId: number[] };
  auditLog: { kSmazani: number; smazano: number };
  oznameni: { kSmazani: number; smazano: number };
  podniky: { kSmazani: number; smazano: number; ukazkaId: number[]; upozornit30?: number; upozornit7?: number; cekat?: number; upozorneno?: number; chyb?: number };
  chyby: string[];
}
interface Beh { id: number; rezim: string; souhrn: Souhrn; createdAt: string | null }
interface Data {
  zapnuta: boolean;
  lhuty: { neaktivniHostMesicu: number; upozorneniPredemDni: number; auditLogLet: number; oznameniDni: number; zrusenyPodnikDni: number; podnikUpozorneniDni?: number; podnikDruheUpozorneniDni?: number };
  behy: Beh[];
}

/** Číslo s mezerou po tisících (správa platformy je jen česky). */
const cislo = (n: number) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');

export default function RetenceSprava() {
  // Bez lhůt nejde nic z obrazovky říct pravdivě — neúplná odpověď je chyba načtení
  // (dřív pád na `lhuty.neaktivniHostMesicu`, audit 2026-10 B8). Běh bez souhrnu se vynechá.
  const z = useLoad<Data>('/api/admin/retence', r => {
    if (!r?.lhuty || typeof r.lhuty !== 'object') throw new Error('Odpověď serveru je neúplná (chybí lhůty).');
    const behy = (Array.isArray(r.behy) ? r.behy : []).filter((b: any) => b && b.souhrn && b.souhrn.hoste && b.souhrn.auditLog && b.souhrn.oznameni && b.souhrn.podniky);
    return {
      zapnuta: r.zapnuta === true,
      lhuty: r.lhuty,
      behy: behy.map((b: any) => ({ ...b, souhrn: { ...b.souhrn, chyby: Array.isArray(b.souhrn.chyby) ? b.souhrn.chyby : [], hoste: { ...b.souhrn.hoste, ukazkaId: Array.isArray(b.souhrn.hoste.ukazkaId) ? b.souhrn.hoste.ukazkaId : [] }, podniky: { ...b.souhrn.podniky, ukazkaId: Array.isArray(b.souhrn.podniky.ukazkaId) ? b.souhrn.podniky.ukazkaId : [] } } })),
    };
  });
  const [bezi, setBezi] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);

  const spocitat = async () => {
    setBezi(true); setChyba(null);
    try { await okJson(await fetch('/api/admin/retence', { method: 'POST' })); z.reload(); }
    catch (e) { setChyba(apiMessage(e, 'Náhled se nepodařilo spočítat.')); }
    setBezi(false);
  };

  const d = z.data;
  const posledni = d?.behy[0]?.souhrn ?? null;
  return (
    <div className="space-y-6">
      <PageHeader title="Retence osobních údajů"
        subtitle={d ? (d.zapnuta ? 'Zapnuto: denní úklid opravdu maže a posílá upozornění.' : 'Jen náhled: denní úklid nic nemaže ani neposílá, dokud v prostředí není RETENCE_ZAPNUTA=1.') : undefined}
        primary={<Button variant="accent" icon="refresh" loading={bezi} onClick={() => void spocitat()} className="w-full sm:w-auto justify-center">Spočítat náhled teď</Button>} />
      {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
      {z.error ? (
        <ErrorState title="Retence se nenačetla" detail={z.error} onRetry={z.reload} />
      ) : z.loading || !d ? (
        <PageSkeleton tiles={2} />
      ) : (
        <>
          <section className="card p-4 sm:p-5" aria-labelledby="h-ret-posledni">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="h-ret-posledni" className="t-card">Poslední běh</h2>
              {d.behy[0] && <Chip tone={d.behy[0].rezim === 'ostry' ? 'bad' : 'info'} size="sm">{d.behy[0].rezim === 'ostry' ? 'ostrý' : 'náhled'}</Chip>}
              {d.behy[0]?.createdAt && <span className="t-meta">{dbTimeDayHM(d.behy[0].createdAt)}</span>}
            </div>
            {posledni ? (
              <>
                <StatRow className="mt-4">
                  <Stat label="Neaktivní hosté" value={cislo(posledni.hoste.poLhute ?? posledni.hoste.anonymizovat)} note={`déle než ${d.lhuty.neaktivniHostMesicu} měsíců`} />
                  <Stat label="Upozornit" value={cislo(posledni.hoste.upozornit)} note={`${d.lhuty.upozorneniPredemDni} dní předem`} />
                  <Stat label="Protokol změn" value={cislo(posledni.auditLog.kSmazani)} note={`řádků starších ${d.lhuty.auditLogLet} let`} />
                  <Stat label="Zrušené podniky" value={cislo(posledni.podniky.kSmazani)} note={`${d.lhuty.zrusenyPodnikDni} dní bez aktivity, po 2 upozorněních`} />
                </StatRow>
                <ul className="list mt-4">
                  <ListRow title="Oznámení v aplikaci" detail={`${cislo(posledni.oznameni.kSmazani)} starších než ${d.lhuty.oznameniDni} dní${posledni.rezim === 'ostry' ? ` · smazáno ${cislo(posledni.oznameni.smazano)}` : ''}`} />
                  <ListRow title="Hosté po upozornění" detail={`čeká na lhůtu ${cislo(posledni.hoste.cekat)} · k anonymizaci ${cislo(posledni.hoste.anonymizovat)}${posledni.rezim === 'ostry' ? ` · anonymizováno ${cislo(posledni.hoste.anonymizovano)} · upozorněno ${cislo(posledni.hoste.upozorneno)}` : ''}`}
                    right={posledni.hoste.ukazkaId.length ? <span className="t-meta">{`id ${posledni.hoste.ukazkaId.slice(0, 3).join(', ')}${posledni.hoste.ukazkaId.length > 3 ? '…' : ''}`}</span> : undefined} />
                  <ListRow title="Zrušené podniky před smazáním" detail={`upozornit ${d.lhuty.podnikUpozorneniDni ?? 30} dní předem ${cislo(posledni.podniky.upozornit30 ?? 0)} · ${d.lhuty.podnikDruheUpozorneniDni ?? 7} dní předem ${cislo(posledni.podniky.upozornit7 ?? 0)} · čeká ${cislo(posledni.podniky.cekat ?? 0)}${posledni.rezim === 'ostry' ? ` · upozorněno ${cislo(posledni.podniky.upozorneno ?? 0)} · smazáno ${cislo(posledni.podniky.smazano)}` : ''}`} />
                  {posledni.podniky.ukazkaId.length > 0 && <ListRow title="Podniky ke smazání" detail={`id ${posledni.podniky.ukazkaId.join(', ')}`} />}
                </ul>
                {posledni.chyby.length > 0 && (
                  <div className="note note-wait mt-4">
                    <p className="font-semibold">Část se nepodařila spočítat</p>
                    <ul className="mt-1 list-disc pl-5">{posledni.chyby.slice(0, 5).map((c, i) => <li key={i} className="break-words">{c}</li>)}</ul>
                  </div>
                )}
              </>
            ) : (
              <EmptyState icon="clock" title="Zatím žádný běh" hint="Denní úklid běží ve 3:35. Náhled můžeš spočítat hned tlačítkem nahoře." />
            )}
          </section>

          <section className="card p-4 sm:p-5" aria-labelledby="h-ret-lhuty">
            <h2 id="h-ret-lhuty" className="t-card">Lhůty</h2>
            <p className="t-meta mt-0.5 text-pretty">Návrh k odsouhlasení advokátem; mění se v lib/retence.ts.</p>
            <ul className="list mt-2">
              <ListRow title="Neaktivní host" detail={`anonymizace po ${d.lhuty.neaktivniHostMesicu} měsících bez návštěvy, objednávky, rezervace nebo otevření aplikace; e-mail ${d.lhuty.upozorneniPredemDni} dní předem s tlačítkem Ponechat účet`} />
              <ListRow title="Protokol změn podniku" detail={`smazání po ${d.lhuty.auditLogLet} letech`} />
              <ListRow title="Oznámení v aplikaci" detail={`smazání po ${d.lhuty.oznameniDni} dnech`} />
              <ListRow title="Zrušený podnik" detail={`smazání ${d.lhuty.zrusenyPodnikDni} dní po konci předplatného, když v podniku od té doby nikdo nic nedělal`} />
            </ul>
          </section>

          {d.behy.length > 1 && (
            <section className="card p-2 sm:p-3" aria-label="Předchozí běhy">
              <ul className="list">
                {d.behy.slice(1).map(b => (
                  <ListRow key={b.id} title={b.createdAt ? dbTimeDayHM(b.createdAt) : `běh ${b.id}`}
                    detail={`hosté ${cislo(b.souhrn.hoste.poLhute ?? 0)} · protokol ${cislo(b.souhrn.auditLog.kSmazani)} · oznámení ${cislo(b.souhrn.oznameni.kSmazani)} · podniky ${cislo(b.souhrn.podniky.kSmazani)}`}
                    right={<Chip tone={b.rezim === 'ostry' ? 'bad' : 'info'} size="sm">{b.rezim === 'ostry' ? 'ostrý' : 'náhled'}</Chip>} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
