'use client';

// Detail kuponu: přehled uplatnění (kdo, kdy, kolik utratil, obsluha, odkud se vzal,
// za jak dlouho se uplatnil, kolik jich propadlo, odhad slevy a ROI) a historie změn.
// CSV stáhne všechny řádky vydaných kódů kuponu.

import { useState } from 'react';
import { Button, Chip, EmptyState, ErrorState, Field, Input, ListRow, Modal, Segmented, Skeleton, Stat, StatRow, useLoad } from '../../ui';
import { useMoney } from '../../CurrencyProvider';
import { czCount } from '@/lib/czech';
import { stahni, kdyCesky, cislo } from './kuponyUi';
import { ZDROJ_POPISEK } from '@/lib/kuponyPravidla';

const KUS = { one: 'kód', few: 'kódy', many: 'kódů' };

export default function KuponDetail({ kupon, vychoziCast = 'prehled', onZavrit }: {
  kupon: { id: number; title: string }; vychoziCast?: 'prehled' | 'historie'; onZavrit: () => void;
}) {
  const money = useMoney();
  const [cast, setCast] = useState<'prehled' | 'historie'>(vychoziCast);
  const [od, setOd] = useState('');
  const [doDne, setDoDne] = useState('');
  const dotaz = `id=${kupon.id}${od ? `&od=${od}` : ''}${doDne ? `&do=${doDne}` : ''}`;
  const { data: p, error: chybaP, reload: znovuP } = useLoad<any>(cast === 'prehled' ? `/api/client/admin/coupons/prehled?${dotaz}` : null);
  const { data: h, error: chybaH, reload: znovuH } = useLoad<any>(cast === 'historie' ? `/api/client/admin/coupons/historie?id=${kupon.id}` : null);
  const s = p?.souhrn;

  return (
    <Modal open onClose={onZavrit} size="lg" title={kupon.title} subtitle="Uplatnění a historie změn"
      footer={<>
        {cast === 'prehled' && <Button variant="secondary" icon="download" onClick={() => stahni(`/api/client/admin/coupons/prehled?${dotaz}&export=csv`)}>Stáhnout CSV</Button>}
        <Button variant="primary" onClick={onZavrit}>Zavřít</Button>
      </>}>
      <div className="space-y-4">
        <Segmented options={[{ id: 'prehled', label: 'Uplatnění' }, { id: 'historie', label: 'Historie změn' }]} value={cast} onChange={v => setCast(v as 'prehled' | 'historie')} size="sm" ariaLabel="Část detailu kuponu" />
        {cast === 'prehled' && (
          <>
            <div className="grid grid-cols-2 gap-3 max-w-sm">
              <Field id="kd-od" label="Vydáno od"><Input id="kd-od" type="date" value={od} onChange={e => setOd(e.target.value)} /></Field>
              <Field id="kd-do" label="Vydáno do"><Input id="kd-do" type="date" value={doDne} onChange={e => setDoDne(e.target.value)} /></Field>
            </div>
            {chybaP ? <ErrorState title="Přehled se nenačetl" onRetry={znovuP} detail={chybaP} />
              : !p ? <Skeleton className="h-40" />
              : s.vydano === 0 ? <EmptyState icon="gift" compact title="Zatím nikdo" hint="Jakmile si host kupon vezme nebo mu ho pošleš, uvidíš to tady." />
              : (
                <>
                  <StatRow>
                    <Stat label="Vydáno" value={s.vydano} note={`${s.otevrene} čeká`} />
                    <Stat label="Uplatněno" value={s.uplatneno} note={s.miraUplatneni == null ? undefined : `${s.miraUplatneni} %`} />
                    <Stat label="Propadlo" value={s.propadlo} note="neuplatněné po platnosti" />
                    <Stat label="Doba do uplatnění" value={s.prumDnuDoUplatneni == null ? '—' : cislo(s.prumDnuDoUplatneni)} unit={s.prumDnuDoUplatneni == null ? undefined : 'd.'} note="průměr" />
                  </StatRow>
                  <StatRow>
                    <Stat label="Útrata s kuponem" value={money(s.utrata)} note={s.sUtratou ? `u ${czCount(s.sUtratou, KUS)}${s.prumUtrata != null ? `, průměr ${money(s.prumUtrata)}` : ''}` : 'obsluha ji zatím nezadala'} />
                    <Stat label="Odhad slevy" value={money(s.sleva)} note="jen % a pevná částka" />
                    <Stat label="Návratnost" value={s.roi == null ? '—' : `${cislo(s.roi)}×`} note={s.roi == null ? 'bez spočítatelné slevy' : 'útraty na 1 slevy'} />
                  </StatRow>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <p className="t-label mb-1">Odkud se vzal</p>
                      <div className="flex flex-wrap gap-1.5">{s.zdroje.map((z: any) => <Chip key={z.id} tone="muted" size="sm">{z.popisek}: {z.pocet}</Chip>)}</div>
                    </div>
                    <div>
                      <p className="t-label mb-1">Kdo uplatnil</p>
                      {s.obsluha.length ? <div className="flex flex-wrap gap-1.5">{s.obsluha.map((o: any) => <Chip key={o.jmeno} tone="muted" size="sm">{o.jmeno}: {o.pocet}</Chip>)}</div> : <p className="t-meta">Zatím nikdo.</p>}
                    </div>
                  </div>
                  <ul className="list" aria-label="Vydané kódy">
                    {p.radky.map((r: any) => (
                      <ListRow key={r.id} as="li"
                        title={<span className="flex items-center gap-2 min-w-0"><span className="truncate">{r.host}</span><span className="font-mono text-xs text-black/45">{r.code}</span></span>}
                        meta={[`vzal ${kdyCesky(r.claimedAt)}`, r.redeemedAt ? `uplatněno ${kdyCesky(r.redeemedAt)}` : null, r.obsluha ? `obsluha ${r.obsluha}` : null, r.zdroj ? ZDROJ_POPISEK[r.zdroj] : null].filter(Boolean).join(' · ')}
                        value={r.amount != null ? money(r.amount) : undefined}
                        actions={<Chip tone={r.redeemedAt ? 'ok' : r.propadlo ? 'muted' : 'wait'} size="sm">{r.redeemedAt ? 'Uplatněno' : r.propadlo ? 'Propadlo' : 'Čeká'}</Chip>} />
                    ))}
                  </ul>
                  {p.celkemRadku > p.radky.length && <p className="t-meta">Ukázáno {p.radky.length} z {p.celkemRadku}. Všechny řádky jsou v CSV.</p>}
                </>
              )}
          </>
        )}
        {cast === 'historie' && (
          chybaH ? <ErrorState title="Historie se nenačetla" onRetry={znovuH} detail={chybaH} />
            : !h ? <Skeleton className="h-40" />
            : h.historie.length === 0 ? <EmptyState icon="clock" compact title="Zatím bez záznamu" hint="Změny kuponu se zapisují od teď: kdo, kdy a co přepsal." />
            : (
              <ul className="list" aria-label="Historie změn kuponu">
                {h.historie.map((r: any) => (
                  <ListRow key={r.id} as="li" title={r.co} meta={`${r.kdo} · ${kdyCesky(r.kdy)}${r.detail ? ` — ${r.detail}` : ''}`} />
                ))}
              </ul>
            )
        )}
      </div>
    </Modal>
  );
}
