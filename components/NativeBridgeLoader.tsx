'use client';

// Načte nativní most (components/NativeBridge) jen v obalu. Web tak nestáhne ani
// bajt navíc: dynamický import se vyhodnotí až po zjištění značky v User-Agentu
// (ManageroApp/ nebo ManageroClient/, přidává ji apps/*/capacitor.config.ts).

import { useEffect, useState, type ComponentType } from 'react';
import { zjistiObalUa } from '@/lib/nativni/most';

export default function NativeBridgeLoader() {
  const [Most, setMost] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (!zjistiObalUa(navigator.userAgent).obal) return;
    let zrusene = false;
    import('./NativeBridge').then(m => { if (!zrusene) setMost(() => m.default); }).catch(() => { /* bez mostu se aplikace chová jako web */ });
    return () => { zrusene = true; };
  }, []);
  return Most ? <Most /> : null;
}
