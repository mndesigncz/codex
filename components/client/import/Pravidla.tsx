'use client';

// Krok 4 (nepovinný): opsat staré pravidlo věrnosti. Kartička pravidla exportovat neumí, takže je podnik
// opíše sám. Ukládá se jedním PUT na /api/client/admin/profile, jen s políčky, která člověk zapnul
// (route sama doplní zbytek profilu z uložených hodnot, takže nic dalšího se nepřepíše).

import { useCallback, useState, type ReactNode } from 'react';
import { Button, ErrorState, Input, Label, Select, Skeleton } from '../../ui';
import { Icon } from '../../Icons';
import { useSymbol } from '../../CurrencyProvider';
import { ChybaApi, j, zprava, type StavNacteni } from './typy';

type KlicPravidla =
  | 'cashback_pct' | 'cashback_mode' | 'points_per_100' | 'birthday_points'
  | 'silver_at' | 'gold_at' | 'platinum_at'
  | 'member_discount' | 'silver_discount' | 'gold_discount' | 'platinum_discount';

interface DefPole {
  klic: KlicPravidla; popis: string; min: number; max: number; vychozi: string; napoveda?: string; jednotka?: string;
}

const SKUPINY: { nazev: string; popis?: string; pole: (DefPole | 'rezim')[] }[] = [
  {
    nazev: 'Cashback a body',
    pole: [
      { klic: 'cashback_pct', popis: 'Cashback v %', min: 0, max: 50, vychozi: '5', jednotka: '%', napoveda: 'Kolik procent z útraty se vrací.' },
      'rezim',
      { klic: 'points_per_100', popis: 'Body za 100 {m}', min: 0, max: 100, vychozi: '10', napoveda: '0 = body za útratu nedávat.' },
      { klic: 'birthday_points', popis: 'Body k narozeninám', min: 0, max: 1000, vychozi: '50', napoveda: '0 = nedávat.' },
    ],
  },
  {
    nazev: 'Úrovně podle počtu návštěv',
    popis: 'U nás se úroveň počítá z počtu návštěv člena, ne z utracené částky.',
    pole: [
      { klic: 'silver_at', popis: 'Stříbrná od návštěv', min: 1, max: 500, vychozi: '10' },
      { klic: 'gold_at', popis: 'Zlatá od návštěv', min: 2, max: 1000, vychozi: '25' },
      { klic: 'platinum_at', popis: 'Platinová od návštěv', min: 0, max: 2000, vychozi: '50', napoveda: '0 = platinovou úroveň nepoužívat.' },
    ],
  },
  {
    nazev: 'Sleva podle úrovně',
    pole: [
      { klic: 'member_discount', popis: 'Sleva člena', min: 0, max: 90, vychozi: '0', jednotka: '%' },
      { klic: 'silver_discount', popis: 'Sleva stříbrné', min: 0, max: 90, vychozi: '3', jednotka: '%' },
      { klic: 'gold_discount', popis: 'Sleva zlaté', min: 0, max: 90, vychozi: '5', jednotka: '%' },
      { klic: 'platinum_discount', popis: 'Sleva platinové', min: 0, max: 90, vychozi: '10', jednotka: '%' },
    ],
  },
];

const VSECHNA_POLE: DefPole[] = SKUPINY.flatMap(s => s.pole.filter((p): p is DefPole => p !== 'rezim'));

interface Zapis { zapnuto: boolean; hodnota: string }
type Formular = Record<KlicPravidla, Zapis>;

const vychoziFormular = (): Formular => {
  const f = {} as Formular;
  for (const p of VSECHNA_POLE) f[p.klic] = { zapnuto: false, hodnota: p.vychozi };
  f.cashback_mode = { zapnuto: false, hodnota: 'credit' };
  return f;
};

/** Chyba pole, nebo null. Vyplněné, ale nezapnuté pole se nekontroluje. */
function chybaPole(f: Formular, p: DefPole): string | null {
  const z = f[p.klic];
  if (!z.zapnuto) return null;
  const t = z.hodnota.trim();
  if (!/^\d+$/.test(t)) return 'Zadejte celé číslo.';
  const n = Number(t);
  if (n < p.min || n > p.max) return `Povoleno ${p.min} až ${p.max}.`;
  if (p.klic === 'gold_at' && f.silver_at.zapnuto && /^\d+$/.test(f.silver_at.hodnota) && n <= Number(f.silver_at.hodnota)) return 'Zlatá musí být výš než stříbrná.';
  if (p.klic === 'platinum_at' && n > 0 && f.gold_at.zapnuto && /^\d+$/.test(f.gold_at.hodnota) && n <= Number(f.gold_at.hodnota)) return 'Platinová musí být výš než zlatá.';
  return null;
}

export interface StavPravidel {
  profil: StavNacteni<Record<string, unknown>>;
  formular: Formular;
  nastav: (klic: KlicPravidla, cast: Partial<Zapis>) => void;
  nacti: () => void;
  uloz: () => Promise<boolean>;
  uklada: boolean;
  chyba: string | null;
  ulozeno: boolean;
  vyplnitDoporucene: () => void;
}

/** Stav formuláře drží rodič, ať se po kroku Zpět a znovu dopředu nic neztratí. */
export function usePravidla(): StavPravidel {
  const [profil, setProfil] = useState<StavNacteni<Record<string, unknown>>>({ stav: 'nic' });
  const [formular, setFormular] = useState<Formular>(vychoziFormular);
  const [uklada, setUklada] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [ulozeno, setUlozeno] = useState(false);

  const nacti = useCallback(() => {
    setProfil({ stav: 'nacita' });
    j<{ profile?: Record<string, unknown> }>('/api/client/admin/profile')
      .then(d => setProfil({ stav: 'ok', data: d.profile ?? {} }))
      .catch(e => setProfil({ stav: 'chyba', zprava: zprava(e, 'Pravidla se nepodařilo načíst.'), status: e instanceof ChybaApi ? e.status : undefined }));
  }, []);

  const nastav = useCallback((klic: KlicPravidla, cast: Partial<Zapis>) => {
    setFormular(f => ({ ...f, [klic]: { ...f[klic], ...cast } }));
    setUlozeno(false);
    setChyba(null);
  }, []);

  const vyplnitDoporucene = useCallback(() => {
    setFormular(f => {
      const n = { ...f };
      for (const p of VSECHNA_POLE) n[p.klic] = { zapnuto: true, hodnota: p.vychozi };
      n.cashback_mode = { zapnuto: true, hodnota: 'credit' };
      return n;
    });
    setUlozeno(false);
  }, []);

  const uloz = useCallback(async (): Promise<boolean> => {
    const telo: Record<string, string | number> = {};
    for (const p of VSECHNA_POLE) {
      if (formular[p.klic].zapnuto) telo[p.klic] = Number(formular[p.klic].hodnota.trim());
    }
    if (formular.cashback_mode.zapnuto) telo.cashback_mode = formular.cashback_mode.hodnota === 'points' ? 'points' : 'credit';
    if (!Object.keys(telo).length) return false;
    setUklada(true);
    setChyba(null);
    try {
      // GET profilu už proběhl při otevření kroku; PUT pošle jen vyplněná pole a server zbytek profilu nechá.
      await j('/api/client/admin/profile', { method: 'PUT', body: JSON.stringify(telo) });
      setUlozeno(true);
      nacti();
      return true;
    } catch (e) {
      setChyba(zprava(e, 'Pravidla se nepodařilo uložit.'));
      return false;
    } finally {
      setUklada(false);
    }
  }, [formular, nacti]);

  return { profil, formular, nastav, nacti, uloz, uklada, chyba, ulozeno, vyplnitDoporucene };
}

export default function Pravidla({ s }: { s: StavPravidel }) {
  const symbol = useSymbol();
  const { profil, formular, nastav } = s;
  const zapnutych = Object.values(formular).filter(z => z.zapnuto).length;
  const maChybu = VSECHNA_POLE.some(p => chybaPole(formular, p));
  const aktualni = profil.stav === 'ok' ? profil.data : null;

  if (profil.stav === 'chyba') {
    return (
      <ErrorState
        title={profil.status === 403 ? 'K pravidlům věrnosti chybí oprávnění' : 'Pravidla se nepodařilo načíst'}
        hint={profil.status === 403 ? 'Tento krok můžete přeskočit a pravidla nastavit později v části Věrnost.' : profil.zprava}
        onRetry={profil.status === 403 ? undefined : s.nacti} />
    );
  }
  if (profil.stav === 'nacita' || profil.stav === 'nic') {
    return <div className="space-y-3" aria-busy><Skeleton className="h-16" /><Skeleton className="h-40" /></div>;
  }

  const nyni = (k: KlicPravidla): string | null => {
    const v = aktualni?.[k];
    if (v === undefined || v === null || v === '') return null;
    if (k === 'cashback_mode') return v === 'points' ? 'body' : 'kredit';
    return String(v);
  };

  return (
    <div className="space-y-6 min-w-0">
      <p className="text-sm text-black/65 text-pretty">
        Kartička pravidla věrnosti exportovat neumí, proto je tu opište ze svého starého nastavení. Zapněte jen to, co chcete změnit,
        ostatní zůstane, jak je. Celý krok je nepovinný a nezávisí na importu členů.
      </p>
      <div>
        <Button size="sm" variant="secondary" onClick={s.vyplnitDoporucene}>Zapnout vše s doporučenými hodnotami</Button>
      </div>

      {SKUPINY.map(sk => (
        <fieldset key={sk.nazev} className="min-w-0 space-y-3">
          <legend className="text-sm font-semibold text-[#16181A]">{sk.nazev}</legend>
          {sk.popis && <p className="text-xs text-black/55 -mt-1 text-pretty">{sk.popis}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            {sk.pole.map(p => {
              if (p === 'rezim') {
                const z = formular.cashback_mode;
                return (
                  <PoleRamec key="rezim" id="pravidlo-cashback_mode" popis="Cashback jako" zapnuto={z.zapnuto} onZapnuto={v => nastav('cashback_mode', { zapnuto: v })}
                    nyni={nyni('cashback_mode')} chyba={null}>
                    <Select className="min-h-11" id="pravidlo-cashback_mode" disabled={!z.zapnuto} value={z.hodnota} onChange={e => nastav('cashback_mode', { hodnota: e.target.value })}>
                      <option value="credit">Kredit (korun na účtě)</option>
                      <option value="points">Body</option>
                    </Select>
                  </PoleRamec>
                );
              }
              const z = formular[p.klic];
              const ch = chybaPole(formular, p);
              return (
                <PoleRamec key={p.klic} id={`pravidlo-${p.klic}`} popis={p.popis.replace('{m}', symbol)} zapnuto={z.zapnuto} onZapnuto={v => nastav(p.klic, { zapnuto: v })}
                  nyni={nyni(p.klic)} napoveda={p.napoveda} chyba={ch}>
                  <div className="flex items-center gap-2">
                    <Input className="min-h-11" id={`pravidlo-${p.klic}`} type="number" inputMode="numeric" min={p.min} max={p.max} disabled={!z.zapnuto}
                      value={z.hodnota} aria-invalid={ch ? true : undefined} onChange={e => nastav(p.klic, { hodnota: e.target.value })} />
                    {p.jednotka && <span className="text-sm text-black/50 shrink-0">{p.jednotka}</span>}
                  </div>
                </PoleRamec>
              );
            })}
          </div>
        </fieldset>
      ))}

      {s.chyba && <p role="alert" className="text-sm text-[var(--bad-ink)] text-pretty">{s.chyba}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" icon="check" loading={s.uklada} disabled={zapnutych === 0 || maChybu} onClick={() => { void s.uloz(); }}>
          Použít pravidla
        </Button>
        <p className="text-sm text-black/60" role="status" aria-live="polite">
          {s.ulozeno ? <span className="inline-flex items-center gap-1.5 text-[var(--ok-ink)]"><Icon name="check" size={14} /> Uloženo.</span>
            : zapnutych === 0 ? 'Zatím není zapnuté žádné políčko.' : `Zapnuto polí: ${zapnutych}`}
        </p>
      </div>
    </div>
  );
}

function PoleRamec({ id, popis, zapnuto, onZapnuto, nyni, napoveda, chyba, children }: {
  id: string; popis: string; zapnuto: boolean; onZapnuto: (v: boolean) => void; nyni: string | null; napoveda?: string; chyba: string | null; children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="!mb-0 truncate">{popis}</Label>
        <label className="inline-flex items-center gap-2 min-h-11 px-1 text-xs text-black/65 cursor-pointer shrink-0">
          <input type="checkbox" className="h-5 w-5 accent-[#16181A]" checked={zapnuto} onChange={e => onZapnuto(e.target.checked)}
            aria-label={`Nastavit: ${popis}`} />
          Nastavit
        </label>
      </div>
      {children}
      {chyba ? <p role="alert" className="mt-1.5 text-xs text-[var(--bad-ink)]">{chyba}</p>
        : (napoveda || nyni !== null) ? <p className="mt-1.5 text-xs text-black/50">{napoveda}{napoveda && nyni !== null ? ' ' : ''}{nyni !== null ? `Nyní: ${nyni}.` : ''}</p> : null}
    </div>
  );
}
