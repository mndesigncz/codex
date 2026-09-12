'use client';

// Vzhled podniku: čím se podnik hostům představí. Logo, fotka do záhlaví,
// galerie, barva značky a text o sobě. Obrázky se nahrávají přes společné
// /api/upload a odkazují se na /api/client/img/<id>, které je veřejné jen
// pro zapnuté podniky — host totiž tým nemá a na týmové soubory nedosáhne.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button, PageHeader, Skeleton } from '../ui';

const input = 'w-full rounded-2xl bg-white/70 border border-black/[0.08] px-4 py-2.5 text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/60 focus:ring-2 focus:ring-[#C8F542]/25 focus:outline-none transition text-sm';
const label = 'block text-xs font-semibold text-black/55 mb-1.5';

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
      <p className={label}>{title}</p>
      <div className={`relative rounded-3xl border border-black/[0.08] overflow-hidden bg-white/60 ${tall ? 'aspect-[16/7]' : 'aspect-square max-w-[10rem]'}`}>
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
        {value && <button type="button" onClick={() => onChange('')} className="tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold text-black/55 hover:text-red-700 hover:bg-red-500/10 transition">Odebrat</button>}
        <span className="text-xs text-black/45">{hint}</span>
      </div>
    </div>
  );
}

export default function BrandTab({ toast, onChange }: { toast: (m: string) => void; onChange: () => void }) {
  const [p, setP] = useState<any | null>(null);
  const [busy, setBusy] = useState<string>('');
  const [url, setUrl] = useState('');

  const load = useCallback(() => {
    fetch('/api/client/admin/profile').then(r => r.json()).then(d => { setP(d.profile); setUrl(d.url); }).catch(() => {});
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

  if (!p) return <div className="space-y-4"><Skeleton className="h-10 w-56 rounded-full" /><Skeleton className="h-64 rounded-3xl" /></div>;
  const gallery: string[] = p.gallery ?? [];

  return (
    <form onSubmit={save} className="space-y-6 max-w-3xl">
      <PageHeader title="Vzhled" subtitle="Čím se podnik hostům představí: logo, fotky a pár vět o sobě."
        primary={<Button type="submit" variant="accent" loading={busy === 'save'}>Uložit</Button>}
        secondary={<Button type="button" variant="secondary" icon="external" onClick={() => url && window.open(url, '_blank')} disabled={!url}>Zobrazit</Button>} />

      <section className="glass-card p-5 grid gap-5 sm:grid-cols-[auto_1fr]">
        <Picker id="b-logo" title="Logo" hint="Čtverec, aspoň 200 px." value={p.logo_url ?? ''} busy={busy === 'logo_url'} onChange={v => pick('logo_url', v)} />
        <Picker id="b-cover" title="Fotka do záhlaví" hint="Na šířku, aspoň 1200 px." value={p.cover_url ?? ''} tall busy={busy === 'cover_url'} onChange={v => pick('cover_url', v)} />
      </section>

      <section className="glass-card p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold tracking-tight">Galerie</h2>
            <p className="text-xs text-black/50 mt-0.5">Až osm fotek z podniku. Host je uvidí na tvé stránce.</p>
          </div>
          <label className="tap-target-sm inline-flex items-center gap-1.5 rounded-full bg-black/[0.05] px-3.5 py-2 text-sm font-semibold hover:bg-black/[0.09] transition cursor-pointer">
            <Icon name="plus" size={15} />{busy === 'gallery' ? 'Nahrávám…' : 'Přidat fotku'}
            <input type="file" accept="image/*" className="hidden" disabled={gallery.length >= 8}
              onChange={e => { const f = e.target.files?.[0]; if (f) addPhoto(f); e.target.value = ''; }} />
          </label>
        </div>
        {gallery.length === 0 ? (
          <p className="text-sm text-black/50">Zatím žádná fotka. Interiér, šálek, zahrádka — stačí pár.</p>
        ) : (
          <ul className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {gallery.map((g, i) => (
              <li key={g} className="relative group rounded-2xl overflow-hidden border border-black/[0.08] aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g} alt={`Fotka ${i + 1}`} className="h-full w-full object-cover" />
                <button type="button" aria-label={`Odebrat fotku ${i + 1}`}
                  onClick={() => setP((x: any) => ({ ...x, gallery: gallery.filter(y => y !== g) }))}
                  className="absolute top-1.5 right-1.5 h-8 w-8 grid place-items-center rounded-full bg-[#16181A]/80 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition"><Icon name="close" size={13} /></button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="glass-card p-5 grid gap-4">
        <div>
          <h2 className="font-bold tracking-tight">Barva značky</h2>
          <p className="text-xs text-black/50 mt-0.5">Použije se na stránce pro hosty. Bez výběru zůstane limetková jako ve zbytku aplikace.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ACCENTS.map(c => (
            <button key={c} type="button" onClick={() => setP({ ...p, accent: c })} aria-label={`Barva ${c}`} aria-pressed={p.accent === c}
              className={`h-9 w-9 rounded-full border-2 transition ${p.accent === c ? 'border-[#16181A] scale-110' : 'border-black/10 hover:scale-105'}`}
              style={{ background: c }} />
          ))}
          <label className="inline-flex items-center gap-2 text-xs text-black/55 ml-1">Vlastní
            <input type="color" aria-label="Vlastní barva značky" value={p.accent || '#C8F542'} onChange={e => setP({ ...p, accent: e.target.value.toUpperCase() })}
              className="h-9 w-12 rounded-lg border border-black/10 bg-transparent p-0.5" /></label>
          {p.accent && <button type="button" onClick={() => setP({ ...p, accent: '' })} className="tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold text-black/55 hover:bg-black/[0.06] transition">Výchozí</button>}
        </div>
      </section>

      <section className="glass-card p-5 grid gap-4">
        <h2 className="font-bold tracking-tight">O podniku</h2>
        <div><label htmlFor="b-tag" className={label}>Motto</label><input id="b-tag" value={p.tagline ?? ''} onChange={e => setP({ ...p, tagline: e.target.value })} placeholder="Čaj z lístků, ne z pytlíků." className={input} maxLength={120} /></div>
        <div><label htmlFor="b-desc" className={label}>Pár vět</label><textarea id="b-desc" value={p.description ?? ''} onChange={e => setP({ ...p, description: e.target.value })} rows={3} placeholder="Malá čajovna v přízemí starého domu. Sedí se na zemi i u stolů." className={input} maxLength={1200} /></div>
        <div><label htmlFor="b-addr" className={label}>Adresa</label><input id="b-addr" value={p.address ?? ''} onChange={e => setP({ ...p, address: e.target.value })} placeholder="Vodní 14, Brno" className={input} /></div>
      </section>
    </form>
  );
}
