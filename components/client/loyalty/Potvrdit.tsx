'use client';

// Potvrzení nevratné akce v okně: Enter potvrdí (formulář), Escape zavře, hlavní tlačítko má konkrétní sloveso.

import { Button, Modal } from '../../ui';

export default function Potvrdit({ title, text, akce, nebezpecne = true, busy = false, onPotvrdit, onZavrit, children }: {
  title: string;
  text?: React.ReactNode;
  akce: string;
  nebezpecne?: boolean;
  busy?: boolean;
  onPotvrdit: () => void;
  onZavrit: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Modal open onClose={onZavrit} size="sm" title={title}
      footer={<>
        <Button variant="secondary" onClick={onZavrit}>Zrušit</Button>
        <Button type="submit" form="potvrdit-okno" variant={nebezpecne ? 'danger-solid' : 'primary'} loading={busy}>{akce}</Button>
      </>}>
      <form id="potvrdit-okno" onSubmit={e => { e.preventDefault(); onPotvrdit(); }} className="grid gap-3">
        {text && <p className="text-sm text-black/70 text-pretty">{text}</p>}
        {children}
      </form>
    </Modal>
  );
}
