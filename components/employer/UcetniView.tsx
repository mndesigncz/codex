'use client';

// Pro účetní — všechno, co účetní potřebuje za měsíc, na jedno klepnutí.
//
// Martin: „export účtenek a dalších podobných věcí pro účetní, aby to bylo co nejjednodušší,
// i přímo těch fotek." Stránka:
//  - období: měsíc (výchozí minulý — za ten se podklady posílají) nebo vlastní od–do (nejvýš rok);
//  - náhled: počty a součty (účtenky, příjemky, uzávěrky, tržby z pokladny, fotky) a co je potřeba
//    dořešit (účtenka bez fotky, neschválená uzávěrka…) — GET /api/ucetni/prehled;
//  - akce: „Stáhnout ZIP pro účetní" (GET /api/ucetni/export — tabulky CSV, sešit XLSX a fotky),
//    „Poslat účetní" (e-mail s odkazem) a „Zkopírovat odkaz (14 dní)" (účetní bez účtu);
//  - nastavení účetní: e-mail, automaticky každý měsíc (3. den za minulý), přiložit výplaty
//    (jen s finance.mzdy) a „Zneplatnit všechny odkazy".
// Celé jen s finance.exportovat (KLICE_POHLEDU v EmployerLayout); stažení, odkaz a e-mail jsou v tarifu Pro.

import { useEffect, useState } from 'react';
import {
  Button, Card, ErrorState, Field, Input, Modal, PageHeader, Section, Segmented, Skeleton, Stat, StatRow, SwitchRow, Toast,
} from '../ui';
import { Icon } from '../Icons';
import { useMoney } from '../CurrencyProvider';
import { usePlan, UpgradeModal } from '../Pro';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { apiMessage, okJson } from '@/lib/api';
import { pragueToday } from '@/lib/pragueTime';
import { jeObalKlient, ulozZAdresy } from '@/lib/stahni';
import { minulyMesic, obdobiMesice, overObdobi, type Souhrn, type Varovani } from '@/lib/ucetniExport';

interface Prehled {
  od: string; do: string; mena: string; smiMzdy: boolean; sMzdami: boolean; nazevSouboru: string;
  podnik: { nazev: string; ico: string | null; dic: string | null };
  pocty: { uctenky: number; prijemky: number; uzaverky: number; dnyPokladny: number; vyplaty: number | null };
  souhrn: Souhrn;
}
interface Nastaveni { email: string; auto: boolean; mzdy: boolean; posledni: string | null; denAutomatu: number; smiMzdy: boolean; ico: string | null; dic: string | null }

const URL_NASTAVENI = '/api/ucetni/nastaveni';
const dotaz = (od: string, doD: string, mzdy: boolean) => `od=${od}&do=${doD}${mzdy ? '&mzdy=1' : ''}`;

export default function UcetniView() {
  const t = useT('sprava');
  const money = useMoney();
  const { pro } = usePlan();
  const dnes = pragueToday();
  const [rezim, setRezim] = useState<'mesic' | 'vlastni'>('mesic');
  const [mesic, setMesic] = useState(() => minulyMesic(dnes));
  const vychozi = obdobiMesice(minulyMesic(dnes))!;
  const [vlastniOd, setVlastniOd] = useState(vychozi.od);
  const [vlastniDo, setVlastniDo] = useState(vychozi.do);
  const obdobi = rezim === 'mesic' ? obdobiMesice(mesic) : { od: vlastniOd, do: vlastniDo };
  const platne = obdobi ? overObdobi(obdobi.od, obdobi.do) : null;
  const chybaObdobi = !obdobi ? t('Vyber měsíc.')
    : !obdobi.od || !obdobi.do ? t('Vyplň obě data.')
    : obdobi.do < obdobi.od ? t('Konec období je před jeho začátkem.')
    : !platne?.ok ? t('Období může být nejvýš jeden rok.') : null;

  const [nastaveni, setNastaveni] = useState<Nastaveni | null>(null);
  const [chybaNastaveni, setChybaNastaveni] = useState<string | null>(null);
  const [mzdy, setMzdy] = useState(false);
  const [prehled, setPrehled] = useState<Prehled | null>(null);
  const [chybaPrehledu, setChybaPrehledu] = useState<string | null>(null);
  const [nacitam, setNacitam] = useState(false);
  const [znovu, setZnovu] = useState(0);
  const [zprava, setZprava] = useState<{ text: string; tone: 'ok' | 'bad' } | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [odkaz, setOdkaz] = useState<{ url: string; vyprsi: string } | null>(null);
  const [pracuji, setPracuji] = useState<'stahnout' | 'poslat' | 'odkaz' | null>(null);

  // Nastavení účetní (e-mail, automat, výplaty) — jednou při otevření.
  const nactiNastaveni = async () => {
    setChybaNastaveni(null);
    try {
      const d = await fetch(URL_NASTAVENI).then(okJson) as Nastaveni;
      setNastaveni(d);
      setMzdy(d.smiMzdy && d.mzdy);
    } catch (e) { setChybaNastaveni(apiMessage(e, t('Nastavení účetní se nenačetlo.'))); }
  };
  useEffect(() => { void nactiNastaveni(); /* jednou */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Náhled za období (bez fotek — jen počty a součty).
  const klic = platne?.ok ? dotaz(platne.od, platne.do, mzdy) : null;
  useEffect(() => {
    if (!klic) { setPrehled(null); return; }
    let zruseno = false;
    setNacitam(true); setChybaPrehledu(null);
    fetch(`/api/ucetni/prehled?${klic}`).then(okJson)
      .then(d => { if (!zruseno) setPrehled(d as Prehled); })
      .catch(e => { if (!zruseno) { setPrehled(null); setChybaPrehledu(apiMessage(e, t('Náhled se nenačetl.'))); } })
      .finally(() => { if (!zruseno) setNacitam(false); });
    return () => { zruseno = true; };
  }, [klic, znovu, t]);

  const smiMzdy = nastaveni?.smiMzdy === true;
  const stahnout = async () => {
    if (!pro) { setUpgrade(true); return; }
    if (!platne?.ok) return;
    const url = `/api/ucetni/export?${dotaz(platne.od, platne.do, mzdy)}`;
    setPracuji('stahnout');
    // V aplikaci (obal) se soubor uloží přes sdílení; v prohlížeči ho stáhne prohlížeč sám (proud, bez čekání v paměti).
    if (jeObalKlient()) {
      const r = await ulozZAdresy(url, prehled?.nazevSouboru ?? 'ucetni-podklady.zip');
      if (r === 'nejde') setZprava({ text: t('Podklady se nepodařilo stáhnout. Zkus to znovu.'), tone: 'bad' });
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = prehled?.nazevSouboru ?? '';
      document.body.appendChild(a); a.click(); a.remove();
      setZprava({ text: t('Stahování začalo — fotky se přidávají postupně, u velkého měsíce to chvíli trvá.'), tone: 'ok' });
    }
    setPracuji(null);
  };
  const poslat = async () => {
    if (!pro) { setUpgrade(true); return; }
    if (!platne?.ok) return;
    setPracuji('poslat');
    try {
      const d = await fetch('/api/ucetni/poslat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ od: platne.od, do: platne.do, mzdy }) }).then(okJson);
      setZprava({ text: t('Odesláno účetní na {email}.', { email: String(d?.komu ?? nastaveni?.email ?? '') }), tone: 'ok' });
    } catch (e) { setZprava({ text: apiMessage(e, t('E-mail účetní se nepodařilo odeslat.')), tone: 'bad' }); }
    setPracuji(null);
  };
  const zkopirovatOdkaz = async () => {
    if (!pro) { setUpgrade(true); return; }
    if (!platne?.ok) return;
    setPracuji('odkaz');
    try {
      const d = await fetch('/api/ucetni/odkaz', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ od: platne.od, do: platne.do, mzdy }) }).then(okJson);
      setOdkaz({ url: String(d.url), vyprsi: String(d.vyprsi) });
      let zkopirovano = false;
      try { await navigator.clipboard.writeText(String(d.url)); zkopirovano = true; } catch { /* schránka nedostupná — odkaz je vidět v poli */ }
      setZprava({ text: zkopirovano ? t('Odkaz je ve schránce. Platí 14 dní.') : t('Odkaz je připravený níž — zkopíruj ho ručně.'), tone: 'ok' });
    } catch (e) { setZprava({ text: apiMessage(e, t('Odkaz se nepodařilo vytvořit.')), tone: 'bad' }); }
    setPracuji(null);
  };

  return (
    <div className="px-4 min-[360px]:px-5 pt-3 pb-4 sm:p-6 max-w-5xl mx-auto space-y-6" data-ucetni="">
      <PageHeader title={t('Pro účetní')} hintId="ucetniview"
        subtitle={t('Účtenky, příjemky, uzávěrky a tržby za období v jednom ZIPu — i s fotkami dokladů.')} />

      <Card className="space-y-4" aria-labelledby="ucetni-obdobi">
        <h2 id="ucetni-obdobi" className="t-card">{t('Období')}</h2>
        <Segmented size="sm" ariaLabel={t('Období')} value={rezim} onChange={setRezim}
          options={[{ id: 'mesic', label: t('Měsíc') }, { id: 'vlastni', label: t('Vlastní období') }]} />
        {rezim === 'mesic' ? (
          <Field id="ucetni-mesic" label={t('Měsíc')} error={chybaObdobi ?? undefined}>
            <Input id="ucetni-mesic" type="month" value={mesic} max={dnes.slice(0, 7)} onChange={e => setMesic(e.target.value)} />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field id="ucetni-od" label={t('Od')}><Input id="ucetni-od" type="date" value={vlastniOd} max={dnes} onChange={e => setVlastniOd(e.target.value)} /></Field>
            <Field id="ucetni-do" label={t('Do')} error={chybaObdobi ?? undefined}><Input id="ucetni-do" type="date" value={vlastniDo} max={dnes} onChange={e => setVlastniDo(e.target.value)} /></Field>
          </div>
        )}
        {smiMzdy && (
          <ul className="list">
            <SwitchRow title={t('Přiložit výplaty')} hint={t('Zapsané výplaty a výplaty z kasy se jmény. Bez nich jsou v podkladech jen součty.')} checked={mzdy} onChange={setMzdy} />
          </ul>
        )}
      </Card>

      <Card className="space-y-4" aria-labelledby="ucetni-nahled" aria-busy={nacitam}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 id="ucetni-nahled" className="t-card">{t('Co účetní dostane')}</h2>
          {prehled && <p className="t-meta tabular-nums">{prehled.od} – {prehled.do}</p>}
        </div>
        {chybaPrehledu ? (
          <ErrorState compact vlevo title={chybaPrehledu} onRetry={() => setZnovu(n => n + 1)} />
        ) : !prehled ? (
          chybaObdobi ? <p className="t-meta">{chybaObdobi}</p> : <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-10" /></div>
        ) : (
          <NahledPodkladu p={prehled} money={money} />
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button variant="accent" size="lg" icon="download" loading={pracuji === 'stahnout'} disabled={!platne?.ok || !!pracuji} onClick={() => void stahnout()} data-akce="stahnout">
            {t('Stáhnout ZIP pro účetní')}
          </Button>
          <Button variant="secondary" size="lg" icon="send" loading={pracuji === 'poslat'} disabled={!platne?.ok || !!pracuji || !nastaveni?.email} onClick={() => void poslat()} data-akce="poslat">
            {t('Poslat účetní')}
          </Button>
          <Button variant="secondary" size="lg" icon="copy" loading={pracuji === 'odkaz'} disabled={!platne?.ok || !!pracuji} onClick={() => void zkopirovatOdkaz()} data-akce="odkaz">
            {t('Zkopírovat odkaz (14 dní)')}
          </Button>
        </div>
        {nastaveni && !nastaveni.email && <p className="t-meta">{t('Poslat účetní půjde po vyplnění jejího e-mailu níž.')}</p>}
        {odkaz && (
          <Field id="ucetni-odkaz" label={t('Odkaz pro účetní')} hint={t('Funguje bez přihlášení do {datum}. Nikomu dalšímu ho neposílej.', { datum: odkaz.vyprsi.slice(0, 10) })}>
            <Input id="ucetni-odkaz" readOnly value={odkaz.url} onFocus={e => e.currentTarget.select()} />
          </Field>
        )}
      </Card>

      <NastaveniUcetni nastaveni={nastaveni} chyba={chybaNastaveni} onZnovu={() => void nactiNastaveni()}
        onUlozeno={(n, text) => { setNastaveni(n); if (!n.smiMzdy) setMzdy(false); setZprava({ text, tone: 'ok' }); }}
        onChyba={text => setZprava({ text, tone: 'bad' })} />

      <Toast message={zprava?.text ?? null} tone={zprava?.tone} onClose={() => setZprava(null)} />
      {upgrade && <UpgradeModal feature={t('Export pro účetní')} onClose={() => setUpgrade(false)} />}
    </div>
  );
}

function NahledPodkladu({ p, money }: { p: Prehled; money: (n: number) => string }) {
  const t = useT('sprava');
  const s = p.souhrn;
  const prazdne = p.pocty.uctenky + p.pocty.prijemky + p.pocty.uzaverky + p.pocty.dnyPokladny === 0;
  return (
    <div className="space-y-4">
      <StatRow>
        <Stat label={t('Účtenky')} value={String(p.pocty.uctenky)} note={money(s.uctenky.soucet)} icon="receipt" />
        <Stat label={t('Příjemky')} value={String(p.pocty.prijemky)} note={money(s.prijemky.soucet)} icon="box" />
        <Stat label={t('Uzávěrky')} value={String(p.pocty.uzaverky)} note={money(s.uzaverky.celkem)} icon="trend" />
        <Stat label={t('Fotky dokladů')} value={String(s.fotky.celkem)} icon="camera" />
      </StatRow>
      {prazdne && <p className="t-meta">{t('Za tohle období v aplikaci nejsou žádné doklady. ZIP bude obsahovat jen prázdné tabulky.')}</p>}
      {(s.uzaverky.pocet > 0 || s.pokladna) && (
        <ul className="list" aria-label={t('Tržby')}>
          {s.uzaverky.pocet > 0 && (
            <li className="py-2 flex items-baseline justify-between gap-3">
              <span className="text-sm">{t('Tržby podle uzávěrek — hotově / kartou')}</span>
              <span className="tabular-nums text-sm font-medium whitespace-nowrap">{money(s.uzaverky.hotove)} / {money(s.uzaverky.kartou)}</span>
            </li>
          )}
          {s.pokladna && (
            <li className="py-2 flex items-baseline justify-between gap-3">
              <span className="text-sm">{t('Tržby z pokladny')}</span>
              <span className="tabular-nums text-sm font-medium whitespace-nowrap">{money(s.pokladna.celkem)}</span>
            </li>
          )}
          {s.pokladna?.dph.map(x => (
            <li key={x.sazba} className="py-2 flex items-baseline justify-between gap-3">
              <span className="text-sm">{t('DPH {sazba} %', { sazba: String(x.sazba).replace('.', ',') })}</span>
              <span className="tabular-nums text-sm font-medium whitespace-nowrap">{money(x.dph)}</span>
            </li>
          ))}
          {s.vyplaty && (
            <li className="py-2 flex items-baseline justify-between gap-3">
              <span className="text-sm">{t('Výplaty (zapsané a z kasy)')}</span>
              <span className="tabular-nums text-sm font-medium whitespace-nowrap">{money(s.vyplaty.soucet + s.uzaverky.vyplatyZKasy)}</span>
            </li>
          )}
        </ul>
      )}
      {s.varovani.length > 0 && (
        <div className="note note-wait space-y-1" role="status" data-varovani="">
          <p className="font-medium flex items-center gap-2"><Icon name="warning" size={16} />{t('Před odesláním se vyplatí dořešit')}</p>
          <ul className="list-disc pl-5 text-sm">
            {s.varovani.map(v => <li key={v.kod}>{textVarovani(v, t)}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function textVarovani(v: Varovani, t: PrekladFn): string {
  const n = v.pocet;
  switch (v.kod) {
    case 'uctenky_bez_fotky': return t('{n, plural, one {# účtenka nemá fotku} few {# účtenky nemají fotku} other {# účtenek nemá fotku}}', { n });
    case 'uctenky_bez_castky': return t('{n, plural, one {# účtenka nemá částku} few {# účtenky nemají částku} other {# účtenek nemá částku}}', { n });
    case 'prijemky_bez_ceny': return t('{n, plural, one {# příjemka nemá cenu} few {# příjemky nemají cenu} other {# příjemek nemá cenu}}', { n });
    case 'prijemky_bez_dokladu': return t('{n, plural, one {# příjemka nemá číslo dokladu ani fotku} few {# příjemky nemají číslo dokladu ani fotku} other {# příjemek nemá číslo dokladu ani fotku}}', { n });
    case 'uzaverky_neschvalene': return t('{n, plural, one {# uzávěrka čeká na schválení} few {# uzávěrky čekají na schválení} other {# uzávěrek čeká na schválení}}', { n });
    case 'fotky_chybi': return t('{n, plural, one {# fotka se nedá přiložit} few {# fotky se nedají přiložit} other {# fotek se nedá přiložit}}', { n });
  }
}

function NastaveniUcetni({ nastaveni, chyba, onZnovu, onUlozeno, onChyba }: {
  nastaveni: Nastaveni | null; chyba: string | null; onZnovu: () => void;
  onUlozeno: (n: Nastaveni, text: string) => void; onChyba: (text: string) => void;
}) {
  const t = useT('sprava');
  const [email, setEmail] = useState('');
  const [ukladam, setUkladam] = useState<string | null>(null);
  const [zneplatnit, setZneplatnit] = useState(false);
  useEffect(() => { if (nastaveni) setEmail(nastaveni.email); }, [nastaveni]);

  const uloz = async (zmena: Record<string, unknown>, co: string, text: string) => {
    setUkladam(co);
    try {
      const d = await fetch(URL_NASTAVENI, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(zmena) }).then(okJson) as Nastaveni;
      onUlozeno(d, text);
    } catch (e) { onChyba(apiMessage(e, t('Nastavení se nepodařilo uložit.'))); }
    setUkladam(null);
  };

  return (
    <Section title={t('Účetní')} hint={t('Kam podklady chodí a jestli automaticky.')}>
      <Card className="space-y-4">
        {chyba ? <ErrorState compact vlevo title={chyba} onRetry={onZnovu} /> : !nastaveni ? <Skeleton className="h-24" /> : (
          <>
            <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={e => { e.preventDefault(); void uloz({ email }, 'email', t('E-mail účetní uložen.')); }}>
              <Field id="ucetni-email" label={t('E-mail účetní')} className="flex-1">
                <Input id="ucetni-email" type="email" inputMode="email" autoComplete="email" value={email} placeholder={t('např. ucetni@firma.cz')}
                  onChange={e => setEmail(e.target.value)} />
              </Field>
              <Button type="submit" variant="secondary" loading={ukladam === 'email'} disabled={!!ukladam || email.trim() === nastaveni.email}>{t('Uložit')}</Button>
            </form>
            <ul className="list">
              <SwitchRow title={t('Posílat automaticky každý měsíc')}
                hint={t('{den}. den v měsíci ráno přijde účetní e-mail s odkazem na podklady za minulý měsíc.', { den: nastaveni.denAutomatu })}
                checked={nastaveni.auto} disabled={!!ukladam || (!nastaveni.email && !nastaveni.auto)}
                onChange={v => void uloz({ auto: v }, 'auto', v ? t('Podklady budou chodit automaticky.') : t('Automatické posílání vypnuto.'))} />
              <SwitchRow title={t('Přiložit výplaty k automatickému e-mailu')}
                hint={nastaveni.smiMzdy ? t('Výplaty se jmény lidí. Bez nich jsou v podkladech jen součty z kasy.') : t('Zapnout může jen ten, kdo vidí mzdy.')}
                checked={nastaveni.mzdy} disabled={!!ukladam || (!nastaveni.smiMzdy && !nastaveni.mzdy)}
                onChange={v => void uloz({ mzdy: v }, 'mzdy', v ? t('Výplaty se budou přikládat.') : t('Výplaty se přikládat nebudou.'))} />
            </ul>
            {nastaveni.posledni && <p className="t-meta">{t('Naposledy automaticky odesláno za {mesic}.', { mesic: nastaveni.posledni })}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="danger" size="sm" icon="lock" disabled={!!ukladam} onClick={() => setZneplatnit(true)}>{t('Zneplatnit všechny odkazy')}</Button>
              <p className="t-meta flex-1 min-w-[12rem]">{t('Odkazy, které už účetní má, přestanou fungovat. Nové půjde poslat hned.')}</p>
            </div>
          </>
        )}
      </Card>
      <Modal open={zneplatnit} onClose={() => setZneplatnit(false)} size="sm" title={t('Zneplatnit všechny odkazy?')}
        footer={<>
          <Button variant="secondary" onClick={() => setZneplatnit(false)}>{t('Zrušit')}</Button>
          <Button variant="danger" loading={ukladam === 'zneplatnit'} onClick={async () => { await uloz({ zneplatnit: true }, 'zneplatnit', t('Všechny odkazy pro účetní jsou zneplatněné.')); setZneplatnit(false); }}>{t('Zneplatnit')}</Button>
        </>}>
        <p className="text-sm text-pretty">{t('Žádný dřív poslaný ani zkopírovaný odkaz na podklady už nepůjde otevřít. Účetní pak pošli nový.')}</p>
      </Modal>
    </Section>
  );
}
