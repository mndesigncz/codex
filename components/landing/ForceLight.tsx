'use client';

import { useEffect } from 'react';
import { useTheme } from '../ThemeProvider';

// Prodejní stránka je světlý ostrov (viz DESIGN.md): krémové liquid-glass
// podklady tmavou variantu nemají. Volba uživatele se jen odloží — v
// aplikaci platí dál.
export default function ForceLight() {
  const { setForcedLight } = useTheme();
  useEffect(() => { setForcedLight(true); return () => setForcedLight(false); }, [setForcedLight]);
  return null;
}
