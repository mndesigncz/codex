'use client';

// Kopie návodů, postupů nebo menu z jiného podniku téže organizace.
//
// Je to jednorázová kopie, ne živé sdílení: návod visí na surovinách ve
// skladu a postup na lidech jednoho podniku, takže „stejný návod ve dvou
// podnicích" po měsíci stejně není stejný. Okno proto vede třemi kroky —
// odkud, co, jak to dopadlo — a v posledním ukáže poznámky serveru
// (odpojená surovina, chybějící kategorie, vypnuté menu), protože právě
// ty rozhodují, co musí vedení po zkopírování ještě projít.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Modal, Button, SearchField, ErrorState, EmptyState, SelectBox } from '../ui';
import { okJson, apiMessage } from '@/lib/api';
import { czCount, type CzNoun } from '@/lib/czech';
import { obsahujeNekde } from '@/lib/hledani';

export type KopieEntita = 'navody' | 'postupy' | 'menu';

interface Podnik { id: number; name: string }
interface Polozka { id: number; nazev: string; popis: string | null; pocet: number; kategorie: string | null }
interface Vysledek { id: number; noveId: number | null; nazev: string; poznamky: string[] }

/** Server bere nejvýš tolik položek v jedné dávce. */
const MAX_DAVKA = 50;

const TEXTY: Record<KopieEntita, { nadpis: string; nic: (podnik: string) => string; jednotka: CzNoun; polozka: CzNoun }> = {
  navody: {
    nadpis: 'Návody z jiného podniku',
    nic: p => `V podniku ${p} žádné návody nejsou.`,
    jednotka: { one: 'krok', few: 'kroky', many: 'kroků' },
    polozka: { one: 'návod', few: 'návody', many: 'návodů' },
  },
  postupy: {
    nadpis: 'Postupy z jiného podniku',
    nic: p => `V podniku ${p} žádné postupy nejsou.`,
    jednotka: { one: 'krok', few: 'kroky', many: 'kroků' },
    polozka: { one: 'postup', few: 'postupy', many: 'postupů' },
  },
  menu: {
    nadpis: 'Menu z jiného podniku',
    nic: p => `V podniku ${p} žádné menu není.`,
    jednotka: { one: 'položka', few: 'položky', many: 'položek' },
    polozka: { one: 'menu', few: 'menu', many: 'menu' },
  },
};

/**
 * Podniky, ze kterých smí aktivní vedení kopírovat: ostatní podniky TÉŽE
 * organizace, kde je členem vedení — stejné pravidlo jako server
 * (podnikyProPrehled). Rodiče podle toho rozhodují, jestli tlačítko
 * „Z jiného podniku" vůbec kreslit, a seznam předají oknu.
 *
 * `povoleno=false` nic nenačítá: zaměstnanec tlačítko nedostane a dotaz
 * navíc při každém otevření obrazovky by byl jen šum.
 */
export function useJinePodniky(povoleno = true): {
  jine: Podnik[]; nacteno: boolean;
  /** Seznam se nenačetl — „žádný jiný podnik" to není, jen to nevíme. */
  chyba: boolean; znovu: () => void;
  /** Jméno podniku, DO kterého se kopíruje. */
  cil: string | null;
} {
  const [jine, setJine] = useState<Podnik[]>([]);
  const [nacteno, setNacteno] = useState(!povoleno);
  const [chyba, setChyba] = useState(false);
  const [cil, setCil] = useState<string | null>(null);
  const [pokus, setPokus] = useState(0);
  const znovu = useCallback(() => setPokus(n => n + 1), []);

  useEffect(() => {
    if (!povoleno) { setJine([]); setNacteno(true); return; }
    let platne = true;
    setChyba(false);
    fetch('/api/teams/mine').then(okJson)
      .then(mine => {
        if (!platne) return;
        const aktivni = mine?.activeTeamId != null ? Number(mine.activeTeamId) : null;
        const muj = Array.isArray(mine?.teams) ? mine.teams.find((t: any) => Number(t.teamId) === aktivni) : null;
        setCil(muj?.teamName ? String(muj.teamName) : null);
        const orgId = mine?.organization?.id != null ? Number(mine.organization.id) : null;
        const teams: any[] = Array.isArray(mine?.teams) ? mine.teams : [];
        setJine(orgId == null ? [] : teams
          .filter(t => Number(t.organizationId) === orgId && t.role === 'employer')
          .map(t => ({ id: Number(t.teamId), name: String(t.teamName ?? '') }))
          .filter(t => Number.isFinite(t.id) && t.id !== aktivni));
      })
      // Bez spojení se tlačítko nenakreslí; kde je kopie hlavní cestou
      // (prázdný editor menu), rodič podle `chyba` nabídne „Zkusit znovu".
      .catch(() => { if (platne) { setJine([]); setChyba(true); } })
      .finally(() => { if (platne) setNacteno(true); });
    return () => { platne = false; };
  }, [povoleno, pokus]);

  return { jine, nacteno, chyba, znovu, cil };
}

export default function KopieZPodniku({ entita, podniky: jine, cil, onClose, onHotovo }: {
  entita: KopieEntita;
  /** Odkud smí kopírovat — z `useJinePodniky` rodiče, ať se neptá dvakrát. */
  podniky: Podnik[];
  /** Kam se kopíruje (aktivní podnik) — ať okno říká obě jména. */
  cil?: string | null;
  onClose: () => void;
  /** Kopie proběhla — rodič si znovu načte seznam. */
  onHotovo: () => void;
}) {
  const t = TEXTY[entita];

  // Jediný jiný podnik se nevybírá — rovnou se ukáže, co v něm je.
  const [zdroj, setZdroj] = useState<Podnik | null>(jine.length === 1 ? jine[0] : null);
  const [polozky, setPolozky] = useState<Polozka[] | null>(null);
  const [celkem, setCelkem] = useState(0);
  const [nacitamSeznam, setNacitamSeznam] = useState(false);
  const [chybaSeznamu, setChybaSeznamu] = useState('');
  const [hledat, setHledat] = useState('');
  const [vybrane, setVybrane] = useState<Set<number>>(new Set());

  const [kopiruji, setKopiruji] = useState(false);
  const [chybaKopie, setChybaKopie] = useState('');
  const [vysledky, setVysledky] = useState<Vysledek[] | null>(null);
  // Rodič se obnovuje hned po úspěšné kopii, ne až tlačítkem „Hotovo":
  // kdo okno zavře křížkem, nesmí koukat na starý seznam. Podruhé už ne.
  const [obnoveno, setObnoveno] = useState(false);

  // Pořadí požadavků: kdo rychle přepne podnik, nesmí dostat seznam
  // PŘEDCHOZÍHO podniku jen proto, že jeho odpověď přišla později — id by
  // pak mířila do jiného zdroje, než jaký okno ukazuje.
  const pozadavek = useRef(0);
  const nactiSeznam = useCallback(async (p: Podnik) => {
    const moje = ++pozadavek.current;
    setNacitamSeznam(true); setChybaSeznamu(''); setPolozky(null); setVybrane(new Set());
    try {
      const d = await fetch(`/api/organization/kopie?entita=${entita}&z=${p.id}`).then(okJson);
      if (moje !== pozadavek.current) return;
      const seznam: Polozka[] = Array.isArray(d?.polozky) ? d.polozky : [];
      setPolozky(seznam);
      setCelkem(Number(d?.celkem) || seznam.length);
    } catch (e) {
      if (moje !== pozadavek.current) return;
      setChybaSeznamu(apiMessage(e, 'Seznam z druhého podniku se nenačetl.'));
    } finally {
      if (moje === pozadavek.current) setNacitamSeznam(false);
    }
  }, [entita]);

  useEffect(() => { if (zdroj) nactiSeznam(zdroj); }, [zdroj, nactiSeznam]);

  const filtrovane = useMemo(() => {
    const q = hledat.trim();
    if (!polozky) return [];
    if (!q) return polozky;
    return polozky.filter(p => obsahujeNekde(q, p.nazev, p.popis, p.kategorie));
  }, [polozky, hledat]);

  const vseVybrano = filtrovane.length > 0 && filtrovane.every(p => vybrane.has(p.id));
  const prepnout = (id: number) => setVybrane(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  // „Vybrat vše" se týká toho, co je vidět — po vyhledání jen nalezených.
  const prepnoutVse = () => setVybrane(prev => {
    const n = new Set(prev);
    if (vseVybrano) filtrovane.forEach(p => n.delete(p.id));
    else filtrovane.forEach(p => n.add(p.id));
    return n;
  });

  const zkopirovat = async () => {
    if (!zdroj || vybrane.size === 0) return;
    setKopiruji(true); setChybaKopie('');
    try {
      const res = await fetch('/api/organization/kopie', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entita, z: zdroj.id, ids: Array.from(vybrane) }),
      });
      const d = await okJson(res);
      const v: Vysledek[] = Array.isArray(d?.vysledky) ? d.vysledky : [];
      setVysledky(v);
      if (v.some(r => r.noveId != null)) { onHotovo(); setObnoveno(true); }
    } catch (e) {
      setChybaKopie(apiMessage(e, 'Kopie se nepovedla.'));
    } finally {
      setKopiruji(false);
    }
  };

  const krok: 'podnik' | 'vyber' | 'vysledek' = vysledky ? 'vysledek' : zdroj ? 'vyber' : 'podnik';

  // Během kopírování okno nezavírat (křížek, Escape, Zrušit): kopie na
  // serveru běží dál, seznam za oknem by se obnovil a poznámky, co se
  // nepřeneslo, by nikdo neviděl.
  const zavrit = () => { if (!kopiruji) onClose(); };

  // Po kopii zmizí tlačítko s fokusem — fokus na výsledek, ať odečítač
  // přečte souhrn a Tab nezačíná od začátku stránky.
  const vysledekRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (krok === 'vysledek') vysledekRef.current?.focus(); }, [krok]);
  const uspesne = vysledky?.filter(r => r.noveId != null).length ?? 0;
  const presDavku = vybrane.size > MAX_DAVKA;

  const podtitul = krok === 'podnik'
    ? 'Vyber, odkud se má kopírovat.'
    : krok === 'vyber' && zdroj
      ? `Z podniku ${zdroj.name} do ${cil ? `podniku ${cil}` : 'toho, ve kterém teď jsi'}. Vznikne kopie — další úpravy už spolu nesouvisí.`
      : zdroj ? `Z podniku ${zdroj.name}${cil ? ` do podniku ${cil}` : ''}` : undefined;

  // Patička má jen dvě tlačítka: se třetím („Jiný podnik") se na telefonu
  // nevejde a levé by skončilo za okrajem. Volba podniku je v těle okna.
  const paticka = krok === 'vyber' ? (
    <>
      <Button variant="ghost" onClick={zavrit} disabled={kopiruji}>Zrušit</Button>
      <Button variant="accent" icon="copy" loading={kopiruji} disabled={vybrane.size === 0 || presDavku || !!chybaSeznamu}
        onClick={zkopirovat}>
        Zkopírovat ({vybrane.size})
      </Button>
    </>
  ) : krok === 'vysledek' ? (
    <Button variant="accent" onClick={() => { if (!obnoveno) onHotovo(); onClose(); }}>Hotovo</Button>
  ) : undefined;

  return (
    <Modal open onClose={zavrit} title={t.nadpis} subtitle={podtitul} size="lg" footer={paticka}>
      {krok === 'podnik' && (
        jine.length === 0 ? (
          <EmptyState compact icon="box" title="Není odkud kopírovat"
            hint="Kopírovat jde jen z jiného podniku téže organizace — a ten tu zatím není." />
        ) : (
          <ul className="space-y-2">
            {jine.map(p => (
              <li key={p.id}>
                <button type="button" onClick={() => setZdroj(p)}
                  className="w-full flex items-center gap-3 rounded-2xl border border-black/[0.08] bg-black/[0.03] px-4 py-3 text-left hover:bg-black/[0.05] transition">
                  <Icon name="box" size={18} className="shrink-0 text-black/55" />
                  <span className="min-w-0 flex-1 truncate font-medium text-[#16181A]">{p.name}</span>
                  <Icon name="chevron" size={16} className="shrink-0 text-black/35" />
                </button>
              </li>
            ))}
          </ul>
        )
      )}

      {krok === 'vyber' && zdroj && jine.length > 1 && (
        <div className="-mt-1 mb-3">
          <Button variant="ghost" size="sm" disabled={kopiruji}
            onClick={() => { pozadavek.current++; setZdroj(null); setPolozky(null); setChybaSeznamu(''); setNacitamSeznam(false); }}>
            Vybrat jiný podnik
          </Button>
        </div>
      )}

      {krok === 'vyber' && zdroj && (
        nacitamSeznam ? (
          <div className="flex justify-center py-10"><span className="spinner" aria-label="Načítám seznam" /></div>
        ) : chybaSeznamu ? (
          <ErrorState compact title="Seznam se nenačetl" hint={chybaSeznamu} onRetry={() => nactiSeznam(zdroj)} />
        ) : (polozky ?? []).length === 0 ? (
          <EmptyState compact icon="copy" title={t.nic(zdroj.name)} />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              {/* Hledání je pomocné — rozepsaný dotaz nemá okno držet otevřené otázkou „zahodit?". */}
              <div data-transient className="flex-1 min-w-0">
                <SearchField value={hledat} onChange={setHledat} placeholder="Hledat…" ariaLabel="Hledat v seznamu" />
              </div>
              <Button variant="ghost" size="sm" onClick={prepnoutVse} disabled={filtrovane.length === 0}>
                {vseVybrano ? 'Zrušit výběr' : 'Vybrat vše'}
              </Button>
            </div>
            {polozky && celkem > polozky.length && (
              <p className="note note-wait">
                Zobrazeno {polozky.length} z {celkem} — co tu nevidíš, hledej podle názvu v menším výběru nebo zkopíruj po částech.
              </p>
            )}
            {presDavku && (
              <p role="alert" className="note note-wait">Najednou jde zkopírovat nejvýš {MAX_DAVKA} položek — odeber {vybrane.size - MAX_DAVKA}.</p>
            )}
            {chybaKopie && <p role="alert" className="note note-danger">{chybaKopie}</p>}
            {filtrovane.length === 0 ? (
              <p className="text-sm text-black/55 py-4 text-center">Nic takového tu není.</p>
            ) : (
              <ul className="space-y-1.5">
                {filtrovane.map(p => {
                  const on = vybrane.has(p.id);
                  const meta = p.kategorie ?? p.popis;
                  return (
                    <li key={p.id}>
                      {/* Řádek i zaškrtávátko přepínají totéž; klik na zaškrtávátko
                          by jinak probublal do řádku a přepnul dvakrát. */}
                      <div onClick={e => { if ((e.target as HTMLElement).closest('button')) return; prepnout(p.id); }}
                        className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 cursor-pointer transition ${
                          on ? 'border-[#C8F542]/50 bg-[#C8F542]/10' : 'border-black/[0.08] bg-black/[0.02] hover:bg-black/[0.05]'}`}>
                        <SelectBox checked={on} onChange={() => prepnout(p.id)} label={`Vybrat ${p.nazev}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium text-[#16181A] truncate">{p.nazev}</span>
                          {meta && <span className="block text-xs text-black/55 truncate">{meta}</span>}
                        </span>
                        <span className="chip chip-sm chip-muted shrink-0 tabular-nums">{czCount(p.pocet, t.jednotka)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )
      )}

      {krok === 'vysledek' && vysledky && (
        <div ref={vysledekRef} tabIndex={-1} className="space-y-3 outline-none">
          <p role="status" className={`note ${uspesne === 0 ? 'note-danger' : uspesne < vysledky.length ? 'note-wait' : 'note-ok'}`}>
            {/* „2 z 3 návody" je špatný pád; číslo po „z" se proto neskloňuje
                a podstatné jméno nese jen souhrn, když prošlo všechno. */}
            {uspesne === 0
              ? 'Nic se nezkopírovalo.'
              : uspesne === vysledky.length
                ? `Zkopírováno: ${czCount(uspesne, t.polozka)}.`
                : `Zkopírováno ${uspesne} z ${vysledky.length}.`}
          </p>
          <ul className="space-y-1.5">
            {vysledky.map(r => {
              const ok = r.noveId != null;
              return (
                <li key={r.id} className="flex items-start gap-3 rounded-2xl border border-black/[0.08] px-3 py-2.5">
                  <Icon name={ok ? 'check' : 'warning'} size={16}
                    className={`shrink-0 mt-0.5 ${ok ? 'text-ok-ink' : 'text-bad-ink'}`} />
                  <span className="min-w-0 flex-1">
                    {/* Položka, která ve zdroji mezitím zmizela, přijde jako „#id" —
                        okno ale její název zná ze seznamu. */}
                    <span className="block text-sm font-medium text-[#16181A] truncate">
                      {polozky?.find(p => p.id === r.id)?.nazev ?? r.nazev}
                    </span>
                    {r.poznamky.map((pz, i) => (
                      <span key={i} className={`block text-xs mt-0.5 ${ok ? 'text-black/55' : 'text-bad-ink'}`}>{pz}</span>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Modal>
  );
}
