'use client';

// Public share links plus the look of the pages they open. Everything here is
// customer-facing, so the editor stays blunt about what does and doesn't leave
// the app.
//
// Kolo 69 (B8): jazyk zbytku aplikace — karty Card, pole Field/Input/Select,
// přepínač Ze skladu / Z návodů jako Segmented, hlášky jedním Toastem (dřív
// limetkový proužek s „✓"), „Vytvořit odkaz" jako Button (dřív ručně psaná
// limetka), „Kopírovat" tmavě (dřív druhá limetka u každého řádku), QR ikonou
// místo znaku „⬚", aktivní odkaz jako Switch, skryté kategorie jako
// filter-pill a smazání odkazu v okně místo confirm().

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { Icon } from '../Icons';
import { Button, Card, Chip, Field, Input, Menu, Modal, Segmented, Select, Skeleton, Switch, Toast, Well } from '../ui';
import { usePlan, ProBadge, UpgradeModal } from '../Pro';
import { ulozZAdresy, jeObalKlient } from '@/lib/stahni';
import {
  type ShareLink, type ShareTheme, DEFAULT_THEME, THEME_PRESETS, normalizeTheme,
} from '@/lib/share';
import { flattenTree, pathOfId, type CategoryNode } from '@/lib/categoryTree';
import { useModal } from '@/lib/useModal';
import { okJson } from '@/lib/api';
import { useT } from '@/lib/i18n/client';
import { sUzlem, VLOZ } from './jazyk';


type GuideCat = { id: number; name: string };

export default function ShareSettings() {
  const t = useT('sprava');
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [theme, setTheme] = useState<ShareTheme>(DEFAULT_THEME);
  const { pro } = usePlan();
  const [upgradeFor, setUpgradeFor] = useState<string | null>(null);
  // QR of a link, rendered on demand — print it and put it on the counter.
  const [qrFor, setQrFor] = useState<{ url: string; title: string } | null>(null);
  const [qrData, setQrData] = useState('');
  useEffect(() => {
    if (!qrFor) { setQrData(''); return; }
    QRCode.toDataURL(qrFor.url, { width: 480, margin: 1 }).then(setQrData).catch(() => setQrData(''));
  }, [qrFor]);
  const [cats, setCats] = useState<CategoryNode[]>([]);
  const [guideCats, setGuideCats] = useState<GuideCat[]>([]);
  const [loading, setLoading] = useState(true);
  const [notMigrated, setNotMigrated] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [mazu, setMazu] = useState<ShareLink | null>(null);
  const [creating, setCreating] = useState(false);

  // New-link form.
  const [kind, setKind] = useState<'inventory' | 'guides'>('inventory');
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  const flat = useMemo(() => flattenTree(cats), [cats]);

  const load = async () => {
    try {
      const [d, c, g] = await Promise.all([
        fetch('/api/share').then(okJson).catch(() => ({})),
        fetch('/api/inventory/categories').then(okJson).catch(() => []),
        fetch('/api/guides/categories').then(okJson).catch(() => ({})),
      ]);
      if (Array.isArray(d?.links)) setLinks(d.links);
      if (d?.theme) setTheme(normalizeTheme(d.theme));
      setNotMigrated(d?.notMigrated === true);
      if (Array.isArray(c)) setCats(c);
      const gc = g?.categories;
      if (Array.isArray(gc)) setGuideCats(gc.map((x: any) => ({ id: Number(x.id), name: String(x.name) })));
    } catch { /* leave the defaults */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const flash = (m: string) => setMsg(m);

  const create = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/share', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, categoryId: categoryId ? Number(categoryId) : null, title, note }),
      });
      if (res.ok) {
        setTitle(''); setNote(''); setCategoryId('');
        await load();
        flash(t('Odkaz vytvořen.'));
      } else {
        const d = await res.json().catch(() => ({}));
        flash(d.error || t('Odkaz se nepodařilo vytvořit.'));
      }
    } catch { flash(t('Nepodařilo se spojit se serverem.')); }
    setCreating(false);
  };

  const patch = async (id: number, body: Record<string, any>) => {
    setLinks(prev => prev.map(l => l.id === id ? { ...l, ...body } : l));
    try {
      await fetch(`/api/share/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch { load(); }
  };

  const remove = async (l: ShareLink) => {
    setLinks(prev => prev.filter(x => x.id !== l.id));
    try { await fetch(`/api/share/${l.id}`, { method: 'DELETE' }); } catch { load(); }
  };

  const saveTheme = async (next: ShareTheme) => {
    setTheme(next);
    try {
      const res = await fetch('/api/share', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: next }),
      });
      if (res.ok) flash(t('Vzhled uložen.'));
    } catch { flash(t('Vzhled se nepodařilo uložit.')); }
  };

  const urlOf = (l: ShareLink) =>
    `${typeof window !== 'undefined' ? window.location.origin : ''}/s/${l.token}`;

  const copy = async (l: ShareLink) => {
    try { await navigator.clipboard.writeText(urlOf(l)); flash(t('Odkaz zkopírován.')); } catch {}
  };

  if (loading) {
    return <Card><Skeleton className="h-24" /></Card>;
  }

  return (
    <div className="space-y-4">
      {notMigrated && (
        <p className="note note-wait">{sUzlem(t('Sdílení zatím není v databázi připravené — spusť {cesta}.', { cesta: VLOZ }), <code>/api/init</code>)}</p>
      )}

      {/* ---- Nový odkaz ---- */}
      <Card className="space-y-4">
        <div>
          <h3 className="t-card flex items-center gap-2"><Icon name="send" size={17} className="text-black/40" />{t('Nový odkaz pro zákazníky')}</h3>
          <p className="t-meta mt-0.5">{t('Stránka bez přihlášení, kde je vidět jen název, značka a popis. Žádné počty, ceny ani dodavatelé.')}</p>
        </div>

        <Segmented size="sm" ariaLabel={t('Co sdílet')} value={kind} onChange={k => { setKind(k); setCategoryId(''); }}
          options={[{ id: 'inventory', label: t('Ze skladu') }, { id: 'guides', label: t('Z návodů') }]} />

        {kind === 'inventory' && (
          <Field id="sdil-co" label={t('Co sdílet')} hint={t('U kategorie se sdílí i všechny její podkategorie, pěkně pod sebou.')}>
            <Select id="sdil-co" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
              <option value="">{t('Celý sklad')}</option>
              {flat.map(({ cat: c, depth }) => (
                <option key={c.id} value={String(c.id)}>{' '.repeat(depth * 2)}{c.name}</option>
              ))}
            </Select>
          </Field>
        )}
        {kind === 'guides' && (
          <Well><p className="t-meta">{t('Sdílí se jen názvy návodů seřazené podle kategorií — obsah návodu se ven nedostane.')}</p></Well>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="sdil-nadpis" label={t('Nadpis stránky')}>
            <Input id="sdil-nadpis" value={title} onChange={e => setTitle(e.target.value)} placeholder={t('Např. Naše tabáky')} />
          </Field>
          <Field id="sdil-podtitulek" label={t('Podtitulek')}>
            <Input id="sdil-podtitulek" value={note} onChange={e => setNote(e.target.value)} placeholder={t('Nepovinný text pod nadpisem')} />
          </Field>
        </div>

        <Button variant="primary" icon="plus" loading={creating} onClick={create}>{t('Vytvořit odkaz')}</Button>
      </Card>

      {/* ---- Sdílené odkazy ---- */}
      {links.length > 0 && (
        <Card pad="none" aria-labelledby="sdil-odkazy">
          <h3 id="sdil-odkazy" className="t-card px-5 pt-4">{t('Sdílené odkazy')}</h3>
          <ul className="list px-5">
            {links.map(l => (
              <LinkRow key={l.id} link={l} cats={cats} guideCats={guideCats}
                url={urlOf(l)} onCopy={() => copy(l)} onPatch={b => patch(l.id, b)} onRemove={() => setMazu(l)}
                onQr={() => setQrFor({ url: urlOf(l), title: l.title || t('Sdílený odkaz') })} />
            ))}
          </ul>
        </Card>
      )}

      {/* ---- Vzhled stránek ---- */}
      {!pro ? (
        <Card className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="t-card flex items-center gap-2"><Icon name="sun" size={17} className="text-black/40" />  {t('Vzhled sdílených stránek')} <ProBadge /></h3>
            <p className="t-meta mt-0.5">{t('Barvy, logo a patička podle vašeho podniku.')}</p>
          </div>
          <Button size="sm" variant="secondary" icon="lock" onClick={() => setUpgradeFor(t('Vlastní vzhled sdílených stránek'))}>{t('Odemknout')}</Button>
        </Card>
      ) : (
      <Card className="space-y-4">
        <div>
          <h3 className="t-card flex items-center gap-2"><Icon name="sun" size={17} className="text-black/40" />  {t('Vzhled sdílených stránek')}</h3>
          <p className="t-meta mt-0.5">{t('Platí pro všechny odkazy najednou.')}</p>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {THEME_PRESETS.map(p => {
            const active = theme.background === p.theme.background && theme.accent === p.theme.accent;
            return (
              <button key={p.id} type="button" onClick={() => saveTheme({ ...theme, ...p.theme })} aria-pressed={active}
                className={`filter-pill tap-target-sm inline-flex items-center gap-2 ${active ? 'seg-on' : 'seg-off glass'}`}>
                <span className="inline-flex gap-0.5" aria-hidden>
                  <span className="w-3 h-3 rounded-full border border-black/10" style={{ background: p.theme.background }} />
                  <span className="w-3 h-3 rounded-full border border-black/10" style={{ background: p.theme.accent }} />
                </span>
                {p.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {([
            ['background', t('Pozadí')],
            ['accent', t('Nadpisy')],
            ['text', t('Text')],
          ] as const).map(([key, label]) => (
            <Field key={key} id={`sdil-barva-${key}`} label={label}>
              <div className="flex items-center gap-2">
                <input type="color" value={theme[key]} aria-label={t('{label} — barva', { label })}
                  onChange={e => setTheme(t => ({ ...t, [key]: e.target.value }))}
                  onBlur={() => saveTheme(theme)}
                  className="h-11 w-14 shrink-0 rounded-xl border border-black/[0.08] bg-white cursor-pointer" />
                <Input id={`sdil-barva-${key}`} value={theme[key]}
                  onChange={e => setTheme(t => ({ ...t, [key]: e.target.value }))}
                  onBlur={() => saveTheme(theme)} className="font-mono" />
              </div>
            </Field>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="sdil-podnik" label={t('Název podniku')}>
            <Input id="sdil-podnik" value={theme.businessName} onChange={e => setTheme(t => ({ ...t, businessName: e.target.value }))}
              onBlur={() => saveTheme(theme)} placeholder={t('Zobrazí se nad nadpisem')} />
          </Field>
          <Field id="sdil-logo" label={t('Logo (odkaz na obrázek)')}>
            <Input id="sdil-logo" value={theme.logoUrl} onChange={e => setTheme(t => ({ ...t, logoUrl: e.target.value }))}
              onBlur={() => saveTheme(theme)} placeholder="https://…" />
          </Field>
        </div>

        <Field id="sdil-paticka" label={t('Patička')}>
          <Input id="sdil-paticka" value={theme.footer} onChange={e => setTheme(t => ({ ...t, footer: e.target.value }))}
            onBlur={() => saveTheme(theme)} placeholder={t('Adresa, otevírací doba, kontakt…')} />
        </Field>

        {/* Živý náhled */}
        <div className="rounded-2xl overflow-hidden border border-black/[0.08]">
          <div style={{ background: theme.background, color: theme.text }} className="p-5 text-center">
            {theme.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={theme.logoUrl} alt="" style={{ maxHeight: 36, margin: '0 auto 10px', objectFit: 'contain' }} />
            )}
            {theme.businessName && <p className="text-[13px] font-semibold opacity-60">{theme.businessName}</p>}
            <p style={{ color: theme.accent }} className="text-lg font-bold tracking-tight mt-1">{t('Naše nabídka')}</p>
            <p className="text-xs opacity-60 mt-2">{t('Ukázka toho, jak stránka vypadá.')}</p>
          </div>
        </div>
      </Card>
      )}
      {qrFor && (
        <Modal open onClose={() => setQrFor(null)} title={qrFor.title} size="sm"
          subtitle={t('Vytiskni a polož na pult — zákazník načte mobilem.')}
          footer={<>
            <Button variant="secondary" onClick={() => setQrFor(null)}>{t('Zavřít')}</Button>
            {qrData && (
              <a href={qrData} download="qr-nabidka.png" className="btn btn-primary"
                onClick={ev => { if (jeObalKlient()) { ev.preventDefault(); void ulozZAdresy(qrData, 'qr-nabidka.png'); } }}>
                <Icon name="download" size={17} />{t('Stáhnout PNG')}
              </a>
            )}
          </>}>
          <div className="text-center">
            {qrData
              ? <img src={qrData} alt={t('QR kód odkazu')} className="mx-auto w-64 h-64 rounded-2xl bg-white p-2 border border-black/[0.08]" />
              : <Skeleton className="mx-auto w-64 h-64" />}
          </div>
        </Modal>
      )}
      {mazu && (
        <Modal open onClose={() => setMazu(null)} size="sm" title={t('Smazat odkaz?')}
          footer={<>
            <Button variant="secondary" onClick={() => setMazu(null)}>{t('Zrušit')}</Button>
            <Button variant="danger-solid" onClick={() => { const l = mazu; setMazu(null); void remove(l); }}>{t('Smazat')}</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{t('Kdo odkaz „{nazev}“ má, přestane stránku vidět.', { nazev: mazu.title || t('bez nadpisu') })}</p>
        </Modal>
      )}

      {upgradeFor && <UpgradeModal feature={upgradeFor} onClose={() => setUpgradeFor(null)} />}
      <Toast message={msg} onClose={() => setMsg(null)} />
    </div>
  );
}

function LinkRow({ link, cats, guideCats, url, onCopy, onPatch, onRemove, onQr }: {
  link: ShareLink;
  cats: CategoryNode[];
  guideCats: GuideCat[];
  url: string;
  onCopy: () => void;
  onPatch: (body: Record<string, any>) => void;
  onQr: () => void;
  onRemove: () => void;
}) {
  const t = useT('sprava');
  const [open, setOpen] = useState(false);
  const scope = link.kind === 'guides'
    ? t('Návody')
    : link.categoryId != null ? pathOfId(cats, link.categoryId) : t('Celý sklad');

  // Skrýt jde jen to, co odkaz opravdu pokrývá.
  const excludable = link.kind === 'guides'
    ? guideCats.map(g => ({ id: g.id, name: g.name, depth: 0 }))
    : flattenTree(cats).map(({ cat, depth }) => ({ id: cat.id, name: cat.name, depth }));

  const toggle = (id: number) => {
    const next = link.excluded.includes(id)
      ? link.excluded.filter(x => x !== id)
      : [...link.excluded, id];
    onPatch({ excluded: next });
  };
  const nazev = link.title || scope;

  return (
    <li className="list-row flex-col items-stretch gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Chip tone={link.enabled ? 'ok' : 'muted'} size="sm">{link.kind === 'guides' ? t('Návody') : t('Sklad')}</Chip>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium leading-snug text-[#16181A] truncate">{nazev}</p>
          <p className="text-[13px] text-black/55 truncate">{scope}{link.excluded.length > 0 ? ` · ${t('{n} skryto', { n: link.excluded.length })}` : ''}{link.enabled ? '' : ` · ${t('vypnutý')}`}</p>
        </div>
        <Button size="sm" variant="secondary" icon="copy" onClick={onCopy} aria-label={t('Zkopírovat odkaz: {nazev}', { nazev })}>{t('Kopírovat')}</Button>
        <Menu size="sm" label={t('Další akce s odkazem {nazev}', { nazev })} items={[
          { label: link.pinned ? t('Odepnout z nástěnek') : t('Připnout na nástěnku všech'), icon: 'pin', onClick: () => onPatch({ pinned: !(link.pinned === true) }) },
          { label: t('QR kód'), icon: 'print', onClick: onQr },
          { label: t('Otevřít stránku'), icon: 'external', onClick: () => window.open(url, '_blank', 'noopener') },
          { label: open ? t('Skrýt nastavení') : t('Nastavení odkazu'), icon: 'settings', onClick: () => setOpen(o => !o) },
          { label: t('Smazat odkaz…'), icon: 'trash', danger: true, onClick: onRemove },
        ]} />
      </div>

      {open && (
        <Well className="space-y-3">
          <p className="t-meta break-all font-mono">{url}</p>
          <span className="flex items-center gap-2.5">
            <Switch checked={link.enabled} onChange={v => onPatch({ enabled: v })} label={t('Odkaz je aktivní')} />
            <span className="text-sm text-[#16181A]" aria-hidden>{t('Odkaz je aktivní')}</span>
          </span>
          <div>
            <p className="t-label mb-1.5">{t('Nesdílet tyhle kategorie')}</p>
            <div className="flex flex-wrap gap-1.5">
              {excludable.map(e => {
                const off = link.excluded.includes(e.id);
                return (
                  <button key={e.id} type="button" onClick={() => toggle(e.id)} aria-pressed={off}
                    style={{ marginLeft: e.depth * 10 }}
                    className={`filter-pill tap-target-sm ${off ? 'seg-on' : 'seg-off glass'}`}>
                    {off && <Icon name="close" size={12} />}{e.name}
                  </button>
                );
              })}
              {excludable.length === 0 && <span className="t-meta">{t('Zatím žádné kategorie.')}</span>}
            </div>
            <p className="t-meta mt-1.5">{t('Vybraná kategorie se nesdílí — schová i všechno pod ní.')}</p>
          </div>
        </Well>
      )}
    </li>
  );
}
