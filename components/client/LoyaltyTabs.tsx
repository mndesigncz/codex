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

import { useCallback, useEffect, useState } from 'react';
import {
  BarSpark, Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Menu, Modal, Segmented, Skeleton, Stat, StatRow, Switch, SwitchRow, Well,
} from '../ui';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { czDay } from '@/lib/clientSlots';
import { czCount, type CzNoun } from '@/lib/czech';
import { useMoney, useSymbol } from '../CurrencyProvider';
import { apiMessage, okJson } from '@/lib/api';
import { PlochaWidgetu } from '../widgety/PlochaWidgetu';
import { useOpravneni } from '../role/useOpravneni';
import Poukazy from './Poukazy';
import OdkazCtecka from './OdkazCtecka';
import Kupony from './loyalty/Kupony';
import ClenoveSkupiny from './loyalty/ClenoveSkupiny';
import PrechodZKarticky, { useImportKarticky } from './PrechodZKarticky';
import KampanEditor, { kampanDoFormulare, prazdnaKampan, type FormKampane } from './loyalty/KampanEditor';
import RucniRazitka from './loyalty/RucniRazitka';
import { podleFiltru, RazitkaFiltr, StavChip, useRazitkaAkce, type FiltrStavu } from './loyalty/RazitkaAkce';
import { BodyDalsiPravidla, BodyNeaktivita, BodyNasobiceKredit } from './loyalty/BodyDalsiPravidla';
import { BodyNahled } from './loyalty/BodyNahled';
import { BodyPrehledy } from './loyalty/BodyPrehledy';
import BodyZdroje from './loyalty/BodyZdroje';
import { usePlan } from '../Pro';
import { MAX_ONLY_MSG } from '@/lib/plan';
import { validujPravidla, novaPolePravidel, MAX_PRAH_NAVSTEV, MAX_PRAH_UTRATY, MAX_BODU_ZA_100, MAX_CASHBACK_PCT } from '@/lib/bodyPravidla';

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
      <BodyPrehledy toast={toast} />
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
  const { max: maMax } = usePlan();
  // Chyby kontroly pravidel podle polí (stejná funkce jako na serveru); mažou se, jakmile se pole změní.
  const [chyby, setChyby] = useState<Record<string, string>>({});
  const { p, setP, reload: reloadProfile, error: profileError } = useProfile();
  if (profileError) return <ErrorState title="Věrnost se nenačetla" onRetry={reloadProfile} detail={profileError} />;
  if (!p) return <Kostra />;
  const upravP = (n: any) => { setP(n); if (Object.keys(chyby).length) setChyby({}); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meni) return;
    // Tarif se vysvětluje před uložením (poznámka nahoře, tlačítko je zhasnuté); tohle je jen pojistka.
    if (!maMax) { toast(MAX_ONLY_MSG); return; }
    const telo = {
      points_per_100: p.points_per_100, cashback_pct: p.cashback_pct, cashback_mode: p.cashback_mode, birthday_points: p.birthday_points, referral_points: p.referral_points, points_expire_days: p.points_expire_days,
      silver_at: p.silver_at, gold_at: p.gold_at, platinum_at: p.platinum_at,
      tier_by: p.tier_by === 'spend' ? 'spend' : 'visits', silver_spend: p.silver_spend, gold_spend: p.gold_spend, platinum_spend: p.platinum_spend,
      member_discount: p.member_discount, silver_discount: p.silver_discount, gold_discount: p.gold_discount, platinum_discount: p.platinum_discount,
      reactivation_days: p.reactivation_days ?? 0, reactivation_points: p.reactivation_points ?? 0,
      ...novaPolePravidel(p),
    };
    const ch = validujPravidla(telo);
    if (ch.length) { setChyby(Object.fromEntries(ch.map(c => [c.pole, c.text]))); toast(ch[0].text); return; }
    setUkladam(true);
    try {
      const r = await j('/api/client/admin/profile', { method: 'PUT', body: JSON.stringify(telo) });
      setP(r.profile); toast('Pravidla bodů, úrovně a slevy uloženy.');
    } catch (err) { toast(apiMessage(err, 'Uložení se nepovedlo.')); }
    setUkladam(false);
  };
  const cislo = (id: string, lb: string, hint: string, key: string, max: number, min = 0) => (
    <Field id={id} label={lb} hint={hint} error={chyby[key]}>
      <Input id={id} type="number" min={min} max={max} disabled={!meni} className="!w-28" value={p[key] ?? 0} onChange={e => upravP({ ...p, [key]: e.target.value })} />
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
      <form id={FORM_BODY} onSubmit={save} noValidate className="space-y-4">
        {!meni && <p className="note note-wait">Pravidla věrnosti tu jen vidíš — měnit je může, kdo má na starosti věrnostní program.</p>}
        {meni && !maMax && <p className="note note-wait" role="status">Pravidla věrnosti jde ukládat jen v plánu Max, takže tlačítko Uložit je zhasnuté. Plán změníš v Nastavení → Předplatné.</p>}
        <Card className="space-y-4">
          <div>
            <h2 className="t-card">Za co host dostane body</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">Body se sbírají samy: z objednávek od stolu, při načtení kartičky u kasy a při událostech níž. Utratí se za kupony.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {cislo('l-per100', `Bodů za 100 ${symbol}`, 'Kolik bodů dá každá celá stovka. Jak se zlomek stovky počítá, nastavíš níž.', 'points_per_100', MAX_BODU_ZA_100)}
            {cislo('l-bday', 'Bodů k narozeninám', 'Dárek v den narozenin. 0 = nedávat.', 'birthday_points', 1000)}
            {cislo('l-ref', 'Bodů za pozvání', 'Pro oba, když kamarád poprvé přijde. 0 = vypnuto.', 'referral_points', 1000)}
          </div>
        </Card>
        <BodyDalsiPravidla p={p} setP={upravP} meni={meni} chyby={chyby} />
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
            {cislo('l-cash', 'Vrátit (%)', '0 = nepoužívat.', 'cashback_pct', MAX_CASHBACK_PCT)}
            <div>
              <p className="field-label">V čem se vrací</p>
              <Segmented options={[{ id: 'credit', label: `Kredit v ${symbol}` }, { id: 'points', label: 'Body' }]}
                value={p.cashback_mode === 'points' ? 'points' : 'credit'} onChange={v => { if (meni) upravP({ ...p, cashback_mode: v }); }} size="sm" ariaLabel="Podoba cashbacku" />
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
        <BodyNahled p={p} />
        <Card className="space-y-4">
          <div>
            <h2 className="t-card">Úrovně hostů a jejich sleva</h2>
            <p className="t-meta mt-0.5 max-w-[70ch]">{podleUtraty ? 'Čím víc host celkem utratí, tím lepší úroveň.' : 'Čím víc návštěv, tím lepší úroveň.'} Sleva je informace pro obsluhu: při načtení kartičky u kasy uvidí, kolik hostovi odečíst. Úroveň vidí i host na své stránce.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="field-label !mb-0">Úrovně podle</p>
            <Segmented options={[{ id: 'visits', label: 'Návštěv' }, { id: 'spend', label: 'Útraty' }]}
              value={podleUtraty ? 'spend' : 'visits'} onChange={v => { if (meni) upravP({ ...p, tier_by: v }); }} size="sm" ariaLabel="Úrovně podle" />
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
                  <Field id={`t-${t.id}`} label={podleUtraty ? `Útrata (${symbol})` : 'Návštěv'} error={chyby[t.atKey]}>
                    <Input id={`t-${t.id}`} type="number" min={t.id === 'platinum' ? 0 : 1} max={podleUtraty ? MAX_PRAH_UTRATY : MAX_PRAH_NAVSTEV} disabled={!meni} className={podleUtraty ? '!w-32' : '!w-24'} value={p[t.atKey] ?? 0} onChange={e => upravP({ ...p, [t.atKey!]: e.target.value })} />
                  </Field>
                ) : <span className="hidden sm:block" />}
                <Field id={`d-${t.id}`} label="Sleva %" error={chyby[t.discKey]}>
                  <Input id={`d-${t.id}`} type="number" min={0} max={90} disabled={!meni} className="!w-24" value={p[t.discKey] ?? 0} onChange={e => upravP({ ...p, [t.discKey]: e.target.value })} />
                </Field>
              </Well>
            ))}
          </ul>
          <p className="t-meta">Sleva se nepočítá automaticky do pokladny — obsluha ji zadá sama. Nulová sleva znamená, že úroveň je jen odznak. Uvítacích 10 bodů dostane každý nový člen automaticky; ruční úpravu bodů a kreditu najdeš u hosta v Zákaznících.</p>
        </Card>
        <BodyNeaktivita p={p} setP={upravP} meni={meni} chyby={chyby} />
        <BodyNasobiceKredit p={p} setP={upravP} meni={meni} chyby={chyby} />
      </form>
      <BodyZdroje toast={toast} />
      {ma('zakaznici.zobrazit') && <ClenoveSkupiny toast={toast} />}
    </div>
  );
}

// ---- Razítka --------------------------------------------------------------------
// Kartičky jako v Kartičce: podnik jich má víc vedle sebe (10+1 dýmka, 5+1
// čaj…), každá s vlastním pravidlem, odměnou a opakováním.

const RULE_NAME: Record<string, string> = { visit: 'za návštěvu', products: 'za položky', min_value: 'za útratu' };

function Stamps({ toast }: { toast: (m: string) => void }) {
  const { ma } = useOpravneni();
  const meni = ma('vernost.kampane');
  const smiRucne = ma('vernost.razitka_upravit');
  const money = useMoney();
  const [list, setList] = useState<any[] | null>(null);
  const [form, setForm] = useState<FormKampane | null>(null);
  const [chyba, setChyba] = useState('');
  const [busy, setBusy] = useState('');
  const [mazu, setMazu] = useState<any | null>(null);
  const [rucne, setRucne] = useState<any | null>(null);
  const load = useCallback(() => fetch('/api/client/admin/stamps').then(okJson).then(d => setList(d.campaigns ?? [])).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);

  const save = async (jako: 'koncept' | 'spustit' | 'ulozit') => {
    if (!form) return;
    setBusy(jako); setChyba('');
    try {
      const status = jako === 'koncept' ? 'draft' : jako === 'spustit' ? 'active' : form.status;
      const body = JSON.stringify({ ...form, status, minValue: form.minValue === '' ? null : Number(form.minValue) });
      await j('/api/client/admin/stamps', { method: form.id ? 'PATCH' : 'POST', body });
      toast(jako === 'koncept' ? 'Koncept uložen.' : form.id ? 'Kartička uložena.' : 'Kartička založena.'); setForm(null); load();
    } catch (e) { setChyba(apiMessage(e, 'Kartičku se nepodařilo uložit.')); }
    setBusy('');
  };
  const del = async (c: any) => {
    try { await j(`/api/client/admin/stamps?id=${c.id}`, { method: 'DELETE' }); toast('Kartička smazána.'); setForm(null); load(); }
    catch (e) { toast(apiMessage(e, 'Kartičku se nepodařilo smazat.')); }
  };
  const [filtr, setFiltr] = useState<FiltrStavu>('all');
  const akce = useRazitkaAkce({ reload: load, toast, meni, upravit: c => { setChyba(''); setForm(kampanDoFormulare(c)); }, smazat: c => setMazu(c), rucne: smiRucne ? c => setRucne(c) : undefined });

  if (list === null) return <Kostra />;

  // --- editor (jedno místo pro všechna nastavení kartičky, vpravo náhled pohledem hosta) ---
  if (form) {
    return (
      <div className="max-w-5xl">
        <KampanEditor form={form} onChange={setForm} onZpet={() => { setForm(null); setChyba(''); }} onUlozit={save} busy={busy} chyba={chyba} />
      </div>
    );
  }

  // --- seznam ---
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <p className="t-meta max-w-[60ch]">Kartiček může běžet víc vedle sebe — třeba „10+1 dýmka" a „5+1 čaj". Razítka z účtenky připisuje obsluha u kasy jedním klepnutím.</p>
        {meni && <Button variant="secondary" icon="plus" onClick={() => { setChyba(''); setForm(prazdnaKampan()); }}>Nová kartička</Button>}
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
                  `${czCount(Number(c.required_stamps) || 0, RAZITKO)} ${RULE_NAME[c.rule_type] ?? ''}${c.rule_type === 'products' && (c.stampItems?.length || c.stampSections?.length) ? `: ${[...(c.stampSections ?? []).map((x: any) => `kategorie ${x.name}`), ...(c.stampItems ?? []).map((x: any) => x.name)].join(', ')}` : ''}${c.rule_type === 'min_value' && c.min_value ? ` od ${money(c.min_value)}` : ''}`,
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
      {rucne && <RucniRazitka kampan={rucne} onZavrit={() => setRucne(null)} onHotovo={m => { setRucne(null); toast(m); void load(); }} />}
      <p className="t-meta max-w-[75ch]">Razítka připíše obsluha u kasy: buď „razítko za návštěvu", nebo výběrem účtenky hosta — z jejích položek se pravidla vyhodnotí sama. Za plnou kartu dostane host kupon s kódem.</p>
      {mazu && (
        <Smazat title={`Smazat kartičku „${mazu.name}"?`} onZavrit={() => setMazu(null)} onPotvrdit={() => { void del(mazu); }}
          text={`Rozsbíraná razítka (${czCount(Number(mazu.collectors) || 0, HOST)}) zmizí. Vydané kupony zůstanou.`} />
      )}
    </div>
  );
}

// ---- Kupony ---------------------------------------------------------------------
// Kupony a promo kódy žijí v components/client/loyalty/Kupony*.tsx (katalog, editor, náhled, rozesílání, přehled).

const DOW = [{ d: 1, l: 'Po' }, { d: 2, l: 'Út' }, { d: 3, l: 'St' }, { d: 4, l: 'Čt' }, { d: 5, l: 'Pá' }, { d: 6, l: 'So' }, { d: 7, l: 'Ne' }];


/** Přepínací filtr (vícenásobný výběr) — filter-pill jako všude, vybraný inkoustový s bílým textem. */
function Volba({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={`filter-pill tap-target-sm ${on ? 'seg-on' : 'seg-off glass'}`}>
      {children}
    </button>
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
  const { max: maMax } = usePlan();
  const nastroj0 = sub === 'overview' ? <Overview toast={toast} oznam={oznam} />
    : sub === 'points' ? <BodyAUrovne toast={toast} setUkladam={setUkladam} />
    : sub === 'bonus' ? <BonusAkce toast={toast} />
    : sub === 'stamps' ? <Stamps toast={toast} />
    : sub === 'coupons' ? <div className="space-y-4"><Kupony toast={toast} />{promos}</div>
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
          ? <Button type="submit" form={FORM_BODY} variant="accent" loading={ukladam} disabled={!maMax}>Uložit</Button>
          : undefined,
        aside: casti.length > 1 && sub
          ? <Segmented options={casti} value={sub} onChange={setVolba} size="sm" ariaLabel="Části věrnosti" />
          : undefined,
      }}
      nastroj={nastroj}
    />
  );
}
