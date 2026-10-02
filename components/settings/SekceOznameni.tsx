'use client';

import { useEffect, useState } from 'react';
import { Button, EmptyState, ListRow, Chip, Skeleton, SwitchRow, Input } from '../ui';
import { ErrorState } from '../ui/ErrorState';
import { useLoad } from '../ui/useLoad';
import { useObal } from '../ObalProvider';
import { useOpravneni } from '../role/useOpravneni';
import { useT, useJazyk } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { okJson } from '@/lib/api';
import { jeNativni, nativniMost, stavNativnihoPushe } from '@/lib/nativni/most';
import { PUSH_NAKONFIGUROVAN, prohlizecUmiPush, stavPush } from '@/lib/pushKlient';
import { nastavPushVypnuto, otiskTohotoZarizeni, pushVypnutoNaZarizeni, vypniPushProhlizece, zapniPushProhlizece } from '@/lib/pushProhlizec';
import { VYCHOZI_TICHO, cisteTicho, type TichoHodiny } from '@/lib/nastaveniUcet';
import { ulozPrefsUctu } from './ulozPrefs';

// Nastavení → Notifikace: předvolby (kategorie), tiché hodiny, denní souhrn a seznam zařízení
// s upozorněními v prohlížeči. Kategorie, tiché hodiny a souhrn jsou na účtu (users.notif_prefs,
// platí na všech zařízeních a vynucuje je server: lib/push.ts, app/api/digest). Zapnutí push
// je věc zařízení. Centrum oznámení (seznam) zůstává v Settings.tsx.

const NOTIF_PREFS_KEY = 'managero-notif-prefs';

type Kategorie = 'messages' | 'lowStock' | 'shifts' | 'ukoly' | 'uzaverky' | 'rezervace' | 'volno';

interface Zarizeni { id: number; druh: 'chrome' | 'firefox' | 'safari' | 'edge' | 'jine'; otisk: string; vytvoreno: string | null }

export default function SekceOznameni() {
  const t = useT('spolecne');
  const { jazyk } = useJazyk();
  const { jeObal } = useObal();
  const { ma } = useOpravneni();

  // Předvolby z účtu; dokud nedorazí, ukazuje se kostra (přepínač s neznámou hodnotou by lhal).
  const ucet = useLoad<Record<string, unknown>>('/api/account', raw => (raw?.user?.notifPrefs ?? {}) as Record<string, unknown>);
  // Změny, které člověk právě udělal (platí hned, ještě než je server potvrdí).
  const [zmeny, setZmeny] = useState<Record<string, unknown>>({});
  const [chyba, setChyba] = useState('');
  const zUctu = { ...(ucet.data ?? {}), ...zmeny } as Record<string, unknown>;
  const zap = (k: Kategorie | 'digest') => zUctu[k] !== false;
  const ticho: TichoHodiny = cisteTicho(zUctu.ticho);

  const uloz = async (cast: Record<string, unknown>) => {
    const predtim = Object.fromEntries(Object.keys(cast).map(k => [k, zUctu[k]]));
    setChyba('');
    setZmeny(z => ({ ...z, ...cast }));
    try {
      await ulozPrefsUctu(cast);
    } catch {
      setZmeny(z => ({ ...z, ...predtim }));
      setChyba(t('Nastavení se nepodařilo uložit. Zkus to znovu.'));
    }
  };

  // ---- Push na tomhle zařízení ----
  const [pushZap, setPushZap] = useState(false);
  // Push nabízíme jen tam, kde by opravdu fungoval (klíče v buildu + podporující prohlížeč).
  const [pushNativniOdmitnuto, setPushNativniOdmitnuto] = useState(false);
  const [pushStavVal, setPushStavVal] = useState(() => stavPush(PUSH_NAKONFIGUROVAN, true));
  useEffect(() => {
    // V nativním obalu web push neexistuje (WKWebView nemá PushManager); rozhoduje nativní plugin.
    if (jeNativni()) {
      let zruseno = false;
      Promise.all([stavNativnihoPushe(), nativniMost()]).then(([st, most]) => {
        if (zruseno) return;
        setPushStavVal(st === 'nedostupny' ? 'nepodporovano' : 'ok');
        // Povolení v systému nestačí: uživatel mohl push v aplikaci vypnout (token je pak na serveru smazaný).
        if (st === 'granted') setPushZap(!most?.pushVypnuto());
        if (st === 'denied') setPushZap(false);
      });
      return () => { zruseno = true; };
    }
    setPushStavVal(stavPush(PUSH_NAKONFIGUROVAN, prohlizecUmiPush()));
    // Zapnuto = oprávnění je udělené a zařízení si push nevypnulo.
    try {
      const raw = localStorage.getItem(NOTIF_PREFS_KEY);
      const ulozene = raw ? JSON.parse(raw)?.push === true : false;
      setPushZap(!pushVypnutoNaZarizeni() && (ulozene || (typeof Notification !== 'undefined' && Notification.permission === 'granted')));
    } catch { /* bez úložiště */ }
  }, []);
  const ulozPushZarizeni = (v: boolean) => {
    setPushZap(v);
    try { localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify({ push: v })); } catch { /* soukromé okno */ }
  };

  // ---- Zařízení s odběrem ----
  const zarizeni = useLoad<Zarizeni[]>('/api/account/zarizeni', raw => (Array.isArray(raw?.zarizeni) ? raw.zarizeni : []) as Zarizeni[]);
  const [tentoOtisk, setTentoOtisk] = useState<string | null>(null);
  const nactiOtisk = () => { void otiskTohotoZarizeni().then(setTentoOtisk); };
  useEffect(() => { if (!jeNativni()) nactiOtisk(); }, []);
  const [odebira, setOdebira] = useState<number | null>(null);
  const [zarizeniChyba, setZarizeniChyba] = useState('');

  const togglePush = async (value: boolean) => {
    // Nativní obal: systémový dialog a registrace tokenu; přepínač ukáže skutečný výsledek,
    // ne přání (při odmítnutí se vrátí do vypnuto a řekne se, kde to povolit).
    if (jeNativni()) {
      const most = await nativniMost();
      if (!value) { setPushZap(false); await most?.vypniPush(); return; }
      const r = await most?.zapniPush() ?? 'nedostupny';
      setPushZap(r === 'granted');
      if (r === 'denied') setPushNativniOdmitnuto(true);
      return;
    }
    if (!value) {
      nastavPushVypnuto(true);
      ulozPushZarizeni(false);
      await vypniPushProhlizece();
      setTentoOtisk(null);
      zarizeni.reload();
      return;
    }
    nastavPushVypnuto(false);
    const ok = await zapniPushProhlizece();
    ulozPushZarizeni(ok);
    if (ok) { nactiOtisk(); zarizeni.reload(); }
  };

  const odeber = async (z: Zarizeni) => {
    setOdebira(z.id); setZarizeniChyba('');
    try {
      const r = await fetch('/api/account/zarizeni', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: z.id }),
      });
      await okJson(r);
      // Odebrané je TOTO zařízení: ať se mu odběr nevrátí při dalším otevření aplikace.
      if (z.otisk === tentoOtisk) { nastavPushVypnuto(true); ulozPushZarizeni(false); await vypniPushProhlizece(); setTentoOtisk(null); }
      zarizeni.reload();
    } catch {
      setZarizeniChyba(t('Zařízení se nepodařilo odebrat. Zkus to znovu.'));
    } finally {
      setOdebira(null);
    }
  };

  const NAZEV_DRUHU: Record<Zarizeni['druh'], string> = {
    chrome: t('Chrome nebo Android'), firefox: t('Firefox'), safari: t('Safari (Apple)'), edge: t('Edge nebo Windows'), jine: t('Jiný prohlížeč'),
  };

  const jenStaff = ma(['rezervace.schvalovat', 'klient.prehled']);
  const maSouhrn = ma('notifikace.denni_souhrn');

  if (ucet.error) {
    return <section className="card p-6"><ErrorState compact title={t('Předvolby se nepodařilo načíst')} detail={ucet.error} onRetry={ucet.reload} /></section>;
  }

  return (
    <div className="space-y-6">
      <section className="card p-6 space-y-2" aria-labelledby="nast-oz-t">
        <div>
          <h2 id="nast-oz-t" className="t-card">{t('Předvolby notifikací')}</h2>
          <p className="t-meta mt-1">{t('Nastav, o čem chceš dostávat informace. Platí na všech tvých zařízeních.')}</p>
        </div>
        {chyba && <p role="alert" className="note note-danger">{chyba}</p>}
        {ucet.loading ? (
          <div className="space-y-2" aria-busy="true">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <ul className="list">
            {pushStavVal === 'ok' ? (
              <SwitchRow title={t('Push notifikace na tomhle zařízení')} hint={pushNativniOdmitnuto
                ? t('Oznámení jsou v systému vypnutá. Povolte je v nastavení telefonu u aplikace Managero.')
                : jeObal ? t('Upozornění přímo v telefonu.') : t('Povolte oznámení v tomto prohlížeči.')} checked={pushZap} onChange={togglePush} />
            ) : (
              // Bez klíčů nebo v prohlížeči bez podpory by přepínač nic neudělal — radši to řekneme.
              <li className="py-3 min-h-[3.25rem]">
                <p className="text-sm font-semibold text-[#16181A]">{t('Push notifikace na tomhle zařízení')}</p>
                <p className="text-xs text-black/45 mt-0.5 text-pretty">
                  {pushStavVal === 'nenakonfigurovano'
                    ? t('V téhle instalaci zatím nejsou zapnuté. Upozornění najdeš v centru oznámení níže.')
                    : t('Tenhle prohlížeč je nepodporuje. Na iPhonu je potřeba nejdřív přidat aplikaci na plochu. Upozornění najdeš v centru oznámení níže.')}
                </p>
              </li>
            )}
            <SwitchRow title={t('Nové zprávy')} hint={t('Upozornění na nové zprávy v chatu.')} checked={zap('messages')} onChange={v => uloz({ messages: v })} />
            <SwitchRow title={t('Nízké zásoby')} hint={t('Když skladová položka klesne pod limit.')} checked={zap('lowStock')} onChange={v => uloz({ lowStock: v })} />
            <SwitchRow title={t('Směny')} hint={t('Změny v rozvrhu a nové směny.')} checked={zap('shifts')} onChange={v => uloz({ shifts: v })} />
            <SwitchRow title={t('Úkoly')} hint={t('Když ti někdo přidělí úkol.')} checked={zap('ukoly')} onChange={v => uloz({ ukoly: v })} />
            <SwitchRow title={t('Uzávěrky')} hint={t('Připomínky uzávěrky a její schválení.')} checked={zap('uzaverky')} onChange={v => uloz({ uzaverky: v })} />
            {jenStaff && <SwitchRow title={t('Rezervace a objednávky')} hint={t('Nová rezervace, zrušení a objednávka od stolu.')} checked={zap('rezervace')} onChange={v => uloz({ rezervace: v })} />}
            <SwitchRow title={t('Volno')} hint={t('Žádosti o volno a jejich vyřízení.')} checked={zap('volno')} onChange={v => uloz({ volno: v })} />
          </ul>
        )}
      </section>

      <section className="card p-6 space-y-3" aria-labelledby="nast-ticho-t">
        <div>
          <h2 id="nast-ticho-t" className="t-card">{t('Tiché hodiny')}</h2>
          <p className="t-meta mt-1">{t('V tuhle dobu se upozornění do telefonu ani prohlížeče neodešle. Najdeš ho v centru oznámení.')}</p>
        </div>
        <ul className="list">
          <SwitchRow title={t('Zapnout tiché hodiny')} checked={ticho.zap} disabled={ucet.loading}
            onChange={v => uloz({ ticho: { ...ticho, zap: v } })} />
        </ul>
        <div className="grid grid-cols-2 gap-4 max-w-sm">
          <div>
            <label htmlFor="nast-ticho-od" className="field-label">{t('Od')}</label>
            <Input id="nast-ticho-od" type="time" value={ticho.od} disabled={!ticho.zap}
              onChange={e => { if (e.target.value) void uloz({ ticho: { ...ticho, od: e.target.value } }); }} />
          </div>
          <div>
            <label htmlFor="nast-ticho-do" className="field-label">{t('Do')}</label>
            <Input id="nast-ticho-do" type="time" value={ticho.do} disabled={!ticho.zap}
              onChange={e => { if (e.target.value) void uloz({ ticho: { ...ticho, do: e.target.value } }); }} />
          </div>
        </div>
        <p className="t-meta">{t('Čas se bere podle pražských hodin. Okno může přecházet přes půlnoc, třeba od {od} do {do}.', { od: VYCHOZI_TICHO.od, do: VYCHOZI_TICHO.do })}</p>
      </section>

      {maSouhrn && (
        <section className="card p-6 space-y-2" aria-labelledby="nast-souhrn-t">
          <h2 id="nast-souhrn-t" className="t-card">{t('Denní souhrn')}</h2>
          <ul className="list">
            <SwitchRow title={t('Večerní souhrn dne')} hint={t('Tržby, kasa, kdo pracoval a co dochází; chodí večer v oznámení a e-mailem. Vypnutí platí jen pro tebe.')}
              checked={zap('digest')} disabled={ucet.loading} onChange={v => uloz({ digest: v })} />
          </ul>
        </section>
      )}

      <section className="card p-6 space-y-3" aria-labelledby="nast-zarizeni-t">
        <div>
          <h2 id="nast-zarizeni-t" className="t-card">{t('Zařízení s upozorněními')}</h2>
          <p className="t-meta mt-1">{t('Prohlížeče, do kterých ti chodí push. Odebrané zařízení se vrátí, až na něm aplikaci znovu otevřeš a povolíš upozornění.')}</p>
        </div>
        {zarizeniChyba && <p role="alert" className="note note-danger">{zarizeniChyba}</p>}
        {zarizeni.error ? (
          <ErrorState compact title={t('Zařízení se nepodařilo načíst')} detail={zarizeni.error} onRetry={zarizeni.reload} />
        ) : zarizeni.loading ? (
          <Skeleton className="h-14 w-full" />
        ) : (zarizeni.data ?? []).length === 0 ? (
          <EmptyState compact icon="bell" title={t('Žádné zařízení')} hint={t('Až si v některém prohlížeči zapneš upozornění, objeví se tady.')} />
        ) : (
          <ul className="list">
            {(zarizeni.data ?? []).map(z => (
              <ListRow key={z.id}
                title={<>{NAZEV_DRUHU[z.druh]}{z.otisk === tentoOtisk && <Chip tone="info" size="sm" className="ml-2 align-middle">{t('Toto zařízení')}</Chip>}</>}
                meta={z.vytvoreno ? t('Přidáno {datum}', { datum: fmtDatum(z.vytvoreno, { jazyk, styl: 'cislo' }) }) : undefined}
                actions={<Button variant="danger" size="sm" loading={odebira === z.id} disabled={odebira !== null} onClick={() => odeber(z)}>{t('Odebrat')}</Button>} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
