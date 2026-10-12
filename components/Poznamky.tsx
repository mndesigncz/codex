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

import { useId, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Avatar, Button, ErrorState, Menu, Modal, Skeleton, Textarea, type MenuItem } from './ui';
import { obnovDataWidgetu, useDataWidgetu } from './widgety/useDataWidgetu';
import { okJson, apiMessage } from '@/lib/api';
import { useT, useJazyk, type PrekladFn } from '@/lib/i18n/client';
import { fmtDatum } from '@/lib/i18n/format';
import { LOCALE_PRO_JAZYK } from '@/lib/i18n/config';
import type { Jazyk } from '@/lib/i18n/config';
import {
  MAX_DELKA_POZNAMKY, normalizujTextPoznamky, relativniCas, urlPoznamek, vyberPoznamky, type Poznamka, type TypPoznamky,
} from '@/lib/poznamky';

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

export function Poznamky({ typ, id, tablet = false, zaKoho = null, vyberKoho, className = '' }: {
  typ: TypPoznamky;
  /** Id věci; u receptury z kasy product_id pokladny. */
  id: string | number;
  /** Sdílený tablet: píše se za `zaKoho`; bez něj se před odesláním zeptá `vyberKoho`. */
  tablet?: boolean;
  zaKoho?: AutorNaTabletu | null;
  vyberKoho?: () => Promise<AutorNaTabletu | null>;
  className?: string;
}) {
  const t = useT('spolecne');
  const { jazyk } = useJazyk();
  const { data: relace } = useSession();
  const uid = useId();
  const url = urlPoznamek(typ, id, tablet ? zaKoho?.id ?? null : null);
  const data = useDataWidgetu<Poznamka[]>(url, vyberPoznamky);
  const poznamky = data.data ?? [];

  const [navrh, setNavrh] = useState('');
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
      moje: true, muzuSmazat: true,
    };
    setOdesilam(true);
    setChyba('');
    setNavrh('');
    data.set(prev => [...(prev ?? []), docasna]);
    try {
      const r = await fetch('/api/notes', { method: 'POST', headers: hlavicky, body: JSON.stringify(sZaKoho({ typ, id, text }, kdo)) });
      await okJson(r);
      obnovDataWidgetu(url);
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
      ) : poznamky.length === 0 ? (
        <p className="t-meta mt-1 text-pretty">{t('Zatím bez poznámek — napiš první, třeba co se osvědčilo nebo na co dát pozor.')}</p>
      ) : (
        <ul className="list mt-1" aria-label={t('Poznámky')}>
          {poznamky.map(p => {
            const polozky: MenuItem[] = [
              ...(p.moje && p.id > 0 ? [{ label: t('Upravit'), icon: 'pencil', onClick: () => { setChyba(''); setUprava({ id: p.id, text: p.text }); } }] : []),
              ...(p.muzuSmazat && p.id > 0 ? [{ label: t('Smazat'), icon: 'trash', danger: true, onClick: () => setMazani(p) }] : []),
            ];
            const upravuji = uprava?.id === p.id;
            return (
              <li key={p.id} className="flex items-start gap-3 py-3">
                <Avatar emoji={p.autor.avatar} name={p.autor.name} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-medium truncate">{p.autor.name}</span>
                    <time dateTime={p.createdAt} title={p.createdAt ? presne(p.createdAt) : undefined} className="t-meta">
                      {p.createdAt ? kdyNapsano(p.createdAt, t, jazyk) : ''}
                    </time>
                    {p.updatedAt && <span className="t-meta">· {t('upraveno')}</span>}
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
                    <p className="mt-0.5 text-[15px] text-[#16181A] whitespace-pre-wrap break-words text-pretty">{p.text}</p>
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
        <Textarea rows={2} value={navrh} maxLength={MAX_DELKA_POZNAMKY}
          placeholder={t('Přidat poznámku…')} aria-label={t('Přidat poznámku')}
          onChange={e => setNavrh(e.target.value)}
          onKeyDown={e => naKlavesu(e, () => { void odesli(); })} />
        <div className="mt-2 flex items-center justify-between gap-3">
          {/* Nápověda ke klávesnici je na telefonu bez klávesnice jen šum; věta o tabletu platí vždy. */}
          <span className={`t-meta min-w-0 truncate ${tablet && !zaKoho ? '' : 'hidden sm:inline'}`}>
            {tablet && !zaKoho ? t('Na tabletu se poznámka připíše vybranému člověku.') : t('Ctrl+Enter odešle')}
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
