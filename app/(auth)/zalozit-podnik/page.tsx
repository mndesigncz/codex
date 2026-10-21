import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { LogoMark } from '@/components/Icons';
import { getT } from '@/lib/i18n/server';
import { obalZHlavicek } from '@/lib/obal';

// Kam vede „Vytvořit účet“ v provozní aplikaci (lib/obal.ts přesměruje /register sem).
//
// Apple 3.1.3(f): účet služby se zakládá mimo aplikaci a aplikace na to neodkazuje,
// proto tu v obalu není odkaz ani tlačítko na web, jen věta, kde se podnik zakládá.
// Zaměstnanec, který dostal kód nebo pozvánku, se připojí rovnou (`/join`).
// Na webu (bez obalu) stránka nabídne i registraci, aby nebyla slepou uličkou.
export const metadata: Metadata = { title: 'Založení podniku · Managero', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function ZalozitPodnikPage() {
  const t = await getT(['auth']);
  const vObalu = obalZHlavicek(await headers()) !== null;
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center px-4 py-8">
      <main className="card w-full max-w-md p-6 sm:p-8 space-y-5">
        <LogoMark size={40} />
        <div className="space-y-2">
          <h1 className="t-page text-balance">{t('Účet podniku založíte na webu')}</h1>
          <p className="t-meta text-pretty">{t('Nový podnik se zakládá na webu managero.app, v aplikaci se zakládat nedá. Potom se tu přihlásíš stejným e-mailem a heslem.')}</p>
          <p className="t-meta text-pretty">{t('Máš od vedení kód týmu nebo pozvánku? Připoj se rovnou v aplikaci.')}</p>
        </div>
        <div className="flex flex-col gap-2">
          <Link href="/login" className="btn btn-accent btn-lg w-full justify-center">{t('Přihlásit se')}</Link>
          <Link href="/join" className="btn btn-secondary btn-lg w-full justify-center">{t('Připojit se kódem týmu')}</Link>
          {!vObalu && <Link href="/register" className="btn btn-ghost w-full justify-center">{t('Založit podnik')}</Link>}
        </div>
      </main>
    </div>
  );
}
