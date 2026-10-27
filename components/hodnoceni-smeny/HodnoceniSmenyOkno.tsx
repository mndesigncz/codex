'use client';

// Okno „Ohodnotit směnu" — hodnocení směny jako celku (lib/hodnoceniSmeny.ts). Jedno pro celou aplikaci:
// otevírá se z detailu dne, rozvrhu, uzávěrky, docházky, úkolu, postupu, kalendáře hodnocení, okna
// hodnocení člověka i z oznámení po uzávěrce (TlacitkoHodnotitSmenu / HodnoceniSmenyHost).
//
// Telefon první (390 px): jeden sloupec, hlavní akce v patičce, body po lidech pod sebou.
// Body nejsou peníze — okno nemá žádné peněžní pole a kritika nic nekrátí (ZP § 346b); říká to i věta u bodů.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, ErrorState, Field, IconButton, Input, Modal, Select, Skeleton, SwitchRow, Textarea, VolbaRadek, VolbyRadky } from '../ui';
import { Icon } from '../Icons';
import { BodyVstup } from '../employer/BodyVstup';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { useLocale } from '../employer/jazyk';
import { okJson, apiMessage } from '@/lib/api';
import { pragueToday } from '@/lib/pragueTime';
import {
  BODY_MAX, BODY_MIN, KLIC_DEN, STITKY, dalsiStavStitku, jeDen, popisSmeny, soucetZmen, stejneVsem, vychoziSkupina, zmenyBodu,
  type IdStitku, type SkupinaSmeny, type Stitky,
} from '@/lib/hodnoceniSmeny';

interface Ulozene {
  id: number; den: string; klic: string; nazev: string | null; od: string | null; do: string | null;
  hvezdy: number; dobre: string | null; kritika: string | null; stitky: Stitky; kNaprave: boolean; foto: string | null;
  osadka: number[]; videli: number[]; body: { id: number; body: number; poznamka: string | null }[];
  kdo: string | null; upraveno: string | null;
}
interface DataDne {
  den: string;
  skupiny: SkupinaSmeny[];
  hodnoceni: Ulozene[];
  smiHodnotit: boolean;
  pripominat: boolean;
  clenove: { id: number; jmeno: string; avatar: string | null }[];
}

function vyberDen(raw: any): DataDne {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.skupiny)) throw new Error('Den přišel v nečekaném tvaru.'); // i18n-ok: překládá apiMessage
  return {
    den: String(raw.den), skupiny: raw.skupiny, hodnoceni: Array.isArray(raw.hodnoceni) ? raw.hodnoceni : [],
    smiHodnotit: raw.smiHodnotit === true, pripominat: raw.pripominat === true,
    clenove: Array.isArray(raw.clenove) ? raw.clenove : [],
  };
}

function Hvezdy({ value, onChange, disabled }: { value: number; onChange: (n: number) => void; disabled?: boolean }) {
  const t = useT('sprava');
  return (
    <div className="flex gap-1" role="group" aria-label={t('Hvězdy pro celou směnu')} data-hvezdy-smeny>
      {[1, 2, 3, 4, 5].map(i => (
        <button key={i} type="button" disabled={disabled} onClick={() => onChange(i === value ? 0 : i)}
          aria-label={t('{n} z 5', { n: i })} aria-pressed={i <= value}
          className="tap-target inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90 disabled:cursor-not-allowed">
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden fill={i <= value ? '#C8F542' : 'none'} stroke={i <= value ? '#8FB811' : 'currentColor'} strokeWidth="1.5" className={i <= value ? '' : 'text-black/25'}>
            <path d="m12 3 2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.2l1-5.8-4.2-4.1 5.9-.9L12 3Z" strokeLinejoin="round" />
          </svg>
        </button>
      ))}
    </div>
  );
}

const sZnamenkem = (n: number) => `${n > 0 ? '+' : ''}${n}`;

/** Název štítku směny (literály kvůli slovníkům — klíč je česká věta). */
function nazevStitku(t: PrekladFn, id: string): string {
  switch (id) {
    case 'cistota': return t('Čistota');
    case 'rychlost': return t('Rychlost');
    case 'hoste': return t('Obsluha hostů');
    case 'komunikace': return t('Komunikace');
    case 'priprava': return t('Příprava');
    case 'tym': return t('Týmová práce');
    case 'kasa': return t('Uzávěrka a kasa');
    default: return id;
  }
}

export default function HodnoceniSmenyOkno({ den: den0, klic: klic0, clovek, onClose, onUlozeno }: {
  den: string;
  /** Směna, kterou otevřít (`HH:MM-HH:MM` / `den`); jinak ta s `clovek`, jinak první. */
  klic?: string | null;
  /** Člověk, z jehož kontextu se okno otevřelo (úkol, postup, docházka) — vybere jeho směnu. */
  clovek?: number | null;
  onClose: () => void;
  onUlozeno?: () => void;
}) {
  const t = useT('sprava');
  const loc = useLocale();
  const dnes = pragueToday();
  const [den, setDen] = useState(jeDen(den0) ? den0 : dnes);
  const [data, setData] = useState<DataDne | null>(null);
  const [nacitani, setNacitani] = useState(true);
  const [chybaNacteni, setChybaNacteni] = useState<string | null>(null);
  const [klic, setKlic] = useState<string | null>(null);

  const [hvezdy, setHvezdy] = useState(0);
  const [dobre, setDobre] = useState('');
  const [kritika, setKritika] = useState('');
  const [stitky, setStitky] = useState<Stitky>({});
  const [kNaprave, setKNaprave] = useState(false);
  const [foto, setFoto] = useState<string | null>(null);
  const [osadka, setOsadka] = useState<number[]>([]);
  const [body, setBody] = useState<Record<number, number>>({});
  const [vsem, setVsem] = useState(0);
  const [rozpis, setRozpis] = useState(false);
  const [pripominat, setPripominat] = useState(false);

  const [nahled, setNahled] = useState(false);
  const [ukladam, setUkladam] = useState(false);
  const [mazu, setMazu] = useState<'ne' | 'ptam' | 'mazu'>('ne');
  const [nahravam, setNahravam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [hotovo, setHotovo] = useState<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const nahledRef = useRef<HTMLDivElement>(null);

  const nacti = useCallback(() => {
    if (!jeDen(den)) return;
    setNacitani(true); setChybaNacteni(null);
    fetch(`/api/hodnoceni-smeny?den=${den}`).then(okJson).then(raw => {
      const d = vyberDen(raw);
      setData(d);
      setPripominat(d.pripominat);
      setKlic(k => (k && d.skupiny.some(s => s.klic === k) ? k : vychoziSkupina(d.skupiny, { klic: klic0, clovek })));
    }).catch(e => setChybaNacteni(apiMessage(e, t('Směny dne se nenačetly.')))).finally(() => setNacitani(false));
  }, [den, klic0, clovek, t]);
  useEffect(() => { nacti(); }, [nacti]);

  const skupina = data?.skupiny.find(s => s.klic === klic) ?? null;
  const ulozene = data?.hodnoceni.find(h => h.klic === klic) ?? null;
  const smi = data?.smiHodnotit ?? false;

  // Výběr směny (nebo nově načtený den) naplní formulář: uložené hodnocení, jinak prázdné s osádkou podle rozvrhu.
  useEffect(() => {
    if (!data || !klic) return;
    const h = data.hodnoceni.find(x => x.klic === klic);
    const sk = data.skupiny.find(s => s.klic === klic);
    setHvezdy(h?.hvezdy ?? 0);
    setDobre(h?.dobre ?? '');
    setKritika(h?.kritika ?? '');
    setStitky(h?.stitky ?? {});
    setKNaprave(h?.kNaprave ?? false);
    setFoto(h?.foto ?? null);
    setOsadka(h ? h.osadka : (sk?.lide ?? []).map(l => l.id));
    setBody(Object.fromEntries((h?.body ?? []).map(b => [b.id, b.body])));
    setRozpis(!!h?.body.length);
    setVsem(0);
    setNahled(false); setChyba(null); setHotovo(null); setMazu('ne');
  }, [data, klic]);

  const jmeno = useCallback((id: number) => data?.clenove.find(c => c.id === id)?.jmeno
    ?? skupina?.lide.find(l => l.id === id)?.jmeno ?? `#${id}`, [data, skupina]);
  const avatar = (id: number) => data?.clenove.find(c => c.id === id)?.avatar ?? null;

  const noveBody = useMemo(() => osadka.map(id => ({ id, body: rozpis ? body[id] ?? 0 : 0 })).filter(x => x.body !== 0), [osadka, body, rozpis]);
  const zmeny = useMemo(() => (ulozene ? zmenyBodu(ulozene.body, noveBody) : []), [ulozene, noveBody]);
  const coUlozit = hvezdy > 0 || !!dobre.trim() || !!kritika.trim() || Object.keys(stitky).length > 0 || kNaprave || !!foto || noveBody.length > 0;

  const datumVetou = jeDen(den) ? new Date(`${den}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const nazevSkupiny = (s: SkupinaSmeny) => (s.klic === KLIC_DEN ? t('Celý den') : popisSmeny(s) ?? t('Směna'));

  const pridatClovek = (id: number) => { if (id && !osadka.includes(id)) setOsadka(o => [...o, id]); };
  const odebratClovek = (id: number) => { setOsadka(o => o.filter(x => x !== id)); setBody(b => { const n = { ...b }; delete n[id]; return n; }); };

  const nahrajFoto = async (f: File) => {
    setNahravam(true); setChyba(null);
    try {
      const { nahrajSoubor } = await import('@/lib/nahrajSoubor');
      const d = await nahrajSoubor(f).then(okJson);
      if (typeof d?.url === 'string') setFoto(d.url);
    } catch (e) {
      setChyba(apiMessage(e, t('Fotku se nepodařilo nahrát.')));
    } finally { setNahravam(false); }
  };

  const zmenPripominat = async (zap: boolean) => {
    setPripominat(zap);
    try {
      await fetch('/api/hodnoceni-smeny', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pripominat: zap }) }).then(okJson);
    } catch (e) {
      setPripominat(!zap);
      setChyba(apiMessage(e, t('Nastavení se nepodařilo uložit.')));
    }
  };

  const ulozit = async () => {
    if (!skupina || ukladam) return;
    if (!coUlozit) { setChyba(t('Dej hvězdy, napiš co bylo dobře nebo co příště jinak, nebo označ štítek.')); return; }
    // Zpětná změna bodů: nejdřív náhled, kdo o kolik přijde nebo získá; uloží až druhé klepnutí.
    if (ulozene && zmeny.length > 0 && !nahled) {
      setNahled(true);
      setTimeout(() => nahledRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30);
      return;
    }
    setUkladam(true); setChyba(null);
    try {
      await fetch('/api/hodnoceni-smeny', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          den, klic: skupina.klic, nazev: skupina.nazev, hvezdy, dobre, kritika, stitky, kNaprave, foto, osadka,
          body: noveBody.map(b => ({ id: b.id, body: b.body })),
        }),
      }).then(okJson);
      setHotovo(t('Hodnocení směny je uložené. Celá směna ho uvidí ve Zpětné vazbě.'));
      onUlozeno?.();
      nacti();
    } catch (e) {
      setChyba(apiMessage(e, t('Hodnocení směny se nepodařilo uložit.')));
    } finally { setUkladam(false); }
  };

  const smazat = async () => {
    if (!ulozene) return;
    if (mazu === 'ne') { setMazu('ptam'); return; }
    setMazu('mazu'); setChyba(null);
    try {
      await fetch(`/api/hodnoceni-smeny?id=${ulozene.id}`, { method: 'DELETE' }).then(okJson);
      onUlozeno?.();
      nacti();
    } catch (e) {
      setChyba(apiMessage(e, t('Hodnocení se nepodařilo smazat.')));
      setMazu('ne');
    }
  };

  const lidi = osadka.length;
  const tlacitko = ulozene
    ? (nahled ? t('Uložit se změnou bodů') : t('Uložit změny'))
    : lidi > 0 ? t('Uložit pro {n, plural, one {# člověka} few {# lidi} other {# lidí}}', { n: lidi }) : t('Uložit hodnocení');
  const mimoOsadku = (data?.clenove ?? []).filter(c => !osadka.includes(c.id));

  return (
    <Modal open onClose={onClose} size="md" title={t('Ohodnotit směnu')}
      subtitle={<span className="cz-sentence">{datumVetou}{skupina ? ` · ${nazevSkupiny(skupina)}` : ''}</span>}
      footer={smi ? <>
        <Button variant="secondary" onClick={onClose}>{t('Zavřít')}</Button>
        <Button variant="primary" onClick={ulozit} loading={ukladam} disabled={!skupina} data-ulozit-hodnoceni-smeny="">{tlacitko}</Button>
      </> : <Button variant="secondary" onClick={onClose}>{t('Zavřít')}</Button>}>
      <div className="space-y-5" data-okno-hodnoceni-smeny="">
        <Field id="hodnoceni-smeny-den" label={t('Den směny')}>
          <Input id="hodnoceni-smeny-den" type="date" value={den} max={dnes} onChange={e => { if (jeDen(e.target.value)) { setKlic(null); setDen(e.target.value); } }}
            className="appearance-none" style={{ WebkitAppearance: 'none' }} />
        </Field>

        {nacitani && !data ? (
          <div className="space-y-2" aria-busy><Skeleton className="h-14" /><Skeleton className="h-14" /><Skeleton className="h-32" /></div>
        ) : chybaNacteni ? (
          <ErrorState compact title={t('Směny dne se nenačetly')} detail={chybaNacteni} onRetry={nacti} />
        ) : data && (
          <>
            <VolbyRadky label={t('Která směna')} ariaLabel={t('Která směna')} data-vyber-smeny="">
              {data.skupiny.map(s => {
                const h = data.hodnoceni.find(x => x.klic === s.klic);
                return (
                  <VolbaRadek key={s.klic} vybrano={s.klic === klic} onClick={() => setKlic(s.klic)} data-smena={s.klic}
                    titul={<>
                      <span className="block">{nazevSkupiny(s)}</span>
                      <span className="block text-[13px] font-normal opacity-70 [overflow-wrap:anywhere]">
                        {s.lide.length ? s.lide.map(l => l.jmeno.split(' ')[0]).join(', ') : t('Bez lidí v rozvrhu')}
                      </span>
                    </>}
                    hodnota={h ? <span className="inline-flex items-center gap-1 text-[13px]"><Icon name="check" size={14} />{h.hvezdy ? `${h.hvezdy}/5` : t('Ohodnoceno')}</span> : undefined} />
                );
              })}
            </VolbyRadky>

            {ulozene && (
              <p className="t-meta" data-ulozene-hodnoceni="">
                {t('Ohodnoceno')}{ulozene.kdo ? ` · ${ulozene.kdo}` : ''}{ulozene.videli.length ? ` · ${t('potvrdilo {n} z {z}', { n: ulozene.videli.length, z: ulozene.osadka.length })}` : ''}
              </p>
            )}

            <div>
              <p className="field-label">{t('Celkové hodnocení směny')}</p>
              <Hvezdy value={hvezdy} onChange={setHvezdy} disabled={!smi} />
            </div>

            <Field id="hodnoceni-smeny-dobre" label={t('Co bylo dobře')}>
              <Textarea id="hodnoceni-smeny-dobre" rows={2} value={dobre} disabled={!smi} maxLength={1000}
                onChange={e => setDobre(e.target.value)} placeholder={t('Pochvala pro celou směnu…')} />
            </Field>
            <Field id="hodnoceni-smeny-kritika" label={t('Co příště jinak')} hint={t('Kritika směny. Uvidí ji všichni, kdo na směně byli.')}>
              <Textarea id="hodnoceni-smeny-kritika" rows={2} value={kritika} disabled={!smi} maxLength={1000}
                onChange={e => setKritika(e.target.value)} placeholder={t('Co se nepovedlo a jak to udělat příště…')} />
            </Field>

            <div>
              <p className="field-label" id="stitky-smeny">{t('Štítky')}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-labelledby="stitky-smeny" data-stitky-smeny="">
                {STITKY.map(s => {
                  const stav = stitky[s.id as IdStitku];
                  const nazev = nazevStitku(t, s.id);
                  return (
                    <button key={s.id} type="button" disabled={!smi} data-stitek={s.id} data-stav={stav ?? 'nic'}
                      aria-label={stav === 'plus' ? t('{stitek}: dobře', { stitek: nazev }) : stav === 'minus' ? t('{stitek}: k nápravě', { stitek: nazev }) : nazev}
                      onClick={() => setStitky(st => { const n = { ...st }; const d = dalsiStavStitku(n[s.id as IdStitku]); if (d) n[s.id as IdStitku] = d; else delete n[s.id as IdStitku]; return n; })}
                      className={`tap-target flex min-h-11 min-w-0 items-center gap-1.5 rounded-[var(--r-md)] px-3 text-left text-sm font-medium leading-tight transition-colors disabled:cursor-not-allowed ${stav === 'plus' ? 'chip-ok' : stav === 'minus' ? 'chip-bad' : 'btn-secondary'}`}>
                      <Icon name={stav === 'plus' ? 'check' : stav === 'minus' ? 'warning' : 'plus'} size={15} className="shrink-0" />
                      <span className="min-w-0 [overflow-wrap:anywhere]">{nazev}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-xs text-black/50">{t('Klepni jednou = dobře, podruhé = k nápravě, potřetí = nic.')}</p>
            </div>

            <SwitchRow as="div" title={t('Směna k nápravě')} checked={kNaprave} onChange={setKNaprave} disabled={!smi}
              hint={t('Celá směna uvidí kritiku nahoře ve Zpětné vazbě a potvrdí, že ji četla.')} />

            <div>
              <p className="field-label">{t('Fotka')}</p>
              {foto ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={foto} alt={t('Fotka ze směny')} className="h-16 w-16 rounded-[var(--r-sm)] object-cover" />
                  {smi && <Button variant="ghost" size="sm" icon="trash" onClick={() => setFoto(null)}>{t('Odebrat fotku')}</Button>}
                </div>
              ) : smi ? (
                <Button variant="secondary" icon="camera" loading={nahravam} onClick={() => fotoRef.current?.click()}>{t('Přidat fotku')}</Button>
              ) : <p className="t-meta">{t('Bez fotky.')}</p>}
              <input ref={fotoRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={e => {
                const f = e.target.files?.[0]; e.target.value = '';
                if (f) void nahrajFoto(f);
              }} />
            </div>

            <section className="space-y-3" aria-label={t('Body pro lidi')} data-rozpis-bodu="">
              <SwitchRow as="div" title={t('Body pro lidi')} checked={rozpis} onChange={setRozpis} disabled={!smi}
                hint={t('Volitelné. Každému ze směny zvlášť, i záporné. Body nejsou peníze — hodnocení směny nekrátí mzdu.')} />
              {rozpis && (
                <div className="well space-y-3 p-3.5">
                  {lidi > 1 && smi && (
                    <div className="flex flex-wrap items-center gap-2" data-stejne-vsem="">
                      <span className="text-sm font-medium text-[#16181A]">{t('Stejně všem')}</span>
                      <span className="ml-auto inline-flex items-center gap-2">
                        <BodyVstup id="hodnoceni-smeny-vsem" value={vsem} min={BODY_MIN} max={BODY_MAX} onChange={setVsem} popis={t('Body všem')} />
                        <Button size="sm" variant="secondary" onClick={() => setBody(Object.fromEntries(stejneVsem(osadka, vsem).map(x => [x.id, x.body])))}>{t('Dát všem')}</Button>
                      </span>
                    </div>
                  )}
                  <ul className="space-y-3">
                    {osadka.map(id => {
                      const b = body[id] ?? 0;
                      return (
                        <li key={id} className="flex flex-wrap items-center gap-x-3 gap-y-2" data-clovek-bodu={id}>
                          <span className="flex min-w-0 flex-1 basis-40 items-center gap-2">
                            <Avatar emoji={avatar(id)} name={jmeno(id)} size="sm" />
                            <span className="min-w-0 truncate text-sm font-medium text-[#16181A]">{jmeno(id)}</span>
                            {b < 0 && <span className="shrink-0 text-xs text-bad-ink">{t('srážka')}</span>}
                          </span>
                          <span className="ml-auto inline-flex items-center gap-1">
                            <BodyVstup id={`hodnoceni-smeny-body-${id}`} value={b} min={BODY_MIN} max={BODY_MAX}
                              onChange={n => setBody(x => ({ ...x, [id]: n }))} popis={t('Body pro {jmeno}', { jmeno: jmeno(id) })} />
                            {smi && <IconButton icon="close" size="sm" aria-label={t('Odebrat {jmeno} ze směny', { jmeno: jmeno(id) })} onClick={() => odebratClovek(id)} />}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                  {lidi === 0 && <p className="t-meta">{t('Na směně zatím nikdo není — přidej lidi níž.')}</p>}
                  {smi && mimoOsadku.length > 0 && (
                    <Select aria-label={t('Přidat člověka na směnu')} value="" onChange={e => pridatClovek(Number(e.target.value))}>
                      <option value="">{t('+ Přidat člověka (zaskočil)')}</option>
                      {mimoOsadku.map(c => <option key={c.id} value={c.id}>{c.jmeno}</option>)}
                    </Select>
                  )}
                </div>
              )}
            </section>

            {nahled && zmeny.length > 0 && (
              <div ref={nahledRef} className="note note-wait space-y-1" role="status" data-nahled-zmen="">
                <p className="font-semibold">{t('Změní se body: celkem {c} b', { c: sZnamenkem(soucetZmen(zmeny)) })}</p>
                <ul className="text-[13px] tabular-nums">
                  {zmeny.map(z => <li key={z.id}>{jmeno(z.id)}: {sZnamenkem(z.pred)} → {sZnamenkem(z.po)} b</li>)}
                </ul>
                <p className="text-[13px]">{t('Klepni znovu na „Uložit se změnou bodů", nebo body uprav.')}</p>
              </div>
            )}

            {smi && (
              <SwitchRow as="div" title={t('Po uzávěrce připomenout ohodnocení směny')} checked={pripominat} onChange={zmenPripominat}
                hint={t('Pravidlo podniku, výchozí vypnuté. Kdo smí hodnotit, dostane po každé uzávěrce oznámení s odkazem sem.')} />
            )}

            {ulozene && smi && (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant={mazu === 'ptam' ? 'danger-solid' : 'ghost'} size="sm" icon="trash" loading={mazu === 'mazu'} onClick={smazat}>
                  {mazu === 'ne' ? t('Smazat hodnocení směny') : t('Opravdu smazat i body z něj')}
                </Button>
                {mazu === 'ptam' && <Button variant="ghost" size="sm" onClick={() => setMazu('ne')}>{t('Nechat')}</Button>}
              </div>
            )}
          </>
        )}

        {hotovo && <p className="note note-ok" role="status" data-hodnoceni-ulozeno="">{hotovo}</p>}
        {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
      </div>
    </Modal>
  );
}
