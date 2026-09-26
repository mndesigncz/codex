'use client';

// Vzhled QR na stůl. Vytištěná kartička je jediná část appky, kterou host
// drží v ruce — tady se dá nastavit barva, text, logo uprostřed a formát
// archu. Náhled vlevo ukazuje rozpracované nastavení hned, bez ukládání.
//
// Kolo 69 (B8): karta s titulkem bez tónovaného kolečka, rozbalení tlačítkem
// (dřív ruční text 12 px, na telefonu se lámal jinak než u Plánku), provedení
// a formát jako Segmented (dřív ruční pilulky a vybírací karty s limetkovým
// rámečkem), přepínače místo zaškrtávátek, kostra Skeleton místo animate-pulse,
// hláška `.note note-wait` a „Uložit vzhled" tmavě — limetkou je na stránce
// Stoly „Přidat stůl". Uložit smí jen kdo má klient.vzhled.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Card, Field, Input, Segmented, Skeleton, SwitchRow } from '../ui';
import { QR_DEFAULT, QR_SHEETS, QR_STYLES, contrast, normalizeQrDesign, type QrDesign } from '@/lib/qrDesign';
import { okJson } from '@/lib/api';
import { okText } from '@/lib/api';

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
      <label className="filter-pill tap-target-sm seg-off glass cursor-pointer">
        <Icon name="sparkle" size={12} />Vlastní
        <input type="color" value={value} onChange={e => onChange(e.target.value.toUpperCase())} aria-label={`Vlastní ${name}`} className="h-5 w-5 cursor-pointer bg-transparent border-0 p-0" />
      </label>
    </div>
  );
}

export default function QrDesigner({ toast, tables, smiUlozit = true }: { toast: (m: string) => void; tables: { id: number; name: string }[]; smiUlozit?: boolean }) {
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
    <Card aria-labelledby="h-qr" className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h2 id="h-qr" className="t-card flex items-center gap-2 min-w-0"><Icon name="print" size={17} className="shrink-0 text-black/40" />Vzhled QR na stůl</h2>
        <Button variant="ghost" size="sm" iconAfter="chevron" className={`sm:ml-auto ${open ? '[&>svg:last-child]:rotate-180' : ''}`}
          aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? 'Skrýt' : 'Upravit a vytisknout'}</Button>
      </div>
      {!open ? (
        <p className="t-meta">Barva, text, logo uprostřed a formát archu. Vytištěná kartička je jediná část appky, kterou host drží v ruce.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,15rem)_1fr] gap-5">
          {/* Náhled */}
          <div className="space-y-2">
            <div className="rounded-2xl border border-black/[0.08] p-5 text-center" style={{ background: paper, color: ink }}>
              {svg ? (
                <div className="mx-auto w-[9rem] [&_svg]:w-full [&_svg]:h-auto [&_svg]:block" dangerouslySetInnerHTML={{ __html: svg }} />
              ) : svgErr ? (
                <div className="mx-auto h-[9rem] w-[9rem] rounded-xl bg-black/[0.06] flex items-center justify-center px-3">
                  <span className="text-[11px] text-black/55 text-pretty">Náhled se nenačetl. Kód na tisku je v pořádku.</span>
                </div>
              ) : (
                <Skeleton className="mx-auto h-[9rem] w-[9rem] rounded-xl" />
              )}
              <p className="mt-3 text-base font-bold leading-tight break-words">{d.headline || teamName || 'Název podniku'}</p>
              {d.sub && <p className="text-xs opacity-65 leading-snug mt-0.5">{d.sub}</p>}
              {d.showTable && <p className="text-sm font-bold mt-1.5">Stůl {first?.name ?? '1'}</p>}
            </div>
            <p className="t-meta text-center">Náhled kreslí stejný kód, jaký vyjede z tiskárny.</p>
          </div>

          {/* Nastavení */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field id="qr-head" label="Nadpis">
                <Input id="qr-head" value={d.headline} onChange={e => set({ headline: e.target.value.slice(0, 40) })} placeholder={teamName || 'Název podniku'} />
              </Field>
              <Field id="qr-sub" label="Věta pod nadpisem">
                <Input id="qr-sub" value={d.sub} onChange={e => set({ sub: e.target.value.slice(0, 80) })} placeholder="Naskenuj a objednej od stolu" />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><p className="field-label">Barva kódu</p><Swatches value={d.dark} onChange={c => set({ dark: c })} options={INKS} name="barva kódu" /></div>
              <div><p className="field-label">Barva podkladu</p><Swatches value={d.light} onChange={c => set({ light: c })} options={PAPERS} name="barva podkladu" /></div>
            </div>
            {ratio < 3 && (
              <p role="alert" className="note note-wait">
                Takový kontrast ({ratio.toLocaleString('cs-CZ', { maximumFractionDigits: 1 })} : 1) čtečka nepřečte. Při uložení se barva kódu vrátí na černou — zvol tmavší odstín.
              </p>
            )}

            <div>
              <p className="field-label">Provedení</p>
              <Segmented size="sm" ariaLabel="Provedení kartičky" value={d.style} onChange={v => set({ style: v })}
                options={QR_STYLES.map(x => ({ id: x.id, label: x.label }))} />
              <p className="t-meta mt-1.5">{QR_STYLES.find(x => x.id === d.style)?.hint}</p>
            </div>

            <div>
              <p className="field-label">Formát tisku</p>
              <Segmented size="sm" ariaLabel="Formát tisku" value={d.sheet} onChange={v => set({ sheet: v })}
                options={QR_SHEETS.map(x => ({ id: x.id, label: x.label }))} />
              <p className="t-meta mt-1.5">{QR_SHEETS.find(x => x.id === d.sheet)?.hint}</p>
            </div>

            <Field id="qr-size" label={`Velikost kódu · ${d.size} mm`} hint="Pod 30 mm se z dálky skenuje hůř.">
              <input id="qr-size" type="range" min={25} max={120} step={5} value={d.size} onChange={e => set({ size: Number(e.target.value) })}
                className="w-full accent-[#8FB811]" />
            </Field>
            <ul className="list">
              <SwitchRow title="Napsat číslo stolu" checked={d.showTable} onChange={v => set({ showTable: v })} />
              <SwitchRow title="Logo doprostřed kódu" hint={hasLogo ? undefined : 'Logo nahraj ve Vzhledu podniku.'}
                disabled={!hasLogo} checked={d.logo && hasLogo} onChange={v => set({ logo: v })} />
            </ul>

            <div className="flex flex-wrap gap-2 pt-1">
              {smiUlozit && <Button variant="primary" icon="check" loading={busy} onClick={save}>Uložit vzhled</Button>}
              <Button variant="secondary" icon="print" disabled={!first} onClick={() => print(false)}>Vytisknout ukázku</Button>
              <Button variant="ghost" icon="print" disabled={!tables.length} onClick={() => print(true)}>Všechny stoly ({tables.length})</Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
