'use client';

// Věrnost → Body a úrovně: „Body mimo kasu“. Za co host dostává body, když neplatí u kasy s kartičkou:
// z objednávek od stolu (zapnout/vypnout; počítá se podle pravidel bodů výš) a za rezervaci, která proběhla
// (pevný počet bodů, nejvýš jednou za rezervaci). Vlastní uložení (ne součást formuláře pravidel):
// zapnout nebo vypnout jde nezávisle. Komponenta správy: texty česky natvrdo.

import { useEffect, useState } from 'react';
import { Button, Card, ErrorState, Field, Input, Skeleton, SwitchRow } from '../../ui';
import { apiMessage, okJson } from '@/lib/api';
import { useOpravneni } from '../../role/useOpravneni';
import { normalizujZdroje, MAX_BODU_ZA_REZERVACI, type ZdrojeBodu } from '@/lib/bodyZdroje';
import { czCount, type CzNoun } from '@/lib/czech';

const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };

export default function BodyZdroje({ toast }: { toast: (m: string) => void }) {
  const { ma } = useOpravneni();
  const meni = ma('vernost.pravidla');
  const [z, setZ] = useState<ZdrojeBodu | null>(null);
  const [objednavky, setObjednavky] = useState(true);
  const [rezervace, setRezervace] = useState('');
  const [chyba, setChyba] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const nacti = () => {
    setChyba(null);
    fetch('/api/client/admin/body-zdroje').then(okJson).then(d => {
      setZ(d.zdroje); setObjednavky(d.zdroje.objednavky); setRezervace(d.zdroje.zaRezervaci ? String(d.zdroje.zaRezervaci) : '');
    }).catch(e => setChyba(apiMessage(e, 'Nastavení se nepodařilo načíst.')));
  };
  useEffect(nacti, []);

  if (chyba) return <Card><ErrorState compact title="Body mimo kasu se nenačetly" hint={chyba} onRetry={nacti} /></Card>;
  if (!z) return <Card><Skeleton className="h-24" /></Card>;

  const beze = objednavky === z.objednavky && rezervace === (z.zaRezervaci ? String(z.zaRezervaci) : '');
  const uloz = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = normalizujZdroje({ orders: objednavky, perReservation: rezervace });
    if (!v.ok) { setErr(v.chyba); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/client/admin/body-zdroje', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orders: v.zdroje.objednavky, perReservation: v.zdroje.zaRezervaci }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Nastavení se nepodařilo uložit.');
      setZ(v.zdroje); toast('Body mimo kasu uloženy.');
    } catch (e2) { setErr(apiMessage(e2, 'Nastavení se nepodařilo uložit.')); }
    setBusy(false);
  };

  return (
    <Card as="form" className="space-y-4" onSubmit={uloz} aria-labelledby="bz-nadpis">
      <div>
        <h2 id="bz-nadpis" className="t-card">Body mimo kasu</h2>
        <p className="t-meta mt-0.5 max-w-[70ch]">Za co host dostane body, když neplatí u kasy s kartičkou. Host se to dočte na stránce podniku v části „Jak získat body a odměny“.</p>
      </div>
      <SwitchRow as="div" title="Body za objednávky od stolu" checked={objednavky} disabled={!meni} onChange={setObjednavky} className="!py-0"
        hint={objednavky ? 'Dokončená objednávka dá body podle pravidel bodů výš (zaokrouhlení, minimum, strop).' : 'Objednávka od stolu body nedává. Razítko za návštěvu zůstává, body jsou jen u kasy.'} />
      <div className="max-w-xs">
        <Field id="bz-rez" label="Bodů za rezervaci, která proběhla" hint={`Připíše se po uzavření rezervace jako „Proběhlo“, nejvýš jednou. 0 nebo prázdné = žádné (nejvýš ${MAX_BODU_ZA_REZERVACI}).`}>
          <Input id="bz-rez" type="number" inputMode="numeric" min={0} max={MAX_BODU_ZA_REZERVACI} step={1} value={rezervace} disabled={!meni} onChange={e => { setRezervace(e.target.value); setErr(''); }} placeholder="Žádné" />
        </Field>
      </div>
      <p className="t-meta" aria-live="polite">
        {z.objednavky ? 'Objednávky body dávají' : 'Objednávky body nedávají'}
        {z.zaRezervaci > 0 ? `, rezervace ${czCount(z.zaRezervaci, BOD)}.` : ', rezervace bez bodů.'}
      </p>
      {err && <p role="alert" className="note note-danger">{err}</p>}
      {meni ? <Button type="submit" size="sm" variant="secondary" loading={busy} disabled={beze}>Uložit</Button>
        : <p className="t-meta">Nastavení tu jen vidíš, měnit ho může, kdo má na starosti pravidla věrnosti.</p>}
    </Card>
  );
}
