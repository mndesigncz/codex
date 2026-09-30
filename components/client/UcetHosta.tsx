'use client';

// Účet hosta: souhlas s novinkami podniků (opt-in a odhlášení), upozornění
// v telefonu, právní odkazy a smazání účtu. Kotva #ucet z menu v hlavičce.
//
// Novinky a akce od podniků chodí jen po výslovném souhlasu (Apple 4.5.4,
// zákon 480/2004): výchozí je NE, zapnout i vypnout jde kdykoli. Systémové
// povolení oznámení v nativní aplikaci se žádá až tady, v kontextu, ne při startu.

import { useEffect, useState } from 'react';
import { SwitchRow } from '../ui';
import PravniOdkazy from '../pravni/PravniOdkazy';
import SmazatUcet from '../ucet/SmazatUcet';
import { jeNativni, nativniMost, stavNativnihoPushe } from '@/lib/nativni/most';

export default function UcetHosta({ novinky, onFlash }: { novinky: boolean; onFlash: (m: string) => void }) {
  const [souhlas, setSouhlas] = useState(novinky);
  const [pushZapnut, setPushZapnut] = useState(false);
  const [pushOdmitnut, setPushOdmitnut] = useState(false);
  const [nativni, setNativni] = useState(false);
  useEffect(() => { setSouhlas(novinky); }, [novinky]);
  useEffect(() => {
    if (!jeNativni()) return;
    setNativni(true);
    Promise.all([stavNativnihoPushe(), nativniMost()]).then(([s, most]) => { setPushZapnut(s === 'granted' && !most?.pushVypnuto()); setPushOdmitnut(s === 'denied'); });
  }, []);

  const zmenSouhlas = async (v: boolean) => {
    setSouhlas(v);
    try {
      const r = await fetch('/api/client/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ novinky: v }) });
      if (!r.ok) throw new Error();
      onFlash(v ? 'Novinky od podniků zapnuté.' : 'Novinky od podniků vypnuté.');
      // Souhlas s novinkami dává smysl jen s povolenými oznámeními: zeptáme se hned, v kontextu.
      if (v && nativni && !pushZapnut) { const p = (await (await nativniMost())?.zapniPush()) ?? 'nedostupny'; setPushZapnut(p === 'granted'); setPushOdmitnut(p === 'denied'); }
    } catch {
      // Nepovedlo se uložit: přepínač se vrátí, ať neukazuje souhlas, který server nezná.
      setSouhlas(!v);
      onFlash('Nastavení se nepodařilo uložit.');
    }
  };

  const zmenPush = async (v: boolean) => {
    if (!v) {
      // Smaže token na serveru: oznámení přestanou chodit hned (systémové povolení zůstává, jde znovu zapnout).
      setPushZapnut(false); await (await nativniMost())?.vypniPush();
      onFlash('Upozornění v telefonu vypnutá.');
      return;
    }
    const p = (await (await nativniMost())?.zapniPush()) ?? 'nedostupny';
    setPushZapnut(p === 'granted'); setPushOdmitnut(p === 'denied');
  };

  return (
    <section id="ucet" aria-labelledby="h-ucet-hosta" className="card p-4 sm:p-5 scroll-mt-24">
      <h2 id="h-ucet-hosta" className="text-lg font-bold tracking-tight">Oznámení a soukromí</h2>
      <ul className="list mt-2">
        {nativni && (
          <SwitchRow title="Upozornění v telefonu" checked={pushZapnut} onChange={zmenPush}
            hint={pushOdmitnut ? 'Oznámení jsou v systému vypnutá. Povolte je v nastavení telefonu.' : 'Potvrzení rezervace, stav objednávky.'} />
        )}
        <SwitchRow title="Novinky a akce od podniků" checked={souhlas} onChange={zmenSouhlas}
          hint="Zprávy od podniků, kde jsi členem. Nepovinné, jen s tvým souhlasem a kdykoli jde vypnout." />
      </ul>
      <PravniOdkazy className="mt-3 text-sm text-black/60" />
      <SmazatUcet jeHost />
    </section>
  );
}
