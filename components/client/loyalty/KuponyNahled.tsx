'use client';

// Náhled kuponu očima hosta: tak, jak ho uvidí na stránce podniku v části Věrnost.
// Čte stejný popisek výhody a štítky podmínek jako host (lib/kuponyPopisky), takže
// správce vidí, co se opravdu zobrazí, ještě než kupon uloží.

import { Chip, Well } from '../../ui';
import { useMoney } from '../../CurrencyProvider';
import { czDay } from '@/lib/clientSlots';
import { czCount, type CzNoun } from '@/lib/czech';
import { benefitLabel, conditionBadges, TIER_LABELS } from '@/lib/kuponyPopisky';
import { normalizujKupon } from '@/lib/kuponyPole';
import { jeNocniOkno } from '@/lib/kuponyPravidla';
import { pragueToday } from '@/lib/pragueTime';
import type { FormKupon } from './kuponyForm';

const BOD: CzNoun = { one: 'bod', few: 'body', many: 'bodů' };
const KUS: CzNoun = { one: 'kus', few: 'kusy', many: 'kusů' };

export default function KuponyNahled({ f, className = '' }: { f: FormKupon; className?: string }) {
  const money = useMoney();
  const c = normalizujKupon(f);
  const vyhoda = benefitLabel(c, money);
  const stitky = conditionBadges(c, money);
  const dnes = pragueToday();
  const poznamky: string[] = [];
  if (f.draft) poznamky.push('Koncept: hosté kupon zatím nevidí.');
  else if (c.valid_since && c.valid_since > dnes) poznamky.push(`Hosté ho uvidí šedě, platí až od ${czDay(c.valid_since)}.`);
  if (jeNocniOkno(c.hour_from, c.hour_till)) poznamky.push(`Platí přes půlnoc: od ${c.hour_from} do ${c.hour_till} následujícího dne.`);
  if (c.target_tiers.length) poznamky.push(`Vzít si ho smí jen: ${c.target_tiers.map(t => TIER_LABELS[t]).join(', ')}. Ostatní uvidí důvod.`);
  if (c.target_groups.length) poznamky.push('Vzít si ho smí jen vybrané skupiny hostů.');
  if (c.max_total) poznamky.push(`Celkem ${czCount(c.max_total, KUS)}; po rozebrání se ukáže „Kupony došly“.`);
  return (
    <Well className={className} aria-label="Náhled kuponu pro hosta">
      <p className="field-label">Takto ho uvidí host</p>
      <div className={`rounded-2xl bg-white/70 border border-black/[0.06] px-4 py-3.5 ${f.draft ? 'opacity-70' : ''}`}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-pretty">
              {c.title || <span className="text-black/40">Název kuponu</span>}
              {vyhoda && <span className="ml-2 rounded-full bg-[#C8F542]/25 text-[#3E5406] px-2 py-0.5 text-[11px] font-bold align-middle whitespace-nowrap">{vyhoda}</span>}
            </p>
            {c.description && <p className="text-sm text-black/55 text-pretty">{c.description}</p>}
            {(stitky.length > 0 || c.valid_until) && (
              <p className="text-xs text-black/45 mt-0.5">
                {[...stitky, c.valid_until ? `do ${czDay(c.valid_until)}` : null].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold tabular-nums">{c.cost_points === 0 ? 'zdarma' : czCount(c.cost_points, BOD)}</p>
            <span className="mt-1 inline-flex btn btn-primary btn-sm pointer-events-none" aria-hidden="true">Vzít</span>
          </div>
        </div>
      </div>
      {poznamky.length > 0 && (
        <ul className="mt-2.5 space-y-1">
          {poznamky.map(p => <li key={p} className="t-meta text-pretty">{p}</li>)}
        </ul>
      )}
      {f.welcome && <p className="mt-2"><Chip tone="info" size="sm">uvítací: nový člen ho dostane sám</Chip></p>}
    </Well>
  );
}
