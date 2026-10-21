'use client';

// Moje (profil hosta, z avataru — koncept B 8, audit C §6 9). Nahoře hodnota členství třemi
// skutečnými čísly (návštěvy, uplatněné odměny, body — žádné „ušetřeno“ odhadem), pak to, co host
// otevírá zřídka: karta a peněženka (Wallet, obrázek, plocha, plastové karty), návštěvy
// (rezervace a objednávky), osobní údaje, jazyk a vzhled, pozvi kamaráda, „Oznámení a soukromí“
// (souhlasy po podnicích, stažení dat, provozovatel, smazání účtu — na konci) a odhlášení.
// Názvy sekcí drží cesty z právních dokumentů („Moje → Oznámení a soukromí“, „Moje → Smazat účet“).

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '../../Icons';
import { Skeleton, ErrorState, Stat, StatRow } from '../../ui';
import JazykMenu from '../../ui/JazykMenu';
import { useTheme, type VolbaMotivu } from '../../ThemeProvider';
import UcetHosta from '../UcetHosta';
import KartaNastroje from '../KartaNastroje';
import KartickyHosta from '../KartickyHosta';
import { AvatarHosta } from '../ClientShell';
import { useHostMe, useKartaHosta } from './data';
import { useCesta, useJeDemo } from './cesty';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { RES_STATUS } from '@/lib/clientSlots';
import { formatMoney } from '@/lib/money';
import { odhlasit } from '@/lib/odhlaseni';

export default function Profil() {
  const t = useT('klient-host');
  const cesta = useCesta();
  const demo = useJeDemo();
  const me = useHostMe();
  const karta = useKartaHosta();
  const d = me.data;
  const [flash, setFlash] = useState('');
  useEffect(() => { if (flash) { const i = setTimeout(() => setFlash(''), 4000); return () => clearTimeout(i); } }, [flash]);
  if (me.chyba && !d) return <ErrorState title={t('Profil se nenačetl')} hint={t('Zkontroluj připojení a zkus to znovu.')} onRetry={() => { void me.obnov(); }} />;
  if (!d) return <div className="mx-auto max-w-2xl space-y-4"><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-28 rounded-[20px]" /><Skeleton className="h-60 rounded-[20px]" /></div>;
  const clenstvi: any[] = d.memberships ?? [];
  const navstev = clenstvi.reduce((a, m) => a + (Number(m.visits) || 0), 0);
  const uplatneno = (d.claims ?? []).filter((c: any) => c.redeemed_at).length;
  const body = clenstvi.reduce((a, m) => a + (Number(m.points) || 0), 0);

  return (
    <div className="mx-auto max-w-2xl">
      <header className="flex items-center gap-4 min-w-0">
        <AvatarHosta name={d.me?.name ?? ''} size={56} />
        <div className="min-w-0">
          <h1 className="t-page !text-[26px] truncate">{d.me?.name}</h1>
          <p className="t-meta truncate">{[d.me?.email, clenstvi.length ? t('{n, plural, one {člen # podniku} few {člen # podniků} other {člen # podniků}}', { n: clenstvi.length }) : ''].filter(Boolean).join(' · ')}</p>
        </div>
      </header>
      {flash && <p role="status" className="mt-4 toast-in note note-ok">{flash}</p>}

      <section aria-label={t('Hodnota členství')} className="mt-5 card p-4 sm:p-5">
        <StatRow>
          <Stat label={t('Návštěvy')} value={navstev} note={t('celkem')} />
          <Stat label={t('Odměny')} value={uplatneno} note={t('uplatněno')} />
          <Stat label={t('Body')} value={body} note={t('dohromady')} />
        </StatRow>
      </section>

      <div className="mt-8 space-y-8">
        <section id="karta" aria-labelledby="h-karta" className="scroll-mt-24">
          <h2 id="h-karta" className="t-section mb-3">{t('Karta a peněženka')}</h2>
          <div className="card p-4 sm:p-5 space-y-5">
            {karta.data?.code
              ? <KartaNastroje karta={karta.data} podniky={clenstvi.map(m => ({ slug: m.slug, name: m.name }))} />
              : <p className="t-meta">{t('Karta se nenačetla.')}</p>}
            {!demo && <div className="pt-4 border-t border-black/[0.07]"><KartickyHosta /></div>}
          </div>
        </section>

        <Navstevy d={d} />

        <section aria-labelledby="h-udaje">
          <h2 id="h-udaje" className="t-section mb-3">{t('Osobní údaje')}</h2>
          <ProfileForm me={d.me} onSaved={() => { setFlash(t('Uloženo.')); void me.obnov(); }} />
        </section>

        <section aria-labelledby="h-vzhled">
          <h2 id="h-vzhled" className="t-section mb-3">{t('Jazyk a vzhled')}</h2>
          <ul className="card list px-4 sm:px-5">
            <li className="flex items-center gap-3 min-h-[56px] py-2">
              <span className="min-w-0 flex-1 text-[15px] font-medium">{t('Jazyk')}</span>
              <JazykMenu />
            </li>
            <li className="py-3"><VolbaMotivuHosta /></li>
          </ul>
        </section>

        {karta.data?.code && <InviteCard code={karta.data.code} onFlash={setFlash} />}

        <UcetHosta novinky={d.me?.novinky === true} novinkyEmail={d.me?.novinkyEmail !== false} onFlash={setFlash} />

        {!demo && (
          <button type="button" onClick={() => odhlasit({ callbackUrl: '/client' })} className="btn btn-secondary w-full !h-[52px]"><Icon name="logout" size={17} />{t('Odhlásit se')}</button>
        )}
        {demo && <Link href={cesta('/client/me')} className="btn btn-secondary w-full !h-[52px]">{t('Zpět na kartu')}</Link>}
      </div>
    </div>
  );
}

/** Motiv hosta: podle telefonu (výchozí), světlý, tmavý. Jen na tomhle zařízení. */
function VolbaMotivuHosta() {
  const t = useT('klient-host');
  const { volba, setTheme } = useTheme();
  const volby: { id: VolbaMotivu; label: string }[] = [{ id: 'system', label: t('Systém') }, { id: 'light', label: t('Světlý') }, { id: 'dark', label: t('Tmavý') }];
  return (
    <div>
      <p className="text-[15px] font-medium mb-2.5">{t('Vzhled')}</p>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('Vzhled')}>
        {volby.map(v => <button key={v.id} type="button" role="radio" aria-checked={volba === v.id} onClick={() => setTheme(v.id, { naUcet: false })} className="h-cip tap-target-sm min-w-0 !px-2"><span className="truncate">{v.label}</span></button>)}
      </div>
    </div>
  );
}

/** Návštěvy: nadcházející a minulé rezervace, objednávky od stolu (dřív dvě rozbalovací historie v Moje). */
function Navstevy({ d }: { d: any }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const cesta = useCesta();
  const [vse, setVse] = useState(false);
  const rez: any[] = d.reservations ?? [];
  const obj: any[] = d.orders ?? [];
  if (!rez.length && !obj.length) return null;
  const nadchazejici = rez.filter(r => r.date >= d.today && ['requested', 'confirmed'].includes(r.status)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const minule = rez.filter(r => !nadchazejici.includes(r));
  const radky = [
    ...nadchazejici.map(r => ({ klic: `r${r.id}`, r })),
    ...minule.map(r => ({ klic: `r${r.id}`, r })),
    ...obj.map(o => ({ klic: `o${o.id}`, o })),
  ];
  const ukaz = vse ? radky : radky.slice(0, 4);
  return (
    <section aria-labelledby="h-navstevy">
      <h2 id="h-navstevy" className="t-section mb-3">{t('Návštěvy')}</h2>
      <ul className="card list px-4 sm:px-5">
        {ukaz.map(x => {
          if ('r' in x && x.r) {
            const r = x.r; const st = RES_STATUS[r.status] ?? RES_STATUS.requested;
            const ziva = ['requested', 'confirmed'].includes(String(r.status)) && r.date >= d.today;
            return (
              <li key={x.klic}>
                <Link href={cesta(`/client/${r.slug}?tab=reserve${ziva ? `&rezervace=${r.id}` : ''}`)} className="flex items-center gap-3 py-3 min-h-[64px]" aria-label={ziva ? t('Potvrdit nebo zrušit: {kdy}', { kdy: `${fmtDatum(r.date, { jazyk, styl: 'denKratce' })} ${r.time}` }) : undefined}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/[0.05]" aria-hidden><Icon name="calendar" size={18} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold leading-tight cz-sentence">{fmtDatum(r.date, { jazyk, styl: 'denKratce' })} · {r.time}</span>
                    <span className="block t-meta truncate mt-0.5">{r.business} · {t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n: r.party })}</span>
                  </span>
                  <span className={`chip chip-sm shrink-0 ${st.tone === 'ok' ? 'chip-ok' : st.tone === 'wait' ? 'chip-wait' : 'chip-muted'}`}>{t(st.label)}</span>
                </Link>
              </li>
            );
          }
          const o = (x as any).o;
          return (
            <li key={x.klic} className="flex items-center gap-3 py-3 min-h-[64px]">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-black/[0.05]" aria-hidden><Icon name="cup" size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold leading-tight truncate">{o.business}</span>
                <span className="block t-meta truncate mt-0.5">{(o.items ?? []).map((i: any) => `${i.count}× ${i.name}`).join(', ')}</span>
              </span>
              <span className="text-right shrink-0">
                <span className="block text-[15px] font-semibold tabular-nums">{formatMoney(o.total, o.currency)}</span>
                <span className="block text-xs text-black/55">{o.status === 'new' ? t('čeká') : o.status === 'confirmed' ? t('připravuje se') : o.status === 'done' ? t('hotovo') : t('nepřijato')}</span>
              </span>
            </li>
          );
        })}
      </ul>
      {radky.length > 4 && <button type="button" onClick={() => setVse(v => !v)} className="mt-2 tap-target-sm text-sm font-semibold text-black/60">{vse ? t('Méně') : t('Všechny návštěvy ({n})', { n: radky.length })}</button>}
    </section>
  );
}

function InviteCard({ code, onFlash }: { code: string; onFlash: (m: string) => void }) {
  const t = useT('klient-host');
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/client/register?ref=${encodeURIComponent(code)}`;
  const copy = () => { navigator.clipboard?.writeText(link).then(() => onFlash(t('Odkaz s pozvánkou zkopírován.'))).catch(() => {}); };
  const share = () => {
    if (navigator.share) navigator.share({ title: 'Managero client', text: t('Přidej se přes můj kód, dostaneme oba body.'), url: link }).catch(() => {});
    else copy();
  };
  return (
    <section aria-labelledby="h-invite" className="card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="h-invite" className="t-card !text-[17px]">{t('Pozvi kamaráda')}</h2>
          <p className="mt-1 t-meta text-pretty">{t('Až se přidá do podniku, kde jsi členem, dostanete oba body — když to podnik zapnul.')}</p>
        </div>
        <button type="button" onClick={share} className="btn btn-primary btn-sm shrink-0 !h-9"><Icon name="share" size={15} />{t('Sdílet')}</button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="well px-3 py-2 h-kod text-sm flex-1 min-w-0 truncate">{code}</span>
        <button type="button" onClick={copy} className="btn btn-secondary btn-sm shrink-0 !h-9"><Icon name="copy" size={15} />{t('Kopírovat odkaz')}</button>
      </div>
    </section>
  );
}

function ProfileForm({ me, onSaved }: { me: any; onSaved: (me: any) => void }) {
  const t = useT('klient-host');
  const [f, setF] = useState({ name: me?.name ?? '', phone: me?.phone ?? '', birthday: me?.birthday ? String(me.birthday).slice(0, 10) : '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await fetch('/api/client/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(x.error ? t(x.error) : t('Nepovedlo se.')); return; }
      onSaved(x.me);
    } catch { setErr(t('Nepovedlo se — vypadlo připojení.')); }
    finally { setBusy(false); }
  };
  return (
    <form onSubmit={save} className="card p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2"><label htmlFor="pf-name" className="field-label">{t('Jméno')}</label><input id="pf-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className="field" required autoComplete="name" /></div>
      <div><label htmlFor="pf-phone" className="field-label">{t('Telefon')}</label><input id="pf-phone" type="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder={t('Pro potvrzení rezervace')} className="field" autoComplete="tel" /></div>
      <div><label htmlFor="pf-bday" className="field-label">{t('Narozeniny')}</label><input id="pf-bday" type="date" value={f.birthday} onChange={e => setF({ ...f, birthday: e.target.value })} className="field" /></div>
      <p className="sm:col-span-2 t-meta text-pretty">{t('E-mail: {email}. Narozeniny vidí jen podniky, kde jsi členem, kvůli přání a odměně.', { email: me?.email ?? '' })}</p>
      {err && <p role="alert" className="sm:col-span-2 text-sm text-bad-ink">{err}</p>}
      <button type="submit" disabled={busy} className="sm:col-span-2 btn btn-primary w-full disabled:opacity-50">{busy ? '…' : t('Uložit')}</button>
    </form>
  );
}
