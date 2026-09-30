'use client';

import { useMemo, useState } from 'react';
import { Button, Card, Chip, Field, Input, Menu, Modal, PlovouciLista, Segmented, Switch, type MenuItem } from './ui';
import { Icon } from './Icons';
import { useCurrency } from './CurrencyProvider';
import { useJazyk, useT } from '@/lib/i18n/client';
import { JAZYK_NAZEV } from '@/lib/i18n/config';
import {
  slozNavigaci, normalizujNavKonfig, VYCHOZI_NAV, NEUKRYVATELNE, MAX_DOK, PRAZDNE_ROZHRANI,
  type NavKonfig, type NavRozhraniKonfig, type Rozhrani,
} from '@/lib/navigace';
import { okJson } from '@/lib/api';

// Přizpůsobení navigace aplikace (Nastavení týmu → Navigace).
//
// Podnik si skryje sekce, které nepoužívá, přejmenuje je a přeuspořádá skupiny
// i spodní dok. Je to PREFERENCE, ne oprávnění: co role nesmí, se nezobrazí nikdy
// bez ohledu na tohle nastavení; skrytá sekce zůstává dostupná odkazem a z widgetů
// a widgety na Přehledu zůstávají (logika je v lib/navigace.ts a má testy).
//
// Změny se ukládají dávkou (přeuspořádání po částech vypadá rozbitě), proto je
// jedna limetka „Uložit" v plovoucí liště a nikde jinde. Správa zůstává česky
// (plán vícejazyčnosti: správa se nemigruje); přeložené jsou jen názvy sekcí,
// které odpovídají tomu, co uživatel uvidí v navigaci.

const PRAZDNA: NavKonfig = { v: 1, vedeni: { ...PRAZDNE_ROZHRANI }, zamestnanec: { ...PRAZDNE_ROZHRANI } };
const kopie = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

export default function NavigaceNastaveni() {
  const { navConfig, obnov } = useCurrency();
  const { jazyk } = useJazyk();
  const t = useT();
  const [rozhrani, setRozhrani] = useState<Rozhrani>('vedeni');
  const [draft, setDraft] = useState<NavKonfig>(() => kopie(navConfig ?? PRAZDNA));
  const [zmeneno, setZmeneno] = useState(false);
  const [ukladam, setUkladam] = useState(false);
  const [chyba, setChyba] = useState('');
  const [hotovo, setHotovo] = useState('');
  const [prejmenovani, setPrejmenovani] = useState<{ id: string; text: string } | null>(null);

  const kfg = draft[rozhrani];
  const vychozi = VYCHOZI_NAV[rozhrani];
  const preloz = (cs: string) => t(cs, undefined, 'nav');

  // Plná navigace bez ohledu na oprávnění: tady se nastavuje to, co podnik chce,
  // a co role nesmí, rozhodne při zobrazení oprávnění (lib/navigace.ts).
  const nav = useMemo(() => slozNavigaci({ rozhrani, smiPohled: () => true, nastaveni: draft, jazyk, nazev: preloz }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rozhrani, draft, jazyk, t]);

  const uprav = (fn: (k: NavRozhraniKonfig) => void) => {
    setDraft(d => { const n = kopie(d); fn(n[rozhrani]); return n; });
    setZmeneno(true); setHotovo(''); setChyba('');
  };

  /** Vlastní skupiny se zakládají až při prvním přeuspořádání: z toho, co je právě vidět. */
  const zajistiSekce = (k: NavRozhraniKonfig) => {
    if (!k.sekce) k.sekce = nav.sekce.map(s => ({ id: s.id, nazev: null, ids: s.items.map(i => i.id) }));
  };
  const posun = (id: string, smer: -1 | 1) => uprav(k => {
    zajistiSekce(k);
    const s = k.sekce!.find(x => x.ids.includes(id));
    if (!s) return;
    const i = s.ids.indexOf(id), j = i + smer;
    if (j < 0 || j >= s.ids.length) return;
    [s.ids[i], s.ids[j]] = [s.ids[j], s.ids[i]];
  });
  const zobrazit = (id: string, zapnuto: boolean) => uprav(k => {
    const s = new Set(k.skryte);
    if (zapnuto) s.delete(id); else s.add(id);
    k.skryte = Array.from(s);
    // Skrytá položka nemá být v docku: dok se doplní z ostatních při skládání.
    if (!zapnuto && k.dok) k.dok = k.dok.filter(x => x !== id);
  });
  const prepniDok = (id: string) => uprav(k => {
    const aktualni = k.dok ?? nav.dok.map(d => d.id);
    k.dok = aktualni.includes(id) ? aktualni.filter(x => x !== id) : [...aktualni, id].slice(0, MAX_DOK);
  });
  const uloz = async () => {
    setUkladam(true); setChyba('');
    try {
      const telo = normalizujNavKonfig(draft);
      const r = await fetch('/api/teams', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ navConfig: telo }) });
      await okJson(r);
      setZmeneno(false); setHotovo('Navigace je uložená.');
      obnov();
    } catch (e: any) {
      setChyba(e?.message || 'Navigaci se nepodařilo uložit.');
    } finally { setUkladam(false); }
  };

  const dokIds = nav.dok.map(d => d.id);

  return (
    <Card aria-labelledby="tym-nav-t" className="space-y-4">
      <div>
        <h2 id="tym-nav-t" className="t-card flex items-center gap-2"><Icon name="menu" size={17} className="shrink-0 text-black/40" /> Navigace aplikace</h2>
        <p className="t-meta mt-1 text-pretty">
          Skryj sekce, které podnik nepoužívá, přejmenuj je a přeskládej. Je to jen preference: kdo má k sekci právo, otevře ji pořád odkazem a widgety na Přehledu zůstanou.
        </p>
      </div>

      <Segmented ariaLabel="Pro koho navigaci nastavuješ" value={rozhrani} onChange={setRozhrani}
        options={[{ id: 'vedeni', label: 'Vedení' }, { id: 'zamestnanec', label: 'Zaměstnanci' }]} />

      <div className="space-y-2">
        {nav.sekce.concat(nav.skryte.length ? [{ id: '__skryte', title: 'Skryté', items: nav.skryte }] : []).map(sekce => (
          <section key={sekce.id} aria-label={sekce.title ?? 'Přehled'}>
            <p className="t-label pt-2 pb-0.5">{sekce.title ?? 'Přehled'}</p>
            <ul className="list">
              {sekce.items.map((p, i, arr) => {
                const skryta = sekce.id === '__skryte';
                const pevna = NEUKRYVATELNE[rozhrani].includes(p.id);
                const vlastni = kfg.prejmenovat[p.id]?.[jazyk];
                const vychoziNazev = preloz(vychozi.polozky.find(x => x.id === p.id)?.label ?? p.label);
                const polozky: MenuItem[] = [
                  { label: 'Přejmenovat', icon: 'pencil', onClick: () => setPrejmenovani({ id: p.id, text: vlastni ?? '' }) },
                  ...(!skryta ? [
                    { label: 'Posunout nahoru', icon: 'chevron', onClick: () => posun(p.id, -1), disabled: i === 0 },
                    { label: 'Posunout dolů', icon: 'chevron', onClick: () => posun(p.id, 1), disabled: i === arr.length - 1 },
                  ] : []),
                  ...(vlastni ? [{ label: 'Vrátit výchozí název', icon: 'undo', onClick: () => uprav(k => { delete k.prejmenovat[p.id]?.[jazyk]; if (k.prejmenovat[p.id] && !Object.keys(k.prejmenovat[p.id]).length) delete k.prejmenovat[p.id]; }) }] : []),
                ];
                return (
                  <li key={p.id} className="flex items-center gap-3 py-2.5 min-h-[3.25rem]">
                    <Icon name={p.icon} size={18} className="shrink-0 text-black/45" />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-sm font-medium truncate ${skryta ? 'text-black/50' : 'text-[#16181A]'}`}>{p.label}</span>
                      {vlastni && <span className="block text-xs text-black/50 truncate">Výchozí: {vychoziNazev}</span>}
                      {pevna && <span className="block text-xs text-black/50">Vždy viditelné</span>}
                    </span>
                    <Switch checked={!skryta} disabled={pevna} label={`${p.label}: zobrazit v navigaci`} onChange={v => zobrazit(p.id, v)} />
                    <Menu items={polozky} label={`Další akce: ${p.label}`} size="sm" />
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div>
        <p className="t-label mb-2">Spodní dok na telefonu</p>
        <p className="t-meta mb-2 text-pretty">Nejvýš {MAX_DOK} položky. Kolik jich zvolíš, tolik se ukáže; co chybí, se doplní z výchozích.</p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Položky spodního docku">
          {nav.vse.map(p => {
            const v = dokIds.includes(p.id);
            return (
              <button key={p.id} type="button" aria-pressed={v} onClick={() => prepniDok(p.id)}
                className={`chip ${v ? 'chip-ink' : 'chip-muted'} min-h-[44px] px-4 cursor-pointer`}>
                {p.label}
              </button>
            );
          })}
        </div>
        <p className="t-meta mt-2" aria-live="polite">{dokIds.length} z {MAX_DOK}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" icon="undo" disabled={!kfg.skryte.length && !kfg.dok && !kfg.sekce && !Object.keys(kfg.prejmenovat).length}
          onClick={() => uprav(k => { k.skryte = []; k.dok = null; k.sekce = null; k.prejmenovat = {}; })}>
          Vrátit výchozí navigaci
        </Button>
        {nav.skryte.length > 0 && <Chip tone="muted" size="sm">Skryto: {nav.skryte.length}</Chip>}
      </div>
      {nav.skryte.length > 0 && <p className="note note-info text-pretty">Widgety skrytých sekcí na Přehledu zůstanou. Skrytí nikomu neodebírá oprávnění.</p>}
      {chyba && <p className="note note-danger" role="alert">{chyba}</p>}
      {hotovo && <p className="t-meta" role="status">{hotovo}</p>}

      <Modal open={prejmenovani != null} onClose={() => setPrejmenovani(null)} size="sm" title="Přejmenovat sekci"
        subtitle={`Název platí pro jazyk ${JAZYK_NAZEV[jazyk]}. V ostatních jazycích se ukáže výchozí název.`}
        footer={<>
          <Button variant="secondary" onClick={() => setPrejmenovani(null)}>Zrušit</Button>
          <Button variant="primary" type="submit" form="nav-prejmenovat">Použít</Button>
        </>}>
        <form id="nav-prejmenovat" onSubmit={e => {
          e.preventDefault();
          if (!prejmenovani) return;
          const { id, text } = prejmenovani;
          const cisty = text.replace(/\s+/g, ' ').trim().slice(0, 30);
          uprav(k => {
            const m = { ...(k.prejmenovat[id] ?? {}) };
            if (cisty) m[jazyk] = cisty; else delete m[jazyk];
            if (Object.keys(m).length) k.prejmenovat[id] = m; else delete k.prejmenovat[id];
          });
          setPrejmenovani(null);
        }}>
          <Field id="nav-prejmenovat-pole" label="Nový název" hint="Nejvýš 30 znaků. Prázdné pole vrátí výchozí název.">
            <Input id="nav-prejmenovat-pole" autoFocus maxLength={30} value={prejmenovani?.text ?? ''}
              placeholder={prejmenovani ? preloz(vychozi.polozky.find(x => x.id === prejmenovani.id)?.label ?? '') : ''}
              onChange={e => setPrejmenovani(p => (p ? { ...p, text: e.target.value } : p))} />
          </Field>
        </form>
      </Modal>

      {/* Jedna limetka na obrazovce: uložení dávkou. */}
      <PlovouciLista label="Neuložené změny navigace" open={zmeneno} animate>
        <span className="text-sm font-medium text-white">Neuložené změny navigace</span>
        <button type="button" onClick={uloz} disabled={ukladam} className="btn btn-accent btn-sm">{ukladam ? 'Ukládám…' : 'Uložit'}</button>
      </PlovouciLista>
    </Card>
  );
}
