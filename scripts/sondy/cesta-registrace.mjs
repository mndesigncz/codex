// Průchod cestou registrace (components/registrace/Cesta.tsx) pro sondy:
// typ podniku → název → velikost týmu → cíle → sestavení → účet. Vrací se na
// kroku účtu s vyplněným formulářem; odeslání nechává na volajícím.
export async function kUctu(p, { nazev = 'Kavárna U Lípy' } = {}) {
  await p.getByRole('button', { name: /^Kavárna/ }).click();
  await p.locator('#cs-nazev').waitFor();
  await p.locator('#cs-nazev').fill(nazev);
  await p.getByRole('button', { name: 'Pokračovat' }).click();
  await p.getByRole('button', { name: /4 až 8/ }).click();
  await p.getByRole('button', { name: /Rozvrh a docházka/ }).waitFor();
  await p.getByRole('button', { name: /Rozvrh a docházka/ }).click();
  await p.getByRole('button', { name: 'Pokračovat' }).click();
  await p.locator('#cs-jmeno').waitFor({ timeout: 10000 });
}

export async function vyplnUcet(p, { jmeno = 'Jan Novák', email = 'jan@priklad.cz', heslo = 'tajneheslo1' } = {}) {
  await p.fill('#cs-jmeno', jmeno);
  await p.fill('#cs-email', email);
  await p.fill('#cs-heslo', heslo);
}
