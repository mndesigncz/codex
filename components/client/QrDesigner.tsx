'use client';

// Vzhled QR na stůl. Vytištěná kartička je jediná část appky, kterou host
// drží v ruce — tady se dá nastavit barva, text, logo uprostřed a formát
// archu. Náhled vlevo ukazuje rozpracované nastavení hned, bez ukládání.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button } from '../ui';
import { QR_DEFAULT, QR_SHEETS, QR_STYLES, contrast, normalizeQrDesign, type QrDesign } from '@/lib/qrDesign';
import { okJson } from '@/lib/api';
import { okText } from '@/lib/api';

const input = 'field !py-2.5 text-sm';
const label = 'field-label';

/** Barvy, které se na papíře osvědčí. Vlastní odstín jde nastavit vedle. */
const INKS = ['#16181A', '#3E5406', '#0A5FC4', '#7A2E12', '#5B2A7A', '#0F5C52'];
const PAPERS = ['#FFFFFF', '#FBF7EE', '#F2F5E8', '#EEF3FA'];

function Swatches({ value, onChange, options, name }: { value: string; onChange: (c: string) => void; options: string[]; name: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map(c => (
        <button key={c} type="button" onClick={() => onChange(c)} aria-label={`${name} ${c}`} aria-pressed={value === c}
          className={`h-8 w-8 rounded-full border transition ${value === c ? 'border-[#16181A] ring-2 ring-[#C8F542]' : 'border-black/15 hover:border-black/35'}`}
          style={{ background: c }} />
      ))}
      <label className="tap-target-sm inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white/60 px-2.5 py-1.5 text-xs font-semibold text-black/60 cursor-pointer">
        <Icon name="sparkle" size={12} />Vlastní
        <input type="color" value={value} onChange={e => onChange(e.target.value.toUpperCase())} aria-label={`Vlastní ${name}`} className="h-5 w-5 cursor-pointer bg-transparent border-0 p-0" />
      </label>
    </div>
  );
}

export default function QrDesigner({ toast, tables }: { toast: (m: string) => void; tables: { id: number; name: string }[] }) {
  const [d, setD] = useState<QrDesign | null>(null);
  const [teamName, setTeamName] = useState('');
  const [hasLogo, setHasLogo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [svg, setSvg] = useState('');
  const [svgErr, setSvgErr] = useState(false);
  const [open, setOpen] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    fetch('/api/client/admin/profile').then(okJson).then(x => {
      setD(normalizeQrDesign(x?.profile?.qr_design));
      setTeamName(String(x?.profile?.team_name ?? ''));
      setHasLogo(!!x?.profile?.logo_url);
    }).catch(() => setD({ ...QR_DEFAULT }));
  }, []);

  const first = tables[0];
  // Náhled kreslí server, aby se to, co je vidět, počítalo stejným kódem
  // jako to, co vyjede z tiskárny.
  const refresh = useCallback((design: QrDesign) => {
    if (!first) return;
    const mine = ++seq.current;
    fetch(`/api/client/admin/tables/qr?tableId=${first.id}&format=svg&design=${encodeURIComponent(JSON.stringify(design))}`)
      .then(okText)
      .then(t => { if (mine === seq.current) { setSvg(t); setSvgErr(false); } })
      // Prázdná náhledová plocha vypadá jako „kód se nevykreslil" — a designér
      // pak ladí barvy podle ničeho. Radši řekneme, že se náhled nenačetl.
      .catch(() => { if (mine === seq.current) { setSvg(''); setSvgErr(true); } });
  }, [first]);

  useEffect(() => { if (d && open) { const t = setTimeout(() => refresh(d), 250); return () => clearTimeout(t); } }, [d, open, refresh]);

  if (!d) return null;
  const set = (patch: Partial<QrDesign>) => setD(v => (v ? { ...v, ...patch } : v));
  const ratio = contrast(d.dark, d.light);
  const dark = d.style === 'dark';
  const ink = dark ? d.light : '#16181A';
  const paper = dark ? d.dark : d.light;

  const save = async () => {
    setBusy(true);
    try {
      const r = await fetch('/api/client/admin/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ qr_design: d }) });
      const x = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(x.error || 'Nepovedlo se uložit.');
      setD(normalizeQrDesign(x.profile?.qr_design));
      toast('Vzhled QR uložen. Tisk ho použije.');
    } catch (e: any) { toast(e.message); }
    setBusy(false);
  };
  const print = (all: boolean) => {
    const qs = all ? 'all=1' : `tableId=${first?.id}`;
    window.open(`/api/client/admin/tables/qr?${qs}&design=${encodeURIComponent(JSON.stringify(d))}`, '_blank');
  };

  // Sourozenecké sekce (tahle a Plánek podniku) musí vypadat stejně: dřív
  // měla jedna verzálkový štítek a druhá nadpis sekce, takže to vypadalo,
  // že patří do jiných úrovní.
  return (
    <section aria-labelledby="h-qr" className="glass-card p-4 sm:p-5 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 id="h-qr" className="t-section flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#C8F542]/15 border border-[#C8F542]/30 text-[#5B7A08]"><Icon name="print" size={15} /></span>
            Vzhled QR na stůl
          </h2>
        </div>
        <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
          className="tap-target-sm sm:ml-auto text-xs font-semibold text-black/55 hover:text-black flex items-center gap-1">
          {open ? 'Skrýt' : 'Upravit a vytisknout'}<Icon name="chevron" size={14} className={open ? 'rotate-180 transition' : 'transition'} />
        </button>
      </div>
      {!open ? (
        <p className="text-sm text-black/50">Barva, text, logo uprostřed a formát archu. Vytištěná kartička je jediná část appky, kterou host drží v ruce.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,15rem)_1fr] gap-5">
          {/* Náhled */}
          <div className="space-y-2">
            <div className="rounded-3xl border border-black/[0.08] p-5 text-center" style={{ background: paper, color: ink }}>
              {svg ? (
                <div className="mx-auto w-[9rem] [&_svg]:w-full [&_svg]:h-auto [&_svg]:block" dangerouslySetInnerHTML={{ __html: svg }} />
              ) : svgErr ? (
                <div className="mx-auto h-[9rem] w-[9rem] rounded-2xl bg-black/[0.06] flex items-center justify-center px-3">
                  <span className="text-[11px] text-black/50 text-pretty">Náhled se nenačetl. Kód na tisku je v pořádku.</span>
                </div>
              ) : (
                <div className="mx-auto h-[9rem] w-[9rem] rounded-2xl bg-black/[0.06] animate-pulse" />
              )}
              <p className="mt-3 text-base font-bold leading-tight break-words">{d.headline || teamName || 'Název podniku'}</p>
              {d.sub && <p className="text-xs opacity-65 leading-snug mt-0.5">{d.sub}</p>}
              {d.showTable && <p className="text-sm font-bold mt-1.5">Stůl {first?.name ?? '1'}</p>}
            </div>
            <p className="text-[11px] text-black/40 text-center">Náhled kreslí stejný kód, jaký vyjede z tiskárny.</p>
          </div>

          {/* Nastavení */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="qr-head" className={label}>Nadpis</label>
                <input id="qr-head" value={d.headline} onChange={e => set({ headline: e.target.value.slice(0, 40) })} placeholder={teamName || 'Název podniku'} className={input} />
              </div>
              <div>
                <label htmlFor="qr-sub" className={label}>Věta pod nadpisem</label>
                <input id="qr-sub" value={d.sub} onChange={e => set({ sub: e.target.value.slice(0, 80) })} placeholder="Naskenuj a objednej od stolu" className={input} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><p className={label}>Barva kódu</p><Swatches value={d.dark} onChange={c => set({ dark: c })} options={INKS} name="barva kódu" /></div>
              <div><p className={label}>Barva podkladu</p><Swatches value={d.light} onChange={c => set({ light: c })} options={PAPERS} name="barva podkladu" /></div>
            </div>
            {ratio < 3 && (
              <p role="alert" className="text-xs text-wait-ink bg-wait/10 border border-wait/30 rounded-2xl px-3.5 py-2">
                Takový kontrast ({ratio.toFixed(1)}:1) čtečka nepřečte. Při uložení se barva kódu vrátí na černou — zvol tmavší odstín.
              </p>
            )}

            <div>
              <p className={label}>Provedení</p>
              <div className="flex flex-wrap gap-1.5">
                {QR_STYLES.map(s => (
                  <button key={s.id} type="button" onClick={() => set({ style: s.id })} title={s.hint} aria-pressed={d.style === s.id}
                    className={`tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold transition ${d.style === s.id ? 'seg-on' : 'seg-off'}`}>{s.label}</button>
                ))}
              </div>
            </div>

            <div>
              <p className={label}>Formát tisku</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {QR_SHEETS.map(s => (
                  <button key={s.id} type="button" onClick={() => set({ sheet: s.id })} aria-pressed={d.sheet === s.id}
                    className={`text-left rounded-2xl px-3.5 py-2.5 border transition ${d.sheet === s.id ? 'border-[#C8F542] bg-[#C8F542]/15' : 'border-black/[0.08] bg-white/50 hover:bg-black/[0.03]'}`}>
                    <span className="block text-sm font-semibold text-[#16181A]">{s.label}</span>
                    <span className="block text-[11px] text-black/45 leading-snug">{s.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label htmlFor="qr-size" className={label}>Velikost kódu · {d.size} mm</label>
                <input id="qr-size" type="range" min={25} max={120} step={5} value={d.size} onChange={e => set({ size: Number(e.target.value) })}
                  className="w-full accent-[#8FB811]" />
                <p className="text-[11px] text-black/40 mt-0.5">Pod 30 mm se z dálky skenuje hůř.</p>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-2.5 text-sm text-[#16181A] cursor-pointer">
                  <input type="checkbox" checked={d.showTable} onChange={e => set({ showTable: e.target.checked })} className="h-4 w-4 accent-[#8FB811]" />
                  Napsat číslo stolu
                </label>
                <label className={`flex items-center gap-2.5 text-sm cursor-pointer ${hasLogo ? 'text-[#16181A]' : 'text-black/35'}`}>
                  <input type="checkbox" disabled={!hasLogo} checked={d.logo && hasLogo} onChange={e => set({ logo: e.target.checked })} className="h-4 w-4 accent-[#8FB811]" />
                  Logo doprostřed kódu
                </label>
                {!hasLogo && <p className="text-[11px] text-black/40">Logo nahraj ve Vzhledu podniku.</p>}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="accent" icon="check" loading={busy} onClick={save}>Uložit vzhled</Button>
              <Button variant="secondary" icon="print" disabled={!first} onClick={() => print(false)}>Vytisknout ukázku</Button>
              <Button variant="ghost" icon="print" disabled={!tables.length} onClick={() => print(true)}>Všechny stoly ({tables.length})</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
