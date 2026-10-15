'use client';

// Zámek aplikace Face ID / otiskem (spuštění, balík S). Jen v nativním obalu:
// most `window.manageroNative.zamek` (components/NativeBridge) drží volbu
// v zařízení a zapnutí nejdřív ověří biometrikou — kdo Face ID ani kód nemá,
// zámek nezapne a ven se nezamkne. Na webu a bez biometriky se nic neukáže.
//
// `obal="radek"` = řádek do existujícího `<ul className="list">` (účet hosta),
// `obal="karta"` = vlastní karta (Nastavení → Zabezpečení).

import { useEffect, useState } from 'react';
import { SwitchRow } from '../ui';
import { jeNativni, nativniMost } from '@/lib/nativni/most';
import { useT } from '@/lib/i18n/client';

export default function ZamekAplikace({ obal = 'radek' }: { obal?: 'radek' | 'karta' }) {
  const t = useT('spolecne');
  const [dostupny, setDostupny] = useState(false);
  const [zapnuto, setZapnuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [chyba, setChyba] = useState('');
  useEffect(() => {
    if (!jeNativni()) return;
    let zivy = true;
    nativniMost().then(async most => {
      if (!most?.zamek) return;
      const [d, z] = await Promise.all([most.zamek.dostupny().catch(() => false), most.zamek.zapnuto().catch(() => false)]);
      if (zivy) { setDostupny(d); setZapnuto(z); }
    });
    return () => { zivy = false; };
  }, []);
  if (!dostupny) return null;

  const zmen = async (v: boolean) => {
    if (busy) return;
    setBusy(true); setChyba('');
    try {
      const most = await nativniMost();
      const ok = (await most?.zamek.nastav(v)) === true;
      if (ok) setZapnuto(v);
      // Zrušené ověření nebo telefon bez Face ID/kódu: přepínač zůstane, jak byl.
      else if (v) setChyba(t('Zámek se nezapnul — ověření Face ID nebo otiskem neproběhlo.'));
    } finally { setBusy(false); }
  };

  const radek = (
    <SwitchRow title={t('Zamykat aplikaci Face ID / otiskem')} checked={zapnuto} onChange={zmen} disabled={busy}
      hint={chyba || t('Po návratu do aplikace se nejdřív ověříš. Platí jen na tomhle telefonu.')} />
  );
  if (obal === 'radek') return radek;
  return (
    <section className="card p-6 mt-4">
      <h2 className="t-card">{t('Zámek aplikace')}</h2>
      <ul className="list mt-2">{radek}</ul>
    </section>
  );
}
