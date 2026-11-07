'use client';

// Vzorník sdílené vrstvy směru A „Peněženka“ (/client/demo/vzornik): všechny komponenty systému
// na jedné obrazovce, světle i tmavě, pro oblasti přestavby, snímky a kontrolu. Jen v ukázce
// (vymyšlené podniky jako lib/klient/demo), z aplikace na něj nic neodkazuje. Texty jsou ukázková
// data, ne rozhraní — skutečné obrazovky berou texty z t().

import { useState } from 'react';
import { formatMoney } from '@/lib/money';
import { Icon } from '../../Icons';
import { Segmented } from '../../ui';
import { AvatarHosta } from '../ClientShell';
import InkoustovaKarta from './InkoustovaKarta';
import BalicekKaret, { ZasunuteKarty } from './BalicekKaret';
import Listek from './Listek';
import { Seznam, Radek } from './Seznam';
import { HlavickaObrazovky, NadpisSekce } from './Hlavicky';
import { ObalkaPodniku, ListObalky, KruhoveTlacitko } from './ObalkaPodniku';
import { PrazdnyStav, SlotPridat } from './Drobnosti';

const LIPA = { nazev: 'Kavárna U Lípy', klic: 'kavarna-u-lipy' };
const NADRAZI = { nazev: 'Bistro Nádraží', klic: 'bistro-nadrazi' };
const KOTVA = { nazev: 'Bar Kotva', klic: 'bar-kotva' };

export default function Vzornik() {
  const [otevrena, setOtevrena] = useState<number | null>(null);
  const [seg, setSeg] = useState('k');
  const [cip, setCip] = useState('19:00');
  return (
    <div className="mx-auto max-w-md pb-10" data-vzornik>
      <HlavickaObrazovky nadtitulek="Dobrý večer, Jano" titulek="Karty" vpravo={<AvatarHosta name="Jana Dvořáková" size={42} />} />

      <BalicekKaret popis="Moje karty" onOtevri={setOtevrena} karty={[
        { id: 1, ...KOTVA, popis: 'Body · Zlatý host', hodnota: '340 b.' },
        { id: 2, ...NADRAZI, popis: 'Polední menu · razítka', hodnota: '3 / 8' },
        { id: 3, ...LIPA, popis: 'Káva podle výběru · Stříbrný host', cislo: 7, z: '/ 10', stitek: 'ještě 3 do Cappuccina zdarma', razitka: { pocet: 7, cil: 10, popis: '7 z 10 razítek' } },
      ]} />
      {otevrena != null && <p className="hp-meta mt-2" role="status">Otevřít kartu {otevrena + 1}</p>}

      <NadpisSekce titulek="Co tě čeká" />
      <Seznam>
        <Radek ikona="calendar" titulek={<span className="hp-num">Dnes 19:30 · 2 osoby</span>} popis="Bistro Nádraží · stůl u okna · potvrzeno" href="#" />
        <Radek ikona="tag" titulek="−20 % na dort k narozeninám" popis="Kavárna U Lípy · platí ještě 3 dny" onClick={() => {}} />
      </Seznam>
      <SlotPridat className="mt-3" popis="Přidat kartu podniku" napoveda="Naskenovat · Najít" onClick={() => {}} />

      <NadpisSekce titulek="Otevřená karta" />
      <InkoustovaKarta varianta="otevrena" {...LIPA} popis="Káva podle výběru · Stříbrný host" vpravo={<Icon name="chevronRight" size={18} className="opacity-60" />}
        cislo={7} z="/ 10" stitek="poslední 4. 11." razitka={{ pocet: 7, cil: 10, popis: '7 z 10 razítek' }} />
      <p className="hp-silny mt-3 mb-3.5">Ještě 3 razítka do Cappuccina zdarma</p>
      <div className="lgx hp-sklo px-5 pt-[18px] pb-4 text-center">
        <div className="h-qr-pole mx-auto w-[188px] h-[188px]" style={{ color: '#16181A' }}><Icon name="qr" size={150} strokeWidth={1} /></div>
        <p className="hp-kod text-[19px] mt-3.5">JDV7 K4QM</p>
        <p className="hp-meta mt-1.5">Ukaž kód obsluze. Razítko i body se připíšou samy.</p>
        <div className="grid grid-cols-3 mt-3.5 pt-3 border-t border-[color:var(--hp-line)] text-left">
          <div><p className="hp-silny hp-num">340 b.</p><p className="hp-meta">Body</p></div>
          <div><p className="hp-silny">Stříbrný</p><p className="hp-meta">Sleva 5 %</p></div>
          <div><p className="hp-silny hp-num">2 návštěvy</p><p className="hp-meta">do Zlatého</p></div>
        </div>
      </div>
      <ZasunuteKarty className="mt-6" karty={[NADRAZI, KOTVA]} popis="a Bar Kotva" hodnota="+2 karty" ariaLabel="Další karty: Bistro Nádraží a Bar Kotva" onClick={() => {}} />

      <NadpisSekce titulek="Odměny" />
      <div className="hp-pole">
        <Icon name="tag" size={18} className="text-[color:var(--hp-muted)]" />
        <input aria-label="Promo kód, poukaz nebo karta" placeholder="Promo kód, poukaz nebo karta" />
        <button type="button" className="hp-btn hp-btn-inkoust hp-btn-male tap-target-sm">Použít</button>
      </div>
      <div className="hp-segment mt-3.5">
        <Segmented ariaLabel="Odměny" value={seg} onChange={setSeg} options={[{ id: 'k', label: 'K uplatnění' }, { id: 'n', label: 'Nabídky' }, { id: 'v', label: 'Výzvy' }, { id: 'h', label: 'Historie' }]} />
      </div>
      <ul className="mt-[18px] flex flex-col gap-2.5">
        <Listek as="li" podnik={LIPA} poznamka="za plnou kartu" titulek="Cappuccino zdarma" podtitulek="Platí do 15. 1. 2027"
          kodPopisek="Kód" kod="KV4 821" akce={<button type="button" className="hp-btn hp-btn-inkoust hp-btn-stredni">Uplatnit</button>} />
        <Listek as="li" podnik={NADRAZI} poznamka="k narozeninám" titulek="−20 % na dort" podtitulek={<><b className="font-semibold text-[color:var(--hp-fg)]">Končí za 3 dny</b> · do 9. 11.</>}
          kodPopisek="Kód" kod="ORE 8F2" akce={<button type="button" className="hp-btn hp-btn-inkoust hp-btn-stredni">Uplatnit</button>} />
        <Listek as="li" vypnuty podnik={KOTVA} poznamka="uplatněno 2. 11." titulek="Limonáda zdarma" />
      </ul>
      <NadpisSekce titulek="Moje poukazy" />
      <InkoustovaKarta varianta="zasunuta" {...NADRAZI} nazev="Dárkový poukaz" popis="Bistro Nádraží · DP-4K9Q-22MX" hodnota={formatMoney(650)} href="#" />

      <NadpisSekce titulek="Obálka podniku" />
      <div className="-mx-[var(--hp-okraj)] md:mx-0">
      <ObalkaPodniku prosah={false} nazev="U Lípy" nadpis="Kavárna a pražírna · od 2014"
        vlevo={<KruhoveTlacitko varianta="obalka" ikona="chevronLeft" popis="Zpět" onClick={() => {}} />}
        vpravo={<><KruhoveTlacitko varianta="obalka" ikona="share" popis="Sdílet" onClick={() => {}} /><KruhoveTlacitko varianta="obalka" ikona="star" popis="Uložit" pressed={false} onClick={() => {}} /></>} />
      <ListObalky prosah={false}>
        <div className="flex gap-2 mt-1">
          <button type="button" className="hp-btn hp-btn-inkoust hp-btn-stredni flex-[1.35]"><Icon name="calendar" size={18} />Rezervovat</button>
          <button type="button" className="hp-btn lgx hp-btn-sklo hp-btn-stredni flex-1"><Icon name="book" size={18} />Menu</button>
          <KruhoveTlacitko ikona="navigate" popis="Navigovat" onClick={() => {}} />
          <KruhoveTlacitko ikona="phone" popis="Zavolat" onClick={() => {}} />
        </div>
        <InkoustovaKarta className="mt-5" bezMonogramu {...LIPA} nazev="Moje karta" popis="Stříbrný host · sleva 5 % · 340 b." hodnota="QR u kasy"
          cislo={7} z="/ 10" stitek="ještě 3 do Cappuccina" razitka={{ pocet: 7, cil: 10, popis: '7 z 10 razítek' }} onClick={() => {}} />
        <NadpisSekce titulek="Rezervace" vpravo={<span className="hp-meta">Volné stoly dnes</span>} />
        <div className="lgx hp-sklo p-4">
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Čas">
            {['17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'].map((c, i) => (
              <button key={c} type="button" role="radio" aria-checked={cip === c} disabled={i % 3 === 2} onClick={() => setCip(c)} className="hp-cip !px-0">{c}</button>
            ))}
          </div>
          <button type="button" className="hp-btn hp-btn-limetka hp-btn-blok mt-[18px]">Rezervovat · dnes v {cip}</button>
        </div>
      </ListObalky>
      </div>

      <NadpisSekce titulek="Prázdný stav" />
      <div className="lgx hp-sklo">
        <PrazdnyStav titulek="Zatím tu nemáš žádnou kartu" text="Naskenuj QR kód na stole nebo u kasy a karta podniku se přidá sama."
          akce={<button type="button" className="hp-btn hp-btn-limetka">Naskenovat</button>} />
      </div>
    </div>
  );
}
