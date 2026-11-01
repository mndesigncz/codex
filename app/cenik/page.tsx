import { permanentRedirect } from 'next/navigation';

// Ceník je sekce prodejní stránky (components/Pricing.tsx, kotva #cenik). Samostatná adresa
// /cenik je pro odkazy z právních dokumentů, Stripe a e-mailů — vede na tu sekci.
// Trvale (308): adresa se nezmění, a vyhledávač tak sílu odkazů na /cenik přičte úvodní stránce.
export default function Cenik() {
  permanentRedirect('/#cenik');
}
