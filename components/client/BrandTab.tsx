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
import { onAccent, staciKontrast } from '@/lib/floorplan';
import { Icon } from '../Icons';
import { Button, Card, Field, Input, PageHeader, Skeleton, ErrorState, Textarea } from '../ui';
import BannersEditor from './BannersEditor';

/** Předvolené barvy značky — podnik si může vybrat i vlastní. */
const ACCENTS = ['#C8F542', '#E8A33D', '#D9644A', '#7C9A6B', '#4A7DBF', '#9B6BAE', '#16181A'];

async function uploadImage(f: File): Promise<string> {
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
    <div>
      <p className="field-label">{title}</p>
      <div className={`well relative overflow-hidden ${tall ? 'aspect-[16/7]' : 'aspect-square max-w-[10rem]'}`}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" className={`h-full w-full ${tall ? 'object-cover' : 'object-contain p-3'}`} />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-black/30"><Icon name="camera" size={tall ? 28 : 22} /></span>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        <input ref={ref} id={id} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f as any); e.target.value = ''; }} />
        <Button type="button" size="sm" variant="secondary" icon="upload" loading={busy} onClick={() => ref.current?.click()}>{value ? 'Změnit' : 'Nahrát'}</Button>
        {value && <Button type="button" size="sm" variant="danger" onClick={() => onChange('')}>Odebrat</Button>}
        <span className="t-meta">{hint}</span>
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
        body: JSON.stringify({ logo_url: p.logo_url || '', cover_url: p.cover_url || '', gallery: p.gallery ?? [], accent: p.accent || '', tagline: p.tagline, description: p.description, address: p.address }),
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
    <div className="space-y-6 max-w-3xl">
    <form onSubmit={save} className="space-y-6">
      <PageHeader hintId="brandtab" title="Vzhled" subtitle="Čím se podnik hostům představí: logo, fotky a pár vět o sobě."
        primary={<Button type="submit" variant="accent" loading={busy === 'save'}>Uložit</Button>}
        secondary={<Button type="button" variant="secondary" icon="external" onClick={() => url && window.open(url, '_blank')} disabled={!url}>Zobrazit</Button>} />

      <Card className="grid gap-5 sm:grid-cols-[auto_1fr]">
        <Picker id="b-logo" title="Logo" hint="Čtverec, aspoň 200 px." value={p.logo_url ?? ''} busy={busy === 'logo_url'} onChange={v => pick('logo_url', v)} />
        <Picker id="b-cover" title="Fotka do záhlaví" hint="Na šířku, aspoň 1200 px." value={p.cover_url ?? ''} tall busy={busy === 'cover_url'} onChange={v => pick('cover_url', v)} />
      </Card>

      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h2 className="t-card">Galerie</h2>
            <p className="t-meta mt-0.5">Až osm fotek z podniku. Host je uvidí na tvé stránce.</p>
          </div>
          <input ref={galerieRef} type="file" accept="image/*" className="hidden" aria-label="Fotka do galerie"
            onChange={e => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = ''; }} />
          <Button type="button" size="sm" variant="secondary" icon="plus" className="whitespace-nowrap" loading={busy === 'gallery'}
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
          <p className="t-meta mt-0.5">Použije se na stránce pro hosty. Bez výběru zůstane limetková jako ve zbytku aplikace.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ACCENTS.map(c => (
            <button key={c} type="button" onClick={() => setP({ ...p, accent: c })} aria-label={`Barva ${c}`} aria-pressed={p.accent === c}
              className={`h-9 w-9 rounded-full border-2 transition ${p.accent === c ? 'border-[#16181A] scale-110' : 'border-black/10 hover:scale-105'}`}
              style={{ background: c }} />
          ))}
          <label className="inline-flex items-center gap-2 text-[13px] text-black/55 ml-1">Vlastní
            <input type="color" aria-label="Vlastní barva značky" value={p.accent || '#C8F542'} onChange={e => setP({ ...p, accent: e.target.value.toUpperCase() })}
              className="h-9 w-12 rounded-xl border border-black/10 bg-transparent p-0.5" /></label>
          {p.accent && <Button type="button" size="sm" variant="ghost" onClick={() => setP({ ...p, accent: '' })}>Výchozí</Button>}
        </div>

        {/* Ukázka i varování. Na některých barvách se čitelného textu prostě
            dosáhnout nedá — barva je ale podniku, ne naše, takže ji
            nepřepisujeme. Mlčet by ale znamenalo nechat ho vydat stránku,
            kterou si hosté nepřečtou. */}
        {p.accent && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center rounded-full px-5 py-2.5 text-sm font-semibold"
              style={{ background: p.accent, color: onAccent(p.accent) }}>Stát se členem</span>
            {staciKontrast(p.accent)
              ? <span className="t-meta">Takhle uvidí hosté hlavní tlačítko.</span>
              : <span className="text-[13px] text-wait-ink max-w-[42ch]">
                  Na téhle barvě se text špatně čte — ani tmavý, ani bílý na ní nedosáhne
                  doporučeného kontrastu. Zkus ji o kus ztmavit nebo zesvětlit.
                </span>}
          </div>
        )}
      </Card>

      <Card className="grid gap-4">
        <h2 className="t-card">O podniku</h2>
        <Field id="b-tag" label="Motto"><Input id="b-tag" value={p.tagline ?? ''} onChange={e => setP({ ...p, tagline: e.target.value })} placeholder="Čaj z lístků, ne z pytlíků." maxLength={120} /></Field>
        <Field id="b-desc" label="Pár vět"><Textarea id="b-desc" value={p.description ?? ''} onChange={e => setP({ ...p, description: e.target.value })} rows={3} placeholder="Malý podnik v přízemí starého domu. Sedí se u stolů i na baru." maxLength={1200} /></Field>
        <Field id="b-addr" label="Adresa"><Input id="b-addr" value={p.address ?? ''} onChange={e => setP({ ...p, address: e.target.value })} placeholder="Vodní 14, Brno" /></Field>
      </Card>
    </form>
    {/* Bannery se ukládají samy (vlastní tlačítka), proto stojí mimo formulář Vzhledu. */}
    <BannersEditor toast={toast} upload={uploadImage} accent={p.accent || ''} />
    </div>
  );
}
