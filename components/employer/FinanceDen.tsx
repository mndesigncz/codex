'use client';

// Detail dne ve Financích: všechno finanční o jednom dni na jednom místě — tržba (a proti stejnému dni minulý
// týden), platby, hodiny, co se prodalo, obsluha, uzávěrky dne a výdaje dne z knihy výdajů. Otevírá se z widgetu
// Tržba po dnech (řádek dne, buňka kalendáře); šipkami se listuje dny.
//
// Žádný nový endpoint: den je /api/pos/daily?from=den&to=den, uzávěrky jsou /api/closings (stejná URL jako seznam
// Uzávěrek, jedna sdílená mezipaměť), výdaje jsou kniha z /api/finance?month. Každá část si hlídá svoje oprávnění
// a bez něj se nekreslí a její dotaz neodejde. Bez pokladny se tržba dne vezme z uzávěrek.
import { useMemo } from 'react';
import { Button, Chip, ErrorState, ListRow, Modal, Skeleton, Stat, StatRow } from '../ui';
import { useMoney } from '../CurrencyProvider';
import { useT } from '@/lib/i18n/client';
import { useDataWidgetu } from '../widgety/useDataWidgetu';
import { useNavigace, useSmi } from '../widgety/NavigaceKontext';
import { HodinyPokladny, ObsluhaPokladny, ProdanoPokladny } from './LiveRevenue';
import { urlFinanci, vyberDenniPokladnu, vyberFinance, zmenaProti } from '@/lib/financeWidgety';
import { denUzaverky, jeHlavni, maSkrytouTrzbu, rozdilUzaverky, type RadekUzaverky } from '@/lib/uzaverkyPrehled';
import { dayPlus, pragueToday } from '@/lib/pragueTime';
import { useLocale } from './jazyk';

function vyberSeznam(raw: any): RadekUzaverky[] {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.closings)) throw new Error('Uzávěrky přišly v nečekaném tvaru.'); // i18n-ok: překládá apiMessage
  return raw.closings;
}

const urlDne = (d: string) => `/api/pos/daily?from=${d}&to=${d}`;

function Cast({ nadpis, children }: { nadpis: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="t-label">{nadpis}</h3>
      {children}
    </section>
  );
}

export default function FinanceDen({ den, onDen, onClose }: { den: string; onDen: (d: string) => void; onClose: () => void }) {
  const t = useT('widgety');
  const loc = useLocale();
  const money = useMoney();
  const smi = useSmi();
  const nav = useNavigace();
  const dnes = pragueToday();
  const minuly = dayPlus(den, -7);

  const smiTrzby = smi('finance.trzby');
  const smiUzaverky = smi('uzaverky.zobrazit_vse');
  const smiFinance = smi('finance.zobrazit');
  const pos = useDataWidgetu(smiTrzby ? urlDne(den) : null, vyberDenniPokladnu);
  const pred = useDataWidgetu(smiTrzby ? urlDne(minuly) : null, vyberDenniPokladnu);
  const uz = useDataWidgetu(smiUzaverky ? '/api/closings' : null, vyberSeznam);
  const fin = useDataWidgetu(smiFinance ? urlFinanci(den.slice(0, 7)) : null, vyberFinance);

  const uzaverkyDne = useMemo(() => (uz.data ?? []).filter(c => denUzaverky(c) === den && jeHlavni(c)), [uz.data, den]);
  const vydajeDne = useMemo(() => (fin.data?.kniha ?? []).filter(r => r.date.slice(0, 10) === den), [fin.data, den]);
  const sVydaju = vydajeDne.reduce((s, r) => s + r.amount, 0);

  const p = pos.data;
  const zPokladny = !!p && p.propojeno;
  // Bez pokladny: tržba dne ze součtu uzávěrek (role bez tržby ji u uzávěrky nedostane vůbec).
  const trzbaUzaverek = uzaverkyDne.some(c => !maSkrytouTrzbu(c))
    ? uzaverkyDne.reduce((s, c) => s + (maSkrytouTrzbu(c) ? 0 : (Number(c.cash_revenue) || 0) + (Number(c.card_revenue) || 0)), 0) : null;
  const trzba = zPokladny ? p!.soucty.total : trzbaUzaverek;
  const minulaTrzba = pred.data?.propojeno ? pred.data.soucty.total : null;
  const zmena = trzba != null && minulaTrzba != null ? zmenaProti(trzba, minulaTrzba) : null;
  const nacita = (smiTrzby && pos.loading) || (!zPokladny && smiUzaverky && uz.loading);

  const datumVetou = new Date(`${den}T12:00:00`).toLocaleDateString(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dnyMinulyTyden = new Date(`${minuly}T12:00:00`).toLocaleDateString(loc, { weekday: 'long' });

  const kasa = zPokladny ? p!.soucty : null;
  const platby = kasa ? (kasa.methods.length ? kasa.methods : [
    { id: 'cash', label: t('Hotově'), amount: kasa.cash }, { id: 'card', label: t('Kartou'), amount: kasa.card }, { id: 'other', label: t('Jinak'), amount: kasa.other },
  ]).filter(m => m.amount > 0) : [];

  return (
    <Modal open onClose={onClose} size="lg" title={t('Finance dne')} subtitle={<span className="cz-sentence">{datumVetou}</span>}
      footer={<>
        <Button variant="secondary" icon="chevron" className="[&_svg]:rotate-90" onClick={() => onDen(dayPlus(den, -1))}>{t('Předchozí den')}</Button>
        <Button variant="secondary" iconAfter="chevronRight" disabled={den >= dnes} onClick={() => onDen(dayPlus(den, 1))}>{t('Další den')}</Button>
      </>}>
      <div className="space-y-5">
        {!smiTrzby && !smiUzaverky && !smiFinance && <p className="t-meta">{t('Na finance tohoto dne nemáš oprávnění.')}</p>}

        {nacita ? (
          <div className="space-y-2" aria-busy><Skeleton className="h-16" /><Skeleton className="h-24" /></div>
        ) : pos.error && smiTrzby ? (
          <ErrorState compact title={t('Pokladna se nenačetla')} detail={pos.error} onRetry={pos.reload} className="!py-4" />
        ) : (smiTrzby || smiUzaverky) && (
          <section aria-label={t('Tržba dne')}>
            {trzba == null ? <p className="t-meta">{t('Tržba za tenhle den není k dispozici.')}</p> : (
              <>
                <StatRow>
                  <Stat label={t('Tržba')} value={money(trzba)} note={zPokladny ? t('z pokladny') : t('z uzávěrek')} />
                  {kasa && <Stat label={t('Účtenek')} value={kasa.bills.toLocaleString(loc)} />}
                  {kasa && <Stat label={t('Průměrná účtenka')} value={money(kasa.avgBill)} />}
                  {kasa && <Stat label={t('Spropitné')} value={money(kasa.tips)} note={kasa.refundCount > 0 ? t('{n, plural, one {# vratka} few {# vratky} other {# vratek}}: {castka}', { n: kasa.refundCount, castka: money(kasa.refundTotal) }) : undefined} />}
                </StatRow>
                {zmena != null && (
                  <p className="t-meta mt-3 text-pretty">
                    <Chip tone={zmena >= 0 ? 'ok' : 'wait'} size="sm">{zmena > 0 ? '+' : ''}{zmena} %</Chip>{' '}
                    {t('proti stejnému dni minulý týden ({den})', { den: dnyMinulyTyden })}
                  </p>
                )}
                {!zPokladny && <p className="t-meta mt-2">{t('Pokladna není propojená, tržba je ze součtu uzávěrek dne.')}</p>}
              </>
            )}
          </section>
        )}

        {zPokladny && platby.length > 0 && (
          <Cast nadpis={t('Platby')}>
            <ul className="list">
              {platby.map(m => (
                <ListRow key={m.id} title={m.label}
                  value={<span className="tabular-nums">{money(m.amount)}</span>}
                  valueMeta={kasa && kasa.total > 0 ? `${Math.round((m.amount / kasa.total) * 100)} %` : undefined} />
              ))}
            </ul>
          </Cast>
        )}

        {zPokladny && p!.hodiny.some(v => v > 0) && (
          <Cast nadpis={t('Tržba po hodinách')}><HodinyPokladny hodiny={p!.hodiny} vyska={64} /></Cast>
        )}

        {zPokladny && p!.polozky.length > 0 && (
          <Cast nadpis={t('Co se prodalo')}><ProdanoPokladny polozky={p!.polozky} limit={8} razeni="trzba" /></Cast>
        )}

        {zPokladny && p!.obsluha.length > 0 && (
          <Cast nadpis={t('Obsluha')}><ObsluhaPokladny obsluha={p!.obsluha} celkem={p!.soucty.total} limit={6} /></Cast>
        )}

        {smiUzaverky && !uz.loading && (
          <Cast nadpis={t('Uzávěrky dne')}>
            {uz.error ? <ErrorState compact title={t('Uzávěrky se nenačetly')} detail={uz.error} onRetry={uz.reload} className="!py-3" />
              : uzaverkyDne.length === 0 ? <p className="t-meta">{den >= dnes ? t('Uzávěrka se píše na konci směny.') : t('Za tenhle den není uzávěrka.')}</p>
              : (
                <ul className="list">
                  {uzaverkyDne.map(c => {
                    const d = rozdilUzaverky(c);
                    const lide = (c.shiftEmployees?.length ? c.shiftEmployees.map(x => x.name) : [c.author_name ?? '']).filter(Boolean).join(' + ');
                    const tr = maSkrytouTrzbu(c) ? null : (Number(c.cash_revenue) || 0) + (Number(c.card_revenue) || 0);
                    return (
                      <ListRow key={c.id} as="li" title={<span>{c.shift_label ?? t('Uzávěrka')}</span>}
                        meta={[lide, tr != null ? t('tržba {castka}', { castka: money(tr) }) : ''].filter(Boolean).join(' · ')}
                        right={<>
                          {c.approved === false && <Chip tone="wait" size="sm">{t('Čeká na schválení')}</Chip>}
                          {d != null && <Chip tone={d === 0 ? 'ok' : d > 0 ? 'info' : 'bad'} size="sm">{d === 0 ? t('Sedí') : `${d > 0 ? '+' : ''}${money(d)}`}</Chip>}
                        </>} />
                    );
                  })}
                </ul>
              )}
            {nav.smiPohled('reports') && (
              <Button variant="ghost" size="sm" iconAfter="chevronRight" className="mt-1" onClick={() => { onClose(); nav.onNavigate('reports'); }}>{t('Otevřít Uzávěrky')}</Button>
            )}
          </Cast>
        )}

        {smiFinance && !fin.loading && (
          <Cast nadpis={t('Výdaje dne')}>
            {fin.error ? <ErrorState compact title={t('Kniha výdajů se nenačetla')} detail={fin.error} onRetry={fin.reload} className="!py-3" />
              : vydajeDne.length === 0 ? <p className="t-meta">{t('Za tenhle den nejsou v knize výdajů žádné záznamy.')}</p>
              : (
                <>
                  <ul className="list">
                    {vydajeDne.map((r, i) => (
                      <ListRow key={`${r.kind}-${r.receiptId ?? i}-${r.label}`} title={r.label} meta={r.note ?? undefined}
                        value={<span className="tabular-nums">{money(r.amount)}</span>} />
                    ))}
                  </ul>
                  <p className="t-meta text-right">{t('Výdaje celkem')}: <span className="font-semibold tabular-nums text-[#16181A]">{money(sVydaju)}</span></p>
                </>
              )}
          </Cast>
        )}
      </div>
    </Modal>
  );
}
