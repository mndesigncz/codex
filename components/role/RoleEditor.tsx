'use client';

// Nastavení → Role a oprávnění (kolo 67).
//
// Dvě obrazovky v jedné záložce: seznam rolí (přednastavené z kódu +
// vlastní role podniku) a editor jedné role. Přednastavené role si podnik
// může upravit (kromě Majitele / Vedení a Tabletu — lib/roleUpravy.ts);
// úprava platí jen v tomhle podniku a jde vrátit na výchozí. Editor je na stránce, ne
// v okně: katalog má přes sto šedesát oprávnění ve čtrnácti oblastech
// a v okně na telefonu by se rolovalo v rolování.
//
// Pravidla, podle kterých server roli přijme nebo odmítne, jsou
// v lib/opravneni.ts (smiUpravitRoli, smiBytVychozi). Editor je zná taky
// a zamyká přepínače předem — ale když server přesto odmítne, ukáže se
// jeho česká hláška doslova. Rozhoduje server, ne tahle obrazovka.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Chip, DiscardGuard, EmptyState, ErrorState, Input, Label, Modal, SearchField, Segmented, Switch, Textarea } from '../ui';
import { okJson, apiMessage, ApiError } from '@/lib/api';
import { czCount, czForm, czVerb } from '@/lib/czech';
import { obsahujeNekde } from '@/lib/hledani';
import {
  KATALOG, OBLASTI, KIOSK_BILA_LISTINA, sZavislostmi, bezZavislych, navic, smiBytVychozi, opravneni as popisKlice,
  type TypRole, type Opravneni,
} from '@/lib/opravneni';
import { obnovOpravneni } from './useOpravneni';
import { nastavRozepsanouRoli, CO_SE_ZAHODI_ROLE } from './rozepsano';
import { useT, type PrekladFn } from '@/lib/i18n/client';
import { sUzlem, VLOZ } from '../employer/jazyk';

interface SysRole {
  klic: string; nazev: string; popis: string; typ: TypRole; opravneni: string[]; pocet: number;
  // Úprava podnikem (kolo 71). Starší odpověď serveru je nemá — pak se
  // role chová jako dřív: jen ke čtení a ke kopii.
  upraveno?: boolean; upravitelna?: boolean; verze?: number; procZamceno?: string | null;
  vychoziOpravneni?: string[]; vychoziNazev?: string; vychoziPopis?: string;
}
interface VlRole { id: number; nazev: string; popis: string | null; typ: TypRole; opravneni: string[]; zdroj: string | null; pocet: number }
interface Ja { jeVlastnik: boolean; klic: string | null; roleId: number | null; nazev: string; opravneni: string[] }
interface Data { system: SysRole[]; vlastni: VlRole[]; vychozi: { id: number | null; klic: string | null }; ja: Ja; upravyNedostupne: boolean }

/** Co editor otevírá: novou roli (případně z předlohy), nebo existující vlastní či přednastavenou. */
type Otevreno =
  | { druh: 'nova'; predloha?: { nazev: string; popis: string; typ: TypRole; opravneni: string[]; zdroj: string | null } }
  | { druh: 'vlastni'; role: VlRole }
  | { druh: 'system'; role: SysRole };

const lide = (t: PrekladFn, n: number) => (n === 0 ? t('nikdo') : t('{n, plural, one {# člověk} few {# lidé} other {# lidí}}', { n }));

const typy = (t: PrekladFn): { id: TypRole; label: string; icon: string }[] => [
  { id: 'vedeni', label: t('Vedení'), icon: 'overview' },
  { id: 'zamestnanec', label: t('Zaměstnanec'), icon: 'user' },
  { id: 'kiosk', label: t('Tablet'), icon: 'cup' },
];
// Typ rozhraní ≠ oprávnění: říká, která aplikace se otevře a koho se
// týká rozvrh a žebříček. Proto má vlastní vysvětlení, ne jen štítek.
const typVysvetleni = (t: PrekladFn): Record<TypRole, string> => ({
  vedeni: t('Otevře se správa podniku. V navigaci uvidí jen obrazovky, na které má oprávnění níže.'),
  zamestnanec: t('Otevře se aplikace pro zaměstnance — moje směny, uzávěrka, úkoly. Bere se do rozvrhu a do žebříčku odměn.'),
  kiosk: t('Pro sdílený tablet za barem. Jde zapnout jen to, co na tabletu dává smysl — kdo zná heslo tabletu, dostane všechno, co tablet smí.'),
});
const typNazev = (t: PrekladFn): Record<TypRole, string> => ({ vedeni: t('Vedení'), zamestnanec: t('Zaměstnanec'), kiosk: t('Tablet') });

// Klíče jsou úrovně citlivosti z katalogu (data), ne text pro člověka.
const citlivost = (t: PrekladFn): Record<string, { tone: 'muted' | 'wait' | 'bad'; text: string }> => ({
  'nízká': { tone: 'muted', text: t('Běžné') }, // i18n-ok
  'střední': { tone: 'wait', text: t('Střední') }, // i18n-ok
  'vysoká': { tone: 'bad', text: t('Citlivé') }, // i18n-ok
});

/** Vyhodí z množiny klíče, jejichž závislosti v ní chybí (opak sZavislostmi, bez jednoho vypnutého). */

const beZDer = (sada: Iterable<string>) => bezZavislych(sada, '');

export default function RoleEditor() {
  const t = useT('sprava');
  const [data, setData] = useState<Data | null>(null);
  const [chybaNacteni, setChybaNacteni] = useState<string | null>(null);
  const [otevreno, setOtevreno] = useState<Otevreno | null>(null);
  const [zprava, setZprava] = useState('');
  const [chyba, setChyba] = useState('');
  const [mazat, setMazat] = useState<VlRole | null>(null);
  const [mazu, setMazu] = useState(false);
  const [nastavujiVychozi, setNastavujiVychozi] = useState<string | null>(null);
  const [obnovit, setObnovit] = useState<SysRole | null>(null);
  const [obnovuji, setObnovuji] = useState(false);

  const nacti = () => {
    setChybaNacteni(null);
    return fetch('/api/roles').then(okJson)
      .then((d: any) => setData({
        system: Array.isArray(d?.system) ? d.system : [],
        vlastni: Array.isArray(d?.vlastni) ? d.vlastni : [],
        vychozi: d?.vychozi ?? { id: null, klic: 'barista' },
        ja: d?.ja ?? { jeVlastnik: false, klic: null, roleId: null, nazev: '', opravneni: [] },
        upravyNedostupne: d?.upravyNedostupne === true,
      }))
      .catch(e => setChybaNacteni(apiMessage(e, t('Role se nepodařilo načíst.'))));
  };
  useEffect(() => { nacti(); }, []);

  const flash = (m: string) => { setZprava(m); setChyba(''); setTimeout(() => setZprava(''), 4000); };

  if (chybaNacteni) {
    return <div className="glass-card"><ErrorState title={t('Role se nepodařilo načíst')} hint={chybaNacteni} onRetry={nacti} /></div>;
  }
  if (!data) {
    return <div className="glass-card flex items-center justify-center h-48"><div className="spinner" /></div>;
  }

  const ja = data.ja;
  const moje = new Set(ja.opravneni);
  const smiSpravovat = ja.jeVlastnik || moje.has('tym.role_spravovat');

  // Přednastavenou roli jde upravit, jen když ji server pustí (ne Vedení
  // ani Tablet) a úpravy podniku se podařilo načíst — jinak by editor
  // uložil sadu z kódu přes úpravu, kterou jen neviděl.
  const lzeUpravitSystemovou = (r: SysRole) => smiSpravovat && r.upravitelna === true && !data.upravyNedostupne;

  if (otevreno) {
    return (
      <EditorRole
        key={otevreno.druh === 'vlastni' ? `v${otevreno.role.id}` : otevreno.druh === 'system' ? `s${otevreno.role.klic}` : 'nova'}
        otevreno={otevreno} ja={ja} smiSpravovat={smiSpravovat} upravyNedostupne={data.upravyNedostupne}
        vychoziProNove={otevreno.druh === 'system' ? jeVychoziRole(data.vychozi, { klic: otevreno.role.klic }) : otevreno.druh === 'vlastni' && jeVychoziRole(data.vychozi, { id: otevreno.role.id })}
        onZpet={() => setOtevreno(null)}
        onKopie={(r) => setOtevreno({ druh: 'nova', predloha: predlohaZ(r, ja) })}
        onUlozeno={async (m) => { await nacti(); setOtevreno(null); flash(m); obnovOpravneni(); }}
      />
    );
  }

  // „Nastavit jako výchozí" jen tam, kde to server přijme (vychozi/route.ts):
  // typ zaměstnanec, nic citlivého ani správy týmu (smiBytVychozi) a nic,
  // co volající sám nemá. Tlačítko, které vždycky skončí 400, je past —
  // u Vedení, Provozní, Skladníka i Účetní by bylo přesně tohle.
  const muzeBytVychozi = (r: { typ: TypRole; opravneni: string[] }) =>
    r.typ === 'zamestnanec' && smiBytVychozi(r.opravneni).ok
    && (ja.jeVlastnik || navic(r.opravneni, moje).length === 0);

  const jeVychozi = (r: { klic?: string; id?: number }) => jeVychoziRole(data.vychozi, r);

  const nastavVychozi = async (telo: { roleId: number } | { klic: string }, nazev: string) => {
    const k = 'roleId' in telo ? `v${telo.roleId}` : `s${telo.klic}`;
    setNastavujiVychozi(k); setChyba('');
    try {
      await fetch('/api/roles/vychozi', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telo) }).then(okJson);
      await nacti();
      flash(t('Noví členové teď dostanou roli „{nazev}".', { nazev }));
    } catch (e) { setChyba(apiMessage(e, t('Výchozí roli se nepodařilo nastavit.'))); }
    setNastavujiVychozi(null);
  };

  const obnovVychozi = async () => {
    if (!obnovit) return;
    setObnovuji(true); setChyba('');
    try {
      await fetch(`/api/roles/system/${encodeURIComponent(obnovit.klic)}`, { method: 'DELETE' }).then(okJson);
      const n = obnovit.vychoziNazev ?? obnovit.nazev;
      setObnovit(null);
      await nacti();
      obnovOpravneni();
      flash(t('Role „{n}" má zase výchozí oprávnění.', { n }));
    } catch (e) {
      // 403 (návrat by přidal práva, která nemáš / je to tvoje role) říká server přesně.
      setChyba(apiMessage(e, t('Roli se nepodařilo vrátit na výchozí.')));
      setObnovit(null);
    }
    setObnovuji(false);
  };

  const smaz = async () => {
    if (!mazat) return;
    setMazu(true); setChyba('');
    try {
      await fetch(`/api/roles/${mazat.id}`, { method: 'DELETE' }).then(okJson);
      const n = mazat.nazev;
      setMazat(null);
      await nacti();
      flash(t('Role „{n}" je smazaná.', { n }));
    } catch (e) {
      // 409 (roli někdo má, je výchozí) i 403 říká server česky a přesně.
      setChyba(apiMessage(e, t('Roli se nepodařilo smazat.')));
      setMazat(null);
    }
    setMazu(false);
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:justify-between">
          <div className="min-w-0">
            <h3 className="font-bold tracking-tight text-[#16181A]">{t('Role a oprávnění')}</h3>
            <p className="text-black/45 text-sm mt-1 text-pretty">
              
              {t('Role je sada oprávnění — co člověk v podniku vidí a smí. Přednastavené role si můžeš upravit pro svůj podnik (kromě Majitele a Tabletu) nebo zkopírovat; vlastní si složíš přesně podle toho, jak u vás práce vypadá. Vlastník podniku má vždycky všechno.')}
            </p>
          </div>
          {smiSpravovat && (
            <Button variant="accent" icon="plus" block className="shrink-0"
              onClick={() => setOtevreno({ druh: 'nova' })}>{t('Nová role')}</Button>
          )}
        </div>
        {!smiSpravovat && (
          <p className="note mt-4 text-sm flex items-start gap-2">
            <Icon name="lock" size={15} className="shrink-0 mt-0.5" />
            
            {t('Role si můžeš prohlédnout a přidělovat lidem. Vytvářet a upravovat je může jen ten, kdo má oprávnění „Spravovat role".')}
          </p>
        )}
      </div>

      {zprava && (
        <div role="status" className="rounded-2xl bg-[#C8F542]/10 border border-[#C8F542]/20 p-4 text-[#5B7A08] text-sm flex items-center gap-2">
          <Icon name="check" size={16} className="shrink-0" /> {zprava}
        </div>
      )}
      {chyba && (
        <div role="alert" className="note note-danger p-4 text-sm flex items-start gap-2">
          <Icon name="warning" size={16} className="shrink-0 mt-0.5" /> <span className="min-w-0">{chyba}</span>
        </div>
      )}

      <section className="glass-card p-5 sm:p-6" aria-labelledby="role-vlastni">
        <h4 id="role-vlastni" className="t-label mb-2">{t('Vlastní role ({n})', { n: data.vlastni.length })}</h4>
        {data.vlastni.length === 0 ? (
          <EmptyState icon="lock" compact title={t('Zatím žádná vlastní role')}
            hint={t('Zkopíruj přednastavenou (třeba Barista bez uzávěrky) nebo slož novou od nuly.')} />
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {data.vlastni.map(r => (
              <RadekRole key={r.id} nazev={r.nazev} popis={r.popis} typ={r.typ} pocetOpravneni={r.opravneni.length} pocetLidi={r.pocet}
                vychozi={jeVychozi({ id: r.id })} mojeRole={ja.roleId === r.id}>
                <Button size="sm" variant="secondary" icon={smiSpravovat ? 'pencil' : undefined}
                  onClick={() => setOtevreno({ druh: 'vlastni', role: r })}>{smiSpravovat ? t('Upravit') : t('Zobrazit')}</Button>
                {smiSpravovat && muzeBytVychozi(r) && !jeVychozi({ id: r.id }) && (
                  <Button size="sm" variant="ghost" loading={nastavujiVychozi === `v${r.id}`}
                    onClick={() => nastavVychozi({ roleId: r.id }, r.nazev)}>{t('Nastavit jako výchozí')}</Button>
                )}
                {smiSpravovat && (
                  <Button size="sm" variant="danger" icon="trash" iconOnly aria-label={t('Smazat roli {nazev}', { nazev: r.nazev })} title={t('Smazat roli')}
                    onClick={() => { setChyba(''); setMazat(r); }} />
                )}
              </RadekRole>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-card p-5 sm:p-6" aria-labelledby="role-system">
        <h4 id="role-system" className="t-label mb-2">{t('Přednastavené role')}</h4>
        <ul className="divide-y divide-black/[0.06]">
          {data.system.map(r => (
            <RadekRole key={r.klic} nazev={r.nazev} popis={r.popis} typ={r.typ} pocetOpravneni={r.opravneni.length} pocetLidi={r.pocet}
              vychozi={jeVychozi({ klic: r.klic })} mojeRole={ja.roleId == null && ja.klic === r.klic && !ja.jeVlastnik}
              system={r.upravitelna ? 'upravitelna' : 'zamcena'} upraveno={r.upraveno === true}>
              {lzeUpravitSystemovou(r) ? (
                <Button size="sm" variant="secondary" icon="pencil" onClick={() => setOtevreno({ druh: 'system', role: r })}>{t('Upravit')}</Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setOtevreno({ druh: 'system', role: r })}>{t('Zobrazit')}</Button>
              )}
              {lzeUpravitSystemovou(r) && r.upraveno && (
                <Button size="sm" variant="ghost" icon="undo" onClick={() => { setChyba(''); setObnovit(r); }}>{t('Obnovit výchozí')}</Button>
              )}
              {smiSpravovat && (
                <Button size="sm" variant="secondary" icon="copy"
                  onClick={() => setOtevreno({ druh: 'nova', predloha: predlohaZ(r, ja) })}>{t('Zkopírovat do vlastní')}</Button>
              )}
              {smiSpravovat && muzeBytVychozi(r) && !jeVychozi({ klic: r.klic }) && (
                <Button size="sm" variant="ghost" loading={nastavujiVychozi === `s${r.klic}`}
                  onClick={() => nastavVychozi({ klic: r.klic }, r.nazev)}>{t('Nastavit jako výchozí')}</Button>
              )}
            </RadekRole>
          ))}
        </ul>
      </section>

      <Modal open={!!obnovit} onClose={() => !obnovuji && setObnovit(null)} size="sm" title={t('Obnovit výchozí oprávnění?')}
        footer={<>
          <Button variant="secondary" onClick={() => setObnovit(null)} disabled={obnovuji}>{t('Zrušit')}</Button>
          <Button variant="accent" icon="undo" loading={obnovuji} onClick={obnovVychozi}>{t('Obnovit výchozí')}</Button>
        </>}>
        {obnovit && (
          <div className="space-y-3 text-sm text-black/60">
            <p>
              {sUzlem(t('Role {nazev} dostane zpátky výchozí název, popis a oprávnění{pocet}. Úpravy tvého podniku se zahodí.', {
                nazev: VLOZ,
                pocet: obnovit.vychoziOpravneni ? ` (${t('{n} oprávnění', { n: obnovit.vychoziOpravneni.length })})` : '',
              }), <strong className="text-[#16181A]">{obnovit.nazev}</strong>)}
            </p>
            {obnovit.pocet > 0 && (
              <p className="note">{t('Změna platí hned pro {lide} s touhle rolí — při příštím načtení aplikace.', { lide: lide(t, obnovit.pocet) })}</p>
            )}
          </div>
        )}
      </Modal>

      <Modal open={!!mazat} onClose={() => !mazu && setMazat(null)} size="sm" title={t('Smazat roli?')}
        footer={<>
          <Button variant="secondary" onClick={() => setMazat(null)} disabled={mazu}>{t('Zrušit')}</Button>
          <Button variant="danger-solid" icon="trash" loading={mazu} onClick={smaz}
            disabled={!!mazat && (mazat.pocet > 0 || jeVychozi({ id: mazat.id }))}>{t('Smazat')}</Button>
        </>}>
        {mazat && (
          <div className="space-y-3 text-sm text-black/60">
            <p>{sUzlem(t('Role {nazev} zmizí. Nepřijaté pozvánky s touhle rolí dostanou při přijetí výchozí roli podniku.', { nazev: VLOZ }), <strong className="text-[#16181A]">{mazat.nazev}</strong>)}</p>
            {mazat.pocet > 0 && (
              <p className="note note-danger">{t('Roli má {lide}. Nejdřív je v Nastavení týmu převeď na jinou roli — jinak by zůstali bez oprávnění.', { lide: lide(t, mazat.pocet) })}</p>
            )}
            {jeVychozi({ id: mazat.id }) && (
              <p className="note note-danger">{t('Tohle je výchozí role pro nové členy. Nejdřív nastav jako výchozí jinou.')}</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Je role výchozí pro nové členy? Bez nastavené výchozí je to Barista (server posílá klíč). */
function jeVychoziRole(vychozi: Data['vychozi'], r: { klic?: string; id?: number }) {
  return r.id != null ? vychozi.id === r.id : vychozi.id == null && vychozi.klic === r.klic;
}

/** Předloha pro kopii: jen oprávnění, která volající sám má (jinak by server kopii odmítl). */
function predlohaZ(r: SysRole | VlRole, ja: Ja) {
  const moje = new Set(ja.opravneni);
  const zdroj = 'klic' in r ? r.klic : null;
  const sada = ja.jeVlastnik ? r.opravneni : beZDer(r.opravneni.filter(k => moje.has(k)));
  return { nazev: `${r.nazev} (kopie)`.slice(0, 60), popis: r.popis ?? '', typ: r.typ, opravneni: sada, zdroj, vynechano: r.opravneni.length - sada.length };
}

function RadekRole({ nazev, popis, typ, pocetOpravneni, pocetLidi, vychozi, mojeRole, system, upraveno, children }: {
  nazev: string; popis: string | null; typ: TypRole; pocetOpravneni: number; pocetLidi: number;
  vychozi: boolean; mojeRole: boolean; system?: 'upravitelna' | 'zamcena'; upraveno?: boolean; children: React.ReactNode;
}) {
  const t = useT('sprava');
  return (
    <li className="py-3.5 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-semibold text-[#16181A] min-w-0 break-words">{nazev}</p>
          <Chip size="sm" tone="info">{typNazev(t)[typ]}</Chip>
          {vychozi && <Chip size="sm" tone="ok">{t('Výchozí pro nové')}</Chip>}
          {mojeRole && <Chip size="sm" tone="ink">{t('Tvoje role')}</Chip>}
          {/* Zámek jen u rolí, které upravit nejde (Majitel / Vedení, Tablet). */}
          {system && <Chip size="sm" tone="muted" icon={system === 'zamcena' ? 'lock' : undefined}>{t('Přednastavená')}</Chip>}
          {upraveno && <Chip size="sm" tone="wait">{t('Upraveno')}</Chip>}
        </div>
        {popis && <p className="text-xs text-black/50 mt-1 line-clamp-2 text-pretty">{popis}</p>}
        <p className="text-xs text-black/45 mt-1 tabular-nums">{t('{n} oprávnění', { n: pocetOpravneni })} · {lide(t, pocetLidi)}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap shrink-0">{children}</div>
    </li>
  );
}

function EditorRole({ otevreno, ja, smiSpravovat, upravyNedostupne, vychoziProNove, onZpet, onKopie, onUlozeno }: {
  otevreno: Otevreno; ja: Ja; smiSpravovat: boolean; upravyNedostupne: boolean; vychoziProNove: boolean;
  onZpet: () => void; onKopie: (r: SysRole | VlRole) => void; onUlozeno: (zprava: string) => void | Promise<void>;
}) {
  const t = useT('sprava');
  const nazvyKlicu = (ids: string[], max = 3) => {
    const n = ids.slice(0, max).map(id => t('„{nazev}"', { nazev: popisKlice(id)?.nazev ?? id })).join(', ');
    return ids.length > max ? t('{seznam} a další {n}', { seznam: n, n: ids.length - max }) : n;
  };
  const moje = useMemo(() => new Set(ja.opravneni), [ja.opravneni]);
  const vychoziHodnoty = otevreno.druh === 'nova'
    ? { nazev: otevreno.predloha?.nazev ?? '', popis: otevreno.predloha?.popis ?? '', typ: otevreno.predloha?.typ ?? 'zamestnanec' as TypRole, opravneni: otevreno.predloha?.opravneni ?? [] }
    : { nazev: otevreno.role.nazev, popis: otevreno.role.popis ?? '', typ: otevreno.role.typ, opravneni: otevreno.role.opravneni };

  const [nazev, setNazev] = useState(vychoziHodnoty.nazev);
  const [popis, setPopis] = useState(vychoziHodnoty.popis);
  const [typ, setTyp] = useState<TypRole>(vychoziHodnoty.typ);
  const [sada, setSada] = useState<Set<string>>(() => new Set(sZavislostmi(vychoziHodnoty.opravneni)));
  const [hledani, setHledani] = useState('');
  const [otevrene, setOtevrene] = useState<Set<string>>(() => new Set());
  const [info, setInfo] = useState('');
  const [chyba, setChyba] = useState('');
  const [ukladam, setUkladam] = useState(false);

  // Proč se role nedá upravit — jedna věta, nahoře, místo desítek
  // zašedlých přepínačů bez vysvětlení.
  const mimoMoje = otevreno.druh !== 'nova' && !ja.jeVlastnik ? navic(otevreno.role.opravneni, moje) : [];
  const system = otevreno.druh === 'system' ? otevreno.role : null;
  // Stejná pravidla jako server (lib/roleUpravy.ts → smiUpravitSystemovou);
  // rozhoduje stejně server, tohle jen vysvětlí dopředu.
  const jenCist: string | null =
    system && system.upravitelna !== true ? (system.procZamceno ?? t('Přednastavená role se nedá upravit. Zkopíruj ji do vlastní a uprav kopii.'))
    : system && upravyNedostupne ? t('Úpravy přednastavených rolí se teď nepodařilo načíst, takže roli ukazuji jen ke čtení. Zkus stránku načíst znovu.')
    : !smiSpravovat ? t('Na správu rolí nemáš oprávnění — roli si můžeš jen prohlédnout.')
    : otevreno.druh === 'vlastni' && !ja.jeVlastnik && ja.roleId === otevreno.role.id ? t('Tohle je tvoje vlastní role. Upravit ji může jen někdo jiný — jinak by si kdokoli mohl přidat práva sám.')
    : system && !ja.jeVlastnik && ja.roleId == null && ja.klic === system.klic ? t('Tohle je tvoje role. Upravit ji může jen někdo jiný — jinak by si kdokoli mohl přidat práva sám.')
    : mimoMoje.length ? t('Tahle role má oprávnění, která ty nemáš ({seznam}) — upravit ji může jen někdo s nimi.', { seznam: nazvyKlicu(mimoMoje) })
    : null;

  const zamek = (id: string): string | null => {
    if (typ === 'kiosk' && !KIOSK_BILA_LISTINA.has(id)) return t('Tablet tohle mít nesmí — kdo zná heslo tabletu, dostal by to taky.');
    if (!ja.jeVlastnik && !moje.has(id)) return t('Sám tohle oprávnění nemáš, takže ho do role dát nemůžeš.');
    return null;
  };

  const zapnout = (ids: string[]): { dalsi: Set<string>; pridano: string[] } | { blokuje: string; kvuli: string } => {
    const nova = sZavislostmi([...sada, ...ids]);
    for (const k of nova) {
      if (!sada.has(k) && zamek(k)) return { blokuje: k, kvuli: ids.find(i => sZavislostmi([i]).includes(k)) ?? ids[0] };
    }
    return { dalsi: new Set(nova), pridano: nova.filter(k => !sada.has(k) && !ids.includes(k)) };
  };

  const prepni = (id: string, on: boolean) => {
    setChyba('');
    if (on) {
      const v = zapnout([id]);
      if ('blokuje' in v) {
        setInfo(t('„{nazev}" nejde zapnout: potřebuje „{potrebuje}" — {proc}', { nazev: popisKlice(id)?.nazev, potrebuje: popisKlice(v.blokuje)?.nazev, proc: `${zamek(v.blokuje)?.charAt(0).toLowerCase()}${zamek(v.blokuje)?.slice(1)}` }));
        return;
      }
      setSada(v.dalsi);
      setInfo(v.pridano.length ? t('Zapnuto i {seznam} — „{nazev}" bez toho nefunguje.', { seznam: nazvyKlicu(v.pridano), nazev: popisKlice(id)?.nazev }) : '');
    } else {
      const zbyva = new Set(bezZavislych(sada, id));
      const vypnuto = [...sada].filter(k => k !== id && !zbyva.has(k));
      setSada(zbyva);
      setInfo(vypnuto.length ? t('Vypnuto i {seznam} — stojí na „{nazev}".', { seznam: nazvyKlicu(vypnuto), nazev: popisKlice(id)?.nazev }) : '');
    }
  };

  const prepniOblast = (klice: Opravneni[], on: boolean) => {
    setChyba('');
    if (on) {
      // Zapnout jde jen to, co (i se závislostmi) není zamčené.
      const lze = klice.filter(o => !sada.has(o.id) && !sZavislostmi([o.id]).some(z => !sada.has(z) && zamek(z)));
      const v = zapnout(lze.map(o => o.id));
      if ('dalsi' in v) setSada(v.dalsi);
      const zbylo = klice.length - klice.filter(o => sada.has(o.id)).length - lze.length;
      // Shoda podle čísla: „1 … zůstalo vypnuté — je zamčené", „3 … zůstala
      // vypnutá — jsou zamčená", „5 … zůstalo vypnutých".
      setInfo(zbylo > 0 ? t('{n, plural, one {# oprávnění zůstalo vypnuté — je zamčené.} few {# oprávnění zůstala vypnutá — jsou zamčená.} other {# oprávnění zůstalo vypnutých — jsou zamčená.}}', { n: zbylo }) : '');
    } else {
      let s: Iterable<string> = sada;
      for (const o of klice) if (sada.has(o.id) && !zamek(o.id)) s = bezZavislych(s, o.id);
      const zbyva = new Set(s);
      const mimo = [...sada].filter(k => !zbyva.has(k) && popisKlice(k)?.oblast !== klice[0]?.oblast);
      setSada(zbyva);
      setInfo(mimo.length ? t('Vypnuto i {seznam} z jiných oblastí — stály na vypnutých.', { seznam: nazvyKlicu(mimo) }) : '');
    }
  };

  const zmenTyp = (novy: TypRole) => {
    setTyp(novy);
    if (novy !== 'kiosk') { setInfo(''); return; }
    // Tablet smí jen bílou listinu; co mimo ni, se vypne i se vším, co na tom stojí.
    let s: Iterable<string> = sada;
    for (const k of sada) if (!KIOSK_BILA_LISTINA.has(k)) s = bezZavislych(s, k);
    const zbyva = new Set(s);
    const vypnuto = sada.size - zbyva.size;
    setSada(zbyva);
    setInfo(vypnuto ? t('{n, plural, one {Tablet nesmí mít # oprávnění z původního výběru — vypnulo se.} few {Tablet nesmí mít # oprávnění z původního výběru — vypnula se.} other {Tablet nesmí mít # oprávnění z původního výběru — vypnulo se.}}', { n: vypnuto }) : '');
  };

  const skupiny = useMemo(() => OBLASTI.map(oblast => ({
    oblast,
    vse: KATALOG.filter(o => o.oblast === oblast),
    shoda: KATALOG.filter(o => o.oblast === oblast && obsahujeNekde(hledani, o.nazev, o.popis, o.id, o.oblast)),
  })), [hledani]);
  const hleda = hledani.trim() !== '';
  const nicNeodpovida = hleda && skupiny.every(g => g.shoda.length === 0);

  const puvodni = new Set(sZavislostmi(vychoziHodnoty.opravneni));
  const zmeneno = nazev !== vychoziHodnoty.nazev || popis !== vychoziHodnoty.popis || typ !== vychoziHodnoty.typ
    || sada.size !== puvodni.size || [...sada].some(k => !puvodni.has(k));

  // Neuložené změny hlásí editor ven: přepnutí záložky Nastavení nebo
  // pohledu v navigaci se pak zeptá (components/role/rozepsano.ts), místo
  // aby editor tiše odmontovalo. Po odmontování (uloženo, zahozeno, zpět)
  // se hlášení vždy vrátí na „nic rozepsáno".
  const rozepsano = !jenCist && zmeneno && !ukladam;
  useEffect(() => {
    nastavRozepsanouRoli(rozepsano);
    if (!rozepsano) return;
    // Obnovení nebo zavření stránky: prohlížeč se zeptá sám.
    const pred = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', pred);
    return () => window.removeEventListener('beforeunload', pred);
  }, [rozepsano]);
  useEffect(() => () => nastavRozepsanouRoli(false), []);

  // Zpět i Zrušit se ptají stejnou vrstvou jako okna — ne nativním confirm.
  const [ptamSe, setPtamSe] = useState(false);
  const zpet = () => {
    if (rozepsano) { setPtamSe(true); return; }
    onZpet();
  };
  const strazZpet = {
    asking: ptamSe, dirty: rozepsano,
    keep: () => setPtamSe(false),
    discard: () => { setPtamSe(false); nastavRozepsanouRoli(false); onZpet(); },
    attemptClose: zpet,
  };

  const uloz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (jenCist) return;
    if (!nazev.trim()) { setChyba(t('Zadej název role.')); return; }
    setUkladam(true); setChyba('');
    const telo = { nazev: nazev.trim(), popis: popis.trim(), typ, opravneni: [...sada].sort() };
    try {
      if (otevreno.druh === 'system') {
        // Typ přednastavené role je pevný; posílá se jen sada, název, popis
        // a verze, se kterou se role otevřela (server odmítne souběžnou změnu).
        const bezTypu = { nazev: telo.nazev, popis: telo.popis, opravneni: telo.opravneni, verze: otevreno.role.verze ?? 0 };
        await fetch(`/api/roles/system/${encodeURIComponent(otevreno.role.klic)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bezTypu),
        }).then(okJson);
        await onUlozeno(t('Role „{nazev}" je uložená — platí hned pro všechny, kdo ji mají.', { nazev: telo.nazev }));
      } else if (otevreno.druh === 'vlastni') {
        await fetch(`/api/roles/${otevreno.role.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telo) }).then(okJson);
        await onUlozeno(t('Role „{nazev}" je uložená.', { nazev: telo.nazev }));
      } else {
        const zdroj = otevreno.druh === 'nova' ? otevreno.predloha?.zdroj ?? null : null;
        await fetch('/api/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...telo, zdroj }) }).then(okJson);
        await onUlozeno(t('Role „{nazev}" je vytvořená. Přidělíš ji v Nastavení týmu u člověka.', { nazev: telo.nazev }));
      }
    } catch (err) {
      // 403 s důvodem („Roli nemůžeš dát oprávnění, která sám nemáš: …")
      // se ukáže doslova — je to přesnější než cokoli, co by odhadl klient.
      setChyba(apiMessage(err, t('Roli se nepodařilo uložit.')) + (err instanceof ApiError && err.status >= 500 ? ` ${t('Zkus to prosím znovu.')}` : ''));
      setUkladam(false);
    }
  };

  const nadpis = otevreno.druh === 'nova' ? t('Nová role') : otevreno.role.nazev;
  const predloha = otevreno.druh === 'nova' ? otevreno.predloha as (undefined | { vynechano?: number }) : undefined;

  return (
    <form onSubmit={uloz} className="space-y-4 pb-24 md:pb-0" aria-labelledby="role-editor-nadpis">
      <DiscardGuard guard={strazZpet} what={t('Rozepsané změny role se neuloží.')} />
      <div className="glass-card p-5 sm:p-6 space-y-5">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" icon="chevron" iconOnly aria-label={t('Zpět na seznam rolí')} className="rotate-90 shrink-0 -ml-2" onClick={zpet} />
          <div className="min-w-0 flex-1">
            <h3 id="role-editor-nadpis" className="font-bold tracking-tight text-[#16181A] break-words">{nadpis}</h3>
            <p className="text-sm text-black/45 mt-0.5 tabular-nums">{t('Zapnuto {n} ze {celkem} oprávnění', { n: sada.size, celkem: KATALOG.length })}</p>
          </div>
        </div>

        {jenCist && (
          <div className="note text-sm flex flex-col sm:flex-row sm:items-center gap-2.5">
            <span className="flex items-start gap-2 min-w-0 flex-1"><Icon name="lock" size={15} className="shrink-0 mt-0.5" />{jenCist}</span>
            {smiSpravovat && otevreno.druh !== 'nova' && (
              <Button size="sm" variant="secondary" icon="copy" className="shrink-0" onClick={() => onKopie(otevreno.role)}>{t('Zkopírovat do vlastní')}</Button>
            )}
          </div>
        )}
        {!!predloha?.vynechano && (
          <p className="note text-sm flex items-start gap-2">
            <Icon name="info" size={15} className="shrink-0 mt-0.5" />
            {t('{n, plural, one {Z předlohy jsem vynechal # oprávnění, které sám nemáš — do role ho dát nemůžeš.} few {Z předlohy jsem vynechal # oprávnění, která sám nemáš — do role je dát nemůžeš.} other {Z předlohy jsem vynechal # oprávnění, která sám nemáš — do role je dát nemůžeš.}}', { n: predloha.vynechano })}
          </p>
        )}

        {system && !jenCist && (
          <p className="note text-sm flex items-start gap-2">
            <Icon name="info" size={15} className="shrink-0 mt-0.5" />
            <span className="min-w-0">
              {t('Úprava platí jen v tomhle podniku a hned pro všechny, kdo roli mají ({lide}).', { lide: lide(t, system.pocet) })}
              {system.upraveno && system.vychoziOpravneni && (() => {
                const plus = navic(sada, system.vychoziOpravneni).length, minus = navic(system.vychoziOpravneni, sada).length;
                return plus || minus ? ` ${t('Proti výchozí: {plus} navíc, {minus} vypnuto.', { plus, minus })}` : ` ${t('Oprávnění jsou teď stejná jako výchozí.')}`;
              })()}
              {' '}{t('Výchozí stav vrátíš v seznamu rolí tlačítkem „Obnovit výchozí".')}
            </span>
          </p>
        )}
        {system && !jenCist && (vychoziProNove || system.klic === 'barista') && !smiBytVychozi(sada).ok && (
          <p role="alert" className="note note-danger text-sm flex items-start gap-2">
            <Icon name="warning" size={15} className="shrink-0 mt-0.5" />
            <span className="min-w-0">
              {vychoziProNove ? t('Tuhle roli dostane každý nový člen') : t('Baristu dostane nový člen, kdykoli výchozí role nejde použít')} — {t('a {proc}. Takhle ji uložit nepůjde; pro citlivější práva vytvoř vlastní roli.', { proc: smiBytVychozi(sada).proc })}
            </span>
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="min-w-0">
            <Label htmlFor="role-nazev">{t('Název role')}</Label>
            <Input id="role-nazev" value={nazev} maxLength={60} required disabled={!!jenCist}
              placeholder={system?.vychoziNazev ?? t('Třeba Směnový vedoucí')} onChange={e => setNazev(e.target.value)} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="role-popis">{t('Popis (nepovinné)')}</Label>
            <Textarea id="role-popis" value={popis} maxLength={240} rows={2} disabled={!!jenCist}
              placeholder={t('Pro koho role je a co dělá')} onChange={e => setPopis(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="field-label" id="role-typ">{t('Typ rozhraní')}</p>
          {jenCist || system ? (
            <p className="text-sm text-[#16181A] font-semibold">{typNazev(t)[typ]}</p>
          ) : (
            <Segmented ariaLabel={t('Typ rozhraní')} options={typy(t)} value={typ} onChange={zmenTyp} />
          )}
          <p className="text-xs text-black/50 text-pretty">{typVysvetleni(t)[typ]}</p>
          {otevreno.druh === 'vlastni' && typ !== otevreno.role.typ && otevreno.role.pocet > 0 && (
            <p className="note text-xs">{t('Změna typu přepne rozhraní všem, kdo tuhle roli mají ({lide}) — při příštím načtení aplikace.', { lide: lide(t, otevreno.role.pocet) })}</p>
          )}
        </div>
      </div>

      <div className="glass-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <h4 className="t-label flex-1">{t('Oprávnění')}</h4>
          <SearchField value={hledani} onChange={setHledani} storageKey="role-opravneni" className="sm:w-72"
            placeholder={t('Hledat oprávnění…')} ariaLabel={t('Hledat v oprávněních')} />
        </div>
        {info && (
          <p role="status" className="note text-sm flex items-start gap-2">
            <Icon name="info" size={15} className="shrink-0 mt-0.5" /><span className="min-w-0">{info}</span>
          </p>
        )}
        {nicNeodpovida && <EmptyState icon="search" compact title={t('Nic neodpovídá hledání')} hint={t('Zkus jiné slovo — hledá se v názvu i popisu oprávnění.')} />}

        <div className="space-y-2">
          {skupiny.map(({ oblast, vse, shoda }) => {
            if (hleda && shoda.length === 0) return null;
            // Při hledání se hromadně přepíná jen to, co je vidět. Jinak by
            // „Vše" u hledání „zobrazit" zapnulo i citlivé klíče oblasti,
            // které filtr skrývá — a člověk by to poznal až z počítadla.
            const viditelne = hleda ? shoda : vse;
            const zapnuto = vse.filter(o => sada.has(o.id)).length;
            const rozbaleno = hleda || otevrene.has(oblast);
            const idOblasti = `oblast-${OBLASTI.indexOf(oblast)}`;
            const odemcene = viditelne.filter(o => !zamek(o.id));
            const vseZapnute = odemcene.length > 0 && odemcene.every(o => sada.has(o.id));
            return (
              <div key={oblast} className="rounded-2xl border border-black/[0.07] overflow-hidden">
                <div className="flex items-center gap-2 pr-2">
                  <button type="button" aria-expanded={rozbaleno} aria-controls={idOblasti}
                    onClick={() => setOtevrene(s => { const n = new Set(s); if (n.has(oblast)) n.delete(oblast); else n.add(oblast); return n; })}
                    className="flex-1 min-w-0 flex items-center gap-2.5 px-3.5 py-3 text-left hover:bg-black/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#C8F542]">
                    <Icon name="chevron" size={16} className={`shrink-0 text-black/45 transition-transform ${rozbaleno ? 'rotate-180' : ''}`} />
                    <span className="font-semibold text-sm text-[#16181A] truncate">{oblast}</span>
                    <span className={`chip chip-sm shrink-0 tabular-nums ${zapnuto ? 'chip-ok' : 'chip-muted'}`}
                      aria-label={`zapnuto ${zapnuto} z ${vse.length}`}>{zapnuto}/{vse.length}</span>
                  </button>
                  {!jenCist && odemcene.length > 0 && (
                    <Button size="sm" variant="ghost" className="shrink-0"
                      aria-label={t('{akce} {co} v oblasti {oblast}', { akce: vseZapnute ? t('Vypnout') : t('Zapnout'), co: hleda ? t('nalezená oprávnění') : t('vše'), oblast })}
                      onClick={() => prepniOblast(viditelne, !vseZapnute)}>
                      {/* Na telefonu by „Zapnout vše" ukouslo název oblasti. */}
                      <span className="sm:hidden">{vseZapnute ? t('Vypnout') : hleda ? t('Nalezená') : t('Vše')}</span>
                      <span className="hidden sm:inline">{vseZapnute ? (hleda ? t('Vypnout nalezená') : t('Vypnout vše')) : (hleda ? t('Zapnout nalezená') : t('Zapnout vše'))}</span>
                    </Button>
                  )}
                </div>
                {rozbaleno && (
                  <ul id={idOblasti} className="divide-y divide-black/[0.05] border-t border-black/[0.06]">
                    {(hleda ? shoda : vse).map(o => {
                      const on = sada.has(o.id);
                      const z = zamek(o.id);
                      const kvuli = on ? [...sada].filter(j => j !== o.id && popisKlice(j)?.vyzaduje.includes(o.id)) : [];
                      const c = citlivost(t)[o.citlivost] ?? citlivost(t)['nízká']; // i18n-ok
                      const lid = `op-${o.id.replace('.', '-')}`;
                      return (
                        <li key={o.id} className="flex items-start gap-3 px-3.5 py-3">
                          {/* Kolo 69: Switch z components/ui místo vlastní kopie (audit: přepínač
                              s `disabled` ztrácel fokus po každém přepnutí; Switch má aria-disabled). */}
                          <div className="pt-0.5"><Switch checked={on} disabled={!!jenCist || (!!z && !on)} labelledBy={`${lid}-n`} describedBy={`${lid}-p`}
                            onChange={v => prepni(o.id, v)} /></div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span id={`${lid}-n`} className="text-sm font-semibold text-[#16181A]">{o.nazev}</span>
                              <Chip size="sm" tone={c.tone}>{c.text}</Chip>
                            </div>
                            <p id={`${lid}-p`} className="text-xs text-black/50 mt-0.5 text-pretty">
                              {o.popis}
                              {z && <span className="flex items-start gap-1 mt-1 text-black/60"><Icon name="lock" size={12} className="shrink-0 mt-0.5" />{z}</span>}
                            </p>
                            {kvuli.length > 0 && (
                              <p className="text-xs text-[#5B7A08] mt-1">{t('Zapnuto kvůli {seznam}', { seznam: nazvyKlicu(kvuli, 2) })}</p>
                            )}
                            {!on && o.vyzaduje.length > 0 && !z && (
                              <p className="text-xs text-black/45 mt-1">{t('Zapne i {seznam}', { seznam: nazvyKlicu(o.vyzaduje, 2) })}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {chyba && (
        <div role="alert" className="note note-danger p-4 text-sm flex items-start gap-2">
          <Icon name="warning" size={16} className="shrink-0 mt-0.5" /> <span className="min-w-0">{chyba}</span>
        </div>
      )}

      {/* Uložit je na telefonu přilepené dole: po projití čtrnácti oblastí
          by se k tlačítku jinak rolovalo zpátky přes celý katalog. */}
      <div className="sticky bottom-24 md:bottom-4 z-10">
        <div className="glass-strong rounded-2xl p-2.5 flex items-center gap-2 justify-end flex-wrap">
          <Button variant="secondary" onClick={zpet}>{jenCist ? t('Zpět') : t('Zrušit')}</Button>
          {!jenCist && (
            <Button type="submit" variant="accent" icon="check" loading={ukladam} disabled={!nazev.trim() || (otevreno.druh !== 'nova' && !zmeneno)}>
              {otevreno.druh !== 'nova' ? t('Uložit změny') : t('Vytvořit roli')}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
