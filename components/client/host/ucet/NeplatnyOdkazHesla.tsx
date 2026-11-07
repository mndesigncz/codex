'use client';

// /client/nove-heslo bez platného tokenu: prázdný stav směru A (vějíř prázdných karet) s cestou
// zpátky na žádost o nový odkaz. Texty sdílí se zapomenutým heslem (sekce spolecne).

import Link from 'next/link';
import { PrazdnyStav } from '../../penezenka';
import { useT } from '@/lib/i18n/client';

export default function NeplatnyOdkazHesla() {
  const t = useT('spolecne');
  return (
    <div className="mx-auto w-full max-w-[420px] pt-2 md:pt-12">
      <h1 className="sr-only">{t('Nové heslo')}</h1>
      <div className="lgx hp-sklo px-5 pb-6">
        <PrazdnyStav titulek={t('Odkaz nefunguje')} text={t('Odkaz je neúplný nebo už neplatí. Požádej o nový.')}
          akce={<Link href="/client/zapomenute-heslo" className="hp-btn lgx hp-btn-sklo hp-btn-stredni">{t('Zapomenuté heslo')}</Link>} />
      </div>
    </div>
  );
}
