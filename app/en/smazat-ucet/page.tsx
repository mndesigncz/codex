import type { Metadata } from 'next';
import PravniStranka from '@/components/pravni/PravniStranka';
import ZadostOSmazani from '@/components/pravni/ZadostOSmazani';

// Google Play chce odkaz na smazání účtu dostupný i mimo aplikaci. Formulář nic
// nesmaže sám: pošle e-mail s potvrzením (app/api/account/delete-request).
export const metadata: Metadata = { title: 'Delete your account and data · Managero', alternates: { canonical: '/en/smazat-ucet' } };

export default function Stranka() {
  return <PravniStranka klic="smazat-ucet" jazyk="en" dodatek={<ZadostOSmazani jazyk="en" />} />;
}
