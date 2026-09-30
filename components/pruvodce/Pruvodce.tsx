'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Modal } from '@/components/ui';
import { LogoMark } from '@/components/Icons';
import { apiMessage, okJson } from '@/lib/api';
import type { IdScenyDema } from '@/lib/demo/sceny';
import { vychoziDoba, POZICE } from '@/lib/pruvodce/predvolby';
import { cistiDobu } from '@/lib/pruvodce/predvolby';
import {
  CILE, jeKrok, krokPoObnoveni, krokyProOdpovedi, type Cil, type KrokId, type Odpovedi, type Tarif, type TypPodniku,
} from '@/lib/pruvodce/typy';
import FotoKroku from './FotoKroku';
import Kulisa, { ID_FORMULARE } from './Kulisa';
import type { IdFotky } from './foto';
import type { FazeSestaveni } from './kroky/Hotovo';
import type { InfoPodniku, KrokProps, VysledekSestaveni } from './kroky/spolecne';
import Vitej from './kroky/Vitej';
import Typ from './kroky/Typ';
import { vybraneCile } from './kroky/Cile';

// Průvodce prvotním nastavením: stavový stroj.
//
//  - Stav žije na serveru (teams.onboarding). Po každém kroku se odpovědi
//    uloží (PUT /api/onboarding) a KROK SE NEPUSTÍ DÁL, dokud uložení
//    neprojde: zavřená záložka ani výpadek sítě nic neztratí a člověk vidí
//    proč se nehnul. Zpět se jde bez ukládání (nic se nemění).
//  - Nastavení se aplikuje najednou na konci (POST /api/onboarding/pouzit).
//    Finále přehrává výsledky, které server vrátil.
//  - Nikdy slepá ulička: každý krok jde přeskočit, vrátit a přerušit
//    („Dokončit později"); Escape při rozepsaném nabídne uložit a odejít.

const Podnik = dynamic(() => import('./kroky/Podnik'));
const Doba = dynamic(() => import('./kroky/Doba'));
const Tym = dynamic(() => import('./kroky/Tym'));
const Cile = dynamic(() => import('./kroky/Cile'));
const Kasa = dynamic(() => import('./kroky/Kasa'));
const Shrnuti = dynamic(() => import('./kroky/Shrnuti'));
const Hotovo = dynamic(() => import('./kroky/Hotovo'));
const DemoOkno = dynamic(() => import('./DemoOkno'), { ssr: false });

interface Nacteno { stav: string; krok: string | null; odpovedi: Odpovedi; podnik: { name: string; currency: string; locale: string; week_start: number }; plan: { effective: string }; kod: string | null; pocty: { pozvanek: number } }

const NADPISY: Record<KrokId, (jmeno: string) => { nadpis: string; pod?: string }> = {
  vitej: j => ({ nadpis: j ? `Vítej, ${j}` : 'Vítej', pod: 'Nastavíme podnik podle toho, jak pracuješ. Zabere to asi čtyři minuty, kdykoli můžeš přerušit a nic se neztratí.' }),
  typ: () => ({ nadpis: 'Jaký podnik vedeš?', pod: 'Podle toho předvyplníme otevírací dobu, směny a sklad. Všechno půjde změnit.' }),
  podnik: () => ({ nadpis: 'Jak se jmenuje a kde stojí?', pod: 'Měna a formát čísel se nastaví podle země, jde je změnit.' }),
  doba: () => ({ nadpis: 'Kdy máte otevřeno?', pod: 'Podle toho se počítají směny a pokrytí obsazení.' }),
  tym: () => ({ nadpis: 'Kdo s tebou pracuje?', pod: 'Pozvi lidi hned, nebo jim pošli kód pro připojení. Jde to i později.' }),
  cile: () => ({ nadpis: 'Co chceš mít pod kontrolou?', pod: 'Přehled si podle toho poskládáme. Kdykoli ho přestavíš podržením.' }),
  kasa: () => ({ nadpis: 'Jak zavíráte kasu?', pod: 'Pár údajů, ať je první uzávěrka hotová za minutu.' }),
  shrnuti: () => ({ nadpis: 'Tohle ti nastavíme', pod: 'Nic ti nepřepíšeme ani nesmažeme, jen přidáme.' }),
  hotovo: () => ({ nadpis: 'Podnik je připravený', pod: 'Všechno jde v aplikaci dál upravit.' }),
};

/** Kroky, které jde přeskočit (vítání, shrnutí a finále ne). */
const PRESKOCITELNE: readonly KrokId[] = ['typ', 'podnik', 'doba', 'tym', 'cile', 'kasa'];

const FOTO_CILE: Record<Cil, IdFotky> = { rozvrh: 'porada', sklad: 'sklad', uzaverky: 'uzaverka', provoz: 'porada', hoste: 'host', finance: 'majitel' };

function fotoTypu(typ: TypPodniku | undefined): IdFotky {
  return typ && typ !== 'jine' ? typ : 'majitel';
}

/** Co se na kroku ukazuje: fotka (vždy, na telefonu pruh) a případně živá ukázka (na počítači vlevo). */
function vizualKroku(krok: KrokId, odp: Odpovedi, fokus: Cil | null): { foto: IdFotky; scena: IdScenyDema | null } {
  switch (krok) {
    case 'vitej': return { foto: 'majitel', scena: 'prehled' };
    case 'typ': case 'podnik': return { foto: fotoTypu(odp.typ), scena: null };
    case 'doba': return { foto: 'doba', scena: null };
    case 'tym': return { foto: 'tym', scena: 'tym' };
    case 'cile': {
      const c = fokus ?? vybraneCile(odp)[0] ?? 'rozvrh';
      return { foto: FOTO_CILE[c], scena: CILE.find(x => x.id === c)?.scena ?? null };
    }
    case 'kasa': return { foto: 'uzaverka', scena: 'uzaverka' };
    case 'shrnuti': return { foto: 'telefon', scena: 'prehled' };
    case 'hotovo': return { foto: 'telefon', scena: null };
  }
}

function useMedia(dotaz: string): boolean {
  const [ano, setAno] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(dotaz);
    setAno(m.matches);
    const f = () => setAno(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, [dotaz]);
  return ano;
}

const tarifZPlanu = (p: string): Tarif => (p === 'max' ? 'max' : p === 'pro' ? 'pro' : 'zdarma');

/** Co se při odchodu z kroku doplní z toho, co člověk viděl předvyplněné (a jinak by se neuložilo). */
function zfinalizuj(krok: KrokId, o: Odpovedi, info: InfoPodniku): Odpovedi {
  switch (krok) {
    case 'podnik': return {
      ...o, nazev: (o.nazev ?? '').trim(), zeme: o.zeme ?? (info.currency === 'CZK' ? 'CZ' : 'JINA'),
      mena: o.mena ?? info.currency, formatCisel: o.formatCisel ?? info.locale, zacatekTydne: o.zacatekTydne ?? (info.week_start === 0 ? 0 : 1),
    };
    case 'doba': return { ...o, doba: o.doba ?? vychoziDoba(o.typ) };
    case 'tym': return { ...o, tym: { velikost: 'mali', ...o.tym, pozice: o.tym?.pozice ?? POZICE[o.typ ?? 'jine'] } };
    case 'cile': return { ...o, cile: vybraneCile(o) };
    case 'kasa': return { ...o, pokladna: o.pokladna ?? 'zadna', tablet: o.tablet === true };
    default: return o;
  }
}

function zKroku(krok: KrokId, o: Odpovedi): { pole: string; text: string } | null {
  if (krok === 'typ' && !o.typ) return { pole: 'typ', text: 'Vyber typ podniku, nebo krok přeskoč.' };
  if (krok === 'podnik' && !(o.nazev ?? '').trim()) return { pole: 'nazev', text: 'Napiš název podniku.' };
  if (krok === 'doba' && o.doba && !cistiDobu(o.doba)) return { pole: 'doba', text: 'Aspoň jeden den musí být otevřeno.' };
  return null;
}

export default function Pruvodce({ jmeno, znovu }: { jmeno: string; znovu: boolean }) {
  const router = useRouter();
  const [faze, setFaze] = useState<'nacitam' | 'chyba' | 'ok'>('nacitam');
  const [chybaNacteni, setChybaNacteni] = useState('');
  const [info, setInfo] = useState<InfoPodniku | null>(null);
  const [odp, setOdp] = useState<Odpovedi>({});
  const [krok, setKrok] = useState<KrokId>('vitej');
  const [smer, setSmer] = useState<1 | -1>(1);
  const [uklada, setUklada] = useState(false);
  const [chyba, setChyba] = useState('');
  const [chybaPole, setChybaPole] = useState<KrokProps['chybaPole']>(null);
  const [fokus, setFokus] = useState<Cil | null>(null);
  const [potvrdit, setPotvrdit] = useState(false);
  const [sestaveni, setSestaveni] = useState<FazeSestaveni>('bezi');
  const [vysledek, setVysledek] = useState<VysledekSestaveni | null>(null);
  const [chybaSestaveni, setChybaSestaveni] = useState('');
  const [animaceHotova, setAnimaceHotova] = useState(false);
  const [posledniScena, setPosledniScena] = useState<IdScenyDema | null>(null);
  const [ukazkaNaTelefonu, setUkazkaNaTelefonu] = useState(false);
  const [vyskaOkna, setVyskaOkna] = useState(800);
  const [selhaloPozdeji, setSelhaloPozdeji] = useState(false);
  const ulozeno = useRef('');
  const nadpisRef = useRef<HTMLHeadingElement>(null);
  const prvniKrok = useRef(true);
  const potvrditRef = useRef(false);
  potvrditRef.current = potvrdit;
  const jeDesktop = useMedia('(min-width: 1024px)');

  const kroky = useMemo(() => krokyProOdpovedi(odp), [odp]);
  const index = Math.max(0, kroky.indexOf(krok));

  // --- načtení stavu ---
  const nacti = useCallback(async () => {
    setFaze('nacitam');
    setChybaNacteni('');
    try {
      const d = await okJson(await fetch('/api/onboarding')) as Nacteno;
      // Podnik bez průvodce, cizí člen nebo hotový průvodce: tady není co dělat.
      if (d.stav === 'nedostupny' || (d.stav === 'hotovo' && !znovu)) { router.replace('/employer/overview'); return; }
      const podnik = d.podnik;
      const inf: InfoPodniku = {
        name: podnik.name, currency: podnik.currency, locale: podnik.locale, week_start: podnik.week_start,
        plan: tarifZPlanu(d.plan?.effective), kod: d.kod, pozvanek: d.pocty?.pozvanek ?? 0,
      };
      const o: Odpovedi = { ...d.odpovedi };
      // Název z registrace je předvyplněný, ať ho nikdo nepíše podruhé.
      if (!o.nazev && podnik.name) o.nazev = podnik.name;
      setInfo(inf);
      setOdp(o);
      ulozeno.current = JSON.stringify(d.odpovedi);
      const navrat = znovu && d.stav === 'hotovo';
      const pokracovat = !navrat && jeKrok(d.krok) ? krokPoObnoveni({ v: 1, stav: 'rozpracovano', krok: d.krok, odpovedi: o, pouzito: {} }) : 'vitej';
      setKrok(pokracovat);
      setFaze('ok');
    } catch (e) {
      setChybaNacteni(apiMessage(e, 'Průvodce se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.'));
      setFaze('chyba');
    }
  }, [router, znovu]);
  useEffect(() => { void nacti(); }, [nacti]);

  // Výška okna pro velikost živé ukázky na počítači.
  useEffect(() => {
    const f = () => setVyskaOkna(window.innerHeight);
    f();
    window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);

  // Zapamatovat poslední scénu: ukázka žije dál a mění jen scénu (zprávou), nenačítá se znovu.
  const scenaKroku = faze === 'ok' ? vizualKroku(krok, odp, fokus).scena : null;
  useEffect(() => { if (scenaKroku) setPosledniScena(scenaKroku); }, [scenaKroku]);

  // Po přechodu fokus na nadpis (odečítač oznámí nový krok) a nahoru na stránce.
  useEffect(() => {
    if (faze !== 'ok') return;
    if (prvniKrok.current) { prvniKrok.current = false; return; }
    nadpisRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [krok, faze]);

  const zmen = useCallback((patch: Partial<Odpovedi>) => {
    setOdp(o => ({ ...o, ...patch }));
    setChyba('');
    setChybaPole(null);
  }, []);

  const spinavy = JSON.stringify(odp) !== ulozeno.current;

  // Escape při rozepsaném nabídne uložit a odejít. Sám průvodce nemá co zavírat.
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || potvrditRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('[role="dialog"]')) return;
      if (spinavy) setPotvrdit(true);
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, [spinavy]);

  // --- ukládání ---
  const uloz = useCallback(async (nova: Odpovedi, dalsiKrok: KrokId, stav: 'rozpracovano' | 'preskoceno' = 'rozpracovano') => {
    const res = await fetch('/api/onboarding', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ krok: dalsiKrok, stav, odpovedi: nova }),
    });
    await okJson(res);
    ulozeno.current = JSON.stringify(nova);
  }, []);

  const jdiNa = (k: KrokId, s: 1 | -1) => { setSmer(s); setKrok(k); setChyba(''); setChybaPole(null); };

  const dal = async (preskocit = false) => {
    if (!info || uklada) return;
    setChyba('');
    let nova = odp;
    if (preskocit) {
      nova = { ...odp, preskoceno: [...new Set([...(odp.preskoceno ?? []), krok])] };
    } else {
      const fin = zfinalizuj(krok, odp, info);
      const vad = zKroku(krok, fin);
      if (vad) { setChybaPole(vad); return; }
      nova = { ...fin, preskoceno: (fin.preskoceno ?? []).filter(k => k !== krok) };
    }
    const seznam = krokyProOdpovedi(nova);
    const i = seznam.indexOf(krok);
    const dalsi = seznam[Math.min(seznam.length - 1, i + 1)];
    if (krok === 'shrnuti') { await sestav(nova); return; }
    setUklada(true);
    try {
      await uloz(nova, dalsi);
      setOdp(nova);
      jdiNa(dalsi, 1);
    } catch (e) {
      setChyba(apiMessage(e, 'Odpovědi se neuložily. Zkontroluj připojení a zkus to znovu.'));
    } finally { setUklada(false); }
  };

  const zpet = () => {
    if (index <= 0) return;
    jdiNa(kroky[index - 1], -1);
  };

  const sestav = async (nova: Odpovedi) => {
    if (!info) return;
    setUklada(true);
    try {
      await uloz(nova, 'shrnuti');
      setOdp(nova);
    } catch (e) {
      setChyba(apiMessage(e, 'Odpovědi se neuložily. Zkontroluj připojení a zkus to znovu.'));
      setUklada(false);
      return;
    }
    setUklada(false);
    setSestaveni('bezi');
    setVysledek(null);
    setAnimaceHotova(false);
    jdiNa('hotovo', 1);
    await proved(nova);
  };

  const proved = async (nova: Odpovedi) => {
    setSestaveni('bezi');
    setChybaSestaveni('');
    try {
      const vypnout = (['smeny', 'sklad', 'postupy', 'prehled', 'pravidla'] as const).filter(k => nova.polozky?.[k] === false);
      const res = await fetch('/api/onboarding/pouzit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vypnout }),
      });
      const d = await okJson(res) as VysledekSestaveni;
      setVysledek(d);
      setSestaveni('hotovo');
    } catch (e) {
      setChybaSestaveni(apiMessage(e, 'Podnik se nepodařilo sestavit. Zkontroluj připojení a zkus to znovu.'));
      setSestaveni('chyba');
    }
  };

  const pozdeji = async () => {
    // Po neúspěšném uložení druhé klepnutí odejde i bez něj: průvodce nikdy nedrží člověka v pasti.
    if (selhaloPozdeji) { router.push('/employer/overview'); return; }
    setUklada(true);
    setPotvrdit(false);
    try {
      await uloz(odp, krok, 'preskoceno');
      router.push('/employer/overview');
    } catch (e) {
      setChyba(`${apiMessage(e, 'Odpovědi se neuložily.')} Klepneš-li na Dokončit později ještě jednou, odejdeš i bez uložení.`);
      setSelhaloPozdeji(true);
      setUklada(false);
    }
  };

  // --- vykreslení ---
  if (faze !== 'ok' || !info) {
    return (
      <div className="grid min-h-[100dvh] place-items-center p-6" data-pruvodce data-faze={faze}>
        <div className="w-full max-w-sm text-center">
          <div className="mb-4 flex justify-center"><LogoMark size={48} /></div>
          {faze === 'nacitam' ? (
            <p className="t-meta" role="status" aria-busy="true">Načítám průvodce…</p>
          ) : (
            <div>
              <p role="alert" className="note note-danger text-left text-[13px]">{chybaNacteni}</p>
              <div className="mt-4 flex justify-center gap-2">
                <Button variant="accent" onClick={() => void nacti()}>Zkusit znovu</Button>
                <Button variant="ghost" onClick={() => router.push('/employer/overview')}>Přejít do aplikace</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const { nadpis, pod } = NADPISY[krok](jmeno);
  const v = vizualKroku(krok, odp, fokus);
  const scenaVidet = v.scena;
  const krokProps: KrokProps = { odp, zmen, info, chybaPole };
  const posledni = krok === 'hotovo';

  const demoMaxVyska = Math.max(420, Math.min(760, vyskaOkna - 150));

  const vizual = (
    <div>
      {jeDesktop && posledniScena && (
        <div hidden={!scenaVidet} data-ukazka-desktop>
          <DemoOkno scena={posledniScena} maxVyska={demoMaxVyska} />
          <p className="t-meta mt-2 text-center">Ukázka s vymyšlenými daty. Zkus si v ní klepat.</p>
        </div>
      )}
      {(!jeDesktop || !scenaVidet) && (
        <div>
          <FotoKroku id={v.foto} priority={krok === 'vitej'} />
        </div>
      )}
    </div>
  );

  const ukazkaTelefon = !jeDesktop && scenaVidet ? (
    <div className="mt-4">
      <Button variant="secondary" size="sm" icon="play" aria-expanded={ukazkaNaTelefonu} onClick={() => setUkazkaNaTelefonu(o => !o)}>
        {ukazkaNaTelefonu ? 'Skrýt živou ukázku' : 'Ukázat na živo, jak to vypadá'}
      </Button>
      {ukazkaNaTelefonu && posledniScena && (
        <div className="mt-3" data-ukazka-telefon>
          <DemoOkno scena={posledniScena} />
          <p className="t-meta mt-2 text-center">Ukázka s vymyšlenými daty.</p>
        </div>
      )}
    </div>
  ) : null;

  const podminkaSprava = chyba && <p role="alert" className="note note-danger mt-4 text-[13px]" data-chyba-ulozeni>{chyba}</p>;

  const telo = (() => {
    switch (krok) {
      case 'vitej': return <Vitej />;
      case 'typ': return <Typ {...krokProps} />;
      case 'podnik': return <Podnik {...krokProps} />;
      case 'doba': return <Doba {...krokProps} />;
      case 'tym': return <Tym {...krokProps} />;
      case 'cile': return <Cile {...krokProps} fokus={fokus} naFokus={setFokus} />;
      case 'kasa': return <Kasa {...krokProps} />;
      case 'shrnuti': return <Shrnuti {...krokProps} />;
      case 'hotovo': return <Hotovo faze={sestaveni} vysledek={vysledek} chyba={chybaSestaveni} odp={odp} naHotovo={() => setAnimaceHotova(true)} />;
    }
  })();

  const paticka = posledni ? (
    <>
      {sestaveni === 'chyba' ? (
        <>
          <Button variant="ghost" onClick={() => jdiNa('shrnuti', -1)}>Zpět na shrnutí</Button>
          <span className="flex-1" />
          <Button variant="accent" className="flex-1 sm:flex-none" onClick={() => void proved(odp)}>Zkusit znovu</Button>
        </>
      ) : (
        <>
          <span className="flex-1" />
          <Button variant="accent" className="flex-1 sm:flex-none" disabled={!animaceHotova} aria-busy={!animaceHotova}
            onClick={() => window.location.assign('/employer/overview')}>Otevřít Přehled</Button>
        </>
      )}
    </>
  ) : (
    <>
      {index > 0 && <Button variant="ghost" onClick={zpet} disabled={uklada}>Zpět</Button>}
      <span className="flex-1" />
      {PRESKOCITELNE.includes(krok) && <Button variant="ghost" onClick={() => void dal(true)} disabled={uklada}>Přeskočit</Button>}
      <Button variant="accent" type="submit" form={ID_FORMULARE} loading={uklada} className="flex-1 sm:flex-none" iconAfter={krok === 'shrnuti' ? undefined : 'chevronRight'}>
        {krok === 'vitej' ? 'Začít' : krok === 'shrnuti' ? 'Sestavit podnik' : 'Pokračovat'}
      </Button>
    </>
  );

  return (
    <>
      <Kulisa
        cislo={index + 1} celkem={kroky.length} nadpis={nadpis} podnadpis={pod} nadpisRef={nadpisRef}
        smer={smer} klic={krok} vizual={vizual} ukazkaTelefon={ukazkaTelefon}
        paticka={paticka} pozdeji={() => void pozdeji()} pozdejiBezi={uklada}
        naOdeslani={() => { if (!posledni) void dal(false); }}
      >
        {telo}
        {podminkaSprava}
      </Kulisa>
      <Modal open={potvrdit} onClose={() => setPotvrdit(false)} size="sm" title="Dokončit později?"
        subtitle="Co sis vyplnil, se uloží. K průvodci se vrátíš z Přehledu nebo z Nastavení."
        footer={<>
          <Button variant="secondary" onClick={() => setPotvrdit(false)}>Zůstat</Button>
          <Button variant="primary" onClick={() => void pozdeji()}>Dokončit později</Button>
        </>}>
        <p className="t-meta">Nic se nezahodí a nic se zatím nezaložilo.</p>
      </Modal>
    </>
  );
}
