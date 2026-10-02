'use client';

// Průvodce „Přecházíte z aplikace Kartička?“: import členů a nastavení věrnostního programu z Moje kartička
// (mojekarticka.cz) nebo z jakéhokoli jiného souboru s členy.
//
// Čtení tabulky, rozpoznání sloupců a převod řádků jsou čisté funkce v lib/importKarticka.ts (stejné pravidlo
// běží v prohlížeči před odesláním i na serveru po přijetí). Zápis po dávkách do 500 členů dělá
// POST /api/client/admin/import; tady je jen rozhraní. Soubor se čte celý v prohlížeči a na server jde po dávkách.
//
// Pět kroků (Soubor, Sloupce, Náhled, Pravidla, Import) a vedle toho Historie importů s vrácením.
// Podkroky jsou v components/client/import/.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Modal, Segmented } from '../ui';
import { HLASKA_NEJDE_ULOZIT, ulozSoubor } from '@/lib/stahni';
import {
  chybyJakoCsv, navrhniMapovani, prevedRadky, rozeberTabulku, souhrnImportu,
  type Mapovani, type PoleImportu,
} from '@/lib/importKarticka';
import Uvod, { jeSouborMoc, precistSoubor, type Kodovani } from './import/Uvod';
import Sloupce, { type VolbaSloupce } from './import/Sloupce';
import Nahled from './import/Nahled';
import Pravidla, { usePravidla } from './import/Pravidla';
import Prubeh, { type FazeImportu } from './import/Prubeh';
import Historie, { PotvrzeniVraceni, useHistorie, vratImportApi } from './import/Historie';
import {
  ChybaApi, cislo, j, MAX_DAVKA, NAZEV_NOVE_KAMPANE, PRAZDNY_SOUCET, pricti, VYCHOZI_VOLBY, zprava,
  type Hlaska, type KampanRazitek, type NahledDavky, type SoucetImportu, type StavNacteni, type VysledekDavky, type Volby,
} from './import/typy';

type Krok = 'uvod' | 'sloupce' | 'nahled' | 'pravidla' | 'import';
const KROKY: { id: Krok; label: string; nadpis: string }[] = [
  { id: 'uvod', label: '1 · Soubor', nadpis: 'Přecházíte z aplikace Kartička?' },
  { id: 'sloupce', label: '2 · Sloupce', nadpis: 'Zkontrolujte sloupce' },
  { id: 'nahled', label: '3 · Náhled', nadpis: 'Náhled importu' },
  { id: 'pravidla', label: '4 · Pravidla', nadpis: 'Přenést pravidla věrnosti' },
  { id: 'import', label: '5 · Import', nadpis: 'Import členů' },
];

const URL_IMPORT = '/api/client/admin/import';
const URL_STAMPS = '/api/client/admin/stamps';

const sloupcePodleMapovani = (pocet: number, m: Mapovani): VolbaSloupce[] => {
  const out: VolbaSloupce[] = Array.from({ length: pocet }, () => '');
  for (const [pole, i] of Object.entries(m) as [PoleImportu, number | undefined][]) if (i !== undefined && i < pocet) out[i] = pole;
  return out;
};

export default function ImportKartickaOkno({ open, onClose, oznam, onHotovo }: {
  open: boolean;
  onClose: () => void;
  oznam: Hlaska;
  onHotovo: () => void;
}) {
  const [krok, setKrok] = useState<Krok>('uvod');
  const [pohled, setPohled] = useState<'pruvodce' | 'historie'>('pruvodce');

  // --- Krok 1: tabulka ---
  const [cesta, setCesta] = useState<'soubor' | 'vlozit'>('soubor');
  const [text, setText] = useState('');
  const [nazevSouboru, setNazevSouboru] = useState<string | null>(null);
  const [kodovani, setKodovani] = useState<Kodovani>('utf-8');
  const [chybaSouboru, setChybaSouboru] = useState<string | null>(null);
  const [upozorneniKodovani, setUpozorneniKodovani] = useState<string | null>(null);
  const souborRef = useRef<File | null>(null);

  // --- Krok 2: sloupce ---
  const [sloupcePole, setSloupcePole] = useState<VolbaSloupce[]>([]);

  // --- Krok 3: náhled a volby ---
  const [volby, setVolby] = useState<Volby>(VYCHOZI_VOLBY);
  const [server, setServer] = useState<StavNacteni<NahledDavky>>({ stav: 'nic' });
  const [kampane, setKampane] = useState<StavNacteni<KampanRazitek[]>>({ stav: 'nic' });
  const poradiNahledu = useRef(0);

  // --- Krok 4: pravidla, historie ---
  const pravidla = usePravidla();
  const historie = useHistorie();
  const { nacti: nactiHistorii } = historie;
  const { nacti: nactiPravidla } = pravidla;
  const stavPravidel = pravidla.profil.stav;

  // --- Krok 5: import ---
  const [faze, setFaze] = useState<FazeImportu>('pripraveno');
  const [zpracovano, setZpracovano] = useState(0);
  const [soucet, setSoucet] = useState<SoucetImportu>(PRAZDNY_SOUCET);
  const [chybaDavky, setChybaDavky] = useState<string | null>(null);
  const [importId, setImportId] = useState<number | null>(null);
  const [vraceno, setVraceno] = useState(false);
  const [cisloDavky, setCisloDavky] = useState(1);
  const [vracimImport, setVracimImport] = useState(false);
  const [vracimPracuji, setVracimPracuji] = useState(false);
  const [zavreniZaBehu, setZavreniZaBehu] = useState(false);
  // Stav běhu držíme v refech: smyčka přes dávky běží přes překreslení a nesmí číst zastaralé hodnoty.
  const beh = useRef({ zrusit: false, token: 0, davka: 0, importId: null as number | null, kampanNova: null as number | null, zpracovano: 0, soucet: PRAZDNY_SOUCET, zmena: false });

  const tabulka = useMemo(() => rozeberTabulku(text), [text]);
  const mapovani = useMemo<Mapovani>(() => {
    const m: Mapovani = {};
    sloupcePole.forEach((f, i) => { if (f && m[f] === undefined) m[f] = i; });
    return m;
  }, [sloupcePole]);
  const rozbor = useMemo(() => prevedRadky(tabulka.radky, mapovani), [tabulka, mapovani]);
  const souhrn = useMemo(() => souhrnImportu(rozbor.radky), [rozbor]);
  const maSkupinuSloupec = mapovani.skupina !== undefined;
  const maRazitkaSloupec = mapovani.razitka !== undefined;
  const pocetDavek = Math.ceil(rozbor.radky.length / MAX_DAVKA);

  const bezOpravneni = historie.stav.stav === 'chyba' && historie.stav.status === 403;

  // Nové otevření okna začíná od nuly (rozběhlou smyčku to zneplatní tokenem).
  const reset = useCallback(() => {
    beh.current = { zrusit: false, token: beh.current.token + 1, davka: 0, importId: null, kampanNova: null, zpracovano: 0, soucet: PRAZDNY_SOUCET, zmena: false };
    souborRef.current = null;
    setKrok('uvod'); setPohled('pruvodce'); setCesta('soubor'); setText(''); setNazevSouboru(null); setKodovani('utf-8');
    setChybaSouboru(null); setUpozorneniKodovani(null); setSloupcePole([]); setVolby(VYCHOZI_VOLBY);
    setServer({ stav: 'nic' }); setKampane({ stav: 'nic' });
    setFaze('pripraveno'); setZpracovano(0); setSoucet(PRAZDNY_SOUCET); setChybaDavky(null); setImportId(null); setVraceno(false);
    setCisloDavky(1); setVracimImport(false); setZavreniZaBehu(false);
  }, []);
  useEffect(() => { if (open) { reset(); nactiHistorii(); } }, [open, reset, nactiHistorii]);

  const nastavText = useCallback((t: string) => {
    setText(t);
    const tb = rozeberTabulku(t);
    setSloupcePole(sloupcePodleMapovani(tb.hlavicka.length, navrhniMapovani(tb.hlavicka)));
  }, []);

  const nactiSoubor = useCallback(async (f: File, kod?: Kodovani) => {
    if (jeSouborMoc(f)) { setChybaSouboru('Soubor je větší než 10 MB. Rozdělte ho na více souborů.'); return; }
    try {
      let k: Kodovani = kod ?? 'utf-8';
      let r = await precistSoubor(f, k);
      let upoz: string | null = null;
      if (r.vadnyZnak && !kod) {
        const r2 = await precistSoubor(f, 'windows-1250');
        if (!r2.vadnyZnak) {
          r = r2; k = 'windows-1250';
          upoz = 'Soubor nebyl v UTF-8, přečetli jsme ho jako Windows-1250 (starší Excel). Zkontrolujte háčky a čárky; kódování můžete přepnout níže.';
        }
      }
      if (r.vadnyZnak && !upoz) upoz = 'V souboru jsou nečitelné znaky. Zkuste přepnout kódování, nebo ho v Excelu uložte jako CSV UTF-8.';
      souborRef.current = f;
      setNazevSouboru(f.name); setKodovani(k); setChybaSouboru(null); setUpozorneniKodovani(upoz);
      nastavText(r.text);
    } catch {
      setChybaSouboru('Soubor se nepodařilo přečíst.');
    }
  }, [nastavText]);

  // Dotaz na server při vstupu do náhledu a po každé změně tabulky nebo sloupců: nic se nezapisuje.
  const nactiNahled = useCallback(() => {
    if (rozbor.radky.length === 0) { setServer({ stav: 'nic' }); return; }
    const kolo = ++poradiNahledu.current;
    setServer({ stav: 'nacita' });
    j<{ nahled?: NahledDavky }>(URL_IMPORT, { method: 'POST', body: JSON.stringify({ radky: rozbor.radky.slice(0, MAX_DAVKA), nahled: true }) })
      .then(d => {
        if (kolo !== poradiNahledu.current) return;
        if (d.nahled) setServer({ stav: 'ok', data: d.nahled });
        else setServer({ stav: 'chyba', zprava: 'Server nevrátil kontrolu.' });
      })
      .catch(e => { if (kolo === poradiNahledu.current) setServer({ stav: 'chyba', zprava: zprava(e, 'Kontrola se nepovedla.'), status: e instanceof ChybaApi ? e.status : undefined }); });
  }, [rozbor]);

  const nactiKampane = useCallback(() => {
    setKampane({ stav: 'nacita' });
    j<{ campaigns?: KampanRazitek[] }>(URL_STAMPS)
      .then(d => setKampane({ stav: 'ok', data: (Array.isArray(d.campaigns) ? d.campaigns : []).filter(k => k && Number.isFinite(Number(k.id))) }))
      .catch(e => setKampane({ stav: 'chyba', zprava: zprava(e, 'Načtení se nepovedlo.'), status: e instanceof ChybaApi ? e.status : undefined }));
  }, []);

  useEffect(() => { if (open && krok === 'nahled' && pohled === 'pruvodce') nactiNahled(); }, [open, krok, pohled, nactiNahled]);
  const stavKampani = kampane.stav;
  useEffect(() => { if (open && krok === 'nahled' && stavKampani === 'nic') nactiKampane(); }, [open, krok, stavKampani, nactiKampane]);
  useEffect(() => { if (open && krok === 'pravidla' && stavPravidel === 'nic') nactiPravidla(); }, [open, krok, stavPravidel, nactiPravidla]);
  useEffect(() => { if (open && pohled === 'historie') nactiHistorii(); }, [open, pohled, nactiHistorii]);

  // --- Navigace ---
  const idx = KROKY.findIndex(k => k.id === krok);
  const bezi = faze === 'bezi';
  const pocetNova = Math.round(Number(volby.novaPocet));
  const novaKampanOk = volby.kampan !== 'nova' || (Number.isFinite(pocetNova) && pocetNova >= 1 && pocetNova <= 50 && volby.novaOdmena.trim().length > 0);
  const muzeDal: boolean =
    krok === 'uvod' ? tabulka.radky.length > 0 && tabulka.hlavicka.length > 0 && !bezOpravneni
    : krok === 'sloupce' ? mapovani.email !== undefined && rozbor.radky.length > 0
    : krok === 'nahled' ? rozbor.radky.length > 0 && novaKampanOk && !(server.stav === 'chyba' && server.status === 403)
    : true;
  const dopredu = () => { if (muzeDal && idx < KROKY.length - 1) setKrok(KROKY[idx + 1].id); };
  const dozadu = () => { if (idx > 0 && !bezi) setKrok(KROKY[idx - 1].id); };

  const zavri = useCallback(() => {
    if (beh.current.zmena) { beh.current.zmena = false; onHotovo(); }
    onClose();
  }, [onClose, onHotovo]);
  const pozadavekZavreni = () => { if (bezi) setZavreniZaBehu(true); else zavri(); };

  const stahniChyby = async () => {
    const r = await ulozSoubor('chyby-importu.csv', '﻿' + chybyJakoCsv(rozbor.chyby), 'text/csv;charset=utf-8');
    if (r === 'nejde') oznam(HLASKA_NEJDE_ULOZIT, 'bad');
  };

  // --- Import po dávkách ---
  const spust = async () => {
    const b = beh.current;
    const token = b.token;
    b.zrusit = false;
    setFaze('bezi'); setChybaDavky(null);

    let kampanId: number | null = null;
    if (volby.kampan === 'nova') {
      if (b.kampanNova === null) {
        try {
          const d = await j<{ id?: number }>(URL_STAMPS, {
            method: 'POST',
            body: JSON.stringify({ name: NAZEV_NOVE_KAMPANE, requiredStamps: pocetNova, rewardTitle: volby.novaOdmena.trim(), ruleType: 'visit' }),
          });
          if (token !== b.token) return;
          b.kampanNova = Number(d.id) || null;
        } catch (e) {
          if (token !== b.token) return;
          setChybaDavky(`Kampaň razítek se nepodařilo založit: ${zprava(e)}`);
          setFaze('chyba');
          return;
        }
      }
      kampanId = b.kampanNova;
    } else if (volby.kampan) {
      kampanId = Number(volby.kampan) || null;
    }

    const radky = rozbor.radky;
    const davek = Math.ceil(radky.length / MAX_DAVKA);
    while (b.davka < davek) {
      if (b.zrusit) { setFaze('zastaveno'); return; }
      setCisloDavky(b.davka + 1);
      const od = b.davka * MAX_DAVKA;
      const cast = radky.slice(od, od + MAX_DAVKA);
      try {
        const d = await j<VysledekDavky>(URL_IMPORT, {
          method: 'POST',
          body: JSON.stringify({
            radky: cast,
            nastaveni: {
              zdroj: 'karticka',
              soubor: cesta === 'soubor' ? nazevSouboru : null,
              existujici: volby.existujici,
              kampanRazitek: kampanId,
              skupiny: volby.skupiny && maSkupinuSloupec,
              importId: b.importId,
            },
          }),
        });
        if (token !== b.token) return;
        b.importId = Number(d.importId) || b.importId;
        b.soucet = pricti(b.soucet, d);
        b.zpracovano += cast.length;
        b.davka += 1;
        b.zmena = true;
        setImportId(b.importId); setSoucet(b.soucet); setZpracovano(b.zpracovano);
      } catch (e) {
        if (token !== b.token) return;
        setChybaDavky(`Dávka ${b.davka + 1} z ${davek} se nezapsala: ${zprava(e, 'Nepovedlo se.')}`);
        setFaze('chyba');
        return;
      }
    }
    if (token === b.token) setFaze('hotovo');
  };

  const zrusit = () => {
    beh.current.zrusit = true;
    // Při chybě dávky smyčka neběží, takže se zastaví hned.
    if (faze === 'chyba') setFaze('zastaveno');
  };

  const vratPoImportu = async () => {
    const id = beh.current.importId;
    if (id === null) return;
    setVracimPracuji(true);
    try {
      await vratImportApi(id);
      setVraceno(true);
      // Bez toastu: ten by na telefonu překryl tlačítko Hotovo; zpráva je v okně.
      beh.current.zmena = false;
      onHotovo();
    } catch (e) {
      oznam(zprava(e, 'Vrácení se nepovedlo.'), 'bad');
    }
    setVracimPracuji(false);
    setVracimImport(false);
  };

  // --- Souhrn před spuštěním ---
  const kampanNazev = volby.kampan === 'nova' ? `novou kampaň „${NAZEV_NOVE_KAMPANE}“ (${pocetNova} razítek)`
    : kampane.stav === 'ok' ? kampane.data.find(k => String(k.id) === volby.kampan)?.name ?? null : null;
  const radkyShrnuti: string[] = [
    `${cislo(souhrn.clenu)} členů z tabulky${rozbor.chyby.length ? `, ${cislo(rozbor.chyby.length)} řádků se přeskočí` : ''}.`,
    volby.existujici === 'nastavit' ? 'Členům, kteří už v podniku jsou, se nastaví zůstatky ze souboru.' : 'Členové, kteří už v podniku jsou, se přeskočí.',
    kampanNazev ? `Razítka půjdou do kampaně: ${kampanNazev}.` : souhrn.razitka > 0 ? 'Razítka se nepřenesou (není vybraná kampaň).' : 'Razítka se nepřenášejí.',
    volby.skupiny && souhrn.skupiny.length ? `Skupiny: ${souhrn.skupiny.map(s => s.nazev).join(', ')}.` : 'Členové se nezařazují do skupin.',
  ];

  // --- Okno ---
  const nadpis = pohled === 'historie' ? 'Historie importů' : KROKY[idx].nadpis;
  const jeKonec = faze === 'hotovo' || faze === 'zastaveno';
  let paticka: ReactNode = undefined;
  if (pohled === 'historie') {
    paticka = <Button variant="secondary" icon="arrowLeft" onClick={() => setPohled('pruvodce')}>Zpět k průvodci</Button>;
  } else if (krok === 'import') {
    if (faze === 'pripraveno') {
      paticka = <>
        <Button variant="secondary" onClick={dozadu}>Zpět</Button>
        <Button variant="accent" disabled={souhrn.clenu === 0} onClick={() => { void spust(); }}>Importovat {cislo(souhrn.clenu)} členů</Button>
      </>;
    } else if (jeKonec) {
      paticka = <Button variant="accent" icon="check" onClick={zavri}>Hotovo</Button>;
    }
  } else {
    paticka = <>
      {idx > 0 ? <Button variant="secondary" onClick={dozadu}>Zpět</Button> : <Button variant="secondary" onClick={pozadavekZavreni}>Zavřít</Button>}
      <Button variant="accent" iconAfter="chevronRight" disabled={!muzeDal} onClick={dopredu}>Pokračovat</Button>
    </>;
  }

  return (
    <>
      <Modal open={open} onClose={pozadavekZavreni} size="lg" title={nadpis} footer={paticka}>
        <div className="space-y-5 min-w-0">
          {pohled === 'pruvodce' ? (
            <>
              <Segmented
                ariaLabel="Kroky průvodce"
                size="sm"
                value={krok}
                // Zpět se dá přeskočit na kterýkoli předchozí krok; dopředu jen tlačítkem Pokračovat.
                onChange={id => { if (!bezi && KROKY.findIndex(k => k.id === id) < idx && !(krok === 'import' && jeKonec)) setKrok(id); }}
                options={KROKY.map(k => ({ id: k.id, label: k.label }))}
              />
              {krok === 'uvod' && (
                <>
                  {bezOpravneni && (
                    <div role="alert" className="rounded-2xl bg-[var(--bad-bg)] text-[var(--bad-ink)] p-3 text-sm text-pretty">
                      K importu chybí oprávnění „Import členů“. Požádejte vedení, ať vám ho přidá v nastavení rolí.
                    </div>
                  )}
                  <Uvod
                    cesta={cesta} setCesta={setCesta} text={text} setText={nastavText}
                    nazevSouboru={cesta === 'soubor' ? nazevSouboru : null}
                    kodovani={kodovani}
                    onKodovani={k => { setKodovani(k); if (souborRef.current) void nactiSoubor(souborRef.current, k); }}
                    onSoubor={f => { void nactiSoubor(f); }}
                    chybaSouboru={chybaSouboru} upozorneniKodovani={upozorneniKodovani}
                    radku={tabulka.radky.length} sloupcu={tabulka.hlavicka.length}
                    onHistorie={() => setPohled('historie')} muzeHistorii={!bezOpravneni}
                  />
                </>
              )}
              {krok === 'sloupce' && (
                <Sloupce
                  hlavicka={tabulka.hlavicka} radky={tabulka.radky} sloupcePole={sloupcePole}
                  onPole={(i, pole) => setSloupcePole(s => s.map((x, n) => (n === i ? pole : x)))} />
              )}
              {krok === 'nahled' && (
                <Nahled
                  rozbor={rozbor} souhrn={souhrn} maSkupinuSloupec={maSkupinuSloupec} maRazitkaSloupec={maRazitkaSloupec}
                  server={server} onServerZnovu={nactiNahled} kampane={kampane} onKampaneZnovu={nactiKampane}
                  volby={volby} setVolby={setVolby} onStahnoutChyby={() => { void stahniChyby(); }} />
              )}
              {krok === 'pravidla' && <Pravidla s={pravidla} />}
              {krok === 'import' && (
                <Prubeh
                  faze={faze} zpracovano={zpracovano} celkem={souhrn.clenu} soucet={soucet} chybaDavky={chybaDavky}
                  cisloDavky={cisloDavky} pocetDavek={pocetDavek} importId={importId} radkyShrnuti={radkyShrnuti}
                  onZkusit={() => { void spust(); }} onZrusit={zrusit} onVratit={() => setVracimImport(true)} vraceno={vraceno} />
              )}
              {krok === 'import' && jeKonec && (
                <p className="text-sm">
                  <button type="button" onClick={() => setPohled('historie')} className="tap-target-sm underline underline-offset-2 text-black/65 hover:text-[#16181A]">
                    Historie importů
                  </button>
                </p>
              )}
            </>
          ) : (
            <Historie h={historie} oznam={oznam} onVraceno={onHotovo} />
          )}
        </div>
      </Modal>

      {vracimImport && <PotvrzeniVraceni pracuji={vracimPracuji} onPotvrdit={() => { void vratPoImportu(); }} onZavrit={() => { if (!vracimPracuji) setVracimImport(false); }} />}
      {zavreniZaBehu && (
        <Modal open onClose={() => setZavreniZaBehu(false)} size="sm" title="Import ještě běží"
          footer={<>
            <Button variant="secondary" onClick={() => setZavreniZaBehu(false)}>Nechat běžet</Button>
            <Button variant="danger-solid" onClick={() => { beh.current.zrusit = true; setZavreniZaBehu(false); zavri(); }}>Zastavit a zavřít</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">
            Import se zastaví po dokončení právě zapisované dávky. Co už je zapsané, zůstane a půjde vrátit v historii importů.
          </p>
        </Modal>
      )}
    </>
  );
}
