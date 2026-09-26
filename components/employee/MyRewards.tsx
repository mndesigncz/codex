'use client';

// Odměny (zaměstnanec): moje úroveň, body a co si za ně můžu vybrat.
//
// Kolo 69 (balík B7): stránka je plocha s widgety. Hlavičku kreslí PlochaWidgetu
// (vždy — dřív bez dat i při načítání zůstal jen neviditelný h1 a šedá věta
// „Odměny zatím nejsou k dispozici.", a výpadek načtení vypadal úplně stejně).
// Tahle komponenta kreslí nástroj: úroveň, body, pokrok a výhody. Bloky, které
// dřív stály pod ní, jsou widgety — Zpětná vazba (výtky k potvrzení), Katalog
// odměn, Odkud mám body, Úrovně a Hodnocení mých směn — a čtou totéž
// /api/rewards jedním dotazem (useDataWidgetu).
//
// Z auditu: „hero" karta s rozmazanou limetkovou skvrnou, štítkem verzálkami nad
// nadpisem, názvem 30 px a výhodami v limetkovém boxu → Stat, pruh pokroku a Well
// (MojeUrovenObsah, stejná podoba jako widget Moje úroveň a body na Domů). Dvě
// červeně tónované karty „Něco je potřeba napravit" → jeden widget Zpětná vazba.

import { Card, EmptyState, ErrorState, Skeleton } from '../ui';
import { ProGate } from '../Pro';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { MojeUrovenObsah, NaStranceOdmen } from '../widgety/oblasti/odmeny';
import { vyberOdmeny } from '@/lib/odmenyPrehled';

export default function MyRewards() {
  return (
    <ProGate feature="Moje odměny" employer={false} benefit="Body, úrovně a odměny za dobře odvedené směny.">
      <MyRewardsInner />
    </ProGate>
  );
}

function MyRewardsInner() {
  const data = useDataWidgetu('/api/rewards', vyberOdmeny);
  const ja = data.data?.ja ?? null;

  const nastroj = (
    <Card aria-label="Moje úroveň">
      {data.error ? (
        <ErrorState compact title="Odměny se nenačetly" onRetry={data.reload} detail={data.error} />
      ) : data.loading ? (
        <div className="space-y-3" aria-busy>
          <Skeleton className="h-3 w-24 rounded-full" />
          <Skeleton className="h-8 w-40 rounded-xl" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ) : ja ? (
        <MojeUrovenObsah ja={ja} velikost="L" />
      ) : (
        <EmptyState compact illustration="odmeny" title="Odměny tu zatím nejsou"
          hint="Tenhle účet body nesbírá. Body se připisují za úkoly, postupy, uzávěrky a hodnocení směn." />
      )}
    </Card>
  );

  // Widgety na téhle ploše nekreslí odkaz „Odměny ›" — vedl by sem (Zpětná vazba, Moje úroveň).
  return (
    <NaStranceOdmen.Provider value>
      <PlochaWidgetu
        stranka="zamestnanec.odmeny"
        hlavicka={{
          title: 'Odměny',
          subtitle: 'Body za směny, úroveň a co si za ně můžeš vybrat.',
          hintId: 'myrewards',
        }}
        nastroj={nastroj}
      />
    </NaStranceOdmen.Provider>
  );
}
