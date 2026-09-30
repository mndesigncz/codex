import type { Metadata } from 'next';
import PravniStranka from '@/components/pravni/PravniStranka';
import ZadostOSmazani from '@/components/pravni/ZadostOSmazani';

// Google Play chce odkaz na smazání účtu dostupný i mimo aplikaci. Formulář nic
// nesmaže sám: pošle e-mail s potvrzením (app/api/account/delete-request).
export const metadata: Metadata = { title: 'Smazání účtu a dat · Managero', alternates: { canonical: '/smazat-ucet' } };

export default function Stranka() {
  return <PravniStranka klic="smazat-ucet" jazyk="cs" dodatek={<ZadostOSmazani jazyk="cs" />} />;
}
