'use client';

// Podnik → Stránka podniku: živý náhled stránky pro hosty (kolo 92, koncept B „H", audit C §7).
// Mění se při každé úpravě vlevo (logo, fotka, barva, motto, adresa) ještě před uložením.
// Paleta Managera (korekce 2026-10-27): hlavička bez fotky je inkoustová jako na stránce hosta,
// karta hosta bílá s linkou; barvu značky podniku host nevidí (korekce 2026-10-27). Hlavní akce
// hosta zůstává limetková. Otevírací doba je z Rozvrhu (jen ke čtení).

import { hoursLabel, vOteviraciDobe, type OpeningHours } from '@/lib/clientSlots';
import { pragueHM, pragueToday } from '@/lib/pragueTime';
import { KartaPodniku, LogoPodniku, RamTelefonu } from './NahledKarty';

export default function NahledStranky({ p }: { p: any }) {
  const nazev = String(p.team_name || 'Tvůj podnik');
  const dnes = pragueToday();
  const hodiny = (p.opening_hours ?? {}) as OpeningHours;
  const oteviracka = hoursLabel(hodiny, dnes);
  const otevreno = vOteviraciDobe(hodiny, dnes, pragueHM());
  const zavira = oteviracka.includes('–') ? oteviracka.split('–')[1] : null;
  const cil = Number(p.stamp_target) || 0;
  return (
    <div className="space-y-3">
      <RamTelefonu popisek="Náhled stránky podniku v telefonu hosta">
        <div>
          <div className={`relative h-36 ${p.cover_url ? '' : 'h-moje !rounded-none'}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p.cover_url && <img src={p.cover_url} alt="" className="h-full w-full object-cover" />}
            <div className="absolute left-4 -bottom-6"><LogoPodniku nazev={nazev} logoUrl={p.logo_url || null} velikost={56} barva={p.accent || null} /></div>
          </div>
          <div className="px-4 pt-9 pb-4 space-y-3">
            <div>
              <p className="text-[20px] font-bold leading-tight tracking-[-0.02em]">{nazev}</p>
              {p.tagline && <p className="text-[13px] text-black/60 mt-0.5">{p.tagline}</p>}
              <p className="text-[13px] mt-1.5 flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${otevreno ? 'bg-[var(--ok-ink)]' : 'bg-black/30'}`} />
                <span className="text-black/70">{otevreno && zavira ? `Otevřeno do ${zavira}` : oteviracka === 'zavřeno' ? 'Dnes zavřeno' : oteviracka === 'neuvedeno' ? 'Otevírací doba neuvedená' : `Dnes ${oteviracka}`}</span>
              </p>
              {p.address && <p className="text-[13px] text-black/55 mt-0.5 truncate">{p.address}</p>}
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[12px] font-medium text-center">
              {['Menu', p.reservations_on ? 'Rezervace' : null, p.loyalty_on ? 'Věrnost' : 'Info'].filter(Boolean).map((x, i) => (
                <span key={String(x)} className={`h-8 rounded-full grid place-items-center ${i === 0 ? 'bg-white shadow-[0_0_0_1px_var(--surface-line)]' : 'bg-black/[0.05] text-black/60'}`}>{x}</span>
              ))}
            </div>
            {p.loyalty_on && cil > 0 && (
              <KartaPodniku nazev={nazev} logoUrl={p.logo_url || null} barva={p.accent || null} podtitul="Tvoje karta" cislo={`0 / ${cil}`} jednotka="razítek"
                veta={p.stamp_reward ? `${p.stamp_reward} za ${cil} návštěv.` : undefined} />
            )}
            <div aria-hidden className="h-11 rounded-full bg-[#C8F542] grid place-items-center text-[15px] font-semibold on-accent">Přidat se</div>
          </div>
        </div>
      </RamTelefonu>
    </div>
  );
}
