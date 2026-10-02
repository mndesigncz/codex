'use client';

// Věrnostní program rozdělený jako v Kartičce: co dává body, jak se sbírají
// razítka, co se dá za body pořídit, jaké slevy plynou z úrovně, a promo
// kódy na letáky. Každá část zvlášť, ať se v tom vedení vyzná.
//
// Kolo 69 (balík B8): stránka Věrnost je plocha s widgety (PlochaWidgetu,
// stránka vedeni.klient_vernost); přepínač částí je v `aside` hlavičky a tahle
// komponenta kreslí nástroj. Z auditu „Klient – Věrnost":
//  - „Body a úrovně" měly tři limetková „Uložit" pod sebou a první dvě ukládala
//    totéž — teď jeden formulář a jedno „Uložit" v hlavičce;
//  - třetí kopie StatCard (bílé dlaždice, v přehledu šedé) → StatRow v kartě,
//    vlastní sloupky Spark → sdílený BarSpark, „Za posledních 30 dní" je widget;
//  - nativní zaškrtávátka → Switch, lokální `Chip` (stejné jméno jako Chip z ui,
//    vybraný stav tmavý s limetkovým textem) → filter-pill seg-on/seg-off,
//    ruční pilulky Běží/Aktivní → Switch v řádku, „Smazat" → okno s potvrzením,
//    „Zpět" jako tlačítko, hlavní akce vpravo, měna z CurrencyProvider;
//  - razítková kartička v seznamu už nekreslí tři natvrdo vybarvená razítka,
//    která vypadala jako skutečný průběh.
// Oprávnění: pravidla a úrovně mění jen vernost.pravidla, kartičky
// vernost.kampane, kupony kupony.spravovat, uplatnit kód kupony.uplatnit,
// skupiny hostů zakaznici.skupiny, dárkové poukazy poukazy.* (komponenta Poukazy).

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarSpark, Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Menu, Modal, Segmented, Skeleton, Stat, StatRow, Switch, SwitchRow, Well,
} from '../ui';
import { Icon } from '../Icons';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { czDay } from '@/lib/clientSlots';
import { czCount, type CzNoun } from '@/lib/czech';
import { useResultKeys } from '@/lib/useResultKeys';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { apiMessage, okJson } from '@/lib/api';
import { obsahuje } from '@/lib/hledani';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useOpravneni } from '../role/useOpravneni';
import Poukazy from './Poukazy';
import OdkazCtecka from './OdkazCtecka';
import PrechodZKarticky, { useImportKarticky } from './PrechodZKarticky';
import { RAZITKA_DEFAULTY, razitkaZRadku, RazitkaDalsiNastaveni, RazitkaNahled } from './loyalty/RazitkaNastaveni';
import { podleFiltru, RazitkaFiltr, StavChip, useRazitkaAkce, type FiltrStavu } from './loyalty/RazitkaAkce';
import { overKampan } from '@/lib/stampsPlan';

// Věrnost měla šest podzáložek pod deseti hlavními — šestnáct sourozenců
// nad sebou. „Body" a „Slevy a úrovně" jsou jedna věc (co host nasbírá a co
// za to má) a „Kupony" s „Promo kódy" taky (co host uplatní).
export type LoyaltySub = 'overview' | 'points' | 'bonus' | 'stamps' | 'coupons' | 'vouchers';
export const LOYALTY_SUBS: { id: LoyaltySub; label: string }[] = [
  { id: 'overview', label: 'Přehled' },
  { id: 'points', label: 'Body a úrovně' },
  { id: 'bonus', label: 'Akce a bonusy' },
  { id: 'stamps', label: 'Razítka' },
  { id: 'coupons', label: 'Kupony a kódy' },
  { id: 'vouchers', label: 'Poukazy' },
];
const KLIC_CASTI: Record<LoyaltySub, readonly string[]> = {
  overview: ['vernost.zobrazit'],
  points: ['vernost.zobrazit'],
  bonus: ['vernost.zobrazit'],
  stamps: ['vernost.zobrazit'],
  coupons: ['kupony.spravovat', 'kupony.uplatnit'],
  vouchers: ['poukazy.zobrazit', 'poukazy.uplatnit'],
};
const FORM_BODY = 'vernost-body';

const RAZITKO: CzNoun = { one: 'razítko', few: 'razítka', many: 'razítek' };
const HOST: CzNoun = { one: 'host', few: 'hosté', many: 'hostů' };
const DEN: CzNoun = { one: 'den', few: 'dny', many: 'dní' };
const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };

async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, init ? { headers: { 'Content-Type': 'application/json' }, ...init } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Nepovedlo se.');
  return d;
}

/** Společný háček na profil: pravidla věrnosti se nastavují na víc místech. */
function useProfile() {
  const [p, setP] = useState<any | null>(null);
  // Bez `error` tu mlčky selhalo načtení profilu a celá Věrnost zůstala
  // viset na kostře — obrazovka, která se nikdy nedonačte, vypadá hůř než
  // obrazovka, která přizná chybu.
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    return fetch('/api/client/admin/profile')
      .then(r => { if (!r.ok) throw new Error(`Server odpověděl ${r.status}`); return r.json(); })
      .then(d => { if (!d?.profile) throw new Error('Profil podniku se nepodařilo přečíst'); setP(d.profile); })
      .catch((e: any) => setError(e?.message || 'Načtení se nepovedlo'));
  }, []);
  useEffect(() => { load(); }, [load]);
  return { p, setP, reload: load, error };
}

function Kostra() { return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-48" /></div>; }

/** Potvrzení smazání v okně (dřív confirm()). */
function Smazat({ title, text, onPotvrdit, onZavrit }: { title: string; text: string; onPotvrdit: () => void; onZavrit: () => void }) {
  return (
    <Modal open onClose={onZavrit} size="sm" title={title}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button variant="danger-solid" onClick={() => { onZavrit(); onPotvrdit(); }}>Smazat</Button>
      </>}>
      <p className="text-sm text-black/70 text-pretty">{text}</p>
    </Modal>
  );
}

// ---- Přehled --------------------------------------------------------------------

function Overview({ toast, oznam }: { toast: (m: string) => void; oznam: (text: string, ton?: 'ok' | 'bad') => void }) {
  const { ma: smi } = useOpravneni();
  const money = useMoney();
  const symbol = useSymbol();
  const [d, setD] = useState<any | null>(null);
  const { p, setP, reload: reloadProfile, error: profileError } = useProfile();
  const [busy, setBusy] = useState(false);
  const nacti = useCallback(() => { fetch('/api/client/admin/loyalty').then(okJson).then(setD).catch(() => setD({ summary: null, recent: [], series: [] })); }, []);
  useEffect(() => { nacti(); }, [nacti]);
  // Přechod z Kartičky: výrazná karta pro podnik bez členů nebo s hrstkou, jinak decentní řádek.
  const imp = useImportKarticky(oznam, nacti);
  const zapnout = async () => {
    setBusy(true);
    try { const r = await j('/api/client/admin/profile', { method: 'PUT', body: JSON.stringify({ loyalty_on: true }) }); setP(r.profile); toast('Věrnost je zapnutá. Hosté začnou sbírat body.'); }
    catch (e) { toast(apiMessage(e, 'Věrnost se nepodařilo zapnout.')); }
    setBusy(false);
  };
  if (profileError) return <ErrorState title="Věrnost se nenačetla" onRetry={reloadProfile} detail={profileError} />;
  if (!d || !p) return <Kostra />;
  const s = d.summary ?? {};
  const rada: any[] = Array.isArray(d.series) ? d.series : [];
  const sloupky = (klic: string) => rada.map(r => ({ value: Number(r[klic]) || 0, tip: `${String(r.day).slice(8, 10)}. ${String(r.day).slice(5, 7)}.: ${Number(r[klic]) || 0}` }));
  const soucet = (klic: string) => rada.reduce((n, r) => n + (Number(r[klic]) || 0), 0);
  const grafy = [
    { klic: 'active', nazev: 'Členové u kasy' },
    { klic: 'points_given', nazev: 'Rozdané body' },
    { klic: 'new_members', nazev: 'Noví členové' },
    { klic: 'redeemed', nazev: 'Uplatněné kupony' },
  ];
  return (
    <div className="space-y-4">
      {!p.loyalty_on && (
        // Upozornění, ne tónovaná karta přes celou šířku s limetkou uvnitř:
        // ta sama dělala 8 % tónu stránky a soupeřila s hlavní akcí.
        <div className="note note-wait flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[15px] font-semibold">Věrnost je pro hosty vypnutá.</p>
          {smi('vernost.pravidla') && <Button size="sm" variant="secondary" loading={busy} onClick={zapnout}>Zapnout</Button>}
        </div>
      )}
      {imp.smi && d && p && <PrechodZKarticky clenu={Number(d.summary?.members) || 0} onOtevri={imp.otevri} />}
      {imp.okno}
      <Card>
        <StatRow>
          <Stat label="Členů" value={(Number(s.members) || 0).toLocaleString('cs-CZ')} />
          <Stat label="Bodů v oběhu" value={(Number(s.points) || 0).toLocaleString('cs-CZ')} />
          <Stat label="Kredit hostů" value={(Number(s.credit) || 0).toLocaleString('cs-CZ')} unit={symbol} />
          <Stat label="Kupony k vyzvednutí" value={(Number(s.couponsOpen) || 0).toLocaleString('cs-CZ')} note={`${(Number(s.couponsRedeemed) || 0).toLocaleString('cs-CZ')} uplatněno celkem`} />
        </StatRow>
      </Card>
      {rada.length > 0 && (
        <Card aria-labelledby="v-31">
          <h2 id="v-31" className="t-card mb-4">Posledních {rada.length} dní</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-5">
            {grafy.map(g => (
              <div key={g.klic}>
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <p className="t-label truncate">{g.nazev}</p>
                  <p className="text-sm font-bold tabular-nums">{soucet(g.klic).toLocaleString('cs-CZ')}</p>
                </div>
                <BarSpark height={40} label={`${g.nazev} po dnech`} data={sloupky(g.klic)} highlight={rada.length - 1} />
              </div>
            ))}
          </div>
        </Card>
      )}
      <Card pad="none" aria-labelledby="v-pohyby">
        <h2 id="v-pohyby" className="t-card px-5 pt-4">Poslední pohyby</h2>
        {(d.recent ?? []).length === 0 ? (
          <p className="t-meta px-5 pb-5 pt-2">Zatím se nic nedělo. První body přijdou s objednávkou nebo razítkem u kasy.</p>
        ) : (
          <ul className="list px-5">
            {d.recent.map((l: any) => {
              const plus = (Number(l.delta) || Number(l.credit_delta) || 0) > 0;
              return (
                <ListRow key={l.id} title={l.customer_name} meta={`${l.note || l.kind} · ${dbTimeDayHM(l.created_at)}`}
                  value={<span className={plus ? 'text-ok-ink' : 'text-bad-ink'}>{l.delta ? `${l.delta > 0 ? '+' : ''}${l.delta} b.` : `${l.credit_delta > 0 ? '+' : ''}${money(l.credit_delta)}`}</span>} />
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ---- Body a úrovně --------------------------------------------------------------
//
// Jeden formulář: body, cashback a úrovně se ukládají jedním PUT a jedním
// „Uložit" v hlavičce stránky (tlačítko je mimo formulář, drží ho atribut `form`).

function BodyAUrovne({ toast, setUkladam }: { toast: (m: string) => void; setUkladam: (v: boolean) => void }) {
  const { ma } = useOpravneni();
  const meni = ma('vernost.pravidla');
  const symbol = useSymbol();
  const [dopocitavam, setDopocitavam] = useState(false);
  const { p, setP, reload: reloadProfile, error: profileError } = useProfile();
  if (profileError) return <ErrorState title="Věrnost se nenačetla" onRetry={reloadProfile} detail={profileError} />;
  if (!p) return <Kostra />;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meni) return;
    setUkladam(true);
    try {
      const r = await j('/api/client/admin/profile', { method: 'PUT', body: JSON.stringify({
        points_per_100: p.points_per_100, cashback_pct: p.cashback_pct, cashback_mode: p.cashback_mode, birthday_points: p.birthday_points, referral_points: p.referral_points, points_expire_days: p.points_expire_days,
        silver_at: p.silver_at, gold_at: p.gold_at, platinum_at: p.platinum_at,
        tier_by: p.tier_by === 'spend' ? 'spend' : 'visits', silver_spend: p.silver_spend, gold_spend: p.gold_spend, platinum_spend: p.platinum_spend,
        member_discount: p.member_discount, silver_discount: p.silver_discount, gold_discount: p.gold_discount, platinum_discount: p.platinum_discount,
        reactivation_days: p.reactivation_days ?? 0, reactivation_points: p.reactivation_points ?? 0,
      }) });
      setP(r.profile); toast('Pravidla bodů, úrovně a slevy uloženy.');
    } catch (err) { toast(apiMessage(err, 'Uložení se nepovedlo.')); }
    setUkladam(false);
  };
  const cislo = (id: string, lb: string, hint: string, key: string, max: number, min = 0) => (
    <Field id={id} label={lb} hint={hint}>
      <Input id={id} type="number" min={min} max={max} disabled={!meni} className="!w-28" value={p[key] ?? 0} onChange={e => setP({ ...p, [key]: e.target.value })} />
    </Field>
  );
  // Režim úrovní: z návštěv (výchozí), nebo z kumulované útraty. Prahy obou režimů
  // zůstávají uložené vedle sebe — přepnutí nic nemaže, jen mění, který platí.
  const podleUtraty = p.tier_by === 'spend';
  const urovne: { id: string; name: string; atKey?: string; discKey: string; tone: 'muted' | 'ink'; hint: string }[] = [
    { id: 'bronze', name: 'Člen', discKey: 'member_discount', tone: 'muted', hint: podleUtraty ? 'Od první útraty.' : 'Od první návštěvy.' },
    { id: 'silver', name: 'Stříbrný host', atKey: podleUtraty ? 'silver_spend' : 'silver_at', discKey: 'silver_discount', tone: 'muted', hint: podleUtraty ? `Od jaké celkové útraty (v ${symbol}).` : 'Od kolika návštěv.' },
    { id: 'gold', name: 'Zlatý host', atKey: podleUtraty ? 'gold_spend' : 'gold_at', discKey: 'gold_discount', tone: 'ink', hint: podleUtraty ? `Od jaké celkové útraty (v ${symbol}).` : 'Od kolika návštěv.' },
    { id: 'platinum', name: 'Platinový host', atKey: podleUtraty ? 'platinum_spend' : 'platinum_at', discKey: 'platinum_discount', tone: 'ink', hint: podleUtraty ? '0 = Platina vypnutá.' : '0 návštěv = Platina vypnutá.' },
  ];
  const dopocitat = async () => {
    setDopocitavam(true);
    try {
      const r = await j('/api/client/admin/loyalty', { method: 'POST', body: JSON.stringify({ what: 'spend_backfill' }) });
      toast(r.updated > 0 ? `Útrata dopočtena. Upraveno: ${czCount(r.updated, HOST)}.` : 'Není co dopočítat — členové s útratou už ji mají, nebo chybí objednávky a účtenky.');
    } catch (err) { toast(apiMessage(err, 'Útrata se nedopočetla.')); }
    setDopocitavam(false);
  };
  return (
    <div className="space-y-4 max-w-3xl">
      <form id={FORM_BODY} onSubmit={save} className="space-y-4">
        {!meni && <p className="note note-wait">Pravidla věrnosti tu jen vidíš — měnit je může, kdo má na starosti věrnostní program.</p>}
        <Card className="space-y-4">
          <div>
            <h2 className="t-card">Za co host dostane body</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">Body se sbírají samy: z objednávek od stolu, při načtení kartičky u kasy a při událostech níž. Utratí se za kupony.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {cislo('l-per100', `Bodů za 100 ${symbol}`, `Objednávka za 250 ${symbol} dá dvaapůlnásobek.`, 'points_per_100', 100)}
            {cislo('l-bday', 'Bodů k narozeninám', 'Dárek v den narozenin. 0 = nedávat.', 'birthday_points', 1000)}
            {cislo('l-ref', 'Bodů za pozvání', 'Pro oba, když kamarád poprvé přijde. 0 = vypnuto.', 'referral_points', 1000)}
          </div>
        </Card>
        <Card className="space-y-4">
          <div>
            <h2 className="t-card">Propadání bodů</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">Body, které host nevyužije, po čase propadnou. Odepisují se od nejstarších, nikdy víc, než kolik host má. Týden předem dostane upozornění. Zapnutí nic nesmaže zpětně: stáří se počítá od dne, kdy to zapneš.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {cislo('l-expire', 'Propadnou po (dnech)', '0 = nikdy nepropadají.', 'points_expire_days', 3650)}
          </div>
        </Card>
        <Card className="space-y-4">
          <div>
            <h2 className="t-card">Cashback z útraty</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">Část útraty se hostovi vrací: buď jako kredit (obsluha ho odečte u kasy), nebo jako body.</p>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            {cislo('l-cash', 'Vrátit (%)', '0 = nepoužívat.', 'cashback_pct', 50)}
            <div>
              <p className="field-label">V čem se vrací</p>
              <Segmented options={[{ id: 'credit', label: `Kredit v ${symbol}` }, { id: 'points', label: 'Body' }]}
                value={p.cashback_mode === 'points' ? 'points' : 'credit'} onChange={v => { if (meni) setP({ ...p, cashback_mode: v }); }} size="sm" ariaLabel="Podoba cashbacku" />
            </div>
          </div>
        </Card>
        <Card className="space-y-4" aria-labelledby="l-auto">
          <div>
            <h2 id="l-auto" className="t-card">Automatizace: Chybíš nám</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">Hostovi, který přestal chodit, přijde jednou oznámení, že nám chybí. Můžeš k němu přidat i dárkové body. Kdo je pryč o dva týdny a víc nad nastavený počet dnů, ho už nedostane, ať se neposílá starým spáčům. Respektuje nastavení oznámení hosta.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {cislo('l-react-days', 'Po kolika dnech bez návštěvy', '0 = vypnuto. Například 30.', 'reactivation_days', 365)}
            {cislo('l-react-pts', 'Dárkových bodů navíc', '0 = jen oznámení bez bodů.', 'reactivation_points', 1000)}
          </div>
          <p className="t-meta" aria-live="polite">
            {Number(p.reactivation_days) > 0
              ? `Zapnuto: host, který nebyl ${czCount(Number(p.reactivation_days), DEN)}, dostane oznámení${Number(p.reactivation_points) > 0 ? ` a ${czCount(Number(p.reactivation_points), BOD)}` : ''}. Jednou za každou odmlku.`
              : 'Vypnuto. Zprávy hostům můžeš posílat ručně v Zákaznících, ve Zprávách členům.'}
          </p>
        </Card>
        <Card className="space-y-4">
          <div>
            <h2 className="t-card">Úrovně hostů a jejich sleva</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">{podleUtraty ? 'Čím víc host celkem utratí, tím lepší úroveň.' : 'Čím víc návštěv, tím lepší úroveň.'} Sleva je informace pro obsluhu: při načtení kartičky u kasy uvidí, kolik hostovi odečíst. Úroveň vidí i host na své stránce.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="field-label !mb-0">Úrovně podle</p>
            <Segmented options={[{ id: 'visits', label: 'Návštěv' }, { id: 'spend', label: 'Útraty' }]}
              value={podleUtraty ? 'spend' : 'visits'} onChange={v => { if (meni) setP({ ...p, tier_by: v }); }} size="sm" ariaLabel="Úrovně podle" />
          </div>
          {podleUtraty && (
            <div className="flex flex-wrap items-center gap-3">
              <p className="t-meta max-w-[70ch]">Útrata se sčítá z účtenek, objednávek od stolu a částek zadaných u kasy. Přepnutí nic nemaže — prahy obou režimů zůstávají uložené.</p>
              {ma('vernost.upravit_body') && <Button size="sm" variant="secondary" loading={dopocitavam} onClick={dopocitat}>Dopočítat útratu z historie</Button>}
            </div>
          )}
          <ul className="space-y-2">
            {urovne.map(t => (
              <Well as="li" key={t.id} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
                <div>
                  <Chip tone={t.tone} size="sm">{t.name}</Chip>
                  <p className="t-meta mt-1.5">{t.hint}</p>
                </div>
                {t.atKey ? (
                  <Field id={`t-${t.id}`} label={podleUtraty ? `Útrata (${symbol})` : 'Návštěv'}>
                    <Input id={`t-${t.id}`} type="number" min={t.id === 'platinum' ? 0 : 1} max={podleUtraty ? 100000000 : 2000} disabled={!meni} className={podleUtraty ? '!w-32' : '!w-24'} value={p[t.atKey] ?? 0} onChange={e => setP({ ...p, [t.atKey!]: e.target.value })} />
                  </Field>
                ) : <span className="hidden sm:block" />}
                <Field id={`d-${t.id}`} label="Sleva %">
                  <Input id={`d-${t.id}`} type="number" min={0} max={90} disabled={!meni} className="!w-24" value={p[t.discKey] ?? 0} onChange={e => setP({ ...p, [t.discKey]: e.target.value })} />
                </Field>
              </Well>
            ))}
          </ul>
          <p className="t-meta">Sleva se nepočítá automaticky do pokladny — obsluha ji zadá sama. Nulová sleva znamená, že úroveň je jen odznak. Uvítacích 10 bodů dostane každý nový člen automaticky; ruční úpravu bodů najdeš u hosta v Zákaznících.</p>
        </Card>
      </form>
      {ma('zakaznici.zobrazit') && <Groups toast={toast} />}
    </div>
  );
}

// Ruční skupiny hostů („štamgasti", „firemní večery"). Členy do nich přidává
// vedení v Zákaznících; kupony na ně jdou cílit v editoru kuponu.
function Groups({ toast }: { toast: (m: string) => void }) {
  const meni = useOpravneni().ma('zakaznici.skupiny');
  const [list, setList] = useState<any[] | null>(null);
  const [name, setName] = useState('');
  const [novaSleva, setNovaSleva] = useState('');
  const [busy, setBusy] = useState('');
  const [mazu, setMazu] = useState<any | null>(null);
  const load = useCallback(() => fetch('/api/client/admin/groups').then(okJson).then(d => setList(d.groups ?? [])).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!name.trim()) return; setBusy('add');
    try { await j('/api/client/admin/groups', { method: 'POST', body: JSON.stringify({ name, discount_pct: novaSleva === '' ? undefined : novaSleva }) }); setName(''); setNovaSleva(''); load(); }
    catch (err) { toast(apiMessage(err, 'Skupinu se nepodařilo založit.')); }
    setBusy('');
  };
  // Sleva skupiny se ukládá po opuštění pole; 0 = skupina je jen štítek.
  const ulozSlevu = async (g: any, hodnota: string) => {
    const n = Math.max(0, Math.min(100, Math.round(Number(hodnota) || 0)));
    if (n === (Number(g.discount_pct) || 0)) return;
    setBusy('sleva:' + g.id);
    try { await j('/api/client/admin/groups', { method: 'PATCH', body: JSON.stringify({ id: g.id, discount_pct: n }) }); load(); toast(`Sleva skupiny ${g.name}: ${n} %.`); }
    catch (err) { toast(apiMessage(err, 'Slevu se nepodařilo uložit.')); }
    setBusy('');
  };
  const del = async (g: any) => {
    try { await j(`/api/client/admin/groups?id=${g.id}`, { method: 'DELETE' }); load(); }
    catch (err) { toast(apiMessage(err, 'Skupinu se nepodařilo smazat.')); }
  };
  return (
    <Card className="space-y-3" aria-labelledby="v-skupiny">
      <div>
        <h2 id="v-skupiny" className="t-card">Skupiny hostů</h2>
        <p className="t-meta mt-0.5 max-w-[70ch]">Vlastní štítky mimo úrovně — „štamgasti", „firemní večery". Hosty do nich přidáš v Zákaznících; kupony na ně cílíš v jejich editoru. Skupina může mít i vlastní slevu: člen ve víc skupinách (a s úrovní) bere vždy nejvyšší z nich, nikdy součet.</p>
      </div>
      {list === null ? <Skeleton className="h-16" /> : list.length > 0 && (
        <ul className="list">
          {list.map((g: any) => (
            <ListRow key={g.id} title={g.name} meta={`${czCount(Number(g.members) || 0, HOST)}${Number(g.discount_pct) > 0 ? ` · sleva ${g.discount_pct} %` : ''}`}
              actions={meni ? <>
                <label htmlFor={`sk-${g.id}`} className="inline-flex items-center gap-1.5 text-xs text-black/60">Sleva v %
                  <Input id={`sk-${g.id}`} key={`${g.id}:${g.discount_pct}`} type="number" min={0} max={100} className="!w-20" aria-label={`Sleva v % pro skupinu ${g.name}`}
                    defaultValue={Number(g.discount_pct) || 0} disabled={busy === 'sleva:' + g.id}
                    onBlur={e => { void ulozSlevu(g, e.target.value); }} />
                </label>
                <Button size="sm" variant="ghost" icon="trash" aria-label={`Smazat skupinu ${g.name}`} loading={busy === 'del:' + g.id} onClick={() => setMazu(g)}>Smazat</Button>
              </> : undefined} />
          ))}
        </ul>
      )}
      {meni && (
        <form onSubmit={add} className="flex gap-2 flex-wrap">
          <Input aria-label="Název nové skupiny" value={name} onChange={e => setName(e.target.value)} placeholder="Nová skupina…" className="flex-1 basis-48 !w-auto" maxLength={60} />
          <Input type="number" min={0} max={100} aria-label="Sleva nové skupiny v %" placeholder="Sleva v %" value={novaSleva} onChange={e => setNovaSleva(e.target.value)} className="!w-28" />
          <Button type="submit" variant="secondary" icon="plus" loading={busy === 'add'} disabled={!name.trim()}>Přidat</Button>
        </form>
      )}
      {mazu && <Smazat title={`Smazat skupinu „${mazu.name}"?`} text="Hosté v ní zůstanou, jen přijdou o štítek." onZavrit={() => setMazu(null)} onPotvrdit={() => { void del(mazu); }} />}
    </Card>
  );
}

// ---- Razítka --------------------------------------------------------------------
// Kartičky jako v Kartičce: podnik jich má víc vedle sebe (10+1 dýmka, 5+1
// čaj…), každá s vlastním pravidlem, odměnou a opakováním.

const RULE_OPTS = [
  { id: 'visit', label: 'Za návštěvu' },
  { id: 'products', label: 'Za položky' },
  { id: 'min_value', label: 'Za útratu' },
];
const RULE_NAME: Record<string, string> = { visit: 'za návštěvu', products: 'za položky', min_value: 'za útratu' };
const REPEAT_OPTS = [
  { id: 'immediately', label: 'hned' },
  { id: 'one_day', label: 'po dni' },
  { id: 'one_week', label: 'po týdnu' },
  { id: 'one_month', label: 'po měsíci' },
  { id: 'one_time', label: 'jen jednou' },
];

const blankCampaign = () => ({
  id: null as number | null, name: '', description: '', conditions: '', active: true,
  validSince: '', validTill: '', requiredStamps: 10, ruleType: 'visit',
  stampItems: [] as { itemId: number; name: string }[], minValue: '', minValueMultiple: false,
  onePerOrder: false, rewardTitle: '', rewardItems: [] as { itemId: number; name: string }[],
  daysToFinish: 0, daysToRedeem: 0, repeatMode: 'immediately', stackCards: true,
  ...RAZITKA_DEFAULTY,
});

function campaignToForm(c: any) {
  return {
    id: c.id, name: c.name ?? '', description: c.description ?? '', conditions: c.conditions ?? '',
    active: c.active !== false, validSince: c.valid_since ? String(c.valid_since).slice(0, 10) : '',
    validTill: c.valid_till ? String(c.valid_till).slice(0, 10) : '',
    requiredStamps: Number(c.required_stamps) || 10, ruleType: c.rule_type ?? 'visit',
    stampItems: c.stampItems ?? [], minValue: c.min_value == null ? '' : String(c.min_value),
    minValueMultiple: c.min_value_multiple === true, onePerOrder: c.one_per_order === true,
    rewardTitle: c.reward_title ?? '', rewardItems: c.rewardItems ?? [],
    daysToFinish: Number(c.days_to_finish) || 0, daysToRedeem: Number(c.days_to_redeem) || 0,
    repeatMode: c.repeat_mode ?? 'immediately', stackCards: c.stack_cards !== false,
    ...razitkaZRadku(c),
  };
}

/** Výběr položek nabídky: hledání a vybrané jako odebratelné štítky. */
function ItemPicker({ items, value, onChange, label: lb, hint }: {
  items: { id: number; name: string; board: string; paired: boolean }[];
  value: { itemId: number; name: string }[];
  onChange: (v: { itemId: number; name: string }[]) => void;
  label: string; hint?: string;
}) {
  const [q, setQ] = useState('');
  const pickInput = useRef<HTMLInputElement>(null);
  const pickList = useRef<HTMLUListElement>(null);
  const pickKeys = useResultKeys(pickList, pickInput, { onEscape: () => setQ('') });
  const chosen = new Set(value.map(v => v.itemId));
  const needle = q.trim().toLowerCase();
  const found = needle ? items.filter(i => !chosen.has(i.id) && obsahuje(i.name, needle)).slice(0, 6) : [];
  const unpaired = items.length > 0 && value.some(v => items.find(i => i.id === v.itemId)?.paired === false);
  return (
    <div>
      <p className="field-label">{lb}</p>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map(v => (
            <button key={v.itemId} type="button" aria-label={`Odebrat ${v.name}`} onClick={() => onChange(value.filter(x => x.itemId !== v.itemId))}
              className="filter-pill tap-target-sm seg-on inline-flex items-center gap-1.5">
              {v.name}<Icon name="close" size={12} className="opacity-60" />
            </button>
          ))}
        </div>
      )}
      <Input ref={pickInput} onKeyDown={pickKeys.onInputKeyDown}
        value={q} onChange={e => setQ(e.target.value)} placeholder={items.length ? 'Hledej v nabídce…' : 'Nabídka je prázdná'} disabled={!items.length}
        aria-label={lb} />
      {found.length > 0 && (
        <Well className="mt-1.5 !p-0 overflow-hidden">
          <ul ref={pickList} onKeyDown={pickKeys.onListKeyDown} className="list px-3">
            {found.map(i => (
              <ListRow key={i.id} title={i.name} meta={i.board} onClick={() => { onChange([...value, { itemId: i.id, name: i.name }]); setQ(''); }}
                right={!i.paired ? <Chip tone="wait" size="sm">bez pokladny</Chip> : undefined} chevron={false} />
            ))}
          </ul>
        </Well>
      )}
      {hint && <p className="t-meta mt-1.5">{hint}</p>}
      {unpaired && <p className="text-[13px] text-wait-ink mt-1.5">Některé vybrané položky nejsou spárované s pokladnou — z účtenky se za ně razítko nepřipíše, jen ručně.</p>}
    </div>
  );
}

/** Chyba ve formuláři kartičky (česká věta), nebo prázdný řetězec. */
function chybaFormulare(f: ReturnType<typeof blankCampaign>): string {
  const v = overKampan({ ...f, minValue: f.minValue === '' ? null : Number(f.minValue) });
  return 'chyba' in v ? v.chyba : '';
}

function Stamps({ toast }: { toast: (m: string) => void }) {
  const meni = useOpravneni().ma('vernost.kampane');
  const money = useMoney();
  const symbol = useSymbol();
  const [list, setList] = useState<any[] | null>(null);
  const [form, setForm] = useState<ReturnType<typeof blankCampaign> | null>(null);
  const [items, setItems] = useState<{ id: number; name: string; board: string; paired: boolean }[]>([]);
  const [busy, setBusy] = useState('');
  const [mazu, setMazu] = useState<any | null>(null);
  const load = useCallback(() => fetch('/api/client/admin/stamps').then(okJson).then(d => setList(d.campaigns ?? [])).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!form) return;
    // Položky nabídky pro výběr „za položky" — přes všechny desky najednou, až při úpravě.
    fetch('/api/menu').then(okJson).then(d => {
      const flat: any[] = [];
      for (const b of d.boards ?? []) for (const s of b.sections ?? []) for (const i of s.items ?? []) {
        flat.push({ id: i.id, name: i.name, board: b.name, paired: !!i.posProductId });
      }
      setItems(flat);
    }).catch(() => {});
  }, [form == null]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!form) return;
    // Stejná validace jako na serveru (lib/stampsPlan) — chyba se ukáže hned, bez cesty na server.
    const chyba = chybaFormulare(form);
    if (chyba) { toast(chyba); return; }
    setBusy('save');
    try {
      const body = JSON.stringify({ ...form, minValue: form.minValue === '' ? null : Number(form.minValue) });
      await j('/api/client/admin/stamps', { method: form.id ? 'PATCH' : 'POST', body });
      toast(form.id ? 'Kartička uložena.' : 'Kartička založena.'); setForm(null); load();
    } catch (e) { toast(apiMessage(e, 'Kartičku se nepodařilo uložit.')); }
    setBusy('');
  };
  const del = async (c: any) => {
    try { await j(`/api/client/admin/stamps?id=${c.id}`, { method: 'DELETE' }); toast('Kartička smazána.'); setForm(null); load(); }
    catch (e) { toast(apiMessage(e, 'Kartičku se nepodařilo smazat.')); }
  };
  const [filtr, setFiltr] = useState<FiltrStavu>('all');
  const akce = useRazitkaAkce({ reload: load, toast, meni, upravit: c => setForm(campaignToForm(c)), smazat: c => setMazu(c) });

  if (list === null) return <Kostra />;

  // --- editor ---
  if (form) {
    const f = form; const set = (patch: Partial<typeof f>) => setForm({ ...f, ...patch });
    const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
    return (
      <div className="space-y-4 max-w-3xl">
        <Button variant="ghost" size="sm" icon="undo" onClick={() => setForm(null)}>Zpět na kartičky</Button>
        <Card className="space-y-4">
          <div>
            <h2 className="t-card">{f.id ? `Upravit „${f.name || '…'}"` : 'Nová kartička'}</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">Za plnou kartu dostane host kupon s kódem — obsluha ho uplatní u kasy.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field id="sc-name" label="Název"><Input id="sc-name" value={f.name} onChange={e => set({ name: e.target.value })} placeholder="10 + 1 dýmka zdarma" maxLength={120} /></Field>
            <Field id="sc-req" label="Razítek do odměny"><Input id="sc-req" type="number" min={1} max={50} value={f.requiredStamps} onChange={e => set({ requiredStamps: num(e.target.value, 1, 50) })} /></Field>
          </div>
          <Field id="sc-desc" label="Popis pro hosta"><Input id="sc-desc" value={f.description} onChange={e => set({ description: e.target.value })} placeholder="Každá desátá dýmka je na nás." maxLength={200} /></Field>
          <div>
            <p className="field-label">Za co se razítko připisuje</p>
            <Segmented options={RULE_OPTS} value={f.ruleType} onChange={v => set({ ruleType: v })} size="sm" ariaLabel="Pravidlo razítka" />
            {f.ruleType === 'visit' && <p className="t-meta mt-2">Jedno razítko za návštěvu — obsluha ho dá při načtení kartičky u kasy, nejvýš jedno denně.</p>}
            {f.ruleType === 'products' && (
              <div className="mt-3 space-y-3">
                <ItemPicker items={items} value={f.stampItems} onChange={v => set({ stampItems: v })} label="Položky, které dávají razítko"
                  hint="Razítko za každý kus z účtenky. Obsluha u kasy zvolí účtenku hosta a razítka se připíší sama." />
                <ul className="list">
                  <SwitchRow title="Nejvýš jedno razítko z jedné účtenky" checked={f.onePerOrder} onChange={v => set({ onePerOrder: v })} />
                </ul>
              </div>
            )}
            {f.ruleType === 'min_value' && (
              <div className="mt-3 space-y-3">
                <Field id="sc-min" label={`Útrata od (${symbol})`} hint="Razítko za účtenku aspoň na tuhle částku.">
                  <Input id="sc-min" type="number" min={1} max={100000} className="!w-32" value={f.minValue} onChange={e => set({ minValue: e.target.value })} placeholder="300" />
                </Field>
                <ul className="list">
                  <SwitchRow title={`Razítko za každý násobek částky (600 ${symbol} = 2 razítka)`} checked={f.minValueMultiple} onChange={v => set({ minValueMultiple: v })} />
                </ul>
              </div>
            )}
          </div>
          <div className="border-t border-black/[0.06] pt-4 space-y-4">
            <Field id="sc-rew" label="Odměna za plnou kartu"><Input id="sc-rew" value={f.rewardTitle} onChange={e => set({ rewardTitle: e.target.value })} placeholder="Dýmka zdarma" maxLength={160} /></Field>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Field id="sc-fin" label="Dní na nasbírání"><Input id="sc-fin" type="number" min={0} max={365} value={f.daysToFinish} onChange={e => set({ daysToFinish: num(e.target.value, 0, 365) })} /></Field>
              <Field id="sc-red" label="Dní na uplatnění"><Input id="sc-red" type="number" min={0} max={365} value={f.daysToRedeem} onChange={e => set({ daysToRedeem: num(e.target.value, 0, 365) })} /></Field>
            </div>
            <p className="t-meta">0 = bez omezení. Když host kartu nedosbírá včas, začíná znovu; kupon po lhůtě propadne.</p>
            <div>
              <p className="field-label">Další karta po dokončení</p>
              <Segmented options={REPEAT_OPTS} value={f.repeatMode} onChange={v => set({ repeatMode: v })} size="sm" ariaLabel="Opakování karty" />
            </div>
            <ul className="list">
              <SwitchRow title="Přebytek razítek se přenáší do další karty" checked={f.stackCards} onChange={v => set({ stackCards: v })} />
            </ul>
          </div>
          <RazitkaDalsiNastaveni f={f} set={set}
            vylouceno={<ItemPicker items={items} value={f.excludedItems} onChange={v => set({ excludedItems: v })} label="Vyloučené položky"
              hint="Jejich cena se z útraty odečte, než se porovná s minimem (třeba dárkové karty). Počítá se jen u účtenky z pokladny." />} />
          <div className="border-t border-black/[0.06] pt-4">
            <div className="grid grid-cols-2 gap-4 max-w-sm">
              <Field id="sc-since" label="Platí od"><Input id="sc-since" type="date" value={f.validSince} onChange={e => set({ validSince: e.target.value })} /></Field>
              <Field id="sc-till" label="Platí do"><Input id="sc-till" type="date" value={f.validTill} onChange={e => set({ validTill: e.target.value })} /></Field>
            </div>
            <p className="t-meta mt-1.5">Prázdné = běží pořád. Hodí se pro sezónní kartičky.</p>
          </div>
          <div className="border-t border-black/[0.06] pt-4"><RazitkaNahled f={f} /></div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {chybaFormulare(f) && <p role="alert" className="text-sm text-bad-ink mr-auto min-w-0">{chybaFormulare(f)}</p>}
            <Button variant="secondary" onClick={() => setForm(null)}>Zrušit</Button>
            <Button variant="primary" loading={busy === 'save'} disabled={!!chybaFormulare(f)} onClick={save}>{f.id ? 'Uložit kartičku' : 'Založit kartičku'}</Button>
          </div>
        </Card>
      </div>
    );
  }

  // --- seznam ---
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <p className="t-meta max-w-[60ch]">Kartiček může běžet víc vedle sebe — třeba „10+1 dýmka" a „5+1 čaj". Razítka z účtenky připisuje obsluha u kasy jedním klepnutím.</p>
        {meni && <Button variant="secondary" icon="plus" onClick={() => setForm(blankCampaign())}>Nová kartička</Button>}
      </div>
      <RazitkaFiltr list={list} value={filtr} onChange={setFiltr} />
      {list.length === 0 ? (
        <Card><EmptyState icon="check" title="Zatím žádná kartička" hint="Založ první — třeba „každá desátá dýmka zdarma“. Hosté ji uvidí na tvé stránce hned." compact /></Card>
      ) : podleFiltru(list, filtr).length === 0 ? (
        <Card><EmptyState icon="check" title="V téhle skupině nic není" hint="Vyber jinou skupinu nahoře, nebo založ novou kartičku." compact /></Card>
      ) : (
        <Card pad="none">
          <ul className="list px-5">
            {podleFiltru(list, filtr).map((c: any) => (
              <ListRow key={c.id} className={c.active ? '' : 'opacity-60'} title={<span className="flex items-center gap-2 min-w-0"><span className="truncate">{c.name}</span><StavChip stav={c.status} /></span>}
                meta={[
                  `${czCount(Number(c.required_stamps) || 0, RAZITKO)} ${RULE_NAME[c.rule_type] ?? ''}${c.rule_type === 'products' && c.stampItems?.length ? `: ${c.stampItems.map((x: any) => x.name).join(', ')}` : ''}${c.rule_type === 'min_value' && c.min_value ? ` od ${money(c.min_value)}` : ''}`,
                  `odměna ${c.reward_title || '—'}`,
                  `${czCount(Number(c.collectors) || 0, HOST)} sbírá · ${c.completions}× dokončeno${c.rewardsIssued ? ` · uplatněno ${c.rewardsRedeemed} z ${c.rewardsIssued}` : ''}`,
                ].join(' · ')}
                actions={
                  <>
                    {meni && c.status !== 'archived' && <Switch checked={!!c.active} onChange={() => { void akce.prepni(c); }} label={`Běží: ${c.name}`} />}
                    <Menu size="sm" label={`Další akce s kartičkou ${c.name}`} items={akce.polozky(c, list.findIndex((x: any) => x.id === c.id), list.length)} />
                  </>
                } />
            ))}
          </ul>
        </Card>
      )}
      {akce.okna}
      <p className="t-meta max-w-[75ch]">Razítka připíše obsluha u kasy: buď „razítko za návštěvu", nebo výběrem účtenky hosta — z jejích položek se pravidla vyhodnotí sama. Za plnou kartu dostane host kupon s kódem.</p>
      {mazu && (
        <Smazat title={`Smazat kartičku „${mazu.name}"?`} onZavrit={() => setMazu(null)} onPotvrdit={() => { void del(mazu); }}
          text={`Rozsbíraná razítka (${czCount(Number(mazu.collectors) || 0, HOST)}) zmizí. Vydané kupony zůstanou.`} />
      )}
    </div>
  );
}

// ---- Kupony ---------------------------------------------------------------------
// Kupon v plné síle jako v Kartičce: výhoda (% / částka / zdarma / X+Y), komu
// (úrovně, skupiny), kdy (dny, hodiny, od–do), jak často (limit, cooldown),
// 18+ a uvítací kupon pro nové členy.

const TIER_OPTS: { id: string; label: string }[] = [
  { id: 'bronze', label: 'Člen' }, { id: 'silver', label: 'Stříbrný' },
  { id: 'gold', label: 'Zlatý' }, { id: 'platinum', label: 'Platinový' },
];
const DOW = [{ d: 1, l: 'Po' }, { d: 2, l: 'Út' }, { d: 3, l: 'St' }, { d: 4, l: 'Čt' }, { d: 5, l: 'Pá' }, { d: 6, l: 'So' }, { d: 7, l: 'Ne' }];

const blankCoupon = () => ({
  id: null as number | null, title: '', description: '', costPoints: 100, active: true,
  benefitKind: 'percent', percentOff: '', amountOff: '', xyBuy: '', xyFree: '1',
  minOrderValue: '', targetTiers: [] as string[], targetGroups: [] as number[],
  perCustomer: 0, cooldownDays: 0, daysOfWeek: [] as number[], hourFrom: '', hourTill: '',
  adultOnly: false, welcome: false, validSince: '', validUntil: '',
});

function couponToForm(c: any) {
  return {
    id: c.id, title: c.title ?? '', description: c.description ?? '',
    costPoints: Number(c.costPoints) || 0, active: c.active !== false,
    benefitKind: c.benefitKind ?? 'text',
    percentOff: c.percentOff == null ? '' : String(c.percentOff),
    amountOff: c.amountOff == null ? '' : String(c.amountOff),
    xyBuy: c.xyBuy == null ? '' : String(c.xyBuy), xyFree: c.xyFree == null ? '1' : String(c.xyFree),
    minOrderValue: c.minOrderValue == null ? '' : String(c.minOrderValue),
    targetTiers: c.targetTiers ?? [], targetGroups: c.targetGroups ?? [],
    perCustomer: Number(c.perCustomer) || 0, cooldownDays: Number(c.cooldownDays) || 0,
    daysOfWeek: c.daysOfWeek ?? [], hourFrom: c.hourFrom ?? '', hourTill: c.hourTill ?? '',
    adultOnly: c.adultOnly === true, welcome: c.welcome === true,
    validSince: c.validSince ? String(c.validSince).slice(0, 10) : '',
    validUntil: c.validUntil ? String(c.validUntil).slice(0, 10) : '',
  };
}

/** Přepínací filtr (vícenásobný výběr) — filter-pill jako všude, vybraný inkoustový s bílým textem. */
function Volba({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`filter-pill tap-target-sm ${on ? 'seg-on' : 'seg-off glass'}`}>
      {children}
    </button>
  );
}

function Coupons({ toast }: { toast: (m: string) => void }) {
  const spravuje = useOpravneni().ma('kupony.spravovat');
  const uplatni = useOpravneni().ma('kupony.uplatnit');
  const symbol = useSymbol();
  const [list, setList] = useState<any[] | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [form, setForm] = useState<ReturnType<typeof blankCoupon> | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState('');
  const [mazu, setMazu] = useState<any | null>(null);
  // Katalog kuponů čte jen správce (API chce kupony.spravovat); uplatnění kódu jde i bez něj.
  const load = useCallback(() => {
    if (!spravuje) { setList([]); return; }
    fetch('/api/client/admin/coupons').then(okJson).then(d => { setList(d.coupons ?? []); setGroups(d.groups ?? []); }).catch(() => setList([]));
  }, [spravuje]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form) return;
    setBusy('save');
    try {
      await j('/api/client/admin/coupons', { method: form.id ? 'PATCH' : 'POST', body: JSON.stringify(form) });
      toast(form.id ? 'Kupon uložen.' : 'Kupon založen.'); setForm(null); load();
    } catch (e) { toast(apiMessage(e, 'Kupon se nepodařilo uložit.')); }
    setBusy('');
  };
  const toggle = async (c: any) => {
    setBusy('toggle:' + c.id);
    try { await j('/api/client/admin/coupons', { method: 'PATCH', body: JSON.stringify({ id: c.id, active: !c.active }) }); load(); }
    catch (e) { toast(apiMessage(e, 'Změna se nepovedla.')); }
    setBusy('');
  };
  const del = async (c: any) => {
    try { await j(`/api/client/admin/coupons?id=${c.id}`, { method: 'DELETE' }); toast('Kupon smazán.'); setForm(null); load(); }
    catch (e) { toast(apiMessage(e, 'Kupon se nepodařilo smazat.')); }
  };
  const redeem = async (e: React.FormEvent) => {
    e.preventDefault(); if (!code.trim()) return; setBusy('redeem');
    try {
      const r = await j('/api/client/admin/redeem', { method: 'POST', body: JSON.stringify({ code }) });
      toast(`Uplatněno: ${r.title}${r.benefit ? ` (${r.benefit})` : ''} · ${r.customer}.${r.badges?.length ? ` Zkontroluj: ${r.badges.join(', ')}.` : ''}`);
      setCode(''); load();
    } catch (err) { toast(apiMessage(err, 'Kupon se nepodařilo uplatnit.')); }
    setBusy('');
  };

  if (list === null) return <Kostra />;

  // --- editor ---
  if (form) {
    const f = form; const set = (patch: Partial<typeof f>) => setForm({ ...f, ...patch });
    const flip = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v]);
    return (
      <div className="space-y-4 max-w-3xl">
        <Button variant="ghost" size="sm" icon="undo" onClick={() => setForm(null)}>Zpět na kupony</Button>
        <Card className="space-y-4">
          <div>
            <h2 className="t-card">{f.id ? `Upravit „${f.title || '…'}"` : 'Nový kupon'}</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">Host si ho vezme za body na tvé stránce; dostane kód a obsluha ho uplatní u kasy.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_9rem] gap-4">
            <Field id="cp-title" label="Název"><Input id="cp-title" value={f.title} onChange={e => set({ title: e.target.value })} placeholder="Dezert k čaji zdarma" maxLength={80} /></Field>
            <Field id="cp-cost" label="Cena v bodech"><Input id="cp-cost" type="number" min={0} max={100000} value={f.costPoints} onChange={e => set({ costPoints: parseInt(e.target.value || '0', 10) })} /></Field>
          </div>
          <Field id="cp-desc" label="Popis"><Input id="cp-desc" value={f.description} onChange={e => set({ description: e.target.value })} placeholder="Jeden dezert z vitríny podle výběru." maxLength={200} /></Field>
          <div>
            <p className="field-label">Co kupon dává</p>
            <Segmented options={[
              { id: 'percent', label: 'Sleva %' }, { id: 'amount', label: `Sleva ${symbol}` }, { id: 'free_item', label: 'Zdarma' },
              { id: 'xy', label: 'X+Y' }, { id: 'text', label: 'Vlastní' },
            ]} value={f.benefitKind} onChange={v => set({ benefitKind: v })} size="sm" ariaLabel="Výhoda kuponu" />
            <div className="mt-3 flex flex-wrap items-end gap-4">
              {f.benefitKind === 'percent' && (
                <Field id="cp-pct" label="Sleva %"><Input id="cp-pct" type="number" min={1} max={100} className="!w-24 text-center" value={f.percentOff} onChange={e => set({ percentOff: e.target.value })} placeholder="15" /></Field>
              )}
              {f.benefitKind === 'amount' && (
                <Field id="cp-amt" label={`Sleva ${symbol}`}><Input id="cp-amt" type="number" min={1} max={100000} className="!w-24 text-center" value={f.amountOff} onChange={e => set({ amountOff: e.target.value })} placeholder="50" /></Field>
              )}
              {f.benefitKind === 'xy' && (<>
                <Field id="cp-xb" label="Koupí (X)"><Input id="cp-xb" type="number" min={1} max={50} className="!w-24 text-center" value={f.xyBuy} onChange={e => set({ xyBuy: e.target.value })} placeholder="2" /></Field>
                <Field id="cp-xf" label="Zdarma (Y)"><Input id="cp-xf" type="number" min={1} max={50} className="!w-24 text-center" value={f.xyFree} onChange={e => set({ xyFree: e.target.value })} /></Field>
              </>)}
              {f.benefitKind === 'free_item' && <p className="t-meta pb-2">Položka zdarma — co přesně, řekni v názvu kuponu.</p>}
              {f.benefitKind === 'text' && <p className="t-meta pb-2">Výhoda je v názvu a popisu — obsluha ji vyřídí podle nich.</p>}
              <Field id="cp-min" label={`Min. útrata (${symbol})`}><Input id="cp-min" type="number" min={0} max={100000} className="!w-28 text-center" value={f.minOrderValue} onChange={e => set({ minOrderValue: e.target.value })} placeholder="—" /></Field>
            </div>
          </div>
          <div className="border-t border-black/[0.06] pt-4">
            <p className="field-label">Pro koho platí</p>
            <div className="flex flex-wrap gap-1.5">
              {TIER_OPTS.map(t => <Volba key={t.id} on={f.targetTiers.includes(t.id)} onClick={() => set({ targetTiers: flip(f.targetTiers, t.id) })}>{t.label}</Volba>)}
            </div>
            {groups.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {groups.map((g: any) => <Volba key={g.id} on={f.targetGroups.includes(g.id)} onClick={() => set({ targetGroups: flip(f.targetGroups, g.id) })}>{g.name} ({g.members})</Volba>)}
              </div>
            )}
            <p className="t-meta mt-1.5">Nic nevybráno = platí všem členům. Skupiny hostů se spravují v Body a úrovně.</p>
          </div>
          <div className="border-t border-black/[0.06] pt-4 space-y-3">
            <p className="field-label">Kdy platí</p>
            <div className="flex flex-wrap gap-1.5">
              {DOW.map(d => <Volba key={d.d} on={f.daysOfWeek.includes(d.d)} onClick={() => set({ daysOfWeek: flip(f.daysOfWeek, d.d) })}>{d.l}</Volba>)}
            </div>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-4">
              <Field id="cp-hf" label="Od hodiny"><Input id="cp-hf" type="time" value={f.hourFrom} onChange={e => set({ hourFrom: e.target.value })} /></Field>
              <Field id="cp-ht" label="Do hodiny"><Input id="cp-ht" type="time" value={f.hourTill} onChange={e => set({ hourTill: e.target.value })} /></Field>
              <Field id="cp-vs" label="Platí od"><Input id="cp-vs" type="date" value={f.validSince} onChange={e => set({ validSince: e.target.value })} /></Field>
              <Field id="cp-vu" label="Platí do"><Input id="cp-vu" type="date" value={f.validUntil} onChange={e => set({ validUntil: e.target.value })} /></Field>
            </div>
            <p className="t-meta">Žádný den nevybraný = platí každý den. Prázdné hodiny = celý den.</p>
          </div>
          <div className="border-t border-black/[0.06] pt-4 space-y-3">
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-4">
              <Field id="cp-per" label="Nejvýš na hosta"><Input id="cp-per" type="number" min={0} max={100} className="sm:!w-24 text-center" value={f.perCustomer} onChange={e => set({ perCustomer: parseInt(e.target.value || '0', 10) })} /></Field>
              <Field id="cp-cd" label="Znovu až za (dní)"><Input id="cp-cd" type="number" min={0} max={365} className="sm:!w-24 text-center" value={f.cooldownDays} onChange={e => set({ cooldownDays: parseInt(e.target.value || '0', 10) })} /></Field>
            </div>
            <p className="t-meta">0 = bez omezení. Limit počítá vyzvednutí, cooldown čas od posledního.</p>
            <ul className="list">
              <SwitchRow title="Jen 18+" hint="Podle data narození v profilu hosta." checked={f.adultOnly} onChange={v => set({ adultOnly: v })} />
              <SwitchRow title="Uvítací kupon" hint="Nový člen ho dostane sám při vstupu do podniku." checked={f.welcome} onChange={v => set({ welcome: v })} />
            </ul>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setForm(null)}>Zrušit</Button>
            <Button variant="primary" loading={busy === 'save'} onClick={save}>{f.id ? 'Uložit kupon' : 'Založit kupon'}</Button>
          </div>
        </Card>
      </div>
    );
  }

  // --- seznam + uplatnění ---
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-4 items-start">
      {uplatni && (
        <Card as="form" className="space-y-3" onSubmit={redeem}>
          <h2 className="t-card">Uplatnit kupon</h2>
          <p className="t-meta">Host ukáže kód ze své kartičky. Kupon jde uplatnit jednou; podmínky (útrata, 18+) připomene potvrzení.</p>
          <Field id="c-code" label="Kód od hosta"><Input id="c-code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABC-123" className="font-mono tracking-widest" /></Field>
          <Button type="submit" variant="primary" icon="check" loading={busy === 'redeem'} disabled={!code.trim()}>Uplatnit</Button>
        </Card>
      )}
      {spravuje && (
        <Card pad="none" aria-labelledby="v-kupony" className={uplatni ? '' : 'lg:col-span-2'}>
          <div className="flex items-center justify-between gap-3 px-5 pt-4">
            <h2 id="v-kupony" className="t-card">Katalog kuponů</h2>
            <Button size="sm" variant="secondary" icon="plus" onClick={() => setForm(blankCoupon())}>Nový kupon</Button>
          </div>
          {list.length === 0 ? (
            <div className="px-5 pb-5"><EmptyState icon="gift" title="Zatím žádný kupon" hint="Založ první — třeba slevu 15 % pro Zlaté hosty nebo uvítací dezert zdarma." compact /></div>
          ) : (
            <ul className="list px-5">
              {list.map((c: any) => (
                <ListRow key={c.id} className={c.active ? '' : 'opacity-55'}
                  title={<span className="flex items-center gap-1.5 min-w-0"><span className="truncate">{c.title}</span>{c.benefit && <Chip tone="muted" size="sm">{c.benefit}</Chip>}{c.welcome && <Chip tone="muted" size="sm">uvítací</Chip>}</span>}
                  meta={[c.costPoints > 0 ? `${c.costPoints} b.` : 'zdarma', ...(c.badges ?? []), c.validUntil ? `do ${czDay(c.validUntil)}` : null, `vzato ${c.claimed}×, uplatněno ${c.redeemed}×`].filter(Boolean).join(' · ')}
                  actions={<>
                    <Switch checked={!!c.active} disabled={busy === 'toggle:' + c.id} onChange={() => { void toggle(c); }} label={`Aktivní: ${c.title}`} />
                    <Menu size="sm" label={`Další akce s kuponem ${c.title}`} items={[
                      { label: 'Upravit…', icon: 'pencil', onClick: () => setForm(couponToForm(c)) },
                      { label: 'Smazat…', icon: 'trash', danger: true, onClick: () => setMazu(c) },
                    ]} />
                  </>} />
              ))}
            </ul>
          )}
        </Card>
      )}
      {mazu && <Smazat title={`Smazat kupon „${mazu.title}"?`} text="Host, který si ho už vzal, ho uplatní i tak; nový už si ho nevezme." onZavrit={() => setMazu(null)} onPotvrdit={() => { void del(mazu); }} />}
    </div>
  );
}

// ---- Akce a bonusy ---------------------------------------------------------------

const KRAT: CzNoun = { one: 'razítko navíc', few: 'razítka navíc', many: 'razítek navíc' };

const blankBonus = () => ({
  id: null as number | null, name: '', multiplier: '2', stampBonus: '0', days: [] as number[],
  hourFrom: '0', hourTill: '24', validSince: '', validTill: '', active: true,
});

function bonusToForm(r: any) {
  return {
    id: r.id as number, name: r.name ?? '', multiplier: String(r.multiplier ?? 1), stampBonus: String(r.stampBonus ?? 0),
    days: (r.days ?? []) as number[], hourFrom: String(r.hourFrom ?? 0), hourTill: String(r.hourTill ?? 24),
    validSince: r.validSince ?? '', validTill: r.validTill ?? '', active: r.active !== false,
  };
}

/** Řádek seznamu: co akce dělá a kdy platí. */
function popisBonusu(r: any): string {
  const co = [
    r.multiplier > 1 ? `${String(r.multiplier).replace('.', ',')}× body` : '',
    r.stampBonus > 0 ? czCount(r.stampBonus, KRAT) : '',
  ].filter(Boolean).join(' + ');
  const dny = r.days?.length ? r.days.map((d: number) => DOW.find(x => x.d === d)?.l).filter(Boolean).join(', ') : 'každý den';
  const hodiny = r.hourFrom === 0 && r.hourTill === 24 ? 'celý den' : `${r.hourFrom}:00–${r.hourTill}:00`;
  const okno = [r.validSince ? `od ${czDay(r.validSince)}` : '', r.validTill ? `do ${czDay(r.validTill)}` : ''].filter(Boolean).join(' ');
  return [co, dny, hodiny, okno].filter(Boolean).join(' · ');
}

function BonusAkce({ toast }: { toast: (m: string) => void }) {
  const meni = useOpravneni().ma('vernost.pravidla');
  const [list, setList] = useState<any[] | null>(null);
  const [bezi, setBezi] = useState<number[]>([]);
  const [form, setForm] = useState<ReturnType<typeof blankBonus> | null>(null);
  const [busy, setBusy] = useState('');
  const [mazu, setMazu] = useState<any | null>(null);
  const [chyba, setChyba] = useState('');
  const load = useCallback(() => fetch('/api/client/admin/bonus-rules').then(okJson)
    .then(d => { setList(d.rules ?? []); setBezi(d.nowActive ?? []); setChyba(''); })
    .catch(e => { setList([]); setChyba(apiMessage(e, 'Akce se nenačetly.')); }), []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form) return;
    setBusy('save');
    try {
      await j('/api/client/admin/bonus-rules', { method: form.id ? 'PATCH' : 'POST', body: JSON.stringify(form) });
      toast(form.id ? 'Akce uložena.' : 'Akce založena.'); setForm(null); load();
    } catch (e) { toast(apiMessage(e, 'Akci se nepodařilo uložit.')); }
    setBusy('');
  };
  const toggle = async (r: any) => {
    setBusy('toggle:' + r.id);
    try { await j('/api/client/admin/bonus-rules', { method: 'PATCH', body: JSON.stringify({ id: r.id, active: !r.active }) }); load(); }
    catch (e) { toast(apiMessage(e, 'Změna se nepovedla.')); }
    setBusy('');
  };
  const del = async (r: any) => {
    try { await j(`/api/client/admin/bonus-rules?id=${r.id}`, { method: 'DELETE' }); toast('Akce smazána.'); load(); }
    catch (e) { toast(apiMessage(e, 'Akci se nepodařilo smazat.')); }
  };

  if (list === null) return <Kostra />;

  if (form) {
    const f = form; const set = (patch: Partial<typeof f>) => setForm({ ...f, ...patch });
    const flip = (d: number) => set({ days: f.days.includes(d) ? f.days.filter(x => x !== d) : [...f.days, d] });
    return (
      <div className="space-y-4 max-w-3xl">
        <Button variant="ghost" size="sm" icon="undo" onClick={() => setForm(null)}>Zpět na akce</Button>
        <Card className="space-y-4">
          <div>
            <h2 className="t-card">{f.id ? `Upravit „${f.name || '…'}"` : 'Nová akce'}</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">Platí samo podle dne a hodiny, v pražském čase. Bonus se připíše v jednom řádku s poznámkou, žádné dvojí připsání. Víc akcí najednou se nesčítá: platí ta nejvýhodnější.</p>
          </div>
          <Field id="ba-name" label="Název (uvidí ho host)"><Input id="ba-name" value={f.name} onChange={e => set({ name: e.target.value })} placeholder="Happy hour" maxLength={80} disabled={!meni} /></Field>
          <div>
            <p className="field-label">Co akce přidává</p>
            <div className="flex flex-wrap items-end gap-4">
              <Field id="ba-mult" label="Násobič bodů" hint="1 až 10. 1 = bez změny.">
                <Input id="ba-mult" type="text" inputMode="decimal" className="!w-28 text-center" value={f.multiplier} onChange={e => set({ multiplier: e.target.value })} disabled={!meni} />
              </Field>
              <div className="flex flex-wrap gap-1.5 pb-1">
                {['1.5', '2', '3'].map(m => <Volba key={m} on={Number(f.multiplier) === Number(m)} onClick={() => { if (meni) set({ multiplier: m }); }}>{m.replace('.', ',')}×</Volba>)}
              </div>
              <Field id="ba-stamp" label="Razítek navíc" hint="0 až 10. 0 = žádné.">
                <Input id="ba-stamp" type="number" inputMode="numeric" min={0} max={10} className="!w-28 text-center" value={f.stampBonus} onChange={e => set({ stampBonus: e.target.value })} disabled={!meni} />
              </Field>
            </div>
          </div>
          <div className="border-t border-black/[0.06] pt-4 space-y-3">
            <p className="field-label">Kdy platí</p>
            <div className="flex flex-wrap gap-1.5">
              {DOW.map(d => <Volba key={d.d} on={f.days.includes(d.d)} onClick={() => { if (meni) flip(d.d); }}>{d.l}</Volba>)}
            </div>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-4">
              <Field id="ba-hf" label="Od hodiny"><Input id="ba-hf" type="number" inputMode="numeric" min={0} max={23} className="sm:!w-24 text-center" value={f.hourFrom} onChange={e => set({ hourFrom: e.target.value })} disabled={!meni} /></Field>
              <Field id="ba-ht" label="Do hodiny"><Input id="ba-ht" type="number" inputMode="numeric" min={1} max={24} className="sm:!w-24 text-center" value={f.hourTill} onChange={e => set({ hourTill: e.target.value })} disabled={!meni} /></Field>
              <Field id="ba-vs" label="Platí od"><Input id="ba-vs" type="date" value={f.validSince} onChange={e => set({ validSince: e.target.value })} disabled={!meni} /></Field>
              <Field id="ba-vt" label="Platí do"><Input id="ba-vt" type="date" value={f.validTill} onChange={e => set({ validTill: e.target.value })} disabled={!meni} /></Field>
            </div>
            <p className="t-meta">Žádný den nevybraný = každý den. Hodiny 0 až 24 = celý den; akce do 18 končí v 18:00.</p>
          </div>
          <ul className="list">
            <SwitchRow title="Akce je zapnutá" hint="Vypnutou akci si nechej v seznamu na příště." checked={f.active} onChange={v => { if (meni) set({ active: v }); }} disabled={!meni} />
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setForm(null)}>Zrušit</Button>
            {meni && <Button variant="primary" loading={busy === 'save'} onClick={save}>{f.id ? 'Uložit akci' : 'Založit akci'}</Button>}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {chyba && <p className="note note-wait">{chyba}</p>}
      <Card pad="none" aria-labelledby="v-bonus">
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <h2 id="v-bonus" className="t-card">Akce a bonusy</h2>
          {meni && <Button size="sm" variant="secondary" icon="plus" onClick={() => setForm(blankBonus())}>Nová akce</Button>}
        </div>
        {list.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState icon="gift" title="Zatím žádná akce" hint={meni ? 'Založ třeba happy hour: dvojnásobné body ve všední dny od 14 do 17.' : 'Podnik zatím žádnou akci nemá.'} compact /></div>
        ) : (
          <ul className="list px-5">
            {list.map((r: any) => (
              <ListRow key={r.id} className={r.active ? '' : 'opacity-55'}
                title={<span className="flex items-center gap-1.5 min-w-0"><span className="truncate">{r.name}</span>{bezi.includes(r.id) && <Chip tone="ok" size="sm">běží teď</Chip>}</span>}
                meta={popisBonusu(r)}
                actions={meni ? <>
                  <Switch checked={!!r.active} disabled={busy === 'toggle:' + r.id} onChange={() => { void toggle(r); }} label={`Zapnutá: ${r.name}`} />
                  <Menu size="sm" label={`Další akce s akcí ${r.name}`} items={[
                    { label: 'Upravit…', icon: 'pencil', onClick: () => setForm(bonusToForm(r)) },
                    { label: 'Smazat…', icon: 'trash', danger: true, onClick: () => setMazu(r) },
                  ]} />
                </> : undefined} />
            ))}
          </ul>
        )}
      </Card>
      {mazu && <Smazat title={`Smazat akci „${mazu.name}"?`} text="Body, které už host dostal, mu zůstanou. Akce jen přestane platit." onZavrit={() => setMazu(null)} onPotvrdit={() => { void del(mazu); }} />}
    </div>
  );
}

// ---- Rozcestník (plocha stránky Věrnost) ---------------------------------------

const POPIS_CASTI: Record<LoyaltySub, string> = {
  overview: 'Jak si věrnostní program vede a co se v něm poslední dobou dělo.',
  points: 'Za co host dostane body, kolik se mu vrátí jako kredit, a jaké úrovně a slevy si tím odemyká.',
  bonus: 'Časově omezené akce: dvojnásobné body v happy hour, razítka navíc v úterý. Platí samy podle dne a hodiny.',
  stamps: 'Razítkové kartičky — za návštěvy, za vybrané položky, nebo za útratu. Klidně víc najednou.',
  coupons: 'Co host uplatní: kupony se slevou v % i v měně podniku, X+Y, cílením a limity — a promo kódy na leták nebo účtenku.',
  vouchers: 'Dárkové poukazy s jedinečným kódem a QR: peněžní hodnota, platnost, uplatnění po částech u kasy a tisk.',
};

export default function LoyaltyTabs({ toast, promos, oznam, otevriCast }: {
  toast: (m: string) => void; promos: React.ReactNode; oznam: (text: string, ton?: 'ok' | 'bad') => void;
  /** Zvenku (z průvodce přechodem z Kartičky) otevře zadanou část; `n` se zvyšuje při každém požadavku. */
  otevriCast?: { id: LoyaltySub; n: number } | null;
}) {
  // Části jako záložky aplikace: podle `ma` (do načtení oprávnění všechny, pak jen povolené).
  const { ma } = useOpravneni();
  const casti = LOYALTY_SUBS.filter(c => ma(KLIC_CASTI[c.id]));
  const [volba, setVolba] = useState<LoyaltySub>(otevriCast?.id ?? 'overview');
  useEffect(() => { if (otevriCast) setVolba(otevriCast.id); }, [otevriCast]);
  const sub: LoyaltySub | null = casti.some(c => c.id === volba) ? volba : casti[0]?.id ?? null;
  const [ukladam, setUkladam] = useState(false);
  const nastroj0 = sub === 'overview' ? <Overview toast={toast} oznam={oznam} />
    : sub === 'points' ? <BodyAUrovne toast={toast} setUkladam={setUkladam} />
    : sub === 'bonus' ? <BonusAkce toast={toast} />
    : sub === 'stamps' ? <Stamps toast={toast} />
    : sub === 'coupons' ? <div className="space-y-4"><Coupons toast={toast} />{promos}</div>
    : sub === 'vouchers' ? <Poukazy toast={toast} />
    : null;
  // Čtečka u kasy: celoobrazovkový režim pro terminál s čtečkou kódů (vstup z Věrnosti).
  const nastroj = nastroj0 && ma('vernost.karta') ? <div className="space-y-3"><OdkazCtecka />{nastroj0}</div> : nastroj0;
  return (
    <PlochaWidgetu
      stranka="vedeni.klient_vernost"
      hlavicka={{
        title: 'Věrnost',
        hintId: sub ? `loyalty-${sub}` : undefined,
        subtitle: sub ? POPIS_CASTI[sub] : undefined,
        // Jediné „Uložit" pro body, cashback i úrovně (dřív tři limetky pod sebou).
        primary: sub === 'points' && ma('vernost.pravidla')
          ? <Button type="submit" form={FORM_BODY} variant="accent" loading={ukladam}>Uložit</Button>
          : undefined,
        aside: casti.length > 1 && sub
          ? <Segmented options={casti} value={sub} onChange={setVolba} size="sm" ariaLabel="Části věrnosti" />
          : undefined,
      }}
      nastroj={nastroj}
    />
  );
}
