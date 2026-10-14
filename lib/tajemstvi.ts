// Tajemství pro podpisy odkazů (odhlášení z e-mailů, zpětná volání pokladny).
//
// Dřív tu byla náhradní hodnota 'managero': když se v produkci zapomnělo
// nastavit NEXTAUTH_SECRET, podpisy šly spočítat z veřejného kódu a kdokoli
// by si vyrobil platný odkaz. Na ostrém nasazení proto chybějící tajemství
// znamená chybu, ne slabý podpis. Při vývoji a v CI zůstává náhradní hodnota,
// aby šla aplikace spustit bez .env.

export function podpisoveTajemstvi(env: Record<string, string | undefined> = process.env): string {
  const s = env.NEXTAUTH_SECRET?.trim();
  if (s) return s;
  if (env.VERCEL_ENV === 'production') {
    throw new Error('NEXTAUTH_SECRET není nastavený — podpisy odkazů nejde bezpečně spočítat.');
  }
  return 'managero-jen-pro-vyvoj';
}
