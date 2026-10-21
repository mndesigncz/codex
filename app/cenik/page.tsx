import { redirect } from 'next/navigation';

// Ceník je sekce prodejní stránky (components/Pricing.tsx, kotva #cenik). Samostatná adresa
// /cenik je pro odkazy z právních dokumentů, Stripe a e-mailů — vede na tu sekci.
export default function Cenik() {
  redirect('/#cenik');
}
