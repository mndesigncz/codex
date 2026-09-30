'use client';

// Administrace zákaznického menu — toho, co visí na iPadu před podnikem
// a co si host otevře v mobilu přes QR.
//
// Počítá s tím, že se to obsluhuje z telefonu u stánku: velké cíle na prst,
// vyprodáno na jedno ťuknutí a bez ukládání (propíše se hned), zbytek
// se ukládá dohromady tlačítkem.
//
// Kolo 69 (balík B4): stránka Menu je plocha s widgety. Hlavička jde do
// PlochaWidgetu, nad editorem jsou widgety Stav menu, Vyprodáno a Wi-Fi
// (oblasti/menu.tsx) a tahle komponenta kreslí jen nástroj. Zároveň pryč
// s ručními tlačítky a štítky (DP §6): položky menu byly rámované boxy
// tónované podle vazby na kasu (karta v kartě, 230 px na položku), řazení
// a mazání znaky ↑ ↓ ×, „Otevřít ↗" zeleným textem, výběr menu dvojitě
// limetkový, prompt() a confirm() místo oken a při neuložených změnách
// dvě limetky naráz. Oprávnění: pole, na která role nemá klíč, jsou
// zamčená už tady (server by je stejně odmítl a půlka změny by se neuložila).
//
// `hlavicka={false}` kreslí jen nástroj bez plochy — pro záložku Menu
// v Managero client, dokud si ji ClientAdmin (balík B8) nepřepne na
// `<MenuEditor />`; jinak by stránka měla dvě hlavičky.

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../Icons';
import {
  type MenuTheme, VYCHOZI_THEME, PREDLOHY, PISMA, normalizeMenuTheme,
} from '@/lib/menuTheme';
import {
  Button, Card, Chip, EmptyState, Field, Input, Label, Modal, PlovouciLista, Segmented, Select, Skeleton, Switch, SwitchRow, Toast, Well,
} from '../ui';
import { useResultKeys } from '@/lib/useResultKeys';
import { okJson } from '@/lib/api';
import { obsahuje } from '@/lib/hledani';
import { cenaDoPole, cenaZFormulare } from '@/lib/cena';
import { UDALOST_VYPRODANO, URL_MENU, URL_VYPRODANO } from '@/lib/recepturyPrehled';
import KopieZPodniku, { useJinePodniky } from '../organizace/KopieZPodniku';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { obnovDataWidgetu } from '../widgety/useDataWidgetu';
import { useOpravneni } from '../role/useOpravneni';
import { UDALOST_MENU_ZAPNUTO } from '../widgety/oblasti/menu';
import JazykyListku from './menu/JazykyListku';
import PrekladListku from './menu/PrekladListku';
import AlergenyPicker from './menu/AlergenyPicker';
import { STITKY } from '@/lib/alergeny';
import type { Jazyk } from '@/lib/i18n/config';
import type { JazykyListku as Langs, Preklady } from '@/lib/menu';
import { useT } from '@/lib/i18n/client';
import { sUzlem, VLOZ } from './jazyk';

interface Item {
  id?: number;
  name: string;
  price: number;
  description?: string | null;
  soldOut: boolean;
  posProductId?: string | null;
  /** Kódy alergenů 1–14; prázdné = nevyplněno (ne „bez alergenů"). */
  allergens?: number[];
  tags?: string[];
  i18n?: Preklady<'name' | 'description'>;
}
interface Section { id?: number; title: string; column: 1 | 2; items: Item[]; i18n?: Preklady<'title'>; }
interface Board {
  id: number; slug: string; name: string;
  eyebrow: string | null; title: string | null; note: string | null;
  wifiSsid: string | null; wifiPassword: string | null;
  currency: string; enabled: boolean; hasPin?: boolean;
  theme: MenuTheme;
  sections: Section[];
  /** Jazyky lístku a překlady hlavičky (kolo 76). Starší server je neposílá: pak jen čeština. */
  langs?: Langs;
  i18n?: Preklady<'eyebrow' | 'title' | 'note'>;
}
interface PosProduct { productId: string; name: string; category: string; price: number | null; }

/* Adresa, kterou si stránka /menu-akce.html vezme, když se otevře bez parametru.
   Menu s touhle adresou je tím pádem „to, co visí na iPadu“. */
const VYCHOZI_SLUG = 'akce';



/** Po zápisu editoru ať to vidí i widgety nad ním (Stav menu, Vyprodáno). */
const obnovWidgety = () => { obnovDataWidgetu(URL_MENU); obnovDataWidgetu(URL_VYPRODANO); };

/** Potvrzení nevratného kroku — místo confirm() (DP §3.10). */
type Potvrzeni = { titulek: string; text: string; akce: string; danger?: boolean; onAno: () => void } | null;

export default function MenuEditor({ hlavicka = true }: { hlavicka?: boolean } = {}) {
  const t = useT('sprava');
  const tRef = useRef(t); tRef.current = t; // callbacky nesmí držet starý jazyk po přepnutí
  // Tlačítka a pole podle `ma` (před načtením oprávnění a u staršího serveru
  // ANO — rozhoduje server), ne přísné useSmi widgetů: editor se nesmí
  // zamknout navždy jen proto, že /api/teams/mine oprávnění nepošle
  // (stejně Sklad a Docházka).
  const { ma: smi } = useOpravneni();
  const smiUpravit = smi('menu.upravit');
  const smiCeny = smi('menu.ceny');
  const smiZverejnit = smi('menu.zverejnit');
  const smiMazat = smi('menu.mazat');
  const smiVyprodano = smi('menu.vyprodano');
  const uid = useId();

  const [boards, setBoards] = useState<Board[]>([]);
  /** Počítadlo načtení ze serveru — jen po něm vzniká nová rozpracovaná kopie. */
  const [nacteno, setNacteno] = useState(0);
  const [aktivni, setAktivni] = useState<number | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [nacitam, setNacitam] = useState(true);
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChybaStav] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ton?: 'bad'; id: number; akce?: { label: string; onClick: () => void } } | null>(null);
  const [neniMigrace, setNeniMigrace] = useState(false);
  const [pin, setPin] = useState('');
  const [vzhledOtevren, setVzhledOtevren] = useState(false);
  const [potvrzeni, setPotvrzeni] = useState<Potvrzeni>(null);
  const [noveMenu, setNoveMenu] = useState<string | null>(null);
  /* Jazyk, který se právě překládá; null = výchozí jazyk lístku (běžná editace). */
  const [jazykEditace, setJazykEditace] = useState<Jazyk | null>(null);
  /* Okno s alergeny a štítky jedné položky. */
  const [alergenyOtevreno, setAlergenyOtevreno] = useState<{ si: number; ii: number } | null>(null);
  /* Ukládá se až tlačítkem, takže je potřeba dát najevo, že něco čeká. */
  const [neulozeno, setNeulozeno] = useState(false);
  /*
   * Uložení do databáze ještě neznamená, že to host uvidí: iPad má
   * otevřenou konkrétní adresu a když ta na žádné menu nesedí, ukáže
   * záložní obsah a tváří se, že je všechno v pořádku. Tohle to kontroluje
   * naživo, ať se na to nepřijde až u stánku.
   */
  const [zive, setZive] = useState<'ceka' | 'ok' | 'chybi' | 'vypnuto' | 'neznamo'>('ceka');
  /* Kopie menu z jiného podniku organizace. Editor vidí jen vedení, takže
     stačí hlídat, jestli vůbec existuje odkud kopírovat. */
  const [kopieOpen, setKopieOpen] = useState(false);
  // Rozepsaná cena položky, klíč `sekce-položka`. Pole nesmí při každém úhozu
  // přepisovat samo sebe z čísla: „4," by ztratilo čárku a „4,50" se dřív po
  // vyhození nečíslic slilo do 450. Po opuštění pole se ukáže normalizovaná cena.
  const [cenaText, setCenaText] = useState<Record<string, string>>({});
  const { jine: jinePodniky, cil: nazevPodniku, chyba: chybaPodniku, znovu: znovuPodniky } = useJinePodniky();

  /** Hláška úspěchu = Toast; chyba zůstane u tlačítka Uložit a ukáže se i jako Toast (tlačítko bývá mimo obrazovku). */
  const hlas = (text: string) => setToast({ text, id: Date.now() });
  const setChyba = (text: string | null) => {
    setChybaStav(text);
    if (text) setToast({ text, ton: 'bad', id: Date.now() });
  };

  /* `potichu`: obnovit seznam bez stavu načítání — ten by nahradil celý
     nástroj a s ním zavřel i okno kopie dřív, než člověk uvidí výsledek. */
  const load = useCallback(async (potichu = false) => {
    const t = tRef.current;
    if (!potichu) setNacitam(true);
    try {
      const d = await fetch(URL_MENU).then(okJson);
      if (d?.notMigrated) setNeniMigrace(true);
      const list: Board[] = Array.isArray(d?.boards) ? d.boards : [];
      setBoards(list);
      setNacteno(v => v + 1);
      setAktivni((a) => (a && list.some((b) => b.id === a) ? a : list[0]?.id ?? null));
      if (!list.length) setBoard(null);
    } catch {
      setChyba(t('Menu se nepodařilo načíst.'));
    } finally {
      setNacitam(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  /* Rozdělaná editace se nesmí ztratit zavřením okna nebo odklikem jinam. */
  useEffect(() => {
    if (!neulozeno) return;
    const hlidac = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', hlidac);
    return () => window.removeEventListener('beforeunload', hlidac);
  }, [neulozeno]);

  /* Rozpracovaná deska je vždycky kopie — ať se needituje to, co drží seznam.
     Nová kopie jen po načtení ze serveru nebo přepnutí menu, ne při každé
     změně seznamu: příznak z widgetu (zveřejněno, vyprodáno) mění seznam
     taky a rozepsaný nadpis by se tím zahodil. */
  const boardsRef = useRef(boards);
  boardsRef.current = boards;
  useEffect(() => {
    if (aktivni == null) { setBoard(null); return; }
    const b = boardsRef.current.find((x) => x.id === aktivni);
    if (b) { setBoard(JSON.parse(JSON.stringify(b))); setNeulozeno(false); }
  }, [aktivni, nacteno]);

  /*
   * Widgety nad editorem přepínají vyprodáno a zapínají menu přímo na
   * serveru. Rozpracovaná kopie by o tom nevěděla a další „Uložit" by
   * vrátilo starý stav — proto si změnu propíše (seznam i kopii) a
   * neuložené změny kvůli tomu nevznikají.
   */
  useEffect(() => {
    const vyprodano = (e: Event) => {
      const { itemId, soldOut } = (e as CustomEvent).detail ?? {};
      const zmen = (b: Board) => ({ ...b, sections: b.sections.map(s => ({ ...s, items: s.items.map(i => (i.id === itemId ? { ...i, soldOut } : i)) })) });
      setBoard(b => (b ? zmen(b) : b));
      setBoards(list => list.map(zmen));
    };
    const zapnuto = (e: Event) => {
      const { id, enabled } = (e as CustomEvent).detail ?? {};
      setBoard(b => (b && b.id === id ? { ...b, enabled } : b));
      // Jen příznak v seznamu; rozpracovaná kopie se kvůli tomu znovu nevytváří (efekt výš čeká na načtení ze serveru).
      setBoards(list => list.map(b => (b.id === id ? { ...b, enabled } : b)));
    };
    window.addEventListener(UDALOST_VYPRODANO, vyprodano);
    window.addEventListener(UDALOST_MENU_ZAPNUTO, zapnuto);
    return () => { window.removeEventListener(UDALOST_VYPRODANO, vyprodano); window.removeEventListener(UDALOST_MENU_ZAPNUTO, zapnuto); };
  }, []);

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

  /** Založí menu rovnou z katalogu kasy — sekce podle kategorií ve Storyous. */
  const zalozitZPokladny = async () => {
    setImportuji('new'); setChyba(null);
    try {
      const r = await fetch('/api/menu/pos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'new', name: 'Nabídka z pokladny' /* i18n-ok (název nového menu je obsah podniku) */, slug: 'menu' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setChyba(d?.error ?? t('Menu z pokladny se nepodařilo založit.')); return; }
      await load();
      obnovWidgety();
      if (d?.board?.id) setAktivni(d.board.id);
      hlas(t('Menu je založené z kasy: {n, plural, one {# položka} few {# položky} other {# položek}} v {s, plural, one {# sekci} few {# sekcích} other {# sekcích}}. Všechny se z objednávky vytisknou na terminálu.', { n: d?.summary?.added ?? 0, s: d?.summary?.newSections ?? 0 }));
      const zbylo = Number(d?.summary?.skippedFull) || 0;
      if (zbylo > 0) setChyba(t('{n, plural, one {# položka se nevešla} few {# položky se nevešly} other {# položek se nevešlo}}: jedno menu unese nejvýš 40 sekcí a 100 položek v sekci. Zbytek přidej ručně, nebo si na něj založ druhé menu.', { n: zbylo }));
    } catch {
      setChyba(t('Spojení se serverem selhalo, menu se nezaložilo.'));
    } finally { setImportuji(''); }
  };

  /** Založí menu. Bez názvu = z dnešní nabídky (první menu), s názvem = prázdné, ať se nekopírují ceny. */
  const zalozit = async (nazev: string | null) => {
    const prvni = nazev == null;
    setUkladam(true); setChyba(null);
    try {
      const r = await fetch(URL_MENU, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prvni
          ? { name: 'Venkovní akce' /* i18n-ok (název nového menu je obsah podniku) */, slug: 'akce', seed: true }
          : { name: nazev, slug: nazev, seed: false }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setChyba(d?.error ?? t('Menu se nepodařilo založit.')); return; }
      setNoveMenu(null);
      await load();
      obnovWidgety();
      if (d?.board?.id) setAktivni(d.board.id);
      hlas(prvni
        ? t('Menu je založené i s dnešní nabídkou.')
        : t('Menu „{nazev}“ je založené. Adresu má {adresa}', { nazev: d?.board?.name ?? nazev, adresa: `/menu-akce.html?menu=${d?.board?.slug ?? ''}` }));
    } catch {
      // Bez tohohle by selhání sítě zmizelo beze stopy: tlačítko by se
      // odemklo a uživatel by netušil, že se nic neuložilo.
      setChyba(t('Menu se nepodařilo založit — spojení se serverem selhalo. Zkus to prosím znovu.'));
    } finally { setUkladam(false); }
  };

  const smazat = async () => {
    if (!board) return;
    setUkladam(true);
    try {
      const r = await fetch(`${URL_MENU}?id=${board.id}`, { method: 'DELETE' });
      if (!r.ok) { setChyba(t('Menu se nepodařilo smazat.')); return; }
      setAktivni(null);
      await load();
      obnovWidgety();
      hlas(t('Menu je smazané.'));
    } catch {
      setChyba(t('Menu se nepodařilo smazat — spojení se serverem selhalo.'));
    } finally { setUkladam(false); }
  };

  /**
   * `prevzitAdresu` řekne serveru, že se smí zabraná adresa odebrat jinému
   * menu stejného podniku. Bez toho by se z kolize nedalo dostat.
   */
  const ulozit = async (navic?: Record<string, any>) => {
    if (!board) return;
    setUkladam(true); setChyba(null);
    try {
      const telo: any = { ...board, ...navic, theme: normalizeMenuTheme(board.theme) };
      if (pin.trim()) telo.pin = pin.trim();
      const r = await fetch(URL_MENU, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telo),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 409 && d?.adresuDrziNase && !navic?.prevzitAdresu) {
          setUkladam(false);
          setPotvrzeni({
            titulek: t('Převzít adresu?'),
            text: t('{chyba} Menu „{nazev}“ dostane jinou adresu a hostům se od té chvíle bude na téhle adrese ukazovat tohle menu.', { chyba: d.error, nazev: d.drziNazev }),
            akce: t('Převzít adresu'),
            onAno: () => { void ulozit({ ...navic, prevzitAdresu: true }); },
          });
          return;
        }
        setChyba(d?.error ?? t('Uložení se nepodařilo (odpověď serveru {status}).', { status: r.status }));
        return;
      }
      setPin('');
      await load();
      obnovWidgety();
      setNeulozeno(false);
      hlas(t('Uloženo. Na iPadu se to projeví do minuty, ručně obnovovat nemusíš.'));
    } catch {
      setChyba(t('Uložení se nepodařilo — spojení se serverem selhalo. Změny máš pořád na obrazovce, zkus to znovu.'));
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

  /* Jen PIN (částečná změna). Plné uložení s `{ id, pin: '' }` dřív smazalo
     i nadpis, Wi-Fi a poznámku menu. */
  const zrusitPin = async () => {
    if (!board) return;
    try {
      await fetch(URL_MENU, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: board.id, castecne: true, pin: '' }),
      }).then(okJson);
      await load(true);
      hlas(t('PIN je zrušený.'));
    } catch {
      // Nezrušený PIN je bezpečnostní rozdíl, ne kosmetika: člověk si
      // myslí, že od stánku už nikdo označovat nemůže, a přitom může.
      setChyba(t('PIN se nepodařilo zrušit — pořád platí. Zkus to prosím znovu.'));
    }
  };

  /** Vyprodáno se propisuje hned — během akce na to není čas klikat dvakrát. */
  const prepnoutVyprodano = async (si: number, ii: number, nove: boolean) => {
    if (!board) return;
    const polozka = board.sections[si].items[ii];
    // Veřejný endpoint zná jen uložené, zapnuté menu pod uloženou adresou a uloženou
    // položku. Vypnuté menu (připravované před akcí) nebo nová položka se proto přepne
    // jako běžná neuložená změna — propíše se s „Uložit", místo aby se přepínač vracel.
    if (!polozka.id || !ulozenySlug || ulozeneZapnuto === false) {
      upravit((b) => { b.sections[si].items[ii].soldOut = nove; });
      return;
    }
    const zmen = (hodnota: boolean) => setBoard((b) => {
      if (!b) return b;
      const kopie = JSON.parse(JSON.stringify(b)) as Board;
      kopie.sections[si].items[ii].soldOut = hodnota;
      return kopie;
    });
    zmen(nove);
    // Uložená adresa, ne rozpracovaná kopie: přepsané a neuložené pole Adresa by dalo 404.
    const r = await fetch(`/api/menu/public/${encodeURIComponent(ulozenySlug)}/soldout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: polozka.id, soldOut: nove }),
    }).catch(() => null);
    if (!r?.ok) { zmen(!nove); setChyba(t('Vyprodáno se nepodařilo uložit.')); return; }
    obnovWidgety();
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

  /**
   * Smazání položky je vratné (platí až po Uložení), proto bez potvrzení, ale s toastem
   * „Vrátit" (DP §5.5) — omylem trefený koš se jinak pozná až po uložení.
   */
  const smazatPolozku = (si: number, ii: number) => {
    if (!board) return;
    const deskaId = board.id;
    const sekce = board.sections[si];
    const kopie = JSON.parse(JSON.stringify(sekce.items[ii])) as Board['sections'][number]['items'][number];
    upravit((b) => { b.sections[si].items.splice(ii, 1); });
    setToast({
      text: t('{nazev}: smazáno', { nazev: kopie.name || t('Položka') }), id: Date.now(),
      akce: {
        label: t('Vrátit', {}, 'zpet'),
        // Vracet jen do téže desky a sekce; po přepnutí menu by se položka vložila jinam.
        onClick: () => upravit((b) => {
          const cil = b.id === deskaId ? b.sections.find((x, i) => (sekce.id != null ? x.id === sekce.id : i === si)) : undefined;
          if (cil) cil.items.splice(Math.min(ii, cil.items.length), 0, kopie);
        }),
      },
    });
  };

  const posun = (pole: any[], od: number, smer: -1 | 1) => {
    const kam = od + smer;
    if (kam < 0 || kam >= pole.length) return;
    [pole[od], pole[kam]] = [pole[kam], pole[od]];
  };

  // ---- vazba na pokladnu --------------------------------------------------
  //
  // Položka, která nemá produkt v kase, je pro pokladnu jen text: objednávka
  // od stolu se do Storyous nepošle a na terminálu se nevytiskne. Proto je
  // vazba vidět u každé položky, ne schovaná v nastavení.
  const [posOtevreno, setPosOtevreno] = useState<{ si: number; ii: number | null } | null>(null);
  const [posProdukty, setPosProdukty] = useState<PosProduct[] | null>(null);
  const [posStav, setPosStav] = useState<string | null>(null);
  const [posHledat, setPosHledat] = useState('');
  const posInput = useRef<HTMLInputElement>(null);
  const posList = useRef<HTMLDivElement>(null);
  const posKeys = useResultKeys(posList, posInput, { onEscape: () => setPosOtevreno(null) });
  const [posPripojena, setPosPripojena] = useState<boolean | null>(null);
  const [importuji, setImportuji] = useState('');

  /* Katalog se tahá jednou a drží — při psaní menu se do něj sahá často. */
  const nacistKatalog = useCallback(async (znovu = false) => {
    const t = tRef.current;
    if (posProdukty && !znovu) return posProdukty;
    setPosStav(t('Načítám katalog kasy…'));
    try {
      const d = await fetch('/api/pos/products').then(okJson);
      setPosPripojena(!!d?.connected);
      if (!d?.connected) { setPosProdukty([]); setPosStav(t('Pokladna Storyous není připojená. Položky se dají psát ručně, ale z objednávky se pak nevytisknou.')); return []; }
      const p: PosProduct[] = Array.isArray(d?.products) ? d.products : [];
      setPosProdukty(p);
      setPosStav(p.length ? null : t('Katalog kasy je prázdný.'));
      return p;
    } catch {
      setPosProdukty([]); setPosStav(t('Katalog kasy se nepodařilo načíst.'));
      return [];
    }
  }, [posProdukty]);

  /* Jestli je kasa vůbec připojená, ať se nabídka párování nikomu neplete
     do cesty, když ji nemá k čemu použít. Zároveň se ptáme, ze kterého menu
     host objednává — párovat se dá i v menu, ze kterého si nikdo neobjedná,
     a pak by se pořád nic netisklo a nebylo by proč. */
  const [objednavaciSlug, setObjednavaciSlug] = useState<string | null>(null);
  useEffect(() => {
    let platne = true;
    fetch('/api/pos/status').then(okJson).then(d => { if (platne) setPosPripojena(!!d?.connected); }).catch(() => {});
    fetch('/api/client/admin/profile').then(okJson).then(d => {
      if (platne && d?.profile?.ordering_on) setObjednavaciSlug(d.profile.menu_slug ? String(d.profile.menu_slug) : '');
    }).catch(() => {});
    return () => { platne = false; };
  }, []);

  const otevritVyber = async (si: number, ii: number | null) => {
    setPosOtevreno({ si, ii }); setPosHledat('');
    await nacistKatalog();
  };

  /* Výběr z katalogu: buď přidá novou položku do sekce, nebo doplní vazbu
     (a chybějící cenu) k položce, která už je napsaná. */
  const vybratZPos = (p: PosProduct) => {
    const cil = posOtevreno;
    if (!cil) return;
    if (cil.ii == null) {
      upravit((b) => { b.sections[cil.si].items.push({ name: p.name, price: p.price ?? 0, soldOut: false, posProductId: p.productId }); });
      if (p.price == null) hlas(t('„{nazev}“ přidáno, ale kasa u něj nedala cenu — doplň ji ručně.', { nazev: p.name }));
    } else {
      upravit((b) => {
        const it = b.sections[cil.si].items[cil.ii as number];
        it.posProductId = p.productId;
        if (!it.price && p.price != null) it.price = p.price;
      });
      hlas(t('Položka je navázaná na „{nazev}“ z kasy — od teď se z objednávky vytiskne.', { nazev: p.name }));
      setPosOtevreno(null);
    }
  };

  /* Import celého katalogu a hromadné párování. Obojí zapisuje rovnou do
     databáze, takže rozdělaná editace se musí nejdřív uložit. */
  const zPokladny = async (mode: 'fill' | 'match', refresh = false) => {
    if (!board) return;
    if (neulozeno) { setChyba(t('Nejdřív ulož rozdělané změny, ať se import nepotká s nimi.')); return; }
    setImportuji(mode); setChyba(null);
    try {
      const r = await fetch('/api/menu/pos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, boardId: board.id, refresh }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setChyba(d?.error ?? 'Z pokladny se to nepovedlo.'); return; }
      await load();
      obnovWidgety();
      setPosProdukty(null);
      const su = d?.summary ?? {};
      if (mode === 'match') {
        hlas(su.matched
          ? `${su.left ? t('Spárováno {n, plural, one {# položka} few {# položky} other {# položek}}, bez páru zůstává {zbyva}.', { n: Number(su.matched), zbyva: su.left }) : t('Spárováno {n, plural, one {# položka} few {# položky} other {# položek}}, všechno sedí.', { n: Number(su.matched) })}${su.ambiguous?.length ? ` ${t('Nejednoznačné (v kase je víc produktů stejného jména): {seznam}.', { seznam: su.ambiguous.slice(0, 5).join(', ') })}` : ''}`
          : `${t('Podle názvu se nepovedlo spárovat nic.')} ${su.left ? t('Bez páru zůstává {n, plural, one {# položka} few {# položky} other {# položek}} — dopáruj je tlačítkem u položky.', { n: Number(su.left) }) : ''}`);
      } else {
        const zbylo = Number(su.skippedFull) || 0;
        hlas(su.added
          ? (su.newSections
            ? t('Z kasy přibylo {n, plural, one {# položka} few {# položky} other {# položek}} v {s} nových sekcích. Přeskládej si je, jak chceš — vazba na kasu drží u položky.', { n: Number(su.added), s: su.newSections })
            : t('Z kasy přibylo {n, plural, one {# položka} few {# položky} other {# položek}}. Přeskládej si je, jak chceš — vazba na kasu drží u položky.', { n: Number(su.added) }))
          : t('Z kasy už je v menu všechno, co tam patří.'));
        if (zbylo > 0) {
          setChyba(t('{n, plural, one {# položka se do tohohle menu nevešla} few {# položky se do tohohle menu nevešly} other {# položek se do tohohle menu nevešlo}}: jedno menu unese nejvýš 40 sekcí a 100 položek v sekci, a kasa má kategorií víc. Zbytek přidej do sekcí ručně tlačítkem „Z pokladny“, nebo si na něj založ druhé menu.', { n: zbylo }));
        }
      }
    } catch {
      setChyba(t('Spojení se serverem selhalo, z pokladny se nic nenačetlo.'));
    } finally { setImportuji(''); }
  };

  /* Kolik položek doletí do pokladny. Tohle číslo je celý smysl párování. */
  const vazby = (() => {
    let celkem = 0, spojene = 0;
    for (const s of board?.sections ?? []) for (const it of s.items) { celkem++; if (it.posProductId) spojene++; }
    return { celkem, spojene, chybi: celkem - spojene };
  })();

  // -------------------------------------------------------------------------

  /* Okno kopie je ve všech větvích na TÉŽE pozici (za nástrojem). Po
     úspěšné kopii do prázdného editoru se načte první menu a nástroj přejde
     z prázdné větve do hlavní — kdyby okno leželo uvnitř každé větve jinde,
     React by ho odmontoval a namontoval znovu prázdné, výsledek s poznámkou
     „menu je vypnuté" by zmizel a člověk by kopíroval podruhé. */
  const kopieOkno = kopieOpen && (
    <KopieZPodniku entita="menu" podniky={jinePodniky} cil={nazevPodniku} onClose={() => setKopieOpen(false)} onHotovo={() => { load(true); obnovWidgety(); }} />
  );

  let nastroj: React.ReactNode;
  if (nacitam) {
    nastroj = (
      <Card aria-busy>
        <Skeleton className="h-10 w-2/3 rounded-full" />
        <div className="mt-4 space-y-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12" />)}</div>
      </Card>
    );
  } else if (neniMigrace) {
    nastroj = (
      <Card>
        <EmptyState compact icon="warning" title={t('Tabulky pro menu ještě nejsou v databázi')}
          hint={t('Otevři jednou /api/init a vrať se sem.')} />
      </Card>
    );
  } else if (!board) {
    nastroj = (
      <Card>
        <EmptyState icon="clipboard" title={t('Zatím žádné menu')}
          hint={t('To, co visí na iPadu před podnikem a co si host otevře v mobilu přes QR kód.')}
          action={smiUpravit ? (
            <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-2">
              {posPripojena && (
                <Button variant="accent" loading={importuji === 'new'} disabled={ukladam} onClick={zalozitZPokladny}>{t('Založit menu z pokladny')}</Button>
              )}
              <Button variant={posPripojena ? 'secondary' : 'accent'} loading={ukladam} disabled={!!importuji} onClick={() => zalozit(null)}>
                
                {t('Založit menu z dnešní nabídky')}
              </Button>
              {jinePodniky.length > 0 && (
                <Button variant="ghost" icon="copy" disabled={ukladam || !!importuji} onClick={() => setKopieOpen(true)}>{t('Zkopírovat z jiného podniku')}</Button>
              )}
            </div>
          ) : undefined} />
        {/* Prázdný editor je místo, kde je kopie hlavní cestou — tady se
            nepovedené načtení ostatních podniků nesmí tvářit jako „žádné nejsou". */}
        {chybaPodniku && (
          <p className="t-meta text-center mt-2">
            
            {t('Nepodařilo se zjistit, jestli jde menu zkopírovat z jiného podniku.')}{' '}
            <Button variant="ghost" size="sm" onClick={znovuPodniky}>{t('Zkusit znovu')}</Button>
          </p>
        )}
        {posPripojena && (
          <p className="t-meta text-center mt-2 text-pretty">
            
            {t('Z pokladny přijdou položky i s cenami a rozdělením do sekcí, jak je máte ve Storyous — a rovnou navázané, takže se objednávka od stolu vytiskne na terminálu.')}
          </p>
        )}
        {chyba && <p className="note note-danger mt-3" role="alert">{chyba}</p>}
      </Card>
    );
  } else {
    /* Relativní odkaz stačí pro proklik, ale na iPad se to opisuje ručně,
       takže se ukazuje celá adresa i s doménou. */
    const cesta = `/menu-akce.html?menu=${board.slug}`;
    const adresa = typeof window === 'undefined' ? cesta : window.location.origin + cesta;
    const tema = normalizeMenuTheme(board.theme);
    const setT = (fn: (x: MenuTheme) => void) =>
      upravit((b) => { const kop = normalizeMenuTheme(b.theme); fn(kop); b.theme = kop; });
    const zamceno = !smiUpravit;
    /* Přepnuté menu nemusí nabízet jazyk, který se překládal v předchozím: pak běžná editace. */
    const editace: Jazyk | null = jazykEditace && board.langs && jazykEditace !== board.langs.vychozi && board.langs.nabizet.includes(jazykEditace) ? jazykEditace : null;

    nastroj = (
      <div className="space-y-4">
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="t-card flex items-center gap-2"><Icon name="clipboard" size={17} className="shrink-0 text-black/40" />{boards.length > 1 ? t('Tvoje menu') : board.name}</h2>
            {smiUpravit && (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" icon="plus" disabled={ukladam} onClick={() => setNoveMenu('')}>{t('Nové menu')}</Button>
                {/* Při neuložených změnách ne: obnova seznamu po kopii by rozpracovanou
                    desku přepsala tím, co je v databázi. */}
                {jinePodniky.length > 0 && (
                  <Button variant="ghost" size="sm" icon="copy" disabled={ukladam || neulozeno}
                    title={neulozeno ? t('Nejdřív ulož rozdělané změny') : undefined} onClick={() => setKopieOpen(true)}>{t('Z jiného podniku')}</Button>
                )}
              </div>
            )}
          </div>

          {/* Víc menu = přepínač nahoře. Stav zapnuto/vypnuto nese Stav menu nad editorem a adresa níž. */}
          {boards.length > 1 && (
            <Segmented ariaLabel={t('Menu k úpravě')} value={String(aktivni ?? '')}
              options={boards.map(b => ({ id: String(b.id), label: b.name }))}
              onChange={id => {
                if (neulozeno) {
                  setPotvrzeni({ titulek: t('Zahodit neuložené změny?'), text: t('V menu „{nazev}“ máš neuložené změny. Přepnutím na jiné menu se zahodí.', { nazev: board.name }), akce: t('Zahodit a přepnout'), danger: true, onAno: () => setAktivni(Number(id)) });
                } else setAktivni(Number(id));
              }} />
          )}
          <p className="t-meta">
            {t('{n, plural, one {# sekce} few {# sekce} other {# sekcí}}', { n: board.sections.length })} · {t('{n, plural, one {# položka} few {# položky} other {# položek}}', { n: vazby.celkem })}
            {' · '}{board.enabled ? t('zapnuté') : t('vypnuté')}
          </p>

          <Well className="space-y-2">
            <p className="t-label">{t('Adresa pro iPad a pro hosty')}</p>
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <code className="text-sm font-mono text-[#16181A] break-all min-w-0">{adresa}</code>
              <a href={cesta} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                <Icon name="external" size={15} className="shrink-0" />{t('Otevřít')}
              </a>
            </div>

            {zive === 'ok' && <p className="t-meta">{t('Na téhle adrese se hostům ukazuje tohle menu. Úpravy se na iPadu projeví do minuty.')}</p>}
            {zive === 'ceka' && <p className="t-meta">{t('Kontroluju adresu…')}</p>}
            {zive === 'neznamo' && <p className="t-meta">{t('Adresu se teď nepodařilo ověřit — zkontroluj připojení.')}</p>}
            {zive === 'vypnuto' && <p className="text-[13px] text-wait-ink">{t('Menu je vypnuté, takže se hostům neukazuje.')}</p>}
            {zive === 'chybi' && (
              <p className="text-[13px] text-wait-ink">
                {ulozenySlug === VYCHOZI_SLUG
                  ? t('Pozor: server na téhle adrese žádné menu nevydává, takže iPad ukazuje záložní nabídku.')
                  : t('Pozor: iPad otevřený bez parametru bere menu s adresou „akce“, a to tohle menu není — proto se tvoje úpravy hostům neukazují.')}
              </p>
            )}

            {/*
              U každé hlášky musí být i náprava. Dřív se tlačítko na adresu
              schovávalo, když adresa už seděla — u vypnutého menu tak zbyla
              hláška, se kterou nešlo nic udělat.
            */}
            {(zive === 'chybi' || zive === 'vypnuto') && smiZverejnit && (
              <div className="pt-1">
                {/* Vypnuté menu se má zapnout, ne mu přepisovat adresu — u druhého
                    menu s vlastní adresou by mu ji přepis vzal. */}
                {zive === 'vypnuto' ? (
                  <Button variant="primary" size="sm" loading={ukladam} onClick={() => zverejnit({ enabled: true })}>{t('Zapnout menu pro hosty')}</Button>
                ) : ulozenySlug !== VYCHOZI_SLUG ? (
                  <Button variant="primary" size="sm" loading={ukladam} onClick={() => zverejnit({ slug: VYCHOZI_SLUG })}>{t('Nastavit jako menu pro iPad')}</Button>
                ) : (
                  <Button variant="primary" size="sm" loading={ukladam} onClick={() => zverejnit({ slug: VYCHOZI_SLUG, enabled: true })}>{t('Zveřejnit znovu')}</Button>
                )}
              </div>
            )}
          </Well>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field id={`${uid}-nazev`} label={t('Název menu (jen pro vás)')}>
              <Input id={`${uid}-nazev`} value={board.name} maxLength={80} disabled={zamceno}
                onChange={(e) => upravit((b) => { b.name = e.target.value; })} />
            </Field>
            <Field id={`${uid}-adresa`} label={t('Adresa')} hint={t('Bez diakritiky a mezer. Když ji změníš, přestane platit starý QR kód.')}>
              <Input id={`${uid}-adresa`} value={board.slug} maxLength={40} disabled={zamceno || !smiZverejnit}
                onChange={(e) => upravit((b) => { b.slug = e.target.value; })} />
            </Field>
            <Field id={`${uid}-titul`} label={t('Nadpis')}>
              <Input id={`${uid}-titul`} value={board.title ?? ''} maxLength={80} disabled={zamceno}
                onChange={(e) => upravit((b) => { b.title = e.target.value; })} />
            </Field>
            <Field id={`${uid}-nad`} label={t('Popisek nad nadpisem')}>
              <Input id={`${uid}-nad`} value={board.eyebrow ?? ''} maxLength={80} disabled={zamceno}
                onChange={(e) => upravit((b) => { b.eyebrow = e.target.value; })} />
            </Field>
            <Field id={`${uid}-ssid`} label={t('Wi-Fi — síť')}>
              <Input id={`${uid}-ssid`} value={board.wifiSsid ?? ''} maxLength={80} disabled={zamceno}
                onChange={(e) => upravit((b) => { b.wifiSsid = e.target.value; })} />
            </Field>
            <Field id={`${uid}-heslo`} label={t('Wi-Fi — heslo')}>
              <Input id={`${uid}-heslo`} value={board.wifiPassword ?? ''} maxLength={80} disabled={zamceno}
                onChange={(e) => upravit((b) => { b.wifiPassword = e.target.value; })} />
            </Field>
            <Field id={`${uid}-pozn`} label={t('Poznámka v patičce')} className="sm:col-span-2">
              <Input id={`${uid}-pozn`} value={board.note ?? ''} maxLength={200} disabled={zamceno}
                onChange={(e) => upravit((b) => { b.note = e.target.value; })} />
            </Field>
          </div>

          {smiZverejnit && (
            <>
              <ul className="list">
                <SwitchRow title={t('Menu je veřejně dostupné')} hint={t('Vypnuté menu hosté na iPadu ani v mobilu neuvidí. Uloží se tlačítkem dole.')}
                  checked={board.enabled} disabled={zamceno} onChange={(v) => upravit((b) => { b.enabled = v; })} />
              </ul>
              <div className="grid gap-3 sm:grid-cols-2 items-end">
                <Field id={`${uid}-pin`} label={board.hasPin ? t('PIN pro označování vyprodaného od stánku (nastavený)') : t('PIN pro označování vyprodaného od stánku')}
                  hint={t('Na iPadu se zadá jednou a zapamatuje se. Bez PINu jde vyprodáno přepínat jen tady.')}>
                  <Input id={`${uid}-pin`} value={pin} inputMode="numeric" placeholder={board.hasPin ? '••••' : t('4 až 8 číslic')} disabled={zamceno}
                    onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 8)); setNeulozeno(true); }} />
                </Field>
                {board.hasPin && (
                  <div className="pb-6">
                    <Button variant="ghost" size="sm" onClick={() => setPotvrzeni({
                      titulek: t('Zrušit PIN?'), text: t('Od stánku pak nepůjde označovat vyprodané položky.'), akce: t('Zrušit PIN'), onAno: () => { void zrusitPin(); },
                    })}>{t('Zrušit PIN')}</Button>
                  </div>
                )}
              </div>
            </>
          )}
        </Card>

        <Card>
          <JazykyListku
            langs={board.langs ?? { vychozi: 'cs', nabizet: ['cs'] }}
            upravLangs={(nove) => upravit((b) => { b.langs = nove; })}
            editace={editace}
            setEditace={setJazykEditace}
            deska={board}
            zamceno={zamceno} />
        </Card>

        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="t-card">{t('Vzhled menu')}</h2>
              <p className="t-meta">{t('Barvy, logo, písma a prvky na pozadí. Platí jen pro tohle menu.')}</p>
            </div>
            <Button variant="secondary" size="sm" iconAfter="chevron" aria-expanded={vzhledOtevren} aria-controls={`${uid}-vzhled`}
              className={`shrink-0 ${vzhledOtevren ? '[&>svg:last-child]:rotate-180' : ''}`} onClick={() => setVzhledOtevren((v) => !v)}>
              {vzhledOtevren ? t('Skrýt vzhled') : t('Upravit vzhled')}
            </Button>
          </div>

          {vzhledOtevren && (
            <div id={`${uid}-vzhled`} className="space-y-5">
              {!zamceno && (
                <div className="flex flex-wrap gap-2" role="group" aria-label={t('Předlohy vzhledu')}>
                  {PREDLOHY.map((p) => (
                    <Button key={p.id} variant="secondary" size="sm"
                      onClick={() => setT((x) => { x.den = { ...p.theme.den }; x.noc = { ...p.theme.noc }; })}>
                      <span className="inline-flex" aria-hidden>
                        <span className="w-3 h-3 rounded-full border border-black/10" style={{ background: p.theme.den.bg }} />
                        <span className="w-3 h-3 rounded-full border border-black/10 -ml-1" style={{ background: p.theme.den.accent }} />
                      </span>
                      {p.label}
                    </Button>
                  ))}
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                {(['den', 'noc'] as const).map(rezim => (
                  <div key={rezim} className="space-y-2" role="group" aria-labelledby={`${uid}-${rezim}`}>
                    <p id={`${uid}-${rezim}`} className="t-label">{rezim === 'den' ? t('Den') : t('Noc')}</p>
                    {([['bg', t('Pozadí')], ['fg', t('Text')], ['fgSoft', t('Tlumený text')], ['accent', t('Nadpisy a ceny')]] as const).map(([klic, popis]) => (
                      <Barva key={klic} id={`${uid}-${rezim}-${klic}`} popis={popis} hodnota={tema[rezim][klic]} zamceno={zamceno}
                        zmen={(v) => setT((x) => { x[rezim][klic] = v; })} />
                    ))}
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field id={`${uid}-logo`} label={t('Logo (odkaz na obrázek)')} hint={t('Prázdné = logo Managero ve stránce.')}>
                  <Input id={`${uid}-logo`} value={tema.logo.url} maxLength={2000} disabled={zamceno}
                    onChange={(e) => setT((x) => { x.logo.url = e.target.value; })} />
                </Field>
                <Field id={`${uid}-logor`} label={t('Jak logo vykreslit')}>
                  <Select id={`${uid}-logor`} value={tema.logo.rezim} disabled={zamceno}
                    onChange={(e) => setT((x) => { x.logo.rezim = e.target.value === 'obrazek' ? 'obrazek' : 'maska'; })}>
                    <option value="maska">{t('Obarvit barvou nadpisů (jednobarevné logo)')}</option>
                    <option value="obrazek">{t('Vložit tak, jak je (vícebarevné logo)')}</option>
                  </Select>
                </Field>
                <Field id={`${uid}-pn`} label={t('Písmo nadpisů')}>
                  <Select id={`${uid}-pn`} value={tema.pismo.nadpisy} disabled={zamceno} onChange={(e) => setT((x) => { x.pismo.nadpisy = e.target.value; })}>
                    {PISMA.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </Select>
                </Field>
                <Field id={`${uid}-pt`} label={t('Písmo textu')}>
                  <Select id={`${uid}-pt`} value={tema.pismo.text} disabled={zamceno} onChange={(e) => setT((x) => { x.pismo.text = e.target.value; })}>
                    {PISMA.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </Select>
                </Field>
                <Field id={`${uid}-poz`} label={t('Prvky na pozadí')}>
                  <Select id={`${uid}-poz`} value={tema.pozadi.druh} disabled={zamceno} onChange={(e) => setT((x) => { x.pozadi.druh = e.target.value as any; })}>
                    <option value="listy">{t('Listy (kresba Pangey)')}</option>
                    <option value="zadne">{t('Žádné')}</option>
                    <option value="vlastni">{t('Vlastní obrázek')}</option>
                  </Select>
                </Field>
                <Field id={`${uid}-sila`} label={t('Síla prvků: {n} %', { n: tema.pozadi.sila })}>
                  <input id={`${uid}-sila`} type="range" min={0} max={20} step={0.5} value={tema.pozadi.sila} disabled={zamceno}
                    className="w-full accent-[#16181A] tap-target-sm"
                    onChange={(e) => setT((x) => { x.pozadi.sila = Number(e.target.value); })} />
                </Field>
                {tema.pozadi.druh === 'vlastni' && (
                  <Field id={`${uid}-pozurl`} label={t('Obrázek na pozadí')} className="sm:col-span-2"
                    hint={t('Jednobarevná kresba na průhledném pozadí. Obarví se podle textu, takže drží v obou režimech.')}>
                    <Input id={`${uid}-pozurl`} value={tema.pozadi.url} maxLength={2000} placeholder="https://…" disabled={zamceno}
                      onChange={(e) => setT((x) => { x.pozadi.url = e.target.value; })} />
                  </Field>
                )}
              </div>

              {!zamceno && (
                <div className="flex items-center gap-3 flex-wrap">
                  <Button variant="ghost" size="sm" icon="undo"
                    onClick={() => setT((x) => { Object.assign(x, JSON.parse(JSON.stringify(VYCHOZI_THEME))); })}>
                    
                    {t('Vrátit původní vzhled')}
                  </Button>
                  <span className="t-meta">{t('Vzhled se uloží spolu se zbytkem menu tlačítkem dole.')}</span>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Vazba na pokladnu. Bez ní je položka pro kasu jen text: objednávka
            od stolu se do Storyous nepošle a na terminálu se nic nevytiskne.
            Proto je tohle nad sekcemi, ne schované v nastavení. */}
        {posPripojena && (
          <Card className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="t-card flex items-center gap-2">
                  <Icon name="receipt" size={17} className="text-black/40 shrink-0" />{t('Tisk na terminálu')}
                </h2>
                {vazby.celkem === 0 ? (
                  <p className="t-meta mt-1">{t('Menu je zatím prázdné. Nejrychlejší je natáhnout ho z pokladny — přijde i s cenami a rozdělením do sekcí, jak to máte ve Storyous.')}</p>
                ) : vazby.chybi === 0 ? (
                  <p className="text-sm text-ok-ink mt-1">{t('Všech {n} položek má produkt v kase. Co si host objedná, vyjede na terminálu.', { n: vazby.celkem })}</p>
                ) : (
                  <p className="text-sm text-black/60 mt-1">
                    {sUzlem(t('{spojene} položek se z objednávky vytiskne na terminálu.', { spojene: VLOZ }), <strong className="font-semibold text-[#16181A] tabular-nums">{t('{n} z {celkem}', { n: vazby.spojene, celkem: vazby.celkem })}</strong>)}{' '}
                    {t('Zbylých {n} je pro pokladnu jen text — objednávka s nimi zůstane jen tady u nás.', { n: vazby.chybi })}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-[15px] font-semibold tabular-nums text-black/55">{vazby.celkem ? Math.round((vazby.spojene / vazby.celkem) * 100) : 0} %</span>
            </div>
            {vazby.celkem > 0 && (
              <div className="h-2 rounded-full bg-black/[0.06] overflow-hidden" aria-hidden>
                <div className="h-full rounded-full bg-[#C8F542] transition-[width]" style={{ width: `${(vazby.spojene / vazby.celkem) * 100}%` }} />
              </div>
            )}
            {smiUpravit && (
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" loading={importuji === 'fill'} disabled={!!importuji} onClick={() => zPokladny('fill')}>
                  {vazby.celkem === 0 ? t('Natáhnout menu z pokladny') : t('Doplnit, co v menu chybí')}
                </Button>
                {vazby.chybi > 0 && (
                  <Button variant="secondary" size="sm" loading={importuji === 'match'} disabled={!!importuji} onClick={() => zPokladny('match')}>{t('Spárovat podle názvu')}</Button>
                )}
                <Button variant="ghost" size="sm" icon="refresh" disabled={!!importuji} onClick={() => zPokladny('fill', true)}>{t('Načíst katalog kasy znovu')}</Button>
              </div>
            )}
            {objednavaciSlug != null && objednavaciSlug !== '' && board.slug !== objednavaciSlug && (
              <p className="note note-wait">
                {sUzlem(t('Pozor: hosté objednávají z menu s adresou {slug}, ne z tohohle. Párování tady se do objednávek nepropíše — přepni na to správné menu, nebo ho podniku nastav v Klientu → Nastavení.', { slug: VLOZ }), <strong>{objednavaciSlug}</strong>)}
              </p>
            )}
            <p className="t-meta">{t('Sekce si pak přeskládej, jak chceš — vazba na kasu drží u položky, ne u sekce. Položka s vazbou má u sebe štítek „Tiskne se na kase".')}</p>
          </Card>
        )}

        {/* Alergeny: host u položky bez vyplněných alergenů nic neuvidí, proto se vyplněnost hlídá nahlas. */}
        {!editace && (() => {
          const vse = board.sections.flatMap(x => x.items);
          const s = vse.filter(i => (i.allergens?.length ?? 0) > 0).length;
          return s > 0 && s < vse.length ? (
            <p className="note note-info" role="status">
              {t('Alergeny jsou vyplněné u {s} z {n, plural, one {# položka} few {# položky} other {# položek}}. U ostatních host nic neuvidí, jen pod lístkem větu, ať se zeptá obsluhy.', { s, n: vse.length })}
            </p>
          ) : null;
        })()}

        {editace ? (
          <PrekladListku deska={board as any} jazyk={editace} upravit={upravit as any} zamceno={zamceno} uid={uid} />
        ) : board.sections.map((s, si) => (
          <Card key={s.id ?? `nova-${si}`} as="section" aria-label={t('Sekce {nazev}', { nazev: s.title || si + 1 })} className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Input aria-label={t('Název sekce menu')} className="flex-1 min-w-[8rem] font-semibold" value={s.title} maxLength={80} disabled={zamceno}
                onChange={(e) => upravit((b) => { b.sections[si].title = e.target.value; })} />
              <Select value={s.column} aria-label={t('Sloupec sekce {nazev}', { nazev: s.title })} className="!w-auto" disabled={zamceno}
                onChange={(e) => upravit((b) => { b.sections[si].column = Number(e.target.value) === 2 ? 2 : 1; })}>
                <option value={1}>{t('Vlevo')}</option>
                <option value={2}>{t('Vpravo')}</option>
              </Select>
              {!zamceno && (
                // Cíle 44 px (tap-target) a mezi 36px tlačítky 8 px, ať se jejich plochy
                // nepřekrývají; koš ještě o kus dál, aby palec mířící na „níž" netrefil smazání.
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" iconOnly icon="chevron" className="tap-target [&>svg]:rotate-180" aria-label={t('Posunout sekci {nazev} výš', { nazev: s.title })}
                    disabled={si === 0} onClick={() => upravit((b) => posun(b.sections, si, -1))} />
                  <Button variant="ghost" size="sm" iconOnly icon="chevron" className="tap-target" aria-label={t('Posunout sekci {nazev} níž', { nazev: s.title })}
                    disabled={si === board.sections.length - 1} onClick={() => upravit((b) => posun(b.sections, si, 1))} />
                  <Button variant="danger" size="sm" iconOnly icon="trash" className="tap-target ml-2" aria-label={t('Smazat sekci {nazev}', { nazev: s.title })}
                    onClick={() => setPotvrzeni({
                      titulek: t('Smazat sekci?'), text: t('Sekce „{nazev}“ zmizí i se všemi {n, plural, one {# položka} few {# položky} other {# položek}}. Definitivně až po uložení menu.', { nazev: s.title, n: s.items.length }), akce: t('Smazat sekci'), danger: true,
                      onAno: () => upravit((b) => { b.sections.splice(si, 1); }),
                    })} />
                </div>
              )}
            </div>

            {s.items.length > 0 && (
              <ul className="list">
                {s.items.map((it, ii) => {
                  const idVyp = `${uid}-v${si}-${ii}`;
                  return (
                    <li key={it.id ?? `nova-${ii}`} className="py-3 space-y-2">
                      <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2">
                        <Input value={it.name} maxLength={80} placeholder={t('Název položky')} aria-label={t('Název položky')} disabled={zamceno}
                          onChange={(e) => upravit((b) => { b.sections[si].items[ii].name = e.target.value; })} />
                        <Input value={cenaText[`${si}-${ii}`] ?? cenaDoPole(it.price)} inputMode="decimal"
                          aria-label={t('Cena — {nazev} ({mena})', { nazev: it.name || t('nová položka'), mena: board.currency })}
                          aria-invalid={cenaText[`${si}-${ii}`] !== undefined && !cenaZFormulare(cenaText[`${si}-${ii}`]).ok ? true : undefined}
                          className="text-right tabular-nums" disabled={zamceno || !smiCeny}
                          onChange={(e) => {
                            const text = e.target.value;
                            const k = `${si}-${ii}`;
                            setCenaText((t) => ({ ...t, [k]: text }));
                            // Nečitelný text cenu nemění — zůstává poslední platná.
                            const c = cenaZFormulare(text);
                            if (c.ok) upravit((b) => { b.sections[si].items[ii].price = c.hodnota ?? 0; });
                          }}
                          onBlur={() => setCenaText((t) => { const kopie = { ...t }; delete kopie[`${si}-${ii}`]; return kopie; })} />
                      </div>
                      <Input value={it.description ?? ''} maxLength={200} placeholder={t('Popisek (nepovinný)')} aria-label={t('Popisek — {nazev}', { nazev: it.name || t('nová položka') })} disabled={zamceno}
                        onChange={(e) => upravit((b) => { b.sections[si].items[ii].description = e.target.value; })} />
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-2">
                          <Switch checked={it.soldOut} labelledBy={idVyp} disabled={!smiVyprodano && zamceno}
                            onChange={(v) => { if (smiVyprodano) void prepnoutVyprodano(si, ii, v); else upravit((b) => { b.sections[si].items[ii].soldOut = v; }); }} />
                          <span id={idVyp} className={`text-[13px] ${it.soldOut ? 'font-semibold text-bad-ink' : 'text-black/55'}`}>
                            <span className="sr-only">{it.name}: </span>{t('Vyprodáno')}
                          </span>
                        </span>
                        {posPripojena && (it.posProductId ? (
                          <>
                            <Chip tone="ok" size="sm" icon="check">{t('Tiskne se na kase')}</Chip>
                            {!zamceno && <Button variant="ghost" size="sm" onClick={() => upravit((b) => { b.sections[si].items[ii].posProductId = null; })}>{t('Zrušit vazbu')}</Button>}
                          </>
                        ) : (
                          <>
                            <Chip tone="wait" size="sm">{t('Netiskne se')}</Chip>
                            {!zamceno && <Button variant="secondary" size="sm" onClick={() => otevritVyber(si, ii)}>{t('Spárovat')}</Button>}
                          </>
                        ))}
                        <Button variant="ghost" size="sm" onClick={() => setAlergenyOtevreno({ si, ii })}
                          aria-label={t('Alergeny a štítky — {nazev}', { nazev: it.name || t('nová položka') })}>
                          {(it.allergens?.length ?? 0) > 0 ? t('Alergeny: {seznam}', { seznam: it.allergens!.join(', ') }) : t('Alergeny')}
                        </Button>
                        {(it.tags ?? []).map(k => <Chip key={k} size="sm">{(STITKY as any)[k]?.cs ?? k}</Chip>)}
                        <span className="flex-1" />
                        {!zamceno && (
                          <span className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" iconOnly icon="chevron" className="tap-target [&>svg]:rotate-180" aria-label={t('Posunout {nazev} výš', { nazev: it.name || t('položku') })}
                              disabled={ii === 0} onClick={() => upravit((b) => posun(b.sections[si].items, ii, -1))} />
                            <Button variant="ghost" size="sm" iconOnly icon="chevron" className="tap-target" aria-label={t('Posunout {nazev} níž', { nazev: it.name || t('položku') })}
                              disabled={ii === s.items.length - 1} onClick={() => upravit((b) => posun(b.sections[si].items, ii, 1))} />
                            <Button variant="danger" size="sm" iconOnly icon="trash" className="tap-target ml-2" aria-label={t('Smazat {nazev}', { nazev: it.name || t('položku') })}
                              onClick={() => smazatPolozku(si, ii)} />
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {!zamceno && (
              <div className="flex gap-2 flex-wrap">
                <Button variant="secondary" size="sm" icon="plus"
                  onClick={() => upravit((b) => { b.sections[si].items.push({ name: '', price: 0, soldOut: false }); })}>
                  
                  {t('Položka')}
                </Button>
                {posPripojena !== false && (
                  <Button variant="ghost" size="sm" icon="plus" onClick={() => otevritVyber(si, null)}>{t('Z pokladny')}</Button>
                )}
              </div>
            )}

            {posOtevreno?.si === si && (
              <Well className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input ref={posInput} onKeyDown={posKeys.onInputKeyDown} className="flex-1" value={posHledat} autoFocus
                    aria-label={posOtevreno?.ii == null ? t('Hledat v katalogu kasy') : t('Položka v kase pro {nazev}', { nazev: s.items[posOtevreno.ii]?.name || t('položku') })}
                    placeholder={posOtevreno?.ii == null ? t('Hledat v katalogu kasy…') : t('Ke které položce v kase patří „{nazev}“?', { nazev: s.items[posOtevreno.ii]?.name || '…' })}
                    onChange={(e) => setPosHledat(e.target.value)} />
                  <Button variant="ghost" size="sm" onClick={() => setPosOtevreno(null)}>{t('Zavřít')}</Button>
                </div>
                {posStav && <p className="t-meta">{posStav}</p>}
                <div ref={posList} onKeyDown={posKeys.onListKeyDown} className="max-h-64 overflow-y-auto divide-y divide-black/[0.06]">
                  {(posProdukty ?? [])
                    .filter((p) => obsahuje(p.name + ' ' + p.category, posHledat))
                    .slice(0, 80)
                    .map((p) => (
                      <button key={p.productId} type="button" onClick={() => vybratZPos(p)}
                        className="w-full text-left rounded-xl px-3 py-2 hover:bg-black/[0.04] transition-colors flex items-center gap-2">
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-[#16181A] truncate">{p.name}</span>
                          {p.category && <span className="block text-[13px] text-black/55 truncate">{p.category}</span>}
                        </span>
                        <span className="text-sm font-semibold text-black/60 whitespace-nowrap tabular-nums">
                          {p.price != null ? `${cenaDoPole(p.price)} ${board.currency}` : 'bez ceny'}
                        </span>
                      </button>
                    ))}
                </div>
              </Well>
            )}
          </Card>
        ))}

        <Card className="space-y-3">
          {!zamceno && !editace && (
            <Button variant="secondary" size="sm" icon="plus"
              onClick={() => upravit((b) => { b.sections.push({ title: 'Nová sekce' /* i18n-ok (obsah podniku se nepřekládá, ukládá se na server) */, column: 1, items: [] }); })}>
              
              {t('Sekce')}
            </Button>
          )}
          {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
          {neulozeno && !chyba && <p className="note note-wait" role="status">{t('Máš neuložené změny.')}</p>}
          <div className="flex items-center justify-end gap-2 flex-wrap">
            {smiMazat && (
              <Button variant="danger" disabled={ukladam} onClick={() => setPotvrzeni({
                titulek: t('Smazat menu?'), text: t('Menu „{nazev}“ zmizí i se všemi položkami a vytištěné QR kódy přestanou fungovat. Tohle nejde vzít zpět.', { nazev: board.name }), akce: t('Smazat menu'), danger: true,
                onAno: () => { void smazat(); },
              })}>{t('Smazat menu')}</Button>
            )}
            {smiUpravit && (
              <Button variant="primary" loading={ukladam} onClick={() => ulozit()}>{neulozeno ? t('Uložit změny') : t('Uložit menu')}</Button>
            )}
          </div>
        </Card>

        {/*
          Menu bývá dlouhé a tlačítko Uložit je až úplně dole. Kdo přidá položku
          v polovině seznamu, snadno odejde v domnění, že je hotovo — a změny
          se nikam neuloží. Dokud něco čeká, drží se ukládání na očích. Plovoucí
          lišta nese jedinou limetku (tlačítko dole je proto `primary`).
        */}
        <PlovouciLista label={t('Neuložené změny menu')} open={neulozeno && smiUpravit} animate>
          <span className="text-sm font-medium text-white">{t('Neuložené změny')}</span>
          <button type="button" onClick={() => ulozit()} disabled={ukladam} className="btn btn-accent btn-sm">
            {ukladam ? t('Ukládám…') : t('Uložit')}
          </button>
        </PlovouciLista>
      </div>
    );
  }

  const okna = (
    <>
      {kopieOkno}
      <Modal open={alergenyOtevreno != null && !!board?.sections[alergenyOtevreno.si]?.items[alergenyOtevreno.ii]} onClose={() => setAlergenyOtevreno(null)} size="md"
        title={t('Alergeny a štítky')}
        subtitle={alergenyOtevreno && board ? (board.sections[alergenyOtevreno.si]?.items[alergenyOtevreno.ii]?.name || t('Nová položka')) : undefined}
        footer={<Button variant="primary" onClick={() => setAlergenyOtevreno(null)}>{t('Hotovo')}</Button>}>
        {alergenyOtevreno && board?.sections[alergenyOtevreno.si]?.items[alergenyOtevreno.ii] && (() => {
          const { si, ii } = alergenyOtevreno;
          const it = board.sections[si].items[ii];
          return (
            <AlergenyPicker alergeny={it.allergens ?? []} stitky={it.tags ?? []} disabled={!smiUpravit}
              onAlergeny={(kody) => upravit((b) => { b.sections[si].items[ii].allergens = kody; })}
              onStitky={(kody) => upravit((b) => { b.sections[si].items[ii].tags = kody; })} />
          );
        })()}
      </Modal>
      <Modal open={noveMenu != null} onClose={() => setNoveMenu(null)} size="sm" title={t('Nové menu')} subtitle={t('Založí se prázdné, s vlastní adresou.')}
        footer={<>
          <Button variant="secondary" onClick={() => setNoveMenu(null)}>{t('Zrušit')}</Button>
          <Button variant="primary" type="submit" form={`${uid}-nove`} loading={ukladam}>{t('Založit menu')}</Button>
        </>}>
        <form id={`${uid}-nove`} onSubmit={(e) => { e.preventDefault(); const n = (noveMenu ?? '').trim(); if (n) void zalozit(n); }}>
          <Field id={`${uid}-nove-nazev`} label={t('Název menu')} hint={t('Třeba Stálá nabídka. Adresa se z názvu odvodí sama.')}>
            <Input id={`${uid}-nove-nazev`} autoFocus value={noveMenu ?? ''} maxLength={80} required onChange={(e) => setNoveMenu(e.target.value)} />
          </Field>
        </form>
      </Modal>
      <Modal open={potvrzeni != null} onClose={() => setPotvrzeni(null)} size="sm" title={potvrzeni?.titulek ?? ''}
        footer={<>
          <Button variant="secondary" onClick={() => setPotvrzeni(null)}>{t('Zrušit')}</Button>
          <Button variant={potvrzeni?.danger ? 'danger-solid' : 'primary'}
            onClick={() => { const p = potvrzeni; setPotvrzeni(null); p?.onAno(); }}>{potvrzeni?.akce}</Button>
        </>}>
        <p className="t-meta">{potvrzeni?.text}</p>
      </Modal>
      {toast && <Toast key={toast.id} id={toast.id} message={toast.text} tone={toast.ton} action={toast.akce} onClose={() => setToast(null)} />}
    </>
  );

  if (!hlavicka) return <>{nastroj}{okna}</>;
  return (
    <>
      <PlochaWidgetu stranka="vedeni.menu"
        hlavicka={{ title: t('Menu'), subtitle: t('Nabídka pro hosty. Změny se projeví na iPadu i v mobilech po obnovení stránky.'), hintId: 'menueditor' }}
        nastroj={nastroj} />
      {okna}
    </>
  );
}

/** Barva vzhledu: výběr barvy a totéž jako text (hex se dá opsat z manuálu značky). */
function Barva({ id, popis, hodnota, zmen, zamceno }: { id: string; popis: string; hodnota: string; zmen: (v: string) => void; zamceno: boolean }) {
  const t = useT('sprava');
  return (
    <div>
      <Label htmlFor={id}>{popis}</Label>
      <span className="flex items-center gap-2">
        <input type="color" value={hodnota} onChange={(e) => zmen(e.target.value)} disabled={zamceno} aria-label={t('{popis} — výběr barvy', { popis })}
          className="h-11 w-12 shrink-0 rounded-xl border border-black/[0.08] bg-transparent p-1 cursor-pointer" />
        <Input id={id} value={hodnota} maxLength={9} disabled={zamceno} onChange={(e) => zmen(e.target.value)} className="font-mono" />
      </span>
    </div>
  );
}
