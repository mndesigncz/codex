'use client';

// Rozšířená pravidla bodů a úrovní (Věrnost → Body a úrovně).
//
// Co se tu nastavuje: zaokrouhlení bodů, minimální útrata, strop bodů na účtenku
// a za den, vyloučené položky a kategorie, část placená kreditem, násobič podle
// úrovně, snížení úrovně po neaktivitě a propadnutí kreditu.
//
// Změny se nejdřív ukládají jako koncept, který hosty nijak neovlivní. „Použít"
// ukáže, co se změní (před → po) a teprve potom pravidla platí; každé použití
// je verze s popiskem v historii změn. Náhled „kolik by host dostal z účtu"
// počítá stejná funkce jako server, takže nemůže lhát.
//
// Správcovská část: česky napevno (host sem nevidí).

import { useMemo, useRef, useState } from 'react';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Input, Modal, Segmented, Skeleton, SwitchRow, Well, useLoad } from '../../ui';
import { useMoney, useSymbol } from '../../CurrencyProvider';
import { useOpravneni } from '../../role/useOpravneni';
import { usePlan } from '../../Pro';
import { apiMessage, okJson } from '@/lib/api';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { czCount, type CzNoun } from '@/lib/czech';
import { obsahuje } from '@/lib/hledani';
import {
  ZAOKROUHLENI, KLICE_ROZSIRENE, MAX_NASOBIC_UROVNE, normalizujRozsirena, porovnejPravidla, pravidlaZProfilu, vypocitejOdmenu, shrnutiPravidel,
  type ZmenaPravidla,
} from '@/lib/bodyPravidla';

const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };
const ZMENA: CzNoun = { one: 'změna', few: 'změny', many: 'změn' };

interface Moznosti { kategorie: string[]; produkty: { id: string; name: string; kategorie: string | null }[] }
interface Verze { id: number; version: number; created_at: string; changed_by_name: string | null; source: string; note: string | null; changes: ZmenaPravidla[] }
interface Stav {
  platna: Record<string, any>; koncept: Record<string, any> | null; konceptZmeny: ZmenaPravidla[]; konceptOd: string | null;
  verze: number; verzeSeznam: Verze[]; moznosti: Moznosti;
}

interface Formular {
  points_round: string; points_min_spend: string; points_cap_bill: string; points_cap_day: string; points_excl_credit: boolean;
  loyalty_excl_products: string[]; loyalty_excl_categories: string[];
  mult_silver: string; mult_gold: string; mult_platinum: string; tier_inactive_days: string; credit_expire_days: string; welcome_points: string;
}

const text = (v: unknown) => (v == null ? '' : String(v));
const nasobicText = (v: unknown) => String(Number(v) || 1).replace('.', ',');

function seznam(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(x => String(x));
  if (typeof v === 'string') { try { const a = JSON.parse(v); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } }
  return [];
}

function zFormulare(src: Record<string, any>): Formular {
  return {
    points_round: text(src.points_round) || 'floor100',
    points_min_spend: text(src.points_min_spend ?? 0), points_cap_bill: text(src.points_cap_bill ?? 0), points_cap_day: text(src.points_cap_day ?? 0),
    points_excl_credit: src.points_excl_credit === true,
    loyalty_excl_products: seznam(src.loyalty_excl_products), loyalty_excl_categories: seznam(src.loyalty_excl_categories),
    mult_silver: nasobicText(src.mult_silver), mult_gold: nasobicText(src.mult_gold), mult_platinum: nasobicText(src.mult_platinum),
    tier_inactive_days: text(src.tier_inactive_days ?? 0), credit_expire_days: text(src.credit_expire_days ?? 0),
    welcome_points: text(src.welcome_points ?? 10),
  };
}

/** Upozornění na plán Max před uložením: dřív se o něm host správy dozvěděl až chybou po kliknutí. */
export function MaxPoznamka({ co = 'pravidel věrnosti' }: { co?: string }) {
  const { max, loaded } = usePlan();
  if (!loaded || max) return null;
  return (
    <p className="note note-wait" role="note">
      Změny {co} jsou součástí plánu Max (Managero client). Se současným plánem si je můžeš prohlédnout, ale uložit nejdou. Plán změníš v Nastavení → Předplatné.
    </p>
  );
}

/** Výběr z katalogu pokladny (produkty nebo kategorie) s hledáním; bez katalogu jde název napsat ručně. */
function Vyber({ id, label, hint, volby, hodnota, onChange, disabled, prazdne }: {
  id: string; label: string; hint: string; volby: { id: string; nazev: string; meta?: string }[]; hodnota: string[];
  onChange: (v: string[]) => void; disabled: boolean; prazdne: string;
}) {
  const [q, setQ] = useState('');
  const pole = useRef<HTMLInputElement>(null);
  const vybrane = new Set(hodnota.map(h => h.toLowerCase()));
  const nalezeno = q.trim() ? volby.filter(v => !vybrane.has(v.id.toLowerCase()) && (obsahuje(v.nazev, q) || obsahuje(v.meta ?? '', q))).slice(0, 6) : [];
  const nazev = (h: string) => volby.find(v => v.id.toLowerCase() === h.toLowerCase())?.nazev ?? h;
  const pridej = (idHodnoty: string) => {
    const h = idHodnoty.trim().slice(0, 100);
    if (!h || vybrane.has(h.toLowerCase())) { setQ(''); return; }
    onChange([...hodnota, h]); setQ('');
  };
  return (
    <div>
      <label htmlFor={id} className="field-label">{label}</label>
      {hodnota.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {hodnota.map(h => (
            <button key={h} type="button" disabled={disabled} aria-label={`Odebrat ${nazev(h)}`} onClick={() => onChange(hodnota.filter(x => x !== h))}
              className="filter-pill tap-target-sm seg-on inline-flex items-center gap-1.5 max-w-full">
              <span className="truncate">{nazev(h)}</span><span aria-hidden className="opacity-60">×</span>
            </button>
          ))}
        </div>
      )}
      <Input id={id} ref={pole} disabled={disabled} value={q} maxLength={100} autoComplete="off"
        placeholder={volby.length ? 'Hledej a potvrď Enterem…' : prazdne}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setQ(''); return; }
          if (e.key === 'Enter') { e.preventDefault(); if (nalezeno[0]) pridej(nalezeno[0].id); else if (!volby.length) pridej(q); }
        }} />
      {nalezeno.length > 0 && (
        <Well className="mt-1.5 !p-0 overflow-hidden">
          <ul className="list px-3">
            {nalezeno.map(v => (
              <li key={v.id}>
                <button type="button" className="w-full text-left py-2.5 min-h-[2.75rem] flex items-baseline justify-between gap-3" onClick={() => pridej(v.id)}>
                  <span className="text-sm font-medium truncate">{v.nazev}</span>
                  {v.meta && <span className="t-meta shrink-0">{v.meta}</span>}
                </button>
              </li>
            ))}
          </ul>
        </Well>
      )}
      <p className="t-meta mt-1.5">{hint}</p>
    </div>
  );
}

const UROVNE = [
  { id: 'bronze', label: 'Člen' }, { id: 'silver', label: 'Stříbrný' }, { id: 'gold', label: 'Zlatý' }, { id: 'platinum', label: 'Platinový' },
];
const AKCE = [{ id: '1', label: 'Bez akce' }, { id: '1.5', label: '1,5×' }, { id: '2', label: '2×' }, { id: '3', label: '3×' }];

const cisloZ = (v: string) => { const n = Number(String(v).trim().replace(',', '.')); return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0; };

export default function PokrocilaPravidla({ toast }: { toast: (m: string) => void }) {
  const meni = useOpravneni().ma('vernost.pravidla');
  const { max, loaded: planNacten } = usePlan();
  const symbol = useSymbol();
  const money = useMoney();
  const { data: stav, error, reload, set: setStav } = useLoad<Stav>('/api/client/admin/loyalty/pravidla');
  const { data: profil } = useLoad<any>('/api/client/admin/profile', raw => raw?.profile ?? null);
  const [f, setF] = useState<Formular | null>(null);
  const [zdroj, setZdroj] = useState<Stav | null>(null);
  const [bezi, setBezi] = useState('');
  const [potvrdit, setPotvrdit] = useState(false);
  const [potvrditZahozeni, setPotvrditZahozeni] = useState(false);
  const [chybaServeru, setChybaServeru] = useState('');
  const [poznamka, setPoznamka] = useState('');
  // Náhled: výchozí účet je záměrně „běžný", ať jsou hned vidět stropy a zaokrouhlení.
  const [nahled, setNahled] = useState({ castka: '450', kreditem: '0', vylouceno: '0', uroven: 'bronze', akce: '1' });

  // Formulář se naplní z konceptu, nebo z platných pravidel; znovu až po uložení nebo načtení nových dat.
  if (stav && stav !== zdroj) { setZdroj(stav); setF(zFormulare(stav.koncept ?? stav.platna)); }

  const platnaF = useMemo(() => (stav ? zFormulare(stav.platna) : null), [stav]);
  const overeni = useMemo(() => (f ? normalizujRozsirena(f) : null), [f]);
  const chybaFormulare = overeni && !overeni.ok ? overeni.error : '';
  const zmeny: ZmenaPravidla[] = useMemo(() => (stav && overeni?.ok ? porovnejPravidla(stav.platna, overeni.value, KLICE_ROZSIRENE) : []), [stav, overeni]);
  const rozdelane = !!stav && !!platnaF && !!f && JSON.stringify(f) !== JSON.stringify(zFormulare(stav.koncept ?? stav.platna));
  const smiUlozit = meni && (!planNacten || max);

  // Náhled: platná pravidla vedle konceptu, stejná funkce jako na serveru.
  const nahledVysledek = useMemo(() => {
    if (!stav || !profil) return null;
    const castka = cisloZ(nahled.castka);
    const vstup = { castka, zaplacenoKreditem: cisloZ(nahled.kreditem), vylouceno: cisloZ(nahled.vylouceno), uroven: nahled.uroven, bonusNasobic: Number(nahled.akce) || 1, bonusNazev: 'akce' };
    const platne = vypocitejOdmenu(vstup, pravidlaZProfilu({ ...profil, ...stav.platna }));
    const novy = overeni?.ok ? vypocitejOdmenu(vstup, pravidlaZProfilu({ ...profil, ...overeni.value })) : null;
    return { platne, novy, cashbackMode: profil.cashback_mode === 'points' ? 'points' : 'credit' };
  }, [stav, profil, nahled, overeni]);

  if (error) return <ErrorState title="Pravidla připisování se nenačetla" onRetry={reload} detail={error} />;
  if (!stav || !f || !platnaF) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-56" /></div>;

  const set = (patch: Partial<Formular>) => { setF({ ...f, ...patch }); setChybaServeru(''); };
  const zavolej = async (body: Record<string, unknown>): Promise<boolean> => {
    setChybaServeru('');
    try {
      const d = await fetch('/api/client/admin/loyalty/pravidla', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(okJson);
      const novy: Stav = { platna: d.platna, koncept: d.koncept, konceptZmeny: d.konceptZmeny, konceptOd: d.konceptOd, verze: d.verze, verzeSeznam: d.verzeSeznam, moznosti: d.moznosti };
      setStav(novy);
      return true;
    } catch (e) {
      const m = apiMessage(e, 'Pravidla se nepodařilo uložit.');
      setChybaServeru(m); toast(m);
      return false;
    }
  };
  const ulozKoncept = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!smiUlozit || chybaFormulare) return;
    setBezi('koncept');
    if (await zavolej({ action: 'save', ...f })) toast('Koncept uložen. Hostů se zatím nijak netýká.');
    setBezi('');
  };
  const pouzij = async () => {
    setBezi('pouzit');
    const ok = await zavolej({ action: 'publish', ...f, note: poznamka });
    setBezi('');
    if (ok) { setPotvrdit(false); setPoznamka(''); toast('Pravidla platí. Použijí se u dalšího připsání.'); }
  };
  const zahod = async () => {
    setBezi('zahodit');
    if (await zavolej({ action: 'discard' })) toast('Koncept zahozen.');
    setBezi('');
  };
  const obnov = async (v: Verze) => {
    setBezi(`verze:${v.id}`);
    if (await zavolej({ action: 'restore', versionId: v.id })) toast(`Verze ${v.version} je v konceptu. Zkontroluj a použij.`);
    setBezi('');
  };

  const volbyProdukty = stav.moznosti.produkty.map(p => ({ id: p.id, nazev: p.name, meta: p.kategorie ?? undefined }));
  const volbyKategorie = stav.moznosti.kategorie.map(k => ({ id: k, nazev: k }));
  const zaokr = ZAOKROUHLENI.find(z => z.id === f.points_round);
  const zadaneShrnuti = overeni?.ok ? shrnutiPravidel(pravidlaZProfilu({ ...(profil ?? {}), ...overeni.value }), symbol) : [];
  const cashbackBody = nahledVysledek?.cashbackMode === 'points';
  const vetaVysledku = (v: ReturnType<typeof vypocitejOdmenu>) => [
    `${czCount(v.body, BOD)}`,
    v.cashback > 0 ? (cashbackBody ? `+ ${czCount(v.cashback, BOD)} cashback` : `+ ${money(v.cashback)} kreditu`) : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="space-y-4 max-w-3xl">
      <MaxPoznamka />
      {!meni && <p className="note note-wait">Rozšířená pravidla tu jen vidíš. Měnit je může, kdo má na starosti věrnostní program.</p>}
      {stav.koncept && (
        <div className="note note-wait flex items-center justify-between gap-3 flex-wrap" role="status">
          <p className="text-[15px] font-semibold">
            Máš rozpracovaný koncept{stav.konceptOd ? ` z ${dbTimeDayHM(stav.konceptOd)}` : ''}: {stav.konceptZmeny.length ? czCount(stav.konceptZmeny.length, ZMENA) : 'beze změn'}. Pro hosty zatím platí původní pravidla.
          </p>
          {meni && <Button size="sm" variant="secondary" loading={bezi === 'zahodit'} onClick={() => setPotvrditZahozeni(true)}>Zahodit koncept</Button>}
        </div>
      )}

      <form onSubmit={ulozKoncept} className="space-y-4" aria-label="Rozšířená pravidla bodů">
        <Card className="space-y-4" aria-labelledby="pr-zaklad">
          <div>
            <h2 id="pr-zaklad" className="t-card">Z jaké částky se body počítají</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">Platí pro účtenky z pokladny, částky zadané u kasy a objednávky od stolu. Pořadí: účet bez vyloučeného, minimální útrata, zaokrouhlení, násobič, stropy.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field id="pr-min" label={`Minimální útrata (${symbol})`} hint="Pod touto částkou host nedostane body ani cashback. 0 = bez minima.">
              <Input id="pr-min" type="number" inputMode="numeric" min={0} max={100000} disabled={!meni} className="!w-32" value={f.points_min_spend} onChange={e => set({ points_min_spend: e.target.value })} />
            </Field>
            <Field id="pr-cap-bill" label="Nejvíc bodů z účtenky" hint="Víc bodů z jednoho účtu host nedostane. 0 = bez stropu.">
              <Input id="pr-cap-bill" type="number" inputMode="numeric" min={0} max={1000000} disabled={!meni} className="!w-32" value={f.points_cap_bill} onChange={e => set({ points_cap_bill: e.target.value })} />
            </Field>
            <Field id="pr-cap-day" label="Nejvíc bodů za den" hint="Za jeden pražský den na hosta. 0 = bez stropu.">
              <Input id="pr-cap-day" type="number" inputMode="numeric" min={0} max={1000000} disabled={!meni} className="!w-32" value={f.points_cap_day} onChange={e => set({ points_cap_day: e.target.value })} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field id="pr-welcome" label="Uvítací body novému členovi" hint="Dostane je hned po vstupu. 0 = nedávat. Dřív to bylo vždy 10.">
              <Input id="pr-welcome" type="number" inputMode="numeric" min={0} max={1000} disabled={!meni} className="!w-32" value={f.welcome_points} onChange={e => set({ welcome_points: e.target.value })} />
            </Field>
          </div>
          <ul className="list">
            <SwitchRow title="Nezapočítat část zaplacenou kreditem nebo poukazem"
              hint="Kredit a poukaz už jsou odměna nebo předplacené peníze. Z této části účtu body ani cashback nevznikají. Platí jen pro účtenky z pokladny."
              checked={f.points_excl_credit} onChange={v => { if (meni) set({ points_excl_credit: v }); }} disabled={!meni} />
          </ul>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Vyber id="pr-kat" label="Vyloučené kategorie" hint="Za tyto kategorie z pokladny body nevznikají. Platí pro účtenky a objednávky, ne pro částku zadanou ručně."
              volby={volbyKategorie} hodnota={f.loyalty_excl_categories} onChange={v => set({ loyalty_excl_categories: v })} disabled={!meni}
              prazdne="Katalog pokladny je prázdný. Napiš název kategorie a potvrď Enterem." />
            <Vyber id="pr-prod" label="Vyloučené položky" hint="Třeba dárkové poukazy nebo záloha na obal."
              volby={volbyProdukty} hodnota={f.loyalty_excl_products} onChange={v => set({ loyalty_excl_products: v })} disabled={!meni}
              prazdne="Katalog pokladny je prázdný. Připoj pokladnu a načti nabídku." />
          </div>
        </Card>

        <Card className="space-y-4" aria-labelledby="pr-zaokr">
          <div>
            <h2 id="pr-zaokr" className="t-card">Zaokrouhlení bodů</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">Jak se z útraty počítají body, když nevychází na celé stovky.</p>
          </div>
          <Segmented options={ZAOKROUHLENI.map(z => ({ id: z.id, label: z.label }))} value={f.points_round} onChange={v => { if (meni) set({ points_round: v }); }} size="sm" ariaLabel="Zaokrouhlení bodů" />
          <p className="t-meta" aria-live="polite">{zaokr?.hint}</p>
        </Card>

        <Card className="space-y-4" aria-labelledby="pr-nasobic">
          <div>
            <h2 id="pr-nasobic" className="t-card">Násobič podle úrovně</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">Vyšší úroveň sbírá body rychleji. Když zároveň běží bonusová akce (Happy hour), platí vyšší z obou, nikdy součin. Člen má vždy 1×. Vyšší úroveň má vždy aspoň násobič té nižší.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[['mult_silver', 'Stříbrný host'], ['mult_gold', 'Zlatý host'], ['mult_platinum', 'Platinový host']].map(([k, n]) => (
              <Field key={k} id={`pr-${k}`} label={n} hint={`1 až ${MAX_NASOBIC_UROVNE}, třeba 1,5`}>
                <Input id={`pr-${k}`} type="text" inputMode="decimal" disabled={!meni} className="!w-28 text-center" value={(f as any)[k]} onChange={e => set({ [k]: e.target.value } as Partial<Formular>)} />
              </Field>
            ))}
          </div>
        </Card>

        <Card className="space-y-4" aria-labelledby="pr-platnost">
          <div>
            <h2 id="pr-platnost" className="t-card">Platnost úrovně a kreditu</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">Úroveň klesne o stupeň za každých N dní bez návštěvy, nasbíraná útrata ani návštěvy se nemažou. Host dostane oznámení o postupu i o snížení. Kredit propadá od nejstaršího, týden předem přijde upozornění. Zapnutí nic nesmaže zpětně: stáří kreditu se počítá od dne zapnutí.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="pr-neaktivita" label="Snížit úroveň po (dnech bez návštěvy)" hint="0 = úroveň platí natrvalo. Jinak nejméně 7.">
              <Input id="pr-neaktivita" type="number" inputMode="numeric" min={0} max={3650} disabled={!meni} className="!w-32" value={f.tier_inactive_days} onChange={e => set({ tier_inactive_days: e.target.value })} />
            </Field>
            <Field id="pr-kredit" label="Kredit propadne po (dnech)" hint="0 = kredit nepropadá. Jinak nejméně 7.">
              <Input id="pr-kredit" type="number" inputMode="numeric" min={0} max={3650} disabled={!meni} className="!w-32" value={f.credit_expire_days} onChange={e => set({ credit_expire_days: e.target.value })} />
            </Field>
          </div>
        </Card>

        {zadaneShrnuti.length > 0 && (
          <Well aria-label="Shrnutí pravidel"><ul className="space-y-1">{zadaneShrnuti.map(s => <li key={s} className="t-meta">{s}</li>)}</ul></Well>
        )}
        {(chybaFormulare || chybaServeru) && <p role="alert" className="note note-bad">{chybaFormulare || chybaServeru}</p>}
        {meni && (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {rozdelane && <Chip tone="wait" size="sm">Neuložené změny</Chip>}
            <Button type="submit" variant="secondary" loading={bezi === 'koncept'} disabled={!smiUlozit || !!chybaFormulare || !rozdelane}>Uložit koncept</Button>
            <Button type="button" variant="primary" disabled={!smiUlozit || !!chybaFormulare || (zmeny.length === 0 && !stav.koncept)} onClick={() => setPotvrdit(true)}>Použít pravidla…</Button>
          </div>
        )}
      </form>

      <Card className="space-y-4" aria-labelledby="pr-nahled">
        <div>
          <h2 id="pr-nahled" className="t-card">Náhled: kolik by host dostal z účtu</h2>
          <p className="t-meta mt-0.5 max-w-[70ch]">Zadej účet a uvidíš, co dostane podle platných pravidel a podle konceptu. Počítá stejně jako pokladna u kasy.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field id="nh-castka" label={`Částka účtu (${symbol})`}>
            <Input id="nh-castka" type="number" inputMode="numeric" min={0} max={1000000} className="!w-32" value={nahled.castka} onChange={e => setNahled({ ...nahled, castka: e.target.value })} />
          </Field>
          <Field id="nh-kredit" label={`Z toho kreditem nebo poukazem (${symbol})`}>
            <Input id="nh-kredit" type="number" inputMode="numeric" min={0} max={1000000} className="!w-32" value={nahled.kreditem} onChange={e => setNahled({ ...nahled, kreditem: e.target.value })} />
          </Field>
          <Field id="nh-vyl" label={`Z toho vyloučené položky (${symbol})`}>
            <Input id="nh-vyl" type="number" inputMode="numeric" min={0} max={1000000} className="!w-32" value={nahled.vylouceno} onChange={e => setNahled({ ...nahled, vylouceno: e.target.value })} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div><p className="field-label">Úroveň hosta</p><Segmented options={UROVNE} value={nahled.uroven} onChange={v => setNahled({ ...nahled, uroven: v })} size="sm" ariaLabel="Úroveň hosta v náhledu" /></div>
          <div><p className="field-label">Bonusová akce</p><Segmented options={AKCE} value={nahled.akce} onChange={v => setNahled({ ...nahled, akce: v })} size="sm" ariaLabel="Bonusová akce v náhledu" /></div>
        </div>
        {!nahledVysledek ? <Skeleton className="h-16" /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" aria-live="polite">
            {[{ nadpis: 'Platná pravidla', v: nahledVysledek.platne }, ...(nahledVysledek.novy && (zmeny.length > 0 || stav.koncept) ? [{ nadpis: 'Koncept', v: nahledVysledek.novy }] : [])].map(x => (
              <Well key={x.nadpis} className="space-y-1">
                <p className="t-label">{x.nadpis}</p>
                <p className="text-lg font-bold tabular-nums">{vetaVysledku(x.v)}</p>
                <p className="t-meta">Počítá se z {money(x.v.zaklad)}{x.v.poznamky.length ? ` (${x.v.poznamky.join(', ')})` : ''}.</p>
                {x.v.bodyBezStropu > 0 && <p className="t-meta">Bez stropu by to bylo {czCount(x.v.bodyBezStropu, BOD)}.</p>}
              </Well>
            ))}
          </div>
        )}
      </Card>

      <Card pad="none" aria-labelledby="pr-verze">
        <div className="px-5 pt-4">
          <h2 id="pr-verze" className="t-card">Verze pravidel</h2>
          <p className="t-meta mt-0.5 max-w-[70ch]">Každá změna pravidel věrnosti, i ta z formuláře Body a úrovně, tu má svou verzi s rozdílem před a po. Starší verzi můžeš načíst do konceptu a použít znovu.</p>
        </div>
        {stav.verzeSeznam.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState icon="clock" compact title="Zatím žádná změna" hint="Jakmile změníš pravidla, objeví se tu, kdo a co změnil." /></div>
        ) : (
          <ul className="list px-5">
            {stav.verzeSeznam.map(v => {
              const maRozsirena = v.changes.some(c => (KLICE_ROZSIRENE as readonly string[]).includes(c.key));
              return (
                <li key={v.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">Verze {v.version} <span className="t-meta font-normal">· {dbTimeDayHM(v.created_at)}{v.changed_by_name ? ` · ${v.changed_by_name}` : ''}</span></p>
                      {v.note && <p className="t-meta mt-0.5 text-pretty">{v.note}</p>}
                      <ul className="mt-1 space-y-0.5">
                        {v.changes.slice(0, 8).map(c => <li key={c.key} className="text-[13px] text-black/70 text-pretty">{c.label}: {c.before} → <strong className="font-semibold">{c.after}</strong></li>)}
                        {v.changes.length > 8 && <li className="t-meta">a {czCount(v.changes.length - 8, ZMENA)} dalších</li>}
                      </ul>
                    </div>
                    {meni && maRozsirena && <Button size="sm" variant="ghost" loading={bezi === `verze:${v.id}`} onClick={() => { void obnov(v); }}>Načíst do konceptu</Button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {potvrditZahozeni && (
        <Modal open onClose={() => setPotvrditZahozeni(false)} size="sm" title="Zahodit koncept?"
          footer={<>
            <Button variant="secondary" onClick={() => setPotvrditZahozeni(false)}>Ponechat</Button>
            <Button variant="danger-solid" onClick={() => { setPotvrditZahozeni(false); void zahod(); }}>Zahodit</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">Rozpracované změny pravidel zmizí a formulář se vrátí k pravidlům, která platí pro hosty. Vzít to zpět nejde.</p>
        </Modal>
      )}
      {potvrdit && (
        <Modal open onClose={() => setPotvrdit(false)} size="md" title="Použít pravidla?"
          footer={<>
            <Button variant="secondary" onClick={() => setPotvrdit(false)}>Zpět</Button>
            <Button variant="primary" loading={bezi === 'pouzit'} disabled={zmeny.length === 0} onClick={() => { void pouzij(); }}>Použít</Button>
          </>}>
          <div className="space-y-3">
            <p className="text-sm text-black/70 text-pretty">Nová pravidla platí hned pro další připsání. Už připsané body a kredit se nepřepočítávají.</p>
            {zmeny.length === 0 ? <p className="t-meta">Beze změn proti platným pravidlům.</p> : (
              <ul className="space-y-1">{zmeny.map(z => <li key={z.key} className="text-sm text-pretty">{z.label}: {z.before} → <strong>{z.after}</strong></li>)}</ul>
            )}
            <Field id="pr-poznamka" label="Poznámka k verzi" hint="Nepovinné. Uvidíš ji v seznamu verzí.">
              <Input id="pr-poznamka" maxLength={200} value={poznamka} onChange={e => setPoznamka(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && zmeny.length) { e.preventDefault(); void pouzij(); } }} />
            </Field>
            {chybaServeru && <p role="alert" className="note note-bad">{chybaServeru}</p>}
          </div>
        </Modal>
      )}
    </div>
  );
}
