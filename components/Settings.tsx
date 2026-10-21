'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { planInfoOf, type PlanInfo } from '@/lib/plan';
import Billing from './Billing';
import { Icon } from './Icons';
import { EmptyState, Button, Skeleton, PageHeader, Segmented, Badge, Chip, ListRow, Modal, Stat, StatRow, Label } from './ui';
import { useObal } from './ObalProvider';
import ProvozovatelInfo from './pravni/ProvozovatelInfo';
import NahlasenyObsah from './moderace/NahlasenyObsah';
import Zablokovani from './moderace/Zablokovani';
import { OvereniEmailuNastaveni } from './auth/OvereniEmailu';
import ZamekAplikace from './ucet/ZamekAplikace';
import { useT, useJazyk, type PrekladFn } from '@/lib/i18n/client';
import type { Jazyk } from '@/lib/i18n/config';
import SekceVzhled from './settings/SekceVzhled';
import SekceJazyk from './settings/SekceJazyk';
import SekceOznameni from './settings/SekceOznameni';
import SekceData from './settings/SekceData';
import SekceZkratky from './settings/SekceZkratky';
import SekcePodnik from './settings/SekcePodnik';
import PevneNaklady from './settings/PevneNaklady';
import SekceHistorie from './settings/SekceHistorie';
import OrganizationSettings, { URL_ORGANIZACE } from './employer/OrganizationSettings';
import { useDataWidgetu } from './widgety/useDataWidgetu';
import { zalozkaNastaveni, otevritSekciRovnou, SKUPINA_ZALOZKY, SKUPINY_NASTAVENI, type SectionId, type SkupinaNastaveni } from '@/lib/nastaveniZalozky';
import TeamManagement from './TeamManagement';
import { dbTimeDayHM, parseDbTime } from '@/lib/pragueTime';
import { relativniCas } from '@/lib/poznamky';
import { fmtDatum } from '@/lib/i18n/format';
import { cilOznameni, ikonaOznameni, otevriOznameni, LIMIT_OZNAMENI } from '@/lib/oznameniOdkaz';
import { czCount } from '@/lib/czech';
import { okJson } from '@/lib/api';
import { useOpravneni } from './role/useOpravneni';
import { useStrazRole, CO_SE_ZAHODI_ROLE } from './role/rozepsano';
import { DiscardGuard } from './ui/DiscardGuard';
import { ErrorState } from './ui/ErrorState';
import dynamic from 'next/dynamic';

// Editor rolí nese celý katalog oprávnění (přes sto šedesát položek
// s popisy) — stahuje se, až když ho někdo otevře, ne s každým Nastavením.
const RoleEditor = dynamic(() => import('./role/RoleEditor'), { loading: () => <div className="flex items-center justify-center h-48"><div className="spinner" /></div> });
// Výchozí rozložení stránek (kolo 68) nese plochu s editorem úprav — taky až na otevření.
const VychoziRozlozeni = dynamic(() => import('./widgety/VychoziRozlozeni'), { loading: () => <Skeleton className="h-48 rounded-3xl" /> });

interface Props {
  user: { id: number; name: string; role: string; avatar?: string };
  initialTab?: SectionId;
  /** Roste, kdykoli si někdo výslovně vyžádá záložku (banner předplatného) — i když je Nastavení už otevřené. */
  tabNonce?: number;
  /** Uvnitř okna (účet v menu Managero client): bez vlastní hlavičky a bez okrajů, okno má svůj nadpis. */
  vOkne?: boolean;
}

interface Account {
  id: number;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  jobTitle?: string;
  shiftPreference?: string;
  theme?: 'light' | 'dark' | 'system';
  role: string;
}

interface Notif {
  id: number;
  title: string;
  body?: string;
  type: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

interface Sekce { id: SectionId; label: string; icon: string; desc: string; skupina: SkupinaNastaveni }

const AVATARS = ['👤', '👩‍💼', '👨‍🍳', '🧑‍🍳', '👩‍🍳', '🧑‍💼', '🙂', '😎', '🌿', '🍵', '🧋', '☕'];

// v4: pole v kartě nastavení = `.field` (44, stupeň M). Dřív vlastní `px-4 py-3` → 46 px,
// o dva víc než tlačítko vedle a mimo stupně (P6, P9).
const inputClass = 'field';
const labelClass = 'field-label';
// Nadpis karty skupiny = h2.t-card (DP §3.3). Dřív ruční `font-bold
// tracking-tight` a hlavní akce formulářů ručně psanou limetkou.
const cardTitle = 't-card';

const UCTENKA = { one: 'účtenka', few: 'účtenky', many: 'účtenek' };
const POLOZKA = { one: 'položka', few: 'položky', many: 'položek' };

/** „před 5 min", „před 2 h", „před 3 dny", po týdnu datum — v jazyce člověka (čas z databáze přes parseDbTime). */
function kdyPrislo(iso: string, t: PrekladFn, jazyk: Jazyk): string {
  const d = parseDbTime(iso);
  if (!d) return '';
  const r = relativniCas(d);
  if (r.druh === 'ted') return t('právě teď');
  if (r.druh === 'min') return t('před {n} min', { n: r.n });
  if (r.druh === 'h') return t('před {n} h', { n: r.n });
  if (r.druh === 'den') return t('před {n, plural, one {# dnem} few {# dny} other {# dny}}', { n: r.n });
  return fmtDatum(d, { jazyk, styl: 'cislo' });
}

/** Filtr Centra oznámení. */
type FiltrOznameni = 'vse' | 'neprectene';

export default function Settings({ user, initialTab, tabNonce, vOkne = false }: Props) {
  const { update } = useSession();
  const { smiPlatby } = useObal();
  const t = useT();
  const { jazyk } = useJazyk();
  const [zvolena, setZvolena] = useState<SectionId>(zalozkaNastaveni(initialTab) ?? 'account');
  // Telefon (kolo 6, B3): Nastavení je svislý seznam sekcí; klepnutí otevře sekci přes celou
  // obrazovku s „Zpět". Dřív posuvný pás 13 pilulek (1 817 px) — Notifikace, Zabezpečení, Pokladna
  // i Role byly mimo obrazovku. Rovnou sekci otevře jen výslovný odkaz (?tab=, banner, hledání);
  // na počítači se nic nemění (boční pás + obsah).
  const [zobrazeni, setZobrazeni] = useState<'seznam' | 'sekce'>(otevritSekciRovnou(initialTab) ? 'sekce' : 'seznam');
  // Přepnutí záložky odmontuje editor rolí — u rozepsané role se nejdřív zeptá.
  const straz = useStrazRole();
  const setSection = (id: SectionId, sekci = true) => {
    if (id !== zvolena) straz.pokus(() => { setZvolena(id); if (sekci) setZobrazeni('sekce'); });
    else if (sekci) setZobrazeni('sekce');
  };
  // Odkaz na záložku, když je Nastavení už otevřené: useState výše si initialTab
  // přečte jen při prvním vykreslení.
  useEffect(() => { const z = zalozkaNastaveni(initialTab); if (tabNonce && z) setSection(z, otevritSekciRovnou(z)); },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [tabNonce]);
  // Nová obrazovka na telefonu začíná nahoře — ne v půlce dlouhého seznamu, odkud se klepalo.
  const korenRef = useRef<HTMLDivElement>(null);
  const prvniZobrazeni = useRef(true);
  useEffect(() => {
    if (prvniZobrazeni.current) { prvniZobrazeni.current = false; return; }
    try { if (window.matchMedia('(max-width: 767px)').matches) korenRef.current?.scrollIntoView({ block: 'start' }); } catch { /* starý prohlížeč */ }
  }, [zobrazeni, zvolena]);
  // Klávesové zkratky na dotykovém telefonu nedávají smysl — v seznamu na telefonu se nekreslí (na počítači zůstávají).
  const [dotyk, setDotyk] = useState(false);
  useEffect(() => { try { setDotyk(window.matchMedia('(hover: none) and (pointer: coarse)').matches); } catch { /* bez matchMedia */ } }, []);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  const isEmployer = (account?.role ?? user.role) === 'employer';
  // Záložky podniku podle oprávnění (kolo 67). Vedení má všechno, takže
  // vidí totéž co dřív; Provozní nebo Účetní jen to, co mu server dovolí.
  const { ma } = useOpravneni();
  // Organizace (kolo 7): sekce jen pro podnik, který je v organizaci — zjišťuje se jednou přes
  // mezipaměť useDataWidgetu na téže URL, ze které čte OrganizationSettings (jeden dotaz, ne dva).
  // Zaměstnanec se neptá (URL null): organizaci spravuje vedení z Nastavení.
  // Obal `{ org }`: podnik bez organizace je platná odpověď (org null), ne věčné načítání.
  const organizace = useDataWidgetu<{ org: { id: number; name: string } | null }>(isEmployer ? URL_ORGANIZACE : null, d => ({ org: d?.organization ?? null }));
  // Sekce ve dvou skupinách (kolo 6, B3): „Osobní" — můj účet, platí v každém podniku —
  // a „Podnik" — nastavení podniku. Skupinu nese lib/nastaveniZalozky (SKUPINA_ZALOZKY),
  // nadpisy kreslí boční pás na počítači i svislý seznam na telefonu.
  const sekce = (id: SectionId, label: string, icon: string, desc: string): Sekce => ({ id, label, icon, desc, skupina: SKUPINA_ZALOZKY[id] });
  const sections: Sekce[] = [
    sekce('account', t('Účet'), 'settings', t('Profil a osobní údaje')),
    // Jazyk má vlastní viditelnou záložku (dřív byl schovaný ve Vzhledu): jazyk aplikace a osobní formáty.
    sekce('jazyk', t('Jazyk a region'), 'globe', t('Jazyk, čas a formáty')),
    sekce('app', t('Vzhled'), 'sun', t('Motiv, písmo a pohyb')),
    sekce('notifications', t('Notifikace'), 'bell', t('Upozornění a centrum oznámení')),
    sekce('security', t('Zabezpečení'), 'check', t('Heslo')),
    sekce('privacy', t('Data a soukromí'), 'archive', t('Stažení dat a smazání účtu')),
    sekce('zkratky', t('Klávesové zkratky'), 'menu', t('Co umí klávesnice')),
    // Profil podniku (kolo 73) a od kola 6 i Provoz podniku: název, adresa, IČO, prahy skladu, měna,
    // formáty, jazyk a cíl mezd. Cíl mezd smí i role s finance.nastaveni, proto i ona tu sekci vidí.
    ...(isEmployer && ma(['podnik.nastaveni', 'finance.nastaveni']) ? [sekce('podnik', t('Profil podniku'), 'receipt', t('Údaje, provoz a prahy skladu'))] : []),
    // Organizace: jen když GET /api/organization organizaci vrátí (routa pustí každého člena, mění jen vlastník).
    ...(isEmployer && organizace.data?.org ? [sekce('organizace', t('Organizace'), 'grid', t('Sdílení mezi podniky'))] : []),
    ...(isEmployer && ma(['tym.role_spravovat', 'tym.role_prirazovat']) ? [sekce('roles', t('Role a oprávnění'), 'lock', t('Kdo co v podniku smí'))] : []),
    // Výchozí plocha pro typ role nebo roli a zámky (spec §3.8); tablet stačí spravovat.
    ...(isEmployer && ma(['podnik.nastaveni', 'kiosk.spravovat']) ? [sekce('stranky', t('Stránky'), 'overview', t('Výchozí plocha a zámky'))] : []),
    ...(isEmployer && ma('pokladna.stav') ? [sekce('pos', t('Pokladna'), 'trend', t('Napojení Storyous'))] : []),
    ...(isEmployer && smiPlatby && ma('predplatne.zobrazit') ? [sekce('billing', t('Předplatné'), 'award', t('Plán a fakturace'))] : []),
    ...(isEmployer && ma('audit.zobrazit') ? [sekce('audit', t('Historie změn'), 'clock', t('Kdo co kdy změnil'))] : []),
    // Moderace uživatelského obsahu (Apple 1.2): nahlášené zprávy a nápady vidí, kdo smí odebírat členy.
    ...(ma('tym.odebrat') ? [sekce('nahlaseni', t('Nahlášený obsah'), 'warning', t('Zprávy a nápady nahlášené týmem'))] : []),
  ];
  // Nadpisy skupin jen tam, kde jsou obě (zaměstnanec má jen osobní sekce — nadpis by nic neodlišil).
  const nazevSkupiny: Record<SkupinaNastaveni, string> = { osobni: t('Osobní'), podnik: t('Podnik') };
  const skupiny = SKUPINY_NASTAVENI
    .map(id => ({ id, nazev: nazevSkupiny[id], polozky: sections.filter(s => s.skupina === id) }))
    .filter(g => g.polozky.length > 0);
  const sNadpisy = skupiny.length > 1;
  const skupinyTelefon = skupiny
    .map(g => ({ ...g, polozky: g.polozky.filter(s => !(dotyk && s.id === 'zkratky')) }))
    .filter(g => g.polozky.length > 0);
  // Záložka, na kterou role nemá, se nevykreslí, ani když na ni vede odkaz
  // (Receptury → „Nastavit pokladnu", banner předplatného) nebo když se
  // oprávnění načetla až po otevření. Obsah by jinak ukázal formulář
  // a jeho dotazy by skončily 403. Místo toho Účet — ten má každý.
  // 'team' v seznamu není, ale obsah má (správa týmu); pouští se se stejným
  // klíčem jako pohled Nastavení týmu, ať se jeho chování nemění.
  // Odkaz ?tab=organizace před odpovědí /api/organization: sekce ještě v seznamu není, ale nesmí
  // spadnout do Účtu — než přijde odpověď, kreslí se kostra a pak buď sekce, nebo (bez organizace) Účet.
  const organizaceCeka = zvolena === 'organizace' && isEmployer && organizace.loading;
  const povolena = sections.some(s => s.id === zvolena) || (zvolena === 'team' && isEmployer && ma('tym.zobrazit')) || organizaceCeka;
  const section: SectionId = povolena ? zvolena : 'account';
  // POS (Storyous) connection form.
  const [posStatus, setPosStatus] = useState<any | null>(null);
  const [posForm, setPosForm] = useState({ clientId: '', clientSecret: '', merchantId: '', placeId: '' });
  const [posBusy, setPosBusy] = useState(false);
  // Hláška u pokladny nese tón zvlášť. Dřív se úspěch poznal podle „✓"
  // v textu — znak místo ikony a křehké pravidlo (DP §3.7).
  const [posMsg, setPosMsgStav] = useState<{ text: string; ok: boolean } | null>(null);
  const setPosMsg = (text: string, ok = false) => setPosMsgStav(text ? { text, ok } : null);
  // Potvrzení nevratných kroků pokladny oknem, ne nativním confirm() (DP §3.10).
  const [potvrzeni, setPotvrzeni] = useState<null | { title: string; text: string; label: string; danger: boolean; akce: () => void | Promise<void> }>(null);
  // Zdraví zrcadla pokladny (od kdy máme data, poslední synchronizace, chyby).
  const [posHealth, setPosHealth] = useState<any | null>(null);
  const [posAction, setPosAction] = useState<string>('');
  const loadPosHealth = () =>
    fetch('/api/pos/status').then(okJson).then(setPosHealth).catch(() => setPosHealth(null));
  useEffect(() => {
    if (section !== 'pos' || posStatus) return;
    fetch('/api/pos').then(okJson).then(setPosStatus).catch(() => setPosStatus({ connected: false }));
    loadPosHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);
  // i18n-ok: hlášky Pokladny (napojení Storyous) zůstávají česky — viz sekce Pokladna níž.
  const posDo = async (action: string, extra: Record<string, any> = {}) => {
    setPosAction(action); setPosMsg('');
    const res = await fetch('/api/pos/status', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    }).catch(() => null);
    const d = res ? await res.json().catch(() => ({})) : {};
    setPosAction('');
    if (!res?.ok || d?.error) { setPosMsg(d?.error || 'Akce se nepodařila.'); return; }
    if (action === 'sync') {
      const b = d.bills ?? {};
      setPosMsg(b.skipped === 'throttled'
        ? 'Synchronizace běžela před chvílí — pokladna se ptá nejvýš jednou za pár minut.'
        : `Synchronizováno — účtenek prošlo ${b.billsSeen ?? 0}, nových či změněných ${b.billsChanged ?? 0}${b.itemsPending ? `, ${czCount(b.itemsPending, POLOZKA)} dotáhne příští běh` : ''}.`, true);
    } else if (action === 'backfill') {
      setPosMsg(`Historie načtena: ${czCount(d.bills?.billsSeen ?? 0, UCTENKA)}.`, true);
    } else if (action === 'webhook-secret') {
      setPosMsg('Nové tajemství pro DataSync vygenerováno. Pošli URL i tajemství podpoře Storyous.', true);
    } else if (action === 'webhook-off') {
      setPosMsg('Příjem změn z pokladny je vypnutý.', true);
    }
    loadPosHealth();
  };
  const posConnect = async () => {
    setPosBusy(true); setPosMsg('');
    const res = await fetch('/api/pos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(posForm),
    }).catch(() => null);
    setPosBusy(false);
    if (res?.ok) {
      const d = await res.json();
      setPosMsg(`Připojeno k provozovně ${d.placeName ?? ''}.`, true);
      setPosStatus(null); setPosForm({ clientId: '', clientSecret: '', merchantId: '', placeId: '' });
      fetch('/api/pos').then(okJson).then(setPosStatus).catch(() => {});
      loadPosHealth();
    } else {
      const d = res ? await res.json().catch(() => ({})) : {};
      setPosMsg(d.error || 'Připojení se nepodařilo.');
    }
  };

  // Account form
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('👤');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [shiftPreference, setShiftPreference] = useState('flexible');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');

  // Security form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdErr, setPwdErr] = useState('');

  // Centrum oznámení (kolo 6, B3): řádek s odkazem vede na cíl, filtr Vše / Nepřečtené,
  // pilulky druhu s počtem (od dvou druhů), „Načíst starší" po dávkách z /api/notifications.
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [notifsLoading, setNotifsLoading] = useState(false);
  const [notifsLoaded, setNotifsLoaded] = useState(false);
  const [notifsErr, setNotifsErr] = useState(false);
  const [notifMsg, setNotifMsg] = useState('');
  const [filtrOzn, setFiltrOzn] = useState<FiltrOznameni>('vse');
  const [druhOzn, setDruhOzn] = useState<string | null>(null);
  const [druhyOzn, setDruhyOzn] = useState<Record<string, number>>({});
  // Počet všech nepřečtených ze serveru; null = ještě nevím (odznak u Notifikací v seznamu sekcí).
  const [unreadTotal, setUnreadTotal] = useState<number | null>(null);
  const [maStarsi, setMaStarsi] = useState(false);
  const [nacitamStarsi, setNacitamStarsi] = useState(false);

  // Plan & trial for the billing section (employer only).
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  useEffect(() => {
    if (section !== 'billing' || plan) return;
    fetch('/api/teams').then(okJson)
      .then(d => setPlan(d.planInfo ?? planInfoOf(null)))
      .catch(() => setPlan(planInfoOf(null)));
  }, [section, plan]);

  useEffect(() => {
    fetch('/api/account')
      .then(okJson)
      .then(data => {
        if (data.user) {
          const u: Account = data.user;
          setAccount(u);
          setName(u.name ?? '');
          setAvatar(u.avatar ?? '👤');
          setPhone(u.phone ?? '');
          setJobTitle(u.jobTitle ?? '');
          setShiftPreference(u.shiftPreference ?? 'flexible');
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const adresaOznameni = (f: FiltrOznameni, druh: string | null, pred?: number) => {
    const q = new URLSearchParams({ limit: String(LIMIT_OZNAMENI.vychozi) });
    if (f === 'neprectene') q.set('unread', '1');
    if (druh) q.set('type', druh);
    if (pred) q.set('before', String(pred)); else q.set('souhrn', '1');
    return `/api/notifications?${q}`;
  };
  const loadNotifs = (f: FiltrOznameni = filtrOzn, druh: string | null = druhOzn) => {
    setNotifsLoading(true); setNotifsErr(false);
    fetch(adresaOznameni(f, druh))
      .then(okJson)
      .then(data => {
        const seznam: Notif[] = Array.isArray(data.notifications) ? data.notifications : [];
        setNotifs(seznam);
        setUnreadTotal(Number(data.unread) || 0);
        setDruhyOzn(data.druhy && typeof data.druhy === 'object' ? data.druhy : {});
        setMaStarsi(seznam.length >= (Number(data.limit) || LIMIT_OZNAMENI.vychozi));
      })
      .catch(() => setNotifsErr(true))
      .finally(() => { setNotifsLoading(false); setNotifsLoaded(true); });
  };
  const nactiStarsi = () => {
    const posledni = notifs[notifs.length - 1];
    if (!posledni) return;
    setNacitamStarsi(true); setNotifMsg('');
    fetch(adresaOznameni(filtrOzn, druhOzn, posledni.id))
      .then(okJson)
      .then(data => {
        const dalsi: Notif[] = Array.isArray(data.notifications) ? data.notifications : [];
        setNotifs(prev => [...prev, ...dalsi.filter(n => !prev.some(p => p.id === n.id))]);
        setMaStarsi(dalsi.length >= (Number(data.limit) || LIMIT_OZNAMENI.vychozi));
      })
      .catch(() => setNotifMsg(t('Starší oznámení se nepodařilo načíst.')))
      .finally(() => setNacitamStarsi(false));
  };
  const zmenFiltr = (f: FiltrOznameni) => { setFiltrOzn(f); loadNotifs(f, druhOzn); };
  // Druhý klik na tutéž pilulku filtr zruší (DESIGN „Filtrovací pás").
  const zmenDruh = (d: string) => { const novy = druhOzn === d ? null : d; setDruhOzn(novy); loadNotifs(filtrOzn, novy); };
  // Klepnutí na řádek s odkazem: přečteno (až podle serveru) a přechod na cíl — stejně jako zvonek.
  const otevriNotif = (n: Notif) => otevriOznameni(n, x => {
    setNotifs(prev => prev.map(y => (y.id === x.id ? { ...y, is_read: true } : y)));
    setUnreadTotal(u => Math.max(0, (u ?? 1) - 1));
  });

  useEffect(() => {
    if (section === 'notifications' && !notifsLoaded) loadNotifs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);
  // Odznak nepřečtených u Notifikací (seznam sekcí, boční pás) i před otevřením sekce:
  // stačí počet, seznam se stáhne až v sekci. Bez sítě odznak prostě nebude.
  useEffect(() => {
    fetch('/api/notifications?limit=1').then(okJson)
      .then(d => setUnreadTotal(u => u ?? (Number(d?.unread) || 0)))
      .catch(() => { /* odznak je doplněk */ });
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileErr('');
    setProfileMsg('');
    if (!name.trim()) { setProfileErr(t('Jméno nesmí být prázdné.')); return; }
    setSavingProfile(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          avatar,
          phone,
          jobTitle,
          ...(isEmployer ? {} : { shiftPreference }),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAccount(data.user);
        await update({ user: { name: name.trim(), avatar } });
        setProfileMsg(t('Profil byl uložen.'));
        setTimeout(() => setProfileMsg(''), 4000);
      } else {
        // Hláška serveru se hledá ve slovníku (věta ze serveru je klíč, jako u apiMessage).
        setProfileErr(data.error ? t(data.error) : t('Profil se nepodařilo uložit.'));
      }
    } catch {
      setProfileErr(t('Nastala chyba při ukládání.'));
    } finally {
      setSavingProfile(false);
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdErr('');
    setPwdMsg('');
    if (!currentPassword || !newPassword) { setPwdErr(t('Vyplň všechna pole.')); return; }
    if (newPassword.length < 8) { setPwdErr(t('Nové heslo musí mít alespoň 8 znaků.')); return; }
    if (newPassword !== confirmPassword) { setPwdErr(t('Nová hesla se neshodují.')); return; }
    setSavingPwd(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        // Server zvýšil verzi relace: ostatní telefony a počítače se odhlásí, tenhle ne.
        setPwdMsg(data.odhlasenoJinde ? t('Heslo bylo změněno. Ostatní zařízení jsou odhlášená.') : data.message ? t(data.message) : t('Heslo bylo změněno.'));
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setTimeout(() => setPwdMsg(''), 4000);
      } else {
        setPwdErr(data.error ? t(data.error) : t('Heslo se nepodařilo změnit.'));
      }
    } catch {
      setPwdErr(t('Nastala chyba při změně hesla.'));
    } finally {
      setSavingPwd(false);
    }
  };

  // Přečteno je až to, co server potvrdí — dřív se odznak vynuloval i po chybě.
  const markAllRead = async () => {
    setNotifMsg('');
    const res = await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null);
    if (!res?.ok) { setNotifMsg(t('Oznámení se nepodařilo označit jako přečtená. Zkus to znovu.')); return; }
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadTotal(0);
    if (filtrOzn === 'neprectene') loadNotifs();
  };

  // Počet všech nepřečtených ze serveru (ne jen v načtené dávce).
  const unreadCount = unreadTotal ?? notifs.filter(n => !n.is_read).length;
  // Druhy oznámení pro pilulky: od dvou druhů, vybraný zůstává vidět i s nulou.
  const druhyPilulek = Object.entries({ ...(druhOzn ? { [druhOzn]: 0 } : {}), ...druhyOzn });
  const nazevDruhu = (typ: string): string => {
    switch (typ) {
      case 'shift': return t('Směny');
      case 'chat': return t('Zprávy');
      case 'inventory': return t('Sklad');
      case 'task': return t('Úkoly');
      case 'invite': return t('Tým');
      case 'warning': return t('Upozornění', undefined, 'druh');
      case 'success': return t('Odměny');
      case 'billing': return t('Předplatné');
      case 'info': return t('Informace');
      default: return t('Ostatní', undefined, 'druh');
    }
  };

  const aktivni = sections.find(s => s.id === section);
  const odznakOznameni = unreadCount > 0
    ? <Badge count={unreadCount} label={t('Nepřečtená oznámení: {n}', { n: unreadCount })} ring={false} />
    : null;

  return (
    <div ref={korenRef} className={vOkne ? 'space-y-4' : 'px-4 min-[360px]:px-5 pt-3 pb-4 sm:p-6 max-w-5xl mx-auto space-y-6'}>
      {!vOkne && <PageHeader title={t('Nastavení')} subtitle={t('Tvůj profil, jazyk, vzhled, oznámení a zabezpečení.')}
        className={zobrazeni === 'sekce' ? 'hidden md:block' : ''} />}
      <DiscardGuard guard={straz.guard} what={CO_SE_ZAHODI_ROLE} />

      {/* Telefon: svislý seznam sekcí ve skupinách Osobní / Podnik (ikona, název, popis,
          šipka; odznak nepřečtených u Notifikací). Segmented zůstává jen pro pár položek. */}
      {zobrazeni === 'seznam' && (
        <nav className="md:hidden space-y-4" aria-label={t('Sekce nastavení')}>
          {skupinyTelefon.map(g => (
            <section key={g.id} className="space-y-1.5" aria-labelledby={sNadpisy ? `nast-skupina-${g.id}` : undefined}>
              {sNadpisy && <h2 id={`nast-skupina-${g.id}`} className="t-label px-1">{g.nazev}</h2>}
              <div className="card px-4 py-1">
                <ul className="list">
                  {g.polozky.map(s => (
                    <ListRow key={s.id}
                      lead={<span className="well h-10 w-10 grid place-items-center text-black/60"><Icon name={s.icon} size={18} /></span>}
                      title={s.id === 'notifications' && odznakOznameni
                        ? <span className="flex items-center gap-2 min-w-0"><span className="truncate">{s.label}</span>{odznakOznameni}</span>
                        : s.label}
                      meta={s.desc}
                      onClick={() => setSection(s.id)} />
                  ))}
                </ul>
              </div>
            </section>
          ))}
        </nav>
      )}

      {/* Telefon v sekci: hlavička s názvem sekce a cesta zpět na seznam (jako „Zpět na uzávěrky"). */}
      {zobrazeni === 'sekce' && (
        <div className="md:hidden space-y-1 !mt-0">
          <Button variant="ghost" icon="chevron" className="-ml-3 [&>svg]:rotate-90" onClick={() => setZobrazeni('seznam')}>{t('Zpět')}</Button>
          <PageHeader as={vOkne ? 'h2' : 'h1'} title={aktivni?.label ?? (section === 'team' ? t('Tým') : t('Nastavení'))} subtitle={aktivni?.desc} />
        </div>
      )}

      <div className="flex gap-6">
        {/* Desktop: left vertical section list */}
        <nav className="hidden md:flex flex-col gap-1 w-60 flex-shrink-0" aria-label={t('Sekce nastavení')}>
          {skupiny.map((g, gi) => (
            <div key={g.id} className={`flex flex-col gap-1 ${gi > 0 ? 'pt-3' : ''}`}>
              {sNadpisy && <h2 className="t-label px-4">{g.nazev}</h2>}
              {g.polozky.map(s => (
                <button key={s.id} onClick={() => setSection(s.id)} aria-pressed={section === s.id}
                  className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-2xl transition duration-200 ${
                    section === s.id ? 'seg-on' : 'seg-off'
                  }`}>
                  <Icon name={s.icon} size={20} className="flex-shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold truncate">{s.label}</span>
                    <span className={`block text-xs truncate ${section === s.id ? 'text-white/60' : 'text-black/55'}`}>{s.desc}</span>
                  </span>
                  {s.id === 'notifications' && (
                    <Badge count={unreadCount} label={t('Nepřečtená oznámení: {n}', { n: unreadCount })} />
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Obsah sekce; na telefonu jen v režimu sekce (seznam ho zakryje, editor rolí zůstane připojený). */}
        <div className={`flex-1 min-w-0 ${zobrazeni === 'seznam' ? 'hidden md:block' : ''}`}>
          {loading ? (
            <Skeleton className="h-72 rounded-3xl" />
          ) : section === 'account' ? (
            <form onSubmit={saveProfile} className="card p-5 sloupec sloupec-6">
              {profileMsg && (
                <div role="status" className="note note-ok p-4 text-sm flex items-center gap-2">
                  <Icon name="check" size={16} className="shrink-0" /> {profileMsg}
                </div>
              )}
              {profileErr && (
                <div role="alert" className="note note-danger p-4 text-sm flex items-center gap-2">
                  <Icon name="warning" size={16} className="shrink-0" /> {profileErr}
                </div>
              )}

              <div>
                <label className={labelClass} id="nast-avatar">{t('Avatar')}</label>
                {/* v4 (P1, P2): volba avatara je mřížka rovných dílů (aspoň 40 px) až k pravé hraně —
                    dřív zalomené dlaždice končily 78 px před hranou polí pod nimi. */}
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-[var(--well)] border border-[var(--well-line)] flex items-center justify-center text-3xl flex-shrink-0" aria-hidden>
                    {avatar}
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-2 min-w-0 flex-1" role="group" aria-labelledby="nast-avatar">
                    {AVATARS.map(a => (
                      // Vybraný avatar nese inkoustový prstenec, ne limetkový tón —
                      // limetka na obrazovce patří tlačítku Uložit.
                      <button key={a} type="button" onClick={() => setAvatar(a)} aria-pressed={avatar === a} aria-label={t('Avatar {a}', { a })}
                        className={`w-full min-w-0 h-11 rounded-xl flex items-center justify-center text-xl transition ${
                          avatar === a ? 'bg-black/[0.04] ring-2 ring-[#16181A]' : 'bg-black/[0.04] border border-black/[0.08] hover:bg-black/[0.06]'
                        }`}>
                        {a}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="nast-jmeno" className={labelClass}>{t('Jméno')}</label>
                  <input id="nast-jmeno" value={name} autoComplete="name" onChange={e => setName(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="nast-email" className={labelClass}>{t('E-mail')}</label>
                  <input id="nast-email" value={account?.email ?? ''} disabled
                    className={inputClass + ' opacity-60 cursor-not-allowed'} />
                </div>
                <div>
                  <label htmlFor="nast-telefon" className={labelClass}>{t('Telefon')}</label>
                  {/* Telefonní klávesnice na mobilu (inputMode/type tel) a doplnění z kontaktů. */}
                  <input id="nast-telefon" type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+420…" className={inputClass} />
                </div>
                <div>
                  <label htmlFor="nast-pozice" className={labelClass}>{t('Pozice')}</label>
                  <input id="nast-pozice" value={jobTitle} autoComplete="organization-title" onChange={e => setJobTitle(e.target.value)} placeholder={t('Barista')} className={inputClass} />
                </div>
                {!isEmployer && (
                  <div className="sm:col-span-2">
                    <label htmlFor="nast-preference" className={labelClass}>{t('Preference směn')}</label>
                    <select id="nast-preference" value={shiftPreference} onChange={e => setShiftPreference(e.target.value)}
                      className={inputClass + ' appearance-none'}>
                      <option value="morning">{t('Ranní')}</option>
                      <option value="afternoon">{t('Odpolední')}</option>
                      <option value="flexible">{t('Flexibilní')}</option>
                    </select>
                  </div>
                )}
              </div>

              {/* v4: akce formuláře přes celou šířku karty, 16 pod posledním polem (P2, P13) — ne osamělá vpravo. */}
              <Button type="submit" variant="accent" className="w-full -mt-2" loading={savingProfile}>{t('Uložit změny')}</Button>
            </form>
          ) : section === 'jazyk' ? (
            <SekceJazyk />
          ) : section === 'app' ? (
            <div className="space-y-6">
              <SekceVzhled />
              <section className="card p-5 sloupec sloupec-3" aria-labelledby="nast-o-aplikaci">
                <h2 id="nast-o-aplikaci" className={cardTitle}>{t('O aplikaci')}</h2>
                <p className="t-meta -mt-2">{t('Právní informace a kontakt na podporu.')}</p>
                <ProvozovatelInfo className="text-sm" />
              </section>
            </div>
          ) : section === 'notifications' ? (
            <div className="space-y-6">
            <SekceOznameni />

            <section className="card p-5 sloupec sloupec-3" aria-labelledby="nast-centrum-t">
              {/* v4 (V1, P2): hromadná akce vpravo v řádku s titulem (na telefonu jen ikona 36, popisek
                  zůstává pro čtečku a v bublině), segment pod ní L→R. Dřív se akce zalomila nad segment
                  a každý z nich měl jinou šířku. */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="nast-centrum-t" className={cardTitle}>{t('Centrum oznámení')}</h2>
                  <p className="t-meta mt-1">
                    {unreadCount > 0 ? t('Nepřečtená oznámení: {n}', { n: unreadCount }) : t('Vše přečteno')}
                  </p>
                </div>
                {unreadCount > 0 && (
                  <Button variant="secondary" size="sm" icon="check" onClick={markAllRead} title={t('Označit vše jako přečtené')}
                    className="shrink-0 max-sm:!w-9 max-sm:!px-0">
                    <span className="max-sm:sr-only">{t('Označit vše jako přečtené')}</span>
                  </Button>
                )}
              </div>

              <Segmented size="sm" ariaLabel={t('Která oznámení ukázat')} value={filtrOzn} onChange={zmenFiltr}
                options={[{ id: 'vse', label: t('Vše') }, { id: 'neprectene', label: t('Nepřečtené'), count: unreadCount }]} />
              {druhyPilulek.length >= 2 && (
                // Filtrovací pás (DESIGN): na úzké obrazovce jede do strany uvnitř sebe, nezalamuje se do tří řádků.
                <div className="flex gap-1.5 overflow-x-auto overscroll-x-contain scrollbar-none scroll-fade-x -mx-1 px-1 py-0.5" role="group" aria-label={t('Druh oznámení')}>
                  {druhyPilulek.map(([typ, n]) => (
                    <button key={typ} type="button" aria-pressed={druhOzn === typ} onClick={() => zmenDruh(typ)}
                      className={`filter-pill tap-target-sm shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 ${druhOzn === typ ? 'seg-on' : 'seg-off glass'}`}>
                      <Icon name={ikonaOznameni(typ)} size={13} className="shrink-0" />
                      <span>{nazevDruhu(typ)} · <span className="tabular-nums">{n}</span></span>
                    </button>
                  ))}
                </div>
              )}
              {notifMsg && <p role="alert" className="note note-danger text-sm">{notifMsg}</p>}

              {notifsLoading ? (
                <div className="space-y-2" aria-busy="true" aria-label={t('Načítám oznámení')}>
                  {[0, 1, 2].map(i => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : notifsErr ? (
                <ErrorState compact title={t('Oznámení se nepodařilo načíst')} onRetry={() => loadNotifs()} />
              ) : notifs.length === 0 ? (
                filtrOzn === 'neprectene' || druhOzn
                  ? <EmptyState compact icon="bell" title={t('Nic tu není')} hint={t('Pod tímhle filtrem žádné oznámení nečeká.')} />
                  : <EmptyState compact icon="bell" title={t('Žádná oznámení')} hint={t('Až se něco stane, zobrazí se to tady.')} />
              ) : (
                <ul className="list">
                  {/* ListRow: titulek, čas v meta a text oznámení v `detail` (zalamuje se,
                      neořezává). Řádek s odkazem je tlačítko a vede na cíl; bez odkazu jen
                      informuje. Nepřečtené nese chip, ne limetkový podklad. */}
                  {notifs.map(n => {
                    const ikona = (
                      <span className="well h-9 w-9 grid place-items-center text-black/55 shrink-0">
                        <Icon name={ikonaOznameni(n.type)} size={16} />
                      </span>
                    );
                    const maOdkaz = cilOznameni(n) !== null;
                    return (
                      <ListRow key={n.id}
                        lead={ikona}
                        // Chip „Nové" v řádku titulku: v ocase by na telefonu dostal vlastní řádek.
                        title={!n.is_read
                          ? <span className="flex items-center gap-2 min-w-0"><span className="truncate font-bold">{n.title}</span><Chip tone="info" size="sm" className="shrink-0">{t('Nové')}</Chip></span>
                          : n.title}
                        meta={kdyPrislo(n.created_at, t, jazyk)}
                        detail={n.body ? <span className="break-words">{n.body}</span> : undefined}
                        onClick={maOdkaz ? () => { void otevriNotif(n); } : undefined} />
                    );
                  })}
                </ul>
              )}
              {!notifsLoading && !notifsErr && maStarsi && (
                <Button variant="secondary" icon="refresh" className="w-full" loading={nacitamStarsi} onClick={nactiStarsi}>{t('Načíst starší')}</Button>
              )}
            </section>
            </div>
          ) : section === 'security' ? (
            <div>
            <form onSubmit={savePassword} className="card p-5 sloupec sloupec-6">
              <div>
                <h2 className={cardTitle}>{t('Změna hesla')}</h2>
                <p className="t-meta mt-1">{t('Nové heslo musí mít alespoň 8 znaků.')}</p>
              </div>

              {pwdMsg && (
                <div role="status" className="note note-ok p-4 text-sm flex items-center gap-2">
                  <Icon name="check" size={16} className="shrink-0" /> {pwdMsg}
                </div>
              )}
              {pwdErr && (
                <div role="alert" className="note note-danger p-4 text-sm flex items-center gap-2">
                  <Icon name="warning" size={16} className="shrink-0" /> {pwdErr}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label htmlFor="nast-heslo" className={labelClass}>{t('Současné heslo')}</label>
                  <input id="nast-heslo" type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="nast-heslo-nove" className={labelClass}>{t('Nové heslo')}</label>
                  <input id="nast-heslo-nove" type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label htmlFor="nast-heslo-znovu" className={labelClass}>{t('Potvrdit nové heslo')}</label>
                  <input id="nast-heslo-znovu" type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputClass} />
                </div>
              </div>

              <Button type="submit" variant="accent" className="w-full -mt-2" loading={savingPwd}>{t('Změnit heslo')}</Button>
            </form>
            <OvereniEmailuNastaveni />
            <ZamekAplikace obal="karta" />
            <Zablokovani />
            </div>
          ) : section === 'privacy' ? (
            <SekceData />
          ) : section === 'zkratky' ? (
            <SekceZkratky />
          ) : section === 'podnik' ? (
            // Pravidelné náklady (nájem, energie) patří k profilu podniku; edituje je i okno ve Financích.
            <SekcePodnik pravidelneNaklady={ma('finance.nastaveni') ? <PevneNaklady /> : undefined} />
          ) : section === 'organizace' ? (
            // Nastavení organizace (sdílení lidí, přehled za všechny podniky, sdílené číselníky) — dřív
            // čtvrtá karta pod Tým › Podnik. Seznam podniků tu není, ten má „Všechny podniky".
            organizaceCeka ? <Skeleton className="h-48 rounded-3xl" /> : <OrganizationSettings />
          ) : section === 'nahlaseni' ? (
            <NahlasenyObsah />
          ) : section === 'billing' && smiPlatby ? (
            <Billing />
          ) : section === 'pos' ? (
            // i18n-ok: Pokladna (napojení Storyous) zůstává česky — česká služba, klíče a hlášky z jejího back-office.
            <section className="card p-5">
              <h2 className={cardTitle}>Napojení pokladny Storyous</h2>
              <p className="t-meta mt-1 mb-4">
                Jen čtení: appka si bere tržby z účtenek — nic do pokladny nezapisuje. Klíče se ukládají bezpečně na serveru.
              </p>
              {posMsg && (
                <p role={posMsg.ok ? 'status' : 'alert'} className={`note ${posMsg.ok ? 'note-ok' : 'note-danger'} text-sm px-4 py-2.5 mb-3 flex items-start gap-2`}>
                  <Icon name={posMsg.ok ? 'check' : 'warning'} size={16} className="shrink-0 mt-0.5" /> <span className="min-w-0">{posMsg.text}</span>
                </p>
              )}
              {posStatus?.connected ? (
                <div className="space-y-4">
                  <div className="note note-ok px-4 py-3">
                    <p className="text-sm font-semibold"><Icon name="check" size={15} className="inline -mt-0.5 mr-1.5 shrink-0" /> Připojeno: {posStatus.placeName ?? posStatus.merchantId}</p>
                    <p className="text-xs text-black/55 mt-0.5">Client ID {posStatus.clientIdMasked} · účtenky, položky i katalog se zrcadlí do aplikace samy.</p>
                  </div>

                  {/* Zdraví: aplikace se synchronizuje sama, tady je vidět, že to opravdu dělá. */}
                  {posHealth?.connected && (
                    <div className="well p-4 space-y-3">
                      {/* Sdílené Stat/StatRow místo čtyř ručních statistik (DP §3.12). */}
                      <StatRow className="sm:grid-cols-4">
                        <Stat label="Účtenek u nás" value={posHealth.billsCount.toLocaleString('cs-CZ')} />
                        <Stat label="Data od" value={posHealth.firstDay ? new Date(posHealth.firstDay + 'T12:00:00').toLocaleDateString('cs-CZ') : '—'} />
                        <Stat label="Produktů s cenou" value={`${posHealth.productsWithPrice} / ${posHealth.productsCount}`} />
                        <Stat label="Poslední sync" value={posHealth.lastSyncAt ? dbTimeDayHM(posHealth.lastSyncAt) : 'zatím ne'} />
                      </StatRow>
                      {posHealth.lastError && (
                        <p className="text-xs note note-danger px-3 py-2">
                          Poslední chyba{posHealth.lastErrorAt ? ` (${dbTimeDayHM(posHealth.lastErrorAt)})` : ''}: {posHealth.lastError}
                        </p>
                      )}
                      {posHealth.itemsPending > 0 && (
                        <p className="text-xs text-black/60">U {posHealth.itemsPending} účtenek se položky ještě dotahují — každý běh jich vezme sto padesát.</p>
                      )}
                      {/* Historie se u většího podniku stahuje po týdnech na pozadí. Bez
                          téhle věty vypadá „Data od" jako chyba, přitom se to jen plní. */}
                      {!posHealth.historyComplete && posHealth.backfillUntil && (
                        <p className="text-xs text-black/60">
                          Historie se ještě dotahuje na pozadí — po týdnech zpátky až k{' '}
                          {new Date(posHealth.backfillUntil + 'T12:00:00').toLocaleDateString('cs-CZ')}. Dnešní tržby to nezdržuje.
                        </p>
                      )}
                      <p className="text-xs text-black/60">
                        Synchronizuje se při každém otevření aplikace i kiosku (nejvýš jednou za pár minut), ráno cronem a večer před souhrnem. Ručně jen když nechceš čekat.
                      </p>
                      {/* v4 (P12): dvě rovnocenné akce jako 2 × ½ (36), dlouhý popisek se zalomí v dílu. */}
                      <div className="rada rada-rovne rada-s">
                        {/* Ruční synchronizace je jen doplněk (appka se synchronizuje
                            sama) — vedlejší akce, ne limetka. */}
                        <Button variant="secondary" size="sm" icon="refresh" loading={posAction === 'sync'} disabled={!!posAction}
                          onClick={() => posDo('sync')}>
                          Synchronizovat teď
                        </Button>
                        <Button variant="secondary" size="sm" icon="download" loading={posAction === 'backfill'} disabled={!!posAction}
                          onClick={() => setPotvrzeni({
                            title: 'Načíst historii?', text: 'Načtou se účtenky za posledních 180 dní. Trvá to pár desítek sekund.',
                            label: 'Načíst historii', danger: false, akce: () => posDo('backfill', { days: 180 }),
                          })}>
                          Načíst historii (180 dní)
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* DataSync: Storyous umí změny posílat sám — zapíná to jejich podpora. */}
                  {posHealth?.connected && (
                    <div className="well p-4 space-y-2.5">
                      <h3 className="t-card">Okamžité změny z pokladny (DataSync)</h3>
                      <p className="text-xs text-black/60">
                        Storyous umí každou změnu poslat rovnou sem, bez čekání na další otevření aplikace. Zapíná to podpora Storyous/Teya pro tvoji provozovnu — pošli jim adresu a tajemství níže.
                        {posHealth.lastWebhookAt && <> Naposledy přišlo <strong>{dbTimeDayHM(posHealth.lastWebhookAt)}</strong>.</>}
                      </p>
                      {posHealth.webhookSecret ? (
                        <div className="space-y-1.5">
                          {([['Adresa (URL)', posHealth.webhookUrl], ['Tajemství (Authorization)', posHealth.webhookSecret]] as const).map(([k, v]) => (
                            <div key={k} className="flex items-center gap-2 min-w-0">
                              <span className="t-label w-28 shrink-0">{k}</span>
                              <code className="flex-1 min-w-0 truncate rounded-xl bg-[var(--surface)] border border-[var(--well-line)] px-3 py-1.5 text-xs">{v}</code>
                              <Button variant="secondary" size="sm" icon="copy" className="shrink-0"
                                onClick={() => { navigator.clipboard?.writeText(String(v)); setPosMsg('Zkopírováno.', true); }}>
                                Kopírovat
                              </Button>
                            </div>
                          ))}
                          <p className="t-meta">Metoda POST, data od dneška. Bez tajemství v hlavičce se požadavek zahodí.</p>
                          <Button variant="danger" size="sm" className="w-full bg-black/[0.04]" onClick={() => setPotvrzeni({
                            title: 'Vypnout příjem změn?', text: 'Staré tajemství přestane platit. Znovu zapnout půjde jen s novým tajemstvím přes podporu Storyous.',
                            label: 'Vypnout příjem', danger: true, akce: () => posDo('webhook-off'),
                          })}>Vypnout</Button>
                        </div>
                      ) : (
                        <Button variant="secondary" size="sm" icon="key" className="w-full" loading={posAction === 'webhook-secret'} disabled={!!posAction}
                          onClick={() => posDo('webhook-secret')}>
                          Vygenerovat adresu a tajemství
                        </Button>
                      )}
                    </div>
                  )}

                  <Button variant="danger" className="w-full bg-black/[0.04]" onClick={() => setPotvrzeni({
                    title: 'Odpojit pokladnu?', text: 'Tržby se přestanou načítat. Účtenky, které už v aplikaci jsou, zůstanou.',
                    label: 'Odpojit pokladnu', danger: true,
                    akce: async () => {
                      // Odpojeno je až to, co server potvrdí. Dřív se „Pokladna odpojena."
                      // ukázalo i po 500/403 nebo bez wifi — a po obnovení stránky byla
                      // pokladna zase připojená a tržby se dál načítaly (DP §3.17).
                      const res = await fetch('/api/pos', { method: 'DELETE' }).catch(() => null);
                      if (!res?.ok) { setPosMsg('Pokladnu se nepodařilo odpojit — zkus to znovu.', false); return; }
                      setPosStatus({ connected: false }); setPosHealth(null); setPosMsg('Pokladna odpojena.', true);
                    },
                  })}>
                    Odpojit pokladnu
                  </Button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {([['clientId', 'Client ID'], ['clientSecret', 'Client Secret'], ['merchantId', 'Merchant ID'], ['placeId', 'Place ID']] as const).map(([k, lbl]) => (
                    <div key={k}>
                      <Label htmlFor={`pos-${k}`}>{lbl}</Label>
                      <input id={`pos-${k}`} value={(posForm as any)[k]} onChange={e => setPosForm(f => ({ ...f, [k]: e.target.value }))}
                        type={k === 'clientSecret' ? 'password' : 'text'} autoComplete="off"
                        className="field font-mono" />
                    </div>
                  ))}
                  {/* Jediná akce sekce → limetka (DP §3.1). */}
                  <Button variant="accent" className="w-full" loading={posBusy} disabled={Object.values(posForm).some(v => !v.trim())} onClick={posConnect}>
                    Připojit a ověřit
                  </Button>
                  <p className="t-meta">Klíče získáš v back-office Storyous/Teya (API přístup).</p>
                </div>
              )}
            </section>
          ) : section === 'roles' ? (
            <RoleEditor />
          ) : section === 'stranky' ? (
            <VychoziRozlozeni />
          ) : section === 'audit' ? (
            // Historie změn s hledáním, lidmi, oblastmi a „Načíst starší" (kolo 7) — vlastní soubor.
            <SekceHistorie />
          ) : (
            <TeamManagement user={user} />
          )}
        </div>
      </div>

      <Modal open={!!potvrzeni} onClose={() => setPotvrzeni(null)} size="sm" title={potvrzeni?.title ?? ''}
        footer={<>
          <Button variant="secondary" onClick={() => setPotvrzeni(null)}>{t('Zrušit')}</Button>
          <Button variant={potvrzeni?.danger ? 'danger-solid' : 'primary'} onClick={() => {
            const p = potvrzeni; setPotvrzeni(null); void p?.akce();
          }}>{potvrzeni?.label}</Button>
        </>}>
        <p className="t-meta text-pretty">{potvrzeni?.text}</p>
      </Modal>
    </div>
  );
}
