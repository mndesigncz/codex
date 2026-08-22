'use client';

// Administrace zákaznického menu — toho, co visí na iPadu před podnikem
// a co si host otevře v mobilu přes QR.
//
// Počítá s tím, že se to obsluhuje z telefonu u stánku: velké cíle na prst,
// vyprodáno na jedno ťuknutí a bez ukládání (propíše se hned), zbytek
// se ukládá dohromady tlačítkem.

import { useCallback, useEffect, useState } from 'react';

interface Item {
  id?: number;
  name: string;
  price: number;
  description?: string | null;
  soldOut: boolean;
  posProductId?: string | null;
}
interface Section { id?: number; title: string; column: 1 | 2; items: Item[]; }
interface Board {
  id: number; slug: string; name: string;
  eyebrow: string | null; title: string | null; note: string | null;
  wifiSsid: string | null; wifiPassword: string | null;
  currency: string; enabled: boolean; hasPin?: boolean;
  sections: Section[];
}
interface PosProduct { productId: string; name: string; category: string; price: number | null; }

const vstup =
  'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-sm focus:border-[#C8F542]/50 focus:outline-none';

export default function MenuEditor() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [aktivni, setAktivni] = useState<number | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [nacitam, setNacitam] = useState(true);
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [hlaska, setHlaska] = useState<string | null>(null);
  const [neniMigrace, setNeniMigrace] = useState(false);
  const [pin, setPin] = useState('');
  /* Ukládá se až tlačítkem, takže je potřeba dát najevo, že něco čeká. */
  const [neulozeno, setNeulozeno] = useState(false);

  const load = useCallback(async () => {
    setNacitam(true);
    try {
      const r = await fetch('/api/menu');
      const d = await r.json().catch(() => ({}));
      if (d?.notMigrated) setNeniMigrace(true);
      const list: Board[] = Array.isArray(d?.boards) ? d.boards : [];
      setBoards(list);
      setAktivni((a) => (a && list.some((b) => b.id === a) ? a : list[0]?.id ?? null));
      if (!list.length) setBoard(null);
    } catch {
      setChyba('Menu se nepodařilo načíst.');
    } finally {
      setNacitam(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Rozdělaná editace se nesmí ztratit zavřením okna nebo odklikem jinam. */
  useEffect(() => {
    if (!neulozeno) return;
    const hlidac = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', hlidac);
    return () => window.removeEventListener('beforeunload', hlidac);
  }, [neulozeno]);

  /* Rozpracovaná deska je vždycky kopie — ať se needituje to, co drží seznam. */
  useEffect(() => {
    if (aktivni == null) { setBoard(null); return; }
    const b = boards.find((x) => x.id === aktivni);
    if (b) { setBoard(JSON.parse(JSON.stringify(b))); setNeulozeno(false); }
  }, [aktivni, boards]);

  /** Založí menu. Prvni = z dnešní nabídky, další = prázdné, ať se nekopírují ceny. */
  const zalozit = async (prvni: boolean) => {
    const nazev = prvni ? 'Venkovní akce' : (prompt('Název nového menu (třeba Stálá nabídka):') || '').trim();
    if (!prvni && !nazev) return;
    setUkladam(true); setChyba(null); setHlaska(null);
    try {
      const r = await fetch('/api/menu', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prvni
          ? { name: 'Venkovní akce', slug: 'akce', seed: true }
          : { name: nazev, slug: nazev, seed: false }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setChyba(d?.error ?? 'Menu se nepodařilo založit.'); return; }
      await load();
      if (d?.board?.id) setAktivni(d.board.id);
      setHlaska(prvni
        ? 'Menu je založené i s dnešní nabídkou.'
        : `Menu „${d?.board?.name ?? nazev}“ je založené. Adresu má /menu-akce.html?menu=${d?.board?.slug ?? ''}`);
    } catch {
      // Bez tohohle by selhání sítě zmizelo beze stopy: tlačítko by se
      // odemklo a uživatel by netušil, že se nic neuložilo.
      setChyba('Menu se nepodařilo založit — spojení se serverem selhalo. Zkus to prosím znovu.');
    } finally { setUkladam(false); }
  };

  const smazat = async () => {
    if (!board) return;
    if (!confirm(`Smazat menu „${board.name}“ i se všemi položkami? Tohle nejde vzít zpět.`)) return;
    setUkladam(true);
    try {
      const r = await fetch(`/api/menu?id=${board.id}`, { method: 'DELETE' });
      if (!r.ok) { setChyba('Menu se nepodařilo smazat.'); return; }
      setAktivni(null);
      await load();
    } catch {
      setChyba('Menu se nepodařilo smazat — spojení se serverem selhalo.');
    } finally { setUkladam(false); }
  };

  const ulozit = async () => {
    if (!board) return;
    setUkladam(true); setChyba(null); setHlaska(null);
    try {
      const telo: any = { ...board };
      if (pin.trim()) telo.pin = pin.trim();
      const r = await fetch('/api/menu', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telo),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setChyba(d?.error ?? `Uložení se nepodařilo (odpověď serveru ${r.status}).`);
        return;
      }
      setPin('');
      await load();
      setNeulozeno(false);
      setHlaska('Uloženo. Na iPadu se to projeví do minuty, ručně obnovovat nemusíš.');
    } catch {
      setChyba('Uložení se nepodařilo — spojení se serverem selhalo. Změny máš pořád na obrazovce, zkus to znovu.');
    } finally { setUkladam(false); }
  };

  const zrusitPin = async () => {
    if (!board || !confirm('Zrušit PIN? Od stánku pak nepůjde označovat vyprodané položky.')) return;
    await fetch('/api/menu', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: board.id, pin: '' }),
    });
    await load();
  };

  /** Vyprodáno se propisuje hned — během akce na to není čas klikat dvakrát. */
  const prepnoutVyprodano = async (si: number, ii: number) => {
    if (!board) return;
    const polozka = board.sections[si].items[ii];
    const nove = !polozka.soldOut;
    setBoard((b) => {
      if (!b) return b;
      const kopie = JSON.parse(JSON.stringify(b)) as Board;
      kopie.sections[si].items[ii].soldOut = nove;
      return kopie;
    });
    if (!polozka.id) return; // ještě neuložená položka
    const r = await fetch(`/api/menu/public/${board.slug}/soldout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: polozka.id, soldOut: nove }),
    }).catch(() => null);
    if (!r?.ok) setChyba('Vyprodáno se nepodařilo uložit.');
  };

  const upravit = (fn: (b: Board) => void) => {
    setNeulozeno(true);
    setBoard((b) => {
      if (!b) return b;
      const kopie = JSON.parse(JSON.stringify(b)) as Board;
      fn(kopie);
      return kopie;
    });
  };

  const posun = (pole: any[], od: number, smer: -1 | 1) => {
    const kam = od + smer;
    if (kam < 0 || kam >= pole.length) return;
    [pole[od], pole[kam]] = [pole[kam], pole[od]];
  };

  // ---- import z pokladny ----
  const [posOtevreno, setPosOtevreno] = useState<number | null>(null);
  const [posProdukty, setPosProdukty] = useState<PosProduct[] | null>(null);
  const [posStav, setPosStav] = useState<string | null>(null);
  const [posHledat, setPosHledat] = useState('');

  const nacistPos = async (si: number) => {
    setPosOtevreno(si); setPosStav('Načítám katalog kasy…'); setPosHledat('');
    try {
      const r = await fetch('/api/pos/products');
      const d = await r.json().catch(() => ({}));
      if (!d?.connected) { setPosProdukty([]); setPosStav('Pokladna Storyous není připojená. Položky se dají psát ručně.'); return; }
      const p: PosProduct[] = Array.isArray(d?.products) ? d.products : [];
      setPosProdukty(p);
      setPosStav(p.length ? null : 'Katalog kasy je prázdný.');
    } catch {
      setPosProdukty([]); setPosStav('Katalog kasy se nepodařilo načíst.');
    }
  };

  const pridatZPos = (si: number, p: PosProduct) => {
    upravit((b) => {
      b.sections[si].items.push({
        name: p.name, price: p.price ?? 0, soldOut: false, posProductId: p.productId,
      });
    });
    if (p.price == null) setHlaska(`„${p.name}“ přidáno, ale kasa u něj nedala cenu — doplň ji ručně.`);
  };

  // -------------------------------------------------------------------------

  if (nacitam) return <div className="glass-card p-6 text-sm text-black/45">Načítám menu…</div>;

  if (neniMigrace) {
    return (
      <div className="glass-card p-6 space-y-2">
        <h2 className="font-bold tracking-tight text-[#16181A]">Menu pro hosty</h2>
        <p className="text-sm text-black/60">
          Tabulky pro menu ještě nejsou v databázi. Otevři jednou <code>/api/init</code> a vrať se sem.
        </p>
      </div>
    );
  }

  if (!board) {
    return (
      <div className="glass-card p-6 space-y-3">
        <div>
          <h2 className="font-bold tracking-tight text-[#16181A]">Menu pro hosty</h2>
          <p className="text-sm text-black/45">
            To, co visí na iPadu před podnikem a co si host otevře v mobilu přes QR kód.
          </p>
        </div>
        <button type="button" onClick={() => zalozit(true)} disabled={ukladam}
          className="rounded-full bg-[#16181A] text-white font-semibold px-5 py-2.5 text-sm disabled:opacity-50">
          {ukladam ? 'Zakládám…' : 'Založit menu z dnešní nabídky'}
        </button>
        {chyba && <p className="text-red-600 text-sm">{chyba}</p>}
      </div>
    );
  }

  const adresa = `/menu-akce.html?menu=${board.slug}`;

  return (
    <div className="space-y-4">
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="font-bold tracking-tight text-[#16181A]">Menu pro hosty</h2>
            <p className="text-sm text-black/45">
              Změny se projeví na iPadu i v mobilech hostů po obnovení stránky.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={aktivni ?? ''} onChange={(e) => setAktivni(Number(e.target.value))}
              className="rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3 py-2 text-sm">
              {boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <button type="button" onClick={() => zalozit(false)} disabled={ukladam}
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-black/60 disabled:opacity-50">
              + Nové menu
            </button>
          </div>
        </div>

        <a href={adresa} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#5B9E00] underline underline-offset-2">
          Otevřít menu tak, jak ho vidí host ↗
        </a>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-black/50">Název menu (jen pro vás)</span>
            <input className={vstup} value={board.name} maxLength={80}
              onChange={(e) => upravit((b) => { b.name = e.target.value; })} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-black/50">Adresa</span>
            <input className={vstup} value={board.slug} maxLength={40}
              onChange={(e) => upravit((b) => { b.slug = e.target.value; })} />
            <span className="block text-[11px] text-black/35">
              Bez diakritiky a mezer. Když ji změníš, přestane platit starý QR kód.
            </span>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-black/50">Nadpis</span>
            <input className={vstup} value={board.title ?? ''} maxLength={80}
              onChange={(e) => upravit((b) => { b.title = e.target.value; })} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-black/50">Popisek nad nadpisem</span>
            <input className={vstup} value={board.eyebrow ?? ''} maxLength={80}
              onChange={(e) => upravit((b) => { b.eyebrow = e.target.value; })} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-black/50">Wifi — síť</span>
            <input className={vstup} value={board.wifiSsid ?? ''} maxLength={80}
              onChange={(e) => upravit((b) => { b.wifiSsid = e.target.value; })} />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-black/50">Wifi — heslo</span>
            <input className={vstup} value={board.wifiPassword ?? ''} maxLength={80}
              onChange={(e) => upravit((b) => { b.wifiPassword = e.target.value; })} />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-semibold text-black/50">Poznámka v patičce</span>
            <input className={vstup} value={board.note ?? ''} maxLength={200}
              onChange={(e) => upravit((b) => { b.note = e.target.value; })} />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-black/50">
              PIN pro označování vyprodaného od stánku {board.hasPin && '(nastavený)'}
            </span>
            <input className={vstup} value={pin} inputMode="numeric" placeholder={board.hasPin ? '••••' : '4 až 8 číslic'}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
            <span className="block text-[11px] text-black/35">
              Na iPadu se zadá jednou a zapamatuje se. Bez PINu jde vyprodáno přepínat jen tady.
            </span>
          </label>
          <div className="flex items-end gap-2">
            {board.hasPin && (
              <button type="button" onClick={zrusitPin}
                className="rounded-full border border-black/10 px-4 py-2.5 text-sm font-medium text-black/60">
                Zrušit PIN
              </button>
            )}
            <label className="flex items-center gap-2 cursor-pointer text-sm text-black/60 py-2.5">
              <input type="checkbox" checked={board.enabled} className="h-4 w-4 rounded accent-[#5B9E00]"
                onChange={(e) => upravit((b) => { b.enabled = e.target.checked; })} />
              Menu je veřejně dostupné
            </label>
          </div>
        </div>
      </div>

      {board.sections.map((s, si) => (
        <div key={s.id ?? `nova-${si}`} className="glass-card p-6 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <input className={`${vstup} flex-1 min-w-[8rem] font-semibold`} value={s.title} maxLength={80}
              onChange={(e) => upravit((b) => { b.sections[si].title = e.target.value; })} />
            <select value={s.column} className="rounded-2xl bg-black/[0.04] border border-black/[0.08] px-3 py-3 text-sm"
              onChange={(e) => upravit((b) => { b.sections[si].column = Number(e.target.value) === 2 ? 2 : 1; })}>
              <option value={1}>Vlevo</option>
              <option value={2}>Vpravo</option>
            </select>
            <button type="button" title="Nahoru" onClick={() => upravit((b) => posun(b.sections, si, -1))}
              className="rounded-full border border-black/10 w-10 h-10 text-black/50">↑</button>
            <button type="button" title="Dolů" onClick={() => upravit((b) => posun(b.sections, si, 1))}
              className="rounded-full border border-black/10 w-10 h-10 text-black/50">↓</button>
            <button type="button" title="Smazat sekci"
              onClick={() => { if (confirm(`Smazat sekci „${s.title}“ i s položkami?`)) upravit((b) => { b.sections.splice(si, 1); }); }}
              className="rounded-full border border-red-200 w-10 h-10 text-red-500">×</button>
          </div>

          <div className="space-y-2">
            {s.items.map((it, ii) => (
              <div key={it.id ?? `nova-${ii}`} className="rounded-2xl border border-black/[0.06] p-3 space-y-2">
                <div className="flex gap-2 flex-wrap">
                  <input className={`${vstup} flex-1 min-w-[10rem]`} value={it.name} maxLength={80} placeholder="Název položky"
                    onChange={(e) => upravit((b) => { b.sections[si].items[ii].name = e.target.value; })} />
                  <input className={`${vstup} w-24`} value={it.price} inputMode="numeric" placeholder="Cena"
                    onChange={(e) => upravit((b) => { b.sections[si].items[ii].price = Number(e.target.value.replace(/\D/g, '')) || 0; })} />
                </div>
                <input className={vstup} value={it.description ?? ''} maxLength={200} placeholder="Popisek (nepovinný)"
                  onChange={(e) => upravit((b) => { b.sections[si].items[ii].description = e.target.value; })} />
                <div className="flex items-center gap-2 flex-wrap">
                  <button type="button" onClick={() => prepnoutVyprodano(si, ii)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold ${
                      it.soldOut ? 'bg-red-500 text-white' : 'border border-black/10 text-black/60'}`}>
                    {it.soldOut ? 'Vyprodáno' : 'Na skladě'}
                  </button>
                  {it.posProductId && <span className="text-[11px] text-black/35">z kasy</span>}
                  <span className="flex-1" />
                  <button type="button" title="Nahoru" onClick={() => upravit((b) => posun(b.sections[si].items, ii, -1))}
                    className="rounded-full border border-black/10 w-9 h-9 text-black/50">↑</button>
                  <button type="button" title="Dolů" onClick={() => upravit((b) => posun(b.sections[si].items, ii, 1))}
                    className="rounded-full border border-black/10 w-9 h-9 text-black/50">↓</button>
                  <button type="button" title="Smazat položku"
                    onClick={() => upravit((b) => { b.sections[si].items.splice(ii, 1); })}
                    className="rounded-full border border-red-200 w-9 h-9 text-red-500">×</button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 flex-wrap">
            <button type="button"
              onClick={() => upravit((b) => { b.sections[si].items.push({ name: '', price: 0, soldOut: false }); })}
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-black/60">
              + Položka
            </button>
            <button type="button" onClick={() => nacistPos(si)}
              className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-black/60">
              + Z pokladny
            </button>
          </div>

          {posOtevreno === si && (
            <div className="rounded-2xl border border-black/[0.08] p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input className={`${vstup} flex-1`} value={posHledat} placeholder="Hledat v katalogu kasy…"
                  onChange={(e) => setPosHledat(e.target.value)} />
                <button type="button" onClick={() => setPosOtevreno(null)}
                  className="rounded-full border border-black/10 px-3 py-2 text-sm text-black/50">Zavřít</button>
              </div>
              {posStav && <p className="text-sm text-black/45">{posStav}</p>}
              <div className="max-h-64 overflow-y-auto space-y-1">
                {(posProdukty ?? [])
                  .filter((p) => !posHledat || (p.name + ' ' + p.category).toLowerCase().includes(posHledat.toLowerCase()))
                  .slice(0, 80)
                  .map((p) => (
                    <button key={p.productId} type="button" onClick={() => pridatZPos(si, p)}
                      className="w-full text-left rounded-xl px-3 py-2 hover:bg-black/[0.04] flex items-center gap-2">
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm truncate">{p.name}</span>
                        {p.category && <span className="block text-[11px] text-black/35 truncate">{p.category}</span>}
                      </span>
                      <span className="text-sm font-semibold text-black/60 whitespace-nowrap">
                        {p.price != null ? `${p.price} ${board.currency}` : 'bez ceny'}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      ))}

      <div className="glass-card p-6 space-y-3">
        <button type="button"
          onClick={() => upravit((b) => { b.sections.push({ title: 'Nová sekce', column: 1, items: [] }); })}
          className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-black/60">
          + Sekce
        </button>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          {chyba && <p className="text-red-600 text-sm">{chyba}</p>}
          {hlaska && !chyba && <p className="text-[#5B9E00] text-sm">{hlaska}</p>}
          {neulozeno && !chyba && (
            <p className="text-amber-700 text-sm font-semibold">Máš neuložené změny</p>
          )}
          <span className="flex-1" />
          <button type="button" onClick={smazat} disabled={ukladam}
            className="rounded-full border border-red-200 px-4 py-2.5 text-sm font-medium text-red-500 disabled:opacity-50">
            Smazat menu
          </button>
          <button type="button" onClick={ulozit} disabled={ukladam}
            className={`rounded-full font-semibold px-5 py-2.5 text-sm disabled:opacity-50 ${
              neulozeno ? 'bg-[#C8F542] text-black' : 'bg-[#16181A] text-white'}`}>
            {ukladam ? 'Ukládám…' : neulozeno ? 'Uložit změny' : 'Uložit menu'}
          </button>
        </div>
      </div>
    </div>
  );
}
