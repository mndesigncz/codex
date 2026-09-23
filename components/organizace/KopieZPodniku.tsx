'use client';

// Kopie návodů, postupů nebo menu z jiného podniku téže organizace.
//
// Je to jednorázová kopie, ne živé sdílení: návod visí na surovinách ve
// skladu a postup na lidech jednoho podniku, takže „stejný návod ve dvou
// podnicích" po měsíci stejně není stejný. Okno proto vede třemi kroky —
// odkud, co, jak to dopadlo — a v posledním ukáže poznámky serveru
// (odpojená surovina, chybějící kategorie, vypnuté menu), protože právě
// ty rozhodují, co musí vedení po zkopírování ještě projít.

import { useCallback, useEffect, useMemo, useState } from 'react';
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
 * Ostatní podniky organizace (bez toho aktivního). Rodiče podle toho
 * rozhodují, jestli tlačítko „Z jiného podniku" vůbec kreslit — komu
 * organizace nebo druhý podnik chybí, nemá odkud kopírovat.
 *
 * `povoleno=false` nic nenačítá: zaměstnanec tlačítko nedostane a dva
 * dotazy navíc při každém otevření obrazovky by byly jen šum.
 */
export function useJinePodniky(povoleno = true): { jine: Podnik[]; nacteno: boolean } {
  const [jine, setJine] = useState<Podnik[]>([]);
  const [nacteno, setNacteno] = useState(!povoleno);

  useEffect(() => {
    if (!povoleno) { setJine([]); setNacteno(true); return; }
    let platne = true;
    Promise.all([
      fetch('/api/organization').then(okJson),
      fetch('/api/teams/mine').then(okJson),
    ])
      .then(([org, mine]) => {
        if (!platne) return;
        const aktivni = mine?.activeTeamId != null ? Number(mine.activeTeamId) : null;
        const teams: any[] = Array.isArray(org?.organization?.teams) ? org.organization.teams : [];
        setJine(teams
          .map(t => ({ id: Number(t.id), name: String(t.name ?? '') }))
          .filter(t => Number.isFinite(t.id) && t.id !== aktivni));
      })
      // Bez organizace (nebo bez spojení) prostě není odkud kopírovat —
      // tlačítko se nenakreslí, nic dalšího tu není co hlásit.
      .catch(() => { if (platne) setJine([]); })
      .finally(() => { if (platne) setNacteno(true); });
    return () => { platne = false; };
  }, [povoleno]);

  return { jine, nacteno };
}

export default function KopieZPodniku({ entita, onClose, onHotovo }: {
  entita: KopieEntita;
  onClose: () => void;
  /** Kopie proběhla — rodič si znovu načte seznam. */
  onHotovo: () => void;
}) {
  const t = TEXTY[entita];
  const { jine, nacteno } = useJinePodniky();

  const [zdroj, setZdroj] = useState<Podnik | null>(null);
  const [polozky, setPolozky] = useState<Polozka[] | null>(null);
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

  // Jediný jiný podnik se nevybírá — rovnou se ukáže, co v něm je.
  useEffect(() => {
    if (nacteno && jine.length === 1 && !zdroj) setZdroj(jine[0]);
  }, [nacteno, jine, zdroj]);

  const nactiSeznam = useCallback(async (p: Podnik) => {
    setNacitamSeznam(true); setChybaSeznamu(''); setPolozky(null); setVybrane(new Set());
    try {
      const d = await fetch(`/api/organization/kopie?entita=${entita}&z=${p.id}`).then(okJson);
      const seznam: Polozka[] = Array.isArray(d?.polozky) ? d.polozky : [];
      setPolozky(seznam);
    } catch (e) {
      setChybaSeznamu(apiMessage(e, 'Seznam z druhého podniku se nenačetl.'));
    } finally {
      setNacitamSeznam(false);
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
  const uspesne = vysledky?.filter(r => r.noveId != null).length ?? 0;
  const presDavku = vybrane.size > MAX_DAVKA;

  const podtitul = krok === 'podnik'
    ? 'Vyber, odkud se má kopírovat.'
    : krok === 'vyber' && zdroj
      ? `Z podniku ${zdroj.name} do toho, ve kterém teď jsi. Vznikne kopie — další úpravy už spolu nesouvisí.`
      : zdroj ? `Z podniku ${zdroj.name}` : undefined;

  const paticka = krok === 'vyber' ? (
    <>
      {jine.length > 1 && (
        <Button variant="ghost" onClick={() => { setZdroj(null); setPolozky(null); setChybaSeznamu(''); }}>Jiný podnik</Button>
      )}
      <Button variant="ghost" onClick={onClose}>Zrušit</Button>
      <Button variant="accent" icon="copy" loading={kopiruji} disabled={vybrane.size === 0 || presDavku || !!chybaSeznamu}
        onClick={zkopirovat}>
        Zkopírovat ({vybrane.size})
      </Button>
    </>
  ) : krok === 'vysledek' ? (
    <Button variant="accent" onClick={() => { if (!obnoveno) onHotovo(); onClose(); }}>Hotovo</Button>
  ) : undefined;

  return (
    <Modal open onClose={onClose} title={t.nadpis} subtitle={podtitul} size="lg" footer={paticka}>
      {krok === 'podnik' && (
        !nacteno ? (
          <div className="flex justify-center py-10"><span className="spinner" aria-label="Načítám podniky" /></div>
        ) : jine.length === 0 ? (
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
        <div className="space-y-3">
          <p className={`note ${uspesne === 0 ? 'note-danger' : uspesne < vysledky.length ? 'note-wait' : 'note-ok'}`}>
            {uspesne === 0
              ? 'Nic se nezkopírovalo.'
              : `Zkopírováno ${uspesne} z ${czCount(vysledky.length, t.polozka)}.`}
          </p>
          <ul className="space-y-1.5">
            {vysledky.map(r => {
              const ok = r.noveId != null;
              return (
                <li key={r.id} className="flex items-start gap-3 rounded-2xl border border-black/[0.08] px-3 py-2.5">
                  <Icon name={ok ? 'check' : 'warning'} size={16}
                    className={`shrink-0 mt-0.5 ${ok ? 'text-ok-ink' : 'text-bad-ink'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[#16181A] truncate">{r.nazev}</span>
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
