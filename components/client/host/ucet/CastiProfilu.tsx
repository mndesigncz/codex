'use client';

// Části profilu hosta (Moje) ve směru A „Peněženka“: shrnutí na skle, návštěvy jako řádky, osobní
// údaje v polích .hp-pole, jazyk a vzhled (čipy s aria-checked), pozvánka a přechod do správy podniku.
// Sklo nese jen kontejner (Seznam nebo .lgx.hp-sklo), uvnitř žádná další karta.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '../../../Icons';
import JazykMenu from '../../../ui/JazykMenu';
import { useTheme, type VolbaMotivu } from '../../../ThemeProvider';
import { NadpisSekce, Seznam, Radek } from '../../penezenka';
import Pole from './Pole';
import { useCesta } from '../cesty';
import { useJazyk, useT } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { RES_STATUS } from '@/lib/clientSlots';
import { formatMoney } from '@/lib/money';
import { useDruhaStrana } from '@/lib/dveStranyKlient';

/** Shrnutí členství: tři čísla (karty, body, návštěvy) na jednom skle. */
export function Shrnuti({ karty, body, navstevy }: { karty: number; body: number; navstevy: number }) {
  const t = useT('klient-host');
  const { jazyk } = useJazyk();
  const cislo = (n: number) => n.toLocaleString(jazyk);
  const polozky = [[cislo(karty), t('Karty')], [cislo(body), t('Body')], [cislo(navstevy), t('Návštěvy')]] as const;
  return (
    // Tenké display číslice (jazyk karty), žádné sklo kolem: tři čísla leží přímo na plátně pod kartou.
    <section aria-label={t('Hodnota členství')} className="grid grid-cols-3">
      {polozky.map(([v, l], i) => (
        <div key={l} className={`min-w-0 ${i ? 'border-l border-[color:var(--hp-line)] pl-4' : ''}`}>
          <p className="hp-num truncate text-[40px] font-[250] leading-none tracking-[-0.04em] text-[color:var(--hp-fg)]">{v}</p>
          <p className="hp-meta mt-1.5 truncate">{l}</p>
        </div>
      ))}
    </section>
  );
}

/** Jazyk a vzhled: jazyk menu vpravo, motiv jako tři čipy (Systém / Světlý / Tmavý). Jen na tomhle zařízení. */
export function JazykAVzhled() {
  const t = useT('klient-host');
  const { volba, setTheme } = useTheme();
  const volby: { id: VolbaMotivu; label: string }[] = [{ id: 'system', label: t('Systém') }, { id: 'light', label: t('Světlý') }, { id: 'dark', label: t('Tmavý') }];
  return (
    <section aria-labelledby="h-vzhled">
      <NadpisSekce id="h-vzhled" titulek={t('Jazyk a vzhled')} />
      <Seznam>
        <Radek ikona="globe" titulek={t('Jazyk')} vpravo={<JazykMenu />} />
        <li>
          <div className="hp-radek flex-wrap">
            <span className="hp-jamka" aria-hidden><Icon name="sun" size={18} strokeWidth={1.6} /></span>
            <span id="h-motiv" className="hp-silny flex-1">{t('Vzhled')}</span>
            {/* Na telefonu čipy pod titulkem přes celou šířku řádku (tři stejné díly, vejdou se i polsky
                na 320), na širší obrazovce vpravo v řádku. */}
            <div className="grid grid-cols-3 gap-1.5 basis-full sm:flex sm:basis-auto" role="radiogroup" aria-labelledby="h-motiv">
              {volby.map(v => (
                <button key={v.id} type="button" role="radio" aria-checked={volba === v.id} onClick={() => setTheme(v.id, { naUcet: false })}
                  className="hp-cip tap-target min-w-0 !px-2 sm:!px-3"><span className="truncate">{v.label}</span></button>
              ))}
            </div>
          </div>
        </li>
      </Seznam>
    </section>
  );
}

/** Návštěvy: nadcházející a minulé rezervace, objednávky od stolu. */
export function Navstevy({ d }: { d: any }) {
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
      <NadpisSekce id="h-navstevy" titulek={t('Návštěvy')}
        vpravo={radky.length > 4 ? <button type="button" onClick={() => setVse(v => !v)} className="tap-target">{vse ? t('Méně') : t('Všechny návštěvy ({n})', { n: radky.length })}</button> : undefined} />
      <Seznam>
        {ukaz.map(x => {
          if ('r' in x && x.r) {
            const r = x.r; const st = RES_STATUS[r.status] ?? RES_STATUS.requested;
            const ziva = ['requested', 'confirmed'].includes(String(r.status)) && r.date >= d.today;
            const kdy = `${fmtDatum(r.date, { jazyk, styl: 'denKratce' })} · ${r.time}`;
            return (
              <Radek key={x.klic} ikona="calendar" href={cesta(`/client/${r.slug}?tab=reserve${ziva ? `&rezervace=${r.id}` : ''}`)}
                ariaLabel={ziva ? t('Potvrdit nebo zrušit: {kdy}', { kdy: `${fmtDatum(r.date, { jazyk, styl: 'denKratce' })} ${r.time}` }) : undefined}
                titulek={<span className="cz-sentence">{kdy}</span>}
                popis={`${r.business} · ${t('{n, plural, one {# osoba} few {# osoby} other {# osob}}', { n: r.party })}`}
                vpravo={<span className={`hp-meta ${st.tone === 'ok' ? '!text-[color:var(--hp-fg)] font-medium' : ''}`}>{t(st.label)}</span>} />
            );
          }
          const o = (x as any).o;
          return (
            <Radek key={x.klic} ikona="cup" titulek={o.business}
              popis={(o.items ?? []).map((i: any) => `${i.count}× ${i.name}`).join(', ')}
              vpravo={<>
                <span className="block hp-silny hp-num">{formatMoney(o.total, o.currency)}</span>
                <span className="block hp-meta">{o.status === 'new' ? t('čeká') : o.status === 'confirmed' ? t('připravuje se') : o.status === 'done' ? t('hotovo') : t('nepřijato')}</span>
              </>} />
          );
        })}
      </Seznam>
    </section>
  );
}

/** Pozvi kamaráda: kód a dvě akce na jednom skle. */
export function PozviKamarada({ code, onFlash }: { code: string; onFlash: (m: string) => void }) {
  const t = useT('klient-host');
  const link = typeof window === 'undefined' ? '' : `${window.location.origin}/client/register?ref=${encodeURIComponent(code)}`;
  const copy = () => { navigator.clipboard?.writeText(link).then(() => onFlash(t('Odkaz s pozvánkou zkopírován.'))).catch(() => {}); };
  const share = () => {
    if (navigator.share) navigator.share({ title: 'Managero client', text: t('Přidej se přes můj kód, dostaneme oba body.'), url: link }).catch(() => {});
    else copy();
  };
  return (
    <section aria-labelledby="h-invite">
      <NadpisSekce id="h-invite" titulek={t('Pozvi kamaráda')} />
      <div className="lgx hp-sklo p-4 sm:p-5">
        <p className="hp-meta text-pretty">{t('Až se přidá do podniku, kde jsi členem, dostanete oba body — když to podnik zapnul.')}</p>
        <p className="hp-kod hp-silny !text-[17px] mt-3 truncate">{code}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button type="button" onClick={copy} className="hp-btn lgx hp-btn-sklo hp-btn-stredni min-w-0 !px-3 !text-[13px]"><Icon name="copy" size={16} className="shrink-0" /><span className="truncate">{t('Kopírovat odkaz')}</span></button>
          <button type="button" onClick={share} className="hp-btn hp-btn-inkoust hp-btn-stredni min-w-0 !px-3 !text-[13px]"><Icon name="share" size={16} className="shrink-0" /><span className="truncate">{t('Sdílet')}</span></button>
        </div>
      </div>
    </section>
  );
}

/** Osobní údaje: jméno, telefon, narozeniny v polích .hp-pole na jednom skle. */
export function OsobniUdaje({ me, onSaved }: { me: any; onSaved: (me: any) => void }) {
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
    <section aria-labelledby="h-udaje">
      <NadpisSekce id="h-udaje" titulek={t('Osobní údaje')} />
      <form onSubmit={save} className="lgx hp-sklo p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Pole className="sm:col-span-2" id="pf-name" popis={t('Jméno')} ikona="user">
          <input id="pf-name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} required autoComplete="name" />
        </Pole>
        <Pole id="pf-phone" popis={t('Telefon')} ikona="phone">
          <input id="pf-phone" type="tel" inputMode="tel" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder={t('Pro potvrzení rezervace')} autoComplete="tel" />
        </Pole>
        <Pole id="pf-bday" popis={t('Narozeniny')} ikona="gift">
          <input id="pf-bday" type="date" value={f.birthday} onChange={e => setF({ ...f, birthday: e.target.value })} autoComplete="bday" />
        </Pole>
        <p className="sm:col-span-2 hp-meta text-pretty">{t('E-mail: {email}. Narozeniny vidí jen podniky, kde jsi členem, kvůli přání a odměně.', { email: me?.email ?? '' })}</p>
        {err && <p role="alert" className="sm:col-span-2 note note-danger text-sm">{err}</p>}
        <button type="submit" disabled={busy} className="sm:col-span-2 hp-btn hp-btn-inkoust hp-btn-blok">{busy ? '…' : t('Uložit')}</button>
      </form>
    </section>
  );
}

/** Kdo má k téže adrese i účet v provozu, přejde odsud do správy podniku (bez nového hesla). */
export function PrepnoutNaPodnik({ onFlash }: { onFlash: (m: string) => void }) {
  const t = useT('klient-host');
  const { druha, prepnout, busy, chyba, zrusChybu } = useDruhaStrana();
  useEffect(() => { if (chyba) { onFlash(t(chyba)); zrusChybu(); } }, [chyba, onFlash, t, zrusChybu]);
  if (druha !== 'podnik') return null;
  return (
    <Seznam>
      <Radek ikona="overview" onClick={() => { if (!busy) void prepnout(); }}
        titulek={busy ? t('Načítání…') : t('Správa podniku')} popis={t('Směny, kasa, sklad, rezervace a tým.')} />
    </Seznam>
  );
}

/** Odkaz zpátky z ukázky (demo nemá odhlášení). */
export function ZpetNaKartu() {
  const t = useT('klient-host');
  const cesta = useCesta();
  return <Link href={cesta('/client/me')} className="hp-btn lgx hp-btn-sklo hp-btn-blok">{t('Zpět na kartu')}</Link>;
}
