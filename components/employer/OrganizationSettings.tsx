'use client';

// Nastavení organizace — co si majitel řetězce zvolí sám.
//
// Zobrazí se jen tomu, kdo má víc podniků pod jednou střechou. Přepínače se
// UKLÁDAJÍ už teď; chování, které z nich plyne, přibývá po kolech, a každá
// volba to o sobě říká — ať nikdo nečeká, že „fakturace" už dnes něco dělá.
//
// Sdílené číselníky (kolo 60): jeden podnik číselník SPRAVUJE, ostatní ho
// čtou. Vypnutí nebo změna zdroje není ztráta — podniky, které řádky zdroje
// používaly, dostanou vlastní kopie; proto se před ním ptáme a po něm
// vypisujeme, kam se co zkopírovalo (server vrací `kopie[]` za každý podnik).
//
// Kolo 69 (balík B2, audit Týmu): přepínače jsou SwitchRow z components/ui
// v jedné kartě s .list (dřív vlastní inkoustový přepínač v bílém boxu = karta
// v kartě), výběr zdroje má pevný sloupec (každý select začínal jinde),
// potvrzení je Modal místo confirm() a „Uloženo ✓" je Toast.

import { useEffect, useState } from 'react';
import { Icon } from '../Icons';
import { Button, Card, Chip, Modal, Segmented, Select, SwitchRow, Toast } from '../ui';
import { okJson } from '@/lib/api';
import { CISELNIKY, coSeSlucuje, coSeVypina, normalizujNastaveni, type Ciselnik, type NastaveniOrganizace, type ZdrojeCiselniku } from '@/lib/organizace';
import { czCount, type CzNoun } from '@/lib/czech';

interface Org { id: number; name: string; isOwner: boolean; settings: NastaveniOrganizace; teams: { id: number; name: string }[] }

/** Co server vrátí za každý podnik, kterému se kopírovalo nebo slučovalo. */
interface Kopie { teamId: number; ciselnik: Ciselnik; akce: 'kopie' | 'slouceni'; ok: boolean; pocet: number }

/** Skloňování počtu zkopírovaných řádků podle číselníku (jen ty, které se kopírují). */
const RADKY: Partial<Record<Ciselnik, CzNoun>> = {
  kategorieSkladu: { one: 'kategorie', few: 'kategorie', many: 'kategorií' },
  typySmen: { one: 'typ směny', few: 'typy směn', many: 'typů směn' },
  kategorieNavodu: { one: 'kategorie', few: 'kategorie', many: 'kategorií' },
};

export default function OrganizationSettings() {
  const [org, setOrg] = useState<Org | null>(null);
  const [nacteno, setNacteno] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const msgChyba = msg !== '' && msg !== 'Nastavení organizace uloženo.';
  /** Výpis kopií po posledním uložení — zůstává, dokud se neuloží znovu. */
  const [kopieInfo, setKopieInfo] = useState<{ text: string; chyba: boolean }[]>([]);

  /** Změna, která něco vypíná nebo slučuje — čeká na potvrzení v okně. */
  const [potvrdit, setPotvrdit] = useState<{ veta: string; patch: Partial<NastaveniOrganizace> } | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/organization').then(okJson)
      .then(d => { if (alive) { setOrg(d?.organization ?? null); setNacteno(true); } })
      .catch(() => { if (alive) setNacteno(true); });
    return () => { alive = false; };
  }, []);

  if (!nacteno || !org) return null;

  const nazevPodniku = (id: number) => org.teams.find(t => t.id === id)?.name ?? `Podnik ${id}`;

  /** Řádky `kopie[]` z odpovědi → věty pro člověka; podniky bez kopií se nevypisují. */
  const popisKopie = (kopie: Kopie[]) => {
    const out: { text: string; chyba: boolean }[] = [];
    for (const k of kopie) {
      const nazev = CISELNIKY.find(c => c.klic === k.ciselnik)?.nazev ?? k.ciselnik;
      if (!k.ok) {
        out.push({ chyba: true, text: `${nazevPodniku(k.teamId)}: ${nazev.toLocaleLowerCase('cs')} se nepodařilo ${k.akce === 'kopie' ? 'zkopírovat' : 'sloučit'}. Zkuste to znovu, nebo spusťte /api/init.` });
      } else if (k.pocet > 0) {
        const pocet = czCount(k.pocet, RADKY[k.ciselnik] ?? { one: 'řádek', few: 'řádky', many: 'řádků' });
        out.push({ chyba: false, text: `${k.akce === 'kopie' ? 'Zkopírováno do' : 'Sloučeno v'}: ${nazevPodniku(k.teamId)} (${pocet})` });
      }
    }
    return out;
  };

  const uloz = async (patch: Partial<NastaveniOrganizace>) => {
    // Když změna něco vypíná (hlavní vypínač, zdroj → null, jiný zdroj),
    // podniky dostanou kopie — to člověk má vědět dřív, než se to stane.
    // Kopie vzniknou jen u číselníků s vazbou po id (CISELNIKY.kopie);
    // dodavatelé a odměny se jen přestanou číst — a věta to má říct po
    // pravdě, ne slíbit kopii, která nevznikne. Názvy stojí za dvojtečkou
    // v prvním pádu, ať se nemusí skloňovat.
    const nove = normalizujNastaveni({ ...org.settings, ...patch });
    const popis = (ciselnik: Ciselnik) => CISELNIKY.find(c => c.klic === ciselnik);
    const nazvy = (v: { ciselnik: Ciselnik }[]) => v.map(x => popis(x.ciselnik)?.nazev.toLocaleLowerCase('cs') ?? x.ciselnik).join(', ');
    // Zapnutí nebo změna zdroje je opak vypnutí: kopie z dřívějšího sdílení
    // se nahradí originálem a co si v nich podniky upravily, se ztratí.
    // Jedno okno pro obojí — změna zdroje A → B vypíná A a zapíná B naráz.
    const slucuje = coSeSlucuje(org.settings, nove).filter(s => popis(s.ciselnik)?.kopie);
    const vypina = coSeVypina(org.settings, nove);
    if (slucuje.length || vypina.length) {
      const sKopii = vypina.filter(v => popis(v.ciselnik)?.kopie);
      const bezKopie = vypina.filter(v => !popis(v.ciselnik)?.kopie);
      const veta = [
        sKopii.length ? `Podniky dostanou vlastní kopie toho, co z organizace používají: ${nazvy(sKopii)}.` : '',
        bezKopie.length ? `Řádky z organizace přestanou být v podnicích vidět: ${nazvy(bezKopie)}.` : '',
        slucuje.length ? `Pokud mají podniky kopie z dřívějšího sdílení, nahradí je originál ze zdroje: ${nazvy(slucuje)} — co si v nich upravily, se ztratí.` : '',
      ].filter(Boolean).join(' ');
      setPotvrdit({ veta, patch });
      return;
    }
    await proved(patch);
  };

  const proved = async (patch: Partial<NastaveniOrganizace>) => {
    setBusy(true); setMsg(''); setKopieInfo([]);
    const puvodni = org.settings;
    setOrg(o => o ? { ...o, settings: { ...o.settings, ...patch } } : o);
    try {
      const res = await fetch('/api/organization', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: patch }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setOrg(o => o ? { ...o, settings: puvodni } : o); setMsg(d.error || 'Uložení se nepodařilo.'); }
      else {
        // Server je pravda (ořezal by cizí zdroj); a výpis kopií říká,
        // kterému podniku co vzniklo — nebo kde to selhalo.
        if (d.organization?.settings) setOrg(o => o ? { ...o, settings: normalizujNastaveni(d.organization.settings) } : o);
        const info = popisKopie(Array.isArray(d.kopie) ? d.kopie : []);
        setKopieInfo(info);
        setMsg(info.some(i => i.chyba) ? 'Uloženo, ale kopie se nepodařila.' : 'Nastavení organizace uloženo.');
      }
    } catch { setOrg(o => o ? { ...o, settings: puvodni } : o); setMsg('Uložení se nepodařilo.'); }
    setBusy(false);
  };

  // Server merguje mělce, proto se vždy posílá celá mapa zdrojů.
  const ulozZdroje = (zdroje: ZdrojeCiselniku) => uloz({ zdrojeCiselniku: zdroje });
  const hodnota = (v: string): number | null => (v === '' ? null : Number(v));

  const zdroje = org.settings.zdrojeCiselniku;
  const vsechnyStejne = CISELNIKY.every(c => zdroje[c.klic] === zdroje[CISELNIKY[0].klic]);
  const spolecny = vsechnyStejne ? (zdroje[CISELNIKY[0].klic] == null ? '' : String(zdroje[CISELNIKY[0].klic])) : 'ruzne';

  const zamceno = !org.isOwner || busy;
  const volby = (
    <>
      <option value="">Každý podnik zvlášť</option>
      {org.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
    </>
  );
  return (
    <Card aria-labelledby="org-nadpis">
      <h2 id="org-nadpis" className="t-card flex items-center gap-2 min-w-0">
        <Icon name="grid" size={17} className="shrink-0 text-black/40" />
        <span className="truncate">Organizace: {org.name}</span>
      </h2>
      <p className="t-meta mt-1 text-pretty">
        {czCount(org.teams.length, { one: 'podnik', few: 'podniky', many: 'podniků' })} pod jednou střechou: {org.teams.map(t => t.name).join(', ')}.
        {!org.isOwner && ' Nastavení mění vlastník organizace.'}
      </p>
      <ul className="list mt-2">
        <SwitchRow checked={org.settings.sdileniLidi === true} disabled={zamceno} onChange={v => uloz({ sdileniLidi: v })}
          title="Sdílení lidí mezi podniky" hint="Zaměstnanec může být členem víc podniků a přepínat mezi nimi. Vedení může vždy." />
        <SwitchRow checked={org.settings.konsolidovanyPrehled === true} disabled={zamceno} onChange={v => uloz({ konsolidovanyPrehled: v })}
          title="Přehled za všechny podniky" hint="Tržby, mzdy a uzávěrky všech podniků na jedné obrazovce — v přepínači podniku nahoře, položka „Všechny podniky“." />
        <SwitchRow checked={org.settings.sdileneCiselniky === true} disabled={zamceno} onChange={v => uloz({ sdileneCiselniky: v })}
          title="Sdílené číselníky" hint="Jeden podnik číselník spravuje, ostatní ho vidí a používají. U každé položky je vidět, odkud je. Kontakty dodavatelů uvidí i ostatní podniky." />
        <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <div className="min-w-0">
            <p id="org-fakturace" className="text-sm font-semibold text-[#16181A]">Fakturace <Chip tone="muted" size="sm" className="ml-1 align-middle">připravuje se</Chip></p>
            <p className="text-xs text-black/45 mt-0.5 text-pretty">Každý podnik má svůj plán a fakturu, nebo jedna faktura za organizaci.</p>
          </div>
          {org.isOwner ? (
            <Segmented size="sm" ariaLabel="Fakturace" value={org.settings.fakturace ?? 'per_team'}
              onChange={v => { if (!busy) void uloz({ fakturace: v }); }}
              options={[{ id: 'per_team', label: 'Za podnik' }, { id: 'per_org', label: 'Za organizaci' }]} />
          ) : (
            <span className="t-meta">{org.settings.fakturace === 'per_org' ? 'Za organizaci' : 'Za podnik'}</span>
          )}
        </li>
      </ul>
      {org.settings.sdileneCiselniky && (
        <div role="group" aria-labelledby="org-zdroje-nadpis" className="mt-3">
          <p id="org-zdroje-nadpis" className="t-label">Kdo který číselník spravuje</p>
          <ul className="list">
            {/* Pevný sloupec selectu: dřív justify-between se selectem na šířku obsahu
                a každý řádek začínal jinde (audit: x = 532, 464, 570…). Na telefonu pod sebou. */}
            <li className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_16rem] items-center gap-x-4 gap-y-1.5 py-3">
              <p id="org-zdroje-vse" className="text-sm font-semibold text-[#16181A]">Všechny najednou</p>
              <Select aria-labelledby="org-zdroje-vse" value={spolecny} disabled={zamceno}
                onChange={e => {
                  if (e.target.value === 'ruzne') return;
                  const v = hodnota(e.target.value);
                  void ulozZdroje(Object.fromEntries(CISELNIKY.map(c => [c.klic, v])) as ZdrojeCiselniku);
                }}>
                {!vsechnyStejne && <option value="ruzne" disabled>Různě</option>}
                {volby}
              </Select>
            </li>
            {CISELNIKY.map(c => (
              <li key={c.klic} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_16rem] items-center gap-x-4 gap-y-1.5 py-3">
                <div className="min-w-0">
                  <p id={`org-zdroj-${c.klic}`} className="text-sm text-[#16181A]">{c.nazev}</p>
                  <p className="text-xs text-black/45 text-pretty">{c.hint}</p>
                </div>
                <Select aria-labelledby={`org-zdroj-${c.klic}`} value={zdroje[c.klic] == null ? '' : String(zdroje[c.klic])}
                  disabled={zamceno} onChange={e => void ulozZdroje({ ...zdroje, [c.klic]: hodnota(e.target.value) })}>
                  {volby}
                </Select>
              </li>
            ))}
          </ul>
          <p className="t-meta mt-2 text-pretty">
            Vypnutím dostanou podniky vlastní kopie toho, co z organizace používaly. Zapnutím se kopie z dřívějšího sdílení nahradí originálem. Nastavení veřejné stránky se nepřepojuje.
          </p>
        </div>
      )}
      {kopieInfo.length > 0 && (
        <ul className="mt-3 space-y-0.5 text-[13px]" aria-live="polite">
          {kopieInfo.map((k, i) => <li key={i} className={k.chyba ? 'text-bad-ink font-semibold' : 'text-black/60'}>{k.text}</li>)}
        </ul>
      )}
      {potvrdit && (
        <Modal open onClose={() => setPotvrdit(null)} size="sm" title="Změnit sdílení?"
          footer={<>
            <Button variant="secondary" onClick={() => setPotvrdit(null)}>Zrušit</Button>
            <Button variant="primary" loading={busy} onClick={async () => { const p = potvrdit.patch; setPotvrdit(null); await proved(p); }}>Pokračovat</Button>
          </>}>
          <p className="text-sm text-black/70 text-pretty">{potvrdit.veta}</p>
        </Modal>
      )}
      <Toast message={msg || null} tone={msgChyba ? 'bad' : 'ok'} onClose={() => setMsg('')} />
    </Card>
  );
}
