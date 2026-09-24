'use client';

// Nastavení → Role a oprávnění (kolo 67).
//
// Dvě obrazovky v jedné záložce: seznam rolí (přednastavené z kódu +
// vlastní role podniku) a editor jedné role. Editor je na stránce, ne
// v okně: katalog má přes sto šedesát oprávnění ve čtrnácti oblastech
// a v okně na telefonu by se rolovalo v rolování.
//
// Pravidla, podle kterých server roli přijme nebo odmítne, jsou
// v lib/opravneni.ts (smiUpravitRoli, smiBytVychozi). Editor je zná taky
// a zamyká přepínače předem — ale když server přesto odmítne, ukáže se
// jeho česká hláška doslova. Rozhoduje server, ne tahle obrazovka.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Chip, EmptyState, ErrorState, Input, Label, Modal, SearchField, Segmented, Textarea } from '../ui';
import { okJson, apiMessage, ApiError } from '@/lib/api';
import { czCount } from '@/lib/czech';
import { obsahujeNekde } from '@/lib/hledani';
import {
  KATALOG, OBLASTI, KIOSK_BILA_LISTINA, sZavislostmi, bezZavislych, navic, opravneni as popisKlice,
  type TypRole, type Opravneni,
} from '@/lib/opravneni';
import { obnovOpravneni } from './useOpravneni';

interface SysRole { klic: string; nazev: string; popis: string; typ: TypRole; opravneni: string[]; pocet: number }
interface VlRole { id: number; nazev: string; popis: string | null; typ: TypRole; opravneni: string[]; zdroj: string | null; pocet: number }
interface Ja { jeVlastnik: boolean; klic: string | null; roleId: number | null; nazev: string; opravneni: string[] }
interface Data { system: SysRole[]; vlastni: VlRole[]; vychozi: { id: number | null; klic: string | null }; ja: Ja }

/** Co editor otevírá: novou roli (případně z předlohy), nebo existující vlastní či přednastavenou. */
type Otevreno =
  | { druh: 'nova'; predloha?: { nazev: string; popis: string; typ: TypRole; opravneni: string[]; zdroj: string | null } }
  | { druh: 'vlastni'; role: VlRole }
  | { druh: 'system'; role: SysRole };

const LIDE = { one: 'člověk', few: 'lidé', many: 'lidí' };
const lide = (n: number) => (n === 0 ? 'nikdo' : czCount(n, LIDE));

const TYPY: { id: TypRole; label: string; icon: string }[] = [
  { id: 'vedeni', label: 'Vedení', icon: 'overview' },
  { id: 'zamestnanec', label: 'Zaměstnanec', icon: 'user' },
  { id: 'kiosk', label: 'Tablet', icon: 'cup' },
];
// Typ rozhraní ≠ oprávnění: říká, která aplikace se otevře a koho se
// týká rozvrh a žebříček. Proto má vlastní vysvětlení, ne jen štítek.
const TYP_VYSVETLENI: Record<TypRole, string> = {
  vedeni: 'Otevře se správa podniku. V navigaci uvidí jen obrazovky, na které má oprávnění níže.',
  zamestnanec: 'Otevře se aplikace pro zaměstnance — moje směny, uzávěrka, úkoly. Bere se do rozvrhu a do žebříčku odměn.',
  kiosk: 'Pro sdílený tablet za barem. Jde zapnout jen to, co na tabletu dává smysl — kdo zná heslo tabletu, dostane všechno, co tablet smí.',
};
const TYP_NAZEV: Record<TypRole, string> = { vedeni: 'Vedení', zamestnanec: 'Zaměstnanec', kiosk: 'Tablet' };

const CITLIVOST: Record<string, { tone: 'muted' | 'wait' | 'bad'; text: string }> = {
  'nízká': { tone: 'muted', text: 'Běžné' },
  'střední': { tone: 'wait', text: 'Střední' },
  'vysoká': { tone: 'bad', text: 'Citlivé' },
};

const nazvyKlicu = (ids: string[], max = 3) => {
  const n = ids.slice(0, max).map(id => `„${popisKlice(id)?.nazev ?? id}"`).join(', ');
  return ids.length > max ? `${n} a další ${ids.length - max}` : n;
};

/** Vyhodí z množiny klíče, jejichž závislosti v ní chybí (opak sZavislostmi, bez jednoho vypnutého). */
const beZDer = (sada: Iterable<string>) => bezZavislych(sada, '');

export default function RoleEditor() {
  const [data, setData] = useState<Data | null>(null);
  const [chybaNacteni, setChybaNacteni] = useState<string | null>(null);
  const [otevreno, setOtevreno] = useState<Otevreno | null>(null);
  const [zprava, setZprava] = useState('');
  const [chyba, setChyba] = useState('');
  const [mazat, setMazat] = useState<VlRole | null>(null);
  const [mazu, setMazu] = useState(false);
  const [nastavujiVychozi, setNastavujiVychozi] = useState<string | null>(null);

  const nacti = () => {
    setChybaNacteni(null);
    return fetch('/api/roles').then(okJson)
      .then((d: any) => setData({
        system: Array.isArray(d?.system) ? d.system : [],
        vlastni: Array.isArray(d?.vlastni) ? d.vlastni : [],
        vychozi: d?.vychozi ?? { id: null, klic: 'barista' },
        ja: d?.ja ?? { jeVlastnik: false, klic: null, roleId: null, nazev: '', opravneni: [] },
      }))
      .catch(e => setChybaNacteni(apiMessage(e, 'Role se nepodařilo načíst.')));
  };
  useEffect(() => { nacti(); }, []);

  const flash = (m: string) => { setZprava(m); setChyba(''); setTimeout(() => setZprava(''), 4000); };

  if (chybaNacteni) {
    return <div className="glass-card"><ErrorState title="Role se nepodařilo načíst" hint={chybaNacteni} onRetry={nacti} /></div>;
  }
  if (!data) {
    return <div className="glass-card flex items-center justify-center h-48"><div className="spinner" /></div>;
  }

  const ja = data.ja;
  const moje = new Set(ja.opravneni);
  const smiSpravovat = ja.jeVlastnik || moje.has('tym.role_spravovat');

  if (otevreno) {
    return (
      <EditorRole
        key={otevreno.druh === 'vlastni' ? `v${otevreno.role.id}` : otevreno.druh === 'system' ? `s${otevreno.role.klic}` : 'nova'}
        otevreno={otevreno} ja={ja} smiSpravovat={smiSpravovat}
        onZpet={() => setOtevreno(null)}
        onKopie={(r) => setOtevreno({ druh: 'nova', predloha: predlohaZ(r, ja) })}
        onUlozeno={async (m) => { await nacti(); setOtevreno(null); flash(m); obnovOpravneni(); }}
      />
    );
  }

  const jeVychozi = (r: { klic?: string; id?: number }) =>
    r.id != null ? data.vychozi.id === r.id : data.vychozi.id == null && data.vychozi.klic === r.klic;

  const nastavVychozi = async (telo: { roleId: number } | { klic: string }, nazev: string) => {
    const k = 'roleId' in telo ? `v${telo.roleId}` : `s${telo.klic}`;
    setNastavujiVychozi(k); setChyba('');
    try {
      await fetch('/api/roles/vychozi', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telo) }).then(okJson);
      await nacti();
      flash(`Noví členové teď dostanou roli „${nazev}".`);
    } catch (e) { setChyba(apiMessage(e, 'Výchozí roli se nepodařilo nastavit.')); }
    setNastavujiVychozi(null);
  };

  const smaz = async () => {
    if (!mazat) return;
    setMazu(true); setChyba('');
    try {
      await fetch(`/api/roles/${mazat.id}`, { method: 'DELETE' }).then(okJson);
      const n = mazat.nazev;
      setMazat(null);
      await nacti();
      flash(`Role „${n}" je smazaná.`);
    } catch (e) {
      // 409 (roli někdo má, je výchozí) i 403 říká server česky a přesně.
      setChyba(apiMessage(e, 'Roli se nepodařilo smazat.'));
      setMazat(null);
    }
    setMazu(false);
  };

  return (
    <div className="space-y-4">
      <div className="glass-card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:justify-between">
          <div className="min-w-0">
            <h3 className="font-bold tracking-tight text-[#16181A]">Role a oprávnění</h3>
            <p className="text-black/45 text-sm mt-1 text-pretty">
              Role je sada oprávnění — co člověk v podniku vidí a smí. Přednastavené role jdou jen zkopírovat;
              vlastní si složíš přesně podle toho, jak u vás práce vypadá. Vlastník podniku má vždycky všechno.
            </p>
          </div>
          {smiSpravovat && (
            <Button variant="accent" icon="plus" block className="shrink-0"
              onClick={() => setOtevreno({ druh: 'nova' })}>Nová role</Button>
          )}
        </div>
        {!smiSpravovat && (
          <p className="note mt-4 text-sm flex items-start gap-2">
            <Icon name="lock" size={15} className="shrink-0 mt-0.5" />
            Role si můžeš prohlédnout a přidělovat lidem. Vytvářet a upravovat je může jen ten, kdo má oprávnění „Spravovat role".
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
        <h4 id="role-vlastni" className="t-label mb-2">Vlastní role ({data.vlastni.length})</h4>
        {data.vlastni.length === 0 ? (
          <EmptyState icon="lock" compact title="Zatím žádná vlastní role"
            hint="Zkopíruj přednastavenou (třeba Barista bez uzávěrky) nebo slož novou od nuly." />
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {data.vlastni.map(r => (
              <RadekRole key={r.id} nazev={r.nazev} popis={r.popis} typ={r.typ} pocetOpravneni={r.opravneni.length} pocetLidi={r.pocet}
                vychozi={jeVychozi({ id: r.id })} mojeRole={ja.roleId === r.id}>
                <Button size="sm" variant="secondary" icon={smiSpravovat ? 'pencil' : undefined}
                  onClick={() => setOtevreno({ druh: 'vlastni', role: r })}>{smiSpravovat ? 'Upravit' : 'Zobrazit'}</Button>
                {smiSpravovat && r.typ !== 'kiosk' && !jeVychozi({ id: r.id }) && (
                  <Button size="sm" variant="ghost" loading={nastavujiVychozi === `v${r.id}`}
                    onClick={() => nastavVychozi({ roleId: r.id }, r.nazev)}>Nastavit jako výchozí</Button>
                )}
                {smiSpravovat && (
                  <Button size="sm" variant="danger" icon="trash" iconOnly aria-label={`Smazat roli ${r.nazev}`} title="Smazat roli"
                    onClick={() => { setChyba(''); setMazat(r); }} />
                )}
              </RadekRole>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-card p-5 sm:p-6" aria-labelledby="role-system">
        <h4 id="role-system" className="t-label mb-2">Přednastavené role</h4>
        <ul className="divide-y divide-black/[0.06]">
          {data.system.map(r => (
            <RadekRole key={r.klic} nazev={r.nazev} popis={r.popis} typ={r.typ} pocetOpravneni={r.opravneni.length} pocetLidi={r.pocet}
              vychozi={jeVychozi({ klic: r.klic })} mojeRole={ja.roleId == null && ja.klic === r.klic && !ja.jeVlastnik} system>
              <Button size="sm" variant="ghost" onClick={() => setOtevreno({ druh: 'system', role: r })}>Zobrazit</Button>
              {smiSpravovat && (
                <Button size="sm" variant="secondary" icon="copy"
                  onClick={() => setOtevreno({ druh: 'nova', predloha: predlohaZ(r, ja) })}>Zkopírovat do vlastní</Button>
              )}
              {smiSpravovat && r.typ !== 'kiosk' && !jeVychozi({ klic: r.klic }) && (
                <Button size="sm" variant="ghost" loading={nastavujiVychozi === `s${r.klic}`}
                  onClick={() => nastavVychozi({ klic: r.klic }, r.nazev)}>Nastavit jako výchozí</Button>
              )}
            </RadekRole>
          ))}
        </ul>
      </section>

      <Modal open={!!mazat} onClose={() => !mazu && setMazat(null)} size="sm" title="Smazat roli?"
        footer={<>
          <Button variant="secondary" onClick={() => setMazat(null)} disabled={mazu}>Zrušit</Button>
          <Button variant="danger-solid" icon="trash" loading={mazu} onClick={smaz}
            disabled={!!mazat && (mazat.pocet > 0 || jeVychozi({ id: mazat.id }))}>Smazat</Button>
        </>}>
        {mazat && (
          <div className="space-y-3 text-sm text-black/60">
            <p>Role <strong className="text-[#16181A]">{mazat.nazev}</strong> zmizí. Nepřijaté pozvánky s touhle rolí dostanou při přijetí výchozí roli podniku.</p>
            {mazat.pocet > 0 && (
              <p className="note note-danger">Roli má {lide(mazat.pocet)}. Nejdřív je v Nastavení týmu převeď na jinou roli — jinak by zůstali bez oprávnění.</p>
            )}
            {jeVychozi({ id: mazat.id }) && (
              <p className="note note-danger">Tohle je výchozí role pro nové členy. Nejdřív nastav jako výchozí jinou.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/** Předloha pro kopii: jen oprávnění, která volající sám má (jinak by server kopii odmítl). */
function predlohaZ(r: SysRole | VlRole, ja: Ja) {
  const moje = new Set(ja.opravneni);
  const zdroj = 'klic' in r ? r.klic : null;
  const sada = ja.jeVlastnik ? r.opravneni : beZDer(r.opravneni.filter(k => moje.has(k)));
  return { nazev: `${r.nazev} (kopie)`.slice(0, 60), popis: r.popis ?? '', typ: r.typ, opravneni: sada, zdroj, vynechano: r.opravneni.length - sada.length };
}

function RadekRole({ nazev, popis, typ, pocetOpravneni, pocetLidi, vychozi, mojeRole, system, children }: {
  nazev: string; popis: string | null; typ: TypRole; pocetOpravneni: number; pocetLidi: number;
  vychozi: boolean; mojeRole: boolean; system?: boolean; children: React.ReactNode;
}) {
  return (
    <li className="py-3.5 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-semibold text-[#16181A] min-w-0 break-words">{nazev}</p>
          <Chip size="sm" tone="info">{TYP_NAZEV[typ]}</Chip>
          {vychozi && <Chip size="sm" tone="ok">Výchozí pro nové</Chip>}
          {mojeRole && <Chip size="sm" tone="ink">Tvoje role</Chip>}
          {system && <Chip size="sm" tone="muted" icon="lock">Přednastavená</Chip>}
        </div>
        {popis && <p className="text-xs text-black/50 mt-1 line-clamp-2 text-pretty">{popis}</p>}
        <p className="text-xs text-black/45 mt-1 tabular-nums">{pocetOpravneni} oprávnění · {lide(pocetLidi)}</p>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap shrink-0">{children}</div>
    </li>
  );
}

function Prepinac({ on, onChange, disabled, labelledBy, describedBy }: {
  on: boolean; onChange: (v: boolean) => void; disabled?: boolean; labelledBy: string; describedBy?: string;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-labelledby={labelledBy} aria-describedby={describedBy}
      disabled={disabled} onClick={() => onChange(!on)}
      className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors duration-300 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] focus-visible:ring-offset-2 ${on ? 'bg-[#C8F542]' : 'bg-black/[0.12]'}`}>
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-[#FDFDFB] shadow-sm transition-transform duration-300 ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  );
}

function EditorRole({ otevreno, ja, smiSpravovat, onZpet, onKopie, onUlozeno }: {
  otevreno: Otevreno; ja: Ja; smiSpravovat: boolean;
  onZpet: () => void; onKopie: (r: SysRole | VlRole) => void; onUlozeno: (zprava: string) => void | Promise<void>;
}) {
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
  const mimoMoje = otevreno.druh === 'vlastni' && !ja.jeVlastnik ? navic(otevreno.role.opravneni, moje) : [];
  const jenCist: string | null =
    otevreno.druh === 'system' ? 'Přednastavená role se nedá upravit. Zkopíruj ji do vlastní a uprav kopii.'
    : !smiSpravovat ? 'Na správu rolí nemáš oprávnění — roli si můžeš jen prohlédnout.'
    : otevreno.druh === 'vlastni' && !ja.jeVlastnik && ja.roleId === otevreno.role.id ? 'Tohle je tvoje vlastní role. Upravit ji může jen někdo jiný — jinak by si kdokoli mohl přidat práva sám.'
    : mimoMoje.length ? `Tahle role má oprávnění, která ty nemáš (${nazvyKlicu(mimoMoje)}) — upravit ji může jen někdo s nimi.`
    : null;

  const zamek = (id: string): string | null => {
    if (typ === 'kiosk' && !KIOSK_BILA_LISTINA.has(id)) return 'Tablet tohle mít nesmí — kdo zná heslo tabletu, dostal by to taky.';
    if (!ja.jeVlastnik && !moje.has(id)) return 'Sám tohle oprávnění nemáš, takže ho do role dát nemůžeš.';
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
        setInfo(`„${popisKlice(id)?.nazev}" nejde zapnout: potřebuje „${popisKlice(v.blokuje)?.nazev}" — ${zamek(v.blokuje)?.charAt(0).toLowerCase()}${zamek(v.blokuje)?.slice(1)}`);
        return;
      }
      setSada(v.dalsi);
      setInfo(v.pridano.length ? `Zapnuto i ${nazvyKlicu(v.pridano)} — „${popisKlice(id)?.nazev}" bez toho nefunguje.` : '');
    } else {
      const zbyva = new Set(bezZavislych(sada, id));
      const vypnuto = [...sada].filter(k => k !== id && !zbyva.has(k));
      setSada(zbyva);
      setInfo(vypnuto.length ? `Vypnuto i ${nazvyKlicu(vypnuto)} — stojí na „${popisKlice(id)?.nazev}".` : '');
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
      setInfo(zbylo > 0 ? `${czCount(zbylo, { one: 'oprávnění zůstalo', few: 'oprávnění zůstala', many: 'oprávnění zůstalo' })} vypnuté — je zamčené.` : '');
    } else {
      let s: Iterable<string> = sada;
      for (const o of klice) if (sada.has(o.id) && !zamek(o.id)) s = bezZavislych(s, o.id);
      const zbyva = new Set(s);
      const mimo = [...sada].filter(k => !zbyva.has(k) && popisKlice(k)?.oblast !== klice[0]?.oblast);
      setSada(zbyva);
      setInfo(mimo.length ? `Vypnuto i ${nazvyKlicu(mimo)} z jiných oblastí — stály na vypnutých.` : '');
    }
  };

  const zmenTyp = (t: TypRole) => {
    setTyp(t);
    if (t !== 'kiosk') { setInfo(''); return; }
    // Tablet smí jen bílou listinu; co mimo ni, se vypne i se vším, co na tom stojí.
    let s: Iterable<string> = sada;
    for (const k of sada) if (!KIOSK_BILA_LISTINA.has(k)) s = bezZavislych(s, k);
    const zbyva = new Set(s);
    const vypnuto = sada.size - zbyva.size;
    setSada(zbyva);
    setInfo(vypnuto ? `Tablet nesmí mít ${czCount(vypnuto, { one: 'oprávnění', few: 'oprávnění', many: 'oprávnění' })} z původního výběru — vypnula se.` : '');
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

  const zpet = () => {
    if (!jenCist && zmeneno && !window.confirm('Zahodit neuložené změny role?')) return;
    onZpet();
  };

  const uloz = async (e: React.FormEvent) => {
    e.preventDefault();
    if (jenCist) return;
    if (!nazev.trim()) { setChyba('Zadej název role.'); return; }
    setUkladam(true); setChyba('');
    const telo = { nazev: nazev.trim(), popis: popis.trim(), typ, opravneni: [...sada].sort() };
    try {
      if (otevreno.druh === 'vlastni') {
        await fetch(`/api/roles/${otevreno.role.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(telo) }).then(okJson);
        await onUlozeno(`Role „${telo.nazev}" je uložená.`);
      } else {
        const zdroj = otevreno.druh === 'nova' ? otevreno.predloha?.zdroj ?? null : null;
        await fetch('/api/roles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...telo, zdroj }) }).then(okJson);
        await onUlozeno(`Role „${telo.nazev}" je vytvořená. Přidělíš ji v Nastavení týmu u člověka.`);
      }
    } catch (err) {
      // 403 s důvodem („Roli nemůžeš dát oprávnění, která sám nemáš: …")
      // se ukáže doslova — je to přesnější než cokoli, co by odhadl klient.
      setChyba(apiMessage(err, 'Roli se nepodařilo uložit.') + (err instanceof ApiError && err.status >= 500 ? ' Zkus to prosím znovu.' : ''));
      setUkladam(false);
    }
  };

  const nadpis = otevreno.druh === 'nova' ? 'Nová role' : otevreno.role.nazev;
  const predloha = otevreno.druh === 'nova' ? otevreno.predloha as (undefined | { vynechano?: number }) : undefined;

  return (
    <form onSubmit={uloz} className="space-y-4 pb-24 md:pb-0" aria-labelledby="role-editor-nadpis">
      <div className="glass-card p-5 sm:p-6 space-y-5">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" icon="chevron" iconOnly aria-label="Zpět na seznam rolí" className="rotate-90 shrink-0 -ml-2" onClick={zpet} />
          <div className="min-w-0 flex-1">
            <h3 id="role-editor-nadpis" className="font-bold tracking-tight text-[#16181A] break-words">{nadpis}</h3>
            <p className="text-sm text-black/45 mt-0.5 tabular-nums">Zapnuto {sada.size} ze {KATALOG.length} oprávnění</p>
          </div>
        </div>

        {jenCist && (
          <div className="note text-sm flex flex-col sm:flex-row sm:items-center gap-2.5">
            <span className="flex items-start gap-2 min-w-0 flex-1"><Icon name="lock" size={15} className="shrink-0 mt-0.5" />{jenCist}</span>
            {smiSpravovat && otevreno.druh !== 'nova' && (
              <Button size="sm" variant="secondary" icon="copy" className="shrink-0" onClick={() => onKopie(otevreno.role)}>Zkopírovat do vlastní</Button>
            )}
          </div>
        )}
        {!!predloha?.vynechano && (
          <p className="note text-sm flex items-start gap-2">
            <Icon name="info" size={15} className="shrink-0 mt-0.5" />
            Z předlohy jsem vynechal {czCount(predloha.vynechano, { one: 'oprávnění', few: 'oprávnění', many: 'oprávnění' })}, která sám nemáš — do role je dát nemůžeš.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="min-w-0">
            <Label htmlFor="role-nazev">Název role</Label>
            <Input id="role-nazev" value={nazev} maxLength={60} required disabled={!!jenCist}
              placeholder="Třeba Směnový vedoucí" onChange={e => setNazev(e.target.value)} />
          </div>
          <div className="min-w-0">
            <Label htmlFor="role-popis">Popis (nepovinné)</Label>
            <Textarea id="role-popis" value={popis} maxLength={240} rows={2} disabled={!!jenCist}
              placeholder="Pro koho role je a co dělá" onChange={e => setPopis(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="field-label" id="role-typ">Typ rozhraní</p>
          {jenCist ? (
            <p className="text-sm text-[#16181A] font-semibold">{TYP_NAZEV[typ]}</p>
          ) : (
            <Segmented ariaLabel="Typ rozhraní" options={TYPY} value={typ} onChange={zmenTyp} />
          )}
          <p className="text-xs text-black/50 text-pretty">{TYP_VYSVETLENI[typ]}</p>
          {otevreno.druh === 'vlastni' && typ !== otevreno.role.typ && otevreno.role.pocet > 0 && (
            <p className="note text-xs">Změna typu přepne rozhraní všem, kdo tuhle roli mají ({lide(otevreno.role.pocet)}) — při příštím načtení aplikace.</p>
          )}
        </div>
      </div>

      <div className="glass-card p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <h4 className="t-label flex-1">Oprávnění</h4>
          <SearchField value={hledani} onChange={setHledani} storageKey="role-opravneni" className="sm:w-72"
            placeholder="Hledat oprávnění…" ariaLabel="Hledat v oprávněních" />
        </div>
        {info && (
          <p role="status" className="note text-sm flex items-start gap-2">
            <Icon name="info" size={15} className="shrink-0 mt-0.5" /><span className="min-w-0">{info}</span>
          </p>
        )}
        {nicNeodpovida && <EmptyState icon="search" compact title="Nic neodpovídá hledání" hint="Zkus jiné slovo — hledá se v názvu i popisu oprávnění." />}

        <div className="space-y-2">
          {skupiny.map(({ oblast, vse, shoda }) => {
            if (hleda && shoda.length === 0) return null;
            const zapnuto = vse.filter(o => sada.has(o.id)).length;
            const rozbaleno = hleda || otevrene.has(oblast);
            const idOblasti = `oblast-${OBLASTI.indexOf(oblast)}`;
            const odemcene = vse.filter(o => !zamek(o.id));
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
                      aria-label={`${vseZapnute ? 'Vypnout' : 'Zapnout'} vše v oblasti ${oblast}`}
                      onClick={() => prepniOblast(vse, !vseZapnute)}>
                      {/* Na telefonu by „Zapnout vše" ukouslo název oblasti. */}
                      <span className="sm:hidden">{vseZapnute ? 'Vypnout' : 'Vše'}</span>
                      <span className="hidden sm:inline">{vseZapnute ? 'Vypnout vše' : 'Zapnout vše'}</span>
                    </Button>
                  )}
                </div>
                {rozbaleno && (
                  <ul id={idOblasti} className="divide-y divide-black/[0.05] border-t border-black/[0.06]">
                    {(hleda ? shoda : vse).map(o => {
                      const on = sada.has(o.id);
                      const z = zamek(o.id);
                      const kvuli = on ? [...sada].filter(j => j !== o.id && popisKlice(j)?.vyzaduje.includes(o.id)) : [];
                      const c = CITLIVOST[o.citlivost] ?? CITLIVOST['nízká'];
                      const lid = `op-${o.id.replace('.', '-')}`;
                      return (
                        <li key={o.id} className="flex items-start gap-3 px-3.5 py-3">
                          <div className="pt-0.5"><Prepinac on={on} disabled={!!jenCist || (!!z && !on)} labelledBy={`${lid}-n`} describedBy={`${lid}-p`}
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
                              <p className="text-xs text-[#5B7A08] mt-1">Zapnuto kvůli {nazvyKlicu(kvuli, 2)}</p>
                            )}
                            {!on && o.vyzaduje.length > 0 && !z && (
                              <p className="text-xs text-black/45 mt-1">Zapne i {nazvyKlicu(o.vyzaduje, 2)}</p>
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
          <Button variant="secondary" onClick={zpet}>{jenCist ? 'Zpět' : 'Zrušit'}</Button>
          {!jenCist && (
            <Button type="submit" variant="accent" icon="check" loading={ukladam} disabled={!nazev.trim() || (otevreno.druh === 'vlastni' && !zmeneno)}>
              {otevreno.druh === 'vlastni' ? 'Uložit změny' : 'Vytvořit roli'}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
