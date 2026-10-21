'use client';

// Vzhled podniku: čím se podnik hostům představí. Logo, fotka do záhlaví,
// galerie, barva značky a text o sobě. Obrázky se nahrávají přes společné
// /api/upload a odkazují se na /api/client/img/<id>, které je veřejné jen
// pro zapnuté podniky — host totiž tým nemá a na týmové soubory nedosáhne.
//
// Kolo 69 (B8), audit „Klient – Vzhled": „Přidat fotku" je tlačítko jako
// „Nahrát" u loga (dřív popisek stylovaný jako pilulka, na telefonu se zalomil
// na dva řádky), odebrání fotky je vidět i na dotyku (dřív jen při najetí
// myší), rámečky obrázků mají rádius jamky, ne karty, „Odebrat" a „Výchozí"
// jsou Button, popisy sekcí t-meta, pole Field/Input/Textarea.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Card, Field, Input, PageHeader, Skeleton, ErrorState, Textarea } from '../ui';
import NahledStranky from './sprava/NahledStranky';

/** Předvolené barvy značky — podnik si může vybrat i vlastní. */
const ACCENTS = ['#C8F542', '#E8A33D', '#D9644A', '#7C9A6B', '#4A7DBF', '#9B6BAE', '#16181A'];

export async function uploadImage(f: File): Promise<string> {
  const { compressImage } = await import('@/lib/clientImage');
  const fd = new FormData();
  fd.append('file', await compressImage(f));
  const r = await fetch('/api/upload', { method: 'POST', body: fd });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Nahrání se nepovedlo.');
  // /api/upload vrací týmovou adresu; pro hosty vede tentýž soubor na /api/client/img.
  const id = String(d.url ?? '').match(/(\d+)$/)?.[1];
  if (!id) throw new Error('Soubor se nahrál, ale nevrátil adresu.');
  return `/api/client/img/${id}`;
}

function Picker({ id, title, hint, value, onChange, tall, busy }: {
  id: string; title: string; hint: string; value: string; onChange: (v: string) => void; tall?: boolean; busy?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    // v4 (P2, V18): náhled přes celou šířku dílu (logo jamka 160 vysoká, na sm čtverec 160), pod ním
    // vysvětlení a akce Nahrát / Odebrat jako řada rovných dílů — dřív čtyři různé pravé hrany pod sebou.
    <div className={tall ? 'min-w-0' : 'min-w-0 sm:w-40'}>
      <p className="field-label">{title}</p>
      <div className={`well relative overflow-hidden ${tall ? 'aspect-[16/7]' : 'h-40 w-full'}`}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className={`h-full w-full ${tall ? 'object-cover' : 'object-contain p-3'}`} />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-black/30"><Icon name="camera" size={26} /></span>
        )}
      </div>
      <p className="t-meta mt-1.5">{hint}</p>
      <input ref={ref} id={id} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f as any); e.target.value = ''; }} />
      <div className="rada rada-rovne rada-s mt-3">
        <Button type="button" size="sm" variant="secondary" icon="upload" loading={busy} onClick={() => ref.current?.click()}>{value ? 'Změnit' : 'Nahrát'}</Button>
        {value && <Button type="button" size="sm" variant="danger" onClick={() => onChange('')}>Odebrat</Button>}
      </div>
    </div>
  );
}

export default function BrandTab({ toast, onChange }: { toast: (m: string) => void; onChange: () => void }) {
  const [p, setP] = useState<any | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [url, setUrl] = useState('');
  // Prázdný catch tu dřív znamenal věčný skeleton: po výpadku sítě
  // zůstalo `p === null` a člověk koukal na pulzující obdélník, dokud
  // stránku neobnovil. Teď se to přizná a nabídne další pokus.
  const [error, setError] = useState<string | null>(null);
  const galerieRef = useRef<HTMLInputElement>(null);
  const [nahled, setNahled] = useState(false);

  const load = useCallback(() => {
    setError(null);
    fetch('/api/client/admin/profile')
      .then(r => { if (!r.ok) throw new Error(`Server odpověděl ${r.status}`); return r.json(); })
      .then(d => { if (!d?.profile) throw new Error('Profil podniku se nepodařilo přečíst'); setP(d.profile); setUrl(d.url); })
      .catch((e: any) => setError(e?.message || 'Načtení se nepovedlo'));
  }, []);
  useEffect(() => { load(); }, [load]);

  const pick = async (kind: 'logo_url' | 'cover_url', v: any) => {
    if (typeof v === 'string') { setP((x: any) => ({ ...x, [kind]: v })); return; }
    setBusy(kind);
    try { setP((x: any) => ({ ...x, [kind]: '' })); const u = await uploadImage(v); setP((x: any) => ({ ...x, [kind]: u })); }
    catch (e: any) { toast(e.message); }
    setBusy('');
  };

  const addPhoto = async (f: File) => {
    setBusy('gallery');
    try { const u = await uploadImage(f); setP((x: any) => ({ ...x, gallery: [...(x.gallery ?? []), u].slice(0, 8) })); }
    catch (e: any) { toast(e.message); }
    setBusy('');
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy('save');
    try {
      const r = await fetch('/api/client/admin/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logo_url: p.logo_url || '', cover_url: p.cover_url || '', gallery: p.gallery ?? [], accent: p.accent || '', tagline: p.tagline, description: p.description, address: p.address, phone: p.phone ?? '' }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Uložení se nepovedlo.');
      setP(d.profile); toast('Vzhled uložen. Hosté ho uvidí hned.'); onChange();
    } catch (e: any) { toast(e.message); }
    setBusy('');
  };

  if (error) return <ErrorState title="Vzhled se nenačetl" onRetry={load} detail={error} />;
  if (!p) return <div className="space-y-4"><Skeleton className="h-10 w-56 rounded-full" /><Skeleton className="h-64" /></div>;
  const gallery: string[] = p.gallery ?? [];

  return (
    <div className="space-y-6">
    <PageHeader hintId="brandtab" title="Stránka podniku" subtitle="Čím se podnik hostům představí. Náhled vpravo se mění hned, hosté to uvidí po uložení."
      primary={<Button type="submit" form="vzhled-podniku" variant="accent" loading={busy === 'save'}>Uložit</Button>}
      secondary={<Button type="button" variant="secondary" icon="external" onClick={() => url && window.open(url, '_blank')} disabled={!url}>Zobrazit jako host</Button>}
      menuMobile={url ? [{ label: 'Zobrazit jako host', icon: 'external', onClick: () => window.open(url, '_blank') }] : undefined} />
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] items-start">
    {/* Kolo 92: živý náhled stránky (koncept B „H") — na telefonu nahoře, na monitoru vpravo vedle formuláře. */}
    <aside className="lg:order-2 lg:sticky lg:top-4 min-w-0" aria-label="Náhled stránky pro hosty">
      {/* Na telefonu sbalený (dlouhý rám telefonu by odsunul formulář o dvě obrazovky). */}
      <Button type="button" variant="secondary" icon={nahled ? 'chevronUp' : 'chevron'} className="w-full lg:hidden" aria-expanded={nahled} onClick={() => setNahled(v => !v)}>
        {nahled ? 'Skrýt náhled' : 'Náhled pro hosty'}
      </Button>
      <div className={nahled ? 'mt-3 lg:mt-0' : 'max-lg:hidden'}>
        <p className="t-label mb-2">Náhled · tak to uvidí host</p>
        <NahledStranky p={p} />
      </div>
    </aside>
    <form id="vzhled-podniku" onSubmit={save} className="space-y-6 min-w-0 lg:order-1">

      <Card className="grid gap-5 sm:grid-cols-[auto_1fr]">
        <Picker id="b-logo" title="Logo" hint="Čtverec, aspoň 200 px." value={p.logo_url ?? ''} busy={busy === 'logo_url'} onChange={v => pick('logo_url', v)} />
        <Picker id="b-cover" title="Fotka do záhlaví" hint="Na šířku, aspoň 1200 px." value={p.cover_url ?? ''} tall busy={busy === 'cover_url'} onChange={v => pick('cover_url', v)} />
      </Card>

      <Card className="space-y-3">
        {/* v4 (P2): „Přidat fotku" vpravo v řádku s titulem; na telefonu pod titulem přes celou šířku. */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h2 className="t-card">Galerie</h2>
            <p className="t-meta mt-0.5">Až osm fotek z podniku. Host je uvidí na tvé stránce.</p>
          </div>
          <input ref={galerieRef} type="file" accept="image/*" className="hidden" aria-label="Fotka do galerie"
            onChange={e => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = ''; }} />
          <Button type="button" size="sm" variant="secondary" icon="plus" className="whitespace-nowrap w-full sm:w-auto" loading={busy === 'gallery'}
            disabled={gallery.length >= 8} onClick={() => galerieRef.current?.click()}>Přidat fotku</Button>
        </div>
        {gallery.length === 0 ? (
          <p className="t-meta">Zatím žádná fotka. Interiér, šálek, zahrádka — stačí pár.</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {gallery.map((g, i) => (
              <li key={g} className="relative group rounded-2xl overflow-hidden border border-black/[0.08] aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g} alt={`Fotka ${i + 1}`} className="h-full w-full object-cover" />
                {/* Vidět vždy — na dotyku hover není a fotka by nešla odebrat. */}
                <button type="button" aria-label={`Odebrat fotku ${i + 1}`}
                  onClick={() => setP((x: any) => ({ ...x, gallery: gallery.filter(y => y !== g) }))}
                  className="tap-target-sm absolute top-1.5 right-1.5 h-8 w-8 grid place-items-center rounded-full bg-[#16181A]/80 text-white transition-colors hover:bg-[#16181A]"><Icon name="close" size={13} /></button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="grid gap-4">
        <div>
          <h2 className="t-card">Barva značky</h2>
          <p className="t-meta mt-0.5">Barva hlavičky stránky a karty hosta. Bez výběru bude karta grafitová.</p>
        </div>
        {/* v4 (P1, P2): vzorník je řada sedmi rovných dílů až k pravé hraně; vlastní barva a „Výchozí"
            pod ním v jedné řadě (popisek vlevo, akce na R) — dřív „Vlastní" spadlo samo na další řádek. */}
        <div className="grid grid-cols-7 gap-2 justify-items-center sm:flex sm:flex-wrap">
          {ACCENTS.map(c => (
            <button key={c} type="button" onClick={() => setP({ ...p, accent: c })} aria-label={`Barva ${c}`} aria-pressed={p.accent === c}
              className={`h-9 w-9 rounded-full border-2 transition ${p.accent === c ? 'border-[#16181A] scale-110' : 'border-black/10 hover:scale-105'}`}
              style={{ background: c }} />
          ))}
        </div>
        <div className="flex items-center gap-2 min-h-9">
          <label className="flex flex-1 items-center justify-between gap-2 text-[13px] text-black/55">Vlastní
            <input type="color" aria-label="Vlastní barva značky" value={p.accent || '#C8F542'} onChange={e => setP({ ...p, accent: e.target.value.toUpperCase() })}
              className="h-9 w-12 rounded-xl border border-black/10 bg-transparent p-0.5" /></label>
          {p.accent && <Button type="button" size="sm" variant="ghost" className="-mr-2" onClick={() => setP({ ...p, accent: '' })}>Výchozí</Button>}
        </div>

        {/* Kontrast barvy hlídá náhled vpravo (NahledStranky, staciKontrast) — barva je podniku, čitelnost naše. */}
      </Card>

      <Card className="grid gap-4">
        <h2 className="t-card">O podniku</h2>
        <Field id="b-tag" label="Motto"><Input id="b-tag" value={p.tagline ?? ''} onChange={e => setP({ ...p, tagline: e.target.value })} placeholder="Čaj z lístků, ne z pytlíků." maxLength={120} /></Field>
        <Field id="b-desc" label="Pár vět"><Textarea id="b-desc" value={p.description ?? ''} onChange={e => setP({ ...p, description: e.target.value })} rows={3} placeholder="Malý podnik v přízemí starého domu. Sedí se u stolů i na baru." maxLength={1200} /></Field>
        <Field id="b-addr" label="Adresa"><Input id="b-addr" value={p.address ?? ''} onChange={e => setP({ ...p, address: e.target.value })} placeholder="Vodní 14, Brno" /></Field>
        <Field id="b-tel" label="Telefon" hint="Host ho uvidí jako „Zavolat“ na stránce podniku. Prázdné = bez telefonu.">
          <Input id="b-tel" type="tel" inputMode="tel" autoComplete="tel" value={p.phone ?? ''} onChange={e => setP({ ...p, phone: e.target.value })} placeholder="+420 777 123 456" maxLength={30} />
        </Field>
      </Card>
    </form>
    </div>
    {/* Bannery se od kola 92 spravují v Kampaních (kanál kampaně), ne tady. */}
    </div>
  );
}
