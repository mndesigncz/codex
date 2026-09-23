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

import { useEffect, useState } from 'react';
import { Icon } from '../Icons';
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

const selectClass = 'field border border-black/[0.08] px-3 py-2 text-sm text-[#16181A] max-w-full';

/**
 * Přepínač stojí MIMO komponentu nastavení: definovaný uvnitř by při každém
 * renderu vznikl jako nový typ, React by ho odmontoval a namontoval znovu
 * a po kliknutí by se ztratil fokus (klávesnice, odečítač).
 */
function Prepinac({ on, title, hint, brzy, disabled, onToggle }: { on: boolean; title: string; hint: string; brzy?: boolean; disabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-white/60 border border-black/[0.07] px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[#16181A]">{title}{brzy && <span className="ml-2 chip chip-sm chip-muted align-middle">připravuje se</span>}</p>
        <p className="text-xs text-black/45 mt-0.5">{hint}</p>
      </div>
      {/* aria-disabled místo disabled: zakázané tlačítko prohlížeč odfokusuje,
          a přepínač je během ukládání zakázaný vždycky — klávesnice by po
          každém přepnutí začínala od začátku stránky. */}
      <button type="button" role="switch" aria-checked={on} aria-label={title} aria-disabled={disabled}
        onClick={() => { if (!disabled) onToggle(); }}
        className={`tap-target-sm relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition aria-disabled:opacity-50 aria-disabled:cursor-not-allowed ${on ? 'bg-[#16181A]' : 'bg-black/15'}`}>
        <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

export default function OrganizationSettings() {
  const [org, setOrg] = useState<Org | null>(null);
  const [nacteno, setNacteno] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  /** Výpis kopií po posledním uložení — zůstává, dokud se neuloží znovu. */
  const [kopieInfo, setKopieInfo] = useState<{ text: string; chyba: boolean }[]>([]);

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
    // Zapnutí nebo změna zdroje je opak: kopie v podnicích se nahradí
    // originálem a co si v nich podniky upravily, se ztratí. Ptá se stejně.
    const slucuje = coSeSlucuje(org.settings, nove).filter(s => popis(s.ciselnik)?.kopie);
    if (slucuje.length) {
      if (!confirm(`Kopie v ostatních podnicích se nahradí originálem ze zdroje: ${nazvy(slucuje)}. Co si v nich podniky upravily, se ztratí. Pokračovat?`)) return;
    }
    const vypina = coSeVypina(org.settings, nove);
    if (vypina.length) {
      const sKopii = vypina.filter(v => popis(v.ciselnik)?.kopie);
      const bezKopie = vypina.filter(v => !popis(v.ciselnik)?.kopie);
      const veta = [
        sKopii.length ? `Podniky dostanou vlastní kopie toho, co z organizace používají: ${nazvy(sKopii)}.` : '',
        bezKopie.length ? `Řádky z organizace přestanou být v podnicích vidět: ${nazvy(bezKopie)}.` : '',
        'Pokračovat?',
      ].filter(Boolean).join(' ');
      if (!confirm(veta)) return;
    }
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
        setMsg(info.some(i => i.chyba) ? 'Uloženo, ale kopie se nepodařila.' : 'Uloženo ✓');
      }
    } catch { setOrg(o => o ? { ...o, settings: puvodni } : o); setMsg('Uložení se nepodařilo.'); }
    setBusy(false);
    setTimeout(() => setMsg(''), 2500);
  };

  // Server merguje mělce, proto se vždy posílá celá mapa zdrojů.
  const ulozZdroje = (zdroje: ZdrojeCiselniku) => uloz({ zdrojeCiselniku: zdroje });
  const hodnota = (v: string): number | null => (v === '' ? null : Number(v));

  const zdroje = org.settings.zdrojeCiselniku;
  const vsechnyStejne = CISELNIKY.every(c => zdroje[c.klic] === zdroje[CISELNIKY[0].klic]);
  const spolecny = vsechnyStejne ? (zdroje[CISELNIKY[0].klic] == null ? '' : String(zdroje[CISELNIKY[0].klic])) : 'ruzne';

  return (
    <section className="glass-card p-5 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="t-card"><Icon name="box" size={16} className="inline -mt-0.5 mr-1.5 text-[#5B7A08]" /> Organizace: {org.name}</h3>
          <p className="text-xs text-black/45 mt-0.5">
            {org.teams.length} {org.teams.length === 1 ? 'podnik' : org.teams.length < 5 ? 'podniky' : 'podniků'} pod jednou střechou: {org.teams.map(t => t.name).join(', ')}.
            {!org.isOwner && ' Nastavení mění vlastník organizace.'}
          </p>
        </div>
        {msg && <span className={`text-xs font-semibold ${msg.endsWith('✓') ? 'text-[#5B7A08]' : 'text-bad-ink'}`}>{msg}</span>}
      </div>
      <div className="space-y-2">
        <Prepinac on={org.settings.sdileniLidi === true} disabled={!org.isOwner || busy} onToggle={() => uloz({ sdileniLidi: !(org.settings.sdileniLidi === true) })} title="Sdílení lidí mezi podniky"
          hint="Zaměstnanec může být členem víc podniků a přepínat mezi nimi. Vedení může vždy." />
        <Prepinac on={org.settings.konsolidovanyPrehled === true} disabled={!org.isOwner || busy} onToggle={() => uloz({ konsolidovanyPrehled: !(org.settings.konsolidovanyPrehled === true) })} title="Přehled za všechny podniky"
          hint="Tržby, mzdy a uzávěrky všech podniků na jedné obrazovce — v přepínači podniku nahoře, položka „Všechny podniky“." />
        <Prepinac on={org.settings.sdileneCiselniky === true} disabled={!org.isOwner || busy} onToggle={() => uloz({ sdileneCiselniky: !(org.settings.sdileneCiselniky === true) })} title="Sdílené číselníky"
          hint="Jeden podnik číselník spravuje, ostatní ho vidí a používají. U každé položky je vidět, odkud je. Kontakty dodavatelů uvidí i ostatní podniky." />
        {org.settings.sdileneCiselniky && (
          <div role="group" aria-labelledby="org-zdroje-nadpis" className="rounded-2xl bg-white/60 border border-black/[0.07] px-4 py-3 space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p id="org-zdroje-nadpis" className="text-sm font-semibold text-[#16181A]">Kdo který číselník spravuje</p>
              <div className="flex items-center gap-2">
                <span id="org-zdroje-vse" className="text-xs text-black/45">Všechny spravuje</span>
                <select aria-labelledby="org-zdroje-vse" value={spolecny} disabled={!org.isOwner || busy} className={selectClass}
                  onChange={e => {
                    if (e.target.value === 'ruzne') return;
                    const v = hodnota(e.target.value);
                    ulozZdroje(Object.fromEntries(CISELNIKY.map(c => [c.klic, v])) as ZdrojeCiselniku);
                  }}>
                  {!vsechnyStejne && <option value="ruzne" disabled>Různě</option>}
                  <option value="">Každý podnik zvlášť</option>
                  {org.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <ul className="divide-y divide-black/[0.06]">
              {CISELNIKY.map(c => (
                <li key={c.klic} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p id={`org-zdroj-${c.klic}`} className="text-sm text-[#16181A]">{c.nazev}</p>
                    <p className="text-xs text-black/45">{c.hint}</p>
                  </div>
                  <select aria-labelledby={`org-zdroj-${c.klic}`} value={zdroje[c.klic] == null ? '' : String(zdroje[c.klic])}
                    disabled={!org.isOwner || busy} className={selectClass}
                    onChange={e => ulozZdroje({ ...zdroje, [c.klic]: hodnota(e.target.value) })}>
                    <option value="">Každý podnik zvlášť</option>
                    {org.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </li>
              ))}
            </ul>
            <p className="text-xs text-black/45">
              Vypnutím dostanou podniky vlastní kopie toho, co z organizace používaly. Zapnutím se kopie z dřívějšího sdílení nahradí originálem. Nastavení veřejné stránky se nepřepojuje.
            </p>
          </div>
        )}
        {kopieInfo.length > 0 && (
          <ul className="text-xs space-y-0.5 px-1" aria-live="polite">
            {kopieInfo.map((k, i) => <li key={i} className={k.chyba ? 'text-bad-ink font-semibold' : 'text-black/60'}>{k.text}</li>)}
          </ul>
        )}
        <div className="flex items-start justify-between gap-4 rounded-2xl bg-white/60 border border-black/[0.07] px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[#16181A]">Fakturace<span className="ml-2 chip chip-sm chip-muted align-middle">připravuje se</span></p>
            <p className="text-xs text-black/45 mt-0.5">Každý podnik má svůj plán a fakturu, nebo jedna faktura za organizaci.</p>
          </div>
          <div className="flex gap-1 rounded-full bg-black/[0.05] p-0.5 shrink-0">
            {([['per_team', 'Za podnik'], ['per_org', 'Za organizaci']] as const).map(([v, label]) => (
              <button key={v} type="button" disabled={!org.isOwner || busy} onClick={() => uloz({ fakturace: v })}
                className={`tap-target-sm rounded-full px-3 py-1 text-xs font-semibold transition disabled:opacity-50 ${org.settings.fakturace === v ? 'seg-on' : 'seg-off'}`}>{label}</button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
