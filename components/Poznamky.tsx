'use client';

// Poznámky k jedné věci — k úkolu, návodu, postupu, receptuře z kasy nebo
// položce skladu. Jedna komponenta pro všechny detaily (DP: desátá podoba
// téhož nevznikne), data přes sdílenou mezipaměť useDataWidgetu, takže počet
// v nadpisu i seznam vidí všichni, kdo se na tutéž věc dívají.
//
// Jak to chodí jinde (Notion, Asana, Linear): komentáře pod obsahem od
// nejstaršího, avatar + jméno + „před 2 h", vlastní jde upravit a smazat
// přes „···", pole na konci, Enter dělá nový řádek a Ctrl/⌘+Enter odešle.
// Nová poznámka se ukáže hned (optimisticky) a když ji server odmítne,
// vrátí se do pole i s hláškou — tiše nezmizí nic.
//
// Tablet (kiosk) píše za vybraného člověka: bez něj se před odesláním zeptá
// (stejné okno jako u potvrzení přečtení návodu), poznámka podepsaná „tablet"
// by nikomu nic neřekla. Kdo smí mazat, rozhodl server (`muzuSmazat`) —
// tady se tlačítko jen schová.

import { useEffect, useId, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Avatar, Button, Chip, ErrorState, Menu, Modal, Skeleton, Textarea, type MenuItem } from './ui';
import { Icon } from './Icons';
import { obnovDataWidgetu, useDataWidgetu } from './widgety/useDataWidgetu';
import { okJson, apiMessage } from '@/lib/api';
import { useT, useJazyk, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { LOCALE_PRO_JAZYK } from '@/lib/i18n/config';
import type { Jazyk } from '@/lib/i18n/config';
import {
  MAX_DELKA_POZNAMKY, kusyTextu, navrhyZminek, normalizujTextPoznamky, relativniCas, urlPoctu, urlPoznamek, vlozZminku, vyberPoznamky,
  type ClovekKeZmince, type Poznamka, type TypPoznamky,
} from '@/lib/poznamky';

/** Lidé podniku pro @zmínky — tentýž /api/teams jako jinde, jen jména (bez tabletu). */
const URL_LIDE = '/api/teams';
const vyberLidi = (raw: any): ClovekKeZmince[] =>
  (Array.isArray(raw?.members) ? raw.members : []).filter((m: any) => m && m.id != null && m.role !== 'kiosk')
    .map((m: any) => ({ id: Number(m.id), name: String(m.name ?? ''), avatar: m.avatar ?? null }));

/** Připnutá úvodní zpráva vlákna (třeba „Poznámka vedení" u uzávěrky) — není v databázi poznámek, jen se kreslí první. */
export interface UvodVlakna { text: string; autor: string; avatar?: string | null; kdy?: string | null; popisek: string }

/** Člověk vybraný u tabletu — za něj se poznámka píše. */
export interface AutorNaTabletu { id: number; name: string }

/** „před 5 min", „před 2 h", po týdnu datum — čas poznámky v jazyce uživatele. */
function kdyNapsano(iso: string, t: PrekladFn, jazyk: Jazyk): string {
  const r = relativniCas(iso);
  if (r.druh === 'ted') return t('právě teď');
  if (r.druh === 'min') return t('před {n} min', { n: r.n });
  if (r.druh === 'h') return t('před {n} h', { n: r.n });
  if (r.druh === 'den') return t('před {n, plural, one {# dnem} few {# dny} other {# dny}}', { n: r.n });
  return fmtDatum(iso, { jazyk, styl: 'kratce' });
}

export function Poznamky({ typ, id, tablet = false, zaKoho = null, vyberKoho, uvod = null, className = '' }: {
  typ: TypPoznamky;
  /** Id věci; u receptury z kasy product_id pokladny. */
  id: string | number;
  /** Sdílený tablet: píše se za `zaKoho`; bez něj se před odesláním zeptá `vyberKoho`. */
  tablet?: boolean;
  zaKoho?: AutorNaTabletu | null;
  vyberKoho?: () => Promise<AutorNaTabletu | null>;
  /** Připnutá první zpráva vlákna mimo poznámky (review_note uzávěrky). */
  uvod?: UvodVlakna | null;
  className?: string;
}) {
  const t = useT('spolecne');
  const { jazyk } = useJazyk();
  const { data: relace } = useSession();
  const uid = useId();
  const url = urlPoznamek(typ, id, tablet ? zaKoho?.id ?? null : null);
  const data = useDataWidgetu<Poznamka[]>(url, vyberPoznamky);
  const poznamky = data.data ?? [];
  // Lidé pro @zmínky se načtou, až je někdo potřebuje („@" v poli) nebo je co zvýraznit.
  const [chceLidi, setChceLidi] = useState(false);
  const lideData = useDataWidgetu<ClovekKeZmince[]>(chceLidi ? URL_LIDE : null, vyberLidi);
  const lide = lideData.data ?? [];
  // Otevřené vlákno = přečtené (server si to zapsal při GET): bublina v seznamu přestane být tučná.
  useEffect(() => { if (data.data) obnovDataWidgetu(urlPoctu(typ)); }, [data.data, typ]);
  useEffect(() => { if (poznamky.some(p => p.zminky.length)) setChceLidi(true); }, [poznamky]);

  const [navrh, setNavrh] = useState('');
  const [kurzor, setKurzor] = useState(0);
  const poleRef = useRef<HTMLTextAreaElement>(null);
  const [odesilam, setOdesilam] = useState(false);
  const [chyba, setChyba] = useState('');
  const [uprava, setUprava] = useState<{ id: number; text: string } | null>(null);
  const [ukladam, setUkladam] = useState(false);
  const [mazani, setMazani] = useState<Poznamka | null>(null);
  const [mazu, setMazu] = useState(false);

  const hlavicky = { 'Content-Type': 'application/json' };
  // Tablet posílá, za koho jedná; jinde rozhodne relace.
  const zaId = tablet ? zaKoho?.id ?? null : null;
  const sZaKoho = (telo: Record<string, unknown>, kdo: AutorNaTabletu | null) => (kdo ? { ...telo, actingAs: kdo.id } : telo);
  const cesta = (q: Record<string, string>) => `/api/notes?${new URLSearchParams({ ...q, ...(zaId != null ? { actingAs: String(zaId) } : {}) })}`;

  const odesli = async () => {
    const text = normalizujTextPoznamky(navrh);
    if (!text || odesilam) return;
    // Tablet bez vybraného člověka: nejdřív kdo, pak co.
    let kdo: AutorNaTabletu | null = tablet ? zaKoho : null;
    if (tablet && !kdo) {
      kdo = vyberKoho ? await vyberKoho() : null;
      if (!kdo) return;
    }
    const ja = relace?.user as { name?: string | null; avatar?: string | null } | undefined;
    const docasna: Poznamka = {
      id: -Date.now(), text, createdAt: new Date().toISOString(), updatedAt: null,
      autor: { id: kdo?.id ?? 0, name: kdo?.name || ja?.name || t('Já'), avatar: kdo ? null : ja?.avatar ?? null },
      moje: true, muzuSmazat: true, pripnuta: false, zminky: [],
    };
    setOdesilam(true);
    setChyba('');
    setNavrh('');
    data.set(prev => [...(prev ?? []), docasna]);
    try {
      const r = await fetch('/api/notes', { method: 'POST', headers: hlavicky, body: JSON.stringify(sZaKoho({ typ, id, text }, kdo)) });
      await okJson(r);
      obnovDataWidgetu(url);
      obnovDataWidgetu(urlPoctu(typ));
    } catch (e) {
      // Server poznámku nevzal: zpátky do pole, ať se text neztratí, a říct proč.
      data.set(prev => (prev ?? []).filter(p => p.id !== docasna.id));
      setNavrh(text);
      setChyba(apiMessage(e, t('Poznámku se nepodařilo uložit.')));
    } finally {
      setOdesilam(false);
    }
  };

  const ulozUpravu = async () => {
    if (!uprava || ukladam) return;
    const text = normalizujTextPoznamky(uprava.text);
    if (!text) return;
    setUkladam(true);
    setChyba('');
    try {
      const r = await fetch('/api/notes', { method: 'PATCH', headers: hlavicky, body: JSON.stringify(sZaKoho({ id: uprava.id, text }, zaKoho && tablet ? zaKoho : null)) });
      const nova = await okJson(r) as Poznamka;
      data.set(prev => (prev ?? []).map(p => (p.id === uprava.id ? { ...p, text: nova?.text ?? text, updatedAt: nova?.updatedAt ?? new Date().toISOString() } : p)));
      setUprava(null);
      obnovDataWidgetu(url);
    } catch (e) {
      setChyba(apiMessage(e, t('Poznámku se nepodařilo uložit.')));
    } finally {
      setUkladam(false);
    }
  };

  // Připnout nahoru / odepnout — autor (DP: Resy „Pin" u hosta). Server pořadí vrátí, tady se jen překreslí.
  const [pripinam, setPripinam] = useState<number | null>(null);
  const pripni = async (p: Poznamka, pripnuta: boolean) => {
    if (pripinam != null) return;
    setPripinam(p.id);
    setChyba('');
    try {
      const r = await fetch('/api/notes', { method: 'PATCH', headers: hlavicky, body: JSON.stringify(sZaKoho({ id: p.id, pripnuta }, zaKoho && tablet ? zaKoho : null)) });
      await okJson(r);
      obnovDataWidgetu(url);
    } catch (e) {
      setChyba(apiMessage(e, t('Poznámku se nepodařilo uložit.')));
    } finally {
      setPripinam(null);
    }
  };

  // @zmínka: našeptávač pod polem, klepnutí vloží „@Jméno " a vrátí fokus do pole.
  const navrhyLidi = navrh.includes('@') ? navrhyZminek(navrh, kurzor, lide) : null;
  const sledujKurzor = (el: HTMLTextAreaElement | null) => { if (el) setKurzor(el.selectionStart ?? el.value.length); };
  const vyberZminku = (jmeno: string) => {
    if (!navrhyLidi) return;
    const v = vlozZminku(navrh, navrhyLidi.od, kurzor, jmeno);
    setNavrh(v.text);
    setKurzor(v.kurzor);
    requestAnimationFrame(() => { const el = poleRef.current; if (el) { el.focus(); el.setSelectionRange(v.kurzor, v.kurzor); } });
  };

  const smaz = async () => {
    if (!mazani || mazu) return;
    const cil = mazani;
    setMazu(true);
    setChyba('');
    try {
      const r = await fetch(cesta({ id: String(cil.id) }), { method: 'DELETE' });
      await okJson(r);
      data.set(prev => (prev ?? []).filter(p => p.id !== cil.id));
      setMazani(null);
      obnovDataWidgetu(url);
    } catch (e) {
      setMazani(null);
      setChyba(apiMessage(e, t('Poznámku se nepodařilo smazat.')));
    } finally {
      setMazu(false);
    }
  };

  const naKlavesu = (e: React.KeyboardEvent<HTMLTextAreaElement>, akce: () => void) => {
    // Enter = nový řádek (poznámka mívá víc řádků); Ctrl/⌘+Enter odešle.
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); akce(); }
  };

  const presne = (iso: string) => new Date(iso).toLocaleString(LOCALE_PRO_JAZYK[jazyk], { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Prague' });
  const pocet = data.data ? poznamky.length : null;

  return (
    <section className={`min-w-0 ${className}`} aria-labelledby={`${uid}-nadpis`}>
      <h3 id={`${uid}-nadpis`} className="t-card">
        {t('Poznámky')}{pocet != null && pocet > 0 && <span className="font-normal text-black/55"> · {pocet}</span>}
      </h3>

      {data.error && !data.data ? (
        <ErrorState compact title={t('Poznámky se nenačetly')} detail={data.error} onRetry={data.reload} className="!py-4" />
      ) : data.loading ? (
        <div className="mt-2 space-y-2" aria-busy>
          <Skeleton className="h-10" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      ) : poznamky.length === 0 && !uvod ? (
        <p className="t-meta mt-1 text-pretty">{t('Zatím bez poznámek — napiš první, třeba co se osvědčilo nebo na co dát pozor.')}</p>
      ) : (
        <ul className="list mt-1" aria-label={t('Poznámky')}>
          {uvod && (
            // Připnutá úvodní zpráva (u uzávěrky „Poznámka vedení"): první ve vlákně, ať je vidět, na co se odpovídá.
            <li className="flex items-start gap-3 py-3" data-uvod-vlakna>
              <Avatar emoji={uvod.avatar} name={uvod.autor} size="sm" className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium truncate">{uvod.autor}</span>
                  {uvod.kdy && <span className="t-meta">{uvod.kdy}</span>}
                  <Chip tone="muted" size="sm" icon="pin">{uvod.popisek}</Chip>
                </div>
                <p className="mt-0.5 text-[15px] text-[#16181A] whitespace-pre-wrap break-words text-pretty">{uvod.text}</p>
              </div>
            </li>
          )}
          {poznamky.map(p => {
            const polozky: MenuItem[] = [
              ...(p.moje && p.id > 0 ? [{ label: t('Upravit'), icon: 'pencil', onClick: () => { setChyba(''); setUprava({ id: p.id, text: p.text }); } }] : []),
              ...(p.moje && p.id > 0 ? [{ label: p.pripnuta ? t('Odepnout') : t('Připnout nahoru'), icon: 'pin', onClick: () => { void pripni(p, !p.pripnuta); } }] : []),
              ...(p.muzuSmazat && p.id > 0 ? [{ label: t('Smazat'), icon: 'trash', danger: true, onClick: () => setMazani(p) }] : []),
            ];
            const upravuji = uprava?.id === p.id;
            return (
              <li key={p.id} className="flex items-start gap-3 py-3" data-poznamka={p.id} data-pripnuta={p.pripnuta || undefined}>
                <Avatar emoji={p.autor.avatar} name={p.autor.name} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium truncate">{p.autor.name}</span>
                    <time dateTime={p.createdAt} title={p.createdAt ? presne(p.createdAt) : undefined} className="t-meta">
                      {p.createdAt ? kdyNapsano(p.createdAt, t, jazyk) : ''}
                    </time>
                    {p.updatedAt && <span className="t-meta">· {t('upraveno')}</span>}
                    {p.pripnuta && <span className="t-meta inline-flex items-center gap-1"><Icon name="pin" size={11} /> {t('připnuto')}</span>}
                  </div>
                  {upravuji ? (
                    <div className="mt-1.5 space-y-2">
                      <Textarea rows={3} value={uprava!.text} maxLength={MAX_DELKA_POZNAMKY} autoFocus
                        aria-label={t('Upravit poznámku')}
                        onChange={e => setUprava(u => (u ? { ...u, text: e.target.value } : u))}
                        onKeyDown={e => naKlavesu(e, () => { void ulozUpravu(); })} />
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setUprava(null)}>{t('Zrušit')}</Button>
                        <Button variant="primary" size="sm" loading={ukladam} disabled={!uprava!.text.trim()} onClick={() => { void ulozUpravu(); }}>{t('Uložit')}</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-0.5 text-[15px] text-[#16181A] whitespace-pre-wrap break-words text-pretty">
                      {kusyTextu(p.text, p.zminky.length ? lide.filter(l => p.zminky.includes(l.id)) : []).map((k, i) => (
                        k.zminka ? <span key={i} className="font-semibold text-[#5B7A08]">{k.text}</span> : <span key={i}>{k.text}</span>
                      ))}
                    </p>
                  )}
                </div>
                {polozky.length > 0 && !upravuji && <Menu size="sm" label={t('Akce s poznámkou')} items={polozky} />}
              </li>
            );
          })}
        </ul>
      )}

      {chyba && <p className="note note-danger mt-3 text-sm" role="alert">{chyba}</p>}

      <div className="mt-3">
        <Textarea ref={poleRef} rows={2} value={navrh} maxLength={MAX_DELKA_POZNAMKY}
          placeholder={t('Přidat poznámku… @jméno někoho upozorní')} aria-label={t('Přidat poznámku')}
          aria-autocomplete={navrhyLidi ? 'list' : undefined} aria-controls={navrhyLidi ? `${uid}-zminky` : undefined}
          onChange={e => { setNavrh(e.target.value); sledujKurzor(e.target); if (e.target.value.includes('@')) setChceLidi(true); }}
          onSelect={e => sledujKurzor(e.currentTarget)} onKeyUp={e => sledujKurzor(e.currentTarget)}
          onKeyDown={e => naKlavesu(e, () => { void odesli(); })} />
        {navrhyLidi && (
          // Našeptávač @zmínky: nejvýš šest lidí, řádky 44 px (palec na telefonu).
          <ul id={`${uid}-zminky`} role="listbox" aria-label={t('Koho zmínit')} className="mt-1 well !p-1 divide-y divide-black/[0.05]" data-zminky>
            {navrhyLidi.lide.map(l => (
              <li key={l.id} role="option" aria-selected={false}>
                <button type="button" onClick={() => vyberZminku(l.name)}
                  className="tap-target flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm text-[#16181A] hover:bg-black/[0.04]">
                  <Avatar emoji={l.avatar} name={l.name} size="xs" ring={false} />
                  <span className="min-w-0 truncate">{l.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-2 flex items-center justify-between gap-3">
          {/* Nápověda ke klávesnici je na telefonu bez klávesnice jen šum; věta o tabletu platí vždy. */}
          <span className={`t-meta min-w-0 truncate ${tablet && !zaKoho ? '' : 'hidden sm:inline'}`}>
            {tablet && !zaKoho ? t('Na tabletu se poznámka připíše vybranému člověku.') : t('Ctrl+Enter odešle · @jméno upozorní kolegu')}
          </span>
          <Button variant="primary" size="sm" icon="send" loading={odesilam} disabled={!navrh.trim()} className="ml-auto" onClick={() => { void odesli(); }}>
            {t('Přidat')}
          </Button>
        </div>
      </div>

      <Modal open={!!mazani} onClose={() => { if (!mazu) setMazani(null); }} size="sm" title={t('Smazat poznámku?')}
        footer={<>
          <Button variant="secondary" onClick={() => setMazani(null)} disabled={mazu}>{t('Zrušit')}</Button>
          <Button variant="danger-solid" loading={mazu} onClick={() => { void smaz(); }}>{t('Smazat')}</Button>
        </>}>
        <p className="text-sm text-black/70 text-pretty">{t('Poznámka zmizí všem, kdo se na tohle dívají.')}</p>
      </Modal>
    </section>
  );
}

export default Poznamky;
