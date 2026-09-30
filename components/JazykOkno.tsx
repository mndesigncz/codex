'use client';

import { Modal } from './ui/Modal';
import JazykKarta from './JazykKarta';
import { useT } from '@/lib/i18n/client';

// Okno s jazyky pro účtové menu a spodní list „Více". Na telefonu vyjede zdola
// jako každé okno (vzhled řeší společné okno). Volba se ukládá hned, okno po ní
// zůstane otevřené, aby se dalo zkontrolovat, že se text přepnul.
export default function JazykOkno({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  return (
    <Modal open={open} onClose={onClose} title={t('Jazyk')} subtitle={t('Jazyk rozhraní aplikace.')} size="sm">
      <JazykKarta />
    </Modal>
  );
}
