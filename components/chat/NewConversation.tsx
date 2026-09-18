'use client';

// Nová zpráva — ten chybějící vstup do chatu.
//
// Endpoint `POST /api/conversations` uměl najít nebo založit přímou
// konverzaci s kolegou od začátku, jenomže ho nic nevolalo: v celé aplikaci
// nebylo jediné tlačítko, kterým by se dala konverzace začít. Chat se tím
// v praxi scvrkl na jeden týmový kanál a „napiš to Petrovi rovnou" se řešilo
// mimo aplikaci. Tohle je ta chybějící polovina — seznam týmu, hledání,
// klepnutí, a vlákno je otevřené.

import { useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/Icons';
import { Modal, Avatar, SearchField, EmptyState, ErrorState } from '../ui';
import { startDirect, Conversation } from './useChat';

interface Mate {
  id: number;
  name: string;
  avatar?: string | null;
  jobTitle?: string | null;
  role?: string;
}

export default function NewConversation({ open, onClose, meId, conversations, onOpened }: {
  open: boolean;
  onClose: () => void;
  meId: number;
  /** Už existující konverzace — u kolegy se rovnou pozná „už si píšete". */
  conversations: Conversation[];
  /** Voláno s id konverzace, kterou má volající otevřít. */
  onOpened: (conversationId: number) => void;
}) {
  const [mates, setMates] = useState<Mate[] | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setError('');
    setMates(null);
    fetch('/api/users')
      .then(r => { if (!r.ok) throw new Error('načtení týmu selhalo'); return r.json(); })
      .then((rows: any) => {
        if (!Array.isArray(rows)) throw new Error('nečekaná odpověď');
        setMates(rows.filter((u: Mate) => u.id !== meId && u.role !== 'kiosk'));
      })
      .catch(e => setError(e?.message ?? 'Kolegy se nepodařilo načíst.'));
  }, [open, meId]);

  const existingFor = useMemo(() => {
    const m = new Map<number, number>();
    for (const c of conversations) {
      if (c.type === 'direct' && c.otherUserId != null) m.set(c.otherUserId, c.id);
    }
    return m;
  }, [conversations]);

  const shown = useMemo(() => {
    const list = mates ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter(u =>
      u.name.toLowerCase().includes(needle) ||
      (u.jobTitle ?? '').toLowerCase().includes(needle));
  }, [mates, q]);

  const pick = async (u: Mate) => {
    // Konverzace, která už existuje, se neotvírá přes server — id je v seznamu.
    const known = existingFor.get(u.id);
    if (known) { onOpened(known); onClose(); return; }
    setBusy(u.id);
    const id = await startDirect(u.id);
    setBusy(null);
    if (id == null) { setError(`Konverzaci s ${u.name} se nepodařilo založit.`); return; }
    onOpened(id);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="md"
      title="Nová zpráva"
      subtitle="Vyberte kolegu — vlákno se otevře hned.">
      <div className="space-y-3">
        <SearchField value={q} onChange={setQ} placeholder="Hledat v týmu…"
          ariaLabel="Hledat kolegu" autoFocus />

        {error && <ErrorState title="Něco se nepovedlo" detail={error} compact />}

        {mates === null && !error && (
          <p className="t-meta py-6 text-center">Načítání týmu…</p>
        )}

        {mates !== null && shown.length === 0 && (
          <EmptyState illustration="tym" compact
            title={q ? 'Nikdo neodpovídá hledání' : 'V týmu zatím nikdo další není'}
            hint={q ? 'Zkuste jiné jméno nebo pozici.' : 'Pozvěte kolegy v sekci Tým.'} />
        )}

        {mates !== null && shown.length > 0 && (
          <div className="list max-h-[52vh] overflow-y-auto scrollbar-thin">
            {shown.map(u => {
              const known = existingFor.get(u.id);
              return (
                <button key={u.id} type="button" onClick={() => pick(u)} disabled={busy === u.id}
                  className="list-row w-full text-left disabled:opacity-50">
                  <Avatar emoji={u.avatar} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block t-card truncate">{u.name}</span>
                    {u.jobTitle && <span className="block t-meta truncate">{u.jobTitle}</span>}
                  </span>
                  <span className="t-meta shrink-0">
                    {busy === u.id ? 'Otevírám…' : known ? 'Už si píšete' : <Icon name="chevron" size={16} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
