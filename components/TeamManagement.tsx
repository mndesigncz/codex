'use client';

// Tým (vedení) — plocha s widgety (kolo 69, balík B2, spec §6.2).
//
// Katalog říká, že stránka je nastavení: widgety (Pozvánky, Chybí sazba,
// Role v podniku) jen nad seznamem lidí, formuláře zůstávají pevně pod
// nimi v nástroji. Audit Týmu našel jeden sloupec dvanácti karet (8 854 px
// na telefonu) — nástroj má proto nahoře Segmented sekcí (archetyp
// Nastavení, DP §4 E) a ukazuje jen vybranou: Lidé, Podnik, Uzávěrka,
// Sdílení, Tablet, Integrace. Sekce, na kterou role nemá, v nabídce není.
//
// Co audit ještě chtěl a je tu: seznam lidí přes ListRow (avatar, role
// Chipem, nejvýš dvě akce — „Upravit" a „···" s Profilem a Odebrat), úprava
// a pozvání v Modal místo rozbalování v řádku, jediná limetka „Pozvat člena"
// v hlavičce, přepínače SwitchRow místo čtyř ručních kopií, kód jen ve widgetu Pozvánky (Geist Mono)
// inkoustem, kopírování s ikonou místo „Zkopírováno ✓", potvrzení odebrání
// a zrušení pozvánky v Modal (danger-solid vpravo), hlášky Toastem.
//
// Data čte přes useDataWidgetu (/api/teams, /api/invitations, /api/roles)
// — stejné adresy jako widgety oblasti Tým, takže plocha pošle jeden dotaz
// a po zápisu (obnovTym) se překreslí widgety i nástroj.

import { useEffect, useMemo, useState } from 'react';
import OrganizationSettings from './employer/OrganizationSettings';
import NoisiumConnect from './NoisiumConnect';
import KioskSettings from './KioskSettings';
import EmployeeProfile from './employer/EmployeeProfile';
import ShareSettings from './employer/ShareSettings';
import { usePersonProfile } from './employer/ProfileLinkProvider';
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Menu, Modal, SearchField, Segmented, Select, Skeleton, SwitchRow, Textarea, Toast, type MenuItem } from './ui';
import { Icon } from './Icons';
import { PlochaWidgetu } from './widgety/PlochaWidgetu';
import { useDataWidgetu } from './widgety/useDataWidgetu';
import { obnovTym } from './widgety/oblasti/tym';
import { CURRENCIES, LOCALES } from '@/lib/money';
import { useSymbol } from './CurrencyProvider';
import { czCount } from '@/lib/czech';
import { apiMessage, okJson } from '@/lib/api';
import { obsahujeNekde } from '@/lib/hledani';
import { useOpravneni } from './role/useOpravneni';

interface Member {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  phone?: string;
  job_title?: string;
  shift_preference?: string;
  hourly_rate?: number | null;
  /** Právě přepnutý do jiného podniku organizace (kolo 62) — je členem, jen tu teď nestojí. */
  aktivni_jinde?: boolean;
  /** Role s oprávněními (kolo 67): systémová podle klíče, vlastní podle id. `role` výš je jen typ účtu. */
  role_klic?: string | null;
  role_id?: number | null;
  role_nazev?: string | null;
}

/** Role, jak ji vrací /api/roles — pro výběr u člena. */
interface VolbaRole { klic: string | null; id: number | null; nazev: string; typ: 'vedeni' | 'zamestnanec' | 'kiosk'; opravneni: string[] }
const hodnotaRole = (r: { klic?: string | null; id?: number | null }) => (r.id != null ? `id:${r.id}` : r.klic ? `k:${r.klic}` : '');
/** Hodnota role člena pro <select>; prázdná, když server roli neposlal (starší odpověď). */
const roleClena = (m: Member) => hodnotaRole({ klic: m.role_klic ?? null, id: m.role_id ?? null });

interface Team {
  id: number;
  name: string;
  owner_id: number;
  join_code: string | null;
  pay_daily_cash?: boolean;
  drawer_float?: number | null;
  closing_requires_shift?: boolean;
  show_team_schedule?: boolean;
  payout_from_register?: boolean;
  currency?: string;
  locale?: string;
  week_start?: number;
  labor_target_pct?: number | null;
  business_type?: string | null;
}

interface Invitation {
  id: number;
  email: string;
  job_title?: string;
  status: string;
  /** Null, když pozvánku vytvořil někdo jiný a její roli bych dát nesměl (server token schová). */
  token?: string | null;
  created_at: string;
}

interface DataTymu { team: Team | null; members: Member[] }

function vyberTym(raw: any): DataTymu {
  if (!raw || typeof raw !== 'object') throw new Error('Tým přišel v nečekaném tvaru.');
  return { team: raw.team ?? null, members: Array.isArray(raw.members) ? raw.members : [] };
}
function vyberPozvanky(raw: any): Invitation[] {
  if (!raw || !Array.isArray(raw.invitations)) throw new Error('Pozvánky přišly v nečekaném tvaru.');
  return raw.invitations;
}
function vyberRole(raw: any): VolbaRole[] {
  const sys = Array.isArray(raw?.system) ? raw.system : [];
  const vl = Array.isArray(raw?.vlastni) ? raw.vlastni : [];
  return [
    ...sys.map((r: any) => ({ klic: r.klic, id: null, nazev: r.nazev, typ: r.typ, opravneni: r.opravneni ?? [] })),
    ...vl.map((r: any) => ({ klic: null, id: r.id, nazev: r.nazev, typ: r.typ, opravneni: r.opravneni ?? [] })),
  ];
}

/**
 * Název role člena. Server posílá role_klic / role_id; dokud je nepošle
 * (nebo je role smazaná), zůstane starý popisek podle typu účtu — raději
 * méně přesně než vymyšlený název.
 */
function nazevRole(m: Member, role: VolbaRole[]): string {
  if (m.role_nazev) return m.role_nazev;
  const v = roleClena(m);
  const r = v ? role.find(x => hodnotaRole(x) === v) : null;
  return r?.nazev ?? (m.role === 'employer' ? 'Vedoucí' : 'Zaměstnanec');
}

const STAV_POZVANKY: Record<string, { label: string; tone: 'ok' | 'bad' | 'info' }> = {
  accepted: { label: 'Přijato', tone: 'ok' },
  expired: { label: 'Vypršelo', tone: 'bad' },
  declined: { label: 'Odmítnuto', tone: 'bad' },
  revoked: { label: 'Zrušeno', tone: 'bad' },
  pending: { label: 'Čeká', tone: 'info' },
};

type Sekce = 'lide' | 'podnik' | 'uzaverka' | 'sdileni' | 'tablet' | 'integrace';
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };
const LIDI = { one: 'člověk', few: 'lidi', many: 'lidí' };
const POZVANEK = { one: 'pozvánka', few: 'pozvánky', many: 'pozvánek' };

export default function TeamManagement({ user }: { user: { id: number; name: string; role: string; avatar?: string } }) {
  const symbol = useSymbol();
  // Co smí přihlášený v tomhle podniku (kolo 67). Akce, na které nemá,
  // se neukazují: tlačítko, které vždycky skončí 403, je jen past.
  const { ma, role: mojeRole } = useOpravneni();
  const smiPrirazovat = ma('tym.role_prirazovat');
  const smiPozici = ma('tym.upravit');
  const smiSazbu = ma('finance.sazby_upravit');
  const smiOdebrat = ma('tym.odebrat');
  const smiPozvat = ma('tym.pozvat');
  const smiProfil = ma('tym.profil');

  const data = useDataWidgetu<DataTymu>('/api/teams', vyberTym);
  const pozvankyData = useDataWidgetu<Invitation[]>(smiPozvat ? '/api/invitations' : null, vyberPozvanky);
  // Role pro výběr u člena. Selhání není důvod schovat tým — výběr role
  // se pak jen nenabídne a zbytek obrazovky funguje dál.
  const roleData = useDataWidgetu<VolbaRole[]>('/api/roles', vyberRole);
  const team = data.data?.team ?? null;
  const members = useMemo(() => data.data?.members ?? [], [data.data]);
  const invitations = pozvankyData.data ?? [];
  const role = roleData.data ?? [];

  const otevriProfilLayoutu = usePersonProfile();
  const [profilId, setProfilId] = useState<number | null>(null);
  const otevriProfil = (id: number) => (otevriProfilLayoutu ? otevriProfilLayoutu(id) : setProfilId(id));

  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const flash = (text: string) => setToast({ text, tone: 'ok' });
  const chyba = (text: string) => setToast({ text, tone: 'bad' });

  /** PATCH /api/teams s optimistickým zápisem do dat (a návratem při chybě). */
  const patchTym = async (telo: Record<string, unknown>, lokalne: Partial<Team>, hotovo: string): Promise<boolean> => {
    const puvodni = data.data;
    if (puvodni?.team) data.set({ ...puvodni, team: { ...puvodni.team, ...lokalne } });
    try {
      await fetch('/api/teams', { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify(telo) }).then(okJson);
      flash(hotovo);
      obnovTym();
      return true;
    } catch (e) {
      if (puvodni) data.set(puvodni);
      chyba(apiMessage(e, 'Nastavení se nepodařilo uložit.'));
      return false;
    }
  };

  // ---- Sekce nástroje ----
  const sekce: { id: Sekce; label: string }[] = [
    { id: 'lide', label: 'Lidé' },
    // Podnik je vždy: nese i kartu organizace (ta se ukáže sama, jen když podnik v nějaké je).
    { id: 'podnik', label: 'Podnik' },
    ...(ma('uzaverky.nastaveni') ? [{ id: 'uzaverka' as const, label: 'Uzávěrka' }] : []),
    ...(ma('sdileni.spravovat') ? [{ id: 'sdileni' as const, label: 'Sdílení' }] : []),
    ...(ma(['kiosk.spravovat', 'dochazka.piny']) ? [{ id: 'tablet' as const, label: 'Tablet' }] : []),
    ...(ma('integrace.spravovat') ? [{ id: 'integrace' as const, label: 'Integrace' }] : []),
  ];
  const [zvolena, setZvolena] = useState<Sekce>('lide');
  const aktivni: Sekce = sekce.some(s => s.id === zvolena) ? zvolena : 'lide';

  // ---- Lidé: hledání, úprava, odebrání ----
  const [hledat, setHledat] = useState('');
  const zobrazeni = useMemo(() => {
    const q = hledat.trim().toLowerCase();
    return q ? members.filter(m => obsahujeNekde(q, m.name, m.email, m.job_title)) : members;
  }, [members, hledat]);

  const [uprava, setUprava] = useState<{ m: Member; role: string; pozice: string; sazba: string } | null>(null);
  const [ukladamClena, setUkladamClena] = useState(false);
  const [chybaClena, setChybaClena] = useState<string | null>(null);
  const [odebrat, setOdebrat] = useState<Member | null>(null);
  const [odebiram, setOdebiram] = useState(false);

  const isOwner = team?.owner_id === user.id;
  // Role, které jde člověku přidělit: tablet (Kiosk) patří jen účtu tabletu.
  // Role s oprávněními navíc proti mým server odmítne — v nabídce zůstanou,
  // ale zamčené, ať je vidět proč.
  const vlastnik = isOwner || !!mojeRole?.jeVlastnik;
  const volbyRole = role.filter(r => r.typ !== 'kiosk');
  // Pravidlo proti eskalaci (lib/opravneni.ts): nepřidělíš roli, která má
  // něco navíc proti tvé, a nesáhneš na člena, který má víc než ty. Vedení
  // proti Vedení nemá nic navíc, takže vedoucí dál spravuje i jiné vedoucí
  // (jako před rolemi). Bez načtené vlastní role rozhoduje server.
  const vejdeSe = (sada: string[]) => mojeRole == null || sada.every(k => ma(k));
  const zamekRole = (r: VolbaRole): string | null => (vlastnik || vejdeSe(r.opravneni) ? null : 'víc než tvoje role');
  // Sada člena z výběru rolí (podle role_klic / role_id ze serveru); když ji
  // neznám (role se nenačetly), tlačítka nechám a rozhodne server.
  const sadaClena = (m: Member): string[] | null => {
    const v = roleClena(m);
    return v ? role.find(r => hodnotaRole(r) === v)?.opravneni ?? null : null;
  };
  const nadeMnou = (m: Member) => { const s = sadaClena(m); return !vlastnik && s != null && !vejdeSe(s); };
  const smiUpravitClena = smiPrirazovat || smiPozici || smiSazbu;

  const otevriUpravu = (m: Member) => {
    setChybaClena(null);
    setUprava({ m, role: roleClena(m), pozice: m.job_title ?? '', sazba: m.hourly_rate ? String(m.hourly_rate) : '' });
  };

  const ulozClena = async () => {
    if (!uprava) return;
    const { m } = uprava;
    // Posílá se jen to, co se změnilo A na co má přihlášený oprávnění.
    // Server odmítne celý požadavek, když chybí oprávnění k jedinému poli
    // (teams/members PATCH) — a sazba, kterou server neposlal (bez
    // finance.mzdy přijde null), by se jinak „uložila" jako nula.
    const telo: Record<string, unknown> = { userId: m.id };
    const vybrana = role.find(r => hodnotaRole(r) === uprava.role);
    if (smiPrirazovat && vybrana && uprava.role !== roleClena(m)) {
      if (vybrana.id != null) telo.roleId = vybrana.id; else telo.roleKlic = vybrana.klic;
    }
    if (smiPozici && uprava.pozice !== (m.job_title ?? '')) telo.jobTitle = uprava.pozice;
    const sazba = uprava.sazba === '' ? 0 : parseInt(uprava.sazba, 10) || 0;
    if (smiSazbu && m.hourly_rate != null && sazba !== (m.hourly_rate ?? 0)) telo.hourlyRate = sazba;
    else if (smiSazbu && m.hourly_rate == null && uprava.sazba !== '') telo.hourlyRate = sazba;
    if (Object.keys(telo).length === 1) { setUprava(null); return; }
    setUkladamClena(true); setChybaClena(null);
    try {
      await fetch('/api/teams/members', { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify(telo) }).then(okJson);
      const puvodni = data.data;
      if (puvodni) data.set({ ...puvodni, members: puvodni.members.map(x => (x.id !== m.id ? x : {
        ...x,
        ...(telo.jobTitle !== undefined ? { job_title: uprava.pozice } : {}),
        ...(telo.hourlyRate !== undefined ? { hourly_rate: sazba } : {}),
        ...(vybrana && (telo.roleId !== undefined || telo.roleKlic !== undefined) ? {
          role_klic: vybrana.klic, role_id: vybrana.id, role_nazev: vybrana.nazev,
          // Typ účtu jde s rolí (rozhraní, rozvrh, žebříček) — stejně jako na serveru.
          role: vybrana.typ === 'vedeni' ? 'employer' : vybrana.typ === 'kiosk' ? 'kiosk' : 'employee',
        } : {}),
      })) });
      setUprava(null);
      flash('Změny člena jsou uložené.');
      obnovTym();
    } catch (e) {
      // 403 říká server česky a přesně („Roli Vedení dává a bere jen vlastník…").
      setChybaClena(apiMessage(e, 'Změny se nepodařilo uložit.'));
    } finally {
      setUkladamClena(false);
    }
  };

  const potvrdOdebrani = async () => {
    if (!odebrat) return;
    setOdebiram(true);
    try {
      await fetch(`/api/teams/members?userId=${odebrat.id}`, { method: 'DELETE' }).then(okJson);
      const puvodni = data.data;
      if (puvodni) data.set({ ...puvodni, members: puvodni.members.filter(x => x.id !== odebrat.id) });
      flash(`${odebrat.name} už v týmu není.`);
      obnovTym();
    } catch (e) {
      chyba(apiMessage(e, 'Člena se nepodařilo odebrat.'));
    } finally {
      setOdebiram(false);
      setOdebrat(null);
    }
  };

  // ---- Pozvánky a kód ----
  const [pozvat, setPozvat] = useState(false);
  const [emaily, setEmaily] = useState('');
  const [pozicePozvanky, setPozicePozvanky] = useState('Barista');
  const [rolePozvanky, setRolePozvanky] = useState<'employee' | 'employer'>('employee');
  const [zvu, setZvu] = useState(false);
  const [chybaPozvani, setChybaPozvani] = useState<string | null>(null);
  const [posledni, setPosledni] = useState<{ email: string; token?: string; emailSent: boolean; emailError?: string | null } | null>(null);
  const [zkopirovano, setZkopirovano] = useState<string | null>(null);
  const [zrusit, setZrusit] = useState<Invitation | null>(null);
  const [rusim, setRusim] = useState(false);
  const [generuji, setGeneruji] = useState(false);
  useEffect(() => {
    if (!zkopirovano) return;
    const t = setTimeout(() => setZkopirovano(null), 2000);
    return () => clearTimeout(t);
  }, [zkopirovano]);

  // Odkaz z tokenu podle aktuální adresy — nezávisle na APP_URL serveru.
  const odkazPozvanky = (token?: string | null) =>
    token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/join?token=${token}` : '';
  const kopiruj = async (text: string, klic: string): Promise<boolean> => {
    if (!text) return false;
    try { await navigator.clipboard.writeText(text); setZkopirovano(klic); return true; } catch { return false; /* schránka zakázaná — text je vidět */ }
  };

  // „Pozvat jako vedoucí" = přidělit Vedení: jen když se Vedení vejde do mé role.
  const sadaVedeni = role.find(r => r.klic === 'vedeni')?.opravneni;
  const smiPozvatVedeni = smiPrirazovat && (vlastnik || !sadaVedeni || vejdeSe(sadaVedeni));

  const pozviJednoho = async (email: string) => {
    const d = await fetch('/api/invitations', {
      method: 'POST', headers: JSON_HLAVICKA,
      body: JSON.stringify({ email, jobTitle: pozicePozvanky.trim() || 'Barista', role: rolePozvanky }),
    }).then(okJson);
    return d as { token?: string; emailSent?: boolean; emailError?: string | null };
  };

  const odesliPozvanky = async () => {
    setChybaPozvani(null);
    // Nábor na sezónu = šest brigádníků naráz: jde vložit celý seznam
    // oddělený čárkou, středníkem, mezerou nebo řádky.
    const seznam = Array.from(new Set(emaily.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean)));
    if (seznam.length === 0) { setChybaPozvani('Napiš aspoň jeden e-mail.'); return; }
    setZvu(true);
    try {
      if (seznam.length === 1) {
        try {
          const d = await pozviJednoho(seznam[0]);
          setEmaily('');
          obnovTym();
          // S tokenem okno ukáže odkaz k přeposlání; bez něj (pozvánku poslal server
          // e-mailem a odkaz nevrátil) by zůstal prázdný formulář bez odezvy.
          if (d.token) setPosledni({ email: seznam[0], token: d.token, emailSent: !!d.emailSent, emailError: d.emailError ?? null });
          else { setPozvat(false); flash(`Pozvánka odešla na ${seznam[0]}.`); }
        } catch (e) {
          setChybaPozvani(apiMessage(e, 'Pozvánku se nepodařilo odeslat.'));
        }
        return;
      }
      // Server hlídá velikost týmu podle tarifu, takže část pozvánek může
      // projít a část ne. Kolik prošlo, se musí říct — „hotovo" by lhalo.
      const hotove: string[] = [];
      const selhane: { email: string; proc: string }[] = [];
      for (const email of seznam) {
        try { await pozviJednoho(email); hotove.push(email); } catch (e) { selhane.push({ email, proc: apiMessage(e, '') }); }
      }
      if (hotove.length > 0) {
        setEmaily(selhane.map(f => f.email).join(', '));
        flash(`Pozváno ${czCount(hotove.length, LIDI)}. Odkazy najdeš v čekajících pozvánkách.`);
        obnovTym();
        if (selhane.length === 0) setPozvat(false);
      }
      if (selhane.length > 0) {
        setChybaPozvani(selhane.length === seznam.length
          ? (selhane[0].proc || 'Pozvánky se nepodařilo odeslat.')
          : `${czCount(selhane.length, POZVANEK)} neprošla: ${selhane.map(f => f.email).join(', ')}${selhane[0].proc ? ` — ${selhane[0].proc}` : ''}`);
      }
    } finally {
      setZvu(false);
    }
  };

  const zavriPozvani = () => { setPozvat(false); setPosledni(null); setChybaPozvani(null); };

  const potvrdZruseni = async () => {
    if (!zrusit) return;
    setRusim(true);
    try {
      await fetch(`/api/invitations?id=${zrusit.id}`, { method: 'DELETE' }).then(okJson);
      pozvankyData.set(p => (p ?? []).map(x => (x.id === zrusit.id ? { ...x, status: 'revoked' } : x)));
      flash('Pozvánka je zrušená, odkaz už neplatí.');
      obnovTym();
    } catch (e) {
      chyba(apiMessage(e, 'Pozvánku se nepodařilo zrušit.'));
    } finally {
      setRusim(false);
      setZrusit(null);
    }
  };

  const novyKod = async () => {
    setGeneruji(true);
    try {
      const d = await fetch('/api/teams', { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ regenerateCode: true }) }).then(okJson);
      const puvodni = data.data;
      if (puvodni?.team && d?.team?.join_code) data.set({ ...puvodni, team: { ...puvodni.team, join_code: d.team.join_code } });
      flash('Nový kód platí, starý už ne.');
      obnovTym();
    } catch (e) {
      chyba(apiMessage(e, 'Nový kód se nepodařilo vygenerovat.'));
    } finally {
      setGeneruji(false);
    }
  };

  // ---- Podnik: název a provoz ----
  const [nazev, setNazev] = useState<string | null>(null);
  const [ukladamNazev, setUkladamNazev] = useState(false);
  const ulozNazev = async () => {
    const n = (nazev ?? '').trim();
    if (!n) return;
    setUkladamNazev(true);
    if (await patchTym({ name: n }, { name: n }, 'Název podniku je uložený.')) setNazev(null);
    setUkladamNazev(false);
  };
  const [cilMezd, setCilMezd] = useState<string | null>(null);
  const [kasa, setKasa] = useState<string | null>(null);
  const [ukladam, setUkladam] = useState<string | null>(null);
  const prepni = async (klic: string, telo: Record<string, unknown>, lokalne: Partial<Team>, hotovo: string) => {
    setUkladam(klic);
    await patchTym(telo, lokalne, hotovo);
    setUkladam(null);
  };

  // ---- Vykreslení ----

  const seznamLidi = (
    <Card pad="none" aria-labelledby="tym-lide-t">
      <div className="px-5 pt-5 space-y-3">
        <h2 id="tym-lide-t" className="t-card flex items-center gap-2">
          <Icon name="users" size={17} className="shrink-0 text-black/40" />
          Lidé v podniku
          {data.data && <Chip tone="muted" size="sm">{members.length.toLocaleString('cs-CZ')}</Chip>}
        </h2>
        {/* Nad osm lidí se v seznamu hledalo Ctrl+F v prohlížeči. */}
        {members.length > 8 && (
          <SearchField value={hledat} onChange={setHledat} storageKey="tym" placeholder="Hledat člena — jméno, pozice…" ariaLabel="Hledat člena týmu" />
        )}
      </div>
      <div className="px-5 pb-3 pt-1">
        {zobrazeni.length === 0 ? (
          <p className="t-meta py-4">Nikdo neodpovídá hledání.</p>
        ) : (
          <ul className="list">
            {zobrazeni.map(m => {
              const owner = m.id === team?.owner_id;
              const menu: MenuItem[] = [
                ...(smiProfil ? [{ label: 'Profil', icon: 'user', onClick: () => otevriProfil(m.id) }] : []),
                ...(smiOdebrat && !owner && !nadeMnou(m) && m.id !== user.id ? [{ label: 'Odebrat z týmu', icon: 'minus', danger: true, onClick: () => setOdebrat(m) }] : []),
              ];
              const upravit = smiUpravitClena && !owner && !nadeMnou(m);
              const akce = (
                <>
                  {upravit && <Button variant="secondary" size="sm" onClick={() => otevriUpravu(m)} aria-label={`Upravit: ${m.name}`}>Upravit</Button>}
                  {menu.length > 1 || (menu.length === 1 && upravit)
                    ? <Menu size="sm" label={`Další akce: ${m.name}`} items={menu} />
                    : menu.length === 1 ? <Button variant="secondary" size="sm" onClick={menu[0].onClick}>{menu[0].label === 'Profil' ? 'Profil' : 'Odebrat'}</Button> : null}
                </>
              );
              return (
                <ListRow key={m.id}
                  lead={<Avatar emoji={m.avatar} size="sm" />}
                  title={m.name}
                  meta={[m.job_title, m.email].filter(Boolean).join(' · ')}
                  right={<>
                    {owner ? <Chip tone="ink" size="sm">Vlastník</Chip> : <Chip tone="muted" size="sm">{nazevRole(m, role)}</Chip>}
                    {m.aktivni_jinde && (
                      <span className="hidden sm:inline-flex" title="Je členem i jiného podniku a je tam právě přepnutý. Tady zůstává v seznamu, rozvrhu i ve mzdách.">
                        <Chip tone="muted" size="sm">Právě v jiném podniku</Chip>
                      </span>
                    )}
                  </>}
                  actions={upravit || menu.length > 0 ? akce : undefined}
                />
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );

  // Kód a počet čekajících ukazuje widget Pozvánky (tym.pozvanky) nad nástrojem —
  // druhý blok s tímtéž kódem a druhým „Kopírovat" by byl na jedné obrazovce
  // dvakrát (DP §0, §5.8). Karta nese jen to, co widget neumí: všechny
  // pozvánky s Odkaz a Zrušit a vygenerování nového kódu. Kopírovat kód jde
  // i z „···" v hlavičce, kdyby si widget někdo z plochy odebral.
  const kartaPozvanek = smiPozvat && team && (
    <Card aria-labelledby="tym-pozvanky-t">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id="tym-pozvanky-t" className="t-card flex items-center gap-2">
          <Icon name="mail" size={17} className="shrink-0 text-black/40" />
          Pozvánky
        </h2>
        <Button variant="ghost" size="sm" icon="refresh" loading={generuji} onClick={novyKod}>Nový kód</Button>
      </div>
      <p className="t-meta mt-1 text-pretty">Člověk se připojí kódem na stránce /join, nebo odkazem z pozvánky. Nový kód zneplatní ten starý.</p>
      {pozvankyData.error ? (
        <ErrorState compact title="Pozvánky se nenačetly" detail={pozvankyData.error} onRetry={pozvankyData.reload} className="mt-2" />
      ) : invitations.length === 0 ? (
        pozvankyData.loading ? <Skeleton className="h-10 mt-3" />
          : <EmptyState illustration="tym" title="Zatím žádná pozvánka" hint="Pošli kód nebo odkaz — člověk se připojí za minutu a hned vidí rozvrh." compact />
      ) : (
        <ul className="list mt-2">
          {invitations.map(inv => {
            const stav = STAV_POZVANKY[inv.status] ?? STAV_POZVANKY.pending;
            const ceka = inv.status === 'pending';
            return (
              <ListRow key={inv.id}
                title={<span className="break-all sm:break-normal">{inv.email}</span>}
                meta={inv.job_title || 'Barista'}
                right={<Chip tone={stav.tone} size="sm">{stav.label}</Chip>}
                actions={ceka ? <>
                  {inv.token && (
                    <Button variant="secondary" size="sm" icon={zkopirovano === inv.token ? 'check' : 'copy'} onClick={() => kopiruj(odkazPozvanky(inv.token), inv.token!)}>
                      {zkopirovano === inv.token ? 'Zkopírováno' : 'Odkaz'}
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setZrusit(inv)} aria-label={`Zrušit pozvánku: ${inv.email}`}>Zrušit</Button>
                </> : undefined}
              />
            );
          })}
        </ul>
      )}
    </Card>
  );

  const podnik = team && (
    <>
      {ma('podnik.nastaveni') && (
        <Card aria-labelledby="tym-nazev-t">
          <h2 id="tym-nazev-t" className="t-card flex items-center gap-2">
            <Icon name="tag" size={17} className="shrink-0 text-black/40" /> Název podniku
          </h2>
          {nazev !== null ? (
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <Field id="tym-nazev" className="flex-1">
                <Input id="tym-nazev" aria-label="Název podniku" value={nazev} onChange={e => setNazev(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void ulozNazev(); }} />
              </Field>
              <div className="flex gap-2">
                <Button variant="primary" loading={ukladamNazev} onClick={ulozNazev}>Uložit</Button>
                <Button variant="secondary" onClick={() => setNazev(null)}>Zrušit</Button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
              <p className="t-section min-w-0 line-clamp-2">{team.name}</p>
              <Button variant="secondary" icon="pencil" onClick={() => setNazev(team.name)}>Přejmenovat</Button>
            </div>
          )}
        </Card>
      )}
      {/* Provoz podniku podle oprávnění (kolo 67) — bez nich by každá změna skončila „nepodařilo se uložit". */}
      {ma(['podnik.nastaveni', 'finance.nastaveni']) && <Card aria-labelledby="tym-provoz-t">
        <h2 id="tym-provoz-t" className="t-card flex items-center gap-2">
          <Icon name="settings" size={17} className="shrink-0 text-black/40" /> Provoz podniku
        </h2>
        <p className="t-meta mt-1">Měna, formát čísel a cíle — přizpůsob aplikaci svému podniku.</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="tym-mena" label="Měna">
            <Select id="tym-mena" value={team.currency ?? 'CZK'} disabled={ukladam === 'biz'}
              onChange={e => prepni('biz', { currency: e.target.value }, { currency: e.target.value }, 'Nastavení provozu je uložené.')}>
              {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
            </Select>
          </Field>
          <Field id="tym-jazyk" label="Formát čísel (jazyk)">
            <Select id="tym-jazyk" value={team.locale ?? 'cs-CZ'} disabled={ukladam === 'biz'}
              onChange={e => prepni('biz', { locale: e.target.value }, { locale: e.target.value }, 'Nastavení provozu je uložené.')}>
              {LOCALES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
            </Select>
          </Field>
          <Field id="tym-tyden" label="Začátek týdne">
            <Select id="tym-tyden" value={String(team.week_start ?? 1)} disabled={ukladam === 'biz'}
              onChange={e => prepni('biz', { weekStart: Number(e.target.value) }, { week_start: Number(e.target.value) }, 'Nastavení provozu je uložené.')}>
              <option value="1">Pondělí</option>
              <option value="0">Neděle</option>
            </Select>
          </Field>
          <Field id="tym-cil" label="Cíl mzdových nákladů (%)" hint="Podíl mezd na tržbách — Mzdy za období ukážou, jestli jste v cíli.">
            <Input id="tym-cil" type="number" inputMode="numeric" min={0} max={100} placeholder="30" disabled={ukladam === 'biz'}
              value={cilMezd ?? (team.labor_target_pct != null ? String(team.labor_target_pct) : '')}
              onChange={e => setCilMezd(e.target.value)}
              onBlur={() => {
                if (cilMezd === null) return;
                const v = cilMezd.trim() === '' ? null : Math.max(0, Math.min(100, Math.round(Number(cilMezd))));
                setCilMezd(null);
                if ((team.labor_target_pct ?? null) !== v) void prepni('biz', { laborTargetPct: v }, { labor_target_pct: v }, 'Nastavení provozu je uložené.');
              }} />
          </Field>
        </div>
      </Card>}
      <OrganizationSettings />
    </>
  );

  const uzaverka = team && (
    <Card aria-labelledby="tym-vyplaty-t">
      <h2 id="tym-vyplaty-t" className="t-card flex items-center gap-2">
        <Icon name="receipt" size={17} className="shrink-0 text-black/40" /> Výplaty a uzávěrka
      </h2>
      <p className="t-meta mt-1">Nastavení, které ovlivňuje denní uzávěrku zaměstnanců.</p>
      <ul className="list mt-2">
        <SwitchRow title="Výplaty denně v hotovosti" hint="Když je zapnuto, zaměstnanci v uzávěrce vyplní i kolik si dnes vyplatili z kasy."
          checked={!!team.pay_daily_cash} disabled={ukladam === 'pay'}
          onChange={v => prepni('pay', { payDailyCash: v }, { pay_daily_cash: v }, v ? 'Denní výplata v hotovosti je zapnutá.' : 'Denní výplata v hotovosti je vypnutá.')} />
        <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <label htmlFor="tym-kasa" className="min-w-0 flex-1 basis-60">
            <span className="block text-sm font-semibold text-[#16181A]">Stav kasy po směně</span>
            <span className="block text-xs text-black/45 mt-0.5 text-pretty">Kolik hotovosti má v kase zůstat pro další směnu. Uzávěrka pak sama spočítá, kolik odložit ven.</span>
          </label>
          <div className="flex items-center gap-2">
            <Input id="tym-kasa" type="number" inputMode="numeric" min={0} placeholder="nenastaveno" className="!w-32 text-right tabular-nums"
              value={kasa ?? (team.drawer_float != null ? String(team.drawer_float) : '')} onChange={e => setKasa(e.target.value)} />
            <span className="t-meta">{symbol}</span>
            {kasa !== null && (
              <Button variant="primary" size="sm" loading={ukladam === 'kasa'} onClick={async () => {
                const v = kasa === '' ? null : parseInt(kasa, 10);
                await prepni('kasa', { drawerFloat: v }, { drawer_float: v }, 'Cílový stav kasy je uložený.');
                setKasa(null);
              }}>Uložit</Button>
            )}
          </div>
        </li>
        <SwitchRow title="Tým vidí rozvrh ostatních" hint="Zaměstnanci uvidí, kdo má kdy směnu — jen jména a časy, žádné sazby. Když vypneš, uvidí každý jen sebe."
          checked={team.show_team_schedule !== false} disabled={ukladam === 'rozvrh'}
          onChange={v => prepni('rozvrh', { showTeamSchedule: v }, { show_team_schedule: v }, v ? 'Tým teď vidí, kdo má kdy směnu.' : 'Zaměstnanci vidí jen svoje směny.')} />
        <SwitchRow title="Uzávěrka jen po směně" hint="Zaměstnanec může odeslat uzávěrku jen za den, kdy měl naplánovanou směnu."
          checked={team.closing_requires_shift !== false} disabled={ukladam === 'smena'}
          onChange={v => prepni('smena', { closingRequiresShift: v }, { closing_requires_shift: v }, v ? 'Uzávěrka je vázaná na směnu.' : 'Uzávěrku může vyplnit kdokoli.')} />
      </ul>
    </Card>
  );

  let obsah: React.ReactNode;
  if (data.loading) {
    obsah = <Card><div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div></Card>;
  } else if (data.error) {
    obsah = <Card><ErrorState compact title="Tým se nepodařilo načíst" hint="Data jsou v pořádku — jen se je teď nepodařilo načíst." detail={data.error} onRetry={data.reload} /></Card>;
  } else if (!team) {
    obsah = <Card><EmptyState illustration="tym" title="Zatím nemáš žádný tým" compact /></Card>;
  } else {
    obsah = (
      <>
        {aktivni === 'lide' && <>{seznamLidi}{kartaPozvanek}</>}
        {aktivni === 'podnik' && podnik}
        {aktivni === 'uzaverka' && uzaverka}
        {aktivni === 'sdileni' && <ShareSettings />}
        {aktivni === 'tablet' && <KioskSettings />}
        {aktivni === 'integrace' && <NoisiumConnect />}
      </>
    );
  }

  const nastroj = (
    <div className="space-y-4">
      {sekce.length > 1 && (
        <Segmented wrap ariaLabel="Sekce nastavení týmu" value={aktivni} onChange={setZvolena} options={sekce} />
      )}
      {obsah}
    </div>
  );

  const volbaRole = (r: VolbaRole, m: Member) => {
    const z = zamekRole(r);
    return <option key={hodnotaRole(r)} value={hodnotaRole(r)} disabled={!!z && hodnotaRole(r) !== roleClena(m)}>{r.nazev}{z ? ` — ${z}` : ''}</option>;
  };

  return (
    <>
      <PlochaWidgetu
        stranka="vedeni.tym"
        hlavicka={{
          title: 'Tým',
          subtitle: 'Lidé, role, pozvánky a pravidla podniku.',
          hintId: 'teammanagement',
          primary: smiPozvat && team ? <Button variant="accent" icon="plus" onClick={() => { setPosledni(null); setChybaPozvani(null); setPozvat(true); }}>Pozvat člena</Button> : undefined,
          menu: smiPozvat && team?.join_code ? [{ label: `Kopírovat kód ${team.join_code}`, icon: 'copy', onClick: () => { void kopiruj(team.join_code ?? '', 'kod').then(ok => (ok ? flash('Kód pro připojení je ve schránce.') : chyba(`Schránka je zakázaná. Kód pro připojení: ${team.join_code}`))); } }] : undefined,
        }}
        nastroj={nastroj}
      />

      {pozvat && (
        <Modal open onClose={zavriPozvani} size="md" title="Pozvat člena" subtitle="Pozvánka přijde e-mailem; odkaz můžeš poslat i sám."
          footer={posledni?.token ? (
            <Button variant="primary" onClick={zavriPozvani}>Hotovo</Button>
          ) : <>
            <Button variant="secondary" onClick={zavriPozvani}>Zrušit</Button>
            <Button variant="primary" icon="send" loading={zvu} onClick={odesliPozvanky}>Odeslat pozvánku</Button>
          </>}>
          {posledni?.token ? (
            <div className="space-y-3">
              <p className="text-sm text-[#16181A] font-semibold">Pošli tenhle odkaz: {posledni.email}</p>
              <p className="t-meta text-pretty">
                {posledni.emailSent
                  ? 'E-mail jsme odeslali, ale nemusí vždy dorazit — nejjistější je poslat odkaz přímo (WhatsApp, SMS…).'
                  : posledni.emailError
                    ? `E-mail neodešel (${posledni.emailError}), takže pozvánku doruč sám — zkopíruj odkaz a pošli ho.`
                    : 'E-mail není nastavený, takže pozvánku doruč sám — zkopíruj odkaz a pošli ho.'}
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly aria-label="Odkaz pozvánky" value={odkazPozvanky(posledni.token)} onFocus={e => e.currentTarget.select()} className="font-mono text-xs" />
                <Button variant="secondary" size="sm" icon={zkopirovano === posledni.token ? 'check' : 'copy'} onClick={() => kopiruj(odkazPozvanky(posledni.token), posledni.token!)}>
                  {zkopirovano === posledni.token ? 'Zkopírováno' : 'Kopírovat'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Field id="tym-pozvat-emaily" label="E-mail" hint="Víc lidí naráz odděl čárkou nebo novým řádkem." error={chybaPozvani}>
                <Textarea id="tym-pozvat-emaily" rows={2} value={emaily} onChange={e => setEmaily(e.target.value)} autoFocus />
              </Field>
              <Field id="tym-pozvat-pozice" label="Pozice (nepovinné)">
                <Input id="tym-pozvat-pozice" value={pozicePozvanky} onChange={e => setPozicePozvanky(e.target.value)} />
              </Field>
              {/* Pozvat jako vedení = přidělit roli; bez tym.role_prirazovat jde pozvat jen do výchozí role podniku. */}
              {smiPozvatVedeni && (
                <div>
                  <p className="field-label" id="tym-pozvat-role">Jako</p>
                  <Segmented size="sm" ariaLabel="Role nového člena" value={rolePozvanky} onChange={setRolePozvanky}
                    options={[{ id: 'employee', label: 'Zaměstnanec' }, { id: 'employer', label: 'Vedoucí' }]} />
                  {rolePozvanky === 'employer' && (
                    <p className="note note-wait mt-2 text-[13px]">Vedoucí má plný přístup: správa týmu, rozvrhy, sklad, uzávěrky i docházka.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}

      {uprava && (
        <Modal open onClose={() => setUprava(null)} size="sm" title="Upravit člena" subtitle={uprava.m.name}
          footer={<>
            <Button variant="secondary" onClick={() => setUprava(null)}>Zrušit</Button>
            <Button variant="primary" icon="check" loading={ukladamClena} onClick={ulozClena}>Uložit</Button>
          </>}>
          <div className="space-y-3">
            <Field id="clen-role" label="Role"
              hint={!smiPrirazovat ? 'Na přidělování rolí nemáš oprávnění.'
                : volbyRole.length === 0 ? 'Role se nepodařilo načíst — zkus obrazovku otevřít znovu.'
                : 'Co role smí, nastavíš v Nastavení → Role a oprávnění.'}>
              {/* Role = sada oprávnění (kolo 67); co přidělit nesmím, je vidět, ale zamčené. */}
              <Select id="clen-role" value={uprava.role} disabled={!smiPrirazovat || volbyRole.length === 0}
                onChange={e => setUprava(u => (u ? { ...u, role: e.target.value } : u))}>
                {uprava.role === '' && <option value="">{nazevRole(uprava.m, role)} (beze změny)</option>}
                <optgroup label="Přednastavené">{volbyRole.filter(r => r.id == null).map(r => volbaRole(r, uprava.m))}</optgroup>
                {volbyRole.some(r => r.id != null) && (
                  <optgroup label="Vlastní role">{volbyRole.filter(r => r.id != null).map(r => volbaRole(r, uprava.m))}</optgroup>
                )}
              </Select>
            </Field>
            <Field id="clen-pozice" label="Pozice" hint={smiPozici ? undefined : 'Na úpravu pozice nemáš oprávnění.'}>
              <Input id="clen-pozice" value={uprava.pozice} disabled={!smiPozici} onChange={e => setUprava(u => (u ? { ...u, pozice: e.target.value } : u))} />
            </Field>
            <Field id="clen-sazba" label={`Hodinová sazba (${symbol}/h)`} error={chybaClena}
              hint={smiSazbu ? 'Použije se pro mzdy v Docházce, Financích i uzávěrkách.' : 'Na úpravu sazeb nemáš oprávnění.'}>
              <Input id="clen-sazba" inputMode="numeric" disabled={!smiSazbu} value={uprava.sazba}
                placeholder={uprava.m.hourly_rate == null && !ma('finance.mzdy') ? 'skrytá' : '0'}
                onChange={e => setUprava(u => (u ? { ...u, sazba: e.target.value.replace(/\D/g, '') } : u))} />
            </Field>
          </div>
        </Modal>
      )}

      {odebrat && (
        <Modal open onClose={() => !odebiram && setOdebrat(null)} size="sm" title="Odebrat člena?" subtitle={odebrat.name}
          footer={<>
            <Button variant="secondary" onClick={() => setOdebrat(null)} disabled={odebiram}>Zrušit</Button>
            <Button variant="danger-solid" loading={odebiram} onClick={potvrdOdebrani}>Odebrat</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{odebrat.name} ztratí přístup k podniku a zmizí z jeho konverzací. Docházka a uzávěrky zůstanou.</p>
        </Modal>
      )}

      {zrusit && (
        <Modal open onClose={() => !rusim && setZrusit(null)} size="sm" title="Zrušit pozvánku?" subtitle={zrusit.email}
          footer={<>
            <Button variant="secondary" onClick={() => setZrusit(null)} disabled={rusim}>Nechat</Button>
            <Button variant="danger-solid" loading={rusim} onClick={potvrdZruseni}>Zrušit pozvánku</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">Odkaz z pozvánky přestane platit. Kód pro připojení platí dál.</p>
        </Modal>
      )}

      {profilId != null && <EmployeeProfile employeeId={profilId} onClose={() => setProfilId(null)} />}
      <Toast message={toast?.text ?? null} tone={toast?.tone ?? 'ok'} onClose={() => setToast(null)} />
    </>
  );
}
