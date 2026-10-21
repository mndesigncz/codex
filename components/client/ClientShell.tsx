'use client';

// Obal hostovské části (Managero client). Přestavba podle auditu C a konceptu B:
//
//  Telefon (přihlášený): žádná horní lišta — obrazovka začíná svým nadpisem (Karta: pozdrav
//  a avatar → Profil). Spodní dok `Karta · Podniky · [U kasy] · Odměny · Aktivita`; prostřední
//  inkoustový kruh pod palcem otevře QR přes celou výšku jedním klepnutím odkudkoli.
//  Proč profil za avatarem, ne v doku (koncept B ho měl v doku místo Podniků): U kasy je hlavní
//  okamžik aplikace a patří doprostřed pod palec; Profil host otevírá párkrát za rok, kdežto
//  Podniky (sken stojánku, hledání) a Aktivita (potvrzení rezervace, +body) jsou týdenní.
//  Pět míst je strop doku — šestou položku by nikdo netrefil.
//  Počítač: horní lišta se stejnými čtyřmi položkami, tlačítko „Ukázat kartu“ a avatar.
//  Nepřihlášený: lišta se značkou, Podniky, kód podniku, jazyk a Přihlásit (beze změny).
//
// Motiv: host jede podle telefonu (světlý výchozí, tmavý večer v baru) — tokeny, žádná
// natvrdo bílá. Barva podniku jen na jeho kartě a v hlavičce jeho stránky.
// Ukázka bez databáze (/client/demo…) běží v témže obalu s vymyšleným hostem.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, createContext, useContext } from 'react';
import { Icon, LogoMark } from '../Icons';
import { Badge } from '../ui';
import { useObal } from '../ObalProvider';
import PravniOdkazy from '../pravni/PravniOdkazy';
import JazykMenu from '../ui/JazykMenu';
import NajitPodnik, { useUmiSkenovat } from './NajitPodnik';
import { useT, useJazyk } from '@/lib/i18n/client';
import { okJson } from '@/lib/api';
import { HostCestyProvider, DEMO_ZAKLAD, naDemo, zDema } from './host/cesty';
import { UKasyProvider, useUKasy } from './host/UKasy';
import { DEMO_HOST } from '@/lib/klient/demo/hostDemo';

export interface ClientUser { id: number; name: string; email: string }

/** Kruh s iniciálami (starší duplikát Avataru; drží ho stránka podniku pro podniky bez loga). */
export function Initials({ name, size = 36 }: { name: string; size?: number }) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const txt = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '·';
  return (
    <span className="inline-grid place-items-center rounded-full bg-[#16181A] text-[#C8F542] font-bold shrink-0" style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) }} aria-hidden>
      {txt}
    </span>
  );
}

/** Avatar hosta (limetkový kruh s iniciálami) — vede na Profil. */
export function AvatarHosta({ name, size = 40 }: { name: string; size?: number }) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const txt = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '·';
  return (
    <span className="inline-grid place-items-center rounded-full bg-[#C8F542] on-accent font-semibold shrink-0 tracking-[-0.01em]" style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.36)) }} aria-hidden>{txt}</span>
  );
}

interface HostShell { me: ClientUser | null; otevriNajit: () => void; skenPopis: string; skenIkona: string; neprecteno: number; setNeprecteno: (n: number) => void }
const HostShellKontext = createContext<HostShell>({ me: null, otevriNajit: () => {}, skenPopis: '', skenIkona: 'search', neprecteno: 0, setNeprecteno: () => {} });
export const useHostShell = () => useContext(HostShellKontext);

export default function ClientShell({ me: meServer, children }: { me: ClientUser | null; children: React.ReactNode }) {
  const t = useT('klient-host');
  const jazykPravni = useJazyk().jazyk === 'cs' ? 'cs' : 'en';
  const path = usePathname() ?? '/client';
  const demo = path === DEMO_ZAKLAD || path.startsWith(DEMO_ZAKLAD + '/');
  const me = demo ? DEMO_HOST : meServer;
  const { jeObal } = useObal();
  // „Naskenovat“ (QR podniku nebo stolu) a „Zadat kód podniku“: jedno okno, NajitPodnik.tsx.
  const sken = useUmiSkenovat(jeObal);
  const [najit, setNajit] = useState<{ open: boolean; hned: boolean }>({ open: false, hned: false });
  const skenPopis = sken.umi ? t('Naskenovat') : t('Zadat kód');
  const skenIkona = sken.umi ? 'camera' : 'search';
  // Nepřečtené v Aktivitě (odznak v doku): zjistí se při změně obrazovky; Aktivita ho sama vynuluje.
  const [neprecteno, setNeprecteno] = useState(0);
  useEffect(() => {
    if (!me) return;
    let zivy = true;
    fetch('/api/client/me/aktivita?pocet=1', { cache: 'no-store' }).then(okJson).then(x => { if (zivy) setNeprecteno(Math.max(0, Number(x?.neprecteno) || 0)); }).catch(() => {});
    return () => { zivy = false; };
  }, [me, path]);
  const kontext = useMemo<HostShell>(() => ({ me, otevriNajit: () => setNajit({ open: true, hned: true }), skenPopis, skenIkona, neprecteno, setNeprecteno }), [me, skenPopis, skenIkona, neprecteno]);
  const realna = zDema(path);
  const c = (x: string) => (demo ? naDemo(x) : x);
  const naStrance = (x: string) => realna === x;
  const jeKarta = naStrance('/client/me');
  const jePodnik = !!me && /^\/client\/(?!me(\/|$)|login|register|odhlasit|zapomenute-heslo|nove-heslo|demo)[^/]+/.test(realna);
  const polozky = [
    { href: '/client/me', label: t('Karta'), icon: 'card', on: jeKarta },
    { href: '/client', label: t('Podniky'), icon: 'location', on: naStrance('/client') || jePodnik },
    null,
    { href: '/client/me/odmeny', label: t('Odměny'), icon: 'gift', on: naStrance('/client/me/odmeny') },
    { href: '/client/me/aktivita', label: t('Aktivita'), icon: 'bell', on: naStrance('/client/me/aktivita'), badge: neprecteno },
  ] as const;

  return (
    <HostCestyProvider demo={demo}>
      <HostShellKontext.Provider value={kontext}>
        <UKasyProvider prihlasen={!!me}>
          <div className="min-h-[100dvh] flex flex-col">
            {demo && <DemoPruh />}
            {me ? <ListaPrihlaseny me={me} polozky={polozky} c={c} /> : <ListaHost />}
            <main className={`flex-1 w-full mx-auto max-w-5xl px-4 min-[360px]:px-5 sm:px-6 ${me ? 'pt-[max(env(safe-area-inset-top),20px)] md:pt-10 pb-32 md:pb-12' : 'pt-6 sm:pt-10 pb-6 sm:pb-10'}`}>{children}</main>
            <footer className={`mx-auto max-w-5xl w-full px-4 min-[360px]:px-5 sm:px-6 pt-8 pb-8 text-xs text-black/55 flex-wrap items-center gap-x-4 gap-y-1 ${me ? 'hidden md:flex' : 'flex'}`}>
              <span>Managero client</span>
              <span>{t('Rezervace, věrnost a objednávky pro podniky, kam chodíš.')}</span>
              {jeObal
                ? <span className="sm:ml-auto">{t('Provozujete podnik? Používejte aplikaci Managero pro podniky.')}</span>
                : <Link href="/" className="tap-target-sm sm:ml-auto inline-flex items-center hover:text-black">{t('Jsem podnik')}</Link>}
              <PravniOdkazy jazyk={jazykPravni} jen={['soukromi', 'podminky', 'podpora']} className="basis-full" />
            </footer>
            <NajitPodnik open={najit.open} skenovatHned={najit.hned} jeObal={jeObal} onClose={() => setNajit({ open: false, hned: false })} />
            {me && <DokHosta polozky={polozky} c={c} />}
          </div>
        </UKasyProvider>
      </HostShellKontext.Provider>
    </HostCestyProvider>
  );
}

type Polozka = { href: string; label: string; icon: string; on: boolean; badge?: number } | null;

/** Lišta nepřihlášeného: značka, Podniky, kód podniku, jazyk, Přihlásit. */
function ListaHost() {
  const t = useT('klient-host');
  const path = usePathname();
  const { otevriNajit, skenPopis, skenIkona } = useHostShell();
  const sken = skenIkona === 'camera';
  return (
    <header className="sticky top-0 z-30 chrome-edge">
      <div className="glass-strong !border-x-0 !border-t-0 !shadow-none border-b border-black/[0.06]">
        <div className="mx-auto max-w-5xl px-4 min-[360px]:px-5 sm:px-6 h-16 flex items-center gap-2 sm:gap-3 min-w-0">
          <Link href="/client" className="tap-target flex items-center gap-2 shrink-0" aria-label="Managero client">
            <LogoMark size={32} />
            <span className="hidden min-[440px]:inline font-bold tracking-tight leading-none">Managero <span className="hidden sm:inline text-black/45 font-semibold">client</span></span>
          </Link>
          <nav className="ml-auto flex items-center gap-0.5 sm:gap-1.5 min-w-0" aria-label={t('Zákaznická navigace')}>
            <Link href="/client" aria-current={path === '/client' ? 'page' : undefined}
              className={`inline-flex tap-target-sm items-center h-10 rounded-full px-3 sm:px-3.5 text-sm font-medium transition ${path === '/client' ? 'bg-black/[0.06] text-[#16181A]' : 'seg-off'}`}>{t('Podniky')}</Link>
            <button type="button" onClick={otevriNajit} aria-label={sken ? t('Naskenovat QR kód nebo zadat kód podniku') : t('Zadat kód podniku')}
              className="tap-target inline-flex items-center justify-center gap-1.5 rounded-full h-10 min-w-10 px-2.5 sm:px-3.5 text-sm font-medium bg-black/[0.05] text-black/70 hover:bg-black/[0.08] hover:text-[#16181A] transition">
              <Icon name={skenIkona} size={17} aria-hidden />
              <span className="hidden sm:inline">{skenPopis}</span>
            </button>
            <JazykMenu className="ml-0.5 sm:ml-1" />
            <Link href="/client/login" className="tap-target-sm ml-0.5 sm:ml-1 btn btn-primary btn-sm !h-10 !px-3 sm:!px-4 text-sm">{t('Přihlásit')}</Link>
          </nav>
        </div>
      </div>
    </header>
  );
}

/** Lišta přihlášeného — jen od md (na telefonu nadpis obrazovky a dok). */
function ListaPrihlaseny({ me, polozky, c }: { me: ClientUser; polozky: readonly Polozka[]; c: (x: string) => string }) {
  const t = useT('klient-host');
  const { otevri } = useUKasy();
  return (
    <header className="hidden md:block sticky top-0 z-30 chrome-edge">
      <div className="glass-strong !border-x-0 !border-t-0 !shadow-none border-b border-black/[0.06]">
        <div className="mx-auto max-w-5xl px-6 h-16 flex items-center gap-3 min-w-0">
          <Link href={c('/client/me')} className="tap-target flex items-center gap-2 shrink-0" aria-label="Managero client">
            <LogoMark size={32} />
            <span className="font-bold tracking-tight leading-none">Managero <span className="text-black/45 font-semibold">client</span></span>
          </Link>
          <nav className="ml-4 flex items-center gap-1 min-w-0" aria-label={t('Zákaznická navigace')}>
            {polozky.filter((p): p is NonNullable<Polozka> => p !== null).map(p => (
              <Link key={p.href} href={c(p.href)} aria-current={p.on ? 'page' : undefined}
                className={`relative inline-flex tap-target-sm items-center h-10 rounded-full px-3.5 text-sm font-medium transition ${p.on ? 'bg-black/[0.06] text-[#16181A]' : 'seg-off'}`}>
                {p.label}
                {!!p.badge && !p.on && <Badge count={p.badge} label={t('{n, plural, one {# nová zpráva} few {# nové zprávy} other {# nových zpráv}}', { n: p.badge })} className="ml-1.5 !static" />}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => otevri()} className="btn btn-primary !h-10 !px-4 text-sm"><Icon name="qr" size={16} /> {t('Ukázat kartu')}</button>
            <Link href={c('/client/me/profil')} className="tap-target rounded-full" aria-label={t('Moje')} title={me.name}><AvatarHosta name={me.name} size={40} /></Link>
          </div>
        </div>
      </div>
    </header>
  );
}

/** Spodní dok hosta (telefon): Karta · Podniky · [U kasy] · Odměny · Aktivita. */
function DokHosta({ polozky, c }: { polozky: readonly Polozka[]; c: (x: string) => string }) {
  const t = useT('klient-host');
  const { otevri } = useUKasy();
  const nav = useRef<HTMLElement>(null);
  // Jako components/ui/Dock: `--dok-vyska` pro toast nad dokem.
  useEffect(() => {
    const el = nav.current; if (!el) return;
    const root = document.documentElement;
    const zapis = () => { const r = el.getBoundingClientRect(); if (r.height === 0) root.style.removeProperty('--dok-vyska'); else root.style.setProperty('--dok-vyska', `${Math.round(window.innerHeight - r.top + 8)}px`); };
    zapis(); window.addEventListener('resize', zapis);
    return () => { window.removeEventListener('resize', zapis); root.style.removeProperty('--dok-vyska'); };
  }, []);
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 px-3 pb-[max(env(safe-area-inset-bottom),12px)]">
      <nav ref={nav} className="dock-strong mx-auto max-w-md rounded-[28px] px-1.5 pt-1.5 pb-1.5 grid grid-cols-5 items-end shadow-[0_10px_34px_rgba(25,35,15,0.16)]" aria-label={t('Spodní navigace')}>
        {polozky.map(p => p === null ? (
          <button key="kasa" type="button" onClick={() => otevri()} title={t('U kasy')} aria-label={t('U kasy: ukázat kartu')}
            className="flex flex-col items-center gap-1 -mt-6 pb-1 text-[#16181A]">
            <span className="h-dok-kasa" aria-hidden><Icon name="qr" size={24} strokeWidth={1.9} /></span>
            <span className="text-[11px] leading-none font-semibold">{t('U kasy')}</span>
          </button>
        ) : (
          <Link key={p.href} href={c(p.href)} title={p.label} aria-current={p.on ? 'page' : undefined}
            className={`relative flex flex-col items-center gap-1 rounded-2xl py-2 min-h-[52px] justify-center transition duration-200 ${p.on ? 'text-[#16181A]' : 'text-black/55'}`}>
            <span className={`grid place-items-center h-7 w-11 rounded-full transition ${p.on ? 'bg-[#C8F542]/60' : ''}`}>
              <Icon key={p.on ? 'on' : 'off'} name={p.icon} size={21} strokeWidth={p.on ? 2 : 1.7} motion={p.on ? 'pop' : undefined} />
            </span>
            {!!p.badge && !p.on && <Badge count={p.badge} label={t('{n, plural, one {# nová zpráva} few {# nové zprávy} other {# nových zpráv}}', { n: p.badge })} className="absolute top-0.5 right-[18%]" />}
            <span className={`text-[11px] leading-none font-medium ${p.on ? 'text-[#16181A]' : 'text-black/55'}`}>{p.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** Ukázka bez účtu: poctivě řečeno nahoře, že data jsou vymyšlená. */
function DemoPruh() {
  const t = useT('klient-host');
  return (
    <div className="bg-[#16181A] text-white text-[13px]">
      <div className="mx-auto max-w-5xl px-4 min-[360px]:px-5 sm:px-6 min-h-9 py-1.5 flex items-center gap-3">
        <span className="h-2 w-2 rounded-full bg-[#C8F542] shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">{t('Ukázka Managero client · vymyšlený host a podniky')}</span>
        <Link href="/client/register" className="shrink-0 font-semibold underline underline-offset-2 tap-target-sm">{t('Založit účet')}</Link>
      </div>
    </div>
  );
}
