'use client';

// Obal zákaznické části. Bez týmového chrome — host vidí jen značku, svoje
// podniky a svůj účet. Stejné tokeny jako zbytek aplikace, ať host i tým
// poznají jednu aplikaci.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { odhlasit } from '@/lib/odhlaseni';
import { useEffect, useState } from 'react';
import { Icon, LogoMark } from '../Icons';
import { useTheme } from '../ThemeProvider';
import { usePopover } from '@/lib/usePopover';
import { useObal } from '../ObalProvider';
import PravniOdkazy from '../pravni/PravniOdkazy';
import JazykMenu from '../ui/JazykMenu';
import NajitPodnik, { useUmiSkenovat } from './NajitPodnik';
import { useT, useJazyk } from '@/lib/i18n/client';

export interface ClientUser { id: number; name: string; email: string }

export function Initials({ name, size = 36 }: { name: string; size?: number }) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const txt = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '·';
  return (
    <span className="inline-grid place-items-center rounded-full bg-[#16181A] text-[#C8F542] font-bold shrink-0" style={{ width: size, height: size, fontSize: Math.max(11, Math.round(size * 0.38)) }} aria-hidden>
      {txt}
    </span>
  );
}

export default function ClientShell({ me, children }: { me: ClientUser | null; children: React.ReactNode }) {
  const t = useT('klient-host');
  // Právní stránky existují česky a anglicky; ostatní jazyky dostanou anglické.
  const jazykPravni = useJazyk().jazyk === 'cs' ? 'cs' : 'en';
  // Hostovská část je světlá i při tmavém motivu účtu (viz ThemeProvider).
  const { setForcedLight } = useTheme();
  useEffect(() => { setForcedLight(true); return () => setForcedLight(false); }, [setForcedLight]);
  const path = usePathname();
  // V nativní aplikaci nesmí být odkaz na prodejní stránku (ceny, Stripe): Apple 3.1.1.
  // Web ho má dál; obal dostane jen větu bez odkazu.
  const { jeObal } = useObal();
  const [open, setOpen] = useState(false);
  // Účet se nezavíral vůbec: ani Escapem, ani kliknutím vedle. Jednou
  // otevřený zůstal viset přes stránku, dokud se na něj neklikalo znovu.
  const pop = usePopover(open, setOpen, { focusFirst: true, arrowKeys: true });
  // „Naskenovat“ (QR podniku nebo stolu) a „Zadat kód podniku“: jedno okno, NajitPodnik.tsx.
  // Kde skenovat nejde (prohlížeč bez kamery na QR), tlačítko rovnou říká „Zadat kód“.
  const sken = useUmiSkenovat(jeObal);
  const [najit, setNajit] = useState<{ open: boolean; hned: boolean }>({ open: false, hned: false });
  const otevriNajit = () => setNajit({ open: true, hned: true });
  const popisNajit = sken.umi ? t('Naskenovat') : t('Zadat kód');
  const ikonaNajit = sken.umi ? 'camera' : 'search';
  const active = (p: string) => path === p || (p !== '/client' && path?.startsWith(p));
  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: 'var(--bg)', color: '#16181A' }}>
      <header className="sticky top-0 z-30 chrome-edge">
        <div className="glass-strong !border-x-0 !border-t-0 !shadow-none border-b border-black/[0.06]">
          {/* v4 (V0, P1, P18): lišta má stejné boční okraje jako obsah (16 / 20 / 24) a všechny prvky
              jednu výšku 40 — odkazy, sken, jazyk, účet i Přihlásit (dřív odkazy 36 vedle kruhů 40). */}
          <div className="mx-auto max-w-5xl px-4 min-[360px]:px-5 sm:px-6 h-16 flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Na 320 px se značka, dvě záložky a účet do řádku nevešly a stránka
                se dala odrolovat do strany. Slovo „client" jde na telefonu pryč,
                celý nápis až pod 360 px — logo zůstává vždy. Nepřihlášený má navíc
                Podniky, Zadat kód a Přihlásit: na 390 px to vyšlo na pixel a se širším
                písmem (Linux v CI) Přihlásit vyčuhovalo — nápis u něj až od 440 px. */}
            <Link href="/client" className="tap-target flex items-center gap-2 shrink-0" aria-label="Managero client">
              <LogoMark size={32} />
              <span className={`hidden ${me ? 'min-[360px]:inline' : 'min-[440px]:inline'} font-bold tracking-tight leading-none`}>Managero <span className="hidden sm:inline text-black/45 font-semibold">client</span></span>
            </Link>
            <nav className="ml-auto flex items-center gap-0.5 sm:gap-1.5 min-w-0" aria-label={t('Zákaznická navigace')}>
              {/* Na mobilu žijí záložky ve spodním docku jako ve zbytku
                  aplikace; nahoře zůstává jen značka a účet. Nepřihlášený
                  dock nemá, tak mu odkaz Podniky zůstává i na telefonu. */}
              <Link href="/client" aria-current={active('/client') && path === '/client' ? 'page' : undefined}
                className={`${me ? 'hidden md:inline-flex' : 'inline-flex'} tap-target-sm items-center h-10 rounded-full px-3 sm:px-3.5 text-sm font-medium transition ${path === '/client' ? 'bg-black/[0.06] text-[#16181A]' : 'seg-off'}`}>{t('Podniky')}</Link>
              {me && (
                <Link href="/client/me" aria-current={active('/client/me') ? 'page' : undefined}
                  className={`hidden md:inline-flex tap-target-sm items-center h-10 rounded-full px-3 sm:px-3.5 text-sm font-medium transition ${active('/client/me') ? 'bg-black/[0.06] text-[#16181A]' : 'seg-off'}`}>{t('Moje')}</Link>
              )}
              {/* Sken QR a kód podniku. Přihlášený má na telefonu tlačítko uprostřed spodního doku, tady jen od md. */}
              <button type="button" onClick={otevriNajit} aria-label={sken.umi ? t('Naskenovat QR kód nebo zadat kód podniku') : t('Zadat kód podniku')}
                className={`${me ? 'hidden md:inline-flex' : 'inline-flex'} tap-target items-center justify-center gap-1.5 rounded-full h-10 min-w-10 px-2.5 sm:px-3.5 text-sm font-medium bg-black/[0.05] text-black/70 hover:bg-black/[0.08] hover:text-[#16181A] transition`}>
                <Icon name={ikonaNajit} size={17} aria-hidden />
                <span className="hidden sm:inline">{popisNajit}</span>
              </button>
              {/* Jazyk hosta: malá pilulka s globusem. Hostovská část je celá přeložená do všech pěti jazyků. */}
              <JazykMenu className="ml-0.5 sm:ml-1" />
              {me ? (
                <div className="relative ml-1" ref={pop.ref}>
                  <button ref={pop.triggerRef} onClick={() => setOpen(v => !v)}
                    onKeyDown={pop.onTriggerKeyDown}
                    aria-haspopup="menu" aria-expanded={open} title={me.name}
                    className="tap-target flex h-10 items-center gap-1.5 rounded-full p-1 sm:pr-2.5 hover:bg-black/[0.05] transition">
                    <Initials name={me.name} size={32} />
                    <Icon name="chevron" size={14} className={`hidden sm:block text-black/45 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <div role="menu" ref={pop.panelRef} onKeyDown={pop.onPanelKeyDown}
                      className="absolute right-0 mt-2 w-56 glass-strong rounded-2xl border border-black/[0.08] p-1.5 shadow-lg">
                      <div className="px-3 py-2">
                        <p className="text-sm font-semibold truncate">{me.name}</p>
                        <p className="text-xs text-black/50 truncate">{me.email}</p>
                      </div>
                      <Link role="menuitem" href="/client/me#ucet" onClick={() => setOpen(false)}
                        className="w-full text-left rounded-xl px-3 py-2 text-sm hover:bg-black/[0.05] transition flex items-center gap-2">
                        <Icon name="user" size={16} /> {t('Účet a soukromí')}
                      </Link>
                      <button role="menuitem" onClick={() => odhlasit({ callbackUrl: '/client' })}
                        className="w-full text-left rounded-xl px-3 py-2 text-sm text-bad-ink hover:bg-bad/10 transition flex items-center gap-2">
                        <Icon name="logout" size={16} /> {t('Odhlásit se')}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                // v3: v liště inkoustová pilulka, ne limetka — jediná limetka patří hlavní akci obrazovky
                // („Založit účet", „Přihlásit se" ve formuláři).
                <Link href="/client/login" className="tap-target-sm ml-0.5 sm:ml-1 btn btn-primary btn-sm !h-10 !px-3 sm:!px-4 text-sm">{t('Přihlásit')}</Link>
              )}
            </nav>
          </div>
        </div>
      </header>
      {/* v3: okraj obsahu na telefonu 20 px (pod 360 px 16 px), od sm 24 px — stejně jako administrace. */}
      <main className="flex-1 w-full mx-auto max-w-5xl px-4 min-[360px]:px-5 sm:px-6 pt-6 sm:pt-10 pb-6 sm:pb-10">{children}</main>
      <footer className={`mx-auto max-w-5xl w-full px-4 min-[360px]:px-5 sm:px-6 pt-8 ${me ? 'pb-28 md:pb-8' : 'pb-8'} text-xs text-black/45 flex flex-wrap items-center gap-x-4 gap-y-1`}>
        <span>Managero client</span>
        <span>{t('Rezervace, věrnost a objednávky pro podniky, kam chodíš.')}</span>
        {jeObal
          ? <span className="sm:ml-auto">{t('Provozujete podnik? Používejte aplikaci Managero pro podniky.')}</span>
          : <Link href="/" className="tap-target-sm sm:ml-auto inline-flex items-center hover:text-black">{t('Jsem podnik')}</Link>}
        <PravniOdkazy jazyk={jazykPravni} jen={['soukromi', 'podminky', 'podpora']} className="basis-full" />
      </footer>

      <NajitPodnik open={najit.open} skenovatHned={najit.hned} jeObal={jeObal} onClose={() => setNajit({ open: false, hned: false })} />

      {/* Mobilní spodní dock — stejný jazyk jako administrace. */}
      {me && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 px-4 pb-[max(env(safe-area-inset-bottom),16px)]">
          <nav className="dock-strong mx-auto max-w-md rounded-3xl px-2 py-2 flex items-center justify-around shadow-[0_10px_34px_rgba(25,35,15,0.16)]" aria-label={t('Spodní navigace')}>
            {([
              { href: '/client', label: t('Podniky'), icon: 'location', on: path === '/client' || (!!path?.startsWith('/client/') && !path.startsWith('/client/me')) },
              null,
              { href: '/client/me', label: t('Moje'), icon: 'card', on: !!path?.startsWith('/client/me') },
            ] as const).map(i => i === null ? (
              // Uprostřed doku, kde je palec: sken QR na stole (v aplikaci rovnou nativní skener).
              <button key="najit" type="button" onClick={otevriNajit} title={popisNajit}
                className="flex flex-col items-center gap-1 rounded-2xl px-5 py-1.5 text-[#16181A] transition duration-200">
                <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[#16181A] text-[#C8F542] -mt-0.5" aria-hidden><Icon name={ikonaNajit} size={18} strokeWidth={1.9} /></span>
                <span className="text-[11px] leading-none font-medium">{popisNajit}</span>
              </button>
            ) : (
              <Link key={i.href} href={i.href} title={i.label}
                className={`flex flex-col items-center gap-1 rounded-2xl px-6 py-1.5 transition duration-200 ${i.on ? 'text-[#16181A] -translate-y-0.5' : 'text-black/40'}`}>
                <Icon key={i.on ? 'on' : 'off'} name={i.icon} size={22} strokeWidth={i.on ? 2 : 1.7} className="i-lead" motion={i.on ? 'pop' : undefined} />
                <span className={`text-[11px] leading-none font-medium ${i.on ? 'text-[#16181A]' : 'text-black/40'}`}>{i.label}</span>
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
