'use client';

// Dárkové poukazy: nastavení, které se netýká jednoho poukazu.
//  · nejnižší účet, od kterého jde poukaz uplatnit (obsluha při uplatnění zadá výši účtu),
//  · body za nákup poukazu (kupující člen je dostane při založení poukazu),
//  · jak se z uplatnění počítají body a cashback (pravidlo „Kredit a poukaz bez bodů“ žije ve Věrnosti → Body a úrovně).
// A export pro účetnictví: měsíční souhrn a deník pohybů za zvolené měsíce.
// Komponenta správy: texty česky natvrdo.

import { useState } from 'react';
import { Button, Field, Input } from '../../ui';
import { useMoney, useSymbol } from '../../CurrencyProvider';
import { apiMessage } from '@/lib/api';
import { normalizujNastaveniPoukazu, MAX_BODU_ZA_NAKUP, MAX_MIN_UTRATA_POUKAZU, type NastaveniPoukazu } from '@/lib/poukazy';
import { cisloCs } from '@/lib/bodyPravidla';
import { overRozsahExportu } from '@/lib/poukazyUcetni';
import { pragueToday } from '@/lib/pragueTime';
import { HLASKA_NEJDE_ULOZIT, ulozSoubor } from '@/lib/stahni';

export function PoukazyDalsiNastaveni({ nastaveni, bezBodu, toast, onUlozeno }: {
  nastaveni: NastaveniPoukazu; bezBodu: boolean; toast: (m: string) => void; onUlozeno: (n: NastaveniPoukazu) => void;
}) {
  const symbol = useSymbol();
  const money = useMoney();
  const text = (n: number) => (n ? String(n) : '');
  const [minUtrata, setMinUtrata] = useState(text(nastaveni.minUtrata));
  const [body, setBody] = useState(text(nastaveni.bodyZaNakup));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const beze = minUtrata === text(nastaveni.minUtrata) && body === text(nastaveni.bodyZaNakup);

  const uloz = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = normalizujNastaveniPoukazu(minUtrata, body);
    if (!v.ok) { setErr(v.chyba); return; }
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/client/admin/vouchers', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'settings', minBill: v.nastaveni.minUtrata, pointsPer100: v.nastaveni.bodyZaNakup }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Nastavení se nepodařilo uložit.');
      onUlozeno(v.nastaveni); toast('Nastavení poukazů uloženo.');
    } catch (e2) { setErr(apiMessage(e2, 'Nastavení se nepodařilo uložit.')); }
    setBusy(false);
  };

  return (
    <form onSubmit={uloz} className="space-y-3 border-t border-[var(--surface-line)] pt-4" aria-labelledby="pk-dalsi">
      <div>
        <h3 id="pk-dalsi" className="t-label">Útrata a body</h3>
        <p className="t-meta mt-0.5">
          {nastaveni.minUtrata ? `Poukaz jde uplatnit u účtu od ${money(nastaveni.minUtrata)}: obsluha při uplatnění zadá výši účtu. ` : 'Poukaz jde uplatnit u libovolného účtu. '}
          {nastaveni.bodyZaNakup ? `Kupující člen dostane ${nastaveni.bodyZaNakup} bodů za každých 100 ${symbol} hodnoty poukazu. ` : 'Za nákup poukazu se body nepřipisují. '}
          {bezBodu ? 'Z části účtu zaplacené poukazem se body a cashback nepočítají.' : 'Body a cashback se počítají z celého účtu, i z části zaplacené poukazem.'}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="pk-minutrata" label={`Uplatnit od účtu (${symbol})`} hint={`Prázdné = bez podmínky. Nejvýš ${cisloCs(MAX_MIN_UTRATA_POUKAZU)}.`}>
          <Input id="pk-minutrata" type="number" inputMode="numeric" min={0} max={MAX_MIN_UTRATA_POUKAZU} step={1} value={minUtrata} onChange={e => setMinUtrata(e.target.value)} placeholder="Bez podmínky" />
        </Field>
        <Field id="pk-body" label={`Bodů za nákup (za 100 ${symbol})`} hint={`Prázdné = žádné body. Nejvýš ${MAX_BODU_ZA_NAKUP}.`}>
          <Input id="pk-body" type="number" inputMode="numeric" min={0} max={MAX_BODU_ZA_NAKUP} step={1} value={body} onChange={e => setBody(e.target.value)} placeholder="Žádné" />
        </Field>
      </div>
      <p className="t-meta">Počítání bodů z uplatněného poukazu nastavíš ve Věrnosti → Body a úrovně → „Kredit a poukaz bez bodů“ (teď {bezBodu ? 'zapnuto' : 'vypnuto'}).</p>
      {err && <p role="alert" className="note note-danger">{err}</p>}
      <Button type="submit" size="sm" variant="secondary" loading={busy} disabled={beze}>Uložit nastavení</Button>
    </form>
  );
}

/** Export pro účetnictví: rozsah měsíců a dvě tlačítka (souhrn po měsících, deník pohybů). */
export function PoukazyUcetnictvi({ toast }: { toast: (m: string) => void }) {
  const dnesMesic = pragueToday().slice(0, 7);
  const [od, setOd] = useState(`${Number(dnesMesic.slice(0, 4)) - 1}-${dnesMesic.slice(5)}`);
  const [do_, setDo] = useState(dnesMesic);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const rozsah = overRozsahExportu(od, do_, dnesMesic);

  const stahni = async (druh: 'mesice' | 'pohyby') => {
    if (!rozsah.ok) { setErr(rozsah.chyba); return; }
    setBusy(druh); setErr('');
    try {
      const r = await fetch(`/api/client/admin/vouchers?export=${druh}&od=${rozsah.od}&do=${rozsah.do}`);
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Export se nepovedl.');
      const v = await ulozSoubor(`poukazy-${druh}-${rozsah.od}-${rozsah.do}.csv`, await r.text(), 'text/csv;charset=utf-8');
      if (v === 'nejde') toast(HLASKA_NEJDE_ULOZIT);
    } catch (e) { setErr(apiMessage(e, 'Export se nepovedl.')); }
    setBusy('');
  };

  return (
    <div className="space-y-3 border-t border-[var(--surface-line)] pt-4" role="group" aria-labelledby="pk-ucetni">
      <div>
        <h3 id="pk-ucetni" className="t-label">Export pro účetnictví</h3>
        <p className="t-meta mt-0.5">Souhrn po měsících (kolik se prodalo, uplatnilo a vrátilo) nebo deník všech pohybů s datem, kódem a zůstatkem po pohybu. Měsíce se berou v pražském čase.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 max-w-md">
        <Field id="pk-ex-od" label="Od měsíce"><Input id="pk-ex-od" type="month" value={od} max={do_} onChange={e => { setOd(e.target.value); setErr(''); }} /></Field>
        <Field id="pk-ex-do" label="Do měsíce"><Input id="pk-ex-do" type="month" value={do_} max={dnesMesic} onChange={e => { setDo(e.target.value); setErr(''); }} /></Field>
      </div>
      {!rozsah.ok && <p className="t-meta" role="status">{rozsah.chyba}</p>}
      {err && <p role="alert" className="note note-danger">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" icon="download" loading={busy === 'mesice'} disabled={!rozsah.ok} onClick={() => stahni('mesice')}>Souhrn po měsících (CSV)</Button>
        <Button type="button" size="sm" variant="secondary" icon="download" loading={busy === 'pohyby'} disabled={!rozsah.ok} onClick={() => stahni('pohyby')}>Deník pohybů (CSV)</Button>
      </div>
    </div>
  );
}
