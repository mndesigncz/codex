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
import NoisiumConnect from './NoisiumConnect';
import KioskSettings from './KioskSettings';
import EmployeeProfile from './employer/EmployeeProfile';
import ShareSettings from './employer/ShareSettings';
import { usePersonProfile } from './employer/ProfileLinkProvider';
import { Avatar, Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Menu, Modal, ObdobiLista, Rada, SearchField, Segmented, Select, Skeleton, SwitchRow, Textarea, Toast, type MenuItem } from './ui';
import { Icon } from './Icons';
import { PlochaWidgetu } from './widgety/PlochaWidgetu';
import { obnovDataWidgetu, useDataWidgetu } from './widgety/useDataWidgetu';
import { obnovTym } from './widgety/oblasti/tym';
import { vycistiNarok, type NarokDovolene } from '@/lib/dovolena';
import NavigaceNastaveni from './NavigaceNastaveni';
import { useNavigace } from './widgety/NavigaceKontext';
import { useMoney, useSymbol } from './CurrencyProvider';
import { apiMessage, okJson } from '@/lib/api';
import { obsahujeNekde } from '@/lib/hledani';
import { useOpravneni } from './role/useOpravneni';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { useLocale } from './employer/jazyk';
import { useObdobi } from '@/lib/useObdobi';
import { obdobiZPresetu, platneRozmezi } from '@/lib/obdobi';
import { dayPlus, pragueToday } from '@/lib/pragueTime';
import { hodinyMinuty, type ClenRosteru, type ZaznamDochazky } from '@/lib/dochazkaPrehled';
import { dniKNacteni, hodinyClenu, seradCleny, soucetHodinClenu, type RazeniClenu } from '@/lib/tymHodiny';

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
  // Lokalizace podniku (kolo 76); starší server je neposílá.
  country?: string | null;
  default_lang?: string;
  time_format?: string;
  timezone?: string;
}

interface Invitation {
  id: number;
  email: string;
  job_title?: string;
  status: string;
  /** Null, když pozvánku vytvořil někdo jiný a její roli bych dát nesměl (server token schová). */
  token?: string | null;
  created_at: string;
  /** Role, se kterou člověk přijde (kolo 6): název pro chip; u výchozí role ta dnešní. Starší server ho neposílá. */
  role_nazev?: string | null;
}

interface DataTymu { team: Team | null; members: Member[] }
/** Docházka z /api/attendance (jen co hodiny u lidí potřebují): roster se sazbami a záznamy. */
interface DataDochazky { roster: ClenRosteru[]; entries: ZaznamDochazky[] }

function vyberTym(raw: any): DataTymu {
  if (!raw || typeof raw !== 'object') throw new Error('Tým přišel v nečekaném tvaru.'); // i18n-ok
  return { team: raw.team ?? null, members: Array.isArray(raw.members) ? raw.members : [] };
}
function vyberPozvanky(raw: any): Invitation[] {
  if (!raw || !Array.isArray(raw.invitations)) throw new Error('Pozvánky přišly v nečekaném tvaru.'); // i18n-ok
  return raw.invitations;
}
function vyberDochazku(raw: any): DataDochazky {
  if (!raw || !Array.isArray(raw.entries)) throw new Error('Docházka přišla v nečekaném tvaru.'); // i18n-ok
  return { roster: Array.isArray(raw.roster) ? raw.roster : [], entries: raw.entries };
}
/** Nároky na dovolenou po lidech z GET /api/timeoff (kolo 8); starší server je neposílá → prázdno. */
function vyberNaroky(raw: any): Record<string, NarokDovolene> {
  return raw && typeof raw === 'object' && raw.naroky && typeof raw.naroky === 'object' ? raw.naroky : {};
}
/** Výchozí role podniku z /api/roles ve tvaru hodnoty <select> ('' = neznámá). */
function vyberVychoziRoli(raw: any): string {
  return raw?.vychozi && typeof raw.vychozi === 'object' ? hodnotaRole({ klic: raw.vychozi.klic ?? null, id: raw.vychozi.id ?? null }) : '';
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
function nazevRole(t: PrekladFn, m: Member, role: VolbaRole[]): string {
  if (m.role_nazev) return m.role_nazev;
  const v = roleClena(m);
  const r = v ? role.find(x => hodnotaRole(x) === v) : null;
  return r?.nazev ?? (m.role === 'employer' ? t('Vedoucí') : t('Zaměstnanec'));
}

const stavPozvanky = (t: PrekladFn): Record<string, { label: string; tone: 'ok' | 'bad' | 'info' }> => ({
  accepted: { label: t('Přijato'), tone: 'ok' },
  expired: { label: t('Vypršelo'), tone: 'bad' },
  declined: { label: t('Odmítnuto'), tone: 'bad' },
  revoked: { label: t('Zrušeno'), tone: 'bad' },
  pending: { label: t('Čeká'), tone: 'info' },
});

type Sekce = 'lide' | 'podnik' | 'uzaverka' | 'sdileni' | 'tablet' | 'integrace'; // i18n-ok (id záložek)
const JSON_HLAVICKA = { 'Content-Type': 'application/json' };
/** Nárok je nastavený (nárok i zůstatek jsou čísla) — jen tehdy se zůstatek kreslí. */
const h2 = (n: NarokDovolene | null): n is NarokDovolene & { dni: number; zbyva: number } => !!n && n.dni != null && n.zbyva != null;


export default function TeamManagement({ user }: { user: { id: number; name: string; role: string; avatar?: string } }) {
  const loc = useLocale();
  const t = useT('tym');
  const symbol = useSymbol();
  // Co smí přihlášený v tomhle podniku (kolo 67). Akce, na které nemá,
  // se neukazují: tlačítko, které vždycky skončí 403, je jen past.
  const { ma, role: mojeRole } = useOpravneni();
  const nav = useNavigace();
  const smiPrirazovat = ma('tym.role_prirazovat');
  const smiPozici = ma('tym.upravit');
  const smiSazbu = ma('finance.sazby_upravit');
  const smiOdebrat = ma('tym.odebrat');
  const smiPozvat = ma('tym.pozvat');
  const smiProfil = ma('tym.profil');
  // Seznam lidí (kolo 6): telefon jen s tym.kontakty, sazba jen s finance.mzdy (server je bez nich ani nepošle).
  const smiKontakty = ma('tym.kontakty');
  const smiVidetSazby = ma('finance.mzdy');
  const money = useMoney();

  const data = useDataWidgetu<DataTymu>('/api/teams', vyberTym);
  const pozvankyData = useDataWidgetu<Invitation[]>(smiPozvat ? '/api/invitations' : null, vyberPozvanky);
  // Role pro výběr u člena. Selhání není důvod schovat tým — výběr role
  // se pak jen nenabídne a zbytek obrazovky funguje dál.
  const roleData = useDataWidgetu<VolbaRole[]>('/api/roles', vyberRole);
  const vychoziRole = useDataWidgetu<string>('/api/roles', vyberVychoziRoli).data ?? '';
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
      chyba(apiMessage(e, t('Nastavení se nepodařilo uložit.')));
      return false;
    }
  };

  // ---- Sekce nástroje ----
  const sekce: { id: Sekce; label: string }[] = [
    { id: 'lide', label: t('Lidé') },
    // Podnik je vždy: nese i kartu organizace (ta se ukáže sama, jen když podnik v nějaké je).
    { id: 'podnik', label: t('Podnik') },
    ...(ma('uzaverky.nastaveni') ? [{ id: 'uzaverka' as const, label: t('Uzávěrka') }] : []),
    ...(ma('sdileni.spravovat') ? [{ id: 'sdileni' as const, label: t('Sdílení') }] : []),
    ...(ma(['kiosk.spravovat', 'dochazka.piny']) ? [{ id: 'tablet' as const, label: t('Tablet') }] : []), // i18n-ok (id)
    ...(ma('integrace.spravovat') ? [{ id: 'integrace' as const, label: t('Integrace') }] : []),
  ];
  const [zvolena, setZvolena] = useState<Sekce>('lide');
  const aktivni: Sekce = sekce.some(s => s.id === zvolena) ? zvolena : 'lide';

  // ---- Lidé: hodiny a výdělek za období (kolo 8, R8-3) ----
  // „Kdo kolik odpracoval" patří tam, kde člověk lidi hledá: u každého člena hodiny za zvolené
  // období a pod nimi hrubá mzda (hodiny × sazba, jako Souhrn hodin). Čte stejnou adresu jako
  // Docházka (/api/attendance?days=N, nejvýš 180 dní zpět) — jen s dochazka.zobrazit; sazby
  // server bez finance.mzdy neposílá a mzda se pak nekreslí. Výplata s příplatky a dýškem
  // (/api/payroll) se sem napojí v dalším kole; zatím je výdělek stejný jako v Souhrnu hodin.
  const smiHodiny = ma('dochazka.zobrazit');
  const dnes = pragueToday();
  const vychoziObdobi = useMemo(() => obdobiZPresetu('mesic', dnes), [dnes]);
  const { obdobi, nastav: nastavObdobi } = useObdobi('tym-lide', vychoziObdobi);
  const nejdrive = dayPlus(dnes, -179);
  const rozmezi = useMemo(() => { const r = platneRozmezi(obdobi, dnes); return { od: r.od < nejdrive ? nejdrive : r.od, do: r.do }; }, [obdobi, dnes, nejdrive]);
  const dochazka = useDataWidgetu<DataDochazky>(smiHodiny ? `/api/attendance?days=${dniKNacteni(rozmezi.od, dnes)}` : null, vyberDochazku);
  const hodiny = useMemo(() => (dochazka.data ? hodinyClenu(dochazka.data.entries, dochazka.data.roster, rozmezi.od, rozmezi.do, Date.now(), smiVidetSazby) : null),
    [dochazka.data, rozmezi.od, rozmezi.do, smiVidetSazby]);
  const soucet = useMemo(() => (hodiny ? soucetHodinClenu(hodiny) : null), [hodiny]);
  const [razeni, setRazeni] = useState<RazeniClenu>('jmeno');

  // ---- Lidé: hledání, úprava, odebrání ----
  const [hledat, setHledat] = useState('');
  const zobrazeni = useMemo(() => {
    const q = hledat.trim().toLowerCase();
    const sez = q ? members.filter(m => obsahujeNekde(q, m.name, m.email, m.job_title, m.phone)) : members;
    // Bez hodin zůstává pořadí serveru (vedení napřed, pak abeceda); řazení přijde až s docházkou.
    return hodiny && razeni !== 'jmeno' ? seradCleny(sez, hodiny, razeni) : sez;
  }, [members, hledat, hodiny, razeni]);

  // Nárok na dovolenou (kolo 8): dní za rok na členství, nastavuje kdo volno schvaluje; čte se s nároky
  // a zůstatky z /api/timeoff (stejná adresa jako fronta žádostí), ukládá PUT /api/timeoff.
  const smiNarok = ma('volno.schvalovat');
  const naroky = useDataWidgetu<Record<string, NarokDovolene>>(smiNarok ? '/api/timeoff' : null, vyberNaroky);
  const narokClena = (id: number): NarokDovolene | null => naroky.data?.[String(id)] ?? null;
  const [uprava, setUprava] = useState<{ m: Member; role: string; pozice: string; sazba: string; dovolena: string } | null>(null);
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
  const zamekRole = (r: VolbaRole): string | null => (vlastnik || vejdeSe(r.opravneni) ? null : t('víc než tvoje role'));
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
    const n = narokClena(m.id);
    setUprava({ m, role: roleClena(m), pozice: m.job_title ?? '', sazba: m.hourly_rate ? String(m.hourly_rate) : '', dovolena: n?.dni != null ? String(n.dni) : '' });
  };

  const ulozClena = async () => {
    if (!uprava) return;
    const { m } = uprava;
    // Nárok na dovolenou jde vlastním požadavkem (PUT /api/timeoff) — členství, ne účet.
    const puvodniNarok = narokClena(m.id)?.dni ?? null;
    const novyNarok = vycistiNarok(uprava.dovolena);
    const narokZmena = smiNarok && novyNarok !== puvodniNarok;
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
    if (Object.keys(telo).length === 1 && !narokZmena) { setUprava(null); return; }
    setUkladamClena(true); setChybaClena(null);
    try {
      if (Object.keys(telo).length > 1) await fetch('/api/teams/members', { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify(telo) }).then(okJson);
      if (narokZmena) {
        await fetch('/api/timeoff', { method: 'PUT', headers: JSON_HLAVICKA, body: JSON.stringify({ userId: m.id, vacationPerYear: novyNarok }) }).then(okJson);
        obnovDataWidgetu('/api/timeoff');
      }
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
      flash(t('Změny člena jsou uložené.'));
      obnovTym();
    } catch (e) {
      // 403 říká server česky a přesně („Roli Vedení dává a bere jen vlastník…").
      setChybaClena(apiMessage(e, t('Změny se nepodařilo uložit.')));
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
      flash(t('{jmeno} už v týmu není.', { jmeno: odebrat.name }));
      obnovTym();
    } catch (e) {
      chyba(apiMessage(e, t('Člena se nepodařilo odebrat.')));
    } finally {
      setOdebiram(false);
      setOdebrat(null);
    }
  };

  // ---- Pozvánky a kód ----
  const [pozvat, setPozvat] = useState(false);
  const [emaily, setEmaily] = useState('');
  const [pozicePozvanky, setPozicePozvanky] = useState('Barista');
  // Role pozvánky jako u člena (kolo 6): hodnota <select> ('id:5', 'k:kuchar'); prázdná = výchozí role podniku.
  const [rolePozvanky, setRolePozvanky] = useState('');
  const [posilamZnovu, setPosilamZnovu] = useState<number | null>(null);
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

  // Pozvat do jiné než výchozí role = přidělit roli: výběr jen s tym.role_prirazovat,
  // role nad moji jsou v nabídce zamčené (zamekRole) — server to ověří znovu.
  const vybranaPozvanky = role.find(r => hodnotaRole(r) === (rolePozvanky || vychoziRole)) ?? null;
  const nazevVychoziRole = role.find(r => hodnotaRole(r) === vychoziRole)?.nazev ?? null;
  const otevriPozvani = () => { setPosledni(null); setChybaPozvani(null); setRolePozvanky(vychoziRole); setPozvat(true); };

  const pozviJednoho = async (email: string) => {
    const r = smiPrirazovat && rolePozvanky && rolePozvanky !== vychoziRole ? role.find(x => hodnotaRole(x) === rolePozvanky) : null;
    const d = await fetch('/api/invitations', {
      method: 'POST', headers: JSON_HLAVICKA,
      body: JSON.stringify({ email, jobTitle: pozicePozvanky.trim() || 'Barista', ...(r ? (r.id != null ? { roleId: r.id } : { roleKlic: r.klic }) : {}) }),
    }).then(okJson);
    return d as { token?: string; emailSent?: boolean; emailError?: string | null };
  };

  const odesliPozvanky = async () => {
    setChybaPozvani(null);
    // Nábor na sezónu = šest brigádníků naráz: jde vložit celý seznam
    // oddělený čárkou, středníkem, mezerou nebo řádky.
    const seznam = Array.from(new Set(emaily.split(/[\s,;]+/).map(x => x.trim()).filter(Boolean)));
    if (seznam.length === 0) { setChybaPozvani(t('Napiš aspoň jeden e-mail.')); return; }
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
          else { setPozvat(false); flash(t('Pozvánka odešla na {email}.', { email: seznam[0] })); }
        } catch (e) {
          setChybaPozvani(apiMessage(e, t('Pozvánku se nepodařilo odeslat.')));
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
        flash(t('Pozváno {n, plural, one {# člověk} few {# lidi} other {# lidí}}. Odkazy najdeš v čekajících pozvánkách.', { n: hotove.length }));
        obnovTym();
        if (selhane.length === 0) setPozvat(false);
      }
      if (selhane.length > 0) {
        setChybaPozvani(selhane.length === seznam.length
          ? (selhane[0].proc || t('Pozvánky se nepodařilo odeslat.'))
          : t('{n, plural, one {# pozvánka} few {# pozvánky} other {# pozvánek}} neprošla: {seznam}{proc}', { n: selhane.length, seznam: selhane.map(f => f.email).join(', '), proc: selhane[0].proc ? ` — ${selhane[0].proc}` : '' }));
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
      flash(t('Pozvánka je zrušená, odkaz už neplatí.'));
      obnovTym();
    } catch (e) {
      chyba(apiMessage(e, t('Pozvánku se nepodařilo zrušit.')));
    } finally {
      setRusim(false);
      setZrusit(null);
    }
  };

  // Poslat pozvánku znovu (kolo 6): tentýž odkaz, nejvýš jednou za 10 minut (hlídá server).
  // Hotovo říká až odpověď serveru — e-mail, který neodešel, se neslaví.
  const posliZnovu = async (inv: Invitation) => {
    setPosilamZnovu(inv.id);
    try {
      const res = await fetch(`/api/invitations/${inv.id}/resend`, { method: 'POST' }).catch(() => null);
      if (!res) { chyba(t('Nepodařilo se spojit se serverem.')); return; }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        const zbyva = Number(d?.zbyvaMin);
        chyba(res.status === 409 && zbyva > 0 ? t('Pozvánka šla před chvílí, zkus to za {n} min.', { n: zbyva })
          : typeof d?.error === 'string' && d.error ? d.error : t('Pozvánku se nepodařilo poslat znovu.'));
        return;
      }
      flash(t('Pozvánka odešla znovu.'));
    } finally {
      setPosilamZnovu(null);
    }
  };

  const novyKod = async () => {
    setGeneruji(true);
    try {
      const d = await fetch('/api/teams', { method: 'PATCH', headers: JSON_HLAVICKA, body: JSON.stringify({ regenerateCode: true }) }).then(okJson);
      const puvodni = data.data;
      if (puvodni?.team && d?.team?.join_code) data.set({ ...puvodni, team: { ...puvodni.team, join_code: d.team.join_code } });
      flash(t('Nový kód platí, starý už ne.'));
      obnovTym();
    } catch (e) {
      chyba(apiMessage(e, t('Nový kód se nepodařilo vygenerovat.')));
    } finally {
      setGeneruji(false);
    }
  };

  // ---- Uzávěrka: kasa a přepínače ----
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
          
          {t('Lidé v podniku')}
          {data.data && <Chip tone="muted" size="sm">{members.length.toLocaleString(loc)}</Chip>}
        </h2>
        {/* Období hodin a výdělku (kolo 8): jedno tlačítko jako v Docházce — tento měsíc, minulý, 30 dní, vlastní od–do. */}
        {/* v4 (V2/P10): období L→R; pod ním souhrn; pak toolbar 44 — hledání pružně a „Řadit" na R.
            Dřív období obsahovou šířkou vlevo, hledání a segment řazení jako tři řady pod sebou. */}
        {smiHodiny && <ObdobiLista value={obdobi} onChange={nastavObdobi} dnyTydne={false} hrubost={false} className="w-full"
          volby={['tyden', '7_dni', '30_dni', 'mesic', 'minuly_mesic', '90_dni', '180_dni']} />}
        {smiHodiny && soucet && (
          <p className="t-meta tabular-nums -mt-1" data-tym-soucet>
            {t('Celkem {hodiny}', { hodiny: hodinyMinuty(soucet.ms) })}
            {smiVidetSazby && soucet.mzda > 0 ? ` · ${money(soucet.mzda)}` : ''}
            {smiVidetSazby && soucet.bezSazby > 0 ? ` · ${t('bez sazby: {n, plural, one {# člověk} few {# lidé} other {# lidí}}', { n: soucet.bezSazby })}` : ''}
          </p>
        )}
        {(members.length >= 6 || (hodiny && members.length > 2)) && (
          <Rada deleni="pruzne" vyska="m">
            {/* Od šesti lidí se v seznamu hledalo Ctrl+F v prohlížeči (dřív až nad osm). */}
            {members.length >= 6
              ? <SearchField value={hledat} onChange={setHledat} storageKey="tym" placeholder={t('Hledat člena — jméno, pozice…')} ariaLabel={t('Hledat člena týmu')} />
              : <span aria-hidden />}
            {/* Podle čeho je na řádku největší číslo, podle toho musí jít řadit (DESIGN „Řazení"). */}
            {hodiny && members.length > 2 && (
              <select aria-label={t('Řadit lidi')} value={razeni} onChange={e => setRazeni(e.target.value as RazeniClenu)}
                className="field !w-auto max-w-[45%] pr-9 text-sm font-medium" data-tym-razeni>
                <option value="jmeno">{t('Jméno')}</option>
                <option value="hodiny">{t('Hodiny', undefined, 'widgety')}</option>
                {smiVidetSazby && <option value="vydelek">{t('Výdělek')}</option>}
              </select>
            )}
          </Rada>
        )}
        {smiHodiny && dochazka.error && !dochazka.data && (
          <ErrorState compact title={t('Hodiny se nenačetly')} detail={dochazka.error} onRetry={dochazka.reload} />
        )}
      </div>
      <div className="px-5 pb-3 pt-1">
        {zobrazeni.length === 0 ? (
          <p className="t-meta py-4">{t('Nikdo neodpovídá hledání.')}</p>
        ) : (
          <ul className="list">
            {zobrazeni.map(m => {
              const owner = m.id === team?.owner_id;
              const h = hodiny?.get(String(m.id)) ?? null;
              // Telefon jako odkaz tel: v řádku je na telefonu drobný cíl — „Zavolat" je proto
              // i v „···" (44 px položka), s číslem v názvu.
              const tel = smiKontakty && m.phone ? m.phone.replace(/[^\d+]/g, '') : '';
              const menu: (MenuItem & { kratce?: string })[] = [
                ...(smiProfil ? [{ label: t('Profil'), icon: 'user', onClick: () => otevriProfil(m.id) }] : []),
                ...(tel && m.id !== Number(user.id) ? [{ label: t('Zavolat {telefon}', { telefon: m.phone ?? '' }), kratce: t('Zavolat'), icon: 'external', onClick: () => { window.location.href = `tel:${tel}`; } }] : []),
                ...(smiOdebrat && !owner && !nadeMnou(m) && m.id !== user.id ? [{ label: t('Odebrat z týmu'), kratce: t('Odebrat'), icon: 'minus', danger: true, onClick: () => setOdebrat(m) }] : []),
              ];
              const upravit = smiUpravitClena && !owner && !nadeMnou(m);
              // v4 (V4/V20): jedna akce řádku — „···" 36 na R v prvním řádku vedle čísla; „Upravit…" je v něm
              // první. Dřív „Upravit" + „···" v druhém řádku vpravo, pod nimi chip role vlevo — tři hrany.
              const polozky: MenuItem[] = [
                ...(upravit ? [{ label: t('Upravit…'), icon: 'pencil', onClick: () => otevriUpravu(m) }] : []),
                ...menu,
              ];
              const akce = polozky.length > 0 ? <Menu size="sm" label={t('Další akce: {jmeno}', { jmeno: m.name })} items={polozky} /> : null;
              // Meta: pozice · telefon (odkaz tel:) · sazba nebo „bez sazby" · e-mail. E-mail je poslední —
              // když se řádek na telefonu nevejde, utne se tečkami on, ne telefon. „Bez sazby"
              // je text, ne chip: widget Chybí sazba je hned nad nástrojem (vlastník se nepočítá).
              // S hodinami (kolo 8) jde sazba do meta a sloupec čísel patří hodinám a výdělku.
              const sazba = smiVidetSazby && m.hourly_rate != null && m.hourly_rate > 0 ? m.hourly_rate : null;
              const casti: React.ReactNode[] = [
                m.job_title ? <span key="pozice">{m.job_title}</span> : null,
                tel ? (
                  <a key="tel" href={`tel:${tel}`} className="hover:underline underline-offset-2"
                    aria-label={t('Zavolat: {jmeno}, {telefon}', { jmeno: m.name, telefon: m.phone })}>{m.phone}</a>
                ) : null,
                smiVidetSazby && sazba == null && !owner ? <span key="sazba">{t('bez sazby')}</span> : null,
                smiHodiny && sazba != null ? <span key="sazba-h" className="tabular-nums">{t('{sazba}/h', { sazba: money(sazba) })}</span> : null,
                // Zůstatek dovolené (kolo 8) — vedoucí ho při schvalování nemusí dohledávat jinde.
                h2(narokClena(m.id)) ? <span key="dovolena" className="tabular-nums" data-tym-dovolena={m.id}>{t('dovolená {zbyva}/{dni}', { zbyva: narokClena(m.id)!.zbyva, dni: narokClena(m.id)!.dni })}</span> : null,
                m.email ? <span key="email">{m.email}</span> : null,
              ].filter(Boolean);
              const meta = casti.length ? casti.flatMap((c, i) => (i ? [' · ', c] : [c])) : undefined;
              const jinde = t('Je členem i jiného podniku a je tam právě přepnutý. Tady zůstává v seznamu, rozvrhu i ve mzdách.');
              // Hodiny za období a pod nimi hrubá mzda; kdo nic neodpíchl, má „0 min" — sloupec drží i tak.
              const hodinyRadku = smiHodiny
                ? (hodiny ? <span data-tym-hodiny={m.id}>{hodinyMinuty(h?.ms ?? 0)}</span> : <span aria-hidden className="text-black/35">…</span>)
                : undefined;
              const vydelekRadku = smiHodiny && smiVidetSazby && h?.mzda != null ? <span data-tym-vydelek={m.id}>{money(h.mzda)}</span>
                : smiHodiny && h?.bezi ? t('právě běží') : undefined;
              return (
                <ListRow key={m.id} akceVRadku
                  lead={<Avatar emoji={m.avatar} size="sm" />}
                  // Klepnutí na jméno otevře profil (řádek nese akce, celý klikací být nemůže).
                  title={smiProfil
                    ? <button type="button" onClick={() => otevriProfil(m.id)} aria-label={t('Profil: {jmeno}', { jmeno: m.name })} className="max-w-full truncate text-left rounded-sm hover:underline decoration-black/25 underline-offset-2">{m.name}</button>
                    : m.name}
                  meta={meta}
                  // Role (a „v jiném podniku") na ose textu pod meta — ne pod avatarem v druhém řádku.
                  detail={<span className="mt-1 flex flex-wrap items-center gap-1.5">
                    {owner ? <Chip tone="ink" size="sm">{t('Vlastník')}</Chip> : <Chip tone="muted" size="sm">{nazevRole(t, m, role)}</Chip>}
                    {m.aktivni_jinde && (
                      <span className="inline-flex" title={jinde}>
                        <Chip tone="muted" size="sm" icon="swap">{t('Právě v jiném podniku')}</Chip>
                      </span>
                    )}
                  </span>}
                  // Sazba v jednom sloupci s tabulkovými číslicemi; bez ní pomlčka, ať sloupec drží.
                  value={smiHodiny ? hodinyRadku : smiVidetSazby ? (sazba != null ? t('{sazba}/h', { sazba: money(sazba) }) : <span aria-hidden className="hidden sm:inline text-black/35">—</span>) : undefined}
                  valueMeta={vydelekRadku}
                  actions={akce ?? undefined}
                />
              );
            })}
          </ul>
        )}
        {/* Rozpad po dnech, plán proti skutečnosti a prémie jsou v Docházce — jedno klepnutí, ne hledání v navigaci. */}
        {smiHodiny && hodiny && nav.smiPohled('attendance') && (
          <div className="mt-2 flex justify-start sm:justify-end">
            <Button variant="ghost" size="sm" icon="chevron" onClick={() => nav.onNavigate('attendance')}>{t('Rozpad v Docházce')}</Button>
          </div>
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
          
          {t('Pozvánky')}
        </h2>
        <Button variant="ghost" size="sm" icon="refresh" loading={generuji} onClick={novyKod}>{t('Nový kód')}</Button>
      </div>
      <p className="t-meta mt-1 text-pretty">{t('Člověk se připojí kódem na stránce /join, nebo odkazem z pozvánky. Nový kód zneplatní ten starý.')}</p>
      {pozvankyData.error ? (
        <ErrorState compact title={t('Pozvánky se nenačetly')} detail={pozvankyData.error} onRetry={pozvankyData.reload} className="mt-2" />
      ) : invitations.length === 0 ? (
        pozvankyData.loading ? <Skeleton className="h-10 mt-3" />
          : <EmptyState illustration="tym" title={t('Zatím žádná pozvánka')} hint={t('Pošli kód nebo odkaz — člověk se připojí za minutu a hned vidí rozvrh.')} compact />
      ) : (
        <ul className="list mt-2">
          {invitations.map(inv => {
            const stav = stavPozvanky(t)[inv.status] ?? stavPozvanky(t).pending;
            const ceka = inv.status === 'pending';
            return (
              <ListRow key={inv.id}
                title={<span className="break-all sm:break-normal">{inv.email}</span>}
                meta={inv.job_title || 'Barista'}
                right={<>
                  {/* S jakou rolí člověk přijde — u čekající pozvánky (u přijaté ji už nese člen). */}
                  {ceka && inv.role_nazev && <Chip tone="muted" size="sm">{inv.role_nazev}</Chip>}
                  <Chip tone={stav.tone} size="sm">{stav.label}</Chip>
                </>}
                actions={ceka ? <>
                  {inv.token && (
                    <Button variant="secondary" size="sm" icon={zkopirovano === inv.token ? 'check' : 'copy'} onClick={() => kopiruj(odkazPozvanky(inv.token), inv.token!)}>
                      {zkopirovano === inv.token ? t('Zkopírováno') : t('Odkaz')}
                    </Button>
                  )}
                  {/* Tři akce se na 320 px (a v němčině) do řádku nevejdou — na telefonu je „Poslat znovu" jen ikona. */}
                  <Button variant="ghost" size="sm" icon="send" iconOnly className="sm:hidden" loading={posilamZnovu === inv.id} disabled={posilamZnovu != null}
                    onClick={() => posliZnovu(inv)} aria-label={t('Poslat znovu: {email}', { email: inv.email })} title={t('Poslat znovu')} />
                  <Button variant="ghost" size="sm" icon="send" className="hidden sm:inline-flex" loading={posilamZnovu === inv.id} disabled={posilamZnovu != null}
                    onClick={() => posliZnovu(inv)} aria-label={t('Poslat znovu: {email}', { email: inv.email })}>{t('Poslat znovu')}</Button>
                  <Button variant="ghost" size="sm" onClick={() => setZrusit(inv)} aria-label={t('Zrušit pozvánku: {email}', { email: inv.email })}>{t('Zrušit')}</Button>
                </> : undefined}
              />
            );
          })}
        </ul>
      )}
    </Card>
  );

  // Název a Provoz podniku (měna, formáty, jazyk, cíl mezd) se přestěhovaly do Nastavení →
  // Profil podniku (kolo 6, B3) — jeden domov pro nastavení podniku; organizace má od kola 7
  // vlastní sekci Nastavení › Organizace (dřív čtvrtá karta tady dole, kam nápověda „Všechny
  // podniky" odkazovala na sekci, která v pásu nebyla). Tady zůstává navigace aplikace;
  // řádek níž vede do Profilu podniku, ať ho nikdo nehledá.
  const odkazProfil = ma(['podnik.nastaveni', 'finance.nastaveni']) && nav.smiPohled('settings');
  const podnik = team && (
    <>
      {(odkazProfil || isOwner) && (
        <Card pad="none">
          <ul className="list px-5 py-1">
            {odkazProfil && (
              <ListRow lead={<span className="well h-9 w-9 grid place-items-center text-black/55"><Icon name="receipt" size={16} /></span>}
                title={t('Profil podniku')} meta={t('Název, adresa, měna, formát čísel, jazyk a cíl mezd.')}
                onClick={() => nav.onNavigate('settings', 'podnik')} />
            )}
            {/* Průvodce prvotním nastavením jde spustit znovu; nic nepřepíše, jen přidá. Smí jen vlastník. */}
            {isOwner && (
              <ListRow title={t('Průvodce nastavením')} meta={t('Znovu projdi typ podniku, otevírací dobu a cíle. Nic nepřepíše, jen přidá.')}
                actions={<a href="/employer/start?znovu=1" className="btn btn-secondary btn-sm">{t('Spustit znovu')}</a>} />
            )}
          </ul>
        </Card>
      )}
      {ma('podnik.nastaveni') && <NavigaceNastaveni />}
    </>
  );

  const uzaverka = team && (
    <Card aria-labelledby="tym-vyplaty-t">
      <h2 id="tym-vyplaty-t" className="t-card flex items-center gap-2">
        <Icon name="receipt" size={17} className="shrink-0 text-black/40" />  {t('Výplaty a uzávěrka')}
      </h2>
      <p className="t-meta mt-1">{t('Nastavení, které ovlivňuje denní uzávěrku zaměstnanců.')}</p>
      <ul className="list mt-2">
        <SwitchRow title={t('Výplaty denně v hotovosti')} hint={t('Když je zapnuto, zaměstnanci v uzávěrce vyplní i kolik si dnes vyplatili z kasy.')}
          checked={!!team.pay_daily_cash} disabled={ukladam === 'pay'}
          onChange={v => prepni('pay', { payDailyCash: v }, { pay_daily_cash: v }, v ? t('Denní výplata v hotovosti je zapnutá.') : t('Denní výplata v hotovosti je vypnutá.'))} />
        <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <label htmlFor="tym-kasa" className="min-w-0 flex-1 basis-60">
            <span className="block text-sm font-semibold text-[#16181A]">{t('Stav kasy po směně')}</span>
            <span className="block text-xs text-black/45 mt-0.5 text-pretty">{t('Kolik hotovosti má v kase zůstat pro další směnu. Uzávěrka pak sama spočítá, kolik odložit ven.')}</span>
          </label>
          <div className="flex items-center gap-2">
            <Input id="tym-kasa" type="number" inputMode="numeric" min={0} placeholder="nenastaveno" className="!w-32 text-right tabular-nums"
              value={kasa ?? (team.drawer_float != null ? String(team.drawer_float) : '')} onChange={e => setKasa(e.target.value)} />
            <span className="t-meta">{symbol}</span>
            {kasa !== null && (
              <Button variant="primary" size="sm" loading={ukladam === 'kasa' /* i18n-ok (id) */} onClick={async () => {
                const v = kasa === '' ? null : parseInt(kasa, 10);
                await prepni('kasa' /* i18n-ok (id) */, { drawerFloat: v }, { drawer_float: v }, t('Cílový stav kasy je uložený.'));
                setKasa(null);
              }}>{t('Uložit')}</Button>
            )}
          </div>
        </li>
        <SwitchRow title={t('Tým vidí rozvrh ostatních')} hint={t('Zaměstnanci uvidí, kdo má kdy směnu — jen jména a časy, žádné sazby. Když vypneš, uvidí každý jen sebe.')}
          checked={team.show_team_schedule !== false} disabled={ukladam === 'rozvrh'}
          onChange={v => prepni('rozvrh', { showTeamSchedule: v }, { show_team_schedule: v }, v ? t('Tým teď vidí, kdo má kdy směnu.') : t('Zaměstnanci vidí jen svoje směny.'))} />
        <SwitchRow title={t('Uzávěrka jen po směně')} hint={t('Zaměstnanec může odeslat uzávěrku jen za den, kdy měl naplánovanou směnu.')}
          checked={team.closing_requires_shift !== false} disabled={ukladam === 'smena'}
          onChange={v => prepni('smena', { closingRequiresShift: v }, { closing_requires_shift: v }, v ? t('Uzávěrka je vázaná na směnu.') : t('Uzávěrku může vyplnit kdokoli.'))} />
      </ul>
    </Card>
  );

  let obsah: React.ReactNode;
  if (data.loading) {
    obsah = <Card><div className="space-y-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div></Card>;
  } else if (data.error) {
    obsah = <Card><ErrorState compact title={t('Tým se nepodařilo načíst')} hint={t('Data jsou v pořádku — jen se je teď nepodařilo načíst.')} detail={data.error} onRetry={data.reload} /></Card>;
  } else if (!team) {
    obsah = <Card><EmptyState illustration="tym" title={t('Zatím nemáš žádný tým')} compact /></Card>;
  } else {
    obsah = (
      <>
        {aktivni === 'lide' && <>{seznamLidi}{kartaPozvanek}</>}
        {aktivni === 'podnik' && podnik}
        {aktivni === 'uzaverka' && uzaverka}
        {aktivni === 'sdileni' && <ShareSettings />}
        {aktivni === 'tablet' && <KioskSettings />} {/* i18n-ok (id) */}
        {aktivni === 'integrace' && <NoisiumConnect />}
      </>
    );
  }

  const nastroj = (
    <div className="space-y-4">
      {sekce.length > 1 && (
        <Segmented ariaLabel={t('Sekce nastavení týmu')} value={aktivni} onChange={setZvolena} options={sekce} />
      )}
      {obsah}
    </div>
  );

  const volbaRolePozvanky = (r: VolbaRole) => {
    const v = hodnotaRole(r);
    const z = zamekRole(r);
    // Výchozí roli podniku smí do pozvánky dát každý, kdo zve — ta se nezamyká.
    const zamek = v === vychoziRole ? null : z;
    return <option key={v} value={v} disabled={!!zamek}>{r.nazev}{v === vychoziRole ? ` (${t('výchozí')})` : ''}{zamek ? ` — ${zamek}` : ''}</option>;
  };

  const volbaRole = (r: VolbaRole, m: Member) => {
    const z = zamekRole(r);
    return <option key={hodnotaRole(r)} value={hodnotaRole(r)} disabled={!!z && hodnotaRole(r) !== roleClena(m)}>{r.nazev}{z ? ` — ${z}` : ''}</option>;
  };

  return (
    <>
      <PlochaWidgetu
        stranka="vedeni.tym"
        hlavicka={{
          title: t('Tým'),
          subtitle: t('Lidé, role, pozvánky a pravidla podniku.'),
          hintId: 'teammanagement',
          primary: smiPozvat && team ? <Button variant="accent" icon="plus" onClick={otevriPozvani}>{t('Pozvat člena')}</Button> : undefined,
          menu: smiPozvat && team?.join_code ? [{ label: t('Kopírovat kód {kod}', { kod: team.join_code }), icon: 'copy', onClick: () => { void kopiruj(team.join_code ?? '', 'kod').then(ok => (ok ? flash(t('Kód pro připojení je ve schránce.')) : chyba(t('Schránka je zakázaná. Kód pro připojení: {kod}', { kod: team.join_code })))); } }] : undefined,
        }}
        nastroj={nastroj}
      />

      {pozvat && (
        <Modal open onClose={zavriPozvani} size="md" title={t('Pozvat člena')} subtitle={t('Pozvánka přijde e-mailem; odkaz můžeš poslat i sám.')}
          footer={posledni?.token ? (
            <Button variant="primary" onClick={zavriPozvani}>{t('Hotovo')}</Button>
          ) : <>
            <Button variant="secondary" onClick={zavriPozvani}>{t('Zrušit')}</Button>
            <Button variant="primary" icon="send" loading={zvu} onClick={odesliPozvanky}>{t('Odeslat pozvánku')}</Button>
          </>}>
          {posledni?.token ? (
            <div className="space-y-3">
              <p className="text-sm text-[#16181A] font-semibold">{t('Pošli tenhle odkaz: {email}', { email: posledni.email })}</p>
              <p className="t-meta text-pretty">
                {posledni.emailSent
                  ? t('E-mail jsme odeslali, ale nemusí vždy dorazit — nejjistější je poslat odkaz přímo (WhatsApp, SMS…).')
                  : posledni.emailError
                    ? t('E-mail neodešel ({chyba}), takže pozvánku doruč sám — zkopíruj odkaz a pošli ho.', { chyba: posledni.emailError })
                    : t('E-mail není nastavený, takže pozvánku doruč sám — zkopíruj odkaz a pošli ho.')}
              </p>
              <div className="flex items-center gap-2">
                <Input readOnly aria-label={t('Odkaz pozvánky')} value={odkazPozvanky(posledni.token)} onFocus={e => e.currentTarget.select()} className="font-mono text-xs" />
                <Button variant="secondary" size="sm" icon={zkopirovano === posledni.token ? 'check' : 'copy'} onClick={() => kopiruj(odkazPozvanky(posledni.token), posledni.token!)}>
                  {zkopirovano === posledni.token ? t('Zkopírováno') : t('Kopírovat')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Field id="tym-pozvat-emaily" label={t('E-mail')} hint={t('Víc lidí naráz odděl čárkou nebo novým řádkem.')} error={chybaPozvani}>
                <Textarea id="tym-pozvat-emaily" rows={2} value={emaily} onChange={e => setEmaily(e.target.value)} autoFocus />
              </Field>
              <Field id="tym-pozvat-pozice" label={t('Pozice (nepovinné)')}>
                <Input id="tym-pozvat-pozice" value={pozicePozvanky} onChange={e => setPozicePozvanky(e.target.value)} />
              </Field>
              {/* Role nového člena (kolo 6): stejný výběr jako v „Upravit člena" — přednastavené a vlastní
                  role, co přidělit nesmím, je zamčené. Bez tym.role_prirazovat přijde s výchozí rolí podniku. */}
              {smiPrirazovat && volbyRole.length > 0 ? (
                <Field id="tym-pozvat-role" label={t('Role nového člena')}
                  hint={t('Co role smí, nastavíš v Nastavení → Role a oprávnění.')}>
                  <Select id="tym-pozvat-role" value={rolePozvanky || vychoziRole} onChange={e => setRolePozvanky(e.target.value)}>
                    {!vychoziRole && !rolePozvanky && <option value="">{t('Výchozí role podniku')}</option>}
                    <optgroup label={t('Přednastavené')}>{volbyRole.filter(r => r.id == null).map(volbaRolePozvanky)}</optgroup>
                    {volbyRole.some(r => r.id != null) && (
                      <optgroup label={t('Vlastní role')}>{volbyRole.filter(r => r.id != null).map(volbaRolePozvanky)}</optgroup>
                    )}
                  </Select>
                </Field>
              ) : nazevVychoziRole ? (
                <p className="t-meta">{t('Přijde s výchozí rolí podniku: {role}.', { role: nazevVychoziRole })}</p>
              ) : null}
              {vybranaPozvanky?.klic === 'vedeni' && (
                <p className="note note-wait text-[13px]">{t('Vedoucí má plný přístup: správa týmu, rozvrhy, sklad, uzávěrky i docházka.')}</p>
              )}
            </div>
          )}
        </Modal>
      )}

      {uprava && (
        <Modal open onClose={() => setUprava(null)} size="sm" title={t('Upravit člena')} subtitle={uprava.m.name}
          footer={<>
            <Button variant="secondary" onClick={() => setUprava(null)}>{t('Zrušit')}</Button>
            <Button variant="primary" icon="check" loading={ukladamClena} onClick={ulozClena}>{t('Uložit')}</Button>
          </>}>
          <div className="space-y-3">
            <Field id="clen-role" label={t('Role')}
              hint={!smiPrirazovat ? t('Na přidělování rolí nemáš oprávnění.')
                : volbyRole.length === 0 ? t('Role se nepodařilo načíst — zkus obrazovku otevřít znovu.')
                : t('Co role smí, nastavíš v Nastavení → Role a oprávnění.')}>
              {/* Role = sada oprávnění (kolo 67); co přidělit nesmím, je vidět, ale zamčené. */}
              <Select id="clen-role" value={uprava.role} disabled={!smiPrirazovat || volbyRole.length === 0}
                onChange={e => setUprava(u => (u ? { ...u, role: e.target.value } : u))}>
                {uprava.role === '' && <option value="">{t('{role} (beze změny)', { role: nazevRole(t, uprava.m, role) })}</option>}
                <optgroup label={t('Přednastavené')}>{volbyRole.filter(r => r.id == null).map(r => volbaRole(r, uprava.m))}</optgroup>
                {volbyRole.some(r => r.id != null) && (
                  <optgroup label={t('Vlastní role')}>{volbyRole.filter(r => r.id != null).map(r => volbaRole(r, uprava.m))}</optgroup>
                )}
              </Select>
            </Field>
            <Field id="clen-pozice" label={t('Pozice')} hint={smiPozici ? undefined : t('Na úpravu pozice nemáš oprávnění.')}>
              <Input id="clen-pozice" value={uprava.pozice} disabled={!smiPozici} onChange={e => setUprava(u => (u ? { ...u, pozice: e.target.value } : u))} />
            </Field>
            <Field id="clen-sazba" label={t('Hodinová sazba ({mena}/h)', { mena: symbol })} error={chybaClena}
              hint={smiSazbu ? t('Použije se pro mzdy v Docházce, Financích i uzávěrkách.') : t('Na úpravu sazeb nemáš oprávnění.')}>
              <Input id="clen-sazba" inputMode="numeric" disabled={!smiSazbu} value={uprava.sazba}
                placeholder={uprava.m.hourly_rate == null && !ma('finance.mzdy') ? t('skrytá') : '0'}
                onChange={e => setUprava(u => (u ? { ...u, sazba: e.target.value.replace(/\D/g, '') } : u))} />
            </Field>
            {/* Nárok na dovolenou (kolo 8): dní za kalendářní rok; zaměstnanec vidí zůstatek v žádosti o volno. */}
            {smiNarok && (
              <Field id="clen-dovolena" label={t('Dovolená na rok (dní)')}
                hint={h2(narokClena(uprava.m.id))
                  ? t('Letos čerpáno {cerpano}, zbývá {zbyva}. Odečítá se jen schválená dovolená, nemoc a jiné volno ne.', { cerpano: narokClena(uprava.m.id)!.cerpano, zbyva: narokClena(uprava.m.id)!.zbyva })
                  : t('Prázdné = nárok se nesleduje. Odečítá se jen schválená dovolená, nemoc a jiné volno ne.')}>
                <Input id="clen-dovolena" inputMode="decimal" value={uprava.dovolena} placeholder="20"
                  onChange={e => setUprava(u => (u ? { ...u, dovolena: e.target.value.replace(/[^\d.,]/g, '').replace(',', '.') } : u))} className="!w-full sm:!w-32 tabular-nums" />
              </Field>
            )}
          </div>
        </Modal>
      )}

      {odebrat && (
        <Modal open onClose={() => !odebiram && setOdebrat(null)} size="sm" title={t('Odebrat člena?')} subtitle={odebrat.name}
          footer={<>
            <Button variant="secondary" onClick={() => setOdebrat(null)} disabled={odebiram}>{t('Zrušit')}</Button>
            <Button variant="danger-solid" loading={odebiram} onClick={potvrdOdebrani}>{t('Odebrat')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{t('{jmeno} ztratí přístup k podniku a zmizí z jeho konverzací. Docházka a uzávěrky zůstanou.', { jmeno: odebrat.name })}</p>
        </Modal>
      )}

      {zrusit && (
        <Modal open onClose={() => !rusim && setZrusit(null)} size="sm" title={t('Zrušit pozvánku?')} subtitle={zrusit.email}
          footer={<>
            <Button variant="secondary" onClick={() => setZrusit(null)} disabled={rusim}>{t('Nechat')}</Button>
            <Button variant="danger-solid" loading={rusim} onClick={potvrdZruseni}>{t('Zrušit pozvánku')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{t('Odkaz z pozvánky přestane platit. Kód pro připojení platí dál.')}</p>
        </Modal>
      )}

      {profilId != null && <EmployeeProfile employeeId={profilId} onClose={() => setProfilId(null)} />}
      <Toast message={toast?.text ?? null} tone={toast?.tone ?? 'ok'} onClose={() => setToast(null)} />
    </>
  );
}
