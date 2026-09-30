// Provedení plánu průvodce v databázi. Jen pro server.
//
// Tři pravidla, na kterých to stojí:
//  - JEN PŘIDÁVÁ. Žádný DELETE a žádný UPDATE bez `team_id`; co člověk v podniku
//    nastavil jinak, zůstane (plán takovou operaci označí jako přeskočenou).
//  - KAŽDÁ OPERACE VE VLASTNÍM try (vzor lib/kopieDoPodniku.ts): jedna chyba
//    nezastaví ostatní a vrací se v poznámce bez detailu Postgresu.
//  - OPAKOVANÉ SPUŠTĚNÍ NIC NEZDVOJÍ. Ledger `pouzito` si pamatuje otisk vstupu
//    a dedupe podle názvu hlídá i případ, kdy ledger chybí (dvě záložky).

import { neon } from '@neondatabase/serverless';
import { audit } from '../audit.ts';
import { czCount, type CzNoun } from '../czech.ts';
import { VYCHOZI, type Jazyk } from '../i18n/config.ts';
import { preloz, type Hodnoty } from '../i18n/core.ts';
import { nactiSekce } from '../i18n/slovniky.ts';
import { vsechnySlovniky } from '../i18n/stav.ts';
import { sanitizeSteps } from '../steps.ts';
import { verejnaHlaska } from '../verejnaChyba.ts';
import { nactiRadky, tarifPodniku, zapisRadek } from '../widgety/rozlozeniDb.ts';
import { normalizujRozlozeni, zVychozich } from '../widgety/rozlozeni.ts';
import { STRANKA as PREHLED } from '../widgety/stranky/vedeni.prehled.ts';
import { KDE_V_NASTAVENI, POCTY, POZNAMKY, sestavPlan, type Operace, type Prekladac, type StavPodniku } from './plan.ts';
import type { Onboarding, VysledekOperace } from './typy.ts';
import { ulozStav } from './stav.ts';

const sql = neon(process.env.DATABASE_URL!);

const ROZSAH_PREHLEDU = 'typ:vedeni' as const;
/** Překladač pro jazyk majitele: hlášky a výchozí názvy (směny, kategorie, postupy) jdou v jeho jazyce. Čeština nic nenačítá. */
export type PrekladacPruvodce = Prekladac & { (cs: string, hodnoty: Hodnoty): string };
export async function prekladacPruvodce(jazyk: Jazyk = VYCHOZI): Promise<PrekladacPruvodce> {
  if (jazyk === VYCHOZI) return ((cs: string, h?: Hodnoty) => preloz({}, VYCHOZI, cs, h)) as PrekladacPruvodce;
  await nactiSekce(jazyk, ['pruvodce']);
  return ((cs: string, h?: Hodnoty) => preloz(vsechnySlovniky(), jazyk, cs, h)) as PrekladacPruvodce;
}

const POLOZKA: CzNoun = { one: 'položka', few: 'položky', many: 'položek' };


/** Co v podniku už je. Každý dotaz zvlášť: chybějící sloupec nesmí vzít ostatní zjištění. */
export async function nactiStavPodniku(teamId: number): Promise<StavPodniku> {
  const s: StavPodniku = { nazev: '', tarif: 'zdarma', openingHoursPrazdne: true, maxDniNull: true, drawerFloatNull: true, typySmen: [], kategorieSkladu: [], postupy: [], prehled: 'zadny' };
  try { const [t] = await sql`SELECT name FROM teams WHERE id = ${teamId}`; s.nazev = String(t?.name ?? ''); } catch { /* jádro */ }
  try {
    const [t] = await sql`SELECT opening_hours FROM teams WHERE id = ${teamId}`;
    s.openingHoursPrazdne = !(t?.opening_hours && typeof t.opening_hours === 'object' && Object.keys(t.opening_hours).length > 0);
  } catch { /* před migrací: bereme jako prázdné */ }
  try { const [t] = await sql`SELECT max_consecutive_days FROM teams WHERE id = ${teamId}`; s.maxDniNull = t?.max_consecutive_days == null; } catch { s.maxDniNull = false; }
  try { const [t] = await sql`SELECT drawer_float FROM teams WHERE id = ${teamId}`; s.drawerFloatNull = t?.drawer_float == null; } catch { s.drawerFloatNull = false; }
  try { s.typySmen = ((await sql`SELECT name FROM shift_types WHERE team_id = ${teamId}`) as any[]).map(r => String(r.name)); } catch { /* prázdné */ }
  try { s.kategorieSkladu = ((await sql`SELECT name FROM inventory_categories WHERE team_id = ${teamId}`) as any[]).map(r => String(r.name)); } catch { /* prázdné */ }
  try { s.postupy = ((await sql`SELECT name FROM procedures WHERE team_id = ${teamId}`) as any[]).map(r => String(r.name)); } catch { /* prázdné */ }
  try { s.tarif = await tarifPodniku(teamId); } catch { /* zdarma */ }
  try {
    const r = (await nactiRadky(teamId, 'vedeni.prehled', null)).vychozi.find(x => x.rozsah === ROZSAH_PREHLEDU);
    s.prehled = !r ? 'zadny' : r.zdroj === 'pruvodce' ? 'pruvodce' : 'jiny';
  } catch { /* bez řádku */ }
  return s;
}

/** Jedna operace. Vrací počet založených věcí; vyhazuje jen proto, že ji volá obal s try. */
async function proved(op: Operace & { stav: 'provest' }, teamId: number, meId: number, pr: PrekladacPruvodce): Promise<{ pocet?: number; poznamka?: string; polozky?: { w: string; s: string }[] }> {
  switch (op.klic) {
    case 'podnik': {
      const d = op.podnik;
      // Jen pole, která člověk vyplnil (COALESCE s NULL nechá původní hodnotu).
      await sql`
        UPDATE teams SET
          name = COALESCE(${d.nazev ?? null}::text, name),
          currency = COALESCE(${d.mena ?? null}::text, currency),
          locale = COALESCE(${d.formatCisel ?? null}::text, locale),
          week_start = COALESCE(${d.zacatekTydne ?? null}::int, week_start),
          business_type = COALESCE(${d.typ ?? null}::text, business_type)
        WHERE id = ${teamId}`;
      // Adresa a země přibyly s průvodcem: vlastní try, ať jejich chybějící sloupce nevezmou zbytek.
      let poznamka: string | undefined;
      try {
        await sql`UPDATE teams SET address = COALESCE(${d.adresa ?? null}::text, address), country = COALESCE(${d.zeme ?? null}::text, country) WHERE id = ${teamId}`;
      } catch { poznamka = pr(POZNAMKY.adresaNejde); }
      return { poznamka };
    }
    case 'doba':
      await sql`UPDATE teams SET opening_hours = ${JSON.stringify(op.doba)}::jsonb WHERE id = ${teamId}`;
      return {};
    case 'smeny': {
      let n = 0;
      for (const s of op.smeny) {
        try {
          await sql`
            INSERT INTO shift_types (team_id, name, start_time, end_time, color, position, starts_at_open, ends_at_close)
            VALUES (${teamId}, ${s.name}, ${s.startTime}, ${s.endTime}, ${s.color},
                    (SELECT COALESCE(MAX(position), -1) + 1 FROM shift_types WHERE team_id = ${teamId}), ${s.startsAtOpen}, ${s.endsAtClose})`;
        } catch {
          // Před migrací nejsou příznaky „od otevření / do zavření": typ se založí s pevnými časy.
          await sql`
            INSERT INTO shift_types (team_id, name, start_time, end_time, color, position)
            VALUES (${teamId}, ${s.name}, ${s.startTime}, ${s.endTime}, ${s.color},
                    (SELECT COALESCE(MAX(position), -1) + 1 FROM shift_types WHERE team_id = ${teamId}))`;
        }
        n++;
      }
      return { pocet: n, poznamka: pr(POCTY.smeny, { n }) };
    }
    case 'pravidla':
      // Jen když je NULL: pravidlo, které člověk nastavil, se nepřepíše (druhá pojistka po plánu).
      await sql`UPDATE teams SET max_consecutive_days = ${op.maxDni} WHERE id = ${teamId} AND max_consecutive_days IS NULL`;
      return {};
    case 'sklad': {
      let n = 0;
      for (const nazev of op.kategorie) {
        await sql`
          INSERT INTO inventory_categories (team_id, name, position)
          VALUES (${teamId}, ${nazev}, (SELECT COALESCE(MAX(position), -1) + 1 FROM inventory_categories WHERE team_id = ${teamId}))`;
        n++;
      }
      return { pocet: n, poznamka: pr(POCTY.sklad, { n }) };
    }
    case 'postupy': {
      let n = 0;
      for (const p of op.postupy) {
        const kroky = sanitizeSteps(p.kroky.map(text => ({ text })));
        // Uzávěrku nezamykáme neúmyslně (require_before_closing = false) a postup je hned schválený.
        try {
          await sql`
            INSERT INTO procedures (team_id, name, description, icon, color, items, remind_anchor, require_before_closing, created_by, approved)
            VALUES (${teamId}, ${p.name}, ${p.description}, 'check', 'lime', ${JSON.stringify(kroky)}::jsonb, 'time', FALSE, ${meId}, TRUE)`;
        } catch {
          await sql`
            INSERT INTO procedures (team_id, name, description, icon, color, items, created_by)
            VALUES (${teamId}, ${p.name}, ${p.description}, 'check', 'lime', ${JSON.stringify(kroky)}::jsonb, ${meId})`;
        }
        n++;
      }
      return { pocet: n, poznamka: pr(POCTY.postupy, { n }) };
    }
    case 'prehled': {
      // Výstup jde stejnou normalizací jako každé rozložení: neplatné se zahodí.
      const polozky = normalizujRozlozeni(PREHLED, zVychozich(op.prehled));
      const radek = (await nactiRadky(teamId, PREHLED.id, null)).vychozi.find(r => r.rozsah === ROZSAH_PREHLEDU);
      // Cizí (ruční) řádek se nikdy nepřepíše; zdroj 'pruvodce' je jen návrh z dřívějška.
      if (radek && radek.zdroj !== 'pruvodce') return { pocet: 0, poznamka: pr(POZNAMKY.prehledUpraveny) };
      const verze = await zapisRadek({
        teamId, stranka: PREHLED.id, rozsah: ROZSAH_PREHLEDU, userId: null, polozky, zamceno: false,
        verze: radek ? radek.verze : 0, meId, zdroj: 'pruvodce',
      });
      if (verze == null) throw new Error(pr(POZNAMKY.prehledZmenen));
      return { pocet: polozky.length, poznamka: pr(POCTY.prehled, { n: polozky.length }), polozky: polozky.map(p => ({ w: p.widget, s: p.velikost })) };
    }
    case 'kasa':
      await sql`UPDATE teams SET drawer_float = ${Math.round(op.hotovost)} WHERE id = ${teamId} AND drawer_float IS NULL`;
      return {};
  }
}

export interface VysledekPouziti {
  polozky: VysledekOperace[];
  /** Výsledné rozložení Přehledu (widget a velikost): finále z něj kreslí miniaturu. */
  prehled: { widgetu: number; polozky: { w: string; s: string }[] };
  /** Nový záznam průvodce (stav `hotovo`, ledger). */
  onboarding: Onboarding;
}

/**
 * Sestaví a provede plán. `vypnout` jsou klíče položek, které člověk ve finále
 * vypnul (chodí z těla požadavku, ne z uložených odpovědí: poslední slovo má
 * to, co bylo na obrazovce Shrnutí).
 */
export async function pouzijPruvodce(a: { teamId: number; meId: number; onboarding: Onboarding; vypnout?: string[]; jazyk?: Jazyk }): Promise<VysledekPouziti> {
  const pr = await prekladacPruvodce(a.jazyk);
  const odpovedi = { ...a.onboarding.odpovedi, polozky: { ...a.onboarding.odpovedi.polozky } };
  for (const k of a.vypnout ?? []) {
    if (k === 'smeny' || k === 'sklad' || k === 'postupy' || k === 'prehled' || k === 'pravidla') odpovedi.polozky[k] = false;
  }
  const stav = await nactiStavPodniku(a.teamId);
  const plan = sestavPlan(odpovedi, stav, a.onboarding.pouzito, pr);
  const pouzito = { ...a.onboarding.pouzito };
  const polozky: VysledekOperace[] = [];
  let widgetu = 0;
  let polozkyPrehledu: { w: string; s: string }[] = [];
  for (const op of plan) {
    if (op.stav === 'preskocit') {
      // Přeskočeno, protože už to tam je (nebo to člověk nastavil sám): ledger se nemění.
      polozky.push({ klic: op.klic, nazev: op.nazev, stav: 'preskoceno', poznamka: op.poznamka ? pr(op.poznamka) : undefined });
      continue;
    }
    try {
      const r = await proved(op, a.teamId, a.meId, pr);
      pouzito[op.klic] = op.hash;
      if (op.klic === 'prehled') { widgetu = r.pocet ?? 0; polozkyPrehledu = r.polozky ?? []; }
      // Operace, která sama zjistila, že nemá co dělat (cizí Přehled), je přeskočená, ne „ok".
      const sama = op.klic === 'prehled' && r.pocet === 0;
      polozky.push({ klic: op.klic, nazev: op.nazev, stav: sama ? 'preskoceno' : 'ok', pocet: r.pocet, poznamka: r.poznamka });
    } catch (e) {
      console.error('pruvodce.pouzij', op.klic, e);
      polozky.push({ klic: op.klic, nazev: op.nazev, stav: 'chyba', poznamka: `${verejnaHlaska(e, pr(POZNAMKY.zalozeniSelhalo))} ${pr(POZNAMKY.rucne, { kde: pr(KDE_V_NASTAVENI[op.klic]) })}` });
    }
  }
  const ted = new Date().toISOString();
  const novy: Onboarding = { ...a.onboarding, stav: 'hotovo', krok: 'hotovo', upraveno: ted, dokonceno: ted, pouzito };
  const ulozeno = await ulozStav(a.teamId, novy).catch(e => { console.error('pruvodce.ulozStav', e); return false; });
  void ulozeno;
  const ok = polozky.filter(p => p.stav === 'ok').length;
  const chyb = polozky.filter(p => p.stav === 'chyba').length;
  await audit(a.teamId, a.meId, 'onboarding.apply', 'team', a.teamId, `${czCount(ok, POLOZKA)} hotovo, ${czCount(chyb, POLOZKA)} s chybou`);
  return { polozky, prehled: { widgetu, polozky: polozkyPrehledu }, onboarding: novy };
}
