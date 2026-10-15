'use client';

// Formulář oznámení nezákonného obsahu (DSA čl. 16 odst. 2): co a kde, proč je to nezákonné,
// kontakt (jméno a e-mail; u ohrožení dětí nepovinné) a prohlášení o dobré víře. Kontrola je
// stejná jako na serveru (lib/dsa.ts platneOznameni), takže chyba se ukáže hned u pole.

import { useState } from 'react';
import { KATEGORIE_DSA, platneOznameni } from '@/lib/dsa';

type Pole = 'url' | 'popis' | 'kategorie' | 'zduvodneni' | 'jmeno' | 'email' | 'prohlaseni';

export default function Formular() {
  const [h, setH] = useState({ url: '', popis: '', kategorie: '', zduvodneni: '', jmeno: '', email: '' });
  const [prohlaseni, setProhlaseni] = useState(false);
  const [chyba, setChyba] = useState<{ pole: Pole | null; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [hotovo, setHotovo] = useState<{ id: number; potvrzeni: boolean } | null>(null);
  const nastav = (k: keyof typeof h) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setH(x => ({ ...x, [k]: e.target.value }));
    if (chyba?.pole === k) setChyba(null);
  };
  const deti = h.kategorie === 'deti';

  const odeslat = async (e: React.FormEvent) => {
    e.preventDefault();
    const telo = { ...h, prohlaseni };
    const v = platneOznameni(telo);
    if (!v.ok) {
      setChyba({ pole: v.pole as Pole, text: v.error });
      document.getElementById(`dsa-${v.pole}`)?.focus();
      return;
    }
    setBusy(true); setChyba(null);
    try {
      const r = await fetch('/api/nahlasit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telo) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setChyba({ pole: (d.pole as Pole) ?? null, text: d.error || 'Oznámení se nepodařilo odeslat. Zkuste to znovu.' }); return; }
      setHotovo({ id: Number(d.id), potvrzeni: d.potvrzeni === true });
    } catch {
      setChyba({ pole: null, text: 'Oznámení se nepodařilo odeslat. Zkontrolujte připojení a zkuste to znovu.' });
    } finally { setBusy(false); }
  };

  if (hotovo) return (
    <section aria-labelledby="h-dsa-hotovo" className="card p-5 sm:p-6" data-dsa-hotovo>
      <h2 id="h-dsa-hotovo" className="t-section">Oznámení jsme přijali</h2>
      <p role="status" className="note note-ok mt-4">
        Číslo oznámení: #{hotovo.id}. {hotovo.potvrzeni ? 'Potvrzení jsme poslali na váš e-mail.' : 'Potvrzení e-mailem teď odejít nemohlo; oznámení je ale uložené a posoudíme ho.'}
      </p>
      <p className="t-meta mt-3 text-pretty">O rozhodnutí vám napíšeme. Pokud budete chtít něco doplnit, odpovězte na potvrzení nebo napište na kontakt níž s číslem oznámení.</p>
    </section>
  );

  const err = (p: Pole) => (chyba?.pole === p ? { 'aria-invalid': true as const, 'aria-describedby': `dsa-${p}-chyba` } : {});
  const hlaska = (p: Pole) => chyba?.pole === p ? <p id={`dsa-${p}-chyba`} role="alert" className="mt-1.5 text-sm text-bad-ink">{chyba.text}</p> : null;

  return (
    <section aria-labelledby="h-dsa-form" className="card p-5 sm:p-6">
      <h2 id="h-dsa-form" className="t-section">Oznámení</h2>
      <form onSubmit={odeslat} className="mt-4 grid gap-4" noValidate>
        <div>
          <label htmlFor="dsa-url" className="field-label">Odkaz na obsah <span className="font-normal text-black/50">(nepovinné)</span></label>
          <input id="dsa-url" type="url" inputMode="url" autoComplete="url" placeholder="https://www.managero.app/client/…" value={h.url} onChange={nastav('url')} className="field" {...err('url')} />
          {hlaska('url')}
        </div>
        <div>
          <label htmlFor="dsa-popis" className="field-label">Co a kde</label>
          <textarea id="dsa-popis" rows={3} value={h.popis} onChange={nastav('popis')} className="field min-h-[5.5rem]" {...err('popis')}
            placeholder="Například: fotka v nabídce podniku Kavárna U Mostu, akce „…“, zpráva od …" />
          {hlaska('popis')}
        </div>
        <div>
          <label htmlFor="dsa-kategorie" className="field-label">Proč je obsah nezákonný</label>
          <select id="dsa-kategorie" value={h.kategorie} onChange={nastav('kategorie')} className="field" {...err('kategorie')}>
            <option value="">Vyberte…</option>
            {KATEGORIE_DSA.map(k => <option key={k.id} value={k.id}>{k.nazev}</option>)}
          </select>
          {hlaska('kategorie')}
        </div>
        <div>
          <label htmlFor="dsa-zduvodneni" className="field-label">Vysvětlení</label>
          <textarea id="dsa-zduvodneni" rows={4} value={h.zduvodneni} onChange={nastav('zduvodneni')} className="field min-h-[7rem]" {...err('zduvodneni')}
            placeholder="Proč si myslíte, že obsah porušuje zákon. Případně který předpis nebo čí práva." />
          {hlaska('zduvodneni')}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="dsa-jmeno" className="field-label">Vaše jméno{deti && <span className="font-normal text-black/50"> (nepovinné)</span>}</label>
            <input id="dsa-jmeno" type="text" autoComplete="name" value={h.jmeno} onChange={nastav('jmeno')} className="field" {...err('jmeno')} />
            {hlaska('jmeno')}
          </div>
          <div>
            <label htmlFor="dsa-email" className="field-label">E-mail{deti && <span className="font-normal text-black/50"> (nepovinné)</span>}</label>
            <input id="dsa-email" type="email" inputMode="email" autoComplete="email" value={h.email} onChange={nastav('email')} className="field" {...err('email')} />
            {hlaska('email')}
          </div>
        </div>
        <div>
          <label className="flex items-start gap-3 min-h-[44px] cursor-pointer select-none" data-dsa-prohlaseni>
            <input id="dsa-prohlaseni" type="checkbox" checked={prohlaseni} onChange={e => { setProhlaseni(e.target.checked); if (chyba?.pole === 'prohlaseni') setChyba(null); }}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#16181A]" {...err('prohlaseni')} />
            <span className="text-sm text-black/75 text-pretty">Prohlašuji v dobré víře, že údaje a tvrzení v tomto oznámení jsou podle mého nejlepšího vědomí přesné a úplné.</span>
          </label>
          {hlaska('prohlaseni')}
        </div>
        {chyba && chyba.pole === null && <p role="alert" className="note note-danger">{chyba.text}</p>}
        <button type="submit" disabled={busy} className="btn btn-primary tap-target w-full sm:w-auto justify-center disabled:opacity-50">{busy ? 'Odesílám…' : 'Odeslat oznámení'}</button>
        <p className="t-meta text-pretty">Údaje použijeme jen k vyřízení oznámení (Akt o digitálních službách). Autorovi obsahu je nepředáváme.</p>
      </form>
    </section>
  );
}
