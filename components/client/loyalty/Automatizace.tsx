'use client';

// Automatizace: zprávy, které odejdou samy. Každé pravidlo se zapíná a vypíná zvlášť, má svůj text s náhledem
// pohledem hosta, zkoušku sobě a deník odeslání. Texty jde psát se značkami {jmeno} a {podnik}.

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Chip, EmptyState, ErrorState, Field, Input, ListRow, Select, Skeleton, SwitchRow, Textarea, useLoad } from '../../ui';
import { czCount } from '@/lib/czech';
import {
  DEFINICE, ZASTUPNE_ZNACKY, ZNACKY_PRAVIDLA, STAVY_LOGU, MAX_KROKU_UVITANI, MAX_NADPIS, MAX_TEXT, MAX_DEN_UVITANI,
  vychoziKonfigurace, zpravaAutomatizace, shrnutiPravidla, type DruhAutomatizace,
} from '@/lib/automatizace';
import { apiMessage } from '@/lib/api';
import { dbTimeDayHM } from '@/lib/pragueTime';
import { BOD, DEN, j, type Hlaska } from './spolecne';
import NahledZpravy from './NahledZpravy';

interface Pravidlo { druh: DruhAutomatizace; enabled: boolean; config: any; enabled_at: string | null }
interface Kupon { id: number; title: string }

const POTVRZENI_PO_ULOZENI: Record<string, string> = {
  uvitani: 'Uvítací série je uložená.', prvni_navsteva: 'Zpráva po první návštěvě je uložená.', dokoncena_karta: 'Zpráva po dokončení karty je uložená.',
  narozeniny_kupon: 'Narozeninová zpráva je uložená.', chybis_nam: '„Chybíš nám“ je uložené.',
};

export default function Automatizace({ oznam, podnik = 'Tvůj podnik' }: { oznam: Hlaska; podnik?: string }) {
  const { data: d, error, reload } = useLoad<{ pravidla: Pravidlo[]; pocty: Record<string, { celkem: number; mesic: number }>; log: any[]; kupony: Kupon[]; muzePravidla: boolean }>(
    '/api/client/admin/automatizace',
    raw => ({ pravidla: Array.isArray(raw?.pravidla) && raw.pravidla.length ? raw.pravidla : (() => { throw new Error('Nastavení automatizací má nečekaný tvar.'); })(), pocty: raw?.pocty ?? {}, log: Array.isArray(raw?.log) ? raw.log : [], kupony: raw?.kupony ?? [], muzePravidla: raw?.muzePravidla === true }),
  );
  const [filtrLogu, setFiltrLogu] = useState('');
  if (error) return <ErrorState title="Automatizace se nenačetly" onRetry={reload} detail={error} />;
  if (!d) return <div className="space-y-4"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;
  const log = filtrLogu ? d.log.filter(l => l.kind === filtrLogu) : d.log;
  return (
    <div className="space-y-4 max-w-3xl">
      <p className="t-meta text-pretty">Zprávy, které odejdou samy, když se člen přidá, přijde poprvé, vysbírá kartu, slaví narozeniny nebo dlouho nechodí. Dostanou je členové, kteří souhlasili s novinkami. Kupon se připíše všem, zpráva jde jen těm se souhlasem. Pravidla platí pro členy od zapnutí, starším se nic nepřipomíná.</p>
      {DEFINICE.map(def => {
        const p = d.pravidla.find(x => x.druh === def.id);
        return p ? <PravidloKarta key={def.id} pravidlo={p} pocty={d.pocty[def.id]} kupony={d.kupony} muzePravidla={d.muzePravidla} oznam={oznam} podnik={podnik} onUlozeno={reload} /> : null;
      })}
      <Card pad="none" aria-labelledby="au-log">
        <div className="flex items-center gap-3 flex-wrap px-5 pt-4">
          <h2 id="au-log" className="t-card flex-1">Co odešlo</h2>
          <Select aria-label="Filtr deníku podle pravidla" className="!w-auto" value={filtrLogu} onChange={e => setFiltrLogu(e.target.value)}>
            <option value="">Všechna pravidla</option>
            {DEFINICE.map(x => <option key={x.id} value={x.id}>{x.nazev}</option>)}
          </Select>
        </div>
        {log.length === 0 ? (
          <div className="px-5 pb-5"><EmptyState icon="send" compact title="Zatím nic neodešlo" hint={filtrLogu ? 'Tohle pravidlo zatím nikomu nic neposlalo.' : 'Zapni první pravidlo výš. Jakmile se stane, co čeká, objeví se tu řádek s tím, komu a kdy zpráva odešla.'} /></div>
        ) : (
          <ul className="list px-5 pb-3">
            {log.map(l => (
              <ListRow key={l.id} title={l.name ?? 'Člen'}
                meta={[DEFINICE.find(x => x.id === l.kind)?.nazev ?? l.kind, dbTimeDayHM(l.created_at), l.channels ? (l.channels === 'push+email' ? 'oznámení i e-mail' : l.channels === 'email' ? 'e-mail' : 'oznámení') : null].filter(Boolean).join(' · ')}
                right={<Chip tone={l.status === 'odeslano' ? 'ok' : l.status === 'chyba' ? 'bad' : l.status === 'kupon_pripsan' ? 'info' : 'muted'} size="sm">{STAVY_LOGU[l.status] ?? l.status}</Chip>} />
            ))}
          </ul>
        )}
        <p className="t-meta px-5 pb-4">Posledních 40 odeslání. „Bez souhlasu“ znamená, že člen zprávy od podniků nechce; kupon, který k pravidlu patří, dostal i tak.</p>
      </Card>
    </div>
  );
}

function PravidloKarta({ pravidlo, pocty, kupony, muzePravidla, oznam, podnik, onUlozeno }: {
  pravidlo: Pravidlo; pocty?: { celkem: number; mesic: number }; kupony: Kupon[]; muzePravidla: boolean; oznam: Hlaska; podnik: string; onUlozeno: () => void;
}) {
  const def = DEFINICE.find(x => x.id === pravidlo.druh)!;
  const druh = pravidlo.druh;
  const [cfg, setCfg] = useState<any>(pravidlo.config);
  const [zapnuto, setZapnuto] = useState(pravidlo.enabled);
  const [krok, setKrok] = useState(0);
  const [ukladam, setUkladam] = useState(false);
  const [zkousim, setZkousim] = useState(false);
  // Po uložení z jiného místa (znovunačtení) se karta srovná se serverem.
  const podpis = JSON.stringify([pravidlo.enabled, pravidlo.config]);
  useEffect(() => { setCfg(pravidlo.config); setZapnuto(pravidlo.enabled); }, [podpis]); // eslint-disable-line react-hooks/exhaustive-deps
  const zmeneno = JSON.stringify(cfg) !== JSON.stringify(pravidlo.config);
  const znacky = [...ZASTUPNE_ZNACKY, ...(ZNACKY_PRAVIDLA[druh] ?? [])];
  const kroky: any[] = druh === 'uvitani' ? cfg.kroky ?? [] : [];
  const zdroj = druh === 'uvitani' ? kroky[Math.min(krok, Math.max(0, kroky.length - 1))] : cfg;
  const nahled = useMemo(
    () => zpravaAutomatizace(druh, cfg, { jmeno: 'Jana Nováková', podnik, dny: Number(cfg?.dny) || undefined, body: Number(cfg?.body_bodu) || 0 }, Math.min(krok, Math.max(0, kroky.length - 1))),
    [druh, cfg, podnik, krok, kroky.length],
  );
  const kupon = kupony.find(k => k.id === zdroj?.kuponId)?.title ?? null;

  const uloz = async (novyStav: boolean) => {
    setUkladam(true);
    try {
      await j('/api/client/admin/automatizace', { method: 'PUT', body: JSON.stringify({ druh, enabled: novyStav, config: cfg }) });
      setZapnuto(novyStav);
      oznam(novyStav === pravidlo.enabled ? POTVRZENI_PO_ULOZENI[druh] : novyStav ? `${def.nazev}: zapnuto.` : `${def.nazev}: vypnuto.`);
      onUlozeno();
    } catch (err) { oznam(apiMessage(err, 'Automatizaci se nepodařilo uložit.'), 'bad'); }
    setUkladam(false);
  };
  const zkouska = async () => {
    setZkousim(true);
    try {
      const r = await j('/api/client/admin/automatizace', { method: 'POST', body: JSON.stringify({ akce: 'test', druh, config: cfg, krok }) });
      const casti: string[] = [];
      if (r.push) casti.push('do aplikace');
      if (r.email) casti.push(r.email.sent ? `e-mailem na ${r.adresa}` : `e-mail se neodeslal: ${r.email.error ?? 'neznámá chyba'}`);
      oznam(`Zkouška ti odešla ${casti.join(' a ')}.`, r.email && !r.email.sent ? 'bad' : 'ok');
    } catch (err) { oznam(apiMessage(err, 'Zkoušku se nepodařilo poslat.'), 'bad'); }
    setZkousim(false);
  };
  const nastavZdroj = (zmena: any) => {
    if (druh !== 'uvitani') { setCfg({ ...cfg, ...zmena }); return; }
    const i = Math.min(krok, kroky.length - 1);
    setCfg({ ...cfg, kroky: kroky.map((k, idx) => (idx === i ? { ...k, ...zmena } : k)) });
  };
  const pridejKrok = () => {
    const pouzite = new Set(kroky.map(k => k.dny));
    let dny = 1; while (pouzite.has(dny) && dny <= MAX_DEN_UVITANI) dny += 1;
    setCfg({ ...cfg, kroky: [...kroky, { dny, title: '', body: '', kuponId: null }] });
    setKrok(kroky.length);
  };
  const odeberKrok = () => {
    const i = Math.min(krok, kroky.length - 1);
    setCfg({ ...cfg, kroky: kroky.filter((_, idx) => idx !== i) });
    setKrok(Math.max(0, i - 1));
  };
  const idp = `au-${druh}`;
  const vychozi = vychoziKonfigurace(druh);
  const profilovePole = druh === 'chybis_nam' || druh === 'narozeniny_kupon';

  return (
    <Card className="grid gap-4" aria-labelledby={`${idp}-h`}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h2 id={`${idp}-h`} className="t-card">{def.nazev}</h2>
          <p className="t-meta mt-0.5 text-pretty">{def.kdy}. {def.popis}</p>
        </div>
        <Chip tone={zapnuto ? 'ok' : 'muted'} size="sm">{shrnutiPravidla(druh, cfg, zapnuto)}</Chip>
      </div>
      <ul className="list">
        <SwitchRow title={zapnuto ? 'Zapnuto' : 'Vypnuto'} hint={pocty && pocty.celkem > 0 ? `Poslalo ${czCount(pocty.celkem, { one: 'zprávu', few: 'zprávy', many: 'zpráv' })}, z toho ${pocty.mesic} za posledních 30 dní.` : 'Zatím nic neposlalo.'}
          checked={zapnuto} disabled={ukladam} onChange={v => { void uloz(v); }} />
      </ul>

      {druh === 'uvitani' && (
        <div className="flex items-center gap-1.5 flex-wrap" role="tablist" aria-label="Zprávy uvítací série">
          {kroky.map((k, i) => (
            <button key={i} type="button" role="tab" aria-selected={i === krok} onClick={() => setKrok(i)}
              className={`filter-pill tap-target-sm ${i === krok ? 'seg-on' : 'seg-off glass'}`}>
              {k.dny === 0 ? 'Hned' : `Za ${czCount(k.dny, DEN)}`}
            </button>
          ))}
          {kroky.length < MAX_KROKU_UVITANI && <Button size="sm" variant="ghost" icon="plus" onClick={pridejKrok}>Přidat zprávu</Button>}
        </div>
      )}
      {druh === 'uvitani' && kroky.length === 0 && <EmptyState icon="mail" compact title="Série nemá žádnou zprávu" hint="Přidej první zprávu, třeba „Vítej“ hned po přidání." action={<Button size="sm" variant="secondary" icon="plus" onClick={pridejKrok}>Přidat zprávu</Button>} />}

      {zdroj && (
        <div className="grid gap-4">
          {druh === 'uvitani' && (
            <Field id={`${idp}-dny`} label="Za kolik dní po přidání" hint="0 = hned po vstupu do klubu. Další zprávy se posílají jednou denně ráno, takže přijdou do dne po termínu.">
              <Input id={`${idp}-dny`} type="number" inputMode="numeric" min={0} max={MAX_DEN_UVITANI} className="!w-28" value={zdroj.dny}
                onChange={e => nastavZdroj({ dny: Math.max(0, Math.min(MAX_DEN_UVITANI, Math.round(Number(e.target.value)) || 0)) })} />
            </Field>
          )}
          {druh === 'chybis_nam' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id={`${idp}-dny`} label="Po kolika dnech bez návštěvy" hint={muzePravidla ? 'Od 1 do 365. Člen dostane zprávu jednou za každou odmlku.' : 'Dny nastavuje ten, kdo spravuje pravidla věrnosti.'}>
                <Input id={`${idp}-dny`} type="number" inputMode="numeric" min={1} max={365} disabled={!muzePravidla} value={cfg.dny}
                  onChange={e => setCfg({ ...cfg, dny: Math.max(1, Math.min(365, Math.round(Number(e.target.value)) || 1)) })} />
              </Field>
              <Field id={`${idp}-body`} label="Dárkových bodů navíc" hint="0 = jen zpráva bez bodů.">
                <Input id={`${idp}-body`} type="number" inputMode="numeric" min={0} max={1000} disabled={!muzePravidla} value={cfg.body_bodu}
                  onChange={e => setCfg({ ...cfg, body_bodu: Math.max(0, Math.min(1000, Math.round(Number(e.target.value)) || 0)) })} />
              </Field>
            </div>
          )}
          {druh === 'narozeniny_kupon' && (
            <Field id={`${idp}-body`} label="Dárkových bodů k narozeninám" hint={muzePravidla ? '0 = jen kupon bez bodů. Body se připíšou i při vypnuté zprávě.' : 'Body nastavuje ten, kdo spravuje pravidla věrnosti.'}>
              <Input id={`${idp}-body`} type="number" inputMode="numeric" min={0} max={1000} className="!w-32" disabled={!muzePravidla} value={cfg.body_bodu}
                onChange={e => setCfg({ ...cfg, body_bodu: Math.max(0, Math.min(1000, Math.round(Number(e.target.value)) || 0)) })} />
            </Field>
          )}
          <Field id={`${idp}-title`} label="Nadpis" hint={`${String(zdroj.title ?? '').length} z ${MAX_NADPIS} znaků`}>
            <Input id={`${idp}-title`} maxLength={MAX_NADPIS} value={zdroj.title ?? ''} onChange={e => nastavZdroj({ title: e.target.value })} autoComplete="off" />
          </Field>
          <Field id={`${idp}-text`} label="Text" hint={`${String(zdroj.body ?? '').length} z ${MAX_TEXT} znaků. Značky: ${znacky.map(z => `${z.znacka} (${z.popis})`).join(', ')}.${(druh === 'chybis_nam' || druh === 'narozeniny_kupon') ? ' Dárkové body se k textu přidají samy, když nenapíšeš {body}.' : ''}`}>
            <Textarea id={`${idp}-text`} rows={3} maxLength={MAX_TEXT} value={zdroj.body ?? ''} onChange={e => nastavZdroj({ body: e.target.value })} />
          </Field>
          {(druh === 'uvitani' || druh === 'narozeniny_kupon' || druh === 'chybis_nam' || druh === 'prvni_navsteva' || druh === 'dokoncena_karta') && (
            <Field id={`${idp}-kupon`} label="Přiložený kupon" hint={kupony.length === 0 ? 'Kupon založíš ve Věrnosti, v části Kupony. Pak ho tu vybereš.' : 'Člen ho dostane mezi své kupony. Bez kuponu jde jen zpráva.'}>
              <Select id={`${idp}-kupon`} value={zdroj.kuponId ? String(zdroj.kuponId) : ''} onChange={e => nastavZdroj({ kuponId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">Bez kuponu</option>
                {kupony.map(k => <option key={k.id} value={String(k.id)}>{k.title}</option>)}
              </Select>
            </Field>
          )}
        </div>
      )}

      {zdroj && (
        <div className="grid gap-2">
          <p className="t-label">Jak to uvidí host</p>
          <NahledZpravy podnik={podnik} title={nahled?.title ?? ''} body={nahled?.body} kuponNazev={kupon} oznameni email />
          {profilovePole && Number(cfg.body_bodu) > 0 && <p className="t-meta">Dárek: {czCount(Number(cfg.body_bodu), BOD)}.</p>}
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center">
        <Button variant="primary" loading={ukladam} disabled={!zmeneno && zapnuto === pravidlo.enabled} onClick={() => { void uloz(zapnuto); }}>Uložit změny</Button>
        <Button variant="secondary" icon="mail" loading={zkousim} disabled={!nahled} onClick={() => { void zkouska(); }}>Poslat zkoušku sobě</Button>
        {druh === 'uvitani' && kroky.length > 0 && <Button variant="ghost" icon="trash" onClick={odeberKrok} aria-label="Odebrat tuto zprávu ze série">Odebrat zprávu</Button>}
        <Button variant="ghost" disabled={JSON.stringify(cfg) === JSON.stringify(vychozi)} onClick={() => setCfg({ ...vychozi, ...(profilovePole ? { dny: cfg.dny, body_bodu: cfg.body_bodu } : {}) })}>Vrátit výchozí text</Button>
        {zmeneno && <span className="t-meta" role="status">Neuložené změny</span>}
      </div>
    </Card>
  );
}
