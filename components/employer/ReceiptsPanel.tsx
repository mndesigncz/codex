'use client';

// Receipts on the go: snap a photo of the paper receipt, jot the supplier and
// amount, done. When the note mentions something we carry in stock, the panel
// offers to restock it right away — the receipt IS the delivery note.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icons';

const inputCls =
  'w-full rounded-2xl bg-black/[0.04] border border-black/[0.08] px-4 py-3 text-sm text-[#16181A] placeholder-black/30 focus:border-[#C8F542]/50 focus:outline-none';

interface Receipt {
  id: number;
  photoUrl: string | null;
  supplier: string | null;
  amount: number | null;
  note: string | null;
  createdAt: string;
  authorName?: string | null;
}

/** Diacritics-insensitive haystack for matching stock item names in free text. */
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export default function ReceiptsPanel({ compact = false }: { compact?: boolean }) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [supplier, setSupplier] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [restocked, setRestocked] = useState<Record<number, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const d = await fetch('/api/receipts').then(r => r.json());
      setReceipts(Array.isArray(d.receipts) ? d.receipts : []);
      if (d.error) setErr(d.error);
    } catch { /* ignore */ }
    try {
      const d = await fetch('/api/inventory').then(r => r.json());
      setItems(Array.isArray(d.items) ? d.items : []);
    } catch { /* matching is a nice-to-have */ }
  };
  useEffect(() => { load(); }, []);

  const pickPhoto = () => fileRef.current?.click();
  const onFile = async (f: File | null) => {
    if (!f) return;
    setUploading(true); setErr('');
    try {
      const { compressImage } = await import('@/lib/clientImage');
      const prepared = await compressImage(f);
      const fd = new FormData();
      fd.append('file', prepared);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.url) setPhotoUrl(d.url);
      else setErr(d.error || `Fotku se nepodařilo nahrát (HTTP ${res.status}).`);
    } catch { setErr('Fotku se nepodařilo nahrát — zkontroluj připojení.'); }
    setUploading(false);
  };

  // Stock items mentioned in the typed text — the "we carry this" recognition.
  const matches = useMemo(() => {
    const hay = norm(`${supplier} ${note}`);
    if (hay.trim().length < 3) return [];
    return items
      .filter((i: any) => {
        const n = norm(String(i.name ?? ''));
        return n.length >= 3 && hay.includes(n);
      })
      .slice(0, 6);
  }, [items, supplier, note]);

  const save = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      const res = await fetch('/api/receipts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photoUrl,
          supplier: supplier.trim() || null,
          amount: amount === '' ? null : parseInt(amount),
          note: note.trim() || null,
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok) {
        setPhotoUrl(null); setSupplier(''); setAmount(''); setNote('');
        setMsg('Účtenka uložena.');
        setTimeout(() => setMsg(''), 2500);
        await load();
      } else setErr(d.error || 'Uložení se nepodařilo.');
    } catch { setErr('Uložení se nepodařilo.'); }
    setSaving(false);
  };

  const restock = async (item: any) => {
    try {
      const res = await fetch(`/api/inventory/${item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: (Number(item.quantity) || 0) + 1,
          note: `Naskladněno z účtenky${supplier.trim() ? ` (${supplier.trim()})` : ''}`,
        }),
      });
      if (res.ok) {
        setRestocked(r => ({ ...r, [item.id]: true }));
        setItems(list => list.map((x: any) => x.id === item.id ? { ...x, quantity: (Number(x.quantity) || 0) + 1 } : x));
      }
    } catch { /* best-effort */ }
  };

  const remove = async (r: Receipt) => {
    if (!confirm('Smazat účtenku?')) return;
    setReceipts(list => list.filter(x => x.id !== r.id));
    try { await fetch(`/api/receipts?id=${r.id}`, { method: 'DELETE' }); } catch { /* optimistic */ }
  };

  return (
    <div className="space-y-4">
      {/* Capture card */}
      <div className="glass-card p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold text-[#16181A] flex items-center gap-2">
            <Icon name="receipt" size={18} className="text-[#5B7A08]" /> Nová účtenka
          </p>
          {msg && <span className="text-xs font-semibold text-[#5B7A08]">{msg} ✓</span>}
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={e => onFile(e.target.files?.[0] ?? null)} />
        <div className="flex items-center gap-3">
          <button onClick={pickPhoto} disabled={uploading}
            className={`shrink-0 rounded-2xl border flex items-center justify-center overflow-hidden transition active:scale-95 ${
              photoUrl ? 'border-[#C8F542]/50' : 'border-dashed border-black/20 text-black/40 hover:text-black'
            } ${compact ? 'h-16 w-16' : 'h-20 w-20'}`}>
            {uploading ? <span className="h-5 w-5 rounded-full border-2 border-black/10 border-t-[#8FB811] animate-spin" />
              : photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="Účtenka" className="h-full w-full object-cover" />
              ) : (
                <Icon name="camera" size={26} strokeWidth={1.7} />
              )}
          </button>
          <div className="min-w-0 flex-1 space-y-2">
            <input value={supplier} onChange={e => setSupplier(e.target.value)}
              placeholder="Kde nakoupeno (Makro, večerka…)" className={inputCls} />
            <div className="relative">
              <input type="number" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="Částka" className={`${inputCls} pr-10`} />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-black/35">Kč</span>
            </div>
          </div>
        </div>
        <input value={note} onChange={e => setNote(e.target.value)}
          placeholder="Co se kupovalo — např. mléko, sirup Mango…" className={inputCls} />

        {matches.length > 0 && (
          <div className="rounded-2xl bg-[#C8F542]/[0.1] border border-[#C8F542]/30 px-3.5 py-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[#5B7A08] mb-1.5">Tohle vedeme ve skladu</p>
            <div className="flex flex-wrap gap-1.5">
              {matches.map((i: any) => (
                <button key={i.id} onClick={() => restock(i)} disabled={restocked[i.id]}
                  className={`tap-target-sm rounded-full px-3 py-1.5 text-xs font-semibold transition active:scale-95 ${
                    restocked[i.id]
                      ? 'bg-[#C8F542]/40 text-[#3E5406]'
                      : 'bg-white/70 text-[#16181A] hover:bg-white border border-black/[0.06]'
                  }`}>
                  {restocked[i.id] ? `✓ ${i.name} +1` : `＋1 ${i.name} (${i.quantity} ${i.unit})`}
                </button>
              ))}
            </div>
          </div>
        )}

        {err && <p className="text-sm text-red-600">{err}</p>}
        <button onClick={save} disabled={saving || uploading}
          className="w-full rounded-full bg-[#16181A] text-white font-bold px-5 py-3 text-sm hover:bg-black disabled:opacity-50 transition">
          {saving ? 'Ukládám…' : 'Uložit účtenku'}
        </button>
      </div>

      {/* Recent receipts */}
      {receipts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-black/45 px-1">Poslední účtenky</p>
          {receipts.slice(0, compact ? 5 : 30).map(r => (
            <div key={r.id} className="glass-card p-3 flex items-center gap-3">
              {r.photoUrl ? (
                <a href={r.photoUrl} target="_blank" rel="noreferrer" className="shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={r.photoUrl} alt="" className="h-12 w-12 rounded-xl object-cover border border-black/[0.06]" />
                </a>
              ) : (
                <span className="shrink-0 h-12 w-12 rounded-xl bg-black/[0.04] flex items-center justify-center text-black/40">
                  <Icon name="receipt" size={20} strokeWidth={1.7} />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#16181A] truncate">
                  {r.supplier || 'Účtenka'}
                  {r.amount != null && <span className="ml-1.5 text-[#5B7A08] tabular-nums">{Number(r.amount).toLocaleString('cs-CZ')} Kč</span>}
                </p>
                <p className="text-[11px] text-black/40 truncate">
                  {new Date(r.createdAt).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric' })}
                  {r.note ? ` · ${r.note}` : ''}
                </p>
              </div>
              <button onClick={() => remove(r)} className="shrink-0 text-black/30 hover:text-red-600 transition p-1.5" title="Smazat">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
