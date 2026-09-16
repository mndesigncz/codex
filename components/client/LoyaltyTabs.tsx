'use client';

// Věrnostní program rozdělený jako v Kartičce: co dává body, jak se sbírají
// razítka, co se dá za body pořídit, jaké slevy plynou z úrovně, a promo
// kódy na letáky. Každá část zvlášť, ať se v tom vedení vyzná.

import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Segmented, EmptyState, Skeleton } from '../ui';
import { Initials } from './ClientShell';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { czDay } from '@/lib/clientSlots';

const input = 'w-full rounded-2xl bg-white/70 border border-black/[0.08] px-4 py-2.5 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/60 focus:ring-2 focus:ring-[#C8F542]/25 focus:outline-none transition text-sm';
const label = 'block text-xs font-semibold text-black/55 mb-1.5';

export type LoyaltySub = 'overview' | 'points' | 'stamps' | 'coupons' | 'tiers' | 'promos';
export const LOYALTY_SUBS: { id: LoyaltySub; label: string }[] = [
  { id: 'overview', label: 'Přehled' },
  { id: 'points', label: 'Body' },
  { id: 'stamps', label: 'Razítka' },
  { id: 'coupons', label: 'Kupony' },
  { id: 'tiers', label: 'Slevy a úrovně' },
  { id: 'promos', label: 'Promo kódy' },
];

async function j(url: string, init?: RequestInit) {
  const r = await fetch(url, init ? { headers: { 'Content-Type': 'application/json' }, ...init } : undefined);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Nepovedlo se.');
  return d;
}

/** Společný háček na profil: pravidla věrnosti se nastavují na víc místech. */
function useProfile() {
  const [p, setP] = useState<any | null>(null);
  const load = useCallback(() => fetch('/api/client/admin/profile').then(r => r.json()).then(d => setP(d.profile)).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);
  return { p, setP, reload: load };
}

function Tile({ icon, label: lb, value, unit, tone = 'ok' }: { icon: string; label: string; value: number | string; unit?: string; tone?: 'ok' | 'muted' | 'wait' }) {
  const ring = tone === 'wait' ? 'bg-amber-500/15 border-amber-500/25 text-amber-800' : tone === 'muted' ? 'bg-black/[0.05] border-black/[0.08] text-black/55' : 'bg-[#C8F542]/15 border-[#C8F542]/30 text-[#4F6A07]';
  return (
    <div className="glass-card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wider text-black/50 leading-tight">{lb}</p>
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${ring}`}><Icon name={icon} size={16} /></span>
      </div>
      <p className="text-3xl font-bold tracking-tight tabular-nums text-[#16181A] mt-3">{value}{unit && <span className="text-base font-medium text-black/45 ml-1">{unit}</span>}</p>
    </div>
  );
}

function Saver({ busy, onSave, children, title, hint }: { busy: boolean; onSave: () => void; children: React.ReactNode; title: string; hint?: string }) {
  return (
    <section className="glass-card p-5 space-y-4">
      <div>
        <h2 className="font-bold tracking-tight">{title}</h2>
        {hint && <p className="text-xs text-black/50 mt-0.5 max-w-[70ch]">{hint}</p>}
      </div>
      {children}
      <Button variant="accent" loading={busy} onClick={onSave}>Uložit</Button>
    </section>
  );
}

// ---- Přehled --------------------------------------------------------------------

function Overview({ go }: { go: (s: LoyaltySub) => void }) {
  const [d, setD] = useState<any | null>(null);
  const { p, setP } = useProfile();
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch('/api/client/admin/loyalty').then(r => r.json()).then(setD).catch(() => setD({ summary: null, recent: [] })); }, []);
  const toggle = async () => {
    setBusy(true);
    try { const r = await j('/api/client/admin/profile', { method: 'PUT', body: JSON.stringify({ loyalty_on: !p.loyalty_on }) }); setP(r.profile); } catch { /* tichá chyba, stav se nezmění */ }
    setBusy(false);
  };
  if (!d || !p) return <Skeleton className="h-64 rounded-3xl" />;
  const s = d.summary ?? {};
  return (
    <div className="space-y-5">
      {!p.loyalty_on && (
        <div className="rounded-3xl border border-amber-500/25 bg-amber-500/[0.07] p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap">
          <p className="font-semibold text-[#16181A] flex items-center gap-2"><Icon name="warning" size={17} className="text-amber-700" />Věrnost je pro hosty vypnutá.</p>
          <Button size="sm" variant="accent" loading={busy} onClick={toggle}>Zapnout</Button>
        </div>
      )}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile icon="users" label="Členů" value={s.members ?? 0} tone="muted" />
        <Tile icon="coins" label="Bodů v oběhu" value={s.points ?? 0} />
        <Tile icon="card" label="Kredit hostů" value={s.credit ?? 0} unit="Kč" />
        <Tile icon="gift" label="Kupony k vyzvednutí" value={s.couponsOpen ?? 0} tone={(s.couponsOpen ?? 0) > 0 ? 'wait' : 'ok'} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-5 items-start">
        <section className="glass-card p-4 sm:p-5">
          <h2 className="text-base font-bold tracking-tight mb-3">Poslední pohyby</h2>
          {(d.recent ?? []).length === 0 ? <p className="text-sm text-black/55">Zatím se nic nedělo. První body přijdou s objednávkou nebo razítkem u kasy.</p> : (
            <ul className="divide-y divide-black/[0.06]">
              {d.recent.map((l: any) => (
                <li key={l.id} className="py-2.5 flex items-center gap-3">
                  <Initials name={l.customer_name} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate text-sm">{l.customer_name}</p>
                    <p className="text-xs text-black/50 truncate">{l.note || l.kind}</p>
                  </div>
                  <span className={`shrink-0 font-semibold tabular-nums text-sm ${(l.delta || l.credit_delta) > 0 ? 'text-[#3E5406]' : 'text-red-700'}`}>
                    {l.delta ? `${l.delta > 0 ? '+' : ''}${l.delta} b.` : `${l.credit_delta > 0 ? '+' : ''}${l.credit_delta} Kč`}
                  </span>
                  <span className="shrink-0 text-xs text-black/40 w-24 text-right hidden sm:block">{dbTimeDayHM(l.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="glass-card p-4 sm:p-5 space-y-3">
          <h2 className="text-base font-bold tracking-tight">Za posledních 30 dní</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-black/50 text-xs">Rozdáno bodů</dt><dd className="text-xl font-bold tabular-nums">{s.pointsGiven30 ?? 0}</dd></div>
            <div><dt className="text-black/50 text-xs">Utraceno bodů</dt><dd className="text-xl font-bold tabular-nums">{s.pointsSpent30 ?? 0}</dd></div>
            <div><dt className="text-black/50 text-xs">Nových členů</dt><dd className="text-xl font-bold tabular-nums">{s.newMembers30 ?? 0}</dd></div>
            <div><dt className="text-black/50 text-xs">Razítek celkem</dt><dd className="text-xl font-bold tabular-nums">{s.stamps ?? 0}</dd></div>
          </dl>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="secondary" icon="coins" onClick={() => go('points')}>Pravidla bodů</Button>
            <Button size="sm" variant="ghost" icon="gift" onClick={() => go('coupons')}>Kupony</Button>
          </div>
        </section>
      </div>
    </div>
  );
}

// ---- Body -----------------------------------------------------------------------

function Points({ toast }: { toast: (m: string) => void }) {
  const { p, setP } = useProfile();
  const [busy, setBusy] = useState(false);
  if (!p) return <Skeleton className="h-64 rounded-3xl" />;
  const save = async () => {
    setBusy(true);
    try {
      const r = await j('/api/client/admin/profile', { method: 'PUT', body: JSON.stringify({ points_per_100: p.points_per_100, cashback_pct: p.cashback_pct, birthday_points: p.birthday_points, referral_points: p.referral_points }) });
      setP(r.profile); toast('Pravidla bodů uložena.');
    } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  const row = (id: string, lb: string, hint: string, key: string, max: number, unit: string) => (
    <div className="grid grid-cols-[7rem_1fr] gap-3 items-start">
      <div><label htmlFor={id} className={label}>{lb}</label>
        <div className="flex items-center gap-1.5">
          <input id={id} type="number" min={0} max={max} value={p[key] ?? 0} onChange={e => setP({ ...p, [key]: e.target.value })} className={input} />
        </div>
      </div>
      <p className="text-xs text-black/55 pt-7">{unit} {hint}</p>
    </div>
  );
  return (
    <div className="space-y-5 max-w-3xl">
      <Saver busy={busy} onSave={save} title="Za co host dostane body" hint="Body se sbírají samy: z objednávek od stolu, při načtení kartičky u kasy a při událostech níž. Utratí se za kupony.">
        {row('l-per100', 'Za 100 Kč', 'útraty. Objednávka za 250 Kč tedy dá dvojnásobek.', 'points_per_100', 100, 'bodů')}
        {row('l-bday', 'Narozeniny', 'jako dárek v den narozenin. 0 = nedávat.', 'birthday_points', 1000, 'bodů')}
        {row('l-ref', 'Pozvání', 'pro oba, když pozvaný kamarád poprvé vstoupí do podniku. 0 = vypnuto.', 'referral_points', 1000, 'bodů')}
      </Saver>
      <Saver busy={busy} onSave={save} title="Kredit z útraty" hint="Cashback jako v Kartičce: část útraty se hostovi vrátí jako kredit v korunách. Kredit uplatní u kasy — obsluha ho odečte při načtení kartičky.">
        {row('l-cash', 'Vrátit', 'z útraty jako kredit. 0 = nepoužívat. Kredit se načítá při zaúčtování útraty u kasy.', 'cashback_pct', 50, '%')}
      </Saver>
      <p className="text-xs text-black/50">Uvítacích 10 bodů dostane každý nový člen automaticky. Ruční úpravu bodů i kreditu najdeš u konkrétního hosta v Zákaznících.</p>
    </div>
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
  const chosen = new Set(value.map(v => v.itemId));
  const needle = q.trim().toLowerCase();
  const found = needle ? items.filter(i => !chosen.has(i.id) && i.name.toLowerCase().includes(needle)).slice(0, 6) : [];
  const unpaired = items.length > 0 && value.some(v => items.find(i => i.id === v.itemId)?.paired === false);
  return (
    <div>
      <label className="block text-xs font-semibold text-black/55 mb-1.5">{lb}</label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map(v => (
            <span key={v.itemId} className="inline-flex items-center gap-1 rounded-full bg-[#C8F542]/20 border border-[#C8F542]/40 pl-3 pr-1.5 py-1 text-xs font-semibold text-[#3E5406]">
              {v.name}
              <button type="button" aria-label={`Odebrat ${v.name}`} onClick={() => onChange(value.filter(x => x.itemId !== v.itemId))}
                className="tap-target-sm grid place-items-center h-5 w-5 rounded-full hover:bg-black/[0.08] text-black/45"><Icon name="close" size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={items.length ? 'Hledej v nabídce…' : 'Nabídka je prázdná'} disabled={!items.length}
        className={input} aria-label={lb} />
      {found.length > 0 && (
        <ul className="mt-1.5 rounded-2xl border border-black/[0.08] bg-white/85 divide-y divide-black/[0.05] overflow-hidden">
          {found.map(i => (
            <li key={i.id}>
              <button type="button" onClick={() => { onChange([...value, { itemId: i.id, name: i.name }]); setQ(''); }}
                className="w-full text-left px-3.5 py-2 hover:bg-[#C8F542]/15 transition flex items-center gap-2">
                <span className="text-sm font-medium min-w-0 flex-1 truncate">{i.name}</span>
                <span className="text-[11px] text-black/45 shrink-0">{i.board}</span>
                {!i.paired && <span className="shrink-0 text-[10px] font-semibold rounded-full bg-amber-500/15 text-amber-800 px-2 py-0.5">bez pokladny</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {hint && <p className="text-xs text-black/50 mt-1.5">{hint}</p>}
      {unpaired && <p className="text-xs text-amber-800 mt-1.5">Některé vybrané položky nejsou spárované s pokladnou — z účtenky se za ně razítko nepřipíše, jen ručně.</p>}
    </div>
  );
}

function Stamps({ toast }: { toast: (m: string) => void }) {
  const [list, setList] = useState<any[] | null>(null);
  const [form, setForm] = useState<ReturnType<typeof blankCampaign> | null>(null);
  const [items, setItems] = useState<{ id: number; name: string; board: string; paired: boolean }[]>([]);
  const [busy, setBusy] = useState('');
  const load = useCallback(() => fetch('/api/client/admin/stamps').then(r => r.json()).then(d => setList(d.campaigns ?? [])).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    // Položky nabídky pro výběr „za položky" — přes všechny desky najednou.
    fetch('/api/menu').then(r => r.json()).then(d => {
      const flat: any[] = [];
      for (const b of d.boards ?? []) for (const s of b.sections ?? []) for (const i of s.items ?? []) {
        flat.push({ id: i.id, name: i.name, board: b.name, paired: !!i.posProductId });
      }
      setItems(flat);
    }).catch(() => {});
  }, []);

  const save = async () => {
    if (!form) return;
    setBusy('save');
    try {
      const body = JSON.stringify({ ...form, minValue: form.minValue === '' ? null : Number(form.minValue) });
      await j('/api/client/admin/stamps', { method: form.id ? 'PATCH' : 'POST', body });
      toast(form.id ? 'Kartička uložena.' : 'Kartička založena.'); setForm(null); load();
    } catch (e: any) { toast(e.message); }
    setBusy('');
  };
  const toggle = async (c: any) => {
    setBusy('toggle:' + c.id);
    try { await j('/api/client/admin/stamps', { method: 'PATCH', body: JSON.stringify({ ...campaignToForm(c), active: !c.active }) }); load(); }
    catch (e: any) { toast(e.message); }
    setBusy('');
  };
  const del = async (c: any) => {
    if (!confirm(`Smazat kartičku „${c.name}"? Rozsbíraná razítka ${c.collectors} hostů zmizí. Vydané kupony zůstanou.`)) return;
    setBusy('del:' + c.id);
    try { await j(`/api/client/admin/stamps?id=${c.id}`, { method: 'DELETE' }); toast('Kartička smazána.'); setForm(null); load(); }
    catch (e: any) { toast(e.message); }
    setBusy('');
  };

  if (list === null) return <Skeleton className="h-64 rounded-3xl" />;

  // --- editor ---
  if (form) {
    const f = form; const set = (patch: any) => setForm({ ...f, ...patch });
    const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.round(Number(v) || 0)));
    return (
      <div className="space-y-5 max-w-3xl">
        <button type="button" onClick={() => setForm(null)} className="tap-target-sm inline-flex items-center gap-1.5 text-sm font-semibold text-black/55 hover:text-black transition">
          <Icon name="chevron" size={15} className="rotate-90" />Zpět na kartičky
        </button>
        <section className="glass-card p-5 space-y-4">
          <div>
            <h2 className="font-bold tracking-tight">{f.id ? `Upravit „${f.name || '…'}"` : 'Nová kartička'}</h2>
            <p className="text-xs text-black/50 mt-0.5 max-w-[70ch]">Za plnou kartu dostane host kupon s kódem — obsluha ho uplatní u kasy.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label htmlFor="sc-name" className={label}>Název</label><input id="sc-name" value={f.name} onChange={e => set({ name: e.target.value })} placeholder="10 + 1 dýmka zdarma" className={input} maxLength={120} /></div>
            <div><label htmlFor="sc-req" className={label}>Razítek do odměny</label><input id="sc-req" type="number" min={1} max={50} value={f.requiredStamps} onChange={e => set({ requiredStamps: num(e.target.value, 1, 50) })} className={input} /></div>
          </div>
          <div><label htmlFor="sc-desc" className={label}>Popis pro hosta</label><input id="sc-desc" value={f.description} onChange={e => set({ description: e.target.value })} placeholder="Každá desátá dýmka je na nás." className={input} maxLength={200} /></div>
          <div>
            <p className={label}>Za co se razítko připisuje</p>
            <Segmented options={RULE_OPTS} value={f.ruleType} onChange={v => set({ ruleType: v })} size="sm" ariaLabel="Pravidlo razítka" wrap />
            {f.ruleType === 'visit' && <p className="text-xs text-black/50 mt-2">Jedno razítko za návštěvu — obsluha ho dá při načtení kartičky u kasy, nejvýš jedno denně.</p>}
            {f.ruleType === 'products' && (
              <div className="mt-3 space-y-3">
                <ItemPicker items={items} value={f.stampItems} onChange={v => set({ stampItems: v })} label="Položky, které dávají razítko"
                  hint="Razítko za každý kus z účtenky. Obsluha u kasy zvolí účtenku hosta a razítka se připíší sama." />
                <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={f.onePerOrder} onChange={e => set({ onePerOrder: e.target.checked })} className="h-4 w-4 rounded accent-[#89AC16]" />
                  Nejvýš jedno razítko z jedné účtenky
                </label>
              </div>
            )}
            {f.ruleType === 'min_value' && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-[8rem_1fr] gap-3 items-end">
                  <div><label htmlFor="sc-min" className={label}>Útrata od (Kč)</label><input id="sc-min" type="number" min={1} max={100000} value={f.minValue} onChange={e => set({ minValue: e.target.value })} placeholder="300" className={input} /></div>
                  <p className="text-xs text-black/55 pb-2.5">Razítko za účtenku aspoň na tuhle částku.</p>
                </div>
                <label className="flex items-center gap-2.5 text-sm cursor-pointer">
                  <input type="checkbox" checked={f.minValueMultiple} onChange={e => set({ minValueMultiple: e.target.checked })} className="h-4 w-4 rounded accent-[#89AC16]" />
                  Razítko za každý násobek částky (600 Kč = 2 razítka)
                </label>
              </div>
            )}
          </div>
          <div className="border-t border-black/[0.06] pt-4 space-y-3">
            <div><label htmlFor="sc-rew" className={label}>Odměna za plnou kartu</label><input id="sc-rew" value={f.rewardTitle} onChange={e => set({ rewardTitle: e.target.value })} placeholder="Dýmka zdarma" className={input} maxLength={160} /></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div><label htmlFor="sc-fin" className={label}>Dní na nasbírání</label><input id="sc-fin" type="number" min={0} max={365} value={f.daysToFinish} onChange={e => set({ daysToFinish: num(e.target.value, 0, 365) })} className={input} /></div>
              <div><label htmlFor="sc-red" className={label}>Dní na uplatnění</label><input id="sc-red" type="number" min={0} max={365} value={f.daysToRedeem} onChange={e => set({ daysToRedeem: num(e.target.value, 0, 365) })} className={input} /></div>
            </div>
            <p className="text-xs text-black/50">0 = bez omezení. Když host kartu nedosbírá včas, začíná znovu; kupon po lhůtě propadne.</p>
            <div>
              <p className={label}>Další karta po dokončení</p>
              <Segmented options={REPEAT_OPTS} value={f.repeatMode} onChange={v => set({ repeatMode: v })} size="sm" ariaLabel="Opakování karty" wrap />
            </div>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input type="checkbox" checked={f.stackCards} onChange={e => set({ stackCards: e.target.checked })} className="h-4 w-4 rounded accent-[#89AC16]" />
              Přebytek razítek se přenáší do další karty
            </label>
          </div>
          <div className="border-t border-black/[0.06] pt-4">
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              <div><label htmlFor="sc-since" className={label}>Platí od</label><input id="sc-since" type="date" value={f.validSince} onChange={e => set({ validSince: e.target.value })} className={input} /></div>
              <div><label htmlFor="sc-till" className={label}>Platí do</label><input id="sc-till" type="date" value={f.validTill} onChange={e => set({ validTill: e.target.value })} className={input} /></div>
            </div>
            <p className="text-xs text-black/50 mt-1.5">Prázdné = běží pořád. Hodí se pro sezónní kartičky.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="accent" loading={busy === 'save'} onClick={save}>{f.id ? 'Uložit kartičku' : 'Založit kartičku'}</Button>
            <Button variant="ghost" onClick={() => setForm(null)}>Zrušit</Button>
          </div>
        </section>
      </div>
    );
  }

  // --- seznam ---
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-black/55 max-w-[60ch]">Kartiček může běžet víc vedle sebe — třeba „10+1 dýmka" a „5+1 čaj". Razítka z účtenky připisuje obsluha u kasy jedním klepnutím.</p>
        <Button variant="accent" icon="plus" onClick={() => setForm(blankCampaign())}>Nová kartička</Button>
      </div>
      {list.length === 0 ? (
        <EmptyState icon="check" title="Zatím žádná kartička" hint="Založ první — třeba „každá desátá dýmka zdarma“. Hosté ji uvidí na tvé stránce hned." compact />
      ) : (
        <ul className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {list.map((c: any) => (
            <li key={c.id} className={`glass-card p-4 sm:p-5 ${c.active ? '' : 'opacity-60'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold tracking-tight truncate">{c.name}</p>
                  <p className="text-xs text-black/55 mt-0.5">
                    {c.required_stamps} razítek {RULE_NAME[c.rule_type] ?? ''}
                    {c.rule_type === 'products' && c.stampItems?.length > 0 && `: ${c.stampItems.map((x: any) => x.name).join(', ')}`}
                    {c.rule_type === 'min_value' && c.min_value ? ` od ${c.min_value} Kč` : ''}
                  </p>
                </div>
                <button onClick={() => toggle(c)} disabled={busy === 'toggle:' + c.id} aria-pressed={!!c.active}
                  className={`tap-target-sm shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${c.active ? 'bg-[#C8F542]/25 text-[#3E5406]' : 'bg-black/[0.06] text-black/55'}`}>
                  {c.active ? 'Běží' : 'Vypnutá'}
                </button>
              </div>
              <div className="flex gap-1 mt-3" aria-hidden>
                {Array.from({ length: Math.min(Number(c.required_stamps) || 1, 12) }).map((_, i) => (
                  <span key={i} className={`h-2 flex-1 rounded-full ${i < 3 ? 'bg-[#C8F542]' : 'bg-black/[0.08]'}`} />
                ))}
              </div>
              <p className="text-xs text-black/55 mt-2">Odměna: <strong className="text-black/75">{c.reward_title || '—'}</strong></p>
              <div className="flex items-center justify-between gap-3 mt-3 border-t border-black/[0.06] pt-3">
                <p className="text-xs text-black/50 tabular-nums">{c.collectors} sbírá · {c.completions}× dokončeno</p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setForm(campaignToForm(c))}>Upravit</Button>
                  <Button size="sm" variant="ghost" loading={busy === 'del:' + c.id} onClick={() => del(c)}>Smazat</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-black/50 max-w-[75ch]">Razítka připíše obsluha u kasy: buď „razítko za návštěvu", nebo výběrem účtenky hosta — z jejích položek se pravidla vyhodnotí sama. Za plnou kartu dostane host kupon s kódem.</p>
    </div>
  );
}

// ---- Kupony ---------------------------------------------------------------------

function Coupons({ toast }: { toast: (m: string) => void }) {
  const [list, setList] = useState<any[] | null>(null);
  const [f, setF] = useState({ title: '', description: '', cost_points: 100, valid_until: '' });
  const [code, setCode] = useState(''); const [busy, setBusy] = useState(false);
  const load = useCallback(() => fetch('/api/client/admin/coupons').then(r => r.json()).then(d => setList(d.coupons ?? [])).catch(() => setList([])), []);
  useEffect(() => { load(); }, [load]);
  const add = async (e: React.FormEvent) => {
    e.preventDefault(); if (!f.title.trim()) return; setBusy(true);
    try { await j('/api/client/admin/coupons', { method: 'POST', body: JSON.stringify(f) }); setF({ title: '', description: '', cost_points: 100, valid_until: '' }); load(); toast('Kupon přidán.'); }
    catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  const redeem = async (e: React.FormEvent) => {
    e.preventDefault(); if (!code.trim()) return; setBusy(true);
    try { const r = await j('/api/client/admin/redeem', { method: 'POST', body: JSON.stringify({ code }) }); toast(`Uplatněno: ${r.title} · ${r.customer}.`); setCode(''); load(); }
    catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  const toggle = async (c: any) => {
    try { await j('/api/client/admin/coupons', { method: 'PATCH', body: JSON.stringify({ id: c.id, active: !c.active }) }); load(); }
    catch (e: any) { toast(e.message); }
  };
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6 items-start">
      <div className="space-y-5">
        <form onSubmit={add} className="glass-card p-5 space-y-3">
          <h2 className="font-bold tracking-tight">Nový kupon za body</h2>
          <div><label htmlFor="c-title" className={label}>Název</label><input id="c-title" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Dezert k čaji zdarma" className={input} maxLength={80} /></div>
          <div><label htmlFor="c-desc" className={label}>Popis</label><input id="c-desc" value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="Jeden dezert z vitríny podle výběru." className={input} maxLength={200} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="c-cost" className={label}>Cena v bodech</label><input id="c-cost" type="number" min={0} max={100000} value={f.cost_points} onChange={e => setF({ ...f, cost_points: parseInt(e.target.value || '0', 10) })} className={input} /></div>
            <div><label htmlFor="c-until" className={label}>Platí do</label><input id="c-until" type="date" value={f.valid_until} onChange={e => setF({ ...f, valid_until: e.target.value })} className={input} /></div>
          </div>
          <Button type="submit" variant="accent" icon="plus" loading={busy}>Přidat kupon</Button>
        </form>
        <form onSubmit={redeem} className="glass-card p-5 space-y-3">
          <h2 className="font-bold tracking-tight">Uplatnit kupon</h2>
          <p className="text-xs text-black/50">Host ukáže kód ze své kartičky. Kupon jde uplatnit jednou.</p>
          <div><label htmlFor="c-code" className={label}>Kód od hosta</label><input id="c-code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="ABC-123" className={`${input} font-mono tracking-widest`} /></div>
          <Button type="submit" variant="primary" icon="check" loading={busy}>Uplatnit</Button>
        </form>
      </div>
      <section>
        <h2 className="font-bold tracking-tight mb-2">Katalog kuponů</h2>
        {list === null ? <Skeleton className="h-32 rounded-3xl" /> : list.length === 0
          ? <EmptyState icon="gift" title="Zatím žádný kupon" hint="Přidej první vlevo. Host si ho pořídí za body na tvé stránce." compact />
          : <ul className="glass-card p-3 sm:p-4 divide-y divide-black/[0.06]">
              {list.map((c: any) => (
                <li key={c.id} className={`py-3 flex items-center gap-3 ${c.active ? '' : 'opacity-50'}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{c.title} <span className="text-black/50 font-medium">· {c.cost_points} b.</span></p>
                    <p className="text-xs text-black/55 truncate">{c.description || 'Bez popisu.'}{c.valid_until ? ` · do ${czDay(c.valid_until)}` : ''} · vzato {c.claimed}×, uplatněno {c.redeemed}×</p>
                  </div>
                  <button onClick={() => toggle(c)} aria-pressed={!!c.active}
                    className={`tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold transition ${c.active ? 'bg-[#C8F542]/25 text-[#3E5406]' : 'bg-black/[0.06] text-black/55'}`}>{c.active ? 'Aktivní' : 'Vypnutý'}</button>
                </li>
              ))}
            </ul>}
      </section>
    </div>
  );
}

// ---- Slevy a úrovně -------------------------------------------------------------

function Tiers({ toast }: { toast: (m: string) => void }) {
  const { p, setP } = useProfile();
  const [busy, setBusy] = useState(false);
  if (!p) return <Skeleton className="h-64 rounded-3xl" />;
  const save = async () => {
    setBusy(true);
    try {
      const r = await j('/api/client/admin/profile', { method: 'PUT', body: JSON.stringify({ silver_at: p.silver_at, gold_at: p.gold_at, member_discount: p.member_discount, silver_discount: p.silver_discount, gold_discount: p.gold_discount }) });
      setP(r.profile); toast('Úrovně a slevy uloženy.');
    } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  const tiers: { id: string; name: string; at: string | null; atKey?: string; discKey: string; tone: string }[] = [
    { id: 'bronze', name: 'Člen', at: 'od první návštěvy', discKey: 'member_discount', tone: 'bg-black/[0.05] text-black/60' },
    { id: 'silver', name: 'Stříbrný host', at: null, atKey: 'silver_at', discKey: 'silver_discount', tone: 'bg-black/[0.07] text-black/70' },
    { id: 'gold', name: 'Zlatý host', at: null, atKey: 'gold_at', discKey: 'gold_discount', tone: 'bg-[#C8F542]/30 text-[#3E5406]' },
  ];
  return (
    <div className="space-y-5 max-w-3xl">
      <Saver busy={busy} onSave={save} title="Úrovně hostů a jejich sleva"
        hint="Čím víc návštěv, tím lepší úroveň. Sleva je informace pro obsluhu: při načtení kartičky u kasy uvidí, kolik hostovi odečíst. Úroveň vidí i host na své stránce.">
        <ul className="space-y-3">
          {tiers.map(t => (
            <li key={t.id} className="rounded-2xl border border-black/[0.07] bg-white/60 p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3 items-end">
              <div>
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${t.tone}`}>{t.name}</span>
                <p className="text-xs text-black/50 mt-1.5">{t.at ?? 'Od kolika návštěv'}</p>
              </div>
              {t.atKey ? (
                <div><label htmlFor={`t-${t.id}`} className={label}>Návštěv</label><input id={`t-${t.id}`} type="number" min={1} max={1000} value={p[t.atKey] ?? 0} onChange={e => setP({ ...p, [t.atKey!]: e.target.value })} className={`${input} !w-24`} /></div>
              ) : <span />}
              <div><label htmlFor={`d-${t.id}`} className={label}>Sleva %</label><input id={`d-${t.id}`} type="number" min={0} max={90} value={p[t.discKey] ?? 0} onChange={e => setP({ ...p, [t.discKey]: e.target.value })} className={`${input} !w-24`} /></div>
            </li>
          ))}
        </ul>
        <p className="text-xs text-black/50">Sleva se nepočítá automaticky do pokladny — obsluha ji zadá sama. Nulová sleva znamená, že úroveň je jen odznak.</p>
      </Saver>
    </div>
  );
}

// ---- Rozcestník -----------------------------------------------------------------

export default function LoyaltyTabs({ toast, promos }: { toast: (m: string) => void; promos: React.ReactNode }) {
  const [sub, setSub] = useState<LoyaltySub>('overview');
  const HINTS: Record<LoyaltySub, string> = {
    overview: 'Jak si věrnostní program vede a co se v něm poslední dobou dělo.',
    points: 'Za co host dostane body a kolik se mu vrátí z útraty jako kredit.',
    stamps: 'Razítkové kartičky — za návštěvy, za vybrané položky, nebo za útratu. Klidně víc najednou.',
    coupons: 'Co si host může pořídit za body a jak kupon uplatnit u kasy.',
    tiers: 'Úrovně podle počtu návštěv a sleva, kterou z nich host má.',
    promos: 'Kódy na leták, do příspěvku nebo na účtenku. Host je zadá na tvé stránce.',
  };
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Věrnost</h1>
        <p className="text-sm text-black/55 mt-1 max-w-[75ch]">{HINTS[sub]}</p>
      </div>
      <Segmented options={LOYALTY_SUBS} value={sub} onChange={setSub} size="sm" ariaLabel="Části věrnosti" wrap />
      {sub === 'overview' && <Overview go={setSub} />}
      {sub === 'points' && <Points toast={toast} />}
      {sub === 'stamps' && <Stamps toast={toast} />}
      {sub === 'coupons' && <Coupons toast={toast} />}
      {sub === 'tiers' && <Tiers toast={toast} />}
      {sub === 'promos' && promos}
    </div>
  );
}
