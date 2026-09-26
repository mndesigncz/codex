'use client';

// Detail podniku a všechny zásahy, které správce platformy umí. Každý
// zásah je jedno tlačítko s jasným důsledkem; ten nevratný (pozastavení)
// jde přes okno s důvodem, který uvidí majitel — nesmí se stát omylem
// a nesmí přijít bez vysvětlení.

import { useState } from 'react';
import { useLoad, PageHeader, Stat, StatRow, ListRow, Chip, Button, Field, Input, Textarea, Modal, Section, ErrorState, PageSkeleton, EmptyState, Segmented, type SegmentedOption } from '@/components/ui';
import { czCount } from '@/lib/czech';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { apiMessage } from '@/lib/api';
import { PLAN_NAMES } from '@/lib/plan';
import { STAV_NAZEV, STAV_TON, ROLE_NAZEV, ZASAH_NAZEV, zasah, iniciala, type Detail } from './spolecne';

type Tarif = 'stripe' | 'free' | 'pro' | 'max';
const TARIFY: SegmentedOption<Tarif>[] = [
  { id: 'stripe', label: 'Podle Stripe' }, { id: 'free', label: 'Zdarma' }, { id: 'pro', label: 'Pro' }, { id: 'max', label: 'Max' },
];

export default function Podnik({ id }: { id: number }) {
  const d = useLoad<Detail>(Number.isFinite(id) ? `/api/admin/teams/${id}` : null, r => r as Detail);
  const [chyba, setChyba] = useState<string | null>(null);
  const [bezi, setBezi] = useState<string | null>(null);
  const [blokOkno, setBlokOkno] = useState(false);
  const [duvod, setDuvod] = useState('');
  const [dny, setDny] = useState('14');
  const [poznamka, setPoznamka] = useState<string | null>(null);

  // Jeden průchod pro všechny zásahy: zamknout tlačítka, poslat, nahradit
  // detail tím, co vrátil server. Chyba zůstane vidět, dokud nezmizí
  // dalším úspěšným zásahem — a rozepsaný důvod se při ní nezahodí.
  const proved = async (co: string, url: string, body: unknown, po?: () => void) => {
    setBezi(co); setChyba(null);
    try { d.set(await zasah(url, body)); po?.(); }
    catch (e) { setChyba(apiMessage(e, 'Zásah se nepovedl.')); }
    finally { setBezi(null); }
  };

  if (!Number.isFinite(id)) return <ErrorState title="Neplatná adresa podniku" hint="V adrese chybí číslo podniku." />;
  if (d.error) return <ErrorState title="Podnik se nenačetl" detail={d.error} onRetry={d.reload} />;
  if (d.loading || !d.data) return <PageSkeleton tiles={3} />;

  const { team: t, members, zasahy } = d.data;
  const zamek = bezi !== null;
  const tarif: Tarif = t.plan.override ?? 'stripe';
  const api = (cesta: string) => `/api/admin/teams/${t.id}/${cesta}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.name}
        subtitle={<span className="flex flex-wrap items-center gap-2"><Chip tone={STAV_TON[t.stav]} size="sm">{STAV_NAZEV[t.stav]}</Chip><span>{t.owner ? `${t.owner.name ?? ''} · ${t.owner.email ?? ''}` : 'bez majitele'}</span><span className="t-meta">id {t.id}</span></span>}
        primary={t.blockedAt
          ? <Button variant="accent" disabled={zamek} onClick={() => proved('unblock', api('block'), { blocked: false })}>Obnovit podnik</Button>
          : <Button variant="danger" disabled={zamek} onClick={() => { setChyba(null); setBlokOkno(true); }}>Pozastavit podnik</Button>}
      />

      {chyba && <p className="note note-danger" role="alert">{chyba}</p>}

      {t.blockedAt && (
        <div className="note note-danger">
          <p className="font-semibold">Pozastavený od {dbTimeDayHM(t.blockedAt)}</p>
          <p className="mt-1">Důvod, který podnik vidí: {t.blockedReason ?? '—'}</p>
        </div>
      )}

      <StatRow>
        <Stat label="Tarif" value={t.planLabel} icon="award" tone={t.plan.effective === 'free' ? 'muted' : 'ok'} note={t.plan.override ? `ve Stripe: ${PLAN_NAMES[t.plan.plan]}` : undefined} />
        <Stat label="Členů" value={t.members} icon="users" />
        <Stat label="Předplatné" value={t.subscriptionStatus ?? 'bez Stripe'} icon="card" tone={t.plan.pastDue ? 'wait' : 'muted'} />
        <Stat label="Poslední aktivita" value={t.lastActivity ? dbTimeDayHM(t.lastActivity) : '—'} icon="clock" />
        <Stat label="Založeno" value={t.createdAt ? dbTimeDayHM(t.createdAt) : '—'} icon="calendar" />
      </StatRow>

      <Section title="Tarif" hint="Ruční tarif přebije Stripe i zkušební dobu. Uložený tarif ze Stripe se nemění, jen se překryje — kdykoli se dá vrátit.">
        <Segmented options={TARIFY} value={tarif} ariaLabel="Ruční tarif" size="sm"
          onChange={v => proved('plan', api('plan'), { plan: v === 'stripe' ? null : v })} />
      </Section>

      <Section title="Zkušební doba" hint={`Jen pro podniky na tarifu Zdarma bez karty. ${t.plan.trialing ? `Teď běží, ${czCount(t.plan.trialDaysLeft, { one: 'den', few: 'dny', many: 'dní' })} do konce.` : 'Teď neběží.'} Zkušební dobu s kartou vede Stripe.`}>
        <form className="flex flex-col sm:flex-row sm:items-end gap-3" onSubmit={e => { e.preventDefault(); proved('trial', api('trial'), { days: Number(dny) }); }}>
          <Field id="dny" label="O kolik dní" className="sm:w-40">
            <Input id="dny" type="number" inputMode="numeric" min={1} max={365} value={dny} onChange={e => setDny(e.target.value)} required />
          </Field>
          <Button type="submit" variant="secondary" disabled={zamek || !(Number(dny) >= 1 && Number(dny) <= 365)}>Prodloužit</Button>
        </form>
      </Section>

      <Section title="Poznámka správce" hint="Interní, podnik ji nevidí.">
        <form className="space-y-3" onSubmit={e => { e.preventDefault(); proved('note', api('note'), { note: poznamka ?? t.adminNote ?? '' }, () => setPoznamka(null)); }}>
          <Field id="poznamka" label="Poznámka">
            <Textarea id="poznamka" rows={3} maxLength={2000} value={poznamka ?? t.adminNote ?? ''} onChange={e => setPoznamka(e.target.value)} placeholder="Např. domluvená sleva, kontakt na účetní, co bylo řešeno…" />
          </Field>
          <div className="flex justify-end">
            <Button type="submit" variant="secondary" disabled={zamek || poznamka === null || poznamka === (t.adminNote ?? '')}>Uložit poznámku</Button>
          </div>
        </form>
      </Section>

      <Section title={`Členové · ${members.length}`}>
        {members.length === 0 ? <EmptyState compact icon="users" title="Bez členů" /> : (
          <div className="card p-2 sm:p-3">
            {members.map(m => (
              <ListRow key={m.id}
                lead={<span className="h-9 w-9 rounded-full bg-black/[0.06] grid place-items-center text-xs font-bold" aria-hidden>{iniciala(m.name)}</span>}
                title={m.name} meta={m.email}
                right={<Chip tone={m.role === 'employer' ? 'ink' : 'muted'} size="sm">{ROLE_NAZEV[m.role] ?? m.role}</Chip>} />
            ))}
          </div>
        )}
      </Section>

      <Section title="Zásahy u tohohle podniku">
        {zasahy.length === 0 ? <EmptyState compact icon="archive" title="Zatím žádný zásah" /> : (
          <div className="card p-2 sm:p-3">
            {zasahy.map(x => (
              <ListRow key={x.id} title={ZASAH_NAZEV[x.action] ?? x.action} meta={x.detail ?? undefined}
                right={<span className="flex items-center gap-2"><Chip tone={x.actor === 'api-token' ? 'info' : 'muted'} size="sm">{x.actor === 'api-token' ? 'MCP / skript' : x.actor}</Chip><span className="t-meta whitespace-nowrap">{x.createdAt ? dbTimeDayHM(x.createdAt) : '—'}</span></span>} />
            ))}
          </div>
        )}
      </Section>

      <Modal open={blokOkno} onClose={() => setBlokOkno(false)} title={`Pozastavit ${t.name}?`}
        subtitle="Všichni lidé podniku se do aplikace nedostanou a hostovská stránka zmizí. Projeví se do 30 sekund. Kdykoli jde obnovit."
        footer={<>
          <Button variant="ghost" type="button" onClick={() => setBlokOkno(false)} disabled={zamek}>Zrušit</Button>
          <Button variant="danger-solid" type="submit" form="blok-form" disabled={zamek || duvod.trim().length < 3}>Pozastavit podnik</Button>
        </>}>
        <form id="blok-form" onSubmit={e => { e.preventDefault(); proved('block', api('block'), { blocked: true, reason: duvod }, () => { setBlokOkno(false); setDuvod(''); }); }}>
          <Field id="duvod" label="Důvod, který uvidí majitel" hint="Piš pro něj, ne pro sebe — a napiš, kam se má ozvat.">
            <Textarea id="duvod" rows={3} maxLength={300} value={duvod} onChange={e => setDuvod(e.target.value)} required autoFocus
              placeholder="Např. Neuhrazená faktura za srpen. Ozvěte se na fakturace@managero.app a účet obnovíme." />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
