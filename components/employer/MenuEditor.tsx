'use client';

// Administrace zákaznického menu — toho, co visí na iPadu před podnikem
// a co si host otevře v mobilu přes QR.
//
// Počítá s tím, že se to obsluhuje z telefonu u stánku: velké cíle na prst,
// vyprodáno na jedno ťuknutí a bez ukládání (propíše se hned), zbytek
// se ukládá dohromady tlačítkem.

import { useCallback, useEffect, useState } from 'react';
import {
  type MenuTheme, VYCHOZI_THEME, PREDLOHY, PISMA, normalizeMenuTheme,
} from '@/lib/menuTheme';

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
  theme: MenuTheme;
  sections: Section[];
}
interface PosProduct { productId: string; name: string; category: string; price: number | null; }

/* Adresa, kterou si stránka /menu-akce.html vezme, když se otevře bez parametru.
   Menu s touhle adresou je tím pádem „to, co visí na iPadu“. */
const VYCHOZI_SLUG = 'akce';

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
  const [vzhledOtevren, setVzhledOtevren] = useState(false);
  /* Ukládá se až tlačítkem, takže je potřeba dát najevo, že něco čeká. */
  const [neulozeno, setNeulozeno] = useState(false);
  /*
   * Uložení do databáze ještě neznamená, že to host uvidí: iPad má
   * otevřenou konkrétní adresu a když ta na žádné menu nesedí, ukáže
   * záložní obsah a tváří se, že je všechno v pořádku. Tohle to kontroluje
   * naživo, ať se na to nepřijde až u stánku.
   */
  const [zive, setZive] = useState<'ceka' | 'ok' | 'chybi' | 'vypnuto' | 'neznamo'>('ceka');

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

  /* Ptáme se přesně tou cestou, kterou používá iPad i mobil hosta. */
  const ulozenySlug = boards.find((x) => x.id === aktivni)?.slug ?? null;
  const ulozeneZapnuto = boards.find((x) => x.id === aktivni)?.enabled ?? null;
  useEffect(() => {
    if (!ulozenySlug) { setZive('ceka'); return; }
    if (ulozeneZapnuto === false) { setZive('vypnuto'); return; }
    let platne = true;
    setZive('ceka');
    fetch(`/api/menu/public/${ulozenySlug}`, { cache: 'no-store' })
      .then((r) => { if (platne) setZive(r.ok ? 'ok' : 'chybi'); })
      .catch(() => { if (platne) setZive('neznamo'); });
    return () => { platne = false; };
  }, [ulozenySlug, ulozeneZapnuto]);

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

  /**
   * `prevzitAdresu` řekne serveru, že se smí zabraná adresa odebrat jinému
   * menu stejného podniku. Bez toho by se z kolize nedalo dostat.
   */
  const ulozit = async (navic?: Record<string, any>) => {
    if (!board) return;
    setUkladam(true); setChyba(null); setHlaska(null);
    try {
      const telo: any = { ...board, ...navic, theme: normalizeMenuTheme(board.theme) };
      if (pin.trim()) telo.pin = pin.trim();
      const r = await fetch('/api/menu', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telo),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 409 && d?.adresuDrziNase && !navic?.prevzitAdresu) {
          const ok = confirm(
            `${d.error} Chceš ji převzít? Menu „${d.drziNazev}“ dostane jinou adresu ` +
            `a hostům se od té chvíle bude na téhle adrese ukazovat tohle menu.`);
          if (ok) { setUkladam(false); await ulozit({ ...navic, prevzitAdresu: true }); return; }
        }
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

  /**
   * Náprava na jedno ťuknutí. Změna jde do `ulozit` zvlášť, protože stav
   * Reactu se v tomhle tiku ještě nepřekreslil — čekat na něj by znamenalo
   * odeslat starou hodnotu.
   */
  const zverejnit = async (zmena: Record<string, any>) => {
    upravit((b) => Object.assign(b, zmena));
    await ulozit(zmena);
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

  /* Relativní odkaz stačí pro proklik, ale na iPad se to opisuje ručně,
     takže se ukazuje celá adresa i s doménou. */
  const cesta = `/menu-akce.html?menu=${board.slug}`;
  const adresa = typeof window === 'undefined' ? cesta : window.location.origin + cesta;

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

        <div className="rounded-2xl bg-black/[0.03] border border-black/[0.06] p-4 space-y-2">
          <p className="text-xs font-semibold text-black/50">Adresa pro iPad a pro hosty</p>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-sm font-mono text-[#16181A] break-all">{adresa}</code>
            <a href={cesta} target="_blank" rel="noreferrer"
              className="text-sm font-medium text-[#5B9E00] underline underline-offset-2">
              Otevřít ↗
            </a>
          </div>

          {zive === 'ok' && (
            <p className="text-xs text-black/45">
              Na téhle adrese se hostům ukazuje tohle menu. Úpravy se na iPadu projeví do minuty.
            </p>
          )}
          {zive === 'ceka' && <p className="text-xs text-black/35">Kontroluju adresu…</p>}
          {zive === 'neznamo' && (
            <p className="text-xs text-black/45">Adresu se teď nepodařilo ověřit — zkontroluj připojení.</p>
          )}
          {zive === 'vypnuto' && (
            <p className="text-xs text-amber-700">
              Menu je vypnuté, takže se hostům neukazuje.
            </p>
          )}
          {zive === 'chybi' && (
            <p className="text-xs text-amber-700">
              {ulozenySlug === VYCHOZI_SLUG
                ? 'Pozor: server na téhle adrese žádné menu nevydává, takže iPad ukazuje záložní nabídku.'
                : 'Pozor: iPad otevřený bez parametru bere menu s adresou „akce“, a to tohle menu není — proto se tvoje úpravy hostům neukazují.'}
            </p>
          )}

          {/*
            U každé hlášky musí být i náprava. Dřív se tlačítko na adresu
            schovávalo, když adresa už seděla — u vypnutého menu tak zbyla
            hláška, se kterou nešlo nic udělat.
          */}
          {(zive === 'chybi' || zive === 'vypnuto') && (
            <div className="pt-1">
              {/* Vypnuté menu se má zapnout, ne mu přepisovat adresu — u druhého
                  menu s vlastní adresou by mu ji přepis vzal. */}
              {zive === 'vypnuto' ? (
                <button type="button" disabled={ukladam} onClick={() => zverejnit({ enabled: true })}
                  className="rounded-full bg-[#16181A] text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
                  {ukladam ? 'Ukládám…' : 'Zapnout menu pro hosty'}
                </button>
              ) : ulozenySlug !== VYCHOZI_SLUG ? (
                <button type="button" disabled={ukladam} onClick={() => zverejnit({ slug: VYCHOZI_SLUG })}
                  className="rounded-full bg-[#16181A] text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
                  {ukladam ? 'Ukládám…' : 'Nastavit jako menu pro iPad'}
                </button>
              ) : (
                <button type="button" disabled={ukladam}
                  onClick={() => zverejnit({ slug: VYCHOZI_SLUG, enabled: true })}
                  className="rounded-full bg-[#16181A] text-white px-4 py-2 text-sm font-semibold disabled:opacity-50">
                  {ukladam ? 'Ukládám…' : 'Zveřejnit znovu'}
                </button>
              )}
            </div>
          )}
        </div>

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

      <div className="glass-card p-6 space-y-4">
        <button type="button" onClick={() => setVzhledOtevren((v) => !v)}
          className="w-full flex items-center justify-between gap-3 text-left">
          <span className="min-w-0">
            <span className="block font-bold tracking-tight text-[#16181A]">Vzhled menu</span>
            <span className="block text-sm text-black/45">
              Barvy, logo, písma a prvky na pozadí. Platí jen pro tohle menu.
            </span>
          </span>
          <span className="text-black/40 text-sm">{vzhledOtevren ? 'Skrýt' : 'Upravit'}</span>
        </button>

        {vzhledOtevren && (() => {
          const t = normalizeMenuTheme(board.theme);
          const setT = (fn: (x: MenuTheme) => void) =>
            upravit((b) => { const kop = normalizeMenuTheme(b.theme); fn(kop); b.theme = kop; });

          const Barva = ({ popis, hodnota, zmen }: { popis: string; hodnota: string; zmen: (v: string) => void }) => (
            <label className="space-y-1">
              <span className="text-xs font-semibold text-black/50">{popis}</span>
              <span className="flex items-center gap-2">
                <input type="color" value={hodnota} onChange={(e) => zmen(e.target.value)}
                  className="h-10 w-12 rounded-xl border border-black/[0.08] bg-transparent p-1 cursor-pointer" />
                <input value={hodnota} maxLength={9} onChange={(e) => zmen(e.target.value)}
                  className={`${vstup} font-mono`} />
              </span>
            </label>
          );

          return (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {PREDLOHY.map((p) => (
                  <button key={p.id} type="button"
                    onClick={() => setT((x) => { x.den = { ...p.theme.den }; x.noc = { ...p.theme.noc }; })}
                    className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-black/60 flex items-center gap-2">
                    <span className="inline-flex">
                      <span className="w-3 h-3 rounded-full border border-black/10" style={{ background: p.theme.den.bg }} />
                      <span className="w-3 h-3 rounded-full border border-black/10 -ml-1" style={{ background: p.theme.den.accent }} />
                    </span>
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-black/40">Den</p>
                  <Barva popis="Pozadí" hodnota={t.den.bg} zmen={(v) => setT((x) => { x.den.bg = v; })} />
                  <Barva popis="Text" hodnota={t.den.fg} zmen={(v) => setT((x) => { x.den.fg = v; })} />
                  <Barva popis="Tlumený text" hodnota={t.den.fgSoft} zmen={(v) => setT((x) => { x.den.fgSoft = v; })} />
                  <Barva popis="Nadpisy a ceny" hodnota={t.den.accent} zmen={(v) => setT((x) => { x.den.accent = v; })} />
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-black/40">Noc</p>
                  <Barva popis="Pozadí" hodnota={t.noc.bg} zmen={(v) => setT((x) => { x.noc.bg = v; })} />
                  <Barva popis="Text" hodnota={t.noc.fg} zmen={(v) => setT((x) => { x.noc.fg = v; })} />
                  <Barva popis="Tlumený text" hodnota={t.noc.fgSoft} zmen={(v) => setT((x) => { x.noc.fgSoft = v; })} />
                  <Barva popis="Nadpisy a ceny" hodnota={t.noc.accent} zmen={(v) => setT((x) => { x.noc.accent = v; })} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-black/50">Logo (odkaz na obrázek)</span>
                  <input className={vstup} value={t.logo.url} maxLength={2000} placeholder="Prázdné = logo Managero ve stránce"
                    onChange={(e) => setT((x) => { x.logo.url = e.target.value; })} />
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-black/50">Jak logo vykreslit</span>
                  <select value={t.logo.rezim} className={vstup}
                    onChange={(e) => setT((x) => { x.logo.rezim = e.target.value === 'obrazek' ? 'obrazek' : 'maska'; })}>
                    <option value="maska">Obarvit barvou nadpisů (jednobarevné logo)</option>
                    <option value="obrazek">Vložit tak, jak je (vícebarevné logo)</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-black/50">Písmo nadpisů</span>
                  <select value={t.pismo.nadpisy} className={vstup}
                    onChange={(e) => setT((x) => { x.pismo.nadpisy = e.target.value; })}>
                    {PISMA.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-black/50">Písmo textu</span>
                  <select value={t.pismo.text} className={vstup}
                    onChange={(e) => setT((x) => { x.pismo.text = e.target.value; })}>
                    {PISMA.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-black/50">Prvky na pozadí</span>
                  <select value={t.pozadi.druh} className={vstup}
                    onChange={(e) => setT((x) => { x.pozadi.druh = e.target.value as any; })}>
                    <option value="listy">Listy (kresba Pangey)</option>
                    <option value="zadne">Žádné</option>
                    <option value="vlastni">Vlastní obrázek</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-semibold text-black/50">Síla prvků: {t.pozadi.sila} %</span>
                  <input type="range" min={0} max={20} step={0.5} value={t.pozadi.sila}
                    className="w-full accent-[#5B9E00]"
                    onChange={(e) => setT((x) => { x.pozadi.sila = Number(e.target.value); })} />
                </label>
                {t.pozadi.druh === 'vlastni' && (
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-xs font-semibold text-black/50">Obrázek na pozadí</span>
                    <input className={vstup} value={t.pozadi.url} maxLength={2000} placeholder="https://…"
                      onChange={(e) => setT((x) => { x.pozadi.url = e.target.value; })} />
                    <span className="block text-[11px] text-black/35">
                      Jednobarevná kresba na průhledném pozadí. Obarví se podle textu, takže drží v obou režimech.
                    </span>
                  </label>
                )}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <button type="button"
                  onClick={() => setT((x) => { Object.assign(x, JSON.parse(JSON.stringify(VYCHOZI_THEME))); })}
                  className="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-black/60">
                  Vrátit původní vzhled
                </button>
                <span className="text-[11px] text-black/35">
                  Vzhled se uloží spolu se zbytkem menu tlačítkem dole.
                </span>
              </div>
            </div>
          );
        })()}
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
          <button type="button" onClick={() => ulozit()} disabled={ukladam}
            className={`rounded-full font-semibold px-5 py-2.5 text-sm disabled:opacity-50 ${
              neulozeno ? 'bg-[#C8F542] text-black' : 'bg-[#16181A] text-white'}`}>
            {ukladam ? 'Ukládám…' : neulozeno ? 'Uložit změny' : 'Uložit menu'}
          </button>
        </div>
      </div>

      {/*
        Menu bývá dlouhé a tlačítko Uložit je až úplně dole. Kdo přidá položku
        v polovině seznamu, snadno odejde v domnění, že je hotovo — a změny
        se nikam neuloží. Dokud něco čeká, drží se ukládání na očích.
      */}
      {neulozeno && (
        <div className="sticky bottom-4 z-20 flex justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-[#16181A] text-white shadow-lg pl-5 pr-2 py-2">
            <span className="text-sm font-medium">Neuložené změny</span>
            <button type="button" onClick={() => ulozit()} disabled={ukladam}
              className="rounded-full bg-[#C8F542] text-black font-semibold px-5 py-2 text-sm disabled:opacity-50">
              {ukladam ? 'Ukládám…' : 'Uložit'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
