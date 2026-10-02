'use client';

// Krok 4 (nepovinný): převzít pravidla věrnosti. Kartička pravidla exportovat neumí, takže si je správce
// přepíše sám. Formulář je předvyplněný ze současného profilu podniku; uloží se jedním PUT na
// /api/client/admin/profile a jen se změněnými poli (route zbytek profilu nechá). Pod formulářem je
// seznam toho, co se musí přenést ručně, s odkazy na příslušné části administrace.

import { useCallback, useRef, useState } from 'react';
import { Button, ErrorState, Field, Input, Skeleton } from '../../ui';
import { Icon } from '../../Icons';
import { useSymbol } from '../../CurrencyProvider';
import { useOpravneni } from '../../role/useOpravneni';
import {
  chybaPravidla, formularZProfilu, maChybuPravidel, MAX_ODMENA, POLE_PRAVIDEL, RUCNI_PRENOS, telaZmen,
  type FormularPravidel, type KlicPravidla,
} from '@/lib/importKartickaPravidla';
import { ChybaApi, j, zprava, type StavNacteni } from './typy';

export interface StavPravidel {
  profil: StavNacteni<Record<string, unknown>>;
  /** null, dokud se profil nenačetl a formulář nemá co předvyplnit. */
  formular: FormularPravidel | null;
  nastav: (klic: KlicPravidla, hodnota: string) => void;
  nacti: () => void;
  uloz: () => Promise<boolean>;
  uklada: boolean;
  chyba: string | null;
  ulozeno: boolean;
}

const NAPOVEDA: Partial<Record<KlicPravidla, string>> = {
  stamp_target: '0 = jednoduchou razítkovou kartu nepoužívat.',
  points_per_100: '0 = body za útratu nedávat.',
  cashback_pct: 'Kolik procent z útraty se hostovi vrací.',
  birthday_points: 'Dárek v den narozenin. 0 = nedávat.',
  referral_points: 'Dostanou je oba, když kamarád poprvé přijde. 0 = vypnuto.',
};

/** Stav formuláře drží rodič, ať se po kroku Zpět a znovu dopředu nic neztratí. */
export function usePravidla(): StavPravidel {
  const [profil, setProfil] = useState<StavNacteni<Record<string, unknown>>>({ stav: 'nic' });
  const [formular, setFormular] = useState<FormularPravidel | null>(null);
  const [uklada, setUklada] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [ulozeno, setUlozeno] = useState(false);
  // Předvyplnění jen poprvé: nové načtení po uložení nesmí přepsat, co člověk zrovna píše.
  const predvyplneno = useRef(false);

  const nacti = useCallback(() => {
    setProfil({ stav: 'nacita' });
    j<{ profile?: Record<string, unknown> }>('/api/client/admin/profile')
      .then(d => {
        const p = d.profile ?? {};
        setProfil({ stav: 'ok', data: p });
        if (!predvyplneno.current) { predvyplneno.current = true; setFormular(formularZProfilu(p)); }
      })
      .catch(e => setProfil({ stav: 'chyba', zprava: zprava(e, 'Pravidla se nepodařilo načíst.'), status: e instanceof ChybaApi ? e.status : undefined }));
  }, []);

  const nastav = useCallback((klic: KlicPravidla, hodnota: string) => {
    setFormular(f => (f ? { ...f, [klic]: hodnota } : f));
    setUlozeno(false);
    setChyba(null);
  }, []);

  const uloz = useCallback(async (): Promise<boolean> => {
    if (!formular || profil.stav !== 'ok') return false;
    const telo = telaZmen(formular, profil.data);
    if (!Object.keys(telo).length) return false;
    setUklada(true);
    setChyba(null);
    try {
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
  }, [formular, profil, nacti]);

  return { profil, formular, nastav, nacti, uloz, uklada, chyba, ulozeno };
}

export default function Pravidla({ s, onPrejdi }: {
  s: StavPravidel;
  /** Zavře průvodce a otevře danou část administrace (pohled např. `klient:loyalty`, cast = záložka Věrnosti). */
  onPrejdi: (pohled: string, cast?: string) => void;
}) {
  const symbol = useSymbol();
  const { ma } = useOpravneni();
  const { profil, formular } = s;

  if (profil.stav === 'chyba') {
    return (
      <ErrorState
        title={profil.status === 403 ? 'K pravidlům věrnosti chybí oprávnění' : 'Pravidla se nepodařilo načíst'}
        hint={profil.status === 403 ? 'Tento krok můžeš přeskočit a pravidla nastavit později v části Věrnost.' : profil.zprava}
        onRetry={profil.status === 403 ? undefined : s.nacti} />
    );
  }
  if (profil.stav !== 'ok' || !formular) {
    return <div className="space-y-3" aria-busy><Skeleton className="h-16" /><Skeleton className="h-40" /></div>;
  }

  const telo = telaZmen(formular, profil.data);
  const zmen = Object.keys(telo).length;
  const maChybu = maChybuPravidel(formular);
  const razitkaZapnuta = /^\d+$/.test(formular.stamp_target.trim()) && Number(formular.stamp_target.trim()) > 0;

  return (
    <div className="space-y-6 min-w-0">
      <p className="text-sm text-black/65 text-pretty">
        Kartička pravidla věrnosti exportovat neumí. Otevři její nastavení a přepiš sem čísla. Předvyplnili jsme to, co teď platí
        u tebe v Manageru. Krok je nepovinný a nezávisí na importu členů.
      </p>

      <fieldset className="min-w-0 space-y-3">
        <legend className="text-sm font-semibold text-[#16181A]">Razítková karta</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {POLE_PRAVIDEL.filter(p => p.klic === 'stamp_target' || p.klic === 'stamp_reward').map(p => {
            const ch = chybaPravidla(formular, p);
            const text = p.klic === 'stamp_reward';
            return (
              <Field key={p.klic} id={`pravidlo-${p.klic}`} label={p.popis} hint={NAPOVEDA[p.klic]} error={ch}>
                <Input className="min-h-11" id={`pravidlo-${p.klic}`}
                  {...(text ? { type: 'text', maxLength: MAX_ODMENA, disabled: !razitkaZapnuta } : { type: 'number', inputMode: 'numeric' as const, min: p.min, max: p.max })}
                  value={formular[p.klic]} aria-invalid={ch ? true : undefined}
                  onChange={e => s.nastav(p.klic, e.target.value)} />
              </Field>
            );
          })}
        </div>
        <p className="text-xs text-black/55 text-pretty">
          Je to jednoduchá karta za návštěvu. Když máš v části Razítka vlastní kampaň za návštěvu, odměnu řídí ta kampaň.
        </p>
      </fieldset>

      <fieldset className="min-w-0 space-y-3">
        <legend className="text-sm font-semibold text-[#16181A]">Body a cashback</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {POLE_PRAVIDEL.filter(p => p.klic !== 'stamp_target' && p.klic !== 'stamp_reward').map(p => {
            const ch = chybaPravidla(formular, p);
            return (
              <Field key={p.klic} id={`pravidlo-${p.klic}`} label={p.popis.replace('{m}', symbol)} hint={NAPOVEDA[p.klic]} error={ch}>
                <div className="flex items-center gap-2">
                  <Input className="min-h-11" id={`pravidlo-${p.klic}`} type="number" inputMode="numeric" min={p.min} max={p.max}
                    value={formular[p.klic]} aria-invalid={ch ? true : undefined} onChange={e => s.nastav(p.klic, e.target.value)} />
                  {p.klic === 'cashback_pct' && <span className="text-sm text-black/50 shrink-0">%</span>}
                </div>
              </Field>
            );
          })}
        </div>
      </fieldset>

      {s.chyba && <p role="alert" className="text-sm text-[var(--bad-ink)] text-pretty">{s.chyba}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" icon="check" loading={s.uklada} disabled={zmen === 0 || maChybu} onClick={() => { void s.uloz(); }}>
          Uložit pravidla
        </Button>
        <p className="text-sm text-black/60" role="status" aria-live="polite">
          {s.ulozeno ? <span className="inline-flex items-center gap-1.5 text-[var(--ok-ink)]"><Icon name="check" size={14} /> Uloženo.</span>
            : zmen === 0 ? 'Zatím jsi nic nezměnil.' : `Změněných polí: ${zmen}`}
        </p>
      </div>

      <section className="well p-4 space-y-3" aria-labelledby="ruce-nadpis">
        <div>
          <h4 id="ruce-nadpis" className="text-sm font-semibold text-[#16181A]">Co přenést ručně</h4>
          <p className="mt-1 text-xs text-black/55 text-pretty">
            Import přenáší členy s body, kreditem, razítky a návštěvami. Tohle si z Kartičky přepiš v administraci sám.
            Okno se zavře a otevře se příslušná část.
          </p>
        </div>
        <ul className="space-y-1">
          {RUCNI_PRENOS.map(r => {
            const smi = ma(r.klice);
            return (
              <li key={r.id} className="text-sm min-w-0">
                {smi ? (
                  <button type="button" onClick={() => onPrejdi(r.pohled, r.cast)}
                    className="tap-target-sm w-full text-left flex items-start gap-2 rounded-xl py-1.5 hover:bg-black/[0.04] focus-visible:outline-2">
                    <Icon name="chevronRight" size={15} className="shrink-0 mt-1 text-black/40" />
                    <span className="min-w-0 text-pretty"><span className="font-medium text-[#16181A] underline underline-offset-2">{r.nazev}</span> <span className="text-black/55">{r.popis}</span></span>
                  </button>
                ) : (
                  <p className="flex items-start gap-2 py-1.5 text-black/55">
                    <Icon name="chevronRight" size={15} className="shrink-0 mt-1 text-black/25" />
                    <span className="min-w-0 text-pretty"><span className="font-medium">{r.nazev}</span> {r.popis} Na tohle nemáš oprávnění.</span>
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
