'use client';

// Náhled kuponu a promo kódu pohledem hosta: karta tak, jak ji uvidí na stránce
// podniku, a k ní co se stane, když se kupon nedá vzít (úroveň, okno hodin,
// 18+, vypnutý nebo koncept). Počítá stejné funkce jako stránka hosta
// (lib/kuponyPravidla), takže náhled nelže.

import { useState } from 'react';
import { Segmented, Input, Field, Well } from '../../ui';
import { useMoney } from '../../CurrencyProvider';
import { nahledKuponuHosta, nahledPromo } from '@/lib/kuponyPravidla';
import { pragueToday, pragueHM } from '@/lib/pragueTime';
import { TIER_OPTS } from './kuponyUi';

export default function KuponNahled({ radek, kompakt = false }: { radek: any; kompakt?: boolean }) {
  const money = useMoney();
  const [uroven, setUroven] = useState('bronze');
  const [cas, setCas] = useState('');
  const dnes = pragueToday();
  const hm = /^\d{2}:\d{2}$/.test(cas) ? cas : pragueHM();
  const n = nahledKuponuHosta(radek, { tierId: uroven, member: true }, { today: dnes, hm }, money);
  return (
    <Well pad="md" as="div" className="space-y-3" role="group" aria-label="Náhled kuponu pohledem hosta">
      <p className="t-label">Takhle ho uvidí host</p>
      <div className={`rounded-2xl bg-white/70 border border-black/[0.06] p-4 ${n.blocked ? 'opacity-70' : ''}`} data-testid="kupon-nahled-karta">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-semibold break-words">
              {n.title || 'Název kuponu'}
              {n.benefit && <span className="ml-2 rounded-full bg-[#C8F542]/25 text-[#3E5406] px-2 py-0.5 text-[11px] font-bold align-middle whitespace-nowrap">{n.benefit}</span>}
            </p>
            {n.description && <p className="text-sm text-black/55 text-pretty break-words">{n.description}</p>}
            {n.badges.length > 0 && <p className="text-xs text-black/45 mt-0.5 break-words">{n.badges.join(' · ')}</p>}
            {n.blocked && <p className="text-xs text-wait-ink mt-0.5" role="status">{n.blocked}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold tabular-nums">{n.costText}</p>
            <span className="mt-1 inline-block btn btn-primary btn-sm opacity-60 pointer-events-none" aria-hidden="true">Vzít</span>
          </div>
        </div>
      </div>
      {!kompakt && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0">
            <p className="field-label">Host má úroveň</p>
            <Segmented options={TIER_OPTS.map(t => ({ id: t.id, label: t.label }))} value={uroven} onChange={setUroven} size="sm" ariaLabel="Úroveň hosta v náhledu" />
          </div>
          <Field id="np-cas" label="Čas ukázky" hint="Prázdné = teď">
            <Input id="np-cas" type="time" className="!w-32" value={cas} onChange={e => setCas(e.target.value)} />
          </Field>
        </div>
      )}
    </Well>
  );
}

/** Co host uvidí a dostane po zadání promo kódu. */
export function PromoNahled({ code, title, points, couponTitle }: { code: string; title: string; points: number; couponTitle?: string | null }) {
  return (
    <Well pad="md" as="div" className="space-y-2" role="group" aria-label="Náhled promo kódu pohledem hosta">
      <p className="t-label">Takhle to uvidí host</p>
      <div className="rounded-2xl bg-white/70 border border-black/[0.06] p-4 space-y-2">
        <p className="text-sm font-semibold">Máš promo kód?</p>
        <div className="flex gap-2">
          <span className="field font-mono tracking-widest flex-1 min-w-0 truncate text-black/70">{code || 'KÓD'}</span>
          <span className="btn btn-primary opacity-60 pointer-events-none" aria-hidden="true">Uplatnit</span>
        </div>
        <p className="text-xs text-black/55 text-pretty" role="status">Po uplatnění: {nahledPromo({ title, points, coupon_title: couponTitle })}</p>
      </div>
    </Well>
  );
}
