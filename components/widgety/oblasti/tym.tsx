'use client';

// Widgety oblasti „Tým" — komponenty (kolo 68, spec §2.5, §2.6 a §6.1).
//
// Vlastník v kole 69: balík B2 (spec §6.3) — do souboru nesahá nikdo jiný.
// Metadata (název, velikosti, oprávnění, `stav`) jsou v lib/widgety/katalog/tym.ts,
// tady je jen kreslení. Klíč v KOMPONENTY = id widgetu a musí sedět se `stav: 'hotovo'`
// v katalogu — test AK-20 (scripts/testy/k68-widgety.ts) klíče čte z textu, proto bez spreadu.
//
// Tým nahrazuje dlaždici „Zaměstnanci" z řady čísel na Přehledu (audit Přehledu
// vedení): tlačítko s třídou glass-card bylo průhledné a šedé vedle bílých
// karet, číslo mělo 30 px bez tabulkových číslic a ikonu v tónovaném kolečku.
// Teď je to malý widget se Stat (28 px, tabular) a u střední velikosti seznam
// lidí s rolí. Data jen s tym.zobrazit — GET /api/teams členy vrátí každému
// členovi podniku, takže bránu drží registr, ne API (spec §1.5). Profil
// otevře klepnutí jen s tym.profil, telefon je vidět jen s tym.kontakty
// (server ho bez klíče ani nepošle).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KomponentaWidgetu, WidgetProps } from '@/lib/widgety/typy';
import { widget } from '@/lib/widgety/katalog';
import { useJazyk, useT, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import type { Jazyk } from '@/lib/i18n/config';
import { apiMessage, okJson } from '@/lib/api';
import { bezSazby, cekajiciPozvanky, hodinyMinuty, roleSPocty, type ClenTymu, type Pozvanka } from '@/lib/dochazkaPrehled';
import { Avatar, Button, Chip, Field, Input, ListRow, Modal, Stat, StatRow, Well } from '../../ui';
import { useOpravneni } from '../../role/useOpravneni';
import { usePersonProfile } from '../../employer/ProfileLinkProvider';
import { useMoney, useSymbol } from '../../CurrencyProvider';
import { Widget, type StavNacteni } from '../Widget';
import { obnovDataWidgetu, useDataWidgetu } from '../useDataWidgetu';
import { useNavigace, useSmi } from '../NavigaceKontext';

type Klic = string | readonly string[];

const seznam = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const cislo = (n: number) => n.toLocaleString('cs-CZ');
const aDalsich = (t: PrekladFn, n: number) => t('…a {n, plural, one {# další} few {# další} other {# dalších}}', { n });

/** Klíč části widgetu z katalogu (`opravneni.pole`) — jeden zdroj pravdy s galerií a serverem. */
function klicCasti(idWidgetu: string, cast: string): Klic | null {
  return widget(idWidgetu)?.opravneni.pole?.[cast] ?? null;
}

/**
 * Brána widgetu (spec §1.5): přísně `nacteno && ma()` — `ma()` před načtením
 * oprávnění vrací ANO a dotaz by odešel dřív, než víme, jestli na tým divák
 * má. Když /api/teams/mine selže, rozhodl už server seznamem v rozložení.
 */
function useBrana(klic: Klic): { ok: boolean; ceka: boolean } {
  const { nacteno, chyba, ma } = useOpravneni();
  return { ok: nacteno ? ma(klic) : chyba, ceka: !nacteno && !chyba };
}

/** „Ještě nevíme, jestli smí": kostra a žádný dotaz. */
const CEKA: StavNacteni = { data: null, error: null, loading: true, reload: () => {} };

// ---------------------------------------------------------------------------
// Tým
// ---------------------------------------------------------------------------

const ID_TYM = 'tym.clenove';

interface Clen {
  id: number;
  jmeno: string;
  avatar: string | null;
  vedeni: boolean;
  role: string | null;
  pozice: string | null;
  telefon: string | null;
  jinde: boolean;
}

function vyberCleny(raw: any): Clen[] {
  return seznam(raw?.members).map((m: any) => ({
    id: Number(m.id),
    jmeno: String(m.name ?? ''),
    avatar: typeof m.avatar === 'string' ? m.avatar : null,
    vedeni: m.role === 'employer',
    // Chybějící název role se doplní až při vykreslení (překlad).
    role: m.role_nazev != null ? String(m.role_nazev) : null,
    pozice: typeof m.job_title === 'string' && m.job_title.trim() ? m.job_title.trim() : null,
    telefon: typeof m.phone === 'string' && m.phone.trim() ? m.phone.trim() : null,
    // Člen je právě přepnutý v jiném podniku organizace (kolo 62) — tady je dál členem.
    jinde: m.aktivni_jinde === true,
  }));
}

function Tym({ velikost }: WidgetProps) {
  const t = useT('widgety');
  const smi = useSmi();
  const nav = useNavigace();
  const otevriProfil = usePersonProfile();
  const { ok, ceka } = useBrana(widget(ID_TYM)?.opravneni.vse ?? ['tym.zobrazit']);
  const data = useDataWidgetu(ok ? '/api/teams' : null, vyberCleny);
  const clenove = data.data ?? [];
  const veVedeni = clenove.filter(c => c.vedeni).length;
  const smiCast = (cast: string) => { const k = klicCasti(ID_TYM, cast); return !!k && smi(k); };
  // Profil otevírá layout vedení (ProfileLinkProvider); mimo něj ani bez klíče se řádek neklikne.
  const profil = smiCast('profil') && !!otevriProfil;
  const kontakty = smiCast('kontakty');

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data}
        otevrit={nav.smiPohled('team-settings') ? () => nav.onNavigate('team-settings') : undefined}>
        <Stat label={t('Lidí v týmu')} value={cislo(clenove.length)} note={veVedeni > 0 ? t('{n} ve vedení', { n: cislo(veVedeni) }) : undefined} />
      </Widget>
    );
  }
  return (
    <Widget nacteni={ceka ? CEKA : data} odkaz={{ popisek: t('Lidé'), pohled: 'team-settings' }}
      doplnek={clenove.length > 0 ? <Chip tone="muted" size="sm">{cislo(clenove.length)}</Chip> : undefined}
      prazdno={clenove.length === 0 ? <p className="t-meta">{t('V týmu zatím nikdo není.')}</p> : undefined}>
      <ul className="list">
        {clenove.slice(0, 5).map(c => {
          const role = c.role ?? (c.vedeni ? t('Vedení') : t('Zaměstnanec'));
          const meta = [role, c.pozice && c.pozice !== role ? c.pozice : null, kontakty ? c.telefon : null].filter(Boolean).join(' · ');
          const jinde = c.jinde ? <Chip tone="muted" size="sm">{t('V jiném podniku')}</Chip> : undefined;
          return profil && otevriProfil ? (
            // Klikací řádek ve vlastním <li>, jinak by .list nad ním nekreslil linku (DP §3.6).
            <li key={c.id}>
              <ListRow as="div" lead={<Avatar emoji={c.avatar} size="sm" />} title={c.jmeno} meta={meta} right={jinde}
                onClick={() => otevriProfil(c.id)} />
            </li>
          ) : (
            <ListRow key={c.id} lead={<Avatar emoji={c.avatar} size="sm" />} title={c.jmeno} meta={meta} right={jinde} />
          );
        })}
      </ul>
      {clenove.length > 5 && <p className="t-meta mt-2">{aDalsich(t, clenove.length - 5)}</p>}
    </Widget>
  );
}


// ---------------------------------------------------------------------------
// Společné pro widgety kola 69 (balík B2)
// ---------------------------------------------------------------------------

const URL_TYM = '/api/teams';

/**
 * Po zápisu (sazba, pozvánka) obnovit tým všude — widgety i nástroj stránky
 * Tým čtou /api/teams přes stejnou mezipaměť. Nástroj si navíc poslouchá
 * událost, protože pozvánky a role drží ve vlastním stavu formulářů.
 */
export const UDALOST_TYM = 'managero:tym-zmena';
export function obnovTym(): void {
  obnovDataWidgetu(URL_TYM);
  obnovDataWidgetu('/api/invitations');
  obnovDataWidgetu('/api/roles');
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(UDALOST_TYM));
}

/** „dnes", „včera", „před 5 dny" — stáří pozvánky. */
function stari(t: PrekladFn, iso: string | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const dni = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (dni <= 0) return t('dnes');
  if (dni === 1) return t('včera');
  return t('před {n, plural, one {# dnem} few {# dny} other {# dny}}', { n: dni });
}

// ---------------------------------------------------------------------------
// Pozvánky
// ---------------------------------------------------------------------------

function vyberKod(raw: any, t: PrekladFn): { kod: string | null } {
  if (!raw || typeof raw !== 'object') throw new Error(t('Tým přišel v nečekaném tvaru.'));
  return { kod: typeof raw.team?.join_code === 'string' && raw.team.join_code ? raw.team.join_code : null };
}
function vyberPozvanky(raw: any, t: PrekladFn): Pozvanka[] {
  if (!raw || !Array.isArray(raw.invitations)) throw new Error(t('Pozvánky přišly v nečekaném tvaru.'));
  return raw.invitations;
}

/**
 * Kód pro připojení a pozvánky, které nikdo nepřijal. Kód patří do Geist
 * Mono inkoustem ve Well (audit Týmu: zelený Geist Sans 36 px), kopírování
 * je `secondary sm` s ikonou, ne „Zkopírováno ✓". Server kód bez tym.pozvat
 * ani nepošle; bez klíče se widget nepřipojí a dotazy neodejdou.
 */
function Pozvanky({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const { ok, ceka } = useBrana(widget('tym.pozvanky')?.opravneni.vse ?? ['tym.pozvat']);
  const tym = useDataWidgetu(ok ? URL_TYM : null, raw => vyberKod(raw, t));
  const poz = useDataWidgetu(ok ? '/api/invitations' : null, raw => vyberPozvanky(raw, t));
  const [zkopirovano, setZkopirovano] = useState(false);
  useEffect(() => {
    if (!zkopirovano) return;
    const casovac = setTimeout(() => setZkopirovano(false), 2000);
    return () => clearTimeout(casovac);
  }, [zkopirovano]);
  if (!ok && !ceka) return <Widget prazdno={null} />;

  const kod = tym.data?.kod ?? null;
  const cekajici = cekajiciPozvanky(poz.data ?? []);
  const kopiruj = async () => {
    if (!kod || nahled) return;
    try { await navigator.clipboard.writeText(kod); setZkopirovano(true); } catch { /* schránka zakázaná — kód je vidět */ }
  };
  const tlacitko = kod && !nahled ? (
    <Button variant="secondary" size="sm" icon={zkopirovano ? 'check' : 'copy'} onClick={kopiruj} aria-label={t('Kopírovat kód {kod}', { kod })}>
      {zkopirovano ? t('Zkopírováno') : t('Kopírovat')}
    </Button>
  ) : null;

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : [tym, poz]}>
        <div className="space-y-2.5">
          <Stat label={t('Kód pro připojení')} value={<span className="font-mono tracking-[0.12em]">{kod ?? '—'}</span>}
            note={cekajici.length > 0 ? t('{n, plural, one {# čekající pozvánka} few {# čekající pozvánky} other {# čekajících pozvánek}}', { n: cekajici.length }) : t('nikdo nečeká')} />
          {tlacitko}
        </div>
      </Widget>
    );
  }
  return (
    <Widget nacteni={ceka ? CEKA : [tym, poz]} odkaz={{ popisek: t('Lidé'), pohled: 'team-settings' }}
      doplnek={cekajici.length > 0 ? <Chip tone="info" size="sm">{cekajici.length.toLocaleString('cs-CZ')}</Chip> : undefined}>
      <Well className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="t-label">{t('Kód pro připojení')}</p>
          <p className="mt-1 font-mono text-[1.75rem] leading-none font-bold tracking-[0.12em] text-[#16181A] break-all">{kod ?? '—'}</p>
        </div>
        {tlacitko}
      </Well>
      {cekajici.length === 0 ? (
        <p className="t-meta mt-3">{t('Žádná pozvánka nečeká na přijetí.')}</p>
      ) : (
        <>
          <ul className="list mt-2">
            {cekajici.slice(0, 4).map(p => (
              <ListRow key={p.id} title={<span className="break-all sm:break-normal">{p.email}</span>}
                meta={[p.job_title, stari(t, p.created_at)].filter(Boolean).join(' · ')}
                right={<Chip tone="info" size="sm">{t('Čeká')}</Chip>} />
            ))}
          </ul>
          {cekajici.length > 4 && <p className="t-meta mt-2">{aDalsich(t, cekajici.length - 4)}</p>}
        </>
      )}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Role v podniku
// ---------------------------------------------------------------------------

function vyberRole(raw: any, t: PrekladFn) {
  if (!raw || typeof raw !== 'object' || (!Array.isArray(raw.system) && !Array.isArray(raw.vlastni))) throw new Error(t('Role přišly v nečekaném tvaru.'));
  return roleSPocty(seznam(raw.system), seznam(raw.vlastni));
}

function Role(_: WidgetProps) {
  const t = useT('widgety');
  const smi = useSmi();
  const { ok, ceka } = useBrana(widget('tym.role')?.opravneni.nektere ?? ['tym.zobrazit', 'tym.role_prirazovat', 'tym.role_spravovat']);
  const data = useDataWidgetu(ok ? '/api/roles' : null, raw => vyberRole(raw, t));
  if (!ok && !ceka) return <Widget prazdno={null} />;
  const radky = data.data?.radky ?? [];
  const prazdnych = data.data?.prazdnych ?? 0;
  // Editor rolí je v Nastavení → Role a oprávnění a ukazuje se jen s těmito klíči.
  const odkaz = smi(['tym.role_spravovat', 'tym.role_prirazovat']) ? { popisek: t('Role', undefined, 'widgety'), pohled: 'settings', arg: 'roles' } : undefined;
  return (
    <Widget nacteni={ceka ? CEKA : data} odkaz={odkaz}
      prazdno={radky.length === 0 ? <p className="t-meta">{t('Zatím nikdo nemá přidělenou roli.')}</p> : undefined}>
      <ul className="list">
        {radky.slice(0, 6).map(r => (
          <ListRow key={r.klic} title={r.nazev} meta={r.vlastni ? t('vlastní role') : t('přednastavená')}
            value={t('{n, plural, one {# člověk} few {# lidé} other {# lidí}}', { n: r.pocet })} />
        ))}
      </ul>
      {radky.length > 6 && <p className="t-meta mt-2">{aDalsich(t, radky.length - 6)}</p>}
      {prazdnych > 0 && <p className="t-meta mt-2">{t('{n, plural, one {# role zatím nemá} few {# role zatím nemají} other {# rolí zatím nemá}} nikoho.', { n: prazdnych })}</p>}
    </Widget>
  );
}

// ---------------------------------------------------------------------------
// Chybí sazba
// ---------------------------------------------------------------------------

function vyberBezSazby(raw: any, t: PrekladFn): ClenTymu[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.members)) throw new Error(t('Tým přišel v nečekaném tvaru.'));
  const vlastnik = Number(raw.team?.owner_id);
  return bezSazby(raw.members, Number.isFinite(vlastnik) ? vlastnik : null);
}

/** Okno „Nastavit sazbu" — jedno pole, uloží hned (PATCH /api/teams/members). */
function OknoSazby({ clen, onZavrit }: { clen: ClenTymu; onZavrit: () => void }) {
  const t = useT('widgety');
  const symbol = useSymbol();
  const [sazba, setSazba] = useState('');
  const [pise, setPise] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const idPole = `sazba-${clen.id}`;
  const uloz = async () => {
    const n = parseInt(sazba, 10);
    if (!(n > 0)) { setChyba(t('Zadej sazbu větší než nula.')); return; }
    setPise(true); setChyba(null);
    try {
      await fetch('/api/teams/members', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: clen.id, hourlyRate: n }),
      }).then(okJson);
      obnovTym();
      onZavrit();
    } catch (e) {
      setChyba(apiMessage(e, t('Sazbu se nepodařilo uložit.')));
    } finally {
      setPise(false);
    }
  };
  if (typeof document === 'undefined') return null;
  // Přes portál: karta widgetu může mít transformaci a `fixed` by se kreslilo do ní.
  return createPortal(
    <Modal open onClose={onZavrit} size="sm" title={t('Nastavit sazbu')} subtitle={clen.name}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>{t('Zrušit')}</Button>
        <Button variant="primary" loading={pise} onClick={uloz}>{t('Uložit sazbu')}</Button>
      </>}>
      <Field id={idPole} label={t('Hodinová sazba ({symbol}/h)', { symbol })} hint={t('Použije se pro mzdy v Docházce, Financích i uzávěrkách.')} error={chyba}>
        <Input id={idPole} inputMode="numeric" value={sazba} autoFocus onChange={e => setSazba(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') void uloz(); }} />
      </Field>
    </Modal>,
    document.body,
  );
}

function BezSazby({ velikost, nahled }: WidgetProps) {
  const t = useT('widgety');
  const smi = useSmi();
  const nav = useNavigace();
  const { ok, ceka } = useBrana(widget('tym.bez_sazby')?.opravneni.vse ?? ['finance.mzdy']);
  const data = useDataWidgetu(ok ? URL_TYM : null, raw => vyberBezSazby(raw, t));
  const [nastavit, setNastavit] = useState<ClenTymu | null>(null);
  if (!ok && !ceka) return <Widget prazdno={null} />;
  const lide = data.data ?? [];
  // Nastavit je akce z katalogu (akce:nastavit_sazbu → finance.sazby_upravit).
  const k = klicCasti('tym.bez_sazby', 'akce:nastavit_sazbu');
  const smiNastavit = !nahled && !!k && smi(k);
  const prazdno = lide.length === 0 ? <p className="t-meta">{t('Sazbu má nastavenou každý.')}</p> : undefined;

  if (velikost === 'S') {
    return (
      <Widget nacteni={ceka ? CEKA : data} prazdno={prazdno}
        otevrit={!nahled && nav.smiPohled('team-settings') ? () => nav.onNavigate('team-settings') : undefined}>
        <Stat label={t('Bez sazby')} value={lide.length.toLocaleString('cs-CZ')} note={t('jejich mzdy se nepočítají')} />
      </Widget>
    );
  }
  return (
    <>
      <Widget nacteni={ceka ? CEKA : data} prazdno={prazdno}
        doplnek={lide.length > 0 ? <Chip tone="wait" size="sm">{lide.length.toLocaleString('cs-CZ')}</Chip> : undefined}>
        <ul className="list">
          {lide.slice(0, 5).map(m => (
            <ListRow key={m.id} lead={<Avatar emoji={m.avatar} size="sm" />} title={m.name ?? t('Bez jména')} meta={m.job_title ?? undefined}
              actions={smiNastavit ? <Button variant="secondary" size="sm" onClick={() => setNastavit(m)} aria-label={t('Nastavit sazbu: {jmeno}', { jmeno: m.name ?? '' })}>{t('Nastavit')}</Button> : undefined} />
          ))}
        </ul>
        {lide.length > 5 && <p className="t-meta mt-2">{aDalsich(t, lide.length - 5)}</p>}
      </Widget>
      {nastavit && <OknoSazby clen={nastavit} onZavrit={() => setNastavit(null)} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Profil člena
// ---------------------------------------------------------------------------

interface ProfilData {
  employee: { id: number; name: string; avatar?: string | null; jobTitle?: string | null; hourlyRate?: number | null; phone?: string | null; email?: string | null };
  standing: { points: number; levelName: string };
  shifts: { upcoming: { id: number; date: string; startTime: string | null; endTime: string | null }[] };
  month: { hoursMs: number; shifts: number; closings: number };
  punctuality?: { checked: number; late: number } | null;
}

function vyberProfil(raw: any, t: PrekladFn): ProfilData {
  if (!raw || typeof raw !== 'object' || !raw.employee || !raw.month) throw new Error(t('Profil přišel v nečekaném tvaru.'));
  return raw;
}

const denKratce = (s: string, jazyk: Jazyk) => fmtDatum(String(s).slice(0, 10), { jazyk, styl: 'denKratce' });

/**
 * Jeden člověk na ploše (nastavení „Člen"). Sazba jen s finance.mzdy,
 * telefon jen s tym.kontakty — server je bez klíčů ani nepošle, widget
 * se na to přesto nespoléhá (pole katalogu).
 */
function ProfilClena({ velikost, nastaveni, nahled }: WidgetProps<{ clen?: number | string | null }>) {
  const t = useT('widgety');
  const { jazyk } = useJazyk();
  const smi = useSmi();
  const money = useMoney();
  const otevriProfil = usePersonProfile();
  const { ok, ceka } = useBrana(widget('tym.profil_clena')?.opravneni.vse ?? ['tym.profil']);
  const id = Number(nastaveni.clen);
  const maClena = Number.isFinite(id) && id > 0;
  const data = useDataWidgetu(ok && maClena ? `/api/employees/${id}` : null, raw => vyberProfil(raw, t));
  if (!ok && !ceka) return <Widget prazdno={null} />;
  if (!maClena) return <Widget prazdno={<p className="t-meta text-pretty">{t('Vyber člena v nastavení widgetu.')}</p>} />;

  const p = data.data;
  const e = p?.employee;
  const sazba = smi('finance.mzdy') && e?.hourlyRate ? `${money(e.hourlyRate)}/h` : null;
  const doch = p?.punctuality;
  return (
    <Widget nacteni={ceka ? CEKA : data} titulek={e?.name ?? undefined}>
      {p && e && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar emoji={e.avatar} size="md" />
            <div className="min-w-0 flex-1">
              <p className="t-meta truncate">{[e.jobTitle || t('Člen týmu'), sazba, smi('tym.kontakty') ? e.phone : null].filter(Boolean).join(' · ')}</p>
              <p className="text-[13px] text-black/55">{p.standing.levelName} · {t('{n} b', { n: p.standing.points.toLocaleString('cs-CZ') })}</p>
            </div>
            {!nahled && otevriProfil && (
              <Button variant="secondary" size="sm" onClick={() => otevriProfil(e.id)}>{t('Profil')}</Button>
            )}
          </div>
          <StatRow>
            <Stat label={t('Odpracováno')} value={hodinyMinuty(p.month.hoursMs)} note={t('tento měsíc')} />
            <Stat label={t('Směny')} value={p.month.shifts.toLocaleString('cs-CZ')} note={t('tento měsíc')} />
            {doch && doch.checked > 0 && (
              <Stat label={t('Včas')} value={`${(doch.checked - doch.late).toLocaleString('cs-CZ')}/${doch.checked.toLocaleString('cs-CZ')}`} note={t('za 30 dní')} />
            )}
          </StatRow>
          {velikost === 'L' && (
            p.shifts.upcoming.length === 0 ? <p className="t-meta">{t('Žádná naplánovaná směna.')}</p> : (
              <div>
                <p className="t-label mb-1">{t('Nadcházející směny')}</p>
                <ul className="list">
                  {p.shifts.upcoming.slice(0, 5).map(s => (
                    <ListRow key={s.id} title={<span className="cz-sentence">{denKratce(s.date, jazyk)}</span>}
                      value={`${String(s.startTime ?? '').slice(0, 5)}–${String(s.endTime ?? '').slice(0, 5)}`} />
                  ))}
                </ul>
                {p.shifts.upcoming.length > 5 && <p className="t-meta mt-2">{t('{n, plural, one {# směna} few {# směny} other {# směn}} celkem', { n: p.shifts.upcoming.length })}</p>}
              </div>
            )
          )}
        </div>
      )}
    </Widget>
  );
}

export const KOMPONENTY: Record<string, KomponentaWidgetu> = {
  'tym.clenove': Tym,
  'tym.pozvanky': Pozvanky,
  'tym.role': Role,
  'tym.bez_sazby': BezSazby,
  'tym.profil_clena': ProfilClena,
};
