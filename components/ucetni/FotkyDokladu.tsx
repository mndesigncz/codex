'use client';

// Fotky dokladu k příjmu objednávky (dodací list, faktura) — pro účetní.
//
// Stejná stavba jako fotky dokladů u uzávěrky (components/employee/CashClosing.tsx):
// input souboru s `capture="environment"` otevře na telefonu rovnou zadní fotoaparát,
// fotka se zmenší v prohlížeči (lib/clientImage) a nahraje přes POST /api/upload do
// soukromého úložiště; do objednávky se ukládá jen adresa /api/upload/<id>.
// Nejvýš `strop` fotek (příjemka: 4), každá jde odebrat.

import { useState } from 'react';
import { Button } from '../ui';
import { Icon } from '../Icons';
import { useT } from '@/lib/i18n/client';
import { apiMessage, okJson } from '@/lib/api';
import { platnaFotka } from '@/lib/ukolyPrehled';

export default function FotkyDokladu({ fotky, onChange, strop = 4 }: {
  fotky: string[];
  onChange: (fotky: string[]) => void;
  strop?: number;
}) {
  const t = useT('widgety');
  const [nahravam, setNahravam] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const plno = fotky.length >= strop;

  const nahraj = async (soubor: File | null) => {
    if (!soubor) return;
    setNahravam(true);
    setChyba(null);
    try {
      const { compressImage } = await import('@/lib/clientImage');
      const fd = new FormData();
      fd.append('file', await compressImage(soubor));
      const d = await fetch('/api/upload', { method: 'POST', body: fd }).then(okJson);
      if (platnaFotka(d?.url)) onChange([...fotky, d.url]);
      else setChyba(t('Fotku se nepodařilo nahrát.'));
    } catch (e) {
      setChyba(apiMessage(e, t('Fotku se nepodařilo nahrát — zkontroluj připojení.')));
    }
    setNahravam(false);
  };
  // Výběr souboru přes input vytvořený až při klepnutí: v okně příjmu tak není skryté pole navíc
  // (měření polí a pořadí fokusu v okně ho nevidí) a stejnou fotku jde vybrat znovu.
  const vyfot = () => {
    setChyba(null);
    const i = document.createElement('input');
    i.type = 'file'; i.accept = 'image/*'; i.setAttribute('capture', 'environment');
    i.setAttribute('data-fotky-prijemky-vstup', '');
    i.style.display = 'none';
    i.onchange = () => { void nahraj(i.files?.[0] ?? null); i.remove(); };
    i.addEventListener('cancel', () => i.remove());
    document.body.appendChild(i);
    i.click();
  };

  return (
    <div className="space-y-2" data-fotky-prijemky="">
      {fotky.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('Fotky dokladu')}>
          {fotky.map((url, i) => (
            <li key={url} className="relative">
              <a href={url} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden ring-1 ring-black/10"
                aria-label={t('Otevřít doklad {n}', { n: i + 1 })}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-16 w-16 object-cover" />
              </a>
              <button type="button" onClick={() => onChange(fotky.filter(x => x !== url))}
                aria-label={t('Odebrat doklad {n}', { n: i + 1 })}
                className="tap-target-sm absolute -top-2 -right-2 btn-icon btn-icon-danger bg-white shadow"><Icon name="close" size={13} /></button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="secondary" size="sm" icon="camera" loading={nahravam} disabled={plno || nahravam} onClick={vyfot}>
        {fotky.length ? t('Vyfotit další stranu') : t('Vyfotit dodací list / fakturu')}
      </Button>
      {plno && <p className="t-meta">{t('Nejvýš {n} fotky — odeber některou, když chceš jinou.', { n: strop })}</p>}
      {chyba && <p className="note note-danger text-sm" role="alert">{chyba}</p>}
    </div>
  );
}
