'use client';

// Rezervace → Osa stolů (kolo 92, audit C §7 „Rezervace dostanou časovou osu stolů", koncept B „G",
// reference SevenRooms / Toast Tables / ResyOS): jeden den jako mřížka stoly × hodiny.
//  - nahoře obsazenost po hodinách (osoby na stolech / místa celkem) — kdy je plno, kdy volno;
//  - řádek = stůl (místa), blok = rezervace (čas, host, osob), barva = stav;
//  - čára „teď" u dnešního dne; rezervace bez stolu mají vlastní řádek nahoře, ať je vidět, co přidělit;
//  - klepnutí na blok = přidělit / změnit stůl (stejné okno jako ze seznamu).
// Délku rezervace data nemají: blok má pevné 2 hodiny (DELKA_MIN) a legenda to říká — je to
// zobrazení, ne údaj o hostovi. Na telefonu se osa posouvá do strany, názvy stolů zůstávají.

import { Chip } from '../../ui';
import { czCount, type CzNoun } from '@/lib/czech';
import type { Rezervace, Stul } from '@/lib/klientPrehled';

const DELKA_MIN = 120;
/** Nejmenší šířka hodiny: na monitoru se osa roztáhne na celou kartu, na telefonu se posouvá. */
const HODINA_MIN_PX = 48;
const OSOBA: CzNoun = { one: 'os.', few: 'os.', many: 'os.' };

const minuty = (hm: string) => { const [h, m] = hm.split(':').map(Number); return (h || 0) * 60 + (m || 0); };

const TON: Record<string, string> = {
  requested: 'bg-[var(--wait-bg)] text-[var(--wait-ink)] shadow-[inset_0_0_0_1.5px_var(--wait-ink)]',
  confirmed: 'bg-white text-[#16181A] shadow-[inset_0_0_0_1px_rgba(22,24,26,0.18)]',
  seated: 'bg-[#16181A] text-white',
  done: 'bg-black/[0.06] text-black/50',
  no_show: 'bg-[var(--bad-bg)] text-[var(--bad-ink)]',
};

export default function OsaRezervaci({ rezervace, stoly, den, dnes, ted, onStul }: {
  rezervace: Rezervace[]; stoly: Stul[]; den: string; dnes: string; ted: string;
  onStul: (r: Rezervace) => void;
}) {
  const zive = rezervace.filter(r => r.datum === den && !['declined', 'cancelled'].includes(r.stav));
  const casy = zive.map(r => minuty(r.cas));
  const od = Math.max(6, Math.min(...casy, 17 * 60) / 60 - 1) | 0;
  const doH = Math.min(24, Math.max(...casy.map(c => c + DELKA_MIN), 21 * 60) / 60 + 0.99) | 0;
  const hodiny = Array.from({ length: Math.max(1, doH - od) }, (_, i) => od + i);
  const rozpeti = hodiny.length * 60;
  /** Poloha v procentech šířky osy. */
  const x = (min: number) => ((min - od * 60) / rozpeti) * 100;
  const sloupec = 100 / hodiny.length;
  const bezStolu = zive.filter(r => r.stulId == null || !stoly.some(s => s.id === r.stulId));
  const radky: { id: string; nazev: string; mist: number | null; rez: Rezervace[] }[] = [
    ...(bezStolu.length ? [{ id: 'bez', nazev: 'Bez stolu', mist: null, rez: bezStolu }] : []),
    ...stoly.map(s => ({ id: String(s.id), nazev: s.nazev, mist: s.mist, rez: zive.filter(r => r.stulId === s.id) })),
  ];
  const mist = stoly.reduce((a, s) => a + (s.mist || 0), 0);
  const obsazeno = hodiny.map(h => {
    const osob = zive.filter(r => r.stav !== 'no_show' && minuty(r.cas) < (h + 1) * 60 && minuty(r.cas) + DELKA_MIN > h * 60).reduce((a, r) => a + r.osob, 0);
    return { h, osob, podil: mist > 0 ? Math.min(1, osob / mist) : 0 };
  });
  const maxOsob = Math.max(1, ...obsazeno.map(o => o.osob));
  const tedX = den === dnes ? x(minuty(ted)) : null;
  return (
    <div className="space-y-3" data-osa-rezervaci>
      <div className="flex flex-wrap items-center gap-1.5 text-[13px]" aria-label="Legenda osy">
        <Chip tone="wait" size="sm">čeká na potvrzení</Chip>
        <Chip tone="muted" size="sm">potvrzeno</Chip>
        <Chip tone="ink" size="sm">usazeno</Chip>
        <span className="t-meta">· blok = 2 hodiny</span>
      </div>
      <div className="overflow-x-auto scrollbar-thin -mx-1 px-1">
        <div className="relative min-w-0" style={{ minWidth: hodiny.length * HODINA_MIN_PX + 120 }}>
          {/* Obsazenost po hodinách: sloupek = podíl míst, číslo = osob. */}
          <div className="flex pl-[120px]" aria-label={`Obsazenost po hodinách z ${mist} míst`} role="img">
            {obsazeno.map(o => (
              <div key={o.h} className="flex flex-col items-start justify-end gap-1" style={{ width: `${sloupec}%`, height: 64 }}
                title={`${o.h}:00 · ${czCount(o.osob, { one: 'osoba', few: 'osoby', many: 'osob' })} z ${mist} míst`}>
                {o.osob > 0 && <span className="t-meta tabular-nums leading-none">{o.osob}</span>}
                <span className={`w-[70%] rounded-[6px] ${o.podil >= 0.85 ? 'bg-[var(--bad-ink)]' : o.osob > 0 ? 'bg-[#16181A]' : 'bg-black/10'}`} style={{ height: Math.max(3, Math.round((o.osob / maxOsob) * 40)) }} />
              </div>
            ))}
          </div>
          <div className="flex pl-[120px] border-b border-black/[0.08]">
            {hodiny.map(h => <span key={h} className="t-meta tabular-nums py-1" style={{ width: `${sloupec}%` }}>{h}:00</span>)}
          </div>
          <ul>
            {radky.map(rd => (
              <li key={rd.id} className="relative flex items-stretch border-b border-black/[0.06] min-h-[52px]">
                <div className="sticky left-0 z-10 w-[120px] shrink-0 bg-[var(--surface)] pr-3 py-2">
                  <p className="text-[14px] font-medium leading-tight truncate">{rd.nazev}</p>
                  {rd.mist != null && <p className="t-meta">{rd.mist} míst</p>}
                </div>
                <div className="relative flex-1 min-w-0">
                  {hodiny.map((h, i) => <span key={h} aria-hidden className="absolute top-0 bottom-0 border-l border-black/[0.05]" style={{ left: `${i * sloupec}%` }} />)}
                  {rd.rez.map(r => {
                    const l = x(minuty(r.cas));
                    return (
                      <button key={r.id} type="button" onClick={() => onStul(r)}
                        aria-label={`${r.cas} ${r.host}, ${r.osob} osob${r.stul ? `, ${r.stul}` : ', bez stolu'} — změnit stůl`}
                        className={`absolute top-1.5 bottom-1.5 rounded-[10px] px-2 text-left overflow-hidden tap-target-sm ${TON[r.stav] ?? TON.confirmed}`}
                        style={{ left: `calc(${l}% + 2px)`, width: `calc(${(DELKA_MIN / rozpeti) * 100}% - 4px)` }}>
                        <span className="block text-[13px] font-semibold leading-tight truncate">{r.host}</span>
                        <span className="block text-[12px] leading-tight opacity-80 tabular-nums truncate">{r.cas} · {r.osob} {OSOBA.many}</span>
                      </button>
                    );
                  })}
                </div>
              </li>
            ))}
          </ul>
          {tedX != null && tedX >= 0 && tedX <= 100 && (
            <span aria-hidden className="absolute top-16 bottom-0 w-0.5 bg-[var(--bad-ink)] pointer-events-none" style={{ left: `calc(120px + (100% - 120px) * ${tedX / 100})` }} />
          )}
        </div>
      </div>
    </div>
  );
}
