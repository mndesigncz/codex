'use client';

// Poslat kupon hostům: vybraným členům (customerIds), skupině, segmentu nebo celému
// klubu. Zapojuje se do výběru členů (akce „Kupon vybraným“) i do katalogu kuponů
// („Poslat členům“, „Uvítací kupon pro stávající členy“). Hostovi přijde oznámení
// a kód má na své stránce; kdo už kupon drží, dostane se přeskočí, ne zdvojí.
//
// Použití u výběru členů:
//   <KuponyOdeslat customerIds={[12, 15]} jmeno="2 vybraní hosté" onZavrit={…} oznam={oznam} />

import { useState } from 'react';
import { Button, ErrorState, Field, Modal, Select, Skeleton, useLoad } from '../../ui';
import { czCount } from '@/lib/czech';
import { apiMessage } from '@/lib/api';
import { j } from './kuponyUi';

const HOST = { one: 'host', few: 'hosté', many: 'hostů' };

interface MoznostiKomu { celkem: number; skupiny: { id: number; name: string; members: number }[]; segmenty: { id: string; label: string; popis: string; pocet: number }[] }

export default function KuponyOdeslat({ customerIds, jmeno, couponId, zdroj = 'send', vychoziPublikum = 'all', onZavrit, oznam, onOdeslano }: {
  /** Konkrétní hosté (z výběru členů). Bez toho se vybírá publikum. */
  customerIds?: number[];
  /** Jak pojmenovat vybrané („Jana Nováková“, „3 vybraní hosté“). */
  jmeno?: string;
  /** Předvybraný kupon (z katalogu). */
  couponId?: number;
  /** `welcome`: uvítací kupon pro členy, kteří už v klubu jsou. */
  zdroj?: 'send' | 'welcome';
  vychoziPublikum?: string;
  onZavrit: () => void;
  oznam: (text: string, ton?: 'ok' | 'bad') => void;
  onOdeslano?: () => void;
}) {
  const vybrani = Array.isArray(customerIds);
  const { data: kupony, error: chybaKuponu, reload } = useLoad<any[]>('/api/client/admin/coupons', raw => (Array.isArray(raw?.coupons) ? raw.coupons.filter((c: any) => c.stav === 'aktivni' || c.stav === 'naplanovano') : []));
  const { data: moznosti } = useLoad<MoznostiKomu>(vybrani ? null : '/api/client/admin/coupons/send', raw => ({
    celkem: Number(raw?.celkem) || 0, skupiny: Array.isArray(raw?.skupiny) ? raw.skupiny : [], segmenty: Array.isArray(raw?.segmenty) ? raw.segmenty : [],
  }));
  const [kupon, setKupon] = useState<string>(couponId ? String(couponId) : '');
  const [publikum, setPublikum] = useState(vychoziPublikum);
  const [busy, setBusy] = useState(false);
  const [vysledek, setVysledek] = useState<string | null>(null);
  const [chyba, setChyba] = useState('');

  const vybranyKupon = kupony?.find(c => String(c.id) === kupon) ?? null;
  const pocetPublika = vybrani ? customerIds!.length
    : publikum === 'all' ? moznosti?.celkem ?? 0
    : publikum.startsWith('group:') ? moznosti?.skupiny.find(g => `group:${g.id}` === publikum)?.members ?? 0
    : moznosti?.segmenty.find(s => s.id === publikum)?.pocet ?? null;
  const komu = vybrani ? (jmeno || czCount(customerIds!.length, HOST))
    : publikum === 'all' ? 'všem členům'
    : publikum.startsWith('group:') ? `skupině ${moznosti?.skupiny.find(g => `group:${g.id}` === publikum)?.name ?? ''}`
    : (moznosti?.segmenty.find(s => s.id === publikum)?.label ?? 'vybranému segmentu').toLowerCase();

  const posli = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!vybranyKupon || busy || vysledek) return;
    setBusy(true); setChyba('');
    try {
      const body: any = { couponId: vybranyKupon.id, zdroj };
      if (vybrani) body.customerIds = customerIds; else body.audience = publikum;
      const r = await j('/api/client/admin/coupons/send', { method: 'POST', body: JSON.stringify(body) });
      setVysledek(r.veta); oznam(r.veta, r.odeslano > 0 ? 'ok' : 'bad'); onOdeslano?.();
    } catch (err) { setChyba(apiMessage(err, 'Kupon se nepodařilo poslat.')); }
    setBusy(false);
  };

  return (
    <Modal open onClose={onZavrit} size="sm" title={zdroj === 'welcome' ? 'Uvítací kupon pro stávající členy' : 'Poslat kupon'}
      subtitle={vybrani ? `Komu: ${jmeno || czCount(customerIds!.length, HOST)}` : undefined}
      footer={vysledek
        ? <Button variant="primary" onClick={onZavrit}>Hotovo</Button>
        : <>
          <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
          <Button type="submit" form="kupon-odeslat" variant="primary" icon="send" loading={busy} disabled={!vybranyKupon || pocetPublika === 0}>Poslat</Button>
        </>}>
      {chybaKuponu ? <ErrorState title="Kupony se nenačetly" onRetry={reload} detail={chybaKuponu} />
        : !kupony ? <Skeleton className="h-24" />
        : vysledek ? <p className="text-sm text-black/75 text-pretty" role="status" data-testid="kupon-odeslan">{vysledek}</p>
        : kupony.length === 0 ? <p className="text-sm text-black/65 text-pretty">Žádný kupon nejde rozeslat. Kupon musí být zveřejněný a zapnutý — koncept, archiv a vypnuté kupony host nedostane.</p>
        : (
          <form id="kupon-odeslat" onSubmit={posli} className="space-y-4">
            <Field id="ko-kupon" label="Kupon" hint="Jen zveřejněné a zapnuté kupony.">
              <Select id="ko-kupon" autoFocus={!couponId} value={kupon} onChange={e => setKupon(e.target.value)}>
                <option value="">Vyber kupon…</option>
                {kupony.map(c => <option key={c.id} value={c.id}>{c.title}{c.benefit ? ` — ${c.benefit}` : ''}</option>)}
              </Select>
            </Field>
            {!vybrani && (
              <Field id="ko-komu" label="Komu" hint={moznosti?.segmenty.find(s => s.id === publikum)?.popis ?? 'Respektuje cílení kuponu (úrovně, skupiny, 18+).'}>
                <Select id="ko-komu" value={publikum} onChange={e => setPublikum(e.target.value)}>
                  <option value="all">Všem členům ({moznosti?.celkem ?? '…'})</option>
                  {(moznosti?.skupiny.length ?? 0) > 0 && <optgroup label="Skupiny hostů">{moznosti!.skupiny.map(g => <option key={g.id} value={`group:${g.id}`}>{g.name} ({g.members})</option>)}</optgroup>}
                  {(moznosti?.segmenty.length ?? 0) > 0 && <optgroup label="Segmenty">{moznosti!.segmenty.map(s => <option key={s.id} value={s.id}>{s.label} ({s.pocet})</option>)}</optgroup>}
                </Select>
              </Field>
            )}
            {vybranyKupon && (
              <p className="t-meta text-pretty" aria-live="polite">
                Pošleš kupon „{vybranyKupon.title}“ {komu}{typeof pocetPublika === 'number' ? ` (${czCount(pocetPublika, HOST)})` : ''}.
                {pocetPublika === 0 ? ' V tomhle výběru nikdo není.' : ' Kdo ho už drží, dostane se přeskočí.'}
              </p>
            )}
            {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
          </form>
        )}
    </Modal>
  );
}
